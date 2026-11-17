import { useSyncExternalStore } from 'react';
import { addDays, dateKey, toMinutes } from './date';
import { CALENDAR_EVENTS_SCOPE, CALENDAR_SCOPE, currentToken, googleConfigured, requestToken, tokenHasScope } from './google/auth';
import { CalendarError, deleteReminder, listReminderIds, putReminder, REMINDER_PREFIX, type ReminderEvent } from './google/calendar';
import { interviewEvents } from './jobs';
import { expandEvents } from './events';
import { getState, onStateChange } from './store';
import type { DateKey, State, TimeKey } from './types';

/**
 * Reminders that reach you when the dashboard is closed.
 *
 * A web page can't wake itself up, so the dashboard copies its reminders into your main Google
 * Calendar as events with a pop-up alert, and Google's apps alert you on your phone and laptop.
 * Covered: tasks with a reminder time, your own timed events and job interviews, for the next
 * 30 days. Ticking off, moving or deleting something updates or removes its calendar event.
 */

const DAYS_AHEAD = 30;
/** Length of a task reminder event in the calendar. */
const TASK_EVENT_MINUTES = 15;

/* ---------- Planning: which reminder events should exist (pure, tested) ---------- */

function at(date: DateKey, time: TimeKey): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  return new Date(y, m - 1, d, h, mi);
}

/** cyrb53 with a seed, as a number. */
function hashNum(str: string, seed: number): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/**
 * A Google event id made from everything the event shows, in base32hex (0-9, a-v) as Google
 * requires. Any change gives a new id, so updating is "delete the old one, add the new one", and
 * two devices planning the same reminder agree on its id instead of adding it twice.
 */
export function reminderId(parts: unknown[]): string {
  const s = JSON.stringify(parts);
  return REMINDER_PREFIX + hashNum(s, 1).toString(32) + hashNum(s, 2).toString(32);
}

export function plannedReminders(s: State, now = new Date()): ReminderEvent[] {
  const t = dateKey(now);
  const last = addDays(t, DAYS_AHEAD);
  const out: ReminderEvent[] = [];
  const future = (d: Date) => d.getTime() > now.getTime();

  for (const task of s.tasks) {
    if (task.done || !task.remindAt) continue;
    // Same rule as the in-app reminder: on its due date, or today when it has none or is overdue.
    const day = task.dueDate && task.dueDate > t ? task.dueDate : t;
    if (day > last) continue;
    const start = at(day, task.remindAt);
    if (!future(start)) continue;
    const summary = `🔔 ${task.title}`;
    out.push({
      id: reminderId(['task', task.id, day, task.remindAt, summary]),
      summary,
      start,
      end: new Date(start.getTime() + TASK_EVENT_MINUTES * 60_000),
      alertBefore: 0,
      free: true,
      description: 'Task reminder from Daily Dashboard. Tick it off in the dashboard and this event goes away.',
    });
  }

  const lead = s.settings.eventReminder ?? 10;
  if (lead > 0) {
    const events = [...expandEvents(s.events, t, last), ...interviewEvents(s.jobs)];
    for (const e of events) {
      if (!e.start || e.date < t || e.date > last) continue;
      const start = at(e.date, e.start);
      if (!future(start)) continue;
      const end = e.end && toMinutes(e.end) > toMinutes(e.start) ? at(e.date, e.end) : new Date(start.getTime() + 30 * 60_000);
      out.push({
        id: reminderId(['event', e.id, e.date, e.start, e.end, e.title, e.location, lead]),
        summary: e.title,
        start,
        end,
        alertBefore: lead,
        free: false,
        location: e.location,
        description: 'From Daily Dashboard. Edit it there; changes here are overwritten.',
      });
    }
  }
  return out;
}

/** What to add and what to remove so the calendar matches the plan. */
export function diffReminders(planned: ReminderEvent[], existing: string[]) {
  const want = new Map(planned.map((r) => [r.id, r]));
  const have = new Set(existing);
  return {
    add: [...want.values()].filter((r) => !have.has(r.id)),
    remove: existing.filter((id) => !want.has(id)),
  };
}

/* ---------- This device's setting and status ---------- */

export interface PhoneRemindersView {
  enabled: boolean;
  status: 'off' | 'ok' | 'syncing' | 'needs-auth' | 'error';
  error?: string;
  count?: number;
  syncedAt?: number;
}

const KEY = 'daily-dashboard:phone-reminders';
const listeners = new Set<() => void>();

function load(): PhoneRemindersView {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (v?.enabled) return { enabled: true, status: 'ok', count: v.count, syncedAt: v.syncedAt };
  } catch {
    /* fall through */
  }
  return { enabled: false, status: 'off' };
}

let view: PhoneRemindersView = typeof localStorage === 'undefined' ? { enabled: false, status: 'off' } : load();

function set(p: Partial<PhoneRemindersView>) {
  view = { ...view, ...p };
  try {
    if (view.enabled) localStorage.setItem(KEY, JSON.stringify({ enabled: true, count: view.count, syncedAt: view.syncedAt }));
    else localStorage.removeItem(KEY);
  } catch {
    /* optional */
  }
  listeners.forEach((l) => l());
}

export function usePhoneReminders(): PhoneRemindersView {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => view,
  );
}

/* ---------- Syncing with Google Calendar ---------- */

const canWrite = () => tokenHasScope(CALENDAR_EVENTS_SCOPE);
const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

let running: Promise<void> | null = null;
let again = false;

/** Bring the calendar in line with the dashboard. Safe to call often; runs one at a time. */
export function syncPhoneReminders(): Promise<void> {
  if (!view.enabled) return Promise.resolve();
  if (!canWrite()) {
    set({ status: 'needs-auth' });
    return Promise.resolve();
  }
  if (running) {
    again = true;
    return running;
  }
  const lock = (fn: () => Promise<void>) => (navigator.locks ? navigator.locks.request('daily-dashboard-phone-reminders', fn) : fn());
  running = lock(() => reconcile(getState()))
    .finally(() => {
      running = null;
      if (again) {
        again = false;
        void syncPhoneReminders();
      }
    });
  return running;
}

async function reconcile(s: State | null) {
  const token = currentToken();
  if (!token) return set({ status: 'needs-auth' });
  set({ status: 'syncing', error: undefined });
  try {
    const now = new Date();
    const existing = await listReminderIds(token, new Date(now.getTime() - 864e5));
    const planned = s ? plannedReminders(s, now) : [];
    const { add, remove } = diffReminders(planned, existing);
    for (const id of remove) await deleteReminder(token, id);
    for (const r of add) await putReminder(token, r, timeZone());
    set({ status: view.enabled ? 'ok' : 'off', count: planned.length, syncedAt: Date.now() });
  } catch (e) {
    if (e instanceof CalendarError && (e.kind === 'auth' || e.kind === 'scope')) set({ status: 'needs-auth' });
    else set({ status: 'error', error: e instanceof Error ? e.message : 'Couldn’t update Google Calendar.' });
  }
}

/** Turn it on. Must run straight from a click: Google's permission popup opens before any await. */
export function enablePhoneReminders(loginHint?: string): Promise<void> {
  const ask = canWrite() ? Promise.resolve() : requestToken('', loginHint, `${CALENDAR_SCOPE} ${CALENDAR_EVENTS_SCOPE}`).then(() => undefined);
  return ask.then(() => {
    if (!canWrite()) {
      set({ enabled: true, status: 'needs-auth', error: 'Calendar access wasn’t allowed. Try again and tick the box to edit your calendar events.' });
      return;
    }
    set({ enabled: true, status: 'ok' });
    return syncPhoneReminders();
  });
}

/** Turn it off and remove the reminder events the dashboard added. */
export async function disablePhoneReminders(): Promise<void> {
  if (canWrite()) await reconcile(null).catch(() => {});
  set({ enabled: false, status: 'off', count: undefined, syncedAt: undefined, error: undefined });
}

/** Keep the calendar up to date while the dashboard is open. Called once from main.tsx. */
export function initPhoneReminders() {
  if (!googleConfigured || typeof window === 'undefined') return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const soon = () => {
    if (!view.enabled) return;
    clearTimeout(timer);
    timer = setTimeout(() => void syncPhoneReminders(), 5000);
  };
  let last = getState();
  onStateChange(() => {
    // Only what reminders depend on; typing a note shouldn't touch the calendar.
    const s = getState();
    if (s.tasks === last.tasks && s.events === last.events && s.jobs === last.jobs && s.settings.eventReminder === last.settings.eventReminder) return;
    last = s;
    soon();
  });
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && soon());
  window.addEventListener('online', soon);
  // Undated tasks remind "today", so the plan changes with the date even when nothing is edited.
  setInterval(() => document.visibilityState === 'visible' && soon(), 30 * 60_000);
  soon();
}
