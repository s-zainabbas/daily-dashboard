import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CommandPalette, type PaletteHandlers } from './components/CommandPalette';
import { Journal, SettingsDrawer, ShortcutsDialog } from './components/Drawers';
import { Focus, fmtClock } from './components/Focus';
import { Habits } from './components/Habits';
import { Jobs } from './components/Jobs';
import { Onboarding } from './components/Onboarding';
import { PlanDay, PlanPrompt } from './components/PlanDay';
import { Links, Notes, Projects, Reflection } from './components/Panels';
import { Priority } from './components/Priority';
import { ProjectsView } from './components/ProjectsView';
import { QuickAdd } from './components/QuickAdd';
import { Schedule } from './components/Schedule';
import { Stats } from './components/Stats';
import { Tasks } from './components/Tasks';
import { TopBar } from './components/TopBar';
import { DriveDialogs, syncStatus } from './components/DriveSync';
import { useDriveSync } from './lib/sync/driveSync';
import { Sidebar, VIEWS, useSidebarCollapsed, useView, type View } from './components/Sidebar';
import { Toasts, toast } from './components/ui';
import { isTyping, useNow, useResolvedTheme } from './lib/hooks';
import { actions, demoMode, getState, migratedFromLegacy, onSaveError, useStore } from './lib/store';
import { chime, remainingMs, tick, timerActions, useTimer } from './lib/timer';

type Panel = 'palette' | 'journal' | 'settings' | 'shortcuts' | 'plan' | null;

export default function App() {
  const onboarded = useStore((s) => s.onboarded);
  const theme = useStore((s) => s.settings.theme);
  const accent = useStore((s) => s.settings.accent);
  const resolved = useResolvedTheme(theme);
  const [panel, setPanel] = useState<Panel>(null);
  const [view, setView] = useView();
  const [collapsed, toggleSidebar] = useSidebarCollapsed();
  const viewRef = useRef(view);
  viewRef.current = view;
  // "Open the new task / event editor" requests. The panel clears them once it has opened the editor,
  // so the request survives switching to a tab where that panel lives.
  const [taskReq, setTaskReq] = useState(0);
  const [eventReq, setEventReq] = useState(0);
  const quickRef = useRef<HTMLInputElement>(null);
  const timer = useTimer();
  const sync = useDriveSync();
  const now = useNow(60_000);
  const evening = now.getHours() >= 17;

  // Theme + accent on <html>, plus the browser chrome colour.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = resolved;
    root.dataset.accent = accent;
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', resolved === 'light' ? '#f4f2ec' : '#0d0d10'));
  }, [resolved, accent]);

  // One-time notices.
  useEffect(() => {
    if (migratedFromLegacy) toast('Welcome back — your existing dashboard data was brought over.', undefined, 7000);
    onSaveError(() => toast('Couldn’t save — browser storage may be full or disabled.'));
  }, []);

  // Finish focus sessions on time, even if this tab was in the background.
  useEffect(() => {
    const id = setInterval(() => {
      tick((mode) => {
        const { sound } = getState().settings;
        if (sound) chime();
        const msg = mode === 'focus' ? 'Focus session complete — time for a break.' : 'Break’s over — ready for another round?';
        toast(msg, { label: mode === 'focus' ? 'Start break' : 'Start focus', run: timerActions.start }, 10_000);
        if ('Notification' in window && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
          try {
            new Notification('Daily Dashboard', { body: msg, icon: './icon-192.png', silent: true });
          } catch {
            /* some browsers only allow notifications from a service worker */
          }
        }
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Countdown in the tab title while the timer runs.
  useEffect(() => {
    if (!timer.endsAt) {
      document.title = 'Daily Dashboard';
      return;
    }
    const update = () => (document.title = `${fmtClock(remainingMs())} · ${timer.mode === 'focus' ? 'Focus' : 'Break'}`);
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [timer]);

  const handlers = useMemo<PaletteHandlers>(
    () => ({
      newTask: () => {
        if (!TASK_VIEWS.includes(viewRef.current)) setView('tasks');
        setTaskReq((n) => n + 1);
      },
      newEvent: () => {
        if (!EVENT_VIEWS.includes(viewRef.current)) setView('schedule');
        setEventReq((n) => n + 1);
      },
      go: (v) => setView(v),
      plan: () => setPanel('plan'),
      journal: () => setPanel('journal'),
      settings: () => setPanel('settings'),
      shortcuts: () => setPanel('shortcuts'),
      quickAdd: () => quickRef.current?.focus(),
    }),
    // setView only changes the URL hash, so it's safe to capture once.
    [],
  );

  const onKey = useCallback(
    (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPanel((p) => (p === 'palette' ? null : 'palette'));
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target) || document.querySelector('dialog[open]')) return;
      const k = e.key;
      const map: Record<string, () => void> = {
        '/': handlers.quickAdd,
        n: handlers.newTask,
        e: handlers.newEvent,
        f: timerActions.toggle,
        j: handlers.journal,
        p: handlers.plan,
        '?': handlers.shortcuts,
        '[': toggleSidebar,
        t: () => actions.setSettings({ theme: document.documentElement.dataset.theme === 'light' ? 'dark' : 'light' }),
      };
      const tab = VIEWS[Number(k) - 1];
      if (tab && /^[1-9]$/.test(k)) {
        e.preventDefault();
        handlers.go(tab.id);
        return;
      }
      const fn = map[k] ?? map[k.toLowerCase()];
      if (fn) {
        e.preventDefault();
        fn();
      }
    },
    [handlers, toggleSidebar],
  );

  useEffect(() => {
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onKey]);

  const close = () => setPanel(null);

  return (
    <>
      {demoMode && (
        <div className="demo-bar">
          <span>You’re exploring a sample day — changes aren’t saved.</span>
          <a href="./">Start your own →</a>
        </div>
      )}
      <div className={`app ${collapsed ? 'side-collapsed' : ''} ${view === 'today' ? 'fit' : ''}`}>
        <Sidebar view={view} onView={setView} collapsed={collapsed} onToggle={toggleSidebar} onJournal={() => setPanel('journal')} onSettings={() => setPanel('settings')} />
        <div className="shell">
          <TopBar onPalette={() => setPanel('palette')} onJournal={() => setPanel('journal')} onSettings={() => setPanel('settings')} />
          <QuickAdd ref={quickRef} />
          <ViewBody
            key={view}
            view={view}
            evening={evening}
            taskReq={taskReq}
            eventReq={eventReq}
            onTaskHandled={() => setTaskReq(0)}
            onEventHandled={() => setEventReq(0)}
            onPlan={handlers.plan}
          />
          <footer className="footer">
            <span>{sync.account ? `Google Drive · ${syncStatus(sync).text.split(' — ')[0]}` : 'Saved on this device · works offline'}</span>
            <div className="links-row">
              <button onClick={() => setPanel('shortcuts')}>Shortcuts</button>
              <button onClick={() => setPanel('journal')}>Journal</button>
              <button onClick={() => setPanel('settings')}>Backup &amp; settings</button>
            </div>
          </footer>
        </div>
      </div>

      <CommandPalette open={panel === 'palette'} onClose={close} h={handlers} />
      <Journal open={panel === 'journal'} onClose={close} />
      <SettingsDrawer open={panel === 'settings'} onClose={close} />
      <ShortcutsDialog open={panel === 'shortcuts'} onClose={close} />
      <PlanDay open={panel === 'plan'} onClose={close} />
      <Onboarding open={!onboarded} />
      <DriveDialogs />
      <Toasts />
    </>
  );
}

/** Tabs that show the Tasks / Schedule panels, so N and E only switch tab when needed. */
const TASK_VIEWS: View[] = ['today', 'tasks'];
const EVENT_VIEWS: View[] = ['today', 'schedule'];

function ViewBody({ view, evening, taskReq, eventReq, onTaskHandled, onEventHandled, onPlan }: {
  view: View;
  evening: boolean;
  taskReq: number;
  eventReq: number;
  onTaskHandled: () => void;
  onEventHandled: () => void;
  onPlan: () => void;
}) {
  const tasks = <Tasks editRequest={taskReq} onRequestHandled={onTaskHandled} />;
  const schedule = <Schedule editRequest={eventReq} onRequestHandled={onEventHandled} />;
  const title = VIEWS.find((v) => v.id === view)?.label;

  switch (view) {
    case 'today':
      return (
        <>
          <PlanPrompt onPlan={onPlan} />
          <Stats />
          <main className="grid">
            <div className="col col-a">
              <Priority />
              <Tasks editRequest={taskReq} onRequestHandled={onTaskHandled} todayOnly />
            </div>
            <div className="col col-b">
              {schedule}
              {/* The review only matters at the end of the day; it's always on the Schedule tab. */}
              {evening && <Reflection evening />}
            </div>
            <div className="col col-c">
              <Focus />
              <Habits />
            </div>
          </main>
        </>
      );
    case 'tasks':
      return (
        <main className="view-split" aria-label={title}>
          <div className="col">{tasks}</div>
          <div className="col">
            <Priority />
            <Projects />
          </div>
        </main>
      );
    case 'schedule':
      return (
        <main className="view-split" aria-label={title}>
          <div className="col">{schedule}</div>
          <div className="col">
            <Focus />
            <Reflection evening={evening} />
          </div>
        </main>
      );
    case 'projects':
      return (
        <ProjectsView />
      );
    case 'jobs':
      return (
        <main className="view-full view-jobs" aria-label={title}>
          <Jobs />
        </main>
      );
    case 'notes':
      return (
        <main className="view-split view-notes" aria-label={title}>
          <div className="col">
            <Notes />
          </div>
          <div className="col">
            <Links />
            <Habits />
          </div>
        </main>
      );
  }
}
