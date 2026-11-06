import { useMemo } from 'react';
import { CalendarClock, Timer } from 'lucide-react';
import { dateKey, formatDuration, formatTime, lastDays, nowMinutes, toMinutes, today } from '../lib/date';
import { useNow } from '../lib/hooks';
import { useStore } from '../lib/store';
import type { CalEvent, Task } from '../lib/types';
import { Ring } from './ui';

export function todayTaskStats(tasks: Task[], t = today()) {
  const doneToday = tasks.filter((x) => x.done && x.completedAt && dateKey(new Date(x.completedAt)) === t).length;
  const open = tasks.filter((x) => !x.done && !x.waitingOn && x.dueDate && x.dueDate <= t);
  const overdue = open.filter((x) => x.dueDate! < t).length;
  return { doneToday, open: open.length, overdue, total: doneToday + open.length };
}

export function currentAndNext(events: CalEvent[], now = new Date()) {
  const t = dateKey(now);
  const m = nowMinutes(now);
  const timed = events.filter((e) => e.date === t && e.start).sort((a, b) => a.start!.localeCompare(b.start!));
  const current = timed.find((e) => toMinutes(e.start!) <= m && m < toMinutes(e.end ?? e.start!) + (e.end ? 0 : 30));
  const next = timed.find((e) => toMinutes(e.start!) > m);
  return { current, next, m };
}

export function Stats() {
  const now = useNow(30_000);
  const tasks = useStore((s) => s.tasks);
  const events = useStore((s) => s.events);
  const habits = useStore((s) => s.habits);
  const focus = useStore((s) => s.focus);
  const use24h = useStore((s) => s.settings.use24h);
  const t = dateKey(now);

  const ts = useMemo(() => todayTaskStats(tasks, t), [tasks, t]);
  const { current, next, m } = useMemo(() => currentAndNext(events, now), [events, now]);
  const habitsDone = habits.filter((h) => h.history[t]).length;
  const week = lastDays(7, t).map((d) => focus[d]?.minutes ?? 0);
  const maxWeek = Math.max(60, ...week);
  const f = focus[t];

  return (
    <div className="stats">
      <div className="card stat">
        <Ring value={ts.total ? ts.doneToday / ts.total : 0}>{ts.total ? `${Math.round((ts.doneToday / ts.total) * 100)}%` : ''}</Ring>
        <div>
          <div className="label">Today’s tasks</div>
          <div className="value num">
            {ts.doneToday}
            <small> / {ts.total}</small>
          </div>
          <div className="sub">{ts.total === 0 ? 'Nothing due today' : ts.open === 0 ? 'All clear — nice work' : `${ts.open} left${ts.overdue ? ` · ${ts.overdue} overdue` : ''}`}</div>
        </div>
      </div>

      <div className="card stat">
        <div className="stat-icon">
          <CalendarClock size={20} />
        </div>
        <div>
          <div className="label">{current ? 'Happening now' : 'Next up'}</div>
          <div className="value" style={{ fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {current?.title ?? next?.title ?? 'Free for the day'}
          </div>
          <div className="sub num">
            {current
              ? current.end
                ? `Ends in ${formatDuration(toMinutes(current.end) - m)}`
                : 'In progress'
              : next
                ? `${formatTime(next.start!, use24h)} · in ${formatDuration(toMinutes(next.start!) - m)}`
                : 'No more events today'}
          </div>
        </div>
      </div>

      <div className="card stat">
        <div className="stat-icon">
          <Timer size={20} />
        </div>
        <div style={{ flex: 1 }}>
          <div className="label">Focus today</div>
          <div className="value num">{formatDuration(f?.minutes ?? 0)}</div>
          <div className="sub">
            {f?.sessions ?? 0} session{f?.sessions === 1 ? '' : 's'}
          </div>
        </div>
        <div className="spark" aria-label="Focus minutes over the last 7 days">
          {week.map((v, i) => (
            <i key={i} className={v ? 'on' : ''} style={{ height: `${Math.max(10, (v / maxWeek) * 100)}%`, opacity: i === 6 ? 1 : 0.55 }} />
          ))}
        </div>
      </div>

      <div className="card stat">
        <Ring value={habits.length ? habitsDone / habits.length : 0}>{habits.length ? `${habitsDone}/${habits.length}` : ''}</Ring>
        <div>
          <div className="label">Habits</div>
          <div className="value num">
            {habitsDone}
            <small> / {habits.length} today</small>
          </div>
          <div className="sub">{!habits.length ? 'Add one to build momentum' : habitsDone === habits.length ? 'Perfect day so far' : `${habits.length - habitsDone} to go`}</div>
        </div>
      </div>
    </div>
  );
}
