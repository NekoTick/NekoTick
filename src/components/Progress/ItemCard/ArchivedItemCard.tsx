import { motion } from 'framer-motion';
import { ArrowCounterClockwise } from '@phosphor-icons/react';
import { getIconByName } from '../IconPicker';
import { ItemCardProps } from './types';

export function ArchivedItemCard({ item, onClick, onAutoArchive, previewIcon, previewTitle }: ItemCardProps) {
  const displayIcon = previewIcon !== undefined ? previewIcon : item.icon;
  const displayTitle = previewTitle !== undefined ? previewTitle : item.title;

  const startDate = new Date(item.createdAt);
  const endDate = item.lastUpdateDate ? new Date(item.lastUpdateDate) : new Date();
  const durationMs = endDate.getTime() - startDate.getTime();
  const durationDays = Math.max(1, Math.ceil(durationMs / (1000 * 60 * 60 * 24)));
  
  const formatDate = (date: Date) => date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric',
    year: 'numeric'
  });

  return (
    <div className="relative group mb-4">
      <motion.div
        layout
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        onClick={onClick}
        className="
          relative overflow-hidden rounded-[2rem]
          bg-white dark:bg-zinc-900/80
          shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-none
          backdrop-blur-xl
          h-28 select-none cursor-pointer
          grid grid-cols-[1.5fr_2.5fr_auto] gap-8 items-center pl-6 pr-8
          transition-all duration-300
          hover:shadow-[0_20px_40px_rgb(0,0,0,0.08)] 
          hover:bg-white/80 dark:hover:bg-zinc-900
          group-hover:-translate-y-1
        "
      >
         {/* Zone 1: Identity & Result - The Artistic Watermark Layout */}
         <div className="relative flex-1 h-full min-w-0 pr-6 border-r border-zinc-100/50 dark:border-zinc-800/50 overflow-hidden group/zone1 flex items-center">
            {/* Flex Container for Icon & Text - Natural Flow */}
            <div className="flex items-center gap-4 w-full">
                {/* Icon - Natural Flex Item */}
                {(() => {
                  const Icon = displayIcon ? getIconByName(displayIcon) : null;
                  return Icon ? (
                    <div className="flex-shrink-0 transition-transform duration-700 ease-out group-hover:scale-110 group-hover:-rotate-12 group-hover:translate-x-1">
                      <Icon 
                          className="size-16 text-zinc-900 dark:text-zinc-100 opacity-[0.06] dark:opacity-[0.08] mix-blend-multiply dark:mix-blend-overlay transition-colors duration-300" 
                          weight="duotone" 
                      />
                    </div>
                  ) : (
                    <div className="flex-shrink-0 w-16 h-16" /> // Placeholder for alignment
                  );
                })()}
                
                {/* Text Content - Pushed by Icon */}
                <div className="flex flex-col justify-center min-w-0 gap-1 z-10">
                  <span className="text-xl font-medium text-zinc-900 dark:text-zinc-100 truncate tracking-wide group-hover:text-black dark:group-hover:text-white transition-colors">
                    {displayTitle}
                  </span>
                  <div className="flex items-center gap-3 text-[10px] font-bold tracking-[0.2em] uppercase text-zinc-400 dark:text-zinc-600 group-hover:text-zinc-500 dark:group-hover:text-zinc-500 transition-colors">
                    <span>Target</span>
                    <span className="text-zinc-600 dark:text-zinc-400">
                      {item.type === 'progress' ? `${item.current}/${item.total}` : item.current}
                    </span>
                  </div>
                </div>
            </div>
         </div>

         {/* Zone 2: The Timeline Journey */}
         <div className="flex flex-col justify-center gap-3 w-full max-w-md justify-self-end">
            {/* Labels */}
            <div className="flex justify-between text-[9px] font-bold tracking-[0.2em] text-zinc-300 dark:text-zinc-700 uppercase px-1 opacity-60">
               <span>Started</span>
               <span>Ended</span>
            </div>

            {/* Visual Timeline */}
            <div className="flex items-center gap-6 text-zinc-400 dark:text-zinc-500">
               <span className="text-xs font-medium tabular-nums tracking-wider opacity-80">
                  {formatDate(startDate)}
               </span>
               
               {/* The Path */}
               <div className="flex-1 h-[2px] bg-zinc-100 dark:bg-zinc-800 relative rounded-full overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-r from-zinc-200 via-zinc-400 to-zinc-200 dark:from-zinc-800 dark:via-zinc-600 dark:to-zinc-800 opacity-50" />
               </div>

               <span className="text-xs font-medium tabular-nums tracking-wider text-zinc-900 dark:text-zinc-100">
                  {formatDate(endDate)}
               </span>
            </div>
            
            <div className="text-center">
               <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-zinc-300 dark:text-zinc-700">
                  {durationDays} Days Journey
               </span>
            </div>
         </div>

         {/* Zone 3: The Resurrection (Restart Button) */}
         <div className="relative z-20 flex items-center justify-center">
            <button
              onClick={(e) => {
                e.stopPropagation(); // Prevent card click
                onAutoArchive?.(item.id);
              }}
              className="
                p-3 rounded-full
                text-zinc-300 dark:text-zinc-600
                hover:bg-zinc-100 dark:hover:bg-zinc-800
                hover:text-zinc-900 dark:hover:text-zinc-100
                hover:shadow-sm
                transition-all duration-500 ease-out
                opacity-0 group-hover:opacity-100 translate-x-4 group-hover:translate-x-0
              "
              title="Restore to active list"
            >
              <ArrowCounterClockwise className="size-5" weight="bold" />
            </button>
         </div>
      </motion.div>
    </div>
  );
}
