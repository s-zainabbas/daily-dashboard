import { useSyncExternalStore } from 'react';
import { actions, demoMode, getState } from './store';

/**
 * "Working on": a count-up stopwatch for whatever you're doing right now.
 *
 * It replaces the old 25-minute Pomodoro countdown. You start it on a task, switch when you
 * switch, and stop when you're done; the time is credited to that task (the same focus log the
 * Insights and Journal use). It's based on timestamps, so it stays right in background tabs and
 * across reloads. An optional nudge reminds you to take a break after a while.
 */

export interface WorkState {
  /** Task id, "priority" for today's #1, or undefined for untitled work. */
  taskId?: string;
  /** Set while running: when this stretch started. */
  startedAt?: number;
  /** The break nudge has already been shown for this stretch. */
  nudged?: boolean;
}

const KEY = 'daily-dashboard:work';
const OLD_KEY = 'daily-dashboard:timer';
/** A stretch longer than this was almost certainly a forgotten timer. */
export const MAX_MINUTES = 4 * 60;
const listeners = new Set<() => void>();

function load(): WorkState {
  if (demoMode) return {}; // the sample day never touches your timer
  try {
    localStorage.removeItem(OLD_KEY); // the old Pomodoro timer
    const w = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (w && typeof w === 'object') return w;
  } catch {
    /* fall through */
  }
  return {};
}

let work: WorkState = typeof localStorage === 'undefined' ? {} : load();

function set(next: WorkState) {
  work = next;
  if (!demoMode) {
    try {
      localStorage.setItem(KEY, JSON.stringify(work));
    } catch {
      /* optional */
    }
  }
  listeners.forEach((l) => l());
}

// Keep several open tabs on the same stopwatch.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (demoMode || e.key !== KEY) return;
    try {
      work = JSON.parse(e.newValue || '{}') ?? {};
      listeners.forEach((l) => l());
    } catch {
      /* ignore */
    }
  });
}

export const getWork = () => work;
export const isWorking = (w = work) => !!w.startedAt;
export const elapsedMs = (w = work, now = Date.now()) => (w.startedAt ? Math.max(0, now - w.startedAt) : 0);

/** Title of what you're working on (the #1 priority or a task), if it still exists. */
export function workTitle(taskId = work.taskId, s = getState()): string | undefined {
  if (!taskId) return undefined;
  if (taskId === 'priority') return s.priority.title || undefined;
  return s.tasks.find((t) => t.id === taskId)?.title;
}

/** `23:05` under an hour, `1:05:23` after. */
export function fmtElapsed(ms: number) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

export interface Logged {
  minutes: number;
  title?: string;
  /** The stretch was longer than MAX_MINUTES, so only that much was logged. */
  capped: boolean;
}

/** Stop the stopwatch and credit the time. Under 30 seconds isn't logged. */
function stop(): Logged | undefined {
  if (!work.startedAt) return;
  const raw = elapsedMs() / 60_000;
  const minutes = Math.min(MAX_MINUTES, Math.round(raw));
  const title = workTitle();
  if (minutes >= 1) actions.logFocus(minutes, work.taskId, work.startedAt);
  set({ taskId: work.taskId });
  return { minutes, title, capped: raw > MAX_MINUTES };
}

export const workActions = {
  /** Start working on something. If something else is running, its time is logged first. */
  start(taskId?: string): Logged | undefined {
    const prev = work.startedAt && work.taskId !== taskId ? stop() : undefined;
    if (work.startedAt) return prev; // already on this one
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
    set({ taskId, startedAt: Date.now() });
    return prev;
  },
  stop,
  /** Stop and mark what you were working on as done. */
  finish(): Logged | undefined {
    const id = work.taskId;
    const logged = stop();
    if (id === 'priority') actions.setPriority({ done: true });
    else if (id && getState().tasks.some((t) => t.id === id && !t.done)) actions.toggleTask(id);
    set({});
    return logged;
  },
  /** Forget the current stretch without logging it. */
  discard() {
    set({ taskId: work.taskId });
  },
};

/**
 * Called every few seconds by the app. Shows the break nudge once per stretch, after
 * `settings.nudgeMinutes` (0 = never).
 */
export function checkNudge(onNudge: (minutes: number, title?: string) => void) {
  const after = getState().settings.nudgeMinutes ?? 50;
  if (!work.startedAt || work.nudged || !after) return;
  const minutes = Math.floor(elapsedMs() / 60_000);
  if (minutes < after) return;
  set({ ...work, nudged: true });
  onNudge(minutes, workTitle());
}

export function useWork(): WorkState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => work,
  );
}

export function chime() {
  try {
    const ctx = new AudioContext();
    [660, 880].forEach((freq, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      const t0 = ctx.currentTime + i * 0.18;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.18, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.9);
      o.connect(g).connect(ctx.destination);
      o.start(t0);
      o.stop(t0 + 1);
    });
    setTimeout(() => ctx.close(), 1500);
  } catch {
    /* audio is a nice-to-have */
  }
}
