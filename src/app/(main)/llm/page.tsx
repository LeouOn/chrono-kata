'use client';

import { useState } from 'react';
import { useLLMSettings } from '@/hooks/useLLMSettings';
import { ProviderList } from '@/components/llm/ProviderList';
import { ProviderEditor } from '@/components/llm/ProviderEditor';
import { TokenMeter } from '@/components/llm/TokenMeter';
import type { ProviderName } from '@/lib/llm/provider-defaults';

export default function LLMPage() {
  const {
    settings,
    addProvider,
    removeProvider,
    setActive,
  } = useLLMSettings();
  const [editing, setEditing] = useState<ProviderName | null>(null);

  if (!settings) {
    return <div className="text-text-muted text-sm">Loading…</div>;
  }

  const editingInitial = editing ? settings.providers[editing] : undefined;

  return (
    <div className="space-y-4">
      <h1 className="font-serif text-2xl">LLM Providers</h1>

      <TokenMeter
        totalTokensThisMonth={settings.totalTokensThisMonth}
        resetAt={settings.totalTokensResetAt}
      />

      <div>
        <div className="text-xs uppercase tracking-wide text-text-muted mb-2">
          Providers
        </div>
        <ProviderList
          configuredProviders={settings.providers}
          activeProviderName={settings.activeProviderName}
          onSelect={(name) => setActive(name)}
          onConfigure={(name) => setEditing(name)}
          onRemove={(name) => removeProvider(name)}
        />
      </div>

      <p className="text-xs text-text-muted">
        API keys are stored locally in your browser (IndexedDB) and never sent
        anywhere except the provider you select.
      </p>

      {editing && (
        <ProviderEditor
          open={!!editing}
          name={editing}
          initial={editingInitial}
          onSave={async (config) => {
            await addProvider({ name: editing, ...config });
            setEditing(null);
          }}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}
