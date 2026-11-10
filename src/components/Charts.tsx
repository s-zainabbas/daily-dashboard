import { useState, type ReactNode } from 'react';
import { fromKey } from '../lib/date';

/**
 * Small single-series charts in plain HTML: thin bars rounded at the data end, a quiet baseline,
 * a hover / focus tooltip on every mark, and a "Show numbers" table so nothing is chart-only.
 */

const dayLabel = (d: string) => fromKey(d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const shortDay = (d: string) => fromKey(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

function NumbersTable({ rows, head }: { rows: [string, string][]; head: [string, string] }) {
  return (
    <details className="chart-table">
      <summary>Show numbers</summary>
      <table>
        <thead>
          <tr>
            <th>{head[0]}</th>
            <th>{head[1]}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([a, b]) => (
            <tr key={a}>
              <td>{a}</td>
              <td className="num">{b}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

/** Vertical bars over days (or weeks). */
export function BarChart({ data, format, label, unit = 'Value', weekly = false }: {
  data: { date: string; value: number }[];
  format: (v: number) => string;
  label: string;
  unit?: string;
  weekly?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const name = (d: string) => (weekly ? `Week of ${shortDay(d)}` : dayLabel(d));
  const total = data.reduce((a, d) => a + d.value, 0);
  return (
    <div className="chart">
      <div className="chart-plot" role="img" aria-label={`${label}: ${format(total)} in total over ${data.length} ${weekly ? 'weeks' : 'days'}`}>
        <span className="chart-max num">{format(max)}</span>
        <div className="bars" onMouseLeave={() => setHover(null)} style={{ ['--gap' as string]: data.length > 45 ? '1px' : '2px' }}>
          {data.map((d, i) => (
            <div
              key={d.date}
              className={`bar-slot ${hover === i ? 'hover' : ''}`}
              tabIndex={0}
              aria-label={`${name(d.date)}: ${format(d.value)}`}
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
            >
              <i style={{ height: d.value ? `max(3px, ${(d.value / max) * 100}%)` : 0 }} />
            </div>
          ))}
          {hover !== null && (
            <div className="chart-tip" style={{ left: `${((hover + 0.5) / data.length) * 100}%` }}>
              <b className="num">{format(data[hover].value)}</b>
              <span>{name(data[hover].date)}</span>
            </div>
          )}
        </div>
      </div>
      <div className="chart-x num">
        <span>{shortDay(data[0].date)}</span>
        <span>{weekly ? 'This week' : 'Today'}</span>
      </div>
      <NumbersTable head={[weekly ? 'Week of' : 'Day', unit]} rows={data.map((d) => [weekly ? shortDay(d.date) : dayLabel(d.date), format(d.value)])} />
    </div>
  );
}

/** Mood (1–5) as dots joined by a line, with gaps on days you didn't record it. */
export function MoodChart({ data, faces }: { data: { date: string; value: number | null }[]; faces: string[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const n = data.length;
  const x = (i: number) => ((i + 0.5) / n) * 100;
  const y = (v: number) => 100 - ((v - 1) / 4) * 100;
  // Line segments only between neighbouring days that both have a mood.
  const segs: string[] = [];
  data.forEach((d, i) => {
    const prev = data[i - 1];
    if (d.value && prev?.value) segs.push(`M${x(i - 1)},${y(prev.value)} L${x(i)},${y(d.value)}`);
  });
  const recorded = data.filter((d) => d.value);
  return (
    <div className="chart">
      <div className="chart-plot mood-plot" role="img" aria-label={`Mood on ${recorded.length} of ${n} days`} onMouseLeave={() => setHover(null)}>
        <div className="mood-axis" aria-hidden>
          <span>{faces[4]}</span>
          <span>{faces[2]}</span>
          <span>{faces[0]}</span>
        </div>
        <div className="mood-area">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
            {[0, 50, 100].map((g) => (
              <line key={g} x1="0" x2="100" y1={g} y2={g} className="grid" vectorEffect="non-scaling-stroke" />
            ))}
            <path d={segs.join(' ')} className="mood-line" vectorEffect="non-scaling-stroke" />
          </svg>
          {data.map((d, i) =>
            d.value ? (
              <button
                key={d.date}
                className={`mood-dot ${hover === i ? 'hover' : ''}`}
                style={{ left: `${x(i)}%`, top: `${y(d.value)}%` }}
                aria-label={`${dayLabel(d.date)}: ${faces[d.value - 1]}`}
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
              />
            ) : null,
          )}
          {hover !== null && data[hover].value && (
            <div className="chart-tip" style={{ left: `${x(hover)}%`, top: `${y(data[hover].value!)}%` }}>
              <b>{faces[data[hover].value! - 1]}</b>
              <span>{dayLabel(data[hover].date)}</span>
            </div>
          )}
        </div>
      </div>
      <div className="chart-x num mood-x">
        <span>{shortDay(data[0].date)}</span>
        <span>Today</span>
      </div>
      {recorded.length > 0 && <NumbersTable head={['Day', 'Mood']} rows={recorded.map((d) => [dayLabel(d.date), faces[d.value! - 1]])} />}
    </div>
  );
}

/** Horizontal bars for a ranked list (habits, where time went). */
export function HBars({ rows, format, empty }: { rows: { label: string; value: number; extra?: ReactNode }[]; format: (v: number) => string; empty: ReactNode }) {
  if (!rows.length) return <p className="chart-empty">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.value), 0.0001);
  return (
    <ul className="hbars">
      {rows.map((r) => (
        <li key={r.label} title={`${r.label}: ${format(r.value)}`}>
          <span className="hbar-label">{r.label}</span>
          <span className="hbar-track">
            <i style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} />
          </span>
          <span className="hbar-value num">
            {format(r.value)}
            {r.extra}
          </span>
        </li>
      ))}
    </ul>
  );
}
