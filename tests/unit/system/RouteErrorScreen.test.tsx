import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { RouteErrorScreen } from '@/components/system/RouteErrorScreen';
import { getErrorLog, ERROR_LOG_KEY } from '@/lib/errors/error-log';

beforeEach(() => {
  cleanup();
  localStorage.clear();
});

function Boom(): never {
  throw new Error('kaboom at render');
}

describe('RouteErrorScreen', () => {
  it('shows calm copy, no stack, reset and Home, and records the error locally', () => {
    const reset = vi.fn();
    render(<RouteErrorScreen error={new Error('kaboom at render')} reset={reset} />);
    expect(screen.getByText('Something went wrong on this screen.')).toBeTruthy();
    expect(screen.getByText(/Your data is safe on this device/)).toBeTruthy();
    expect(screen.queryByText(/kaboom/)).toBeNull(); // no stack/message on screen
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Go to the Home screen' })).toBeTruthy();

    const log = getErrorLog();
    expect(log).toHaveLength(1);
    expect(log[0]!.message).toBe('kaboom at render');
    expect(log[0]!.name).toBe('Error');

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('names each control by text that contains its visible text (WCAG 2.5.3)', () => {
    render(<RouteErrorScreen error={new Error('x')} reset={() => {}} />);
    const controls = [...screen.getAllByRole('button'), ...screen.getAllByRole('link')];
    expect(controls.length).toBeGreaterThanOrEqual(2);
    for (const control of controls) {
      const visible = control.textContent!.trim();
      expect(visible).not.toBe('');
      const role = control.tagName === 'A' ? 'link' : 'button';
      // "Click Try again" must reach the control: the visible text is inside its name.
      expect(
        screen.getByRole(role, { name: new RegExp(visible, 'i') }),
        `"${visible}" must be inside its accessible name`,
      ).toBe(control);
    }
  });

  it('records one error once even under StrictMode, and a repeat failure as a new entry', () => {
    const error = new Error('same words');
    const view = render(
      <React.StrictMode>
        <RouteErrorScreen error={error} reset={() => {}} />
      </React.StrictMode>,
    );
    expect(getErrorLog()).toHaveLength(1);

    // Re-render with the same error: still one. A fresh error object (Try again failed again): two.
    view.rerender(
      <React.StrictMode>
        <RouteErrorScreen error={error} reset={() => {}} />
      </React.StrictMode>,
    );
    expect(getErrorLog()).toHaveLength(1);
    view.rerender(
      <React.StrictMode>
        <RouteErrorScreen error={new Error('same words')} reset={() => {}} />
      </React.StrictMode>,
    );
    expect(getErrorLog()).toHaveLength(2);
  });

  it('records the current route (pathname only)', () => {
    window.history.replaceState({}, '', '/inbox?tab=2');
    render(<RouteErrorScreen error={new Error('x')} reset={() => {}} />);
    expect(getErrorLog()[0]!.route).toBe('/inbox');
    expect(localStorage.getItem(ERROR_LOG_KEY)).not.toContain('tab=2');
  });
});
