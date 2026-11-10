import { describe, expect, it } from 'vitest';
import { emptyState } from './store';
import { applyPlan, candidates, freeMinutes, nextWeek, overdue, planned } from './plan';
import type { State, Task } from './types';

const T = '2026-11-10'; // Tuesday
const task = (id: string, p: Partial<Task> = {}): Task => ({ id, title: id, done: false, priority: 'med', createdAt: 0, ...p });
const state = (tasks: Task[]): State => ({ ...emptyState(), tasks });

describe('plan my day', () => {
  const s = state([
    task('late', { dueDate: '2026-11-08', priority: 'high' }),
    task('late2', { dueDate: '2026-11-09' }),
    task('today', { dueDate: T }),
    task('fri', { dueDate: '2026-11-13' }),
    task('someday'),
    task('blocked', { dueDate: '2026-11-01', waitingOn: 'Sam' }),
    task('finished', { dueDate: '2026-11-01', done: true }),
  ]);

  it('finds overdue tasks, skipping done and waiting ones', () => {
    expect(overdue(s, T).map((t) => t.id)).toEqual(['late', 'late2']);
  });

  it('groups candidates using the triage choices', () => {
    const c = candidates(s, T, { late: 'today', late2: 'drop' });
    expect(c.today.map((t) => t.id)).toEqual(['late', 'today']);
    expect(c.soon.map((t) => t.id)).toEqual(['fri']);
    expect(c.anytime.map((t) => t.id)).toEqual(['someday']);
  });

  it('applies the plan', () => {
    const { state: out, complete } = applyPlan(s, { triage: { late: 'today', late2: 'done' }, picked: ['late', 'someday'], priority: ' Ship it ' }, T);
    const due = Object.fromEntries(out.tasks.map((t) => [t.id, t.dueDate]));
    expect(due.late).toBe(T); // picked
    expect(due.someday).toBe(T); // picked from anytime
    expect(due.today).toBe('2026-11-11'); // due today but not picked → tomorrow
    expect(due.fri).toBe('2026-11-13'); // untouched
    expect(due.blocked).toBe('2026-11-01'); // waiting on someone: untouched
    expect(complete).toEqual(['late2']);
    expect(out.priority).toEqual({ title: 'Ship it', done: false, plannedOn: T });
    expect(planned(out, T)).toBe(true);
  });

  it('drops and defers', () => {
    const { state: out } = applyPlan(s, { triage: { late: 'drop', late2: 'week' }, picked: ['today'], priority: '' }, T);
    expect(out.tasks.some((t) => t.id === 'late')).toBe(false);
    expect(out.tasks.find((t) => t.id === 'late2')!.dueDate).toBe('2026-11-16');
  });

  it('keeps a priority that was already done', () => {
    const done = { ...s, priority: { title: 'Ship it', done: true } };
    expect(applyPlan(done, { triage: {}, picked: [], priority: 'Ship it' }, T).state.priority.done).toBe(true);
  });

  it('next week means next Monday', () => {
    expect(nextWeek('2026-11-10')).toBe('2026-11-16');
    expect(nextWeek('2026-11-16')).toBe('2026-11-23');
    expect(nextWeek('2026-11-15')).toBe('2026-11-16');
  });
});

describe('freeMinutes', () => {
  const ev = (start: string, end: string) => ({ id: start, title: 'x', date: T, start, end });
  it('subtracts events, merging overlaps', () => {
    expect(freeMinutes([], T, 9 * 60)).toBe(11 * 60);
    expect(freeMinutes([ev('10:00', '11:00'), ev('10:30', '12:00'), ev('19:00', '21:00')], T, 9 * 60)).toBe(11 * 60 - 120 - 60);
  });
  it('is zero late in the evening', () => {
    expect(freeMinutes([], T, 21 * 60)).toBe(0);
  });
});
