import { describe, expect, test } from 'bun:test';

import type { FigImportData } from './types';
import { buildFigPrompt } from './prompt';

const data: FigImportData = {
    fileName: 'landing.fig',
    thumbnailDataUrl: 'data:image/png;base64,abc',
    assets: [],
    colors: ['#111111', '#ffffff'],
    fonts: ['Inter SemiBold'],
    frames: [
        {
            id: '1:2',
            name: 'Landing',
            pageName: 'Page 1',
            width: 1440,
            height: 900,
            layoutHint: 'Vertical auto-layout, 24px gap',
            text: ['Build faster', 'Get started'],
            colors: ['#111111'],
            fonts: ['Inter SemiBold'],
            imageCount: 2,
            imageKeys: ['a'],
        },
        {
            id: '3:4',
            name: 'Pricing',
            pageName: 'Page 1',
            width: 1440,
            height: 900,
            layoutHint: null,
            text: ['Simple pricing'],
            colors: ['#ffffff'],
            fonts: ['Inter Regular'],
            imageCount: 0,
            imageKeys: [],
        },
    ],
};

describe('buildFigPrompt', () => {
    test('includes only selected frames', () => {
        const prompt = buildFigPrompt(data, ['3:4']);
        expect(prompt).toContain('Pricing');
        expect(prompt).not.toContain('Landing');
        expect(prompt).toContain('Simple pricing');
    });

    test('includes the reference image and extra instructions', () => {
        const prompt = buildFigPrompt(data, ['1:2'], 'Use a warm background.');
        expect(prompt).toContain('attached image is the Figma file thumbnail');
        expect(prompt).toContain('Use a warm background.');
        expect(prompt).toContain('Vertical auto-layout');
    });

    test('falls back to the first frame', () => {
        const prompt = buildFigPrompt(data, []);
        expect(prompt).toContain('Landing');
        expect(prompt).not.toContain('Pricing');
    });
});
