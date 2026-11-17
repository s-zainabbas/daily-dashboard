import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Wand2, CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, ExternalLink, MapPin, RefreshCw, StickyNote } from 'lucide-react';
import { addDays, dateKey, formatDuration, formatTime, fromKey, fromMinutes, nowMinutes, toMinutes, today } from '../lib/date';
import { useNow } from '../lib/hooks';
import { getState, useStore } from '../lib/store';
import { connectCalendar, refreshCalendar, useAllEvents, useGcal } from '../lib/gcal';
import type { ShownEvent } from '../lib/google/calendar';
import { useDriveSync } from '../lib/sync/driveSync';
import type { CalEvent } from '../lib/types';
import { Card, Empty } from './ui';
import { MiniMonth, openShownEvent, UpcomingDays } from './Calendar';
import { EventEditor } from './EventEditor';
import { openAutoPlan } from './AutoPlan';
import { workload } from '../lib/autoplan';
import { freeMinutes } from '../lib/plan';

const endOf = (e: CalEvent) => (e.end ? toMinutes(e.end) : toMinutes(e.start!) + 30);

const evColor = (e: ShownEvent) => (e.google?.color ? ({ borderLeftColor: e.google.color } as const) : undefined);

function GoogleTag({ e }: { e: ShownEvent }) {
  return (
    <div className="ev-sub gcal-tag">
      <span>
        <i style={{ background: e.google!.color ?? 'var(--accent)' }} /> {e.google!.calendar} <ExternalLink size={10} />
      </span>
    </div>
  );
}

export function Schedule({ editRequest = 0, onRequestHandled }: { editRequest?: number; onRequestHandled?: () => void }) {
  const now = useNow(30_000);
  const events = useAllEvents();
  const gcal = useGcal();
  const account = useDriveSync().account;
  const use24h = useStore((s) => s.settings.use24h);
  const [day, setDay] = useState(today);
  const [editing, setEditing] = useState<ShownEvent | 'new' | null>(null);
  // Search can open one of your events: jump to its day and open it.
  useEffect(() => {
    const on = (e: Event) => {
      const ev = getState().events.find((x) => x.id === (e as CustomEvent<string>).detail);
      if (!ev) return;
      setDay(ev.date);
      setEditing(ev);
    };
    window.addEventListener('dd:open-event', on);
    return () => window.removeEventListener('dd:open-event', on);
  }, []);

  // E / the command menu ask for a new event. Also runs on mount, after switching to a tab that has this panel.
  useEffect(() => {
    if (!editRequest) return;
    setEditing('new');
    onRequestHandled?.();
  }, [editRequest, onRequestHandled]);

  const open = (e: ShownEvent) => openShownEvent(e, setEditing);

  const t = dateKey(now);
  const isToday = day === t;
  const m = isToday ? nowMinutes(now) : day < t ? 1440 : -1;
  const fmt = (x: string) => formatTime(x, use24h);

  const { allDay, timed } = useMemo(() => {
    const list = events.filter((e) => e.date === day);
    return {
      allDay: list.filter((e) => !e.start),
      timed: list.filter((e) => e.start).sort((a, b) => a.start!.localeCompare(b.start!)),
    };
  }, [events, day]);

  // Visible range for the day bar: at least 8am–8pm, stretched to fit events.
  const rangeStart = Math.min(8 * 60, ...timed.map((e) => Math.floor(toMinutes(e.start!) / 60) * 60));
  const rangeEnd = Math.max(20 * 60, ...timed.map((e) => Math.ceil(endOf(e) / 60) * 60));
  const pct = (v: number) => `${((Math.min(Math.max(v, rangeStart), rangeEnd) - rangeStart) / (rangeEnd - rangeStart)) * 100}%`;
  const remaining = timed.filter((e) => endOf(e) > m).length;

  const tasks = useStore((s) => s.tasks);
  const planned = isToday ? workload(tasks, events, t) : 0;
  const free = isToday ? freeMinutes(events, t, nowMinutes(now)) : 0;

  const dayTitle = isToday ? 'Today' : day === addDays(t, 1) ? 'Tomorrow' : day === addDays(t, -1) ? 'Yesterday' : fromKey(day).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

  let nowShown = !isToday;

  // When the card scrolls inside itself (Today tab), start at what's happening now rather than at 8am.
  const agendaRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const agenda = agendaRef.current;
    const card = agenda?.closest('section');
    const target = agenda?.querySelector<HTMLElement>('.ev.now, .now-line');
    if (!card || !target || card.scrollHeight <= card.clientHeight) return;
    // Scroll only as far as needed to show what's on now, so the calendar above stays in view when it can.
    const top = target.getBoundingClientRect().top - card.getBoundingClientRect().top + card.scrollTop;
    const want = top + target.offsetHeight + 96 - card.clientHeight;
    if (want > card.scrollTop) card.scrollTop = want;
  }, [day, timed.length]);

  return (
    <Card
      title="Schedule"
      icon={<CalendarDays size={16} />}
      meta={isToday ? (timed.length ? `${remaining} of ${timed.length} left` : undefined) : dayTitle}
      actions={
        <>
          <button className="icon-btn sm" onClick={() => setDay(addDays(day, -1))} aria-label="Previous day">
            <ChevronLeft size={16} />
          </button>
          {!isToday && (
            <button className="btn sm ghost" onClick={() => setDay(t)}>
              Today
            </button>
          )}
          <button className="icon-btn sm" onClick={() => setDay(addDays(day, 1))} aria-label="Next day">
            <ChevronRight size={16} />
          </button>
          {isToday && (
            <button className="icon-btn sm" onClick={openAutoPlan} aria-label="Auto-plan today" title="Auto-plan: fit today’s tasks around your events">
              <Wand2 size={15} />
            </button>
          )}
          <button className="icon-btn sm" onClick={() => setEditing('new')} aria-label="New event" title="New event">
            <CalendarPlus size={15} />
          </button>
        </>
      }
    >
      {gcal.enabled && (gcal.status === 'needs-auth' || gcal.status === 'error') && (
        <div className="gcal-alert" role="status">
          <span>{gcal.status === 'needs-auth' ? 'Google Calendar needs you to sign in again.' : gcal.error ?? 'Couldn’t load Google Calendar.'}</span>
          {gcal.status === 'error' && gcal.errorLink && (
            <a className="btn sm ghost" href={gcal.errorLink} target="_blank" rel="noopener noreferrer">
              Turn it on <ExternalLink size={12} />
            </a>
          )}
          <button
            className="btn sm ghost"
            data-google-signin
            onClick={() => (gcal.status === 'needs-auth' ? connectCalendar(account?.email) : refreshCalendar(true))}
          >
            <RefreshCw size={13} /> {gcal.status === 'needs-auth' ? 'Reconnect' : 'Retry'}
          </button>
        </div>
      )}
      <MiniMonth selected={day} onSelect={setDay} />
      <div className="day-label">
        {fromKey(day).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        {!isToday && <small>{dayTitle}</small>}
      </div>
      {isToday && planned > 0 && free >= 0 && planned > free && (
        <div className="overplan" role="status">
          <span>
            <b>{formatDuration(planned)}</b> of tasks today, but only <b>{formatDuration(free)}</b> free{free ? '' : ' left'}. Move something to tomorrow?
          </span>
          <button className="btn sm ghost" onClick={() => window.dispatchEvent(new CustomEvent('dd:plan-day'))}>
            Plan my day
          </button>
        </div>
      )}
      <div className="daybar" aria-hidden>
        <div className="daybar-track">
          {isToday && <div className="daybar-past" style={{ width: pct(m) }} />}
          {timed.map((e) => (
            <div
              key={e.id}
              className={`daybar-ev ${endOf(e) <= m ? 'past' : ''}`}
              style={{ ...(e.google?.color && endOf(e) > m ? { background: e.google.color } : {}), left: pct(toMinutes(e.start!)), width: `calc(${pct(endOf(e))} - ${pct(toMinutes(e.start!))})` }}
              title={e.title}
            />
          ))}
        </div>
        {isToday && m >= rangeStart && m <= rangeEnd && <div className="daybar-now" style={{ left: pct(m) }} />}
        <div className="daybar-labels num">
          <span>{fmt(fromMinutes(rangeStart))}</span>
          <span>{fmt(fromMinutes((rangeStart + rangeEnd) / 2))}</span>
          <span>{fmt(fromMinutes(rangeEnd))}</span>
        </div>
      </div>

      {timed.length === 0 && allDay.length === 0 ? (
        <Empty icon={<CalendarDays size={28} />} title={isToday ? 'Your day is wide open' : 'Nothing scheduled'}>
          Type “Lunch with Ana at 1pm” in quick add, or press E.
        </Empty>
      ) : (
        <div className="agenda" ref={agendaRef}>
          {allDay.map((e) => (
            <button key={e.id} className="ev" onClick={() => open(e)} title={e.google ? e.google.calendar : undefined}>
              <div className="ev-time">All day</div>
              <div className="ev-body" style={evColor(e)}>
                <div className="ev-title">{e.title}</div>
                {e.google && <GoogleTag e={e} />}
                {e.location && (
                  <div className="ev-sub">
                    <span>
                      <MapPin size={11} /> {e.location}
                    </span>
                  </div>
                )}
              </div>
              <span />
            </button>
          ))}
          {timed.map((e, i) => {
            const s = toMinutes(e.start!);
            const end = endOf(e);
            const past = end <= m;
            const live = s <= m && m < end;
            const prev = timed[i - 1];
            const gap = prev ? s - endOf(prev) : 0;
            const showNow = !nowShown && s > m;
            if (showNow || live) nowShown = true;
            return (
              <Fragment key={e.id}>
                {gap >= 30 && !past && !showNow && <div className="gap-row">{formatDuration(gap)} free</div>}
                {showNow && <div className="now-line num">Now · {fmt(fromMinutes(m))}</div>}
                <button className={`ev ${past ? 'past' : ''} ${live ? 'now' : ''}`} onClick={() => open(e)} title={e.google ? e.google.calendar : undefined}>
                  <div className="ev-time num">
                    {fmt(e.start!)}
                    {e.end && <small>{fmt(e.end)}</small>}
                  </div>
                  <div className="ev-body" style={evColor(e)}>
                    <div className="ev-title">{e.title}</div>
                    {e.google && <GoogleTag e={e} />}
                    {(e.location || e.notes) && (
                      <div className="ev-sub">
                        {e.location && (
                          <span>
                            <MapPin size={11} /> {e.location}
                          </span>
                        )}
                        {e.notes && (
                          <span>
                            <StickyNote size={11} /> {e.notes}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <span className="badge num">{live ? 'Now' : !past && isToday && s - m <= 120 ? `in ${formatDuration(s - m)}` : formatDuration(end - s)}</span>
                </button>
              </Fragment>
            );
          })}
          {!nowShown && isToday && <div className="now-line num">Now · {fmt(fromMinutes(m))} — that’s a wrap</div>}
        </div>
      )}

      <UpcomingDays after={day} onSelect={setDay} />

      <EventEditor event={editing} defaultDate={day} onClose={() => setEditing(null)} />
    </Card>
  );
}

