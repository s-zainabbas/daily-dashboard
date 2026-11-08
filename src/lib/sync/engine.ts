import type { GoogleAccount } from '../google/auth';
import { DriveError, type DriveApi, type DriveFile, type DriveRevision } from '../google/drive';
import type { State } from '../types';
import { hash, type MetaStore, type SyncMeta } from './local';
import { mergeCloud, unionCloud, type Conflict, type Resolutions, type Choice } from './merge';
import { CorruptBackupError, NewerSchemaError, contentOf, emptyCloud, hasContent, parseCloud, serialize, stamp, summarize, toState, type CloudData } from './schema';

/**
 * The sync engine: decides when to talk to Google Drive and what to send.
 * It knows nothing about React or the browser — everything it touches is passed in,
 * so tests can run two "devices" against a fake Drive.
 */

export type SyncStatus = 'disconnected' | 'connecting' | 'syncing' | 'synced' | 'offline' | 'paused' | 'error' | 'conflict' | 'choose';

export interface SyncView {
  status: SyncStatus;
  account?: GoogleAccount;
  message?: string;
  lastSyncedAt?: number;
  autoSync: boolean;
  /** Local changes not yet in Drive. */
  pending: boolean;
  conflicts: Conflict[];
  /** The Drive copy can't be read; offer to replace it. */
  corrupt?: boolean;
  /** First connection with data on both sides: waiting for the user to choose. */
  choice?: { local: string; remote: string; remoteSavedAt: number; remoteDevice: string };
}

export interface StoreAdapter {
  get(): State;
  /** Apply data from Drive (doesn't count as a new local change). */
  apply(s: State): void;
  /** Replace data as if the user did it (gets synced). */
  replace(s: State): void;
  /** Close out the day if the date changed. */
  rollover(): void;
}

export interface EngineDeps {
  drive: DriveApi;
  token(): string | null;
  clearToken(): void;
  store: StoreAdapter;
  meta: MetaStore;
  deviceName: string;
  online(): boolean;
  now?(): number;
  schedule?(fn: () => void, ms: number): unknown;
  cancel?(handle: unknown): void;
  notify?(text: string, undo?: () => void): void;
  /** Run one sync at a time across browser tabs. */
  lock?<T>(fn: () => Promise<T>): Promise<T>;
}

export type FirstChoice = 'merge' | 'drive' | 'device' | 'cancel';

const DEBOUNCE_MS = 3000;
const BACKOFF_MS = [5_000, 15_000, 60_000, 300_000];
/** Identifies the content of a Drive file. Drive bumps `version` for its own housekeeping too, so prefer the revision id. */
const rev = (f: DriveFile) => f.headRevisionId ?? f.version;

const PAUSED_MSG = 'Google sign-in expired. Tap “Sync now” to continue — your changes are saved on this device.';

export class SyncEngine {
  private view: SyncView;
  private listeners = new Set<() => void>();
  private queue: Promise<void> = Promise.resolve();
  private queuedSync: Promise<void> | null = null;
  private debounceTimer: unknown;
  private retryTimer: unknown;
  private retryCount = 0;
  private resolutions: Resolutions = {};
  private choiceData?: { remote: CloudData; file: DriveFile };

  constructor(private d: EngineDeps) {
    const meta = d.meta.load();
    this.view = {
      status: meta.account ? (d.token() ? 'synced' : 'paused') : 'disconnected',
      account: meta.account,
      lastSyncedAt: meta.lastSyncedAt,
      autoSync: meta.autoSync,
      pending: !!meta.account && this.fingerprint() !== meta.syncedHash,
      conflicts: [],
    };
  }

  /* ---------- For React ---------- */

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getView = () => this.view;

  private set(p: Partial<SyncView>) {
    this.view = { ...this.view, ...p };
    this.listeners.forEach((l) => l());
  }

  /* ---------- Helpers ---------- */

  private now = () => this.d.now?.() ?? Date.now();
  private schedule = (fn: () => void, ms: number) => (this.d.schedule ?? setTimeout)(fn, ms);
  private cancel = (h: unknown) => (this.d.cancel ?? ((x: any) => clearTimeout(x)))(h);
  private fingerprint = (s = this.d.store.get()) => hash(JSON.stringify(s));
  private device = (meta: SyncMeta) => ({ id: meta.deviceId, name: this.d.deviceName });
  private notify = (text: string, undo?: () => void) => this.d.notify?.(text, undo);

  private enqueue(fn: () => Promise<void>): Promise<void> {
    const lock = this.d.lock ?? ((f: () => Promise<void>) => f());
    this.queue = this.queue.then(() => lock(() => fn().catch((e) => this.fail(e))));
    return this.queue;
  }

  private fail(e: unknown) {
    const retry = (msg: string) => {
      const delay = BACKOFF_MS[Math.min(this.retryCount++, BACKOFF_MS.length - 1)];
      this.set({ status: 'error', message: `${msg} Trying again in ${Math.round(delay / 1000)}s.` });
      this.cancel(this.retryTimer);
      this.retryTimer = this.schedule(() => this.syncNow(), delay);
    };
    if (e instanceof DriveError) {
      if (e.kind === 'auth') {
        this.d.clearToken();
        this.set({ status: 'paused', message: PAUSED_MSG });
      } else if (e.kind === 'scope') {
        this.d.clearToken();
        this.set({ status: 'paused', message: 'Drive access wasn’t granted. Tap “Reconnect” and allow access to the app’s own Drive folder.' });
      } else if (e.kind === 'offline' || !this.d.online()) {
        this.set({ status: 'offline', message: undefined });
      } else if (e.kind === 'rate' || e.kind === 'server') {
        retry(e.message);
      } else {
        retry(`Google Drive error: ${e.message}.`);
      }
    } else if (e instanceof CorruptBackupError) {
      this.set({ status: 'error', message: `${e.message} Nothing was changed. You can replace it with this device’s data — Drive keeps the old version.`, corrupt: true });
    } else if (e instanceof NewerSchemaError) {
      this.set({ status: 'error', message: e.message });
    } else {
      retry('Something went wrong while syncing.');
    }
  }

  /* ---------- Triggers ---------- */

  /** Call on app start. Syncs first if it can, then closes out the day with the freshest data. */
  start() {
    const meta = this.d.meta.load();
    if (!meta.account || !meta.autoSync || !this.d.token() || !this.d.online()) {
      this.d.store.rollover();
      if (meta.account && !this.d.online()) this.set({ status: 'offline' });
      return;
    }
    const fallback = this.schedule(() => this.d.store.rollover(), 5000);
    this.syncNow().finally(() => {
      this.cancel(fallback);
      this.d.store.rollover();
    });
  }

  /** A local edit happened: note it and sync a few seconds after the typing stops. */
  localChanged() {
    const meta = this.d.meta.load();
    if (!meta.account) return;
    const pending = this.fingerprint() !== meta.syncedHash;
    if (pending !== this.view.pending) this.set({ pending });
    if (!meta.autoSync || !pending) return;
    this.cancel(this.debounceTimer);
    this.debounceTimer = this.schedule(() => this.syncNow(), DEBOUNCE_MS);
  }

  /** App opened, came back to the foreground, or reconnected: check Drive if automatic sync is on. */
  wake() {
    const meta = this.d.meta.load();
    if (!meta.account) return;
    if (!this.d.token()) {
      if (this.view.status !== 'choose' && this.view.status !== 'conflict') this.set({ status: 'paused', message: this.view.pending ? PAUSED_MSG : undefined });
      return;
    }
    if (meta.autoSync && this.view.status !== 'choose') this.syncNow();
  }

  /** Sync now. Repeated calls while one is waiting share it. */
  syncNow(): Promise<void> {
    this.cancel(this.debounceTimer);
    if (this.queuedSync) return this.queuedSync;
    const p = this.enqueue(async () => {
      this.queuedSync = null;
      await this.runSync();
    });
    this.queuedSync = p;
    return p;
  }

  /* ---------- The sync itself ---------- */

  private async runSync() {
    const meta = this.d.meta.load();
    if (!meta.account) return this.set({ status: 'disconnected' });
    if (this.view.status === 'choose') return;
    const pending = this.fingerprint() !== meta.syncedHash;
    if (pending !== this.view.pending) this.set({ pending });
    const token = this.d.token();
    if (!token) return this.set({ status: 'paused', message: pending ? PAUSED_MSG : undefined });
    if (!this.d.online()) return this.set({ status: 'offline', message: undefined });
    // While a choice is waiting, re-checks keep showing it rather than flickering to "Syncing…".
    if (this.view.status !== 'conflict') this.set({ status: 'syncing' });
    const { drive } = this.d;

    for (let attempt = 0; attempt < 4; attempt++) {
      const m = this.d.meta.load();
      // 1. Find the Drive file.
      let file: DriveFile | null = null;
      let extras: DriveFile[] = [];
      if (m.fileId) {
        try {
          file = await drive.meta(token, m.fileId);
        } catch (e) {
          if (!(e instanceof DriveError && e.kind === 'notFound')) throw e;
        }
      }
      if (!file) {
        const files = await drive.find(token);
        file = files[0] ?? null;
        extras = files.slice(1); // two devices created it at the same moment
      }

      // 2. Read it, unless it hasn't changed since our last sync.
      let base = this.d.meta.loadBase();
      let remote: CloudData | null = null;
      const unchanged = base && file && file.id === m.fileId && rev(file) === m.remoteVersion;
      if (file) remote = unchanged ? base : parseCloud(await drive.download(token, file.id));
      for (const x of extras) {
        try {
          const other = parseCloud(await drive.download(token, x.id));
          remote = remote ? unionCloud(remote, other) : other;
        } catch (e) {
          if (!(e instanceof CorruptBackupError)) throw e;
        }
      }
      // The file was deleted from Drive: start it again from this device, rather than
      // reading the missing file as "everything was deleted".
      if (!remote) base = null;

      // 3. Merge.
      const state = this.d.store.get();
      const now = this.now();
      const device = this.device(m);
      const local = stamp(state, base, now, device);
      let result = local;
      if (remote) {
        const merged = mergeCloud(base ?? emptyCloud(), local, remote, this.resolutions);
        if (merged.conflicts.length) {
          const n = merged.conflicts.length;
          return this.set({ status: 'conflict', conflicts: merged.conflicts, message: `${n} change${n === 1 ? '' : 's'} made on different devices need${n === 1 ? 's' : ''} your choice. Nothing is uploaded until you decide.` });
        }
        result = merged.data;
      }
      result.savedAt = now;
      result.device = device;

      // 4. Bring changes from other devices onto this one.
      if (contentOf(result) !== contentOf(local)) {
        if (this.d.store.get() !== state) continue; // edited while we were downloading — start over
        this.d.store.apply(toState(result));
        if (remote && file) {
          // What's in Drive is now the shared starting point for the next merge.
          this.d.meta.saveBase(remote);
          this.d.meta.save({ ...this.d.meta.load(), fileId: file.id, remoteVersion: rev(file) });
        }
      }
      const syncedState = this.d.store.get();

      // 5. Upload, unless Drive already has exactly this.
      let saved = file;
      if (!remote || !file || contentOf(result) !== contentOf(remote)) {
        if (file) {
          // Someone else saved in the meantime? Go round again so their change is merged, not overwritten.
          const fresh = await drive.meta(token, file.id);
          if (rev(fresh) !== rev(file)) continue;
          saved = await drive.update(token, file.id, serialize(result));
          // Drive can't refuse a write when the file changed underneath it, so check afterwards:
          // if another device saved between our check and our upload, put its save back from the
          // file's history and go round again to merge it properly.
          if (remote && (await this.putBackLostSave(token, file, fresh, saved, remote))) continue;
        } else {
          saved = await drive.create(token, serialize(result));
        }
      }
      for (const x of extras) await drive.remove(token, x.id).catch(() => undefined);

      // 6. Remember this as the last synced copy.
      this.d.meta.saveBase(result);
      this.d.meta.save({ ...this.d.meta.load(), fileId: saved!.id, remoteVersion: rev(saved!), lastSyncedAt: now, syncedHash: this.fingerprint(syncedState) });
      this.resolutions = {};
      this.retryCount = 0;
      this.cancel(this.retryTimer);
      this.set({ status: 'synced', message: undefined, conflicts: [], corrupt: false, lastSyncedAt: now, pending: this.d.store.get() !== syncedState });
      return;
    }
    throw new Error('Drive kept changing during sync');
  }

  /** Returns true if another device's save was overwritten and has been put back. */
  private async putBackLostSave(token: string, file: DriveFile, before: DriveFile, saved: DriveFile, remote: CloudData): Promise<boolean> {
    try {
      const revs = await this.d.drive.revisions(token, file.id);
      const mine = saved.headRevisionId ? revs.findIndex((r) => r.id === saved.headRevisionId) : revs.length - 1;
      const prev = revs[mine - 1];
      // The save just before ours is the one we checked against: nothing slipped in between.
      if (!prev || prev.id === rev(before)) return false;
      const text = await this.d.drive.downloadRevision(token, file.id, prev.id);
      if (contentOf(parseCloud(text)) === contentOf(remote)) return false; // nothing was lost
      await this.d.drive.update(token, file.id, text);
      this.d.meta.saveBase(remote);
      this.d.meta.save({ ...this.d.meta.load(), fileId: file.id, remoteVersion: rev(file) });
      return true;
    } catch {
      return false;
    }
  }

  /* ---------- Connecting ---------- */

  /** Called after Google sign-in succeeds. Works out whether this is a new link, a restore, or a reconnect. */
  connected(account: GoogleAccount): Promise<void> {
    const meta = this.d.meta.load();
    const sameAccount = meta.account?.sub === account.sub && !!this.d.meta.loadBase();
    const next: SyncMeta = sameAccount ? { ...meta, account } : { deviceId: meta.deviceId, autoSync: meta.autoSync, account };
    this.d.meta.save(next);
    if (!sameAccount) this.d.meta.saveBase(null);
    this.resolutions = {};
    this.choiceData = undefined;
    this.set({ account, lastSyncedAt: next.lastSyncedAt, status: 'connecting', message: undefined, conflicts: [], corrupt: false, choice: undefined });
    if (sameAccount) return this.syncNow();

    return this.enqueue(async () => {
      const token = this.d.token();
      if (!token) throw new DriveError('auth', 'Not signed in.');
      const files = await this.d.drive.find(token);
      const local = this.d.store.get();
      if (!files.length) {
        await this.runSync();
        if (this.view.status === 'synced') this.notify('Connected — your dashboard is now saved to Google Drive.');
        return;
      }
      const file = files[0];
      const remote = parseCloud(await this.d.drive.download(token, file.id));
      const sameData = contentOf(stamp(local, null, 0, this.device(next))) === contentOf(remote);
      if (!hasContent(local) || sameData) {
        // New device (or identical data): just use what's in Drive.
        if (!sameData) this.d.meta.saveBackup(JSON.stringify(local));
        this.adopt(remote, file);
        await this.runSync();
        if (!sameData) this.notify('Your dashboard was restored from Google Drive.');
        return;
      }
      if (!hasContent(toState(remote))) {
        // The Drive copy has nothing in it: keep this device's data without asking.
        this.d.meta.saveBase(remote);
        this.d.meta.save({ ...this.d.meta.load(), fileId: file.id, remoteVersion: rev(file) });
        await this.runSync();
        if (this.view.status === 'synced') this.notify('Connected — your dashboard is now saved to Google Drive.');
        return;
      }
      this.choiceData = { remote, file };
      this.set({
        status: 'choose',
        choice: { local: summarize(local), remote: summarize(toState(remote)), remoteSavedAt: remote.savedAt, remoteDevice: remote.device.name },
      });
    });
  }

  private adopt(remote: CloudData, file: DriveFile) {
    this.d.store.apply(toState(remote));
    this.d.meta.saveBase(remote);
    this.d.meta.save({ ...this.d.meta.load(), fileId: file.id, remoteVersion: rev(file) });
  }

  /** The user's answer to "this device and Google Drive both have data". */
  choose(choice: FirstChoice): Promise<void> {
    const cd = this.choiceData;
    if (!cd || this.view.status !== 'choose') return Promise.resolve();
    this.choiceData = undefined;
    this.set({ status: 'connecting', choice: undefined });
    if (choice === 'cancel') {
      this.disconnect();
      return Promise.resolve();
    }
    const local = this.d.store.get();
    if (choice === 'drive') {
      this.d.meta.saveBackup(JSON.stringify(local));
      this.adopt(cd.remote, cd.file);
      this.notify('Now using the copy from Google Drive. This device’s previous data was saved.', () => this.d.store.replace(local));
    } else if (choice === 'device') {
      // Drive's copy becomes the starting point, so everything here counts as the newer change.
      // (Drive keeps its previous version in the file's history.)
      this.d.meta.saveBase(cd.remote);
      this.d.meta.save({ ...this.d.meta.load(), fileId: cd.file.id, remoteVersion: rev(cd.file) });
    } else {
      // Merge: no shared history, so everything from both sides is kept.
      // The default quick links exist on both with different ids — don't double them.
      const remoteUrls = new Set(toState(cd.remote).links.map((l) => l.url));
      const links = local.links.filter((l) => !remoteUrls.has(l.url));
      if (links.length !== local.links.length) this.d.store.apply({ ...local, links });
      this.d.meta.saveBase(emptyCloud());
      this.d.meta.save({ ...this.d.meta.load(), fileId: cd.file.id, remoteVersion: undefined });
    }
    return this.syncNow();
  }

  /** The user's answers in the conflict dialog. */
  resolve(choices: Record<string, Choice>): Promise<void> {
    this.resolutions = { ...choices };
    this.set({ conflicts: [], status: 'syncing', message: undefined });
    return this.syncNow();
  }

  /** Disconnect: stop syncing. Data stays on this device and in Drive. */
  disconnect() {
    const meta = this.d.meta.load();
    this.d.meta.save({ deviceId: meta.deviceId, autoSync: meta.autoSync });
    this.d.meta.saveBase(null);
    this.cancel(this.debounceTimer);
    this.cancel(this.retryTimer);
    this.resolutions = {};
    this.choiceData = undefined;
    this.set({ status: 'disconnected', account: undefined, message: undefined, lastSyncedAt: undefined, pending: false, conflicts: [], corrupt: false, choice: undefined });
  }

  setAutoSync(on: boolean) {
    this.d.meta.save({ ...this.d.meta.load(), autoSync: on });
    this.set({ autoSync: on });
    if (on && this.view.pending) this.syncNow();
  }

  /** Paused because the token expired; the UI got a new one. */
  resumed() {
    this.set({ message: undefined });
    return this.syncNow();
  }

  /* ---------- Restore ---------- */

  private async fileId(token: string): Promise<string | null> {
    const id = this.d.meta.load().fileId;
    if (id) return id;
    return (await this.d.drive.find(token))[0]?.id ?? null;
  }

  /** Saved versions of the Drive file, newest first (Drive keeps recent history). */
  async versions(): Promise<DriveRevision[]> {
    const token = this.d.token();
    if (!token) throw new DriveError('auth', 'Not signed in.');
    const id = await this.fileId(token);
    if (!id) return [];
    return (await this.d.drive.revisions(token, id)).slice().reverse().slice(0, 20);
  }

  /** Replace this device's data with a version from Drive. Undo is offered right after. */
  async restore(revisionId: string): Promise<void> {
    const token = this.d.token();
    if (!token) throw new DriveError('auth', 'Not signed in.');
    const id = await this.fileId(token);
    if (!id) throw new Error('There’s no copy in Google Drive yet.');
    const data = parseCloud(await this.d.drive.downloadRevision(token, id, revisionId));
    const before = this.d.store.get();
    this.d.meta.saveBackup(JSON.stringify(before));
    this.d.store.replace(toState(data));
    this.notify('Restored from Google Drive.', () => this.d.store.replace(before));
  }

  /** The Drive copy is damaged: overwrite it with this device's data (Drive keeps the old version). */
  replaceRemote(): Promise<void> {
    return this.enqueue(async () => {
      const token = this.d.token();
      if (!token) throw new DriveError('auth', 'Not signed in.');
      const meta = this.d.meta.load();
      const id = await this.fileId(token);
      const now = this.now();
      const data = stamp(this.d.store.get(), null, now, this.device(meta));
      const saved = id ? await this.d.drive.update(token, id, serialize(data)) : await this.d.drive.create(token, serialize(data));
      this.d.meta.saveBase(data);
      this.d.meta.save({ ...this.d.meta.load(), fileId: saved.id, remoteVersion: rev(saved), lastSyncedAt: now, syncedHash: this.fingerprint() });
      this.set({ status: 'synced', corrupt: false, message: undefined, lastSyncedAt: now, pending: false });
    });
  }
}
