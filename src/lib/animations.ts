import { themeMotionTokens } from '@/styles/themeTokens';

export const SIDEBAR_SLIDE_VARIANTS = {
  hidden: { x: themeMotionTokens.sidebarSlideHiddenX },
  visible: { x: themeMotionTokens.sidebarSlideVisibleX },
} as const;

export const RIGHT_SIDEBAR_SLIDE_VARIANTS = {
  hidden: { x: themeMotionTokens.sidebarSlideRightHiddenX },
  visible: { x: themeMotionTokens.sidebarSlideVisibleX },
} as const;

export const FLOATING_CHAT_WINDOW_VARIANTS = {
  hidden: {
    x: themeMotionTokens.sidebarSlideRightHiddenX,
    opacity: themeMotionTokens.opacityHidden,
  },
  visible: {
    x: themeMotionTokens.sidebarSlideVisibleX,
    opacity: themeMotionTokens.opacityVisible,
  },
} as const;

export const SIDEBAR_SLIDE_TRANSITION = {
  type: 'spring',
  stiffness: themeMotionTokens.sidebarSlideSpringStiffness,
  damping: themeMotionTokens.sidebarSlideSpringDamping,
  mass: themeMotionTokens.sidebarSlideSpringMass,
} as const;

export const SPRING_PREMIUM = { type: "spring", stiffness: 700, damping: 37, mass: 0.5 } as const;

export const SPRING_FLASH = { type: "spring", stiffness: 900, damping: 50, mass: 0.1 } as const;

export const VARIANTS_BREATHE = {
  hidden: { opacity: themeMotionTokens.opacityHidden, scale: themeMotionTokens.scaleBreatheHidden },
  visible: { opacity: themeMotionTokens.opacityVisible, scale: themeMotionTokens.scaleVisible },
} as const;

export const SPRING_SNAPPY = { type: "spring", stiffness: 500, damping: 30 } as const;

export const SLIDE_FROM_BOTTOM = {
  hidden: { opacity: themeMotionTokens.opacityHidden, y: themeMotionTokens.slideY },
  visible: { opacity: themeMotionTokens.opacityVisible, y: themeMotionTokens.toastVisibleY },
} as const;

export const SPRING_GENTLE = { type: "spring", stiffness: 100, damping: 20 } as const;
