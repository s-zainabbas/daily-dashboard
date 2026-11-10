import { beforeEach, describe, expect, it } from 'vitest';
import { today } from './date';
import { actions, getState, replaceState } from './store';
import { emptyState } from './store';

describe('repeating tasks in the store', () => {
  beforeEach(() => replaceState(emptyState()));

  it('completing one adds the next copy, and unticking removes it', () => {
    const t = actions.addTask({ title: 'Vitamins', dueDate: today(), repeat: { freq: 'daily' } });
    const next = actions.toggleTask(t.id);
    expect(next).toBeDefined();
    expect(next!.dueDate! > today()).toBe(true);
    expect(next!.seriesId).toBe(t.id);
    expect(getState().tasks.filter((x) => !x.done).map((x) => x.id)).toEqual([next!.id]);

    actions.toggleTask(t.id); // undo
    expect(getState().tasks.map((x) => x.id)).toEqual([t.id]);
    expect(getState().tasks[0].done).toBe(false);
  });

  it('completing the same copy twice never adds two', () => {
    const t = actions.addTask({ title: 'Stretch', dueDate: today(), repeat: { freq: 'daily' } });
    actions.toggleTask(t.id);
    actions.toggleTask(t.id);
    actions.toggleTask(t.id);
    expect(getState().tasks.filter((x) => !x.done)).toHaveLength(1);
  });

  it('skip moves the date on without completing', () => {
    const t = actions.addTask({ title: 'Inbox', dueDate: today(), repeat: { freq: 'daily' } });
    const due = actions.skipTask(t.id);
    expect(getState().tasks).toHaveLength(1);
    expect(getState().tasks[0]).toMatchObject({ done: false, dueDate: due });
  });

  it('ordinary tasks still toggle as before', () => {
    const t = actions.addTask({ title: 'Once' });
    expect(actions.toggleTask(t.id)).toBeUndefined();
    expect(getState().tasks).toHaveLength(1);
  });
});
