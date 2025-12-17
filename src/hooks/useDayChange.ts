import { useEffect, useRef } from 'react';
import { useProgressStore } from '../stores/useProgressStore';

/**
 * The Midnight Watchman
 * 
 * A hook that vigilantly monitors the passage of time.
 * It detects when the day changes (either while the app is running or upon waking from sleep)
 * and triggers a validation of the daily state.
 */
export function useDayChange() {
  const { validateDailyState } = useProgressStore();
  const lastCheck = useRef<string>(new Date().toDateString());

  useEffect(() => {
    // 1. Check immediately on mount
    validateDailyState();

    // 2. Setup Visibility Change Listener (When user switches back to tab/app)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const today = new Date().toDateString();
        if (today !== lastCheck.current) {
           console.log('[Midnight Watchman] Waking up... New day detected.');
           lastCheck.current = today;
           validateDailyState();
        }
      }
    };

    // 3. Setup Interval (Midnight check for active sessions)
    const intervalId = setInterval(() => {
        const today = new Date().toDateString();
        if (today !== lastCheck.current) {
            console.log('[Midnight Watchman] Midnight struck. Resetting daily state.');
            lastCheck.current = today;
            validateDailyState();
        }
    }, 60 * 1000);

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(intervalId);
    };
  }, [validateDailyState]);
}
