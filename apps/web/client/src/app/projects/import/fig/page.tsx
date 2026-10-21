'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MotionConfig } from 'motion/react';
import { toast } from 'sonner';

import { Button } from '@onlook/ui/button';
import { CardDescription, CardTitle } from '@onlook/ui/card';
import { Checkbox } from '@onlook/ui/checkbox';
import { Icons } from '@onlook/ui/icons';
import {
    MotionCard,
    MotionCardContent,
    MotionCardFooter,
    MotionCardHeader,
} from '@onlook/ui/motion-card';
import { Textarea } from '@onlook/ui/textarea';
import { cn } from '@onlook/ui/utils';

import type { FigImportData } from './_utils/types';
import { CreateManager } from '@/components/store/create/manager';
import { useGetBackground } from '@/hooks/use-get-background';
import { api } from '@/trpc/react';
import { Routes } from '@/utils/constants';
import { CancelButton } from '../cancel-button';
import { createFigImageContexts, MAX_FIG_FILE_BYTES, parseFigFile } from './_utils/fig';
import { buildFigPrompt } from './_utils/prompt';

const MAX_SELECTED_FRAMES = 5;

const Page = () => {
    const router = useRouter();
    const [createManager] = useState(() => new CreateManager());
    const { data: user } = api.user.get.useQuery();
    const [figData, setFigData] = useState<FigImportData | null>(null);
    const [selectedFrameIds, setSelectedFrameIds] = useState<string[]>([]);
    const [extraInstructions, setExtraInstructions] = useState('');
    const [isDragging, setIsDragging] = useState(false);
    const [isParsing, setIsParsing] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const backgroundUrl = useGetBackground('create');

    const reset = () => {
        setFigData(null);
        setSelectedFrameIds([]);
        setExtraInstructions('');
        setError(null);
        if (inputRef.current) {
            inputRef.current.value = '';
        }
    };

    const importFile = async (file: File) => {
        if (!file.name.toLowerCase().endsWith('.fig')) {
            toast.error('Choose a .fig file exported from Figma.');
            return;
        }
        if (file.size > MAX_FIG_FILE_BYTES) {
            toast.error('This Figma file is larger than 100 MB.');
            return;
        }

        setError(null);
        setFigData(null);
        setIsParsing(true);
        try {
            const data = await parseFigFile(file);
            setFigData(data);
            setSelectedFrameIds(data.frames.slice(0, 1).map((frame) => frame.id));
        } catch (parseError) {
            const message =
                parseError instanceof Error
                    ? parseError.message
                    : 'Could not read this Figma file.';
            setError(message);
            toast.error('Could not import Figma file', { description: message });
        } finally {
            setIsParsing(false);
            if (inputRef.current) {
                inputRef.current.value = '';
            }
        }
    };

    const handleFiles = (files: FileList | null) => {
        const file = files?.[0];
        if (file) {
            void importFile(file);
        }
    };

    const handleCancel = () => {
        if (figData) {
            reset();
            return;
        }
        router.push(Routes.HOME);
    };

    const toggleFrame = (id: string) => {
        setSelectedFrameIds((current) => {
            if (current.includes(id)) {
                return current.filter((frameId) => frameId !== id);
            }
            if (current.length >= MAX_SELECTED_FRAMES) {
                toast.error(`Select up to ${MAX_SELECTED_FRAMES} frames.`);
                return current;
            }
            return [...current, id];
        });
    };

    const handleCreate = async () => {
        if (!figData) {
            return;
        }
        if (!user?.id) {
            toast.error('Sign in to create a project.');
            return;
        }
        if (selectedFrameIds.length === 0) {
            toast.error('Select at least one frame.');
            return;
        }

        setIsCreating(true);
        try {
            const prompt = buildFigPrompt(figData, selectedFrameIds, extraInstructions);
            const images = await createFigImageContexts(figData, selectedFrameIds);
            const project = await createManager.startCreate(user.id, prompt, images);
            if (!project) {
                throw new Error(createManager.error ?? 'Failed to create project.');
            }
            router.push(`${Routes.PROJECT}/${project.id}`);
        } catch (createError) {
            toast.error('Failed to create project', {
                description:
                    createError instanceof Error
                        ? createError.message
                        : 'An unknown error occurred.',
            });
        } finally {
            setIsCreating(false);
        }
    };

    return (
        <div
            className="flex h-screen w-screen flex-col"
            style={{
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundImage: `url(${backgroundUrl})`,
            }}
        >
            <div className="flex items-center justify-between px-12 py-4">
                <Link href={Routes.HOME}>
                    <Icons.OnlookTextLogo className="h-3" />
                </Link>
                <CancelButton />
            </div>
            <div className="relative flex h-full w-full items-center justify-center px-6 pb-6">
                <MotionConfig transition={{ duration: 0.5, type: 'spring', bounce: 0 }}>
                    <MotionCard
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="border-primary/20 !bg-background flex max-h-[calc(100vh-8rem)] min-h-[12rem] w-[30rem] max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-lg border p-0 shadow-lg"
                    >
                        <MotionCardHeader className="border-border border-b">
                            <div className="flex items-center gap-3">
                                <div className="bg-secondary flex h-9 w-9 items-center justify-center rounded-lg">
                                    <Icons.SketchLogo className="text-foreground-secondary h-4 w-4" />
                                </div>
                                <div className="space-y-1">
                                    <CardTitle className="text-title3">
                                        Import a Figma file
                                    </CardTitle>
                                    <CardDescription className="text-small text-foreground-secondary">
                                        Upload a .fig file to recreate your design with AI.
                                    </CardDescription>
                                </div>
                            </div>
                        </MotionCardHeader>

                        <MotionCardContent className="min-h-0 flex-1 overflow-y-auto pb-5">
                            {!figData ? (
                                <div className="space-y-3">
                                    <button
                                        type="button"
                                        disabled={isParsing}
                                        onClick={() => inputRef.current?.click()}
                                        onDragEnter={(event) => {
                                            event.preventDefault();
                                            setIsDragging(true);
                                        }}
                                        onDragOver={(event) => {
                                            event.preventDefault();
                                            setIsDragging(true);
                                        }}
                                        onDragLeave={(event) => {
                                            event.preventDefault();
                                            if (
                                                !event.currentTarget.contains(
                                                    event.relatedTarget as Node,
                                                )
                                            ) {
                                                setIsDragging(false);
                                            }
                                        }}
                                        onDrop={(event) => {
                                            event.preventDefault();
                                            setIsDragging(false);
                                            handleFiles(event.dataTransfer.files);
                                        }}
                                        className={cn(
                                            'bg-secondary/40 flex h-24 w-full flex-col items-center justify-center gap-2 rounded-lg border transition-colors',
                                            isDragging
                                                ? 'border-primary bg-secondary'
                                                : 'border-border hover:bg-secondary',
                                            isParsing && 'cursor-wait opacity-60',
                                        )}
                                    >
                                        {isParsing ? (
                                            <Icons.LoadingSpinner className="text-foreground-secondary h-5 w-5 animate-spin" />
                                        ) : (
                                            <Icons.Upload className="text-foreground-secondary h-5 w-5" />
                                        )}
                                        <div className="text-center">
                                            <p className="text-small text-foreground-primary">
                                                {isParsing
                                                    ? 'Reading your Figma fileâ€¦'
                                                    : 'Click to select a .fig file'}
                                            </p>
                                            <p className="text-mini text-foreground-tertiary">
                                                Or drop it here Â· up to 100 MB
                                            </p>
                                        </div>
                                    </button>
                                    <input
                                        ref={inputRef}
                                        type="file"
                                        accept=".fig"
                                        className="hidden"
                                        onChange={(event) => handleFiles(event.target.files)}
                                    />
                                    {error && (
                                        <p
                                            role="alert"
                                            className="text-small text-foreground-brand"
                                        >
                                            {error}
                                        </p>
                                    )}
                                </div>
                            ) : (
                                <div className="space-y-5">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex min-w-0 items-center gap-3">
                                            <div className="bg-secondary flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
                                                <Icons.SketchLogo className="text-foreground-secondary h-4 w-4" />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-small-plus text-foreground-primary truncate">
                                                    {figData.fileName}
                                                </p>
                                                <p className="text-mini text-foreground-tertiary">
                                                    {figData.frames.length} frames Â·{' '}
                                                    {figData.colors.length} colors Â·{' '}
                                                    {figData.fonts.length} fonts
                                                </p>
                                            </div>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={reset}
                                            disabled={isCreating}
                                            className="text-foreground-secondary hover:text-foreground"
                                        >
                                            <Icons.Reload className="h-3.5 w-3.5" />
                                            Replace
                                        </Button>
                                    </div>

                                    {figData.thumbnailDataUrl && (
                                        <div className="border-border bg-secondary/40 relative h-40 overflow-hidden rounded-lg border">
                                            <Image
                                                src={figData.thumbnailDataUrl}
                                                alt="Figma file thumbnail"
                                                fill
                                                unoptimized
                                                sizes="(max-width: 768px) 100vw, 480px"
                                                className="object-contain"
                                            />
                                        </div>
                                    )}

                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <p className="text-small-plus text-foreground-primary">
                                                Frames
                                            </p>
                                            <p className="text-mini text-foreground-tertiary">
                                                {selectedFrameIds.length}/{MAX_SELECTED_FRAMES}{' '}
                                                selected
                                            </p>
                                        </div>
                                        <div className="max-h-44 space-y-1.5 overflow-y-auto pr-1">
                                            {figData.frames.map((frame) => {
                                                const selected = selectedFrameIds.includes(
                                                    frame.id,
                                                );
                                                return (
                                                    <label
                                                        key={frame.id}
                                                        className={cn(
                                                            'flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors',
                                                            selected
                                                                ? 'border-primary/40 bg-secondary'
                                                                : 'border-border bg-secondary/40 hover:bg-secondary',
                                                        )}
                                                    >
                                                        <Checkbox
                                                            checked={selected}
                                                            onCheckedChange={() =>
                                                                toggleFrame(frame.id)
                                                            }
                                                        />
                                                        <div className="min-w-0 flex-1">
                                                            <p className="text-small text-foreground-primary truncate">
                                                                {frame.name || 'Untitled frame'}
                                                            </p>
                                                            <p className="text-mini text-foreground-tertiary truncate">
                                                                {Math.round(frame.width)}Ã—
                                                                {Math.round(frame.height)} Â·{' '}
                                                                {frame.text.length} text Â·{' '}
                                                                {frame.imageCount} images
                                                                {frame.layoutHint
                                                                    ? ` Â· ${frame.layoutHint}`
                                                                    : ''}
                                                            </p>
                                                        </div>
                                                        {frame.colors.length > 0 && (
                                                            <div className="flex shrink-0 -space-x-1">
                                                                {frame.colors
                                                                    .slice(0, 4)
                                                                    .map((color) => (
                                                                        <span
                                                                            key={color}
                                                                            title={color}
                                                                            className="border-background h-4 w-4 rounded-full border"
                                                                            style={{
                                                                                backgroundColor:
                                                                                    color,
                                                                            }}
                                                                        />
                                                                    ))}
                                                            </div>
                                                        )}
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <div className="space-y-1.5">
                                        <label
                                            htmlFor="fig-instructions"
                                            className="text-small-plus text-foreground-primary"
                                        >
                                            Additional instructions
                                        </label>
                                        <Textarea
                                            id="fig-instructions"
                                            value={extraInstructions}
                                            onChange={(event) =>
                                                setExtraInstructions(event.target.value)
                                            }
                                            placeholder="Optional: describe the app, pages, or behavior you want."
                                            className="text-small min-h-16"
                                        />
                                    </div>

                                    <p className="text-mini text-foreground-tertiary">
                                        Onlook uses the selected frames as AI context. The result is
                                        an approximation, not a pixel-perfect Figma render.
                                    </p>
                                </div>
                            )}
                        </MotionCardContent>

                        <MotionCardFooter className="border-border w-full justify-between border-t pt-4">
                            <Button
                                variant="outline"
                                onClick={handleCancel}
                                disabled={isCreating}
                                className="px-3 py-2"
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={() => void handleCreate()}
                                disabled={isCreating || !user?.id || selectedFrameIds.length === 0}
                                className="px-3 py-2"
                            >
                                {isCreating ? (
                                    <>
                                        <Icons.LoadingSpinner className="h-4 w-4 animate-spin" />
                                        Creating...
                                    </>
                                ) : (
                                    'Create project'
                                )}
                            </Button>
                        </MotionCardFooter>
                    </MotionCard>
                </MotionConfig>
            </div>
        </div>
    );
};

export default Page;
