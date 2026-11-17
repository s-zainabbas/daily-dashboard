import { CLIENT_ID } from './auth';

/** Gmail API, read-only: just your starred emails' subject, sender and date. */

const API = 'https://gmail.googleapis.com/gmail/v1/users/me';

export interface StarredMail {
  id: string;
  threadId: string;
  subject: string;
  /** Sender's name (or address). */
  from: string;
  snippet: string;
  /** When it arrived, ms. */
  date: number;
}

export class GmailError extends Error {
  constructor(
    public kind: 'auth' | 'scope' | 'offline' | 'disabled' | 'other',
    message: string,
    public link?: string,
  ) {
    super(message);
  }
}

async function get<T>(token: string, url: string): Promise<T> {
  let r: Response;
  try {
    r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  } catch {
    throw new GmailError('offline', 'Can’t reach Gmail.');
  }
  if (r.ok) return r.json() as Promise<T>;
  let reason = '';
  let message = '';
  try {
    const j = await r.json();
    reason = j.error?.errors?.[0]?.reason ?? j.error?.status ?? '';
    message = j.error?.message ?? '';
  } catch {
    /* no body */
  }
  if (r.status === 401) throw new GmailError('auth', 'Google sign-in expired.');
  if (r.status === 403 && /accessNotConfigured|SERVICE_DISABLED/i.test(reason + message)) {
    const project = CLIENT_ID.match(/^(\d+)-/)?.[1];
    throw new GmailError('disabled', 'The Gmail API isn’t turned on in your Google Cloud project yet. Turn it on, wait a minute, then try again.', `https://console.developers.google.com/apis/api/gmail.googleapis.com/overview${project ? `?project=${project}` : ''}`);
  }
  if (r.status === 403) throw new GmailError('scope', 'Gmail access wasn’t allowed.');
  throw new GmailError('other', message || `Gmail error (${r.status}).`);
}

/** "Sam Lee <sam@x.com>" → "Sam Lee". */
export function senderName(from: string): string {
  const m = from.match(/^\s*"?([^"<]+?)"?\s*<[^>]+>\s*$/);
  return (m ? m[1] : from).trim() || from;
}

/** Your starred emails, newest first (up to 25). */
export async function listStarred(token: string): Promise<StarredMail[]> {
  const list = await get<{ messages?: { id: string; threadId: string }[] }>(token, `${API}/messages?q=${encodeURIComponent('is:starred')}&maxResults=25`);
  const out = await Promise.all(
    (list.messages ?? []).map(async (m) => {
      const q = new URLSearchParams({ format: 'metadata', fields: 'id,threadId,snippet,internalDate,payload/headers' });
      q.append('metadataHeaders', 'Subject');
      q.append('metadataHeaders', 'From');
      const j = await get<{ id: string; threadId: string; snippet?: string; internalDate?: string; payload?: { headers?: { name: string; value: string }[] } }>(token, `${API}/messages/${m.id}?${q}`);
      const header = (n: string) => j.payload?.headers?.find((h) => h.name.toLowerCase() === n.toLowerCase())?.value ?? '';
      return { id: j.id, threadId: j.threadId, subject: header('Subject').trim() || '(no subject)', from: senderName(header('From')), snippet: decode(j.snippet ?? ''), date: Number(j.internalDate) || 0 };
    }),
  );
  return out.sort((a, b) => b.date - a.date);
}

const decode = (s: string) => s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

/** Open the conversation in Gmail, in the right account. */
export const gmailLink = (threadId: string, email?: string) => `https://mail.google.com/mail/${email ? `?authuser=${encodeURIComponent(email)}` : 'u/0/'}#all/${threadId}`;
