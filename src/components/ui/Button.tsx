import { forwardRef, type ButtonHTMLAttributes, useState, useCallback } from 'react';
import { motion, type HTMLMotionProps, AnimatePresence } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { useSettingsStore } from '../../stores/settingsStore';

// MD3 button variants
type ButtonVariant =
  | 'filled'        // MD3 filled (primary)
  | 'filledTonal'   // MD3 filled tonal (secondary tonal)
  | 'elevated'      // MD3 elevated
  | 'outlined'      // MD3 outlined
  | 'text'          // MD3 text (ghost)
  | 'danger'        // Semantic danger
  // Backward compatibility aliases
  | 'primary'       // → filled
  | 'secondary'     // → filledTonal
  | 'ghost';        // → text

type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onAnimationStart' | 'onDragStart' | 'onDragEnd' | 'onDrag'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
  haptic?: boolean;
  ripple?: boolean;
}

// Map legacy variants to MD3 variants
const variantMapping: Record<string, string> = {
  primary: 'filled',
  secondary: 'filledTonal',
  ghost: 'text',
};

const variantStyles: Record<string, string> = {
  // MD3 Filled - High emphasis (primary action)
  filled:
    'bg-crust-600 text-white hover:bg-crust-700 active:bg-crust-800 shadow-md dark:bg-honey-600 dark:hover:bg-honey-700 dark:active:bg-honey-800',

  // MD3 Filled Tonal - Medium emphasis with visible tonal surface
  filledTonal:
    'bg-crumb-300 text-crust-800 hover:bg-crumb-400 active:bg-crumb-500 border border-crumb-400/50 dark:bg-surfaceDark3 dark:text-crumb-100 dark:hover:bg-surfaceDark4 dark:active:bg-surfaceDark5 dark:border-crust-600/50',

  // MD3 Elevated - Surface with shadow
  elevated:
    'bg-surface2 text-crust-800 hover:bg-surface3 active:bg-surface4 shadow-md hover:shadow-lg border border-crumb-300/50 dark:bg-surfaceDark1 dark:text-crumb-100 dark:hover:bg-surfaceDark2 dark:active:bg-surfaceDark3 dark:border-crust-600/50',

  // MD3 Outlined - Border with transparent background
  outlined:
    'bg-transparent text-crust-700 border-2 border-crust-500 hover:bg-crumb-100 active:bg-crumb-200 dark:text-crumb-200 dark:border-crumb-500 dark:hover:bg-surfaceDark1 dark:active:bg-surfaceDark2',

  // MD3 Text - No container, text only
  text:
    'bg-transparent text-crust-700 hover:bg-crumb-200 active:bg-crumb-300 dark:text-crumb-200 dark:hover:bg-surfaceDark1 dark:active:bg-surfaceDark2',

  // Danger - Semantic error action
  danger:
    'bg-error-500 text-white hover:bg-error-600 active:bg-error-700 shadow-md',

  // Backward compatibility
  primary:
    'bg-crust-600 text-white hover:bg-crust-700 active:bg-crust-800 shadow-md dark:bg-honey-600 dark:hover:bg-honey-700 dark:active:bg-honey-800',
  secondary:
    'bg-crumb-300 text-crust-800 hover:bg-crumb-400 active:bg-crumb-500 border border-crumb-400/50 dark:bg-surfaceDark3 dark:text-crumb-100 dark:hover:bg-surfaceDark4 dark:active:bg-surfaceDark5 dark:border-crust-600/50',
  ghost:
    'bg-transparent text-crust-700 hover:bg-crumb-200 active:bg-crumb-300 dark:text-crumb-200 dark:hover:bg-surfaceDark1 dark:active:bg-surfaceDark2',
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm min-h-[36px]',
  md: 'px-4 py-2.5 text-base min-h-[44px]',
  lg: 'px-6 py-3 text-lg min-h-[52px]',
};

// Ripple effect component
interface RippleProps {
  x: number;
  y: number;
  size: number;
}

function Ripple({ x, y, size }: RippleProps) {
  return (
    <motion.span
      className="absolute rounded-full bg-current opacity-20 pointer-events-none"
      style={{
        left: x - size / 2,
        top: y - size / 2,
        width: size,
        height: size,
      }}
      initial={{ scale: 0, opacity: 0.3 }}
      animate={{ scale: 2, opacity: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
    />
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      fullWidth = false,
      haptic = true,
      ripple = true,
      className = '',
      disabled,
      onClick,
      children,
      ...props
    },
    ref
  ) => {
    const hapticEnabled = useSettingsStore((s) => s.settings.hapticFeedbackEnabled);
    const [ripples, setRipples] = useState<Array<{ id: number; x: number; y: number; size: number }>>([]);

    const handleRipple = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
      if (!ripple || disabled || isLoading) return;

      const button = e.currentTarget;
      const rect = button.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const newRipple = { id: Date.now(), x, y, size };
      setRipples((prev) => [...prev, newRipple]);

      setTimeout(() => {
        setRipples((prev) => prev.filter((r) => r.id !== newRipple.id));
      }, 600);
    }, [ripple, disabled, isLoading]);

    const handleClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
      handleRipple(e);

      if (haptic && hapticEnabled && !disabled && !isLoading) {
        try {
          await Haptics.impact({ style: ImpactStyle.Light });
        } catch {
          // Haptics not available (web)
        }
      }
      onClick?.(e);
    };

    const motionProps: HTMLMotionProps<'button'> = {
      whileTap: disabled || isLoading ? undefined : { scale: 0.97 },
      transition: { type: 'spring', stiffness: 400, damping: 25 },
    };

    // Resolve variant (handle legacy names)
    const resolvedVariant = variantMapping[variant] || variant;

    return (
      <motion.button
        ref={ref}
        className={`
          relative overflow-hidden
          inline-flex items-center justify-center gap-2
          font-medium rounded-xl
          touch-target
          transition-colors duration-150
          disabled:opacity-50 disabled:cursor-not-allowed
          ${variantStyles[resolvedVariant] || variantStyles[variant]}
          ${sizeStyles[size]}
          ${fullWidth ? 'w-full' : ''}
          ${className}
        `}
        disabled={disabled || isLoading}
        onClick={handleClick}
        {...motionProps}
        {...props}
      >
        <AnimatePresence>
          {ripples.map((r) => (
            <Ripple key={r.id} x={r.x} y={r.y} size={r.size} />
          ))}
        </AnimatePresence>
        {isLoading ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <>
            {leftIcon && <span className="flex-shrink-0">{leftIcon}</span>}
            {children}
            {rightIcon && <span className="flex-shrink-0">{rightIcon}</span>}
          </>
        )}
      </motion.button>
    );
  }
);

Button.displayName = 'Button';
