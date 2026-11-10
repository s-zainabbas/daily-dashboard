import { describe, expect, it } from 'vitest';
import { parseQuick, splitSteps } from './parse';
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

describe('parseQuick — repeats', () => {
  // REF is a Friday.
  it('reads daily phrases and starts today', () => {
    expect(parseQuick('Take vitamins every day', REF)).toEqual({ kind: 'task', title: 'Take vitamins', date: REF, repeat: { freq: 'daily' } });
    expect(parseQuick('Stretch daily', REF).repeat).toEqual({ freq: 'daily' });
    expect(parseQuick('Water plants every other day', REF).repeat).toEqual({ freq: 'daily', interval: 2 });
  });

  it('reads weekdays and starts on the next one', () => {
    expect(parseQuick('Check inbox every weekday', REF)).toMatchObject({ title: 'Check inbox', date: REF, repeat: { freq: 'weekdays' } });
    expect(parseQuick('Check inbox weekdays', '2026-11-07').date).toBe('2026-11-09'); // Saturday → Monday
  });

  it('reads specific weekdays', () => {
    expect(parseQuick('Gym every mon wed fri', REF)).toMatchObject({ title: 'Gym', date: REF, repeat: { freq: 'weekly', days: [1, 3, 5] } });
    expect(parseQuick('Team sync every Tuesday and Thursday', REF)).toMatchObject({ title: 'Team sync', date: '2026-11-10', repeat: { freq: 'weekly', days: [2, 4] } });
  });

  it('does not read "every month" as Monday', () => {
    expect(parseQuick('Pay rent every month', REF)).toMatchObject({ title: 'Pay rent', repeat: { freq: 'monthly', monthDay: 6 } });
    expect(parseQuick('Pay rent monthly nov 30', REF)).toMatchObject({ date: '2026-11-30', repeat: { freq: 'monthly', monthDay: 30 } });
  });

  it('reads intervals', () => {
    expect(parseQuick('Payroll every 2 weeks', REF).repeat).toEqual({ freq: 'weekly', interval: 2 });
    expect(parseQuick('Review budget fortnightly', REF).repeat).toEqual({ freq: 'weekly', interval: 2 });
    expect(parseQuick('Renew insurance yearly !high', REF)).toMatchObject({ title: 'Renew insurance', priority: 'high', repeat: { freq: 'yearly' } });
  });

  it('keeps a repeating item a task, with any time left in the title', () => {
    expect(parseQuick('Standup 9:30 every weekday', REF)).toMatchObject({ kind: 'task', title: 'Standup 9:30', repeat: { freq: 'weekdays' } });
  });

  it('leaves ordinary words alone', () => {
    expect(parseQuick('Read the weekly report', REF)).toEqual({ kind: 'task', title: 'Read the weekly report' });
    expect(parseQuick('Daily standup notes for Sam', REF).repeat).toBeUndefined();
    expect(parseQuick('Everything bagel', REF)).toEqual({ kind: 'task', title: 'Everything bagel' });
  });
});

describe('splitSteps', () => {
  it('one step per line, without list markers', () => {
    expect(splitSteps('- Write post\n* Design image\n\n1. Schedule\n2) Reply to comments\n[ ] Check stats\n[x] Celebrate')).toEqual([
      'Write post',
      'Design image',
      'Schedule',
      'Reply to comments',
      'Check stats',
      'Celebrate',
    ]);
  });
  it('keeps numbers that are part of the text', () => {
    expect(splitSteps('3 slides on pricing')).toEqual(['3 slides on pricing']);
  });
});
