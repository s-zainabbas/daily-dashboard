# Daily Dashboard

A calm, fast command center for your day: one priority, your tasks, today's schedule, a focus timer, habits, notes and an end-of-day journal — all on one screen.

Offline-first and private: everything is stored in your browser. Optionally connect **your own Google Drive** to keep the same data on your laptop, phone and anywhere else. No server, no tracking.

**Try it:** open the app with `?demo` (for example `https://<your-username>.github.io/daily-dashboard/?demo`) to explore a realistic sample day without saving anything.

---

## Features

| | |
|---|---|
| **Sidebar with tabs** | Today, Tasks, Schedule, Projects, Jobs and Notes, with badges for what's waiting. Switch with `1`–`6`; `[` folds it to icons. Becomes a bottom tab bar on phones. **Today fits on one screen** on a laptop: long cards scroll inside themselves. |
| **Plan my day** | Press `P` for a one-minute morning routine: sort out overdue tasks, pick today's tasks (with your free time from the calendar), set your #1 priority. Undo included. |
| **Natural-language quick add** | Type `Call Sam tomorrow !high` or `Dentist fri 3-4pm`. A live preview shows what it understood: task or event, date, time, priority. |
| **Today's #1 priority** | One thing that would make today a win, with a one-click "Focus on it". |
| **Tasks** | Grouped into Overdue / Today / Upcoming / Anytime / Waiting on others. Priorities, projects, notes, undo on delete. **Checklists**: break a task into steps (paste a list to add several) and tick them from the list. |
| **Schedule** | Agenda with a "now" line, free-time gaps, a day-at-a-glance bar, and a peek at tomorrow. Browse other days. |
| **Focus timer** | Pomodoro based on timestamps, so it stays accurate in background tabs and across reloads. Countdown in the tab title, chime, notification, daily focus log. |
| **Habits** | 7-day grid with streaks that forgive an unticked "today". |
| **Projects** | Status, progress and the single next action. The Projects tab shows each project with its own task list; tasks added there are linked to it. |
| **Jobs applied** | Paste a job link and it's saved with the company, position and location filled in. Track status (applied, interview, offer, rejected), add notes, and keep a copy of the job description in case the posting comes down before your interview. |
| **End-of-day review → Journal** | Mood, what shipped, what slipped. At midnight the day is saved to a journal with your priority, tasks completed and focus time; "carry to tomorrow" becomes a task. |
| **Quick links** | Your everyday sites as icons in the top bar. Edit them on the Notes tab. |
| **Weather** | Local conditions with high/low and rain chance (Open-Meteo, no API key). |
| **Command menu** | `⌘K` to run any action or complete a task by name. |
| **Keyboard first** | `/` quick add · `N` task · `E` event · `P` plan my day · `F` focus · `J` journal · `T` theme · `1`–`6` tabs · `?` all shortcuts |
| **Themes** | Light, dark or system, with five accent colours. |
| **Installable PWA** | Works offline; install it to your dock or home screen. |
| **Google Drive sync** | Connect your Google account and the dashboard is saved to a hidden app folder in your own Drive. Edits sync a few seconds later; other devices pick them up when they open or come back online. Changes made on two devices are merged, and if the same thing was changed in both places you choose which to keep. Restore any recent version. |
| **Google Calendar** | Your Google Calendar events show in Schedule, the "Next up" card and the sidebar, next to your own events, in each calendar's colour. Read-only and never copied into your data; click one to open it in Google Calendar. Choose which calendars to show in Settings. |
| **Repeating tasks** | `Gym every mon wed fri`, `Pay rent monthly`, or set it in the task editor. Ticking one off adds the next; Undo and Skip included. |
| **Backup** | Export / import JSON. Undo after import, reset or loading sample data. |

## Tech

- **React 18 + TypeScript (strict)**, built with **Vite**
- No state library: a small external store on `useSyncExternalStore`, with debounced persistence, cross-tab sync and versioned migrations
- Hand-written CSS design system (tokens, light/dark, container queries, reduced-motion support); Geist + Instrument Serif fonts, bundled for offline use
- Accessible by default: native `<dialog>` for modals (focus trap, Esc), labelled controls, visible focus rings
- **Vitest** unit tests for the date logic, natural-language parser, job-link parsing, legacy migration and day rollover
- Job links are looked up with the public Greenhouse, Lever and Ashby job APIs; other sites (LinkedIn, Indeed, career pages) go through [Microlink](https://microlink.io)'s free link-preview API. Only the job link is sent, nothing else
- Optional Google Drive sync with Google Identity Services (token model) and the Drive API's `appDataFolder` — no server, no SDK. See [Google Drive sync](#google-drive-sync)
- Service worker for offline use; GitHub Actions workflow that tests, builds and deploys to GitHub Pages

```
src/
  lib/          store, date helpers, parser, timer engine, weather, sample data
  components/   one file per dashboard panel, plus dialogs and the command menu
  styles/       design tokens and component styles
legacy/         the original single-file version, kept for comparison
```

## Run it

**On a Mac:** double-click **`Open Dashboard.command`** in this folder. It installs what's needed on first run, starts the dashboard and opens it in your browser. Keep the Terminal window open while you use it.

Or from a terminal:

```bash
npm install
npm run dev        # http://localhost:5173
npm test
npm run build      # static site in dist/
```

## Google Drive sync

Your data stays local first: every change saves on the device instantly, and the app works offline. When you connect Google Drive, it's also kept in one file, `daily-dashboard.json`, in your Drive's hidden **app data folder**. The file is invisible in the Drive UI, and only this app can read it.

### One-time Google Cloud setup

1. **Project:** [console.cloud.google.com](https://console.cloud.google.com) → project picker → **New project** → name `Daily Dashboard` → **Create**, then select it.
2. **Drive API:** ☰ → **APIs & Services → Library** → search *Google Drive API* → **Enable**.
3. **Consent screen:** ☰ → **Google Auth Platform** → **Get started**. App name `Daily Dashboard`, support email = your Gmail → **Audience: External** → contact email → agree → **Create**.
4. **Scopes:** **Data Access → Add or remove scopes** → tick `.../auth/drive.appdata`, `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile` → **Update → Save**. All four are non-sensitive, so no Google review is needed.
5. **Test users:** **Audience → Test users → Add users** → your Gmail. Leave the status on *Testing*.
6. **Client ID:** **Clients → Create client** → *Web application* → name `Daily Dashboard web` → **Authorized JavaScript origins**: `http://localhost:5173`, `http://localhost:5174`, `https://<your-username>.github.io` (domain only, no path, no trailing slash). Leave redirect URIs empty → **Create**. Copy the **Client ID**. You don't need the client secret, so don't put it anywhere.
7. **Local:** copy `.env.example` to `.env.local` and paste the Client ID.
8. **Live site:** GitHub repo → **Settings → Secrets and variables → Actions → Variables** → new variable `VITE_GOOGLE_CLIENT_ID` = the Client ID. Push (or re-run the workflow) to redeploy.

New origins can take a few minutes to start working. Then open **Settings → Google Drive sync → Connect Google Drive**.

### Google Calendar (optional)

Uses the same Google Cloud project and Client ID:

1. ☰ → **APIs & Services → Library** → search *Google Calendar API* → **Enable**.
2. **Google Auth Platform → Data Access → Add or remove scopes** → tick `.../auth/calendar.readonly` → **Update → Save**.
   This one is a *sensitive* scope. While the app stays in *Testing* with you as a test user, no Google review is needed; Google just shows an "unverified app" notice on the permission screen, which you can continue past.
3. In the dashboard: **Settings → Google Calendar → Connect Google Calendar**, then tick the calendars to show.

Events from last week to two months ahead are fetched when the dashboard opens, every 5 minutes while it's open, and when you come back to the tab. They're cached on the device so they show offline. Like Drive sync, Google's sign-in lasts about an hour; after that the Schedule shows a **Reconnect** button. Code: `src/lib/google/calendar.ts` (API and event conversion), `src/lib/gcal.ts` (fetching, cache, merging), `src/components/CalendarSettings.tsx`.

### How it behaves

- **Sign-in:** Google's recommended browser flow (Google Identity Services, token model). The app gets a short-lived access token (about an hour) limited to its own Drive folder. There's no client secret and no refresh token in the app. Google only issues a new token from a tap, so after an hour sync pauses until you tap **Sync now** (or the avatar in the top bar). Your edits keep saving on the device in the meantime.
- **When it syncs:** about 3 seconds after you stop editing, when the dashboard opens, when you come back to the tab, when you're back online, and every 5 minutes while it's open. Turn off **Automatic sync** to sync only when you tap **Sync now**.
- **First connection:** if Drive is empty, this device's data is uploaded. On a new device with no data, the Drive copy is restored. If both have data, you choose: **merge** (recommended), **use Drive's copy**, or **use this device's copy**. Local data is never erased without asking, and a backup is kept with an Undo.
- **Merging:** each record (task, event, habit…) has a stable ID and a last-changed time, and deletions leave a tombstone for 90 days. The app compares the last synced copy with this device and with Drive. Changes on one side win over unchanged data, so older data never overwrites newer. Changes to different items or different fields are combined. Focus minutes from two devices add up. If the same field was changed on both sides, or something was edited on one device and deleted on another, the app asks you and uploads nothing until you choose.
- **Simultaneous saves:** before uploading, the app checks that the Drive file hasn't changed. If another device saved at the very same moment, the app recovers that save from the file's history and merges it.
- **Problems:** offline → waits and retries when you reconnect. Expired sign-in → pauses. Drive errors → retries with growing delays. A damaged file, or one written by a newer version of the app, is never overwritten automatically.
- **Restore:** **Settings → Restore…** lists recent saved versions of the Drive file. Restoring replaces this device's data (with Undo), and other devices get it on their next sync.
- **Disconnect:** stops syncing and revokes the app's access. Your data stays on the device and in Drive.

Code: `src/lib/google/` (sign-in, Drive API), `src/lib/sync/` (file format, merge, sync engine, device storage), `src/components/DriveSync.tsx` (Settings section and dialogs). Tests run two simulated devices against an in-memory Drive (`src/lib/sync/engine.test.ts`).

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
