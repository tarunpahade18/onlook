import {
    RequirementStatus,
    RequirementType,
    type Requirement,
    type RequirementResult,
} from '@onlook/models';
import { getHtmlElement } from '../helpers';
import { getFrameId } from './state';

export function checkRequirements(requirements: Requirement[]): RequirementResult[] {
    return requirements.map((requirement) => checkRequirement(requirement));
}

function checkRequirement(requirement: Requirement): RequirementResult {
    const base = {
        requirementId: requirement.id,
        frameId: getFrameId() ?? '',
    };

    try {
        switch (requirement.type) {
            case RequirementType.TEXT_REMAINS:
                return { ...base, ...checkTextRemains(requirement.text) };
            case RequirementType.NO_HORIZONTAL_OVERFLOW:
                return { ...base, ...checkNoHorizontalOverflow(requirement.width) };
            case RequirementType.COMPUTED_STYLE_UNCHANGED:
                return {
                    ...base,
                    ...checkComputedStyleUnchanged(
                        requirement.selector,
                        requirement.property,
                        requirement.expected,
                    ),
                };
            default:
                return { ...base, status: RequirementStatus.UNKNOWN, detail: 'Unknown requirement type.' };
        }
    } catch (error) {
        return {
            ...base,
            status: RequirementStatus.UNKNOWN,
            detail: error instanceof Error ? error.message : 'Requirement could not be measured.',
        };
    }
}

function checkTextRemains(text: string): Pick<RequirementResult, 'status' | 'detail'> {
    const expected = text.trim();
    if (!expected) {
        return { status: RequirementStatus.UNKNOWN, detail: 'No text was provided to check.' };
    }

    const body = document.body;
    if (!body) {
        return { status: RequirementStatus.UNKNOWN, detail: 'The page body is not available.' };
    }

    const content = body.innerText ?? body.textContent ?? '';
    if (content.includes(expected)) {
        return { status: RequirementStatus.PASS, detail: `Found "${expected}".` };
    }

    return { status: RequirementStatus.FAIL, detail: `Could not find "${expected}".` };
}

function checkNoHorizontalOverflow(width: number): Pick<RequirementResult, 'status' | 'detail'> {
    if (!Number.isFinite(width) || width <= 0) {
        return { status: RequirementStatus.UNKNOWN, detail: 'A valid viewport width is required.' };
    }

    const root = document.documentElement;
    const viewportWidth = root.clientWidth;
    if (Math.abs(viewportWidth - width) > 1) {
        return {
            status: RequirementStatus.UNKNOWN,
            detail: `The frame is ${viewportWidth}px wide, so overflow at ${width}px cannot be measured without resizing the frame.`,
        };
    }

    const contentWidth = Math.max(root.scrollWidth, document.body?.scrollWidth ?? 0);
    if (contentWidth > viewportWidth) {
        return {
            status: RequirementStatus.FAIL,
            detail: `Content is ${contentWidth}px wide and overflows by ${contentWidth - viewportWidth}px.`,
        };
    }

    return {
        status: RequirementStatus.PASS,
        detail: `Content fits within the ${viewportWidth}px viewport.`,
    };
}

function checkComputedStyleUnchanged(
    selector: string,
    property: string,
    expected: string,
): Pick<RequirementResult, 'status' | 'detail'> {
    const elementSelector = selector.trim();
    const cssProperty = toCssProperty(property.trim());
    const expectedValue = expected.trim();

    if (!elementSelector || !cssProperty || !expectedValue) {
        return {
            status: RequirementStatus.UNKNOWN,
            detail: 'A selector, a CSS property, and the expected value are required.',
        };
    }

    const element = findElement(elementSelector);
    if (!element) {
        return {
            status: RequirementStatus.UNKNOWN,
            detail: `Could not find an element matching "${elementSelector}".`,
        };
    }

    const actualValue = window.getComputedStyle(element).getPropertyValue(cssProperty).trim();
    if (!actualValue) {
        return {
            status: RequirementStatus.UNKNOWN,
            detail: `Computed style "${cssProperty}" is empty or not available.`,
        };
    }

    if (normalize(actualValue) === normalize(expectedValue)) {
        return {
            status: RequirementStatus.PASS,
            detail: `${cssProperty} is still "${actualValue}".`,
        };
    }

    return {
        status: RequirementStatus.FAIL,
        detail: `${cssProperty} is now "${actualValue}" instead of "${expectedValue}".`,
    };
}

function findElement(selector: string): HTMLElement | null {
    try {
        const element = document.querySelector(selector);
        if (element instanceof HTMLElement) {
            return element;
        }
    } catch {
        // Fall back to treating the selector as an Onlook DOM id.
    }
    return getHtmlElement(selector);
}

function toCssProperty(property: string): string {
    if (!property || property.includes('-')) {
        return property;
    }
    return property.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`);
}

function normalize(value: string): string {
    return value.replace(/\s+/g, ' ').trim().toLowerCase();
}
