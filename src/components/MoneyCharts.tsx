import { useLayoutEffect, useState, type KeyboardEvent } from 'react';
import { fromKey } from '../lib/date';
import { formatAxis, formatMoney, monthLabel, type MonthKey } from '../lib/money';

/**
 * Charts for the Expenses tab. Plain SVG / HTML, drawn to the card's real width: thin marks,
 * a quiet grid, a hover (and arrow-key) tooltip on every point, and a "Show numbers" table
 * so nothing is chart-only.
 */

/** Width of an element that may mount later (a callback ref, so it's measured whenever it appears). */
function useWidth<T extends HTMLElement>() {
  const [el, setEl] = useState<T | null>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, width] as const;
}

/** A round number just above `v`, so the top grid line has a friendly label. */
function niceMax(v: number) {
  if (v <= 0) return 100;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return ([1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((s) => n <= s) ?? 10) * p;
}

const dayName = (d: string) => fromKey(d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const shortDay = (d: string) => fromKey(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

function NumbersTable({ head, rows }: { head: string[]; rows: string[][] }) {
  if (!rows.length) return null;
  return (
    <details className="chart-table">
      <summary>Show numbers</summary>
      <table>
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r[0]}>
              {r.map((c, i) => (
                <td key={i} className={i ? 'num' : undefined}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

/* ---------- Spending through the month, against your limit ---------- */

export function SpendingPace({ points, days, limit, currency }: {
  points: { date: string; day: number; total: number; spent: number }[];
  days: number;
  limit?: number;
  currency: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const H = 190;
  const pad = { l: 46, r: 10, t: 14, b: 22 };
  const w = Math.max(0, width - pad.l - pad.r);
  const h = H - pad.t - pad.b;
  const last = points[points.length - 1];
  const top = niceMax(Math.max(limit ?? 0, last?.total ?? 0) * 1.08);
  const x = (day: number) => pad.l + (days > 1 ? ((day - 1) / (days - 1)) * w : 0);
  const y = (v: number) => pad.t + h - (v / top) * h;
  const money = (v: number) => formatMoney(v, currency);

  if (!points.length) return <p className="chart-empty">Nothing to show for this month yet.</p>;

  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.day).toFixed(1)},${y(p.total).toFixed(1)}`).join('');
  const area = `${line}L${x(last.day).toFixed(1)},${y(0)}L${x(1).toFixed(1)},${y(0)}Z`;
  const hp = hover !== null ? points[hover] : undefined;
  const ticks = [0, top / 2, top];
  const xTicks = [1, Math.ceil(days / 2), days];
  const over = limit !== undefined && last.total > limit;

  const pick = (clientX: number, el: Element) => {
    const r = el.getBoundingClientRect();
    const day = Math.round(((clientX - r.left - pad.l) / Math.max(1, w)) * (days - 1)) + 1;
    setHover(Math.max(0, Math.min(points.length - 1, day - 1)));
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    setHover((i) => Math.max(0, Math.min(points.length - 1, (i ?? points.length - 1) + (e.key === 'ArrowLeft' ? -1 : 1))));
  };

  return (
    <div className="chart">
      <div className="pace" ref={ref}>
        {width > 0 && (
          <svg
            width={width}
            height={H}
            role="img"
            tabIndex={0}
            aria-label={`Spending so far: ${money(last.total)}${limit !== undefined ? ` of a ${money(limit)} limit` : ''}. Use the arrow keys to read each day.`}
            onMouseMove={(e) => pick(e.clientX, e.currentTarget)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(points.length - 1)}
            onBlur={() => setHover(null)}
            onKeyDown={onKey}
          >
            {ticks.map((v) => (
              <g key={v}>
                <line className="pace-grid" x1={pad.l} x2={pad.l + w} y1={y(v)} y2={y(v)} />
                <text className="pace-axis" x={pad.l - 8} y={y(v) + 3.5} textAnchor="end">
                  {formatAxis(v, currency)}
                </text>
              </g>
            ))}
            {xTicks.map((d, i) => (
              <text key={d} className="pace-axis" x={x(d)} y={H - 6} textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}>
                {shortDay(`${points[0].date.slice(0, 8)}${String(d).padStart(2, '0')}`)}
              </text>
            ))}
            {limit !== undefined && limit <= top && (
              <g>
                <line className="pace-limit" x1={pad.l} x2={pad.l + w} y1={y(limit)} y2={y(limit)} />
                <text className="pace-limit-label" x={pad.l + w} y={y(limit) - 6} textAnchor="end">
                  Limit {formatAxis(limit, currency)}
                </text>
              </g>
            )}
            <path className={`pace-area ${over ? 'over' : ''}`} d={area} />
            <path className={`pace-line ${over ? 'over' : ''}`} d={line} />
            {hp ? (
              <g>
                <line className="pace-cross" x1={x(hp.day)} x2={x(hp.day)} y1={pad.t} y2={pad.t + h} />
                <circle className={`pace-dot ${over ? 'over' : ''}`} cx={x(hp.day)} cy={y(hp.total)} r={4.5} />
              </g>
            ) : (
              <circle className={`pace-dot ${over ? 'over' : ''}`} cx={x(last.day)} cy={y(last.total)} r={4.5} />
            )}
          </svg>
        )}
        {hp && (
          <div className="chart-tip pace-tip" style={{ left: Math.min(Math.max(x(hp.day), 70), width - 70), top: y(hp.total) - 10 }}>
            <b className="num">{money(hp.total)}</b>
            <span>
              {dayName(hp.date)}
              {hp.spent ? ` · ${money(hp.spent)} that day` : ''}
            </span>
          </div>
        )}
      </div>
      <NumbersTable
        head={['Day', 'Spent that day', 'Total so far']}
        rows={points.filter((p) => p.spent).map((p) => [dayName(p.date), money(p.spent), money(p.total)])}
      />
    </div>
  );
}

/* ---------- Income and spending, month by month ---------- */

export function IncomeVsExpenses({ months, currency }: { months: { month: MonthKey; income: number; expenses: number }[]; currency: string }) {
  const [hover, setHover] = useState<string | null>(null);
  const max = niceMax(Math.max(1, ...months.flatMap((m) => [m.income, m.expenses])));
  const money = (v: number) => formatMoney(v, currency, { compact: true });
  if (!months.some((m) => m.income || m.expenses)) return <p className="chart-empty">Add a few transactions to see your months side by side.</p>;
  const series = [
    { key: 'income' as const, label: 'Income' },
    { key: 'expenses' as const, label: 'Expenses' },
  ];

  return (
    <div className="chart">
      <div className="money-legend" aria-hidden>
        {series.map((s) => (
          <span key={s.key}>
            <i className={`swatch ${s.key}`} /> {s.label}
          </span>
        ))}
      </div>
      <div className="chart-plot" role="img" aria-label={`Income and expenses for the last ${months.length} months`}>
        <span className="chart-max num">{formatAxis(max, currency)}</span>
        <div className="bars pair-bars" onMouseLeave={() => setHover(null)}>
          {months.map((m) => (
            <div key={m.month} className="pair">
              {series.map((s) => {
                const id = `${m.month}:${s.key}`;
                return (
                  <div
                    key={s.key}
                    className={`bar-slot ${hover === id ? 'hover' : ''}`}
                    tabIndex={0}
                    aria-label={`${monthLabel(m.month)} ${s.label.toLowerCase()}: ${money(m[s.key])}`}
                    onMouseEnter={() => setHover(id)}
                    onFocus={() => setHover(id)}
                    onBlur={() => setHover(null)}
                  >
                    <i className={s.key} style={{ height: `${m[s.key] ? Math.max(1.5, (m[s.key] / max) * 100) : 0}%` }} />
                    {hover === id && (
                      <span className="chart-tip" style={{ left: '50%', bottom: `calc(${(m[s.key] / max) * 100}% + 8px)` }}>
                        <b className="num">{money(m[s.key])}</b>
                        <span>
                          {s.label} · {monthLabel(m.month)}
                        </span>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="chart-x pair-x">
        {months.map((m) => (
          <span key={m.month}>{monthLabel(m.month, 'short')}</span>
        ))}
      </div>
      <NumbersTable
        head={['Month', 'Income', 'Expenses', 'Saved']}
        rows={months.map((m) => [monthLabel(m.month), money(m.income), money(m.expenses), formatMoney(m.income - m.expenses, currency, { compact: true, sign: true })])}
      />
    </div>
  );
}
