import { describe, expect, it } from 'vitest';
import { DriveError, type DriveApi, type DriveFile } from '../google/drive';
import { emptyState, normalize } from '../store';
import type { State, Task } from '../types';
import { SyncEngine } from './engine';
import type { MetaStore, SyncMeta } from './local';
import { parseCloud } from './schema';

/* ---------- A fake Google Drive, kept in memory ---------- */

class FakeDrive implements DriveApi {
  files = new Map<string, { body: string; version: number; revisions: { id: string; body: string; at: string }[] }>();
  private n = 0;
  private housekeeping = 0;
  failNext: Partial<Record<keyof DriveApi, DriveError>> = {};
  /** Runs once right before the next update — to simulate another device saving at that moment. */
  beforeUpdate?: () => void;
  calls: string[] = [];

  private check(m: keyof DriveApi) {
    this.calls.push(m);
    const e = this.failNext[m];
    if (e) {
      delete this.failNext[m];
      throw e;
    }
  }
  private info(id: string): DriveFile {
    const f = this.files.get(id);
    if (!f) throw new DriveError('notFound', 'nope', 404);
    // Real Drive also raises `version` for its own housekeeping, without new content.
    return { id, version: String(f.version * 3 + this.housekeeping++), modifiedTime: new Date(f.version * 1000).toISOString(), headRevisionId: f.revisions[f.revisions.length - 1].id };
  }
  write(id: string, body: string) {
    const f = this.files.get(id)!;
    f.version++;
    f.body = body;
    f.revisions.push({ id: `r${f.version}`, body, at: new Date().toISOString() });
  }
  only() {
    expect(this.files.size).toBe(1);
    return [...this.files.values()][0];
  }
  async find() {
    this.check('find');
    return [...this.files.keys()].map((id) => this.info(id)).reverse();
  }
  async meta(_t: string, id: string) {
    this.check('meta');
    return this.info(id);
  }
  async download(_t: string, id: string) {
    this.check('download');
    this.info(id);
    return this.files.get(id)!.body;
  }
  async create(_t: string, body: string) {
    this.check('create');
    const id = `f${++this.n}`;
    this.files.set(id, { body, version: 1, revisions: [{ id: 'r1', body, at: '' }] });
    return this.info(id);
  }
  async update(_t: string, id: string, body: string) {
    this.check('update');
    const hook = this.beforeUpdate;
    this.beforeUpdate = undefined;
    hook?.();
    this.info(id);
    this.write(id, body);
    return this.info(id);
  }
  async remove(_t: string, id: string) {
    this.check('remove');
    this.files.delete(id);
  }
  async revisions(_t: string, id: string) {
    return this.files.get(id)!.revisions.map((r) => ({ id: r.id, modifiedTime: r.at }));
  }
  async downloadRevision(_t: string, id: string, rid: string) {
    return this.files.get(id)!.revisions.find((r) => r.id === rid)!.body;
  }
}

/** Routes each account's token to that account's Drive. */
function drives(map: Record<string, FakeDrive>): DriveApi {
  const pick = (t: string) => map[t] ?? map.default;
  return {
    find: (t) => pick(t).find(),
    meta: (t, id) => pick(t).meta(t, id),
    download: (t, id) => pick(t).download(t, id),
    create: (t, b) => pick(t).create(t, b),
    update: (t, id, b) => pick(t).update(t, id, b),
    remove: (t, id) => pick(t).remove(t, id),
    revisions: (t, id) => pick(t).revisions(t, id),
    downloadRevision: (t, id, r) => pick(t).downloadRevision(t, id, r),
  };
}

/* ---------- A fake device ---------- */

const ACC1 = { sub: 'acc1', email: 'me@gmail.com', name: 'Me' };
const ACC2 = { sub: 'acc2', email: 'work@gmail.com', name: 'Work me' };

function device(api: DriveApi, name: string) {
  let state: State = { ...emptyState(), onboarded: true };
  let token: string | null = 'default';
  let online = true;
  const kv = new Map<string, string>();
  const meta: MetaStore = {
    load: () => ({ deviceId: name, autoSync: true, ...JSON.parse(kv.get('meta') || '{}') }) as SyncMeta,
    save: (m) => kv.set('meta', JSON.stringify(m)),
    loadBase: () => JSON.parse(kv.get('base') || 'null'),
    saveBase: (d) => (d ? kv.set('base', JSON.stringify(d)) : kv.delete('base')),
    saveBackup: (j) => kv.set('backup', j),
  };
  const notes: string[] = [];
  const engine = new SyncEngine({
    drive: api,
    token: () => token,
    clearToken: () => (token = null),
    store: {
      get: () => state,
      apply: (s) => (state = s),
      replace: (s) => (state = normalize(s)),
      rollover: () => undefined,
    },
    meta,
    deviceName: name,
    online: () => online,
    schedule: () => 0,
    cancel: () => undefined,
    notify: (t) => notes.push(t),
  });
  return {
    engine,
    kv,
    notes,
    get state() {
      return state;
    },
    edit(fn: (s: State) => State) {
      state = fn(state);
    },
    setToken(t: string | null) {
      token = t;
    },
    setOnline(v: boolean) {
      online = v;
    },
    get view() {
      return engine.getView();
    },
  };
}

let seq = 0;
const task = (title: string, extra: Partial<Task> = {}): Task => ({ id: `t${++seq}`, title, done: false, priority: 'med', createdAt: 0, ...extra });
const addTask = (t: Task) => (s: State) => ({ ...s, tasks: [t, ...s.tasks] });
const editTask = (id: string, p: Partial<Task>) => (s: State) => ({ ...s, tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...p } : t)) });
const removeTask = (id: string) => (s: State) => ({ ...s, tasks: s.tasks.filter((t) => t.id !== id) });
const titles = (s: State) => s.tasks.map((t) => t.title).sort();

/** Two devices on the same account, both already connected and in sync. */
async function pair() {
  const drive = new FakeDrive();
  const api = drives({ default: drive });
  const a = device(api, 'laptop');
  const b = device(api, 'phone');
  const t1 = task('Write report');
  a.edit(addTask(t1));
  await a.engine.connected(ACC1);
  await b.engine.connected(ACC1);
  return { drive, api, a, b, t1 };
}

/* ---------- Tests ---------- */

describe('first connection', () => {
  it('uploads this device’s data when Drive is empty', async () => {
    const drive = new FakeDrive();
    const a = device(drives({ default: drive }), 'laptop');
    a.edit(addTask(task('Buy milk')));
    await a.engine.connected(ACC1);
    expect(a.view.status).toBe('synced');
    const file = parseCloud(drive.only().body);
    expect(Object.values(file.collections.tasks).map((e) => e.data.title)).toEqual(['Buy milk']);
    expect(file.schema).toBe(1);
    expect(file.device.name).toBe('laptop');
  });

  it('restores everything on a brand-new device', async () => {
    const { b, a } = await pair();
    expect(titles(b.state)).toEqual(titles(a.state));
    expect(b.view.status).toBe('synced');
    expect(b.notes.some((n) => /restored/i.test(n))).toBe(true);
  });

  it('asks before combining when both this device and Drive have data', async () => {
    const { api } = await pair();
    const c = device(api, 'tablet');
    c.edit(addTask(task('Tablet task')));
    await c.engine.connected(ACC1);
    expect(c.view.status).toBe('choose');
    expect(c.view.choice?.local).toBe('1 task');
    expect(titles(c.state)).toEqual(['Tablet task']); // nothing touched yet
  });

  it('doesn’t ask when the Drive copy is empty — keeps this device’s data', async () => {
    const { api, a, t1, drive } = await pair();
    a.edit(removeTask(t1.id));
    await a.engine.syncNow(); // Drive now holds an empty dashboard
    const c = device(api, 'tablet');
    c.edit(addTask(task('Tablet task')));
    await c.engine.connected(ACC1);
    expect(c.view.status).toBe('synced');
    expect(titles(c.state)).toEqual(['Tablet task']);
    expect(drive.only().body).toContain('Tablet task');
  });

  it('merge keeps both sides, without doubling the default quick links', async () => {
    const { api, drive } = await pair();
    const c = device(api, 'tablet');
    c.edit(addTask(task('Tablet task')));
    await c.engine.connected(ACC1);
    await c.engine.choose('merge');
    expect(titles(c.state)).toEqual(['Tablet task', 'Write report']);
    expect(c.state.links).toHaveLength(3);
    expect(Object.keys(parseCloud(drive.only().body).collections.tasks)).toHaveLength(2);
  });

  it('“use Drive’s copy” replaces local data but keeps a backup', async () => {
    const { api } = await pair();
    const c = device(api, 'tablet');
    c.edit(addTask(task('Tablet task')));
    await c.engine.connected(ACC1);
    await c.engine.choose('drive');
    expect(titles(c.state)).toEqual(['Write report']);
    expect(c.kv.get('backup')).toContain('Tablet task');
  });

  it('“use this device’s copy” makes Drive match this device', async () => {
    const { api, a } = await pair();
    const c = device(api, 'tablet');
    c.edit(addTask(task('Tablet task')));
    await c.engine.connected(ACC1);
    await c.engine.choose('device');
    await a.engine.syncNow();
    expect(titles(a.state)).toEqual(['Tablet task']);
  });
});

describe('everyday sync', () => {
  it('sends changes in both directions', async () => {
    const { a, b, t1 } = await pair();
    a.edit(editTask(t1.id, { done: true }));
    await a.engine.syncNow();
    await b.engine.syncNow();
    expect(b.state.tasks[0].done).toBe(true);

    b.edit(addTask(task('From phone')));
    await b.engine.syncNow();
    await a.engine.syncNow();
    expect(titles(a.state)).toEqual(['From phone', 'Write report']);
  });

  it('does not upload when nothing changed', async () => {
    const { a, drive } = await pair();
    drive.calls = [];
    await a.engine.syncNow();
    expect(drive.calls).not.toContain('update');
    expect(drive.calls).not.toContain('download');
  });

  it('keeps one file in Drive, updated in place', async () => {
    const { a, drive } = await pair();
    for (let i = 0; i < 3; i++) {
      a.edit(addTask(task(`n${i}`)));
      await a.engine.syncNow();
    }
    expect(drive.files.size).toBe(1);
  });

  it('syncs deletions, leaving a tombstone in the file', async () => {
    const { a, b, t1, drive } = await pair();
    a.edit(removeTask(t1.id));
    await a.engine.syncNow();
    await b.engine.syncNow();
    expect(b.state.tasks).toHaveLength(0);
    expect(parseCloud(drive.only().body).collections.tasks[t1.id]).toMatchObject({ deleted: true });
  });

  it('a device with old data doesn’t bring a deleted item back', async () => {
    const { a, b, t1 } = await pair();
    b.edit(addTask(task('Unrelated phone task')));
    a.edit(removeTask(t1.id));
    await a.engine.syncNow();
    await b.engine.syncNow();
    await a.engine.syncNow();
    expect(titles(a.state)).toEqual(['Unrelated phone task']);
    expect(titles(b.state)).toEqual(['Unrelated phone task']);
  });

  it('keeps offline edits and uploads them when back online', async () => {
    const { a, b } = await pair();
    a.setOnline(false);
    a.edit(addTask(task('Written on the train')));
    await a.engine.syncNow();
    expect(a.view.status).toBe('offline');
    a.setOnline(true);
    await a.engine.syncNow();
    await b.engine.syncNow();
    expect(titles(b.state)).toContain('Written on the train');
  });
});

describe('edits on two devices at once', () => {
  it('merges changes to different fields of the same task', async () => {
    const { a, b, t1 } = await pair();
    a.edit(editTask(t1.id, { title: 'Write Q4 report' }));
    b.edit(editTask(t1.id, { priority: 'high' }));
    b.edit(addTask(task('Phone extra')));
    await a.engine.syncNow();
    await b.engine.syncNow();
    await a.engine.syncNow();
    for (const d of [a, b]) {
      const t = d.state.tasks.find((x) => x.id === t1.id)!;
      expect(t).toMatchObject({ title: 'Write Q4 report', priority: 'high' });
      expect(titles(d.state)).toContain('Phone extra');
    }
  });

  it('asks when the same field changed on both, and uploads nothing until answered', async () => {
    const { a, b, t1, drive } = await pair();
    a.edit(editTask(t1.id, { title: 'Laptop title' }));
    b.edit(editTask(t1.id, { title: 'Phone title' }));
    await a.engine.syncNow();
    const versionBefore = drive.only().version;
    await b.engine.syncNow();
    expect(b.view.status).toBe('conflict');
    expect(b.view.conflicts[0]).toMatchObject({ what: 'Task', label: 'Phone title', canKeepBoth: true });
    expect(b.view.conflicts[0].fields[0]).toMatchObject({ path: 'title', local: 'Phone title', remote: 'Laptop title' });
    expect(drive.only().version).toBe(versionBefore);
    expect(b.state.tasks[0].title).toBe('Phone title'); // nothing discarded

    await b.engine.resolve({ [b.view.conflicts[0]?.id ?? `tasks:${t1.id}`]: 'remote' });
    expect(b.view.status).toBe('synced');
    expect(b.state.tasks[0].title).toBe('Laptop title');
  });

  it('“keep both” keeps two copies', async () => {
    const { a, b, t1 } = await pair();
    a.edit(editTask(t1.id, { title: 'Laptop title' }));
    b.edit(editTask(t1.id, { title: 'Phone title' }));
    await a.engine.syncNow();
    await b.engine.syncNow();
    await b.engine.resolve({ [`tasks:${t1.id}`]: 'both' });
    await a.engine.syncNow();
    expect(titles(a.state)).toEqual(['Laptop title', 'Phone title']);
  });

  it('asks when a task was edited on one device and deleted on the other', async () => {
    const { a, b, t1 } = await pair();
    a.edit(removeTask(t1.id));
    b.edit(editTask(t1.id, { done: true }));
    await a.engine.syncNow();
    await b.engine.syncNow();
    expect(b.view.conflicts[0]).toMatchObject({ kind: 'delete', deletedOn: 'remote' });
    await b.engine.resolve({ [`tasks:${t1.id}`]: 'local' }); // keep the edited task
    await a.engine.syncNow();
    expect(a.state.tasks[0]).toMatchObject({ id: t1.id, done: true });
  });

  it('asks about notes edited on both, and can keep both texts', async () => {
    const { a, b } = await pair();
    a.edit((s) => ({ ...s, notes: 'Laptop idea' }));
    b.edit((s) => ({ ...s, notes: 'Phone idea' }));
    await a.engine.syncNow();
    await b.engine.syncNow();
    expect(b.view.conflicts[0]).toMatchObject({ id: 'value:notes', canKeepBoth: true });
    await b.engine.resolve({ 'value:notes': 'both' });
    expect(b.state.notes).toBe('Phone idea\n\nLaptop idea');
  });

  it('adds up focus minutes logged on both devices the same day', async () => {
    const { a, b } = await pair();
    a.edit((s) => ({ ...s, focus: { '2026-11-08': { minutes: 25, sessions: 1 } } }));
    await a.engine.syncNow();
    await b.engine.syncNow();
    a.edit((s) => ({ ...s, focus: { '2026-11-08': { minutes: 50, sessions: 2 } } }));
    b.edit((s) => ({ ...s, focus: { '2026-11-08': { minutes: 45, sessions: 2 } } }));
    await a.engine.syncNow();
    await b.engine.syncNow();
    expect(b.state.focus['2026-11-08']).toEqual({ minutes: 70, sessions: 3 });
  });

  it('never overwrites a save that landed while uploading — merges it instead', async () => {
    const { a, b, drive } = await pair();
    b.edit(addTask(task('Phone, same moment')));
    a.edit(addTask(task('Laptop, same moment')));
    drive.beforeUpdate = () => {
      // The phone saves just before the laptop's upload goes through.
      const f = drive.only();
      const data = parseCloud(f.body);
      data.collections.tasks.raced = { t: Date.now(), data: { id: 'raced', title: 'Raced in', done: false, priority: 'med', createdAt: 0 } };
      drive.write([...drive.files.keys()][0], JSON.stringify(data));
    };
    await a.engine.syncNow();
    expect(titles(a.state)).toContain('Raced in');
    expect(titles(a.state)).toContain('Laptop, same moment');
    const inDrive = Object.values(parseCloud(drive.only().body).collections.tasks).map((e) => e.data?.title);
    expect(inDrive).toEqual(expect.arrayContaining(['Raced in', 'Laptop, same moment']));
  });
});

describe('problems', () => {
  it('pauses on an expired token, keeps edits, and resumes after reconnecting', async () => {
    const { a, b, drive } = await pair();
    a.edit(addTask(task('Made after token expired')));
    drive.failNext.meta = new DriveError('auth', 'expired', 401);
    await a.engine.syncNow();
    expect(a.view.status).toBe('paused');
    expect(a.view.pending).toBe(true);
    expect(titles(a.state)).toContain('Made after token expired');

    a.setToken('default'); // the user tapped "Sync now" and Google gave a new token
    await a.engine.resumed();
    await b.engine.syncNow();
    expect(titles(b.state)).toContain('Made after token expired');
  });

  it('a failed upload loses nothing and succeeds on the next try', async () => {
    const { a, b, drive } = await pair();
    a.edit(addTask(task('Important')));
    drive.failNext.update = new DriveError('server', 'Google Drive is having trouble.', 503);
    await a.engine.syncNow();
    expect(a.view.status).toBe('error');
    expect(a.view.message).toMatch(/Trying again/);
    expect(titles(a.state)).toContain('Important');
    await a.engine.syncNow();
    await b.engine.syncNow();
    expect(titles(b.state)).toContain('Important');
  });

  it('never overwrites a damaged Drive file on its own', async () => {
    const { a, drive } = await pair();
    const id = [...drive.files.keys()][0];
    drive.write(id, '{ this is not json');
    a.edit(addTask(task('Local work')));
    await a.engine.syncNow();
    expect(a.view).toMatchObject({ status: 'error', corrupt: true });
    expect(drive.only().body).toBe('{ this is not json');
    expect(titles(a.state)).toContain('Local work');

    await a.engine.replaceRemote(); // the user chose "Replace with this device's data"
    expect(parseCloud(drive.only().body).collections.tasks).toBeTruthy();
    expect(a.view.status).toBe('synced');
  });

  it('refuses a file from a newer app version instead of downgrading it', async () => {
    const { a, drive } = await pair();
    const id = [...drive.files.keys()][0];
    drive.write(id, JSON.stringify({ ...JSON.parse(drive.only().body), schema: 99 }));
    await a.engine.syncNow();
    expect(a.view.message).toMatch(/newer version/);
    expect(JSON.parse(drive.only().body).schema).toBe(99);
  });

  it('starts the file again if it was deleted from Drive, without wiping this device', async () => {
    const { a, drive } = await pair();
    drive.files.clear();
    await a.engine.syncNow();
    expect(titles(a.state)).toEqual(['Write report']);
    expect(titles(normalize({ ...emptyState(), tasks: Object.values(parseCloud(drive.only().body).collections.tasks).map((e) => e.data) }))).toEqual(['Write report']);
  });

  it('cleans up duplicate files created by two devices at once', async () => {
    const drive = new FakeDrive();
    const api = drives({ default: drive });
    const a = device(api, 'laptop');
    a.edit(addTask(task('A')));
    await a.engine.connected(ACC1);
    // A second file appears (another device created one at the same moment) with a task of its own.
    const other = parseCloud(drive.only().body);
    other.collections.tasks.b1 = { t: 1, data: { id: 'b1', title: 'B', done: false, priority: 'med', createdAt: 0 } };
    await drive.create('default', JSON.stringify(other));
    a.edit(addTask(task('C')));
    a.kv.set('meta', JSON.stringify({ ...JSON.parse(a.kv.get('meta')!), fileId: undefined }));
    await a.engine.syncNow();
    expect(drive.files.size).toBe(1);
    expect(titles(a.state)).toEqual(['A', 'B', 'C']);
    const inDrive = Object.values(parseCloud(drive.only().body).collections.tasks).map((e) => e.data.title).sort();
    expect(inDrive).toEqual(['A', 'B', 'C']);
  });
});

describe('switching accounts', () => {
  it('treats a different Google account as a new connection and doesn’t mix data silently', async () => {
    const personal = new FakeDrive();
    const work = new FakeDrive();
    const api = drives({ personal, work, default: personal });
    // The work account already has data in its Drive.
    const w = device(api, 'work-laptop');
    w.setToken('work');
    w.edit(addTask(task('Work task')));
    await w.engine.connected(ACC2);

    const a = device(api, 'laptop');
    a.setToken('personal');
    a.edit(addTask(task('Personal task')));
    await a.engine.connected(ACC1);
    expect(a.view.account?.email).toBe('me@gmail.com');

    a.setToken('work');
    await a.engine.connected(ACC2);
    expect(a.view.status).toBe('choose'); // asks instead of mixing
    await a.engine.choose('drive');
    expect(titles(a.state)).toEqual(['Work task']);
    expect(personal.only().body).toContain('Personal task'); // the other account's Drive is untouched
    expect(personal.only().body).not.toContain('Work task');
  });

  it('disconnecting keeps all data on the device', async () => {
    const { a } = await pair();
    a.engine.disconnect();
    expect(a.view.status).toBe('disconnected');
    expect(titles(a.state)).toEqual(['Write report']);
  });
});

describe('restore', () => {
  it('restores an earlier version from Drive, with a backup of the current data', async () => {
    const { a } = await pair();
    a.edit(addTask(task('Added later')));
    await a.engine.syncNow();
    const versions = await a.engine.versions();
    expect(versions.length).toBe(2);
    await a.engine.restore(versions[1].id); // the older one
    expect(titles(a.state)).toEqual(['Write report']);
    expect(a.kv.get('backup')).toContain('Added later');
  });
});
