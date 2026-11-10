import { Minimize2, Pause, Play, RotateCcw } from 'lucide-react';
import { formatDuration, today } from '../lib/date';
import { useNow } from '../lib/hooks';
import { useStore } from '../lib/store';
import { remainingMs, timerActions, totalMs, useTimer } from '../lib/timer';
import { fmtClock } from './Focus';
import { Dialog } from './ui';

/** Full-screen focus: just the timer and what you're working on. Esc to leave. */
export function FocusMode({ open, onClose }: { open: boolean; onClose: () => void }) {
  return open ? <FocusScreen onClose={onClose} /> : null;
}

function FocusScreen({ onClose }: { onClose: () => void }) {
  const timer = useTimer();
  useNow(1000);
  const tasks = useStore((s) => s.tasks);
  const priority = useStore((s) => s.priority);
  const day = useStore((s) => s.focus[today()]);
  const running = !!timer.endsAt;
  const left = remainingMs(timer);
  const total = totalMs(timer);
  const progress = total ? 1 - left / total : 0;
  const open = tasks.filter((t) => !t.done && !t.waitingOn);
  const current = timer.taskId === 'priority' ? priority.title : tasks.find((t) => t.id === timer.taskId)?.title;
  const R = 150;
  const C = 2 * Math.PI * R;

  return (
    <Dialog open onClose={onClose} className="focus-mode" label="Focus mode">
      <button className="icon-btn focus-mode-exit" onClick={onClose} aria-label="Leave focus mode (Esc)" title="Leave focus mode (Esc)">
        <Minimize2 size={18} />
      </button>
      <div className="focus-mode-body">
        <div className="focus-mode-kind">{timer.mode === 'focus' ? (running ? 'Focusing' : 'Ready to focus') : 'Break'}</div>
        {timer.mode === 'focus' &&
          (current ? (
            <h2 className="focus-mode-task">{current}</h2>
          ) : (
            <select className="select input focus-mode-pick" value="" onChange={(e) => timerActions.setTask(e.target.value || undefined)} aria-label="What are you working on?">
              <option value="">What are you working on?</option>
              {priority.title && !priority.done && <option value="priority">★ {priority.title}</option>}
              {open.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          ))}
        <div className="focus-mode-dial">
          <svg viewBox="0 0 340 340" aria-hidden>
            <circle className="track" cx="170" cy="170" r={R} strokeWidth="6" />
            <circle className="bar" cx="170" cy="170" r={R} strokeWidth="6" strokeDasharray={C} strokeDashoffset={C * (1 - progress)} />
          </svg>
          <div className="focus-mode-time num" role="timer">
            {fmtClock(left)}
          </div>
        </div>
        <div className="focus-controls">
          <button className="btn primary lg" onClick={timerActions.toggle} autoFocus>
            {running ? <Pause size={16} /> : <Play size={16} />}
            {running ? 'Pause' : left < total ? 'Resume' : 'Start'}
          </button>
          <button className="btn lg" onClick={timerActions.reset} aria-label="Reset timer" title="Reset">
            <RotateCcw size={16} />
          </button>
        </div>
        <p className="focus-mode-foot num">
          Today {formatDuration(day?.minutes ?? 0)} · {day?.sessions ?? 0} session{day?.sessions === 1 ? '' : 's'}
          {current && timer.mode === 'focus' ? ' · ' : ''}
          {current && timer.mode === 'focus' && (
            <button className="linkish" onClick={() => timerActions.setTask(undefined)}>
              change task
            </button>
          )}
        </p>
      </div>
    </Dialog>
  );
}
