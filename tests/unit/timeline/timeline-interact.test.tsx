import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Timeline, type TimelineBlock } from '@/components/timeline/Timeline';

const dayWindow = { start: new Date(2026, 5, 15, 9).getTime(), end: new Date(2026, 5, 15, 17).getTime() };
const entry = (id: string, startHour: number, endHour: number): TimelineBlock => ({
  id,
  kind: 'fixed',
  title: id,
  start: new Date(2026, 5, 15, startHour).getTime(),
  end: new Date(2026, 5, 15, endHour).getTime(),
});

afterEach(cleanup);

describe('timeline pointer editing', () => {
  it('commits a drag on release using the layout core geometry', () => {
    const onCommit = vi.fn();
    render(<Timeline window={dayWindow} blocks={[entry('a', 9, 10)]} now={dayWindow.start} onSelect={() => {}} onCommit={onCommit} stepMin={15} />);
    const block = screen.getByRole('button', { name: /fixed block a 09:00 to 10:00/i });
    fireEvent.pointerDown(block, { clientY: 100 });
    fireEvent.pointerMove(block, { clientY: 166 });
    fireEvent.pointerUp(block);
    expect(onCommit).toHaveBeenCalledTimes(1);
    const next = onCommit.mock.calls[0]![1] as { start: number; end: number };
    expect(next.start).toBeGreaterThan(entry('a', 9, 10).start);
    expect(next.end - next.start).toBe(entry('a', 9, 10).end - entry('a', 9, 10).start);
  });

  it('cancels on Escape and writes nothing', () => {
    const onCommit = vi.fn();
    const onSelect = vi.fn();
    render(<Timeline window={dayWindow} blocks={[entry('a', 9, 10)]} now={dayWindow.start} onSelect={onSelect} onCommit={onCommit} stepMin={15} />);
    const block = screen.getByRole('button', { name: /fixed block a 09:00 to 10:00/i });
    fireEvent.pointerDown(block, { clientY: 100 });
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.pointerUp(block);
    expect(onCommit).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('resizes from the end handle', () => {
    const onCommit = vi.fn();
    render(<Timeline window={dayWindow} blocks={[entry('a', 9, 10)]} now={dayWindow.start} onSelect={() => {}} onCommit={onCommit} stepMin={15} />);
    const handle = screen.getByRole('button', { name: /resize end of a/i });
    fireEvent.pointerDown(handle, { clientY: 100 });
    fireEvent.pointerMove(handle, { clientY: 140 });
    fireEvent.pointerUp(handle);
    expect(onCommit).toHaveBeenCalledTimes(1);
    const next = onCommit.mock.calls[0]![1] as { start: number; end: number };
    expect(next.start).toBe(entry('a', 9, 10).start);
    expect(next.end).toBeGreaterThan(entry('a', 9, 10).end);
  });

  it('moves with Alt+ArrowDown and resizes with Shift+Alt+ArrowDown', () => {
    const onCommit = vi.fn();
    render(<Timeline window={dayWindow} blocks={[entry('a', 9, 10)]} now={dayWindow.start} onSelect={() => {}} onCommit={onCommit} stepMin={15} />);
    const block = screen.getByRole('button', { name: /fixed block a 09:00 to 10:00/i });
    fireEvent.keyDown(block, { key: 'ArrowDown', altKey: true });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect((onCommit.mock.calls[0]![1] as { start: number }).start).toBe(entry('a', 9, 10).start + 15 * 60_000);
    fireEvent.keyDown(block, { key: 'ArrowDown', altKey: true, shiftKey: true });
    expect(onCommit).toHaveBeenCalledTimes(2);
    expect((onCommit.mock.calls[1]![1] as { end: number }).end).toBe(entry('a', 9, 10).end + 15 * 60_000);
  });

  it('draws overlapping blocks side by side and both are tappable', () => {
    const onSelect = vi.fn();
    const lanes = [
      { ...entry('a', 9, 11), lane: 0, laneCount: 2 },
      { ...entry('b', 10, 12), lane: 1, laneCount: 2 },
    ];
    render(<Timeline window={dayWindow} blocks={lanes} now={dayWindow.start} onSelect={onSelect} />);
    const a = screen.getByRole('button', { name: /fixed block a 09:00 to 11:00/i });
    const b = screen.getByRole('button', { name: /fixed block b 10:00 to 12:00/i });
    expect(a.style.left).not.toBe(b.style.left);
    expect(a.style.width).toBe(b.style.width);
    fireEvent.click(a);
    fireEvent.click(b);
    expect(onSelect).toHaveBeenCalledTimes(2);
  });
});
