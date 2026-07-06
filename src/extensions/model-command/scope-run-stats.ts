import type { AgentEvent } from '../../agent/types.js';
import type { ScopeRunSnapshot, TokenTotals } from './types.js';

const lastByScope = new Map<string, ScopeRunSnapshot>();

function emptyTotals(): TokenTotals {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cachedInputTokens: 0,
    reasoningOutputTokens: 0,
  };
}

/** Record model / usage events from the active bridge run (in-memory, per scope). */
export function ingestScopeRunStats(scope: string, event: AgentEvent): void {
  const prev = lastByScope.get(scope);
  const next: ScopeRunSnapshot = prev
    ? { ...prev }
    : { updatedAt: Date.now() };

  if (event.type === 'system' && event.model) {
    next.actualModel = event.model;
    next.updatedAt = Date.now();
  }

  if (event.type === 'usage') {
    const totals = next.lastUsage ? { ...next.lastUsage } : emptyTotals();
    if (event.inputTokens !== undefined) totals.inputTokens = event.inputTokens;
    if (event.outputTokens !== undefined) totals.outputTokens = event.outputTokens;
    if (event.cachedInputTokens !== undefined) totals.cachedInputTokens = event.cachedInputTokens;
    if (event.reasoningOutputTokens !== undefined) {
      totals.reasoningOutputTokens = event.reasoningOutputTokens;
    }
    if (event.costUsd !== undefined) totals.costUsd = event.costUsd;
    next.lastUsage = totals;
    next.updatedAt = Date.now();
  }

  lastByScope.set(scope, next);
}

export function setScopeRunRequestedModel(scope: string, requestedModel: string | undefined): void {
  const prev = lastByScope.get(scope);
  const next: ScopeRunSnapshot = prev
    ? { ...prev, requestedModel, updatedAt: Date.now() }
    : { requestedModel, updatedAt: Date.now() };
  lastByScope.set(scope, next);
}

export function getScopeRunStats(scope: string): ScopeRunSnapshot | undefined {
  return lastByScope.get(scope);
}

/** Test helper. */
export function clearScopeRunStats(): void {
  lastByScope.clear();
}
