import { motion, AnimatePresence } from 'framer-motion';
import { useToastStore, type Toast as ToastType } from '@/stores/useToastStore';
import { cn } from '@/lib/utils';
import { raisedPillSurfaceClass } from '@/components/ui/surfaceStyles';
import { themeMotionTokens } from '@/styles/themeTokens';

interface ToastItemProps {
  toast: ToastType;
  onClose: (id: string) => void;
}

function ToastItem({ toast, onClose }: ToastItemProps) {
  return (
    <motion.div
      initial={{ opacity: themeMotionTokens.opacityHidden, y: themeMotionTokens.toastInitialY, scale: themeMotionTokens.toastInitialScale }}
      animate={{ opacity: themeMotionTokens.opacityVisible, y: themeMotionTokens.toastVisibleY, scale: themeMotionTokens.toastVisibleScale }}
      exit={{ opacity: themeMotionTokens.opacityHidden, scale: themeMotionTokens.toastExitScale, transition: { duration: themeMotionTokens.toastExitDuration } }}
      role="button"
      tabIndex={0}
      onClick={() => onClose(toast.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClose(toast.id);
        }
      }}
      className={cn(
        raisedPillSurfaceClass,
        'relative flex cursor-pointer items-center overflow-hidden rounded-[var(--vlaina-ui-radius-group)] px-4 py-3',
        'min-w-[var(--vlaina-size-300px)] max-w-[var(--vlaina-width-toast-max)]',
        'text-[var(--vlaina-text-primary)] transition-all duration-[var(--vlaina-duration-300)] ease-out'
      )}
    >
      <p className="flex-1 text-sm font-medium leading-5 text-[var(--vlaina-text-primary)]">{toast.message}</p>
    </motion.div>
  );
}

export function ToastContainer() {
  const toasts = useToastStore((state) => state.toasts);
  const removeToast = useToastStore((state) => state.removeToast);
  
  return (
    <div className="fixed bottom-4 right-4 z-[var(--vlaina-z-max)] flex max-w-[var(--vlaina-width-toast-stack-max)] flex-col gap-2 pointer-events-none">
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <div key={toast.id} className="pointer-events-auto">
            <ToastItem toast={toast} onClose={removeToast} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}
