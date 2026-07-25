import { useEffect, useState } from 'react';

export function useGraphViewportActivity(active: boolean, cancel: () => void): boolean {
  const [documentVisible, setDocumentVisible] = useState(
    () => typeof document === 'undefined' || document.visibilityState !== 'hidden',
  );

  useEffect(() => {
    const syncActivity = () => {
      const visible = document.visibilityState !== 'hidden';
      setDocumentVisible(visible);
      if (!active || !visible) cancel();
    };
    syncActivity();
    document.addEventListener('visibilitychange', syncActivity);
    return () => document.removeEventListener('visibilitychange', syncActivity);
  }, [active, cancel]);

  return active && documentVisible;
}
