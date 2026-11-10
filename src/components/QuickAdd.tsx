import { forwardRef, useMemo, useState } from 'react';
import { CalendarClock, CheckCircle2, CornerDownLeft, Flag, Plus, Repeat as RepeatIcon } from 'lucide-react';
import { dueLabel, dueLabelInline, formatTime } from '../lib/date';
import { parseQuick } from '../lib/parse';
import { repeatLabel } from '../lib/repeat';
import { actions, useStore } from '../lib/store';
import { toast } from './ui';

const EXAMPLES = ['Call Sam tomorrow !high', 'Standup at 9:30 for 15m', 'Dentist fri 3-4pm', 'Send invoice nov 14', 'Gym every mon wed fri', 'Pay rent monthly'];

export const QuickAdd = forwardRef<HTMLInputElement>(function QuickAdd(_, ref) {
  const [text, setText] = useState('');
  const [example] = useState(() => EXAMPLES[Math.floor(Math.random() * EXAMPLES.length)]);
  const use24h = useStore((s) => s.settings.use24h);
  const p = useMemo(() => parseQuick(text), [text]);
  const ready = p.title.length > 0;

  function submit() {
    if (!ready) return;
    if (p.kind === 'event') {
      actions.addEvent({ title: p.title, date: p.date!, start: p.start, end: p.end });
      toast(`Event added · ${dueLabel(p.date!)} ${formatTime(p.start!, use24h)}`);
    } else {
      actions.addTask({ title: p.title, dueDate: p.date, priority: p.priority ?? 'med', repeat: p.repeat });
      toast(p.repeat && p.date ? `Repeating task added · ${repeatLabel(p.repeat)}, first one ${dueLabelInline(p.date)}` : `Task added${p.date ? ` · ${dueLabel(p.date)}` : ''}`);
    }
    setText('');
  }

  return (
    <div className="quick">
      <div className="quick-box">
        <Plus size={18} />
        <label htmlFor="quick" className="sr-only">
          Quick add a task or event
        </label>
        <input
          id="quick"
          ref={ref}
          value={text}
          autoComplete="off"
          placeholder={`Add a task or event — try “${example}”`}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
            if (e.key === 'Escape') {
              setText('');
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
        <span className="kbd-hint">
          <kbd>/</kbd>
        </span>
        <button className="btn primary" onClick={submit} disabled={!ready}>
          Add <CornerDownLeft size={14} />
        </button>
      </div>
      <div className="quick-hint" aria-live="polite">
        {ready ? (
          <>
            <span className="chip accent">
              {p.kind === 'event' ? <CalendarClock size={12} /> : <CheckCircle2 size={12} />}
              {p.kind === 'event' ? 'Event' : 'Task'}
            </span>
            {p.date && <span className="chip">{p.repeat ? `From ${dueLabelInline(p.date)}` : dueLabel(p.date)}</span>}
            {p.repeat && (
              <span className="chip accent">
                <RepeatIcon size={11} /> {repeatLabel(p.repeat)}
              </span>
            )}
            {p.start && (
              <span className="chip num">
                {formatTime(p.start, use24h)}
                {p.end ? ` – ${formatTime(p.end, use24h)}` : ''}
              </span>
            )}
            {p.priority && (
              <span className={`chip ${p.priority}`}>
                <Flag size={11} /> {p.priority === 'med' ? 'Medium' : p.priority === 'high' ? 'High' : 'Low'}
              </span>
            )}
            <span>“{p.title}”</span>
          </>
        ) : (
          <span className="examples">
            Understands dates (<b>tomorrow</b>, <b>fri</b>, <b>nov 14</b>), times (<b>3pm</b>, <b>9-10:30</b>) and priority (<b>!high</b>) and repeats (<b>every mon</b>, <b>daily</b>). Add a time to make it an event.
          </span>
        )}
      </div>
    </div>
  );
});
