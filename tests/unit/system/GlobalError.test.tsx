import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import GlobalError from '@/app/global-error';
import { ERROR_LOG_KEY, getErrorLog, recordError } from '@/lib/errors/error-log';

// The REAL recorder, wrapped in a spy so the tests can count calls.
vi.mock('@/lib/errors/error-log', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/errors/error-log')>();
  return { ...actual, recordError: vi.fn(actual.recordError) };
});

function boom(): Error & { digest?: string } {
  const error = new Error('kaboom with a task title: Call the bank');
  error.stack = 'Error: kaboom\n    at secretFunction (/app/secret/path.ts:1:1)';
  return error;
}

/** GlobalError renders its own <html>/<body>, so it mounts into the document. */
function mount(error: Error & { digest?: string }, reset: () => void = () => {}) {
  return render(<GlobalError error={error} reset={reset} />, { container: document });
}

beforeEach(() => {
  cleanup();
  localStorage.clear();
  vi.mocked(recordError).mockClear();
  window.history.replaceState({}, '', '/');
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('GlobalError: the last-resort screen', () => {
  it('renders its own html and body, with calm copy and no error text', () => {
    const html = renderToStaticMarkup(<GlobalError error={boom()} reset={() => {}} />);
    // React puts an empty <head> between them; the root and the body are what matter.
    expect(html).toMatch(/^<html lang="en">(<head><\/head>)?<body[ >]/);
    expect(html.endsWith('</body></html>')).toBe(true);
    expect(html).toContain('Something went wrong on this screen.');
    expect(html).toContain('Your data is safe on this device. Nothing was lost.');
    expect(html).toContain('>Try again<');
    // No message, no stack, no path on screen.
    expect(html).not.toMatch(/kaboom|Call the bank|secretFunction|secret\/path/);
  });

  it('records NOTHING while rendering (React may render more than once)', () => {
    renderToStaticMarkup(<GlobalError error={boom()} reset={() => {}} />);
    expect(recordError).not.toHaveBeenCalled();
    expect(localStorage.getItem(ERROR_LOG_KEY)).toBeNull();
  });

  it('records the error exactly once, with the shared recorder and the pathname only', () => {
    window.history.replaceState({}, '', '/inbox?tab=2');
    const error = boom();
    const view = mount(error);

    expect(recordError).toHaveBeenCalledTimes(1);
    expect(recordError).toHaveBeenCalledWith(error, '/inbox');
    expect(getErrorLog()).toHaveLength(1);
    expect(localStorage.getItem(ERROR_LOG_KEY)).not.toContain('tab=2');

    // Re-rendering with the SAME error (a concurrent re-render) is not a new error.
    view.rerender(<GlobalError error={error} reset={() => {}} />);
    expect(recordError).toHaveBeenCalledTimes(1);
    expect(getErrorLog()).toHaveLength(1);

    // A different error is a new entry.
    view.rerender(<GlobalError error={new Error('another')} reset={() => {}} />);
    expect(recordError).toHaveBeenCalledTimes(2);
    expect(getErrorLog()).toHaveLength(2);
  });

  it('records once even under StrictMode, which runs every effect twice in development', () => {
    render(
      <React.StrictMode>
        <GlobalError error={boom()} reset={() => {}} />
      </React.StrictMode>,
      { container: document },
    );
    expect(recordError).toHaveBeenCalledTimes(1);
    expect(getErrorLog()).toHaveLength(1);
  });

  it('records a NEW error object with the same message (Try again failed the same way)', () => {
    const view = mount(new Error('same words'));
    view.rerender(<GlobalError error={new Error('same words')} reset={() => {}} />);
    expect(recordError).toHaveBeenCalledTimes(2);
    expect(getErrorLog()).toHaveLength(2);
  });

  it('keeps the shared ring buffer bound rather than growing its own', () => {
    for (let i = 0; i < 55; i += 1) recordError(new Error(`older ${i}`), '/old');
    mount(boom());
    const log = getErrorLog();
    expect(log).toHaveLength(50);
    expect(log[log.length - 1]!.message).toContain('kaboom');
  });

  it('shows the screen and calls reset once when "Try again" is pressed', () => {
    const reset = vi.fn();
    mount(boom(), reset);
    expect(screen.getByText('Something went wrong on this screen.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('still renders when storage refuses every write', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    expect(() => mount(boom())).not.toThrow();
    expect(screen.getByText('Something went wrong on this screen.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Go to the Home screen' })).toBeTruthy();
  });

  it('names each control by text that contains its visible text (WCAG 2.5.3)', () => {
    mount(boom());
    const controls = [...screen.getAllByRole('button'), ...screen.getAllByRole('link')];
    expect(controls.length).toBeGreaterThanOrEqual(2);
    for (const control of controls) {
      const visible = control.textContent!.trim();
      expect(visible).not.toBe('');
      const role = control.tagName === 'A' ? 'link' : 'button';
      expect(
        screen.getByRole(role, { name: new RegExp(visible, 'i') }),
        `"${visible}" must be inside its accessible name`,
      ).toBe(control);
    }
  });
});
