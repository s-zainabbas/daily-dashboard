import { describe, expect, it } from 'vitest';
import { lastDays } from './date';
import { focusBreakdown, headline, jobsPerWeek, moodSeries, tasksSeries } from './insights';
import { emptyState } from './store';
import type { State } from './types';

const T = '2026-11-10'; // Tuesday
const s: State = {
  ...emptyState(),
  projects: [{ id: 'p', name: 'Launch', status: 'track', nextAction: '', details: '', progress: 0 }],
  focus: {
    '2026-11-09': { minutes: 50, sessions: 2, items: { a: { title: 'Write', minutes: 25, projectId: 'p' }, b: { title: 'Read', minutes: 25 } } },
    [T]: { minutes: 25, sessions: 1, items: { a: { title: 'Write', minutes: 25, projectId: 'p' } } },
    '2026-11-02': { minutes: 30, sessions: 1 },
  },
  journal: [
    { date: '2026-11-09', shipped: '', slipped: '', carries: '', mood: 4, priority: '', priorityDone: false, tasksDone: 6, focusMinutes: 50 },
    { date: '2026-11-08', shipped: '', slipped: '', carries: '', mood: 2, priority: '', priorityDone: false, tasksDone: 2, focusMinutes: 0 },
  ],
  tasks: [{ id: 't', title: 'x', done: true, priority: 'med', createdAt: 0, completedAt: new Date(2026, 10, 10, 9).getTime() }],
  reflection: { shipped: '', slipped: '', carries: '', mood: 5 },
  jobs: [
    { id: 'j1', url: '', company: 'A', role: '', status: 'applied', appliedOn: '2026-11-09', createdAt: 0 },
    { id: 'j2', url: '', company: 'B', role: '', status: 'applied', appliedOn: '2026-11-03', createdAt: 0 },
  ],
};

describe('insights', () => {
  const week = lastDays(7, T);
  it('tasks per day: journal for past days, live for today', () => {
    expect(tasksSeries(s, week, T).slice(-3).map((p) => p.value)).toEqual([2, 6, 1]);
  });
  it('mood includes this evening’s review', () => {
    expect(moodSeries(s, week, T).slice(-3).map((p) => p.value)).toEqual([2, 4, 5]);
  });
  it('focus by task and by project', () => {
    expect(focusBreakdown(s, week, 'task').rows).toEqual([
      { label: 'Write', minutes: 50 },
      { label: 'Read', minutes: 25 },
    ]);
    expect(focusBreakdown(s, week, 'project').rows).toEqual([
      { label: 'Launch', minutes: 50 },
      { label: 'No project', minutes: 25 },
    ]);
  });
  it('jobs per week, Monday to Sunday', () => {
    expect(jobsPerWeek(s, T, 2)).toEqual([
      { date: '2026-11-02', value: 1 },
      { date: '2026-11-09', value: 1 },
    ]);
  });
  it('headline numbers compare with the period before', () => {
    const h = headline(s, T, 7);
    expect(h).toMatchObject({ focus: 75, focusBefore: 30, tasks: 9, jobs: 1 });
    expect(h.mood).toBeCloseTo(11 / 3);
  });
});
