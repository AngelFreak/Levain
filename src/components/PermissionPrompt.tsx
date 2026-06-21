import { Bell, Timer } from 'lucide-react';
import { BottomSheet, Button } from './ui';
import { requestNotificationPermission, markPermissionPromptShown } from '../lib/permissions';
import { useAppStore } from '../stores/appStore';

interface PermissionPromptProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PermissionPrompt({ isOpen, onClose }: PermissionPromptProps) {
  const { showToast } = useAppStore();

  const handleEnable = async () => {
    markPermissionPromptShown();
    const granted = await requestNotificationPermission();

    if (granted) {
      showToast('Notifications enabled!', 'success');
    } else {
      showToast('Notifications disabled. You can enable them in Settings.', 'info');
    }
    onClose();
  };

  const handleSkip = () => {
    markPermissionPromptShown();
    onClose();
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={handleSkip} title="Stay on Track">
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
            Never Miss a Step
          </h3>
          <p className="text-sm text-crust-600 dark:text-crumb-400">
            Get reminders for starter feedings and bake timers so your bread turns out perfect every time.
          </p>
        </div>

        {/* Feature list */}
        <div className="space-y-3">
          <FeatureItem
            icon={<Timer className="w-5 h-5 text-honey-600 dark:text-honey-400" />}
            title="Bake Timers"
            description="Alerts for each step: autolyse, folds, shaping, and baking"
          />
          <FeatureItem
            icon={<Bell className="w-5 h-5 text-honey-600 dark:text-honey-400" />}
            title="Feeding Reminders"
            description="Keep your starter healthy with scheduled feeding alerts"
          />
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3 pt-2">
          <Button onClick={handleEnable} fullWidth>
            Enable Notifications
          </Button>
          <button
            onClick={handleSkip}
            className="text-sm text-crust-500 dark:text-crumb-500 hover:text-crust-700 dark:hover:text-crumb-300 py-2"
          >
            Maybe Later
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
