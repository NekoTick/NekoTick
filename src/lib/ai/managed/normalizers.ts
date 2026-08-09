import type { AIModel, Provider } from '@/lib/ai/types';
import { buildScopedModelId } from '@/lib/ai/utils';

import {
  MANAGED_API_BASE,
  MANAGED_PROVIDER_ID,
  MANAGED_PROVIDER_NAME,
} from './constants';
import type {
  ManagedModelCatalog,
  ManagedBudgetPayload,
  ManagedBudgetStatus,
  ManagedModelsPayload,
  ManagedModelsVersionPayload,
} from './types';

export const MAX_MANAGED_MODEL_ROWS_SCAN = 4096;
export const MAX_MANAGED_MODELS = 2048;
export const MAX_MANAGED_MODEL_ID_CHARS = 4096;
export const MAX_MANAGED_MODEL_NAME_CHARS = 4096;
export const MAX_MANAGED_MODEL_GROUP_CHARS = 1024;
export const MAX_MANAGED_MODEL_CATALOG_VERSION_CHARS = 256;
const MAX_MANAGED_BUDGET_NUMBER_CHARS = 64;
const MAX_MANAGED_BUDGET_STATUS_CHARS = 128;

export function createManagedProvider(now: number): Provider {
  return {
    id: MANAGED_PROVIDER_ID,
    name: MANAGED_PROVIDER_NAME,
    type: 'newapi',
    apiHost: MANAGED_API_BASE,
    apiKey: '',
    enabled: true,
    createdAt: now,
    updatedAt: now,
  };
}

export function normalizeManagedModelsPayload(payload: ManagedModelsPayload): AIModel[] {
  const rows = Array.isArray(payload.data) ? payload.data : [];
  const now = Date.now();
  const seen = new Set<string>();

  const models: AIModel[] = [];
  const rowsToScan = Math.min(rows.length, MAX_MANAGED_MODEL_ROWS_SCAN);
  for (let index = 0; index < rowsToScan && models.length < MAX_MANAGED_MODELS; index += 1) {
    const row = rows[index];
    if (!row || typeof row !== 'object') continue;
    const value = row as Record<string, unknown>;
    const id = normalizeManagedString(value.id, MAX_MANAGED_MODEL_ID_CHARS);
    if (!id || seen.has(id.toLowerCase())) continue;
    seen.add(id.toLowerCase());

    models.push({
      id: buildScopedModelId(MANAGED_PROVIDER_ID, id),
      apiModelId: id,
      name: normalizeModelName(value, id),
      group: normalizeModelGroup(value, id),
      ...normalizeModelPrice(value),
      isFree: value.is_free === true,
      isDefault: value.is_default === true,
      providerId: MANAGED_PROVIDER_ID,
      enabled: true,
      createdAt: now,
    });
  }

  return models.sort((a, b) => a.apiModelId.localeCompare(b.apiModelId));
}

export function normalizeManagedModelCatalogPayload(payload: ManagedModelsPayload): ManagedModelCatalog {
  return {
    models: normalizeManagedModelsPayload(payload),
    version: normalizeManagedModelCatalogVersion(payload.model_catalog_version),
  };
}

export function normalizeManagedModelsVersionPayload(payload: ManagedModelsVersionPayload): string | null {
  return normalizeManagedModelCatalogVersion(payload.model_catalog_version);
}

export function normalizeManagedBudgetPayload(payload: ManagedBudgetPayload): ManagedBudgetStatus {
  const source = normalizeManagedBudgetSource(payload);
  const status = normalizeManagedString(source.status, MAX_MANAGED_BUDGET_STATUS_CHARS) || 'inactive';
  const remainingPercent = readFiniteNumber(source, [
    'remainingPercent',
    'remaining_percent',
    'remainingPercentage',
    'remaining_percentage',
    'quotaRemainingPercent',
    'quota_remaining_percent',
  ]);
  const usedPercent = readFiniteNumber(source, [
    'usedPercent',
    'used_percent',
    'usedPercentage',
    'used_percentage',
    'quotaUsedPercent',
    'quota_used_percent',
  ]);
  const remainingPoints = readFiniteNumber(source, [
    'remainingPoints',
    'remaining_points',
    'pointsRemaining',
    'points_remaining',
  ]);
  const totalPoints = readFiniteNumber(source, [
    'totalPoints',
    'total_points',
    'monthlyPoints',
    'monthly_points',
    'pointsLimit',
    'points_limit',
  ]);
  const computedRemainingPercent =
    remainingPercent ??
    (typeof usedPercent === 'number' ? 100 - usedPercent : null) ??
    (typeof remainingPoints === 'number' && typeof totalPoints === 'number' && totalPoints > 0
      ? (remainingPoints / totalPoints) * 100
      : null);
  const computedUsedPercent =
    usedPercent ??
    (typeof computedRemainingPercent === 'number' ? 100 - computedRemainingPercent : null);

  return {
    active: source.active === true || source.active === 'true' || status === 'active' || status === 'normal',
    usedPercent: typeof computedUsedPercent === 'number' ? computedUsedPercent : 0,
    remainingPercent: typeof computedRemainingPercent === 'number' ? computedRemainingPercent : Number.NaN,
    status,
  };
}

function normalizeManagedBudgetSource(payload: ManagedBudgetPayload): Record<string, unknown> {
  const source = payload as Record<string, unknown>;
  for (const key of ['budget', 'data'] as const) {
    const nested = source[key];
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      return nested as Record<string, unknown>;
    }
  }
  return source;
}

function readFiniteNumber(source: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      if (value.length > MAX_MANAGED_BUDGET_NUMBER_CHARS) {
        continue;
      }
      const trimmed = value.trim().replace(/%$/, '');
      if (!trimmed) {
        continue;
      }
      if (!/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
        continue;
      }
      const parsed = Number.parseFloat(trimmed);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return null;
}


function normalizeModelName(model: Record<string, unknown>, fallback: string): string {
  const display = normalizeManagedString(model.display_name, MAX_MANAGED_MODEL_NAME_CHARS);
  if (display) return display;
  const name = normalizeManagedString(model.name, MAX_MANAGED_MODEL_NAME_CHARS);
  return name || fallback;
}

function normalizeManagedModelCatalogVersion(value: unknown): string | null {
  const version = normalizeManagedString(value, MAX_MANAGED_MODEL_CATALOG_VERSION_CHARS);
  return version || null;
}

function normalizeModelGroup(model: Record<string, unknown>, modelId: string): string {
  const group = normalizeManagedString(model.group, MAX_MANAGED_MODEL_GROUP_CHARS);
  if (group) return group;
  if (modelId.includes('/')) return modelId.split('/')[0] || 'other';
  if (modelId.includes(':')) return modelId.split(':')[0] || 'other';
  if (modelId.includes('-')) return modelId.split('-')[0] || 'other';
  return 'other';
}

function normalizeModelPrice(model: Record<string, unknown>): Pick<AIModel, 'priceTier' | 'priceScore'> {
  const priceTier = typeof model.price_tier === 'string' && model.price_tier.length <= 5
    ? model.price_tier.trim()
    : '';
  const normalized: Pick<AIModel, 'priceTier' | 'priceScore'> = {};
  if (
    priceTier === '$' ||
    priceTier === '$$' ||
    priceTier === '$$$' ||
    priceTier === '$$$$' ||
    priceTier === '$$$$$'
  ) {
    normalized.priceTier = priceTier;
  }

  if (typeof model.price_score === 'number' && Number.isFinite(model.price_score) && model.price_score >= 0) {
    normalized.priceScore = model.price_score;
  }

  return normalized;
}

function normalizeManagedString(value: unknown, maxChars: number): string {
  return typeof value === 'string' ? value.slice(0, maxChars).trim() : '';
}
