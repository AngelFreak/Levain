import { create } from 'zustand';

// Global UI state for the app
interface AppState {
  // Navigation
  activeTab: TabName;
  tabHistory: TabName[];
  setActiveTab: (tab: TabName) => void;
  goBack: () => boolean; // Returns true if navigated back, false if at root

  // Detail page navigation
  activePage: PageType | null;
  pageData: unknown;
  navigateTo: (page: PageType, data?: unknown) => void;
  goBackFromPage: () => void;

  // Active bake state
  hasActiveBake: boolean;
  activeBakeId: string | null;
  setActiveBake: (id: string | null) => void;

  // One-shot "open Book at this recipe category" intent, consumed by BookPage
  // on mount/update (e.g. the "use your discard" prompt deep-links here).
  bookIntent: { category: string } | null;
  openBookAtCategory: (category: string) => void;
  consumeBookIntent: () => void;

  // Modal/Sheet state
  activeModal: ModalType | null;
  modalData: unknown;
  openModal: (modal: ModalType, data?: unknown) => void;
  closeModal: () => void;

  // Loading states
  isLoading: boolean;
  loadingMessage: string;
  setLoading: (loading: boolean, message?: string) => void;

  // Toast/notifications
  toast: ToastMessage | null;
  showToast: (message: string, type?: ToastType, duration?: number) => void;
  hideToast: () => void;

  // Offline status
  isOffline: boolean;
  setOffline: (offline: boolean) => void;
}

export type TabName = 'home' | 'calculator' | 'starters' | 'book' | 'settings';

export type PageType = 'starter-detail' | 'bake-detail' | 'bake-compare' | 'recipe-detail' | 'active-bake';

export type ModalType =
  | 'new-starter'
  | 'feed-starter'
  | 'new-recipe'
  | 'edit-recipe'
  | 'start-bake'
  | 'plan-bake'
  | 'photo-capture'
  | 'ai-analysis'
  | 'timer';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastMessage {
  message: string;
  type: ToastType;
  duration: number;
}

export const useAppStore = create<AppState>((set, get) => ({
  // Navigation with history
  activeTab: 'home',
  tabHistory: ['home'],
  setActiveTab: (tab) => {
    const { activeTab, tabHistory, activePage } = get();

    // If on a detail page, close it first
    if (activePage) {
      set({ activePage: null, pageData: null });
    }

    if (tab === activeTab && !activePage) return;

    // Add to history (limit to 20 entries)
    const newHistory = [...tabHistory, tab].slice(-20);
    set({ activeTab: tab, tabHistory: newHistory });
  },
  goBack: () => {
    const { tabHistory, activeModal, activePage } = get();

    // If modal is open, close it first
    if (activeModal) {
      set({ activeModal: null, modalData: null });
      return true;
    }

    // If on a detail page, go back to tab view
    if (activePage) {
      set({ activePage: null, pageData: null });
      return true;
    }

    // If we have history, go back
    if (tabHistory.length > 1) {
      const newHistory = tabHistory.slice(0, -1);
      const previousTab = newHistory[newHistory.length - 1];
      set({ activeTab: previousTab, tabHistory: newHistory });
      return true;
    }

    // At root (home), return false to let app close
    return false;
  },

  // Detail page navigation
  activePage: null,
  pageData: null,
  navigateTo: (page, data = null) =>
    set({ activePage: page, pageData: data }),
  goBackFromPage: () => set({ activePage: null, pageData: null }),

  // Active bake
  hasActiveBake: false,
  activeBakeId: null,
  setActiveBake: (id) =>
    set({
      activeBakeId: id,
      hasActiveBake: id !== null,
    }),

  // Book deep-link intent
  bookIntent: null,
  openBookAtCategory: (category) => {
    // Switch to the Book tab and stash the category for BookPage to consume.
    get().setActiveTab('book');
    set({ bookIntent: { category }, activePage: null, pageData: null });
  },
  consumeBookIntent: () => set({ bookIntent: null }),

  // Modals
  activeModal: null,
  modalData: null,
  openModal: (modal, data = null) =>
    set({ activeModal: modal, modalData: data }),
  closeModal: () => set({ activeModal: null, modalData: null }),

  // Loading
  isLoading: false,
  loadingMessage: '',
  setLoading: (loading, message = '') =>
    set({ isLoading: loading, loadingMessage: message }),

  // Toast
  toast: null,
  showToast: (message, type = 'info', duration = 3000) =>
    set({ toast: { message, type, duration } }),
  hideToast: () => set({ toast: null }),

  // Offline
  isOffline: !navigator.onLine,
  setOffline: (offline) => set({ isOffline: offline }),
}));

// Listen for online/offline events
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => useAppStore.getState().setOffline(false));
  window.addEventListener('offline', () => useAppStore.getState().setOffline(true));
}

// Selectors
export const useActiveTab = () => useAppStore((s) => s.activeTab);
export const useHasActiveBake = () => useAppStore((s) => s.hasActiveBake);
export const useIsOffline = () => useAppStore((s) => s.isOffline);
export const useToast = () => useAppStore((s) => s.toast);
