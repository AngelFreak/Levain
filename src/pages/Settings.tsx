import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Moon,
  Bell,
  Vibrate,
  Scale,
  Thermometer,
  Download,
  Upload,
  Trash2,
  ChevronRight,
  Sparkles,
  Clock,
  BatteryWarning,
  Image as ImageIcon,
  Languages,
} from 'lucide-react';
import { Card, Input, Slider, BottomSheetSelect, Button } from '../components/ui';
import { useSettingsStore } from '../stores/settingsStore';
import { useTranslation } from '../lib/i18n/useTranslation';
import { LANGUAGES } from '../lib/i18n';
import { testApiKey } from '../lib/claude';
import { ConfirmModal } from '../components/ui/Modal';
import { db } from '../lib/db';
import {
  exportAllData,
  saveAndShareBackup,
  estimateBackupSize,
  formatBytes,
  pickAndReadBackupFile,
  parseBackup,
  importAllData,
  BackupValidationError,
  type BackupFile,
  type ImportMode,
} from '../lib/backup';
import { useAppStore } from '../stores/appStore';
import { Capacitor } from '@capacitor/core';
import BatteryOptimization from '../lib/batteryOptimization';
import type { UserSettings } from '../types';

export function SettingsPage() {
  const { settings, updateSetting, resetSettings } = useSettingsStore();
  const { showToast } = useAppStore();
  const { t } = useTranslation();
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showDeleteDataConfirm, setShowDeleteDataConfirm] = useState(false);
  const [includePhotos, setIncludePhotos] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  // Pending import awaiting a merge/replace choice.
  const [pendingImport, setPendingImport] = useState<BackupFile | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [keyTest, setKeyTest] = useState<{ status: 'idle' | 'testing' | 'ok' | 'fail'; message?: string }>({
    status: 'idle',
  });

  const handleTestKey = async () => {
    setKeyTest({ status: 'testing' });
    try {
      await testApiKey();
      setKeyTest({ status: 'ok', message: t('settings.keyTestSuccess') });
    } catch (error) {
      const message =
        error instanceof Error && error.message ? error.message : t('settings.keyTestFailed');
      setKeyTest({ status: 'fail', message });
    }
  };

  const handleExportData = async () => {
    setIsExporting(true);
    try {
      const backup = await exportAllData(includePhotos);
      const size = estimateBackupSize(backup);
      const where = await saveAndShareBackup(backup);
      showToast(`${where} (${formatBytes(size)})`, 'success');
    } catch (error) {
      console.error('Export failed:', error);
      showToast(t('settings.exportFailed'), 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const handlePickImport = async () => {
    try {
      const text = await pickAndReadBackupFile();
      if (!text) return; // cancelled
      const backup = parseBackup(text);
      setPendingImport(backup); // opens the merge/replace chooser
    } catch (error) {
      const message =
        error instanceof BackupValidationError
          ? error.message
          : t('settings.importReadError');
      showToast(message, 'error');
    }
  };

  const runImport = async (mode: ImportMode) => {
    if (!pendingImport) return;
    setIsImporting(true);
    try {
      const result = await importAllData(pendingImport, mode);
      showToast(
        t('settings.importSuccess', {
          starters: result.starters,
          recipes: result.recipes,
          bakes: result.bakes,
        }),
        'success'
      );
      setPendingImport(null);
    } catch (error) {
      console.error('Import failed:', error);
      showToast(t('settings.importFailed'), 'error');
    } finally {
      setIsImporting(false);
    }
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
          {t('settings.title')}
        </h1>
        <p className="text-crust-600 dark:text-crumb-400 mt-1">
          {t('settings.subtitle')}
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
            {t('settings.appearance')}
          </h2>
          <Card padding="none">
            <SettingRow
              icon={<Moon className="w-5 h-5" />}
              label={t('settings.theme')}
              description={t('settings.themeHint')}
            >
              <BottomSheetSelect
                value={settings.darkMode}
                onChange={(value) => updateSetting('darkMode', value as UserSettings['darkMode'])}
                title={t('settings.theme')}
                options={[
                  { value: 'system', label: t('settings.themeSystem') },
                  { value: 'light', label: t('settings.themeLight') },
                  { value: 'dark', label: t('settings.themeDark') },
                ]}
              />
            </SettingRow>

            <SettingRow
              icon={<Languages className="w-5 h-5" />}
              label={t('settings.language')}
              description={t('settings.languageHint')}
              hasBorder
            >
              <BottomSheetSelect
                value={settings.language}
                onChange={(value) => updateSetting('language', value as UserSettings['language'])}
                title={t('settings.language')}
                options={LANGUAGES.map((l) => ({ value: l.value, label: l.nativeLabel }))}
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
            {t('settings.unitsAndDefaults')}
          </h2>
          <Card padding="none">
            <SettingRow
              icon={<Scale className="w-5 h-5" />}
              label={t('settings.weightUnits')}
              description={t('settings.weightUnitsHint')}
            >
              <BottomSheetSelect
                value={settings.units}
                onChange={(value) => updateSetting('units', value as UserSettings['units'])}
                title={t('settings.weightUnits')}
                options={[
                  { value: 'metric', label: t('settings.weightMetric') },
                  { value: 'imperial', label: t('settings.weightImperial') },
                ]}
              />
            </SettingRow>

            <SettingRow
              icon={<Thermometer className="w-5 h-5" />}
              label={t('settings.temperature')}
              description={t('settings.temperatureHint')}
              hasBorder
            >
              <BottomSheetSelect
                value={settings.temperatureUnit}
                onChange={(value) => updateSetting('temperatureUnit', value as UserSettings['temperatureUnit'])}
                title={t('settings.temperatureTitle')}
                options={[
                  { value: 'celsius', label: t('settings.tempCelsius') },
                  { value: 'fahrenheit', label: t('settings.tempFahrenheit') },
                ]}
              />
            </SettingRow>

            <SettingRow
              icon={<Clock className="w-5 h-5" />}
              label={t('settings.timeFormat')}
              description={t('settings.timeFormatHint')}
              hasBorder
            >
              <BottomSheetSelect
                value={settings.timeFormat}
                onChange={(value) => updateSetting('timeFormat', value as UserSettings['timeFormat'])}
                title={t('settings.timeFormat')}
                options={[
                  { value: '24h', label: t('settings.time24h') },
                  { value: '12h', label: t('settings.time12h') },
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
            {t('settings.calculatorDefaults')}
          </h2>
          <Card padding="md" className="space-y-5">
            <Slider
              label={t('settings.defaultHydration')}
              value={settings.defaultHydration}
              onChange={(v) => updateSetting('defaultHydration', v)}
              min={50}
              max={100}
              unit="%"
            />
            <Slider
              label={t('settings.defaultStarterPercent')}
              value={settings.defaultStarterPercent}
              onChange={(v) => updateSetting('defaultStarterPercent', v)}
              min={5}
              max={40}
              unit="%"
            />
            <Slider
              label={t('settings.defaultSaltPercent')}
              value={settings.defaultSaltPercent}
              onChange={(v) => updateSetting('defaultSaltPercent', v)}
              min={1}
              max={3}
              step={0.1}
              unit="%"
            />
            <Slider
              label={t('settings.kitchenTemperature')}
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
            {t('settings.notifications')}
          </h2>
          <Card padding="none">
            <SettingRow
              icon={<Bell className="w-5 h-5" />}
              label={t('settings.pushNotifications')}
              description={t('settings.pushNotificationsHint')}
            >
              <ToggleSwitch
                checked={settings.notificationsEnabled}
                onChange={(v) => updateSetting('notificationsEnabled', v)}
              />
            </SettingRow>

            <SettingRow
              icon={<Clock className="w-5 h-5" />}
              label={t('settings.feedingReminders')}
              description={t('settings.feedingRemindersHint')}
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
                  {t('settings.remindMeAfter')}
                </label>
                <BottomSheetSelect
                  value={String(settings.feedingReminderHours)}
                  onChange={(value) => updateSetting('feedingReminderHours', Number(value))}
                  title={t('settings.reminderInterval')}
                  options={[
                    { value: '6', label: t('settings.reminderHours', { hours: 6 }) },
                    { value: '8', label: t('settings.reminderHours', { hours: 8 }) },
                    { value: '12', label: t('settings.reminderHoursRecommended', { hours: 12 }) },
                    { value: '24', label: t('settings.reminderHours', { hours: 24 }) },
                    { value: '48', label: t('settings.reminderHours', { hours: 48 }) },
                  ]}
                />
              </div>
            )}

            <SettingRow
              icon={<Vibrate className="w-5 h-5" />}
              label={t('settings.hapticFeedback')}
              description={t('settings.hapticFeedbackHint')}
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
                      {t('settings.batteryOptimization')}
                    </p>
                    <p className="text-sm text-crust-500 dark:text-crumb-500 mt-0.5">
                      {t('settings.batteryOptimizationHint')}
                    </p>
                    <p className="text-xs text-honey-600 dark:text-honey-400 mt-2">
                      {t('settings.openBatterySettings')}
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
            {t('settings.aiFeatures')}
          </h2>
          <Card padding="md">
            <div className="flex items-start gap-3 mb-4">
              <div className="p-2 bg-honey-100 dark:bg-honey-900/30 rounded-lg">
                <Sparkles className="w-5 h-5 text-honey-600 dark:text-honey-400" />
              </div>
              <div>
                <h3 className="font-medium text-crust-800 dark:text-crumb-100">
                  {t('settings.claudeAnalysis')}
                </h3>
                <p className="text-sm text-crust-500 dark:text-crumb-500 mt-0.5">
                  {t('settings.claudeAnalysisHint')}
                </p>
              </div>
            </div>
            <Input
              label={t('settings.apiKey')}
              type="password"
              placeholder="sk-ant-..."
              value={settings.claudeApiKey || ''}
              onChange={(e) => {
                updateSetting('claudeApiKey', e.target.value);
                if (keyTest.status !== 'idle') setKeyTest({ status: 'idle' });
              }}
              hint={t('settings.apiKeyHint')}
            />

            <div className="mt-3 flex items-center gap-3">
              <Button
                size="sm"
                variant="ghost"
                isLoading={keyTest.status === 'testing'}
                disabled={!settings.claudeApiKey?.trim()}
                onClick={handleTestKey}
              >
                {t('settings.testKey')}
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
            {t('settings.data')}
          </h2>
          <Card padding="none">
            {/* Include-photos toggle for export */}
            <button
              onClick={() => setIncludePhotos((v) => !v)}
              className="w-full flex items-center gap-4 px-4 py-4 text-left hover:bg-crumb-50 dark:hover:bg-crust-800/50 transition-colors"
            >
              <ImageIcon className="w-5 h-5 text-crust-500 dark:text-crumb-500" />
              <div className="flex-1">
                <p className="font-medium text-crust-800 dark:text-crumb-100">
                  {t('settings.includePhotos')}
                </p>
                <p className="text-sm text-crust-500 dark:text-crumb-500">
                  {includePhotos
                    ? t('settings.includePhotosOn')
                    : t('settings.includePhotosOff')}
                </p>
              </div>
              <span
                className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
                  includePhotos ? 'bg-honey-500' : 'bg-crumb-300 dark:bg-crust-700'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                    includePhotos ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </span>
            </button>

            <div className="border-t border-crumb-100 dark:border-crust-800" />

            <button
              onClick={handleExportData}
              disabled={isExporting}
              className="w-full flex items-center gap-4 px-4 py-4 text-left hover:bg-crumb-50 dark:hover:bg-crust-800/50 transition-colors disabled:opacity-60"
            >
              <Download className="w-5 h-5 text-crust-500 dark:text-crumb-500" />
              <div className="flex-1">
                <p className="font-medium text-crust-800 dark:text-crumb-100">
                  {isExporting ? t('settings.preparingBackup') : t('settings.backupExport')}
                </p>
                <p className="text-sm text-crust-500 dark:text-crumb-500">
                  {t('settings.backupExportHint')}
                </p>
              </div>
              <ChevronRight className="w-5 h-5 text-crumb-400 dark:text-crust-600" />
            </button>

            <div className="border-t border-crumb-100 dark:border-crust-800" />

            <button
              onClick={handlePickImport}
              className="w-full flex items-center gap-4 px-4 py-4 text-left hover:bg-crumb-50 dark:hover:bg-crust-800/50 transition-colors"
            >
              <Upload className="w-5 h-5 text-crust-500 dark:text-crumb-500" />
              <div className="flex-1">
                <p className="font-medium text-crust-800 dark:text-crumb-100">
                  {t('settings.restoreImport')}
                </p>
                <p className="text-sm text-crust-500 dark:text-crumb-500">
                  {t('settings.restoreImportHint')}
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
                  {t('settings.deleteAllData')}
                </p>
                <p className="text-sm text-crust-500 dark:text-crumb-500">
                  {t('settings.deleteAllDataHint')}
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
              {t('settings.version', { version: '1.0.0' })}
            </p>
            <p className="text-xs text-crust-400 dark:text-crumb-600 mt-2">
              {t('settings.tagline')}
            </p>
          </Card>
        </motion.section>
      </div>

      {/* Confirm Modals */}
      <ConfirmModal
        isOpen={showResetConfirm}
        onClose={() => setShowResetConfirm(false)}
        onConfirm={resetSettings}
        title={t('settings.resetTitle')}
        message={t('settings.resetMessage')}
        confirmText={t('settings.resetConfirm')}
      />

      <ConfirmModal
        isOpen={showDeleteDataConfirm}
        onClose={() => setShowDeleteDataConfirm(false)}
        onConfirm={handleDeleteAllData}
        title={t('settings.deleteAllData')}
        message={t('settings.deleteAllDataMessage')}
        confirmText={t('common.delete')}
        variant="danger"
      />

      {/* Import merge/replace chooser */}
      {pendingImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-restore-title"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white dark:bg-crust-900 rounded-2xl p-6 max-w-sm w-full shadow-xl"
          >
            <h3 id="settings-restore-title" className="text-lg font-display font-semibold text-crust-800 dark:text-crumb-100 mb-1">
              {t('settings.restoreFromBackup')}
            </h3>
            <p className="text-sm text-crust-600 dark:text-crumb-400 mb-1">
              {t('settings.backupSummary', {
                date: new Date(pendingImport.exportDate).toLocaleDateString(),
                starters: pendingImport.data.starters.length,
                recipes: pendingImport.data.recipes.length,
                bakes: pendingImport.data.bakes.length,
              })}
            </p>
            <p className="text-xs text-crust-500 dark:text-crumb-500 mb-5">
              {t('settings.restoreApplyHint')}
            </p>
            <div className="space-y-2">
              <Button
                fullWidth
                onClick={() => runImport('merge')}
                disabled={isImporting}
              >
                {t('settings.importMerge')}
              </Button>
              <Button
                fullWidth
                variant="secondary"
                onClick={() => runImport('replace')}
                disabled={isImporting}
                className="text-error-600 dark:text-error-400"
              >
                {t('settings.importReplace')}
              </Button>
              <Button
                fullWidth
                variant="ghost"
                onClick={() => setPendingImport(null)}
                disabled={isImporting}
              >
                {t('common.cancel')}
              </Button>
            </div>
          </motion.div>
        </div>
      )}
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
