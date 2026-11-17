import { describe, expect, it } from 'vitest';
import { countdownDays, inDays, nextDate, upcoming } from './countdowns';
import type { Countdown } from './types';

const c = (p: Partial<Countdown>): Countdown => ({ id: 'c', title: 'Thing', date: '2026-12-01', createdAt: 0, ...p });

describe('countdowns', () => {
  it('one-off dates disappear once past; yearly ones come round again', () => {
    expect(nextDate(c({}), '2026-11-17')).toBe('2026-12-01');
    expect(nextDate(c({ date: '2026-11-01' }), '2026-11-17')).toBeNull();
    expect(nextDate(c({ date: '1996-03-10', yearly: true }), '2026-11-17')).toBe('2027-03-10');
    expect(nextDate(c({ date: '2000-02-29', yearly: true }), '2026-11-17')).toBe('2027-02-28');
  });

  it('soonest first, with birthdays counted', () => {
    const list = [c({ id: 'a', title: 'Trip', date: '2026-12-20' }), c({ id: 'b', title: 'Mum', date: '1966-11-22', yearly: true })];
    expect(upcoming(list, '2026-11-17').map((x) => [x.c.title, x.days, x.nth])).toEqual([
      ['Mum', 5, 60],
      ['Trip', 33, undefined],
    ]);
  });

  it('reads nicely', () => {
    expect([0, 1, 5, 21, 90].map(inDays)).toEqual(['Today', 'Tomorrow', 'in 5 days', 'in 3 weeks', 'in 3 months']);
  });

  it('shows in the calendar on the right days', () => {
    expect(countdownDays([c({ date: '2020-11-20', yearly: true })], '2026-11-01', '2027-12-31').map((x) => x.date)).toEqual(['2026-11-20', '2027-11-20']);
  });
});
