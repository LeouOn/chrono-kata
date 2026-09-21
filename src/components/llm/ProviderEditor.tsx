'use client';

import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { PROVIDER_DEFAULTS, type ProviderName } from '@/lib/llm/provider-defaults';

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
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? defaults.baseUrl);
  const [apiKey, setApiKey] = useState(initial?.apiKey ?? '');
  const [model, setModel] = useState(initial?.model ?? defaults.model);

  useEffect(() => {
    setBaseUrl(initial?.baseUrl ?? defaults.baseUrl);
    setApiKey(initial?.apiKey ?? '');
    setModel(initial?.model ?? defaults.model);
  }, [initial, defaults, open]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if ((!apiKey.trim() && initial?.credentialSource !== 'environment') || !model.trim()) return;
    onSave({ baseUrl: baseUrl.trim(), apiKey: initial?.credentialSource === 'environment' ? '' : apiKey.trim(), model: model.trim(), credentialSource: initial?.credentialSource ?? 'browser' });
  }

  return (
    <Modal open={open} onClose={onCancel} title={`Configure ${name}`}>
      <form onSubmit={handleSubmit} className="space-y-4">
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
        <label className="block">
          <span className="text-text-muted text-sm">Model</span>
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full mt-1 bg-surface-2 border border-border rounded-2xl px-4 py-3 text-text"
          />
        </label>
        {initial?.credentialSource === 'environment' ? <p className="text-sm text-text-muted">Using this computer’s environment key. Change the server URL in its environment settings.</p> : <label className="block">
          <span className="text-text-muted text-sm">API key</span>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-…"
            autoComplete="off"
            className="w-full mt-1 bg-surface-2 border border-border rounded-2xl px-4 py-3 text-text"
          />
        </label>}
        <div className="flex gap-2 justify-end pt-2">
          <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button type="submit">Save</Button>
        </div>
      </form>
    </Modal>
  );
}
