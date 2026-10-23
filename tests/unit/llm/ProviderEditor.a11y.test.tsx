import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProviderEditor } from '@/components/llm/ProviderEditor';

// The "Load models" path swaps the Model input for a <select>; stub the network
// so that branch can be exercised.
vi.mock('@/lib/llm/local-models', () => ({
  fetchLocalModels: vi.fn(async () => ({ ok: true, models: ['local-a', 'local-b'] })),
  checkLocalHost: vi.fn(async () => ({ ok: true, message: 'Host is reachable.' })),
}));

afterEach(() => cleanup());

function renderEditor(name: 'lmstudio' | 'openai') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ProviderEditor open name={name} onSave={() => {}} onCancel={() => {}} />
    </QueryClientProvider>,
  );
}

/**
 * Every control in the provider editor must have an accessible name. The Model
 * field lost its name in Wave 5 when its wrapping <label> became a <div> so
 * action buttons could live beside the control; this test is the tripwire for
 * that class of regression, for both the local and the cloud layout.
 */
function expectEveryControlNamed(container: HTMLElement) {
  const controls = Array.from(
    container.querySelectorAll<HTMLElement>('input, select, textarea'),
  );
  expect(controls.length).toBeGreaterThan(0);
  for (const control of controls) {
    const name =
      control.getAttribute('aria-label') ??
      (control.getAttribute('aria-labelledby')
        ? document.getElementById(control.getAttribute('aria-labelledby')!)?.textContent
        : null) ??
      (control as HTMLInputElement).labels?.[0]?.textContent ??
      '';
    expect(name.trim(), `${control.tagName} ${control.id || '(no id)'} has no accessible name`).not.toBe('');
  }
}

describe('ProviderEditor accessibility', () => {
  it('names every field for a local provider', () => {
    const { container } = renderEditor('lmstudio');

    expect(screen.getByLabelText('Host')).toBeInTheDocument();
    expect(screen.getByLabelText('Model')).toBeInTheDocument();
    expect(screen.getByLabelText('API key (optional)')).toBeInTheDocument();
    expectEveryControlNamed(container);
  });

  it('names every field for a cloud provider', () => {
    const { container } = renderEditor('openai');

    expect(screen.getByLabelText('Base URL')).toBeInTheDocument();
    expect(screen.getByLabelText('Model')).toBeInTheDocument();
    expect(screen.getByLabelText('API key')).toBeInTheDocument();
    expectEveryControlNamed(container);
  });

  it('keeps the Model field named when the model list swaps it to a select', async () => {
    const { container } = renderEditor('lmstudio');

    fireEvent.click(screen.getByRole('button', { name: /Load models/i }));

    await waitFor(() => expect(screen.getByLabelText('Model').tagName).toBe('SELECT'));
    expect(screen.getByLabelText('Model')).toHaveValue('local-model');
    expectEveryControlNamed(container);
  });

  it('keeps the host help text as a description, not part of the name', () => {
    renderEditor('lmstudio');
    const host = screen.getByLabelText('Host');
    const describedBy = host.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)?.textContent).toMatch(/Host and port/);
  });
});
