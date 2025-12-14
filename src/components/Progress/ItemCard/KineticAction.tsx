import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { 
  motion, 
  AnimatePresence, 
  useSpring, 
  useMotionValue, 
  useTransform, 
  useVelocity
} from 'framer-motion';
import { Plus, Minus, X, CaretUp, CaretDown } from '@phosphor-icons/react';

interface KineticActionProps {
  icon: typeof Plus | typeof Minus;
  step: number;
  direction: 'left' | 'right';
  onTrigger: () => void; // Single click
  onCommit: (delta: number) => void; // Long press commit
  onHoverStart: () => void;
  onHoverEnd: () => void;
  isActive: boolean;
}

/**
 * KineticAction 3.0 - "The Deep Press"
 * 
 * Interaction:
 * - Tap: Instant trigger (+1)
 * - Press & Hold: Opens the portal and starts accumulating energy.
 * - Vertical Drag: Adjusts the accumulation speed (Throttle).
 */
export function KineticAction({ 
  icon: Icon, 
  step, 
  direction, 
  onTrigger, 
  onCommit,
  onHoverStart,
  onHoverEnd,
  isActive
}: KineticActionProps) {
  const [mode, setMode] = useState<'idle' | 'charging'>('idle');
  const [accumulatedValue, setAccumulatedValue] = useState(0);
  const [speedMultiplier, setSpeedMultiplier] = useState(1);
  
  // Physics: Anchor & Cursor
  const originRef = useRef<{ x: number, y: number } | null>(null);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  
  // Physics: Orb (Damped Follower)
  // Tighter spring for stickier feel
  const springConfig = { stiffness: 400, damping: 28, mass: 0.5 };
  const orbX = useSpring(mouseX, springConfig);
  const orbY = useSpring(mouseY, springConfig);

  // Velocity visuals
  const velocityY = useVelocity(orbY);
  const scale = useTransform(velocityY, [-1000, 1000], [0.9, 0.9]); 

  // Logic Refs
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const valueRef = useRef(0);
  const lastTimeRef = useRef(0);
  const isChargingRef = useRef(false); // Ref for loop access

  const LONG_PRESS_DELAY = 300; // ms

  // Haptics
  const triggerHaptic = (strength: number = 1) => {
    if (navigator.vibrate) navigator.vibrate(strength);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    
    // CAPTURE POINTER: The magic fix for dragging outside/off-screen
    // This ensures we receive events even if the mouse leaves the browser/screen
    (e.target as Element).setPointerCapture(e.pointerId);

    const rect = e.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    originRef.current = { x: centerX, y: centerY };
    
    // Init physics
    mouseX.set(e.clientX);
    mouseY.set(e.clientY);
    orbX.set(e.clientX, { skipAnimations: true });
    orbY.set(e.clientY, { skipAnimations: true });
    
    // Bind global listeners immediately to catch early moves/ups
    window.addEventListener('pointermove', handleGlobalPointerMove);
    window.addEventListener('pointerup', handleGlobalPointerUp);
    window.addEventListener('pointercancel', handleGlobalPointerUp); // Safety net
    
    // Start Long Press Timer
    timerRef.current = setTimeout(() => {
        startCharging();
    }, LONG_PRESS_DELAY);
  };

  const startCharging = () => {
    setMode('charging');
    isChargingRef.current = true;
    document.body.style.cursor = 'ns-resize'; // Hint at vertical control
    
    valueRef.current = 0;
    setAccumulatedValue(0);
    setSpeedMultiplier(1);
    
    triggerHaptic(15); // Initial bump
    startAccumulationLoop();
  };

  const handleGlobalPointerMove = useCallback((e: PointerEvent) => {
    // Safety check: if button is not pressed, force stop
    // (Handles cases where mouseup was missed)
    if (e.buttons === 0 && (mode === 'charging' || timerRef.current)) {
        handleGlobalPointerUp();
        return;
    }

    mouseX.set(e.clientX);
    mouseY.set(e.clientY);

    // If charging, calculate vertical offset for speed control
    if (isChargingRef.current && originRef.current) {
        const dy = originRef.current.y - e.clientY; // Positive = Moving Up
        
        // Map dy to speed multiplier
        // 0px = 1x
        // 200px Up = 10x
        // 50px Down = 0.5x (Slow motion)
        let mult = 1;
        if (dy > 0) {
            mult = 1 + (dy / 20); // 1x per 20px
        } else {
            mult = Math.max(0.1, 1 + (dy / 100)); // Slow down
        }
        setSpeedMultiplier(mult);
    }
  }, [mouseX, mouseY]);

  const startAccumulationLoop = () => {
    lastTimeRef.current = performance.now();
    let lastInteger = 0;

    const loop = (time: number) => {
      const dt = Math.min(time - lastTimeRef.current, 64);
      lastTimeRef.current = time;

      // Base Speed: 5 units / sec
      const baseSpeed = 5; 
      
      const currentY = mouseY.get();
      const originY = originRef.current?.y || 0;
      const dy = originY - currentY; // Positive = Up
      
      let mult = 1;
      
      if (dy > 0) {
          // Exponential Acceleration (The "Turbo" Curve)
          // dy=50px  -> ~3.8x
          // dy=100px -> ~9.0x
          // dy=200px -> ~23x !!
          mult = 1 + Math.pow(dy / 25, 1.5);
      } else {
          // Downward: Precision Braking
          mult = Math.max(0.1, 1 + (dy / 100));
      }

      const addition = baseSpeed * mult * (dt / 1000);
      valueRef.current += addition;
      
      const currentInt = Math.floor(valueRef.current);
      setAccumulatedValue(currentInt);
      
      // Dynamic Haptics
      if (currentInt !== lastInteger) {
         // At high speeds (mult > 10), vibrate heavily
         // At medium speeds (mult > 4), vibrate lightly
         // At low speeds, vibrate only occasionally? No, distinct clicks are better.
         
         const intensity = mult > 10 ? 15 : (mult > 4 ? 8 : 2);
         triggerHaptic(intensity);
         lastInteger = currentInt;
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  };

  const handleGlobalPointerUp = useCallback(() => {
    // Clear timer
    if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
    }
    
    // Stop loop
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    window.removeEventListener('pointermove', handleGlobalPointerMove);
    window.removeEventListener('pointerup', handleGlobalPointerUp);
    window.removeEventListener('pointercancel', handleGlobalPointerUp);
    document.body.style.cursor = '';

    if (isChargingRef.current) {
        // Was charging -> Commit
        const finalVal = Math.floor(valueRef.current);
        if (finalVal > 0) {
            onCommit(finalVal * step);
        }
    } else {
        // Was short press -> Trigger
        // Only trigger if we haven't already committed (extra safety)
        if (!isChargingRef.current) {
             onTrigger();
        }
    }

    setMode('idle');
    isChargingRef.current = false;
    originRef.current = null;
    setAccumulatedValue(0);
  }, [step, onCommit, onTrigger]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener('pointermove', handleGlobalPointerMove);
      window.removeEventListener('pointerup', handleGlobalPointerUp);
      window.removeEventListener('pointercancel', handleGlobalPointerUp);
      document.body.style.cursor = '';
    };
  }, [handleGlobalPointerMove, handleGlobalPointerUp]);

  // Elastic Line
  const ElasticLine = () => {
    if (!originRef.current || mode !== 'charging') return null;
    const x1 = originRef.current.x;
    const y1 = originRef.current.y;
    return (
       <svg className="fixed inset-0 pointer-events-none z-[9998] overflow-visible">
         <motion.line
           x1={x1}
           y1={y1}
           x2={orbX}
           y2={orbY}
           stroke="currentColor"
           strokeWidth="1.5"
           className="text-zinc-400 dark:text-zinc-500 opacity-40"
           strokeDasharray="2 4"
         />
       </svg>
    );
  };

  return (
    <>
      {/* 1. Trigger Zone */}
      <div 
        className={`
          absolute inset-y-0 ${direction === 'left' ? 'left-0' : 'right-0'} 
          w-[30%] z-30 cursor-pointer active:cursor-grab flex items-center
          ${direction === 'left' ? 'justify-start pl-8' : 'justify-end pr-8'}
          outline-none select-none
        `}
        onPointerDown={handlePointerDown}
        onMouseEnter={onHoverStart}
        onMouseLeave={onHoverEnd}
      >
        <motion.div
          initial={{ x: direction === 'left' ? -20 : 20, opacity: 0, scale: 0.8 }}
          animate={
            isActive && mode === 'idle'
             ? { x: 0, opacity: 1, scale: 1 } 
             : { x: direction === 'left' ? -20 : 20, opacity: 0, scale: 0.8 }
          }
          transition={{ type: "spring", stiffness: 850, damping: 35, mass: 0.5 }}
          className="text-zinc-300 dark:text-zinc-600 pointer-events-none"
        >
           <Icon className="size-8" weight="light" />
        </motion.div>
      </div>

      {/* 2. The Portal Overlay */}
      {mode === 'charging' && createPortal(
        <div className="fixed inset-0 z-[9999] pointer-events-none font-sans text-zinc-900 dark:text-zinc-100">
            <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-zinc-100/50 dark:bg-black/50 backdrop-blur-sm"
            />

            <ElasticLine />

            <motion.div
                style={{ x: orbX, y: orbY, scale }}
                className="absolute top-0 left-0 -translate-x-1/2 -translate-y-1/2 will-change-transform flex items-center justify-center"
            >
                {/* HUD Container */}
                <motion.div 
                    initial={{ scale: 0.8, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    className="relative flex flex-col items-center gap-6"
                >
                    {/* The Speedometer / Multiplier Gauge */}
                    <div className="
                        flex items-center justify-center gap-3
                        h-14 px-6
                        bg-white dark:bg-zinc-900 
                        rounded-2xl
                        border border-zinc-200 dark:border-zinc-700
                        shadow-[0_20px_40px_-10px_rgba(0,0,0,0.3)]
                    ">
                        {/* Speed Indicator */}
                        <div className="flex flex-col items-center justify-center w-8 gap-0.5">
                             <CaretUp weight="bold" className={`size-3 ${speedMultiplier > 2 ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-300 dark:text-zinc-700'}`} />
                             <div className="h-4 w-1 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden relative">
                                <motion.div 
                                    className="absolute bottom-0 inset-x-0 bg-zinc-900 dark:bg-zinc-100"
                                    style={{ height: `${Math.min(100, (speedMultiplier - 0.5) * 20)}%` }}
                                />
                             </div>
                             <CaretDown weight="bold" className={`size-3 ${speedMultiplier < 0.8 ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-300 dark:text-zinc-700'}`} />
                        </div>

                        <div className="w-px h-8 bg-zinc-200 dark:bg-zinc-800" />
                        
                        {/* The Counter */}
                        <div className="flex flex-col items-start min-w-[60px]">
                             <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                                {direction === 'left' ? 'Removing' : 'Adding'}
                             </span>
                             <div className="flex items-baseline gap-1">
                                <span className="text-3xl font-bold tabular-nums leading-none">
                                    {accumulatedValue === 0 ? 1 : accumulatedValue}
                                </span>
                                <span className="text-xs text-zinc-400 font-medium">x</span>
                             </div>
                        </div>
                    </div>
                    
                    {/* Total Preview */}
                    <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/50 dark:bg-zinc-900/50 backdrop-blur-md border border-white/10">
                        <span className="text-xs text-zinc-500">Total:</span>
                        <span className="text-xl font-light tabular-nums">
                            {accumulatedValue * step}
                        </span>
                    </div>

                </motion.div>
            </motion.div>
            
            {/* Helper Text (Bottom) */}
            <div className="fixed bottom-10 inset-x-0 text-center">
                 <p className="text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-widest opacity-60">
                    Drag Up to Accelerate
                 </p>
            </div>
        </div>,
        document.body
      )}
    </>
  );
}
