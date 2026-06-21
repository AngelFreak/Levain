import { motion, type Variants } from 'framer-motion';

type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info';
type BadgeSize = 'sm' | 'md' | 'lg';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: BadgeSize;
  icon?: React.ReactNode;
  pulse?: boolean;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-surface3 dark:bg-surfaceDark3 text-crust-700 dark:text-crumb-200',
  success: 'bg-success-100 dark:bg-success-900/30 text-success-700 dark:text-success-300',
  warning: 'bg-warning-100 dark:bg-warning-900/30 text-warning-700 dark:text-warning-300',
  error: 'bg-error-100 dark:bg-error-900/30 text-error-700 dark:text-error-300',
  info: 'bg-crumb-200 dark:bg-crust-700 text-crust-700 dark:text-crumb-200',
};

const sizeStyles: Record<BadgeSize, string> = {
  sm: 'px-2 py-0.5 text-label-sm gap-1',
  md: 'px-2.5 py-1 text-label-md gap-1.5',
  lg: 'px-3 py-1.5 text-label-lg gap-2',
};

const pulseVariants: Variants = {
  initial: { scale: 1 },
  animate: {
    scale: [1, 1.05, 1],
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
};

export function Badge({
  children,
  variant = 'default',
  size = 'md',
  icon,
  pulse = false,
  className = '',
}: BadgeProps) {
  const Component = pulse ? motion.span : 'span';
  const motionProps = pulse
    ? {
        variants: pulseVariants,
        initial: 'initial',
        animate: 'animate',
      }
    : {};

  return (
    <Component
      className={`
        inline-flex items-center font-medium rounded-full
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${className}
      `}
      {...motionProps}
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      {children}
    </Component>
  );
}

// Numeric badge for counts
interface CountBadgeProps {
  count: number;
  max?: number;
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
  className?: string;
}

export function CountBadge({
  count,
  max = 99,
  variant = 'default',
  size = 'sm',
  className = '',
}: CountBadgeProps) {
  const displayCount = count > max ? `${max}+` : count.toString();

  const sizeClasses = {
    sm: 'min-w-5 h-5 text-label-sm px-1.5',
    md: 'min-w-6 h-6 text-label-md px-2',
  };

  return (
    <span
      className={`
        inline-flex items-center justify-center font-medium rounded-full
        ${variantStyles[variant]}
        ${sizeClasses[size]}
        ${className}
      `}
    >
      {displayCount}
    </span>
  );
}

// Status dot badge
interface StatusDotProps {
  status: 'active' | 'inactive' | 'warning' | 'error';
  label?: string;
  pulse?: boolean;
  className?: string;
}

const statusColors: Record<StatusDotProps['status'], string> = {
  active: 'bg-success-500',
  inactive: 'bg-crumb-400 dark:bg-crust-600',
  warning: 'bg-warning-500',
  error: 'bg-error-500',
};

export function StatusDot({
  status,
  label,
  pulse = false,
  className = '',
}: StatusDotProps) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <motion.span
        className={`w-2.5 h-2.5 rounded-full ${statusColors[status]}`}
        animate={
          pulse
            ? {
                scale: [1, 1.3, 1],
                opacity: [1, 0.7, 1],
              }
            : undefined
        }
        transition={
          pulse
            ? {
                duration: 1.5,
                repeat: Infinity,
                ease: 'easeInOut',
              }
            : undefined
        }
      />
      {label && (
        <span className="text-body-sm text-crust-700 dark:text-crumb-300">
          {label}
        </span>
      )}
    </span>
  );
}
