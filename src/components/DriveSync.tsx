import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Cloud, CloudOff, History, LogOut, RefreshCw, Repeat, TriangleAlert } from 'lucide-react';
import { useNow } from '../lib/hooks';
import type { DriveRevision } from '../lib/google/drive';
import type { SyncView } from '../lib/sync/engine';
import {
  chooseFirstSync,
  connectGoogle,
  disconnectGoogle,
  driveConfigured,
  hasValidToken,
  listDriveVersions,
  replaceDriveCopy,
  resolveConflicts,
  restoreDriveVersion,
  setAutoSync,
  syncNow,
  useDriveSync,
} from '../lib/sync/driveSync';
import type { Choice, Conflict } from '../lib/sync/merge';
import { Dialog, DialogHead, Segmented, Switch, toast } from './ui';

/* ---------- Which sync dialog is open (conflicts / restore) ---------- */

type Panel = 'conflicts' | 'restore' | null;
let panel: Panel = null;
const panelListeners = new Set<() => void>();
export const openSyncPanel = (p: Panel) => {
  panel = p;
  panelListeners.forEach((l) => l());
};
const usePanel = () =>
  useSyncExternalStore(
    (l) => {
      panelListeners.add(l);
      return () => panelListeners.delete(l);
    },
    () => panel,
  );

/* ---------- Status wording ---------- */

type Tone = 'ok' | 'busy' | 'idle' | 'bad';

export function syncStatus(v: SyncView): { text: string; tone: Tone } {
  switch (v.status) {
    case 'connecting':
    case 'syncing':
      return { text: 'Syncing…', tone: 'busy' };
    case 'synced':
      return v.pending ? { text: 'Changes waiting to sync', tone: 'busy' } : { text: 'Synced', tone: 'ok' };
    case 'offline':
      return { text: 'Offline — changes are saved here and will sync when you’re back online', tone: 'idle' };
    case 'paused':
      return { text: v.message ?? 'Sign-in expired — tap “Sync now” to check for changes', tone: v.pending ? 'busy' : 'idle' };
    case 'conflict':
      return { text: v.message ?? 'Some changes need your choice', tone: 'bad' };
    case 'choose':
      return { text: 'Choose how to combine your data', tone: 'busy' };
    case 'error':
      return { text: v.message ?? 'Sync problem', tone: 'bad' };
    default:
      return { text: 'Not connected', tone: 'idle' };
  }
}

function ago(t: number, now: Date): string {
  const s = Math.round((now.getTime() - t) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  const d = new Date(t);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return `today at ${time}`;
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} at ${time}`;
}

const when = (t: number | string) =>
  new Date(t).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/* ---------- Small pieces ---------- */

/** Google's "G", as its branding guidelines ask for on sign-in buttons. */
export function GoogleMark({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.2-.1-2.3-.4-3.5z" />
    </svg>
  );
}

function Avatar({ v, size }: { v: SyncView; size: number }) {
  const a = v.account!;
  return (
    <span className="avatar" style={{ width: size, height: size }}>
      {a.picture ? <img src={a.picture} alt="" referrerPolicy="no-referrer" /> : <span>{a.name.slice(0, 1).toUpperCase()}</span>}
      <i className={`sync-dot ${syncStatus(v).tone}`} />
    </span>
  );
}

export function ConnectButton({ label = 'Connect Google Drive', className = 'btn primary' }: { label?: string; className?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={`${className} google-btn`}
      disabled={busy}
      onClick={() => {
        setBusy(true);
        connectGoogle('connect').finally(() => setBusy(false));
      }}
    >
      <GoogleMark /> {busy ? 'Connecting…' : label}
    </button>
  );
}

/* ---------- Top bar ---------- */

export function SyncButton({ onOpenSettings }: { onOpenSettings: () => void }) {
  const v = useDriveSync();
  if (!driveConfigured) return null;
  const { text } = syncStatus(v);
  if (!v.account) {
    return (
      <button className="icon-btn" onClick={onOpenSettings} title="Sync with Google Drive" aria-label="Sync with Google Drive">
        <Cloud size={17} />
      </button>
    );
  }
  // Paused: one tap reconnects and syncs (Google only allows that from a tap).
  const tapToSync = v.status === 'paused';
  return (
    <button
      className={`icon-btn${tapToSync && v.pending ? ' attention' : ''}`}
      onClick={() => (v.conflicts.length ? openSyncPanel('conflicts') : tapToSync ? syncNow() : onOpenSettings())}
      title={`${v.account.email} · ${tapToSync ? 'Tap to sync' : text}`}
      aria-label={`Google Drive sync: ${tapToSync ? 'tap to sync' : text}`}
    >
      {v.status === 'error' ? <CloudOff size={17} /> : <Avatar v={v} size={22} />}
    </button>
  );
}

/* ---------- Settings section ---------- */

export function DriveSyncSection() {
  const v = useDriveSync();
  const now = useNow(30_000);
  if (!driveConfigured) {
    return import.meta.env.DEV ? (
      <section>
        <h3>Google Drive sync</h3>
        <p className="sync-pitch">Not set up: add <code>VITE_GOOGLE_CLIENT_ID</code> to <code>.env.local</code> (see README).</p>
      </section>
    ) : null;
  }
  if (!v.account) {
    return (
      <section>
        <h3>Google Drive sync</h3>
        <p className="sync-pitch">Keep your dashboard in your own Google Drive, so it’s the same on your laptop, phone and anywhere else. It’s stored in a hidden app folder that only this app can see.</p>
        <ConnectButton />
      </section>
    );
  }
  const { text, tone } = syncStatus(v);
  const busy = v.status === 'syncing' || v.status === 'connecting';
  return (
    <section>
      <h3>Google Drive sync</h3>
      <div className="setting account-row">
        <Avatar v={v} size={36} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <b className="truncate">{v.account.name}</b>
          <small className="truncate">{v.account.email}</small>
        </div>
      </div>
      <div className={`sync-line ${tone}`} role="status">
        {busy ? <RefreshCw size={12} className="spin" /> : tone === 'bad' ? <TriangleAlert size={12} /> : <i className={`sync-dot ${tone}`} />}
        <span>{text}</span>
      </div>
      <p className="sync-sub">Last synced: {v.lastSyncedAt ? ago(v.lastSyncedAt, now) : 'not yet'}</p>

      <div className="row sync-actions">
        {v.status === 'conflict' ? (
          <button className="btn primary" onClick={() => openSyncPanel('conflicts')}>
            Review {v.conflicts.length} change{v.conflicts.length === 1 ? '' : 's'}
          </button>
        ) : (
          <button className="btn primary" onClick={() => syncNow()} disabled={busy}>
            <RefreshCw size={14} /> {v.status === 'paused' ? 'Reconnect & sync' : 'Sync now'}
          </button>
        )}
        <button className="btn" onClick={() => openSyncPanel('restore')}>
          <History size={14} /> Restore…
        </button>
      </div>
      {v.corrupt && (
        <button
          className="btn danger"
          style={{ marginTop: 8, width: '100%' }}
          onClick={() => confirm('Replace the damaged copy in Google Drive with the data on this device? Drive keeps the old version in its history.') && replaceDriveCopy()}
        >
          Replace Drive copy with this device’s data
        </button>
      )}

      <div className="setting" style={{ marginTop: 6 }}>
        <div>
          <b>Automatic sync</b>
          <small>A few seconds after each change, and when you open the dashboard</small>
        </div>
        <Switch label="Automatic sync" checked={v.autoSync} onChange={setAutoSync} />
      </div>
      <div className="row sync-actions">
        <button className="btn ghost" onClick={() => connectGoogle('switch')}>
          <Repeat size={14} /> Switch account
        </button>
        <button
          className="btn ghost"
          onClick={() => confirm('Disconnect Google Drive? Your data stays on this device and in your Drive; it just stops syncing.') && disconnectGoogle()}
        >
          <LogOut size={14} /> Disconnect
        </button>
      </div>
    </section>
  );
}

/* ---------- First connection: data in both places ---------- */

function FirstSyncDialog({ v }: { v: SyncView }) {
  const c = v.choice;
  return (
    <Dialog open={v.status === 'choose' && !!c} onClose={() => chooseFirstSync('cancel')} className="modal sync-modal" label="Combine your data">
      <DialogHead title="Your dashboard is in two places" onClose={() => chooseFirstSync('cancel')} />
      {c && (
        <div className="modal-body">
          <div className="compare">
            <div>
              <span>This device</span>
              <b>{c.local}</b>
            </div>
            <div>
              <span>Google Drive</span>
              <b>{c.remote}</b>
              {c.remoteSavedAt > 0 && (
                <small>
                  Saved {when(c.remoteSavedAt)}
                  {c.remoteDevice ? ` on ${c.remoteDevice}` : ''}
                </small>
              )}
            </div>
          </div>
          <div className="choices">
            <button className="choice recommended" onClick={() => chooseFirstSync('merge')}>
              <b>Merge both · recommended</b>
              <span>Keeps everything from both. If the same item was changed in both places, you’ll be asked which version to keep.</span>
            </button>
            <button className="choice" onClick={() => chooseFirstSync('drive')}>
              <b>Use the Google Drive copy</b>
              <span>Replaces what’s on this device with the Drive copy. This device’s current data is kept as a backup, and you can undo.</span>
            </button>
            <button
              className="choice"
              onClick={() => confirm('Replace the copy in Google Drive with this device’s data? Your other devices will get this version. Drive keeps the old one in its history.') && chooseFirstSync('device')}
            >
              <b>Use this device’s copy</b>
              <span>Replaces the Drive copy with what’s on this device. Drive keeps the old version in its history.</span>
            </button>
          </div>
          <div className="modal-foot">
            <button className="btn ghost" onClick={() => chooseFirstSync('cancel')}>
              Cancel — don’t connect
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

/* ---------- Conflicts ---------- */

function show(x: unknown): string {
  if (x === undefined || x === null || x === '') return '(empty)';
  if (typeof x === 'boolean') return x ? 'Yes' : 'No';
  const s = typeof x === 'string' ? x : JSON.stringify(x);
  return s.length > 160 ? `${s.slice(0, 157)}…` : s;
}
const fieldName = (p: string) => p.replace(/\./g, ' › ').replace(/^./, (c) => c.toUpperCase());

function ConflictCard({ c, choice, onChoose }: { c: Conflict; choice?: Choice; onChoose: (x: Choice) => void }) {
  const options: { value: Choice; label: string }[] = [
    { value: 'local', label: c.kind === 'delete' ? (c.deletedOn === 'local' ? 'Delete it' : 'Keep it') : 'This device' },
    { value: 'remote', label: c.kind === 'delete' ? (c.deletedOn === 'remote' ? 'Delete it' : 'Keep it') : 'Google Drive' },
  ];
  if (c.canKeepBoth) options.push({ value: 'both', label: 'Keep both' });
  return (
    <article className="conflict">
      <div className="conflict-head">
        <span>{c.what}</span>
        <b>{c.label}</b>
      </div>
      {c.kind === 'delete' ? (
        <p className="conflict-note">{c.deletedOn === 'local' ? 'Deleted on this device, but changed on another device.' : 'Changed on this device, but deleted on another device.'}</p>
      ) : (
        c.fields.map((f) => (
          <div className="conflict-field" key={f.path}>
            <i>{fieldName(f.path)}</i>
            <div>
              <span>This device</span>
              {show(f.local)}
            </div>
            <div>
              <span>Google Drive</span>
              {show(f.remote)}
            </div>
          </div>
        ))
      )}
      <Segmented<Choice> label={`Keep which version of ${c.label}`} value={choice ?? ('' as Choice)} onChange={onChoose} options={options} />
    </article>
  );
}

function ConflictDialog({ v, open }: { v: SyncView; open: boolean }) {
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const close = () => openSyncPanel(null);
  const all = v.conflicts.length > 0 && v.conflicts.every((c) => choices[c.id]);
  useEffect(() => {
    if (open) setChoices({});
  }, [open]);
  useEffect(() => {
    if (open && v.status === 'synced') close();
  }, [open, v.status]);
  return (
    <Dialog open={open && v.conflicts.length > 0} onClose={close} className="modal sync-modal" label="Review changes">
      <DialogHead title="Changes made on two devices" onClose={close} />
      <div className="modal-body">
        <p className="sync-pitch" style={{ margin: 0 }}>
          These were changed both here and on another device since the last sync. Choose which to keep — nothing is uploaded until you do.
        </p>
        <div className="row bulk">
          <button className="btn ghost" onClick={() => setChoices(Object.fromEntries(v.conflicts.map((c) => [c.id, 'local' as Choice])))}>
            All from this device
          </button>
          <button className="btn ghost" onClick={() => setChoices(Object.fromEntries(v.conflicts.map((c) => [c.id, 'remote' as Choice])))}>
            All from Google Drive
          </button>
        </div>
        <div className="conflicts">
          {v.conflicts.map((c) => (
            <ConflictCard key={c.id} c={c} choice={choices[c.id]} onChoose={(x) => setChoices((s) => ({ ...s, [c.id]: x }))} />
          ))}
        </div>
        <div className="modal-foot">
          <button className="btn ghost" onClick={close}>
            Decide later
          </button>
          <button
            className="btn primary"
            disabled={!all}
            onClick={() => {
              resolveConflicts(choices);
              close();
            }}
          >
            Apply and sync
          </button>
        </div>
      </div>
    </Dialog>
  );
}

/* ---------- Restore ---------- */

function RestoreDialog({ open }: { open: boolean }) {
  const [versions, setVersions] = useState<DriveRevision[] | null>(null);
  const [error, setError] = useState('');
  const [needsAuth, setNeedsAuth] = useState(false);
  const close = () => openSyncPanel(null);

  const load = () => {
    setError('');
    setVersions(null);
    if (!hasValidToken()) return setNeedsAuth(true);
    setNeedsAuth(false);
    listDriveVersions()
      .then(setVersions)
      .catch((e) => setError(e instanceof Error ? e.message : 'Couldn’t load versions from Google Drive.'));
  };
  useEffect(() => {
    if (open) load();
  }, [open]);

  return (
    <Dialog open={open} onClose={close} className="modal sync-modal" label="Restore from Google Drive">
      <DialogHead title="Restore from Google Drive" onClose={close} />
      <div className="modal-body">
        <p className="sync-pitch" style={{ margin: 0 }}>
          Replace the data on this device with a version saved in Google Drive. Your current data is kept as a backup, and you can undo right after. Your other devices get the restored version on their next sync.
        </p>
        {needsAuth ? (
          <button className="btn primary" onClick={() => connectGoogle('reconnect').then(load)}>
            <GoogleMark /> Reconnect to see saved versions
          </button>
        ) : error ? (
          <p className="sync-line bad">{error}</p>
        ) : !versions ? (
          <p className="sync-sub">Loading saved versions…</p>
        ) : versions.length === 0 ? (
          <p className="sync-sub">There’s nothing in Google Drive yet.</p>
        ) : (
          <div className="versions">
            {versions.map((r, i) => (
              <div className="version" key={r.id}>
                <span>
                  {when(r.modifiedTime)}
                  {i === 0 && <em>Latest</em>}
                </span>
                <button
                  className="btn"
                  onClick={async () => {
                    if (!confirm(`Replace this device’s data with the version from ${when(r.modifiedTime)}? You can undo right after.`)) return;
                    try {
                      await restoreDriveVersion(r.id);
                      close();
                    } catch (e) {
                      toast(e instanceof Error ? e.message : 'Couldn’t restore that version.');
                    }
                  }}
                >
                  Restore
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Dialog>
  );
}

/* ---------- All sync dialogs, mounted once in App ---------- */

export function DriveDialogs() {
  const v = useDriveSync();
  const p = usePanel();
  const toasted = useRef('');
  // Changes from two devices clashed in a background sync: say so once per new set, without interrupting.
  const key = v.status === 'conflict' ? v.conflicts.map((c) => c.id).sort().join() : '';
  useEffect(() => {
    if (key && key !== toasted.current && p !== 'conflicts') {
      const n = v.conflicts.length;
      toast(`${n} change${n === 1 ? '' : 's'} made on two devices need${n === 1 ? 's' : ''} your choice.`, { label: 'Review', run: () => openSyncPanel('conflicts') }, 12_000);
    }
    if (key) toasted.current = key;
    else if (v.status === 'synced') toasted.current = '';
  }, [key, v.status]);
  if (!driveConfigured) return null;
  return (
    <>
      <FirstSyncDialog v={v} />
      <ConflictDialog v={v} open={p === 'conflicts'} />
      <RestoreDialog open={p === 'restore'} />
    </>
  );
}
