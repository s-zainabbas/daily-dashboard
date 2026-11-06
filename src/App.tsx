import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CommandPalette, type PaletteHandlers } from './components/CommandPalette';
import { Journal, SettingsDrawer, ShortcutsDialog } from './components/Drawers';
import { Focus, fmtClock } from './components/Focus';
import { Habits } from './components/Habits';
import { Onboarding } from './components/Onboarding';
import { Links, Notes, Projects, Reflection } from './components/Panels';
import { Priority } from './components/Priority';
import { QuickAdd } from './components/QuickAdd';
import { Schedule } from './components/Schedule';
import { Stats } from './components/Stats';
import { Tasks } from './components/Tasks';
import { TopBar } from './components/TopBar';
import { Toasts, toast } from './components/ui';
import { isTyping, useNow, useResolvedTheme } from './lib/hooks';
import { actions, demoMode, getState, migratedFromLegacy, onSaveError, useStore } from './lib/store';
import { chime, remainingMs, tick, timerActions, useTimer } from './lib/timer';

type Panel = 'palette' | 'journal' | 'settings' | 'shortcuts' | null;

export default function App() {
  const onboarded = useStore((s) => s.onboarded);
  const theme = useStore((s) => s.settings.theme);
  const accent = useStore((s) => s.settings.accent);
  const resolved = useResolvedTheme(theme);
  const [panel, setPanel] = useState<Panel>(null);
  const [taskReq, setTaskReq] = useState<{ n: number }>({ n: 0 });
  const [eventReq, setEventReq] = useState<{ n: number }>({ n: 0 });
  const quickRef = useRef<HTMLInputElement>(null);
  const timer = useTimer();
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
      newTask: () => setTaskReq((r) => ({ n: r.n + 1 })),
      newEvent: () => setEventReq((r) => ({ n: r.n + 1 })),
      journal: () => setPanel('journal'),
      settings: () => setPanel('settings'),
      shortcuts: () => setPanel('shortcuts'),
      quickAdd: () => quickRef.current?.focus(),
    }),
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
        '?': handlers.shortcuts,
        t: () => actions.setSettings({ theme: document.documentElement.dataset.theme === 'light' ? 'dark' : 'light' }),
      };
      const fn = map[k] ?? map[k.toLowerCase()];
      if (fn) {
        e.preventDefault();
        fn();
      }
    },
    [handlers],
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
      <div className="shell">
        <TopBar onPalette={() => setPanel('palette')} onJournal={() => setPanel('journal')} onSettings={() => setPanel('settings')} />
        <QuickAdd ref={quickRef} />
        <Stats />
        <main className="grid">
          <div className="col col-a">
            <Priority />
            <Tasks editRequest={taskReq.n ? taskReq : undefined} />
            <Reflection evening={evening} />
          </div>
          <div className="col col-b">
            <Schedule editRequest={eventReq.n ? eventReq : undefined} />
            <Projects />
            <Links />
          </div>
          <div className="col col-c">
            <Focus />
            <Habits />
            <Notes />
          </div>
        </main>
        <footer className="footer">
          <span>Saved on this device · works offline</span>
          <div className="links-row">
            <button onClick={() => setPanel('shortcuts')}>Shortcuts</button>
            <button onClick={() => setPanel('journal')}>Journal</button>
            <button onClick={() => setPanel('settings')}>Backup &amp; settings</button>
          </div>
        </footer>
      </div>

      <CommandPalette open={panel === 'palette'} onClose={close} h={handlers} />
      <Journal open={panel === 'journal'} onClose={close} />
      <SettingsDrawer open={panel === 'settings'} onClose={close} />
      <ShortcutsDialog open={panel === 'shortcuts'} onClose={close} />
      <Onboarding open={!onboarded} />
      <Toasts />
    </>
  );
}
