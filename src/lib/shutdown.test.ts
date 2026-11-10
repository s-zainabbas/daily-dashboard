import { describe, expect, it } from 'vitest';
import { applyShutdown, leftovers, nextPriorityIdeas, shippedDraft, wins } from './shutdown';
import { emptyState, rollover } from './store';
import type { State, Task } from './types';

const T = '2026-11-10'; // Tuesday
const at = (h: number) => new Date(2026, 10, 10, h).getTime();
const task = (id: string, p: Partial<Task> = {}): Task => ({ id, title: id, done: false, priority: 'med', createdAt: 0, ...p });

const s: State = {
  ...emptyState(),
  lastActiveDate: T,
  priority: { title: 'Ship it', done: false },
  focus: { [T]: { minutes: 75, sessions: 3 } },
  habits: [
    { id: 'h1', name: 'Read', history: { [T]: true }, createdAt: 0 },
    { id: 'h2', name: 'Walk', history: {}, createdAt: 0 },
  ],
  tasks: [
    task('wrote notes', { done: true, completedAt: at(10) }),
    task('old win', { done: true, completedAt: at(10) - 864e5 }),
    task('fixed bug', { done: true, completedAt: at(15) }),
    task('late', { dueDate: '2026-11-08', priority: 'high' }),
    task('today', { dueDate: T }),
    task('tomorrow thing', { dueDate: '2026-11-11', priority: 'high' }),
    task('blocked', { dueDate: T, waitingOn: 'Sam' }),
  ],
};

describe('shutdown routine', () => {
  it('collects today’s wins', () => {
    const w = wins(s, T);
    expect(w.tasks.map((t) => t.id)).toEqual(['wrote notes', 'fixed bug']);
    expect(w.focusMinutes).toBe(75);
    expect(w.habitsDone).toBe(1);
    expect(w.habitsLeft.map((h) => h.name)).toEqual(['Walk']);
    expect(shippedDraft(w.tasks)).toBe('wrote notes\nfixed bug');
  });

  it('finds leftovers, skipping tasks waiting on someone', () => {
    expect(leftovers(s, T).map((t) => t.id)).toEqual(['late', 'today']);
  });

  it('suggests tomorrow’s #1', () => {
    expect(nextPriorityIdeas(s, T, { today: 'tomorrow' })).toEqual(['Ship it', 'tomorrow thing', 'today']);
  });

  it('closes the day', () => {
    const { state, complete } = applyShutdown(s, { leftovers: { late: 'week', today: 'done' }, shipped: ' Notes, bug ', slipped: '', mood: 4, nextPriority: 'tomorrow thing' }, T);
    expect(state.tasks.find((t) => t.id === 'late')!.dueDate).toBe('2026-11-16');
    expect(complete).toEqual(['today']);
    expect(state.reflection).toMatchObject({ shipped: 'Notes, bug', mood: 4, nextPriority: 'tomorrow thing', closed: true });
  });

  it('drops tasks and leaves "keep" alone', () => {
    const { state } = applyShutdown(s, { leftovers: { late: 'drop', today: 'keep' }, shipped: '', slipped: '', nextPriority: '' }, T);
    expect(state.tasks.some((t) => t.id === 'late')).toBe(false);
    expect(state.tasks.find((t) => t.id === 'today')!.dueDate).toBe(T);
    expect(state.reflection.nextPriority).toBeUndefined();
  });

  it('at midnight, tomorrow’s #1 becomes the priority and the day goes to the journal', () => {
    const { state } = applyShutdown(s, { leftovers: {}, shipped: 'Notes', slipped: '', mood: 5, nextPriority: 'tomorrow thing' }, T);
    const next = rollover(state, new Date(2026, 10, 11, 7));
    expect(next.priority).toEqual({ title: 'tomorrow thing', done: false });
    expect(next.reflection).toEqual({ shipped: '', slipped: '', carries: '' });
    expect(next.journal[0]).toMatchObject({ date: T, shipped: 'Notes', mood: 5, priority: 'Ship it' });
  });
});
