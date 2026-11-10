export type Priority = 'high' | 'med' | 'low';
export type ProjectStatus = 'track' | 'risk' | 'blocked' | 'paused' | 'done';
export type Theme = 'system' | 'dark' | 'light';
export type Accent = 'violet' | 'blue' | 'green' | 'amber' | 'rose';
export type Mood = 1 | 2 | 3 | 4 | 5;

/** Local calendar date, `YYYY-MM-DD`. */
export type DateKey = string;
/** Local wall-clock time, `HH:MM` (24h). */
export type TimeKey = string;

export type RepeatFreq = 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly';

/** How a task repeats. A new copy is created, due on the next date, when one is completed. */
export interface Repeat {
  freq: RepeatFreq;
  /** Every N days / weeks / months / years. Defaults to 1. */
  interval?: number;
  /** Weekly only: which weekdays, 0 = Sunday … 6 = Saturday. Defaults to the due date's weekday. */
  days?: number[];
  /** Monthly / yearly only: the day of the month to aim for, so the 31st stays the 31st after a short month. */
  monthDay?: number;
}

/** One step in a task's checklist. */
export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

export interface Task {
  id: string;
  title: string;
  done: boolean;
  priority: Priority;
  dueDate?: DateKey;
  /** Someone else is holding this up. */
  waitingOn?: string;
  projectId?: string;
  notes?: string;
  /** Checklist of steps. */
  subtasks?: Subtask[];
  repeat?: Repeat;
  /** Id shared by every copy of a repeating task (the first copy's id). */
  seriesId?: string;
  createdAt: number;
  completedAt?: number;
}

export interface CalEvent {
  id: string;
  title: string;
  date: DateKey;
  start?: TimeKey; // undefined = all day
  end?: TimeKey;
  location?: string;
  notes?: string;
}

export interface Project {
  id: string;
  name: string;
  status: ProjectStatus;
  nextAction: string;
  details: string;
  progress: number; // 0–100
}

export interface Habit {
  id: string;
  name: string;
  history: Record<DateKey, boolean>;
  createdAt: number;
}

export interface QuickLink {
  id: string;
  label: string;
  url: string;
}

export type JobStatus = 'applied' | 'interview' | 'offer' | 'rejected';

export interface JobApplication {
  id: string;
  url: string;
  company: string;
  role: string;
  location?: string;
  status: JobStatus;
  appliedOn: DateKey;
  notes?: string;
  /** Copy of the posting, kept in case it's taken down before an interview. */
  description?: string;
  createdAt: number;
}

export interface Reflection {
  shipped: string;
  slipped: string;
  carries: string;
  mood?: Mood;
}

export interface DayLog extends Reflection {
  date: DateKey;
  priority: string;
  priorityDone: boolean;
  tasksDone: number;
  focusMinutes: number;
}

export interface FocusDay {
  minutes: number;
  sessions: number;
}

export interface Settings {
  name: string;
  theme: Theme;
  accent: Accent;
  use24h: boolean;
  units: 'c' | 'f';
  focusMinutes: number;
  breakMinutes: number;
  location?: { name: string; latitude: number; longitude: number };
  sound: boolean;
}

export interface State {
  version: 2;
  onboarded: boolean;
  lastActiveDate: DateKey;
  tasks: Task[];
  events: CalEvent[];
  projects: Project[];
  habits: Habit[];
  links: QuickLink[];
  jobs: JobApplication[];
  notes: string;
  /** `plannedOn`: the day you last ran "Plan my day" (kept here so it syncs with the priority). */
  priority: { title: string; done: boolean; plannedOn?: DateKey };
  reflection: Reflection;
  focus: Record<DateKey, FocusDay>;
  journal: DayLog[];
  settings: Settings;
}
