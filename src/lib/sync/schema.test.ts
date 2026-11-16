import { describe, expect, it } from 'vitest';
import { demoState } from '../demo';
import { CorruptBackupError, NewerSchemaError, SCHEMA_VERSION, contentOf, parseCloud, serialize, stamp, toState } from './schema';

describe('Drive file format', () => {
  it('round-trips every kind of data without loss', () => {
    const s = demoState('Zain');
    s.focus = { '2026-11-08': { minutes: 50, sessions: 2 } };
    const file = parseCloud(serialize(stamp(s, null, 1000, { id: 'd', name: 'Mac' })));
    const back = toState(file);
    expect(JSON.parse(JSON.stringify(back))).toEqual(JSON.parse(JSON.stringify(s)));
  });

  it('keeps old timestamps for unchanged records and stamps changed ones', () => {
    const s = demoState('Zain');
    const first = stamp(s, null, 1000, { id: 'd', name: 'Mac' });
    const changed = { ...s, tasks: s.tasks.map((t, i) => (i === 0 ? { ...t, title: 'Changed' } : t)) };
    const second = stamp(changed, first, 2000, { id: 'd', name: 'Mac' });
    expect(second.collections.tasks[s.tasks[0].id].t).toBe(2000);
    expect(second.collections.tasks[s.tasks[1].id].t).toBe(1000);
  });

  it('turns removed records into tombstones', () => {
    const s = demoState('Zain');
    const first = stamp(s, null, 1000, { id: 'd', name: 'Mac' });
    const second = stamp({ ...s, tasks: s.tasks.slice(1) }, first, 2000, { id: 'd', name: 'Mac' });
    expect(second.collections.tasks[s.tasks[0].id]).toEqual({ t: 2000, deleted: true });
    expect(contentOf(first)).not.toBe(contentOf(second));
  });

  it('rejects damaged files and files from a newer version', () => {
    expect(() => parseCloud('not json')).toThrow(CorruptBackupError);
    expect(() => parseCloud('{"hello":1}')).toThrow(CorruptBackupError);
    expect(() => parseCloud('{"app":"daily-dashboard","schema":1,"collections":{"tasks":{"x":{"t":1,"data":"oops"}}}}')).toThrow(CorruptBackupError);
    expect(() => parseCloud(`{"app":"daily-dashboard","schema":${SCHEMA_VERSION + 1}}`)).toThrow(NewerSchemaError);
  });

  it('reads version 1 files (before the Expenses tab) with empty money data', () => {
    const v1 = { app: 'daily-dashboard', schema: 1, savedAt: 1, collections: { tasks: { a: { t: 1, data: { id: 'a', title: 'Old task', done: false, priority: 'med', createdAt: 1 } } } }, values: {} };
    const s = toState(parseCloud(JSON.stringify(v1)));
    expect(s.tasks.map((t) => t.title)).toEqual(['Old task']);
    expect(s.transactions).toEqual([]);
    expect(s.budgets).toEqual([]);
    expect(s.money.currency).toMatch(/^[A-Z]{3}$/);
  });

  it('round-trips transactions, budgets, goals and money settings', () => {
    const s = demoState('Alex');
    s.transactions = [{ id: 'tx1', kind: 'expense', amount: 12.5, category: 'Food & dining', date: '2026-11-16', createdAt: 1 }];
    s.budgets = [{ id: 'b1', category: 'Food & dining', limit: 300 }];
    s.savingsGoals = [{ id: 'g1', name: 'Laptop', target: 2000, saved: 450, createdAt: 1 }];
    s.money = { currency: 'EUR', monthlyLimit: 1800 };
    const back = toState(parseCloud(serialize(stamp(s, null, 5, { id: 'd', name: 'x' }))));
    expect(back.transactions).toEqual(s.transactions);
    expect(back.budgets).toEqual(s.budgets);
    expect(back.savingsGoals).toEqual(s.savingsGoals);
    expect(back.money).toEqual(s.money);
  });

  it('accepts a file missing optional parts', () => {
    expect(toState(parseCloud('{"app":"daily-dashboard","schema":1}')).tasks).toEqual([]);
  });
});
