import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface Timer {
  id: string;
  name: string;
  duration: number; // Total duration in seconds
  remaining: number; // Remaining seconds
  startedAt: number | null; // Timestamp when started
  pausedAt: number | null; // Timestamp when paused
  status: 'idle' | 'running' | 'paused' | 'completed';
  notificationId?: string;
}

interface TimerState {
  timers: Record<string, Timer>;

  // Actions
  createTimer: (id: string, name: string, durationSeconds: number) => void;
  startTimer: (id: string) => void;
  pauseTimer: (id: string) => void;
  resumeTimer: (id: string) => void;
  resetTimer: (id: string) => void;
  deleteTimer: (id: string) => void;
  tickTimer: (id: string) => void;
  completeTimer: (id: string) => void;

  // Computed
  getTimer: (id: string) => Timer | undefined;
  getActiveTimers: () => Timer[];
}

export const useTimerStore = create<TimerState>()(
  persist(
    (set, get) => ({
      timers: {},

      createTimer: (id, name, durationSeconds) =>
        set((state) => ({
          timers: {
            ...state.timers,
            [id]: {
              id,
              name,
              duration: durationSeconds,
              remaining: durationSeconds,
              startedAt: null,
              pausedAt: null,
              status: 'idle',
            },
          },
        })),

      startTimer: (id) =>
        set((state) => {
          const timer = state.timers[id];
          if (!timer) return state;

          return {
            timers: {
              ...state.timers,
              [id]: {
                ...timer,
                status: 'running',
                startedAt: Date.now(),
                pausedAt: null,
              },
            },
          };
        }),

      pauseTimer: (id) =>
        set((state) => {
          const timer = state.timers[id];
          if (!timer || timer.status !== 'running') return state;

          // Calculate remaining time
          const elapsed = timer.startedAt
            ? Math.floor((Date.now() - timer.startedAt) / 1000)
            : 0;
          const remaining = Math.max(0, timer.remaining - elapsed);

          return {
            timers: {
              ...state.timers,
              [id]: {
                ...timer,
                status: 'paused',
                remaining,
                pausedAt: Date.now(),
                startedAt: null,
              },
            },
          };
        }),

      resumeTimer: (id) =>
        set((state) => {
          const timer = state.timers[id];
          if (!timer || timer.status !== 'paused') return state;

          return {
            timers: {
              ...state.timers,
              [id]: {
                ...timer,
                status: 'running',
                startedAt: Date.now(),
                pausedAt: null,
              },
            },
          };
        }),

      resetTimer: (id) =>
        set((state) => {
          const timer = state.timers[id];
          if (!timer) return state;

          return {
            timers: {
              ...state.timers,
              [id]: {
                ...timer,
                status: 'idle',
                remaining: timer.duration,
                startedAt: null,
                pausedAt: null,
              },
            },
          };
        }),

      deleteTimer: (id) =>
        set((state) => {
          const { [id]: _, ...rest } = state.timers;
          return { timers: rest };
        }),

      tickTimer: (id) =>
        set((state) => {
          const timer = state.timers[id];
          if (!timer || timer.status !== 'running' || !timer.startedAt) return state;

          const elapsed = Math.floor((Date.now() - timer.startedAt) / 1000);
          const remaining = Math.max(0, timer.remaining - elapsed);

          if (remaining <= 0) {
            return {
              timers: {
                ...state.timers,
                [id]: {
                  ...timer,
                  status: 'completed',
                  remaining: 0,
                },
              },
            };
          }

          // Don't update state if remaining hasn't changed significantly
          return state;
        }),

      completeTimer: (id) =>
        set((state) => {
          const timer = state.timers[id];
          if (!timer) return state;

          return {
            timers: {
              ...state.timers,
              [id]: {
                ...timer,
                status: 'completed',
                remaining: 0,
              },
            },
          };
        }),

      getTimer: (id) => get().timers[id],

      getActiveTimers: () =>
        Object.values(get().timers).filter(
          (t) => t.status === 'running' || t.status === 'paused'
        ),
    }),
    {
      name: 'levain-timers',
      storage: createJSONStorage(() => localStorage),
    }
  )
);

// Helper to calculate current remaining time for a running timer
export function getCurrentRemaining(timer: Timer): number {
  if (timer.status !== 'running' || !timer.startedAt) {
    return timer.remaining;
  }
  const elapsed = Math.floor((Date.now() - timer.startedAt) / 1000);
  return Math.max(0, timer.remaining - elapsed);
}

// Format seconds as mm:ss or hh:mm:ss
export function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}
