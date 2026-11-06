import { describe, expect, it } from 'vitest';
import { parseQuick } from './parse';
import { addDays, streak, dateKey } from './date';

const REF = '2026-11-06'; // a Friday

describe('parseQuick', () => {
  it('plain text is a task', () => {
    expect(parseQuick('Buy milk', REF)).toEqual({ kind: 'task', title: 'Buy milk' });
  });

  it('reads relative dates and priority', () => {
    const p = parseQuick('Call Sam tomorrow !high', REF);
    expect(p).toMatchObject({ kind: 'task', title: 'Call Sam', date: '2026-11-07', priority: 'high' });
  });

  it('reads weekday as the next occurrence', () => {
    expect(parseQuick('Review deck monday', REF).date).toBe('2026-11-09');
    expect(parseQuick('Review deck fri', REF).date).toBe('2026-11-13');
  });

  it('reads month + day', () => {
    expect(parseQuick('Send invoice nov 14', REF)).toMatchObject({ title: 'Send invoice', date: '2026-11-14' });
    expect(parseQuick('Renew passport jan 3', REF).date).toBe('2027-01-03');
  });

  it('turns a time into an event with a default hour', () => {
    expect(parseQuick('Standup at 9:30', REF)).toMatchObject({ kind: 'event', title: 'Standup', date: REF, start: '09:30', end: '10:30' });
  });

  it('assumes pm for small bare hours after "at"', () => {
    expect(parseQuick('Coffee with Ana at 3', REF)).toMatchObject({ start: '15:00' });
  });

  it('reads ranges and durations', () => {
    expect(parseQuick('Dentist fri 3-4pm', REF)).toMatchObject({ title: 'Dentist', date: '2026-11-13', start: '15:00', end: '16:00' });
    expect(parseQuick('Deep work 14:00-15:30', REF)).toMatchObject({ start: '14:00', end: '15:30' });
    expect(parseQuick('Sync at 11am for 30m', REF)).toMatchObject({ start: '11:00', end: '11:30' });
  });

  it('does not treat bare numbers as times', () => {
    expect(parseQuick('Read 3 chapters', REF)).toEqual({ kind: 'task', title: 'Read 3 chapters' });
  });
});

describe('date helpers', () => {
  it('dateKey uses local time, not UTC', () => {
    expect(dateKey(new Date(2026, 10, 6, 23, 30))).toBe('2026-11-06');
  });

  it('addDays crosses month boundaries', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('streak counts back through days, and tolerates an unticked today', () => {
    const h = { '2026-11-03': true, '2026-11-04': true, '2026-11-05': true };
    expect(streak(h, REF)).toBe(3);
    expect(streak({ ...h, [REF]: true }, REF)).toBe(4);
    expect(streak({ '2026-11-01': true }, REF)).toBe(0);
  });
});
