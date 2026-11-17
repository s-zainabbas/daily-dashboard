import { useSyncExternalStore } from 'react';
import { currentToken, GMAIL_SCOPE, googleConfigured, requestToken, tokenHasScope } from './google/auth';
import { GmailError, listStarred, type StarredMail } from './google/gmail';

/**
 * "Starred in Gmail": your starred emails on the Tasks tab, to turn into tasks. Read-only and per
 * device; emails are cached on this device only and never written into your dashboard data.
 * Ones you've made into a task or dismissed are remembered so they don't come back.
 */

export type GmailStatus = 'off' | 'loading' | 'ok' | 'needs-auth' | 'error';

export interface GmailView {
  enabled: boolean;
  status: GmailStatus;
  error?: string;
  errorLink?: string;
  items: StarredMail[];
  /** Message ids made into tasks or dismissed. */
  handled: string[];
  fetchedAt?: number;
}

const KEY = 'daily-dashboard:gmail';
const STALE_MS = 5 * 60_000;
const listeners = new Set<() => void>();
const off: GmailView = { enabled: false, status: 'off', items: [], handled: [] };

function load(): GmailView {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (v && typeof v === 'object' && v.enabled) return { ...off, ...v, status: 'ok', error: undefined, errorLink: undefined };
  } catch {
    /* fall through */
  }
  return off;
}

let view: GmailView = typeof localStorage === 'undefined' ? off : load();

function set(p: Partial<GmailView>) {
  view = { ...view, ...p };
  try {
    if (!view.enabled) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify({ enabled: true, items: view.items, handled: view.handled, fetchedAt: view.fetchedAt }));
  } catch {
    /* cache is optional */
  }
  listeners.forEach((l) => l());
}

export const gmailAvailable = googleConfigured;
export const getGmail = () => view;

export function useGmail(): GmailView {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => view,
  );
}

/** Starred emails not yet made into a task or dismissed. */
export const openMail = (v: GmailView) => v.items.filter((m) => !v.handled.includes(m.id));

let inflight: Promise<void> | null = null;
export function refreshGmail(force = false): Promise<void> {
  if (!view.enabled) return Promise.resolve();
  if (!force && view.fetchedAt && Date.now() - view.fetchedAt < STALE_MS && view.status === 'ok') return Promise.resolve();
  if (!tokenHasScope(GMAIL_SCOPE)) {
    set({ status: 'needs-auth' });
    return Promise.resolve();
  }
  return (inflight ??= run().finally(() => (inflight = null)));
}

async function run() {
  set({ status: 'loading', error: undefined, errorLink: undefined });
  try {
    const items = await listStarred(currentToken()!);
    // Forget handled ids for emails that are no longer starred, so the list stays small.
    const ids = new Set(items.map((m) => m.id));
    set({ items, handled: view.handled.filter((id) => ids.has(id)), fetchedAt: Date.now(), status: 'ok' });
  } catch (e) {
    if (e instanceof GmailError && (e.kind === 'auth' || e.kind === 'scope')) set({ status: 'needs-auth' });
    else set({ status: 'error', error: e instanceof Error ? e.message : 'Couldn’t load Gmail.', errorLink: e instanceof GmailError ? e.link : undefined });
  }
}

/** Turn it on (or sign in again). Call straight from a click: Google's window opens before anything is awaited. */
export function connectGmail(loginHint?: string): Promise<void> {
  const ask = tokenHasScope(GMAIL_SCOPE) ? Promise.resolve() : requestToken('', loginHint, GMAIL_SCOPE).then(() => undefined);
  return ask.then(() => {
    if (!tokenHasScope(GMAIL_SCOPE)) {
      set({ enabled: true, status: 'needs-auth', error: 'Gmail access wasn’t allowed. Try again and tick the Gmail box on Google’s screen.' });
      return;
    }
    set({ enabled: true });
    return refreshGmail(true);
  });
}

export function disconnectGmail() {
  set({ ...off });
}

export function markHandled(id: string) {
  set({ handled: [...view.handled, id] });
  return () => set({ handled: view.handled.filter((x) => x !== id) });
}

/** Keep it fresh while the dashboard is open. Called once from main.tsx. */
export function initGmail() {
  if (!gmailAvailable || typeof window === 'undefined') return;
  refreshGmail(true);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && refreshGmail());
  window.addEventListener('online', () => refreshGmail(true));
  setInterval(() => document.visibilityState === 'visible' && refreshGmail(), STALE_MS);
}
