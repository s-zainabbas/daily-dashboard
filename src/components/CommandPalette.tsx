import { useMemo, useState, type ReactNode } from 'react';
import { BookOpen, Briefcase, BriefcaseBusiness, CalendarDays, CalendarRange, Maximize2, MoonStar, NotebookPen, Sunrise, CalendarPlus, CheckCircle2, Circle, CornerDownLeft, Keyboard, ListPlus, Palette, Pause, Play, Search, Settings, SunMoon, Target } from 'lucide-react';
import { dueLabelInline, fromKey, today } from '../lib/date';
import { useAllEvents } from '../lib/gcal';
import type { ShownEvent } from '../lib/google/calendar';
import { noteTitle } from '../lib/markdown';
import { actions, getState, useStore } from '../lib/store';
import { timerActions, useTimer } from '../lib/timer';
import { Dialog, toast } from './ui';
import { VIEWS, type View } from './Sidebar';

interface Item {
  id: string;
  group: string;
  label: string;
  icon: ReactNode;
  hint?: string;
  run: () => void;
}

export interface PaletteHandlers {
  newTask: () => void;
  newEvent: () => void;
  journal: () => void;
  settings: () => void;
  shortcuts: () => void;
  quickAdd: () => void;
  go: (view: View) => void;
  plan: () => void;
  shutdown: () => void;
  focusMode: () => void;
  weekly: () => void;
}

export function CommandPalette({ open, onClose, h }: { open: boolean; onClose: () => void; h: PaletteHandlers }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const tasks = useStore((s) => s.tasks);
  const events = useAllEvents();
  allEventsRef.current = events;
  const theme = useStore((s) => s.settings.theme);
  const accent = useStore((s) => s.settings.accent);
  const timer = useTimer();

  const items = useMemo<Item[]>(() => {
    // Switch tab first, then focus a field once that tab has rendered.
    const goAndFocus = (view: View, id: string) => {
      h.go(view);
      setTimeout(() => document.getElementById(id)?.focus(), 60);
    };
    const accents = ['violet', 'blue', 'green', 'amber', 'rose'] as const;
    const base: Item[] = [
      { id: 'quick', group: 'Create', label: 'Quick add…', icon: <ListPlus size={16} />, hint: '/', run: h.quickAdd },
      { id: 'task', group: 'Create', label: 'New task', icon: <CheckCircle2 size={16} />, hint: 'N', run: h.newTask },
      { id: 'event', group: 'Create', label: 'New event', icon: <CalendarPlus size={16} />, hint: 'E', run: h.newEvent },
      { id: 'job', group: 'Create', label: 'Save a job application', icon: <BriefcaseBusiness size={16} />, run: () => goAndFocus('jobs', 'job-link') },
      { id: 'plan', group: 'Focus', label: 'Plan my day', icon: <Sunrise size={16} />, hint: 'P', run: h.plan },
      { id: 'shutdown', group: 'Focus', label: 'Shut down for the day', icon: <MoonStar size={16} />, hint: 'S', run: h.shutdown },
      { id: 'focusmode', group: 'Focus', label: 'Full-screen focus mode', icon: <Maximize2 size={16} />, hint: '⇧F', run: h.focusMode },
      { id: 'weekly', group: 'Focus', label: 'Weekly review', icon: <CalendarRange size={16} />, hint: 'W', run: h.weekly },
      { id: 'focus', group: 'Focus', label: timer.endsAt ? 'Pause focus timer' : 'Start focus timer', icon: timer.endsAt ? <Pause size={16} /> : <Play size={16} />, hint: 'F', run: timerActions.toggle },
      { id: 'prio', group: 'Focus', label: 'Set today’s #1 priority', icon: <Target size={16} />, run: () => goAndFocus('today', 'priority') },
      ...VIEWS.map((v, i): Item => ({ id: `go-${v.id}`, group: 'Go to', label: v.label, icon: <v.Icon size={16} />, hint: String(i + 1), run: () => h.go(v.id) })),
      { id: 'settings', group: 'Go to', label: 'Settings', icon: <Settings size={16} />, run: h.settings },
      { id: 'keys', group: 'Go to', label: 'Keyboard shortcuts', icon: <Keyboard size={16} />, hint: '?', run: h.shortcuts },
      { id: 'theme', group: 'Appearance', label: `Theme: switch to ${theme === 'light' ? 'dark' : 'light'}`, icon: <SunMoon size={16} />, hint: 'T', run: () => actions.setSettings({ theme: document.documentElement.dataset.theme === 'light' ? 'dark' : 'light' }) },
      { id: 'accent', group: 'Appearance', label: 'Cycle accent color', icon: <Palette size={16} />, run: () => actions.setSettings({ accent: accents[(accents.indexOf(accent) + 1) % accents.length] }) },
    ];
    const open = tasks
      .filter((t) => !t.done)
      .map<Item>((t) => ({
        id: t.id,
        group: 'Complete a task',
        label: t.title,
        icon: <Circle size={16} />,
        run: () => {
          const next = actions.toggleTask(t.id);
          toast(`Completed “${t.title}”${next?.dueDate ? ` · next one ${dueLabelInline(next.dueDate)}` : ''}`, { label: 'Undo', run: () => actions.toggleTask(t.id) });
        },
      }));
    const needle = q.trim().toLowerCase();
    if (!needle) return [...base, ...open.slice(0, 5)];
    const commands = [...base, ...open].filter((i) => i.label.toLowerCase().includes(needle) || i.group.toLowerCase().includes(needle));
    return [...commands, ...searchEverything(needle, h)];
  }, [q, tasks, theme, accent, timer.endsAt, h, events]);

  const index = Math.min(sel, Math.max(0, items.length - 1));
  const close = () => {
    setQ('');
    setSel(0);
    onClose();
  };
  const run = (i?: Item) => {
    if (!i) return;
    close();
    // Let the dialog close before opening another one.
    setTimeout(i.run, 0);
  };

  let lastGroup = '';
  return (
    <Dialog open={open} onClose={close} className="palette" label="Command menu">
      <div className="palette-input">
        <Search size={18} />
        <input
          autoFocus
          value={q}
          placeholder="Search everything, or type a command…"
          aria-label="Command"
          role="combobox"
          aria-expanded
          aria-controls="palette-list"
          onChange={(e) => {
            setQ(e.target.value);
            setSel(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setSel((index + 1) % Math.max(1, items.length));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setSel((index - 1 + items.length) % Math.max(1, items.length));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              run(items[index]);
            }
          }}
        />
      </div>
      <div className="palette-list" id="palette-list" role="listbox">
        {items.length === 0 && <div className="empty">No matches for “{q}”</div>}
        {items.map((it, i) => {
          const head = it.group !== lastGroup ? it.group : null;
          lastGroup = it.group;
          return (
            <div key={it.id}>
              {head && <div className="palette-group">{head}</div>}
              <button className="palette-item" role="option" aria-selected={i === index} onMouseMove={() => i !== index && setSel(i)} onClick={() => run(it)}>
                {it.icon}
                <span>{it.label}</span>
                {it.hint && <kbd>{it.hint}</kbd>}
              </button>
            </div>
          );
        })}
      </div>
      <div className="palette-foot">
        <span>
          <kbd>↑</kbd>
          <kbd>↓</kbd> navigate
        </span>
        <span>
          <kbd>
            <CornerDownLeft size={10} />
          </kbd>{' '}
          run
        </span>
        <span>
          <kbd>esc</kbd> close
        </span>
      </div>
    </Dialog>
  );
}

/* ---------- Search everything ---------- */

const day = (d: string) => fromKey(d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

/** Go to a tab, then ask it to open something once it has rendered. */
function goAndOpen(h: PaletteHandlers, view: View, event: string, detail: string) {
  h.go(view);
  setTimeout(() => window.dispatchEvent(new CustomEvent(event, { detail })), 80);
}

/** Notes, projects, jobs, events and journal days that match, a few of each. */
function searchEverything(needle: string, h: PaletteHandlers): Item[] {
  const s = getState();
  const has = (...vals: (string | undefined)[]) => vals.some((v) => v?.toLowerCase().includes(needle));
  const out: Item[] = [];
  const t = today();

  s.pages
    .filter((p) => has(p.title, p.body))
    .slice(0, 5)
    .forEach((p) => out.push({ id: `note-${p.id}`, group: 'Notes', label: noteTitle(p.title, p.body), icon: <NotebookPen size={16} />, run: () => goAndOpen(h, 'notes', 'dd:open-note', p.id) }));

  s.projects
    .filter((p) => has(p.name, p.nextAction, p.details))
    .slice(0, 5)
    .forEach((p) => out.push({ id: `project-${p.id}`, group: 'Projects', label: p.name, icon: <Briefcase size={16} />, run: () => goAndOpen(h, 'projects', 'dd:open-project', p.id) }));

  s.jobs
    .filter((j) => has(j.role, j.company, j.location, j.notes, j.contact))
    .slice(0, 5)
    .forEach((j) =>
      out.push({ id: `job-${j.id}`, group: 'Jobs', label: [j.role, j.company].filter(Boolean).join(' at ') || j.url, icon: <BriefcaseBusiness size={16} />, run: () => goAndOpen(h, 'jobs', 'dd:open-job', j.id) }),
    );

  allEventsRef.current
    .filter((e) => has(e.title, e.location, e.notes))
    .sort((a, b) => Math.abs(fromKey(a.date).getTime() - fromKey(t).getTime()) - Math.abs(fromKey(b.date).getTime() - fromKey(t).getTime()))
    .slice(0, 5)
    .forEach((e) =>
      out.push({
        id: `event-${e.id}`,
        group: 'Events',
        label: e.title,
        hint: day(e.date),
        icon: <CalendarDays size={16} />,
        run: () => {
          if (e.jobId) goAndOpen(h, 'jobs', 'dd:open-job', e.jobId);
          else if (e.google?.link) window.open(e.google.link, '_blank', 'noopener');
          else goAndOpen(h, 'schedule', 'dd:open-event', e.id);
        },
      }),
    );

  s.journal
    .filter((j) => has(j.shipped, j.slipped, j.priority, j.carries))
    .slice(0, 5)
    .forEach((j) => out.push({ id: `day-${j.date}`, group: 'Journal', label: (j.shipped || j.priority || j.slipped).split('\n')[0], hint: day(j.date), icon: <BookOpen size={16} />, run: () => goAndOpen(h, 'journal', 'dd:open-day', j.date) }));

  return out;
}

/** Latest events (yours, interviews and Google), kept for the search above. */
const allEventsRef: { current: ShownEvent[] } = { current: [] };
