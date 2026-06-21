import { forwardRef, type HTMLAttributes } from 'react';
import { motion } from 'framer-motion';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'filled' | 'elevated' | 'outlined' | 'glass';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  pressable?: boolean;
  onPress?: () => void;
}

// MD3 surface-based variants - with visible contrast
const variantStyles = {
  // Default - uses surface-1 with visible border
  default: 'bg-surface1 dark:bg-surfaceDark1 border border-crumb-400/60 dark:border-crust-600/60',

  // Filled - uses surface-1 with visible border
  filled: 'bg-surface1 dark:bg-surfaceDark1 border border-crumb-400/60 dark:border-crust-600/60',

  // Elevated - uses surface-2 with shadow for more prominence
  elevated: 'bg-surface2 dark:bg-surfaceDark2 shadow-md shadow-crust-900/10 dark:shadow-black/30',

  // Outlined - transparent with strong border
  outlined: 'bg-transparent border-2 border-crumb-400 dark:border-crust-500',

  // Glass - glassmorphism effect
  glass: 'bg-white/70 dark:bg-charcoal/70 backdrop-blur-lg border border-crumb-300/50 dark:border-crust-600/50 shadow-lg shadow-crust-900/5',
};

const paddingStyles = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
};

export const Card = forwardRef<HTMLDivElement, CardProps>(
  (
    {
      variant = 'default',
      padding = 'md',
      pressable = false,
      onPress,
      className = '',
      children,
      ...props
    },
    ref
  ) => {
    const baseStyles = `
      rounded-2xl
      ${variantStyles[variant]}
      ${paddingStyles[padding]}
      ${pressable ? 'cursor-pointer active:scale-[0.98] transition-transform' : ''}
      ${className}
    `;

    if (pressable) {
      return (
        <motion.div
          ref={ref}
          className={baseStyles}
          onClick={onPress}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && onPress?.()}
          whileTap={{ scale: 0.98 }}
          transition={{ duration: 0.1 }}
        >
          {children}
        </motion.div>
      );
    }

    return (
      <div ref={ref} className={baseStyles} {...props}>
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';

// Card Header component
interface CardHeaderProps extends HTMLAttributes<HTMLDivElement> {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export const CardHeader = forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ title, subtitle, action, className = '', ...props }, ref) => (
    <div
      ref={ref}
      className={`flex items-start justify-between gap-4 ${className}`}
      {...props}
    >
      <div>
        <h3 className="text-lg font-display font-semibold text-crust-800 dark:text-crumb-100">
          {title}
        </h3>
        {subtitle && (
          <p className="text-sm text-crust-600 dark:text-crumb-400 mt-0.5">
            {subtitle}
          </p>
        )}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  )
);

CardHeader.displayName = 'CardHeader';

// Card Content component
export const CardContent = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(({ className = '', children, ...props }, ref) => (
  <div ref={ref} className={`mt-3 ${className}`} {...props}>
    {children}
  </div>
));

CardContent.displayName = 'CardContent';

// Card Footer component
export const CardFooter = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(({ className = '', children, ...props }, ref) => (
  <div
    ref={ref}
    className={`mt-4 pt-4 border-t border-crumb-200 dark:border-crust-800 ${className}`}
    {...props}
  >
    {children}
  </div>
));

CardFooter.displayName = 'CardFooter';
