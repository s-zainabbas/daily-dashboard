import { toMinutes } from './date';
import type { CalEvent, DateKey, Priority, State, Task } from './types';

/** The Now card's brains: where you are in the day, and what to work on next. */

export type Moment =
  | { kind: 'busy'; event: CalEvent; endsIn?: number }
  | { kind: 'free'; minutes: number; next: CalEvent }
  | { kind: 'clear' };

/** Are you in an event right now? If not, how long until the next one today? */
export function moment(events: CalEvent[], day: DateKey, nowMin: number): Moment {
  const timed = events.filter((e) => e.date === day && e.start).sort((a, b) => a.start!.localeCompare(b.start!));
  const end = (e: CalEvent) => (e.end && toMinutes(e.end) > toMinutes(e.start!) ? toMinutes(e.end) : toMinutes(e.start!) + 30);
  const current = timed.find((e) => toMinutes(e.start!) <= nowMin && nowMin < end(e));
  if (current) return { kind: 'busy', event: current, endsIn: end(current) - nowMin };
  const next = timed.find((e) => toMinutes(e.start!) > nowMin);
  if (next) return { kind: 'free', minutes: toMinutes(next.start!) - nowMin, next };
  return { kind: 'clear' };
}

export interface Pick {
  /** Task id, or "priority" for today's #1. */
  id: string;
  title: string;
  task?: Task;
  why: 'priority' | 'overdue' | 'today' | 'anytime';
}

const rank: Record<Priority, number> = { high: 0, med: 1, low: 2 };
const byImportance = (a: Task, b: Task) =>
  rank[a.priority] - rank[b.priority] || (a.order ?? Infinity) - (b.order ?? Infinity) || a.createdAt - b.createdAt;

/**
 * What you could work on, best first: today's #1, then overdue, then due today, then undated
 * tasks — each by priority and your own order. Waiting-on and future tasks are left out.
 * `fits`: minutes until your next event; a task estimated longer than that drops behind ones that fit.
 */
export function candidates(s: State, day: DateKey, fits?: number): Pick[] {
  const out: Pick[] = [];
  if (s.priority.title.trim() && !s.priority.done) out.push({ id: 'priority', title: s.priority.title.trim(), why: 'priority' });
  // A task you starred as the #1 shows once, as the #1.
  const prio = s.priority.done ? '' : s.priority.title.trim().toLowerCase();
  const open = s.tasks.filter((t) => !t.done && !t.waitingOn && t.title.trim() && t.title.trim().toLowerCase() !== prio);
  const fitFirst = (list: Task[]) =>
    fits === undefined ? list : [...list.filter((t) => !t.estimate || t.estimate <= fits), ...list.filter((t) => t.estimate && t.estimate > fits)];
  const groups: [Pick['why'], Task[]][] = [
    ['overdue', open.filter((t) => t.dueDate && t.dueDate < day)],
    ['today', open.filter((t) => t.dueDate === day)],
    ['anytime', open.filter((t) => !t.dueDate)],
  ];
  for (const [why, list] of groups) for (const t of fitFirst([...list].sort(byImportance))) out.push({ id: t.id, title: t.title, task: t, why });
  return out;
}
