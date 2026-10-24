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
    expect(screen.getByRole('button', { name: 'Try this screen again' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Go to the Home screen' })).toBeTruthy();

    const log = getErrorLog();
    expect(log).toHaveLength(1);
    expect(log[0]!.message).toBe('kaboom at render');
    expect(log[0]!.name).toBe('Error');

    fireEvent.click(screen.getByRole('button', { name: 'Try this screen again' }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('records the current route (pathname only)', () => {
    window.history.replaceState({}, '', '/inbox?tab=2');
    render(<RouteErrorScreen error={new Error('x')} reset={() => {}} />);
    expect(getErrorLog()[0]!.route).toBe('/inbox');
    expect(localStorage.getItem(ERROR_LOG_KEY)).not.toContain('tab=2');
  });
});
