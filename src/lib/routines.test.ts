import { describe, expect, it } from 'vitest';
import { parseSteps, routineOn, routineProgress, stepsText } from './routines';

let n = 0;
const uid = () => `s${++n}`;

describe('routines', () => {
  it('reads one step per line, with an optional time at the end', () => {
    const steps = parseSteps('- Drink water 1m\nStretch 10 min\nWalk 1h\nMeditate\n\nJournal, 5', uid);
    expect(steps.map((s) => [s.title, s.minutes])).toEqual([
      ['Drink water', 1],
      ['Stretch', 10],
      ['Walk', 60],
      ['Meditate', undefined],
      ['Journal', 5],
    ]);
    expect(stepsText(steps)).toBe('Drink water 1m\nStretch 10m\nWalk 60m\nMeditate\nJournal 5m');
  });

  it('keeps numbers that are part of the step', () => {
    const [step] = parseSteps('Do 20 push-ups', uid);
    expect(step.title).toBe('Do 20 push-ups');
    expect(step.minutes).toBeUndefined();
  });

  it('tracks progress per day and which days it runs', () => {
    const r = { id: 'r', name: 'Morning', createdAt: 0, days: [1, 2, 3, 4, 5], steps: [{ id: 'a', title: 'A', minutes: 5 }, { id: 'b', title: 'B' }], log: { '2026-11-17': ['a'] } };
    expect(routineProgress(r, '2026-11-17')).toMatchObject({ n: 1, total: 2, complete: false, minutes: 5 });
    expect(routineOn(r, '2026-11-17')).toBe(true); // Tuesday
    expect(routineOn(r, '2026-11-21')).toBe(false); // Saturday
  });
});
