'use client';

import { useState } from 'react';

interface Props {
  disabled?: boolean;
  onSend: (text: string) => void;
}

export function FollowUpInput({ disabled, onSend }: Props) {
  const [text, setText] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
  }

  return (
    <form onSubmit={submit} className="flex gap-2 pt-2">
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
  );
}