/**
 * Turn a job-posting link into a company name, position and description.
 *
 * The app has no server, so it can only read sites that allow browser requests:
 * - Greenhouse, Lever and Ashby have public job APIs that do.
 * - Everything else (LinkedIn, Indeed, company career sites…) goes through
 *   Microlink, a free link-preview service, and we parse the page title.
 * Before any of that, `guessFromUrl` reads what it can from the link itself, so
 * there's something to show instantly and offline.
 */

export interface JobInfo {
  company?: string;
  role?: string;
  location?: string;
  description?: string;
}

const MAX_DESCRIPTION = 8000;

/** Sites that list other companies' jobs: their name is never the employer. */
const JOB_BOARDS = /(^|\.)(linkedin|indeed|glassdoor|ziprecruiter|monster|wellfound|angel|dice|simplyhired|builtin\w*|otta|welcometothejungle|joinhandshake|handshake|careerbuilder|ashbyhq|greenhouse|lever|workable|smartrecruiters|myworkdayjobs|workdayjobs|icims|jobvite|bamboohr|breezy|recruitee|teamtailor|jazzhr|applytojob|paylocity|ultipro|taleo|successfactors)\.[a-z.]+$/i;

const words = (s: string) => s.replace(/[-_+]+/g, ' ').replace(/\s+/g, ' ').trim();

/** "hard-rock-international" → "Hard Rock International" */
export function prettify(slug: string): string {
  const w = words(decodeURIComponent(slug));
  return w.replace(/\b([a-z])([a-z]*)/g, (_, a: string, b: string) => a.toUpperCase() + b);
}

/** Tidy a pasted link: LinkedIn search links become the job's own page, tracking junk is dropped. */
export function canonicalJobUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return raw;
  }
  if (/(^|\.)linkedin\.com$/i.test(u.hostname)) {
    const id = u.searchParams.get('currentJobId') ?? u.pathname.match(/\/jobs\/view\/(?:[^/]*?-)?(\d{6,})/)?.[1];
    if (id) return `https://www.linkedin.com/jobs/view/${id}/`;
  }
  for (const k of [...u.searchParams.keys()]) {
    if (/^(utm_|ref$|refId$|trackingId$|trk|src$|source$|lever-source|gh_src$)/i.test(k)) u.searchParams.delete(k);
  }
  u.hash = '';
  return u.href;
}

/** Same job, ignoring http/https, www., trailing slashes and query order. */
export function sameJobUrl(a: string, b: string): boolean {
  const key = (s: string) => {
    try {
      const u = new URL(canonicalJobUrl(s));
      u.searchParams.sort();
      return (u.hostname.replace(/^www\./, '') + u.pathname.replace(/\/+$/, '') + u.search).toLowerCase();
    } catch {
      return s.toLowerCase();
    }
  };
  return key(a) === key(b);
}

/** Company name from a career-site domain, e.g. careers.stripe.com → Stripe. */
function companyFromHost(host: string): string | undefined {
  if (JOB_BOARDS.test(host)) return undefined;
  const parts = host.replace(/^www\./, '').split('.');
  // Drop the TLD (and "co" in co.uk-style domains), keep the brand label.
  let i = parts.length - 2;
  if (i > 0 && /^(co|com|org|net|ac|gov)$/.test(parts[i]) && parts[i + 1].length === 2) i--;
  const brand = parts[Math.max(0, i)];
  return brand && !/^(careers?|jobs?|apply|boards?|hire|talent|work)$/i.test(brand) ? prettify(brand) : undefined;
}

/** Everything we can tell from the link alone, without fetching anything. */
export function guessFromUrl(raw: string): JobInfo {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return {};
  }
  const host = u.hostname.toLowerCase();
  const seg = u.pathname.split('/').filter(Boolean);

  if (/greenhouse\.io$/.test(host)) {
    const board = u.searchParams.get('for') ?? (seg[0] !== 'embed' ? seg[0] : undefined);
    return board ? { company: prettify(board) } : {};
  }
  if (/(^|\.)lever\.co$/.test(host) || host === 'jobs.ashbyhq.com' || host === 'apply.workable.com') {
    return seg[0] ? { company: prettify(seg[0]) } : {};
  }
  if (host === 'jobs.smartrecruiters.com' && seg[0]) {
    const title = seg[1]?.replace(/^\d+-/, '');
    return { company: prettify(seg[0]), role: title ? prettify(title) : undefined };
  }
  const wd = host.match(/^([a-z0-9-]+)\.wd\d+\.myworkdayjobs\.com$/);
  if (wd) {
    const i = seg.indexOf('job');
    const title = i >= 0 ? seg[seg.length - 1]?.replace(/_[A-Z]*-?\d[\w-]*$/i, '') : undefined;
    return { company: prettify(wd[1]), role: title ? prettify(title) : undefined };
  }
  if (/(^|\.)linkedin\.com$/.test(host)) {
    // Some LinkedIn links carry the title: /jobs/view/product-designer-at-acme-1234567890
    const m = u.pathname.match(/\/jobs\/view\/(.+)-at-(.+)-\d{6,}/);
    return m ? { role: prettify(m[1]), company: prettify(m[2]) } : {};
  }
  return { company: companyFromHost(host) };
}

/* ---------- Page-title parsing ---------- */

const ROLE_WORDS =
  /\b(engineer\w*|developer|manager|designer|analyst|scientist|specialist|director|lead|head|intern\w*|associate|coordinator|assistant|consultant|representative|rep|officer|administrator|architect|writer|editor|recruiter|accountant|technician|strategist|marketing|sales|product|operations|support|success|senior|junior|sr|jr|staff|principal|vp|president|chief|executive|programmer|researcher|advisor|agent|nurse|teacher|tutor|cashier|driver|clerk|owner|partner|counsel|attorney|paralegal|controller|planner|producer|creator|copywriter|fellow|apprentice)\b/i;

const SITE_SUFFIX =
  /\s*[|–—-]\s*(linkedin( jobs)?|indeed(\.com)?|glassdoor|ziprecruiter|wellfound|built ?in.*|otta|welcome to the jungle|dice|monster|simplyhired|lever|greenhouse|ashby|workable|smartrecruiters|workday|jobvite|icims|careers?( page| site)?|jobs?)\s*$/i;

/** Split a page title like "Role at Company — City | LinkedIn" into its parts. */
export function parseJobTitle(title: string, hint: JobInfo = {}): JobInfo {
  let t = title.replace(/\s+/g, ' ').trim();
  for (let i = 0; i < 3 && SITE_SUFFIX.test(t); i++) t = t.replace(SITE_SUFFIX, '').trim();
  t = t.replace(/^job application for\s+/i, '').replace(/^(apply|now hiring|job)\s*[:|-]\s*/i, '');
  if (!t) return {};

  // LinkedIn (old): "Acme hiring Product Designer in Austin, TX"
  let m = t.match(/^(.+?) hiring (.+?)(?: in (.+))?$/i);
  if (m) return { company: m[1].trim(), role: m[2].trim(), location: m[3]?.trim() };

  // Careers pages: "Careers at Acme" is the company, not a role.
  const careers = (p: string) => p.match(/^(?:careers|jobs|work) (?:at|@|with) (.+)$/i)?.[1];
  const [main, ...rest] = t.split(/\s+[—–]\s+/);
  const parts = main
    .split(/\s+[|·•-]\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const out: JobInfo = {};
  for (const p of parts) {
    const c = careers(p);
    if (c) out.company ??= c;
  }
  const rest2 = parts.filter((p) => !careers(p));

  // LinkedIn (new) / Greenhouse: "Product Designer at Acme — Austin, TX"
  m = rest2[0]?.match(/^(.+)\s+(?:at|@)\s+(.+)$/i) ?? null;
  if (m) return { role: m[1].trim(), company: out.company ?? m[2].trim(), location: [...rest2.slice(1), ...rest].join(', ') || undefined };
  rest2.push(...rest);

  const company = hint.company?.toLowerCase();
  const known = company ? rest2.find((p) => p.toLowerCase() === company) : undefined;
  if (known) out.company ??= known;
  const candidates = rest2.filter((p) => p !== known);
  const role = candidates.find((p) => ROLE_WORDS.test(p)) ?? candidates[0];
  if (role) out.role = role;
  if (!out.company) {
    const others = candidates.filter((p) => p !== role && !/,|remote|hybrid|on-?site/i.test(p));
    if (others.length) out.company = others[0];
  }
  const loc = candidates.find((p) => p !== role && p !== out.company && /,|remote|hybrid|on-?site/i.test(p));
  if (loc) out.location = loc;
  return out;
}

/* ---------- Description text ---------- */

function decodeHtml(s: string): string {
  return new DOMParser().parseFromString(s, 'text/html').documentElement.textContent ?? '';
}

/** HTML job description → readable plain text with paragraphs and bullets kept. */
export function htmlToText(html: string): string {
  let h = html;
  if (/&lt;\/?[a-z]/i.test(h)) h = decodeHtml(h); // Greenhouse sends HTML-escaped HTML
  h = h
    .replace(/<\/li>/gi, '')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|ul|ol|section|tr)>/gi, '\n')
    .replace(/<(p|div|h[1-6]|ul|ol|section)[^>]*>/gi, '\n');
  return tidy(decodeHtml(h));
}

function tidy(text: string): string {
  return text
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_DESCRIPTION);
}

/* ---------- Fetching ---------- */

async function getJSON(url: string, signal?: AbortSignal): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12_000);
  signal?.addEventListener('abort', () => ctrl.abort());
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fromAts(u: URL, signal?: AbortSignal): Promise<JobInfo | null> {
  const host = u.hostname.toLowerCase();
  const seg = u.pathname.split('/').filter(Boolean);

  if (/greenhouse\.io$/.test(host)) {
    const board = u.searchParams.get('for') ?? seg[0];
    const id = u.searchParams.get('token') ?? seg[seg.indexOf('jobs') + 1];
    if (!board || !id || (seg.indexOf('jobs') < 0 && !u.searchParams.get('token'))) return null;
    const j = await getJSON(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs/${encodeURIComponent(id)}`, signal);
    return { role: j.title, company: j.company_name || prettify(board), location: j.location?.name, description: j.content ? htmlToText(j.content) : undefined };
  }

  const lever = host.match(/^jobs\.(eu\.)?lever\.co$/);
  if (lever && seg[0] && seg[1]) {
    const j = await getJSON(`https://api.${lever[1] ?? ''}lever.co/v0/postings/${encodeURIComponent(seg[0])}/${encodeURIComponent(seg[1])}`, signal);
    const lists = (j.lists ?? []).map((l: any) => `${l.text}\n${htmlToText(l.content ?? '')}`).join('\n\n');
    return {
      role: j.text,
      company: prettify(seg[0]),
      location: j.categories?.location,
      description: tidy([j.descriptionPlain, lists, j.additionalPlain].filter(Boolean).join('\n\n')),
    };
  }

  if (host === 'jobs.ashbyhq.com' && seg[0] && seg[1]) {
    const board = await getJSON(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(seg[0])}`, signal);
    const j = (board.jobs ?? []).find((x: any) => x.id === seg[1]);
    if (!j) return null;
    return { role: j.title?.trim(), company: prettify(seg[0]), location: j.location, description: j.descriptionPlain ? tidy(j.descriptionPlain) : undefined };
  }
  return null;
}

async function fromPreview(url: string, hint: JobInfo, signal?: AbortSignal): Promise<JobInfo | null> {
  const r = await getJSON(`https://api.microlink.io/?url=${encodeURIComponent(url)}`, signal);
  const d = r?.status === 'success' ? r.data : null;
  // Sites that block bots return their generic homepage title ("LinkedIn", "Just a moment…").
  if (!d?.title || r.statusCode >= 400 || /^(linkedin|indeed|glassdoor|just a moment|access denied|sign in|log in)/i.test(d.title)) return null;
  const info = parseJobTitle(d.title, hint);
  if (!info.company && d.publisher && !JOB_BOARDS.test(d.publisher)) info.company = d.publisher.replace(/\.(com|io|co|org|net)$/i, '');
  if (d.description && d.description.length > 40) info.description = tidy(d.description);
  return info;
}

/** Fill gaps in `a` from `b`, never overwriting a value `a` already has. */
function merge(a: JobInfo | null, b: JobInfo | null): JobInfo | null {
  if (!a || !b) return a ?? b;
  const out: JobInfo = { ...a };
  for (const k of ['company', 'role', 'location', 'description'] as const) out[k] ||= b[k];
  return out;
}

/** Best-effort lookup. Never throws: returns whatever it could find (possibly nothing). */
export async function lookupJob(url: string, signal?: AbortSignal): Promise<JobInfo> {
  const guess = guessFromUrl(url);
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return guess;
  }
  let found: JobInfo | null = null;
  try {
    found = await fromAts(u, signal);
  } catch {
    /* fall through to the preview service */
  }
  if (!found?.role) {
    try {
      found = merge(found, await fromPreview(url, guess, signal));
    } catch {
      /* offline, rate-limited or blocked */
    }
  }
  const clean = (s?: string) => s?.replace(/\s+/g, ' ').trim() || undefined;
  return {
    company: clean(found?.company) ?? guess.company,
    role: clean(found?.role) ?? guess.role,
    location: clean(found?.location),
    description: found?.description || undefined,
  };
}
