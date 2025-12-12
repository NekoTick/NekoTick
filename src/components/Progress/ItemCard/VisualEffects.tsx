import { motion, AnimatePresence } from 'framer-motion';

export interface Ripple {
  id: number;
  x: number;
  y: number;
}

interface ProgressBarProps {
  fillWidth: string;
  isCompleting: boolean;
}

export function ProgressBar({ fillWidth, isCompleting }: ProgressBarProps) {
  return (
    <motion.div 
      className="absolute inset-y-0 left-0 bg-gradient-to-r from-zinc-50 to-zinc-100 dark:from-zinc-800 dark:to-zinc-800/50"
      initial={false}
      animate={{ width: fillWidth, opacity: isCompleting ? 0 : 1 }}
      transition={{ duration: 0.4, ease: "circOut" }}
    >
        {/* The Leading Edge Glow */}
        <div className="absolute right-0 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-zinc-300 dark:via-zinc-600 to-transparent opacity-50" />
    </motion.div>
  );
}

interface CounterEffectsProps {
  ripples: Ripple[];
  implosions: Ripple[];
}

export function CounterEffects({ ripples, implosions }: CounterEffectsProps) {
  return (
    <AnimatePresence>
      {/* Outward Ripples (Plus) */}
      {ripples.map(ripple => (
        <motion.div
          key={`ripple-${ripple.id}`}
          initial={{ width: 0, height: 0, opacity: 0.8, x: ripple.x, y: ripple.y, boxShadow: "0 0 0 0px rgba(0,0,0,0.05)" }}
          animate={{ 
              width: 600, 
              height: 600, 
              opacity: 0, 
              x: ripple.x - 300, 
              y: ripple.y - 300,
              boxShadow: "0 0 40px 20px rgba(0,0,0,0)" 
          }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
          className="absolute rounded-full border border-zinc-900/5 dark:border-white/20 bg-zinc-900/5 dark:bg-white/5 pointer-events-none backdrop-blur-[1px] mix-blend-normal dark:mix-blend-overlay"
        />
      ))}

      {/* Inward Implosions (Minus) */}
      {implosions.map(imp => (
        <motion.div
          key={`imp-${imp.id}`}
          initial={{ 
              width: 600, 
              height: 600, 
              opacity: 0, 
              x: imp.x - 300, 
              y: imp.y - 300, 
              boxShadow: "0 0 40px 20px rgba(0,0,0,0)" 
          }}
          animate={{ 
              width: 0, 
              height: 0, 
              opacity: 1, 
              x: imp.x, 
              y: imp.y,
              boxShadow: "0 0 0 0px rgba(0,0,0,0.05)"
          }}
          transition={{ duration: 0.5, ease: "easeIn" }}
          className="absolute rounded-full border border-zinc-900/5 dark:border-white/20 bg-zinc-900/5 dark:bg-white/5 pointer-events-none backdrop-blur-[1px] mix-blend-normal dark:mix-blend-overlay"
        />
      ))}
    </AnimatePresence>
  );
}
