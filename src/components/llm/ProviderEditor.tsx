'use client';

import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { PROVIDER_DEFAULTS, type ProviderName } from '@/lib/llm/provider-defaults';
import { baseUrlFromHost, hostFromBaseUrl, isLocalProviderName } from '@/lib/llm/local-provider';
import { checkLocalHost, fetchLocalModels } from '@/lib/llm/local-models';
import { useFlag } from '@/hooks/useFlags';

import type { ProviderEntry } from '@/lib/schemas/llm-settings';

interface Props {
  open: boolean;
  name: ProviderName;
  initial?: ProviderEntry;
  onSave: (config: ProviderEntry) => void;
  onCancel: () => void;
}

export function ProviderEditor({ open, name, initial, onSave, onCancel }: Props) {
  const defaults = PROVIDER_DEFAULTS[name];
  const isLocal = isLocalProviderName(name);
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? defaults.baseUrl);
  const [apiKey, setApiKey] = useState(initial?.apiKey ?? '');
  const [model, setModel] = useState(initial?.model ?? defaults.model);
  // Local servers (LM Studio, Ollama) are addressed by host:port.
  const [host, setHost] = useState(() => hostFromBaseUrl(initial?.baseUrl ?? defaults.baseUrl));
  const [models, setModels] = useState<string[]>([]);
  const privateMode = useFlag('privateMode');
  const [loadingModels, setLoadingModels] = useState(false);
  const [health, setHealth] = useState('');

  useEffect(() => {
    setBaseUrl(initial?.baseUrl ?? defaults.baseUrl);
    setApiKey(initial?.apiKey ?? '');
    setModel(initial?.model ?? defaults.model);
    setHost(hostFromBaseUrl(initial?.baseUrl ?? defaults.baseUrl));
    setModels([]);
    setHealth('');
  }, [initial, defaults, open]);

  function handleHostChange(value: string) {
    setHost(value);
    setBaseUrl(baseUrlFromHost(value));
  }

  async function loadModels() {
    setLoadingModels(true);
    setHealth('');
    const result = await fetchLocalModels(baseUrl, { privateMode });
    setLoadingModels(false);
    if (!result.ok) {
      setHealth(result.error ?? 'Could not load models.');
      return;
    }
    setModels(result.models);
    setHealth(
      result.models.length > 0
        ? `Found ${result.models.length} model${result.models.length === 1 ? '' : 's'}.`
        : 'The host is up but serves no models. Load one in the local server.',
    );
  }

  async function runHealthCheck() {
    setLoadingModels(true);
    setHealth('');
    const result = await checkLocalHost(baseUrl, { privateMode });
    setLoadingModels(false);
    setHealth(result.message);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const needsKey = !isLocal && !apiKey.trim() && initial?.credentialSource !== 'environment';
    if (needsKey || !model.trim()) return;
    onSave({
      baseUrl: baseUrl.trim(),
      apiKey: initial?.credentialSource === 'environment' ? '' : apiKey.trim(),
      model: model.trim(),
      credentialSource: initial?.credentialSource ?? 'browser',
    });
  }

  return (
    <Modal open={open} onClose={onCancel} title={`Configure ${name}`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {isLocal ? (
          <label className="block">
            <span className="text-text-muted text-sm">Host</span>
            <input
              type="text"
              value={host}
              onChange={(e) => handleHostChange(e.target.value)}
              placeholder="localhost:1234"
              className="w-full mt-1 bg-surface-2 border border-border rounded-2xl px-4 py-3 text-text"
            />
            <span className="text-xs text-text-muted mt-1 block">
              Host and port of the local server. Use your machine ({'localhost:1234'}) or a LAN address
              (192.168.1.5:1234) so a phone on the same network can reach it.
            </span>
          </label>
        ) : (
          <label className="block">
            <span className="text-text-muted text-sm">Base URL</span>
            <input
              type="url"
              disabled={initial?.credentialSource === 'environment'}
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              className="w-full mt-1 bg-surface-2 border border-border rounded-2xl px-4 py-3 text-text"
            />
          </label>
        )}

        {isLocal && (
          <div className="text-xs text-text-muted">
            Requests go to <span className="text-text">{baseUrl || '—'}</span>
          </div>
        )}

        <div className="block">
          <span className="text-text-muted text-sm">Model</span>
          {models.length > 0 ? (
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full mt-1 bg-surface-2 border border-border rounded-2xl px-4 py-3 text-text"
            >
              {models.includes(model) ? null : <option value={model}>{model}</option>}
              {models.map((id) => (
                <option key={id} value={id}>{id}</option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full mt-1 bg-surface-2 border border-border rounded-2xl px-4 py-3 text-text"
            />
          )}
          {isLocal && (
            <div className="flex flex-wrap gap-3 mt-2">
              <button type="button" className="text-xs text-accent" onClick={() => void loadModels()} disabled={loadingModels}>
                {loadingModels ? 'Loading…' : 'Load models'}
              </button>
              <button type="button" className="text-xs text-accent" onClick={() => void runHealthCheck()} disabled={loadingModels}>
                Check host
              </button>
            </div>
          )}
          {health && <p role="status" className="text-xs text-text-muted mt-2">{health}</p>}
        </div>

        {initial?.credentialSource === 'environment' ? (
          <p className="text-sm text-text-muted">Using this computer’s environment key. Change the server URL in its environment settings.</p>
        ) : isLocal ? (
          <label className="block">
            <span className="text-text-muted text-sm">API key (optional)</span>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Usually empty for a local server"
              autoComplete="off"
              className="w-full mt-1 bg-surface-2 border border-border rounded-2xl px-4 py-3 text-text"
            />
          </label>
        ) : (
          <label className="block">
            <span className="text-text-muted text-sm">API key</span>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-…"
              autoComplete="off"
              className="w-full mt-1 bg-surface-2 border border-border rounded-2xl px-4 py-3 text-text"
            />
          </label>
        )}
        <div className="flex gap-2 justify-end pt-2">
          <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button type="submit">Save</Button>
        </div>
      </form>
    </Modal>
  );
}
