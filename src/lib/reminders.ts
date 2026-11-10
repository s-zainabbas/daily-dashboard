import { dateKey, formatTime, nowMinutes, toMinutes } from './date';
import type { CalEvent, State } from './types';

/**
 * Reminders for events and tasks. They work while the dashboard is open (in any tab, or
 * installed as an app); a browser page can't wake itself up once it's closed.
 */

export interface Reminder {
  /** Unique per occurrence, so each reminder fires once. */
  key: string;
  title: string;
  body: string;
  taskId?: string;
}

/** Reminders that should fire now and haven't yet. A reminder opened up to 2 hours late still shows. */
export function dueReminders(s: State, events: CalEvent[], now: Date, fired: Set<string>, use24h = s.settings.use24h): Reminder[] {
  const t = dateKey(now);
  const m = nowMinutes(now);
  const out: Reminder[] = [];
  const lead = s.settings.eventReminder ?? 10;
  if (lead > 0) {
    for (const e of events) {
      if (e.date !== t || !e.start) continue;
      const start = toMinutes(e.start);
      const key = `ev:${e.id}:${e.date}:${e.start}`;
      if (m >= start - lead && m < start && !fired.has(key)) {
        const mins = Math.max(1, Math.round(start - m));
        out.push({ key, title: e.title, body: `Starts at ${formatTime(e.start, use24h)} · in ${mins} min${'location' in e && e.location ? ` · ${e.location}` : ''}` });
      }
    }
  }
  for (const task of s.tasks) {
    if (task.done || !task.remindAt) continue;
    const day = task.dueDate && task.dueDate > t ? task.dueDate : t;
    if (day !== t) continue;
    const at = toMinutes(task.remindAt);
    const key = `task:${task.id}:${t}:${task.remindAt}`;
    if (m >= at && m - at < 120 && !fired.has(key)) out.push({ key, title: task.title, body: 'Reminder', taskId: task.id });
  }
  return out;
}

/* ---------- Which reminders already fired (today), kept across reloads ---------- */

const KEY = 'daily-dashboard:reminded';

export function loadFired(today: string): Set<string> {
  try {
    const j = JSON.parse(localStorage.getItem(KEY) || 'null');
    return new Set(j?.date === today ? j.keys : []);
  } catch {
    return new Set();
  }
}

export function saveFired(today: string, keys: Set<string>) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ date: today, keys: [...keys] }));
  } catch {
    /* optional */
  }
}
