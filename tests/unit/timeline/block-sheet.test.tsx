import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BlockSheet } from '@/components/timeline/BlockSheet';

const window = { start: new Date(2026, 5, 15, 9).getTime(), end: new Date(2026, 5, 15, 17).getTime() };

afterEach(cleanup);

describe('BlockSheet', () => {
  it('shows a message when removing the block fails instead of swallowing it', async () => {
    const onDelete = vi.fn(async () => {
      throw new Error('Could not reach the local database.');
    });
    render(
      <BlockSheet
        open
        window={window}
        initial={{ id: 'b1', kind: 'fixed', title: 'Dentist', start: window.start, end: window.start + 3_600_000 }}
        onClose={() => {}}
        onSave={async () => {}}
        onDelete={onDelete}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /remove this block/i }));
    fireEvent.click(screen.getByRole('button', { name: /^remove$/i }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/could not reach/i));
  });

  it('names a focus block after its task in the heading', () => {
    render(
      <BlockSheet
        open
        window={window}
        initial={{ id: 'b1', kind: 'focus', title: 'Focus', start: window.start, end: window.start + 1_800_000 }}
        focusTaskTitle="Draft the letter"
        onClose={() => {}}
        onSave={async () => {}}
      />,
    );
    expect(screen.getByRole('dialog', { name: 'Focus block for Draft the letter' })).toBeTruthy();
    expect(screen.queryByLabelText('Title')).toBeNull();
  });
});
