export enum RequirementType {
    TEXT_REMAINS = 'text-remains',
    NO_HORIZONTAL_OVERFLOW = 'no-horizontal-overflow',
    COMPUTED_STYLE_UNCHANGED = 'computed-style-unchanged',
}

export enum RequirementStatus {
    PASS = 'pass',
    FAIL = 'fail',
    UNKNOWN = 'unknown',
}

interface BaseRequirement {
    id: string;
    type: RequirementType;
}

export interface TextRemainsRequirement extends BaseRequirement {
    type: RequirementType.TEXT_REMAINS;
    text: string;
}

export interface NoHorizontalOverflowRequirement extends BaseRequirement {
    type: RequirementType.NO_HORIZONTAL_OVERFLOW;
    width: number;
}

export interface ComputedStyleUnchangedRequirement extends BaseRequirement {
    type: RequirementType.COMPUTED_STYLE_UNCHANGED;
    selector: string;
    property: string;
    expected: string;
}

export type Requirement =
    | TextRemainsRequirement
    | NoHorizontalOverflowRequirement
    | ComputedStyleUnchangedRequirement;

export interface RequirementResult {
    requirementId: string;
    frameId: string;
    status: RequirementStatus;
    detail: string;
}
