import { useEffect, useState } from 'react';
import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// App-wide light/dark choice. 'system' follows the OS. Applying it through
// Appearance.setColorScheme means useColorScheme() (and so useTheme) and native UI
// (alerts, keyboards, pickers) all switch together.
export type AppearancePref = 'system' | 'light' | 'dark';

const KEY = 'appearancePref';
let current: AppearancePref = 'system';
const listeners = new Set<(p: AppearancePref) => void>();

function apply(pref: AppearancePref) {
  current = pref;
  Appearance.setColorScheme(pref === 'system' ? null : pref);
  listeners.forEach((l) => l(pref));
}

// Called once at launch, before the splash screen hides, so there's no flash of the
// wrong theme.
export async function loadAppearancePref() {
  try {
    const v = await AsyncStorage.getItem(KEY);
    if (v === 'light' || v === 'dark') apply(v);
  } catch {}
}

export function setAppearancePref(pref: AppearancePref) {
  apply(pref);
  AsyncStorage.setItem(KEY, pref).catch(() => {});
}

export function useAppearancePref() {
  const [pref, setPref] = useState(current);
  useEffect(() => {
    listeners.add(setPref);
    return () => {
      listeners.delete(setPref);
    };
  }, []);
  return [pref, setAppearancePref] as const;
}
