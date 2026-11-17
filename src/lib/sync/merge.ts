import { fromKey } from '../date';
import { rollover, uid } from '../store';
import { COLLECTIONS, VALUES, deepEqual, emptyCloud, stamp, toState, type CloudData, type CollectionKey, type RecordEntry } from './schema';

/**
 * Three-way merge: `base` is the copy both sides had at the last sync, `local` is this device now,
 * `remote` is what's in Google Drive now. A side "changed" something if it differs from base.
 *
 * - Changed on one side only → that side wins (so older data never overwrites newer).
 * - Changed on both sides, in different records or different fields → both changes are kept.
 * - Changed on both sides in the same field → settled automatically, never asked about:
 *   something beats nothing (a filled-in field is never wiped by an empty one), text that only had
 *   more added on one side keeps the longer version, and otherwise the newer change wins.
 * - Edited on one side and deleted on the other → the edited one is kept, so nothing is lost.
 * - Focus minutes are added up, "onboarded" stays on, and the active date takes the later day.
 * - A copy still on an earlier day is first moved on to today the way the dashboard does it each
 *   morning (yesterday's review goes into the journal), so a new day never clashes with last night.
 *
 * Drive keeps earlier versions of the file, so anything replaced can still be restored.
 */

export type Choice = 'local' | 'remote' | 'both';
export type Resolutions = Record<string, Choice>;

export interface ConflictField {
  path: string;
  local: unknown;
  remote: unknown;
}
export interface Conflict {
  id: string; // "tasks:abc123" or "value:notes"
  what: string; // "Task", "Notes"…
  label: string; // the task title etc.
  kind: 'edit' | 'delete';
  deletedOn?: 'local' | 'remote';
  fields: ConflictField[];
  canKeepBoth: boolean;
}

export interface MergeResult {
  data: CloudData;
  conflicts: Conflict[];
}

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);

/** Field-by-field three-way merge of plain values. `prefer` settles same-field conflicts. */
export function merge3(b: unknown, l: unknown, r: unknown, prefer?: 'local' | 'remote', path = '', newer: 'local' | 'remote' = 'local'): { value: unknown; conflicts: ConflictField[] } {
  if (deepEqual(l, r)) return { value: l, conflicts: [] };
  if (deepEqual(l, b)) return { value: r, conflicts: [] };
  if (deepEqual(r, b)) return { value: l, conflicts: [] };
  if (isObj(l) && isObj(r)) {
    const bo = isObj(b) ? b : {};
    const out: Record<string, unknown> = {};
    const conflicts: ConflictField[] = [];
    for (const k of new Set([...Object.keys(l), ...Object.keys(r)])) {
      const m = merge3(bo[k], l[k], r[k], prefer, path ? `${path}.${k}` : k, newer);
      if (m.value !== undefined) out[k] = m.value;
      conflicts.push(...m.conflicts);
    }
    return { value: out, conflicts };
  }
  if (prefer) return { value: prefer === 'local' ? l : r, conflicts: [] };
  return { value: pick(l, r, newer), conflicts: [] };
}

const isEmpty = (x: unknown) =>
  x === undefined || x === null || x === '' || x === false || (typeof x === 'string' && !x.trim()) || (Array.isArray(x) && !x.length) || (isObj(x) && Object.values(x).every(isEmpty));

/** Settle one field both sides changed: something beats nothing, added-to text keeps the longer, else the newer change. */
function pick(l: unknown, r: unknown, newer: 'local' | 'remote'): unknown {
  if (isEmpty(l) !== isEmpty(r)) return isEmpty(l) ? r : l;
  if (typeof l === 'string' && typeof r === 'string') {
    if (r.includes(l.trim())) return r;
    if (l.includes(r.trim())) return l;
  }
  return newer === 'local' ? l : r;
}

const live = (e?: RecordEntry) => !!e && !e.deleted;
const sameEntry = (a?: RecordEntry, b?: RecordEntry) => (!live(a) && !live(b)) || (live(a) && live(b) && deepEqual(a!.data, b!.data));

function mergeRecord(
  c: CollectionKey,
  id: string,
  b: RecordEntry | undefined,
  l: RecordEntry | undefined,
  r: RecordEntry | undefined,
  choice: Choice | undefined,
): { entries: [string, RecordEntry][]; conflict?: Conflict } {
  const keep = (e?: RecordEntry): { entries: [string, RecordEntry][] } => ({ entries: e ? [[id, e]] : [] });
  if (sameEntry(l, r)) return keep(l && r ? (l.t >= r.t ? l : r) : (l ?? r));
  if (sameEntry(l, b)) return keep(r ?? (b ? { t: Date.now(), deleted: true } : undefined));
  if (sameEntry(r, b)) return keep(l ?? (b ? { t: Date.now(), deleted: true } : undefined));

  // Edited on one side, deleted on the other.
  if (!live(l) || !live(r)) {
    if (choice === 'local') return keep(l);
    if (choice === 'remote') return keep(r);
    // Keep the edited one: bringing back something deleted is easy to undo, a lost edit isn't.
    return keep(live(l) ? l : r);
  }
  // Edited on both sides.
  const bd = live(b) ? b!.data : undefined;
  if (c === 'focus') {
    // Focus minutes from both devices add up.
    const add = (k: string) => (Number(l!.data[k]) || 0) + (Number(r!.data[k]) || 0) - (Number(bd?.[k]) || 0);
    // Per-task minutes add up the same way.
    const li = l!.data.items ?? {};
    const ri = r!.data.items ?? {};
    const bi = bd?.items ?? {};
    const keys = new Set([...Object.keys(li), ...Object.keys(ri)]);
    const items = Object.fromEntries(
      [...keys].map((k) => {
        const minutes = (Number(li[k]?.minutes) || 0) + (Number(ri[k]?.minutes) || 0) - (Number(bi[k]?.minutes) || 0);
        return [k, { ...(ri[k] ?? {}), ...(li[k] ?? {}), minutes }];
      }),
    );
    return keep({ t: Math.max(l!.t, r!.t), data: { ...l!.data, minutes: add('minutes'), sessions: add('sessions'), ...(keys.size ? { items } : {}) } });
  }
  if (choice === 'both' && c !== 'journal') {
    const copyId = uid();
    return { entries: [[id, r!], [copyId, { t: l!.t, data: { ...l!.data, id: copyId } }]] };
  }
  const m = merge3(bd, l!.data, r!.data, choice === 'local' || choice === 'remote' ? choice : undefined, '', l!.t >= r!.t ? 'local' : 'remote');
  return keep({ t: Math.max(l!.t, r!.t), data: m.value });
}

export function mergeCloud(base: CloudData, local: CloudData, remote: CloudData, resolutions: Resolutions = {}): MergeResult {
  const out = emptyCloud();
  out.savedAt = local.savedAt;
  out.device = local.device;
  const conflicts: Conflict[] = [];

  for (const c of COLLECTIONS) {
    const bc = base.collections[c] ?? {};
    const lc = local.collections[c] ?? {};
    const rc = remote.collections[c] ?? {};
    const col: Record<string, RecordEntry> = {};
    for (const id of new Set([...Object.keys(bc), ...Object.keys(lc), ...Object.keys(rc)])) {
      const res = mergeRecord(c, id, bc[id], lc[id], rc[id], resolutions[`${c}:${id}`]);
      for (const [k, e] of res.entries) col[k] = e;
      if (res.conflict) conflicts.push(res.conflict);
    }
    out.collections[c] = col;

    const bo = base.orders[c];
    const lo = local.orders[c];
    const ro = remote.orders[c];
    const order = deepEqual(lo?.ids, bo?.ids) ? ro : deepEqual(ro?.ids, bo?.ids) ? lo : (lo?.t ?? 0) >= (ro?.t ?? 0) ? lo : ro;
    if (order) out.orders[c] = order;
  }

  for (const v of VALUES) {
    const b = base.values[v];
    const l = local.values[v];
    const r = remote.values[v];
    if (!l || !r) {
      const e = l ?? r;
      if (e) out.values[v] = e;
      continue;
    }
    const t = Math.max(l.t, r.t);
    if (v === 'onboarded') {
      out.values[v] = { t, value: !!(l.value || r.value) };
      continue;
    }
    if (v === 'lastActiveDate') {
      out.values[v] = { t, value: String(l.value) > String(r.value) ? l.value : r.value };
      continue;
    }
    const choice = resolutions[`value:${v}`];
    // Settings are low-stakes: the newer change wins without asking.
    const prefer = v === 'settings' ? (l.t >= r.t ? 'local' : 'remote') : choice === 'local' || choice === 'remote' ? choice : undefined;
    if (choice === 'both' && v === 'notes') {
      out.values[v] = { t, value: `${String(l.value).trimEnd()}\n\n${String(r.value).trimStart()}` };
      continue;
    }
    const m = merge3(b?.value, l.value, r.value, prefer, '', l.t >= r.t ? 'local' : 'remote');
    out.values[v] = { t, value: m.value };
  }
  return { data: out, conflicts };
}

/**
 * Move a copy that's still on an earlier day on to `day`, exactly as the dashboard does each
 * morning: the day's review and priority go into the journal and the daily fields reset.
 * Records it doesn't touch keep their timestamps.
 */
export function rollForward(d: CloudData, day: string, now = Date.now()): CloudData {
  const at = String(d.values.lastActiveDate?.value ?? '');
  if (!at || at >= day) return d;
  const state = toState(d);
  const next = rollover(state, fromKey(day));
  if (next === state) return d;
  const out = stamp(next, d, now, d.device);
  out.savedAt = d.savedAt;
  return out;
}

/** Bring both copies to the same day before merging, so a new day isn't seen as two clashing edits. */
export function sameDay(local: CloudData, remote: CloudData, now = Date.now()): { local: CloudData; remote: CloudData } {
  const l = String(local.values.lastActiveDate?.value ?? '');
  const r = String(remote.values.lastActiveDate?.value ?? '');
  if (!l || !r || l === r) return { local, remote };
  const day = l > r ? l : r;
  return { local: rollForward(local, day, now), remote: rollForward(remote, day, now) };
}

/** Combine two whole copies with no shared history, e.g. two copies of the Drive file. */
export function unionCloud(primary: CloudData, other: CloudData): CloudData {
  const empty = emptyCloud();
  const all: Resolutions = new Proxy({}, { get: () => 'local' as Choice });
  return mergeCloud(empty, primary, other, all).data;
}
