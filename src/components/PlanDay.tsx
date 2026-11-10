import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, CalendarCheck, Check, Play, Sparkles, Sunrise, Target, X } from 'lucide-react';
import { addDays, dueLabel, formatDuration, nowMinutes, today as todayKey } from '../lib/date';
import { useAllEvents } from '../lib/gcal';
import { useNow } from '../lib/hooks';
import { applyPlan, candidates, freeMinutes, overdue, planned, type Triage } from '../lib/plan';
import { actions, getState, setState, useStore } from '../lib/store';
import { timerActions } from '../lib/timer';
import type { Task } from '../lib/types';
import { Dialog, DialogHead, toast } from './ui';

type Step = 'catchup' | 'pick' | 'priority' | 'done';

const TRIAGE: { value: Triage; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: 'week', label: 'Next week' },
  { value: 'done', label: 'Done' },
  { value: 'drop', label: 'Drop' },
];

/** "Plan my day": a one-minute morning routine. Sort out overdue tasks, choose today's, set the #1. */
export function PlanDay({ open, onClose }: { open: boolean; onClose: () => void }) {
  // Remount on each open, so every run starts fresh.
  return open ? <PlanFlow onClose={onClose} /> : null;
}

function PlanFlow({ onClose }: { onClose: () => void }) {
  const s = useStore((x) => x);
  const events = useAllEvents();
  const now = useNow(60_000);
  const t = todayKey();

  const late = useMemo(() => overdue(getState(), t), [t]);
  const [step, setStep] = useState<Step>(late.length ? 'catchup' : 'pick');
  const [triage, setTriage] = useState<Record<string, Triage>>({});
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [priority, setPriority] = useState(() => (s.priority.title && !s.priority.done ? s.priority.title : ''));
  const [custom, setCustom] = useState(false);
  const [summary, setSummary] = useState<{ count: number; title: string } | null>(null);

  const c = candidates(s, t, triage);
  // Until you change it, today's selection is everything already due today (plus overdue moved to today).
  const defaults = c.today.map((x) => x.id);
  const chosen = picked ?? new Set(defaults);
  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev ?? defaults);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const all = [...c.today, ...c.soon, ...c.anytime];
  const pickedTasks = all.filter((x) => chosen.has(x.id));
  const free = freeMinutes(events, t, nowMinutes(now));
  const eventsLeft = events.filter((e) => e.date === t && e.start && (e.end ?? e.start) > `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`).length;
  const yesterday = s.journal.find((j) => j.date === addDays(t, -1));
  const steps: Step[] = late.length ? ['catchup', 'pick', 'priority'] : ['pick', 'priority'];
  const stepNo = steps.indexOf(step) + 1;

  function finish() {
    const before = getState();
    const { state, complete } = applyPlan(before, { triage, picked: [...chosen], priority }, t);
    setState(() => state);
    complete.forEach((id) => actions.toggleTask(id)); // through the normal action, so repeats continue
    setSummary({ count: chosen.size, title: priority.trim() });
    setStep('done');
    toast(`Day planned · ${chosen.size} task${chosen.size === 1 ? '' : 's'} for today`, {
      label: 'Undo',
      run: () => setState((x) => ({ ...x, tasks: before.tasks, priority: before.priority })),
    });
  }

  const title =
    step === 'catchup' ? 'Catch up' : step === 'pick' ? 'Choose today' : step === 'priority' ? 'Your #1 priority' : 'You’re set';

  return (
    <Dialog open onClose={onClose} className="modal plan-modal" label="Plan my day">
      <DialogHead
        title={
          <span className="plan-title">
            <Sunrise size={16} /> {title}
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
        {step === 'catchup' && (
          <>
            {yesterday && (
              <p className="plan-yesterday">
                Yesterday: {yesterday.tasksDone} task{yesterday.tasksDone === 1 ? '' : 's'} done
                {yesterday.focusMinutes ? ` · ${formatDuration(yesterday.focusMinutes)} focus` : ''}
                {yesterday.priority ? ` · #1 ${yesterday.priorityDone ? 'done ✓' : 'not finished'}` : ''}
              </p>
            )}
            <p className="plan-lead">
              {late.length} task{late.length === 1 ? ' is' : 's are'} overdue. Decide what happens to each, so nothing just lingers.
            </p>
            <div className="plan-list">
              {late.map((x) => (
                <div key={x.id} className="plan-row">
                  <div className="plan-task">
                    <b>{x.title}</b>
                    <TaskChips task={x} />
                  </div>
                  <div className="segmented plan-triage" role="group" aria-label={`What to do with “${x.title}”`}>
                    {TRIAGE.map((o) => (
                      <button
                        key={o.value}
                        type="button"
                        aria-pressed={triage[x.id] === o.value}
                        data-v={o.value}
                        onClick={() =>
                          setTriage((m) => {
                            const { [x.id]: current, ...rest } = m;
                            return current === o.value ? rest : { ...rest, [x.id]: o.value };
                          })
                        }
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="modal-foot">
              <button type="button" className="btn ghost" onClick={() => setTriage(Object.fromEntries(late.map((x) => [x.id, 'today'])))}>
                All to today
              </button>
              <span className="spacer" />
              <button type="button" className="btn primary" onClick={() => setStep('pick')}>
                Next <ArrowRight size={14} />
              </button>
            </div>
          </>
        )}

        {step === 'pick' && (
          <>
            <p className="plan-lead">
              {free > 0 && (eventsLeft || free < 12 * 60) ? (
                <>
                  About <b>{formatDuration(free)} free</b> until 8pm{eventsLeft ? `, around ${eventsLeft} event${eventsLeft === 1 ? '' : 's'}` : ''}.{' '}
                </>
              ) : null}
              Tick what you’ll do today. Unticked tasks due today move to tomorrow.
            </p>
            {all.length === 0 ? (
              <p className="plan-empty">No open tasks. Add some with the quick-add bar, or just set your #1 next.</p>
            ) : (
              <div className="plan-list">
                <PickGroup title="Due today" tasks={c.today} chosen={chosen} onToggle={toggle} dueOn={c.dueOn} />
                <PickGroup title="Coming up this week" tasks={c.soon} chosen={chosen} onToggle={toggle} dueOn={c.dueOn} />
                <PickGroup title="Anytime" tasks={c.anytime.slice(0, 8)} chosen={chosen} onToggle={toggle} dueOn={c.dueOn} />
              </div>
            )}
            {chosen.size > 6 && <p className="plan-warn">That’s {chosen.size} tasks. Good days usually have 3–5 must-dos; the rest can wait.</p>}
            <div className="modal-foot">
              {late.length > 0 && (
                <button type="button" className="btn ghost" onClick={() => setStep('catchup')}>
                  <ArrowLeft size={14} /> Back
                </button>
              )}
              <span className="spacer" />
              <span className="plan-count num">{chosen.size} picked</span>
              <button
                type="button"
                className="btn primary"
                onClick={() => {
                  if (!priority) {
                    const top = pickedTasks.find((x) => x.priority === 'high') ?? pickedTasks[0];
                    if (top) setPriority(top.title);
                  }
                  setStep('priority');
                }}
              >
                Next <ArrowRight size={14} />
              </button>
            </div>
          </>
        )}

        {step === 'priority' && (
          <>
            <p className="plan-lead">If you only got one thing done today, which would make it a win?</p>
            <div className="plan-list" role="radiogroup" aria-label="Today’s #1 priority">
              {pickedTasks.map((x) => (
                <label key={x.id} className={`plan-pick ${!custom && priority === x.title ? 'on' : ''}`}>
                  <input
                    type="radio"
                    name="prio"
                    checked={!custom && priority === x.title}
                    onChange={() => {
                      setCustom(false);
                      setPriority(x.title);
                    }}
                  />
                  <span className="plan-task">
                    <b>{x.title}</b>
                    <TaskChips task={x} due={t} />
                  </span>
                </label>
              ))}
              <label className={`plan-pick ${custom || !pickedTasks.some((x) => x.title === priority) ? 'on' : ''}`}>
                <input type="radio" name="prio" checked={custom || !pickedTasks.some((x) => x.title === priority)} onChange={() => setCustom(true)} />
                <input
                  className="input"
                  placeholder="Something else…"
                  value={custom || !pickedTasks.some((x) => x.title === priority) ? priority : ''}
                  onFocus={() => setCustom(true)}
                  onChange={(e) => {
                    setCustom(true);
                    setPriority(e.target.value);
                  }}
                  maxLength={140}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), finish())}
                />
              </label>
            </div>
            <div className="modal-foot">
              <button type="button" className="btn ghost" onClick={() => setStep('pick')}>
                <ArrowLeft size={14} /> Back
              </button>
              <span className="spacer" />
              <button type="button" className="btn primary" onClick={finish}>
                <CalendarCheck size={14} /> Plan my day
              </button>
            </div>
          </>
        )}

        {step === 'done' && summary && (
          <>
            <div className="plan-done">
              <Sparkles size={26} />
              <p>
                <b>{summary.count}</b> task{summary.count === 1 ? '' : 's'} for today{free ? ` · ${formatDuration(free)} free` : ''}
              </p>
              {summary.title && (
                <p className="plan-done-prio">
                  <Target size={14} /> {summary.title}
                </p>
              )}
            </div>
            <div className="modal-foot">
              <span className="spacer" />
              <button type="button" className="btn ghost" onClick={onClose}>
                Close
              </button>
              {summary.title && (
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => {
                    timerActions.setMode('focus');
                    timerActions.start();
                    toast(`Focusing on “${summary.title}”`);
                    onClose();
                  }}
                >
                  <Play size={14} /> Start focusing on #1
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}

function TaskChips({ task, due = task.dueDate }: { task: Task; due?: string | null }) {
  return (
    <span className="plan-chips">
      {task.priority === 'high' && <span className="chip high">High</span>}
      {due && <span className={`chip ${due < todayKey() ? 'overdue' : ''}`}>{dueLabel(due)}</span>}
    </span>
  );
}

function PickGroup({ title, tasks, chosen, onToggle, dueOn }: {
  title: string;
  tasks: Task[];
  chosen: Set<string>;
  onToggle: (id: string) => void;
  dueOn?: (t: Task) => string | null | undefined;
}) {
  if (!tasks.length) return null;
  return (
    <div>
      <div className="task-section">{title}</div>
      {tasks.map((x) => {
        const on = chosen.has(x.id);
        return (
          <button key={x.id} type="button" className={`plan-pick ${on ? 'on' : ''}`} role="checkbox" aria-checked={on} onClick={() => onToggle(x.id)}>
            <span className={`check ${on ? 'on' : ''}`} data-p={x.priority} aria-hidden>
              <Check size={13} strokeWidth={3} />
            </span>
            <span className="plan-task">
              <b>{x.title}</b>
              <TaskChips task={x} due={dueOn ? dueOn(x) : x.dueDate} />
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Prompt on the Today tab ---------- */

const SKIP_KEY = 'daily-dashboard:plan-skipped';

/** A gentle nudge at the top of Today until you've planned (or skipped) the day. Hidden after 3pm. */
export function PlanPrompt({ onPlan }: { onPlan: () => void }) {
  const now = useNow(60_000);
  const t = todayKey();
  const isPlanned = useStore((x) => planned(x, t));
  const lateCount = useStore((x) => overdue(x, t).length);
  const [skipped, setSkipped] = useState(() => {
    try {
      return localStorage.getItem(SKIP_KEY) === t;
    } catch {
      return false;
    }
  });
  if (isPlanned || skipped || now.getHours() >= 15) return null;
  return (
    <div className="card plan-prompt">
      <span className="plan-prompt-icon">
        <Sunrise size={18} />
      </span>
      <div>
        <b>Plan your day</b>
        <small>{lateCount ? `${lateCount} overdue to sort out, then pick today’s tasks and your #1.` : 'Pick today’s tasks and your #1 priority. Takes about a minute.'}</small>
      </div>
      <button className="btn primary sm" onClick={onPlan}>
        Start <kbd>P</kbd>
      </button>
      <button
        className="icon-btn sm"
        aria-label="Skip planning today"
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
