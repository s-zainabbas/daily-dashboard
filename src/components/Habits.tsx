import { useState } from 'react';
import { Flame, Pencil, Plus, Repeat, Trash2 } from 'lucide-react';
import { fromKey, lastDays, today } from '../lib/date';
import { bestStreak, countOn, habitStreak, isDone, isScheduled, successRate } from '../lib/habits';
import { DAY_SHORT, MON_FIRST } from '../lib/repeat';
import { actions, useStore } from '../lib/store';
import type { Habit } from '../lib/types';
import { Card, Dialog, DialogHead, Empty, toast } from './ui';

export function Habits() {
  const habits = useStore((s) => s.habits);
  const [editing, setEditing] = useState<Habit | 'new' | null>(null);
  const t = today();
  const days = lastDays(7, t);

  return (
    <Card
      title="Habits"
      icon={<Repeat size={16} />}
      meta="Last 7 days"
      actions={
        <button className="icon-btn sm" onClick={() => setEditing('new')} aria-label="New habit" title="New habit">
          <Plus size={16} />
        </button>
      }
    >
      {habits.length === 0 ? (
        <Empty icon={<Repeat size={28} />} title="Small things, every day">
          Track a habit like “Read 20 pages”, “Gym Mon/Wed/Fri” or “8 glasses of water”.
        </Empty>
      ) : (
        <div className="habits">
          {habits.map((h) => {
            const s = habitStreak(h, t);
            const counted = !!h.target && h.target > 1;
            return (
              <div className="habit" key={h.id}>
                <div className="habit-name">
                  <span title={h.name}>{h.name}</span>
                  {s > 0 && (
                    <span className={`habit-streak num ${s >= 5 ? 'hot' : ''}`} title={`${s} in a row`}>
                      <Flame size={11} /> {s}
                    </span>
                  )}
                  <button className="icon-btn sm habit-menu" onClick={() => setEditing(h)} aria-label={`Edit ${h.name}`}>
                    <Pencil size={12} />
                  </button>
                </div>
                <div className="habit-days">
                  {days.map((d) => {
                    const on = isScheduled(h, d);
                    const done = isDone(h, d);
                    const n = countOn(h, d);
                    const label = fromKey(d).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
                    if (!on && !n) {
                      return (
                        <span key={d} className={`habit-day off ${d === t ? 'today' : ''}`} title={`Rest day · ${label}`}>
                          –
                        </span>
                      );
                    }
                    return (
                      <button
                        key={d}
                        className={`habit-day ${done ? 'on' : ''} ${counted && n && !done ? 'part' : ''} ${d === t ? 'today' : ''}`}
                        style={counted && !done ? { ['--fill' as string]: `${(n / h.target!) * 100}%` } : undefined}
                        aria-pressed={done}
                        aria-label={`${h.name} on ${label}${counted ? `: ${n} of ${h.target}` : ''}`}
                        title={counted ? `${n}/${h.target} · click +1, right-click −1` : undefined}
                        onClick={(e) => actions.toggleHabit(h.id, d, e.shiftKey ? -1 : 1)}
                        onContextMenu={(e) => {
                          if (!counted) return;
                          e.preventDefault();
                          actions.toggleHabit(h.id, d, -1);
                        }}
                      >
                        {counted ? (done ? '✓' : n || fromKey(d).toLocaleDateString(undefined, { weekday: 'narrow' })) : done ? '✓' : fromKey(d).toLocaleDateString(undefined, { weekday: 'narrow' })}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <HabitEditor habit={editing} onClose={() => setEditing(null)} />
    </Card>
  );
}

function HabitEditor({ habit, onClose }: { habit: Habit | 'new' | null; onClose: () => void }) {
  const init = habit && habit !== 'new' ? habit : undefined;
  const [name, setName] = useState('');
  const [days, setDays] = useState<number[]>([]);
  const [target, setTarget] = useState(1);
  const [forHabit, setForHabit] = useState<unknown>(null);
  if (habit !== forHabit) {
    setForHabit(habit);
    setName(init?.name ?? '');
    setDays(init?.days ?? []);
    setTarget(init?.target ?? 1);
  }
  const live = useStore((s) => s.habits.find((h) => h.id === init?.id));
  const t = today();

  return (
    <Dialog open={!!habit} onClose={onClose} label={init ? 'Edit habit' : 'New habit'}>
      <DialogHead title={init ? 'Edit habit' : 'New habit'} onClose={onClose} />
      <form
        className="modal-body"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          const rule = { days: days.length && days.length < 7 ? [...days].sort() : undefined, target: target > 1 ? target : undefined };
          init ? actions.updateHabit(init.id, { name: name.trim(), ...rule }) : actions.addHabit(name.trim(), rule);
          onClose();
        }}
      >
        <label className="field">
          <span>Habit</span>
          <input className="input" autoFocus required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Meditate 10 minutes" />
        </label>
        <div className="field">
          <span>On these days</span>
          <div className="segmented repeat-days" role="group" aria-label="Days">
            {MON_FIRST.map((d) => {
              const on = !days.length || days.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  aria-label={DAY_SHORT[d]}
                  onClick={() => {
                    const all = days.length ? days : [0, 1, 2, 3, 4, 5, 6];
                    const next = on ? all.filter((x) => x !== d) : [...all, d];
                    if (next.length) setDays(next.length === 7 ? [] : next);
                  }}
                >
                  {DAY_SHORT[d].slice(0, 2)}
                </button>
              );
            })}
          </div>
          <small>{!days.length ? 'Every day' : `Only on ${MON_FIRST.filter((d) => days.includes(d)).map((d) => DAY_SHORT[d]).join(', ')} — streaks skip the other days`}</small>
        </div>
        <label className="field">
          <span>Times a day</span>
          <div className="repeat-row">
            <input className="input num" type="number" min={1} max={99} value={target} onChange={(e) => setTarget(Math.max(1, Math.min(99, Number(e.target.value) || 1)))} style={{ width: 80 }} />
            <small>{target > 1 ? `Done at ${target}, e.g. glasses of water. Click to add one, right-click to remove one.` : 'A simple yes / no each day'}</small>
          </div>
        </label>

        {live && <HabitHistory habit={live} today={t} />}

        <div className="modal-foot">
          {init && (
            <button
              type="button"
              className="btn ghost danger"
              onClick={() => {
                actions.removeHabit(init.id);
                toast(`Removed “${init.name}”`);
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
          <button className="btn primary">{init ? 'Save' : 'Add habit'}</button>
        </div>
      </form>
    </Dialog>
  );
}

/** Last 90 days as a heatmap (weeks across, Monday to Sunday down), plus the numbers. */
function HabitHistory({ habit, today: t }: { habit: Habit; today: string }) {
  // Start on a Monday so each column is one week.
  const all = lastDays(91 + ((fromKey(t).getDay() + 6) % 7), t);
  const firstMonday = all.findIndex((d) => fromKey(d).getDay() === 1);
  const days = all.slice(firstMonday);
  const weeks: string[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  const rate = Math.round(successRate(habit, t, 30) * 100);
  return (
    <div className="field">
      <span>Last 90 days</span>
      <div className="heatmap" role="img" aria-label={`${habit.name}: ${rate}% of days done in the last 30 days`}>
        {weeks.map((w, i) => (
          <div key={i} className="heat-week">
            {w.map((d) => {
              const on = isScheduled(habit, d);
              const done = isDone(habit, d);
              const part = !done && countOn(habit, d) > 0;
              return <i key={d} className={done ? 'done' : part ? 'part' : on ? '' : 'off'} title={`${fromKey(d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}${done ? ' · done' : part ? ` · ${countOn(habit, d)}/${habit.target}` : on ? '' : ' · rest day'}`} />;
            })}
          </div>
        ))}
      </div>
      <div className="habit-numbers num">
        <span>
          <b>{rate}%</b> last 30 days
        </span>
        <span>
          <b>{habitStreak(habit, t)}</b> current streak
        </span>
        <span>
          <b>{bestStreak(habit, t)}</b> best streak
        </span>
      </div>
    </div>
  );
}
