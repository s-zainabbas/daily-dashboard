import { useState } from 'react';
import { ExternalLink, LogOut, Mail, Plus, RefreshCw, TriangleAlert, X } from 'lucide-react';
import { useNow } from '../lib/hooks';
import { connectGmail, disconnectGmail, gmailAvailable, markHandled, openMail, refreshGmail, useGmail } from '../lib/gmail';
import { gmailLink, type StarredMail } from '../lib/google/gmail';
import { actions } from '../lib/store';
import { useDriveSync } from '../lib/sync/driveSync';
import { ago, GoogleMark } from './DriveSync';
import { Card, toast } from './ui';

/** Settings → Gmail: show starred emails on the Tasks tab. */
export function GmailSection() {
  const g = useGmail();
  const account = useDriveSync().account;
  const now = useNow(30_000);
  const [busy, setBusy] = useState(false);
  if (!gmailAvailable) return null;
  const connect = () => {
    setBusy(true);
    connectGmail(account?.email)
      .catch((e) => toast(e instanceof Error ? e.message : 'Couldn’t connect Gmail.', undefined, 7000))
      .finally(() => setBusy(false));
  };

  if (!g.enabled) {
    return (
      <section>
        <h3>Gmail</h3>
        <p className="sync-pitch">Star an email in Gmail and it shows up on the Tasks tab, ready to turn into a task. Read-only: the dashboard only reads starred emails’ subject and sender.</p>
        <button type="button" className="btn primary google-btn" data-google-signin disabled={busy} onClick={connect}>
          <GoogleMark /> {busy ? 'Connecting…' : 'Connect Gmail'}
        </button>
      </section>
    );
  }
  const problem = g.status === 'needs-auth' || g.status === 'error';
  return (
    <section>
      <h3>Gmail</h3>
      <div className={`sync-line ${problem ? 'bad' : 'ok'}`} role="status">
        {g.status === 'loading' ? <RefreshCw size={12} className="spin" /> : problem ? <TriangleAlert size={12} /> : <i className="sync-dot ok" />}
        <span>
          {g.status === 'loading'
            ? 'Updating…'
            : g.status === 'needs-auth'
              ? g.error ?? 'Sign in again to update starred emails'
              : g.status === 'error'
                ? g.error
                : `${openMail(g).length} starred email${openMail(g).length === 1 ? '' : 's'} to go through${g.fetchedAt ? ` · updated ${ago(g.fetchedAt, now)}` : ''}`}
        </span>
      </div>
      {g.status === 'error' && g.errorLink && (
        <a className="btn gcal-fix" href={g.errorLink} target="_blank" rel="noopener noreferrer">
          Turn on the Gmail API <ExternalLink size={13} />
        </a>
      )}
      <div className="row sync-actions">
        {g.status === 'needs-auth' ? (
          <button className="btn primary" data-google-signin onClick={connect} disabled={busy}>
            <RefreshCw size={14} /> Reconnect
          </button>
        ) : (
          <button className="btn" onClick={() => refreshGmail(true)} disabled={g.status === 'loading'}>
            <RefreshCw size={14} /> Refresh
          </button>
        )}
        <button className="btn ghost" onClick={() => confirm('Stop showing starred Gmail on this device?') && disconnectGmail()}>
          <LogOut size={14} /> Turn off
        </button>
      </div>
    </section>
  );
}

const age = (ms: number, now: Date) => {
  const days = Math.floor((now.getTime() - ms) / 864e5);
  if (days < 1) return new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (days < 7) return new Date(ms).toLocaleDateString(undefined, { weekday: 'short' });
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

/** Tasks tab: starred emails to turn into tasks (or dismiss). Hidden until Gmail is connected. */
export function StarredMailCard() {
  const g = useGmail();
  const account = useDriveSync().account;
  const now = useNow(60_000);
  if (!g.enabled) return null;
  const list = openMail(g);

  const toTask = (m: StarredMail) => {
    actions.addTask({ title: m.subject, notes: `From ${m.from} · ${gmailLink(m.threadId, account?.email)}`, priority: 'med' });
    const undo = markHandled(m.id);
    toast('Added as a task', { label: 'Undo', run: undo });
  };

  return (
    <Card
      title="Starred in Gmail"
      icon={<Mail size={16} />}
      meta={list.length ? String(list.length) : undefined}
      className="gmail-card"
      actions={
        <button className="icon-btn sm" onClick={() => refreshGmail(true)} aria-label="Refresh" title="Refresh">
          <RefreshCw size={14} className={g.status === 'loading' ? 'spin' : ''} />
        </button>
      }
    >
      {g.status === 'needs-auth' ? (
        <p className="chart-empty">Sign in again in Settings → Gmail to update.</p>
      ) : list.length === 0 ? (
        <p className="chart-empty">Nothing starred. Star an email in Gmail and it shows up here.</p>
      ) : (
        <ul className="mail-list">
          {list.map((m) => (
            <li key={m.id}>
              <a className="mail-main" href={gmailLink(m.threadId, account?.email)} target="_blank" rel="noopener noreferrer" title="Open in Gmail">
                <span className="mail-top">
                  <b className="truncate">{m.from}</b>
                  <small className="num">{age(m.date, now)}</small>
                </span>
                <span className="mail-subject truncate">{m.subject}</span>
                {m.snippet && <span className="mail-snippet truncate">{m.snippet}</span>}
              </a>
              <span className="mail-actions">
                <button className="btn sm" onClick={() => toTask(m)} title="Make it a task">
                  <Plus size={13} /> Task
                </button>
                <button
                  className="icon-btn sm"
                  onClick={() => {
                    const undo = markHandled(m.id);
                    toast('Hidden', { label: 'Undo', run: undo });
                  }}
                  aria-label="Dismiss"
                  title="Dismiss"
                >
                  <X size={14} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
