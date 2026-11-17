import { useState } from 'react';
import { BellOff, BellRing, ExternalLink, LogOut, RefreshCw, TriangleAlert } from 'lucide-react';
import { useNow } from '../lib/hooks';
import { chooseCalendars, connectCalendar, disconnectCalendar, gcalAvailable, isChosen, refreshCalendar, useGcal } from '../lib/gcal';
import { useDriveSync } from '../lib/sync/driveSync';
import { ago, GoogleMark } from './DriveSync';
import { disablePhoneReminders, enablePhoneReminders, syncPhoneReminders, usePhoneReminders } from '../lib/phoneReminders';
import { toast } from './ui';

/** Settings → Google Calendar: turn it on, choose calendars, see when it last updated. */
export function CalendarSection() {
  const g = useGcal();
  const account = useDriveSync().account;
  const now = useNow(30_000);
  const [busy, setBusy] = useState(false);
  if (!gcalAvailable) return null;

  const connect = () => {
    setBusy(true);
    connectCalendar(account?.email)
      .catch((e) => toast(e instanceof Error ? e.message : 'Couldn’t connect Google Calendar.', undefined, 7000))
      .finally(() => setBusy(false));
  };

  if (!g.enabled) {
    return (
      <section>
        <h3>Google Calendar</h3>
        <p className="sync-pitch">
          Show your Google Calendar events in Schedule, next to your own. It only adds to your calendar if you later turn on phone reminders, and events aren’t
          copied into your dashboard data.
        </p>
        <button type="button" className="btn primary google-btn" data-google-signin disabled={busy} onClick={connect}>
          <GoogleMark /> {busy ? 'Connecting…' : 'Connect Google Calendar'}
        </button>
      </section>
    );
  }

  const loading = g.status === 'loading';
  const problem = g.status === 'needs-auth' || g.status === 'error';
  const upcoming = g.events.length;

  return (
    <section>
      <h3>Google Calendar</h3>
      <div className={`sync-line ${problem ? 'bad' : 'ok'}`} role="status">
        {loading ? <RefreshCw size={12} className="spin" /> : problem ? <TriangleAlert size={12} /> : <i className="sync-dot ok" />}
        <span>
          {loading
            ? 'Updating…'
            : g.status === 'needs-auth'
              ? g.error ?? 'Sign in again to update your calendar'
              : g.status === 'error'
                ? g.error
                : `Showing ${upcoming} event${upcoming === 1 ? '' : 's'}${g.fetchedAt ? ` · updated ${ago(g.fetchedAt, now)}` : ''}`}
        </span>
      </div>

      {g.status === 'error' && g.errorLink && (
        <a className="btn primary gcal-fix" href={g.errorLink} target="_blank" rel="noopener noreferrer">
          Turn on the Calendar API <ExternalLink size={13} />
        </a>
      )}

      {g.calendars.length > 0 && (
        <div className="gcal-list" role="group" aria-label="Calendars to show">
          {g.calendars.map((c) => {
            const on = isChosen(g, c.id);
            return (
              <label key={c.id} className="gcal-cal" style={{ ['--cal' as string]: c.color }}>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => {
                    const ids = g.calendars.filter((x) => (x.id === c.id ? !on : isChosen(g, x.id))).map((x) => x.id);
                    chooseCalendars(ids);
                  }}
                />
                <span className="truncate">{c.name}</span>
                {c.primary && <small>Main</small>}
              </label>
            );
          })}
        </div>
      )}

      <div className="row sync-actions">
        {g.status === 'needs-auth' ? (
          <button className="btn primary" data-google-signin onClick={connect} disabled={busy}>
            <RefreshCw size={14} /> Reconnect
          </button>
        ) : (
          <button className="btn" onClick={() => refreshCalendar(true)} disabled={loading}>
            <RefreshCw size={14} /> {g.status === 'error' ? 'Try again' : 'Refresh'}
          </button>
        )}
        <button className="btn ghost" onClick={() => confirm('Stop showing Google Calendar events on this device?') && disconnectCalendar()}>
          <LogOut size={14} /> Turn off
        </button>
      </div>

      <PhoneReminders email={account?.email} now={now} />
    </section>
  );
}

/** Copy reminders into Google Calendar, so they reach your phone when the dashboard is closed. */
function PhoneReminders({ email, now }: { email?: string; now: Date }) {
  const r = usePhoneReminders();
  const [busy, setBusy] = useState(false);
  const run = (p: Promise<void>, fail: string) => {
    setBusy(true);
    p.catch((e) => toast(e instanceof Error ? e.message : fail, undefined, 7000)).finally(() => setBusy(false));
  };

  if (!r.enabled) {
    return (
      <div className="phone-reminders">
        <h4>Reminders when the dashboard is closed</h4>
        <p className="sync-pitch">
          A browser tab can’t alert you once it’s closed. Turn this on and your task reminders, events and interviews for the next 30 days are added to your main
          Google Calendar with an alert, so Google notifies you on your phone and laptop. They update when you edit, tick off or delete things here.
        </p>
        <button type="button" className="btn" data-google-signin disabled={busy} onClick={() => run(enablePhoneReminders(email), 'Couldn’t turn on reminders.')}>
          <BellRing size={14} /> {busy ? 'Connecting…' : 'Send reminders to Google Calendar'}
        </button>
      </div>
    );
  }

  const bad = r.status === 'needs-auth' || r.status === 'error';
  return (
    <div className="phone-reminders">
      <h4>Reminders when the dashboard is closed</h4>
      <div className={`sync-line ${bad ? 'bad' : 'ok'}`} role="status">
        {r.status === 'syncing' ? <RefreshCw size={12} className="spin" /> : bad ? <TriangleAlert size={12} /> : <i className="sync-dot ok" />}
        <span>
          {r.status === 'syncing'
            ? 'Updating Google Calendar…'
            : r.status === 'needs-auth'
              ? r.error ?? 'Sign in again to keep reminders up to date'
              : r.status === 'error'
                ? r.error
                : `${r.count ?? 0} reminder${r.count === 1 ? '' : 's'} in Google Calendar${r.syncedAt ? ` · updated ${ago(r.syncedAt, now)}` : ''}`}
        </span>
      </div>
      <div className="row sync-actions">
        {r.status === 'needs-auth' ? (
          <button className="btn primary" data-google-signin disabled={busy} onClick={() => run(enablePhoneReminders(email), 'Couldn’t reconnect.')}>
            <RefreshCw size={14} /> Reconnect
          </button>
        ) : (
          <button className="btn" disabled={busy || r.status === 'syncing'} onClick={() => run(syncPhoneReminders(), 'Couldn’t update reminders.')}>
            <RefreshCw size={14} /> Update now
          </button>
        )}
        <button
          className="btn ghost"
          disabled={busy}
          onClick={() => confirm('Stop sending reminders to Google Calendar? The reminder events the dashboard added are removed.') && run(disablePhoneReminders(), 'Couldn’t turn off reminders.')}
        >
          <BellOff size={14} /> Turn off
        </button>
      </div>
    </div>
  );
}
