import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Wheat,
  Beaker,
  Thermometer,
  Bell,
  Home,
  Calculator as CalculatorIcon,
  BookOpen,
  Check,
  ArrowRight,
} from 'lucide-react';
import { Button, Input, NumberInput } from './ui';
import { db } from '../lib/db';
import { useAppStore } from '../stores/appStore';
import { useSettingsStore } from '../stores/settingsStore';
import { requestNotificationPermission, markOnboardingComplete } from '../lib/permissions';
import { useTranslation } from '../lib/i18n/useTranslation';

interface OnboardingProps {
  isOpen: boolean;
  /** Called when onboarding finishes (completed or skipped). */
  onClose: () => void;
  /** Hand off to the Settings import flow ("I already have data"). */
  onImport: () => void;
}

type Step = 'welcome' | 'starter' | 'kitchen' | 'tour';
const STEP_ORDER: Step[] = ['welcome', 'starter', 'kitchen', 'tour'];

const FLOUR_OPTIONS = [
  { value: 'white', label: 'White (AP/Bread)' },
  { value: 'whole-wheat', label: 'Whole Wheat' },
  { value: 'rye', label: 'Rye' },
  { value: 'mixed', label: 'Mixed' },
];

export function Onboarding({ isOpen, onClose, onImport }: OnboardingProps) {
  const { showToast } = useAppStore();
  const { settings, updateSettings } = useSettingsStore();
  const { t } = useTranslation();

  const [step, setStep] = useState<Step>('welcome');

  // Step 2 — create starter
  const [starterName, setStarterName] = useState('');
  const [flourType, setFlourType] = useState('white');
  const [starterCreated, setStarterCreated] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Step 3 — kitchen + reminders (seeded from current settings)
  const [ambientTemp, setAmbientTemp] = useState(settings.defaultAmbientTemp);
  const [remindersOn, setRemindersOn] = useState(settings.feedingRemindersEnabled);

  const stepIndex = STEP_ORDER.indexOf(step);

  const goNext = () => {
    const next = STEP_ORDER[stepIndex + 1];
    if (next) setStep(next);
  };

  const finish = () => {
    markOnboardingComplete();
    onClose();
  };

  const handleImport = () => {
    markOnboardingComplete();
    onClose();
    onImport();
  };

  // Create the first starter, then advance. Skipping is allowed (goNext without save).
  const createStarter = async () => {
    if (!starterName.trim()) {
      // Treat empty as "skip this step" rather than erroring — onboarding is gentle.
      goNext();
      return;
    }
    setIsSaving(true);
    try {
      await db.starters.add({
        uuid: crypto.randomUUID(),
        name: starterName.trim(),
        flourType,
        hydration: 100,
        createdDate: new Date(),
        isActive: true,
        storageLocation: 'room',
        notes: '',
      });
      setStarterCreated(true);
      showToast(t('onboarding.toast.starterReady', { name: starterName.trim() }), 'success');
      goNext();
    } catch {
      showToast(t('onboarding.toast.starterFailed'), 'warning');
      goNext();
    } finally {
      setIsSaving(false);
    }
  };

  // Persist kitchen prefs and ask for notification permission if reminders are on.
  const saveKitchen = async () => {
    updateSettings({
      defaultAmbientTemp: ambientTemp,
      feedingRemindersEnabled: remindersOn,
    });
    if (remindersOn) {
      const granted = await requestNotificationPermission();
      if (!granted) {
        showToast(t('onboarding.toast.permissionInfo'), 'info');
      }
    }
    goNext();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[60] bg-warmWhite dark:bg-charcoal flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label={t('onboarding.welcome.title')}
    >
      {/* Progress dots */}
      <div className="flex-shrink-0 pt-safe px-6 pt-6">
        <div className="flex items-center justify-center gap-2" aria-hidden="true">
          {STEP_ORDER.map((s, i) => (
            <div
              key={s}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === stepIndex
                  ? 'w-6 bg-honey-500'
                  : i < stepIndex
                    ? 'w-1.5 bg-honey-400'
                    : 'w-1.5 bg-crumb-300 dark:bg-crust-700'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Step body */}
      <div className="flex-1 overflow-y-auto px-6 py-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.25 }}
            className="h-full flex flex-col"
          >
            {step === 'welcome' && (
              <WelcomeStep onStart={goNext} onImport={handleImport} />
            )}
            {step === 'starter' && (
              <StarterStep
                name={starterName}
                onName={setStarterName}
                flourType={flourType}
                onFlour={setFlourType}
              />
            )}
            {step === 'kitchen' && (
              <KitchenStep
                temp={ambientTemp}
                onTemp={setAmbientTemp}
                reminders={remindersOn}
                onReminders={setRemindersOn}
              />
            )}
            {step === 'tour' && <TourStep starterCreated={starterCreated} />}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Footer actions */}
      <div className="flex-shrink-0 px-6 pb-safe pb-6 pt-2 space-y-3">
        {step === 'starter' && (
          <Button fullWidth onClick={createStarter} isLoading={isSaving} rightIcon={<ArrowRight className="w-4 h-4" />}>
            {starterName.trim() ? t('onboarding.starter.create') : t('onboarding.starter.skip')}
          </Button>
        )}
        {step === 'kitchen' && (
          <Button fullWidth onClick={saveKitchen} rightIcon={<ArrowRight className="w-4 h-4" />}>
            {t('common.continue')}
          </Button>
        )}
        {step === 'tour' && (
          <Button fullWidth onClick={finish}>
            {t('onboarding.tour.start')}
          </Button>
        )}
      </div>
    </div>
  );
}

// ---- Steps ----

function WelcomeStep({ onStart, onImport }: { onStart: () => void; onImport: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center">
      <div className="p-5 bg-honey-100 dark:bg-honey-900/30 rounded-3xl mb-6">
        <Wheat className="w-14 h-14 text-honey-600 dark:text-honey-400" />
      </div>
      <h1 className="text-3xl font-display font-bold text-crust-800 dark:text-crumb-100">
        {t('onboarding.welcome.title')}
      </h1>
      <p className="text-base text-crust-600 dark:text-crumb-400 mt-3 max-w-xs">
        {t('onboarding.welcome.body')}
      </p>
      <div className="w-full max-w-xs mt-8 space-y-3">
        <Button fullWidth onClick={onStart} rightIcon={<ArrowRight className="w-4 h-4" />}>
          {t('onboarding.welcome.getStarted')}
        </Button>
        <button
          onClick={onImport}
          className="text-sm text-crust-500 dark:text-crumb-500 hover:text-crust-700 dark:hover:text-crumb-300 py-2"
        >
          {t('onboarding.welcome.import')}
        </button>
      </div>
    </div>
  );
}

function StarterStep({
  name,
  onName,
  flourType,
  onFlour,
}: {
  name: string;
  onName: (v: string) => void;
  flourType: string;
  onFlour: (v: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div>
      <div className="flex justify-center mb-5">
        <div className="p-4 bg-honey-100 dark:bg-honey-900/30 rounded-2xl">
          <Beaker className="w-10 h-10 text-honey-600 dark:text-honey-400" />
        </div>
      </div>
      <h2 className="text-2xl font-display font-semibold text-crust-800 dark:text-crumb-100 text-center">
        {t('onboarding.starter.title')}
      </h2>
      <p className="text-sm text-crust-600 dark:text-crumb-400 text-center mt-2 mb-6">
        {t('onboarding.starter.body')}
      </p>

      <Input
        label={t('onboarding.starter.nameLabel')}
        placeholder={t('onboarding.starter.namePlaceholder')}
        value={name}
        onChange={(e) => onName(e.target.value)}
        autoFocus
      />

      <div className="mt-5">
        <label className="block text-sm font-medium text-crust-700 dark:text-crumb-200 mb-2">
          {t('onboarding.starter.flourLabel')}
        </label>
        <div className="bg-surface1 dark:bg-surfaceDark1 rounded-xl border border-crumb-300/50 dark:border-crust-600/50 overflow-hidden">
          {FLOUR_OPTIONS.map((option, index) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onFlour(option.value)}
              className={`w-full flex items-center justify-between px-4 py-3.5 text-left ${
                index !== 0 ? 'border-t border-crumb-200/50 dark:border-crust-700/50' : ''
              } ${
                flourType === option.value
                  ? 'bg-honey-50 dark:bg-honey-900/20'
                  : 'active:bg-crumb-100 dark:active:bg-surfaceDark2'
              }`}
            >
              <span
                className={`font-medium ${
                  flourType === option.value
                    ? 'text-honey-700 dark:text-honey-400'
                    : 'text-crust-700 dark:text-crumb-200'
                }`}
              >
                {option.label}
              </span>
              {flourType === option.value && (
                <div className="w-5 h-5 rounded-full bg-honey-500 flex items-center justify-center">
                  <Check className="w-3 h-3 text-white" strokeWidth={3} />
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function KitchenStep({
  temp,
  onTemp,
  reminders,
  onReminders,
}: {
  temp: number;
  onTemp: (v: number) => void;
  reminders: boolean;
  onReminders: (v: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <div>
      <div className="flex justify-center mb-5">
        <div className="p-4 bg-honey-100 dark:bg-honey-900/30 rounded-2xl">
          <Thermometer className="w-10 h-10 text-honey-600 dark:text-honey-400" />
        </div>
      </div>
      <h2 className="text-2xl font-display font-semibold text-crust-800 dark:text-crumb-100 text-center">
        {t('onboarding.kitchen.title')}
      </h2>
      <p className="text-sm text-crust-600 dark:text-crumb-400 text-center mt-2 mb-6">
        {t('onboarding.kitchen.body')}
      </p>

      <div className="mb-6">
        <label className="block text-sm font-medium text-crust-700 dark:text-crumb-200 mb-2">
          {t('onboarding.kitchen.tempLabel')}
        </label>
        <NumberInput value={temp} onChange={onTemp} min={10} max={35} step={1} unit="°C" />
      </div>

      <button
        type="button"
        onClick={() => onReminders(!reminders)}
        aria-pressed={reminders}
        className="w-full flex items-center gap-3 p-4 bg-surface1 dark:bg-surfaceDark1 rounded-xl text-left"
      >
        <div className="flex-shrink-0 p-2 bg-honey-50 dark:bg-honey-900/20 rounded-lg">
          <Bell className="w-5 h-5 text-honey-600 dark:text-honey-400" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-crust-800 dark:text-crumb-100">{t('onboarding.kitchen.reminders')}</p>
          <p className="text-xs text-crust-500 dark:text-crumb-500">
            {t('onboarding.kitchen.remindersHint')}
          </p>
        </div>
        <div
          className={`flex-shrink-0 w-12 h-7 rounded-full p-1 transition-colors ${
            reminders ? 'bg-honey-500' : 'bg-crumb-300 dark:bg-crust-700'
          }`}
        >
          <div
            className={`w-5 h-5 rounded-full bg-white transition-transform ${
              reminders ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </div>
      </button>
    </div>
  );
}

function TourStep({ starterCreated }: { starterCreated: boolean }) {
  const { t } = useTranslation();
  return (
    <div>
      <h2 className="text-2xl font-display font-semibold text-crust-800 dark:text-crumb-100 text-center mb-2">
        {t('onboarding.tour.title')}
      </h2>
      <p className="text-sm text-crust-600 dark:text-crumb-400 text-center mb-6">
        {starterCreated ? t('onboarding.tour.bodyCreated') : t('onboarding.tour.bodyEmpty')}
      </p>

      <div className="space-y-3">
        <TourItem
          icon={<Home className="w-5 h-5 text-honey-600 dark:text-honey-400" />}
          title={t('nav.home')}
          description={t('onboarding.tour.home')}
        />
        <TourItem
          icon={<CalculatorIcon className="w-5 h-5 text-honey-600 dark:text-honey-400" />}
          title={t('nav.calculate')}
          description={t('onboarding.tour.calculate')}
        />
        <TourItem
          icon={<Beaker className="w-5 h-5 text-honey-600 dark:text-honey-400" />}
          title={t('nav.starters')}
          description={t('onboarding.tour.starters')}
        />
        <TourItem
          icon={<BookOpen className="w-5 h-5 text-honey-600 dark:text-honey-400" />}
          title={t('nav.book')}
          description={t('onboarding.tour.book')}
        />
      </div>
    </div>
  );
}

function TourItem({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 p-3 bg-surface1 dark:bg-surfaceDark1 rounded-xl">
      <div className="flex-shrink-0 p-2 bg-honey-50 dark:bg-honey-900/20 rounded-lg">{icon}</div>
      <div>
        <h3 className="text-sm font-medium text-crust-800 dark:text-crumb-100">{title}</h3>
        <p className="text-xs text-crust-500 dark:text-crumb-500 mt-0.5">{description}</p>
      </div>
    </div>
  );
}
