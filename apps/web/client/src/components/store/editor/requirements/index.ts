import { RequirementStatus, type Requirement, type RequirementResult } from '@onlook/models';
import { jsonClone } from '@onlook/utility';
import { makeAutoObservable } from 'mobx';
import type { EditorEngine } from '../engine';

export class RequirementsManager {
    requirements: Requirement[] = [];
    isChecking = false;
    lastCheckedAt: Date | null = null;
    lastError: string | null = null;
    private resultsByMessage = new Map<string, RequirementResult[]>();

    constructor(private editorEngine: EditorEngine) {
        makeAutoObservable(this);
    }

    get hasRequirements(): boolean {
        return this.requirements.length > 0;
    }

    addRequirement(requirement: Requirement) {
        this.requirements = [...this.requirements, requirement];
    }

    removeRequirement(requirementId: string) {
        this.requirements = this.requirements.filter(
            (requirement) => requirement.id !== requirementId,
        );
    }

    getResults(messageId: string): RequirementResult[] {
        return this.resultsByMessage.get(messageId) ?? [];
    }

    async runChecks(messageId: string): Promise<RequirementResult[]> {
        if (!this.hasRequirements) {
            return [];
        }

        this.isChecking = true;
        this.lastError = null;

        try {
            const requirements = jsonClone(this.requirements);
            const frames = this.editorEngine.frames.getAll();
            const results: RequirementResult[] = [];

            for (const frameData of frames) {
                const view = frameData.view;
                if (!view) {
                    results.push(...this.getUnknownResults(requirements, frameData.frame.id, 'The frame is not connected.'));
                    continue;
                }

                const frameResults = await view.checkRequirements(requirements);
                if (!frameResults) {
                    results.push(...this.getUnknownResults(requirements, frameData.frame.id, 'The frame did not return a measurement.'));
                    continue;
                }

                results.push(
                    ...frameResults.map((result) => ({
                        ...result,
                        frameId: frameData.frame.id,
                    })),
                );
            }

            this.resultsByMessage = new Map(this.resultsByMessage).set(messageId, results);
            this.lastCheckedAt = new Date();
            return results;
        } catch (error) {
            this.lastError =
                error instanceof Error ? error.message : 'Requirements could not be checked.';
            return [];
        } finally {
            this.isChecking = false;
        }
    }

    clear() {
        this.requirements = [];
        this.resultsByMessage = new Map();
        this.isChecking = false;
        this.lastCheckedAt = null;
        this.lastError = null;
    }

    private getUnknownResults(
        requirements: Requirement[],
        frameId: string,
        detail: string,
    ): RequirementResult[] {
        return requirements.map((requirement) => ({
            requirementId: requirement.id,
            frameId,
            status: RequirementStatus.UNKNOWN,
            detail,
        }));
    }
}
