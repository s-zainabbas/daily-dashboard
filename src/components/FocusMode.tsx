import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarClock, Check, Minimize2, Play, Square, Timer } from 'lucide-react';
import { dateKey, formatDuration, formatTime, nowMinutes } from '../lib/date';
import { useAllEvents } from '../lib/gcal';
import { useNow } from '../lib/hooks';
import { candidates, moment } from '../lib/now';
import { actions, getState, useStore } from '../lib/store';
import { chime, elapsedMs, fmtElapsed, useWork, workActions, workTitle } from '../lib/timer';
import { loggedToast } from './Now';

export const FOCUS_EVENT = 'dd:focus-mode';
const SPRINT_KEY = 'daily-dashboard:focus-sprints';
const SPRINT = 25;

/**
 * Focus mode: the whole screen for one thing. A big timer, the task's checklist, how long until
 * your next event, and optional 25-minute sprints that chime when it's time for a short break.
 * Esc (or the button) leaves; the timer keeps running in the background.
 */
export function FocusMode({ open, onClose }: { open: boolean; onClose: () => void }) {
  const work = useWork();
  const running = !!work.startedAt;
  const now = useNow(open ? 1000 : 60_000);
  const s = useStore((x) => x);
  const events = useAllEvents();
  const use24h = s.settings.use24h;
  const day = dateKey(now);
  const m = useMemo(() => moment(events, day, nowMinutes(now)), [events, day, now]);
  const picks = useMemo(() => candidates(s, day, m.kind === 'free' ? m.minutes : undefined).slice(0, 5), [s, day, m]);
  const [sprints, setSprintsState] = useState(() => {
    try {
      return localStorage.getItem(SPRINT_KEY) === '1';
    } catch {
      return false;
    }
  });
  const setSprints = (on: boolean) => {
    setSprintsState(on);
    try {
      localStorage.setItem(SPRINT_KEY, on ? '1' : '0');
    } catch {
      /* optional */
    }
  };
  const ref = useRef<HTMLDivElement>(null);

  // Full screen while open, where the browser allows it; Esc leaves.
  useEffect(() => {
    if (!open) return;
    ref.current?.focus();
    const el = document.documentElement;
    if (el.requestFullscreen && !document.fullscreenElement) el.requestFullscreen().catch(() => {});
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, [open, onClose]);

  const ms = elapsedMs(work, now.getTime());
  const minutes = ms / 60_000;
  const sprintNo = Math.floor(minutes / SPRINT) + 1;
  const inSprint = minutes % SPRINT;
  // Chime once at the end of each sprint.
  const chimed = useRef(0);
  useEffect(() => {
    if (!open || !sprints || !running) return;
    const done = Math.floor(minutes / SPRINT);
    if (done > chimed.current) {
      chimed.current = done;
      if (getState().settings.sound) chime();
    }
  }, [open, sprints, running, minutes]);
  useEffect(() => {
    chimed.current = Math.floor(minutes / SPRINT);
  }, [work.startedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;
  const task = work.taskId && work.taskId !== 'priority' ? s.tasks.find((t) => t.id === work.taskId) : undefined;
  const title = running ? workTitle(work.taskId, s) ?? 'Untitled work' : undefined;
  const R = 120;
  const C = 2 * Math.PI * R;
  const progress = sprints ? inSprint / SPRINT : (minutes % 60) / 60;

  return (
    <div className="focus-mode" role="dialog" aria-modal="true" aria-label="Focus mode" tabIndex={-1} ref={ref}>
      <header className="focus-top">
        <span className="focus-brand">
          <Timer size={15} /> Focus
        </span>
        {m.kind === 'free' && m.next && (
          <span className="focus-next">
            <CalendarClock size={13} /> {m.next.title} in {formatDuration(m.minutes)}
          </span>
        )}
        {m.kind === 'busy' && (
          <span className="focus-next">
            <CalendarClock size={13} /> {m.event.title}
            {m.endsIn ? ` · ends in ${formatDuration(m.endsIn)}` : ''}
          </span>
        )}
        <span className="spacer" />
        <label className="focus-sprints">
          <input type="checkbox" checked={sprints} onChange={(e) => setSprints(e.target.checked)} /> 25-min sprints
        </label>
        <button className="btn ghost" onClick={onClose}>
          <Minimize2 size={14} /> Leave <kbd>Esc</kbd>
        </button>
      </header>

      {running ? (
        <main className="focus-main">
          <div className="focus-ring">
            <svg viewBox="0 0 280 280" aria-hidden>
              <circle cx="140" cy="140" r={R} className="track" />
              <circle cx="140" cy="140" r={R} className="fill" strokeDasharray={C} strokeDashoffset={C * (1 - progress)} />
            </svg>
            <div className="focus-clock">
              <b className="num" role="timer">
                {fmtElapsed(ms)}
              </b>
              {sprints && (
                <small className="num">
                  Sprint {sprintNo} · {inSprint < SPRINT - 0.02 ? `${Math.ceil(SPRINT - inSprint)} min left` : 'break time'}
                </small>
              )}
            </div>
          </div>
          <h1 className="focus-title">{title}</h1>
          {task?.subtasks?.length ? (
            <ul className="focus-steps">
              {task.subtasks.map((x) => (
                <li key={x.id}>
                  <button className={`check ${x.done ? 'on' : ''}`} role="checkbox" aria-checked={x.done} onClick={() => actions.toggleSubtask(task.id, x.id)}>
                    {x.done && <Check size={12} />}
                  </button>
                  <span className={x.done ? 'done' : ''}>{x.title}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="focus-actions">
            <button className="btn primary lg" onClick={() => loggedToast(workActions.finish(), true)}>
              <Check size={16} /> Done
            </button>
            <button className="btn lg" onClick={() => loggedToast(workActions.stop())}>
              <Square size={14} /> Stop
            </button>
          </div>
        </main>
      ) : (
        <main className="focus-main">
          <h1 className="focus-title">What are you focusing on?</h1>
          <div className="focus-picks">
            {picks.map((p) => (
              <button key={p.id} className="focus-pick" onClick={() => workActions.start(p.id)}>
                <Play size={14} />
                <span>{p.title}</span>
                <small>{p.why === 'priority' ? 'Today’s #1' : p.why === 'overdue' ? 'Overdue' : p.why === 'today' ? 'Due today' : ''}</small>
              </button>
            ))}
            <button className="focus-pick ghost" onClick={() => workActions.start(undefined)}>
              <Play size={14} />
              <span>Something else</span>
            </button>
          </div>
          {m.kind === 'free' && m.next && (
            <p className="focus-hint">
              Free until {formatTime(m.next.start!, use24h)} — {formatDuration(m.minutes)}.
            </p>
          )}
        </main>
      )}
    </div>
  );
}
