import { addDays, dateKey } from '../date';
import type { CalEvent, DateKey } from '../types';
import { CLIENT_ID } from './auth';

/**
 * Google Calendar API v3, read-only. Events are fetched straight from Google each time and shown
 * next to your own events; they're never copied into your dashboard data or Drive file.
 */

const API = 'https://www.googleapis.com/calendar/v3';

export interface GCalendar {
  id: string;
  name: string;
  color?: string;
  primary: boolean;
  /** Ticked in Google Calendar's own sidebar. */
  selected: boolean;
}

/** An event shown on the dashboard. Google ones carry where they came from and can't be edited here. */
export interface ShownEvent extends CalEvent {
  google?: { calendar: string; color?: string; link?: string };
}

type GDate = { date?: string; dateTime?: string };
export interface GEvent {
  id: string;
  status?: string;
  summary?: string;
  location?: string;
  description?: string;
  htmlLink?: string;
  start: GDate;
  end: GDate;
  attendees?: { self?: boolean; responseStatus?: string }[];
}

export class CalendarError extends Error {
  constructor(
    public kind: 'auth' | 'scope' | 'offline' | 'disabled' | 'other',
    message: string,
    /** Where to fix it, e.g. the Google Cloud page that turns the Calendar API on. */
    public link?: string,
  ) {
    super(message);
  }
}

/** The Google Cloud page that turns on the Calendar API, for the project this app's Client ID belongs to. */
export function enableApiLink(googleMessage = '', clientId = ''): string {
  const fromGoogle = googleMessage.match(/https:\/\/console\.(?:developers|cloud)\.google\.com\/\S+?(?=[\s"]|\.?$)/)?.[0];
  if (fromGoogle) return fromGoogle;
  const project = clientId.match(/^(\d+)-/)?.[1];
  return `https://console.developers.google.com/apis/api/calendar-json.googleapis.com/overview${project ? `?project=${project}` : ''}`;
}

async function get<T>(token: string, url: string): Promise<T> {
  let r: Response;
  try {
    r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  } catch {
    throw new CalendarError('offline', 'Can’t reach Google Calendar.');
  }
  if (r.ok) return r.json();
  let reason = '';
  let message = '';
  try {
    const j = await r.json();
    reason = j.error?.errors?.[0]?.reason ?? j.error?.status ?? '';
    message = j.error?.message ?? '';
  } catch {
    /* no body */
  }
  if (r.status === 401) throw new CalendarError('auth', 'Google sign-in expired.');
  if (r.status === 403 && /accessNotConfigured|SERVICE_DISABLED/i.test(reason + message))
    throw new CalendarError(
      'disabled',
      'The Google Calendar API isn’t turned on in your Google Cloud project yet. Turn it on, wait a minute, then try again.',
      enableApiLink(message, CLIENT_ID),
    );
  if (r.status === 403) throw new CalendarError('scope', 'Calendar access wasn’t allowed.');
  throw new CalendarError('other', message || `Google Calendar error (${r.status}).`);
}

export async function listCalendars(token: string): Promise<GCalendar[]> {
  const j = await get<{ items?: any[] }>(token, `${API}/users/me/calendarList?minAccessRole=reader&maxResults=250`);
  return (j.items ?? [])
    .filter((c) => !c.deleted && !c.hidden)
    .map((c) => ({ id: c.id, name: c.summaryOverride || c.summary || c.id, color: c.backgroundColor, primary: !!c.primary, selected: !!c.selected }))
    .sort((a, b) => Number(b.primary) - Number(a.primary) || a.name.localeCompare(b.name));
}

export async function listEvents(token: string, calendarId: string, from: DateKey, to: DateKey): Promise<GEvent[]> {
  const out: GEvent[] = [];
  let page: string | undefined;
  // A few pages at most: 250 events each is plenty for a ~2 month window.
  for (let i = 0; i < 4; i++) {
    const q = new URLSearchParams({
      singleEvents: 'true', // expand repeating events into single ones
      orderBy: 'startTime',
      timeMin: new Date(`${from}T00:00:00`).toISOString(),
      timeMax: new Date(`${to}T00:00:00`).toISOString(),
      maxResults: '250',
      fields: 'items(id,status,summary,location,description,htmlLink,start,end,attendees(self,responseStatus)),nextPageToken',
    });
    if (page) q.set('pageToken', page);
    const j = await get<{ items?: GEvent[]; nextPageToken?: string }>(token, `${API}/calendars/${encodeURIComponent(calendarId)}/events?${q}`);
    out.push(...(j.items ?? []));
    page = j.nextPageToken;
    if (!page) break;
  }
  return out;
}

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/**
 * Turn one Google event into dashboard events, in this device's time zone.
 * Multi-day events appear on every day they cover: timed ones get the right start / end on the
 * first and last day and show as all-day in between.
 */
export function toShown(e: GEvent, cal: GCalendar): ShownEvent[] {
  if (e.status === 'cancelled') return [];
  if (e.attendees?.some((a) => a.self && a.responseStatus === 'declined')) return [];
  const base = {
    title: e.summary?.trim() || '(No title)',
    location: e.location || undefined,
    google: { calendar: cal.name, color: cal.color, link: e.htmlLink },
  };
  const id = (d: DateKey) => `g:${cal.id}:${e.id}:${d}`;

  if (e.start.date) {
    // All-day: the end date is exclusive.
    const out: ShownEvent[] = [];
    const end = e.end.date && e.end.date > e.start.date ? e.end.date : addDays(e.start.date, 1);
    for (let d = e.start.date, n = 0; d < end && n < 62; d = addDays(d, 1), n++) out.push({ ...base, id: id(d), date: d });
    return out;
  }
  if (!e.start.dateTime) return [];
  const s = new Date(e.start.dateTime);
  const f = e.end.dateTime ? new Date(e.end.dateTime) : s;
  const sd = dateKey(s);
  // An event ending exactly at midnight belongs to the day before.
  const ed = f > s && hhmm(f) === '00:00' ? addDays(dateKey(f), -1) : dateKey(f);
  if (ed <= sd) return [{ ...base, id: id(sd), date: sd, start: hhmm(s), end: f > s ? (hhmm(f) === '00:00' ? '23:59' : hhmm(f)) : undefined }];

  const out: ShownEvent[] = [{ ...base, id: id(sd), date: sd, start: hhmm(s), end: '23:59' }];
  for (let d = addDays(sd, 1), n = 0; d < ed && n < 62; d = addDays(d, 1), n++) out.push({ ...base, id: id(d), date: d });
  // Last day: all-day if it runs to midnight, otherwise until its end time.
  out.push(hhmm(f) === '00:00' ? { ...base, id: id(ed), date: ed } : { ...base, id: id(ed), date: ed, start: '00:00', end: hhmm(f) });
  return out;
}
