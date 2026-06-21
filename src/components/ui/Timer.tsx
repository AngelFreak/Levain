import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Play, Pause, RotateCcw } from 'lucide-react';
import { Button } from './Button';
import { useTimerStore, getCurrentRemaining, formatTime } from '../../stores/timerStore';

interface TimerProps {
  id: string;
  name: string;
  durationSeconds: number;
  onComplete?: () => void;
  showControls?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function Timer({
  id,
  name,
  durationSeconds,
  onComplete,
  showControls = true,
  size = 'md',
}: TimerProps) {
  const {
    timers,
    createTimer,
    startTimer,
    pauseTimer,
    resumeTimer,
    resetTimer,
  } = useTimerStore();

  const timer = timers[id];
  const [displayTime, setDisplayTime] = useState(durationSeconds);

  // Initialize timer if it doesn't exist
  useEffect(() => {
    if (!timer) {
      createTimer(id, name, durationSeconds);
    }
  }, [id, name, durationSeconds, timer, createTimer]);

  // Update display time based on timer state
  useEffect(() => {
    if (!timer) return;

    if (timer.status === 'running') {
      const interval = setInterval(() => {
        const remaining = getCurrentRemaining(timer);
        setDisplayTime(remaining);

        if (remaining <= 0) {
          onComplete?.();
          clearInterval(interval);
        }
      }, 100);

      return () => clearInterval(interval);
    } else {
      setDisplayTime(timer.remaining);
    }
  }, [timer, onComplete]);

  const handlePlayPause = useCallback(() => {
    if (!timer) return;

    if (timer.status === 'running') {
      pauseTimer(id);
    } else if (timer.status === 'paused') {
      resumeTimer(id);
    } else {
      startTimer(id);
    }
  }, [timer, id, pauseTimer, resumeTimer, startTimer]);

  const handleReset = useCallback(() => {
    resetTimer(id);
    setDisplayTime(durationSeconds);
  }, [id, resetTimer, durationSeconds]);

  const progress = timer
    ? ((timer.duration - displayTime) / timer.duration) * 100
    : 0;

  const sizeStyles = {
    sm: {
      container: 'w-24 h-24',
      text: 'text-lg',
      stroke: 4,
    },
    md: {
      container: 'w-36 h-36',
      text: 'text-2xl',
      stroke: 6,
    },
    lg: {
      container: 'w-48 h-48',
      text: 'text-4xl',
      stroke: 8,
    },
  };

  const styles = sizeStyles[size];
  const isRunning = timer?.status === 'running';
  const isComplete = timer?.status === 'completed';

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Circular progress */}
      <div className={`relative ${styles.container}`}>
        <svg className="w-full h-full transform -rotate-90">
          {/* Background circle */}
          <circle
            cx="50%"
            cy="50%"
            r="45%"
            fill="none"
            stroke="currentColor"
            strokeWidth={styles.stroke}
            className="text-crumb-200 dark:text-crust-800"
          />
          {/* Progress circle */}
          <motion.circle
            cx="50%"
            cy="50%"
            r="45%"
            fill="none"
            stroke="currentColor"
            strokeWidth={styles.stroke}
            strokeLinecap="round"
            className={isComplete ? 'text-success-500' : 'text-crust-600'}
            strokeDasharray={`${2 * Math.PI * 45} ${2 * Math.PI * 45}`}
            strokeDashoffset={`${2 * Math.PI * 45 * (1 - progress / 100)}`}
            initial={false}
            animate={{
              strokeDashoffset: 2 * Math.PI * 45 * (1 - progress / 100),
            }}
            transition={{ duration: 0.1 }}
          />
        </svg>

        {/* Time display */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={`font-mono font-semibold ${styles.text} ${
              isComplete
                ? 'text-success-600 dark:text-success-400'
                : 'text-crust-800 dark:text-crumb-100'
            }`}
          >
            {formatTime(displayTime)}
          </span>
          <span className="text-xs text-crust-500 dark:text-crumb-500 mt-1">
            {name}
          </span>
        </div>
      </div>

      {/* Controls */}
      {showControls && (
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleReset}
            disabled={timer?.status === 'idle'}
          >
            <RotateCcw className="w-4 h-4" />
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={handlePlayPause}
            disabled={isComplete}
          >
            {isRunning ? (
              <Pause className="w-5 h-5" />
            ) : (
              <Play className="w-5 h-5" />
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

// Compact inline timer for lists
interface InlineTimerProps {
  id: string;
  name: string;
  durationSeconds: number;
  onComplete?: () => void;
}

export function InlineTimer({ id, name, durationSeconds, onComplete }: InlineTimerProps) {
  const { timers, createTimer, startTimer, pauseTimer, resumeTimer } = useTimerStore();
  const timer = timers[id];
  const [displayTime, setDisplayTime] = useState(durationSeconds);

  useEffect(() => {
    if (!timer) {
      createTimer(id, name, durationSeconds);
    }
  }, [id, name, durationSeconds, timer, createTimer]);

  useEffect(() => {
    if (!timer) return;

    if (timer.status === 'running') {
      const interval = setInterval(() => {
        const remaining = getCurrentRemaining(timer);
        setDisplayTime(remaining);
        if (remaining <= 0) {
          onComplete?.();
          clearInterval(interval);
        }
      }, 100);
      return () => clearInterval(interval);
    } else {
      setDisplayTime(timer.remaining);
    }
  }, [timer, onComplete]);

  const handleToggle = () => {
    if (!timer) return;
    if (timer.status === 'running') {
      pauseTimer(id);
    } else if (timer.status === 'paused') {
      resumeTimer(id);
    } else {
      startTimer(id);
    }
  };

  const isRunning = timer?.status === 'running';

  return (
    <button
      onClick={handleToggle}
      className={`
        inline-flex items-center gap-2 px-3 py-1.5 rounded-full font-mono text-sm
        transition-colors touch-target
        ${isRunning
          ? 'bg-crust-600 text-white'
          : 'bg-crumb-200 dark:bg-crust-800 text-crust-700 dark:text-crumb-300'
        }
      `}
    >
      {isRunning ? (
        <Pause className="w-3.5 h-3.5" />
      ) : (
        <Play className="w-3.5 h-3.5" />
      )}
      {formatTime(displayTime)}
    </button>
  );
}
