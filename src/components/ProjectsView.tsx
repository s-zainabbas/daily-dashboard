import { useEffect, useState } from 'react';
import { ArrowRight, Pencil } from 'lucide-react';
import { useStore } from '../lib/store';
import type { Project } from '../lib/types';
import { ProjectEditor, Projects } from './Panels';
import { Tasks } from './Tasks';

const STATUS: Record<Project['status'], string> = { track: 'On track', risk: 'At risk', blocked: 'Blocked', paused: 'Paused', done: 'Done' };
const KEY = 'daily-dashboard:project';

/** Projects tab: pick a project on the right, work on it on the left. */
export function ProjectsView() {
  const projects = useStore((s) => s.projects);
  const [picked, setPicked] = useState<string | null>(() => {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  });
  const select = (id: string) => {
    setPicked(id);
    try {
      localStorage.setItem(KEY, id);
    } catch {
      /* optional */
    }
  };
  useEffect(() => {
    const on = (e: Event) => select((e as CustomEvent<string>).detail);
    window.addEventListener('dd:open-project', on);
    return () => window.removeEventListener('dd:open-project', on);
  }, []);
  // The remembered project, or the first one that isn't finished.
  const project = projects.find((p) => p.id === picked) ?? projects.find((p) => p.status !== 'done') ?? projects[0];

  if (!project) {
    return (
      <main className="view-full view-projects" aria-label="Projects">
        <Projects />
      </main>
    );
  }
  return (
    <main className="view-split view-projects" aria-label="Projects">
      <div className="col">
        <ProjectHeader project={project} />
        <Tasks key={project.id} projectId={project.id} />
      </div>
      <div className="col">
        <Projects selectedId={project.id} onSelect={select} />
      </div>
    </main>
  );
}

function ProjectHeader({ project }: { project: Project }) {
  const tasks = useStore((s) => s.tasks);
  const [editing, setEditing] = useState(false);
  const mine = tasks.filter((t) => t.projectId === project.id);
  const open = mine.filter((t) => !t.done).length;
  const done = mine.length - open;
  return (
    <section className="card project-head" aria-label={project.name}>
      <div className="project-head-top">
        <span className={`status-dot status-${project.status}`} />
        <h2>{project.name}</h2>
        <span className="chip">{STATUS[project.status] ?? STATUS.track}</span>
        <button className="icon-btn sm" onClick={() => setEditing(true)} aria-label="Edit project" title="Edit project">
          <Pencil size={14} />
        </button>
      </div>
      <div className="project-next big">
        <ArrowRight size={14} />
        <span>{project.nextAction || 'No next action set — what’s the very next step?'}</span>
      </div>
      <div className="project-bottom num">
        <div className="progress">
          <i style={{ width: `${project.progress}%` }} />
        </div>
        <span>{project.progress}%</span>
        <span>
          · {open} open{done ? `, ${done} done` : ''}
        </span>
      </div>
      {project.details && <p className="project-details">{project.details}</p>}
      <ProjectEditor project={editing ? project : null} onClose={() => setEditing(false)} />
    </section>
  );
}
