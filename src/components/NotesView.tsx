import { useEffect, useMemo, useRef, useState } from 'react';
import { Bold, Eye, Heading, Link2, List, ListChecks, NotebookPen, PenLine, Pin, PinOff, Plus, Search, Trash2 } from 'lucide-react';
import { Markdown, noteTitle, toggleCheckbox } from '../lib/markdown';
import { actions, useStore } from '../lib/store';
import type { NotePage } from '../lib/types';
import { Links } from './Panels';
import { Card, Empty, toast } from './ui';

const SEL_KEY = 'daily-dashboard:note';
const MODE_KEY = 'daily-dashboard:note-mode';
const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* optional */
  }
};

function ago(t: number) {
  const m = Math.round((Date.now() - t) / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d < 7 ? `${d}d ago` : new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const snippet = (body: string) =>
  body
    .split('\n')
    .map((l) => l.replace(/^#+\s*|^\s*[-*]\s+(\[[ xX]\]\s*)?|[*`]/g, '').trim())
    .filter(Boolean)
    .slice(1, 2)
    .join(' ');

/** Notes tab: a list of notes on the left, the open note on the right. */
export function NotesView() {
  const pages = useStore((s) => s.pages);
  const [selected, setSelected] = useState<string | null>(() => read(SEL_KEY));
  const [q, setQ] = useState('');
  const select = (id: string) => {
    setSelected(id);
    write(SEL_KEY, id);
  };

  // Other parts of the app (search) can open a note.
  useEffect(() => {
    const on = (e: Event) => select((e as CustomEvent<string>).detail);
    window.addEventListener('dd:open-note', on);
    return () => window.removeEventListener('dd:open-note', on);
  }, []);

  const sorted = useMemo(() => [...pages].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.updatedAt - a.updatedAt), [pages]);
  const needle = q.trim().toLowerCase();
  const shown = needle ? sorted.filter((p) => `${p.title}\n${p.body}`.toLowerCase().includes(needle)) : sorted;
  const page = pages.find((p) => p.id === selected) ?? sorted[0];

  const create = () => {
    const p = actions.addPage();
    select(p.id);
    setQ('');
    setTimeout(() => document.getElementById('note-body')?.focus(), 30);
  };

  return (
    <main className="notes-view" aria-label="Notes">
      <div className="col">
        <Card
          title="Notes"
          icon={<NotebookPen size={16} />}
          meta={pages.length ? `${pages.length}` : undefined}
          actions={
            <button className="icon-btn sm" onClick={create} aria-label="New note" title="New note">
              <Plus size={16} />
            </button>
          }
          className="notes-list-card"
        >
          {pages.length > 0 && (
            <label className="job-search notes-search">
              <Search size={14} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search notes" aria-label="Search notes" />
            </label>
          )}
          {pages.length === 0 ? (
            <Empty icon={<NotebookPen size={26} />} title="No notes yet">
              <button className="btn sm primary" onClick={create}>
                <Plus size={14} /> New note
              </button>
            </Empty>
          ) : (
            <ul className="notes-list">
              {shown.map((p) => (
                <li key={p.id}>
                  <button className={`note-item ${page?.id === p.id ? 'on' : ''}`} aria-current={page?.id === p.id ? 'true' : undefined} onClick={() => select(p.id)}>
                    <span className="note-item-title">
                      {p.pinned && <Pin size={11} />}
                      {noteTitle(p.title, p.body)}
                    </span>
                    <span className="note-item-sub">
                      <time>{ago(p.updatedAt)}</time>
                      {snippet(p.body) && <span>{snippet(p.body)}</span>}
                    </span>
                  </button>
                </li>
              ))}
              {shown.length === 0 && <li className="notes-none">No notes match “{q}”.</li>}
            </ul>
          )}
        </Card>
        <Links />
      </div>
      <div className="col">{page ? <NoteEditor key={page.id} page={page} /> : null}</div>
    </main>
  );
}

function NoteEditor({ page }: { page: NotePage }) {
  const [title, setTitle] = useState(page.title);
  const [body, setBody] = useState(page.body);
  const [mode, setModeState] = useState<'edit' | 'preview'>(() => (read(MODE_KEY) === 'preview' ? 'preview' : 'edit'));
  const ref = useRef<HTMLTextAreaElement>(null);
  const focused = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const latest = useRef({ title, body });
  latest.current = { title, body };

  const setMode = (m: 'edit' | 'preview') => {
    setModeState(m);
    write(MODE_KEY, m);
  };

  // Save shortly after you stop typing, and straight away when leaving the note.
  const save = () => {
    clearTimeout(timer.current);
    const { title: t, body: b } = latest.current;
    if (t !== page.title || b !== page.body) actions.updatePage(page.id, { title: t, body: b });
  };
  const queue = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(save, 400);
  };
  // Save when leaving the note (switching notes or tabs).
  useEffect(() => () => save(), []);

  // Changes from another device show up unless you're typing in this note.
  useEffect(() => {
    if (focused.current) return;
    setTitle(page.title);
    setBody(page.body);
  }, [page.title, page.body]);

  /** Apply an edit to the text and keep the cursor sensible. */
  const edit = (fn: (text: string, start: number, end: number) => { text: string; start: number; end: number }) => {
    const el = ref.current;
    if (!el) return;
    const r = fn(body, el.selectionStart, el.selectionEnd);
    setBody(r.text);
    queue();
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(r.start, r.end);
    });
  };
  const wrap = (before: string, after = before, placeholder = 'text') =>
    edit((text, s, e) => {
      const sel = text.slice(s, e) || placeholder;
      return { text: text.slice(0, s) + before + sel + after + text.slice(e), start: s + before.length, end: s + before.length + sel.length };
    });
  const prefixLines = (prefix: string) =>
    edit((text, s, e) => {
      const lineStart = text.lastIndexOf('\n', s - 1) + 1;
      const block = text.slice(lineStart, e);
      const lines = block.split('\n');
      const all = lines.every((l) => l.startsWith(prefix));
      const next = lines.map((l) => (all ? l.slice(prefix.length) : prefix + l.replace(/^(#+\s|[-*]\s(\[[ xX]\]\s)?)/, ''))).join('\n');
      return { text: text.slice(0, lineStart) + next + text.slice(e), start: lineStart, end: lineStart + next.length };
    });

  const toolbar = [
    { label: 'Bold (⌘B)', icon: <Bold size={14} />, run: () => wrap('**') },
    { label: 'Heading', icon: <Heading size={14} />, run: () => prefixLines('# ') },
    { label: 'List', icon: <List size={14} />, run: () => prefixLines('- ') },
    { label: 'Checklist', icon: <ListChecks size={14} />, run: () => prefixLines('- [ ] ') },
    { label: 'Link', icon: <Link2 size={14} />, run: () => wrap('[', '](https://)', 'link text') },
  ];

  return (
    <section className="card note-editor" aria-label="Note">
      <div className="note-head">
        <input
          className="note-title"
          value={title}
          placeholder={noteTitle('', body)}
          aria-label="Note title"
          onFocus={() => (focused.current = true)}
          onBlur={() => {
            focused.current = false;
            save();
          }}
          onChange={(e) => {
            setTitle(e.target.value);
            queue();
          }}
        />
        <button className="icon-btn sm" onClick={() => actions.updatePage(page.id, { pinned: !page.pinned })} aria-pressed={!!page.pinned} title={page.pinned ? 'Unpin' : 'Pin to top'} aria-label={page.pinned ? 'Unpin note' : 'Pin note'}>
          {page.pinned ? <PinOff size={14} /> : <Pin size={14} />}
        </button>
        <button
          className="icon-btn sm"
          title="Delete note"
          aria-label="Delete note"
          onClick={() => {
            const undo = actions.removePage(page.id);
            toast(`Deleted “${noteTitle(page.title, page.body)}”`, { label: 'Undo', run: undo });
          }}
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="note-toolbar">
        {mode === 'edit' &&
          toolbar.map((b) => (
            <button key={b.label} className="icon-btn sm" title={b.label} aria-label={b.label} onMouseDown={(e) => e.preventDefault()} onClick={b.run}>
              {b.icon}
            </button>
          ))}
        <span className="spacer" />
        <div className="segmented" role="group" aria-label="Note view">
          <button type="button" aria-pressed={mode === 'edit'} onClick={() => setMode('edit')}>
            <PenLine size={13} /> Edit
          </button>
          <button
            type="button"
            aria-pressed={mode === 'preview'}
            onClick={() => {
              save();
              setMode('preview');
            }}
          >
            <Eye size={13} /> Preview
          </button>
        </div>
      </div>

      {mode === 'edit' ? (
        <textarea
          id="note-body"
          ref={ref}
          className="notes-area note-body"
          value={body}
          placeholder={'Write anything.\n\n# Heading   **bold**   - list   - [ ] checkbox   [link](https://…)'}
          onFocus={() => (focused.current = true)}
          onBlur={() => {
            focused.current = false;
            save();
          }}
          onChange={(e) => {
            setBody(e.target.value);
            queue();
          }}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
              e.preventDefault();
              wrap('**');
              return;
            }
            // Enter on a list line continues the list; on an empty item it ends the list.
            if (e.key !== 'Enter' || e.shiftKey) return;
            const el = e.currentTarget;
            const s = el.selectionStart;
            const lineStart = body.lastIndexOf('\n', s - 1) + 1;
            const line = body.slice(lineStart, s);
            const m = line.match(/^(\s*)([-*]\s\[[ xX]\]\s|[-*•]\s|(\d+)[.)]\s)/);
            if (!m) return;
            e.preventDefault();
            if (line.trim() === m[2].trim()) {
              edit((text) => ({ text: text.slice(0, lineStart) + text.slice(s), start: lineStart, end: lineStart }));
              return;
            }
            const next = m[3] ? `${m[1]}${Number(m[3]) + 1}. ` : `${m[1]}${m[2].replace(/\[[xX]\]/, '[ ]')}`;
            edit((text, a, b) => ({ text: text.slice(0, a) + '\n' + next + text.slice(b), start: a + 1 + next.length, end: a + 1 + next.length }));
          }}
        />
      ) : (
        <div className="note-preview" onDoubleClick={() => setMode('edit')}>
          {body.trim() ? (
            <Markdown
              text={body}
              onToggle={(n) => {
                const text = toggleCheckbox(body, n);
                setBody(text);
                actions.updatePage(page.id, { body: text });
              }}
            />
          ) : (
            <p className="muted">Empty note. Double-click to write.</p>
          )}
        </div>
      )}
    </section>
  );
}
