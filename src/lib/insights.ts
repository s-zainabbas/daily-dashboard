import { addDays, dateKey, fromKey, lastDays } from './date';
import { successRate } from './habits';
import type { DateKey, State } from './types';

/** Numbers for the Insights tab, kept free of UI so they can be tested. */

export interface DayPoint {
  date: DateKey;
  value: number;
}

/** Focus minutes per day. */
export const focusSeries = (s: State, days: DateKey[]): DayPoint[] => days.map((date) => ({ date, value: s.focus[date]?.minutes ?? 0 }));

/** Tasks completed per day: from the journal for past days, and live for today. */
export function tasksSeries(s: State, days: DateKey[], today: DateKey): DayPoint[] {
  const journal = new Map(s.journal.map((j) => [j.date, j.tasksDone]));
  const live = new Map<string, number>();
  for (const t of s.tasks) {
    if (!t.done || !t.completedAt) continue;
    const d = dateKey(new Date(t.completedAt));
    live.set(d, (live.get(d) ?? 0) + 1);
  }
  return days.map((date) => ({ date, value: date === today ? (live.get(date) ?? 0) : Math.max(journal.get(date) ?? 0, live.get(date) ?? 0) }));
}

/** Mood per day (1–5), where you recorded one. Today's comes from the evening review. */
export function moodSeries(s: State, days: DateKey[], today: DateKey): { date: DateKey; value: number | null }[] {
  const moods = new Map(s.journal.map((j) => [j.date, j.mood ?? null]));
  if (s.reflection.mood) moods.set(today, s.reflection.mood);
  return days.map((date) => ({ date, value: moods.get(date) ?? null }));
}

/** Success rate per habit over the range, best first. */
export const habitRates = (s: State, today: DateKey, days: number) =>
  s.habits.map((h) => ({ id: h.id, name: h.name, rate: successRate(h, today, days) })).sort((a, b) => b.rate - a.rate);

/** Where focus time went, by task or project, over these days. */
export function focusBreakdown(s: State, days: DateKey[], by: 'task' | 'project') {
  const totals = new Map<string, { label: string; minutes: number }>();
  let tracked = 0;
  let all = 0;
  for (const d of days) {
    const day = s.focus[d];
    if (!day) continue;
    all += day.minutes;
    for (const [id, it] of Object.entries(day.items ?? {})) {
      tracked += it.minutes;
      const key = by === 'task' ? id : it.projectId ?? '';
      const label = by === 'task' ? it.title : s.projects.find((p) => p.id === it.projectId)?.name ?? 'No project';
      const prev = totals.get(key);
      totals.set(key, { label, minutes: (prev?.minutes ?? 0) + it.minutes });
    }
  }
  const rows = [...totals.values()].sort((a, b) => b.minutes - a.minutes);
  return { rows, untracked: Math.max(0, all - tracked) };
}

/** Job applications per week (weeks start Monday), oldest first. */
export function jobsPerWeek(s: State, today: DateKey, weeks = 8) {
  const monday = addDays(today, -((fromKey(today).getDay() + 6) % 7));
  return Array.from({ length: weeks }, (_, i) => {
    const start = addDays(monday, -7 * (weeks - 1 - i));
    const end = addDays(start, 6);
    return { date: start, value: s.jobs.filter((j) => j.appliedOn >= start && j.appliedOn <= end).length };
  });
}

/** Headline numbers for the range, with the same-length period before it for comparison. */
export function headline(s: State, today: DateKey, n: number) {
  const now = lastDays(n, today);
  const before = lastDays(n, addDays(today, -n));
  const sum = (xs: DayPoint[]) => xs.reduce((a, x) => a + x.value, 0);
  const moods = moodSeries(s, now, today).flatMap((m) => (m.value ? [m.value] : []));
  const rates = habitRates(s, today, n);
  return {
    focus: sum(focusSeries(s, now)),
    focusBefore: sum(focusSeries(s, before)),
    tasks: sum(tasksSeries(s, now, today)),
    tasksBefore: sum(tasksSeries(s, before, today)),
    mood: moods.length ? moods.reduce((a, b) => a + b, 0) / moods.length : null,
    habits: rates.length ? rates.reduce((a, r) => a + r.rate, 0) / rates.length : null,
    jobs: s.jobs.filter((j) => j.appliedOn >= now[0]).length,
  };
}
