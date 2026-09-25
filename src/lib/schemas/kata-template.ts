import { z } from 'zod';

export const KataTemplateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1, 'Name is required').max(50, 'Name cannot exceed 50 characters'),
  mode: z.enum(['timed', 'reps']),
  defaultDurationMinutes: z.number().int().positive().nullable().optional(),
  defaultReps: z.number().int().positive().nullable().optional(),
  softCapMinutes: z.number().int().positive().max(600).nullable().optional(),
  activityLabel: z.string().max(50).optional(),
  defaultNote: z.string().max(500).optional(),
  icon: z.string().max(10).default('🥋'),
  order: z.number().int().default(0),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type KataTemplate = z.infer<typeof KataTemplateSchema>;

export const KataTemplateInputSchema = KataTemplateSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).partial({
  icon: true,
  order: true,
});

export type KataTemplateInput = z.infer<typeof KataTemplateInputSchema>;

export const DEFAULT_KATA_TEMPLATES: Omit<KataTemplate, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: 'Morning Zazen',
    mode: 'timed',
    defaultDurationMinutes: 20,
    activityLabel: 'Meditation',
    defaultNote: 'Stillness, posture, and breath awareness.',
    icon: '🧘',
    order: 0,
  },
  {
    name: 'Deep Work Sprint',
    mode: 'timed',
    defaultDurationMinutes: 45,
    activityLabel: 'Deep Work',
    defaultNote: 'Single-task flow on the highest leverage problem.',
    icon: '⚡',
    order: 1,
  },
  {
    name: 'Kata Reps',
    mode: 'reps',
    defaultReps: 50,
    activityLabel: 'Forms Practice',
    defaultNote: 'Deliberate form repetition with slow precision.',
    icon: '🥋',
    order: 2,
  },
];
