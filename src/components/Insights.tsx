import { useState } from 'react';
import { BarChart3, BriefcaseBusiness, CheckCircle2, Flame, Repeat, Smile, Timer } from 'lucide-react';
import { formatDuration, lastDays, today as todayKey } from '../lib/date';
import { habitStreak } from '../lib/habits';
import { focusBreakdown, focusSeries, habitRates, headline, jobsPerWeek, moodSeries, tasksSeries } from '../lib/insights';
import { useStore } from '../lib/store';
import { BarChart, HBars, MoodChart } from './Charts';
import { JOB_STATUS } from './Jobs';
import { MOODS } from './Panels';
import { Card, Segmented } from './ui';

type Range = 7 | 30 | 90;
const RANGE_KEY = 'daily-dashboard:insights-range';
const pct = (v: number) => `${Math.round(v * 100)}%`;

function change(now: number, before: number) {
  if (!before) return now ? 'new this period' : '';
  const d = Math.round(((now - before) / before) * 100);
  return d === 0 ? 'same as before' : `${d > 0 ? '↑' : '↓'} ${Math.abs(d)}% vs before`;
}

/** Insights tab: how your days are going, over the last week, month or quarter. */
export function Insights() {
  const s = useStore((x) => x);
  const t = todayKey();
  const [range, setRangeState] = useState<Range>(() => {
    try {
      const v = Number(localStorage.getItem(RANGE_KEY));
      return v === 7 || v === 90 ? v : 30;
    } catch {
      return 30;
    }
  });
  const setRange = (r: Range) => {
    setRangeState(r);
    try {
      localStorage.setItem(RANGE_KEY, String(r));
    } catch {
      /* optional */
    }
  };
  const [by, setBy] = useState<'task' | 'project'>('task');

  const days = lastDays(range, t);
  const h = headline(s, t, range);
  const breakdown = focusBreakdown(s, days, by);
  const habits = habitRates(s, t, range);
  const faces = MOODS.map((m) => m.face);
  const statusCounts = (Object.keys(JOB_STATUS) as (keyof typeof JOB_STATUS)[]).map((k) => [k, s.jobs.filter((j) => j.status === k).length] as const);
  const period = range === 7 ? 'last 7 days' : range === 30 ? 'last 30 days' : 'last 90 days';

  return (
    <main className="insights" aria-label="Insights">
      <div className="insights-bar">
        <h2>
          <BarChart3 size={18} /> Your {period}
        </h2>
        <Segmented
          label="Range"
          value={String(range) as '7' | '30' | '90'}
          onChange={(v) => setRange(Number(v) as Range)}
          options={[
            { value: '7', label: '7 days' },
            { value: '30', label: '30 days' },
            { value: '90', label: '90 days' },
          ]}
        />
      </div>

      <div className="insight-tiles">
        <Tile icon={<Timer size={18} />} label="Focus" value={formatDuration(h.focus)} sub={change(h.focus, h.focusBefore)} />
        <Tile icon={<CheckCircle2 size={18} />} label="Tasks done" value={String(h.tasks)} sub={change(h.tasks, h.tasksBefore)} />
        <Tile icon={<Repeat size={18} />} label="Habits kept" value={h.habits === null ? '—' : pct(h.habits)} sub={s.habits.length ? `${s.habits.length} habit${s.habits.length === 1 ? '' : 's'}` : 'No habits yet'} />
        <Tile icon={<Smile size={18} />} label="Average mood" value={h.mood === null ? '—' : faces[Math.round(h.mood) - 1]} sub={h.mood === null ? 'Set it in the evening review' : `${h.mood.toFixed(1)} out of 5`} />
        <Tile icon={<BriefcaseBusiness size={18} />} label="Jobs applied" value={String(h.jobs)} sub={`${s.jobs.length} in total`} />
      </div>

      <div className="insight-grid">
        <Card title="Focus per day" icon={<Timer size={16} />} meta={`${formatDuration(h.focus)} total`}>
          <BarChart data={focusSeries(s, days)} format={formatDuration} label="Focus minutes per day" unit="Focus" />
        </Card>
        <Card title="Tasks completed" icon={<CheckCircle2 size={16} />} meta={`${h.tasks} total`}>
          <BarChart data={tasksSeries(s, days, t)} format={(v) => String(v)} label="Tasks completed per day" unit="Tasks" />
        </Card>
        <Card
          title="Where your focus went"
          icon={<Timer size={16} />}
          actions={
            <Segmented
              label="Group by"
              value={by}
              onChange={setBy}
              options={[
                { value: 'task', label: 'Tasks' },
                { value: 'project', label: 'Projects' },
              ]}
            />
          }
        >
          <HBars
            rows={breakdown.rows.slice(0, 8).map((r) => ({ label: r.label, value: r.minutes }))}
            format={formatDuration}
            empty="Pick a task in the focus timer and finished sessions are credited to it here."
          />
          {breakdown.untracked > 0 && <p className="chart-note">Plus {formatDuration(breakdown.untracked)} not linked to a task.</p>}
        </Card>
        <Card title="Mood" icon={<Smile size={16} />} meta="From your evening reviews">
          {moodSeries(s, days, t).some((m) => m.value) ? (
            <MoodChart data={moodSeries(s, days, t)} faces={faces} />
          ) : (
            <p className="chart-empty">Pick a mood in the evening review (or the shutdown routine) and it shows up here.</p>
          )}
        </Card>
        <Card title="Habits" icon={<Repeat size={16} />} meta={`Share of days kept · ${period}`}>
          <HBars
            rows={habits.map((r) => {
              const habit = s.habits.find((x) => x.id === r.id)!;
              const streak = habitStreak(habit, t);
              return {
                label: r.name,
                value: r.rate,
                extra: streak > 1 ? (
                  <small className="hbar-streak">
                    <Flame size={10} /> {streak}
                  </small>
                ) : undefined,
              };
            })}
            format={pct}
            empty="Add a habit on the Today tab to see how often you keep it."
          />
        </Card>
        <Card title="Job applications" icon={<BriefcaseBusiness size={16} />} meta="Per week">
          <BarChart data={jobsPerWeek(s, t, 8)} format={(v) => String(v)} label="Job applications per week" unit="Applications" weekly />
          <div className="job-status-row">
            {statusCounts.map(([k, n]) => (
              <span key={k} className={`chip ${JOB_STATUS[k].chip}`}>
                {JOB_STATUS[k].label} <b className="num">{n}</b>
              </span>
            ))}
          </div>
        </Card>
      </div>
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
