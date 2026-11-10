import { describe, expect, it } from 'vitest';
import { dueReminders } from './reminders';
import { emptyState } from './store';
import type { State } from './types';

const T = '2026-11-10';
const at = (h: number, m = 0) => new Date(2026, 10, 10, h, m);
const base = (): State => ({ ...emptyState(), settings: { ...emptyState().settings, eventReminder: 10 } });

describe('reminders', () => {
  const events = [{ id: 'e1', title: 'Standup', date: T, start: '09:30', end: '09:45' }];

  it('reminds before an event, once', () => {
    expect(dueReminders(base(), events, at(9, 15), new Set())).toEqual([]);
    const [r] = dueReminders(base(), events, at(9, 21), new Set());
    expect(r).toMatchObject({ title: 'Standup' });
    expect(r.body).toMatch(/in 9 min/);
    expect(dueReminders(base(), events, at(9, 25), new Set([r.key]))).toEqual([]);
    expect(dueReminders(base(), events, at(9, 31), new Set())).toEqual([]); // already started
  });

  it('event reminders can be turned off', () => {
    const s = base();
    s.settings.eventReminder = 0;
    expect(dueReminders(s, events, at(9, 25), new Set())).toEqual([]);
  });

  it('reminds about a task at its time, on its due date or today', () => {
    const s = base();
    s.tasks = [
      { id: 'a', title: 'Call mum', done: false, priority: 'med', createdAt: 0, remindAt: '15:00' },
      { id: 'b', title: 'Later', done: false, priority: 'med', createdAt: 0, remindAt: '15:00', dueDate: '2026-11-12' },
      { id: 'c', title: 'Done', done: true, priority: 'med', createdAt: 0, remindAt: '15:00' },
    ];
    expect(dueReminders(s, [], at(14, 59), new Set())).toEqual([]);
    expect(dueReminders(s, [], at(15, 5), new Set()).map((r) => r.taskId)).toEqual(['a']);
    expect(dueReminders(s, [], at(17, 30), new Set())).toEqual([]); // too late to be useful
  });
});
