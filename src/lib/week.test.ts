import { describe, expect, it } from 'vitest';
import { emptyState } from './store';
import { mondayOf, reviewDue, targetWeek, thisWeeksGoals } from './week';

describe('weekly review', () => {
  it('works out the week being planned', () => {
    expect(mondayOf('2026-11-12')).toBe('2026-11-09'); // Thu → Mon
    expect(targetWeek('2026-11-14')).toBe('2026-11-16'); // Sat plans next week
    expect(targetWeek('2026-11-16')).toBe('2026-11-16'); // Mon plans this week
  });
  it('is suggested Friday afternoon to Monday noon until done', () => {
    const s = emptyState();
    expect(reviewDue(s, new Date(2026, 10, 13, 10), '2026-11-13')).toBe(false); // Fri morning
    expect(reviewDue(s, new Date(2026, 10, 13, 16), '2026-11-13')).toBe(true); // Fri 4pm
    expect(reviewDue(s, new Date(2026, 10, 16, 9), '2026-11-16')).toBe(true); // Mon 9am
    expect(reviewDue(s, new Date(2026, 10, 16, 13), '2026-11-16')).toBe(false); // Mon 1pm
    const done = { ...s, week: { key: '2026-11-16', goals: [], reviewedOn: '2026-11-15' } };
    expect(reviewDue(done, new Date(2026, 10, 15, 9), '2026-11-15')).toBe(false);
  });
  it('shows goals only in their week', () => {
    const s = { ...emptyState(), week: { key: '2026-11-09', goals: [{ id: 'g', title: 'Ship', done: false }] } };
    expect(thisWeeksGoals(s, '2026-11-12')).toHaveLength(1);
    expect(thisWeeksGoals(s, '2026-11-16')).toHaveLength(0);
  });
});
