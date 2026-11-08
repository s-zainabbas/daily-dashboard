import { useSyncExternalStore } from 'react';
import { dateKey, today } from './date';
import type { CalEvent, DayLog, Habit, JobApplication, Project, QuickLink, Settings, State, Task } from './types';

export const STORAGE_KEY = 'daily-dashboard:v2';
const LEGACY_PREFIX = 'dashboard.';

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const defaultSettings: Settings = {
  name: '',
  theme: 'system',
  accent: 'violet',
  use24h: false,
  units: 'c',
  focusMinutes: 25,
  breakMinutes: 5,
  sound: true,
};

export function emptyState(): State {
  return {
    version: 2,
    onboarded: false,
    lastActiveDate: today(),
    tasks: [],
    events: [],
    projects: [],
    habits: [],
    links: [
      { id: uid(), label: 'Gmail', url: 'https://mail.google.com' },
      { id: uid(), label: 'Calendar', url: 'https://calendar.google.com' },
      { id: uid(), label: 'GitHub', url: 'https://github.com' },
    ],
    jobs: [],
    notes: '',
    priority: { title: '', done: false },
    reflection: { shipped: '', slipped: '', carries: '' },
    focus: {},
    journal: [],
    settings: { ...defaultSettings },
  };
}

/* ---------- Loading, migration, validation ---------- */

function readJSON<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

/** Bring data from the original single-file dashboard (`dashboard.*` keys) into the new shape. */
export function migrateLegacy(get: (k: string) => unknown): State | null {
  const keys = ['tasks', 'events', 'projects', 'habits', 'notes', 'links', 'reflection', 'settings', 'inbox', 'topTask'];
  const data: Record<string, any> = {};
  let found = false;
  for (const k of keys) {
    const v = get(LEGACY_PREFIX + k);
    if (v !== undefined && v !== null) {
      data[k] = v;
      found = true;
    }
  }
  if (!found) return null;

  const s = emptyState();
  const now = Date.now();
  const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);

  s.tasks = arr(data.tasks).map((t) => ({
    id: String(t.id ?? uid()),
    title: String(t.title ?? ''),
    done: !!t.done,
    priority: ['high', 'med', 'low'].includes(t.priority) ? t.priority : 'low',
    dueDate: t.dueDate || undefined,
    waitingOn: t.waitingOn || undefined,
    createdAt: now,
    completedAt: t.done ? now : undefined,
  }));
  // The old "Inbox check" was a manual list of emails to deal with — those are really tasks.
  for (const m of arr(data.inbox).filter((m) => !m.done)) {
    s.tasks.push({ id: uid(), title: `Reply to ${m.sender}: ${m.subject}`, done: false, priority: 'med', createdAt: now });
  }
  s.events = arr(data.events).map((e) => ({
    id: String(e.id ?? uid()),
    title: String(e.title ?? ''),
    date: e.date || today(),
    start: e.startTime || undefined,
    end: e.endTime || undefined,
    notes: e.notes || undefined,
  }));
  s.projects = arr(data.projects).map((p) => ({
    id: String(p.id ?? uid()),
    name: String(p.name ?? ''),
    status: p.status || 'track',
    nextAction: p.nextAction || '',
    details: p.details || '',
    progress: 0,
  }));
  s.habits = arr(data.habits).map((h) => ({ id: String(h.id ?? uid()), name: String(h.name ?? ''), history: h.history || {}, createdAt: now }));
  if (Array.isArray(data.links) && data.links.length) s.links = data.links.map((l: any) => ({ id: String(l.id ?? uid()), label: l.label, url: l.url }));
  if (typeof data.notes === 'string') s.notes = data.notes;
  if (data.reflection) s.reflection = { shipped: data.reflection.shipped || '', slipped: data.reflection.slipped || '', carries: data.reflection.carries || '' };
  if (data.topTask?.title) s.priority = { title: data.topTask.title, done: false };
  if (data.settings?.theme === 'light' || data.settings?.theme === 'dark') s.settings.theme = data.settings.theme;
  s.onboarded = true;
  return s;
}

/** Fill in anything missing so older or hand-edited saves never crash the app. */
export function normalize(raw: any): State {
  const base = emptyState();
  if (!raw || typeof raw !== 'object') return base;
  return {
    ...base,
    ...raw,
    version: 2,
    tasks: Array.isArray(raw.tasks) ? raw.tasks : [],
    events: Array.isArray(raw.events) ? raw.events : [],
    projects: Array.isArray(raw.projects) ? raw.projects : [],
    habits: Array.isArray(raw.habits) ? raw.habits : [],
    links: Array.isArray(raw.links) ? raw.links : base.links,
    jobs: Array.isArray(raw.jobs) ? raw.jobs : [],
    journal: Array.isArray(raw.journal) ? raw.journal : [],
    focus: raw.focus && typeof raw.focus === 'object' ? raw.focus : {},
    priority: { ...base.priority, ...raw.priority },
    reflection: { ...base.reflection, ...raw.reflection },
    settings: { ...defaultSettings, ...raw.settings },
    notes: typeof raw.notes === 'string' ? raw.notes : '',
  };
}

/**
 * When the date changes, close out the previous day: save it to the journal,
 * turn "what carries to tomorrow" into a task, and reset the daily fields.
 * Unfinished tasks are never thrown away (the original "New Day" button deleted them).
 */
export function rollover(s: State, now = new Date()): State {
  const t = dateKey(now);
  if (s.lastActiveDate >= t) return s;
  const prev = s.lastActiveDate;
  const tasksDone = s.tasks.filter((x) => x.completedAt && dateKey(new Date(x.completedAt)) === prev).length;
  const focusMinutes = s.focus[prev]?.minutes ?? 0;
  const r = s.reflection;
  const meaningful = r.shipped || r.slipped || r.carries || r.mood || s.priority.title || tasksDone || focusMinutes;

  const journal: DayLog[] = meaningful
    ? [{ date: prev, ...r, priority: s.priority.title, priorityDone: s.priority.done, tasksDone, focusMinutes }, ...s.journal.filter((j) => j.date !== prev)].slice(0, 400)
    : s.journal;

  const tasks = [...s.tasks];
  // A fixed id, so two synced devices rolling over the same day don't both add it.
  const carryId = `carry-${prev}`;
  if (r.carries.trim() && !tasks.some((x) => x.id === carryId)) tasks.unshift({ id: carryId, title: r.carries.trim(), done: false, priority: 'med', dueDate: t, createdAt: Date.now() });
  // Keep the done list tidy: forget completed tasks after two weeks.
  const cutoff = Date.now() - 14 * 864e5;

  return {
    ...s,
    lastActiveDate: t,
    journal,
    tasks: tasks.filter((x) => !x.done || (x.completedAt ?? Date.now()) > cutoff),
    priority: s.priority.done || !s.priority.title ? { title: '', done: false } : s.priority,
    reflection: { shipped: '', slipped: '', carries: '' },
  };
}

/** Google Drive sync settings for this device (see sync/local.ts). */
export const SYNC_KEY = 'daily-dashboard:drive';

const linkedToDrive = () => !!readJSON<{ account?: unknown }>(SYNC_KEY)?.account;

function initialState(): State {
  if (typeof localStorage === 'undefined' || demoMode) return emptyState();
  const saved = readJSON<State>(STORAGE_KEY);
  const s = saved ? normalize(saved) : migrateLegacy(readJSON) ?? emptyState();
  if (!saved && s.onboarded) migratedFromLegacy = true;
  // When synced, wait for the latest data from the cloud before closing out the day,
  // so a device that was asleep doesn't journal a stale copy of yesterday.
  // The sync engine closes out the day right after its first sync (or straight away if it can't sync).
  return linkedToDrive() ? s : rollover(s);
}

/* ---------- Store ---------- */

/** `?demo` in the URL: show a sample day in memory only, never touching saved data. */
export const demoMode = typeof location !== 'undefined' && new URLSearchParams(location.search).has('demo');
export let migratedFromLegacy = false;
let state: State = initialState();
const listeners = new Set<() => void>();
const localChangeListeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let saveError: ((e: unknown) => void) | undefined;

export const onSaveError = (fn: (e: unknown) => void) => (saveError = fn);

function persist() {
  clearTimeout(saveTimer);
  saveTimer = undefined;
  if (demoMode) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    saveError?.(e);
  }
}

export function flush() {
  if (saveTimer) persist();
}

export const getState = () => state;

function commit(next: State) {
  state = next;
  listeners.forEach((l) => l());
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, 150);
}

/** Change state from the UI. Cloud sync hears about it and uploads the change. */
export function setState(fn: (s: State) => State) {
  const next = fn(state);
  if (next === state) return;
  commit(next);
  localChangeListeners.forEach((l) => l());
}

/** Apply data that came from the cloud: saved on this device, but not sent back up. */
export function applyRemote(fn: (s: State) => State) {
  const next = fn(state);
  if (next !== state) commit(next);
}

export function onLocalChange(fn: () => void) {
  localChangeListeners.add(fn);
  return () => localChangeListeners.delete(fn);
}

export function replaceState(next: State) {
  setState(() => normalize(next));
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useStore<T>(selector: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state));
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush());
  // Keep several open tabs in sync.
  window.addEventListener('storage', (e) => {
    if (demoMode || e.key !== STORAGE_KEY || !e.newValue) return;
    try {
      state = normalize(JSON.parse(e.newValue));
      listeners.forEach((l) => l());
    } catch {
      /* ignore malformed writes from elsewhere */
    }
  });
  // Notice midnight even if the tab stays open for days.
  setInterval(() => setState((s) => rollover(s)), 60_000);
}

/* ---------- Actions ---------- */

const patch = <K extends keyof State>(key: K, fn: (v: State[K]) => State[K]) => setState((s) => ({ ...s, [key]: fn(s[key]) }));

export const actions = {
  addTask(t: Partial<Task> & { title: string }) {
    const task: Task = { id: uid(), done: false, priority: 'med', createdAt: Date.now(), ...t };
    patch('tasks', (ts) => [task, ...ts]);
    return task;
  },
  updateTask(id: string, p: Partial<Task>) {
    patch('tasks', (ts) => ts.map((t) => (t.id === id ? { ...t, ...p } : t)));
  },
  toggleTask(id: string) {
    patch('tasks', (ts) => ts.map((t) => (t.id === id ? { ...t, done: !t.done, completedAt: !t.done ? Date.now() : undefined } : t)));
  },
  removeTask(id: string) {
    const s = getState();
    const index = s.tasks.findIndex((t) => t.id === id);
    const task = s.tasks[index];
    patch('tasks', (ts) => ts.filter((t) => t.id !== id));
    return () => task && patch('tasks', (ts) => [...ts.slice(0, index), task, ...ts.slice(index)]);
  },
  clearCompleted() {
    patch('tasks', (ts) => ts.filter((t) => !t.done));
  },

  addEvent(e: Omit<CalEvent, 'id'>) {
    patch('events', (es) => [...es, { id: uid(), ...e }]);
  },
  updateEvent(id: string, p: Partial<CalEvent>) {
    patch('events', (es) => es.map((e) => (e.id === id ? { ...e, ...p } : e)));
  },
  removeEvent(id: string) {
    const ev = getState().events.find((e) => e.id === id);
    patch('events', (es) => es.filter((e) => e.id !== id));
    return () => ev && patch('events', (es) => [...es, ev]);
  },

  saveProject(p: Omit<Project, 'id'> & { id?: string }) {
    patch('projects', (ps) => (p.id ? ps.map((x) => (x.id === p.id ? { ...x, ...p, id: x.id } : x)) : [...ps, { ...p, id: uid() }]));
  },
  removeProject(id: string) {
    patch('projects', (ps) => ps.filter((p) => p.id !== id));
  },

  addHabit(name: string) {
    const h: Habit = { id: uid(), name, history: {}, createdAt: Date.now() };
    patch('habits', (hs) => [...hs, h]);
  },
  renameHabit(id: string, name: string) {
    patch('habits', (hs) => hs.map((h) => (h.id === id ? { ...h, name } : h)));
  },
  toggleHabit(id: string, date = today()) {
    patch('habits', (hs) => hs.map((h) => (h.id === id ? { ...h, history: { ...h.history, [date]: !h.history[date] } } : h)));
  },
  removeHabit(id: string) {
    patch('habits', (hs) => hs.filter((h) => h.id !== id));
  },

  saveLink(l: Omit<QuickLink, 'id'> & { id?: string }) {
    patch('links', (ls) => (l.id ? ls.map((x) => (x.id === l.id ? { ...x, ...l, id: x.id } : x)) : [...ls, { ...l, id: uid() }]));
  },
  removeLink(id: string) {
    patch('links', (ls) => ls.filter((l) => l.id !== id));
  },

  addJob(j: Omit<JobApplication, 'id' | 'createdAt' | 'status' | 'appliedOn'> & Partial<JobApplication>) {
    const job: JobApplication = { id: uid(), status: 'applied', appliedOn: today(), createdAt: Date.now(), ...j };
    patch('jobs', (js) => [job, ...js]);
    return job;
  },
  updateJob(id: string, p: Partial<JobApplication>) {
    patch('jobs', (js) => js.map((j) => (j.id === id ? { ...j, ...p, id } : j)));
  },
  removeJob(id: string) {
    const js = getState().jobs;
    const index = js.findIndex((j) => j.id === id);
    const job = js[index];
    patch('jobs', (all) => all.filter((j) => j.id !== id));
    return () => job && patch('jobs', (all) => [...all.slice(0, index), job, ...all.slice(index)]);
  },

  setNotes(notes: string) {
    setState((s) => ({ ...s, notes }));
  },
  setPriority(p: Partial<State['priority']>) {
    patch('priority', (v) => ({ ...v, ...p }));
  },
  setReflection(p: Partial<State['reflection']>) {
    patch('reflection', (v) => ({ ...v, ...p }));
  },
  logFocus(minutes: number) {
    const d = today();
    patch('focus', (f) => ({ ...f, [d]: { minutes: (f[d]?.minutes ?? 0) + minutes, sessions: (f[d]?.sessions ?? 0) + 1 } }));
  },
  setSettings(p: Partial<Settings>) {
    patch('settings', (v) => ({ ...v, ...p }));
  },
  finishOnboarding(name: string) {
    setState((s) => ({ ...s, onboarded: true, settings: { ...s.settings, name } }));
  },
};
