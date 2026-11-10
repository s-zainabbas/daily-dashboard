import { beforeEach, describe, expect, it } from 'vitest';
import { actions, emptyState, getState, replaceState } from './store';

describe('undo', () => {
  beforeEach(() => replaceState(emptyState()));

  it('undoing a project delete keeps the same id, so its tasks stay linked', () => {
    actions.saveProject({ name: 'A', status: 'track', nextAction: '', details: '', progress: 0 });
    actions.saveProject({ name: 'B', status: 'track', nextAction: '', details: '', progress: 0 });
    const [a, b] = getState().projects;
    actions.addTask({ title: 'Linked', projectId: a.id });
    const undo = actions.removeProject(a.id);
    expect(getState().projects.map((p) => p.name)).toEqual(['B']);
    undo();
    expect(getState().projects.map((p) => p.id)).toEqual([a.id, b.id]);
    expect(getState().tasks[0].projectId).toBe(a.id);
  });

  it('undoing "Clear completed" puts tasks back in their original order', () => {
    for (const t of ['one', 'two', 'three', 'four']) actions.addTask({ title: t }); // newest first: four, three, two, one
    const id = (t: string) => getState().tasks.find((x) => x.title === t)!.id;
    actions.toggleTask(id('three'));
    actions.toggleTask(id('one'));
    const undo = actions.clearCompleted();
    expect(getState().tasks.map((t) => t.title)).toEqual(['four', 'two']);
    actions.addTask({ title: 'new' });
    undo();
    expect(getState().tasks.map((t) => t.title)).toEqual(['new', 'four', 'three', 'two', 'one']);
    expect(getState().tasks.find((t) => t.title === 'three')!.done).toBe(true);
  });
});

describe('reorder', () => {
  beforeEach(() => replaceState(emptyState()));
  it('sets the order and can move the dragged task to another day', () => {
    const a = actions.addTask({ title: 'a' });
    const b = actions.addTask({ title: 'b', dueDate: '2030-01-01' });
    actions.reorderTasks([b.id, a.id], { id: b.id, patch: { dueDate: undefined } });
    const byId = Object.fromEntries(getState().tasks.map((t) => [t.title, t]));
    expect(byId.b).toMatchObject({ order: 0 });
    expect(byId.b.dueDate).toBeUndefined();
    expect(byId.a.order).toBe(1);
  });
});
