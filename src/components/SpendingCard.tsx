import { useMemo, useState } from 'react';
import { ArrowRight, Plus, TriangleAlert, Wallet } from 'lucide-react';
import { today as todayKey } from '../lib/date';
import { budgetStatus, formatMoney, limitStatus, monthLabel, monthOf, monthTotals, projectMonth } from '../lib/money';
import { useStore } from '../lib/store';
import { TxDialog, type TxDraft } from './Expenses';
import { Card } from './ui';

/**
 * Today's glance at money: this month's spending against your limit, what went out today, what
 * you can spend per day to stay under, and any budget you've gone over. Add an expense right here.
 */
export function SpendingCard({ onOpen }: { onOpen: () => void }) {
  const txs = useStore((s) => s.transactions);
  const budgets = useStore((s) => s.budgets);
  const money = useStore((s) => s.money);
  const [draft, setDraft] = useState<TxDraft | null>(null);
  const t = todayKey();
  const m = monthOf(t);
  const cur = money.currency;
  const fmt = (v: number) => formatMoney(v, cur, { compact: true });

  const { spent, todaySpent, limit, over, used } = useMemo(() => {
    const spent = monthTotals(txs, m).expenses;
    const todaySpent = txs.filter((x) => x.kind === 'expense' && x.date === t).reduce((n, x) => n + x.amount, 0);
    const limit = money.monthlyLimit ? limitStatus(money.monthlyLimit, spent, m, t, projectMonth(txs, m, t)) : undefined;
    const over = budgetStatus(budgets, txs, m, t).filter((b) => b.over).sort((a, b) => a.left - b.left);
    const used = budgetStatus(budgets, txs, m, t).filter((b) => !b.over && b.used >= 0.85);
    return { spent, todaySpent, limit, over, used };
  }, [txs, budgets, money.monthlyLimit, m, t]);

  const empty = !txs.some((x) => monthOf(x.date) === m) && !limit;

  return (
    <Card
      className="spend-card"
      title="Spending"
      icon={<Wallet size={16} />}
      meta={monthLabel(m, 'short')}
      actions={
        <>
          <button className="icon-btn sm" onClick={() => setDraft({ kind: 'expense' })} aria-label="Add an expense" title="Add an expense">
            <Plus size={15} />
          </button>
          <button className="icon-btn sm" onClick={onOpen} aria-label="Open Expenses" title="Open Expenses (9)">
            <ArrowRight size={15} />
          </button>
        </>
      }
    >
      {empty ? (
        <div className="spend-empty">
          <span>Log what you spend and see it here every day.</span>
          <button className="btn sm" onClick={() => setDraft({ kind: 'expense' })}>
            <Plus size={13} /> Add expense
          </button>
        </div>
      ) : (
        <>
          <div className="spend-main num">
            <b>{fmt(spent)}</b>
            <span>{limit ? `of ${fmt(limit.limit)} this month` : 'spent this month'}</span>
          </div>
          {limit && (
            <div
              className={`progress ${limit.over ? 'over' : limit.used >= 0.85 ? 'near' : ''}`}
              role="meter"
              aria-valuemin={0}
              aria-valuemax={limit.limit}
              aria-valuenow={spent}
              aria-label={`Spent ${fmt(spent)} of ${fmt(limit.limit)}`}
            >
              <i style={{ width: `${Math.min(100, limit.used * 100)}%` }} />
            </div>
          )}
          <div className="spend-sub num">
            <span>
              Today <b>{fmt(todaySpent)}</b>
            </span>
            {limit &&
              (limit.over ? (
                <span className="spend-bad">
                  <TriangleAlert size={12} /> Over by {fmt(-limit.left)}
                </span>
              ) : (
                limit.perDay !== undefined && (
                  <span>
                    <b>{fmt(limit.perDay)}</b>/day left
                  </span>
                )
              ))}
          </div>
          {over.length > 0 ? (
            <button className="spend-alert bad" onClick={onOpen}>
              <TriangleAlert size={13} />
              <span className="truncate">
                {over[0].budget.category} over by {fmt(-over[0].left)}
                {over.length > 1 ? ` · ${over.length - 1} more` : ''}
              </span>
            </button>
          ) : used.length > 0 ? (
            <button className="spend-alert near" onClick={onOpen}>
              <TriangleAlert size={13} />
              <span className="truncate">
                {used[0].budget.category}: {fmt(used[0].left)} left of {fmt(used[0].limit)}
              </span>
            </button>
          ) : null}
        </>
      )}
      <TxDialog draft={draft} month={m} onClose={() => setDraft(null)} />
    </Card>
  );
}
