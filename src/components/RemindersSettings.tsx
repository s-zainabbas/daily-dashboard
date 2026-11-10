import { useState } from 'react';
import { actions, useStore } from '../lib/store';
import { askForNotifications } from '../lib/useReminders';

const LEADS = [0, 5, 10, 15, 30];

/** Settings → Reminders: how early to remind about events, and notification permission. */
export function RemindersSection() {
  const lead = useStore((s) => s.settings.eventReminder ?? 10);
  const [perm, setPerm] = useState(() => ('Notification' in window ? Notification.permission : 'unsupported'));
  return (
    <section>
      <h3>Reminders</h3>
      <div className="setting">
        <div>
          <b>Before events</b>
          <small>Your events and Google Calendar</small>
        </div>
        <select className="select input sm-select" value={lead} onChange={(e) => actions.setSettings({ eventReminder: Number(e.target.value) })} aria-label="Remind me before events">
          {LEADS.map((m) => (
            <option key={m} value={m}>
              {m ? `${m} min before` : 'Off'}
            </option>
          ))}
        </select>
      </div>
      <div className="setting">
        <div>
          <b>Notifications</b>
          <small>
            {perm === 'granted'
              ? 'On — reminders show even when the dashboard is in the background.'
              : perm === 'denied'
                ? 'Blocked in your browser settings. Reminders still show on the page.'
                : perm === 'unsupported'
                  ? 'Not supported here. Reminders still show on the page.'
                  : 'Allow them to get reminders while you’re in another tab or app.'}
          </small>
        </div>
        {perm === 'default' && (
          <button className="btn sm" onClick={() => askForNotifications().then((p) => setPerm(p))}>
            Allow
          </button>
        )}
      </div>
      <p className="setting-note">Reminders work while the dashboard is open, in a tab or installed as an app.</p>
    </section>
  );
}
