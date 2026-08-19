'use client';

import { useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { useSettings } from '@/hooks/useSettings';
import { useLLMSettings } from '@/hooks/useLLMSettings';
import type { CoachPersonality } from '@/lib/schemas/coach-personality';

interface Props {
  disabled?: boolean;
  onSend: (
    text: string,
    options?: { personalityOverride?: CoachPersonality; providerOverride?: string },
  ) => void;
}

const COACH_OPTIONS: Array<{ value: CoachPersonality; label: string }> = [
  { value: 'zen', label: 'Zen' },
  { value: 'hype', label: 'Hype' },
  { value: 'analyst', label: 'Analyst' },
  { value: 'buddy', label: 'Buddy' },
  { value: 'athena', label: 'Athena' },
];

export function FollowUpInput({ disabled, onSend }: Props) {
  const [text, setText] = useState('');
  const [showControls, setShowControls] = useState(false);
  const { settings: appSettings } = useSettings();
  const { configuredProviderNames, settings: llmSettings } = useLLMSettings();

  const [selectedPersonality, setSelectedPersonality] = useState<CoachPersonality | undefined>(undefined);
  const [selectedProvider, setSelectedProvider] = useState<string | undefined>(undefined);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;

    onSend(trimmed, {
      personalityOverride: selectedPersonality,
      providerOverride: selectedProvider,
    });
    setText('');
  }

  const effectivePersonality = selectedPersonality ?? appSettings?.selectedCoachPersonality ?? 'buddy';
  const effectiveProvider = selectedProvider ?? llmSettings?.activeProviderName ?? 'default';

  return (
    <div className="space-y-2 pt-2">
      {showControls && (
        <div className="bg-surface-2/70 border border-border rounded-xl p-2.5 text-xs space-y-2">
          <div className="flex items-center justify-between text-text-muted">
            <span className="font-semibold text-text uppercase tracking-wider text-[10px]">
              Mid-Chat Overrides
            </span>
            <button
              type="button"
              onClick={() => setShowControls(false)}
              className="hover:text-text text-[11px]"
            >
              Hide
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-text-muted uppercase tracking-wider block mb-1">
                Coach Personality
              </label>
              <select
                value={effectivePersonality}
                onChange={(e) => setSelectedPersonality(e.target.value as CoachPersonality)}
                className="w-full bg-surface border border-border rounded-lg px-2 py-1.5 text-text focus:outline-none focus:border-accent text-xs"
              >
                {COACH_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label} {c.value === appSettings?.selectedCoachPersonality ? '(Default)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] text-text-muted uppercase tracking-wider block mb-1">
                LLM Provider
              </label>
              <select
                value={effectiveProvider}
                onChange={(e) => setSelectedProvider(e.target.value)}
                className="w-full bg-surface border border-border rounded-lg px-2 py-1.5 text-text focus:outline-none focus:border-accent text-xs"
              >
                {configuredProviderNames.map((name) => (
                  <option key={name} value={name}>
                    {name} {name === llmSettings?.activeProviderName ? '(Active)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={submit} className="flex gap-2 items-center">
        <button
          type="button"
          onClick={() => setShowControls((prev) => !prev)}
          className={`p-3 rounded-2xl border transition-colors flex items-center justify-center ${
            showControls || selectedPersonality || selectedProvider
              ? 'bg-accent/15 border-accent text-accent'
              : 'bg-surface-2 border-border text-text-muted hover:text-text'
          }`}
          title="Mid-chat model & coach overrides"
          aria-label="Toggle model controls"
        >
          <SlidersHorizontal size={18} />
        </button>

        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={disabled ? 'Coach is thinking…' : 'Ask a follow-up…'}
          disabled={disabled}
          className="flex-1 bg-surface-2 border border-border rounded-2xl px-4 py-3 text-text placeholder:text-text-muted focus:outline-none focus:border-accent disabled:opacity-50"
          aria-label="Follow-up message"
        />

        <button
          type="submit"
          disabled={disabled || text.trim().length === 0}
          className="rounded-2xl px-4 py-3 bg-accent text-base font-medium disabled:opacity-50 transition-opacity"
        >
          ➤
        </button>
      </form>
    </div>
  );
}