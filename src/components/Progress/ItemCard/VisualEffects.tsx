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
 * DebrisField - High Fidelity
 * Simulates shattering into premium crystalline shards.
 */
export function DebrisField() {
  // Generate shards with irregular polygon shapes
  // Using deterministic randomness for stable visual but chaotic look
  const shards = Array.from({ length: 24 }).map((_, i) => {
    const seed = i * 13.5;
    
    // Irregular Shapes (Polygons)
    const shapeType = i % 3;
    let clipPath = '';
    if (shapeType === 0) clipPath = 'polygon(50% 0%, 0% 100%, 100% 100%)'; // Triangle
    else if (shapeType === 1) clipPath = 'polygon(20% 0%, 80% 0%, 100% 100%, 0% 100%)'; // Trapezoid
    else clipPath = 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)'; // Diamond

    // Scatter logic: Center burst
    // x: 0-100%, y: 0-100%
    const startX = (i % 6) * 16 + Math.random() * 10;
    const startY = Math.floor(i / 6) * 25 + Math.random() * 10;
    
    // Explosion Physics
    // Shards near center fly straight out, shards near edge fly sideways
    const centerX = 50;
    const centerY = 50;
    const distX = startX - centerX;
    const distY = startY - centerY;
    
    return {
      id: i,
      x: startX,
      y: startY,
      width: 15 + Math.random() * 25,
      height: 15 + Math.random() * 25,
      rotation: Math.random() * 360,
      clipPath,
      // Target: Move away from center + gravity (positive Y)
      targetX: distX * (2 + Math.random()), 
      targetY: distY * (2 + Math.random()) + 150, // Add gravity
      targetRotate: (Math.random() - 0.5) * 720, // Violent spin
      delay: Math.random() * 0.05 // Micro-delays for "crunchy" feel
    };
  });

  return (
    <div className="absolute inset-0 overflow-visible pointer-events-none z-[100]">
      {shards.map((shard) => (
        <motion.div
          key={shard.id}
          className="absolute backdrop-blur-md"
          style={{
            left: `${shard.x}%`,
            top: `${shard.y}%`,
            width: shard.width,
            height: shard.height,
            clipPath: shard.clipPath,
          }}
          initial={{ 
            opacity: 1, 
            scale: 1,
            rotate: shard.rotation 
          }}
          animate={{ 
            opacity: 0,
            x: shard.targetX,
            y: shard.targetY,
            rotate: shard.rotation + shard.targetRotate,
            scale: [1, 0.8, 0] // Shrink as they fly
          }}
          transition={{ 
            duration: 0.9, 
            ease: [0.25, 1, 0.5, 1], // "Flash" start, slow tail
            delay: shard.delay
          }}
        >
          {/* Shard Material: Glassy/Ceramic Gradient */}
          <div className="w-full h-full bg-gradient-to-br from-white via-zinc-100 to-zinc-300 dark:from-zinc-700 dark:via-zinc-800 dark:to-black opacity-90 border border-white/40 dark:border-white/10" />
        </motion.div>
      ))}
    </div>
  );
}





