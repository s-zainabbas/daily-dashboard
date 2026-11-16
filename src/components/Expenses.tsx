import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Gauge,
  PiggyBank,
  Plus,
  Receipt,
  Search,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Wallet,
  X,
} from 'lucide-react';
import { fromKey, today as todayKey } from '../lib/date';
import {
  addMonths,
  balanceUntil,
  budgetStatus,
  byCategory,
  categoriesFor,
  cumulative,
  daysIn,
  formatMoney,
  goalStatus,
  limitStatus,
  monthLabel,
  monthOf,
  monthTotals,
  projectMonth,
  recentMonths,
  type MonthKey,
} from '../lib/money';
import { actions, useStore } from '../lib/store';
import type { SavingsGoal, Transaction, TxKind } from '../lib/types';
import { HBars } from './Charts';
import { IncomeVsExpenses, SpendingPace } from './MoneyCharts';
import { Card, Dialog, DialogHead, Ring, Segmented, toast } from './ui';

/** Ask the Expenses tab to open the add form (from the command menu). */
export const ADD_MONEY_EVENT = 'dd:add-money';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'INR', 'PKR', 'AED', 'SAR', 'JPY', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'BRL', 'MXN', 'SGD', 'NZD', 'ZAR', 'TRY'];

export type TxDraft = { kind: TxKind; tx?: Transaction };

/** The Expenses tab: money in and out, budgets, a monthly limit and savings goals. */
export function ExpensesView() {
  const txs = useStore((s) => s.transactions);
  const money = useStore((s) => s.money);
  const cur = money.currency;
  const t = todayKey();
  const [month, setMonth] = useState<MonthKey>(monthOf(t));
  const [draft, setDraft] = useState<TxDraft | null>(null);
  const [limitOpen, setLimitOpen] = useState(false);
  const [goalEdit, setGoalEdit] = useState<SavingsGoal | 'new' | null>(null);

  useEffect(() => {
    const on = (e: Event) => setDraft({ kind: (e as CustomEvent<TxKind>).detail ?? 'expense' });
    window.addEventListener(ADD_MONEY_EVENT, on);
    return () => window.removeEventListener(ADD_MONEY_EVENT, on);
  }, []);

  const isNow = month === monthOf(t);
  const tot = useMemo(() => monthTotals(txs, month), [txs, month]);
  const before = useMemo(() => monthTotals(txs, addMonths(month, -1)), [txs, month]);
  const balance = useMemo(() => balanceUntil(txs, month), [txs, month]);
  const cats = useMemo(() => byCategory(txs, month), [txs, month]);
  const pace = useMemo(() => cumulative(txs, month, t), [txs, month, t]);
  const months = useMemo(() => recentMonths(txs, month, 6), [txs, month]);
  const projected = useMemo(() => projectMonth(txs, month, t), [txs, month, t]);
  const limit = money.monthlyLimit ? limitStatus(money.monthlyLimit, tot.expenses, month, t, projected) : undefined;
  const fmt = (v: number, o?: { compact?: boolean; sign?: boolean }) => formatMoney(v, cur, o);
  const change = before.expenses ? (tot.expenses - before.expenses) / before.expenses : undefined;

  return (
    <main className="money" aria-label="Expenses">
      <div className="money-bar">
        <h2>
          <Wallet size={18} /> Expenses
        </h2>
        <div className="money-month" role="group" aria-label="Month">
          <button className="icon-btn sm" onClick={() => setMonth((m) => addMonths(m, -1))} aria-label="Previous month">
            <ChevronLeft size={16} />
          </button>
          <b>{monthLabel(month)}</b>
          <button className="icon-btn sm" onClick={() => setMonth((m) => addMonths(m, 1))} aria-label="Next month" disabled={isNow}>
            <ChevronRight size={16} />
          </button>
          {!isNow && (
            <button className="btn sm ghost" onClick={() => setMonth(monthOf(t))}>
              This month
            </button>
          )}
        </div>
        <div className="money-actions">
          <label className="sr-only" htmlFor="money-currency">
            Currency
          </label>
          <select id="money-currency" className="select input sm" value={cur} onChange={(e) => actions.setMoney({ currency: e.target.value })} title="Currency">
            {[...new Set([cur, ...CURRENCIES])].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <button className="btn" onClick={() => setDraft({ kind: 'income' })}>
            <ArrowDownLeft size={14} /> Income
          </button>
          <button className="btn primary" onClick={() => setDraft({ kind: 'expense' })}>
            <Plus size={14} /> Expense
          </button>
        </div>
      </div>

      <div className="money-tiles">
        <Tile icon={<TrendingUp size={18} />} label="Income" value={fmt(tot.income)} sub={`${txs.filter((x) => x.kind === 'income' && monthOf(x.date) === month).length} payments in`} />
        <Tile
          icon={<TrendingDown size={18} />}
          label="Expenses"
          value={fmt(tot.expenses)}
          sub={change === undefined ? `${cats.length} categor${cats.length === 1 ? 'y' : 'ies'}` : `${change > 0 ? '+' : ''}${Math.round(change * 100)}% vs ${monthLabel(addMonths(month, -1), 'short')}`}
        />
        <Tile
          icon={<PiggyBank size={18} />}
          label={tot.net >= 0 ? 'Saved this month' : 'Overspent this month'}
          value={fmt(tot.net, { sign: true })}
          sub={tot.savingsRate !== undefined ? `${Math.round(tot.savingsRate * 100)}% of income · balance ${fmt(balance, { compact: true })}` : `Balance ${fmt(balance, { compact: true })}`}
        />
        <button type="button" className="card stat money-limit-tile" onClick={() => setLimitOpen(true)} aria-label="Monthly spending limit: change it">
          {limit ? (
            <Ring value={Math.min(1, limit.used)}>{`${Math.round(limit.used * 100)}%`}</Ring>
          ) : (
            <div className="stat-icon">
              <Gauge size={18} />
            </div>
          )}
          <div>
            <div className="label">Monthly limit</div>
            {limit ? (
              <>
                <div className="value num">
                  {limit.over ? (
                    <span className="money-over">
                      <TriangleAlert size={14} /> Over by {fmt(-limit.left, { compact: true })}
                    </span>
                  ) : (
                    <>
                      {fmt(limit.left, { compact: true })}
                      <small> left</small>
                    </>
                  )}
                </div>
                <div className="sub">
                  {limit.perDay !== undefined && !limit.over
                    ? `~${fmt(limit.perDay, { compact: true })}/day for ${limit.daysLeft} days`
                    : `${fmt(limit.spent, { compact: true })} of ${fmt(limit.limit, { compact: true })}`}
                </div>
              </>
            ) : (
              <>
                <div className="value" style={{ fontSize: 15 }}>
                  Set a limit
                </div>
                <div className="sub">Cap what you spend each month</div>
              </>
            )}
          </div>
        </button>
      </div>

      <div className="money-grid">
        <Card
          className="money-wide"
          title="Spending this month"
          icon={<Receipt size={16} />}
          meta={
            projected !== undefined && pace.length > 3
              ? `On pace for ${fmt(projected, { compact: true })}${limit && projected > limit.limit ? ' · over your limit' : ''}`
              : `${fmt(tot.expenses)} so far`
          }
        >
          <SpendingPace points={pace} days={daysIn(month)} limit={money.monthlyLimit} currency={cur} />
        </Card>

        <Card title="Where it went" icon={<Receipt size={16} />} meta={tot.expenses ? fmt(tot.expenses) : undefined}>
          <HBars
            rows={cats.map((c) => ({ label: c.category, value: c.amount, extra: <small className="money-share">{Math.round((c.amount / tot.expenses) * 100)}%</small> }))}
            format={(v) => fmt(v, { compact: true })}
            empty="No spending this month yet."
          />
        </Card>

        <Card title="Income vs expenses" icon={<TrendingUp size={16} />} meta="Last 6 months">
          <IncomeVsExpenses months={months} currency={cur} />
        </Card>

        <Budgets month={month} today={t} />
        <Goals onEdit={setGoalEdit} />
        <History month={month} onEdit={(tx) => setDraft({ kind: tx.kind, tx })} />
      </div>

      <TxDialog draft={draft} month={month} onClose={() => setDraft(null)} />
      <LimitDialog open={limitOpen} onClose={() => setLimitOpen(false)} />
      <GoalDialog goal={goalEdit} onClose={() => setGoalEdit(null)} />
    </main>
  );
}

function Tile({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="card stat">
      <div className="stat-icon">{icon}</div>
      <div>
        <div className="label">{label}</div>
        <div className="value num">{value}</div>
        <div className="sub">{sub}</div>
      </div>
    </div>
  );
}

/* ---------- Budgets ---------- */

function Budgets({ month, today }: { month: MonthKey; today: string }) {
  const txs = useStore((s) => s.transactions);
  const budgets = useStore((s) => s.budgets);
  const cur = useStore((s) => s.money.currency);
  const rows = budgetStatus(budgets, txs, month, today).sort((a, b) => b.used - a.used);
  const free = categoriesFor('expense', txs).filter((c) => !budgets.some((b) => b.category.toLowerCase() === c.toLowerCase()));
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const fmt = (v: number) => formatMoney(v, cur, { compact: true });
  const over = rows.filter((r) => r.over).length;

  return (
    <Card title="Budgets" icon={<Target size={16} />} meta={rows.length ? (over ? `${over} over` : 'All on track') : undefined}>
      {rows.length ? (
        <ul className="budget-list">
          {rows.map((r) => (
            <li key={r.budget.id} className={r.over ? 'over' : r.used > 0.85 ? 'near' : ''}>
              <div className="budget-head">
                <b className="truncate">{r.budget.category}</b>
                <span className="num">
                  {fmt(r.spent)} <small>of {fmt(r.limit)}</small>
                </span>
                <button
                  className="icon-btn sm"
                  aria-label={`Remove the ${r.budget.category} budget`}
                  onClick={() => {
                    const undo = actions.removeBudget(r.budget.id);
                    toast(`Removed the ${r.budget.category} budget`, { label: 'Undo', run: undo });
                  }}
                >
                  <X size={13} />
                </button>
              </div>
              <div className="progress" role="meter" aria-valuemin={0} aria-valuemax={r.limit} aria-valuenow={r.spent} aria-label={`${r.budget.category}: ${fmt(r.spent)} of ${fmt(r.limit)}`}>
                <i style={{ width: `${Math.min(100, r.used * 100)}%` }} />
              </div>
              <small className="budget-note">
                {r.over ? (
                  <>
                    <TriangleAlert size={12} /> Over by {fmt(-r.left)}
                  </>
                ) : r.perDay !== undefined ? (
                  `${fmt(r.left)} left · ~${fmt(r.perDay)}/day`
                ) : (
                  `${fmt(r.left)} left`
                )}
              </small>
            </li>
          ))}
        </ul>
      ) : (
        <p className="chart-empty">Give a category a monthly cap, like Food &amp; dining at 300, and see how close you are.</p>
      )}
      <form
        className="money-inline"
        onSubmit={(e) => {
          e.preventDefault();
          const v = Number(amount);
          const c = category || free[0];
          if (!c || !(v > 0)) return;
          actions.saveBudget(c, v);
          setAmount('');
          setCategory('');
        }}
      >
        <select className="select input sm" value={category || free[0] || ''} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
          {free.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <input className="input sm num" type="number" inputMode="decimal" min="0" step="any" placeholder="Monthly cap" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Monthly cap" />
        <button className="btn sm" disabled={!free.length}>
          <Plus size={13} /> Add
        </button>
      </form>
    </Card>
  );
}

/* ---------- Savings goals ---------- */

function Goals({ onEdit }: { onEdit: (g: SavingsGoal | 'new') => void }) {
  const goals = useStore((s) => s.savingsGoals);
  const cur = useStore((s) => s.money.currency);
  const t = todayKey();
  const fmt = (v: number) => formatMoney(v, cur, { compact: true });
  const [adding, setAdding] = useState<Record<string, string>>({});
  const deadline = (d: string) => fromKey(d).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });

  return (
    <Card
      title="Savings goals"
      icon={<PiggyBank size={16} />}
      actions={
        <button className="icon-btn sm" onClick={() => onEdit('new')} aria-label="New savings goal" title="New goal">
          <Plus size={15} />
        </button>
      }
    >
      {goals.length ? (
        <ul className="goal-list">
          {goals.map((g) => {
            const st = goalStatus(g, t);
            const val = adding[g.id] ?? '';
            return (
              <li key={g.id} className={st.done ? 'done' : ''}>
                <div className="budget-head">
                  <button className="linkish goal-name truncate" onClick={() => onEdit(g)} title="Edit goal">
                    {g.name}
                  </button>
                  <span className="num">
                    {fmt(g.saved)} <small>of {fmt(g.target)}</small>
                  </span>
                </div>
                <div className="progress" role="meter" aria-valuemin={0} aria-valuemax={g.target} aria-valuenow={g.saved} aria-label={`${g.name}: ${fmt(g.saved)} of ${fmt(g.target)}`}>
                  <i style={{ width: `${st.progress * 100}%` }} />
                </div>
                <small className="budget-note">
                  {st.done
                    ? '🎉 Reached'
                    : st.late
                      ? `${fmt(st.left)} to go · target date passed`
                      : st.perMonth !== undefined
                        ? `${Math.round(st.progress * 100)}% · put aside ${fmt(st.perMonth)}/month to make it by ${deadline(g.deadline!)}`
                        : `${Math.round(st.progress * 100)}% · ${fmt(st.left)} to go`}
                </small>
                {!st.done && (
                  <form
                    className="money-inline"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const v = Number(val);
                      if (!v) return;
                      actions.addToGoal(g.id, v);
                      setAdding((a) => ({ ...a, [g.id]: '' }));
                      toast(`${v > 0 ? 'Added' : 'Took out'} ${fmt(Math.abs(v))} ${v > 0 ? 'to' : 'from'} ${g.name}`, { label: 'Undo', run: () => actions.addToGoal(g.id, -v) });
                    }}
                  >
                    <input
                      className="input sm num"
                      type="number"
                      inputMode="decimal"
                      step="any"
                      placeholder="Amount"
                      value={val}
                      onChange={(e) => setAdding((a) => ({ ...a, [g.id]: e.target.value }))}
                      aria-label={`Amount to add to ${g.name}`}
                    />
                    <button className="btn sm">
                      <Plus size={13} /> Add money
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="empty">
          <PiggyBank size={22} />
          <b>Saving up for something?</b>
          <span>A trip, a laptop, an emergency fund: set a target and track it here.</span>
          <button className="btn sm" onClick={() => onEdit('new')}>
            <Plus size={13} /> New goal
          </button>
        </div>
      )}
    </Card>
  );
}

/* ---------- Transaction history ---------- */

function History({ month, onEdit }: { month: MonthKey; onEdit: (tx: Transaction) => void }) {
  const txs = useStore((s) => s.transactions);
  const cur = useStore((s) => s.money.currency);
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'all' | TxKind>('all');
  const [scope, setScope] = useState<'month' | 'all'>('month');
  const [limit, setLimit] = useState(60);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return txs
      .filter((x) => (scope === 'all' || monthOf(x.date) === month) && (kind === 'all' || x.kind === kind))
      .filter((x) => !needle || `${x.category} ${x.note ?? ''} ${x.amount}`.toLowerCase().includes(needle))
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  }, [txs, q, kind, scope, month]);

  const shown = list.slice(0, limit);
  const days = new Map<string, Transaction[]>();
  for (const x of shown) days.set(x.date, [...(days.get(x.date) ?? []), x]);
  const dayHead = (d: string) => fromKey(d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: scope === 'all' ? 'numeric' : undefined });

  return (
    <Card className="money-wide" title="Transactions" icon={<Receipt size={16} />} meta={`${list.length}`}>
      <div className="money-filters">
        <label className="money-search">
          <Search size={14} />
          <input className="input sm" placeholder="Search notes, categories, amounts" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search transactions" />
        </label>
        <Segmented label="Type" value={kind} onChange={setKind} options={[{ value: 'all', label: 'All' }, { value: 'expense', label: 'Expenses' }, { value: 'income', label: 'Income' }]} />
        <Segmented label="When" value={scope} onChange={setScope} options={[{ value: 'month', label: monthLabel(month, 'short') }, { value: 'all', label: 'All time' }]} />
      </div>
      {shown.length ? (
        <div className="tx-days">
          {[...days.entries()].map(([d, items]) => {
            const net = items.reduce((n, x) => n + (x.kind === 'income' ? x.amount : -x.amount), 0);
            return (
              <section key={d} className="tx-day">
                <header>
                  <span>{dayHead(d)}</span>
                  <span className="num">{formatMoney(net, cur, { sign: true })}</span>
                </header>
                <ul>
                  {items.map((x) => (
                    <li key={x.id} className={`tx ${x.kind}`}>
                      <button className="tx-main" onClick={() => onEdit(x)} title="Edit">
                        <span className="tx-icon" aria-hidden>
                          {x.kind === 'income' ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}
                        </span>
                        <span className="tx-text">
                          <b className="truncate">{x.note || x.category}</b>
                          {x.note && <small className="truncate">{x.category}</small>}
                        </span>
                        <span className="tx-amount num">
                          <span className="sr-only">{x.kind === 'income' ? 'Income' : 'Expense'} </span>
                          {formatMoney(x.kind === 'income' ? x.amount : -x.amount, cur, { sign: true })}
                        </span>
                      </button>
                      <button
                        className="icon-btn sm tx-del"
                        aria-label="Delete transaction"
                        onClick={() => {
                          const undo = actions.removeTransaction(x.id);
                          toast('Transaction deleted', { label: 'Undo', run: undo });
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
          {list.length > shown.length && (
            <button className="btn ghost sm" onClick={() => setLimit((n) => n + 100)}>
              Show more ({list.length - shown.length})
            </button>
          )}
        </div>
      ) : (
        <div className="empty">
          <Receipt size={22} />
          <b>{txs.length ? 'Nothing matches' : 'No transactions yet'}</b>
          <span>{txs.length ? 'Try another search or month.' : 'Add your first expense or income with the buttons at the top.'}</span>
        </div>
      )}
    </Card>
  );
}

/* ---------- Dialogs ---------- */

export function TxDialog({ draft, month, onClose }: { draft: TxDraft | null; month: MonthKey; onClose: () => void }) {
  const txs = useStore((s) => s.transactions);
  const cur = useStore((s) => s.money.currency);
  const t = todayKey();
  const blank = (kind: TxKind) => ({ kind, amount: '', category: kind === 'income' ? 'Salary' : '', note: '', date: monthOf(t) === month ? t : `${month}-01`, newCat: '' });
  const [form, setForm] = useState(blank('expense'));
  const [forDraft, setForDraft] = useState<TxDraft | null>(null);
  if (draft !== forDraft) {
    setForDraft(draft);
    if (draft)
      setForm(
        draft.tx
          ? { kind: draft.tx.kind, amount: String(draft.tx.amount), category: draft.tx.category, note: draft.tx.note ?? '', date: draft.tx.date, newCat: '' }
          : blank(draft.kind),
      );
  }
  const set = (p: Partial<typeof form>) => setForm((f) => ({ ...f, ...p }));
  const cats = categoriesFor(form.kind, txs);
  const editing = draft?.tx;

  return (
    <Dialog open={!!draft} onClose={onClose} label={editing ? 'Edit transaction' : form.kind === 'income' ? 'Add income' : 'Add expense'}>
      <DialogHead title={editing ? 'Edit transaction' : form.kind === 'income' ? 'Add income' : 'Add expense'} onClose={onClose} />
      <form
        className="modal-body"
        onSubmit={(e) => {
          e.preventDefault();
          const amount = Number(form.amount);
          const category = (form.category === '__new' ? form.newCat : form.category).trim() || (form.kind === 'income' ? 'Other income' : 'Other');
          if (!(amount > 0) || !form.date) return;
          const tx = actions.saveTransaction({ id: editing?.id, kind: form.kind, amount, category, note: form.note.trim() || undefined, date: form.date });
          if (!editing) {
            toast(`${formatMoney(tx.kind === 'income' ? tx.amount : -tx.amount, cur, { sign: true })} · ${category}`, { label: 'Undo', run: () => void actions.removeTransaction(tx.id) });
          }
          onClose();
        }}
      >
        <div className="field">
          <span>Type</span>
          <Segmented
            label="Type"
            value={form.kind}
            onChange={(k) => set({ kind: k, category: k === 'income' ? 'Salary' : '' })}
            options={[
              { value: 'expense', label: 'Expense' },
              { value: 'income', label: 'Income' },
            ]}
          />
        </div>
        <div className="row">
          <label className="field">
            <span>Amount ({cur})</span>
            <input className="input num money-amount" type="number" inputMode="decimal" min="0.01" step="any" required autoFocus data-autofocus value={form.amount} onChange={(e) => set({ amount: e.target.value })} placeholder="0.00" />
          </label>
          <label className="field">
            <span>Date</span>
            <input className="input" type="date" required value={form.date} max={t} onChange={(e) => set({ date: e.target.value })} />
          </label>
        </div>
        <label className="field">
          <span>Category</span>
          <select className="select input" value={form.category || cats[0]} onChange={(e) => set({ category: e.target.value })}>
            {cats.map((c) => (
              <option key={c}>{c}</option>
            ))}
            <option value="__new">New category…</option>
          </select>
        </label>
        {form.category === '__new' && (
          <label className="field">
            <span>New category</span>
            <input className="input" autoFocus data-autofocus value={form.newCat} onChange={(e) => set({ newCat: e.target.value })} placeholder="e.g. Coffee, Pets" maxLength={40} />
          </label>
        )}
        <label className="field">
          <span>Note</span>
          <input className="input" value={form.note} onChange={(e) => set({ note: e.target.value })} placeholder={form.kind === 'income' ? 'e.g. November salary' : 'e.g. Lunch with Sam'} maxLength={120} />
        </label>
        <div className="modal-foot">
          {editing && (
            <button
              type="button"
              className="btn ghost danger"
              onClick={() => {
                const undo = actions.removeTransaction(editing.id);
                toast('Transaction deleted', { label: 'Undo', run: undo });
                onClose();
              }}
            >
              <Trash2 size={14} /> Delete
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary">{editing ? 'Save' : form.kind === 'income' ? 'Add income' : 'Add expense'}</button>
        </div>
      </form>
    </Dialog>
  );
}

function LimitDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const money = useStore((s) => s.money);
  const [value, setValue] = useState('');
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setValue(money.monthlyLimit ? String(money.monthlyLimit) : '');
  }
  return (
    <Dialog open={open} onClose={onClose} label="Monthly spending limit">
      <DialogHead title="Monthly spending limit" onClose={onClose} />
      <form
        className="modal-body"
        onSubmit={(e) => {
          e.preventDefault();
          const v = Number(value);
          actions.setMoney({ monthlyLimit: v > 0 ? Math.round(v * 100) / 100 : undefined });
          onClose();
        }}
      >
        <p className="sync-pitch">The most you want to spend in a month, across every category. The dashboard shows what’s left and how much a day keeps you under it.</p>
        <label className="field">
          <span>Limit ({money.currency})</span>
          <input className="input num money-amount" type="number" inputMode="decimal" min="0" step="any" autoFocus data-autofocus value={value} onChange={(e) => setValue(e.target.value)} placeholder="e.g. 2000" />
        </label>
        <div className="modal-foot">
          {money.monthlyLimit !== undefined && (
            <button
              type="button"
              className="btn ghost danger"
              onClick={() => {
                actions.setMoney({ monthlyLimit: undefined });
                onClose();
              }}
            >
              Remove limit
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary">Save</button>
        </div>
      </form>
    </Dialog>
  );
}

function GoalDialog({ goal, onClose }: { goal: SavingsGoal | 'new' | null; onClose: () => void }) {
  const cur = useStore((s) => s.money.currency);
  const init = goal && goal !== 'new' ? goal : undefined;
  const blank = { name: '', target: '', saved: '', deadline: '' };
  const [form, setForm] = useState(blank);
  const [forGoal, setForGoal] = useState<unknown>(null);
  if (goal !== forGoal) {
    setForGoal(goal);
    setForm(init ? { name: init.name, target: String(init.target), saved: String(init.saved), deadline: init.deadline ?? '' } : blank);
  }
  const set = (p: Partial<typeof form>) => setForm((f) => ({ ...f, ...p }));

  return (
    <Dialog open={!!goal} onClose={onClose} label={init ? 'Edit savings goal' : 'New savings goal'}>
      <DialogHead title={init ? 'Edit savings goal' : 'New savings goal'} onClose={onClose} />
      <form
        className="modal-body"
        onSubmit={(e) => {
          e.preventDefault();
          const target = Number(form.target);
          if (!form.name.trim() || !(target > 0)) return;
          actions.saveGoal({ id: init?.id, name: form.name.trim(), target, saved: Math.max(0, Number(form.saved) || 0), deadline: form.deadline || undefined });
          onClose();
        }}
      >
        <label className="field">
          <span>What are you saving for?</span>
          <input className="input" autoFocus data-autofocus required value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Emergency fund, New laptop" maxLength={60} />
        </label>
        <div className="row">
          <label className="field">
            <span>Target ({cur})</span>
            <input className="input num" type="number" inputMode="decimal" min="1" step="any" required value={form.target} onChange={(e) => set({ target: e.target.value })} />
          </label>
          <label className="field">
            <span>Saved so far</span>
            <input className="input num" type="number" inputMode="decimal" min="0" step="any" value={form.saved} onChange={(e) => set({ saved: e.target.value })} placeholder="0" />
          </label>
        </div>
        <label className="field">
          <span>By when? (optional)</span>
          <input className="input" type="date" value={form.deadline} onChange={(e) => set({ deadline: e.target.value })} />
        </label>
        <div className="modal-foot">
          {init && (
            <button
              type="button"
              className="btn ghost danger"
              onClick={() => {
                const undo = actions.removeGoal(init.id);
                toast(`Deleted “${init.name}”`, { label: 'Undo', run: undo });
                onClose();
              }}
            >
              <Trash2 size={14} /> Delete
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary">{init ? 'Save' : 'Add goal'}</button>
        </div>
      </form>
    </Dialog>
  );
}

