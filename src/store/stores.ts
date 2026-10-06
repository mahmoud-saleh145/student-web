'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { Language } from '@/i18n/dictionaries';

interface LanguageState {
  language: Language;
  setLanguage: (l: Language) => void;
}

export const useLanguageStore = create<LanguageState>()(
  persist(
    (set) => ({
      language: 'ar',
      setLanguage: (language) => set({ language }),
    }),
    { name: 'edu-web-language' }
  )
);

export type ThemePreference = 'system' | 'light' | 'dark';

interface ThemeState {
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      preference: 'system',
      setPreference: (preference) => set({ preference }),
    }),
    { name: 'edu-web-theme' }
  )
);

export type QualityLevel = 'auto' | '144p' | '240p' | '360p' | '480p' | '720p' | '1080p';
export const QUALITY_LEVELS: QualityLevel[] = ['auto', '144p', '240p', '360p', '480p', '720p', '1080p'];
export type PlaybackRate = 0.5 | 0.75 | 1 | 1.25 | 1.5 | 2;
export const PLAYBACK_RATES: PlaybackRate[] = [0.5, 0.75, 1, 1.25, 1.5, 2];

interface PlayerState {
  preferredQuality: QualityLevel;
  rate: PlaybackRate;
  autoplayNext: boolean;
  captionsEnabled: boolean;
  dataSaver: boolean;
  setPreferredQuality: (q: QualityLevel) => void;
  setRate: (r: PlaybackRate) => void;
  setAutoplayNext: (v: boolean) => void;
  setCaptionsEnabled: (v: boolean) => void;
  setDataSaver: (v: boolean) => void;
}

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set) => ({
      preferredQuality: 'auto',
      rate: 1,
      autoplayNext: true,
      captionsEnabled: true,
      dataSaver: false,
      setPreferredQuality: (preferredQuality) => set({ preferredQuality }),
      setRate: (rate) => set({ rate }),
      setAutoplayNext: (autoplayNext) => set({ autoplayNext }),
      setCaptionsEnabled: (captionsEnabled) => set({ captionsEnabled }),
      setDataSaver: (dataSaver) => set({ dataSaver }),
    }),
    { name: 'edu-web-player' }
  )
);

export interface Toast {
  id: number;
  kind: 'success' | 'error' | 'info';
  message: string;
}

interface UiState {
  toasts: Toast[];
  push: (kind: Toast['kind'], message: string) => void;
  dismiss: (id: number) => void;
}

let toastId = 0;

export const useUiStore = create<UiState>()((set) => ({
  toasts: [],
  push: (kind, message) => {
    toastId += 1;
    const id = toastId;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, kind, message }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 4500);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export const toast = {
  success: (message: string) => useUiStore.getState().push('success', message),
  error: (message: string) => useUiStore.getState().push('error', message),
  info: (message: string) => useUiStore.getState().push('info', message),
};
