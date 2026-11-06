import { useMemo, useState } from 'react';
import { Check, CheckCircle2, Folder, Hourglass, ListTodo, Pencil, Play, Plus, Star, Trash2 } from 'lucide-react';
import { dateKey, dueLabel, today } from '../lib/date';
import { actions, useStore } from '../lib/store';
import { timerActions } from '../lib/timer';
import type { Priority, Task } from '../lib/types';
import { Card, Dialog, DialogHead, Empty, Segmented, toast } from './ui';

type Filter = 'all' | 'today' | 'upcoming' | 'waiting';
const FILTER_KEY = 'daily-dashboard:task-filter';
const rank: Record<Priority, number> = { high: 0, med: 1, low: 2 };
const byPriority = (a: Task, b: Task) => rank[a.priority] - rank[b.priority] || (a.dueDate ?? '9').localeCompare(b.dueDate ?? '9');

function readFilter(): Filter {
  try {
    const f = localStorage.getItem(FILTER_KEY) as Filter | null;
    return f && ['all', 'today', 'upcoming', 'waiting'].includes(f) ? f : 'all';
  } catch {
    return 'all';
  }
}

export function Tasks({ editRequest }: { editRequest?: { id?: string; n: number } }) {
  const tasks = useStore((s) => s.tasks);
  const projects = useStore((s) => s.projects);
  const [filter, setFilterState] = useState<Filter>(readFilter);
  const [showDone, setShowDone] = useState(true);
  const [editing, setEditing] = useState<Task | 'new' | null>(null);
  const [lastReq, setLastReq] = useState(0);
  const t = today();

  // Allow the command palette to open the editor.
  if (editRequest && editRequest.n !== lastReq) {
    setLastReq(editRequest.n);
    setEditing(editRequest.id ? tasks.find((x) => x.id === editRequest.id) ?? null : 'new');
  }

  const setFilter = (f: Filter) => {
    setFilterState(f);
    try {
      localStorage.setItem(FILTER_KEY, f);
    } catch {
      /* optional */
    }
  };

  const groups = useMemo(() => {
    const open = tasks.filter((x) => !x.done);
    const active = open.filter((x) => !x.waitingOn);
    const overdue = active.filter((x) => x.dueDate && x.dueDate < t).sort(byPriority);
    const dueToday = active.filter((x) => x.dueDate === t).sort(byPriority);
    const upcoming = active.filter((x) => x.dueDate && x.dueDate > t).sort((a, b) => a.dueDate!.localeCompare(b.dueDate!) || byPriority(a, b));
    const someday = active.filter((x) => !x.dueDate).sort(byPriority);
    const waiting = open.filter((x) => x.waitingOn);
    const done = tasks
      .filter((x) => x.done)
      .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
    const doneToday = done.filter((x) => x.completedAt && dateKey(new Date(x.completedAt)) === t);
    return { overdue, dueToday, upcoming, someday, waiting, done, doneToday };
  }, [tasks, t]);

  const sections: { title: string; items: Task[] }[] =
    filter === 'today'
      ? [
          { title: 'Overdue', items: groups.overdue },
          { title: 'Today', items: groups.dueToday },
        ]
      : filter === 'upcoming'
        ? [{ title: 'Upcoming', items: groups.upcoming }]
        : filter === 'waiting'
          ? [{ title: 'Waiting on others', items: groups.waiting }]
          : [
              { title: 'Overdue', items: groups.overdue },
              { title: 'Today', items: groups.dueToday },
              { title: 'Upcoming', items: groups.upcoming },
              { title: 'Anytime', items: groups.someday },
              { title: 'Waiting on others', items: groups.waiting },
            ];
  const visible = sections.filter((s) => s.items.length);
  const done = filter === 'all' ? groups.done.slice(0, 12) : filter === 'today' ? groups.doneToday : [];
  const projectName = (id?: string) => projects.find((p) => p.id === id)?.name;

  return (
    <Card
      title="Tasks"
      icon={<ListTodo size={16} />}
      meta={`${groups.overdue.length + groups.dueToday.length + groups.upcoming.length + groups.someday.length} open`}
      actions={
        <button className="icon-btn sm" onClick={() => setEditing('new')} aria-label="New task" title="New task">
          <Plus size={16} />
        </button>
      }
    >
      <div className="task-tools">
        <Segmented
          label="Filter tasks"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'today', label: 'Today', count: groups.overdue.length + groups.dueToday.length },
            { value: 'upcoming', label: 'Upcoming', count: groups.upcoming.length },
            { value: 'waiting', label: 'Waiting', count: groups.waiting.length },
          ]}
        />
      </div>

      {visible.length === 0 && done.length === 0 ? (
        <Empty icon={<CheckCircle2 size={28} />} title={filter === 'waiting' ? 'Nothing blocked on anyone' : 'Nothing here'}>
          {filter === 'waiting' ? 'Add a task and set “waiting on” to track hand-offs.' : 'Use the quick-add bar above, or press N.'}
        </Empty>
      ) : (
        <div className="task-list">
          {visible.map((s) => (
            <div key={s.title}>
              {(visible.length > 1 || filter === 'all') && <div className="task-section">{s.title}</div>}
              {s.items.map((x) => (
                <TaskRow key={x.id} task={x} project={projectName(x.projectId)} onEdit={() => setEditing(x)} />
              ))}
            </div>
          ))}
          {done.length > 0 && (
            <div>
              <div className="task-section">
                Completed {filter === 'today' ? 'today' : ''} · {done.length}
                <button onClick={() => setShowDone((v) => !v)}>{showDone ? 'Hide' : 'Show'}</button>
                {filter === 'all' && showDone && (
                  <button
                    onClick={() => {
                      const before = tasks;
                      actions.clearCompleted();
                      toast('Cleared completed tasks', { label: 'Undo', run: () => before.filter((x) => x.done).forEach((x) => actions.addTask(x)) });
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>
              {showDone && done.map((x) => <TaskRow key={x.id} task={x} project={projectName(x.projectId)} onEdit={() => setEditing(x)} />)}
            </div>
          )}
        </div>
      )}

      <TaskEditor task={editing} onClose={() => setEditing(null)} />
    </Card>
  );
}

function TaskRow({ task, project, onEdit }: { task: Task; project?: string; onEdit: () => void }) {
  const t = today();
  const overdue = !task.done && task.dueDate && task.dueDate < t;
  return (
    <div className={`task ${task.done ? 'done' : ''}`}>
      <button
        className={`check ${task.done ? 'on' : ''}`}
        data-p={task.priority}
        role="checkbox"
        aria-checked={task.done}
        aria-label={`Mark “${task.title}” ${task.done ? 'not done' : 'done'}`}
        onClick={() => actions.toggleTask(task.id)}
      >
        <Check size={13} strokeWidth={3} />
      </button>
      <div className="task-title" onDoubleClick={onEdit}>
        <p>{task.title}</p>
        {(task.dueDate || task.waitingOn || project || task.priority === 'high') && !task.done && (
          <div className="task-meta">
            {task.priority === 'high' && <span className="chip high">High</span>}
            {task.dueDate && <span className={`chip ${overdue ? 'overdue' : task.dueDate === t ? 'accent' : ''}`}>{dueLabel(task.dueDate)}</span>}
            {task.waitingOn && (
              <span className="chip">
                <Hourglass size={10} /> {task.waitingOn}
              </span>
            )}
            {project && (
              <span className="chip">
                <Folder size={10} /> {project}
              </span>
            )}
          </div>
        )}
      </div>
      <div className="task-actions">
        {!task.done && (
          <>
            <button
              className="icon-btn sm task-extra"
              title="Make this today’s #1 priority"
              aria-label="Make this today’s number one priority"
              onClick={() => {
                actions.setPriority({ title: task.title, done: false });
                toast('Set as today’s #1 priority');
              }}
            >
              <Star size={14} />
            </button>
            <button
              className="icon-btn sm task-extra"
              title="Start a focus session on this"
              aria-label="Start a focus session on this task"
              onClick={() => {
                timerActions.setMode('focus');
                timerActions.setTask(task.id);
                timerActions.start();
                toast(`Focusing on “${task.title}”`);
              }}
            >
              <Play size={14} />
            </button>
          </>
        )}
        <button className="icon-btn sm" title="Edit" aria-label="Edit task" onClick={onEdit}>
          <Pencil size={14} />
        </button>
        <button
          className="icon-btn sm task-extra"
          title="Delete"
          aria-label="Delete task"
          onClick={() => {
            const undo = actions.removeTask(task.id);
            toast('Task deleted', { label: 'Undo', run: undo });
          }}
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

function TaskEditor({ task, onClose }: { task: Task | 'new' | null; onClose: () => void }) {
  const projects = useStore((s) => s.projects);
  const isNew = task === 'new';
  const init = task && task !== 'new' ? task : undefined;
  const [form, setForm] = useState({ title: '', notes: '', dueDate: '', priority: 'med' as Priority, waitingOn: '', projectId: '' });
  const [forTask, setForTask] = useState<unknown>(null);
  if (task !== forTask) {
    setForTask(task);
    setForm({
      title: init?.title ?? '',
      notes: init?.notes ?? '',
      dueDate: init?.dueDate ?? (isNew ? today() : ''),
      priority: init?.priority ?? 'med',
      waitingOn: init?.waitingOn ?? '',
      projectId: init?.projectId ?? '',
    });
  }
  const set = (p: Partial<typeof form>) => setForm((f) => ({ ...f, ...p }));

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    const data = {
      title: form.title.trim(),
      notes: form.notes.trim() || undefined,
      dueDate: form.dueDate || undefined,
      priority: form.priority,
      waitingOn: form.waitingOn.trim() || undefined,
      projectId: form.projectId || undefined,
    };
    if (init) actions.updateTask(init.id, data);
    else actions.addTask(data);
    onClose();
  }

  return (
    <Dialog open={!!task} onClose={onClose} label={isNew ? 'New task' : 'Edit task'}>
      <DialogHead title={isNew ? 'New task' : 'Edit task'} onClose={onClose} />
      <form className="modal-body" onSubmit={save}>
        <label className="field">
          <span>Task</span>
          <input className="input" autoFocus required value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="What needs doing?" />
        </label>
        <div className="row">
          <label className="field">
            <span>Due date</span>
            <input className="input" type="date" value={form.dueDate} onChange={(e) => set({ dueDate: e.target.value })} />
          </label>
          <div className="field">
            <span>Priority</span>
            <Segmented
              label="Priority"
              value={form.priority}
              onChange={(v) => set({ priority: v })}
              options={[
                { value: 'low', label: 'Low' },
                { value: 'med', label: 'Med' },
                { value: 'high', label: 'High' },
              ]}
            />
          </div>
        </div>
        <div className="row">
          <label className="field">
            <span>Waiting on</span>
            <input className="input" value={form.waitingOn} onChange={(e) => set({ waitingOn: e.target.value })} placeholder="Person or team (optional)" />
          </label>
          <label className="field">
            <span>Project</span>
            <select className="select input" value={form.projectId} onChange={(e) => set({ projectId: e.target.value })}>
              <option value="">None</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="field">
          <span>Notes</span>
          <textarea className="textarea" rows={3} value={form.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Links, context, sub-steps…" />
        </label>
        <div className="modal-foot">
          {init && (
            <button
              type="button"
              className="btn ghost danger"
              onClick={() => {
                const undo = actions.removeTask(init.id);
                toast('Task deleted', { label: 'Undo', run: undo });
                onClose();
              }}
            >
              <Trash2 size={14} /> Delete
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary">{isNew ? 'Add task' : 'Save'}</button>
        </div>
      </form>
    </Dialog>
  );
}
