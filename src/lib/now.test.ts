import { describe, expect, it } from 'vitest';
import { candidates, moment } from './now';
import { emptyState } from './store';
import type { State, Task } from './types';

const day = '2026-11-16';
const task = (p: Partial<Task> & { id: string }): Task => ({ title: p.id, done: false, priority: 'med', createdAt: 0, ...p });
const state = (p: Partial<State>): State => ({ ...emptyState(), ...p });

describe('moment', () => {
  const events = [
    { id: 'a', title: 'Standup', date: day, start: '09:30', end: '09:45' },
    { id: 'b', title: 'Design review', date: day, start: '14:00', end: '15:00' },
    { id: 'c', title: 'Tomorrow', date: '2026-11-17', start: '09:00' },
  ];
  it('in an event', () => expect(moment(events, day, 9 * 60 + 35)).toMatchObject({ kind: 'busy', endsIn: 10, event: { title: 'Standup' } }));
  it('free until the next one', () => expect(moment(events, day, 12 * 60)).toMatchObject({ kind: 'free', minutes: 120, next: { title: 'Design review' } }));
  it('nothing left today', () => expect(moment(events, day, 16 * 60)).toEqual({ kind: 'clear' }));
  it('an event without an end counts as 30 minutes', () =>
    expect(moment([{ id: 'x', title: 'Call', date: day, start: '10:00' }], day, 10 * 60 + 20)).toMatchObject({ kind: 'busy', endsIn: 10 }));
});

describe('candidates', () => {
  it('the #1 first, then overdue, today and anytime, each by priority', () => {
    const s = state({
      priority: { title: 'Ship it', done: false },
      tasks: [
        task({ id: 'anytime-high', priority: 'high' }),
        task({ id: 'today-low', dueDate: day, priority: 'low' }),
        task({ id: 'today-high', dueDate: day, priority: 'high' }),
        task({ id: 'overdue', dueDate: '2026-11-10' }),
        task({ id: 'future', dueDate: '2026-11-20' }),
        task({ id: 'waiting', dueDate: day, waitingOn: 'Sam' }),
        task({ id: 'done', dueDate: day, done: true }),
      ],
    });
    expect(candidates(s, day).map((p) => p.id)).toEqual(['priority', 'overdue', 'today-high', 'today-low', 'anytime-high']);
  });

  it('a finished #1 is skipped, and a task matching the #1 shows only once', () => {
    expect(candidates(state({ priority: { title: 'X', done: true }, tasks: [task({ id: 't', title: 'X' })] }), day).map((p) => p.id)).toEqual(['t']);
    expect(candidates(state({ priority: { title: 'X', done: false }, tasks: [task({ id: 't', title: 'x' })] }), day).map((p) => p.id)).toEqual(['priority']);
  });

  it('tasks that fit before the next event come first', () => {
    const s = state({ tasks: [task({ id: 'long', dueDate: day, priority: 'high', estimate: 120 }), task({ id: 'short', dueDate: day, estimate: 30 })] });
    expect(candidates(s, day, 45).map((p) => p.id)).toEqual(['short', 'long']);
    expect(candidates(s, day).map((p) => p.id)).toEqual(['long', 'short']);
  });
});
