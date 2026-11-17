import { addDays, dateKey, fromKey } from '../date';
import type { CalEvent, DateKey, Repeat } from '../types';
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
  /** You're allowed to add and change events in it (owner or writer). */
  writable?: boolean;
}

/** An event shown on the dashboard. Google ones carry where they came from and can't be edited here. */
export interface ShownEvent extends CalEvent {
  google?: {
    calendar: string;
    color?: string;
    link?: string;
    calendarId?: string;
    eventId?: string;
    /** You can change events in this calendar (with permission to edit). */
    writable?: boolean;
    /** Spans several days: edited in Google Calendar itself. */
    multiDay?: boolean;
    /** One day of a repeating Google event (editing changes just that day). */
    recurring?: boolean;
  };
  /** An interview from the Jobs tab. */
  jobId?: string;
  /** One day of one of your repeating events. */
  seriesId?: string;
  /** An important date / countdown. */
  countdownId?: string;
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
  recurringEventId?: string;
  attendees?: { self?: boolean; responseStatus?: string }[];
}

export class CalendarError extends Error {
  constructor(
    public kind: 'auth' | 'scope' | 'offline' | 'disabled' | 'conflict' | 'gone' | 'other',
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

const get = <T,>(token: string, url: string) => call<T>(token, 'GET', url);

async function call<T>(token: string, method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, body?: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new CalendarError('offline', 'Can’t reach Google Calendar.');
  }
  if (r.ok) return (r.status === 204 ? undefined : r.json()) as Promise<T>;
  if (r.status === 409) throw new CalendarError('conflict', 'Already exists.');
  if (r.status === 404 || r.status === 410) throw new CalendarError('gone', 'Already deleted.');
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
    .map((c) => ({ id: c.id, name: c.summaryOverride || c.summary || c.id, color: c.backgroundColor, primary: !!c.primary, selected: !!c.selected, writable: c.accessRole === 'owner' || c.accessRole === 'writer' }))
    .sort((a, b) => Number(b.primary) - Number(a.primary) || a.name.localeCompare(b.name));
}

export async function listEvents(token: string, calendarId: string, from: DateKey, to: DateKey): Promise<GEvent[]> {
  const out: GEvent[] = [];
  let page: string | undefined;
  // A handful of pages at most: 250 events each covers several months of a busy calendar.
  for (let i = 0; i < 8; i++) {
    const q = new URLSearchParams({
      singleEvents: 'true', // expand repeating events into single ones
      orderBy: 'startTime',
      timeMin: new Date(`${from}T00:00:00`).toISOString(),
      timeMax: new Date(`${to}T00:00:00`).toISOString(),
      maxResults: '250',
      fields: 'items(id,status,summary,location,description,htmlLink,start,end,recurringEventId,attendees(self,responseStatus)),nextPageToken',
    });
    if (page) q.set('pageToken', page);
    const j = await get<{ items?: GEvent[]; nextPageToken?: string }>(token, `${API}/calendars/${encodeURIComponent(calendarId)}/events?${q}`);
    out.push(...(j.items ?? []));
    page = j.nextPageToken;
    if (!page) break;
  }
  return out;
}

/** Google descriptions can be HTML; keep a short plain-text version for the dashboard. */
export function plainText(html?: string): string | undefined {
  if (!html) return undefined;
  const text = html
    .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  return text ? (text.length > 280 ? `${text.slice(0, 279)}…` : text) : undefined;
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
    notes: plainText(e.description),
    google: { calendar: cal.name, color: cal.color, link: e.htmlLink, calendarId: cal.id, eventId: e.id, writable: !!cal.writable, ...(e.recurringEventId ? { recurring: true } : {}) },
  };
  const id = (d: DateKey) => `g:${cal.id}:${e.id}:${d}`;
  const multi = (x: ShownEvent): ShownEvent => ({ ...x, google: { ...x.google!, multiDay: true } });

  if (e.start.date) {
    // All-day: the end date is exclusive.
    const out: ShownEvent[] = [];
    const end = e.end.date && e.end.date > e.start.date ? e.end.date : addDays(e.start.date, 1);
    for (let d = e.start.date, n = 0; d < end && n < 62; d = addDays(d, 1), n++) out.push({ ...base, id: id(d), date: d });
    return out.length > 1 ? out.map(multi) : out;
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
  return out.map(multi);
}

/* ---------- Adding and changing your own Google events ---------- */

export interface EventInput {
  title: string;
  date: DateKey;
  /** Missing = all day. */
  start?: string;
  end?: string;
  location?: string;
  notes?: string;
  repeat?: Repeat;
}

const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

/** A repeat rule in Google's (RFC 5545) form, e.g. RRULE:FREQ=WEEKLY;BYDAY=MO,WE. */
export function toRRule(r: Repeat, date: DateKey): string {
  const n = r.interval && r.interval > 1 ? `;INTERVAL=${r.interval}` : '';
  switch (r.freq) {
    case 'daily':
      return `RRULE:FREQ=DAILY${n}`;
    case 'weekdays':
      return 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR';
    case 'weekly':
      return `RRULE:FREQ=WEEKLY${n};BYDAY=${(r.days?.length ? r.days : [fromKey(date).getDay()]).map((d) => BYDAY[d]).join(',')}`;
    case 'monthly':
      return `RRULE:FREQ=MONTHLY${n}`;
    case 'yearly':
      return `RRULE:FREQ=YEARLY${n}`;
  }
}

/** The event in Google's format, in this device's time zone. */
export function toGoogleEvent(e: EventInput, timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone) {
  const at = (t: string) => new Date(`${e.date}T${t}:00`);
  let when;
  if (e.start) {
    const start = at(e.start);
    // No end, or one before the start: half an hour.
    const end = e.end && e.end > e.start ? at(e.end) : new Date(start.getTime() + 30 * 60_000);
    when = { start: { dateTime: start.toISOString(), timeZone }, end: { dateTime: end.toISOString(), timeZone } };
  } else {
    when = { start: { date: e.date }, end: { date: addDays(e.date, 1) } }; // all day; Google's end date is exclusive
  }
  return {
    summary: e.title,
    location: e.location ?? '',
    description: e.notes ?? '',
    ...when,
    ...(e.repeat ? { recurrence: [toRRule(e.repeat, e.date)] } : {}),
  };
}

export async function createGoogleEvent(token: string, calendarId: string, e: EventInput): Promise<GEvent> {
  return call<GEvent>(token, 'POST', `${API}/calendars/${encodeURIComponent(calendarId)}/events`, toGoogleEvent(e));
}

/** Change one event (for a repeating event: just this day). Repeats aren't changed from here. */
export async function updateGoogleEvent(token: string, calendarId: string, eventId: string, e: EventInput): Promise<GEvent> {
  const { recurrence: _ignored, ...body } = toGoogleEvent({ ...e, repeat: undefined }) as ReturnType<typeof toGoogleEvent> & { recurrence?: string[] };
  return call<GEvent>(token, 'PATCH', `${API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, body);
}

export async function deleteGoogleEvent(token: string, calendarId: string, eventId: string): Promise<void> {
  try {
    await call(token, 'DELETE', `${API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`);
  } catch (e) {
    if (!(e instanceof CalendarError) || e.kind !== 'gone') throw e;
  }
}

/* ---------- Phone reminders: events the dashboard writes to your main calendar ---------- */

/** Every reminder event's id starts with this, so the dashboard can find (and hide) its own. */
export const REMINDER_PREFIX = 'ddrem';
const REMINDER_TAG = 'dailyDashboard';

export interface ReminderEvent {
  /** Google event id: `ddrem` + base32hex, as Google requires for ids chosen by the app. */
  id: string;
  summary: string;
  start: Date;
  end: Date;
  /** Minutes before `start` that Google alerts you. */
  alertBefore: number;
  /** A reminder for a task: doesn't mark you busy. */
  free: boolean;
  description?: string;
  location?: string;
}

function toGoogle(r: ReminderEvent, timeZone: string) {
  return {
    id: r.id,
    summary: r.summary,
    description: r.description,
    location: r.location,
    start: { dateTime: r.start.toISOString(), timeZone },
    end: { dateTime: r.end.toISOString(), timeZone },
    transparency: r.free ? 'transparent' : 'opaque',
    reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: r.alertBefore }] },
    extendedProperties: { private: { [REMINDER_TAG]: '1' } },
    status: 'confirmed',
  };
}

/** Ids of the reminder events the dashboard has in your main calendar, from yesterday on. */
export async function listReminderIds(token: string, from: Date): Promise<string[]> {
  const ids: string[] = [];
  let page: string | undefined;
  for (let i = 0; i < 4; i++) {
    const q = new URLSearchParams({
      privateExtendedProperty: `${REMINDER_TAG}=1`,
      timeMin: from.toISOString(),
      maxResults: '250',
      fields: 'items(id,status),nextPageToken',
    });
    if (page) q.set('pageToken', page);
    const j = await get<{ items?: { id: string; status?: string }[]; nextPageToken?: string }>(token, `${API}/calendars/primary/events?${q}`);
    for (const e of j.items ?? []) if (e.status !== 'cancelled' && e.id.startsWith(REMINDER_PREFIX)) ids.push(e.id);
    page = j.nextPageToken;
    if (!page) break;
  }
  return ids;
}

/**
 * Add a reminder event. Its id is fixed by its contents, so adding it twice (from two devices, or
 * after it was deleted) just brings back the same event.
 */
export async function putReminder(token: string, r: ReminderEvent, timeZone: string): Promise<void> {
  const body = toGoogle(r, timeZone);
  try {
    await call(token, 'POST', `${API}/calendars/primary/events`, body);
  } catch (e) {
    if (!(e instanceof CalendarError) || e.kind !== 'conflict') throw e;
    await call(token, 'PUT', `${API}/calendars/primary/events/${r.id}`, body);
  }
}

export async function deleteReminder(token: string, id: string): Promise<void> {
  try {
    await call(token, 'DELETE', `${API}/calendars/primary/events/${id}`);
  } catch (e) {
    if (!(e instanceof CalendarError) || e.kind !== 'gone') throw e;
  }
}
