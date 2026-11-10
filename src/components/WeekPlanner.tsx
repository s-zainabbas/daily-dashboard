import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CalendarDays, CalendarRange, ChevronLeft, ChevronRight, GripVertical } from 'lucide-react';
import { addDays, formatDuration, formatTime, fromKey, fromMinutes, nowMinutes, toMinutes, today as todayKey } from '../lib/date';
import { useAllEvents } from '../lib/gcal';
import type { ShownEvent } from '../lib/google/calendar';
import { useNow } from '../lib/hooks';
import { actions, getState, useStore } from '../lib/store';
import type { CalEvent, Task } from '../lib/types';
import { mondayOf } from '../lib/week';
import { EventEditor } from './Schedule';
import { Card, Segmented, toast } from './ui';

const MODE_KEY = 'daily-dashboard:schedule-mode';
const HOUR = 44; // px per hour

/** Schedule tab: switch between the day agenda and a 7-day planner. */
export function ScheduleTab({ dayView }: { dayView: ReactNode }) {
  const [mode, setModeState] = useState<'day' | 'week'>(() => {
    try {
      return localStorage.getItem(MODE_KEY) === 'week' ? 'week' : 'day';
    } catch {
      return 'day';
    }
  });
  const setMode = (m: 'day' | 'week') => {
    setModeState(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      /* optional */
    }
  };
  return (
    <div className="schedule-tab">
      <div className="schedule-switch">
        <Segmented
          label="Schedule view"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'day', label: <><CalendarDays size={13} /> Day</> },
            { value: 'week', label: <><CalendarRange size={13} /> Week</> },
          ]}
        />
      </div>
      {mode === 'day' ? dayView : <WeekPlanner />}
    </div>
  );
}

/** Put events side by side when they overlap. */
function lanes(evs: ShownEvent[]) {
  const sorted = [...evs].sort((a, b) => a.start!.localeCompare(b.start!));
  const end = (e: ShownEvent) => (e.end ? toMinutes(e.end) : toMinutes(e.start!) + 30);
  const out = new Map<string, { lane: number; of: number }>();
  let group: ShownEvent[] = [];
  let groupEnd = -1;
  const flush = () => {
    const laneEnds: number[] = [];
    const assigned = group.map((e) => {
      let l = laneEnds.findIndex((x) => x <= toMinutes(e.start!));
      if (l < 0) l = laneEnds.length;
      laneEnds[l] = end(e);
      return [e.id, l] as const;
    });
    for (const [id, l] of assigned) out.set(id, { lane: l, of: laneEnds.length });
    group = [];
  };
  for (const e of sorted) {
    if (toMinutes(e.start!) >= groupEnd && group.length) flush();
    group.push(e);
    groupEnd = Math.max(groupEnd, end(e));
  }
  if (group.length) flush();
  return out;
}

type Drag = { kind: 'task'; task: Task } | { kind: 'event'; event: CalEvent; length: number };

function WeekPlanner() {
  const t = todayKey();
  const now = useNow(60_000);
  const events = useAllEvents();
  const tasks = useStore((s) => s.tasks);
  const own = useStore((s) => s.events);
  const ownIds = useMemo(() => new Set(own.map((e) => e.id)), [own]);
  const use24h = useStore((s) => s.settings.use24h);
  const [weekStart, setWeekStart] = useState(() => mondayOf(t));
  const [editing, setEditing] = useState<CalEvent | 'new' | null>(null);
  const [newAt, setNewAt] = useState<{ date: string; start: string }>({ date: t, start: '09:00' });
  const [drag, setDrag] = useState<Drag | null>(null);
  const [hint, setHint] = useState<{ date: string; min: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekEvents = events.filter((e) => e.date >= days[0] && e.date <= days[6]);
  const timed = weekEvents.filter((e) => e.start);
  const startHour = Math.min(7, ...timed.map((e) => Math.floor(toMinutes(e.start!) / 60)));
  const endHour = Math.max(22, ...timed.map((e) => Math.ceil((e.end ? toMinutes(e.end) : toMinutes(e.start!) + 30) / 60)));
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const y = (min: number) => ((min - startHour * 60) / 60) * HOUR;

  // Search can open one of your events here too.
  useEffect(() => {
    const on = (e: Event) => {
      const ev = getState().events.find((x) => x.id === (e as CustomEvent<string>).detail);
      if (!ev) return;
      setWeekStart(mondayOf(ev.date));
      setEditing(ev);
    };
    window.addEventListener('dd:open-event', on);
    return () => window.removeEventListener('dd:open-event', on);
  }, []);

  // Open on the current time of day, not at 7am.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = Math.max(0, y(nowMinutes()) - 120);
  }, []);

  const toSchedule = tasks
    .filter((x) => !x.done && !x.waitingOn && (!x.dueDate || x.dueDate <= days[6]))
    .sort((a, b) => (a.dueDate ?? '9').localeCompare(b.dueDate ?? '9') || (a.priority === 'high' ? -1 : 0) - (b.priority === 'high' ? -1 : 0))
    .slice(0, 30);

  const minuteAt = (e: React.MouseEvent | React.DragEvent, col: HTMLElement) => {
    const r = col.getBoundingClientRect();
    const raw = startHour * 60 + ((e.clientY - r.top) / HOUR) * 60;
    return Math.max(0, Math.min(23 * 60 + 30, Math.round(raw / 15) * 15));
  };

  function dropAt(date: string, min: number) {
    if (!drag) return;
    if (drag.kind === 'task') {
      const length = drag.task.estimate ?? 60;
      const start = fromMinutes(min);
      const end = fromMinutes(Math.min(min + length, 23 * 60 + 59));
      actions.addEvent({ title: drag.task.title, date, start, end, notes: 'Time blocked from your task list' });
      if (!drag.task.dueDate || drag.task.dueDate > date) actions.updateTask(drag.task.id, { dueDate: date });
      toast(`Blocked ${formatTime(start, use24h)}–${formatTime(end, use24h)} ${fromKey(date).toLocaleDateString(undefined, { weekday: 'short' })} for “${drag.task.title}”`);
    } else {
      const before = { date: drag.event.date, start: drag.event.start, end: drag.event.end };
      actions.updateEvent(drag.event.id, { date, start: fromMinutes(min), end: fromMinutes(Math.min(min + drag.length, 23 * 60 + 59)) });
      toast(`Moved “${drag.event.title}”`, { label: 'Undo', run: () => actions.updateEvent(drag.event.id, before) });
    }
    setDrag(null);
    setHint(null);
  }

  const openEvent = (e: ShownEvent) => {
    if (e.jobId) {
      location.hash = 'jobs';
      setTimeout(() => window.dispatchEvent(new CustomEvent('dd:open-job', { detail: e.jobId })), 80);
    } else if (e.google) {
      if (e.google.link) window.open(e.google.link, '_blank', 'noopener');
    } else setEditing(e);
  };

  const range = `${fromKey(days[0]).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${fromKey(days[6]).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;

  return (
    <main className="week-planner" aria-label="Week">
      <Card
        title={range}
        icon={<CalendarRange size={16} />}
        meta={`${timed.length} event${timed.length === 1 ? '' : 's'}`}
        className="week-card"
        actions={
          <>
            <button className="icon-btn sm" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Previous week">
              <ChevronLeft size={16} />
            </button>
            {weekStart !== mondayOf(t) && (
              <button className="btn sm ghost" onClick={() => setWeekStart(mondayOf(t))}>
                This week
              </button>
            )}
            <button className="icon-btn sm" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Next week">
              <ChevronRight size={16} />
            </button>
          </>
        }
      >
        <div className="wk">
          <div className="wk-head">
            <span />
            {days.map((d) => (
              <span key={d} className={d === t ? 'today' : ''}>
                <small>{fromKey(d).toLocaleDateString(undefined, { weekday: 'short' })}</small>
                <b className="num">{fromKey(d).getDate()}</b>
              </span>
            ))}
          </div>
          <div className="wk-allday">
            <span className="wk-label">All day</span>
            {days.map((d) => (
              <div key={d}>
                {weekEvents
                  .filter((e) => e.date === d && !e.start)
                  .map((e) => (
                    <button key={e.id} className="wk-chip" style={e.google?.color ? { borderLeftColor: e.google.color } : undefined} onClick={() => openEvent(e)} title={e.title}>
                      {e.title}
                    </button>
                  ))}
              </div>
            ))}
          </div>
          <div className="wk-scroll" ref={scrollRef}>
            <div className="wk-body" style={{ height: hours.length * HOUR }}>
              <div className="wk-hours">
                {hours.map((h) => (
                  <span key={h} style={{ top: (h - startHour) * HOUR }} className="num">
                    {formatTime(fromMinutes(h * 60), use24h)}
                  </span>
                ))}
              </div>
              {days.map((d) => {
                const dayEvents = timed.filter((e) => e.date === d);
                const lane = lanes(dayEvents);
                return (
                  <div
                    key={d}
                    className={`wk-col ${d === t ? 'today' : ''} ${d < t ? 'past' : ''}`}
                    onDoubleClick={(e) => {
                      if ((e.target as HTMLElement).closest('.wk-ev')) return;
                      setNewAt({ date: d, start: fromMinutes(minuteAt(e, e.currentTarget)) });
                      setEditing('new');
                    }}
                    onDragOver={(e) => {
                      if (!drag) return;
                      e.preventDefault();
                      const min = minuteAt(e, e.currentTarget);
                      if (hint?.date !== d || hint.min !== min) setHint({ date: d, min });
                    }}
                    onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setHint(null)}
                    onDrop={(e) => {
                      e.preventDefault();
                      dropAt(d, minuteAt(e, e.currentTarget));
                    }}
                  >
                    {hours.map((h) => (
                      <i key={h} className="wk-line" style={{ top: (h - startHour) * HOUR }} />
                    ))}
                    {d === t && <i className="wk-now" style={{ top: y(nowMinutes(now)) }} />}
                    {hint?.date === d && drag && (
                      <div className="wk-drop" style={{ top: y(hint.min), height: ((drag.kind === 'task' ? drag.task.estimate ?? 60 : drag.length) / 60) * HOUR }}>
                        {formatTime(fromMinutes(hint.min), use24h)}
                      </div>
                    )}
                    {dayEvents.map((e) => {
                      const s = toMinutes(e.start!);
                      const end = e.end ? toMinutes(e.end) : s + 30;
                      const l = lane.get(e.id) ?? { lane: 0, of: 1 };
                      const mine = ownIds.has(e.id);
                      return (
                        <button
                          key={e.id}
                          className={`wk-ev ${e.google ? 'google' : ''} ${e.jobId ? 'job' : ''} ${end <= nowMinutes(now) && d <= t ? 'done' : ''}`}
                          style={{
                            top: y(s),
                            height: Math.max(18, ((end - s) / 60) * HOUR - 2),
                            left: `calc(${(l.lane / l.of) * 100}% + 2px)`,
                            width: `calc(${100 / l.of}% - 4px)`,
                            ...(e.google?.color ? { ['--ev' as string]: e.google.color } : {}),
                          }}
                          draggable={mine}
                          onDragStart={(ev) => {
                            ev.dataTransfer.effectAllowed = 'move';
                            ev.dataTransfer.setData('text/plain', e.title);
                            setDrag({ kind: 'event', event: e, length: end - s });
                          }}
                          onDragEnd={() => {
                            setDrag(null);
                            setHint(null);
                          }}
                          onClick={() => openEvent(e)}
                          title={`${e.title} · ${formatTime(e.start!, use24h)}${e.end ? `–${formatTime(e.end, use24h)}` : ''}`}
                        >
                          <b>{e.title}</b>
                          {end - s >= 45 && (
                            <small className="num">
                              {formatTime(e.start!, use24h)}
                              {e.end ? `–${formatTime(e.end, use24h)}` : ''}
                            </small>
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <p className="wk-help">Double-click a time to add an event. Drag a task from the list onto the calendar to block time for it; drag your own events to move them.</p>
        <EventEditor event={editing} defaultDate={editing === 'new' ? newAt.date : t} defaultStart={editing === 'new' ? newAt.start : undefined} onClose={() => setEditing(null)} />
      </Card>

      <Card title="To schedule" meta={toSchedule.length ? `${toSchedule.length}` : undefined} className="wk-tasks">
        {toSchedule.length === 0 ? (
          <p className="chart-empty">Nothing waiting. Tasks due this week (or with no date) show up here to drag onto the calendar.</p>
        ) : (
          <ul>
            {toSchedule.map((x) => (
              <li
                key={x.id}
                draggable
                className={drag?.kind === 'task' && drag.task.id === x.id ? 'dragging' : ''}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'copy';
                  e.dataTransfer.setData('text/plain', x.title);
                  setDrag({ kind: 'task', task: x });
                }}
                onDragEnd={() => {
                  setDrag(null);
                  setHint(null);
                }}
              >
                <GripVertical size={13} />
                <span>{x.title}</span>
                <small className="num">
                  {x.estimate ? formatDuration(x.estimate) : '1h'}
                  {x.dueDate ? ` · ${x.dueDate < t ? 'overdue' : fromKey(x.dueDate).toLocaleDateString(undefined, { weekday: 'short' })}` : ''}
                </small>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </main>
  );
}

