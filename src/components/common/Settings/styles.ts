// Shared styles for Settings components

/**
 * SVG arrow background for select dropdowns
 */
export const SELECT_ARROW_SVG = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='7' height='12' viewBox='0 0 7 12'%3E%3Cpolyline points='0.5,3.5 3.5,0.5 6.5,3.5' fill='none' stroke='%23333' stroke-width='1.2' stroke-linecap='round' stroke-linejoin='round'/%3E%3Cpolyline points='0.5,8.5 3.5,11.5 6.5,8.5' fill='none' stroke='%23333' stroke-width='1.2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`;

/**
 * Common select element style
 */
export const selectStyle: React.CSSProperties = {
  backgroundImage: SELECT_ARROW_SVG,
};

/**
 * Common select className
 */
export const selectClassName = 
  "px-2 py-1 pr-6 text-xs bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-400 min-w-[100px] cursor-pointer appearance-none bg-[length:7px_12px] bg-[right_5px_center] bg-no-repeat";

/**
 * Common button className for settings
 */
export const settingsButtonClassName = 
  "px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded-md transition-colors";
