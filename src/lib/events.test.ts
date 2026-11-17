import { describe, expect, it } from 'vitest';
import { expandEvents, occurrenceDates, seriesOf } from './events';
import type { CalEvent } from './types';

const ev = (p: Partial<CalEvent>): CalEvent => ({ id: 'e1', title: 'Standup', date: '2026-11-16', start: '10:00', end: '10:15', ...p });

describe('repeating events', () => {
  it('one-off events are left as they are', () => {
    const list = [ev({})];
    expect(expandEvents(list, '2026-11-01', '2026-12-01')).toBe(list);
  });

  it('weekdays skip the weekend, and "this day only" deletions are left out', () => {
    const e = ev({ repeat: { freq: 'weekdays' }, skip: ['2026-11-18'] });
    expect(occurrenceDates(e, '2026-11-16', '2026-11-23')).toEqual(['2026-11-16', '2026-11-17', '2026-11-19', '2026-11-20', '2026-11-23']);
  });

  it('weekly on chosen days, until an end date', () => {
    const e = ev({ repeat: { freq: 'weekly', days: [1, 3, 5] }, until: '2026-11-25' });
    expect(occurrenceDates(e, '2026-11-01', '2026-12-31')).toEqual(['2026-11-16', '2026-11-18', '2026-11-20', '2026-11-23', '2026-11-25']);
  });

  it('each occurrence has its own id that points back to the series', () => {
    const out = expandEvents([ev({ repeat: { freq: 'daily' } })], '2026-11-16', '2026-11-18');
    expect(out.map((x) => [x.id, x.date, x.seriesId])).toEqual([
      ['e1~2026-11-16', '2026-11-16', 'e1'],
      ['e1~2026-11-17', '2026-11-17', 'e1'],
      ['e1~2026-11-18', '2026-11-18', 'e1'],
    ]);
    expect(seriesOf(out[1].id)).toBe('e1');
  });

  it('monthly keeps the day of the month', () => {
    expect(occurrenceDates(ev({ date: '2026-01-31', repeat: { freq: 'monthly' } }), '2026-01-01', '2026-04-30')).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  });
});
