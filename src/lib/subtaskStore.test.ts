import { beforeEach, describe, expect, it } from 'vitest';
import { today } from './date';
import { actions, emptyState, getState, replaceState } from './store';

const task = () => getState().tasks[0];

describe('task checklists', () => {
  beforeEach(() => replaceState(emptyState()));

  it('adds steps, skipping blank lines', () => {
    const t = actions.addTask({ title: 'Launch' });
    actions.addSubtasks(t.id, ['Write post', '  ', 'Schedule tweet ']);
    expect(task().subtasks!.map((x) => [x.title, x.done])).toEqual([
      ['Write post', false],
      ['Schedule tweet', false],
    ]);
  });

  it('reports when the last open step is ticked', () => {
    const t = actions.addTask({ title: 'Launch' });
    actions.addSubtasks(t.id, ['A', 'B']);
    const [a, b] = task().subtasks!;
    expect(actions.toggleSubtask(t.id, a.id)).toBe(false);
    expect(actions.toggleSubtask(t.id, b.id)).toBe(true);
    expect(actions.toggleSubtask(t.id, b.id)).toBe(false); // unticking isn't "finished"
  });

  it('removing the last step clears the checklist', () => {
    const t = actions.addTask({ title: 'Launch' });
    actions.addSubtasks(t.id, ['A']);
    actions.removeSubtask(t.id, task().subtasks![0].id);
    expect(task().subtasks).toBeUndefined();
  });

  it('the next copy of a repeating task starts with a fresh checklist', () => {
    const t = actions.addTask({ title: 'Weekly review', dueDate: today(), repeat: { freq: 'weekly' } });
    actions.addSubtasks(t.id, ['Inbox zero', 'Plan next week']);
    for (const x of task().subtasks!) actions.toggleSubtask(t.id, x.id);
    const next = actions.toggleTask(t.id)!;
    expect(next.subtasks!.every((x) => !x.done)).toBe(true);
    expect(getState().tasks.find((x) => x.id === t.id)!.subtasks!.every((x) => x.done)).toBe(true);
  });
});
