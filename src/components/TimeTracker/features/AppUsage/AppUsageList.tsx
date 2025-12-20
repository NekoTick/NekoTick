import { motion } from 'framer-motion';
import { AppUsage } from '../../types';
import { formatDuration, getProgressWidth } from '../../utils';

interface AppUsageListProps {
  appUsages: AppUsage[];
  maxDuration: number;
  onSelect: (app: AppUsage) => void;
}

export function AppUsageList({ appUsages, maxDuration, onSelect }: AppUsageListProps) {
  return (
    <div className="max-w-xl mx-auto space-y-4">
      {appUsages.length === 0 ? (
        <div className="text-center py-12 text-zinc-400">
          No usage records yet
        </div>
      ) : (
        appUsages.map((app, index) => (
          <motion.div 
            key={index} 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.03 }}
            onClick={() => onSelect(app)}
            className="space-y-2 cursor-pointer group"
          >
            <div className="flex items-center gap-3 p-2 -m-2 rounded-xl transition-colors group-hover:bg-zinc-50">
              {/* App Icon Placeholder */}
              <div className="size-10 rounded-xl bg-zinc-100 flex items-center justify-center text-sm font-medium text-zinc-500 group-hover:bg-zinc-200 transition-colors">
                {app.name.charAt(0).toUpperCase()}
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-zinc-700 truncate group-hover:text-zinc-900">
                    {app.name}
                  </span>
                  <span className="text-sm text-zinc-400 ml-2 shrink-0">
                    {formatDuration(app.duration)}
                  </span>
                </div>
                
                {/* Progress Bar */}
                <div className="mt-2 h-2 bg-zinc-100 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${getProgressWidth(app.duration, maxDuration)}%` }}
                    transition={{ duration: 0.4, delay: index * 0.05 }}
                    className="h-full bg-zinc-300 rounded-full"
                  />
                </div>
              </div>
            </div>
          </motion.div>
        ))
      )}
    </div>
  );
}
