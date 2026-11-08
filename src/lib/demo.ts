import { addDays, fromMinutes, nowMinutes, today } from './date';
import { emptyState, uid } from './store';
import type { State } from './types';

/** A realistic, lived-in day so first-time visitors (and portfolio reviewers) see the product working. */
export function demoState(name = 'Zain'): State {
  const t = today();
  const s = emptyState();
  const now = Date.now();
  // Place events around the current time so "now" and "next" always look alive,
  // keeping the whole day between 7am and 11:30pm.
  const base = Math.min(Math.max(Math.floor(nowMinutes() / 30) * 30, 9 * 60 + 30), 20 * 60);
  const at = (offset: number) => fromMinutes(base + offset);

  s.onboarded = true;
  s.settings.name = name;
  s.priority = { title: 'Ship the onboarding redesign to staging', done: false };
  s.tasks = [
    { id: uid(), title: 'Write release notes for v2.4', done: false, priority: 'high', dueDate: t, createdAt: now },
    { id: uid(), title: 'Review Maya’s pull request on auth flow', done: false, priority: 'med', dueDate: t, createdAt: now },
    { id: uid(), title: 'Book flights for the offsite', done: false, priority: 'low', dueDate: addDays(t, 3), createdAt: now },
    { id: uid(), title: 'Renew domain + SSL certificate', done: false, priority: 'high', dueDate: addDays(t, -1), createdAt: now },
    { id: uid(), title: 'Draft Q1 roadmap one-pager', done: false, priority: 'med', dueDate: addDays(t, 2), createdAt: now },
    { id: uid(), title: 'Final copy for pricing page', done: false, priority: 'med', waitingOn: 'Priya', createdAt: now },
    { id: uid(), title: 'Morning inbox zero', done: true, priority: 'low', dueDate: t, createdAt: now, completedAt: now - 3 * 36e5 },
    { id: uid(), title: 'Reply to recruiter about Friday', done: true, priority: 'med', dueDate: t, createdAt: now, completedAt: now - 2 * 36e5 },
  ];
  s.events = [
    { id: uid(), title: 'Team standup', date: t, start: at(-150), end: at(-135), location: 'Zoom' },
    { id: uid(), title: 'Design review', date: t, start: at(-60), end: at(-15), notes: 'Bring onboarding prototypes' },
    { id: uid(), title: 'Deep work: onboarding', date: t, start: at(0), end: at(90) },
    { id: uid(), title: base >= 18 * 60 ? 'Call with family' : '1:1 with Jordan', date: t, start: at(105), end: at(135), location: base >= 18 * 60 ? undefined : 'Room 4B' },
    { id: uid(), title: base >= 18 * 60 ? 'Read & wind down' : 'Gym', date: t, start: at(base >= 18 * 60 ? 165 : 240), end: at(base >= 18 * 60 ? 210 : 300) },
    { id: uid(), title: 'Sprint planning', date: addDays(t, 1), start: '10:00', end: '11:00' },
    { id: uid(), title: 'Lunch with Alex', date: addDays(t, 1), start: '12:30', end: '13:30' },
  ];
  s.projects = [
    { id: uid(), name: 'Onboarding redesign', status: 'track', nextAction: 'Ship to staging and run 5 user tests', details: '', progress: 72 },
    { id: uid(), name: 'Mobile app v2', status: 'risk', nextAction: 'Decide on offline sync approach', details: '', progress: 41 },
    { id: uid(), name: 'Portfolio site', status: 'blocked', nextAction: 'Waiting on new headshots', details: '', progress: 85 },
  ];
  const hist = (pattern: string) => Object.fromEntries([...pattern].map((c, i) => [addDays(t, i - pattern.length + 1), c === '1']).filter(([, v]) => v));
  s.habits = [
    { id: uid(), name: 'Read 20 pages', history: hist('1101111111110'), createdAt: now },
    { id: uid(), name: 'Workout', history: hist('1010110101101'), createdAt: now },
    { id: uid(), name: 'No phone before 9', history: hist('0111111111111'), createdAt: now },
    { id: uid(), name: 'Drink 2L water', history: hist('1111011111111'), createdAt: now },
  ];
  s.notes = 'Ideas\n– Weekly “ship log” post for the team\n– Try time-boxing reviews to 30m\n\nRemember: ask Jordan about the conference budget.';
  s.jobs = [
    { id: uid(), url: 'https://job-boards.greenhouse.io/acme/jobs/1001', company: 'Acme', role: 'Senior Product Designer', location: 'Remote (US)', status: 'interview', appliedOn: addDays(t, -9), notes: 'Recruiter: Dana. Portfolio review Thursday 2pm.', createdAt: now },
    { id: uid(), url: 'https://jobs.lever.co/northwind/2002', company: 'Northwind', role: 'Product Designer, Growth', location: 'New York, NY', status: 'applied', appliedOn: addDays(t, -1), createdAt: now },
    { id: uid(), url: 'https://www.linkedin.com/jobs/view/3003003003/', company: 'Globex', role: 'UX Designer', location: 'Austin, TX', status: 'applied', appliedOn: t, createdAt: now },
    { id: uid(), url: 'https://jobs.ashbyhq.com/initech/4004', company: 'Initech', role: 'Design Lead', status: 'rejected', appliedOn: addDays(t, -21), createdAt: now },
  ];
  s.links = [
    { id: uid(), label: 'Gmail', url: 'https://mail.google.com' },
    { id: uid(), label: 'Calendar', url: 'https://calendar.google.com' },
    { id: uid(), label: 'GitHub', url: 'https://github.com' },
    { id: uid(), label: 'Figma', url: 'https://figma.com' },
    { id: uid(), label: 'Linear', url: 'https://linear.app' },
    { id: uid(), label: 'Notion', url: 'https://notion.so' },
  ];
  s.focus = { [t]: { minutes: 75, sessions: 3 } };
  for (let i = 1; i <= 6; i++) s.focus[addDays(t, -i)] = { minutes: [50, 100, 25, 125, 75, 0][i - 1], sessions: [2, 4, 1, 5, 3, 0][i - 1] };
  s.journal = [
    { date: addDays(t, -1), shipped: 'Auth flow PR merged, fixed the Safari login bug', slipped: 'Didn’t get to the roadmap draft', carries: '', mood: 4, priority: 'Merge the auth flow', priorityDone: true, tasksDone: 6, focusMinutes: 50 },
    { date: addDays(t, -2), shipped: 'Prototype for the new onboarding', slipped: '', carries: '', mood: 5, priority: 'Onboarding prototype', priorityDone: true, tasksDone: 8, focusMinutes: 100 },
    { date: addDays(t, -3), shipped: 'Mostly meetings', slipped: 'Deep work block got eaten by a fire drill', carries: '', mood: 2, priority: 'Write auth spec', priorityDone: false, tasksDone: 2, focusMinutes: 25 },
  ];
  return s;
}
