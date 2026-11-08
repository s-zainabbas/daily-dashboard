/**
 * Google Drive API v3, limited to the app's hidden `appDataFolder`.
 * Files there are invisible in your Drive UI and readable only by this app.
 */

export const FILE_NAME = 'daily-dashboard.json';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

export interface DriveFile {
  id: string;
  version: string; // goes up on every change, including Drive's own housekeeping
  modifiedTime: string;
  headRevisionId?: string; // changes only when the content changes

}

export interface DriveRevision {
  id: string;
  modifiedTime: string;
}

export type DriveErrorKind = 'auth' | 'scope' | 'offline' | 'rate' | 'server' | 'notFound' | 'other';

export class DriveError extends Error {
  constructor(
    public kind: DriveErrorKind,
    message: string,
    public status = 0,
  ) {
    super(message);
  }
}

/** What the sync engine needs from Drive. The real one is below; tests use an in-memory fake. */
export interface DriveApi {
  find(token: string): Promise<DriveFile[]>;
  meta(token: string, id: string): Promise<DriveFile>;
  download(token: string, id: string): Promise<string>;
  create(token: string, body: string): Promise<DriveFile>;
  update(token: string, id: string, body: string): Promise<DriveFile>;
  remove(token: string, id: string): Promise<void>;
  revisions(token: string, id: string): Promise<DriveRevision[]>;
  downloadRevision(token: string, id: string, revisionId: string): Promise<string>;
}

const FIELDS = 'id,version,modifiedTime,headRevisionId';

async function call(token: string, url: string, init: RequestInit = {}): Promise<Response> {
  let r: Response;
  try {
    r = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...init.headers } });
  } catch {
    throw new DriveError('offline', 'Can’t reach Google Drive.');
  }
  if (r.ok) return r;
  let reason = '';
  let message = r.statusText;
  try {
    const j = await r.json();
    reason = j?.error?.errors?.[0]?.reason || j?.error?.status || '';
    message = j?.error?.message || message;
  } catch {
    /* not JSON */
  }
  if (r.status === 401) throw new DriveError('auth', 'Google sign-in expired.', 401);
  if (r.status === 404) throw new DriveError('notFound', 'File not found in Drive.', 404);
  if (r.status === 429 || /rateLimit/i.test(reason)) throw new DriveError('rate', 'Google Drive asked us to slow down.', r.status);
  if (r.status === 403 && /insufficient|scope|PERMISSION_DENIED/i.test(reason + message)) {
    throw new DriveError('scope', 'Drive access wasn’t granted.', 403);
  }
  if (r.status >= 500) throw new DriveError('server', 'Google Drive is having trouble.', r.status);
  throw new DriveError('other', message || 'Google Drive request failed.', r.status);
}

const json = (r: Response) => r.json();

export const drive: DriveApi = {
  async find(token) {
    const q = encodeURIComponent(`name='${FILE_NAME}' and trashed=false`);
    const r = await call(token, `${API}/files?spaces=appDataFolder&q=${q}&orderBy=modifiedTime desc&fields=files(${FIELDS})`);
    return (await json(r)).files ?? [];
  },
  async meta(token, id) {
    return json(await call(token, `${API}/files/${id}?fields=${FIELDS}`));
  },
  async download(token, id) {
    return (await call(token, `${API}/files/${id}?alt=media`, { cache: 'no-store' })).text();
  },
  async create(token, body) {
    const boundary = `dd${Math.random().toString(36).slice(2)}`;
    const meta = { name: FILE_NAME, parents: ['appDataFolder'], mimeType: 'application/json' };
    const multipart = [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      JSON.stringify(meta),
      `--${boundary}`,
      'Content-Type: application/json',
      '',
      body,
      `--${boundary}--`,
    ].join('\r\n');
    const r = await call(token, `${UPLOAD}/files?uploadType=multipart&fields=${FIELDS}`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body: multipart,
    });
    return json(r);
  },
  async update(token, id, body) {
    const r = await call(token, `${UPLOAD}/files/${id}?uploadType=media&fields=${FIELDS}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    return json(r);
  },
  async remove(token, id) {
    await call(token, `${API}/files/${id}`, { method: 'DELETE' });
  },
  async revisions(token, id) {
    const r = await call(token, `${API}/files/${id}/revisions?pageSize=200&fields=revisions(id,modifiedTime)`);
    return (await json(r)).revisions ?? [];
  },
  async downloadRevision(token, id, revisionId) {
    return (await call(token, `${API}/files/${id}/revisions/${revisionId}?alt=media`, { cache: 'no-store' })).text();
  },
};
