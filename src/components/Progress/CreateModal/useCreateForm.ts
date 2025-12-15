import { useState, useEffect } from 'react';
import { CreateType, ProgressFormData, CounterFormData } from './types';

export function useCreateForm(
  open: boolean, 
  onCreateProgress: (data: ProgressFormData) => void, 
  onCreateCounter: (data: CounterFormData) => void,
  onClose: () => void
) {
  const [type, setType] = useState<CreateType>('progress');
  const [isPickingIcon, setIsPickingIcon] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Forms
  const [progressForm, setProgressForm] = useState<ProgressFormData>({
    title: '',
    direction: 'increment',
    total: 100,
    step: 1,
    unit: '次',
    resetFrequency: 'none',
  });

  const [counterForm, setCounterForm] = useState<CounterFormData>({
    title: '',
    step: 1,
    unit: '次',
    frequency: 'daily',
    resetFrequency: 'none',
  });

  // Preview Interaction State
  const [previewCurrent, setPreviewCurrent] = useState(0);
  const [previewTodayCount, setPreviewTodayCount] = useState(1);

  // Update preview when total changes
  useEffect(() => {
    if (type === 'progress') {
      setPreviewCurrent(Math.floor(progressForm.total * 0.35));
    } else {
      setPreviewCurrent(12); // Demo starting value for counter
    }
    setPreviewTodayCount(type === 'progress' ? 1 : 3);
  }, [type, progressForm.total]);

  // Handle preview updates
  const handlePreviewUpdate = (_: string, delta: number) => {
    setPreviewTodayCount(prev => Math.max(0, prev + (delta > 0 ? 1 : -1)));
    
    if (type === 'progress') {
      setPreviewCurrent(prev => Math.max(0, Math.min(progressForm.total, prev + delta)));
    } else {
      setPreviewCurrent(prev => Math.max(0, prev + delta));
    }
  };

  // Reset on open
  useEffect(() => {
    if (open) {
      setIsSubmitting(false);
      setType('progress');
      setIsPickingIcon(false);
      setProgressForm({ title: '', direction: 'increment', total: 100, step: 1, unit: '次', resetFrequency: 'none' });
      setCounterForm({ title: '', step: 1, unit: '次', frequency: 'daily', resetFrequency: 'none' });
    }
  }, [open]);

  // Submit Handler
  const handleSubmit = () => {
    if (isSubmitting) return; // Prevent duplicate submission
    setIsSubmitting(true);

    if (type === 'progress') {
      if (!progressForm.title.trim()) return;
      onCreateProgress({ ...progressForm, title: progressForm.title.trim(), unit: progressForm.unit.trim() || '次', resetFrequency: progressForm.resetFrequency });
    } else {
      if (!counterForm.title.trim()) return;
      onCreateCounter({ ...counterForm, title: counterForm.title.trim(), unit: counterForm.unit.trim() || '次', resetFrequency: counterForm.resetFrequency });
    }
    onClose();
  };

  // Construct Preview Item
  const previewItem: any = type === 'progress' ? {
    id: 'preview',
    type: 'progress',
    title: progressForm.title || 'Untitled',
    icon: progressForm.icon,
    current: previewCurrent,
    total: progressForm.total,
    unit: progressForm.unit,
    todayCount: previewTodayCount,
    step: progressForm.step,
    direction: progressForm.direction,
    resetFrequency: progressForm.resetFrequency,
  } : {
    id: 'preview',
    type: 'counter',
    title: counterForm.title || 'Untitled',
    icon: counterForm.icon,
    current: previewCurrent,
    unit: counterForm.unit,
    todayCount: previewTodayCount,
    step: counterForm.step,
    frequency: counterForm.frequency
  };

  const isValid = type === 'progress' ? progressForm.title.trim().length > 0 : counterForm.title.trim().length > 0;

  return {
    type, setType,
    isPickingIcon, setIsPickingIcon,
    progressForm, setProgressForm,
    counterForm, setCounterForm,
    previewItem, handlePreviewUpdate,
    handleSubmit, isValid
  };
}
