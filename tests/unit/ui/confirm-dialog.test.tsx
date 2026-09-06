import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

afterEach(() => {
  cleanup();
});

const baseProps = {
  open: true,
  title: 'Delete?',
  message: 'This cannot be undone.',
  onConfirm: vi.fn(),
  onCancel: vi.fn(),
};

describe('ConfirmDialog', () => {
  it('renders no checkbox by default', () => {
    render(<ConfirmDialog {...baseProps} />);
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('reports false when confirming without ticking the checkbox', () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog {...baseProps} onConfirm={onConfirm} showDontAskAgain />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(onConfirm).toHaveBeenCalledWith(false);
  });

  it('reports true when the checkbox is ticked', () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog {...baseProps} onConfirm={onConfirm} showDontAskAgain />);
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(onConfirm).toHaveBeenCalledWith(true);
  });

  it('resets the checkbox between opens', () => {
    const onConfirm = vi.fn();
    const { rerender } = render(
      <ConfirmDialog {...baseProps} onConfirm={onConfirm} showDontAskAgain />
    );
    fireEvent.click(screen.getByRole('checkbox'));
    rerender(<ConfirmDialog {...baseProps} onConfirm={onConfirm} showDontAskAgain open={false} />);
    rerender(<ConfirmDialog {...baseProps} onConfirm={onConfirm} showDontAskAgain open />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(onConfirm).toHaveBeenCalledWith(false);
  });

  it('calls onCancel from the cancel button', () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog {...baseProps} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
