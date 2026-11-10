import { describe, expect, it } from 'vitest';
import { firstDue, nextDate, nextDue, repeatLabel } from './repeat';

// 2026-11-06 is a Friday.
describe('nextDate', () => {
  it('daily and every N days', () => {
    expect(nextDate({ freq: 'daily' }, '2026-11-06')).toBe('2026-11-07');
    expect(nextDate({ freq: 'daily', interval: 3 }, '2026-11-30')).toBe('2026-12-03');
  });

  it('weekdays skips the weekend', () => {
    expect(nextDate({ freq: 'weekdays' }, '2026-11-06')).toBe('2026-11-09');
    expect(nextDate({ freq: 'weekdays' }, '2026-11-09')).toBe('2026-11-10');
  });

  it('weekly on chosen days', () => {
    const r = { freq: 'weekly' as const, days: [1, 3, 5] };
    expect(nextDate(r, '2026-11-09')).toBe('2026-11-11'); // Mon → Wed
    expect(nextDate(r, '2026-11-06')).toBe('2026-11-09'); // Fri → next Mon
    expect(nextDate({ freq: 'weekly', days: [0] }, '2026-11-08')).toBe('2026-11-15'); // Sun → Sun
  });

  it('every 2 weeks jumps a week after the last chosen day', () => {
    const r = { freq: 'weekly' as const, interval: 2, days: [1, 4] };
    expect(nextDate(r, '2026-11-09')).toBe('2026-11-12'); // Mon → Thu, same week
    expect(nextDate(r, '2026-11-12')).toBe('2026-11-23'); // Thu → Mon two weeks on
    expect(nextDate({ freq: 'weekly', interval: 2 }, '2026-11-06')).toBe('2026-11-20');
  });

  it('monthly keeps the anchor day through short months', () => {
    const r = { freq: 'monthly' as const, monthDay: 31 };
    expect(nextDate(r, '2026-01-31')).toBe('2026-02-28');
    expect(nextDate(r, '2026-02-28')).toBe('2026-03-31');
    expect(nextDate({ freq: 'monthly', interval: 3 }, '2026-11-15')).toBe('2027-02-15');
  });

  it('yearly, including Feb 29', () => {
    expect(nextDate({ freq: 'yearly', monthDay: 29 }, '2028-02-29')).toBe('2029-02-28');
    expect(nextDate({ freq: 'yearly', monthDay: 29 }, '2031-02-28')).toBe('2032-02-29');
  });
});

describe('nextDue', () => {
  it('finishing an overdue daily task lands on tomorrow, not another past day', () => {
    expect(nextDue({ freq: 'daily' }, '2026-11-01', '2026-11-06')).toBe('2026-11-07');
  });
  it('finishing early moves on from the due date', () => {
    expect(nextDue({ freq: 'weekly' }, '2026-11-13', '2026-11-06')).toBe('2026-11-20');
  });
});

describe('firstDue', () => {
  it('finds the first matching day on or after the start', () => {
    expect(firstDue({ freq: 'weekly', days: [2] }, '2026-11-06')).toBe('2026-11-10');
    expect(firstDue({ freq: 'daily' }, '2026-11-06')).toBe('2026-11-06');
    expect(firstDue({ freq: 'monthly', monthDay: 1 }, '2026-11-06')).toBe('2026-12-01');
  });
});

describe('repeatLabel', () => {
  it('reads naturally', () => {
    expect(repeatLabel({ freq: 'daily' })).toBe('Daily');
    expect(repeatLabel({ freq: 'weekly', days: [5, 1, 3] })).toBe('Every Mon, Wed, Fri');
    expect(repeatLabel({ freq: 'weekly', interval: 2 })).toBe('Every 2 weeks');
    expect(repeatLabel({ freq: 'monthly', interval: 3 })).toBe('Every 3 months');
  });
});
