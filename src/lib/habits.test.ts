import { describe, expect, it } from 'vitest';
import { bestStreak, bump, habitStreak, isDone, successRate, todayHabits } from './habits';
import type { Habit } from './types';

// 2026-11-10 is a Tuesday.
const T = '2026-11-10';
const h = (p: Partial<Habit>): Habit => ({ id: 'h', name: 'h', history: {}, createdAt: new Date(2026, 9, 1).getTime(), ...p });

describe('habits', () => {
  it('a daily streak, forgiving an unticked today', () => {
    const x = h({ history: { '2026-11-07': true, '2026-11-08': true, '2026-11-09': true } });
    expect(habitStreak(x, T)).toBe(3);
    expect(habitStreak({ ...x, history: { ...x.history, [T]: true } }, T)).toBe(4);
  });

  it('chosen days: rest days don’t break the streak', () => {
    // Gym Mon / Wed / Fri: done Fri 6, Mon 9 → streak 2 on Tuesday (a rest day).
    const gym = h({ days: [1, 3, 5], history: { '2026-11-04': true, '2026-11-06': true, '2026-11-09': true } });
    expect(habitStreak(gym, T)).toBe(3);
    expect(todayHabits([gym], T).on).toHaveLength(0); // not on today
  });

  it('counted habits are done at their target', () => {
    const water = h({ target: 8, history: { [T]: 5 } });
    expect(isDone(water, T)).toBe(false);
    expect(bump(water, T, 1)).toBe(6);
    expect(bump(water, T, -1)).toBe(4);
    expect(isDone({ ...water, history: { [T]: 8 } }, T)).toBe(true);
    expect(bump(h({}), T, 1)).toBe(true);
  });

  it('success rate and best streak', () => {
    const x = h({ history: { '2026-11-01': true, '2026-11-02': true, '2026-11-03': true, '2026-11-05': true } });
    expect(bestStreak(x, T)).toBe(3);
    expect(successRate(x, T, 10)).toBeCloseTo(4 / 9); // today not done yet doesn't count against you
  });
});
