import { SYNC_KEY, uid } from '../store';
import type { GoogleAccount } from '../google/auth';
import type { CloudData } from './schema';

/** What this device remembers about syncing. Never holds tokens (see google/auth.ts). */
export interface SyncMeta {
  deviceId: string;
  autoSync: boolean;
  account?: GoogleAccount;
  fileId?: string;
  remoteVersion?: string; // Drive revision id at the last sync
  lastSyncedAt?: number;
  syncedHash?: string; // fingerprint of the local data at the last sync, to show "changes waiting"
}

/** Storage for sync bookkeeping. The real one uses localStorage; tests use memory. */
export interface MetaStore {
  load(): SyncMeta;
  save(m: SyncMeta): void;
  loadBase(): CloudData | null;
  saveBase(d: CloudData | null): void;
  saveBackup(json: string): void;
}

const BASE_KEY = 'daily-dashboard:drive-base';
/** A copy of this device's data from just before it was replaced by a restore or "use Drive's copy". */
export const BACKUP_KEY = 'daily-dashboard:before-restore';

function read<T>(k: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(k) || 'null');
  } catch {
    return null;
  }
}
function write(k: string, v: string | null) {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* storage full — sync still works this visit */
  }
}

export const localMeta: MetaStore = {
  load() {
    const m = read<Partial<SyncMeta>>(SYNC_KEY) ?? {};
    const meta: SyncMeta = { autoSync: true, ...m, deviceId: m.deviceId || uid() };
    if (!m.deviceId) write(SYNC_KEY, JSON.stringify(meta));
    return meta;
  },
  save(m) {
    write(SYNC_KEY, JSON.stringify(m));
  },
  loadBase() {
    return read<CloudData>(BASE_KEY);
  },
  saveBase(d) {
    write(BASE_KEY, d ? JSON.stringify(d) : null);
  },
  saveBackup(json) {
    write(BACKUP_KEY, json);
  },
};

export function deviceName(): string {
  if (typeof navigator === 'undefined') return 'Device';
  const ua = navigator.userAgent;
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Device';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  return `${os} · ${browser}`;
}

/** Small fast string hash (cyrb53). */
export function hash(str: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
