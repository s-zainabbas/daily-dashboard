import { demoMode } from '../store';

/**
 * Google sign-in with Google Identity Services' token model — Google's recommended flow for a
 * browser app with no server. It gives a short-lived access token (about an hour) and never a
 * refresh token or client secret, so nothing long-lived is ever stored in the browser.
 * A new token can only be requested from a tap or click (Google opens a small popup), which is
 * why sync pauses after an hour until you next tap "Sync now".
 */

export const CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim() || '';
/** False when no OAuth Client ID is configured, or in `?demo` mode. */
export const googleConfigured = !!CLIENT_ID && !demoMode;

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
/** Read-only Google Calendar, asked for separately when you turn on the calendar. */
export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
const SCOPES = `${DRIVE_SCOPE} openid email profile`;
const TOKEN_KEY = 'daily-dashboard:google-token';
const GIS_SRC = 'https://accounts.google.com/gsi/client';

export interface GoogleAccount {
  sub: string; // Google's stable account id
  email: string;
  name: string;
  picture?: string;
}

export class AuthError extends Error {
  constructor(
    public code: 'not_loaded' | 'popup_blocked' | 'cancelled' | 'scope_denied' | 'access_denied' | 'network' | 'unknown',
    message: string,
  ) {
    super(message);
  }
}

interface StoredToken {
  accessToken: string;
  expiresAt: number;
  /** Space-separated scopes this token covers. */
  scope?: string;
}

/* ---------- Loading Google's library ---------- */

let gis: Promise<void> | undefined;
export function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return (gis ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = GIS_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      gis = undefined;
      reject(new AuthError('network', 'Couldn’t load Google sign-in. Check your connection.'));
    };
    document.head.appendChild(s);
  }));
}

/* ---------- Access token (kept for at most its ~1 hour lifetime) ---------- */

// Kept in localStorage so a reload within the hour doesn't need another tap. It's an access token
// only — limited to this app's hidden Drive folder, expiring within the hour — never a refresh token.
let token: StoredToken | null = readToken();

function readToken(): StoredToken | null {
  try {
    const t = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null');
    return t && typeof t.accessToken === 'string' && typeof t.expiresAt === 'number' ? t : null;
  } catch {
    return null;
  }
}

/** A token that's still good for at least a minute, or null. */
export function currentToken(): string | null {
  if (token && token.expiresAt - Date.now() > 60_000) return token.accessToken;
  return null;
}

/** Whether the current token includes a scope (for example, calendar access). */
export function tokenHasScope(scope: string): boolean {
  return !!currentToken() && !!token?.scope?.split(' ').includes(scope);
}

export function tokenExpiresAt(): number | undefined {
  return token?.expiresAt;
}

export function clearToken() {
  token = null;
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

/* ---------- Requesting a token ---------- */

let client: google.accounts.oauth2.TokenClient | null = null;
let pending: { resolve: (t: string) => void; reject: (e: AuthError) => void } | null = null;

function getClient() {
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) throw new AuthError('not_loaded', 'Google sign-in is still loading — try again in a moment.');
  client ??= oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    // Keep access granted earlier (like the calendar) when the token is renewed.
    include_granted_scopes: true,
    callback: (r) => {
      const p = pending;
      pending = null;
      if (!p) return;
      if (r.error) return p.reject(new AuthError(r.error === 'access_denied' ? 'access_denied' : 'unknown', r.error_description || 'Google sign-in failed.'));
      if (!oauth2.hasGrantedAllScopes(r, DRIVE_SCOPE)) {
        return p.reject(new AuthError('scope_denied', 'Drive access wasn’t allowed. Connect again and tick the box that lets the app use its own Drive folder.'));
      }
      token = { accessToken: r.access_token, expiresAt: Date.now() + Number(r.expires_in || 3600) * 1000, scope: r.scope };
      try {
        localStorage.setItem(TOKEN_KEY, JSON.stringify(token));
      } catch {
        /* still works for this visit */
      }
      p.resolve(r.access_token);
    },
    error_callback: (e) => {
      const p = pending;
      pending = null;
      if (!p) return;
      if (e.type === 'popup_failed_to_open') p.reject(new AuthError('popup_blocked', 'Your browser blocked the Google sign-in popup. Allow popups for this site and try again.'));
      else if (e.type === 'popup_closed') p.reject(new AuthError('cancelled', 'Sign-in was cancelled.'));
      else p.reject(new AuthError('unknown', 'Google sign-in failed. Please try again.'));
    },
  });
  return client;
}

/**
 * Ask Google for an access token. Call this directly from a click handler (no `await` before it),
 * or browsers will block the popup.
 * - `select_account`: always show the account chooser (first connect, switching accounts)
 * - `''`: reuse the signed-in account; the popup closes by itself if consent was already given
 */
export function requestToken(prompt: '' | 'select_account' | 'consent', loginHint?: string, extraScope?: string): Promise<string> {
  let c: google.accounts.oauth2.TokenClient;
  try {
    c = getClient();
  } catch (e) {
    return Promise.reject(e);
  }
  pending?.reject(new AuthError('cancelled', 'Replaced by a newer sign-in request.'));
  return new Promise<string>((resolve, reject) => {
    pending = { resolve, reject };
    c.requestAccessToken({ prompt, login_hint: loginHint, ...(extraScope ? { scope: `${SCOPES} ${extraScope}` } : {}) });
  });
}

/** Who is signed in — shown in Settings, and used to notice when you switch accounts. */
export async function fetchAccount(accessToken: string): Promise<GoogleAccount> {
  let r: Response;
  try {
    r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${accessToken}` } });
  } catch {
    throw new AuthError('network', 'No connection — try again when you’re online.');
  }
  if (!r.ok) throw new AuthError('unknown', 'Couldn’t read your Google account details.');
  const j = await r.json();
  return { sub: String(j.sub), email: j.email || '', name: j.name || j.email || 'Google account', picture: j.picture || undefined };
}

/** Remove this app's access to your Google account (you can also do it at myaccount.google.com/permissions). */
export function revokeAccess(): Promise<void> {
  const t = token?.accessToken;
  clearToken();
  const oauth2 = window.google?.accounts?.oauth2;
  if (!t || !oauth2) return Promise.resolve();
  return new Promise((resolve) => oauth2.revoke(t, () => resolve()));
}
