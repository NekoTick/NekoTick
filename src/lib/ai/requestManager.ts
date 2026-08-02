import {
    clearSessionIdAlias,
    getSessionIdAliasesResolvingTo,
    resolveSessionIdAlias,
} from './sessionIdAliases';
import { clearComputerCommandAlwaysRunApprovals } from './computerUse/approvalState';

export class RequestManager {
    private controllers = new Map<string, AbortController>();
    private computerUseControllers = new WeakSet<AbortController>();
    private generations = new Map<string, number>();
    private controllerGenerations = new WeakMap<AbortController, { sessionId: string; generation: number }>();

    private markLatestController(sessionId: string, controller: AbortController) {
        const generation = (this.generations.get(sessionId) ?? 0) + 1;
        this.generations.set(sessionId, generation);
        this.controllerGenerations.set(controller, { sessionId, generation });
    }

    private abortControllerForSession(sessionId: string): string {
        const resolvedSessionId = resolveSessionIdAlias(sessionId);
        const controller = this.controllers.get(resolvedSessionId);
        if (controller) {
            controller.abort();
            this.controllers.delete(resolvedSessionId);
            this.computerUseControllers.delete(controller);
        }
        return resolvedSessionId;
    }

    private clearAliasesForResolvedSession(sessionId: string, resolvedSessionId: string) {
        clearSessionIdAlias(sessionId);
        for (const aliasSessionId of getSessionIdAliasesResolvingTo(resolvedSessionId)) {
            clearSessionIdAlias(aliasSessionId);
        }
    }

    start(sessionId: string, options: { computerUse?: boolean } = {}): AbortController {
        const resolvedSessionId = resolveSessionIdAlias(sessionId);
        this.abortControllerForSession(resolvedSessionId);
        const controller = new AbortController();
        this.controllers.set(resolvedSessionId, controller);
        if (options.computerUse) {
            this.computerUseControllers.add(controller);
        }
        this.markLatestController(resolvedSessionId, controller);
        return controller;
    }

    abort(sessionId: string) {
        const resolvedSessionId = this.abortControllerForSession(sessionId);
        this.clearAliasesForResolvedSession(sessionId, resolvedSessionId);
    }

    abortComputerUse() {
        clearComputerCommandAlwaysRunApprovals();
        for (const [sessionId, controller] of this.controllers) {
            if (!this.computerUseControllers.has(controller)) continue;
            controller.abort();
            this.controllers.delete(sessionId);
            this.computerUseControllers.delete(controller);
            this.clearAliasesForResolvedSession(sessionId, sessionId);
        }
    }

    finish(sessionId: string, controller?: AbortController) {
        const resolvedSessionId = resolveSessionIdAlias(sessionId);
        if (!controller) {
            const current = this.controllers.get(resolvedSessionId);
            if (current) this.computerUseControllers.delete(current);
            this.controllers.delete(resolvedSessionId);
            this.clearAliasesForResolvedSession(sessionId, resolvedSessionId);
            return;
        }
        const current = this.controllers.get(resolvedSessionId);
        if (current === controller) {
            this.controllers.delete(resolvedSessionId);
        }
        this.computerUseControllers.delete(controller);
        if (!current || current === controller) {
            this.clearAliasesForResolvedSession(sessionId, resolvedSessionId);
        }
    }

    isCurrent(sessionId: string, controller: AbortController): boolean {
        return this.controllers.get(resolveSessionIdAlias(sessionId)) === controller;
    }

    isLatest(controller: AbortController): boolean {
        const entry = this.controllerGenerations.get(controller);
        return !!entry && this.generations.get(entry.sessionId) === entry.generation;
    }

    isGenerating(sessionId: string): boolean {
        return this.controllers.has(resolveSessionIdAlias(sessionId));
    }

    transfer(fromSessionId: string, toSessionId: string) {
        const resolvedFromSessionId = resolveSessionIdAlias(fromSessionId);
        const resolvedToSessionId = resolveSessionIdAlias(toSessionId);
        const sourceSessionIds = Array.from(new Set([fromSessionId, resolvedFromSessionId]));
        const sourceSessionId = sourceSessionIds.find((sessionId) => this.controllers.has(sessionId));
        if (!sourceSessionId) {
            return;
        }
        const controller = this.controllers.get(sourceSessionId);
        if (!controller) return;

        this.controllers.delete(sourceSessionId);
        this.controllers.set(resolvedToSessionId, controller);
        this.markLatestController(resolvedToSessionId, controller);
    }
}

export const requestManager = new RequestManager();
