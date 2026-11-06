import { Coffee, Pause, Play, RotateCcw, Timer } from 'lucide-react';
import { formatDuration, today } from '../lib/date';
import { useNow } from '../lib/hooks';
import { useStore } from '../lib/store';
import { remainingMs, timerActions, totalMs, useTimer } from '../lib/timer';
import { Card, Segmented } from './ui';

export const fmtClock = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function Focus() {
  const timer = useTimer();
  useNow(timer.endsAt ? 1000 : 60_000);
  const tasks = useStore((s) => s.tasks);
  const priority = useStore((s) => s.priority);
  const day = useStore((s) => s.focus[today()]);
  const running = !!timer.endsAt;
  const left = remainingMs(timer);
  const total = totalMs(timer);
  const progress = total ? 1 - left / total : 0;

  const R = 84;
  const C = 2 * Math.PI * R;
  const openTasks = tasks.filter((t) => !t.done && !t.waitingOn);

  return (
    <Card
      id="focus"
      className={`focus ${running ? 'running' : ''}`}
      title="Focus"
      icon={<Timer size={16} />}
      actions={
        <Segmented
          label="Timer mode"
          value={timer.mode}
          onChange={(m) => timerActions.setMode(m)}
          options={[
            { value: 'focus', label: 'Focus' },
            { value: 'break', label: <Coffee size={13} aria-label="Break" /> },
          ]}
        />
      }
    >
      <div className="focus-dial">
        <svg viewBox="0 0 184 184" width="184" height="184" aria-hidden>
          <circle className="track" cx="92" cy="92" r={R} strokeWidth="8" />
          <circle className="bar" cx="92" cy="92" r={R} strokeWidth="8" strokeDasharray={C} strokeDashoffset={C * (1 - progress)} />
        </svg>
        <div className="focus-read" role="timer" aria-live="off">
          <div className="focus-time">{fmtClock(left)}</div>
          <div className="focus-label">{timer.mode === 'focus' ? (running ? 'Stay with it' : 'Focus session') : running ? 'Breathe, stretch' : 'Break'}</div>
        </div>
      </div>
      <div className="focus-controls">
        <button className="btn primary" onClick={timerActions.toggle}>
          {running ? <Pause size={15} /> : <Play size={15} />}
          {running ? 'Pause' : left < total ? 'Resume' : 'Start'}
        </button>
        <button className="btn" onClick={timerActions.reset} aria-label="Reset timer" title="Reset">
          <RotateCcw size={15} />
        </button>
      </div>
      {timer.mode === 'focus' && (
        <div className="focus-task">
          <label className="sr-only" htmlFor="focus-task">
            What are you focusing on?
          </label>
          <select id="focus-task" className="select input" value={timer.taskId ?? ''} onChange={(e) => timerActions.setTask(e.target.value || undefined)}>
            <option value="">What are you working on? (optional)</option>
            {priority.title && !priority.done && <option value="priority">★ {priority.title}</option>}
            {openTasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="focus-foot">
        <span>
          Today <b className="num">{formatDuration(day?.minutes ?? 0)}</b>
        </span>
        <span>
          Sessions <b className="num">{day?.sessions ?? 0}</b>
        </span>
      </div>
    </Card>
  );
}
