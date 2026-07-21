'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { PersonalityPicker } from '@/components/onboarding/PersonalityPicker';
import { useSettings } from '@/hooks/useSettings';
import type { CoachPersonality } from '@/lib/schemas/coach-personality';

export default function OnboardingPage() {
  const router = useRouter();
  const { updateSettings } = useSettings();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSelect(p: CoachPersonality) {
    setSaving(true);
    setError(null);
    try {
      await updateSettings({ selectedCoachPersonality: p });
      localStorage.setItem('onboarding-completed', 'true');
      router.push('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
      setSaving(false);
    }
  }

  return (
    <main className="min-h-dvh flex flex-col justify-center px-6 py-12 max-w-md mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h1 className="font-serif text-3xl text-text leading-tight mb-2">
          Welcome.
        </h1>
        <p className="text-text-muted">
          Pick a voice for your coach. You can change this later.
        </p>

        <PersonalityPicker onSelect={handleSelect} />

        {saving && (
          <p className="text-sm text-text-muted mt-4 animate-pulse">Saving…</p>
        )}
        {error && (
          <p className="text-sm text-hype mt-4">{error}</p>
        )}
      </motion.div>
    </main>
  );
}
