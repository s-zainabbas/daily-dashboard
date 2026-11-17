import { useSyncExternalStore } from 'react';
import { addDays, diffDays, today } from './date';
import { CALENDAR_EVENTS_SCOPE, CALENDAR_SCOPE, currentToken, googleConfigured, requestToken, tokenHasScope } from './google/auth';
import { CalendarError, createGoogleEvent, deleteGoogleEvent, listCalendars, listEvents, REMINDER_PREFIX, toShown, updateGoogleEvent, type EventInput, type GCalendar, type ShownEvent } from './google/calendar';
import { useStore } from './store';
import type { CalEvent, Countdown, DateKey, JobApplication } from './types';
import { countdownDays } from './countdowns';
import { interviewEvents } from './jobs';
import { expandEvents } from './events';

/**
 * Google Calendar on the dashboard: read-only, per device. Events are fetched from Google,
 * kept in a small cache so they show instantly (and offline), and merged with your own events
 * wherever events are shown. Nothing from Google is written into your dashboard data.
 */

export type GcalStatus = 'off' | 'loading' | 'ok' | 'needs-auth' | 'error';

export interface GcalView {
  enabled: boolean;
  status: GcalStatus;
  error?: string;
  /** A page that fixes the error, when there is one. */
  errorLink?: string;
  calendars: GCalendar[];
  /** Calendar ids you chose to show. Undefined = the ones ticked in Google Calendar itself. */
  chosen?: string[];
  events: ShownEvent[];
  fetchedAt?: number;
}

const KEY = 'daily-dashboard:gcal';
const STALE_MS = 5 * 60_000;
const listeners = new Set<() => void>();

function load(): GcalView {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (v && typeof v === 'object' && v.enabled) return { calendars: [], events: [], ...v, status: 'ok', error: undefined, errorLink: undefined };
  } catch {
    /* fall through */
  }
  return { enabled: false, status: 'off', calendars: [], events: [] };
}

let view: GcalView = typeof localStorage === 'undefined' ? { enabled: false, status: 'off', calendars: [], events: [] } : load();

function set(p: Partial<GcalView>) {
  view = { ...view, ...p };
  try {
    if (!view.enabled) localStorage.removeItem(KEY);
    else {
      const { calendars, chosen, events, fetchedAt, enabled } = view;
      localStorage.setItem(KEY, JSON.stringify({ enabled, calendars, chosen, events, fetchedAt }));
    }
  } catch {
    /* cache is optional */
  }
  listeners.forEach((l) => l());
}

export const gcalAvailable = googleConfigured;
export const getGcal = () => view;

export function useGcal(): GcalView {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => view,
  );
}

const shownIds = (v: GcalView) => new Set(v.chosen ?? v.calendars.filter((c) => c.selected || c.primary).map((c) => c.id));

/** The days loaded from Google: a week back to two months ahead, widened to whatever you browse to. */
const defaultRange = () => ({ from: addDays(today(), -7), to: addDays(today(), 60) });
let range = defaultRange();
// Don't let browsing far away grow one fetch without limit: keep at most ~14 months loaded.
const MAX_SPAN_DAYS = 430;

/**
 * Make sure Google events for these days are loaded (calendar and planner views call this as you
 * move between months). Does nothing when they already are.
 */
export function ensureCalendarRange(from: DateKey, to: DateKey): Promise<void> {
  if (!view.enabled || (from >= range.from && to <= range.to)) return Promise.resolve();
  const wider = { from: from < range.from ? from : range.from, to: to > range.to ? to : range.to };
  // Jumped far away: load just that stretch (plus the default window) instead of everything in between.
  range = diffDays(wider.from, wider.to) > MAX_SPAN_DAYS ? { from: from < today() ? from : addDays(today(), -7), to: to > today() ? to : addDays(today(), 60) } : wider;
  if (diffDays(range.from, range.to) > MAX_SPAN_DAYS) range = { from, to };
  return refreshCalendar(true);
}

/** Fetch calendars and events. Quietly does nothing without a token that has calendar access. */
let inflight: Promise<void> | null = null;
let again = false;
export function refreshCalendar(force = false): Promise<void> {
  if (!view.enabled) return Promise.resolve();
  if (!force && view.fetchedAt && Date.now() - view.fetchedAt < STALE_MS && view.status === 'ok') return Promise.resolve();
  if (!tokenHasScope(CALENDAR_SCOPE)) {
    set({ status: 'needs-auth' });
    return Promise.resolve();
  }
  // A forced refresh while one is running (e.g. you moved to another month) runs once more after it.
  if (inflight) {
    if (force) again = true;
    return inflight;
  }
  return (inflight = run().finally(() => {
    inflight = null;
    if (again) {
      again = false;
      return refreshCalendar(true);
    }
  }));
}

async function run() {
  const token = currentToken()!;
  const { from, to } = range;
  set({ status: 'loading', error: undefined, errorLink: undefined });
  try {
    const calendars = await listCalendars(token);
    const ids = shownIds({ ...view, calendars });
    const lists = await Promise.all(
      calendars.filter((c) => ids.has(c.id)).map(async (c) => (await listEvents(token, c.id, from, addDays(to, 1)))
          // The dashboard's own phone reminders are already shown as your tasks and events.
          .filter((e) => !e.id.startsWith(REMINDER_PREFIX))
          .flatMap((e) => toShown(e, c))),
    );
    set({ calendars, events: lists.flat(), fetchedAt: Date.now(), status: 'ok' });
  } catch (e) {
    if (e instanceof CalendarError && (e.kind === 'auth' || e.kind === 'scope')) set({ status: 'needs-auth' });
    else set({ status: 'error', error: e instanceof Error ? e.message : 'Couldn’t load Google Calendar.', errorLink: e instanceof CalendarError ? e.link : undefined });
  }
}

/**
 * Turn the calendar on (or sign in again). Must run straight from a click, because
 * Google's permission popup is requested before anything is awaited.
 */
export function connectCalendar(loginHint?: string): Promise<void> {
  const hadAccess = tokenHasScope(CALENDAR_SCOPE);
  const ask = hadAccess ? Promise.resolve() : requestToken('', loginHint, CALENDAR_SCOPE).then(() => undefined);
  return ask.then(() => {
    if (!tokenHasScope(CALENDAR_SCOPE)) {
      set({ enabled: true, status: 'needs-auth', error: 'Calendar access wasn’t allowed. Try again and tick the calendar box on Google’s screen.' });
      return;
    }
    set({ enabled: true });
    return refreshCalendar(true);
  });
}

export function disconnectCalendar() {
  set({ enabled: false, status: 'off', calendars: [], events: [], chosen: undefined, fetchedAt: undefined, error: undefined, errorLink: undefined });
}

export function chooseCalendars(ids: string[]) {
  set({ chosen: ids });
  return refreshCalendar(true);
}

export function isChosen(v: GcalView, id: string) {
  return shownIds(v).has(id);
}

/* ---------- Adding and changing Google events ---------- */

/** Calendars shown on the dashboard that you can add events to. */
export function writableCalendars(v: GcalView = view): GCalendar[] {
  if (!v.enabled) return [];
  const ids = shownIds(v);
  return v.calendars.filter((c) => c.writable && ids.has(c.id));
}

/** The sign-in covers changing calendar events (asked for once, the first time you save one). */
export const canEditGoogle = () => tokenHasScope(CALENDAR_EVENTS_SCOPE);

/**
 * Ask Google for permission to change events, if it wasn't given yet. Call straight from a click
 * or form submit: Google's window is opened before anything is awaited.
 */
export function allowGoogleEditing(loginHint?: string): Promise<void> {
  if (canEditGoogle()) return Promise.resolve();
  return requestToken('', loginHint, `${CALENDAR_SCOPE} ${CALENDAR_EVENTS_SCOPE}`).then(() => {
    if (!canEditGoogle()) throw new Error('Permission to change calendar events wasn’t given. Try again and tick the box for editing events.');
  });
}

function editToken(): string {
  const token = currentToken();
  if (!token || !canEditGoogle()) throw new Error('Google sign-in needs to be renewed. Try again.');
  return token;
}

/** Add an event to a Google calendar, or change one (`eventId`). Then reloads the calendar. */
export async function saveGoogleEvent(calendarId: string, input: EventInput, eventId?: string): Promise<void> {
  const token = editToken();
  if (eventId) await updateGoogleEvent(token, calendarId, eventId, input);
  else await createGoogleEvent(token, calendarId, input);
  await refreshCalendar(true);
}

export async function removeGoogleEvent(calendarId: string, eventId: string): Promise<void> {
  await deleteGoogleEvent(editToken(), calendarId, eventId);
  // Hide it straight away; the refresh confirms.
  set({ events: view.events.filter((e) => e.google?.eventId !== eventId || e.google?.calendarId !== calendarId) });
  await refreshCalendar(true);
}

/** Your own events plus the Google ones, for everything that shows events. */
export function useAllEvents(): ShownEvent[] {
  const own = useStore((s) => s.events);
  const jobs = useStore((s) => s.jobs);
  const countdowns = useStore((s) => s.countdowns);
  const g = useGcal();
  return mergeEvents(own, g.enabled ? g.events : [], jobs, countdowns);
}

let memo: { own: CalEvent[]; google: ShownEvent[]; jobs?: JobApplication[]; countdowns?: Countdown[]; day: string; out: ShownEvent[] } | undefined;
/** Your events (repeats spread over their days), countdowns, interviews from Jobs, then Google Calendar. */
export function mergeEvents(own: CalEvent[], google: ShownEvent[], jobs?: JobApplication[], countdowns?: Countdown[]): ShownEvent[] {
  const day = today();
  if (memo && memo.own === own && memo.google === google && memo.jobs === jobs && memo.countdowns === countdowns && memo.day === day) return memo.out;
  const interviews = jobs ? interviewEvents(jobs) : [];
  const dates: ShownEvent[] = countdowns?.length
    ? countdownDays(countdowns, addDays(day, -120), addDays(day, 400)).map(({ c, date }) => ({ id: `cd:${c.id}:${date}`, title: `${c.emoji ? `${c.emoji} ` : ''}${c.title}`, date, countdownId: c.id }))
    : [];
  const mine = expandEvents(own);
  const out = google.length || interviews.length || dates.length ? [...mine, ...dates, ...interviews, ...google] : mine;
  memo = { own, google, jobs, countdowns, day, out };
  return out;
}

/** Keep the calendar fresh while the dashboard is open. Called once from main.tsx. */
export function initCalendar() {
  if (!gcalAvailable || typeof window === 'undefined') return;
  refreshCalendar(true);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && refreshCalendar());
  window.addEventListener('online', () => refreshCalendar(true));
  setInterval(() => document.visibilityState === 'visible' && refreshCalendar(), STALE_MS);
}
