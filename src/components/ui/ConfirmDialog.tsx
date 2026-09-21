'use client';

import React, { useEffect, useState, type ReactNode } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';

interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  showDontAskAgain?: boolean;
  onConfirm: (dontAskAgain: boolean) => void;
  onCancel: () => void;
  children?: ReactNode;
  /** Stack layer: pass 2 when rendered above another open modal. */
  layer?: 1 | 2;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  showDontAskAgain = false,
  onConfirm,
  onCancel,
  children,
  layer = 1,
}: Props) {
  const [dontAskAgain, setDontAskAgain] = useState(false);

  useEffect(() => {
    if (open) setDontAskAgain(false);
  }, [open]);

  return (
    <Modal open={open} onClose={onCancel} title={title} layer={layer}>
      <p className="text-text-muted mb-4">{message}</p>
      {children && <div className="mb-4">{children}</div>}
      {showDontAskAgain && (
        <label className="flex items-center gap-2 mb-4 text-xs text-text-muted cursor-pointer select-none">
          <input
            type="checkbox"
            checked={dontAskAgain}
            onChange={(e) => setDontAskAgain(e.target.checked)}
            className="accent-accent w-4 h-4"
          />
          Don&apos;t ask again
        </label>
      )}
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" onClick={onCancel}>{cancelLabel}</Button>
        <Button variant="danger" onClick={() => onConfirm(dontAskAgain)}>{confirmLabel}</Button>
      </div>
    </Modal>
  );
}
