import { useEffect, useMemo, useState } from 'react';
import { AlarmClock, Bell, Check, CheckCircle2, ChevronDown, Clock, GripVertical, Folder, ListChecks, X, Hourglass, ListTodo, Pencil, Play, Plus, Repeat as RepeatIcon, SkipForward, Star, Trash2 } from 'lucide-react';
import { addDays, dateKey, dueLabel, dueLabelInline, formatDuration, formatTime, fromKey, today } from '../lib/date';
import { askForNotifications } from '../lib/useReminders';
import { nextWeek } from '../lib/plan';
import { parseQuick, splitSteps } from '../lib/parse';
import { anchored, DAY_SHORT, firstDue, MON_FIRST, nextDue, repeatLabel } from '../lib/repeat';
import { actions, uid, useStore } from '../lib/store';
import { timerActions } from '../lib/timer';
import type { Priority, Repeat, RepeatFreq, Subtask, Task } from '../lib/types';
import { Card, Dialog, DialogHead, Empty, Segmented, toast } from './ui';

type Filter = 'all' | 'today' | 'upcoming' | 'waiting';
const FILTER_KEY = 'daily-dashboard:task-filter';
const rank: Record<Priority, number> = { high: 0, med: 1, low: 2 };
// Your dragged order comes first; tasks you haven't placed go after, by priority.
const byPriority = (a: Task, b: Task) =>
  (a.order ?? 1e9) - (b.order ?? 1e9) || rank[a.priority] - rank[b.priority] || (a.dueDate ?? '9').localeCompare(b.dueDate ?? '9');

function readFilter(): Filter {
  try {
    const f = localStorage.getItem(FILTER_KEY) as Filter | null;
    return f && ['all', 'today', 'upcoming', 'waiting'].includes(f) ? f : 'all';
  } catch {
    return 'all';
  }
}

export function Tasks({ editRequest = 0, onRequestHandled, todayOnly = false, projectId }: {
  editRequest?: number;
  onRequestHandled?: () => void;
  /** On the Today tab: just overdue and today's tasks, with a link to the full list. */
  todayOnly?: boolean;
  /** Only this project's tasks; new tasks are added to it. */
  projectId?: string;
}) {
  const allTasks = useStore((s) => s.tasks);
  const tasks = useMemo(() => (projectId ? allTasks.filter((t) => t.projectId === projectId) : allTasks), [allTasks, projectId]);
  const projects = useStore((s) => s.projects);
  // A project's own list starts on "All" and doesn't change the main Tasks filter.
  const [savedFilter, setFilterState] = useState<Filter>(() => (projectId ? 'all' : readFilter()));
  const filter: Filter = todayOnly ? 'today' : savedFilter;
  const [showDone, setShowDone] = useState(true);
  const [editing, setEditing] = useState<Task | 'new' | null>(null);
  const t = today();

  // N / the command menu ask for a new task. Also runs on mount, after switching to a tab that has this panel.
  useEffect(() => {
    if (!editRequest) return;
    setEditing('new');
    onRequestHandled?.();
  }, [editRequest, onRequestHandled]);

  const setFilter = (f: Filter) => {
    setFilterState(f);
    if (projectId) return;
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

  // Drag to reorder. Dropping into another group moves the date: Today → today, Anytime → no date.
  const [drag, setDrag] = useState<{ id: string; from: string } | null>(null);
  const [over, setOver] = useState<{ id: string; after: boolean } | null>(null);
  const canDrop = (to: string) =>
    !!drag && (drag.from === to || to === 'Today' || to === 'Anytime' || (to === 'Upcoming' && drag.from !== 'Waiting on others'));
  const drop = (section: { title: string; items: Task[] }, targetId: string, after: boolean) => {
    if (!drag || !canDrop(section.title)) return;
    const ids = section.items.map((x) => x.id).filter((id) => id !== drag.id);
    const at = ids.indexOf(targetId);
    ids.splice(at < 0 ? ids.length : at + (after ? 1 : 0), 0, drag.id);
    const dragged = tasks.find((x) => x.id === drag.id);
    const patch: Partial<Task> =
      section.title === drag.from || !dragged
        ? {}
        : section.title === 'Today'
          ? { dueDate: t }
          : section.title === 'Anytime'
            ? { dueDate: undefined }
            : { dueDate: dragged.dueDate && dragged.dueDate > t ? dragged.dueDate : addDays(t, 1) };
    actions.reorderTasks(ids, { id: drag.id, patch });
    if (patch.dueDate !== undefined || 'dueDate' in patch) toast(`Moved to ${section.title.toLowerCase()}`);
  };
  const todayMinutes = [...groups.overdue, ...groups.dueToday].reduce((n, x) => n + (x.estimate ?? 0), 0);
  const done = filter === 'all' ? groups.done.slice(0, 12) : filter === 'today' ? groups.doneToday : [];
  const projectName = (id?: string) => projects.find((p) => p.id === id)?.name;

  return (
    <Card
      title="Tasks"
      icon={<ListTodo size={16} />}
      meta={
        todayOnly
          ? `${groups.overdue.length + groups.dueToday.length} for today${todayMinutes ? ` · ~${formatDuration(todayMinutes)}` : ''}`
          : `${groups.overdue.length + groups.dueToday.length + groups.upcoming.length + groups.someday.length} open`
      }
      actions={
        <>
          {todayOnly && (
            <a className="btn sm ghost" href="#tasks">
              All tasks →
            </a>
          )}
          <button className="icon-btn sm" onClick={() => setEditing('new')} aria-label="New task" title="New task">
            <Plus size={16} />
          </button>
        </>
      }
    >
      {!todayOnly && (
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
      )}

      {visible.length === 0 && done.length === 0 ? (
        <Empty icon={<CheckCircle2 size={28} />} title={filter === 'waiting' ? 'Nothing blocked on anyone' : todayOnly ? 'Nothing due today' : 'Nothing here'}>
          {filter === 'waiting'
            ? 'Add a task and set “waiting on” to track hand-offs.'
            : todayOnly
              ? 'Press P to plan your day, or pull something in from All tasks.'
              : projectId
                ? 'No tasks in this project yet. Add the first one below.'
                : 'Use the quick-add bar above, or press N.'}
        </Empty>
      ) : (
        <div className="task-list">
          {visible.map((s) => (
            <div key={s.title}>
              {(visible.length > 1 || filter === 'all') && <div className="task-section">{s.title}</div>}
              {s.items.map((x) => (
                <TaskRow
                  key={x.id}
                  task={x}
                  project={projectId ? undefined : projectName(x.projectId)}
                  onEdit={() => setEditing(x)}
                  drag={{
                    dragging: drag?.id === x.id,
                    dropHint: over?.id === x.id && drag?.id !== x.id ? (over.after ? 'after' : 'before') : undefined,
                    onStart: () => setDrag({ id: x.id, from: s.title }),
                    onEnd: () => {
                      setDrag(null);
                      setOver(null);
                    },
                    onOver: (after) => {
                      if (!canDrop(s.title)) return false;
                      if (over?.id !== x.id || over.after !== after) setOver({ id: x.id, after });
                      return true;
                    },
                    onDrop: (after) => drop(s, x.id, after),
                  }}
                />
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
                      const undo = actions.clearCompleted();
                      toast('Cleared completed tasks', { label: 'Undo', run: undo });
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>
              {showDone && done.map((x) => <TaskRow key={x.id} task={x} project={projectId ? undefined : projectName(x.projectId)} onEdit={() => setEditing(x)} />)}
            </div>
          )}
        </div>
      )}

      {projectId && <ProjectQuickAdd projectId={projectId} />}
      <TaskEditor task={editing} onClose={() => setEditing(null)} defaultProjectId={projectId} />
    </Card>
  );
}

interface RowDrag {
  dragging: boolean;
  dropHint?: 'before' | 'after';
  onStart: () => void;
  onEnd: () => void;
  /** Return false when this row can't take the drop. */
  onOver: (after: boolean) => boolean;
  onDrop: (after: boolean) => void;
}

function TaskRow({ task, project, onEdit, drag }: { task: Task; project?: string; onEdit: () => void; drag?: RowDrag }) {
  const t = today();
  const use24h = useStore((x) => x.settings.use24h);
  const overdue = !task.done && task.dueDate && task.dueDate < t;
  const steps = task.subtasks ?? [];
  const stepsDone = steps.filter((x) => x.done).length;
  const [open, setOpen] = useState(false);
  return (
    <div
      className={`task ${task.done ? 'done' : ''} ${drag?.dragging ? 'dragging' : ''} ${drag?.dropHint ? `drop-${drag.dropHint}` : ''}`}
      draggable={!!drag && !task.done}
      onDragStart={(e) => {
        if (!drag || (e.target as HTMLElement).closest('input, textarea')) return;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', task.title);
        drag.onStart();
      }}
      onDragEnd={() => drag?.onEnd()}
      onDragOver={(e) => {
        if (!drag) return;
        const r = e.currentTarget.getBoundingClientRect();
        if (drag.onOver(e.clientY > r.top + r.height / 2)) e.preventDefault();
      }}
      onDrop={(e) => {
        if (!drag) return;
        e.preventDefault();
        const r = e.currentTarget.getBoundingClientRect();
        drag.onDrop(e.clientY > r.top + r.height / 2);
        drag.onEnd();
      }}
    >
      {drag && !task.done && (
        <span className="grip" aria-hidden>
          <GripVertical size={13} />
        </span>
      )}
      <button
        className={`check ${task.done ? 'on' : ''}`}
        data-p={task.priority}
        role="checkbox"
        aria-checked={task.done}
        aria-label={`Mark “${task.title}” ${task.done ? 'not done' : 'done'}`}
        onClick={() => {
          const next = actions.toggleTask(task.id);
          if (next?.dueDate) toast(`Done · next one ${dueLabelInline(next.dueDate)}`, { label: 'Undo', run: () => actions.toggleTask(task.id) });
        }}
      >
        <Check size={13} strokeWidth={3} />
      </button>
      <div className="task-title" onDoubleClick={onEdit}>
        <p>{task.title}</p>
        {(task.dueDate || task.waitingOn || project || task.repeat || task.estimate || task.remindAt || steps.length > 0 || task.priority === 'high') && !task.done && (
          <div className="task-meta">
            {steps.length > 0 && (
              <button
                type="button"
                className={`chip steps-chip ${stepsDone === steps.length ? 'accent' : ''}`}
                aria-expanded={open}
                aria-label={`${stepsDone} of ${steps.length} steps done. ${open ? 'Hide' : 'Show'} steps`}
                onClick={() => setOpen((v) => !v)}
              >
                <ListChecks size={11} /> <span className="num">{stepsDone}/{steps.length}</span>
                <ChevronDown size={11} className={open ? 'flip' : ''} />
              </button>
            )}
            {task.priority === 'high' && <span className="chip high">High</span>}
            {task.dueDate && <span className={`chip ${overdue ? 'overdue' : task.dueDate === t ? 'accent' : ''}`}>{dueLabel(task.dueDate)}</span>}
            {task.remindAt && (
              <span className="chip num" title="Reminder">
                <Bell size={10} /> {formatTime(task.remindAt, use24h)}
              </span>
            )}
            {task.estimate && (
              <span className="chip num" title="Estimated time">
                <Clock size={10} /> {formatDuration(task.estimate)}
              </span>
            )}
            {task.repeat && (
              <span className="chip" title="Repeats — the next one is added when you complete this">
                <RepeatIcon size={10} /> {repeatLabel(task.repeat)}
              </span>
            )}
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
        {open && !task.done && <InlineSteps task={task} />}
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
        {!task.done && <SnoozeMenu task={task} />}
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

function TaskEditor({ task, onClose, defaultProjectId }: { task: Task | 'new' | null; onClose: () => void; defaultProjectId?: string }) {
  const projects = useStore((s) => s.projects);
  const isNew = task === 'new';
  const init = task && task !== 'new' ? task : undefined;
  const [form, setForm] = useState({ title: '', notes: '', dueDate: '', priority: 'med' as Priority, waitingOn: '', projectId: '', freq: '' as RepeatFreq | '', interval: 1, days: [] as number[], subtasks: [] as Subtask[], estimate: 0, remindAt: '' });
  const [forTask, setForTask] = useState<unknown>(null);
  if (task !== forTask) {
    setForTask(task);
    setForm({
      title: init?.title ?? '',
      notes: init?.notes ?? '',
      dueDate: init?.dueDate ?? (isNew ? today() : ''),
      priority: init?.priority ?? 'med',
      waitingOn: init?.waitingOn ?? '',
      projectId: init?.projectId ?? defaultProjectId ?? '',
      freq: init?.repeat?.freq ?? '',
      interval: init?.repeat?.interval ?? 1,
      days: init?.repeat?.days ?? [],
      subtasks: init?.subtasks ?? [],
      estimate: init?.estimate ?? 0,
      remindAt: init?.remindAt ?? '',
    });
  }
  const set = (p: Partial<typeof form>) => setForm((f) => ({ ...f, ...p }));

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    const { repeat, dueDate } = buildRepeat(form, init);
    const data = {
      title: form.title.trim(),
      notes: form.notes.trim() || undefined,
      dueDate,
      repeat,
      subtasks: cleanSteps(form.subtasks),
      estimate: form.estimate || undefined,
      remindAt: form.remindAt || undefined,
      priority: form.priority,
      waitingOn: form.waitingOn.trim() || undefined,
      projectId: form.projectId || undefined,
    };
    if (data.remindAt && data.remindAt !== init?.remindAt) askForNotifications();
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
            <span>Remind me at</span>
            <input className="input" type="time" value={form.remindAt} onChange={(e) => set({ remindAt: e.target.value })} />
          </label>
          <label className="field">
            <span>Estimate</span>
            <select className="select input" value={form.estimate} onChange={(e) => set({ estimate: Number(e.target.value) })}>
              {ESTIMATES.includes(form.estimate) ? null : <option value={form.estimate}>{formatDuration(form.estimate)}</option>}
              {ESTIMATES.map((m) => (
                <option key={m} value={m}>
                  {m ? formatDuration(m) : 'No estimate'}
                </option>
              ))}
            </select>
          </label>
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
        <ChecklistField steps={form.subtasks} onChange={(subtasks) => set({ subtasks })} />
        <RepeatField form={form} set={set} />
        <label className="field">
          <span>Notes</span>
          <textarea className="textarea" rows={3} value={form.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Links, context…" />
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
          {init?.repeat && !init.done && (
            <button
              type="button"
              className="btn ghost"
              title="Move this to the next date without completing it"
              onClick={() => {
                const before = init.dueDate;
                const due = actions.skipTask(init.id);
                if (due) toast(`Skipped · next one ${dueLabelInline(due)}`, { label: 'Undo', run: () => actions.updateTask(init.id, { dueDate: before }) });
                onClose();
              }}
            >
              <SkipForward size={14} /> Skip
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

const ESTIMATES = [0, 5, 10, 15, 30, 45, 60, 90, 120, 180, 240];

/* ---------- Repeat ---------- */

type RepeatForm = { freq: RepeatFreq | ''; interval: number; days: number[]; dueDate: string };

const FREQS: { value: RepeatFreq | ''; label: string; unit?: string }[] = [
  { value: '', label: 'Doesn’t repeat' },
  { value: 'daily', label: 'Daily', unit: 'day' },
  { value: 'weekdays', label: 'Every weekday (Mon–Fri)' },
  { value: 'weekly', label: 'Weekly', unit: 'week' },
  { value: 'monthly', label: 'Monthly', unit: 'month' },
  { value: 'yearly', label: 'Yearly', unit: 'year' },
];

/** Turn the editor's repeat fields into a rule, and pick a due date that fits it. */
function buildRepeat(form: RepeatForm, init?: Task): { repeat?: Repeat; dueDate?: string } {
  if (!form.freq) return { repeat: undefined, dueDate: form.dueDate || undefined };
  const interval = Math.max(1, Math.min(99, Math.floor(form.interval) || 1));
  let repeat: Repeat = { freq: form.freq };
  if (interval > 1 && form.freq !== 'weekdays') repeat.interval = interval;
  if (form.freq === 'weekly' && form.days.length) repeat.days = [...form.days].sort();
  // A repeating task needs a date: start from the chosen one (or today) and move to the first day that fits.
  const dueDate = firstDue(repeat, form.dueDate || today());
  // Keep the monthly anchor (e.g. the 31st) unless the date or rule was changed.
  const keepAnchor = init?.repeat?.monthDay && init.repeat.freq === form.freq && init.dueDate === form.dueDate;
  repeat = keepAnchor ? { ...repeat, monthDay: init!.repeat!.monthDay } : anchored(repeat, dueDate);
  return { repeat, dueDate };
}

function RepeatField({ form, set }: { form: RepeatForm; set: (p: Partial<RepeatForm>) => void }) {
  const unit = FREQS.find((f) => f.value === form.freq)?.unit;
  const preview = form.freq ? buildRepeat(form) : undefined;
  const after = preview?.repeat && preview.dueDate ? nextDue(preview.repeat, preview.dueDate, preview.dueDate) : undefined;
  const fmt = (d: string) => fromKey(d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <div className="field repeat-field">
      <span>Repeat</span>
      <div className="repeat-row">
        <select
          className="select input"
          aria-label="Repeat"
          value={form.freq}
          onChange={(e) => {
            const freq = e.target.value as RepeatFreq | '';
            // Weekly starts on the due date's weekday, ready to add more days.
            const days = freq === 'weekly' && !form.days.length ? [fromKey(form.dueDate || today()).getDay()] : form.days;
            set({ freq, days });
          }}
        >
          {FREQS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        {unit && (
          <label className="repeat-every">
            every
            <input
              className="input num"
              type="number"
              min={1}
              max={99}
              value={form.interval}
              onChange={(e) => set({ interval: Number(e.target.value) })}
              aria-label={`Number of ${unit}s between repeats`}
            />
            {unit}
            {form.interval === 1 ? '' : 's'}
          </label>
        )}
      </div>
      {form.freq === 'weekly' && (
        <div className="segmented repeat-days" role="group" aria-label="Repeat on">
          {MON_FIRST.map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={form.days.includes(d)}
              aria-label={DAY_SHORT[d]}
              onClick={() => {
                const days = form.days.includes(d) ? form.days.filter((x) => x !== d) : [...form.days, d];
                if (days.length) set({ days });
              }}
            >
              {DAY_SHORT[d].slice(0, 2)}
            </button>
          ))}
        </div>
      )}
      {preview?.repeat && preview.dueDate && (
        <small className="repeat-hint">
          {repeatLabel(preview.repeat)} · this one {fmt(preview.dueDate)}
          {after ? `, then ${fmt(after)}` : ''}. The next one appears when you tick this off.
        </small>
      )}
    </div>
  );
}

/* ---------- Checklist ---------- */

const cleanSteps = (steps: Subtask[]) => {
  const out = steps.map((x) => ({ ...x, title: x.title.trim() })).filter((x) => x.title);
  return out.length ? out : undefined;
};

/** Steps under a task in the list: tick them, remove them, or add more without opening the editor. */
function InlineSteps({ task }: { task: Task }) {
  const [draft, setDraft] = useState('');
  const add = (text: string) => {
    actions.addSubtasks(task.id, splitSteps(text));
    setDraft('');
  };
  return (
    <div className="steps" onDoubleClick={(e) => e.stopPropagation()}>
      {(task.subtasks ?? []).map((x) => (
        <div key={x.id} className={`step ${x.done ? 'done' : ''}`}>
          <button
            type="button"
            className={`check sm ${x.done ? 'on' : ''}`}
            role="checkbox"
            aria-checked={x.done}
            aria-label={`Mark step “${x.title}” ${x.done ? 'not done' : 'done'}`}
            onClick={() => {
              if (actions.toggleSubtask(task.id, x.id)) {
                toast('All steps done', { label: 'Complete task', run: () => actions.toggleTask(task.id) }, 8000);
              }
            }}
          >
            <Check size={10} strokeWidth={3} />
          </button>
          <span>{x.title}</span>
          <button type="button" className="step-x" aria-label={`Remove step “${x.title}”`} onClick={() => actions.removeSubtask(task.id, x.id)}>
            <X size={12} />
          </button>
        </div>
      ))}
      <input
        className="step-add"
        value={draft}
        placeholder="Add a step…"
        aria-label={`Add a step to “${task.title}”`}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') add(draft);
          if (e.key === 'Escape') (setDraft(''), e.currentTarget.blur());
        }}
        onPaste={(e) => {
          const text = e.clipboardData.getData('text');
          if (text.includes('\n')) {
            e.preventDefault();
            add(text);
          }
        }}
      />
    </div>
  );
}

/** Checklist in the task editor. Changes are saved with the task. */
function ChecklistField({ steps, onChange }: { steps: Subtask[]; onChange: (s: Subtask[]) => void }) {
  const [draft, setDraft] = useState('');
  const add = (text: string) => {
    const items = splitSteps(text).map((title) => ({ id: uid(), title, done: false }));
    if (items.length) onChange([...steps, ...items]);
    setDraft('');
  };
  const done = steps.filter((x) => x.done).length;
  return (
    <div className="field">
      <span>Checklist{steps.length ? ` · ${done}/${steps.length}` : ''}</span>
      <div className="steps editor-steps">
        {steps.map((x, i) => (
          <div key={x.id} className={`step ${x.done ? 'done' : ''}`}>
            <button
              type="button"
              className={`check sm ${x.done ? 'on' : ''}`}
              role="checkbox"
              aria-checked={x.done}
              aria-label={`Mark step ${i + 1} ${x.done ? 'not done' : 'done'}`}
              onClick={() => onChange(steps.map((y) => (y.id === x.id ? { ...y, done: !y.done } : y)))}
            >
              <Check size={10} strokeWidth={3} />
            </button>
            <input
              className="step-input"
              value={x.title}
              aria-label={`Step ${i + 1}`}
              onChange={(e) => onChange(steps.map((y) => (y.id === x.id ? { ...y, title: e.target.value } : y)))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.preventDefault();
                // Backspace on an empty step removes it.
                if (e.key === 'Backspace' && !x.title) {
                  e.preventDefault();
                  onChange(steps.filter((y) => y.id !== x.id));
                }
              }}
            />
            <button type="button" className="step-x" aria-label={`Remove step ${i + 1}`} onClick={() => onChange(steps.filter((y) => y.id !== x.id))}>
              <X size={12} />
            </button>
          </div>
        ))}
        <input
          className="step-add"
          value={draft}
          placeholder={steps.length ? 'Add a step…' : 'Break it into steps (paste a list to add several)'}
          aria-label="Add a step"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault(); // don't submit the form
              add(draft);
            }
          }}
          onPaste={(e) => {
            const text = e.clipboardData.getData('text');
            if (text.includes('\n')) {
              e.preventDefault();
              add(text);
            }
          }}
        />
      </div>
    </div>
  );
}

/** "Add a task to this project" box under a project's task list. Understands dates, priority and repeats. */
function ProjectQuickAdd({ projectId }: { projectId: string }) {
  const [text, setText] = useState('');
  const add = () => {
    const p = parseQuick(text);
    if (!p.title) return;
    actions.addTask({ title: p.title, dueDate: p.date, priority: p.priority ?? 'med', repeat: p.repeat, projectId });
    setText('');
  };
  return (
    <div className="project-add">
      <Plus size={15} />
      <input
        value={text}
        placeholder="Add a task to this project — e.g. “Send draft fri !high”"
        aria-label="Add a task to this project"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') add();
          if (e.key === 'Escape') setText('');
        }}
      />
    </div>
  );
}

/* ---------- Snooze ---------- */

/** Push a task out without opening the editor: tomorrow, next Monday, or a date you pick. */
function SnoozeMenu({ task }: { task: Task }) {
  const [open, setOpen] = useState(false);
  const t = today();
  const snooze = (dueDate: string) => {
    const before = task.dueDate;
    actions.updateTask(task.id, { dueDate });
    toast(`Snoozed to ${dueLabelInline(dueDate)}`, { label: 'Undo', run: () => actions.updateTask(task.id, { dueDate: before }) });
    setOpen(false);
  };
  return (
    <div
      className="snooze"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button className="icon-btn sm task-extra" title="Snooze" aria-label="Snooze task" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <AlarmClock size={14} />
      </button>
      {open && (
        <div className="snooze-menu" role="menu" onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}>
          <button role="menuitem" autoFocus onClick={() => snooze(addDays(t, 1))}>
            Tomorrow <small>{fromKey(addDays(t, 1)).toLocaleDateString(undefined, { weekday: 'short' })}</small>
          </button>
          <button role="menuitem" onClick={() => snooze(addDays(t, 2))}>
            In 2 days <small>{fromKey(addDays(t, 2)).toLocaleDateString(undefined, { weekday: 'short' })}</small>
          </button>
          <button role="menuitem" onClick={() => snooze(nextWeek(t))}>
            Next week <small>Mon</small>
          </button>
          <label className="snooze-date">
            <span>Pick a date</span>
            <input type="date" min={addDays(t, 1)} onChange={(e) => e.target.value && snooze(e.target.value)} />
          </label>
        </div>
      )}
    </div>
  );
}
