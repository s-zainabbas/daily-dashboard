import { describe, expect, it } from 'vitest';
import { diffReminders, plannedReminders, reminderId } from './phoneReminders';
import { emptyState } from './store';
import type { State } from './types';

const now = new Date(2026, 10, 16, 9, 0); // Mon 16 Nov 2026, 09:00
const state = (p: Partial<State>): State => ({ ...emptyState(), ...p });

describe('reminderId', () => {
  it('is base32hex with the dashboard prefix, as Google requires', () => {
    const id = reminderId(['task', 'abc', '2026-11-16', '15:00']);
    expect(id).toMatch(/^ddrem[0-9a-v]{5,1019}$/);
  });
  it('is the same for the same reminder and changes with it', () => {
    expect(reminderId(['a', 1])).toBe(reminderId(['a', 1]));
    expect(reminderId(['a', 1])).not.toBe(reminderId(['a', 2]));
  });
});

describe('plannedReminders', () => {
  it('a task reminder on its due date, free time, alert at the time', () => {
    const [r, ...rest] = plannedReminders(state({ tasks: [{ id: 't1', title: 'Call Sam', done: false, priority: 'med', dueDate: '2026-11-18', remindAt: '15:00', createdAt: 0 }] }), now);
    expect(rest).toHaveLength(0);
    expect(r.summary).toBe('🔔 Call Sam');
    expect(r.start).toEqual(new Date(2026, 10, 18, 15, 0));
    expect(r.alertBefore).toBe(0);
    expect(r.free).toBe(true);
  });

  it('undated and overdue tasks remind today; past times and done tasks are skipped', () => {
    const rs = plannedReminders(
      state({
        tasks: [
          { id: 'a', title: 'Undated', done: false, priority: 'med', remindAt: '10:00', createdAt: 0 },
          { id: 'b', title: 'Overdue', done: false, priority: 'med', dueDate: '2026-11-10', remindAt: '11:00', createdAt: 0 },
          { id: 'c', title: 'Already passed', done: false, priority: 'med', remindAt: '08:00', createdAt: 0 },
          { id: 'd', title: 'Done', done: true, priority: 'med', remindAt: '12:00', createdAt: 0 },
        ],
      }),
      now,
    );
    expect(rs.map((r) => [r.summary, r.start.getDate(), r.start.getHours()])).toEqual([
      ['🔔 Undated', 16, 10],
      ['🔔 Overdue', 16, 11],
    ]);
  });

  it('own timed events and interviews get the event reminder lead time', () => {
    const rs = plannedReminders(
      state({
        events: [
          { id: 'e1', title: 'Dentist', date: '2026-11-17', start: '14:00', end: '15:00' },
          { id: 'e2', title: 'All day', date: '2026-11-17' },
          { id: 'e3', title: 'Too far', date: '2027-02-01', start: '09:00' },
        ],
        jobs: [{ id: 'j', url: '', company: 'Acme', role: 'Designer', status: 'interview', appliedOn: '2026-11-01', interviewAt: '2026-11-19T10:30', createdAt: 0 }],
      }),
      now,
    );
    expect(rs.map((r) => r.summary)).toEqual(['Dentist', 'Interview: Designer at Acme']);
    expect(rs.every((r) => r.alertBefore === 10 && !r.free)).toBe(true);
  });

  it('no event reminders when they are turned off', () => {
    const s = state({ events: [{ id: 'e1', title: 'Dentist', date: '2026-11-17', start: '14:00' }] });
    expect(plannedReminders({ ...s, settings: { ...s.settings, eventReminder: 0 } }, now)).toEqual([]);
  });
});

describe('diffReminders', () => {
  it('adds the missing ones and removes the stale ones', () => {
    const s = state({ tasks: [{ id: 't', title: 'X', done: false, priority: 'med', remindAt: '12:00', createdAt: 0 }] });
    const [r] = plannedReminders(s, now);
    expect(diffReminders([r], ['ddremold'])).toEqual({ add: [r], remove: ['ddremold'] });
    expect(diffReminders([r], [r.id])).toEqual({ add: [], remove: [] });
  });
});
