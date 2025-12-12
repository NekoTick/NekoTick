// Shared animation configurations for Framer Motion
// Following the "Liquid Light" design system

export const SPRING_SNAPPY = {
  type: 'spring',
  stiffness: 850,
  damping: 35,
  mass: 0.5,
} as const;

export const SPRING_SMOOTH = {
  type: 'spring',
  stiffness: 400,
  damping: 30,
} as const;

export const SPRING_GENTLE = {
  type: 'spring',
  stiffness: 100,
  damping: 20,
} as const;

export const FADE_IN_OUT = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
} as const;

export const SCALE_IN_OUT = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.95 },
} as const;

export const SLIDE_UP = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 10 },
} as const;

export const SLIDE_FROM_BOTTOM = {
  initial: { opacity: 0, y: '100%' },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: '100%' },
} as const;

// Stagger animation variants for lists
export const STAGGER_CONTAINER = {
  visible: {
    transition: { staggerChildren: 0.03, delayChildren: 0.02 },
  },
  hidden: {},
} as const;

export const STAGGER_ITEM = {
  hidden: { opacity: 0, x: 10 },
  visible: {
    opacity: 1,
    x: 0,
    transition: SPRING_SNAPPY,
  },
} as const;

export const STAGGER_DIVIDER = {
  hidden: { scaleY: 0, opacity: 0 },
  visible: {
    scaleY: 1,
    opacity: 1,
    transition: SPRING_SNAPPY,
  },
} as const;
