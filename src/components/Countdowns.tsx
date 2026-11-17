import { useEffect, useMemo, useState } from 'react';
import { Hourglass, Plus, Trash2 } from 'lucide-react';
import { inDays, upcoming } from '../lib/countdowns';
import { fromKey, today as todayKey } from '../lib/date';
import { useNow } from '../lib/hooks';
import { actions, getState, useStore } from '../lib/store';
import type { Countdown } from '../lib/types';
import { Dialog, DialogHead, toast } from './ui';

export const NEW_COUNTDOWN_EVENT = 'dd:new-countdown';
const SHOW = 5;
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

/** A slim strip on Today: birthdays, trips and deadlines coming up, with how long to go. */
export function CountdownStrip() {
  const now = useNow(60 * 60_000);
  const list = useStore((s) => s.countdowns);
  const t = todayKey();
  const items = useMemo(() => upcoming(list, t), [list, t, now]); // eslint-disable-line react-hooks/exhaustive-deps
  const open = (c: Countdown | 'new') => window.dispatchEvent(c === 'new' ? new CustomEvent(NEW_COUNTDOWN_EVENT) : new CustomEvent('dd:open-countdown', { detail: c.id }));

  return (
    <div className="countdowns" aria-label="Countdowns">
        {items.slice(0, SHOW).map(({ c, days, nth }) => (
          <button key={c.id} className={`countdown ${days === 0 ? 'today' : days <= 7 ? 'soon' : ''}`} onClick={() => open(c)} title={fromKey(c.date).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: c.yearly ? undefined : 'numeric' })}>
            <span className="countdown-emoji" aria-hidden>
              {c.emoji || <Hourglass size={13} />}
            </span>
            <span className="truncate">
              {c.title}
              {nth && c.yearly ? <small> · {ordinal(nth)}</small> : null}
            </span>
            <b className="num">{inDays(days)}</b>
          </button>
        ))}
        {items.length > SHOW && <span className="countdown-more">+{items.length - SHOW} more in the calendar</span>}
        <button className="countdown add" onClick={() => open('new')} aria-label="Add a countdown">
          <Plus size={13} /> {items.length ? '' : 'Countdown'}
        </button>
    </div>
  );
}

/** The countdown editor, opened from Today, the calendar or the command menu (mounted once in App). */
export function CountdownDialogs() {
  const [editing, setEditing] = useState<Countdown | 'new' | null>(null);
  useEffect(() => {
    const open = (e: Event) => {
      const c = getState().countdowns.find((x) => x.id === (e as CustomEvent<string>).detail);
      if (c) setEditing(c);
    };
    const add = () => setEditing('new');
    window.addEventListener('dd:open-countdown', open);
    window.addEventListener(NEW_COUNTDOWN_EVENT, add);
    return () => {
      window.removeEventListener('dd:open-countdown', open);
      window.removeEventListener(NEW_COUNTDOWN_EVENT, add);
    };
  }, []);
  return <CountdownEditor value={editing} onClose={() => setEditing(null)} />;
}

function CountdownEditor({ value, onClose }: { value: Countdown | 'new' | null; onClose: () => void }) {
  const init = value && value !== 'new' ? value : undefined;
  const [form, setForm] = useState({ title: '', date: '', yearly: false, emoji: '' });
  const [forValue, setForValue] = useState<unknown>(null);
  if (value !== forValue) {
    setForValue(value);
    setForm({ title: init?.title ?? '', date: init?.date ?? '', yearly: init?.yearly ?? false, emoji: init?.emoji ?? '' });
  }
  const set = (p: Partial<typeof form>) => setForm((f) => ({ ...f, ...p }));

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.date) return;
    actions.saveCountdown({ id: init?.id, title: form.title.trim(), date: form.date, yearly: form.yearly || undefined, emoji: form.emoji.trim() || undefined });
    onClose();
  }

  return (
    <Dialog open={!!value} onClose={onClose} label={init ? 'Edit countdown' : 'New countdown'}>
      <DialogHead title={init ? 'Edit countdown' : 'New countdown'} onClose={onClose} />
      <form className="modal-body" onSubmit={save}>
        <div className="row">
          <label className="field" style={{ flex: '0 0 70px' }}>
            <span>Emoji</span>
            <input className="input" value={form.emoji} maxLength={4} onChange={(e) => set({ emoji: e.target.value })} placeholder="🎂" />
          </label>
          <label className="field">
            <span>What</span>
            <input className="input" autoFocus data-autofocus required value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="Mum’s birthday, trip to Lisbon, launch…" />
          </label>
        </div>
        <label className="field">
          <span>{form.yearly ? 'Date (the first one, e.g. birth date)' : 'Date'}</span>
          <input className="input" type="date" required value={form.date} onChange={(e) => set({ date: e.target.value })} />
        </label>
        <label className="check-row">
          <input type="checkbox" checked={form.yearly} onChange={(e) => set({ yearly: e.target.checked })} />
          <span>Every year (birthdays, anniversaries)</span>
        </label>
        <div className="modal-foot">
          {init && (
            <button
              type="button"
              className="btn ghost danger"
              onClick={() => {
                const undo = actions.removeCountdown(init.id);
                toast('Countdown deleted', { label: 'Undo', run: undo });
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
          <button className="btn primary">{init ? 'Save' : 'Add'}</button>
        </div>
      </form>
    </Dialog>
  );
}
