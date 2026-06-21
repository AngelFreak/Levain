/**
 * MD3 Motion System
 * Shared spring presets and animation variants for consistent motion across the app.
 */

import type { Transition, Variants } from 'framer-motion';

// Spring transition presets based on MD3 expressive motion
export const springs = {
  // Snappy - Quick, responsive interactions (buttons, toggles)
  snappy: {
    type: 'spring',
    stiffness: 400,
    damping: 25,
    mass: 0.5,
  } as const,

  // Bouncy - Playful, attention-grabbing (FABs, cards appearing)
  bouncy: {
    type: 'spring',
    stiffness: 300,
    damping: 15,
    mass: 0.8,
  } as const,

  // Smooth - Elegant, polished transitions (page transitions, modals)
  smooth: {
    type: 'spring',
    stiffness: 200,
    damping: 25,
    mass: 1,
  } as const,

  // Gentle - Subtle, calm animations (indicators, progress)
  gentle: {
    type: 'spring',
    stiffness: 150,
    damping: 20,
    mass: 1.2,
  } as const,
} satisfies Record<string, Transition>;

// Duration-based transitions for non-spring animations
export const durations = {
  fast: 0.15,
  normal: 0.25,
  slow: 0.4,
  verySlow: 0.6,
} as const;

// Easing curves matching MD3 standard easing
export const easings = {
  standard: [0.2, 0, 0, 1],        // Standard curve
  standardDecelerate: [0, 0, 0, 1], // Decelerate
  standardAccelerate: [0.3, 0, 1, 1], // Accelerate
  emphasized: [0.2, 0, 0, 1],      // Emphasized (same as standard)
  emphasizedDecelerate: [0.05, 0.7, 0.1, 1], // Emphasized decelerate
  emphasizedAccelerate: [0.3, 0, 0.8, 0.15], // Emphasized accelerate
} as const;

// Reusable animation variants
export const variants = {
  // Fade in from below (for list items, cards)
  fadeInUp: {
    hidden: {
      opacity: 0,
      y: 20,
    },
    visible: {
      opacity: 1,
      y: 0,
      transition: springs.smooth,
    },
    exit: {
      opacity: 0,
      y: -10,
      transition: { duration: durations.fast },
    },
  } satisfies Variants,

  // Scale in (for modals, popovers)
  scaleIn: {
    hidden: {
      opacity: 0,
      scale: 0.9,
    },
    visible: {
      opacity: 1,
      scale: 1,
      transition: springs.bouncy,
    },
    exit: {
      opacity: 0,
      scale: 0.95,
      transition: { duration: durations.fast },
    },
  } satisfies Variants,

  // Slide in from right (for sheets, drawers)
  slideInRight: {
    hidden: {
      x: '100%',
    },
    visible: {
      x: 0,
      transition: springs.smooth,
    },
    exit: {
      x: '100%',
      transition: springs.smooth,
    },
  } satisfies Variants,

  // Slide in from bottom (for bottom sheets)
  slideInBottom: {
    hidden: {
      y: '100%',
    },
    visible: {
      y: 0,
      transition: springs.smooth,
    },
    exit: {
      y: '100%',
      transition: springs.smooth,
    },
  } satisfies Variants,

  // Slide in from left (for navigation)
  slideInLeft: {
    hidden: {
      x: '-100%',
    },
    visible: {
      x: 0,
      transition: springs.smooth,
    },
    exit: {
      x: '-100%',
      transition: springs.smooth,
    },
  } satisfies Variants,

  // Stagger children (for lists)
  staggerContainer: {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05,
        delayChildren: 0.1,
      },
    },
  } satisfies Variants,

  // Stagger item (pair with staggerContainer)
  staggerItem: {
    hidden: {
      opacity: 0,
      y: 12,
    },
    visible: {
      opacity: 1,
      y: 0,
      transition: springs.snappy,
    },
  } satisfies Variants,

  // Pulse (for indicators, badges)
  pulse: {
    initial: { scale: 1 },
    animate: {
      scale: [1, 1.05, 1],
      transition: {
        duration: 2,
        repeat: Infinity,
        ease: 'easeInOut',
      },
    },
  } satisfies Variants,

  // Tab indicator pill
  tabIndicator: {
    initial: {},
    animate: {
      transition: springs.snappy,
    },
  } satisfies Variants,
};

// Helper to create staggered list animations
export function createStaggerVariants(staggerDelay = 0.05, itemDistance = 12) {
  return {
    container: {
      hidden: { opacity: 0 },
      visible: {
        opacity: 1,
        transition: {
          staggerChildren: staggerDelay,
          delayChildren: 0.1,
        },
      },
    },
    item: {
      hidden: {
        opacity: 0,
        y: itemDistance,
      },
      visible: {
        opacity: 1,
        y: 0,
        transition: springs.snappy,
      },
    },
  };
}

// Tap animation preset for buttons
export const tapAnimation = {
  whileTap: { scale: 0.97 },
  transition: springs.snappy,
};

// Hover animation preset
export const hoverAnimation = {
  whileHover: { scale: 1.02 },
  transition: springs.snappy,
};
