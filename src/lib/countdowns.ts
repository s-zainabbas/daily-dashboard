import { addDays, dateKey, diffDays, fromKey } from './date';
import type { Countdown, DateKey } from './types';

/** When a countdown next happens on or after `today` (yearly ones come round again), or null once it's past. */
export function nextDate(c: Countdown, today: DateKey): DateKey | null {
  if (!c.yearly) return c.date >= today ? c.date : null;
  const d = fromKey(c.date);
  const t = fromKey(today);
  const at = (y: number) => {
    // Feb 29 falls on Feb 28 in other years.
    const last = new Date(y, d.getMonth() + 1, 0).getDate();
    return dateKey(new Date(y, d.getMonth(), Math.min(d.getDate(), last)));
  };
  const thisYear = at(t.getFullYear());
  return thisYear >= today ? thisYear : at(t.getFullYear() + 1);
}

export interface Upcoming {
  c: Countdown;
  date: DateKey;
  days: number;
  /** Yearly ones: which time round (a 30th birthday), when the first date is in the past. */
  nth?: number;
}

/** Countdowns still ahead, soonest first. */
export function upcoming(list: Countdown[], today: DateKey): Upcoming[] {
  return list
    .map((c) => {
      const date = nextDate(c, today);
      if (!date) return null;
      const nth = c.yearly ? fromKey(date).getFullYear() - fromKey(c.date).getFullYear() : 0;
      return { c, date, days: diffDays(today, date), ...(nth > 0 ? { nth } : {}) };
    })
    .filter((x): x is Upcoming => !!x)
    .sort((a, b) => a.days - b.days || a.c.title.localeCompare(b.c.title));
}

/** "Today", "Tomorrow", "in 5 days", "in 3 weeks", "in 4 months". */
export function inDays(n: number): string {
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n < 14) return `in ${n} days`;
  if (n < 60) return `in ${Math.round(n / 7)} weeks`;
  return `in ${Math.round(n / 30.4)} months`;
}

/** Each countdown's days between `from` and `to`, for the calendar. */
export function countdownDays(list: Countdown[], from: DateKey, to: DateKey): { c: Countdown; date: DateKey }[] {
  const out: { c: Countdown; date: DateKey }[] = [];
  for (const c of list) {
    if (!c.yearly) {
      if (c.date >= from && c.date <= to) out.push({ c, date: c.date });
      continue;
    }
    for (let d = nextDate(c, from); d && d <= to; d = nextDate(c, addDays(d, 1))) out.push({ c, date: d });
  }
  return out;
}
