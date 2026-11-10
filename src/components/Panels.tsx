import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Briefcase, Frown, Link2, Meh, Moon, NotebookPen, Pencil, Plus, Smile, Trash2, X } from 'lucide-react';
import { hostOf, safeUrl } from '../lib/hooks';
import { actions, useStore } from '../lib/store';
import type { Mood, Project, ProjectStatus } from '../lib/types';
import { Card, Dialog, DialogHead, Empty, Segmented, toast } from './ui';

/* ---------- Notes ---------- */

export function Notes() {
  const notes = useStore((s) => s.notes);
  // Local draft so typing never gets overwritten by a re-render (a bug in the original).
  const [draft, setDraft] = useState(notes);
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(notes);
  }, [notes]);

  return (
    <Card title="Notes" icon={<NotebookPen size={16} />} meta={saved === 'saving' ? 'Saving…' : saved === 'saved' ? 'Saved' : undefined}>
      <label htmlFor="notes" className="sr-only">
        Notes
      </label>
      <textarea
        id="notes"
        className="notes-area"
        value={draft}
        placeholder="Scratchpad for thoughts, ideas, things not to forget…"
        onFocus={() => (focused.current = true)}
        onBlur={() => {
          focused.current = false;
          clearTimeout(timer.current);
          actions.setNotes(draft);
        }}
        onChange={(e) => {
          const v = e.target.value;
          setDraft(v);
          setSaved('saving');
          clearTimeout(timer.current);
          timer.current = setTimeout(() => {
            actions.setNotes(v);
            setSaved('saved');
          }, 400);
        }}
      />
    </Card>
  );
}

/* ---------- Quick links ---------- */

export function Links() {
  const links = useStore((s) => s.links);
  const [editMode, setEditMode] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ label: '', url: '' });
  const url = safeUrl(form.url);

  return (
    <Card
      title="Quick links"
      icon={<Link2 size={16} />}
      actions={
        <>
          {links.length > 0 && (
            <button className={`icon-btn sm ${editMode ? 'active' : ''}`} onClick={() => setEditMode((v) => !v)} aria-label="Edit links" aria-pressed={editMode} title="Edit links">
              <Pencil size={13} />
            </button>
          )}
          <button
            className="icon-btn sm"
            onClick={() => {
              setForm({ label: '', url: '' });
              setAdding(true);
            }}
            aria-label="Add link"
            title="Add link"
          >
            <Plus size={16} />
          </button>
        </>
      }
    >
      {links.length === 0 ? (
        <Empty title="No links yet">Pin the tools you open every day.</Empty>
      ) : (
        <div className="links">
          {links.map((l) => (
            <a key={l.id} className="link" href={safeUrl(l.url) ?? '#'} target="_blank" rel="noopener noreferrer" onClick={(e) => editMode && e.preventDefault()}>
              <Favicon url={l.url} label={l.label} />
              <span>{l.label}</span>
              {editMode && (
                <button
                  className="link-x"
                  aria-label={`Remove ${l.label}`}
                  onClick={(e) => {
                    e.preventDefault();
                    actions.removeLink(l.id);
                  }}
                >
                  <X size={11} />
                </button>
              )}
            </a>
          ))}
        </div>
      )}
      <Dialog open={adding} onClose={() => setAdding(false)} label="Add link">
        <DialogHead title="Add quick link" onClose={() => setAdding(false)} />
        <form
          className="modal-body"
          onSubmit={(e) => {
            e.preventDefault();
            if (!url) return;
            actions.saveLink({ label: form.label.trim() || hostOf(url), url });
            setAdding(false);
          }}
        >
          <label className="field">
            <span>URL</span>
            <input className="input" autoFocus required value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="figma.com" />
            {form.url && !url && <small style={{ color: 'var(--bad)' }}>Enter a web address (http or https).</small>}
          </label>
          <label className="field">
            <span>Label</span>
            <input className="input" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder={url ? hostOf(url) : 'Optional'} />
          </label>
          <div className="modal-foot">
            <button type="button" className="btn ghost" onClick={() => setAdding(false)}>
              Cancel
            </button>
            <button className="btn primary" disabled={!url}>
              Add link
            </button>
          </div>
        </form>
      </Dialog>
    </Card>
  );
}

export function Favicon({ url, label }: { url: string; label: string }) {
  const [failed, setFailed] = useState(false);
  const host = hostOf(url);
  if (failed || !navigator.onLine) return <span className="fav">{label.slice(0, 1).toUpperCase()}</span>;
  return <img src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`} alt="" loading="lazy" onError={() => setFailed(true)} />;
}

/* ---------- Projects ---------- */

const STATUS: Record<ProjectStatus, string> = { track: 'On track', risk: 'At risk', blocked: 'Blocked', paused: 'Paused', done: 'Done' };

export function Projects({ selectedId, onSelect }: { selectedId?: string; onSelect?: (id: string) => void } = {}) {
  const projects = useStore((s) => s.projects);
  const tasks = useStore((s) => s.tasks);
  const [editing, setEditing] = useState<Project | 'new' | null>(null);

  return (
    <Card
      title="Projects"
      icon={<Briefcase size={16} />}
      meta={projects.length ? `${projects.filter((p) => p.status !== 'done').length} active` : undefined}
      actions={
        <button className="icon-btn sm" onClick={() => setEditing('new')} aria-label="New project" title="New project">
          <Plus size={16} />
        </button>
      }
    >
      {projects.length === 0 ? (
        <Empty icon={<Briefcase size={28} />} title="Keep the next step visible">
          Add a project and its single next action.
        </Empty>
      ) : (
        <div className="projects">
          {projects.map((p) => {
            const open = tasks.filter((t) => t.projectId === p.id && !t.done).length;
            return (
              <button
                key={p.id}
                className={`project ${selectedId === p.id ? 'selected' : ''}`}
                aria-current={selectedId === p.id ? 'true' : undefined}
                onClick={() => (onSelect ? onSelect(p.id) : setEditing(p))}
              >
                <div className="project-top">
                  <span className={`status-dot status-${p.status}`} />
                  <span className="project-name">{p.name}</span>
                  <span className="chip">{STATUS[p.status] ?? STATUS.track}</span>
                </div>
                <div className="project-next">
                  <ArrowRight size={12} />
                  <span>{p.nextAction || 'No next action set'}</span>
                </div>
                <div className="project-bottom num">
                  <div className="progress">
                    <i style={{ width: `${p.progress}%` }} />
                  </div>
                  <span>{p.progress}%</span>
                  {open > 0 && <span>· {open} task{open === 1 ? '' : 's'}</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}
      <ProjectEditor project={editing} onClose={() => setEditing(null)} />
    </Card>
  );
}

export function ProjectEditor({ project, onClose }: { project: Project | 'new' | null; onClose: () => void }) {
  const init = project && project !== 'new' ? project : undefined;
  const blank = { name: '', status: 'track' as ProjectStatus, nextAction: '', details: '', progress: 0 };
  const [form, setForm] = useState(blank);
  const [forProject, setForProject] = useState<unknown>(null);
  if (project !== forProject) {
    setForProject(project);
    setForm(init ? { name: init.name, status: init.status, nextAction: init.nextAction, details: init.details, progress: init.progress } : blank);
  }
  const set = (p: Partial<typeof form>) => setForm((f) => ({ ...f, ...p }));

  return (
    <Dialog open={!!project} onClose={onClose} label={init ? 'Edit project' : 'New project'}>
      <DialogHead title={init ? 'Edit project' : 'New project'} onClose={onClose} />
      <form
        className="modal-body"
        onSubmit={(e) => {
          e.preventDefault();
          if (!form.name.trim()) return;
          actions.saveProject({ ...form, name: form.name.trim(), id: init?.id });
          onClose();
        }}
      >
        <label className="field">
          <span>Name</span>
          <input className="input" autoFocus required value={form.name} onChange={(e) => set({ name: e.target.value })} />
        </label>
        <div className="field">
          <span>Status</span>
          <Segmented label="Status" value={form.status} onChange={(v) => set({ status: v })} options={(Object.keys(STATUS) as ProjectStatus[]).map((k) => ({ value: k, label: STATUS[k] }))} />
        </div>
        <label className="field">
          <span>Next action</span>
          <input className="input" value={form.nextAction} onChange={(e) => set({ nextAction: e.target.value })} placeholder="The very next physical step" />
        </label>
        <label className="field">
          <span>Progress · {form.progress}%</span>
          <input type="range" min={0} max={100} step={5} value={form.progress} onChange={(e) => set({ progress: Number(e.target.value) })} style={{ accentColor: 'var(--accent)' }} />
        </label>
        <label className="field">
          <span>Details</span>
          <textarea className="textarea" rows={3} value={form.details} onChange={(e) => set({ details: e.target.value })} placeholder="Goals, links, stakeholders…" />
        </label>
        <div className="modal-foot">
          {init && (
            <button
              type="button"
              className="btn ghost danger"
              onClick={() => {
                const undo = actions.removeProject(init.id);
                toast(`Deleted “${init.name}”`, { label: 'Undo', run: undo });
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
          <button className="btn primary">{init ? 'Save' : 'Add project'}</button>
        </div>
      </form>
    </Dialog>
  );
}

/* ---------- Reflection ---------- */

export const MOODS: { value: Mood; face: string; label: string }[] = [
  { value: 1, face: '😣', label: 'Rough' },
  { value: 2, face: '😕', label: 'Meh' },
  { value: 3, face: '😐', label: 'Okay' },
  { value: 4, face: '🙂', label: 'Good' },
  { value: 5, face: '🤩', label: 'Great' },
];

export function Reflection({ evening }: { evening: boolean }) {
  const r = useStore((s) => s.reflection);
  const field = (key: 'shipped' | 'slipped' | 'carries', label: string, icon: React.ReactNode, placeholder: string) => (
    <label>
      <span>
        {icon} {label}
      </span>
      <input className="input" value={r[key]} placeholder={placeholder} onChange={(e) => actions.setReflection({ [key]: e.target.value })} />
    </label>
  );
  return (
    <Card title="End-of-day review" icon={<Moon size={16} />} meta={evening ? 'Good time to reflect' : 'Saved to your journal at midnight'} className={evening ? 'evening' : ''}>
      <div className="reflect">
        <div>
          <div className="moods" role="group" aria-label="How did today feel?">
            {MOODS.map((m) => (
              <button key={m.value} className={`mood ${r.mood === m.value ? 'on' : ''}`} aria-pressed={r.mood === m.value} title={m.label} aria-label={m.label} onClick={() => actions.setReflection({ mood: r.mood === m.value ? undefined : m.value })}>
                {m.face}
              </button>
            ))}
          </div>
        </div>
        {field('shipped', 'What shipped?', <Smile size={13} />, 'Wins, big or small')}
        {field('slipped', 'What slipped?', <Frown size={13} />, 'No judgement — just notice')}
        {field('carries', 'Carry to tomorrow', <Meh size={13} />, 'Becomes a task due tomorrow')}
      </div>
    </Card>
  );
}
