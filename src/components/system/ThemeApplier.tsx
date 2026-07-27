'use client';

import { useEffect } from 'react';
import { useSettings } from '@/hooks/useSettings';

export function ThemeApplier() {
  const { settings } = useSettings();

  useEffect(() => {
    const theme = settings?.theme ?? 'system';
    const accent = settings?.accentColor ?? 'amber';

    if (theme === 'system') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
    document.documentElement.setAttribute('data-accent', accent);

    try {
      localStorage.setItem('chrono-kata-theme', JSON.stringify({ theme, accent }));
    } catch {
    }
  }, [settings?.theme, settings?.accentColor]);

  return null;
}
