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
      className="absolute inset-y-0 left-0 bg-zinc-100 dark:bg-zinc-800" 
      initial={false}
      animate={{ width: fillWidth }}
      transition={{ duration: 0.2, ease: "linear" }}
    >
        {/* Soft Leading Edge */}
        <div className="absolute right-0 top-0 bottom-0 w-[40px] bg-gradient-to-r from-transparent to-white/50 dark:to-white/10" />
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
      {/* Soft Ripples */}
      {ripples.map(ripple => (
        <motion.div
          key={`ripple-${ripple.id}`}
          initial={{ width: 0, height: 0, opacity: 0.4, x: ripple.x, y: ripple.y }}
          animate={{ 
              width: 400, 
              height: 400, 
              opacity: 0, 
              x: ripple.x - 200, 
              y: ripple.y - 200,
          }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8, ease: "circOut" }}
          className="absolute rounded-full bg-zinc-900/5 dark:bg-white/10 pointer-events-none"
        />
      ))}

      {/* Soft Implosions */}
      {implosions.map(imp => (
        <motion.div
          key={`imp-${imp.id}`}
          initial={{ 
              width: 300, 
              height: 300, 
              opacity: 0, 
              x: imp.x - 150, 
              y: imp.y - 150, 
          }}
          animate={{ 
              width: 0, 
              height: 0, 
              opacity: 0.6, 
              x: imp.x, 
              y: imp.y,
          }}
          transition={{ duration: 0.4, ease: "circOut" }}
          className="absolute rounded-full bg-zinc-900/5 dark:bg-white/10 pointer-events-none"
        />
      ))}
    </AnimatePresence>
  );
}

/**
 * DebrisField - Quantum Dissolve Edition
 * High-density particle system simulating digital disintegration.
 */
export function DebrisField() {
  // Generate high density particles (Quantum Dust)
  const particles = Array.from({ length: 64 }).map((_, i) => {
    // Distribution: More density in the center, sparse at edges
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.pow(Math.random(), 0.5) * 50; // Bias towards center
    const startX = 50 + Math.cos(angle) * distance;
    const startY = 50 + Math.sin(angle) * distance;
    
    // Physics: Explosion from center
    const force = 1 + Math.random() * 2;
    const moveX = Math.cos(angle) * 150 * force;
    const moveY = Math.sin(angle) * 150 * force;

    return {
      id: i,
      x: startX,
      y: startY,
      size: 2 + Math.random() * 4, // Tiny particles
      color: Math.random() > 0.6 ? 'bg-zinc-900 dark:bg-white' : 'bg-zinc-400 dark:bg-zinc-600', // Mix of primary/secondary colors
      opacity: 0.4 + Math.random() * 0.6,
      targetX: moveX,
      targetY: moveY,
      delay: Math.random() * 0.1,
      duration: 0.6 + Math.random() * 0.4
    };
  });

  return (
    <div className="absolute inset-0 overflow-visible pointer-events-none z-[100]">
      {/* 1. The Shockwave (Sonic Boom) */}
      <motion.div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-zinc-900/10 dark:border-white/20"
        initial={{ width: 0, height: 0, opacity: 0.5, borderWidth: 20 }}
        animate={{ width: 600, height: 600, opacity: 0, borderWidth: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      />

      {/* 2. The Quantum Particles */}
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className={`absolute rounded-full ${p.color}`}
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
          }}
          initial={{ 
            opacity: p.opacity, 
            scale: 1 
          }}
          animate={{ 
            opacity: 0,
            x: p.targetX,
            y: p.targetY,
            scale: 0
          }}
          transition={{ 
            duration: p.duration, 
            ease: [0.215, 0.61, 0.355, 1], // Cubic Bezier (Ease Out)
            delay: p.delay
          }}
        />
      ))}
    </div>
  );
}






