import { Bell, Timer } from 'lucide-react';
import { BottomSheet, Button } from './ui';
import { requestNotificationPermission, markPermissionPromptShown } from '../lib/permissions';
import { useAppStore } from '../stores/appStore';
import { useTranslation } from '../lib/i18n/useTranslation';

interface PermissionPromptProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PermissionPrompt({ isOpen, onClose }: PermissionPromptProps) {
  const { showToast } = useAppStore();
  const { t } = useTranslation();

  const handleEnable = async () => {
    markPermissionPromptShown();
    const granted = await requestNotificationPermission();

    if (granted) {
      showToast(t('permission.toastEnabled'), 'success');
    } else {
      showToast(t('permission.toastDisabled'), 'info');
    }
    onClose();
  };

  const handleSkip = () => {
    markPermissionPromptShown();
    onClose();
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={handleSkip} title={t('permission.title')}>
      <div className="space-y-6">
        {/* Hero illustration */}
        <div className="flex justify-center">
          <div className="relative">
            <div className="p-4 bg-honey-100 dark:bg-honey-900/30 rounded-2xl">
              <Bell className="w-12 h-12 text-honey-600 dark:text-honey-400" />
            </div>
            <div className="absolute -top-1 -right-1 p-1.5 bg-crust-600 dark:bg-honey-600 rounded-full">
              <Timer className="w-4 h-4 text-white" />
            </div>
          </div>
        </div>

        {/* Benefits */}
        <div className="text-center space-y-2">
          <h3 className="text-lg font-display font-semibold text-crust-800 dark:text-crumb-100">
            {t('permission.heading')}
          </h3>
          <p className="text-sm text-crust-600 dark:text-crumb-400">
            {t('permission.description')}
          </p>
        </div>

        {/* Feature list */}
        <div className="space-y-3">
          <FeatureItem
            icon={<Timer className="w-5 h-5 text-honey-600 dark:text-honey-400" />}
            title={t('permission.bakeTimersTitle')}
            description={t('permission.bakeTimersDescription')}
          />
          <FeatureItem
            icon={<Bell className="w-5 h-5 text-honey-600 dark:text-honey-400" />}
            title={t('permission.feedingRemindersTitle')}
            description={t('permission.feedingRemindersDescription')}
          />
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3 pt-2">
          <Button onClick={handleEnable} fullWidth>
            {t('permission.enableButton')}
          </Button>
          <button
            onClick={handleSkip}
            className="text-sm text-crust-500 dark:text-crumb-500 hover:text-crust-700 dark:hover:text-crumb-300 py-2"
          >
            {t('permission.maybeLater')}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}

function FeatureItem({
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
      <div className="flex-shrink-0 p-2 bg-honey-50 dark:bg-honey-900/20 rounded-lg">
        {icon}
      </div>
      <div>
        <h4 className="text-sm font-medium text-crust-800 dark:text-crumb-100">
          {title}
        </h4>
        <p className="text-xs text-crust-500 dark:text-crumb-500 mt-0.5">
          {description}
        </p>
      </div>
    </div>
  );
}
