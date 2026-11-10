import type { DateKey, TimeKey } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Local calendar date key. The original dashboard used `toISOString()`, which is UTC,
 * so "today" flipped to the wrong day in the evening (Americas) or morning (Asia).
 */
export function dateKey(d: Date = new Date()): DateKey {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parse a date key as local midnight. */
export function fromKey(key: DateKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Add calendar days (DST-safe: works on the date, not on milliseconds). */
export function addDays(key: DateKey, n: number): DateKey {
  const d = fromKey(key);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

/** Whole calendar days from `a` to `b`. */
export function diffDays(a: DateKey, b: DateKey): number {
  return Math.round((fromKey(b).getTime() - fromKey(a).getTime()) / 864e5);
}

export const today = () => dateKey();

export function toMinutes(t: TimeKey): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function fromMinutes(min: number): TimeKey {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

export function nowMinutes(d = new Date()): number {
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
}

export function formatTime(t: TimeKey, use24h: boolean): string {
  if (use24h) return t;
  const [h, m] = t.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 || 12;
  return m ? `${h12}:${pad(m)}${suffix}` : `${h12}${suffix}`;
}

export function formatDuration(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
}

/** Friendly relative label for a due date. */
export function dueLabel(key: DateKey, ref: DateKey = today()): string {
  const n = diffDays(ref, key);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  if (n < 0) return `${-n} days overdue`;
  if (n < 7) return fromKey(key).toLocaleDateString(undefined, { weekday: 'long' });
  return fromKey(key).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** `dueLabel` for use mid-sentence: "next one tomorrow", "next one Thursday". */
export function dueLabelInline(key: DateKey, ref: DateKey = today()): string {
  const l = dueLabel(key, ref);
  return ['Today', 'Tomorrow', 'Yesterday'].includes(l) ? l.toLowerCase() : l;
}

export function longDate(d = new Date()): string {
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

export function greeting(d = new Date()): string {
  const h = d.getHours();
  if (h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/** The last `n` days ending today, oldest first. */
export function lastDays(n: number, end: DateKey = today()): DateKey[] {
  return Array.from({ length: n }, (_, i) => addDays(end, i - n + 1));
}

/**
 * Consecutive completed days ending today — or ending yesterday when today isn't
 * ticked yet, so a streak doesn't look broken first thing in the morning.
 * (The original subtracted 86,400,000 *days* per step, so streaks never passed 1.)
 */
export function streak(history: Record<DateKey, boolean>, ref: DateKey = today()): number {
  let d = history[ref] ? ref : addDays(ref, -1);
  let n = 0;
  while (history[d]) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

/** The wall-clock time `minutes` after `d`, as HH:MM (stays within the day). */
export function addMinutesTo(d: Date, minutes: number): TimeKey {
  return fromMinutes(Math.min(d.getHours() * 60 + d.getMinutes() + minutes, 23 * 60 + 59));
}
