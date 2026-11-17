import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CommandPalette, type PaletteHandlers } from './components/CommandPalette';
import { SettingsDrawer, ShortcutsDialog } from './components/Drawers';
import { Insights } from './components/Insights';
import { JournalView } from './components/JournalView';
import { Now } from './components/Now';
import { Habits } from './components/Habits';
import { Jobs } from './components/Jobs';
import { Onboarding } from './components/Onboarding';
import { PlanDay, PlanPrompt } from './components/PlanDay';
import { Shutdown, ShutdownPrompt } from './components/Shutdown';
import { WeekGoals, WeeklyPrompt, WeeklyReview } from './components/WeeklyReview';
import { Projects, Reflection } from './components/Panels';
import { NotesView } from './components/NotesView';
import { ADD_MONEY_EVENT, ExpensesView } from './components/Expenses';
import { SpendingCard } from './components/SpendingCard';
import { Priority } from './components/Priority';
import { ProjectsView } from './components/ProjectsView';
import { ScheduleTab } from './components/WeekPlanner';
import { QuickAdd } from './components/QuickAdd';
import { Schedule } from './components/Schedule';
import { Stats } from './components/Stats';
import { CountdownDialogs, CountdownStrip } from './components/Countdowns';
import { RoutinesCard } from './components/Routines';
import { FOCUS_EVENT, FocusMode } from './components/FocusMode';
import { AutoPlanDialog } from './components/AutoPlan';
import { ShareCapture } from './components/ShareCapture';
import { StarredMailCard } from './components/Gmail';
import { Tasks } from './components/Tasks';
import { TopBar } from './components/TopBar';
import { DriveDialogs, syncStatus } from './components/DriveSync';
import { useDriveSync } from './lib/sync/driveSync';
import { useReminders } from './lib/useReminders';
import { Sidebar, VIEWS, useSidebarCollapsed, useView, type View } from './components/Sidebar';
import { Toasts, toast } from './components/ui';
import { isTyping, useNow, useResolvedTheme } from './lib/hooks';
import { actions, demoMode, getState, migratedFromLegacy, onSaveError, useStore } from './lib/store';
import { formatDuration } from './lib/date';
import { loggedToast } from './components/Now';
import { checkNudge, chime, elapsedMs, fmtElapsed, useWork, workActions, workTitle } from './lib/timer';
import { notify } from './lib/notify';

type Panel = 'palette' | 'journal' | 'settings' | 'shortcuts' | 'plan' | 'shutdown' | 'week' | 'focus' | null;

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
  const work = useWork();
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

  // After a long stretch on one thing, suggest a break (once per stretch; Settings → Working on).
  useEffect(() => {
    const id = setInterval(() => {
      checkNudge((minutes, title) => {
        if (getState().settings.sound) chime();
        const msg = `${formatDuration(minutes)} on ${title ? `“${title}”` : 'this'}. Time to stand up and stretch?`;
        toast(msg, { label: 'Stop', run: () => loggedToast(workActions.stop()) }, 15_000);
        if (document.visibilityState !== 'visible') notify('Take a break?', { body: msg, tag: 'work-nudge' });
      });
    }, 5000);
    return () => clearInterval(id);
  }, []);

  useReminders();

  // What you're working on, and for how long, in the tab title.
  useEffect(() => {
    if (!work.startedAt) {
      document.title = 'Daily Dashboard';
      return;
    }
    const title = workTitle(work.taskId) ?? 'Working';
    const update = () => (document.title = `${fmtElapsed(elapsedMs(work))} · ${title}`);
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [work]);

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
      addMoney: (kind) => {
        setView('money');
        // Once the tab has rendered, open its add form.
        setTimeout(() => window.dispatchEvent(new CustomEvent(ADD_MONEY_EVENT, { detail: kind })), 60);
      },
      plan: () => setPanel('plan'),
      shutdown: () => setPanel('shutdown'),
      now: () => {
        setView('today');
        setTimeout(() => document.getElementById('now')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
      },
      weekly: () => setPanel('week'),
      focus: () => setPanel('focus'),
      journal: () => setView('journal'),
      settings: () => setPanel('settings'),
      shortcuts: () => setPanel('shortcuts'),
      quickAdd: () => quickRef.current?.focus(),
    }),
    // setView only changes the URL hash, so it's safe to capture once.
    [],
  );

  // Home-screen shortcuts open the app with ?action=… (see manifest.webmanifest).
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const action = params.get('action');
    if (!action) return;
    params.delete('action');
    const qs = params.toString();
    history.replaceState(null, '', `${location.pathname}${qs ? `?${qs}` : ''}${location.hash}`);
    const run: Record<string, () => void> = { 'new-task': handlers.newTask, plan: handlers.plan, focus: handlers.now, 'focus-mode': handlers.focus, shutdown: handlers.shutdown, weekly: handlers.weekly };
    setTimeout(() => run[action]?.(), 50);
  }, [handlers]);

  const onKey = useCallback(
    (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPanel((p) => (p === 'palette' ? null : 'palette'));
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target) || document.querySelector('dialog[open], .focus-mode')) return;
      const k = e.key;
      const map: Record<string, () => void> = {
        '/': handlers.quickAdd,
        n: handlers.newTask,
        e: handlers.newEvent,
        j: handlers.journal,
        p: handlers.plan,
        s: handlers.shutdown,
        w: handlers.weekly,
        f: handlers.focus,
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

  // Buttons elsewhere that open focus mode or Plan my day.
  useEffect(() => {
    const focus = () => setPanel('focus');
    const plan = () => setPanel('plan');
    window.addEventListener(FOCUS_EVENT, focus);
    window.addEventListener('dd:plan-day', plan);
    return () => {
      window.removeEventListener(FOCUS_EVENT, focus);
      window.removeEventListener('dd:plan-day', plan);
    };
  }, []);

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
        <Sidebar view={view} onView={setView} collapsed={collapsed} onToggle={toggleSidebar} onSettings={() => setPanel('settings')} />
        <div className="shell">
          <TopBar onPalette={() => setPanel('palette')} onJournal={() => setView('journal')} onSettings={() => setPanel('settings')} />
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
            onShutdown={handlers.shutdown}
            onWeekly={handlers.weekly}
            onMoney={() => handlers.go('money')}
          />
          <footer className="footer">
            <span>{sync.account ? `Google Drive · ${syncStatus(sync).text.split(' — ')[0]}` : 'Saved on this device · works offline'}</span>
            <div className="links-row">
              <button onClick={() => setPanel('shortcuts')}>Shortcuts</button>
              <button onClick={() => setView('journal')}>Journal</button>
              <button onClick={() => setPanel('settings')}>Backup &amp; settings</button>
            </div>
          </footer>
        </div>
      </div>

      <CommandPalette open={panel === 'palette'} onClose={close} h={handlers} />
      <SettingsDrawer open={panel === 'settings'} onClose={close} />
      <ShortcutsDialog open={panel === 'shortcuts'} onClose={close} />
      <PlanDay open={panel === 'plan'} onClose={close} />
      <Shutdown open={panel === 'shutdown'} onClose={close} />
      <WeeklyReview open={panel === 'week'} onClose={close} />
      <FocusMode open={panel === 'focus'} onClose={close} />
      <AutoPlanDialog />
      <ShareCapture />
      <Onboarding open={!onboarded} />
      <DriveDialogs />
      <CountdownDialogs />
      <Toasts />
    </>
  );
}

/** Tabs that show the Tasks / Schedule panels, so N and E only switch tab when needed. */
const TASK_VIEWS: View[] = ['today', 'tasks'];
const EVENT_VIEWS: View[] = ['today', 'schedule'];

function ViewBody({ view, evening, taskReq, eventReq, onTaskHandled, onEventHandled, onPlan, onShutdown, onWeekly, onMoney }: {
  view: View;
  evening: boolean;
  taskReq: number;
  eventReq: number;
  onTaskHandled: () => void;
  onEventHandled: () => void;
  onPlan: () => void;
  onShutdown: () => void;
  onWeekly: () => void;
  onMoney: () => void;
}) {
  const tasks = <Tasks editRequest={taskReq} onRequestHandled={onTaskHandled} />;
  const schedule = <Schedule editRequest={eventReq} onRequestHandled={onEventHandled} />;
  const title = VIEWS.find((v) => v.id === view)?.label;

  switch (view) {
    case 'today':
      return (
        <>
          {/* At most one prompt at a time: the first that applies (see .prompts in app.css). */}
          <div className="prompts">
            <PlanPrompt onPlan={onPlan} />
            <ShutdownPrompt onStart={onShutdown} />
            <WeeklyPrompt onStart={onWeekly} />
          </div>
          <CountdownStrip />
          <Stats />
          <main className="grid">
            <div className="col col-a">
              <Priority />
              <WeekGoals onReview={onWeekly} />
              <Tasks editRequest={taskReq} onRequestHandled={onTaskHandled} todayOnly />
            </div>
            <div className="col col-b">
              {/* The evening review lives in the shutdown routine (S), and on the Schedule tab. */}
              {schedule}
            </div>
            <div className="col col-c">
              <Now />
              <RoutinesCard />
              <SpendingCard onOpen={onMoney} />
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
            <StarredMailCard />
            <Priority />
            <Projects />
          </div>
        </main>
      );
    case 'schedule':
      return (
        <ScheduleTab
          dayView={
            <main className="view-split" aria-label={title}>
              <div className="col">{schedule}</div>
              <div className="col">
                <Now />
                <Reflection evening={evening} />
              </div>
            </main>
          }
        />
      );
    case 'projects':
      return (
        <ProjectsView />
      );
    case 'jobs':
      return (
        <main className="view-full view-jobs" aria-label={title}>
          <Jobs wide />
        </main>
      );
    case 'journal':
      return <JournalView evening={evening} />;
    case 'insights':
      return <Insights />;
    case 'notes':
      return (
        <NotesView />
      );
    case 'money':
      return <ExpensesView />;
  }
}
