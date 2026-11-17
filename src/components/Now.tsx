import { useMemo, useState } from 'react';
import { Maximize2, ArrowRightLeft, CalendarClock, Check, Coffee, Compass, Play, Square, Sparkles } from 'lucide-react';
import { dateKey, dueLabel, formatDuration, formatTime, nowMinutes } from '../lib/date';
import { useAllEvents } from '../lib/gcal';
import { useNow } from '../lib/hooks';
import { candidates, moment, type Pick } from '../lib/now';
import { useStore } from '../lib/store';
import { elapsedMs, fmtElapsed, MAX_MINUTES, workActions, workTitle, type Logged, useWork } from '../lib/timer';
import { Card, toast } from './ui';
import { FOCUS_EVENT } from './FocusMode';

/** Say what was logged after stopping, with the right words for a forgotten timer. */
export function loggedToast(l: Logged | undefined, done = false) {
  if (!l) return;
  const what = l.title ? `“${l.title}”` : 'that';
  if (l.capped) toast(`Logged ${formatDuration(MAX_MINUTES)} on ${what}. The timer ran longer, so it was probably left on.`, undefined, 7000);
  else if (l.minutes >= 1) toast(`${done ? 'Done · ' : ''}${formatDuration(l.minutes)} on ${what}`);
  else if (done) toast('Done');
}

/**
 * Now: where you are in your day (in a meeting, free until the next one) and the one thing to do
 * with that time. Start working on it and a stopwatch counts up; stop, switch or tick it off when
 * you're done, and the time is credited to that task.
 */
export function Now() {
  const work = useWork();
  const running = !!work.startedAt;
  const now = useNow(running ? 1000 : 30_000);
  const s = useStore((x) => x);
  const events = useAllEvents();
  const day = dateKey(now);
  const m = useMemo(() => moment(events, day, nowMinutes(now)), [events, day, now]);
  const fits = m.kind === 'free' ? m.minutes : undefined;
  const picks = useMemo(() => candidates(s, day, fits), [s, day, fits]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const suggestion = picks.find((p) => !skipped.includes(p.id)) ?? picks[0];
  const tracked = s.focus[day];

  const current = running ? workTitle(work.taskId, s) ?? 'Untitled work' : undefined;

  return (
    <Card
      id="now"
      className={`now ${running ? 'running' : ''}`}
      title="Now"
      icon={<Compass size={16} />}
      meta={<span className="num">{formatTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`, s.settings.use24h)}</span>}
      actions={
        <button className="icon-btn sm" onClick={() => window.dispatchEvent(new CustomEvent(FOCUS_EVENT))} aria-label="Focus mode" title="Focus mode · F">
          <Maximize2 size={14} />
        </button>
      }
    >
      <MomentLine m={m} use24h={s.settings.use24h} />

      {running ? (
        <div className="now-main">
          <div className="now-eyebrow">Working on</div>
          <div className="now-title">{current}</div>
          <div className="now-clock num" role="timer" aria-live="off">
            {fmtElapsed(elapsedMs(work, now.getTime()))}
          </div>
          <div className="now-actions">
            <button className="btn primary" onClick={() => loggedToast(workActions.finish(), true)}>
              <Check size={15} /> Done
            </button>
            <button className="btn" onClick={() => loggedToast(workActions.stop())}>
              <Square size={13} /> Stop
            </button>
            <SwitchTo picks={picks.filter((p) => p.id !== work.taskId)} />
          </div>
        </div>
      ) : suggestion ? (
        <div className="now-main">
          <div className="now-eyebrow">{suggestion.why === 'priority' ? 'Your #1 priority' : m.kind === 'busy' ? 'After this' : 'Up next'}</div>
          <div className="now-title">{suggestion.title}</div>
          <Why pick={suggestion} fits={fits} />
          <div className="now-actions">
            <button className="btn primary" onClick={() => workActions.start(suggestion.id)}>
              <Play size={14} /> Start working
            </button>
            {picks.length > 1 && (
              <button
                className="btn ghost"
                onClick={() => setSkipped((x) => (picks.every((p) => p.id === suggestion.id || x.includes(p.id)) ? [] : [...x, suggestion.id]))}
                title="Suggest something else"
              >
                <Sparkles size={13} /> Something else
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="now-main now-empty">
          <div className="now-title">Nothing waiting on you.</div>
          <p>Add a task with / or N, or enjoy the space.</p>
          <button className="btn" onClick={() => workActions.start(undefined)}>
            <Play size={14} /> Track time anyway
          </button>
        </div>
      )}

      <div className="now-foot num">
        <span>
          Tracked today <b>{formatDuration(tracked?.minutes ?? 0)}</b>
        </span>
        {!running && picks.length > 0 && <SwitchTo picks={picks} label="Pick a task" start />}
      </div>
    </Card>
  );
}

function MomentLine({ m, use24h }: { m: ReturnType<typeof moment>; use24h: boolean }) {
  if (m.kind === 'busy')
    return (
      <div className="now-moment busy">
        <CalendarClock size={14} />
        <span className="truncate">
          In <b>{m.event.title}</b>
          {m.endsIn ? ` · ends in ${formatDuration(m.endsIn)}` : ''}
        </span>
      </div>
    );
  if (m.kind === 'free')
    return (
      <div className={`now-moment ${m.minutes <= 15 ? 'soon' : 'free'}`}>
        {m.minutes <= 15 ? <CalendarClock size={14} /> : <Coffee size={14} />}
        <span className="truncate">
          {m.minutes <= 15 ? (
            <>
              <b>{m.next.title}</b> in {formatDuration(m.minutes)}
            </>
          ) : (
            <>
              Free for <b>{formatDuration(m.minutes)}</b> · then {m.next.title} at {formatTime(m.next.start!, use24h)}
            </>
          )}
        </span>
      </div>
    );
  return (
    <div className="now-moment free">
      <Coffee size={14} />
      <span>No more events today</span>
    </div>
  );
}

function Why({ pick, fits }: { pick: Pick; fits?: number }) {
  const t = pick.task;
  const chips = [];
  if (pick.why === 'overdue' && t?.dueDate) chips.push(<span key="d" className="chip overdue">Due {dueLabel(t.dueDate).toLowerCase()}</span>);
  if (pick.why === 'today') chips.push(<span key="d" className="chip">Due today</span>);
  if (t?.priority === 'high') chips.push(<span key="p" className="chip high">High</span>);
  if (t?.estimate)
    chips.push(
      <span key="e" className={`chip num ${fits !== undefined && t.estimate > fits ? 'warn' : ''}`} title={fits !== undefined && t.estimate > fits ? 'Longer than your free time' : undefined}>
        ~{formatDuration(t.estimate)}
      </span>,
    );
  if (t?.subtasks?.length) {
    const left = t.subtasks.filter((x) => !x.done);
    if (left.length) chips.push(<span key="s" className="chip truncate">Next step: {left[0].title}</span>);
  }
  return chips.length ? <div className="now-why">{chips}</div> : null;
}

/** A compact picker: switch to (or start on) another task. */
function SwitchTo({ picks, label = 'Switch', start = false }: { picks: Pick[]; label?: string; start?: boolean }) {
  if (!picks.length) return null;
  return (
    <label className={`now-switch ${start ? 'linkish' : 'btn'}`}>
      {!start && <ArrowRightLeft size={13} />}
      <span>{label}</span>
      <select
        value=""
        aria-label={start ? 'Pick a task to start working on' : 'Switch to another task'}
        onChange={(e) => {
          const id = e.target.value;
          if (!id) return;
          loggedToast(workActions.start(id));
        }}
      >
        <option value="">{start ? 'Start working on…' : 'Switch to…'}</option>
        {picks.map((p) => (
          <option key={p.id} value={p.id}>
            {p.why === 'priority' ? `★ ${p.title}` : p.title}
          </option>
        ))}
      </select>
    </label>
  );
}
