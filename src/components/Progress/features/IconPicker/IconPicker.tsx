import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkle } from '@phosphor-icons/react';
import { IconGridView } from './IconGridView';
import { getIconByName } from './utils';
import { useClickOutside } from '@/hooks/useClickOutside';

export interface IconPickerProps {
  value?: string;
  onChange: (icon: string | undefined) => void;
}

export function IconPicker({ value, onChange }: IconPickerProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useClickOutside(containerRef, () => setOpen(false), open);

  const SelectedIcon = value ? getIconByName(value) : null;

  return (
    <div className="relative z-50" ref={containerRef}>
      {/* Trigger Button */}
      <motion.button
        type="button"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setOpen(!open)}
        className={`
          relative w-14 h-14 flex items-center justify-center rounded-full transition-all duration-300
          ${SelectedIcon 
            ? 'bg-white dark:bg-zinc-800 shadow-[0_8px_16px_-4px_rgba(0,0,0,0.1)] ring-1 ring-black/5 dark:ring-white/10' 
            : 'bg-white/50 dark:bg-zinc-800/50 hover:bg-white dark:hover:bg-zinc-700 shadow-sm hover:shadow-md'
          }
        `}
      >
        {SelectedIcon ? (
          <div className="text-zinc-900 dark:text-zinc-100">
             <SelectedIcon className="size-6" weight="duotone" />
          </div>
        ) : (
          <Sparkle className="size-6 text-zinc-400 dark:text-zinc-500 opacity-80" weight="light" />
        )}
        
        {open && (
           <motion.div 
             layoutId="active-ring"
             className="absolute -inset-1 rounded-full border border-zinc-900/20 dark:border-zinc-100/20 opacity-100 pointer-events-none"
             initial={{ opacity: 0, scale: 0.8 }}
             animate={{ opacity: 1, scale: 1 }}
             exit={{ opacity: 0, scale: 0.8 }}
           />
        )}
      </motion.button>

      {/* Center Stage Icon Panel (Fixed Overlay) */}
      <AnimatePresence>
        {open && (
          <>
            {/* Invisible Backdrop to catch clicks for safety, though useClickOutside handles close */}
             {/* 
                Original code had a backdrop:
                <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
                Since we use useClickOutside on the containerRef, we might miss clicks if the panel is portal-ed or fixed positioned far away.
                The panel below is fixed positioned in center screen. containerRef is on the wrapper div.
                If I click OUTSIDE the wrapper div (trigger) AND OUTSIDE the fixed panel, useClickOutside might be tricky if the fixed panel is not a child of wrapper in DOM.
                Wait, here the fixed panel IS a child of the wrapper div in the React tree.
                However, useClickOutside checks `ref.current.contains(event.target)`. 
                If the panel is `fixed`, it is still in the DOM tree under the `div ref={containerRef}` unless it's a Portal.
                Here it is NOT a portal, it's just `position: fixed` css. So `contains` should work fine.
                BUT, the original code had a backdrop div. That backdrop div would cover the screen.
                If I click the backdrop, `event.target` is the backdrop.
                Is the backdrop inside `containerRef`? Yes.
                So clicking the backdrop is clicking INSIDE the container. So `useClickOutside` won't trigger.
                So I should keep the backdrop click handler or rely on the backdrop being "inside".
                Actually, the original backdrop was: `<div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />`
                If I keep that, I don't strictly need useClickOutside for the modal part, but for the trigger part maybe?
                
                Actually, let's keep the backdrop logic as it was because it provides a visual shield (even if invisible) and explicit interaction.
                The `useClickOutside` on `containerRef` is useful if the user clicks *somewhere else* that isn't the backdrop (impossible if backdrop covers all).
                
                Wait, if I use `useClickOutside`, I don't need the backdrop for logic, but maybe for z-index layering block?
                The original code had:
                 document.addEventListener('mousedown', handleClickOutside);
                AND
                 <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />

                The backdrop ensures that clicks on the rest of the screen are captured.
                The `useClickOutside` handles clicks that might bypass the backdrop if it wasn't there?
                
                Let's stick to the cleanest approach:
                If we have a full screen fixed overlay (the backdrop), clicking it closes the modal.
                We don't strictly need `useClickOutside` if the backdrop covers everything outside the modal.
                However, `useClickOutside` is safer if the backdrop doesn't cover something (e.g. system bars? or if `fixed` behaves weirdly).
                
                I'll keep the backdrop for z-index and explicit "click here to close" behavior, 
                and I'll keep `useClickOutside` just in case, or maybe remove the backdrop `onClick` if `useClickOutside` is enough.
                Actually, `useClickOutside` checks if click is contained in `containerRef`.
                The backdrop is inside `containerRef`. So clicking backdrop = clicking inside.
                So `useClickOutside` will NOT fire when clicking backdrop.
                So we MUST have `onClick` on the backdrop.
             */}
            <div 
                className="fixed inset-0 z-[60]" 
                onClick={(e) => {
                  e.stopPropagation(); // Prevent bubbling if needed
                  setOpen(false);
                }}
            />

            {/* The Floating Palette */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: "spring", stiffness: 850, damping: 35, mass: 0.5 }}
              className="
                fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[70]
                w-[380px] max-h-[600px] 
                bg-white/90 dark:bg-zinc-900/90 backdrop-blur-2xl 
                rounded-[2.5rem] shadow-[0_40px_80px_-20px_rgba(0,0,0,0.2)] 
                border border-white/40 dark:border-white/10
                overflow-hidden
                flex flex-col
              "
              onClick={(e) => e.stopPropagation()} // Prevent clicks inside panel from closing via backdrop
            >
              <div className="p-6 h-full overflow-hidden flex flex-col">
                 <IconGridView 
                    value={value} 
                    onChange={(v) => { onChange(v); setOpen(false); }} 
                    onCancel={() => setOpen(false)} 
                 />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
