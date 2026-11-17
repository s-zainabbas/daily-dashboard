import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronLeft, Pause, Pencil, Play, Plus, RotateCcw, SkipForward, Sparkles, Trash2, Workflow } from 'lucide-react';
import { formatDuration, today as todayKey } from '../lib/date';
import { useNow } from '../lib/hooks';
import { DAY_SHORT, MON_FIRST } from '../lib/repeat';
import { parseSteps, routineOn, routineProgress, stepsText, TEMPLATES } from '../lib/routines';
import { actions, getState, uid, useStore } from '../lib/store';
import { chime } from '../lib/timer';
import type { Routine } from '../lib/types';
import { Card, Dialog, DialogHead, toast } from './ui';

/** Today: your routines for the day, with progress and a button to run one step by step. */
export function RoutinesCard() {
  const routines = useStore((s) => s.routines);
  const t = dateNow();
  const todays = routines.filter((r) => routineOn(r, t));
  const [running, setRunning] = useState<string | null>(null);
  const [editing, setEditing] = useState<Routine | 'new' | null>(null);
  const [template, setTemplate] = useState<(typeof TEMPLATES)[number] | null>(null);

  return (
    <Card
      title="Routines"
      icon={<Workflow size={16} />}
      meta={todays.length ? `${todays.filter((r) => routineProgress(r, t).complete).length} of ${todays.length} done` : undefined}
      className="routines-card"
      actions={
        <button className="icon-btn sm" onClick={() => setEditing('new')} aria-label="New routine" title="New routine">
          <Plus size={15} />
        </button>
      }
    >
      {routines.length === 0 ? (
        <div className="routine-empty">
          <p>Step-by-step routines with a timer for each step — so mornings and evenings run on rails.</p>
          <div className="row">
            {TEMPLATES.map((x) => (
              <button
                key={x.name}
                className="btn sm"
                onClick={() => {
                  setTemplate(x);
                  setEditing('new');
                }}
              >
                <Plus size={13} /> {x.name}
              </button>
            ))}
          </div>
        </div>
      ) : todays.length === 0 ? (
        <p className="chart-empty">No routines today.</p>
      ) : (
        <div className="routine-list">
          {todays.map((r) => {
            const p = routineProgress(r, t);
            return (
              <div key={r.id} className={`routine ${p.complete ? 'complete' : ''}`}>
                <button className="routine-main" onClick={() => setRunning(r.id)}>
                  <span className="routine-name">
                    <b>{r.name}</b>
                    <small className="num">
                      {p.n}/{p.total} steps{p.minutes ? ` · ${formatDuration(p.minutes)}` : ''}
                    </small>
                  </span>
                  <span className="routine-bar" aria-hidden>
                    <i style={{ width: `${p.total ? (p.n / p.total) * 100 : 0}%` }} />
                  </span>
                </button>
                <button className="icon-btn sm routine-edit" onClick={() => setEditing(r)} aria-label={`Edit ${r.name}`}>
                  <Pencil size={13} />
                </button>
                <button className={`icon-btn sm ${p.complete ? 'done' : 'go'}`} onClick={() => setRunning(r.id)} aria-label={p.complete ? `${r.name} done` : `Start ${r.name}`}>
                  {p.complete ? <Check size={15} /> : <Play size={14} />}
                </button>
              </div>
            );
          })}
        </div>
      )}
      <RoutineRunner id={running} onClose={() => setRunning(null)} />
      <RoutineEditor
        value={editing}
        template={template}
        onClose={() => {
          setEditing(null);
          setTemplate(null);
        }}
      />
    </Card>
  );
}

const dateNow = () => todayKey();

/** Run a routine: one step at a time, with a countdown for steps that have a time. */
function RoutineRunner({ id, onClose }: { id: string | null; onClose: () => void }) {
  const r = useStore((s) => s.routines.find((x) => x.id === id));
  const t = dateNow();
  const p = r ? routineProgress(r, t) : null;
  const firstOpen = r?.steps.findIndex((s) => !p!.done.has(s.id)) ?? -1;
  const [at, setAt] = useState(0);
  const [timer, setTimer] = useState<{ endsAt?: number; left: number; running: boolean } | null>(null);
  const now = useNow(timer?.running ? 250 : 60_000);

  // Opening a routine starts at its first unfinished step.
  useEffect(() => {
    if (id) setAt(Math.max(0, firstOpen));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const step = r?.steps[at];
  // A fresh timer for each step.
  useEffect(() => {
    setTimer(step?.minutes ? { left: step.minutes * 60_000, running: false } : null);
  }, [step?.id, step?.minutes]);

  const left = timer ? (timer.running && timer.endsAt ? Math.max(0, timer.endsAt - now.getTime()) : timer.left) : 0;
  useEffect(() => {
    if (timer?.running && left === 0) {
      setTimer({ left: 0, running: false });
      if (getState().settings.sound) chime();
    }
  }, [left, timer?.running]);

  if (!r || !p) return null;
  const complete = p.complete;
  const goNext = () => {
    const next = r.steps.findIndex((s, i) => i > at && !p.done.has(s.id));
    setAt(next >= 0 ? next : Math.min(at + 1, r.steps.length - 1));
  };
  const markDone = () => {
    if (!step) return;
    actions.setRoutineStep(r.id, step.id, true, t);
    if (p.n + (p.done.has(step.id) ? 0 : 1) === p.total) toast(`${r.name} done ✓`);
    goNext();
  };
  const mmss = (ms: number) => {
    const s = Math.ceil(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  return (
    <Dialog open={!!id} onClose={onClose} className="modal routine-modal" label={r.name}>
      <DialogHead
        title={
          <span className="plan-title">
            <Workflow size={16} /> {r.name}
            <small className="num">
              {p.n} of {p.total}
            </small>
          </span>
        }
        onClose={onClose}
      />
      <div className="plan-progress" aria-hidden>
        {r.steps.map((s) => (
          <i key={s.id} className={p.done.has(s.id) ? 'on' : ''} />
        ))}
      </div>
      <div className="modal-body routine-run">
        {complete ? (
          <div className="plan-done">
            <Sparkles size={26} />
            <p>
              <b>{r.name}</b> done for today.
            </p>
          </div>
        ) : step ? (
          <div className="routine-step">
            <small className="num">
              Step {at + 1} of {r.steps.length}
            </small>
            <h3>{step.title}</h3>
            {timer && (
              <div className={`routine-timer num ${left === 0 ? 'up' : ''}`}>
                <span>{left === 0 ? 'Time’s up' : mmss(left)}</span>
                <div className="routine-timer-btns">
                  {left > 0 && (
                    <button
                      className="btn"
                      onClick={() => setTimer(timer.running ? { left, running: false } : { left, running: true, endsAt: Date.now() + left })}
                    >
                      {timer.running ? <Pause size={14} /> : <Play size={14} />} {timer.running ? 'Pause' : 'Start timer'}
                    </button>
                  )}
                  <button className="icon-btn sm" onClick={() => setTimer({ left: step.minutes! * 60_000, running: false })} aria-label="Restart timer">
                    <RotateCcw size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : null}

        <ol className="routine-steps">
          {r.steps.map((s, i) => (
            <li key={s.id} className={`${i === at && !complete ? 'cur' : ''} ${p.done.has(s.id) ? 'done' : ''}`}>
              <button className={`check round ${p.done.has(s.id) ? 'on' : ''}`} role="checkbox" aria-checked={p.done.has(s.id)} aria-label={s.title} onClick={() => actions.setRoutineStep(r.id, s.id, !p.done.has(s.id), t)}>
                {p.done.has(s.id) && <Check size={12} />}
              </button>
              <button className="routine-step-title" onClick={() => setAt(i)}>
                {s.title}
              </button>
              {s.minutes ? <small className="num">{formatDuration(s.minutes)}</small> : null}
            </li>
          ))}
        </ol>

        <div className="modal-foot">
          {complete ? (
            <>
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  r.steps.forEach((s) => actions.setRoutineStep(r.id, s.id, false, t));
                  setAt(0);
                }}
              >
                <RotateCcw size={14} /> Start over
              </button>
              <span className="spacer" />
              <button type="button" className="btn primary" onClick={onClose}>
                Close
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn ghost" disabled={at === 0} onClick={() => setAt(at - 1)}>
                <ChevronLeft size={14} /> Back
              </button>
              <span className="spacer" />
              <button type="button" className="btn ghost" onClick={goNext} disabled={at >= r.steps.length - 1}>
                <SkipForward size={14} /> Skip
              </button>
              <button type="button" className="btn primary" onClick={markDone}>
                <Check size={14} /> Done
              </button>
            </>
          )}
        </div>
      </div>
    </Dialog>
  );
}

function RoutineEditor({ value, template, onClose }: { value: Routine | 'new' | null; template: (typeof TEMPLATES)[number] | null; onClose: () => void }) {
  const init = value && value !== 'new' ? value : undefined;
  const [form, setForm] = useState({ name: '', steps: '', days: [] as number[] });
  const [forValue, setForValue] = useState<unknown>(null);
  if (value !== forValue) {
    setForValue(value);
    setForm({ name: init?.name ?? template?.name ?? '', steps: init ? stepsText(init.steps) : template?.steps ?? '', days: init?.days ?? template?.days ?? [] });
  }
  const steps = useMemo(() => parseSteps(form.steps, uid), [form.steps]);
  const total = steps.reduce((n, s) => n + (s.minutes ?? 0), 0);

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !steps.length) return;
    // Keep step ids for unchanged titles, so today's ticks survive an edit.
    const byTitle = new Map(init?.steps.map((s) => [s.title, s.id]));
    const kept = steps.map((s) => ({ ...s, id: byTitle.get(s.title) ?? s.id }));
    actions.saveRoutine({ id: init?.id, name: form.name.trim(), steps: kept, days: form.days.length && form.days.length < 7 ? form.days : undefined, log: init?.log });
    onClose();
  }

  // No days chosen means every day; untick one to pick days.
  const toggleDay = (d: number) =>
    setForm((f) => {
      const all = f.days.length ? f.days : [0, 1, 2, 3, 4, 5, 6];
      const next = all.includes(d) ? all.filter((x) => x !== d) : [...all, d];
      return next.length ? { ...f, days: next.length === 7 ? [] : next } : f;
    });

  return (
    <Dialog open={!!value} onClose={onClose} label={init ? 'Edit routine' : 'New routine'}>
      <DialogHead title={init ? 'Edit routine' : 'New routine'} onClose={onClose} />
      <form className="modal-body" onSubmit={save}>
        <label className="field">
          <span>Name</span>
          <input className="input" autoFocus data-autofocus required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Morning routine" />
        </label>
        <label className="field">
          <span>Steps — one per line, with an optional time (“Stretch 5m”)</span>
          <textarea className="input" rows={6} value={form.steps} onChange={(e) => setForm({ ...form, steps: e.target.value })} placeholder={'Drink water 1m\nStretch 5m\nReview the plan 5m'} />
        </label>
        <small className="muted" style={{ marginTop: -6 }}>
          {steps.length} step{steps.length === 1 ? '' : 's'}
          {total ? ` · about ${formatDuration(total)}` : ''}
        </small>
        <div className="field">
          <span>On these days</span>
          <div className="segmented repeat-days" role="group" aria-label="Days">
            {MON_FIRST.map((d) => (
              <button key={d} type="button" aria-pressed={!form.days.length || form.days.includes(d)} aria-label={DAY_SHORT[d]} onClick={() => toggleDay(d)}>
                {DAY_SHORT[d].slice(0, 2)}
              </button>
            ))}
          </div>
        </div>
        <div className="modal-foot">
          {init && (
            <button
              type="button"
              className="btn ghost danger"
              onClick={() => {
                const undo = actions.removeRoutine(init.id);
                toast('Routine deleted', { label: 'Undo', run: undo });
                onClose();
              }}
            >
              <Trash2 size={14} /> Delete
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary">{init ? 'Save' : 'Add routine'}</button>
        </div>
      </form>
    </Dialog>
  );
}
