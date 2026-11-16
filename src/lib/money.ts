import type { Budget, DateKey, SavingsGoal, Transaction, TxKind } from './types';

/** The Expenses tab's numbers. Pure functions over transactions; a month is `YYYY-MM`. */

export type MonthKey = string;

export const EXPENSE_CATEGORIES = [
  'Food & dining',
  'Groceries',
  'Transport',
  'Housing',
  'Bills & utilities',
  'Shopping',
  'Health',
  'Entertainment',
  'Subscriptions',
  'Travel',
  'Education',
  'Gifts & donations',
  'Other',
];
export const INCOME_CATEGORIES = ['Salary', 'Freelance', 'Business', 'Investments', 'Gifts', 'Refunds', 'Other income'];

export const categoriesFor = (kind: TxKind, txs: Transaction[] = []) => {
  const base = kind === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  // Your own categories too, most used first.
  const counts = new Map<string, number>();
  for (const t of txs) if (t.kind === kind && !base.includes(t.category)) counts.set(t.category, (counts.get(t.category) ?? 0) + 1);
  return [...base, ...[...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c)];
};

export const monthOf = (d: DateKey): MonthKey => d.slice(0, 7);

export function addMonths(m: MonthKey, n: number): MonthKey {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function daysIn(m: MonthKey): number {
  const [y, mo] = m.split('-').map(Number);
  return new Date(y, mo, 0).getDate();
}

export function monthLabel(m: MonthKey, style: 'long' | 'short' = 'long'): string {
  const [y, mo] = m.split('-').map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString(undefined, style === 'long' ? { month: 'long', year: 'numeric' } : { month: 'short' });
}

const round = (n: number) => Math.round(n * 100) / 100;
const inMonth = (txs: Transaction[], m: MonthKey) => txs.filter((t) => monthOf(t.date) === m);

export interface Totals {
  income: number;
  expenses: number;
  /** income − expenses */
  net: number;
  /** Share of income kept, 0–1; undefined without income. */
  savingsRate?: number;
}

export function totals(txs: Transaction[]): Totals {
  let income = 0;
  let expenses = 0;
  for (const t of txs) t.kind === 'income' ? (income += t.amount) : (expenses += t.amount);
  const net = round(income - expenses);
  return { income: round(income), expenses: round(expenses), net, savingsRate: income > 0 ? net / income : undefined };
}

export const monthTotals = (txs: Transaction[], m: MonthKey) => totals(inMonth(txs, m));

/** Everything you've earned minus everything you've spent, up to and including this month. */
export const balanceUntil = (txs: Transaction[], m: MonthKey) => totals(txs.filter((t) => monthOf(t.date) <= m)).net;

/** Spending per category this month, biggest first. */
export function byCategory(txs: Transaction[], m: MonthKey): { category: string; amount: number }[] {
  const sums = new Map<string, number>();
  for (const t of inMonth(txs, m)) if (t.kind === 'expense') sums.set(t.category, (sums.get(t.category) ?? 0) + t.amount);
  return [...sums.entries()].map(([category, amount]) => ({ category, amount: round(amount) })).sort((a, b) => b.amount - a.amount);
}

/**
 * Running total of spending through the month, one point per day. For the current month it
 * stops at today; past months run to their last day.
 */
export function cumulative(txs: Transaction[], m: MonthKey, today: DateKey): { date: DateKey; day: number; total: number; spent: number }[] {
  const perDay = new Map<number, number>();
  for (const t of inMonth(txs, m)) if (t.kind === 'expense') perDay.set(Number(t.date.slice(8)), (perDay.get(Number(t.date.slice(8))) ?? 0) + t.amount);
  const last = monthOf(today) === m ? Number(today.slice(8)) : monthOf(today) < m ? 0 : daysIn(m);
  const out = [];
  let total = 0;
  for (let day = 1; day <= last; day++) {
    const spent = perDay.get(day) ?? 0;
    total += spent;
    out.push({ date: `${m}-${String(day).padStart(2, '0')}`, day, total: round(total), spent: round(spent) });
  }
  return out;
}

/** Income and spending for the `n` months ending with `m`, oldest first. */
export function recentMonths(txs: Transaction[], m: MonthKey, n = 6): { month: MonthKey; income: number; expenses: number }[] {
  return Array.from({ length: n }, (_, i) => {
    const month = addMonths(m, i - n + 1);
    const t = monthTotals(txs, month);
    return { month, income: t.income, expenses: t.expenses };
  });
}

export interface LimitStatus {
  limit: number;
  spent: number;
  left: number;
  /** spent / limit (can be over 1) */
  used: number;
  over: boolean;
  /** Current month only: where you'll land at this pace, and what you can spend per day to stay under. */
  projected?: number;
  perDay?: number;
  daysLeft?: number;
}

/**
 * Where this month's spending will land at the current pace. Big one-off amounts (any single
 * expense over a third of the month so far, like rent) count once instead of being projected
 * forward every day. Undefined outside the current month.
 */
export function projectMonth(txs: Transaction[], m: MonthKey, today: DateKey): number | undefined {
  if (monthOf(today) !== m) return undefined;
  const spent = inMonth(txs, m).filter((t) => t.kind === 'expense');
  const total = spent.reduce((n, t) => n + t.amount, 0);
  const oneOff = spent.filter((t) => t.amount > total / 3).reduce((n, t) => n + t.amount, 0);
  const day = Number(today.slice(8));
  return round(total + ((total - oneOff) / day) * (daysIn(m) - day));
}

export function limitStatus(limit: number, spent: number, m: MonthKey, today: DateKey, projected?: number): LimitStatus {
  const left = round(limit - spent);
  const out: LimitStatus = { limit, spent, left, used: limit > 0 ? spent / limit : 0, over: spent > limit };
  if (monthOf(today) === m) {
    const day = Number(today.slice(8));
    const days = daysIn(m);
    out.daysLeft = days - day + 1; // today counts
    out.projected = projected ?? round((spent / day) * days);
    out.perDay = left > 0 ? round(left / out.daysLeft) : 0;
  }
  return out;
}

export interface BudgetStatus extends LimitStatus {
  budget: Budget;
}

export function budgetStatus(budgets: Budget[], txs: Transaction[], m: MonthKey, today: DateKey): BudgetStatus[] {
  const spent = new Map(byCategory(txs, m).map((c) => [c.category.toLowerCase(), c.amount]));
  return budgets.map((budget) => ({ budget, ...limitStatus(budget.limit, spent.get(budget.category.toLowerCase()) ?? 0, m, today) }));
}

export interface GoalStatus {
  goal: SavingsGoal;
  /** 0–1 */
  progress: number;
  left: number;
  done: boolean;
  /** With a deadline still ahead: how much to put aside each month to make it. */
  perMonth?: number;
  monthsLeft?: number;
  late: boolean;
}

export function goalStatus(goal: SavingsGoal, today: DateKey): GoalStatus {
  const left = round(Math.max(0, goal.target - goal.saved));
  const done = goal.saved >= goal.target;
  const out: GoalStatus = { goal, progress: goal.target > 0 ? Math.min(1, goal.saved / goal.target) : 0, left, done, late: false };
  if (goal.deadline && !done) {
    if (goal.deadline < today) out.late = true;
    else {
      const months = (Number(goal.deadline.slice(0, 4)) - Number(today.slice(0, 4))) * 12 + Number(goal.deadline.slice(5, 7)) - Number(today.slice(5, 7)) + 1;
      out.monthsLeft = Math.max(1, months);
      out.perMonth = round(left / out.monthsLeft);
    }
  }
  return out;
}

/** Format money in your currency, e.g. "$1,234.50". `compact` drops cents on round amounts. */
export function formatMoney(amount: number, currency: string, opts: { compact?: boolean; sign?: boolean } = {}): string {
  const whole = Math.abs(amount % 1) < 0.005;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol', // $ rather than US$
      minimumFractionDigits: opts.compact && whole ? 0 : undefined,
      maximumFractionDigits: opts.compact && whole ? 0 : undefined,
      signDisplay: opts.sign ? 'exceptZero' : 'auto',
    }).format(amount);
  } catch {
    return `${opts.sign && amount > 0 ? '+' : ''}${amount.toFixed(2)} ${currency}`;
  }
}

/** Short axis labels: $1.2k, $950. */
export function formatAxis(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, currencyDisplay: 'narrowSymbol', notation: 'compact', maximumFractionDigits: 1 }).format(amount);
  } catch {
    return String(Math.round(amount));
  }
}
