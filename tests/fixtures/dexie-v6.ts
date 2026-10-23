/**
 * Synthetic raw Dexie v6 rows for migration tests.
 *
 * This is the on-disk shape at Dexie version 6 (see `src/lib/db/db.ts`) with
 * Date objects, matching what `seedLegacyDb()` in
 * `tests/unit/db/migrations.test.ts` expects to `bulkAdd()` into a raw Dexie
 * database before opening the current `ChronoKataDB`.
 *
 * No personal data: names, notes and timestamps are invented. Keep this file
 * valid at v6 forever; when a schema change lands, add a new fixture next to
 * it instead of editing these rows, so the migration test keeps covering the
 * old shape.
 */

const at = (iso: string) => new Date(iso);

const SESSION_1 = '96d32341-1143-4be2-9ce2-e9c495abcc12';
const SESSION_2 = 'a28b8a4a-e648-4601-8e46-a92b9c97bea3';
const SESSION_3 = '1b751ee7-ed3c-47b0-a35d-64d2d62d3bb3';
const TEMPLATE_ZAZEN = 'b7a04fe2-0b66-4d86-b40c-afa2b45af613';
const TEMPLATE_DEEP = '2fbc4ce1-2452-4dae-845c-414c9531500f';
const TEMPLATE_REPS = '04dd9f59-c012-46c3-88d8-9ccb715fa4e3';
const HABIT_SIT = 'c0dca0e9-d048-4f8e-92b5-116ec0d64eac';
const HABIT_JOURNAL = 'a0eed52a-da6c-4a0a-9763-ccbb77e84481';
const HABIT_READING = '355cde8a-d157-4665-a1eb-5eea9951df23';
const CONVERSATION_1 = '4dda19bd-8773-4053-bf79-37196f0f0868';
const MESSAGE_ROOT = '06d2d4b4-55f1-4a9b-b694-d71aa78315a3';
const MESSAGE_ANSWER = 'f5d29094-14a8-48e4-bc82-ee9b56a6d1a4';
const MESSAGE_BRANCH = '9a81a79e-efae-473c-8854-953e65b7566a';
const REFLECTION_1 = '84c2f018-1a34-4524-83a0-5582392e9756';

export const DEXIE_V6_FIXTURES: Record<string, Record<string, unknown>[]> = {
  sessions: [
    {
      id: SESSION_1,
      startedAt: at('2026-10-19T06:15:00.000Z'),
      endedAt: at('2026-10-19T06:35:00.000Z'),
      durationMinutes: 20,
      reps: null,
      rating: 4,
      activityLabel: 'Morning Zazen',
      note: 'Sat through the whole bell sequence without shifting.',
      coachComment:
        'Twenty quiet minutes, and you stayed with the bell rather than racing it. That is the practice.',
      coachPersonalityAtGeneration: 'zen',
      failedLLM: false,
      calendarEventId: null,
      focusRating: 4,
      energyRating: 3,
      moodRating: 4,
      conversationId: CONVERSATION_1,
      stoppedAtCap: false,
      kataTemplateId: TEMPLATE_ZAZEN,
      createdAt: at('2026-10-19T06:35:00.000Z'),
      updatedAt: at('2026-10-19T06:35:04.000Z'),
    },
    {
      id: SESSION_2,
      startedAt: at('2026-10-19T17:40:00.000Z'),
      endedAt: at('2026-10-19T17:52:00.000Z'),
      durationMinutes: 12.5,
      reps: null,
      rating: 3,
      activityLabel: 'Deep Work',
      note: 'Stopped at the soft cap instead of pushing through.',
      coachComment: null,
      failedLLM: true,
      calendarEventId: null,
      stoppedAtCap: true,
      kataTemplateId: TEMPLATE_DEEP,
      createdAt: at('2026-10-19T17:52:00.000Z'),
      updatedAt: at('2026-10-19T17:52:00.000Z'),
    },
    {
      id: SESSION_3,
      startedAt: at('2026-10-20T07:05:00.000Z'),
      endedAt: null,
      durationMinutes: null,
      reps: 50,
      rating: 5,
      activityLabel: 'Kata Reps',
      coachComment: 'Fifty clean repetitions. Keep the same pace tomorrow.',
      coachPersonalityAtGeneration: 'buddy',
      failedLLM: false,
      calendarEventId: null,
      kataTemplateId: TEMPLATE_REPS,
      createdAt: at('2026-10-20T07:20:00.000Z'),
      updatedAt: at('2026-10-20T07:20:00.000Z'),
    },
  ],

  reflections: [
    {
      id: REFLECTION_1,
      periodStart: at('2026-10-13T00:00:00.000Z'),
      periodEnd: at('2026-10-19T23:59:59.000Z'),
      observations: [
        'Three sessions, all in the morning slot.',
        'Reps work returned after a fortnight away.',
        'The soft cap was respected twice this week.',
      ],
      question: 'What made the morning slot easier to keep than the evening one?',
      sourceSessionIds: [SESSION_1, SESSION_2, SESSION_3],
      createdAt: at('2026-10-20T08:00:00.000Z'),
    },
  ],

  streak: [
    {
      id: 'singleton',
      currentStreakDays: 4,
      longestStreakDays: 11,
      lastSessionDate: '2026-10-20',
      milestonesAchieved: [3, 7],
      freezeUsedOn: ['2026-10-18'],
      updatedAt: at('2026-10-20T08:00:00.000Z'),
    },
  ],

  settings: [
    {
      id: 'singleton',
      displayName: 'Fixture',
      selectedCoachPersonality: 'zen',
      unlockedPersonalities: ['zen', 'hype', 'analyst', 'buddy', 'athena'],
      googleCalendarId: null,
      googleCalendarSyncEnabled: false,
      googleCalendarConnectedAt: null,
      reminderTime: '07:30',
      notificationsEnabled: false,
      theme: 'dark',
      accentColor: 'sage',
      ratingStyle: 'stars',
      confirmKataDelete: true,
      confirmSessionDelete: true,
      confirmClearData: true,
      showMorningCheckIn: true,
      habitLinksMigrated: true,
      dailyGoalMinutes: 20,
      weeklyGoalDays: 5,
      restDays: ['sun'],
      streakFreezeTokens: 2,
      lastStreakFreezeUsedAt: at('2026-10-18T08:00:00.000Z'),
      recoveryMode: true,
      lowEnergyRestThreshold: 2,
      createdAt: at('2026-07-21T09:00:00.000Z'),
      updatedAt: at('2026-10-20T08:00:00.000Z'),
    },
  ],

  llmSettings: [
    {
      id: 'singleton',
      activeProviderName: 'openai',
      dismissedEnvironmentProviders: [],
      providers: {
        openai: {
          baseUrl: 'https://api.openai.com/v1',
          model: 'gpt-4o-mini',
          apiKey: '',
          credentialSource: 'browser',
        },
      },
      totalTokensThisMonth: 1420,
      totalTokensResetAt: at('2026-10-01T00:00:00.000Z'),
      updatedAt: at('2026-10-20T08:00:00.000Z'),
    },
  ],

  pendingCalendarOps: [],

  tokens: [],

  kataTemplates: [
    {
      id: TEMPLATE_ZAZEN,
      name: 'Morning Zazen',
      mode: 'timed',
      defaultDurationMinutes: 20,
      defaultReps: null,
      softCapMinutes: 25,
      activityLabel: 'Meditation',
      intensity: 1,
      defaultNote: 'Stillness, posture, and breath awareness.',
      icon: '🧘',
      order: 0,
      createdAt: at('2026-07-21T09:00:00.000Z'),
      updatedAt: at('2026-10-01T09:00:00.000Z'),
    },
    {
      id: TEMPLATE_DEEP,
      name: 'Deep Work Sprint',
      mode: 'timed',
      defaultDurationMinutes: 45,
      defaultReps: null,
      softCapMinutes: 45,
      activityLabel: 'Deep Work',
      intensity: 3,
      defaultNote: 'One task, one window, no tabs.',
      icon: '⚡',
      order: 1,
      createdAt: at('2026-07-21T09:00:00.000Z'),
      updatedAt: at('2026-10-01T09:00:00.000Z'),
    },
    {
      id: TEMPLATE_REPS,
      name: 'Kata Reps',
      mode: 'reps',
      defaultDurationMinutes: null,
      defaultReps: 50,
      activityLabel: 'Forms Practice',
      intensity: 2,
      defaultNote: 'Slow is smooth; smooth is fast.',
      icon: '🥋',
      order: 2,
      createdAt: at('2026-07-21T09:00:00.000Z'),
      updatedAt: at('2026-10-01T09:00:00.000Z'),
    },
  ],

  conversations: [
    {
      id: CONVERSATION_1,
      sessionId: SESSION_1,
      rootMessageId: MESSAGE_ROOT,
      activeLeafId: MESSAGE_ANSWER,
      createdAt: at('2026-10-19T06:35:00.000Z'),
      updatedAt: at('2026-10-19T06:35:04.000Z'),
    },
  ],

  messages: [
    {
      id: MESSAGE_ROOT,
      conversationId: CONVERSATION_1,
      parentId: null,
      role: 'user',
      content:
        'Session on 2026-10-19: Morning Zazen for 20m, rated 4/5 — note: Sat through the whole bell sequence without shifting.',
      createdAt: at('2026-10-19T06:35:00.000Z'),
    },
    {
      id: MESSAGE_ANSWER,
      conversationId: CONVERSATION_1,
      parentId: MESSAGE_ROOT,
      role: 'assistant',
      content:
        'Twenty quiet minutes, and you stayed with the bell rather than racing it. That is the practice.',
      provider: 'openai',
      model: 'gpt-4o-mini',
      personality: 'zen',
      tokensUsed: { prompt: 210, completion: 28 },
      latencyMs: 1420,
      createdAt: at('2026-10-19T06:35:04.000Z'),
    },
    {
      id: MESSAGE_BRANCH,
      conversationId: CONVERSATION_1,
      parentId: MESSAGE_ROOT,
      role: 'assistant',
      content: 'Stillness logged. Variance noted: none. Repeat tomorrow.',
      provider: 'openai',
      model: 'gpt-4o-mini',
      personality: 'analyst',
      tokensUsed: { prompt: 210, completion: 14 },
      latencyMs: 1180,
      createdAt: at('2026-10-19T06:35:06.000Z'),
    },
  ],

  habits: [
    {
      id: HABIT_SIT,
      name: 'Sit',
      icon: '🧘',
      kind: 'timed',
      targetPerDay: 20,
      schedule: { kind: 'daily' },
      linkedActivityLabel: 'Meditation',
      linkedKataTemplateId: TEMPLATE_ZAZEN,
      order: 0,
      archivedAt: null,
      createdAt: at('2026-09-21T09:00:00.000Z'),
      updatedAt: at('2026-09-21T09:00:00.000Z'),
    },
    {
      id: HABIT_JOURNAL,
      name: 'Journal',
      icon: '📓',
      kind: 'boolean',
      targetPerDay: null,
      schedule: { kind: 'weekdays', days: ['mon', 'tue', 'wed', 'thu', 'fri'] },
      order: 1,
      archivedAt: null,
      createdAt: at('2026-09-21T09:00:00.000Z'),
      updatedAt: at('2026-09-21T09:00:00.000Z'),
    },
    {
      id: HABIT_READING,
      name: 'Reading',
      icon: '📖',
      kind: 'count',
      unit: 'pages',
      targetPerDay: 10,
      schedule: { kind: 'daily' },
      order: 2,
      archivedAt: at('2026-10-10T09:00:00.000Z'),
      createdAt: at('2026-09-21T09:00:00.000Z'),
      updatedAt: at('2026-10-10T09:00:00.000Z'),
    },
  ],

  habitLogs: [
    {
      id: '4c314bc2-0bc0-498f-b362-e40285651bf4',
      habitId: HABIT_SIT,
      date: '2026-10-19',
      minutes: 20,
      source: 'session',
      sessionId: SESSION_1,
      createdAt: at('2026-10-19T06:35:00.000Z'),
    },
    {
      id: 'dcb88857-42b3-4c19-a8de-ec8218d22e38',
      habitId: HABIT_SIT,
      date: '2026-10-20',
      minutes: 10,
      source: 'manual',
      createdAt: at('2026-10-20T07:00:00.000Z'),
    },
    {
      id: 'ce35a3b6-d97b-444a-a5cc-84e1aeeeea26',
      habitId: HABIT_READING,
      date: '2026-10-09',
      delta: 12,
      source: 'manual',
      note: 'Finished the chapter on pacing.',
      createdAt: at('2026-10-09T20:00:00.000Z'),
    },
  ],

  checkIns: [
    {
      date: '2026-10-18',
      energy: 2,
      fog: 4,
      aches: 3,
      sleep: 2,
      note: 'Crash day after pushing through the cap on Friday.',
      createdAt: at('2026-10-18T07:10:00.000Z'),
      updatedAt: at('2026-10-18T07:10:00.000Z'),
    },
    {
      date: '2026-10-19',
      energy: 3,
      fog: 2,
      aches: 1,
      sleep: 4,
      createdAt: at('2026-10-19T06:05:00.000Z'),
      updatedAt: at('2026-10-19T06:05:00.000Z'),
    },
    {
      date: '2026-10-20',
      energy: 4,
      fog: 1,
      aches: 1,
      sleep: 4,
      note: 'Steady morning.',
      createdAt: at('2026-10-20T06:10:00.000Z'),
      updatedAt: at('2026-10-20T06:10:00.000Z'),
    },
  ],
};
