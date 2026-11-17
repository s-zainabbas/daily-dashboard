import { fromMinutes, toMinutes } from './date';
import type { CalEvent, DateKey, Priority, Task, TimeKey } from './types';

/**
 * Auto-plan: place today's tasks into the free gaps between your events, like a time-blocking
 * planner would — no AI, just rules you can predict:
 *
 * - Your #1 priority first, then by priority (high → low), keeping your own order within each.
 * - Each task takes its estimate (30 minutes if it has none), from 15 minutes up to 4 hours.
 * - High-priority work goes into your best focus hours when there's room; the rest goes into the
 *   earliest gap it fits, with 5 minutes of breathing room after each block.
 * - Tasks that already have a time block that day, and anything that doesn't fit, are left out.
 */

export interface Block {
  taskId: string;
  title: string;
  start: TimeKey;
  end: TimeKey;
}

export interface AutoPlanInput {
  tasks: Task[];
  events: CalEvent[];
  day: DateKey;
  /** Earliest start, in minutes after midnight (now, for today). */
  fromMin: number;
  /** Latest end; default 8pm. */
  endMin?: number;
  /** Your best focus hours, e.g. [9, 11], from Insights. */
  best?: [number, number] | null;
  /** Today's #1 priority, to put it first. */
  priorityTitle?: string;
}

const rank: Record<Priority, number> = { high: 0, med: 1, low: 2 };
const BUFFER = 5;
const DEFAULT_MINUTES = 30;

/** Free stretches between `from` and `to`, given busy [start, end) ranges. */
export function freeSlots(busy: [number, number][], from: number, to: number): [number, number][] {
  const out: [number, number][] = [];
  let cursor = from;
  for (const [a, b] of [...busy].sort((x, y) => x[0] - y[0])) {
    if (b <= cursor) continue;
    if (a > cursor) out.push([cursor, Math.min(a, to)]);
    cursor = Math.max(cursor, b);
    if (cursor >= to) break;
  }
  if (cursor < to) out.push([cursor, to]);
  return out.filter(([a, b]) => b - a >= 15);
}

export const taskMinutes = (t: Task) => Math.min(240, Math.max(15, t.estimate ?? DEFAULT_MINUTES));

export function autoPlan(input: AutoPlanInput): { blocks: Block[]; unplaced: Task[] } {
  const { day, events, best, priorityTitle } = input;
  const endMin = input.endMin ?? 20 * 60;
  const start = Math.ceil(Math.max(input.fromMin, 0) / 15) * 15;
  const blocked = new Set(events.filter((e) => e.date === day && e.taskId).map((e) => e.taskId));
  const prio = priorityTitle?.trim().toLowerCase();
  const isPrio = (t: Task) => !!prio && t.title.trim().toLowerCase() === prio;
  const tasks = input.tasks
    .filter((t) => !t.done && !t.waitingOn && !blocked.has(t.id))
    .map((t, i) => ({ t, i }))
    .sort((a, b) => Number(isPrio(b.t)) - Number(isPrio(a.t)) || rank[a.t.priority] - rank[b.t.priority] || (a.t.order ?? a.i) - (b.t.order ?? b.i))
    .map((x) => x.t);

  const busy: [number, number][] = events
    .filter((e) => e.date === day && e.start)
    .map((e) => {
      const a = toMinutes(e.start!);
      const b = e.end && toMinutes(e.end) > a ? toMinutes(e.end) : a + 30;
      return [a, b + BUFFER] as [number, number];
    });
  let slots = freeSlots(busy, start, endMin);

  const blocks: Block[] = [];
  const unplaced: Task[] = [];
  for (const t of tasks) {
    const len = taskMinutes(t);
    let at: number | null = null;
    // Important work in your best hours, when it fits there.
    if (best && (t.priority === 'high' || isPrio(t))) {
      const [b0, b1] = [best[0] * 60, best[1] * 60];
      for (const [a, b] of slots) {
        const s = Math.max(a, b0);
        if (s < b1 && s + len <= b) {
          at = s;
          break;
        }
      }
    }
    if (at === null) at = slots.find(([a, b]) => b - a >= len)?.[0] ?? null;
    if (at === null) {
      unplaced.push(t);
      continue;
    }
    const end = at + len;
    blocks.push({ taskId: t.id, title: t.title, start: fromMinutes(at), end: fromMinutes(end) });
    slots = freeSlots([...slotsToBusy(slots, start, endMin), [at, end + BUFFER]], start, endMin);
  }
  blocks.sort((a, b) => a.start.localeCompare(b.start));
  return { blocks, unplaced };
}

/** The complement of the free slots, so a new block can be added and the slots recomputed. */
function slotsToBusy(slots: [number, number][], from: number, to: number): [number, number][] {
  const out: [number, number][] = [];
  let cursor = from;
  for (const [a, b] of slots) {
    if (a > cursor) out.push([cursor, a]);
    cursor = b;
  }
  if (cursor < to) out.push([cursor, to]);
  return out;
}

/** Minutes of open work for the day against free time, for the "too much for today" warning. */
export function workload(tasks: Task[], events: CalEvent[], day: DateKey): number {
  const blocked = new Set(events.filter((e) => e.date === day && e.taskId).map((e) => e.taskId));
  return tasks.filter((t) => !t.done && !t.waitingOn && t.dueDate && t.dueDate <= day && !blocked.has(t.id)).reduce((n, t) => n + (t.estimate ?? 0), 0);
}
