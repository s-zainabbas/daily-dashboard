/** Things shared to the dashboard from another app (phone share sheet, via the web app manifest). */

export interface Shared {
  title: string;
  /** Link and any extra text, for the task's notes or the note's body. */
  body: string;
  url?: string;
}

const URL_RE = /https?:\/\/\S+/;

/** Read `?share-title=…&share-text=…&share-url=…`. Apps fill these in differently, so links are found wherever they are. */
export function readShare(search: string): Shared | null {
  const q = new URLSearchParams(search);
  if (!['share-title', 'share-text', 'share-url'].some((k) => q.has(k))) return null;
  const title = (q.get('share-title') ?? '').trim();
  let text = (q.get('share-text') ?? '').trim();
  let url = (q.get('share-url') ?? '').trim() || undefined;
  if (!url) {
    const m = text.match(URL_RE);
    if (m) {
      url = m[0];
      text = text.replace(m[0], '').trim();
    }
  }
  const firstLine = text.split(/\r?\n/)[0]?.trim() ?? '';
  const name = title || (firstLine.length <= 120 ? firstLine : `${firstLine.slice(0, 117)}…`) || (url ? hostOf(url) : '') || 'Shared item';
  const rest = title ? text : text.split(/\r?\n/).slice(1).join('\n').trim() || (firstLine.length > 120 ? text : '');
  const body = [url, rest].filter(Boolean).join('\n\n');
  return { title: name, body, url };
}

/** The address without the share parameters, to put back in the address bar. */
export function withoutShare(search: string): string {
  const q = new URLSearchParams(search);
  ['share-title', 'share-text', 'share-url'].forEach((k) => q.delete(k));
  const s = q.toString();
  return s ? `?${s}` : '';
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
