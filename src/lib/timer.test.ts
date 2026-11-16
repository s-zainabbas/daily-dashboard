import { afterEach, describe, expect, it, vi } from 'vitest';
import { getState, setState, emptyState } from './store';
import { checkNudge, elapsedMs, fmtElapsed, getWork, workActions } from './timer';
import { today } from './date';

afterEach(() => {
  workActions.discard();
  vi.useRealTimers();
});

const reset = () => setState(() => ({ ...emptyState(), tasks: [{ id: 't1', title: 'Write', done: false, priority: 'med', createdAt: 0 }, { id: 't2', title: 'Read', done: false, priority: 'med', createdAt: 0 }] }));

describe('work stopwatch', () => {
  it('counts up and credits the minutes to the task when stopped', () => {
    reset();
    vi.useFakeTimers({ now: new Date(2026, 10, 16, 10, 0) });
    workActions.start('t1');
    vi.advanceTimersByTime(25 * 60_000);
    expect(elapsedMs()).toBe(25 * 60_000);
    expect(workActions.stop()).toEqual({ minutes: 25, title: 'Write', capped: false });
    expect(getState().focus[today()]).toMatchObject({ minutes: 25, sessions: 1, items: { t1: { title: 'Write', minutes: 25 } } });
    expect(getWork().startedAt).toBeUndefined();
  });

  it('switching logs the first task and starts the next', () => {
    reset();
    vi.useFakeTimers({ now: new Date(2026, 10, 16, 10, 0) });
    workActions.start('t1');
    vi.advanceTimersByTime(10 * 60_000);
    expect(workActions.start('t2')).toMatchObject({ minutes: 10, title: 'Write' });
    expect(getWork()).toMatchObject({ taskId: 't2' });
  });

  it('done ticks the task off', () => {
    reset();
    workActions.start('t1');
    workActions.finish();
    expect(getState().tasks.find((t) => t.id === 't1')?.done).toBe(true);
  });

  it('a forgotten timer is capped at 4 hours', () => {
    reset();
    vi.useFakeTimers({ now: new Date(2026, 10, 16, 8, 0) });
    workActions.start('t1');
    vi.advanceTimersByTime(9 * 3600_000);
    expect(workActions.stop()).toMatchObject({ minutes: 240, capped: true });
  });

  it('nudges once per stretch after the set time', () => {
    reset();
    vi.useFakeTimers({ now: new Date(2026, 10, 16, 10, 0) });
    workActions.start('t1');
    const seen: number[] = [];
    vi.advanceTimersByTime(49 * 60_000);
    checkNudge((m) => seen.push(m));
    vi.advanceTimersByTime(60_000);
    checkNudge((m) => seen.push(m));
    checkNudge((m) => seen.push(m));
    expect(seen).toEqual([50]);
  });

  it('formats elapsed time', () => {
    expect(fmtElapsed(65_000)).toBe('1:05');
    expect(fmtElapsed(3_725_000)).toBe('1:02:05');
  });
});
