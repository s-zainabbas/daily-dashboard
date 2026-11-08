import { useMemo, useState, type ReactNode } from 'react';
import { BookOpen, BriefcaseBusiness, CalendarPlus, CheckCircle2, Circle, CornerDownLeft, Keyboard, ListPlus, Palette, Pause, Play, Search, Settings, SunMoon, Target } from 'lucide-react';
import { actions, useStore } from '../lib/store';
import { timerActions, useTimer } from '../lib/timer';
import { Dialog, toast } from './ui';

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
}

export function CommandPalette({ open, onClose, h }: { open: boolean; onClose: () => void; h: PaletteHandlers }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const tasks = useStore((s) => s.tasks);
  const theme = useStore((s) => s.settings.theme);
  const accent = useStore((s) => s.settings.accent);
  const timer = useTimer();

  const items = useMemo<Item[]>(() => {
    const accents = ['violet', 'blue', 'green', 'amber', 'rose'] as const;
    const base: Item[] = [
      { id: 'quick', group: 'Create', label: 'Quick add…', icon: <ListPlus size={16} />, hint: '/', run: h.quickAdd },
      { id: 'task', group: 'Create', label: 'New task', icon: <CheckCircle2 size={16} />, hint: 'N', run: h.newTask },
      { id: 'event', group: 'Create', label: 'New event', icon: <CalendarPlus size={16} />, hint: 'E', run: h.newEvent },
      { id: 'job', group: 'Create', label: 'Save a job application', icon: <BriefcaseBusiness size={16} />, run: () => document.getElementById('job-link')?.focus() },
      { id: 'focus', group: 'Focus', label: timer.endsAt ? 'Pause focus timer' : 'Start focus timer', icon: timer.endsAt ? <Pause size={16} /> : <Play size={16} />, hint: 'F', run: timerActions.toggle },
      { id: 'prio', group: 'Focus', label: 'Set today’s #1 priority', icon: <Target size={16} />, run: () => document.getElementById('priority')?.focus() },
      { id: 'journal', group: 'Go to', label: 'Open journal', icon: <BookOpen size={16} />, hint: 'J', run: h.journal },
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
          actions.toggleTask(t.id);
          toast(`Completed “${t.title}”`, { label: 'Undo', run: () => actions.toggleTask(t.id) });
        },
      }));
    const needle = q.trim().toLowerCase();
    if (!needle) return [...base, ...open.slice(0, 5)];
    return [...base, ...open].filter((i) => i.label.toLowerCase().includes(needle) || i.group.toLowerCase().includes(needle));
  }, [q, tasks, theme, accent, timer.endsAt, h]);

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
          placeholder="Type a command or search tasks…"
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
