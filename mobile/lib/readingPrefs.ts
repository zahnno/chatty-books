import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ReadingThemeKey } from './theme';

export type ReadingPrefs = { theme: ReadingThemeKey; fontSize: number };

const KEY = 'readingPrefs';
const DEFAULTS: ReadingPrefs = { theme: 'paper', fontSize: 18 };
export const FONT_SIZES = { min: 14, max: 26, step: 2 };

// Reader theme + text size, persisted on the device.
export function useReadingPrefs() {
  const [prefs, setPrefs] = useState<ReadingPrefs>(DEFAULTS);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => v && setPrefs({ ...DEFAULTS, ...JSON.parse(v) }))
      .catch(() => {});
  }, []);

  const update = useCallback((patch: Partial<ReadingPrefs>) => {
    setPrefs((cur) => {
      const next = { ...cur, ...patch };
      AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  return [prefs, update] as const;
}
