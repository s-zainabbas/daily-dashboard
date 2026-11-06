import { useLayoutEffect, useRef } from 'react';
import { Check, Play, Target } from 'lucide-react';
import { actions, useStore } from '../lib/store';
import { timerActions } from '../lib/timer';
import { toast } from './ui';

export function Priority() {
  const p = useStore((s) => s.priority);
  const ref = useRef<HTMLTextAreaElement>(null);
  // Grow with the text where CSS `field-sizing` isn't supported yet (Safari, Firefox).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || CSS.supports('field-sizing', 'content')) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [p.title]);
  return (
    <section className={`card priority ${p.done ? 'done' : ''}`} aria-label="Today’s number one priority">
      <div className="eyebrow">
        <Target size={13} /> Today’s #1 priority
      </div>
      <div className="priority-row">
        <label htmlFor="priority" className="sr-only">
          Today’s top priority
        </label>
        <textarea
          id="priority"
          ref={ref}
          className="priority-input"
          rows={1}
          value={p.title}
          maxLength={140}
          placeholder="What would make today a win?"
          onChange={(e) => actions.setPriority({ title: e.target.value.replace(/\n/g, ' ') })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
        />
        <button
          className={`big-check ${p.done ? 'on' : ''}`}
          disabled={!p.title.trim()}
          aria-pressed={p.done}
          aria-label={p.done ? 'Mark priority as not done' : 'Mark priority as done'}
          onClick={() => {
            actions.setPriority({ done: !p.done });
            if (!p.done) toast('Priority done. Everything else today is a bonus.');
          }}
        >
          <Check size={20} strokeWidth={2.5} />
        </button>
      </div>
      <div className="priority-foot">
        {p.done ? (
          <span>Done — well played. It’ll be saved in tonight’s journal entry.</span>
        ) : p.title.trim() ? (
          <>
            <span style={{ flex: 1 }}>Protect time for this before anything else.</span>
            <button
              className="btn sm"
              onClick={() => {
                timerActions.setMode('focus');
                timerActions.setTask('priority');
                timerActions.start();
                document.getElementById('focus')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }}
            >
              <Play size={12} /> Focus on it
            </button>
          </>
        ) : (
          <span>Pick the one thing that matters most. Everything else can wait.</span>
        )}
      </div>
    </section>
  );
}
