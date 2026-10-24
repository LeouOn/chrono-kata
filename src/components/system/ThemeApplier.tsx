'use client';

import { useEffect } from 'react';
import { useSettings } from '@/hooks/useSettings';

export function ThemeApplier() {
  const { settings } = useSettings();

  useEffect(() => {
    const theme = settings?.theme ?? 'system';
    const accent = settings?.accentColor ?? 'amber';
    const highContrast = settings?.highContrast === true;

    if (theme === 'system') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
    document.documentElement.setAttribute('data-accent', accent);
    if (highContrast) document.documentElement.setAttribute('data-contrast', 'high');
    else document.documentElement.removeAttribute('data-contrast');

    try {
      localStorage.setItem('chrono-kata-theme', JSON.stringify({ theme, accent, highContrast }));
    } catch {
    }
  }, [settings?.theme, settings?.accentColor, settings?.highContrast]);

  return null;
}
