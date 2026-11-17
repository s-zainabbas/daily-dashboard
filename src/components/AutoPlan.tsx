import { useEffect, useMemo, useState } from 'react';
import { CalendarCheck, Sun, Wand2 } from 'lucide-react';
import { autoPlan, taskMinutes } from '../lib/autoplan';
import { dateKey, formatDuration, formatTime, nowMinutes } from '../lib/date';
import { useAllEvents } from '../lib/gcal';
import { focusHours } from '../lib/insights';
import { actions, getState, useStore } from '../lib/store';
import { Dialog, DialogHead, toast } from './ui';

export const AUTO_PLAN_EVENT = 'dd:auto-plan';

/** Ask the app to open the auto-plan preview (from Today's Schedule card or Plan my day). */
export const openAutoPlan = () => window.dispatchEvent(new CustomEvent(AUTO_PLAN_EVENT));

/**
 * Auto-plan preview: today's tasks laid out in the free time around your events. You see the plan
 * first, then add it to the calendar as time blocks in one click (with Undo).
 */
export function AutoPlanDialog() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setOpen(true);
    window.addEventListener(AUTO_PLAN_EVENT, on);
    return () => window.removeEventListener(AUTO_PLAN_EVENT, on);
  }, []);
  return open ? <AutoPlanBody onClose={() => setOpen(false)} /> : null;
}

function AutoPlanBody({ onClose }: { onClose: () => void }) {
  const events = useAllEvents();
  const s = useStore((x) => x);
  const use24h = s.settings.use24h;
  const day = dateKey();
  const best = useMemo(() => focusHours(getState(), day).best, [day]);
  const todays = s.tasks.filter((t) => !t.done && !t.waitingOn && t.dueDate && t.dueDate <= day);
  const plan = useMemo(
    () => autoPlan({ tasks: todays, events, day, fromMin: nowMinutes(), best, priorityTitle: s.priority.done ? undefined : s.priority.title }),
    [todays.map((t) => t.id).join(), events, day, best, s.priority], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const chosen = plan.blocks.filter((b) => !skip.has(b.taskId));
  const fmt = (t: string) => formatTime(t, use24h);

  function apply() {
    if (!chosen.length) return onClose();
    const before = getState().events;
    for (const b of chosen) actions.addEvent({ title: b.title, date: day, start: b.start, end: b.end, notes: 'Time block from auto-plan', taskId: b.taskId });
    toast(`Blocked time for ${chosen.length} task${chosen.length === 1 ? '' : 's'}`, {
      label: 'Undo',
      run: () => {
        const ids = new Set(before.map((e) => e.id));
        getState()
          .events.filter((e) => !ids.has(e.id) && e.notes === 'Time block from auto-plan')
          .forEach((e) => actions.removeEvent(e.id));
      },
    });
    onClose();
  }

  return (
    <Dialog open onClose={onClose} className="modal plan-modal" label="Auto-plan today">
      <DialogHead
        title={
          <span className="plan-title">
            <Wand2 size={16} /> Auto-plan today
          </span>
        }
        onClose={onClose}
      />
      <div className="modal-body plan-body">
        {todays.length === 0 ? (
          <p className="plan-empty">No tasks for today yet. Pick some in Plan my day (P), or give tasks today’s date.</p>
        ) : plan.blocks.length === 0 ? (
          <p className="plan-empty">{plan.unplaced.length ? 'There’s no free time left today for these tasks. Try moving some to tomorrow.' : 'Every task for today already has a time block.'}</p>
        ) : (
          <>
            <p className="plan-lead">
              Here’s a plan around your events. Untick anything you’d rather not schedule, then add it to your calendar.
              {best && (
                <>
                  {' '}
                  <span className="autoplan-best">
                    <Sun size={12} /> High-priority work goes in your best hours, {fmt(`${String(best[0]).padStart(2, '0')}:00`)}–{fmt(`${String(best[1]).padStart(2, '0')}:00`)}.
                  </span>
                </>
              )}
            </p>
            <div className="plan-list">
              {plan.blocks.map((b) => {
                const t = s.tasks.find((x) => x.id === b.taskId);
                const on = !skip.has(b.taskId);
                return (
                  <label key={b.taskId} className={`plan-pick autoplan-row ${on ? 'on' : ''}`}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() =>
                        setSkip((x) => {
                          const n = new Set(x);
                          n.has(b.taskId) ? n.delete(b.taskId) : n.add(b.taskId);
                          return n;
                        })
                      }
                    />
                    <time className="num">
                      {fmt(b.start)}–{fmt(b.end)}
                    </time>
                    <span className="plan-task">
                      <b>{b.title}</b>
                      <span className="plan-chips">
                        {t?.priority === 'high' && <span className="chip high">High</span>}
                        <span className="chip num">{t?.estimate ? formatDuration(t.estimate) : `${formatDuration(taskMinutes(t!))} (no estimate)`}</span>
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </>
        )}
        {plan.unplaced.length > 0 && plan.blocks.length > 0 && (
          <p className="plan-warn">
            Didn’t fit today: {plan.unplaced.map((t) => `“${t.title}”`).join(', ')}. Consider moving {plan.unplaced.length === 1 ? 'it' : 'them'} to tomorrow.
          </p>
        )}
        <div className="modal-foot">
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          {chosen.length > 0 && (
            <button type="button" className="btn primary" onClick={apply}>
              <CalendarCheck size={14} /> Add {chosen.length} block{chosen.length === 1 ? '' : 's'}
            </button>
          )}
        </div>
      </div>
    </Dialog>
  );
}
