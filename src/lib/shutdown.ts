import { addDays, dateKey } from './date';
import { nextWeek, type Triage } from './plan';
import { todayHabits } from './habits';
import type { DateKey, Mood, State, Task } from './types';

/** End-of-day "shutdown": the logic behind the evening routine, kept free of UI so it can be tested. */

export type Leftover = Exclude<Triage, 'today'> | 'keep';

export interface ShutdownChoices {
  /** What happens to each unfinished task that was due today or earlier. */
  leftovers: Record<string, Leftover>;
  shipped: string;
  slipped: string;
  mood?: Mood;
  /** Tomorrow's #1 priority. */
  nextPriority: string;
}

const rank = { high: 0, med: 1, low: 2 } as const;
const byPriority = (a: Task, b: Task) => rank[a.priority] - rank[b.priority] || (a.dueDate ?? '').localeCompare(b.dueDate ?? '');

export const closed = (s: State) => !!s.reflection.closed;

/** What got done today. */
export function wins(s: State, today: DateKey) {
  const doneToday = s.tasks
    .filter((t) => t.done && t.completedAt && dateKey(new Date(t.completedAt)) === today)
    .sort((a, b) => (a.completedAt ?? 0) - (b.completedAt ?? 0));
  return {
    tasks: doneToday,
    focusMinutes: s.focus[today]?.minutes ?? 0,
    habitsDone: todayHabits(s.habits, today).done.length,
    habitsOn: todayHabits(s.habits, today).on.length,
    habitsLeft: todayHabits(s.habits, today).left,
  };
}

/** Unfinished tasks that were due today or before (not ones waiting on someone else). */
export function leftovers(s: State, today: DateKey): Task[] {
  return s.tasks.filter((t) => !t.done && !t.waitingOn && t.dueDate && t.dueDate <= today).sort(byPriority);
}

/** A starting point for "What shipped?": today's completed tasks, one per line. */
export const shippedDraft = (done: Task[]) => done.map((t) => t.title).join('\n');

/** Good candidates for tomorrow's #1: high-priority tasks due tomorrow or moved there, then the rest. */
export function nextPriorityIdeas(s: State, today: DateKey, moves: Record<string, Leftover>): string[] {
  const tomorrow = addDays(today, 1);
  const dueTomorrow = s.tasks.filter((t) => !t.done && !t.waitingOn && (moves[t.id] === 'tomorrow' || (!moves[t.id] && t.dueDate === tomorrow)));
  const titles = dueTomorrow.sort(byPriority).map((t) => t.title);
  // An unfinished #1 today is often tomorrow's #1.
  if (s.priority.title && !s.priority.done) titles.unshift(s.priority.title);
  return [...new Set(titles)].slice(0, 5);
}

/**
 * Close the day: move or finish leftovers, save the review, and remember tomorrow's #1.
 * "Done" tasks are returned for the caller to complete through the normal action, so repeating
 * tasks get their next copy.
 */
export function applyShutdown(s: State, c: ShutdownChoices, today: DateKey): { state: State; complete: string[] } {
  const complete: string[] = [];
  const tasks: Task[] = [];
  for (const t of s.tasks) {
    const choice = c.leftovers[t.id];
    if (choice === 'drop') continue;
    if (choice === 'done') complete.push(t.id);
    if (choice === 'tomorrow') tasks.push({ ...t, dueDate: addDays(today, 1) });
    else if (choice === 'week') tasks.push({ ...t, dueDate: nextWeek(today) });
    else tasks.push(t);
  }
  return {
    state: {
      ...s,
      tasks,
      reflection: {
        ...s.reflection,
        shipped: c.shipped.trim(),
        slipped: c.slipped.trim(),
        mood: c.mood,
        nextPriority: c.nextPriority.trim() || undefined,
        closed: true,
      },
    },
    complete,
  };
}
