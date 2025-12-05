// Shared styles for Progress components

export const formInputClassName =
  "w-full px-0 py-1 text-sm bg-transparent border-b border-zinc-200 dark:border-zinc-700 outline-none focus:border-zinc-400 placeholder:text-zinc-300";

export const formLabelClassName = "block text-xs text-zinc-400 mb-2";

export const toggleButtonClassName = (active: boolean) =>
  `px-3 py-1.5 text-xs rounded transition-colors ${
    active
      ? 'bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-800'
      : 'text-zinc-400 hover:text-zinc-600'
  }`;

export const submitButtonClassName =
  "w-full py-2 text-sm text-zinc-600 border border-zinc-200 rounded hover:bg-zinc-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors";
