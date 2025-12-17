/**
 * Progress Module Types
 * 
 * Re-exports types from useProgressStore for module-level access.
 */

// Re-export from store
export type { ProgressItem, CounterItem, ProgressOrCounter } from '@/stores/useProgressStore';

// Module-specific input types
export type CreateProgressInput = {
  title: string;
  icon?: string;
  direction: 'increment' | 'decrement';
  total: number;
  step: number;
  unit: string;
  startDate?: number;
  endDate?: number;
  resetFrequency?: 'daily' | 'weekly' | 'monthly' | 'none';
};

export interface CreateCounterInput {
  title: string;
  icon?: string;
  step: number;
  unit: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  resetFrequency?: 'daily' | 'weekly' | 'monthly' | 'none';
}
