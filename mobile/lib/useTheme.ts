import { useColorScheme } from 'react-native';
import { palettes, Theme } from './theme';

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? palettes.dark : palettes.light;
}
