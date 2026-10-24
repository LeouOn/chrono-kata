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

  it('previews while dragging, cancels on Escape after a real move, and restores the label', () => {
    vi.useFakeTimers();
    const onCommit = vi.fn();
    const onSelect = vi.fn();
    render(<Timeline window={dayWindow} blocks={[entry('a', 9, 10)]} now={dayWindow.start} onSelect={onSelect} onCommit={onCommit} stepMin={15} />);
    const block = screen.getByRole('button', { name: /fixed block a 09:00 to 10:00/i });
    fireEvent.pointerDown(block, { clientY: 100 });
    fireEvent.pointerMove(block, { clientY: 166 });
    expect(screen.getByRole('button', { name: /fixed block a 10:00 to 11:00/i })).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.pointerUp(block);
    vi.runAllTimers();
    expect(onCommit).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /fixed block a 09:00 to 10:00/i })).toBeTruthy();
    vi.useRealTimers();
  });

  it('renders a 15-minute block at the shared 24px height', () => {
    const block = { ...entry('a', 9, 9), end: new Date(2026, 5, 15, 9).getTime() + 15 * 60_000 };
    render(<Timeline window={dayWindow} blocks={[block]} now={dayWindow.start} onSelect={() => {}} onCommit={() => {}} />);
    const button = screen.getByRole('button', { name: /fixed block a 09:00 to 09:15/i });
    expect(button.style.height).toBe('24px');
  });

  it('cancels on pointercancel, ignores later moves and release', () => {
    const onCommit = vi.fn();
    render(<Timeline window={dayWindow} blocks={[entry('a', 9, 10)]} now={dayWindow.start} onSelect={() => {}} onCommit={onCommit} stepMin={15} />);
    const block = screen.getByRole('button', { name: /fixed block a 09:00 to 10:00/i });
    fireEvent.pointerDown(block, { clientY: 100 });
    fireEvent.pointerMove(block, { clientY: 166 });
    fireEvent.pointerCancel(block);
    fireEvent.pointerMove(block, { clientY: 200 });
    fireEvent.pointerUp(block);
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /fixed block a 09:00 to 10:00/i })).toBeTruthy();
  });

  it('cancels on pointercancel and never commits later', () => {
    const onCommit = vi.fn();
    render(<Timeline window={dayWindow} blocks={[entry('a', 9, 10)]} now={dayWindow.start} onSelect={() => {}} onCommit={onCommit} stepMin={15} />);
    const block = screen.getByRole('button', { name: /fixed block a 09:00 to 10:00/i });
    fireEvent.pointerDown(block, { clientY: 100 });
    fireEvent.pointerMove(block, { clientY: 166 });
    fireEvent.pointerCancel(block);
    fireEvent.pointerUp(block);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('resizes only the start edge from the start handle', () => {
    const onCommit = vi.fn();
    render(<Timeline window={dayWindow} blocks={[entry('a', 9, 10)]} now={dayWindow.start} onSelect={() => {}} onCommit={onCommit} stepMin={15} />);
    const handle = screen.getByRole('button', { name: /resize start of a/i });
    fireEvent.pointerDown(handle, { clientY: 100 });
    fireEvent.pointerMove(handle, { clientY: 133 });
    fireEvent.pointerUp(handle);
    const next = onCommit.mock.calls[0]![1] as { start: number; end: number };
    expect(next.end).toBe(entry('a', 9, 10).end);
    expect(next.start).toBeGreaterThan(entry('a', 9, 10).start);
  });

  it('does nothing on plain arrows and keeps the start fixed when Shift resizes the end', () => {
    const onCommit = vi.fn();
    render(<Timeline window={dayWindow} blocks={[entry('a', 9, 10)]} now={dayWindow.start} onSelect={() => {}} onCommit={onCommit} stepMin={15} />);
    const block = screen.getByRole('button', { name: /fixed block a 09:00 to 10:00/i });
    fireEvent.keyDown(block, { key: 'ArrowDown' });
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.keyDown(block, { key: 'ArrowDown', altKey: true, shiftKey: true });
    const next = onCommit.mock.calls[0]![1] as { start: number; end: number };
    expect(next.start).toBe(entry('a', 9, 10).start);
    expect(next.end).toBe(entry('a', 9, 10).end + 15 * 60_000);
  });

  it('honours the chosen snap step for drags and keyboard', () => {
    const onCommit = vi.fn();
    const { rerender } = render(<Timeline window={dayWindow} blocks={[entry('a', 9, 10)]} now={dayWindow.start} onSelect={() => {}} onCommit={onCommit} stepMin={5} />);
    let block = screen.getByRole('button', { name: /fixed block a 09:00 to 10:00/i });
    fireEvent.pointerDown(block, { clientY: 100 });
    fireEvent.pointerMove(block, { clientY: 111 });
    fireEvent.pointerUp(block);
    expect((onCommit.mock.calls[0]![1] as { start: number }).start).toBe(entry('a', 9, 10).start + 10 * 60_000);
    onCommit.mockClear();
    rerender(<Timeline window={dayWindow} blocks={[entry('a', 9, 10)]} now={dayWindow.start} onSelect={() => {}} onCommit={onCommit} stepMin={15} />);
    block = screen.getByRole('button', { name: /fixed block a 09:00 to 10:00/i });
    fireEvent.pointerDown(block, { clientY: 100 });
    fireEvent.pointerMove(block, { clientY: 111 });
    fireEvent.pointerUp(block);
    expect((onCommit.mock.calls[0]![1] as { start: number }).start).toBe(entry('a', 9, 10).start + 15 * 60_000);
    onCommit.mockClear();
    fireEvent.keyDown(block, { key: 'ArrowDown', altKey: true });
    expect((onCommit.mock.calls[0]![1] as { start: number }).start).toBe(entry('a', 9, 10).start + 15 * 60_000);
    onCommit.mockClear();
    rerender(<Timeline window={dayWindow} blocks={[entry('a', 9, 10)]} now={dayWindow.start} onSelect={() => {}} onCommit={onCommit} stepMin={5} />);
    block = screen.getByRole('button', { name: /fixed block a 09:00 to 10:00/i });
    fireEvent.keyDown(block, { key: 'ArrowDown', altKey: true });
    expect((onCommit.mock.calls[0]![1] as { start: number }).start).toBe(entry('a', 9, 10).start + 5 * 60_000);
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
    expect((onCommit.mock.calls[1]![1] as { start: number }).start).toBe(entry('a', 9, 10).start);
  });

  it('never drags an anchor', () => {
    const onCommit = vi.fn();
    const anchor: TimelineBlock = { ...entry('anchor', 9, 10), kind: 'anchor' };
    render(<Timeline window={dayWindow} blocks={[anchor]} now={dayWindow.start} onSelect={() => {}} onCommit={onCommit} />);
    const block = screen.getByRole('button', { name: /anchor block anchor 09:00 to 10:00/i });
    fireEvent.pointerDown(block, { clientY: 100 });
    fireEvent.pointerMove(block, { clientY: 200 });
    fireEvent.pointerUp(block);
    expect(onCommit).not.toHaveBeenCalled();
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
