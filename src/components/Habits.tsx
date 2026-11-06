import { useState } from 'react';
import { Flame, Pencil, Plus, Repeat, Trash2 } from 'lucide-react';
import { fromKey, lastDays, streak, today } from '../lib/date';
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
          Track a habit like “Read 20 pages” or “Walk 8k steps”.
        </Empty>
      ) : (
        <div className="habits">
          {habits.map((h) => {
            const s = streak(h.history, t);
            return (
              <div className="habit" key={h.id}>
                <div className="habit-name">
                  <span title={h.name}>{h.name}</span>
                  {s > 0 && (
                    <span className={`habit-streak num ${s >= 5 ? 'hot' : ''}`} title={`${s}-day streak`}>
                      <Flame size={11} /> {s}
                    </span>
                  )}
                  <button className="icon-btn sm habit-menu" onClick={() => setEditing(h)} aria-label={`Edit ${h.name}`}>
                    <Pencil size={12} />
                  </button>
                </div>
                <div className="habit-days">
                  {days.map((d) => (
                    <button
                      key={d}
                      className={`habit-day ${h.history[d] ? 'on' : ''} ${d === t ? 'today' : ''}`}
                      aria-pressed={!!h.history[d]}
                      aria-label={`${h.name} on ${fromKey(d).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}`}
                      onClick={() => actions.toggleHabit(h.id, d)}
                    >
                      {h.history[d] ? '✓' : fromKey(d).toLocaleDateString(undefined, { weekday: 'narrow' })}
                    </button>
                  ))}
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
  const [forHabit, setForHabit] = useState<unknown>(null);
  if (habit !== forHabit) {
    setForHabit(habit);
    setName(init?.name ?? '');
  }
  const total = init ? Object.values(init.history).filter(Boolean).length : 0;
  return (
    <Dialog open={!!habit} onClose={onClose} label={init ? 'Edit habit' : 'New habit'}>
      <DialogHead title={init ? 'Edit habit' : 'New habit'} onClose={onClose} />
      <form
        className="modal-body"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          init ? actions.renameHabit(init.id, name.trim()) : actions.addHabit(name.trim());
          onClose();
        }}
      >
        <label className="field">
          <span>Habit</span>
          <input className="input" autoFocus required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Meditate 10 minutes" />
          {init && <small>Checked off {total} time{total === 1 ? '' : 's'} · current streak {streak(init.history)} days</small>}
        </label>
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
