'use client';

import { Card } from '@/components/ui/Card';
import { PROVIDER_NAMES, PROVIDER_DEFAULTS, type ProviderName } from '@/lib/llm/provider-defaults';

interface Props {
  configuredProviders: Record<string, { baseUrl: string; apiKey: string; model: string }>;
  activeProviderName: string;
  onSelect: (name: ProviderName) => void;
  onConfigure: (name: ProviderName) => void;
  onRemove: (name: ProviderName) => void;
}

export function ProviderList({
  configuredProviders,
  activeProviderName,
  onSelect,
  onConfigure,
  onRemove,
}: Props) {
  return (
    <div className="space-y-2">
      {PROVIDER_NAMES.map((name) => {
        const isConfigured = name in configuredProviders;
        const isActive = name === activeProviderName;
        const defaults = PROVIDER_DEFAULTS[name];
        return (
          <Card key={name} className={isActive ? 'border-accent' : ''}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-text capitalize">{name}</span>
                  {isActive && (
                    <span className="text-xs bg-accent text-base px-2 py-0.5 rounded-full">
                      Active
                    </span>
                  )}
                  {!isConfigured && (
                    <span className="text-xs bg-surface-2 text-text-muted px-2 py-0.5 rounded-full">
                      Not configured
                    </span>
                  )}
                </div>
                <div className="text-xs text-text-muted truncate mt-0.5">
                  {defaults.model} · {defaults.baseUrl}
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                {isConfigured && !isActive && (
                  <button
                    onClick={() => onSelect(name)}
                    className="text-xs text-accent px-3 py-1.5 rounded-full hover:bg-surface-2"
                  >
                    Set active
                  </button>
                )}
                <button
                  onClick={() => onConfigure(name)}
                  className="text-xs text-text-muted px-3 py-1.5 rounded-full hover:bg-surface-2"
                >
                  {isConfigured ? 'Edit' : 'Add'}
                </button>
                {isConfigured && (
                  <button
                    onClick={() => onRemove(name)}
                    className="text-xs text-hype px-2 py-1.5 rounded-full hover:bg-surface-2"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
