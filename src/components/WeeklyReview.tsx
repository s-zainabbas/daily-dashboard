import { useState } from 'react';
import { ArrowLeft, ArrowRight, CalendarRange, Check, Flag, Plus, X } from 'lucide-react';
import { addDays, formatDuration, fromKey, lastDays, today as todayKey } from '../lib/date';
import { useNow } from '../lib/hooks';
import { headline, tasksSeries } from '../lib/insights';
import { actions, getState, uid, useStore } from '../lib/store';
import type { WeekGoal } from '../lib/types';
import { mondayOf, reviewDue, targetWeek, thisWeeksGoals } from '../lib/week';
import { BarChart } from './Charts';
import { MOODS } from './Panels';
import { Card, Dialog, DialogHead, toast } from './ui';

type Step = 'look' | 'reflect' | 'goals' | 'done';

const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);
const trend = (now: number, before: number) => (!before ? '' : now >= before ? `↑ from ${before}` : `↓ from ${before}`);

/** Weekly review: look back at the week, note what to change, set up to 3 goals for the next one. */
export function WeeklyReview({ open, onClose }: { open: boolean; onClose: () => void }) {
  return open ? <ReviewFlow onClose={onClose} /> : null;
}

function ReviewFlow({ onClose }: { onClose: () => void }) {
  const s = useStore((x) => x);
  const t = todayKey();
  const now = new Date();
  // Friday afternoon counts as planning next week, like the weekend.
  const target = now.getDay() === 5 && now.getHours() >= 15 ? addDays(mondayOf(t), 7) : targetWeek(t);
  const lookingAt = target > mondayOf(t) ? mondayOf(t) : addDays(mondayOf(t), -7);
  const h = headline(s, t, 7);
  const days = lastDays(7, t);
  const lastGoals = s.week && s.week.key === lookingAt ? s.week.goals : [];
  const wins = s.journal.filter((j) => j.date >= days[0] && j.shipped).slice(0, 6);
  const existing = s.week?.key === target ? s.week : undefined;

  const [step, setStep] = useState<Step>('look');
  const [wentWell, setWentWell] = useState(existing?.wentWell ?? '');
  const [change, setChange] = useState(existing?.change ?? '');
  const [goals, setGoals] = useState<string[]>(() => {
    const g = existing?.goals.map((x) => x.title) ?? [];
    return g.length ? g : [''];
  });

  // Ideas: unfinished goals from last week, project next steps, important tasks coming up.
  const ideas = [
    ...lastGoals.filter((g) => !g.done).map((g) => g.title),
    ...s.projects.filter((p) => p.status !== 'done' && p.nextAction).map((p) => p.nextAction),
    ...s.tasks.filter((x) => !x.done && x.priority === 'high').map((x) => x.title),
  ]
    .filter((x, i, a) => a.indexOf(x) === i && !goals.includes(x))
    .slice(0, 6);

  const steps: Step[] = ['look', 'reflect', 'goals'];
  const stepNo = steps.indexOf(step) + 1;
  const weekName = `week of ${fromKey(target).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;

  function finish() {
    const before = getState().week;
    const prevGoals = existing?.goals ?? [];
    const list: WeekGoal[] = goals
      .map((g) => g.trim())
      .filter(Boolean)
      .slice(0, 3)
      .map((title) => prevGoals.find((p) => p.title === title) ?? { id: uid(), title, done: false });
    actions.setWeek({ key: target, goals: list, reviewedOn: t, wentWell: wentWell.trim() || undefined, change: change.trim() || undefined });
    setStep('done');
    toast('Week planned', { label: 'Undo', run: () => actions.setWeek(before) });
  }

  return (
    <Dialog open onClose={onClose} className="modal plan-modal" label="Weekly review">
      <DialogHead
        title={
          <span className="plan-title">
            <CalendarRange size={16} /> {step === 'look' ? 'Your week' : step === 'reflect' ? 'Reflect' : step === 'goals' ? `Goals for the ${weekName}` : 'Week planned'}
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
        {step === 'look' && (
          <>
            <div className="shut-stats num">
              <span>
                <b>{formatDuration(h.focus)}</b> focus {trend(h.focus, h.focusBefore) && <small>{h.focusBefore ? (h.focus >= h.focusBefore ? '↑' : '↓') : ''}</small>}
              </span>
              <span>
                <b>{h.tasks}</b> tasks done <small>{trend(h.tasks, h.tasksBefore)}</small>
              </span>
              <span>
                <b>{pct(h.habits)}</b> habits kept
              </span>
              {h.mood !== null && (
                <span>
                  <b>{MOODS[Math.round(h.mood) - 1].face}</b> average mood
                </span>
              )}
            </div>
            <div className="plan-list">
              <div className="task-section">Tasks done each day</div>
              <BarChart data={tasksSeries(s, days, t)} format={(v) => String(v)} label="Tasks done in the last 7 days" unit="Tasks" />
              {lastGoals.length > 0 && (
                <>
                  <div className="task-section">Last week’s goals</div>
                  {lastGoals.map((g) => (
                    <button key={g.id} type="button" className={`plan-pick ${g.done ? 'on' : ''}`} role="checkbox" aria-checked={g.done} onClick={() => actions.toggleWeekGoal(g.id)}>
                      <span className={`check ${g.done ? 'on' : ''}`} aria-hidden>
                        <Check size={13} strokeWidth={3} />
                      </span>
                      <span className="plan-task">
                        <b>{g.title}</b>
                      </span>
                    </button>
                  ))}
                </>
              )}
              {wins.length > 0 && (
                <>
                  <div className="task-section">Wins from your journal</div>
                  <ul className="week-wins">
                    {wins.map((j) => (
                      <li key={j.date}>
                        <small>{fromKey(j.date).toLocaleDateString(undefined, { weekday: 'short' })}</small> {j.shipped.split('\n')[0]}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
            <div className="modal-foot">
              <span className="spacer" />
              <button type="button" className="btn primary" onClick={() => setStep('reflect')}>
                Next <ArrowRight size={14} />
              </button>
            </div>
          </>
        )}

        {step === 'reflect' && (
          <>
            <label className="field">
              <span>What went well this week?</span>
              <textarea className="textarea" rows={3} autoFocus value={wentWell} onChange={(e) => setWentWell(e.target.value)} placeholder="Wins, good habits, things to keep doing" />
            </label>
            <label className="field">
              <span>What would you change next week?</span>
              <textarea className="textarea" rows={3} value={change} onChange={(e) => setChange(e.target.value)} placeholder="One small thing to do differently" />
            </label>
            <div className="modal-foot">
              <button type="button" className="btn ghost" onClick={() => setStep('look')}>
                <ArrowLeft size={14} /> Back
              </button>
              <span className="spacer" />
              <button type="button" className="btn primary" onClick={() => setStep('goals')}>
                Next <ArrowRight size={14} />
              </button>
            </div>
          </>
        )}

        {step === 'goals' && (
          <>
            <p className="plan-lead">Pick up to 3 things that would make next week a success. They’ll sit on your Today tab all week.</p>
            <div className="week-goal-inputs">
              {goals.map((g, i) => (
                <div key={i} className="week-goal-input">
                  <span className="num">{i + 1}</span>
                  <input
                    className="input"
                    value={g}
                    autoFocus={i === 0}
                    maxLength={120}
                    placeholder={['The big one', 'Something to move forward', 'Something for you'][i]}
                    onChange={(e) => setGoals((xs) => xs.map((x, j) => (j === i ? e.target.value : x)))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && goals.length < 3 && g.trim()) {
                        e.preventDefault();
                        setGoals((xs) => [...xs, '']);
                      }
                    }}
                  />
                  {goals.length > 1 && (
                    <button type="button" className="icon-btn sm" aria-label={`Remove goal ${i + 1}`} onClick={() => setGoals((xs) => xs.filter((_, j) => j !== i))}>
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
              {goals.length < 3 && (
                <button type="button" className="btn ghost sm" onClick={() => setGoals((xs) => [...xs, ''])}>
                  <Plus size={14} /> Add a goal
                </button>
              )}
            </div>
            {ideas.length > 0 && goals.filter((g) => g.trim()).length < 3 && (
              <div className="shut-ideas">
                {ideas.map((i) => (
                  <button
                    key={i}
                    type="button"
                    className="chip"
                    onClick={() =>
                      setGoals((xs) => {
                        const empty = xs.findIndex((x) => !x.trim());
                        return empty >= 0 ? xs.map((x, j) => (j === empty ? i : x)) : xs.length < 3 ? [...xs, i] : xs;
                      })
                    }
                  >
                    + {i}
                  </button>
                ))}
              </div>
            )}
            <div className="modal-foot">
              <button type="button" className="btn ghost" onClick={() => setStep('reflect')}>
                <ArrowLeft size={14} /> Back
              </button>
              <span className="spacer" />
              <button type="button" className="btn primary" onClick={finish}>
                <Flag size={14} /> Plan the week
              </button>
            </div>
          </>
        )}

        {step === 'done' && (
          <>
            <div className="plan-done">
              <CalendarRange size={26} />
              <p>
                Your goals for the <b>{weekName}</b>:
              </p>
              <ol className="week-done-goals">
                {goals
                  .filter((g) => g.trim())
                  .slice(0, 3)
                  .map((g) => (
                    <li key={g}>{g}</li>
                  ))}
              </ol>
            </div>
            <div className="modal-foot">
              <span className="spacer" />
              <button type="button" className="btn primary" onClick={onClose}>
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}

/** This week's goals on the Today tab. */
export function WeekGoals({ onReview }: { onReview: () => void }) {
  const goals = useStore((s) => thisWeeksGoals(s, todayKey()));
  if (!goals.length) return null;
  const done = goals.filter((g) => g.done).length;
  return (
    <Card
      title="This week"
      icon={<Flag size={16} />}
      meta={`${done}/${goals.length} done`}
      className="week-goals"
      actions={
        <button className="btn sm ghost" onClick={onReview} title="Weekly review (W)">
          Review
        </button>
      }
    >
      <div className="week-goal-list">
        {goals.map((g) => (
          <button key={g.id} className={`week-goal ${g.done ? 'done' : ''}`} role="checkbox" aria-checked={g.done} onClick={() => actions.toggleWeekGoal(g.id)}>
            <span className={`check sm ${g.done ? 'on' : ''}`} aria-hidden>
              <Check size={10} strokeWidth={3} />
            </span>
            <span>{g.title}</span>
          </button>
        ))}
      </div>
    </Card>
  );
}

const SKIP_KEY = 'daily-dashboard:week-skipped';

/** Friday afternoon to Monday noon: a nudge to review the week. */
export function WeeklyPrompt({ onStart }: { onStart: () => void }) {
  const now = useNow(60_000);
  const t = todayKey();
  const due = useStore((s) => reviewDue(s, now, t));
  const [skipped, setSkipped] = useState(() => {
    try {
      return localStorage.getItem(SKIP_KEY) === t;
    } catch {
      return false;
    }
  });
  if (!due || skipped) return null;
  return (
    <div className="card plan-prompt week-prompt">
      <span className="plan-prompt-icon">
        <CalendarRange size={18} />
      </span>
      <div>
        <b>Review your week</b>
        <small>See how the week went and set up to 3 goals for the next one. About 2 minutes.</small>
      </div>
      <button className="btn primary sm" onClick={onStart}>
        Start <kbd>W</kbd>
      </button>
      <button
        className="icon-btn sm"
        aria-label="Skip the weekly review today"
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
