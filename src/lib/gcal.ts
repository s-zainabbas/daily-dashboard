import { useSyncExternalStore } from 'react';
import { addDays, today } from './date';
import { CALENDAR_SCOPE, currentToken, googleConfigured, requestToken, tokenHasScope } from './google/auth';
import { CalendarError, listCalendars, listEvents, toShown, type GCalendar, type ShownEvent } from './google/calendar';
import { useStore } from './store';
import type { CalEvent, JobApplication } from './types';
import { interviewEvents } from './jobs';

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

/** Fetch calendars and events. Quietly does nothing without a token that has calendar access. */
let inflight: Promise<void> | null = null;
export function refreshCalendar(force = false): Promise<void> {
  if (!view.enabled) return Promise.resolve();
  if (!force && view.fetchedAt && Date.now() - view.fetchedAt < STALE_MS && view.status === 'ok') return Promise.resolve();
  if (!tokenHasScope(CALENDAR_SCOPE)) {
    set({ status: 'needs-auth' });
    return Promise.resolve();
  }
  return (inflight ??= run().finally(() => (inflight = null)));
}

async function run() {
  const token = currentToken()!;
  set({ status: 'loading', error: undefined, errorLink: undefined });
  try {
    const calendars = await listCalendars(token);
    const ids = shownIds({ ...view, calendars });
    // Last week to two months ahead, so browsing nearby days in Schedule works.
    const from = addDays(today(), -7);
    const to = addDays(today(), 60);
    const lists = await Promise.all(
      calendars.filter((c) => ids.has(c.id)).map(async (c) => (await listEvents(token, c.id, from, to)).flatMap((e) => toShown(e, c))),
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

/** Your own events plus the Google ones, for everything that shows events. */
export function useAllEvents(): ShownEvent[] {
  const own = useStore((s) => s.events);
  const jobs = useStore((s) => s.jobs);
  const g = useGcal();
  return mergeEvents(own, g.enabled ? g.events : [], jobs);
}

let memo: { own: CalEvent[]; google: ShownEvent[]; jobs?: JobApplication[]; out: ShownEvent[] } | undefined;
/** Your events, then interviews from Jobs, then Google Calendar. */
export function mergeEvents(own: CalEvent[], google: ShownEvent[], jobs?: JobApplication[]): ShownEvent[] {
  if (memo && memo.own === own && memo.google === google && memo.jobs === jobs) return memo.out;
  const interviews = jobs ? interviewEvents(jobs) : [];
  const out = google.length || interviews.length ? [...own, ...interviews, ...google] : own;
  memo = { own, google, jobs, out };
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
