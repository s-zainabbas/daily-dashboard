import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { today } from './date';

const CAL = 'https://www.googleapis.com/auth/calendar.readonly';

function google(responses: Record<string, unknown>, status = 200) {
  return vi.fn(async (url: string) => {
    const key = Object.keys(responses).find((k) => url.includes(k));
    return new Response(JSON.stringify(key ? responses[key] : {}), { status });
  });
}

/** Fresh modules each time, with a saved sign-in token and the calendar turned on. */
async function setup(scope = `openid ${CAL}`) {
  vi.resetModules();
  localStorage.clear();
  localStorage.setItem('daily-dashboard:google-token', JSON.stringify({ accessToken: 'tok', expiresAt: Date.now() + 3600e3, scope }));
  localStorage.setItem('daily-dashboard:gcal', JSON.stringify({ enabled: true }));
  return import('./gcal');
}

describe('Google Calendar refresh', () => {
  const nineToday = new Date(`${today()}T09:00:00`).toISOString();
  const tenToday = new Date(`${today()}T10:00:00`).toISOString();

  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it('loads chosen calendars and their events', async () => {
    const fetch = google({
      calendarList: {
        items: [
          { id: 'me', summary: 'Me', primary: true, selected: true, backgroundColor: '#123456' },
          { id: 'holidays', summary: 'Holidays', selected: false },
        ],
      },
      '/calendars/me/events': { items: [{ id: 'a', summary: 'Standup', start: { dateTime: nineToday }, end: { dateTime: tenToday } }] },
    });
    vi.stubGlobal('fetch', fetch);
    const g = await setup();
    await g.refreshCalendar(true);

    const v = g.getGcal();
    expect(v.status).toBe('ok');
    expect(v.calendars.map((c) => c.id)).toEqual(['me', 'holidays']);
    expect(v.events).toHaveLength(1);
    expect(v.events[0]).toMatchObject({ title: 'Standup', date: today(), start: '09:00', google: { calendar: 'Me', color: '#123456' } });
    // Only the calendar ticked in Google was fetched.
    expect(fetch.mock.calls.some(([u]) => String(u).includes('/calendars/holidays/'))).toBe(false);
    // Cached for next time.
    expect(JSON.parse(localStorage.getItem('daily-dashboard:gcal')!).events).toHaveLength(1);
  });

  it('asks you to sign in again without calendar access', async () => {
    vi.stubGlobal('fetch', google({}));
    const g = await setup('openid');
    await g.refreshCalendar(true);
    expect(g.getGcal().status).toBe('needs-auth');
  });

  it('an expired sign-in keeps the cached events and asks to reconnect', async () => {
    vi.stubGlobal('fetch', google({}, 401));
    const g = await setup();
    await g.refreshCalendar(true);
    expect(g.getGcal().status).toBe('needs-auth');
  });

  it('explains when the Calendar API is switched off in Google Cloud', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { message: 'Google Calendar API has not been used', errors: [{ reason: 'accessNotConfigured' }] } }), { status: 403 })));
    const g = await setup();
    await g.refreshCalendar(true);
    expect(g.getGcal()).toMatchObject({ status: 'error' });
    expect(g.getGcal().error).toMatch(/isn’t turned on/);
    expect(g.getGcal().errorLink).toContain('calendar-json.googleapis.com');
  });

  it('merges Google events after your own', async () => {
    const g = await setup();
    const own = [{ id: 'x', title: 'Mine', date: today() }];
    const google = [{ id: 'g', title: 'Theirs', date: today(), google: { calendar: 'Me' } }];
    expect(g.mergeEvents(own, google).map((e) => e.title)).toEqual(['Mine', 'Theirs']);
    expect(g.mergeEvents(own, [])).toBe(own);
  });
});
