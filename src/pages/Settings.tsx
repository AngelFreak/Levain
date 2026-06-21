import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Moon,
  Bell,
  Vibrate,
  Scale,
  Thermometer,
  Download,
  Trash2,
  ChevronRight,
  Sparkles,
  Clock,
  BatteryWarning,
} from 'lucide-react';
import { Card, Input, Slider, BottomSheetSelect, Button } from '../components/ui';
import { useSettingsStore } from '../stores/settingsStore';
import { testApiKey } from '../lib/claude';
import { ConfirmModal } from '../components/ui/Modal';
import { db } from '../lib/db';
import { Capacitor } from '@capacitor/core';
import BatteryOptimization from '../lib/batteryOptimization';
import type { UserSettings } from '../types';

export function SettingsPage() {
  const { settings, updateSetting, resetSettings } = useSettingsStore();
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showDeleteDataConfirm, setShowDeleteDataConfirm] = useState(false);
  const [keyTest, setKeyTest] = useState<{ status: 'idle' | 'testing' | 'ok' | 'fail'; message?: string }>({
    status: 'idle',
  });

  const handleTestKey = async () => {
    setKeyTest({ status: 'testing' });
    try {
      await testApiKey();
      setKeyTest({ status: 'ok', message: 'Key works! AI analysis is ready.' });
    } catch (error) {
      const message =
        error instanceof Error && error.message ? error.message : 'Key check failed.';
      setKeyTest({ status: 'fail', message });
    }
  };

  const handleExportData = async () => {
    const starters = await db.starters.toArray();
    const feedings = await db.feedings.toArray();
    const recipes = await db.recipes.toArray();
    const bakes = await db.bakes.toArray();

    const data = {
      exportDate: new Date().toISOString(),
      version: '1.0',
      starters,
      feedings,
      recipes,
      bakes,
      settings,
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `levain-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDeleteAllData = async () => {
    await db.starters.clear();
    await db.feedings.clear();
    await db.recipes.clear();
    await db.bakes.clear();
    await db.activeTimelines.clear();
    resetSettings();
    setShowDeleteDataConfirm(false);
  };

  return (
    <div className="pb-24 px-4 pt-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <h1 className="text-2xl font-display font-bold text-crust-800 dark:text-crumb-100">
          Settings
        </h1>
        <p className="text-crust-600 dark:text-crumb-400 mt-1">
          Customize your experience
        </p>
      </motion.div>

      <div className="space-y-6">
        {/* Appearance */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
          <h2 className="text-sm font-medium text-crust-500 dark:text-crumb-500 uppercase tracking-wide mb-3">
            Appearance
          </h2>
          <Card padding="none">
            <SettingRow
              icon={<Moon className="w-5 h-5" />}
              label="Theme"
              description="Choose light, dark, or system"
            >
              <BottomSheetSelect
                value={settings.darkMode}
                onChange={(value) => updateSetting('darkMode', value as UserSettings['darkMode'])}
                title="Theme"
                options={[
                  { value: 'system', label: 'System' },
                  { value: 'light', label: 'Light' },
                  { value: 'dark', label: 'Dark' },
                ]}
              />
            </SettingRow>
          </Card>
        </motion.section>

        {/* Units & Defaults */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <h2 className="text-sm font-medium text-crust-500 dark:text-crumb-500 uppercase tracking-wide mb-3">
            Units & Defaults
          </h2>
          <Card padding="none">
            <SettingRow
              icon={<Scale className="w-5 h-5" />}
              label="Weight Units"
              description="Grams or ounces"
            >
              <BottomSheetSelect
                value={settings.units}
                onChange={(value) => updateSetting('units', value as UserSettings['units'])}
                title="Weight Units"
                options={[
                  { value: 'metric', label: 'Metric (g)' },
                  { value: 'imperial', label: 'Imperial (oz)' },
                ]}
              />
            </SettingRow>

            <SettingRow
              icon={<Thermometer className="w-5 h-5" />}
              label="Temperature"
              description="Celsius or Fahrenheit"
              hasBorder
            >
              <BottomSheetSelect
                value={settings.temperatureUnit}
                onChange={(value) => updateSetting('temperatureUnit', value as UserSettings['temperatureUnit'])}
                title="Temperature Unit"
                options={[
                  { value: 'celsius', label: 'Celsius (°C)' },
                  { value: 'fahrenheit', label: 'Fahrenheit (°F)' },
                ]}
              />
            </SettingRow>

            <SettingRow
              icon={<Clock className="w-5 h-5" />}
              label="Time Format"
              description="12-hour or 24-hour clock"
              hasBorder
            >
              <BottomSheetSelect
                value={settings.timeFormat}
                onChange={(value) => updateSetting('timeFormat', value as UserSettings['timeFormat'])}
                title="Time Format"
                options={[
                  { value: '24h', label: '24-hour (14:30)' },
                  { value: '12h', label: '12-hour (2:30 PM)' },
                ]}
              />
            </SettingRow>
          </Card>
        </motion.section>

        {/* Default Values */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <h2 className="text-sm font-medium text-crust-500 dark:text-crumb-500 uppercase tracking-wide mb-3">
            Calculator Defaults
          </h2>
          <Card padding="md" className="space-y-5">
            <Slider
              label="Default Hydration"
              value={settings.defaultHydration}
              onChange={(v) => updateSetting('defaultHydration', v)}
              min={50}
              max={100}
              unit="%"
            />
            <Slider
              label="Default Starter %"
              value={settings.defaultStarterPercent}
              onChange={(v) => updateSetting('defaultStarterPercent', v)}
              min={5}
              max={40}
              unit="%"
            />
            <Slider
              label="Default Salt %"
              value={settings.defaultSaltPercent}
              onChange={(v) => updateSetting('defaultSaltPercent', v)}
              min={1}
              max={3}
              step={0.1}
              unit="%"
            />
            <Slider
              label="Kitchen Temperature"
              value={settings.defaultAmbientTemp}
              onChange={(v) => updateSetting('defaultAmbientTemp', v)}
              min={15}
              max={35}
              unit="°C"
            />
          </Card>
        </motion.section>

        {/* Notifications */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <h2 className="text-sm font-medium text-crust-500 dark:text-crumb-500 uppercase tracking-wide mb-3">
            Notifications
          </h2>
          <Card padding="none">
            <SettingRow
              icon={<Bell className="w-5 h-5" />}
              label="Push Notifications"
              description="Enable all notifications"
            >
              <ToggleSwitch
                checked={settings.notificationsEnabled}
                onChange={(v) => updateSetting('notificationsEnabled', v)}
              />
            </SettingRow>

            <SettingRow
              icon={<Clock className="w-5 h-5" />}
              label="Feeding Reminders"
              description="Get reminded to feed your starter"
              hasBorder
            >
              <ToggleSwitch
                checked={settings.feedingRemindersEnabled}
                onChange={(v) => updateSetting('feedingRemindersEnabled', v)}
                disabled={!settings.notificationsEnabled}
              />
            </SettingRow>

            {settings.notificationsEnabled && settings.feedingRemindersEnabled && (
              <div className="px-4 py-3 border-t border-crumb-100 dark:border-crust-800">
                <label className="text-sm text-crust-600 dark:text-crumb-400 mb-2 block">
                  Remind me after
                </label>
                <BottomSheetSelect
                  value={String(settings.feedingReminderHours)}
                  onChange={(value) => updateSetting('feedingReminderHours', Number(value))}
                  title="Reminder Interval"
                  options={[
                    { value: '6', label: '6 hours' },
                    { value: '8', label: '8 hours' },
                    { value: '12', label: '12 hours (recommended)' },
                    { value: '24', label: '24 hours' },
                    { value: '48', label: '48 hours' },
                  ]}
                />
              </div>
            )}

            <SettingRow
              icon={<Vibrate className="w-5 h-5" />}
              label="Haptic Feedback"
              description="Vibration on actions"
              hasBorder
            >
              <ToggleSwitch
                checked={settings.hapticFeedbackEnabled}
                onChange={(v) => updateSetting('hapticFeedbackEnabled', v)}
              />
            </SettingRow>

            {/* Battery optimization notice - Android only */}
            {Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android' && (
              <>
                <div className="border-t border-crumb-100 dark:border-crust-800" />
                <button
                  onClick={async () => {
                    try {
                      await BatteryOptimization.openBatterySettings();
                    } catch (error) {
                      console.error('Failed to open battery settings:', error);
                    }
                  }}
                  className="w-full flex items-start gap-4 px-4 py-4 text-left hover:bg-crumb-50 dark:hover:bg-crust-800/50 transition-colors"
                >
                  <div className="text-warning-500 mt-0.5">
                    <BatteryWarning className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-crust-800 dark:text-crumb-100">
                      Battery Optimization
                    </p>
                    <p className="text-sm text-crust-500 dark:text-crumb-500 mt-0.5">
                      Tap to disable battery optimization for Levain. This ensures bake reminders arrive on time.
                    </p>
                    <p className="text-xs text-honey-600 dark:text-honey-400 mt-2">
                      Open battery settings
                    </p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-crumb-400 dark:text-crust-600 mt-0.5" />
                </button>
              </>
            )}
          </Card>
        </motion.section>

        {/* AI Integration */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
        >
          <h2 className="text-sm font-medium text-crust-500 dark:text-crumb-500 uppercase tracking-wide mb-3">
            AI Features
          </h2>
          <Card padding="md">
            <div className="flex items-start gap-3 mb-4">
              <div className="p-2 bg-honey-100 dark:bg-honey-900/30 rounded-lg">
                <Sparkles className="w-5 h-5 text-honey-600 dark:text-honey-400" />
              </div>
              <div>
                <h3 className="font-medium text-crust-800 dark:text-crumb-100">
                  Claude AI Analysis
                </h3>
                <p className="text-sm text-crust-500 dark:text-crumb-500 mt-0.5">
                  Get photo analysis and baking advice
                </p>
              </div>
            </div>
            <Input
              label="API Key"
              type="password"
              placeholder="sk-ant-..."
              value={settings.claudeApiKey || ''}
              onChange={(e) => {
                updateSetting('claudeApiKey', e.target.value);
                if (keyTest.status !== 'idle') setKeyTest({ status: 'idle' });
              }}
              hint="Anthropic API key from console.anthropic.com — pay-as-you-go, not a Claude Max/Pro plan. Stored only on this device. Used to analyze starter photos."
            />

            <div className="mt-3 flex items-center gap-3">
              <Button
                size="sm"
                variant="ghost"
                isLoading={keyTest.status === 'testing'}
                disabled={!settings.claudeApiKey?.trim()}
                onClick={handleTestKey}
              >
                Test key
              </Button>
              {keyTest.status === 'ok' && (
                <span className="text-sm text-success-600 dark:text-success-400">
                  {keyTest.message}
                </span>
              )}
              {keyTest.status === 'fail' && (
                <span className="text-sm text-error-500">{keyTest.message}</span>
              )}
            </div>
          </Card>
        </motion.section>

        {/* Data Management */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <h2 className="text-sm font-medium text-crust-500 dark:text-crumb-500 uppercase tracking-wide mb-3">
            Data
          </h2>
          <Card padding="none">
            <button
              onClick={handleExportData}
              className="w-full flex items-center gap-4 px-4 py-4 text-left hover:bg-crumb-50 dark:hover:bg-crust-800/50 transition-colors"
            >
              <Download className="w-5 h-5 text-crust-500 dark:text-crumb-500" />
              <div className="flex-1">
                <p className="font-medium text-crust-800 dark:text-crumb-100">
                  Export Data
                </p>
                <p className="text-sm text-crust-500 dark:text-crumb-500">
                  Download all your data as JSON
                </p>
              </div>
              <ChevronRight className="w-5 h-5 text-crumb-400 dark:text-crust-600" />
            </button>

            <div className="border-t border-crumb-100 dark:border-crust-800" />

            <button
              onClick={() => setShowDeleteDataConfirm(true)}
              className="w-full flex items-center gap-4 px-4 py-4 text-left hover:bg-error-50 dark:hover:bg-error-950/20 transition-colors"
            >
              <Trash2 className="w-5 h-5 text-error-500" />
              <div className="flex-1">
                <p className="font-medium text-error-600 dark:text-error-400">
                  Delete All Data
                </p>
                <p className="text-sm text-crust-500 dark:text-crumb-500">
                  Permanently remove all local data
                </p>
              </div>
            </button>
          </Card>
        </motion.section>

        {/* About */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
        >
          <Card padding="md" className="text-center">
            <img
              src="/logo.png"
              alt="Levain"
              className="w-16 h-16 drop-shadow-md mx-auto mb-3"
            />
            <h3 className="text-2xl font-display font-bold text-crust-800 dark:text-crumb-100">
              Levain
            </h3>
            <p className="text-sm text-crust-500 dark:text-crumb-500 mt-1">
              Version 1.0.0
            </p>
            <p className="text-xs text-crust-400 dark:text-crumb-600 mt-2">
              Your sourdough companion
            </p>
          </Card>
        </motion.section>
      </div>

      {/* Confirm Modals */}
      <ConfirmModal
        isOpen={showResetConfirm}
        onClose={() => setShowResetConfirm(false)}
        onConfirm={resetSettings}
        title="Reset Settings"
        message="This will reset all settings to their default values. Your data will not be affected."
        confirmText="Reset"
      />

      <ConfirmModal
        isOpen={showDeleteDataConfirm}
        onClose={() => setShowDeleteDataConfirm(false)}
        onConfirm={handleDeleteAllData}
        title="Delete All Data"
        message="This will permanently delete all your starters, feedings, recipes, and bakes. This action cannot be undone."
        confirmText="Delete"
        variant="danger"
      />
    </div>
  );
}

// Setting Row Component
function SettingRow({
  icon,
  label,
  description,
  children,
  hasBorder = false,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  children: React.ReactNode;
  hasBorder?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-4 px-4 py-4 ${
        hasBorder ? 'border-t border-crumb-100 dark:border-crust-800' : ''
      }`}
    >
      <div className="text-crust-500 dark:text-crumb-500">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-crust-800 dark:text-crumb-100">{label}</p>
        <p className="text-sm text-crust-500 dark:text-crumb-500 truncate">
          {description}
        </p>
      </div>
      {children}
    </div>
  );
}

// Toggle Switch Component
function ToggleSwitch({
  checked,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`
        relative w-14 h-8 rounded-full transition-colors flex-shrink-0
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        ${checked && !disabled ? 'bg-honey-500' : 'bg-crumb-300 dark:bg-crust-700'}
      `}
    >
      <motion.div
        className="absolute top-1 left-1 w-6 h-6 bg-white rounded-full shadow-md"
        animate={{ x: checked && !disabled ? 24 : 0 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      />
    </button>
  );
}
