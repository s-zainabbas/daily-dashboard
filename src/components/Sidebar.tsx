import { useEffect, useState } from 'react';
import { type LucideIcon, BookOpen, Briefcase, BriefcaseBusiness, CalendarDays, ListTodo, NotebookPen, PanelLeftClose, PanelLeftOpen, Settings as Cog, Sun, Timer } from 'lucide-react';
import { today } from '../lib/date';
import { useNow } from '../lib/hooks';
import { useStore } from '../lib/store';
import { useAllEvents } from '../lib/gcal';
import { remainingMs, useTimer } from '../lib/timer';
import { fmtClock } from './Focus';
import { todayTaskStats } from './Stats';

export type View = 'today' | 'tasks' | 'schedule' | 'projects' | 'jobs' | 'notes';

export const VIEWS: { id: View; label: string; Icon: LucideIcon }[] = [
  { id: 'today', label: 'Today', Icon: Sun },
  { id: 'tasks', label: 'Tasks', Icon: ListTodo },
  { id: 'schedule', label: 'Schedule', Icon: CalendarDays },
  { id: 'projects', label: 'Projects', Icon: Briefcase },
  { id: 'jobs', label: 'Jobs', Icon: BriefcaseBusiness },
  { id: 'notes', label: 'Notes', Icon: NotebookPen },
];

const VIEW_KEY = 'daily-dashboard:view';
const COLLAPSED_KEY = 'daily-dashboard:sidebar-collapsed';
const isView = (v: unknown): v is View => VIEWS.some((x) => x.id === v);

function readLocal(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeLocal(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* optional */
  }
}

/** Current tab, kept in the URL hash (so Back works) and remembered for next time. */
export function useView(): [View, (v: View) => void] {
  const fromHash = () => location.hash.slice(1);
  const [view, setViewState] = useState<View>(() => {
    const h = fromHash();
    if (isView(h)) return h;
    const saved = readLocal(VIEW_KEY);
    return isView(saved) ? saved : 'today';
  });

  useEffect(() => {
    const on = () => {
      const h = fromHash();
      setViewState(isView(h) ? h : 'today');
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  useEffect(() => {
    writeLocal(VIEW_KEY, view);
    if (fromHash() !== view) history.replaceState(null, '', `${location.pathname}${location.search}#${view}`);
    window.scrollTo({ top: 0 });
  }, [view]);

  const setView = (v: View) => {
    if (fromHash() === v) return;
    location.hash = v; // adds a history entry; the hashchange listener updates state
  };
  return [view, setView];
}

export function useSidebarCollapsed(): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(() => readLocal(COLLAPSED_KEY) === '1');
  const toggle = () =>
    setCollapsed((c) => {
      writeLocal(COLLAPSED_KEY, c ? '0' : '1');
      return !c;
    });
  return [collapsed, toggle];
}

function useBadges(): Partial<Record<View, { n: number; tone?: 'bad' }>> {
  const now = useNow(60_000);
  const tasks = useStore((s) => s.tasks);
  const events = useAllEvents();
  const jobs = useStore((s) => s.jobs);
  const t = today();
  const ts = todayTaskStats(tasks, t);
  const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const eventsLeft = events.filter((e) => e.date === t && (!e.start || (e.end ?? e.start) >= hm)).length;
  const interviews = jobs.filter((j) => j.status === 'interview').length;
  return {
    today: ts.open ? { n: ts.open } : undefined,
    tasks: ts.overdue ? { n: ts.overdue, tone: 'bad' } : undefined,
    schedule: eventsLeft ? { n: eventsLeft } : undefined,
    jobs: interviews ? { n: interviews } : undefined,
  };
}

function TimerPill({ onClick }: { onClick: () => void }) {
  const timer = useTimer();
  useNow(1000);
  const label = fmtClock(remainingMs(timer));
  return (
    <button className="side-timer" onClick={onClick} data-tip={`${timer.mode === 'focus' ? 'Focus' : 'Break'} · ${label}`}>
      <Timer size={16} />
      <span className="side-label num">
        {label} <small>{timer.mode === 'focus' ? 'Focus' : 'Break'}</small>
      </span>
    </button>
  );
}

export function Sidebar({ view, onView, collapsed, onToggle, onJournal, onSettings }: {
  view: View;
  onView: (v: View) => void;
  collapsed: boolean;
  onToggle: () => void;
  onJournal: () => void;
  onSettings: () => void;
}) {
  const badges = useBadges();
  const running = !!useTimer().endsAt;

  return (
    <nav className={`sidebar ${collapsed ? 'collapsed' : ''}`} aria-label="Sections">
      <div className="side-brand">
        <span className="side-logo" aria-hidden>
          D
        </span>
        <span className="side-label">Daily</span>
      </div>

      <div className="side-nav">
        {VIEWS.map(({ id, label, Icon }, i) => {
          const b = badges[id];
          return (
            <button
              key={id}
              className={`side-item ${view === id ? 'on' : ''}`}
              aria-current={view === id ? 'page' : undefined}
              onClick={() => onView(id)}
              data-tip={`${label} · ${i + 1}`}
            >
              <Icon size={18} />
              <span className="side-label">{label}</span>
              {b && (
                <span className={`side-badge num ${b.tone ?? ''}`} aria-label={`${b.n} pending`}>
                  {b.n}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="side-foot">
        {running && <TimerPill onClick={() => onView('today')} />}
        <button className="side-item" onClick={onJournal} data-tip="Journal · J">
          <BookOpen size={18} />
          <span className="side-label">Journal</span>
        </button>
        <button className="side-item" onClick={onSettings} data-tip="Settings">
          <Cog size={18} />
          <span className="side-label">Settings</span>
        </button>
        <button className="side-item side-toggle" onClick={onToggle} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} data-tip={collapsed ? 'Expand · [' : 'Collapse · ['}>
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          <span className="side-label">Collapse</span>
        </button>
      </div>
    </nav>
  );
}
