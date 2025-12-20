export type CreateType = 'progress' | 'counter';

export interface ProgressFormData {
  title: string;
  icon?: string;
  direction: 'increment' | 'decrement';
  total: number;
  step: number;
  unit: string;
  resetFrequency?: 'daily' | 'weekly' | 'monthly' | 'none';
}

export interface CounterFormData {
  title: string;
  icon?: string;
  step: number;
  unit: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  resetFrequency?: 'daily' | 'weekly' | 'monthly' | 'none';
}

export interface CreateModalProps {
  open: boolean;
  onClose: () => void;
  onCreateProgress: (data: ProgressFormData) => void;
  onCreateCounter: (data: CounterFormData) => void;
}
