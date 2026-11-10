import { addDays, dateKey, fromKey, lastDays } from './date';
import type { DateKey, Habit } from './types';

/** Habit rules: chosen days, counted habits, streaks that skip rest days. */

export const isScheduled = (h: Habit, d: DateKey) => !h.days?.length || h.days.includes(fromKey(d).getDay());

/** How many today (1 for a ticked yes / no habit). */
export const countOn = (h: Habit, d: DateKey) => {
  const v = h.history[d];
  return typeof v === 'number' ? v : v ? 1 : 0;
};

export const isDone = (h: Habit, d: DateKey) => countOn(h, d) >= (h.target && h.target > 1 ? h.target : 1);

/**
 * Days in a row it was done, counting only the days it's on. Today doesn't break the streak
 * until it's over, so the count doesn't drop first thing in the morning.
 */
export function habitStreak(h: Habit, ref: DateKey): number {
  let n = 0;
  let d = ref;
  const start = dateKey(new Date(h.createdAt || 0));
  for (let i = 0; i < 3660; i++, d = addDays(d, -1)) {
    if (!isScheduled(h, d)) continue;
    if (isDone(h, d)) n++;
    else if (d !== ref) break;
    if (d <= start && !isDone(h, d)) break;
  }
  return n;
}

export function bestStreak(h: Habit, ref: DateKey, days = 365): number {
  let best = 0;
  let run = 0;
  for (const d of lastDays(days, ref)) {
    if (!isScheduled(h, d)) continue;
    run = isDone(h, d) ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

/** Share of scheduled days done over the last `days` (since it was created). */
export function successRate(h: Habit, ref: DateKey, days = 30): number {
  const since = dateKey(new Date(h.createdAt || 0));
  const window = lastDays(days, ref).filter((d) => d >= since && isScheduled(h, d) && (d < ref || isDone(h, d)));
  if (!window.length) return 0;
  return window.filter((d) => isDone(h, d)).length / window.length;
}

/** Today's habits: the ones on today, and how many are done. */
export function todayHabits(habits: Habit[], t: DateKey) {
  const on = habits.filter((h) => isScheduled(h, t));
  return { on, done: on.filter((h) => isDone(h, t)), left: on.filter((h) => !isDone(h, t)) };
}

/** A new value after a tap: yes / no flips; counted habits go up one (or down with `-1`). */
export function bump(h: Habit, d: DateKey, delta: 1 | -1): boolean | number {
  if (!h.target || h.target <= 1) return delta > 0 ? !h.history[d] : false;
  return Math.max(0, Math.min(99, countOn(h, d) + delta));
}
