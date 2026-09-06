export interface KataIconCategory {
  label: string;
  icons: string[];
}

/** Categorized icon choices for kata templates (legacy 10 all preserved). */
export const KATA_ICON_CATEGORIES: KataIconCategory[] = [
  { label: 'Mind', icons: ['🧘', '🧠', '📿', '🕯️', '🌙', '☯️'] },
  { label: 'Movement', icons: ['🥋', '🏃', '🚴', '🏋️', '🧗', '🥊'] },
  { label: 'Craft & Work', icons: ['💻', '📖', '✍️', '🎨', '🎸', '⚡', '🔬'] },
  { label: 'Life', icons: ['🔥', '🌊', '🎯', '🌱', '⭐', '🍵'] },
];

export const ALL_KATA_ICONS: string[] = KATA_ICON_CATEGORIES.flatMap((c) => c.icons);
