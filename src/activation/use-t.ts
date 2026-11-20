'use client';

import * as React from 'react';

import { dictionaries, type Language } from '@/i18n/dictionaries';
import { ApiError } from '@/lib/api-client';
import { errorMessageKey } from '@/lib/error-messages';
import { useLanguageStore } from '@/store/stores';

import { translateActivation } from './i18n';
import { activationErrorKey, type ActivationErrorContext } from './lib/errors';

export type ActivationT = (key: string, params?: Record<string, string | number>) => string;

/**
 * The portal's translator: its own words, then the platform's. The language
 * is the platform's language setting — one choice for the whole site.
 */
export function useActivationT(): { t: ActivationT; language: Language } {
  const language = useLanguageStore((s) => s.language) as Language;
  const t = React.useCallback<ActivationT>((key, params) => translateActivation(language, key, params), [language]);
  return { t, language };
}

const hasPlatformKey = (key: string): boolean => key in dictionaries.en;

/**
 * A translated sentence for a failure, in the portal's context. Never the
 * backend's raw `message`.
 */
export function activationErrorMessage(error: unknown, t: ActivationT, context: ActivationErrorContext = 'general'): string {
  if (!(error instanceof ApiError)) return t('errors.genericBody');
  const own = activationErrorKey(error.code, error.status, context);
  return t(own ?? errorMessageKey(error.code, error.status, hasPlatformKey));
}
