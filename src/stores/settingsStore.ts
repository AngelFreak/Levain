import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { UserSettings } from '../types';
import { DEFAULT_SETTINGS } from '../types';

interface SettingsState {
  settings: UserSettings;
  isLoaded: boolean;
  updateSetting: <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => void;
  updateSettings: (updates: Partial<UserSettings>) => void;
  resetSettings: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      settings: DEFAULT_SETTINGS,
      isLoaded: false,

      updateSetting: (key, value) =>
        set((state) => ({
          settings: { ...state.settings, [key]: value },
        })),

      updateSettings: (updates) =>
        set((state) => ({
          settings: { ...state.settings, ...updates },
        })),

      resetSettings: () =>
        set({ settings: DEFAULT_SETTINGS }),
    }),
    {
      name: 'levain-settings',
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.isLoaded = true;
        }
      },
    }
  )
);

// Selectors for common settings
export const useUnits = () => useSettingsStore((s) => s.settings.units);
export const useTempUnit = () => useSettingsStore((s) => s.settings.temperatureUnit);
export const useNotificationsEnabled = () => useSettingsStore((s) => s.settings.notificationsEnabled);
export const useHapticEnabled = () => useSettingsStore((s) => s.settings.hapticFeedbackEnabled);
export const useDarkMode = () => useSettingsStore((s) => s.settings.darkMode);
