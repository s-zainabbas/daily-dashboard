/**
 * Storage for the big things: your dashboard data, the last synced copy and the pre-restore backup.
 *
 * localStorage caps out around 5 MB per site, which saved job descriptions, a long journal and a sync
 * copy of everything can reach. These keys live in IndexedDB instead (hundreds of MB or more).
 * IndexedDB is asynchronous, so `initKv()` reads them into memory once at startup; after that
 * reads are instant and writes go to IndexedDB in the background.
 *
 * Without IndexedDB (very old browsers, tests) everything quietly stays in localStorage.
 */

const DB = 'daily-dashboard';
const STORE = 'kv';
/** Written on page close in case the IndexedDB write doesn't finish; removed once it has. */
const PENDING = ':pending';

let db: IDBDatabase | null = null;
const mem = new Map<string, string | null>();
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('daily-dashboard-kv') : null;
const subscribers = new Map<string, Set<(value: string | null) => void>>();

function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function lsSet(key: string, value: string | null): boolean {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

const req = <T,>(r: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(new Error('blocked'));
  });
}

/** Whether the big keys are in IndexedDB (true after a successful `initKv`). */
export const usingIndexedDb = () => !!db;

/**
 * Open IndexedDB and load `keys` into memory. Data still in localStorage from older versions
 * is moved over and then removed from localStorage, freeing that space.
 */
export async function initKv(keys: string[]): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    const d = await open();
    for (const key of keys) {
      let value = (await req(d.transaction(STORE).objectStore(STORE).get(key))) as string | undefined;
      const pending = lsGet(key + PENDING);
      const legacy = lsGet(key);
      // A save from the moment the page closed beats what IndexedDB has; older localStorage data is
      // only used if IndexedDB has nothing yet (the first run after updating).
      const best = pending ?? value ?? legacy;
      if (best != null && best !== value) await req(d.transaction(STORE, 'readwrite').objectStore(STORE).put(best, key));
      value = best ?? undefined;
      lsSet(key + PENDING, null);
      lsSet(key, null);
      mem.set(key, value ?? null);
    }
    db = d;
    db.onversionchange = () => db?.close();
  } catch {
    db = null; // fall back to localStorage for this visit
  }
  channel?.addEventListener('message', (e: MessageEvent<{ key: string; value: string | null }>) => {
    if (!db || !mem.has(e.data.key)) return;
    mem.set(e.data.key, e.data.value);
    subscribers.get(e.data.key)?.forEach((fn) => fn(e.data.value));
  });
}

export function kvGet(key: string): string | null {
  return db && mem.has(key) ? mem.get(key)! : lsGet(key);
}

/**
 * Save a value. `onError` hears about a failed save (storage full or disabled).
 * `closing`: the page is going away, so also keep a copy in localStorage until IndexedDB confirms.
 */
export function kvSet(key: string, value: string | null, { closing = false, onError }: { closing?: boolean; onError?: () => void } = {}): void {
  if (!db || !mem.has(key)) {
    if (!lsSet(key, value)) onError?.();
    return;
  }
  mem.set(key, value);
  if (closing && value !== null) lsSet(key + PENDING, value);
  try {
    const tx = db.transaction(STORE, 'readwrite');
    const os = tx.objectStore(STORE);
    if (value === null) os.delete(key);
    else os.put(value, key);
    tx.oncomplete = () => {
      if (closing) lsSet(key + PENDING, null);
      channel?.postMessage({ key, value });
    };
    tx.onerror = () => onError?.();
  } catch {
    onError?.();
  }
}

/** Hear about saves to `key` from other tabs (IndexedDB mode; localStorage mode has the `storage` event). */
export function onKvChange(key: string, fn: (value: string | null) => void) {
  let set = subscribers.get(key);
  if (!set) subscribers.set(key, (set = new Set()));
  set.add(fn);
  return () => set!.delete(fn);
}
