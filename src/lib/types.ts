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
  /** Rough time it'll take, in minutes. */
  estimate?: number;
  /** Your own order within its group, set by dragging. Lower comes first. */
  order?: number;
  /** Remind me at this time on the due date (or today, if it has no date). */
  remindAt?: TimeKey;
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
  /** Repeats from `date` on. Each occurrence shows on its own day. */
  repeat?: Repeat;
  /** Repeating events: days left out ("delete just this one"). */
  skip?: DateKey[];
  /** Repeating events: the last day it happens. */
  until?: DateKey;
  /** A time block made for this task (by dragging it onto the calendar or auto-planning). */
  taskId?: string;
}

/** An important date: a birthday, trip or deadline, counted down on Today and shown in the calendar. */
export interface Countdown {
  id: string;
  title: string;
  date: DateKey;
  /** Comes back every year (birthdays, anniversaries). */
  yearly?: boolean;
  /** Optional emoji shown with it. */
  emoji?: string;
  createdAt: number;
}

export interface RoutineStep {
  id: string;
  title: string;
  /** How long it takes, for the step timer. */
  minutes?: number;
}

/** A morning, evening or other routine: steps done in order, with a timer for each. */
export interface Routine {
  id: string;
  name: string;
  steps: RoutineStep[];
  /** Weekdays it's on, 0 = Sunday … 6 = Saturday. Missing = every day. */
  days?: number[];
  /** Steps done per day (step ids), kept for the last few weeks. */
  log?: Record<DateKey, string[]>;
  createdAt: number;
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
  /** Per day: ticked (true) or, for counted habits, how many so far. */
  history: Record<DateKey, boolean | number>;
  /** Which weekdays it's on, 0 = Sunday … 6 = Saturday. Missing = every day. */
  days?: number[];
  /** Counted habits: how many a day, e.g. 8 glasses of water. Missing = a simple yes / no. */
  target?: number;
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
  /** Recruiter or person you're talking to. */
  contact?: string;
  salary?: string;
  /** Next interview, local "YYYY-MM-DDTHH:MM". Shows in Schedule. */
  interviewAt?: string;
  /** Last time you followed up, to reset the "follow up?" nudge. */
  followedUpOn?: DateKey;
  createdAt: number;
}

/** One note on the Notes tab. Light formatting: # headings, **bold**, - lists, - [ ] checkboxes, links. */
export interface NotePage {
  id: string;
  title: string;
  body: string;
  pinned?: boolean;
  updatedAt: number;
}

/** A weekly goal, set in the weekly review. */
export interface WeekGoal {
  id: string;
  title: string;
  done: boolean;
}

/** The current week's goals and last weekly review. `key` is the Monday the goals are for. */
export interface WeekPlan {
  key: DateKey;
  goals: WeekGoal[];
  reviewedOn?: DateKey;
  wentWell?: string;
  change?: string;
}

export interface Reflection {
  shipped: string;
  slipped: string;
  carries: string;
  mood?: Mood;
  /** Set by the shutdown routine: becomes the #1 priority when the day rolls over at midnight. */
  nextPriority?: string;
  /** The shutdown routine was finished today. */
  closed?: boolean;
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
  /** Minutes per thing you focused on (task id, or "priority"), with its title kept for history. */
  items?: Record<string, { title: string; minutes: number; projectId?: string }>;
  /** Minutes per hour of the day ("9" = 9–10am), for "when you focus best". */
  hours?: Record<string, number>;
}

export type TxKind = 'income' | 'expense';

/** Money in or out, on the Expenses tab. Amounts are positive, in `MoneySettings.currency`. */
export interface Transaction {
  id: string;
  kind: TxKind;
  amount: number;
  category: string;
  note?: string;
  date: DateKey;
  createdAt: number;
}

/** A monthly spending cap for one category. */
export interface Budget {
  id: string;
  category: string;
  limit: number;
}

/** Something you're saving up for. */
export interface SavingsGoal {
  id: string;
  name: string;
  target: number;
  saved: number;
  /** Optional date you'd like to reach it by. */
  deadline?: DateKey;
  createdAt: number;
}

export interface MoneySettings {
  /** ISO 4217 code, e.g. "USD". */
  currency: string;
  /** Total spending cap per month; undefined = none. */
  monthlyLimit?: number;
}

export interface Settings {
  name: string;
  theme: Theme;
  accent: Accent;
  use24h: boolean;
  units: 'c' | 'f';
  /** Pomodoro lengths from before the "Working on" stopwatch. Kept so older synced data still loads. */
  focusMinutes: number;
  breakMinutes: number;
  /** Suggest a break after working on one thing this long, in minutes; 0 = never. */
  nudgeMinutes?: number;
  location?: { name: string; latitude: number; longitude: number };
  sound: boolean;
  /** Minutes before an event to remind you; 0 = off. */
  eventReminder?: number;
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
  transactions: Transaction[];
  budgets: Budget[];
  savingsGoals: SavingsGoal[];
  countdowns: Countdown[];
  routines: Routine[];
  money: MoneySettings;
  /** The original single scratchpad. Kept for older versions; the Notes tab uses `pages`. */
  notes: string;
  pages: NotePage[];
  week?: WeekPlan;
  /** `plannedOn`: the day you last ran "Plan my day" (kept here so it syncs with the priority). */
  priority: { title: string; done: boolean; plannedOn?: DateKey };
  reflection: Reflection;
  focus: Record<DateKey, FocusDay>;
  journal: DayLog[];
  settings: Settings;
}
