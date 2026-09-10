import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Modal } from '@/components/ui/Modal';

afterEach(() => {
  cleanup();
});

describe('Modal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <Modal open={false} onClose={() => {}}>
        hidden
      </Modal>
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('exposes dialog semantics with title association', () => {
    render(
      <Modal open onClose={() => {}} title="Dialog title">
        content
      </Modal>
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    const labelledBy = dialog.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy!)).toHaveTextContent('Dialog title');
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<Modal open onClose={onClose}>content</Modal>);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('locks body scroll while open and restores it on unmount', () => {
    const { unmount } = render(<Modal open onClose={() => {}}>content</Modal>);
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('moves focus to the panel and traps Tab within it', () => {
    render(
      <Modal open onClose={() => {}} title="T">
        <button>first</button>
        <button>last</button>
      </Modal>
    );
    const dialog = screen.getByRole('dialog');
    expect(document.activeElement).toBe(dialog);

    const buttons = dialog.querySelectorAll('button');
    const first = buttons[0]!;
    const last = buttons[1]!;
    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it('pulls focus back into the panel when it leaked to body', () => {
    render(
      <div>
        <button>outside</button>
        <Modal open onClose={() => {}} title="T">
          <button>first</button>
          <button>last</button>
        </Modal>
      </div>
    );
    const dialog = screen.getByRole('dialog');
    const outside = screen.getByText('outside');
    outside.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(dialog.querySelectorAll('button')[0]);
  });
});
