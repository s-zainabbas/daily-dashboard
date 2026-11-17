import { fromKey } from './date';
import type { DateKey, Routine, RoutineStep } from './types';

/** Routines: steps done in order, each with an optional timer. */

/** One step per line; a time at the end ("Stretch 5m", "Read 20 min", "Walk 1h") becomes its timer. */
export function parseSteps(text: string, uid: () => string): RoutineStep[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^(.*?)[\s,–-]+(\d+(?:\.\d+)?)\s*(m|min|mins|minutes|h|hr|hrs|hour|hours)?$/i);
      if (!m || !m[1].trim()) return { id: uid(), title: line };
      const n = Number(m[2]);
      const minutes = Math.round(/^h/i.test(m[3] ?? '') ? n * 60 : n);
      return minutes > 0 && minutes <= 600 ? { id: uid(), title: m[1].trim(), minutes } : { id: uid(), title: line };
    });
}

/** Steps back to text, for editing. */
export const stepsText = (steps: RoutineStep[]) => steps.map((s) => (s.minutes ? `${s.title} ${s.minutes}m` : s.title)).join('\n');

export const routineOn = (r: Routine, day: DateKey) => !r.days?.length || r.days.includes(fromKey(day).getDay());

export function routineProgress(r: Routine, day: DateKey) {
  const done = new Set(r.log?.[day] ?? []);
  const n = r.steps.filter((s) => done.has(s.id)).length;
  return { done, n, total: r.steps.length, complete: r.steps.length > 0 && n === r.steps.length, minutes: r.steps.reduce((t, s) => t + (s.minutes ?? 0), 0) };
}

export const TEMPLATES: { name: string; steps: string; days?: number[] }[] = [
  { name: 'Morning routine', steps: 'Drink a glass of water 1m\nStretch 5m\nMake the bed 2m\nReview today’s plan 5m' },
  { name: 'Evening wind-down', steps: 'Tidy your desk 5m\nPlan tomorrow 5m\nPhone on charge, out of the bedroom 1m\nRead 20m' },
];
