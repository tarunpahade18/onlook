import type { FigColor, FigDocument, FigNode, FigPaint } from 'openfig-core';
import { nodeId, parseFig } from 'openfig-core';
import { v4 as uuidv4 } from 'uuid';

import type { ImageMessageContext } from '@onlook/models/chat';
import { DefaultSettings } from '@onlook/constants';
import { MessageContextType } from '@onlook/models/chat';
import { compressImageInBrowser } from '@onlook/utility';

import type { FigAsset, FigFrame, FigImportData } from './types';

export const MAX_FIG_FILE_BYTES = 100 * 1024 * 1024;
const MAX_FRAMES = 50;
const MAX_FRAME_COLORS = 8;
const MAX_FRAME_FONTS = 6;
const MAX_GLOBAL_COLORS = 12;
const MAX_GLOBAL_FONTS = 8;
const MAX_TEXT_LENGTH = 400;
const MAX_WALKED_NODES = 20000;
const COMPRESS_IMAGE_BYTES = 250_000;

const CONTAINER_TYPES = new Set(['CANVAS', 'SECTION', 'GROUP']);

function hashKey(hash: Uint8Array | string | undefined): string | null {
    if (!hash) {
        return null;
    }
    if (typeof hash === 'string') {
        return hash;
    }
    return Array.from(hash, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function detectImageMime(bytes: Uint8Array): string {
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
        return 'image/png';
    }
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
        return 'image/jpeg';
    }
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
        return 'image/gif';
    }
    if (
        bytes[0] === 0x52 &&
        bytes[1] === 0x49 &&
        bytes[2] === 0x46 &&
        bytes[3] === 0x46 &&
        bytes[8] === 0x57 &&
        bytes[9] === 0x45 &&
        bytes[10] === 0x42 &&
        bytes[11] === 0x50
    ) {
        return 'image/webp';
    }
    return 'image/png';
}

function mimeFromDataUrl(dataUrl: string): string | null {
    return /^data:([^;,]+)/.exec(dataUrl)?.[1] ?? null;
}

function toBlob(bytes: Uint8Array, mimeType: string): Blob {
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    return new Blob([buffer], { type: mimeType });
}

function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error ?? new Error('Failed to read the image bytes.'));
        reader.readAsDataURL(blob);
    });
}

function orderedChildren(doc: FigDocument, node: FigNode): FigNode[] {
    const id = nodeId(node);
    const children = id ? (doc.childrenMap.get(id) ?? []) : [];
    return [...children].sort((a, b) =>
        (a.parentIndex?.position ?? '').localeCompare(b.parentIndex?.position ?? ''),
    );
}

function isInternalPage(name: string) {
    return name.toLowerCase().includes('internal only');
}

function getPages(doc: FigDocument): FigNode[] {
    const documentNode = doc.nodes.find((node) => node.type === 'DOCUMENT');
    if (documentNode) {
        const pages = orderedChildren(doc, documentNode).filter(
            (node) => node.type === 'CANVAS' && !isInternalPage(node.name),
        );
        if (pages.length > 0) {
            return pages;
        }
    }
    return doc.nodes.filter((node) => node.type === 'CANVAS' && !isInternalPage(node.name));
}

function getTopLevelFrames(doc: FigDocument, page: FigNode) {
    const frames: FigNode[] = [];
    const stack = [...orderedChildren(doc, page)].reverse();

    while (stack.length > 0) {
        const node = stack.pop();
        if (!node || node.phase === 'REMOVED' || node.visible === false) {
            continue;
        }
        if (node.type === 'FRAME' && !node.resizeToFit) {
            frames.push(node);
            continue;
        }
        if (CONTAINER_TYPES.has(node.type) || (node.type === 'FRAME' && node.resizeToFit)) {
            stack.push(...orderedChildren(doc, node).reverse());
        }
    }

    return frames;
}

function colorToHex(color: FigColor | undefined): string | null {
    if (!color || color.a <= 0.05) {
        return null;
    }
    const channel = (value: number) =>
        Math.round(Math.min(1, Math.max(0, value)) * 255)
            .toString(16)
            .padStart(2, '0');
    return `#${channel(color.r)}${channel(color.g)}${channel(color.b)}`;
}

function addPaintColor(paint: FigPaint, colors: Map<string, number>) {
    if (paint.visible === false || (paint.opacity ?? 1) <= 0.05) {
        return;
    }
    if (paint.type === 'SOLID' && paint.color) {
        const hex = colorToHex(paint.color);
        if (hex) {
            colors.set(hex, (colors.get(hex) ?? 0) + 1);
        }
        return;
    }
    for (const stop of paint.stops ?? []) {
        const hex = colorToHex(stop.color);
        if (hex) {
            colors.set(hex, (colors.get(hex) ?? 0) + 1);
        }
    }
}

function addFont(
    fonts: Map<string, number>,
    family?: string,
    style?: string,
    postScriptName?: string,
) {
    const name = family ?? postScriptName;
    if (!name) {
        return;
    }
    const label = style ? `${name} ${style}` : name;
    fonts.set(label, (fonts.get(label) ?? 0) + 1);
}

function readFont(value: unknown) {
    if (!value || typeof value !== 'object') {
        return null;
    }
    const font = value as { family?: unknown; style?: unknown; postScriptName?: unknown };
    return {
        family: typeof font.family === 'string' ? font.family : undefined,
        style: typeof font.style === 'string' ? font.style : undefined,
        postScriptName: typeof font.postScriptName === 'string' ? font.postScriptName : undefined,
    };
}

function readNumber(value: unknown): number | undefined {
    return typeof value === 'number' ? value : undefined;
}

function addNodeFonts(node: FigNode, fonts: Map<string, number>) {
    addFont(fonts, node.fontName?.family, node.fontName?.style, node.fontName?.postScriptName);

    const derived = node.derivedTextData as { fontMetaData?: unknown } | undefined;
    const fontMetaData = derived?.fontMetaData;
    if (!Array.isArray(fontMetaData)) {
        return;
    }
    for (const entry of fontMetaData) {
        const record = entry as { key?: unknown; fontName?: unknown };
        const font = readFont(record?.key) ?? readFont(record?.fontName) ?? readFont(entry);
        if (font) {
            addFont(fonts, font.family, font.style, font.postScriptName);
        }
    }
}

function getImageKey(doc: FigDocument, paint: FigPaint): string | null {
    const hashes = [paint.imageThumbnail?.hash, paint.image?.hash];
    for (const hash of hashes) {
        const key = hashKey(hash);
        if (key && doc.images.has(key)) {
            return key;
        }
    }

    const image = paint.image as { name?: unknown } | undefined;
    const thumbnail = paint.imageThumbnail as { name?: unknown } | undefined;
    const name = image?.name ?? thumbnail?.name;
    if (typeof name === 'string' && doc.images.has(name)) {
        return name;
    }
    return null;
}

function getLayoutHint(frame: FigNode): string | null {
    if (!frame.stackMode || frame.stackMode === 'NONE') {
        return null;
    }

    const mode =
        frame.stackMode === 'VERTICAL'
            ? 'Vertical'
            : frame.stackMode === 'HORIZONTAL'
              ? 'Horizontal'
              : 'Grid';
    const details: string[] = [];
    if (typeof frame.stackSpacing === 'number') {
        details.push(`${frame.stackSpacing}px gap`);
    }

    const horizontalPadding =
        readNumber(frame.stackHorizontalPadding) ?? readNumber(frame.stackPaddingLeft);
    const verticalPadding =
        readNumber(frame.stackVerticalPadding) ?? readNumber(frame.stackPaddingTop);
    if (horizontalPadding !== undefined || verticalPadding !== undefined) {
        details.push(
            `${horizontalPadding ?? 0}px horizontal / ${verticalPadding ?? 0}px vertical padding`,
        );
    }

    return `${mode} auto-layout${details.length > 0 ? `, ${details.join(', ')}` : ''}`;
}

function analyzeFrame(doc: FigDocument, frame: FigNode) {
    const text = new Set<string>();
    const colors = new Map<string, number>();
    const fonts = new Map<string, number>();
    const imageKeys = new Set<string>();
    const seen = new Set<FigNode>();
    const stack = [frame];
    let imageCount = 0;
    let walked = 0;

    while (stack.length > 0 && walked < MAX_WALKED_NODES) {
        const node = stack.pop();
        if (!node || seen.has(node)) {
            continue;
        }
        seen.add(node);
        walked++;

        if (node.phase === 'REMOVED' || node.visible === false) {
            continue;
        }

        const characters = node.textData?.characters?.replace(/\s+/g, ' ').trim();
        if (characters) {
            text.add(
                characters.length > MAX_TEXT_LENGTH
                    ? `${characters.slice(0, MAX_TEXT_LENGTH - 1)}…`
                    : characters,
            );
        }

        for (const paint of node.fillPaints ?? []) {
            addPaintColor(paint, colors);
            if (paint.type === 'IMAGE') {
                imageCount++;
                const key = getImageKey(doc, paint);
                if (key) {
                    imageKeys.add(key);
                }
            }
        }
        for (const paint of node.strokePaints ?? []) {
            addPaintColor(paint, colors);
        }

        addNodeFonts(node, fonts);
        stack.push(...orderedChildren(doc, node));
    }

    const sortedColors = [...colors.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, MAX_FRAME_COLORS)
        .map(([hex]) => hex);
    const sortedFonts = [...fonts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, MAX_FRAME_FONTS)
        .map(([name]) => name);

    return {
        text: [...text],
        colors: sortedColors,
        fonts: sortedFonts,
        imageKeys: [...imageKeys],
        imageCount,
        layoutHint: getLayoutHint(frame),
    };
}

export async function parseFigFile(file: File): Promise<FigImportData> {
    if (file.size > MAX_FIG_FILE_BYTES) {
        throw new Error('This Figma file is larger than 100 MB.');
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const doc = parseFig(bytes);
    const pages = getPages(doc);
    const candidates = pages.flatMap((page) =>
        getTopLevelFrames(doc, page)
            .filter((frame) => (frame.size?.x ?? 0) > 0 && (frame.size?.y ?? 0) > 0)
            .map((frame) => ({ frame, pageName: page.name })),
    );

    const sizableFrames = candidates.filter(({ frame }) => {
        const width = frame.size?.x ?? 0;
        const height = frame.size?.y ?? 0;
        return width >= 120 && height >= 120;
    });
    const selectedCandidates = (sizableFrames.length > 0 ? sizableFrames : candidates).slice(
        0,
        MAX_FRAMES,
    );

    if (selectedCandidates.length === 0) {
        throw new Error('No frames were found in this Figma file.');
    }

    const frames: FigFrame[] = selectedCandidates.map(({ frame, pageName }) => {
        const id = nodeId(frame) ?? `${frame.guid.sessionID}:${frame.guid.localID}`;
        return {
            id,
            name: frame.name,
            pageName,
            width: frame.size?.x ?? 0,
            height: frame.size?.y ?? 0,
            ...analyzeFrame(doc, frame),
        };
    });

    const globalColors = new Map<string, number>();
    const globalFonts = new Map<string, number>();
    for (const frame of frames) {
        for (const color of frame.colors) {
            globalColors.set(color, (globalColors.get(color) ?? 0) + 1);
        }
        for (const font of frame.fonts) {
            globalFonts.set(font, (globalFonts.get(font) ?? 0) + 1);
        }
    }

    const assets: FigAsset[] = [...doc.images.entries()].map(([name, imageBytes]) => ({
        name,
        mimeType: detectImageMime(imageBytes),
        bytes: imageBytes,
    }));

    const mimeType = doc.thumbnail ? detectImageMime(doc.thumbnail) : null;
    const thumbnailDataUrl =
        doc.thumbnail && mimeType ? await blobToDataUrl(toBlob(doc.thumbnail, mimeType)) : null;

    return {
        fileName: file.name,
        thumbnailDataUrl,
        frames,
        assets,
        colors: [...globalColors.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, MAX_GLOBAL_COLORS)
            .map(([hex]) => hex),
        fonts: [...globalFonts.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, MAX_GLOBAL_FONTS)
            .map(([name]) => name),
    };
}

export async function createFigImageContexts(
    data: FigImportData,
    selectedFrameIds: string[],
): Promise<ImageMessageContext[]> {
    const limit = DefaultSettings.CHAT_SETTINGS.maxImages;
    const contexts: ImageMessageContext[] = [];
    const baseName = data.fileName.replace(/\.fig$/i, '') || 'figma-design';

    if (data.thumbnailDataUrl) {
        contexts.push({
            id: uuidv4(),
            type: MessageContextType.IMAGE,
            content: data.thumbnailDataUrl,
            displayName: `${baseName} preview.png`,
            mimeType: mimeFromDataUrl(data.thumbnailDataUrl) ?? 'image/png',
            source: 'local',
        });
    }

    const selectedFrames = data.frames.filter((frame) => selectedFrameIds.includes(frame.id));
    const requiredKeys = new Set(selectedFrames.flatMap((frame) => frame.imageKeys));
    const assets = new Map(data.assets.map((asset) => [asset.name, asset]));

    for (const key of requiredKeys) {
        if (contexts.length >= limit) {
            break;
        }
        const asset = assets.get(key);
        if (!asset) {
            continue;
        }

        const file = new File([toBlob(asset.bytes, asset.mimeType)], asset.name, {
            type: asset.mimeType,
        });
        const dataUrl =
            asset.bytes.byteLength > COMPRESS_IMAGE_BYTES
                ? ((await compressImageInBrowser(file)) ?? (await blobToDataUrl(file)))
                : await blobToDataUrl(file);

        contexts.push({
            id: uuidv4(),
            type: MessageContextType.IMAGE,
            content: dataUrl,
            displayName: asset.name,
            mimeType: mimeFromDataUrl(dataUrl) ?? asset.mimeType,
            source: 'local',
        });
    }

    return contexts.slice(0, limit);
}
