'use client';

import { Card } from '@/components/ui/Card';
import { useSettings } from '@/hooks/useSettings';
import type { ThemeMode, AccentColor, RatingStyle } from '@/lib/schemas/settings';
import { Sun, Moon, Monitor } from 'lucide-react';

const THEME_OPTIONS: Array<{ value: ThemeMode; label: string; icon: typeof Sun }> = [
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
];

const ACCENT_OPTIONS: Array<{ value: AccentColor; label: string; color: string }> = [
  { value: 'amber', label: 'Amber', color: '#f5a623' },
  { value: 'sage', label: 'Sage', color: '#7ba668' },
  { value: 'magenta', label: 'Magenta', color: '#d94977' },
  { value: 'cyan', label: 'Cyan', color: '#4ba3c7' },
];

const RATING_OPTIONS: Array<{ value: RatingStyle; label: string }> = [
  { value: 'slider', label: 'Slider' },
  { value: 'emoji', label: 'Emoji' },
  { value: 'dots', label: 'Dots' },
];

export function ThemeSettings() {
  const { settings, updateSettings } = useSettings();
  const currentTheme = settings?.theme ?? 'system';
  const currentAccent = settings?.accentColor ?? 'amber';
  const currentRating = settings?.ratingStyle ?? 'slider';

  return (
    <Card>
      <div className="text-xs uppercase tracking-wide text-text-muted mb-3">
        Appearance
      </div>

      <div className="mb-4">
        <div className="text-sm text-text mb-2">Theme</div>
        <div className="grid grid-cols-3 gap-2">
          {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
            const active = currentTheme === value;
            return (
              <button
                key={value}
                onClick={() => updateSettings({ theme: value })}
                className={`flex flex-col items-center gap-1 py-3 rounded-2xl border transition-colors ${
                  active
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-border bg-surface-2 text-text-muted'
                }`}
              >
                <Icon size={20} />
                <span className="text-xs">{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="text-sm text-text mb-2">Accent color</div>
        <div className="grid grid-cols-4 gap-2">
          {ACCENT_OPTIONS.map(({ value, label, color }) => {
            const active = currentAccent === value;
            return (
              <button
                key={value}
                onClick={() => updateSettings({ accentColor: value })}
                className={`flex flex-col items-center gap-1 py-3 rounded-2xl border transition-colors ${
                  active ? 'border-accent' : 'border-border bg-surface-2'
                }`}
              >
                <div
                  className="w-6 h-6 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span className={`text-xs ${active ? 'text-accent' : 'text-text-muted'}`}>
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-border">
        <div className="text-sm text-text mb-2">Rating style</div>
        <div className="grid grid-cols-3 gap-2">
          {RATING_OPTIONS.map(({ value, label }) => {
            const active = currentRating === value;
            return (
              <button
                key={value}
                onClick={() => updateSettings({ ratingStyle: value })}
                className={`py-3 rounded-2xl border transition-colors ${
                  active
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-border bg-surface-2 text-text-muted'
                }`}
              >
                <span className="text-sm">{label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
