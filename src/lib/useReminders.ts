import { useEffect, useRef } from 'react';
import { toast } from '../components/ui';
import { addMinutesTo, dateKey } from './date';
import { useAllEvents } from './gcal';
import { dueReminders, loadFired, saveFired } from './reminders';
import { actions, demoMode, getState } from './store';
import { chime } from './timer';
import { notify } from './notify';

/** Check for due reminders every 20 seconds and show them: chime, on-screen message and, in the background, a notification. */
export function useReminders() {
  const events = useAllEvents();
  const eventsRef = useRef(events);
  eventsRef.current = events;

  useEffect(() => {
    if (demoMode) return;
    const check = () => {
      const now = new Date();
      const t = dateKey(now);
      const fired = loadFired(t);
      const due = dueReminders(getState(), eventsRef.current, now, fired);
      if (!due.length) return;
      const s = getState().settings;
      if (s.sound) chime();
      for (const r of due) {
        fired.add(r.key);
        const taskId = r.taskId;
        toast(
          `${taskId ? '🔔 ' : '📅 '}${r.title} — ${r.body}`,
          taskId
            ? {
                label: '10 more min',
                run: () => {
                  const task = getState().tasks.find((x) => x.id === taskId);
                  if (task?.remindAt) actions.updateTask(taskId, { remindAt: addMinutesTo(now, 10) });
                },
              }
            : undefined,
          15_000,
        );
        if (document.visibilityState !== 'visible') notify(r.title, { body: r.body, tag: r.key });
      }
      saveFired(t, fired);
    };
    check();
    const id = setInterval(check, 20_000);
    return () => clearInterval(id);
  }, []);
}

/** Ask once for permission to show notifications (call from a click). */
export function askForNotifications(): Promise<NotificationPermission | 'unsupported'> {
  if (!('Notification' in window)) return Promise.resolve('unsupported');
  if (Notification.permission !== 'default') return Promise.resolve(Notification.permission);
  return Notification.requestPermission();
}
