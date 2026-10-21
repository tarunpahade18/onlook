'use client';

import {
    RequirementStatus,
    RequirementType,
    type Requirement,
    type RequirementResult,
} from '@onlook/models';
import { Badge } from '@onlook/ui/badge';
import { Button } from '@onlook/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@onlook/ui/dialog';
import { Icons } from '@onlook/ui/icons';
import { Input } from '@onlook/ui/input';
import { Label } from '@onlook/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@onlook/ui/select';
import { toast } from '@onlook/ui/sonner';
import { cn } from '@onlook/ui/utils';
import { observer } from 'mobx-react-lite';
import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

import { useEditorEngine } from '@/components/store/editor';

interface RequirementsModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    messageId: string;
}

interface RequirementDraft {
    text: string;
    width: string;
    selector: string;
    property: string;
    expected: string;
}

const EMPTY_DRAFT: RequirementDraft = {
    text: '',
    width: '',
    selector: '',
    property: '',
    expected: '',
};

export function getRequirementLabel(requirement: Requirement): string {
    switch (requirement.type) {
        case RequirementType.TEXT_REMAINS:
            return 'Text must remain';
        case RequirementType.NO_HORIZONTAL_OVERFLOW:
            return 'No horizontal overflow';
        case RequirementType.COMPUTED_STYLE_UNCHANGED:
            return 'Computed style must not change';
    }
}

export function getRequirementExpectation(requirement: Requirement): string {
    switch (requirement.type) {
        case RequirementType.TEXT_REMAINS:
            return `"${requirement.text}" is present`;
        case RequirementType.NO_HORIZONTAL_OVERFLOW:
            return `No overflow at ${requirement.width}px`;
        case RequirementType.COMPUTED_STYLE_UNCHANGED:
            return `${requirement.property} = "${requirement.expected}" on ${requirement.selector}`;
    }
}

export const RequirementStatusBadge = ({ status }: { status: RequirementStatus }) => {
    const config = {
        [RequirementStatus.PASS]: {
            label: 'Pass',
            icon: <Icons.CheckCircled className="h-3 w-3" />,
            className: 'border-teal-500/30 bg-teal-500/10 text-teal-200',
        },
        [RequirementStatus.FAIL]: {
            label: 'Fail',
            icon: <Icons.ExclamationTriangle className="h-3 w-3" />,
            className: 'border-red-500/30 bg-red-500/10 text-red-300',
        },
        [RequirementStatus.UNKNOWN]: {
            label: 'Unknown',
            icon: <Icons.QuestionMarkCircled className="h-3 w-3" />,
            className: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-200',
        },
    }[status];

    return (
        <Badge variant="outline" className={cn('gap-1 px-1.5 py-0 text-micro', config.className)}>
            {config.icon}
            {config.label}
        </Badge>
    );
};

export const RequirementsModal = observer(
    ({ open, onOpenChange, messageId }: RequirementsModalProps) => {
        const editorEngine = useEditorEngine();
        const requirements = editorEngine.requirements.requirements;
        const results = editorEngine.requirements.getResults(messageId);
        const isChecking = editorEngine.requirements.isChecking;
        const lastError = editorEngine.requirements.lastError;

        const [type, setType] = useState<RequirementType>(RequirementType.TEXT_REMAINS);
        const [draft, setDraft] = useState<RequirementDraft>(EMPTY_DRAFT);

        const updateDraft = (key: keyof RequirementDraft, value: string) => {
            setDraft((prev) => ({ ...prev, [key]: value }));
        };

        const handleAdd = () => {
            const id = uuidv4();

            if (type === RequirementType.TEXT_REMAINS) {
                const text = draft.text.trim();
                if (!text) {
                    toast.error('Enter the text that must remain.');
                    return;
                }
                editorEngine.requirements.addRequirement({
                    id,
                    type: RequirementType.TEXT_REMAINS,
                    text,
                });
            } else if (type === RequirementType.NO_HORIZONTAL_OVERFLOW) {
                const width = Number(draft.width);
                if (!Number.isFinite(width) || width <= 0) {
                    toast.error('Enter a valid width in pixels.');
                    return;
                }
                editorEngine.requirements.addRequirement({
                    id,
                    type: RequirementType.NO_HORIZONTAL_OVERFLOW,
                    width,
                });
            } else {
                const selector = draft.selector.trim();
                const property = draft.property.trim();
                const expected = draft.expected.trim();
                if (!selector || !property || !expected) {
                    toast.error('Enter a selector, a CSS property, and the expected value.');
                    return;
                }
                editorEngine.requirements.addRequirement({
                    id,
                    type: RequirementType.COMPUTED_STYLE_UNCHANGED,
                    selector,
                    property,
                    expected,
                });
            }

            setDraft(EMPTY_DRAFT);
        };

        const handleRunChecks = async () => {
            const results = await editorEngine.requirements.runChecks(messageId);
            if (editorEngine.requirements.lastError) {
                toast.error('Failed to run requirements check.', {
                    description: editorEngine.requirements.lastError,
                });
            } else if (results.length === 0) {
                toast.info('No frames are available to measure.');
            }
        };

        const getResultsForRequirement = (requirementId: string): RequirementResult[] =>
            results.filter((result) => result.requirementId === requirementId);

        const getFrameLabel = (frameId: string): string => {
            const frameData = editorEngine.frames.get(frameId);
            if (!frameData) {
                return frameId;
            }
            const branchName =
                editorEngine.branches.getBranchById(frameData.frame.branchId)?.name ??
                frameData.frame.branchId;
            return `${branchName} · ${frameData.frame.dimension.width}×${frameData.frame.dimension.height}`;
        };

        return (
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Requirements check</DialogTitle>
                        <DialogDescription className="pt-2">
                            Mark requirements before or after an edit. Each one is compared with
                            the current frames. This is advisory only: nothing is reverted
                            automatically, and cases that cannot be measured are shown as unknown.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex flex-col gap-4 py-2">
                        <div className="flex flex-col gap-2">
                            {requirements.length === 0 ? (
                                <p className="text-small text-muted-foreground">
                                    No requirements yet. Add one below to start checking edits.
                                </p>
                            ) : (
                                requirements.map((requirement) => {
                                    const requirementResults = getResultsForRequirement(
                                        requirement.id,
                                    );
                                    return (
                                        <div
                                            key={requirement.id}
                                            className="border-border/50 rounded-md border p-3"
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0">
                                                    <p className="text-small">
                                                        {getRequirementLabel(requirement)}
                                                    </p>
                                                    <p className="text-micro text-muted-foreground mt-0.5 truncate">
                                                        Expected: {getRequirementExpectation(requirement)}
                                                    </p>
                                                </div>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-6 w-6 shrink-0"
                                                    onClick={() =>
                                                        editorEngine.requirements.removeRequirement(
                                                            requirement.id,
                                                        )
                                                    }
                                                >
                                                    <Icons.Trash className="h-3.5 w-3.5" />
                                                </Button>
                                            </div>
                                            <div className="mt-2 flex flex-col gap-1">
                                                {requirementResults.length === 0 ? (
                                                    <span className="text-micro text-muted-foreground">
                                                        Not measured yet.
                                                    </span>
                                                ) : (
                                                    requirementResults.map((result) => (
                                                        <div
                                                            key={result.frameId}
                                                            className="bg-background-secondary/40 flex items-center gap-2 rounded px-2 py-1"
                                                        >
                                                            <span className="text-micro text-muted-foreground w-32 shrink-0 truncate">
                                                                {getFrameLabel(result.frameId)}
                                                            </span>
                                                            <span
                                                                className="text-micro min-w-0 flex-1 truncate"
                                                                title={result.detail}
                                                            >
                                                                {result.detail}
                                                            </span>
                                                            <RequirementStatusBadge
                                                                status={result.status}
                                                            />
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        <div className="border-border/50 flex flex-col gap-2 rounded-md border p-3">
                            <p className="text-small">Add a requirement</p>
                            <Select
                                value={type}
                                onValueChange={(value) => {
                                    setType(value as RequirementType);
                                    setDraft(EMPTY_DRAFT);
                                }}
                            >
                                <SelectTrigger size="sm" className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={RequirementType.TEXT_REMAINS}>
                                        Text must remain
                                    </SelectItem>
                                    <SelectItem value={RequirementType.NO_HORIZONTAL_OVERFLOW}>
                                        No horizontal overflow
                                    </SelectItem>
                                    <SelectItem value={RequirementType.COMPUTED_STYLE_UNCHANGED}>
                                        Computed style must not change
                                    </SelectItem>
                                </SelectContent>
                            </Select>

                            {type === RequirementType.TEXT_REMAINS && (
                                <div className="flex flex-col gap-1">
                                    <Label className="text-micro" htmlFor="requirement-text">
                                        Text
                                    </Label>
                                    <Input
                                        id="requirement-text"
                                        value={draft.text}
                                        placeholder="e.g. Start for free"
                                        onChange={(event) => updateDraft('text', event.target.value)}
                                    />
                                </div>
                            )}

                            {type === RequirementType.NO_HORIZONTAL_OVERFLOW && (
                                <div className="flex flex-col gap-1">
                                    <Label className="text-micro" htmlFor="requirement-width">
                                        Width (px)
                                    </Label>
                                    <Input
                                        id="requirement-width"
                                        value={draft.width}
                                        inputMode="numeric"
                                        placeholder="e.g. 390"
                                        onChange={(event) =>
                                            updateDraft('width', event.target.value)
                                        }
                                    />
                                    <p className="text-micro text-muted-foreground">
                                        Overflow is only measured when the frame is this width.
                                    </p>
                                </div>
                            )}

                            {type === RequirementType.COMPUTED_STYLE_UNCHANGED && (
                                <>
                                    <div className="flex flex-col gap-1">
                                        <Label className="text-micro" htmlFor="requirement-selector">
                                            CSS selector
                                        </Label>
                                        <Input
                                            id="requirement-selector"
                                            value={draft.selector}
                                            placeholder="e.g. header a"
                                            onChange={(event) =>
                                                updateDraft('selector', event.target.value)
                                            }
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="flex flex-col gap-1">
                                            <Label
                                                className="text-micro"
                                                htmlFor="requirement-property"
                                            >
                                                CSS property
                                            </Label>
                                            <Input
                                                id="requirement-property"
                                                value={draft.property}
                                                placeholder="e.g. background-color"
                                                onChange={(event) =>
                                                    updateDraft('property', event.target.value)
                                                }
                                            />
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <Label
                                                className="text-micro"
                                                htmlFor="requirement-expected"
                                            >
                                                Expected value
                                            </Label>
                                            <Input
                                                id="requirement-expected"
                                                value={draft.expected}
                                                placeholder="e.g. rgb(0, 0, 0)"
                                                onChange={(event) =>
                                                    updateDraft('expected', event.target.value)
                                                }
                                            />
                                        </div>
                                    </div>
                                </>
                            )}

                            <Button variant="outline" size="sm" onClick={handleAdd}>
                                <Icons.Plus className="mr-1 h-3.5 w-3.5" />
                                Add requirement
                            </Button>
                        </div>

                        {lastError && (
                            <p className="text-micro text-red-300">
                                Last check failed: {lastError}
                            </p>
                        )}
                    </div>

                    <DialogFooter className="flex-col gap-3 sm:flex-row sm:gap-2">
                        <Button
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            className="order-2 sm:order-1"
                        >
                            Close
                        </Button>
                        <Button
                            onClick={handleRunChecks}
                            disabled={isChecking || requirements.length === 0}
                            className="order-1 sm:order-2"
                        >
                            {isChecking ? (
                                <>
                                    <Icons.LoadingSpinner className="mr-1 h-3.5 w-3.5 animate-spin" />
                                    Checking...
                                </>
                            ) : (
                                <>
                                    <Icons.CheckCircled className="mr-1 h-3.5 w-3.5" />
                                    Run checks
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        );
    },
);
