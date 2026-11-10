import { useEffect, useMemo, useState } from 'react';
import { BellRing, BriefcaseBusiness, CalendarClock, ExternalLink, Kanban, List, Loader2, Plus, Search, Trash2 } from 'lucide-react';
import { addDays, diffDays, fromKey, today } from '../lib/date';
import { hostOf, safeUrl } from '../lib/hooks';
import { canonicalJobUrl, guessFromUrl, lookupJob, needsFollowUp, sameJobUrl } from '../lib/jobs';
import { actions, getState, useStore } from '../lib/store';
import type { JobApplication, JobStatus } from '../lib/types';
import { Card, Dialog, DialogHead, Empty, Segmented, toast } from './ui';

export const JOB_STATUS: Record<JobStatus, { label: string; chip: string }> = {
  applied: { label: 'Applied', chip: '' },
  interview: { label: 'Interview', chip: 'accent' },
  offer: { label: 'Offer', chip: 'ok' },
  rejected: { label: 'Rejected', chip: 'low' },
};

type Filter = 'all' | JobStatus;
const PAGE = 6;

export const jobLabel = (j: Pick<JobApplication, 'role' | 'company' | 'url'>) =>
  j.role && j.company ? `${j.role} at ${j.company}` : j.role || j.company || hostOf(j.url);

function appliedLabel(key: string): string {
  const n = diffDays(key, today());
  if (n <= 0) return 'Applied today';
  if (n === 1) return 'Applied yesterday';
  if (n < 7) return `Applied ${n}d ago`;
  const d = fromKey(key);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return `Applied ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: sameYear ? undefined : 'numeric' })}`;
}

/** Looks like a single link rather than a sentence. */
const looksLikeUrl = (s: string) => /^\S+\.\S+$/.test(s.trim()) && !!safeUrl(s);

const LAYOUT_KEY = 'daily-dashboard:jobs-layout';

/** "Thu 12 Nov, 2:30pm" for an interview time. */
export function interviewLabel(at: string, use24h: boolean) {
  const [d, t] = at.split('T');
  const [h, m] = t.split(':').map(Number);
  const time = use24h ? t.slice(0, 5) : `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''}${h >= 12 ? 'pm' : 'am'}`;
  return `${fromKey(d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}, ${time}`;
}

export function Jobs({ wide = false }: { wide?: boolean } = {}) {
  const jobs = useStore((s) => s.jobs);
  const use24h = useStore((s) => s.settings.use24h);
  const [layout, setLayoutState] = useState<'list' | 'board'>(() => {
    try {
      return localStorage.getItem(LAYOUT_KEY) === 'board' ? 'board' : 'list';
    } catch {
      return 'list';
    }
  });
  const setLayout = (l: 'list' | 'board') => {
    setLayoutState(l);
    try {
      localStorage.setItem(LAYOUT_KEY, l);
    } catch {
      /* optional */
    }
  };
  const [link, setLink] = useState('');
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [openId, setOpenId] = useState<string | 'new' | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');
  const [showAll, setShowAll] = useState(false);
  const t = today();
  const followUps = jobs.filter((j) => needsFollowUp(j, t)).length;

  // Search and interview events in Schedule can open a job here.
  useEffect(() => {
    const on = (e: Event) => setOpenId((e as CustomEvent<string>).detail);
    window.addEventListener('dd:open-job', on);
    return () => window.removeEventListener('dd:open-job', on);
  }, []);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: jobs.length, applied: 0, interview: 0, offer: 0, rejected: 0 };
    for (const j of jobs) c[j.status]++;
    return c;
  }, [jobs]);
  const weekAgo = addDays(today(), -6);
  const thisWeek = jobs.filter((j) => j.appliedOn >= weekAgo).length;

  const needle = q.trim().toLowerCase();
  const visible = jobs
    .filter((j) => filter === 'all' || j.status === filter)
    .filter((j) => !needle || [j.role, j.company, j.location, j.notes].some((v) => v?.toLowerCase().includes(needle)))
    .sort((a, b) => b.appliedOn.localeCompare(a.appliedOn) || b.createdAt - a.createdAt);
  const shown = showAll || needle || wide ? visible : visible.slice(0, PAGE);

  async function add(raw: string) {
    const safe = safeUrl(raw);
    if (!safe) {
      toast('Paste the link to the job posting (starting with https://).');
      return;
    }
    const url = canonicalJobUrl(safe);
    const dup = getState().jobs.find((j) => sameJobUrl(j.url, url));
    if (dup) {
      setLink('');
      toast(`Already saved: ${jobLabel(dup)}`, { label: 'Open', run: () => setOpenId(dup.id) });
      return;
    }
    const guess = guessFromUrl(url);
    const job = actions.addJob({ url, company: guess.company ?? '', role: guess.role ?? '' });
    setLink('');
    setFilter('all');
    setPending((p) => new Set(p).add(job.id));
    try {
      const info = await lookupJob(url);
      const cur = getState().jobs.find((j) => j.id === job.id);
      if (!cur) return; // deleted while we were looking
      const p: Partial<JobApplication> = {};
      // Only replace fields the user hasn't changed in the meantime.
      if (info.company && cur.company === job.company) p.company = info.company;
      if (info.role && cur.role === job.role) p.role = info.role;
      if (info.location && !cur.location) p.location = info.location;
      if (info.description && !cur.description) p.description = info.description;
      actions.updateJob(job.id, p);
      const done = { ...cur, ...p };
      if (done.role && done.company) toast(`Saved ${jobLabel(done)}`, { label: 'Edit', run: () => setOpenId(job.id) });
      else toast('Saved, but that page didn’t share all the details. Add them yourself.', { label: 'Edit', run: () => setOpenId(job.id) }, 8000);
    } finally {
      setPending((p) => {
        const n = new Set(p);
        n.delete(job.id);
        return n;
      });
    }
  }

  return (
    <Card
      title="Jobs applied"
      icon={<BriefcaseBusiness size={16} />}
      meta={jobs.length ? `${thisWeek} this week · ${jobs.length} total${followUps ? ` · ${followUps} to follow up` : ''}` : undefined}
      actions={
        <>
          {wide && jobs.length > 0 && (
            <div className="segmented" role="group" aria-label="Layout">
              <button type="button" aria-pressed={layout === 'list'} onClick={() => setLayout('list')} title="List">
                <List size={13} /> List
              </button>
              <button type="button" aria-pressed={layout === 'board'} onClick={() => setLayout('board')} title="Board">
                <Kanban size={13} /> Board
              </button>
            </div>
          )}
          <button className="icon-btn sm" onClick={() => setOpenId('new')} aria-label="Add job manually" title="Add job manually">
            <Plus size={16} />
          </button>
        </>
      }
    >
      <form
        className="job-add"
        onSubmit={(e) => {
          e.preventDefault();
          if (link.trim()) add(link);
        }}
      >
        <label htmlFor="job-link" className="sr-only">
          Job posting link
        </label>
        <input
          id="job-link"
          className="input"
          value={link}
          placeholder="Paste a job link to save it…"
          autoComplete="off"
          inputMode="url"
          onChange={(e) => setLink(e.target.value)}
          onPaste={(e) => {
            const text = e.clipboardData.getData('text');
            if (!link.trim() && looksLikeUrl(text)) {
              e.preventDefault();
              add(text);
            }
          }}
        />
        <button className="btn primary" disabled={!link.trim()}>
          Save
        </button>
      </form>

      {jobs.length >= 4 && (
        <div className="job-tools">
          <Segmented
            label="Filter by status"
            value={filter}
            onChange={(v) => {
              setFilter(v);
              setShowAll(false);
            }}
            options={[
              { value: 'all', label: 'All' },
              ...(['interview', 'offer', 'rejected'] as const).filter((k) => counts[k] > 0 || filter === k).map((k) => ({ value: k, label: JOB_STATUS[k].label, count: counts[k] })),
            ]}
          />
          <label className="job-search">
            <Search size={13} />
            <span className="sr-only">Search jobs</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" />
          </label>
        </div>
      )}

      {jobs.length === 0 ? (
        <Empty icon={<BriefcaseBusiness size={28} />} title="Keep every application in one place">
          Paste a job link and the company and position fill in by themselves.
        </Empty>
      ) : wide && layout === 'board' ? (
        <JobBoard jobs={visible} onOpen={setOpenId} use24h={use24h} />
      ) : visible.length === 0 ? (
        <Empty title="No matches">{needle ? 'Try a different search.' : 'Nothing with this status yet.'}</Empty>
      ) : (
        <ul className="jobs">
          {shown.map((j) => {
            const loading = pending.has(j.id);
            return (
              <li key={j.id} className={`job ${j.status === 'rejected' ? 'closed' : ''}`}>
                <button className="job-main" onClick={() => setOpenId(j.id)}>
                  <span className="job-avatar" aria-hidden>
                    {(j.company || hostOf(j.url)).slice(0, 1).toUpperCase()}
                  </span>
                  <span className="job-text">
                    <span className="job-role">
                      {j.role || (loading ? <span className="job-loading">Looking up the posting…</span> : <span className="job-missing">Add position</span>)}
                    </span>
                    <span className="job-sub">
                      {[j.company || (loading ? '' : hostOf(j.url)), j.location, appliedLabel(j.appliedOn)].filter(Boolean).join(' · ')}
                    </span>
                    {(needsFollowUp(j, t) || (j.interviewAt && j.interviewAt.slice(0, 10) >= t)) && (
                      <span className="job-flags">
                        {needsFollowUp(j, t) && (
                          <span className="chip warn">
                            <BellRing size={10} /> Follow up?
                          </span>
                        )}
                        {j.interviewAt && j.interviewAt.slice(0, 10) >= t && (
                          <span className="chip accent">
                            <CalendarClock size={10} /> {interviewLabel(j.interviewAt, use24h)}
                          </span>
                        )}
                      </span>
                    )}
                  </span>
                  {loading ? <Loader2 size={14} className="spin job-spin" /> : <span className={`chip ${JOB_STATUS[j.status].chip}`}>{JOB_STATUS[j.status].label}</span>}
                </button>
                <a className="icon-btn sm" href={safeUrl(j.url) ?? '#'} target="_blank" rel="noopener noreferrer" aria-label={`Open posting: ${jobLabel(j)}`} title="Open posting">
                  <ExternalLink size={13} />
                </a>
              </li>
            );
          })}
        </ul>
      )}
      {!needle && !wide && visible.length > PAGE && (
        <button className="btn ghost sm job-more" onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'Show less' : `Show all ${visible.length}`}
        </button>
      )}

      <JobEditor job={openId === 'new' ? 'new' : jobs.find((j) => j.id === openId) ?? null} onClose={() => setOpenId(null)} />
    </Card>
  );
}

function JobEditor({ job, onClose }: { job: JobApplication | 'new' | null; onClose: () => void }) {
  const init = job && job !== 'new' ? job : undefined;
  const blank = { url: '', company: '', role: '', location: '', status: 'applied' as JobStatus, appliedOn: today(), notes: '', contact: '', salary: '', interviewAt: '' };
  const [form, setForm] = useState(blank);
  const [forJob, setForJob] = useState<string | null>(null);
  const key = job === 'new' ? 'new' : job?.id ?? null;
  if (key !== forJob) {
    setForJob(key);
    setForm(
      init
        ? {
            url: init.url,
            company: init.company,
            role: init.role,
            location: init.location ?? '',
            status: init.status,
            appliedOn: init.appliedOn,
            notes: init.notes ?? '',
            contact: init.contact ?? '',
            salary: init.salary ?? '',
            interviewAt: init.interviewAt ?? '',
          }
        : blank,
    );
  }
  const set = (p: Partial<typeof form>) => setForm((f) => ({ ...f, ...p }));
  const url = safeUrl(form.url);
  const valid = !!(form.company.trim() || form.role.trim()) && (!form.url.trim() || !!url);

  return (
    <Dialog open={!!job} onClose={onClose} label={init ? 'Job application' : 'Add job'}>
      <DialogHead title={init ? jobLabel(init) : 'Add job application'} onClose={onClose} />
      <form
        className="modal-body"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          const data = {
            url: url ? canonicalJobUrl(url) : '',
            company: form.company.trim(),
            role: form.role.trim(),
            location: form.location.trim() || undefined,
            status: form.status,
            appliedOn: form.appliedOn || today(),
            notes: form.notes.trim() || undefined,
            contact: form.contact.trim() || undefined,
            salary: form.salary.trim() || undefined,
            interviewAt: form.interviewAt || undefined,
            // Booking an interview moves an application along.
            ...(form.interviewAt && form.status === 'applied' && form.interviewAt !== init?.interviewAt ? { status: 'interview' as JobStatus } : {}),
          };
          if (init) actions.updateJob(init.id, data);
          else actions.addJob(data);
          onClose();
        }}
      >
        <div className="row">
          <label className="field">
            <span>Company</span>
            <input className="input" autoFocus={!init} value={form.company} onChange={(e) => set({ company: e.target.value })} placeholder="Acme Inc." />
          </label>
          <label className="field">
            <span>Position</span>
            <input className="input" value={form.role} onChange={(e) => set({ role: e.target.value })} placeholder="Product Designer" />
          </label>
        </div>
        <label className="field">
          <span>Link to posting</span>
          <div className="job-url">
            <input className="input" value={form.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://…" inputMode="url" />
            {url && (
              <a className="btn" href={url} target="_blank" rel="noopener noreferrer">
                <ExternalLink size={14} /> Open
              </a>
            )}
          </div>
          {form.url.trim() && !url && <small style={{ color: 'var(--bad)' }}>Enter a web address (http or https).</small>}
        </label>
        <div className="field">
          <span>Status</span>
          <Segmented label="Status" value={form.status} onChange={(v) => set({ status: v })} options={(Object.keys(JOB_STATUS) as JobStatus[]).map((k) => ({ value: k, label: JOB_STATUS[k].label }))} />
        </div>
        <div className="row">
          <label className="field">
            <span>Applied on</span>
            <input className="input" type="date" value={form.appliedOn} max={today()} onChange={(e) => set({ appliedOn: e.target.value })} />
          </label>
          <label className="field">
            <span>Location</span>
            <input className="input" value={form.location} onChange={(e) => set({ location: e.target.value })} placeholder="Remote, New York…" />
          </label>
        </div>
        <div className="row">
          <label className="field">
            <span>Contact</span>
            <input className="input" value={form.contact} onChange={(e) => set({ contact: e.target.value })} placeholder="Recruiter or hiring manager" />
          </label>
          <label className="field">
            <span>Salary</span>
            <input className="input" value={form.salary} onChange={(e) => set({ salary: e.target.value })} placeholder="e.g. $120–140k" />
          </label>
        </div>
        <label className="field">
          <span>Interview</span>
          <input className="input" type="datetime-local" value={form.interviewAt} onChange={(e) => set({ interviewAt: e.target.value })} />
          <small>Shows in your Schedule, with a reminder before it.</small>
        </label>
        {init && needsFollowUp(init, today()) && (
          <div className="job-follow">
            <BellRing size={14} />
            <span>No news for a week. A short follow-up email often helps.</span>
            <button
              type="button"
              className="btn sm"
              onClick={() => {
                actions.updateJob(init.id, { followedUpOn: today() });
                toast('Marked as followed up. We’ll nudge you again in a week.');
              }}
            >
              I followed up
            </button>
          </div>
        )}
        <label className="field">
          <span>Notes</span>
          <textarea className="textarea" rows={3} value={form.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Interview prep, who referred you, questions to ask…" />
        </label>
        {init?.description && (
          <details className="job-desc">
            <summary>Saved job description</summary>
            <p>{init.description}</p>
          </details>
        )}
        <div className="modal-foot">
          {init && (
            <button
              type="button"
              className="btn ghost danger"
              onClick={() => {
                const undo = actions.removeJob(init.id);
                toast(`Deleted ${jobLabel(init)}`, { label: 'Undo', run: undo });
                onClose();
              }}
            >
              <Trash2 size={14} /> Delete
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!valid}>
            {init ? 'Save' : 'Add job'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

/* ---------- Board ---------- */

const COLUMNS: JobStatus[] = ['applied', 'interview', 'offer', 'rejected'];

/** Applied → Interview → Offer → Rejected. Drag a card to another column to change its status. */
function JobBoard({ jobs, onOpen, use24h }: { jobs: JobApplication[]; onOpen: (id: string) => void; use24h: boolean }) {
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<JobStatus | null>(null);
  const t = today();
  return (
    <div className="job-board">
      {COLUMNS.map((status) => {
        const col = jobs.filter((j) => j.status === status);
        return (
          <section
            key={status}
            className={`job-col ${over === status ? 'over' : ''}`}
            aria-label={JOB_STATUS[status].label}
            onDragOver={(e) => {
              if (!drag) return;
              e.preventDefault();
              setOver(status);
            }}
            onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setOver(null)}
            onDrop={(e) => {
              e.preventDefault();
              const job = jobs.find((j) => j.id === drag);
              if (job && job.status !== status) {
                actions.updateJob(job.id, { status });
                toast(`${jobLabel(job)} → ${JOB_STATUS[status].label}`, { label: 'Undo', run: () => actions.updateJob(job.id, { status: job.status }) });
              }
              setDrag(null);
              setOver(null);
            }}
          >
            <header>
              <span className={`chip ${JOB_STATUS[status].chip}`}>{JOB_STATUS[status].label}</span>
              <span className="num">{col.length}</span>
            </header>
            {col.map((j) => (
              <button
                key={j.id}
                className={`job-card ${drag === j.id ? 'dragging' : ''}`}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', jobLabel(j));
                  setDrag(j.id);
                }}
                onDragEnd={() => {
                  setDrag(null);
                  setOver(null);
                }}
                onClick={() => onOpen(j.id)}
              >
                <b>{j.role || 'Position?'}</b>
                <span>{[j.company || hostOf(j.url), j.location].filter(Boolean).join(' · ')}</span>
                <small>{appliedLabel(j.appliedOn)}</small>
                {needsFollowUp(j, t) && (
                  <span className="chip warn">
                    <BellRing size={10} /> Follow up?
                  </span>
                )}
                {j.interviewAt && j.interviewAt.slice(0, 10) >= t && (
                  <span className="chip accent">
                    <CalendarClock size={10} /> {interviewLabel(j.interviewAt, use24h)}
                  </span>
                )}
              </button>
            ))}
            {col.length === 0 && <p className="job-col-empty">Drop here</p>}
          </section>
        );
      })}
    </div>
  );
}
