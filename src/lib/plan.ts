import { addDays, fromKey, toMinutes } from './date';
import type { CalEvent, DateKey, State, Task } from './types';

/** "Plan my day": the logic behind the morning routine, kept free of UI so it can be tested. */

export type Triage = 'today' | 'tomorrow' | 'week' | 'done' | 'drop';

export interface PlanChoices {
  /** What to do with each overdue task. Overdue tasks left out stay as they are. */
  triage: Record<string, Triage>;
  /** Tasks to do today. */
  picked: string[];
  /** Today's #1 priority. */
  priority: string;
}

const rank = { high: 0, med: 1, low: 2 } as const;
const byPriority = (a: Task, b: Task) => rank[a.priority] - rank[b.priority] || (a.dueDate ?? '9').localeCompare(b.dueDate ?? '9');
const open = (s: State) => s.tasks.filter((t) => !t.done && !t.waitingOn);

export const planned = (s: State, today: DateKey) => s.priority.plannedOn === today;

export function overdue(s: State, today: DateKey): Task[] {
  return open(s)
    .filter((t) => t.dueDate && t.dueDate < today)
    .sort(byPriority);
}

/** Next Monday (or the Monday after, if today is Monday). */
export const nextWeek = (today: DateKey) => addDays(today, ((8 - fromKey(today).getDay()) % 7) || 7);

/** Tasks worth considering for today, after the overdue ones were sorted out. */
export function candidates(s: State, today: DateKey, triage: Record<string, Triage>) {
  const all = open(s);
  const dueOn = (t: Task) => {
    const c = triage[t.id];
    if (c === 'done' || c === 'drop') return null;
    if (c === 'today') return today;
    if (c === 'tomorrow') return addDays(today, 1);
    if (c === 'week') return nextWeek(today);
    return t.dueDate;
  };
  const withDue = all.map((t) => ({ t, due: dueOn(t) })).filter((x) => x.due !== null);
  return {
    today: withDue.filter((x) => x.due && x.due <= today).map((x) => x.t).sort(byPriority),
    soon: withDue
      .filter((x) => x.due && x.due > today && x.due <= addDays(today, 7))
      .sort((a, b) => a.due!.localeCompare(b.due!) || byPriority(a.t, b.t))
      .map((x) => x.t),
    anytime: withDue.filter((x) => !x.due).map((x) => x.t).sort(byPriority),
    dueOn,
  };
}

/**
 * Apply the plan: sort out overdue tasks, move picked ones to today, move unpicked ones that were
 * due today to tomorrow, and set the #1 priority. "Done" overdue tasks are returned for the caller
 * to complete through the normal action, so repeating tasks get their next copy.
 */
export function applyPlan(s: State, c: PlanChoices, today: DateKey): { state: State; complete: string[] } {
  const picked = new Set(c.picked);
  const complete: string[] = [];
  const tasks: Task[] = [];
  for (const t of s.tasks) {
    const choice = c.triage[t.id];
    if (choice === 'drop') continue;
    if (choice === 'done') complete.push(t.id);
    if (t.done || t.waitingOn || choice === 'done') {
      tasks.push(t);
      continue;
    }
    let due = t.dueDate;
    if (choice === 'today') due = today;
    if (choice === 'tomorrow') due = addDays(today, 1);
    if (choice === 'week') due = nextWeek(today);
    if (picked.has(t.id)) due = today;
    else if (due && due <= today) due = addDays(today, 1); // not today after all
    tasks.push(due === t.dueDate ? t : { ...t, dueDate: due });
  }
  const title = c.priority.trim();
  const samePriority = title === s.priority.title;
  return {
    state: { ...s, tasks, priority: { title, done: samePriority ? s.priority.done : false, plannedOn: today } },
    complete,
  };
}

/** Free time between your events from `fromMin` until `endMin` (default 8pm), for a rough sense of capacity. */
export function freeMinutes(events: CalEvent[], day: DateKey, fromMin: number, endMin = 20 * 60): number {
  const start = Math.max(fromMin, 8 * 60);
  if (start >= endMin) return 0;
  const busy = events
    .filter((e) => e.date === day && e.start)
    .map((e) => [toMinutes(e.start!), e.end ? toMinutes(e.end) : toMinutes(e.start!) + 30] as const)
    .map(([a, b]) => [Math.max(a, start), Math.min(b, endMin)] as const)
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);
  let free = 0;
  let cursor = start;
  for (const [a, b] of busy) {
    if (a > cursor) free += a - cursor;
    cursor = Math.max(cursor, b);
  }
  return free + Math.max(0, endMin - cursor);
}
