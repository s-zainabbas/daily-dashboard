import { useEffect, useMemo, useState } from 'react';
import { CalendarPlus, ChevronLeft, ChevronRight, CircleCheck, ExternalLink, MapPin, StickyNote } from 'lucide-react';
import { addDays, dateKey, formatDuration, formatTime, fromKey, toMinutes, today as todayKey } from '../lib/date';
import { ensureCalendarRange, useAllEvents, useGcal } from '../lib/gcal';
import type { ShownEvent } from '../lib/google/calendar';
import { useNow } from '../lib/hooks';
import { actions, getState, useStore } from '../lib/store';
import type { DateKey } from '../lib/types';
import { mondayOf } from '../lib/week';
import { EventEditor } from './EventEditor';
import { Card, toast } from './ui';

/* ---------- Shared helpers ---------- */

const firstOfMonth = (d: DateKey) => `${d.slice(0, 7)}-01`;
const addMonths = (d: DateKey, n: number) => {
  const x = fromKey(firstOfMonth(d));
  x.setMonth(x.getMonth() + n);
  return dateKey(x);
};
const monthLabel = (d: DateKey) => fromKey(d).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
const WEEKDAYS = Array.from({ length: 7 }, (_, i) => fromKey(addDays('2024-01-01', i)).toLocaleDateString(undefined, { weekday: 'short' })); // 2024-01-01 is a Monday

/** Every day shown for a month, Monday-first, in whole weeks. */
export function monthGrid(month: DateKey, fixedRows = false): DateKey[] {
  const first = firstOfMonth(month);
  const start = mondayOf(first);
  const next = addMonths(first, 1);
  const days: DateKey[] = [];
  for (let d = start; days.length < 42 && (fixedRows || d < next || days.length % 7); d = addDays(d, 1)) days.push(d);
  return days;
}

/** Events per day, all-day first, then by start time. */
export function byDay(events: ShownEvent[], from: DateKey, to: DateKey) {
  const map = new Map<DateKey, ShownEvent[]>();
  for (const e of events) {
    if (e.date < from || e.date > to) continue;
    const list = map.get(e.date);
    if (list) list.push(e);
    else map.set(e.date, [e]);
  }
  for (const list of map.values()) list.sort((a, b) => (a.start ?? '').localeCompare(b.start ?? ''));
  return map;
}

/** Interviews open in Jobs, countdowns in their editor; everything else (yours or Google's) in the event editor. */
export function openShownEvent(e: ShownEvent, edit: (e: ShownEvent) => void) {
  if (e.jobId) {
    location.hash = 'jobs';
    setTimeout(() => window.dispatchEvent(new CustomEvent('dd:open-job', { detail: e.jobId })), 80);
  } else if (e.countdownId) {
    window.dispatchEvent(new CustomEvent('dd:open-countdown', { detail: e.countdownId }));
  } else edit(e);
}

const evColor = (e: ShownEvent) => e.google?.color ?? (e.jobId ? 'var(--warn)' : e.countdownId ? 'var(--ok)' : 'var(--accent)');

/** Load Google events for the days on screen. */
function useLoadRange(from: DateKey, to: DateKey) {
  const enabled = useGcal().enabled;
  useEffect(() => {
    if (enabled) void ensureCalendarRange(from, to);
  }, [from, to, enabled]);
}

/* ---------- Mini month: the calendar at the top of the Schedule card ---------- */

export function MiniMonth({ selected, onSelect }: { selected: DateKey; onSelect: (d: DateKey) => void }) {
  const t = dateKey(useNow(60_000));
  const events = useAllEvents();
  const [month, setMonth] = useState(() => firstOfMonth(selected));
  // Follow the selected day when it moves to another month (e.g. with the day arrows).
  useEffect(() => setMonth(firstOfMonth(selected)), [selected]);

  const days = useMemo(() => monthGrid(month, true), [month]);
  const map = useMemo(() => byDay(events, days[0], days[41]), [events, days]);
  useLoadRange(days[0], days[41]);

  return (
    <div className="mini-cal">
      <div className="mini-cal-head">
        <button className="icon-btn sm" onClick={() => setMonth(addMonths(month, -1))} aria-label="Previous month">
          <ChevronLeft size={15} />
        </button>
        <b>{monthLabel(month)}</b>
        <button className="icon-btn sm" onClick={() => setMonth(addMonths(month, 1))} aria-label="Next month">
          <ChevronRight size={15} />
        </button>
      </div>
      <div className="mini-cal-grid" role="grid" aria-label={monthLabel(month)}>
        {WEEKDAYS.map((w) => (
          <span key={w} className="mini-cal-wd" aria-hidden>
            {w.slice(0, 2)}
          </span>
        ))}
        {days.map((d) => {
          const list = map.get(d) ?? [];
          const colors = [...new Set(list.map(evColor))].slice(0, 3);
          return (
            <button
              key={d}
              className={`mini-cal-day ${d.slice(0, 7) !== month.slice(0, 7) ? 'out' : ''} ${d === t ? 'today' : ''} ${d === selected ? 'sel' : ''} ${d < t ? 'past' : ''}`}
              onClick={() => onSelect(d)}
              aria-pressed={d === selected}
              aria-label={`${fromKey(d).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}${list.length ? `, ${list.length} event${list.length === 1 ? '' : 's'}` : ''}`}
            >
              <span className="num">{fromKey(d).getDate()}</span>
              <i className="mini-cal-dots" aria-hidden>
                {colors.map((c) => (
                  <em key={c} style={{ background: c }} />
                ))}
              </i>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Planner strip: the next days after the one you're looking at ---------- */

export function UpcomingDays({ after, count = 7, onSelect }: { after: DateKey; count?: number; onSelect: (d: DateKey) => void }) {
  const t = todayKey();
  const events = useAllEvents();
  const tasks = useStore((s) => s.tasks);
  const use24h = useStore((s) => s.settings.use24h);
  const days = Array.from({ length: count }, (_, i) => addDays(after, i + 1));
  const map = useMemo(() => byDay(events, days[0], days[count - 1]), [events, days[0], count]); // eslint-disable-line react-hooks/exhaustive-deps
  useLoadRange(days[0], days[count - 1]);

  return (
    <div className="upcoming">
      <h3>{after === t ? 'Coming up' : `After ${fromKey(after).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}`}</h3>
      {days.map((d) => {
        const list = map.get(d) ?? [];
        const due = tasks.filter((x) => !x.done && x.dueDate === d).length;
        const date = fromKey(d);
        return (
          <button key={d} className="upcoming-day" onClick={() => onSelect(d)}>
            <span className="upcoming-date">
              <small>{d === addDays(t, 1) ? 'Tmrw' : date.toLocaleDateString(undefined, { weekday: 'short' })}</small>
              <b className="num">{date.getDate()}</b>
            </span>
            <span className="upcoming-list">
              {list.length === 0 && !due && <span className="upcoming-free">Nothing planned</span>}
              {list.slice(0, 3).map((e) => (
                <span key={e.id} className="upcoming-ev">
                  <i style={{ background: evColor(e) }} />
                  <time className="num">{e.start ? formatTime(e.start, use24h) : 'All day'}</time>
                  <span className="truncate">{e.title}</span>
                </span>
              ))}
              {(list.length > 3 || due > 0) && (
                <span className="upcoming-more">
                  {list.length > 3 && `+${list.length - 3} more`}
                  {list.length > 3 && due > 0 && ' · '}
                  {due > 0 && `${due} task${due === 1 ? '' : 's'} due`}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Month view: the full calendar on the Schedule tab ---------- */

const MAX_CHIPS = 3;

export function MonthView() {
  const t = dateKey(useNow(60_000));
  const events = useAllEvents();
  const tasks = useStore((s) => s.tasks);
  const use24h = useStore((s) => s.settings.use24h);
  const gcal = useGcal();
  const [month, setMonth] = useState(() => firstOfMonth(todayKey()));
  const [selected, setSelected] = useState(() => todayKey());
  const [editing, setEditing] = useState<ShownEvent | 'new' | null>(null);
  const [newDate, setNewDate] = useState(selected);
  const own = useStore((s) => s.events);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropOn, setDropOn] = useState<DateKey | null>(null);
  // Only your own one-off events move by dragging (repeats, Google and interviews open instead).
  const movable = (e: ShownEvent) => !e.google && !e.jobId && !e.seriesId && !e.countdownId && own.some((x) => x.id === e.id);
  const moveTo = (d: DateKey) => {
    const ev = own.find((x) => x.id === dragId);
    setDragId(null);
    setDropOn(null);
    if (!ev || ev.date === d) return;
    const from = ev.date;
    actions.updateEvent(ev.id, { date: d });
    pick(d);
    toast(`Moved “${ev.title}” to ${fromKey(d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}`, { label: 'Undo', run: () => actions.updateEvent(ev.id, { date: from }) });
  };

  const days = useMemo(() => monthGrid(month), [month]);
  const map = useMemo(() => byDay(events, days[0], days[days.length - 1]), [events, days]);
  useLoadRange(days[0], days[days.length - 1]);

  // Search can open one of your events here too.
  useEffect(() => {
    const on = (e: Event) => {
      const ev = getState().events.find((x) => x.id === (e as CustomEvent<string>).detail);
      if (!ev) return;
      setMonth(firstOfMonth(ev.date));
      setSelected(ev.date);
      setEditing(ev);
    };
    window.addEventListener('dd:open-event', on);
    return () => window.removeEventListener('dd:open-event', on);
  }, []);

  const pick = (d: DateKey) => {
    setSelected(d);
    if (d.slice(0, 7) !== month.slice(0, 7)) setMonth(firstOfMonth(d));
  };
  const addOn = (d: DateKey) => {
    setNewDate(d);
    setEditing('new');
  };

  const inMonth = events.filter((e) => e.date.slice(0, 7) === month.slice(0, 7));
  const dayEvents = map.get(selected) ?? events.filter((e) => e.date === selected).sort((a, b) => (a.start ?? '').localeCompare(b.start ?? ''));
  const dayTasks = tasks.filter((x) => !x.done && x.dueDate === selected);
  const fmt = (x: string) => formatTime(x, use24h);
  const selDate = fromKey(selected);

  return (
    <main className="month-planner" aria-label="Month">
      <Card
        title={monthLabel(month)}
        meta={`${inMonth.length} event${inMonth.length === 1 ? '' : 's'}${gcal.enabled && gcal.status === 'loading' ? ' · syncing…' : ''}`}
        className="month-card"
        actions={
          <>
            <button className="icon-btn sm" onClick={() => setMonth(addMonths(month, -1))} aria-label="Previous month">
              <ChevronLeft size={16} />
            </button>
            {month.slice(0, 7) !== t.slice(0, 7) && (
              <button
                className="btn sm ghost"
                onClick={() => {
                  setMonth(firstOfMonth(t));
                  setSelected(t);
                }}
              >
                Today
              </button>
            )}
            <button className="icon-btn sm" onClick={() => setMonth(addMonths(month, 1))} aria-label="Next month">
              <ChevronRight size={16} />
            </button>
            <button className="icon-btn sm" onClick={() => addOn(selected)} aria-label="New event" title="New event">
              <CalendarPlus size={15} />
            </button>
          </>
        }
      >
        <div className="mon">
          <div className="mon-head">
            {WEEKDAYS.map((w) => (
              <span key={w}>{w}</span>
            ))}
          </div>
          <div className="mon-grid" style={{ gridTemplateRows: `repeat(${days.length / 7}, minmax(0, 1fr))` }}>
            {days.map((d) => {
              const list = map.get(d) ?? [];
              const out = d.slice(0, 7) !== month.slice(0, 7);
              const due = tasks.filter((x) => !x.done && x.dueDate === d).length;
              return (
                <div
                  key={d}
                  role="button"
                  tabIndex={0}
                  className={`mon-day ${out ? 'out' : ''} ${d === t ? 'today' : ''} ${d === selected ? 'sel' : ''} ${d < t ? 'past' : ''} ${dropOn === d ? 'drop' : ''}`}
                  onDragOver={(e) => {
                    if (!dragId) return;
                    e.preventDefault();
                    if (dropOn !== d) setDropOn(d);
                  }}
                  onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setDropOn((x) => (x === d ? null : x))}
                  onDrop={(e) => {
                    e.preventDefault();
                    moveTo(d);
                  }}
                  onClick={() => pick(d)}
                  onDoubleClick={(e) => !(e.target as HTMLElement).closest('.mon-ev') && addOn(d)}
                  onKeyDown={(e) => {
                    if (e.target !== e.currentTarget) return;
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      pick(d);
                    }
                  }}
                  aria-label={`${fromKey(d).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}, ${list.length} event${list.length === 1 ? '' : 's'}`}
                >
                  <span className="mon-num num">
                    <b>
                      {fromKey(d).getDate()}
                      {fromKey(d).getDate() === 1 && <span className="mon-m"> {fromKey(d).toLocaleDateString(undefined, { month: 'short' })}</span>}
                    </b>
                    {due > 0 && (
                      <small className="mon-due" title={`${due} task${due === 1 ? '' : 's'} due`}>
                        <CircleCheck size={10} /> {due}
                      </small>
                    )}
                  </span>
                  <span className="mon-evs">
                    {list.slice(0, MAX_CHIPS).map((e) => (
                      <button
                        key={e.id}
                        className={`mon-ev ${e.start ? 'timed' : 'allday'} ${dragId === e.id ? 'dragging' : ''}`}
                        draggable={movable(e)}
                        onDragStart={(ev) => {
                          ev.dataTransfer.effectAllowed = 'move';
                          ev.dataTransfer.setData('text/plain', e.title);
                          setDragId(e.id);
                        }}
                        onDragEnd={() => {
                          setDragId(null);
                          setDropOn(null);
                        }}
                        style={{ ['--ev' as string]: evColor(e) }}
                        title={`${e.title}${e.start ? ` · ${fmt(e.start)}${e.end ? `–${fmt(e.end)}` : ''}` : ' · all day'}${e.google ? ` · ${e.google.calendar}` : ''}`}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          pick(d);
                          openShownEvent(e, setEditing);
                        }}
                      >
                        {e.start && <time className="num">{fmt(e.start)}</time>}
                        <span>{e.title}</span>
                      </button>
                    ))}
                    {list.length > MAX_CHIPS && <span className="mon-more">+{list.length - MAX_CHIPS} more</span>}
                  </span>
                  <span className="mon-dots" aria-hidden>
                    {list.slice(0, 4).map((e) => (
                      <em key={e.id} style={{ background: evColor(e) }} />
                    ))}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        <p className="wk-help">Click a day to see everything on it. Double-click a day to add an event, or drag your events to another day.</p>
      </Card>

      <Card
        title={selected === t ? 'Today' : selDate.toLocaleDateString(undefined, { weekday: 'long' })}
        meta={selDate.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}
        className="month-day"
        actions={
          <button className="icon-btn sm" onClick={() => addOn(selected)} aria-label="Add event on this day" title="Add event">
            <CalendarPlus size={15} />
          </button>
        }
      >
        {dayEvents.length === 0 ? (
          <p className="chart-empty">Nothing scheduled. Double-click the day or use + to add something.</p>
        ) : (
          <div className="day-list">
            {dayEvents.map((e) => {
              const len = e.start && e.end ? toMinutes(e.end) - toMinutes(e.start) : 0;
              return (
                <button key={e.id} className="day-ev" style={{ ['--ev' as string]: evColor(e) }} onClick={() => openShownEvent(e, setEditing)}>
                  <time className="num">
                    {e.start ? fmt(e.start) : 'All day'}
                    {e.end && <small>{fmt(e.end)}</small>}
                  </time>
                  <span className="day-ev-body">
                    <b>{e.title}</b>
                    {e.google && (
                      <small className="day-ev-cal">
                        {e.google.calendar} <ExternalLink size={10} />
                      </small>
                    )}
                    {e.jobId && <small className="day-ev-cal">Interview · Jobs</small>}
                    {e.location && (
                      <small>
                        <MapPin size={11} /> {e.location}
                      </small>
                    )}
                    {e.notes && (
                      <small className="day-ev-notes">
                        <StickyNote size={11} /> {e.notes}
                      </small>
                    )}
                  </span>
                  {len > 0 && <span className="badge num">{formatDuration(len)}</span>}
                </button>
              );
            })}
          </div>
        )}
        {dayTasks.length > 0 && (
          <div className="day-tasks">
            <h3>Due</h3>
            {dayTasks.map((x) => (
              <div key={x.id} className={`day-task ${x.priority}`}>
                <CircleCheck size={13} /> <span>{x.title}</span>
              </div>
            ))}
          </div>
        )}
        <UpcomingDays after={selected} count={5} onSelect={pick} />
      </Card>

      <EventEditor event={editing} defaultDate={editing === 'new' ? newDate : selected} onClose={() => setEditing(null)} />
    </main>
  );
}
