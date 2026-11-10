import { addDays, dateKey, fromKey, fromMinutes, today } from './date';
import { anchored, firstDue } from './repeat';
import type { DateKey, Priority, Repeat, RepeatFreq, TimeKey } from './types';

export interface Parsed {
  kind: 'task' | 'event';
  title: string;
  date?: DateKey;
  start?: TimeKey;
  end?: TimeKey;
  priority?: Priority;
  /** Set for "every …" phrases. A repeating item is always a task (any time stays in the title). */
  repeat?: Repeat;
}

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function to24(h: number, mer?: string, guessPm = false): number {
  mer = mer?.toLowerCase();
  if (mer === 'pm' && h < 12) return h + 12;
  if (mer === 'am' && h === 12) return 0;
  if (!mer && guessPm && h >= 1 && h <= 7) return h + 12; // "at 3" almost always means 3pm
  return h;
}

/**
 * Natural-language quick add. Understands things like:
 *   "Call Sam tomorrow !high"       → task, due tomorrow, high priority
 *   "Standup at 9:30 for 15m"       → event today 09:30–09:45
 *   "Dentist fri 3-4pm"             → event on the next Friday 15:00–16:00
 *   "Send invoice nov 14"           → task due Nov 14
 *   "Gym every mon wed fri"         → task repeating on those days
 *   "Pay rent monthly"              → task repeating every month
 */
export function parseQuick(input: string, ref: DateKey = today()): Parsed {
  let text = ` ${input} `;
  const out: Parsed = { kind: 'task', title: '' };
  const take = (re: RegExp, fn: (m: RegExpMatchArray) => boolean | void) => {
    const m = text.match(re);
    if (m && fn(m) !== false) text = text.replace(m[0], ' ');
  };

  // Priority: !high / !med / !low / !h / ! / !! / !!!
  take(/\s(!{1,3}|!(?:high|h|med|medium|m|low|l))(?=\s)/i, (m) => {
    const t = m[1].toLowerCase();
    out.priority = t === '!!!' || t === '!high' || t === '!h' ? 'high' : t === '!!' || t.startsWith('!m') ? 'med' : t === '!' ? 'high' : 'low';
  });

  // Repeats — before dates, so "every monday" isn't read as "next Monday".
  const DAY = String.raw`(?:sun(?:day)?|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?)s?\b`;
  const UNIT: Record<string, RepeatFreq> = { day: 'daily', week: 'weekly', month: 'monthly', year: 'yearly' };
  take(new RegExp(String.raw`\s(?:every|each)\s+(${DAY}(?:\s*(?:,|and|&)?\s*${DAY})*)(?=\s)`, 'i'), (m) => {
    const days = [...m[1].toLowerCase().matchAll(/(sun|mon|tue|wed|thu|fri|sat)[a-z]*/g)].map((x) => WEEKDAYS.indexOf(x[1]));
    out.repeat = { freq: 'weekly', days: [...new Set(days)] };
  });
  if (!out.repeat)
    take(/\s(?:every\s+(?:week\s*day|work\s*day)s?|on\s+weekdays|weekdays)(?=\s)/i, () => {
      out.repeat = { freq: 'weekdays' };
    });
  if (!out.repeat)
    take(/\s(?:every|each)\s+(other|\d{1,3})?\s*(day|week|month|year)s?(?=\s)/i, (m) => {
      const n = m[1] ? (m[1].toLowerCase() === 'other' ? 2 : Number(m[1])) : 1;
      if (n < 1) return false;
      out.repeat = { freq: UNIT[m[2].toLowerCase()], ...(n > 1 ? { interval: n } : {}) };
    });
  if (!out.repeat)
    // Bare "weekly" etc. only at the end or before a start date, so "the weekly report" stays plain text.
    take(/\s(daily|everyday|weekly|fortnightly|biweekly|monthly|yearly|annually)(?=\s*$|\s+(?:from|starting|beginning|on|today|tomorrow|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{4}-)[a-z]*\b)/i, (m) => {
      const w = m[1].toLowerCase();
      out.repeat =
        w === 'fortnightly' || w === 'biweekly'
          ? { freq: 'weekly', interval: 2 }
          : { freq: w === 'daily' || w === 'everyday' ? 'daily' : w === 'weekly' ? 'weekly' : w === 'monthly' ? 'monthly' : 'yearly' };
    });

  // Dates
  take(/\s(?:on\s+)?(\d{4})-(\d{2})-(\d{2})(?=\s)/, (m) => {
    out.date = `${m[1]}-${m[2]}-${m[3]}`;
  });
  if (!out.date)
    take(/\s(today|tonight|tod)(?=\s)/i, () => {
      out.date = ref;
    });
  if (!out.date)
    take(/\s(tomorrow|tmrw|tmr)(?=\s)/i, () => {
      out.date = addDays(ref, 1);
    });
  if (!out.date)
    take(/\snext\s+week(?=\s)/i, () => {
      out.date = addDays(ref, 7);
    });
  if (!out.date)
    take(/\sin\s+(\d{1,3})\s+(day|days|week|weeks)(?=\s)/i, (m) => {
      out.date = addDays(ref, Number(m[1]) * (m[2].startsWith('week') ? 7 : 1));
    });
  if (!out.date)
    take(/\s(?:on\s+)?(?:next\s+)?(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)[a-z]*(?=\s)/i, (m) => {
      const target = WEEKDAYS.indexOf(m[1].slice(0, 3).toLowerCase());
      const cur = fromKey(ref).getDay();
      out.date = addDays(ref, ((target - cur + 7) % 7) || 7);
    });
  if (!out.date)
    take(/\s(?:on\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?=\s)/i, (m) => {
      const month = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
      const day = Number(m[2]);
      if (day < 1 || day > 31) return false;
      const r = fromKey(ref);
      let d = new Date(r.getFullYear(), month, day);
      if (dateKey(d) < ref) d = new Date(r.getFullYear() + 1, month, day);
      out.date = dateKey(d);
    });

  if (out.repeat) {
    // A start date ("from tomorrow", "starting nov 14") counts if it fits; otherwise the first day that does.
    out.date = firstDue(out.repeat, out.date ?? ref);
    out.repeat = anchored(out.repeat, out.date);
    out.title = text.replace(/\s+/g, ' ').trim().replace(/\s+(on|at|by|due|from|starting)$/i, '').trim();
    return out;
  }

  // Time range: "3-4pm", "14:00-15:30", "from 9 to 10am"
  const T = String.raw`(\d{1,2})(?::(\d{2}))?\s*(am|pm)?`;
  take(new RegExp(String.raw`\s(?:at\s+|from\s+|@\s?)?${T}\s*(?:-|–|to)\s*${T}(?=\s)`, 'i'), (m) => {
    const [, h1, m1, a1, h2, m2, a2] = m;
    if (!(m1 || a1 || a2 || /at|from|@/i.test(m[0]))) return false;
    let e = to24(Number(h2), a2, true);
    let s = to24(Number(h1), a1 ?? (a2 && Number(h1) <= Number(h2) ? a2 : undefined), !a2);
    if (Number(h1) > 23 || e > 23) return false;
    if (s > e && !a1) s -= 12;
    out.start = fromMinutes(s * 60 + Number(m1 || 0));
    out.end = fromMinutes(e * 60 + Number(m2 || 0));
  });

  // Single time: "at 3", "@15:00", "9:30", "3pm"
  if (!out.start)
    take(new RegExp(String.raw`\s(at\s+|@\s?)?${T}(?=\s)`, 'i'), (m) => {
      const [, prefix, h, min, mer] = m;
      if (!(prefix || min || mer)) return false;
      const hour = to24(Number(h), mer, !!prefix && !min);
      if (hour > 23 || Number(min || 0) > 59) return false;
      out.start = fromMinutes(hour * 60 + Number(min || 0));
    });

  // Duration: "for 30m", "for 1.5h"
  let duration = 60;
  take(/\sfor\s+(\d+(?:\.\d+)?)\s*(m|min|mins|minutes|h|hr|hrs|hour|hours)(?=\s)/i, (m) => {
    duration = Math.round(Number(m[1]) * (m[2].toLowerCase().startsWith('h') ? 60 : 1));
  });

  if (out.start) {
    out.kind = 'event';
    out.date ??= ref;
    if (!out.end) {
      const [h, mm] = out.start.split(':').map(Number);
      out.end = fromMinutes(Math.min(h * 60 + mm + duration, 23 * 60 + 59));
    }
  }

  out.title = text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s+(on|at|by|due|from)$/i, '')
    .trim();
  return out;
}

/** Split pasted text into checklist steps: one per line, without list markers like "-", "*", "1." or "[ ]". */
export function splitSteps(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)]|\[[ xX]?\])\s*/, '').trim())
    .filter(Boolean);
}
