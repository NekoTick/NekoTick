import { describe, expect, it } from 'vitest';

import {
  MAX_MANAGED_MODEL_CATALOG_VERSION_CHARS,
  MAX_MANAGED_MODEL_GROUP_CHARS,
  MAX_MANAGED_MODEL_ID_CHARS,
  MAX_MANAGED_MODEL_NAME_CHARS,
  MAX_MANAGED_MODELS,
  normalizeManagedModelCatalogPayload,
  normalizeManagedBudgetPayload,
  normalizeManagedModelsPayload,
} from './normalizers';

describe('normalizeManagedModelsPayload', () => {
  it('keeps managed model price tiers from the public catalog', () => {
    const models = normalizeManagedModelsPayload({
      data: [
        {
          id: 'gpt-test',
          display_name: 'GPT Test',
          group: 'OpenAI',
          price_tier: '$$',
          price_score: 0.42,
          is_free: true,
          is_default: true,
        },
      ],
    });

    expect(models[0]).toMatchObject({
      id: 'vlaina-managed::gpt-test',
      apiModelId: 'gpt-test',
      priceTier: '$$',
      priceScore: 0.42,
      isFree: true,
      isDefault: true,
    });
  });

  it('ignores invalid price metadata', () => {
    const models = normalizeManagedModelsPayload({
      data: [
        {
          id: 'gpt-test',
          price_tier: '$$$$$$',
          price_score: -1,
        },
      ],
    });

    expect(models[0]?.priceTier).toBeUndefined();
    expect(models[0]?.priceScore).toBeUndefined();
  });

  it('ignores overlong managed model price tiers before trimming', () => {
    const models = normalizeManagedModelsPayload({
      data: [
        {
          id: 'gpt-test',
          price_tier: `${' '.repeat(6)}$`,
        },
      ],
    });

    expect(models[0]?.priceTier).toBeUndefined();
  });

  it('limits the number of managed models normalized from a catalog payload', () => {
    const models = normalizeManagedModelsPayload({
      data: Array.from({ length: MAX_MANAGED_MODELS + 5 }, (_, index) => ({
        id: `model-${String(index).padStart(4, '0')}`,
      })),
    });

    expect(models).toHaveLength(MAX_MANAGED_MODELS);
    expect(models[0]?.apiModelId).toBe('model-0000');
    expect(models.at(-1)?.apiModelId).toBe(`model-${String(MAX_MANAGED_MODELS - 1).padStart(4, '0')}`);
  });

  it('caps managed model string fields before storing them', () => {
    const models = normalizeManagedModelsPayload({
      data: [
        {
          id: `${'m'.repeat(MAX_MANAGED_MODEL_ID_CHARS)}overflow`,
          display_name: `${'n'.repeat(MAX_MANAGED_MODEL_NAME_CHARS)}overflow`,
          group: `${'g'.repeat(MAX_MANAGED_MODEL_GROUP_CHARS)}overflow`,
        },
      ],
    });

    expect(models[0]?.apiModelId).toBe('m'.repeat(MAX_MANAGED_MODEL_ID_CHARS));
    expect(models[0]?.name).toBe('n'.repeat(MAX_MANAGED_MODEL_NAME_CHARS));
    expect(models[0]?.group).toBe('g'.repeat(MAX_MANAGED_MODEL_GROUP_CHARS));
  });

  it('caps managed model catalog versions before storing them', () => {
    const catalog = normalizeManagedModelCatalogPayload({
      data: [],
      model_catalog_version: `${'v'.repeat(MAX_MANAGED_MODEL_CATALOG_VERSION_CHARS)}overflow`,
    });

    expect(catalog.version).toBe('v'.repeat(MAX_MANAGED_MODEL_CATALOG_VERSION_CHARS));
  });
});

describe('normalizeManagedBudgetPayload', () => {
  it('accepts direct camelCase percentage fields', () => {
    expect(normalizeManagedBudgetPayload({
      active: true,
      usedPercent: 25,
      remainingPercent: 75,
      status: 'active',
    })).toEqual({
      active: true,
      usedPercent: 25,
      remainingPercent: 75,
      status: 'active',
    });
  });

  it('accepts nested snake_case percentage fields returned by API payloads', () => {
    expect(normalizeManagedBudgetPayload({
      data: {
        active: 'true',
        used_percent: '25',
        remaining_percent: '75%',
        status: 'normal',
      },
    })).toEqual({
      active: true,
      usedPercent: 25,
      remainingPercent: 75,
      status: 'normal',
    });
  });

  it('computes percentage from point totals when percent fields are absent', () => {
    expect(normalizeManagedBudgetPayload({
      budget: {
        points_remaining: 300,
        monthly_points: 1200,
        status: 'active',
      },
    })).toEqual({
      active: true,
      usedPercent: 75,
      remainingPercent: 25,
      status: 'active',
    });
  });

  it('keeps missing remaining percentage as NaN instead of pretending it is zero', () => {
    const budget = normalizeManagedBudgetPayload({
      active: true,
      status: 'active',
    });

    expect(budget.active).toBe(true);
    expect(budget.usedPercent).toBe(0);
    expect(Number.isNaN(budget.remainingPercent)).toBe(true);
  });

  it('ignores non-decimal and overlong budget number strings', () => {
    const status = 'active'.repeat(40);
    const budget = normalizeManagedBudgetPayload({
      data: {
        active: true,
        remaining_percent: '0x4b',
        used_percent: `${' '.repeat(65)}25`,
        status,
      },
    });

    expect(budget.active).toBe(true);
    expect(budget.status).toBe(status.slice(0, 128));
    expect(budget.usedPercent).toBe(0);
    expect(Number.isNaN(budget.remainingPercent)).toBe(true);
  });
});
