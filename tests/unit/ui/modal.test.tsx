import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { Modal } from '@/components/ui/Modal';

afterEach(() => {
  cleanup();
  document.body.style.overflow = '';
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

  describe('stacked modals', () => {
    function Harness() {
      const [baseOpen, setBaseOpen] = React.useState(true);
      const [confirmOpen, setConfirmOpen] = React.useState(true);
      return (
        <>
          <Modal open={baseOpen} onClose={() => setBaseOpen(false)} title="Base">
            <button>base-first</button>
            <button>base-last</button>
          </Modal>
          <Modal
            open={confirmOpen}
            onClose={() => setConfirmOpen(false)}
            title="Confirm"
            layer={2}
          >
            <button onClick={() => setConfirmOpen(false)}>confirm-keep</button>
            <button onClick={() => { setConfirmOpen(false); setBaseOpen(false); }}>
              close-both
            </button>
          </Modal>
        </>
      );
    }

    it('Escape closes only the topmost modal and keeps the scroll lock', async () => {
      render(<Harness />);
      fireEvent.keyDown(document, { key: 'Escape' });
      await waitFor(() =>
        expect(screen.queryByRole('dialog', { name: 'Confirm' })).toBeNull()
      );
      expect(screen.getByRole('dialog', { name: 'Base' })).toBeInTheDocument();
      expect(document.body.style.overflow).toBe('hidden');
    });

    it('traps Tab within the topmost modal only', () => {
      render(<Harness />);
      const confirmKeep = screen.getByText('confirm-keep');
      const closeBoth = screen.getByText('close-both');
      closeBoth.focus();
      fireEvent.keyDown(document, { key: 'Tab' });
      expect(document.activeElement).toBe(confirmKeep);
      fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
      expect(document.activeElement).toBe(closeBoth);
    });

    it('restores the original overflow when both modals close in one commit', async () => {
      document.body.style.overflow = 'scroll';
      render(<Harness />);
      expect(document.body.style.overflow).toBe('hidden');

      fireEvent.click(screen.getByText('close-both'));

      await waitFor(() =>
        expect(screen.queryByRole('dialog', { name: 'Base' })).toBeNull()
      );
      expect(screen.queryByRole('dialog', { name: 'Confirm' })).toBeNull();
      expect(document.body.style.overflow).toBe('scroll');
    });

    it('keeps the lock while the confirmation alone closes', async () => {
      render(<Harness />);
      fireEvent.click(screen.getByText('confirm-keep'));
      await waitFor(() =>
        expect(screen.queryByRole('dialog', { name: 'Confirm' })).toBeNull()
      );
      expect(screen.getByRole('dialog', { name: 'Base' })).toBeInTheDocument();
      expect(document.body.style.overflow).toBe('hidden');
    });

    it('restores the overflow when both modals unmount while open', () => {
      const { unmount } = render(<Harness />);
      expect(document.body.style.overflow).toBe('hidden');
      unmount();
      expect(document.body.style.overflow).toBe('');
    });
  });
});
