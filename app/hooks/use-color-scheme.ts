import { useColorScheme as useNativeColorScheme } from 'react-native';
import { useAppStore } from '@/stores/app-store';

export function useColorScheme() {
  const system = useNativeColorScheme();
  const override = useAppStore((s) => s.themeOverride);
  return override ?? system;
}
