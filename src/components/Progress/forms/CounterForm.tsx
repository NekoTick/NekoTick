import { useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { formInputClassName, formLabelClassName, toggleButtonClassName, submitButtonClassName } from '../styles';

interface CounterFormData {
  title: string;
  step: number;
  unit: string;
  frequency: 'daily' | 'weekly' | 'monthly';
}

interface CounterFormProps {
  onBack: () => void;
  onSubmit: (data: CounterFormData) => void;
}

const FREQUENCY_OPTIONS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
] as const;

/**
 * Form for creating a new Counter item
 */
export function CounterForm({ onBack, onSubmit }: CounterFormProps) {
  const [form, setForm] = useState<CounterFormData>({
    title: '',
    step: 1,
    unit: '次',
    frequency: 'daily',
  });

  const handleSubmit = () => {
    if (!form.title.trim()) return;
    onSubmit({
      ...form,
      title: form.title.trim(),
      unit: form.unit.trim() || '次',
    });
  };

  return (
    <div className="h-full bg-white dark:bg-zinc-900 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-3">
        <button
          onClick={onBack}
          className="p-1 -ml-1 rounded text-zinc-300 hover:text-zinc-500 transition-colors"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="text-sm text-zinc-400">Create Counter</span>
      </div>

      {/* Form Fields */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
        <div>
          <label className={formLabelClassName}>Title</label>
          <input
            type="text"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Enter title..."
            className={formInputClassName}
            autoFocus
          />
        </div>

        <div>
          <label className={formLabelClassName}>Frequency</label>
          <div className="flex gap-3">
            {FREQUENCY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setForm({ ...form, frequency: opt.value })}
                className={toggleButtonClassName(form.frequency === opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div>
            <label className={formLabelClassName}>Step</label>
            <input
              type="number"
              value={form.step}
              onChange={(e) => setForm({ ...form, step: Number(e.target.value) || 1 })}
              className="w-16 px-0 py-1 text-sm bg-transparent border-b border-zinc-200 dark:border-zinc-700 outline-none focus:border-zinc-400"
            />
          </div>
          <div>
            <label className={formLabelClassName}>Unit</label>
            <input
              type="text"
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
              className="w-16 px-0 py-1 text-sm bg-transparent border-b border-zinc-200 dark:border-zinc-700 outline-none focus:border-zinc-400"
            />
          </div>
        </div>
      </div>

      {/* Submit Button */}
      <div className="px-6 py-4">
        <button
          onClick={handleSubmit}
          disabled={!form.title.trim()}
          className={submitButtonClassName}
        >
          Create
        </button>
      </div>
    </div>
  );
}
