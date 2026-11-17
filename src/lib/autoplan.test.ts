import { describe, expect, it } from 'vitest';
import { autoPlan, freeSlots, workload } from './autoplan';
import type { CalEvent, Task } from './types';

const D = '2026-11-17';
let n = 0;
const task = (title: string, p: Partial<Task> = {}): Task => ({ id: `t${++n}`, title, done: false, priority: 'med', dueDate: D, createdAt: 0, ...p });
const ev = (start: string, end: string, p: Partial<CalEvent> = {}): CalEvent => ({ id: `e${++n}`, title: 'Meeting', date: D, start, end, ...p });

describe('auto-plan', () => {
  it('finds free stretches between events', () => {
    expect(freeSlots([[600, 660], [720, 780]], 540, 1020)).toEqual([[540, 600], [660, 720], [780, 1020]]);
  });

  it('puts tasks into gaps around meetings, #1 first, with a breather after each', () => {
    const tasks = [task('Email', { priority: 'low', estimate: 15 }), task('Write spec', { estimate: 60 }), task('Ship onboarding', { estimate: 45 })];
    const { blocks, unplaced } = autoPlan({ tasks, events: [ev('10:00', '11:00')], day: D, fromMin: 9 * 60, priorityTitle: 'Ship onboarding' });
    expect(unplaced).toEqual([]);
    expect(blocks.map((b) => [b.title, b.start, b.end])).toEqual([
      ['Ship onboarding', '09:00', '09:45'],
      ['Write spec', '11:05', '12:05'],
      ['Email', '12:10', '12:25'],
    ]);
  });

  it('puts high-priority work in your best focus hours', () => {
    const { blocks } = autoPlan({ tasks: [task('Deep work', { priority: 'high', estimate: 90 }), task('Admin', { estimate: 30 })], events: [], day: D, fromMin: 8 * 60, best: [14, 16] });
    expect(blocks.map((b) => [b.title, b.start])).toEqual([
      ['Admin', '08:00'],
      ['Deep work', '14:00'],
    ]);
  });

  it('skips tasks already blocked and reports what does not fit', () => {
    const blockedTask = task('Already blocked');
    const big = task('Huge', { estimate: 240 });
    const { blocks, unplaced } = autoPlan({ tasks: [blockedTask, big], events: [ev('09:00', '09:30', { taskId: blockedTask.id })], day: D, fromMin: 17 * 60 });
    expect(blocks).toEqual([]);
    expect(unplaced.map((t) => t.title)).toEqual(['Huge']);
  });

  it('starts from now, rounded up to the quarter hour', () => {
    const { blocks } = autoPlan({ tasks: [task('A')], events: [], day: D, fromMin: 9 * 60 + 7 });
    expect(blocks[0].start).toBe('09:15');
  });

  it('adds up planned work that has no time block yet', () => {
    const a = task('A', { estimate: 120 });
    const b = task('B', { estimate: 60 });
    expect(workload([a, b, task('Later', { dueDate: '2026-11-20', estimate: 300 })], [ev('09:00', '10:00', { taskId: b.id })], D)).toBe(120);
  });
});
