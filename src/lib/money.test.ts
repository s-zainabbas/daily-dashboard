import { describe, expect, it } from 'vitest';
import { addMonths, balanceUntil, projectMonth, budgetStatus, byCategory, categoriesFor, cumulative, daysIn, goalStatus, limitStatus, monthTotals, recentMonths } from './money';
import type { Transaction } from './types';

let n = 0;
const tx = (kind: Transaction['kind'], amount: number, date: string, category = kind === 'income' ? 'Salary' : 'Groceries'): Transaction => ({
  id: `t${n++}`,
  kind,
  amount,
  category,
  date,
  createdAt: 0,
});

const txs = [
  tx('income', 3000, '2026-11-01'),
  tx('expense', 1200, '2026-11-01', 'Housing'),
  tx('expense', 45.5, '2026-11-03'),
  tx('expense', 30, '2026-11-03', 'Food & dining'),
  tx('expense', 80.25, '2026-11-10'),
  tx('income', 2800, '2026-10-01'),
  tx('expense', 2000, '2026-10-15', 'Travel'),
];

describe('months', () => {
  it('steps across years and knows month lengths', () => {
    expect(addMonths('2026-11', 2)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(daysIn('2028-02')).toBe(29);
  });
});

describe('totals', () => {
  it('income, expenses, net and savings rate for a month', () => {
    expect(monthTotals(txs, '2026-11')).toEqual({ income: 3000, expenses: 1355.75, net: 1644.25, savingsRate: 1644.25 / 3000 });
    expect(monthTotals(txs, '2026-09')).toEqual({ income: 0, expenses: 0, net: 0, savingsRate: undefined });
  });
  it('balance carries over from earlier months', () => {
    expect(balanceUntil(txs, '2026-10')).toBe(800);
    expect(balanceUntil(txs, '2026-11')).toBe(2444.25);
  });
  it('spending by category, biggest first', () => {
    expect(byCategory(txs, '2026-11')).toEqual([
      { category: 'Housing', amount: 1200 },
      { category: 'Groceries', amount: 125.75 },
      { category: 'Food & dining', amount: 30 },
    ]);
  });
});

describe('cumulative', () => {
  it('runs to today in the current month', () => {
    const c = cumulative(txs, '2026-11', '2026-11-04');
    expect(c.map((p) => p.total)).toEqual([1200, 1200, 1275.5, 1275.5]);
    expect(c[2]).toMatchObject({ date: '2026-11-03', spent: 75.5 });
  });
  it('runs to the end of past months, and is empty for future ones', () => {
    expect(cumulative(txs, '2026-10', '2026-11-04')).toHaveLength(31);
    expect(cumulative(txs, '2026-12', '2026-11-04')).toEqual([]);
  });
});

describe('recentMonths', () => {
  it('oldest first, ending with the given month', () => {
    expect(recentMonths(txs, '2026-11', 3)).toEqual([
      { month: '2026-09', income: 0, expenses: 0 },
      { month: '2026-10', income: 2800, expenses: 2000 },
      { month: '2026-11', income: 3000, expenses: 1355.75 },
    ]);
  });
});

describe('limits and budgets', () => {
  it('pace and safe daily spend in the current month', () => {
    const s = limitStatus(2000, 1000, '2026-11', '2026-11-10');
    expect(s).toMatchObject({ left: 1000, used: 0.5, over: false, projected: 3000, daysLeft: 21 });
    expect(s.perDay).toBeCloseTo(47.62, 2);
  });
  it('over the limit', () => {
    expect(limitStatus(1000, 1355.75, '2026-11', '2026-11-30')).toMatchObject({ over: true, left: -355.75, perDay: 0 });
  });
  it('projection counts big one-offs like rent once', () => {
    // Nov 1–4: rent 1200 + 155.75 of everyday spending (the 10th isn't here yet).
    const early = txs.filter((x) => x.date <= '2026-11-04');
    expect(projectMonth(early, '2026-11', '2026-11-04')).toBeCloseTo(1275.5 + (75.5 / 4) * 26, 2);
    expect(projectMonth(txs, '2026-10', '2026-11-04')).toBeUndefined();
  });
  it('past months have no pace', () => {
    expect(limitStatus(1000, 500, '2026-10', '2026-11-10').projected).toBeUndefined();
  });
  it('budgets match categories regardless of case', () => {
    const [b] = budgetStatus([{ id: 'b', category: 'groceries', limit: 100 }], txs, '2026-11', '2026-11-20');
    expect(b).toMatchObject({ spent: 125.75, over: true, left: -25.75 });
  });
});

describe('goals', () => {
  it('progress and monthly amount to hit a deadline', () => {
    const g = goalStatus({ id: 'g', name: 'Laptop', target: 2000, saved: 500, deadline: '2027-02-15', createdAt: 0 }, '2026-11-16');
    expect(g).toMatchObject({ progress: 0.25, left: 1500, done: false, monthsLeft: 4, perMonth: 375, late: false });
  });
  it('done and late', () => {
    expect(goalStatus({ id: 'g', name: 'x', target: 100, saved: 120, createdAt: 0 }, '2026-11-16')).toMatchObject({ done: true, progress: 1, left: 0 });
    expect(goalStatus({ id: 'g', name: 'x', target: 100, saved: 20, deadline: '2026-10-01', createdAt: 0 }, '2026-11-16').late).toBe(true);
  });
});

describe('categories', () => {
  it('your own categories follow the built-in ones', () => {
    const list = categoriesFor('expense', [tx('expense', 5, '2026-11-01', 'Coffee'), tx('expense', 5, '2026-11-02', 'Coffee'), tx('expense', 5, '2026-11-02', 'Pets')]);
    expect(list.slice(-2)).toEqual(['Coffee', 'Pets']);
  });
});
