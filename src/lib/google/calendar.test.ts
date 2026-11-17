import { describe, expect, it } from 'vitest';
import { enableApiLink, plainText, toGoogleEvent, toRRule, toShown, type GCalendar, type GEvent } from './calendar';

const cal: GCalendar = { id: 'me@example.com', name: 'Personal', color: '#4285f4', primary: true, selected: true };
// Local wall-clock times as ISO strings with this machine's offset, like Google sends.
const at = (y: number, mo: number, d: number, h: number, mi = 0) => new Date(y, mo - 1, d, h, mi).toISOString();
const ev = (p: Partial<GEvent>): GEvent => ({ id: 'e1', summary: 'Thing', start: {}, end: {}, ...p });

describe('toShown', () => {
  it('a timed event, in local time', () => {
    const [e] = toShown(ev({ start: { dateTime: at(2026, 11, 10, 9, 30) }, end: { dateTime: at(2026, 11, 10, 10) }, htmlLink: 'https://cal/x' }), cal);
    expect(e).toMatchObject({ title: 'Thing', date: '2026-11-10', start: '09:30', end: '10:00', google: { calendar: 'Personal', link: 'https://cal/x' } });
    expect(e.id).toBe('g:me@example.com:e1:2026-11-10');
  });

  it('all-day events use an exclusive end date and can span days', () => {
    expect(toShown(ev({ start: { date: '2026-11-10' }, end: { date: '2026-11-11' } }), cal).map((e) => [e.date, e.start])).toEqual([['2026-11-10', undefined]]);
    expect(toShown(ev({ start: { date: '2026-11-10' }, end: { date: '2026-11-13' } }), cal).map((e) => e.date)).toEqual(['2026-11-10', '2026-11-11', '2026-11-12']);
  });

  it('an overnight event shows on both days', () => {
    const out = toShown(ev({ start: { dateTime: at(2026, 11, 10, 22) }, end: { dateTime: at(2026, 11, 11, 2) } }), cal);
    expect(out.map((e) => [e.date, e.start, e.end])).toEqual([
      ['2026-11-10', '22:00', '23:59'],
      ['2026-11-11', '00:00', '02:00'],
    ]);
  });

  it('an event ending at midnight stays on its own day', () => {
    const out = toShown(ev({ start: { dateTime: at(2026, 11, 10, 20) }, end: { dateTime: at(2026, 11, 11, 0) } }), cal);
    expect(out.map((e) => [e.date, e.start, e.end])).toEqual([['2026-11-10', '20:00', '23:59']]);
  });

  it('a 3-day trip: timed ends, all-day middle', () => {
    const out = toShown(ev({ start: { dateTime: at(2026, 11, 10, 18) }, end: { dateTime: at(2026, 11, 12, 11) } }), cal);
    expect(out.map((e) => [e.date, e.start ?? 'all day'])).toEqual([
      ['2026-11-10', '18:00'],
      ['2026-11-11', 'all day'],
      ['2026-11-12', '00:00'],
    ]);
  });

  it('skips cancelled and declined events, and names untitled ones', () => {
    const when = { start: { dateTime: at(2026, 11, 10, 9) }, end: { dateTime: at(2026, 11, 10, 10) } };
    expect(toShown(ev({ ...when, status: 'cancelled' }), cal)).toEqual([]);
    expect(toShown(ev({ ...when, attendees: [{ self: true, responseStatus: 'declined' }] }), cal)).toEqual([]);
    expect(toShown(ev({ ...when, summary: '' }), cal)[0].title).toBe('(No title)');
  });
});

describe('descriptions', () => {
  it('come through as plain-text notes', () => {
    const [e] = toShown(ev({ start: { date: '2026-11-10' }, end: { date: '2026-11-11' }, description: '<b>Bring</b> slides<br>&amp; laptop' }), cal);
    expect(e.notes).toBe('Bring slides & laptop');
    expect(plainText('   ')).toBeUndefined();
    expect(plainText('x'.repeat(400))!.length).toBe(280);
  });
});

describe('writing events to Google', () => {
  it('turns repeat rules into Google’s format', () => {
    expect(toRRule({ freq: 'weekdays' }, '2026-11-16')).toBe('RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR');
    expect(toRRule({ freq: 'weekly' }, '2026-11-18')).toBe('RRULE:FREQ=WEEKLY;BYDAY=WE');
    expect(toRRule({ freq: 'weekly', days: [1, 5], interval: 2 }, '2026-11-16')).toBe('RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,FR');
  });
  it('timed and all-day events', () => {
    const timed = toGoogleEvent({ title: 'Call', date: '2026-11-16', start: '09:00', end: '09:30' }, 'Europe/London');
    expect(timed.start).toEqual({ dateTime: new Date('2026-11-16T09:00:00').toISOString(), timeZone: 'Europe/London' });
    expect(timed.end).toEqual({ dateTime: new Date('2026-11-16T09:30:00').toISOString(), timeZone: 'Europe/London' });
    const allDay = toGoogleEvent({ title: 'Trip', date: '2026-11-16', repeat: { freq: 'yearly' } });
    expect(allDay).toMatchObject({ start: { date: '2026-11-16' }, end: { date: '2026-11-17' }, recurrence: ['RRULE:FREQ=YEARLY'] });
  });
});

describe('enableApiLink', () => {
  it('uses the link from Google’s error when there is one', () => {
    const msg = 'Google Calendar API has not been used in project 123 before or it is disabled. Enable it by visiting https://console.developers.google.com/apis/api/calendar-json.googleapis.com/overview?project=123 then retry.';
    expect(enableApiLink(msg)).toBe('https://console.developers.google.com/apis/api/calendar-json.googleapis.com/overview?project=123');
  });
  it('otherwise builds it from the Client ID’s project number', () => {
    expect(enableApiLink('', '987654-abc.apps.googleusercontent.com')).toBe('https://console.developers.google.com/apis/api/calendar-json.googleapis.com/overview?project=987654');
  });
});
