import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface UINotification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  duration?: number;
  persistent?: boolean;
  action?: {
    label: string;
    handler: () => void;
  };
  createdAt: Date;
}

export interface Modal {
  id: string;
  type: 'confirmation' | 'form' | 'info' | 'custom';
  title: string;
  content?: string;
  component?: string;
  props?: any;
  onConfirm?: () => void;
  onCancel?: () => void;
  confirmText?: string;
  cancelText?: string;
  isOpen: boolean;
}

export interface LoadingState {
  [key: string]: boolean;
}

interface UIState {
  theme: 'light' | 'dark' | 'auto';
  isSidebarOpen: boolean;
  isMobileMenuOpen: boolean;
  notifications: UINotification[];
  modals: Modal[];
  loadingStates: LoadingState;
  isOnline: boolean;
  screenSize: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  scrollPosition: number;
  lastActiveTime: Date;
  isFullscreen: boolean;
  language: string;
  currency: string;
  timezone: string;
  animations: boolean;
  soundEnabled: boolean;
  keyboardShortcuts: boolean;
}

const initialState: UIState = {
  theme: (localStorage.getItem('theme') as 'light' | 'dark' | 'auto') || 'auto',
  isSidebarOpen: window.innerWidth >= 1024, // Open by default on large screens
  isMobileMenuOpen: false,
  notifications: [],
  modals: [],
  loadingStates: {},
  isOnline: navigator.onLine,
  screenSize: getScreenSize(),
  scrollPosition: 0,
  lastActiveTime: new Date(),
  isFullscreen: false,
  language: localStorage.getItem('language') || 'en',
  currency: localStorage.getItem('currency') || 'USD',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  animations: localStorage.getItem('animations') !== 'false',
  soundEnabled: localStorage.getItem('soundEnabled') !== 'false',
  keyboardShortcuts: localStorage.getItem('keyboardShortcuts') !== 'false',
};

function getScreenSize(): 'xs' | 'sm' | 'md' | 'lg' | 'xl' {
  const width = window.innerWidth;
  if (width < 640) return 'xs';
  if (width < 768) return 'sm';
  if (width < 1024) return 'md';
  if (width < 1280) return 'lg';
  return 'xl';
}

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setTheme: (state, action: PayloadAction<'light' | 'dark' | 'auto'>) => {
      state.theme = action.payload;
      localStorage.setItem('theme', action.payload);
    },
    toggleSidebar: (state) => {
      state.isSidebarOpen = !state.isSidebarOpen;
    },
    setSidebarOpen: (state, action: PayloadAction<boolean>) => {
      state.isSidebarOpen = action.payload;
    },
    toggleMobileMenu: (state) => {
      state.isMobileMenuOpen = !state.isMobileMenuOpen;
    },
    setMobileMenuOpen: (state, action: PayloadAction<boolean>) => {
      state.isMobileMenuOpen = action.payload;
    },
    addNotification: (state, action: PayloadAction<Omit<UINotification, 'id' | 'createdAt'>>) => {
      const notification: UINotification = {
        ...action.payload,
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        createdAt: new Date(),
      };
      state.notifications.push(notification);
    },
    removeNotification: (state, action: PayloadAction<string>) => {
      state.notifications = state.notifications.filter(n => n.id !== action.payload);
    },
    clearNotifications: (state) => {
      state.notifications = [];
    },
    openModal: (state, action: PayloadAction<Omit<Modal, 'id' | 'isOpen'>>) => {
      const modal: Modal = {
        ...action.payload,
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        isOpen: true,
      };
      state.modals.push(modal);
    },
    closeModal: (state, action: PayloadAction<string>) => {
      const modal = state.modals.find(m => m.id === action.payload);
      if (modal) {
        modal.isOpen = false;
      }
    },
    removeModal: (state, action: PayloadAction<string>) => {
      state.modals = state.modals.filter(m => m.id !== action.payload);
    },
    clearModals: (state) => {
      state.modals = [];
    },
    setLoading: (state, action: PayloadAction<{ key: string; isLoading: boolean }>) => {
      const { key, isLoading } = action.payload;
      if (isLoading) {
        state.loadingStates[key] = true;
      } else {
        delete state.loadingStates[key];
      }
    },
    setOnlineStatus: (state, action: PayloadAction<boolean>) => {
      state.isOnline = action.payload;
    },
    setScreenSize: (state, action: PayloadAction<'xs' | 'sm' | 'md' | 'lg' | 'xl'>) => {
      state.screenSize = action.payload;
      // Auto-close sidebar on small screens
      if (action.payload === 'xs' || action.payload === 'sm') {
        state.isSidebarOpen = false;
        state.isMobileMenuOpen = false;
      }
    },
    setScrollPosition: (state, action: PayloadAction<number>) => {
      state.scrollPosition = action.payload;
    },
    updateLastActiveTime: (state) => {
      state.lastActiveTime = new Date();
    },
    setFullscreen: (state, action: PayloadAction<boolean>) => {
      state.isFullscreen = action.payload;
    },
    setLanguage: (state, action: PayloadAction<string>) => {
      state.language = action.payload;
      localStorage.setItem('language', action.payload);
    },
    setCurrency: (state, action: PayloadAction<string>) => {
      state.currency = action.payload;
      localStorage.setItem('currency', action.payload);
    },
    setAnimations: (state, action: PayloadAction<boolean>) => {
      state.animations = action.payload;
      localStorage.setItem('animations', action.payload.toString());
    },
    setSoundEnabled: (state, action: PayloadAction<boolean>) => {
      state.soundEnabled = action.payload;
      localStorage.setItem('soundEnabled', action.payload.toString());
    },
    setKeyboardShortcuts: (state, action: PayloadAction<boolean>) => {
      state.keyboardShortcuts = action.payload;
      localStorage.setItem('keyboardShortcuts', action.payload.toString());
    },
    showSuccessNotification: (state, action: PayloadAction<{ title: string; message: string }>) => {
      const notification: UINotification = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        type: 'success',
        title: action.payload.title,
        message: action.payload.message,
        duration: 5000,
        createdAt: new Date(),
      };
      state.notifications.push(notification);
    },
    showErrorNotification: (state, action: PayloadAction<{ title: string; message: string }>) => {
      const notification: UINotification = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        type: 'error',
        title: action.payload.title,
        message: action.payload.message,
        duration: 8000,
        createdAt: new Date(),
      };
      state.notifications.push(notification);
    },
    showWarningNotification: (state, action: PayloadAction<{ title: string; message: string }>) => {
      const notification: UINotification = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        type: 'warning',
        title: action.payload.title,
        message: action.payload.message,
        duration: 6000,
        createdAt: new Date(),
      };
      state.notifications.push(notification);
    },
    showInfoNotification: (state, action: PayloadAction<{ title: string; message: string }>) => {
      const notification: UINotification = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        type: 'info',
        title: action.payload.title,
        message: action.payload.message,
        duration: 5000,
        createdAt: new Date(),
      };
      state.notifications.push(notification);
    },
    showConfirmationModal: (state, action: PayloadAction<{
      title: string;
      content: string;
      onConfirm: () => void;
      onCancel?: () => void;
      confirmText?: string;
      cancelText?: string;
    }>) => {
      const modal: Modal = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        type: 'confirmation',
        title: action.payload.title,
        content: action.payload.content,
        onConfirm: action.payload.onConfirm,
        onCancel: action.payload.onCancel,
        confirmText: action.payload.confirmText || 'Confirm',
        cancelText: action.payload.cancelText || 'Cancel',
        isOpen: true,
      };
      state.modals.push(modal);
    },
  },
});

export const {
  setTheme,
  toggleSidebar,
  setSidebarOpen,
  toggleMobileMenu,
  setMobileMenuOpen,
  addNotification,
  removeNotification,
  clearNotifications,
  openModal,
  closeModal,
  removeModal,
  clearModals,
  setLoading,
  setOnlineStatus,
  setScreenSize,
  setScrollPosition,
  updateLastActiveTime,
  setFullscreen,
  setLanguage,
  setCurrency,
  setAnimations,
  setSoundEnabled,
  setKeyboardShortcuts,
  showSuccessNotification,
  showErrorNotification,
  showWarningNotification,
  showInfoNotification,
  showConfirmationModal,
} = uiSlice.actions;

export default uiSlice.reducer;