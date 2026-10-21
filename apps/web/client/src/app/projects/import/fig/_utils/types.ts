export interface FigAsset {
    name: string;
    mimeType: string;
    bytes: Uint8Array;
}

export interface FigFrame {
    id: string;
    name: string;
    pageName: string;
    width: number;
    height: number;
    layoutHint: string | null;
    text: string[];
    colors: string[];
    fonts: string[];
    imageCount: number;
    imageKeys: string[];
}

export interface FigImportData {
    fileName: string;
    thumbnailDataUrl: string | null;
    frames: FigFrame[];
    assets: FigAsset[];
    colors: string[];
    fonts: string[];
}
