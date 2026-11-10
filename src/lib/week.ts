import { addDays, fromKey } from './date';
import type { DateKey, State } from './types';

/** The weekly review: which week it plans, and when to suggest it. */

export const mondayOf = (d: DateKey) => addDays(d, -((fromKey(d).getDay() + 6) % 7));

/** Weekend reviews plan next week; Monday–Friday reviews plan this one. */
export const targetWeek = (today: DateKey) => {
  const day = fromKey(today).getDay();
  return day === 0 || day === 6 ? addDays(mondayOf(today), 7) : mondayOf(today);
};

/** Goals for the week you're in, if you set any. */
export const thisWeeksGoals = (s: State, today: DateKey) => (s.week?.key === mondayOf(today) ? s.week.goals : []);

/** Friday from 3pm through Monday noon, until the review for that week is done. */
export function reviewDue(s: State, now: Date, today: DateKey): boolean {
  const day = now.getDay();
  const h = now.getHours();
  const window = (day === 5 && h >= 15) || day === 6 || day === 0 || (day === 1 && h < 12);
  if (!window) return false;
  // Friday afternoon plans next week too.
  const target = day === 5 ? addDays(mondayOf(today), 7) : targetWeek(today);
  return !(s.week?.key === target && s.week.reviewedOn);
}
