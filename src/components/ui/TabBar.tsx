import { motion } from 'framer-motion';
import {
  Home,
  Calculator,
  Beaker,
  BookOpen,
  type LucideIcon,
} from 'lucide-react';
import { useAppStore, type TabName } from '../../stores/appStore';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { useSettingsStore } from '../../stores/settingsStore';
import { springs } from '../../lib/motion';
import { useTranslation } from '../../lib/i18n/useTranslation';
import type { TranslationKey } from '../../lib/i18n';

interface TabItem {
  id: TabName;
  labelKey: TranslationKey;
  icon: LucideIcon;
}

const tabs: TabItem[] = [
  { id: 'home', labelKey: 'nav.home', icon: Home },
  { id: 'calculator', labelKey: 'nav.calculate', icon: Calculator },
  { id: 'starters', labelKey: 'nav.starters', icon: Beaker },
  { id: 'book', labelKey: 'nav.book', icon: BookOpen },
];

export function TabBar() {
  const { activeTab, setActiveTab, hasActiveBake } = useAppStore();
  const hapticEnabled = useSettingsStore((s) => s.settings.hapticFeedbackEnabled);
  const { t } = useTranslation();

  const handleTabPress = async (tabId: TabName) => {
    if (tabId === activeTab) return;

    if (hapticEnabled) {
      try {
        await Haptics.impact({ style: ImpactStyle.Light });
      } catch {
        // Haptics not available
      }
    }

    setActiveTab(tabId);
  };

  return (
    <nav
      className="flex-shrink-0 bg-surface1 dark:bg-surfaceDark1 border-t border-crumb-400/40 dark:border-crust-600/60 pb-safe"
      role="navigation"
      aria-label="Main navigation"
    >
      <div className="flex items-center justify-around px-2 py-1">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          const label = t(tab.labelKey);

          return (
            <button
              key={tab.id}
              onClick={() => handleTabPress(tab.id)}
              className="relative flex flex-col items-center justify-center py-2 px-3 min-w-[64px] touch-target rounded-2xl transition-colors"
              aria-label={label}
              aria-current={isActive ? 'page' : undefined}
            >
              {/* MD3 Pill indicator background - more visible */}
              {isActive && (
                <motion.div
                  layoutId="tabPillIndicator"
                  className="absolute inset-x-1 top-1 h-8 bg-crumb-300 dark:bg-surfaceDark4 rounded-full shadow-sm"
                  transition={springs.snappy}
                />
              )}

              <div className="relative z-10 flex flex-col items-center">
                <div className="relative">
                  <Icon
                    className={`w-6 h-6 transition-colors duration-150 ${
                      isActive
                        ? 'text-crust-700 dark:text-honey-400'
                        : 'text-crust-500 dark:text-crumb-600'
                    }`}
                  />
                  {/* Active bake indicator on Home tab */}
                  {tab.id === 'home' && hasActiveBake && (
                    <motion.span
                      className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-success-500 rounded-full"
                      animate={{
                        scale: [1, 1.2, 1],
                        opacity: [1, 0.8, 1],
                      }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: 'easeInOut',
                      }}
                    />
                  )}
                </div>
                <span
                  className={`text-label-sm mt-0.5 transition-colors duration-150 ${
                    isActive
                      ? 'text-crust-800 dark:text-honey-300 font-medium'
                      : 'text-crust-500 dark:text-crumb-600'
                  }`}
                >
                  {label}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
