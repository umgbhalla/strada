// Shim for next-themes using strada's useIsDark hook.

import { useIsDark } from '../lib/utils.ts';

export function useTheme() {
  const isDark = useIsDark();
  return {
    resolvedTheme: isDark ? 'dark' : 'light',
    theme: isDark ? 'dark' : 'light',
    setTheme: (_theme: string) => {},
  };
}
