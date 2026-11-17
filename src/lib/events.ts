import { addDays, today } from './date';
import { anchored, firstDue, nextDate } from './repeat';
import type { CalEvent, DateKey } from './types';

/** Repeating events: each occurrence is shown as its own event, with an id made from the series and the day. */

export const occurrenceId = (seriesId: string, date: DateKey) => `${seriesId}~${date}`;
export const seriesOf = (id: string) => (id.includes('~') ? id.slice(0, id.indexOf('~')) : id);

/** Days a repeating event happens between `from` and `to` (inclusive). */
export function occurrenceDates(e: CalEvent, from: DateKey, to: DateKey): DateKey[] {
  if (!e.repeat) return e.date >= from && e.date <= to ? [e.date] : [];
  const rule = anchored(e.repeat, e.date);
  const skip = new Set(e.skip ?? []);
  const last = e.until && e.until < to ? e.until : to;
  const out: DateKey[] = [];
  let d = firstDue(rule, e.date);
  for (let n = 0; d <= last && n < 2000; n++) {
    if (d >= from && !skip.has(d)) out.push(d);
    d = nextDate(rule, d);
  }
  return out;
}

export interface Occurrence extends CalEvent {
  /** The repeating event this is one day of. */
  seriesId?: string;
}

/**
 * Your events with repeating ones spread out over the days they happen. One-off events are kept as
 * they are; repeats are shown from a few months back to a bit over a year ahead.
 */
export function expandEvents(events: CalEvent[], from = addDays(today(), -120), to = addDays(today(), 400)): Occurrence[] {
  if (!events.some((e) => e.repeat)) return events;
  const out: Occurrence[] = [];
  for (const e of events) {
    if (!e.repeat) {
      out.push(e);
      continue;
    }
    for (const d of occurrenceDates(e, from, to)) out.push({ ...e, id: occurrenceId(e.id, d), date: d, seriesId: e.id });
  }
  return out;
}
