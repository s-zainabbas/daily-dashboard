import { useState } from 'react';
import { ExternalLink, LogOut, RefreshCw, TriangleAlert } from 'lucide-react';
import { useNow } from '../lib/hooks';
import { chooseCalendars, connectCalendar, disconnectCalendar, gcalAvailable, isChosen, refreshCalendar, useGcal } from '../lib/gcal';
import { useDriveSync } from '../lib/sync/driveSync';
import { ago, GoogleMark } from './DriveSync';
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
          Show your Google Calendar events in Schedule, next to your own. Read-only: the dashboard never changes your calendar, and events aren’t copied into your
          dashboard data.
        </p>
        <button type="button" className="btn primary google-btn" disabled={busy} onClick={connect}>
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
          <button className="btn primary" onClick={connect} disabled={busy}>
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
    </section>
  );
}
