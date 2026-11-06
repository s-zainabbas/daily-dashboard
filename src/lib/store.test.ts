import { describe, expect, it } from 'vitest';
import { emptyState, migrateLegacy, rollover } from './store';

describe('migrateLegacy', () => {
  it('returns null when there is no old data', () => {
    expect(migrateLegacy(() => undefined)).toBeNull();
  });

  it('brings over tasks, events, top priority and open inbox items', () => {
    const legacy: Record<string, unknown> = {
      'dashboard.tasks': [{ id: 'a', title: 'Old task', done: false, priority: 'high', dueDate: '2026-11-06', waitingOn: '' }],
      'dashboard.events': [{ id: 'e', title: 'Standup', date: '2026-11-06', startTime: '09:00', endTime: '09:15', notes: '' }],
      'dashboard.inbox': [{ id: 'm', sender: 'Sam', subject: 'Contract', time: 'Now', done: false }],
      'dashboard.topTask': { title: 'Big thing', dueDate: '' },
      'dashboard.settings': { theme: 'light' },
    };
    const s = migrateLegacy((k) => legacy[k])!;
    expect(s.tasks.map((t) => t.title)).toEqual(['Old task', 'Reply to Sam: Contract']);
    expect(s.tasks[0].waitingOn).toBeUndefined();
    expect(s.events[0]).toMatchObject({ start: '09:00', end: '09:15' });
    expect(s.priority.title).toBe('Big thing');
    expect(s.settings.theme).toBe('light');
  });
});

describe('rollover', () => {
  it('journals yesterday, keeps open tasks, and carries notes forward', () => {
    const s = emptyState();
    s.lastActiveDate = '2026-11-05';
    s.priority = { title: 'Launch', done: true };
    s.reflection = { shipped: 'Launched', slipped: '', carries: 'Follow up with press' };
    s.tasks = [{ id: '1', title: 'Unfinished', done: false, priority: 'med', dueDate: '2026-11-05', createdAt: 0 }];
    const next = rollover(s, new Date(2026, 10, 6, 8));
    expect(next.lastActiveDate).toBe('2026-11-06');
    expect(next.journal[0]).toMatchObject({ date: '2026-11-05', shipped: 'Launched', priority: 'Launch', priorityDone: true });
    expect(next.tasks.map((t) => t.title)).toEqual(['Follow up with press', 'Unfinished']);
    expect(next.reflection.shipped).toBe('');
    expect(next.priority.title).toBe('');
  });

  it('does nothing on the same day', () => {
    const s = emptyState();
    expect(rollover(s)).toBe(s);
  });
});
