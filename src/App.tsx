import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { App as CapApp } from '@capacitor/app';
import { TabBar } from './components/ui';
import { AddStarterModal, AddRecipeModal, FeedingModal, StartBakeModal, PlanBakeModal } from './components/modals';
import { PermissionPrompt } from './components/PermissionPrompt';
import { useAppStore } from './stores/appStore';
import { useSettingsStore } from './stores/settingsStore';
import { hasShownPermissionPrompt } from './lib/permissions';
import { initializeNotifications, migrateNotificationScheme, rescheduleFeedingReminder } from './lib/notifications';
import { DEFAULT_RECIPES } from './data/defaultRecipes';
import { db, generateUUID } from './lib/db';
import type { Recipe } from './types';
import {
  HomePage,
  CalculatorPage,
  StartersPage,
  StarterDetailPage,
  RecipeDetailPage,
  BakeDetailPage,
  ActiveBakePage,
  BookPage,
  SettingsPage,
} from './pages';

// Page components mapping
const pages = {
  home: HomePage,
  calculator: CalculatorPage,
  starters: StartersPage,
  book: BookPage,
  settings: SettingsPage,
};

function App() {
  const { activeTab, activePage, pageData, activeModal, modalData, closeModal, toast, hideToast, isOffline, goBack } = useAppStore();
  const { settings } = useSettingsStore();
  const [showPermissionPrompt, setShowPermissionPrompt] = useState(false);
  const [planBakeRecipe, setPlanBakeRecipe] = useState<import('./types').Recipe | null>(null);

  // Fetch recipe when plan-bake modal opens
  useEffect(() => {
    if (activeModal === 'plan-bake' && modalData) {
      const recipeId = (modalData as { recipeId?: string })?.recipeId;
      if (recipeId) {
        import('./lib/db').then(({ db }) => {
          db.recipes.where('uuid').equals(recipeId).first().then((recipe) => {
            setPlanBakeRecipe(recipe || null);
          });
        });
      }
    } else if (activeModal !== 'plan-bake') {
      setPlanBakeRecipe(null);
    }
  }, [activeModal, modalData]);

  // Initialize notifications on app startup, then migrate the notification-ID
  // scheme once (cancels stale notifications) and rebuild feeding reminders
  // from current starter data under the new collision-free IDs.
  useEffect(() => {
    const run = async () => {
      await initializeNotifications();
      const migrated = await migrateNotificationScheme();
      if (migrated && settings.notificationsEnabled) {
        const starters = await db.starters.toArray();
        for (const starter of starters) {
          await rescheduleFeedingReminder(
            starter,
            settings.feedingRemindersEnabled,
            settings.feedingReminderHours
          );
        }
      }
    };
    run();
    // Runs once on mount; settings are read at run time. Intentionally not
    // re-running on settings changes (migration is one-shot, guarded by a flag).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Check for first launch permission prompt
  useEffect(() => {
    // Small delay to let app render first
    const timer = setTimeout(() => {
      if (!hasShownPermissionPrompt()) {
        setShowPermissionPrompt(true);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  // Auto-add default recipes on startup and clean up duplicates
  useEffect(() => {
    const addDefaultRecipes = async () => {
      try {
        const now = new Date();

        // Identity key for a recipe: prefer slug (stable), fall back to name
        // for legacy templates that predate slugs.
        const keyOf = (r: { slug?: string; name: string }) => r.slug ?? r.name;

        // Map of default recipes by their identity key for quick lookup
        const defaultRecipeMap = new Map(DEFAULT_RECIPES.map(r => [keyOf(r), r]));

        // Clean up ALL duplicate recipes (keep only the first one of each key)
        const allRecipes = await db.recipes.toArray();
        const seenKeys = new Map<string, number>();
        const duplicateIds: number[] = [];

        // Sort by id to keep the oldest (first added) version
        allRecipes.sort((a, b) => (a.id || 0) - (b.id || 0));

        for (const recipe of allRecipes) {
          if (recipe.id !== undefined) {
            const key = keyOf(recipe);
            // For default recipes, keep only one copy and update it
            const defaultRecipe = defaultRecipeMap.get(key);
            if (defaultRecipe) {
              if (seenKeys.has(key)) {
                // This is a duplicate - delete it
                duplicateIds.push(recipe.id);
              } else {
                // First occurrence - keep it and sync with default template
                seenKeys.set(key, recipe.id);
                // Update to ensure isBuiltIn, slug and photo are set
                await db.recipes.update(recipe.id, {
                  isBuiltIn: true,
                  slug: defaultRecipe.slug ?? recipe.slug,
                  photo: defaultRecipe.photo || recipe.photo,
                });
              }
            }
          }
        }

        // Delete duplicate recipes
        if (duplicateIds.length > 0) {
          await db.recipes.bulkDelete(duplicateIds);
          console.log(`Cleaned up ${duplicateIds.length} duplicate recipes`);
        }

        // Now add any missing default recipes (idempotent upsert on slug/name)
        for (const template of DEFAULT_RECIPES) {
          const existing = template.slug
            ? await db.recipes.filter((r) => r.slug === template.slug).first()
            : await db.recipes.where('name').equals(template.name).first();
          if (!existing) {
            await db.recipes.add({
              ...template,
              uuid: generateUUID(),
              isBuiltIn: true,
              createdAt: now,
              updatedAt: now,
            } as Recipe);
          }
        }
      } catch (error) {
        console.error('Failed to add default recipes:', error);
      }
    };
    addDefaultRecipes();
  }, []);

  // Handle Android back button
  useEffect(() => {
    const backHandler = CapApp.addListener('backButton', () => {
      const didNavigate = goBack();
      if (!didNavigate) {
        // At root, minimize app instead of closing
        CapApp.minimizeApp();
      }
    });

    return () => {
      backHandler.then((handler) => handler.remove());
    };
  }, [goBack]);

  // Apply dark mode
  useEffect(() => {
    const root = document.documentElement;

    if (settings.darkMode === 'dark') {
      root.classList.add('dark');
    } else if (settings.darkMode === 'light') {
      root.classList.remove('dark');
    } else {
      // System preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (prefersDark) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    }
  }, [settings.darkMode]);

  // Auto-hide toast
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(hideToast, toast.duration);
      return () => clearTimeout(timer);
    }
  }, [toast, hideToast]);

  const ActivePage = pages[activeTab];

  return (
    <div className="h-full flex flex-col bg-warmWhite dark:bg-charcoal">
      {/* Skip to content link for accessibility */}
      <a
        href="#main-content"
        className="skip-to-content"
      >
        Skip to main content
      </a>

      {/* Offline Banner */}
      <AnimatePresence>
        {isOffline && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="flex-shrink-0 bg-warning-500 text-white text-center text-sm py-2 px-4 overflow-hidden"
          >
            You're offline. Your data is saved on this device.
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content - Only scrolls when needed */}
      <div id="main-content" className="flex-1 overflow-auto overscroll-none" tabIndex={-1}>
        <AnimatePresence mode="wait">
          {activePage ? (
            <motion.main
              key={activePage}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="min-h-full"
            >
              {activePage === 'starter-detail' && (pageData as { starterId: string })?.starterId && (
                <StarterDetailPage starterId={(pageData as { starterId: string }).starterId} />
              )}
              {activePage === 'recipe-detail' && (pageData as { recipeId: string })?.recipeId && (
                <RecipeDetailPage recipeId={(pageData as { recipeId: string }).recipeId} />
              )}
              {activePage === 'bake-detail' && (pageData as { bakeId: string })?.bakeId && (
                <BakeDetailPage bakeId={(pageData as { bakeId: string }).bakeId} />
              )}
              {activePage === 'active-bake' && (
                <ActiveBakePage timelineId={(pageData as { timelineId?: string })?.timelineId} />
              )}
            </motion.main>
          ) : (
            <motion.main
              key={activeTab}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="min-h-full"
            >
              <ActivePage />
            </motion.main>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom Navigation - Fixed */}
      <TabBar />

      {/* Modals */}
      <AddStarterModal
        isOpen={activeModal === 'new-starter'}
        onClose={closeModal}
      />
      <FeedingModal
        isOpen={activeModal === 'feed-starter'}
        onClose={closeModal}
        preselectedStarterId={(modalData as { starterId?: string })?.starterId}
      />
      <StartBakeModal
        isOpen={activeModal === 'start-bake'}
        onClose={closeModal}
      />
      <AddRecipeModal
        isOpen={activeModal === 'new-recipe'}
        onClose={closeModal}
      />
      <PlanBakeModal
        isOpen={activeModal === 'plan-bake'}
        onClose={closeModal}
        recipe={planBakeRecipe}
      />

      {/* Permission Prompt (first launch only) */}
      <PermissionPrompt
        isOpen={showPermissionPrompt}
        onClose={() => setShowPermissionPrompt(false)}
      />

      {/* Toast Notifications */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-24 left-4 right-4 z-50"
          >
            <div
              className={`
                px-4 py-3 rounded-xl shadow-lg text-center font-medium
                ${toast.type === 'success'
                  ? 'bg-success-500 text-white'
                  : toast.type === 'error'
                  ? 'bg-error-500 text-white'
                  : toast.type === 'warning'
                  ? 'bg-warning-500 text-white'
                  : 'bg-crust-800 text-white dark:bg-crumb-100 dark:text-crust-800'
                }
              `}
            >
              {toast.message}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;
