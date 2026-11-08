import { emptyState, normalize } from '../store';
import type { State } from '../types';

/**
 * The file kept in Google Drive (appDataFolder/daily-dashboard.json).
 *
 * {
 *   "schema": 1, "app": "daily-dashboard",
 *   "savedAt": 1731068400000, "device": { "id": "…", "name": "Mac · Chrome" },
 *   "collections": { "tasks": { "<task id>": { "t": 1731068400000, "data": { …task } },
 *                               "<deleted id>": { "t": 1731068400000, "deleted": true } }, … },
 *   "orders": { "tasks": { "t": …, "ids": ["…"] }, … },
 *   "values": { "notes": { "t": …, "value": "…" }, … }
 * }
 *
 * - Every record keeps its stable id and `t`, the time it last changed.
 * - Deleted records stay as small "tombstones" for 90 days so the deletion reaches every device.
 * - No tokens or secrets are ever written here.
 */

export const SCHEMA_VERSION = 1;
export const APP_ID = 'daily-dashboard';
const TOMBSTONE_DAYS = 90;

/** Lists of records with ids. Journal and focus are keyed by date. */
export const COLLECTIONS = ['tasks', 'events', 'projects', 'habits', 'links', 'jobs', 'journal', 'focus'] as const;
/** Single values. */
export const VALUES = ['notes', 'priority', 'reflection', 'settings', 'onboarded', 'lastActiveDate'] as const;
export type CollectionKey = (typeof COLLECTIONS)[number];
export type ValueKey = (typeof VALUES)[number];

export interface RecordEntry {
  t: number;
  data?: any;
  deleted?: true;
}
export interface ValueEntry {
  t: number;
  value: any;
}
export interface OrderEntry {
  t: number;
  ids: string[];
}
export interface CloudData {
  schema: number;
  app: string;
  savedAt: number;
  device: { id: string; name: string };
  collections: Record<CollectionKey, Record<string, RecordEntry>>;
  orders: Partial<Record<CollectionKey, OrderEntry>>;
  values: Partial<Record<ValueKey, ValueEntry>>;
}

export class CorruptBackupError extends Error {}
export class NewerSchemaError extends Error {}

export function emptyCloud(): CloudData {
  return {
    schema: SCHEMA_VERSION,
    app: APP_ID,
    savedAt: 0,
    device: { id: '', name: '' },
    collections: Object.fromEntries(COLLECTIONS.map((c) => [c, {}])) as CloudData['collections'],
    orders: {},
    values: {},
  };
}

/* ---------- Comparing ---------- */

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);

/** Deep equality that ignores key order and treats a missing key like `undefined`. */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((x, i) => deepEqual(x, b[i]));
  }
  if (isObj(a) && isObj(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) if (!deepEqual(a[k], b[k])) return false;
    return true;
  }
  return false;
}

/** Drop `undefined` and copy, so what we compare is exactly what gets saved. */
const clean = <T>(x: T): T => (x === undefined ? x : JSON.parse(JSON.stringify(x)));

/* ---------- State → file ---------- */

function itemsOf(s: State, c: CollectionKey): { id: string; data: unknown }[] {
  if (c === 'journal') return s.journal.map((j) => ({ id: j.date, data: j }));
  if (c === 'focus') return Object.entries(s.focus).map(([d, f]) => ({ id: d, data: f }));
  return (s[c] as { id: string }[]).map((x) => ({ id: x.id, data: x }));
}

/**
 * Describe this device's data in the file format. Records unchanged since `base` (the last synced
 * copy) keep their old timestamp; changed ones get `now`; ones that disappeared become tombstones.
 */
export function stamp(s: State, base: CloudData | null, now: number, device: CloudData['device']): CloudData {
  const out = emptyCloud();
  out.savedAt = now;
  out.device = device;
  const cutoff = now - TOMBSTONE_DAYS * 864e5;
  for (const c of COLLECTIONS) {
    const baseC = base?.collections[c] ?? {};
    const col: Record<string, RecordEntry> = {};
    const ids: string[] = [];
    for (const { id, data } of itemsOf(s, c)) {
      if (col[id]) continue; // ignore accidental duplicate ids
      const d = clean(data);
      const b = baseC[id];
      col[id] = b && !b.deleted && deepEqual(b.data, d) ? b : { t: now, data: d };
      ids.push(id);
    }
    for (const [id, b] of Object.entries(baseC)) {
      if (col[id]) continue;
      if (!b.deleted) col[id] = { t: now, deleted: true };
      else if (b.t > cutoff) col[id] = b;
    }
    out.collections[c] = col;
    if (c !== 'journal' && c !== 'focus') {
      const bo = base?.orders[c];
      out.orders[c] = bo && deepEqual(bo.ids, ids) ? bo : { t: now, ids };
    }
  }
  for (const v of VALUES) {
    const value = clean(s[v]);
    const b = base?.values[v];
    out.values[v] = b && deepEqual(b.value, value) ? b : { t: now, value };
  }
  return out;
}

/* ---------- File → state ---------- */

export function toState(d: CloudData): State {
  const raw: any = { ...emptyState() };
  for (const c of COLLECTIONS) {
    const live = Object.entries(d.collections[c] ?? {}).filter(([, e]) => !e.deleted && e.data !== undefined);
    if (c === 'focus') {
      raw.focus = Object.fromEntries(live.map(([id, e]) => [id, e.data]));
    } else if (c === 'journal') {
      raw.journal = live.map(([, e]) => e.data).sort((a, b) => (a.date < b.date ? 1 : -1));
    } else {
      const byId = new Map(live);
      const order = (d.orders[c]?.ids ?? []).filter((id) => byId.has(id));
      const seen = new Set(order);
      const rest = live.filter(([id]) => !seen.has(id)).sort((a, b) => b[1].t - a[1].t).map(([id]) => id);
      raw[c] = [...order, ...rest].map((id) => byId.get(id)!.data);
    }
  }
  for (const v of VALUES) {
    const e = d.values[v];
    if (e && e.value !== undefined) raw[v] = e.value;
  }
  return normalize(raw);
}

/** Just the data, without timestamps or save info — to tell whether two copies really differ. */
export function contentOf(d: CloudData): string {
  const sorted = (o: Record<string, unknown>) => Object.keys(o).sort().map((k) => [k, o[k]]);
  return JSON.stringify({
    c: COLLECTIONS.map((c) => sorted(Object.fromEntries(Object.entries(d.collections[c] ?? {}).map(([id, e]) => [id, e.deleted ? 0 : e.data])))),
    o: COLLECTIONS.map((c) => d.orders[c]?.ids ?? null),
    v: VALUES.map((v) => d.values[v]?.value ?? null),
  });
}

/* ---------- Reading and writing the file ---------- */

export const serialize = (d: CloudData) => JSON.stringify(d);

/** Read and check a file from Drive. Throws instead of ever guessing at a damaged file. */
export function parseCloud(text: string): CloudData {
  let j: any;
  try {
    j = JSON.parse(text);
  } catch {
    throw new CorruptBackupError('The copy in Google Drive is damaged (not valid JSON).');
  }
  if (!isObj(j) || j.app !== APP_ID || typeof j.schema !== 'number') {
    throw new CorruptBackupError('The file in Google Drive isn’t a Daily Dashboard backup.');
  }
  if (j.schema > SCHEMA_VERSION) {
    throw new NewerSchemaError('The copy in Google Drive was saved by a newer version of the app. Reload this page to update, then sync again.');
  }
  // Older versions would be upgraded here, one step at a time (none exist yet).
  const out = emptyCloud();
  out.savedAt = Number(j.savedAt) || 0;
  out.device = isObj(j.device) ? { id: String(j.device.id ?? ''), name: String(j.device.name ?? '') } : out.device;
  const cols = isObj(j.collections) ? j.collections : {};
  for (const c of COLLECTIONS) {
    const src = isObj(cols[c]) ? cols[c] : {};
    for (const [id, e] of Object.entries(src)) {
      if (!isObj(e) || typeof e.t !== 'number') throw new CorruptBackupError(`The copy in Google Drive is damaged (bad record in ${c}).`);
      if (e.deleted === true) out.collections[c][id] = { t: e.t, deleted: true };
      else if (isObj(e.data)) out.collections[c][id] = { t: e.t, data: e.data };
      else throw new CorruptBackupError(`The copy in Google Drive is damaged (bad record in ${c}).`);
    }
    const o = isObj(j.orders) ? j.orders[c] : undefined;
    if (isObj(o) && Array.isArray(o.ids) && typeof o.t === 'number') out.orders[c] = { t: o.t, ids: o.ids.map(String) };
  }
  const vals = isObj(j.values) ? j.values : {};
  for (const v of VALUES) {
    const e = vals[v];
    if (isObj(e) && typeof e.t === 'number' && 'value' in e) out.values[v] = { t: e.t, value: e.value };
  }
  return out;
}

/** Has this copy actually been used, beyond the defaults? */
export function hasContent(s: State): boolean {
  return (
    s.tasks.length > 0 ||
    s.events.length > 0 ||
    s.projects.length > 0 ||
    s.habits.length > 0 ||
    s.jobs.length > 0 ||
    s.journal.length > 0 ||
    Object.keys(s.focus).length > 0 ||
    !!s.notes.trim() ||
    !!s.priority.title
  );
}

/** A short summary like "12 tasks · 3 events · 40 journal days", for the first-connection choice. */
export function summarize(s: State): string {
  const parts: [number, string][] = [
    [s.tasks.length, 'task'],
    [s.events.length, 'event'],
    [s.projects.length, 'project'],
    [s.habits.length, 'habit'],
    [s.jobs.length, 'job'],
    [s.journal.length, 'journal day'],
  ];
  const text = parts.filter(([n]) => n).map(([n, w]) => `${n} ${w}${n === 1 ? '' : 's'}`);
  if (s.notes.trim()) text.push('notes');
  return text.join(' · ') || 'Nothing yet';
}
