# Daily Dashboard

A calm, fast command center for your day: one priority, your tasks, today's schedule, a focus timer, habits, notes and an end-of-day journal — all on one screen.

Offline-first and private: everything is stored in your browser. No account, no server, no tracking.

**Try it:** open the app with `?demo` (for example `https://<your-username>.github.io/daily-dashboard/?demo`) to explore a realistic sample day without saving anything.

---

## Features

| | |
|---|---|
| **Natural-language quick add** | Type `Call Sam tomorrow !high` or `Dentist fri 3-4pm`. A live preview shows what it understood: task or event, date, time, priority. |
| **Today's #1 priority** | One thing that would make today a win, with a one-click "Focus on it". |
| **Tasks** | Grouped into Overdue / Today / Upcoming / Anytime / Waiting on others. Priorities, projects, notes, undo on delete. |
| **Schedule** | Agenda with a "now" line, free-time gaps, a day-at-a-glance bar, and a peek at tomorrow. Browse other days. |
| **Focus timer** | Pomodoro based on timestamps, so it stays accurate in background tabs and across reloads. Countdown in the tab title, chime, notification, daily focus log. |
| **Habits** | 7-day grid with streaks that forgive an unticked "today". |
| **Projects** | Status, progress and the single next action. |
| **Jobs applied** | Paste a job link and it's saved with the company, position and location filled in. Track status (applied, interview, offer, rejected), add notes, and keep a copy of the job description in case the posting comes down before your interview. |
| **End-of-day review → Journal** | Mood, what shipped, what slipped. At midnight the day is saved to a journal with your priority, tasks completed and focus time; "carry to tomorrow" becomes a task. |
| **Weather** | Local conditions with high/low and rain chance (Open-Meteo, no API key). |
| **Command menu** | `⌘K` to run any action or complete a task by name. |
| **Keyboard first** | `/` quick add · `N` task · `E` event · `F` focus · `J` journal · `T` theme · `?` all shortcuts |
| **Themes** | Light, dark or system, with five accent colours. |
| **Installable PWA** | Works offline; install it to your dock or home screen. |
| **Backup** | Export / import JSON. Undo after import, reset or loading sample data. |

## Tech

- **React 18 + TypeScript (strict)**, built with **Vite**
- No state library: a small external store on `useSyncExternalStore`, with debounced persistence, cross-tab sync and versioned migrations
- Hand-written CSS design system (tokens, light/dark, container queries, reduced-motion support); Geist + Instrument Serif fonts, bundled for offline use
- Accessible by default: native `<dialog>` for modals (focus trap, Esc), labelled controls, visible focus rings
- **Vitest** unit tests for the date logic, natural-language parser, job-link parsing, legacy migration and day rollover
- Job links are looked up with the public Greenhouse, Lever and Ashby job APIs; other sites (LinkedIn, Indeed, career pages) go through [Microlink](https://microlink.io)'s free link-preview API. Only the job link is sent, nothing else
- Service worker for offline use; GitHub Actions workflow that tests, builds and deploys to GitHub Pages

```
src/
  lib/          store, date helpers, parser, timer engine, weather, sample data
  components/   one file per dashboard panel, plus dialogs and the command menu
  styles/       design tokens and component styles
legacy/         the original single-file version, kept for comparison
```

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test
npm run build      # static site in dist/
```

## Deploy

Push to `main` on GitHub and enable **Settings → Pages → Source: GitHub Actions**. The workflow in `.github/workflows/deploy.yml` runs the tests, builds and publishes. The build uses relative paths, so it also works on Netlify, Vercel or any static host.

## From v1 to v2

The first version was a single 32 KB HTML file. The rewrite fixed these bugs:

- **Wrong "today" in many timezones.** Dates were computed in UTC, so evening users in the Americas (or morning users in Asia) saw tomorrow's tasks and events.
- **Habit streaks never went above 1.** The streak loop subtracted 86,400,000 *days* per step instead of one.
- **Quick-add tasks disappeared.** A second script wrote straight to storage, and the main app overwrote those tasks on its next save. Ticking or deleting one could also crash the app.
- **Notes lost what you'd just typed** if anything else re-rendered within half a second.
- **"New Day" deleted unfinished tasks** that were due today.
- **Project cards only opened from their padding.** Clicking the name or the status did nothing.
- **The focus timer drifted** in background tabs and reset on reload.
- **Quick links accepted `javascript:` URLs.**
- The **"Add event" button was hidden on mobile**, weather was fetched twice, and the notification permission prompt fired on page load.

Data saved by v1 is migrated automatically the first time v2 opens. The old manual "Inbox check" entries become tasks.

## License

MIT © Zain Abbas
