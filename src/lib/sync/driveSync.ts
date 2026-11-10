import { useSyncExternalStore } from 'react';
import { toast } from '../../components/ui';
import { AuthError, clearToken, currentToken, fetchAccount, googleConfigured, loadGis, requestToken, revokeAccess, tokenExpiresAt } from '../google/auth';
import { drive } from '../google/drive';
import { disconnectCalendar, refreshCalendar } from '../gcal';
import { applyRemote, getState, onLocalChange, replaceState, rollover, setState } from '../store';
import { SyncEngine, type FirstChoice, type SyncView } from './engine';
import { deviceName, localMeta } from './local';
import type { Choice } from './merge';

/** Google Drive sync for the app: one engine, wired to the store, Google sign-in and browser events. */

export const driveConfigured = googleConfigured;

const engine = driveConfigured
  ? new SyncEngine({
      drive,
      token: currentToken,
      clearToken,
      store: {
        get: getState,
        apply: (s) => applyRemote(() => s),
        replace: (s) => replaceState(s),
        rollover: () => setState((s) => rollover(s)),
      },
      meta: localMeta,
      deviceName: deviceName(),
      online: () => navigator.onLine,
      notify: (text, undo) => toast(text, undo ? { label: 'Undo', run: undo } : undefined, undo ? 10_000 : 5000),
      // One sync at a time, even with the dashboard open in several tabs.
      lock: (fn) => (navigator.locks ? navigator.locks.request('daily-dashboard-drive-sync', fn) : fn()),
    })
  : null;

const offView: SyncView = { status: 'disconnected', autoSync: false, pending: false, conflicts: [] };

export function useDriveSync(): SyncView {
  return useSyncExternalStore(engine?.subscribe ?? (() => () => {}), engine?.getView ?? (() => offView));
}

/** Start syncing. Called once from main.tsx. */
export function initDriveSync() {
  if (!engine) {
    setState((s) => rollover(s));
    return;
  }
  loadGis().catch(() => {}); // load early so the sign-in popup opens straight from a click
  onLocalChange(() => engine.localChanged());
  window.addEventListener('online', () => engine.wake());
  window.addEventListener('offline', () => engine.getView().account && engine.wake());
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && engine.wake());
  // Look for changes from other devices every few minutes while the dashboard is open.
  setInterval(() => document.visibilityState === 'visible' && engine.wake(), 5 * 60_000);
  engine.start();
  // Stay signed in: renew the hour-long Google sign-in on your next click before it runs out.
  setInterval(armRenewal, 60_000);
  armRenewal();
}

function authFailed(e: unknown) {
  if (e instanceof AuthError && e.code === 'cancelled') return;
  toast(e instanceof Error ? e.message : 'Couldn’t connect to Google.', undefined, 7000);
}

/**
 * Connect, reconnect or switch accounts. Must be called straight from a click: Google's popup
 * is requested synchronously, before anything is awaited.
 */
export function connectGoogle(mode: 'connect' | 'switch' | 'reconnect' = 'connect'): Promise<void> {
  if (!engine) return Promise.resolve();
  const hint = mode === 'reconnect' ? engine.getView().account?.email : undefined;
  return requestToken(mode === 'reconnect' ? '' : 'select_account', hint)
    .then(async (token) => {
      const account = await fetchAccount(token);
      const before = engine.getView().account;
      if (mode === 'reconnect' && before?.sub === account.sub) return engine.resumed();
      if (before && before.sub !== account.sub) {
        toast(`Switched to ${account.email}.`);
        disconnectCalendar(); // the calendar belonged to the other account
      }
      return engine.connected(account);
    })
    .then(() => refreshCalendar(true))
    .catch(authFailed);
}

/** "Sync now": gets a fresh sign-in first if the old one expired. Call from a click. */
export function syncNow(): Promise<void> {
  if (!engine) return Promise.resolve();
  if (!currentToken()) return connectGoogle('reconnect');
  return engine.syncNow();
}

export async function disconnectGoogle() {
  if (!engine) return;
  engine.disconnect();
  disconnectCalendar();
  await revokeAccess();
  toast('Disconnected. Your data is still on this device and in your Google Drive.');
}

export const chooseFirstSync = (c: FirstChoice) => engine?.choose(c);
export const resolveConflicts = (c: Record<string, Choice>) => engine?.resolve(c);
export const setAutoSync = (on: boolean) => engine?.setAutoSync(on);
export const replaceDriveCopy = () => engine?.replaceRemote();
export const listDriveVersions = () => engine?.versions() ?? Promise.resolve([]);
export const restoreDriveVersion = (id: string) => engine?.restore(id);
export const hasValidToken = () => !!currentToken();

/* ---------- Staying signed in ---------- */

const RENEW_KEY = 'daily-dashboard:stay-signed-in';
let armed = false;
let quietUntil = 0;

export function staySignedIn(): boolean {
  try {
    return localStorage.getItem(RENEW_KEY) !== '0';
  } catch {
    return true;
  }
}
export function setStaySignedIn(on: boolean) {
  try {
    localStorage.setItem(RENEW_KEY, on ? '1' : '0');
  } catch {
    /* optional */
  }
  if (on) armRenewal();
}

/**
 * Google only hands out a new token from a click or key press, so when the current one is close
 * to running out, wait for your next one and renew then. Google's window opens and closes by
 * itself because you've already said yes; if anything goes wrong it stays quiet and tries later.
 */
function armRenewal() {
  if (!engine || armed || !staySignedIn() || Date.now() < quietUntil) return;
  const account = engine.getView().account;
  const expires = tokenExpiresAt();
  if (!account || (expires && expires - Date.now() > 5 * 60_000)) return;
  armed = true;
  const onGesture = () => {
    window.removeEventListener('pointerdown', onGesture, true);
    window.removeEventListener('keydown', onGesture, true);
    armed = false;
    // Don't step on a sign-in you're already doing, or re-ask in a loop if Google said no.
    if (currentToken() && (tokenExpiresAt() ?? 0) - Date.now() > 5 * 60_000) return;
    requestToken('', account.email)
      .then(() => engine.resumed())
      .then(() => refreshCalendar(true))
      .catch(() => {
        quietUntil = Date.now() + 10 * 60_000;
      });
  };
  window.addEventListener('pointerdown', onGesture, true);
  window.addEventListener('keydown', onGesture, true);
}
