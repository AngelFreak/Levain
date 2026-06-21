import { motion } from 'framer-motion';
import { springs } from '../../lib/motion';

type ProgressVariant = 'default' | 'success' | 'warning' | 'error';

interface LinearProgressProps {
  value?: number; // 0-100, undefined for indeterminate
  variant?: ProgressVariant;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  label?: string;
  className?: string;
}

const variantColors: Record<ProgressVariant, { track: string; indicator: string }> = {
  default: {
    track: 'bg-surface3 dark:bg-surfaceDark3',
    indicator: 'bg-crust-600 dark:bg-honey-500',
  },
  success: {
    track: 'bg-success-100 dark:bg-success-900/30',
    indicator: 'bg-success-500',
  },
  warning: {
    track: 'bg-warning-100 dark:bg-warning-900/30',
    indicator: 'bg-warning-500',
  },
  error: {
    track: 'bg-error-100 dark:bg-error-900/30',
    indicator: 'bg-error-500',
  },
};

const sizeStyles = {
  sm: 'h-1',
  md: 'h-2',
  lg: 'h-3',
};

export function LinearProgress({
  value,
  variant = 'default',
  size = 'md',
  showLabel = false,
  label,
  className = '',
}: LinearProgressProps) {
  const colors = variantColors[variant];
  const isIndeterminate = value === undefined;
  const clampedValue = value !== undefined ? Math.min(100, Math.max(0, value)) : 0;

  return (
    <div className={`w-full ${className}`}>
      {(showLabel || label) && (
        <div className="flex justify-between items-center mb-1.5">
          {label && (
            <span className="text-body-sm text-crust-700 dark:text-crumb-300">
              {label}
            </span>
          )}
          {showLabel && value !== undefined && (
            <span className="text-label-sm font-medium text-crust-600 dark:text-crumb-400">
              {Math.round(clampedValue)}%
            </span>
          )}
        </div>
      )}

      <div
        className={`
          w-full rounded-full overflow-hidden
          ${colors.track}
          ${sizeStyles[size]}
        `}
        role="progressbar"
        aria-valuenow={isIndeterminate ? undefined : clampedValue}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        {isIndeterminate ? (
          <motion.div
            className={`h-full w-1/3 rounded-full ${colors.indicator}`}
            animate={{
              x: ['-100%', '400%'],
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        ) : (
          <motion.div
            className={`h-full rounded-full ${colors.indicator}`}
            initial={{ width: 0 }}
            animate={{ width: `${clampedValue}%` }}
            transition={springs.smooth}
          />
        )}
      </div>
    </div>
  );
}

// Circular progress indicator
interface CircularProgressProps {
  value?: number; // 0-100, undefined for indeterminate
  variant?: ProgressVariant;
  size?: number; // Size in pixels
  strokeWidth?: number;
  showLabel?: boolean;
  className?: string;
}

export function CircularProgress({
  value,
  variant = 'default',
  size = 48,
  strokeWidth = 4,
  showLabel = false,
  className = '',
}: CircularProgressProps) {
  const colors = variantColors[variant];
  const isIndeterminate = value === undefined;
  const clampedValue = value !== undefined ? Math.min(100, Math.max(0, value)) : 0;

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (clampedValue / 100) * circumference;

  // Color classes to actual colors for SVG
  const indicatorColorMap: Record<ProgressVariant, string> = {
    default: 'currentColor',
    success: '#4a7c59',
    warning: '#d4a020',
    error: '#a94438',
  };

  return (
    <div
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuenow={isIndeterminate ? undefined : clampedValue}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      {/* Track */}
      <svg
        className="absolute"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
      >
        <circle
          className={`${colors.track.replace('bg-', 'fill-').replace('dark:', 'dark:fill-')}`}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          opacity={0.3}
        />
      </svg>

      {/* Indicator */}
      <motion.svg
        className={`absolute ${variant === 'default' ? 'text-crust-600 dark:text-honey-500' : ''}`}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        initial={{ rotate: -90 }}
        animate={isIndeterminate ? { rotate: 270 } : { rotate: -90 }}
        transition={
          isIndeterminate
            ? { duration: 1.5, repeat: Infinity, ease: 'linear' }
            : undefined
        }
      >
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={indicatorColorMap[variant]}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{
            strokeDashoffset: isIndeterminate
              ? [circumference, circumference * 0.25, circumference]
              : strokeDashoffset,
          }}
          transition={
            isIndeterminate
              ? { duration: 1.5, repeat: Infinity, ease: 'easeInOut' }
              : springs.smooth
          }
        />
      </motion.svg>

      {/* Label */}
      {showLabel && value !== undefined && (
        <span className="text-label-sm font-medium text-crust-700 dark:text-crumb-200">
          {Math.round(clampedValue)}%
        </span>
      )}
    </div>
  );
}

// Step progress indicator for multi-step processes
interface StepProgressProps {
  steps: string[];
  currentStep: number;
  variant?: ProgressVariant;
  className?: string;
}

export function StepProgress({
  steps,
  currentStep,
  variant = 'default',
  className = '',
}: StepProgressProps) {
  const colors = variantColors[variant];

  return (
    <div className={`w-full ${className}`}>
      <div className="flex items-center justify-between">
        {steps.map((step, index) => {
          const isCompleted = index < currentStep;
          const isCurrent = index === currentStep;
          const isLast = index === steps.length - 1;

          return (
            <div key={step} className="flex items-center flex-1">
              {/* Step circle */}
              <div className="flex flex-col items-center">
                <motion.div
                  className={`
                    w-8 h-8 rounded-full flex items-center justify-center
                    text-label-sm font-medium
                    ${isCompleted || isCurrent
                      ? `${colors.indicator} text-white`
                      : 'bg-surface3 dark:bg-surfaceDark3 text-crust-500 dark:text-crumb-500'
                    }
                  `}
                  initial={false}
                  animate={{
                    scale: isCurrent ? 1.1 : 1,
                  }}
                  transition={springs.snappy}
                >
                  {isCompleted ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    index + 1
                  )}
                </motion.div>
                <span
                  className={`
                    mt-2 text-label-sm text-center
                    ${isCurrent
                      ? 'text-crust-800 dark:text-crumb-100 font-medium'
                      : 'text-crust-500 dark:text-crumb-500'
                    }
                  `}
                >
                  {step}
                </span>
              </div>

              {/* Connector line */}
              {!isLast && (
                <div
                  className={`
                    flex-1 h-0.5 mx-2 mt-[-1.5rem]
                    ${isCompleted ? colors.indicator : 'bg-surface3 dark:bg-surfaceDark3'}
                  `}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
