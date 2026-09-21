'use client';

import { useEffect, useState } from 'react';
import { useLLMSettings } from '@/hooks/useLLMSettings';
import { ProviderList } from '@/components/llm/ProviderList';
import { ProviderEditor } from '@/components/llm/ProviderEditor';
import { TokenMeter } from '@/components/llm/TokenMeter';
import type { ProviderName } from '@/lib/llm/provider-defaults';
import type { ProviderEntry } from '@/lib/schemas/llm-settings';
import { discoverLocalProviders } from '@/lib/llm/local-discovery';
import { createLLMProvider } from '@/lib/llm/provider-factory';

export default function LLMPage() {
  const {
    settings,
    addProvider,
    removeProvider,
    setActive,
  } = useLLMSettings();
  const [editing, setEditing] = useState<ProviderName | null>(null);
  const [environmentProviders, setEnvironmentProviders] = useState<Record<string, ProviderEntry>>({});
  const [testing, setTesting] = useState<string | null>(null);
  const [connectionResult, setConnectionResult] = useState('');

  useEffect(() => {
    let cancelled = false;
    void discoverLocalProviders(true).then((found) => {
      if (!cancelled) setEnvironmentProviders(found.providers);
    });
    return () => { cancelled = true; };
  }, []);

  async function testConnection(name: ProviderName) {
    const entry = settings?.providers[name];
    if (!entry || testing) return;
    setTesting(name);
    setConnectionResult('');
    try {
      const response = await createLLMProvider({ providerName: name, ...entry }).completeSingle({
        systemPrompt: 'Reply with OK only.', userText: 'Connection test.', signal: AbortSignal.timeout(30_000),
      });
      if (!response.content) throw new Error('Provider returned no text.');
      setConnectionResult(`${name}: connected using ${entry.model}.`);
    } catch (error) {
      setConnectionResult(`${name}: ${error instanceof Error ? error.message : 'Connection failed.'}`);
    } finally { setTesting(null); }
  }

  if (!settings) {
    return <div className="text-text-muted text-sm">Loading…</div>;
  }

  const editingInitial = editing ? settings.providers[editing] : undefined;

  return (
    <div className="space-y-4">
      <h1 className="font-serif text-2xl">LLM Providers</h1>
      <p className="text-sm text-text-muted">Desktop keys appear when you run the app with <code>npm run dev:local</code>. On Android, tap Add and paste your key. Connection tests make a small provider request.</p>
      {connectionResult && <p role="status" className="text-sm text-text">{connectionResult}</p>}

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
          environmentProviders={environmentProviders}
          onUseEnvironment={async (name) => {
            const entry = environmentProviders[name];
            if (entry) {
              await addProvider({ name, ...entry });
              await setActive(name);
            }
          }}
          onTest={(name) => void testConnection(name)}
          testing={testing}
        />
      </div>

      <p className="text-xs text-text-muted">
        Pasted keys are stored in this browser and sent to the selected provider.
        Desktop environment keys stay on your computer’s local server.
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
