import { addDays, dateKey, fromKey } from './date';
import type { DateKey, Repeat } from './types';

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** Weekday order for display and week maths: Monday first. */
const MON_FIRST = [1, 2, 3, 4, 5, 6, 0];

const step = (r: Repeat) => Math.max(1, Math.floor(r.interval ?? 1));
const weekday = (d: DateKey) => fromKey(d).getDay();
const isWorkday = (d: DateKey) => weekday(d) >= 1 && weekday(d) <= 5;
const mondayOf = (d: DateKey) => addDays(d, -((weekday(d) + 6) % 7));

/** Same day of month `months` later, clamped to the month's length (Jan 31 → Feb 28). */
function addMonths(d: DateKey, months: number, day: number): DateKey {
  const f = fromKey(d);
  const first = new Date(f.getFullYear(), f.getMonth() + months, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return dateKey(new Date(first.getFullYear(), first.getMonth(), Math.min(day, last)));
}

/** The occurrence straight after `from`, where `from` is itself an occurrence (the current due date). */
export function nextDate(r: Repeat, from: DateKey): DateKey {
  const n = step(r);
  switch (r.freq) {
    case 'daily':
      return addDays(from, n);
    case 'weekdays': {
      let d = addDays(from, 1);
      while (!isWorkday(d)) d = addDays(d, 1);
      return d;
    }
    case 'weekly': {
      const days = r.days?.length ? r.days : [weekday(from)];
      // Later this week (weeks run Monday → Sunday)…
      const pos = MON_FIRST.indexOf(weekday(from));
      const later = MON_FIRST.slice(pos + 1).find((w) => days.includes(w));
      if (later !== undefined) return addDays(from, MON_FIRST.indexOf(later) - pos);
      // …otherwise the first chosen day of the next active week.
      const first = MON_FIRST.find((w) => days.includes(w))!;
      return addDays(mondayOf(from), 7 * n + MON_FIRST.indexOf(first));
    }
    case 'monthly':
      return addMonths(from, n, r.monthDay ?? fromKey(from).getDate());
    case 'yearly':
      return addMonths(from, 12 * n, r.monthDay ?? fromKey(from).getDate());
  }
}

/**
 * When the next copy is due after completing one that was due on `due`.
 * Always after today, so finishing an overdue daily task doesn't create another overdue one.
 */
export function nextDue(r: Repeat, due: DateKey | undefined, today: DateKey): DateKey {
  let d = due ?? today;
  for (let i = 0; i < 5000; i++) {
    d = nextDate(r, d);
    if (d > today) return d;
  }
  return addDays(today, 1);
}

/** The first date on or after `from` that fits the rule, for a newly created repeating task. */
export function firstDue(r: Repeat, from: DateKey): DateKey {
  if (r.freq === 'weekdays') {
    let d = from;
    while (!isWorkday(d)) d = addDays(d, 1);
    return d;
  }
  if (r.freq === 'weekly' && r.days?.length) {
    let d = from;
    while (!r.days.includes(weekday(d))) d = addDays(d, 1);
    return d;
  }
  if ((r.freq === 'monthly' || r.freq === 'yearly') && r.monthDay && r.monthDay !== fromKey(from).getDate()) {
    const f = fromKey(from);
    const thisMonth = addMonths(dateKey(new Date(f.getFullYear(), f.getMonth(), 1)), 0, r.monthDay);
    return thisMonth >= from ? thisMonth : addMonths(thisMonth, r.freq === 'yearly' ? 12 : 1, r.monthDay);
  }
  return from;
}

/** Fill in the anchor day for monthly / yearly rules from the due date. */
export function anchored(r: Repeat, due?: DateKey): Repeat {
  if ((r.freq === 'monthly' || r.freq === 'yearly') && !r.monthDay && due) return { ...r, monthDay: fromKey(due).getDate() };
  return r;
}

const sortDays = (days: number[]) => MON_FIRST.filter((d) => days.includes(d));

/** Short label: "Daily", "Weekdays", "Mon, Wed, Fri", "Every 2 weeks", "Monthly". */
export function repeatLabel(r: Repeat): string {
  const n = step(r);
  const every = (unit: string) => (n === 1 ? null : `Every ${n} ${unit}s`);
  switch (r.freq) {
    case 'daily':
      return every('day') ?? 'Daily';
    case 'weekdays':
      return 'Weekdays';
    case 'weekly': {
      const days = r.days?.length ? sortDays(r.days).map((d) => DAY_SHORT[d]).join(', ') : '';
      if (n === 1) return days && r.days!.length < 7 ? `Every ${days}` : 'Weekly';
      return `Every ${n} weeks${days ? ` · ${days}` : ''}`;
    }
    case 'monthly':
      return every('month') ?? 'Monthly';
    case 'yearly':
      return every('year') ?? 'Yearly';
  }
}

export { DAY_SHORT, MON_FIRST };
