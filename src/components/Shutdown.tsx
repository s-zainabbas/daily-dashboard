import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Moon, MoonStar, Target, X } from 'lucide-react';
import { addDays, dueLabel, formatDuration, formatTime, today as todayKey } from '../lib/date';
import { useAllEvents } from '../lib/gcal';
import { useNow } from '../lib/hooks';
import { applyShutdown, closed, leftovers, nextPriorityIdeas, shippedDraft, wins, type Leftover } from '../lib/shutdown';
import { actions, getState, setState, useStore } from '../lib/store';
import type { Mood } from '../lib/types';
import { MOODS } from './Panels';
import { Dialog, DialogHead, toast } from './ui';

type Step = 'wins' | 'leftovers' | 'tomorrow' | 'done';

const MOVES: { value: Leftover; label: string }[] = [
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: 'week', label: 'Next week' },
  { value: 'done', label: 'Done' },
  { value: 'drop', label: 'Drop' },
  { value: 'keep', label: 'Leave' },
];

/** End-of-day shutdown: see what you did, deal with what's left, set tomorrow's #1, switch off. */
export function Shutdown({ open, onClose }: { open: boolean; onClose: () => void }) {
  return open ? <ShutdownFlow onClose={onClose} /> : null;
}

function ShutdownFlow({ onClose }: { onClose: () => void }) {
  const s = useStore((x) => x);
  const events = useAllEvents();
  const use24h = useStore((x) => x.settings.use24h);
  const t = todayKey();

  const w = wins(s, t);
  const left = useMemo(() => leftovers(getState(), t), [t]);
  const [step, setStep] = useState<Step>('wins');
  const [moves, setMoves] = useState<Record<string, Leftover>>(() => Object.fromEntries(left.map((x) => [x.id, 'tomorrow' as Leftover])));
  const [shipped, setShipped] = useState(() => s.reflection.shipped || shippedDraft(w.tasks));
  const [slipped, setSlipped] = useState(s.reflection.slipped);
  const [mood, setMood] = useState<Mood | undefined>(s.reflection.mood);
  const ideas = nextPriorityIdeas(s, t, moves);
  const [nextPriority, setNextPriority] = useState(() => s.reflection.nextPriority ?? '');
  const [touchedPriority, setTouchedPriority] = useState(!!s.reflection.nextPriority);
  const shownPriority = touchedPriority ? nextPriority : nextPriority || ideas[0] || '';

  const tomorrow = addDays(t, 1);
  const tomorrowEvents = events.filter((e) => e.date === tomorrow).sort((a, b) => (a.start ?? '').localeCompare(b.start ?? ''));
  const steps: Step[] = left.length ? ['wins', 'leftovers', 'tomorrow'] : ['wins', 'tomorrow'];
  const stepNo = steps.indexOf(step) + 1;

  function finish() {
    const before = getState();
    const { state, complete } = applyShutdown(before, { leftovers: moves, shipped, slipped, mood, nextPriority: shownPriority }, t);
    setState(() => state);
    complete.forEach((id) => actions.toggleTask(id));
    setStep('done');
    toast('Day closed', { label: 'Undo', run: () => setState((x) => ({ ...x, tasks: before.tasks, reflection: before.reflection })) });
  }

  const title = step === 'wins' ? 'Today’s wins' : step === 'leftovers' ? 'What’s left' : step === 'tomorrow' ? 'Set up tomorrow' : 'Day closed';

  return (
    <Dialog open onClose={onClose} className="modal plan-modal" label="Shutdown routine">
      <DialogHead
        title={
          <span className="plan-title">
            <MoonStar size={16} /> {title}
            {step !== 'done' && (
              <small className="num">
                {stepNo} of {steps.length}
              </small>
            )}
          </span>
        }
        onClose={onClose}
      />
      {step !== 'done' && (
        <div className="plan-progress" aria-hidden>
          {steps.map((x, i) => (
            <i key={x} className={i < stepNo ? 'on' : ''} />
          ))}
        </div>
      )}

      <div className="modal-body plan-body">
        {step === 'wins' && (
          <>
            <div className="shut-stats num">
              <span>
                <b>{w.tasks.length}</b> task{w.tasks.length === 1 ? '' : 's'} done
              </span>
              <span>
                <b>{formatDuration(w.focusMinutes)}</b> focus
              </span>
              {w.habitsOn > 0 && (
                <span>
                  <b>
                    {w.habitsDone}/{w.habitsOn}
                  </b>{' '}
                  habits
                </span>
              )}
            </div>
            <div className="plan-list">
              {s.priority.title && (
                <button
                  type="button"
                  className={`plan-pick ${s.priority.done ? 'on' : ''}`}
                  role="checkbox"
                  aria-checked={s.priority.done}
                  onClick={() => actions.setPriority({ done: !s.priority.done })}
                >
                  <span className={`check ${s.priority.done ? 'on' : ''}`} aria-hidden>
                    <Check size={13} strokeWidth={3} />
                  </span>
                  <span className="plan-task">
                    <small className="shut-eyebrow">
                      <Target size={11} /> Today’s #1
                    </small>
                    <b>{s.priority.title}</b>
                  </span>
                </button>
              )}
              {w.habitsLeft.map((h) => (
                <button key={h.id} type="button" className="plan-pick" role="checkbox" aria-checked={false} onClick={() => actions.toggleHabit(h.id)}>
                  <span className="check round" aria-hidden>
                    <Check size={13} strokeWidth={3} />
                  </span>
                  <span className="plan-task">
                    <small className="shut-eyebrow">Habit not ticked yet</small>
                    <b>{h.name}</b>
                  </span>
                </button>
              ))}
              <label className="field">
                <span>What shipped?</span>
                <textarea className="textarea" rows={Math.min(6, Math.max(2, shipped.split('\n').length))} value={shipped} onChange={(e) => setShipped(e.target.value)} placeholder="Wins, big or small" />
                {w.tasks.length > 0 && <small>Filled in from the tasks you completed today. Edit freely.</small>}
              </label>
              <div className="field">
                <span>How did today feel?</span>
                <div className="moods" role="group" aria-label="How did today feel?">
                  {MOODS.map((m) => (
                    <button key={m.value} type="button" className={`mood ${mood === m.value ? 'on' : ''}`} aria-pressed={mood === m.value} title={m.label} aria-label={m.label} onClick={() => setMood(mood === m.value ? undefined : m.value)}>
                      {m.face}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <span className="spacer" />
              <button type="button" className="btn primary" onClick={() => setStep(left.length ? 'leftovers' : 'tomorrow')}>
                Next <ArrowRight size={14} />
              </button>
            </div>
          </>
        )}

        {step === 'leftovers' && (
          <>
            <p className="plan-lead">
              {left.length} task{left.length === 1 ? '' : 's'} didn’t get done. Give each a new home, so tomorrow starts clean.
            </p>
            <div className="plan-list">
              {left.map((x) => (
                <div key={x.id} className="plan-row">
                  <div className="plan-task">
                    <b>{x.title}</b>
                    <span className="plan-chips">
                      {x.priority === 'high' && <span className="chip high">High</span>}
                      {x.dueDate && <span className={`chip ${x.dueDate < t ? 'overdue' : ''}`}>{dueLabel(x.dueDate)}</span>}
                    </span>
                  </div>
                  <div className="segmented plan-triage" role="group" aria-label={`What to do with “${x.title}”`}>
                    {MOVES.map((o) => (
                      <button key={o.value} type="button" aria-pressed={moves[x.id] === o.value} data-v={o.value} onClick={() => setMoves((m) => ({ ...m, [x.id]: o.value }))}>
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <label className="field">
                <span>What slipped? (optional)</span>
                <input className="input" value={slipped} onChange={(e) => setSlipped(e.target.value)} placeholder="No judgement — just notice" />
              </label>
            </div>
            <div className="modal-foot">
              <button type="button" className="btn ghost" onClick={() => setStep('wins')}>
                <ArrowLeft size={14} /> Back
              </button>
              <span className="spacer" />
              <button type="button" className="btn primary" onClick={() => setStep('tomorrow')}>
                Next <ArrowRight size={14} />
              </button>
            </div>
          </>
        )}

        {step === 'tomorrow' && (
          <>
            <div className="shut-tomorrow">
              <div className="task-section">Tomorrow’s calendar</div>
              {tomorrowEvents.length ? (
                tomorrowEvents.slice(0, 5).map((e) => (
                  <div className="tomorrow-item" key={e.id}>
                    <time className="num">{e.start ? formatTime(e.start, use24h) : 'All day'}</time>
                    <span>{e.title}</span>
                  </div>
                ))
              ) : (
                <div className="tomorrow-item" style={{ color: 'var(--muted)' }}>
                  Nothing scheduled — a clear day.
                </div>
              )}
              {tomorrowEvents.length > 5 && <small className="plan-count">+{tomorrowEvents.length - 5} more</small>}
            </div>
            <label className="field">
              <span>Tomorrow’s #1 priority</span>
              <input
                className="input"
                value={shownPriority}
                maxLength={140}
                placeholder="What would make tomorrow a win?"
                onChange={(e) => {
                  setTouchedPriority(true);
                  setNextPriority(e.target.value);
                }}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), finish())}
              />
              <small>It’ll be waiting as your #1 when you open the dashboard tomorrow.</small>
            </label>
            {ideas.length > 0 && (
              <div className="shut-ideas">
                {ideas.map((i) => (
                  <button
                    key={i}
                    type="button"
                    className={`chip ${shownPriority === i ? 'accent' : ''}`}
                    onClick={() => {
                      setTouchedPriority(true);
                      setNextPriority(i);
                    }}
                  >
                    {i}
                  </button>
                ))}
              </div>
            )}
            <div className="modal-foot">
              <button type="button" className="btn ghost" onClick={() => setStep(left.length ? 'leftovers' : 'wins')}>
                <ArrowLeft size={14} /> Back
              </button>
              <span className="spacer" />
              <button type="button" className="btn primary" onClick={finish}>
                <Moon size={14} /> Close the day
              </button>
            </div>
          </>
        )}

        {step === 'done' && (
          <>
            <div className="plan-done">
              <MoonStar size={26} />
              <p>
                <b>{w.tasks.length}</b> task{w.tasks.length === 1 ? '' : 's'} done{w.focusMinutes ? ` · ${formatDuration(w.focusMinutes)} focus` : ''}. That’s a day.
              </p>
              {shownPriority && (
                <p className="plan-done-prio">
                  <Target size={14} /> Tomorrow: {shownPriority}
                </p>
              )}
              <p className="shut-rest">Saved to your journal at midnight. Switch off — you’ve earned it.</p>
            </div>
            <div className="modal-foot">
              <span className="spacer" />
              <button type="button" className="btn primary" onClick={onClose}>
                Good night
              </button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}

/* ---------- Prompt on the Today tab ---------- */

const SKIP_KEY = 'daily-dashboard:shutdown-skipped';

/** An evening nudge at the top of Today (from 5pm) until you've closed or skipped the day. */
export function ShutdownPrompt({ onStart }: { onStart: () => void }) {
  const now = useNow(60_000);
  const t = todayKey();
  const isClosed = useStore(closed);
  const left = useStore((x) => leftovers(x, t).length);
  const [skipped, setSkipped] = useState(() => {
    try {
      return localStorage.getItem(SKIP_KEY) === t;
    } catch {
      return false;
    }
  });
  if (isClosed || skipped || now.getHours() < 17) return null;
  return (
    <div className="card plan-prompt shut-prompt">
      <span className="plan-prompt-icon">
        <MoonStar size={18} />
      </span>
      <div>
        <b>Wrap up your day</b>
        <small>{left ? `Look back, give ${left} unfinished task${left === 1 ? '' : 's'} a new home, and set tomorrow’s #1.` : 'Look back on today and set tomorrow’s #1. Takes about a minute.'}</small>
      </div>
      <button className="btn primary sm" onClick={onStart}>
        Start <kbd>S</kbd>
      </button>
      <button
        className="icon-btn sm"
        aria-label="Skip the shutdown today"
        title="Not today"
        onClick={() => {
          setSkipped(true);
          try {
            localStorage.setItem(SKIP_KEY, t);
          } catch {
            /* optional */
          }
        }}
      >
        <X size={15} />
      </button>
    </div>
  );
}
