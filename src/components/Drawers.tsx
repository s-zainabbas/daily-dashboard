import { useRef, useState } from 'react';
import { Download, Flame, LocateFixed, Minus, Plus, Search, Upload } from 'lucide-react';
import { today } from '../lib/date';
import { demoState } from '../lib/demo';
import { actions, emptyState, getState, replaceState, useStore } from '../lib/store';
import { timerActions } from '../lib/timer';
import type { Accent, Theme } from '../lib/types';
import { clearWeatherCache, searchPlaces, type Place } from '../lib/weather';
import { useDriveSync } from '../lib/sync/driveSync';
import { DriveSyncSection } from './DriveSync';
import { RemindersSection } from './RemindersSettings';
import { CalendarSection } from './CalendarSettings';
import { Dialog, DialogHead, Segmented, Switch, toast } from './ui';

/* ---------- Settings ---------- */

const ACCENTS: { value: Accent; color: string }[] = [
  { value: 'violet', color: '#8b7cff' },
  { value: 'blue', color: '#6aa8ff' },
  { value: 'green', color: '#4fd1a1' },
  { value: 'amber', color: '#f5b45a' },
  { value: 'rose', color: '#ff7f9f' },
];

function Stepper({ value, min, max, step, onChange, unit }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void; unit: string }) {
  return (
    <div className="stepper">
      <button className="icon-btn sm" onClick={() => onChange(Math.max(min, value - step))} aria-label="Decrease">
        <Minus size={13} />
      </button>
      <output className="num">
        {value} {unit}
      </output>
      <button className="icon-btn sm" onClick={() => onChange(Math.min(max, value + step))} aria-label="Increase">
        <Plus size={13} />
      </button>
    </div>
  );
}

export function SettingsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useStore((st) => st.settings);
  const synced = !!useDriveSync().account;
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    const r = await searchPlaces(q.trim());
    setResults(r);
    if (!r.length) toast('No places found');
  }

  function setLocation(p?: Place) {
    clearWeatherCache();
    actions.setSettings({ location: p });
    setResults([]);
    setQ('');
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(getState(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `daily-dashboard-${today()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function importData(file: File) {
    try {
      const data = JSON.parse(await file.text());
      if (data?.version !== 2 || !Array.isArray(data.tasks)) throw new Error('Not a Daily Dashboard backup');
      const before = getState();
      replaceState(data);
      toast('Backup restored', { label: 'Undo', run: () => replaceState(before) }, 8000);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not read that file');
    }
  }

  return (
    <Dialog open={open} onClose={onClose} className="drawer" label="Settings">
      <DialogHead title="Settings" onClose={onClose} />
      <div className="drawer-body">
        <DriveSyncSection />
        <CalendarSection />

        <section>
          <h3>You</h3>
          <label className="field">
            <span>Name</span>
            <input className="input" value={s.name} onChange={(e) => actions.setSettings({ name: e.target.value })} placeholder="Used in the greeting" />
          </label>
        </section>

        <section>
          <h3>Appearance</h3>
          <div className="setting">
            <div>
              <b>Theme</b>
            </div>
            <Segmented<Theme>
              label="Theme"
              value={s.theme}
              onChange={(v) => actions.setSettings({ theme: v })}
              options={[
                { value: 'system', label: 'Auto' },
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
              ]}
            />
          </div>
          <div className="setting">
            <div>
              <b>Accent</b>
            </div>
            <div className="swatches" role="group" aria-label="Accent color">
              {ACCENTS.map((a) => (
                <button key={a.value} className="swatch" style={{ ['--c' as string]: a.color }} aria-pressed={s.accent === a.value} aria-label={a.value} onClick={() => actions.setSettings({ accent: a.value })} />
              ))}
            </div>
          </div>
          <div className="setting">
            <div>
              <b>24-hour clock</b>
            </div>
            <Switch label="24-hour clock" checked={s.use24h} onChange={(v) => actions.setSettings({ use24h: v })} />
          </div>
        </section>

        <RemindersSection />

        <section>
          <h3>Focus timer</h3>
          <div className="setting">
            <div>
              <b>Focus length</b>
            </div>
            <Stepper
              value={s.focusMinutes}
              min={5}
              max={120}
              step={5}
              unit="min"
              onChange={(v) => {
                actions.setSettings({ focusMinutes: v });
                timerActions.syncLength();
              }}
            />
          </div>
          <div className="setting">
            <div>
              <b>Break length</b>
            </div>
            <Stepper
              value={s.breakMinutes}
              min={1}
              max={30}
              step={1}
              unit="min"
              onChange={(v) => {
                actions.setSettings({ breakMinutes: v });
                timerActions.syncLength();
              }}
            />
          </div>
          <div className="setting">
            <div>
              <b>Chime when done</b>
              <small>Plus a notification if you allow it</small>
            </div>
            <Switch label="Chime when done" checked={s.sound} onChange={(v) => actions.setSettings({ sound: v })} />
          </div>
        </section>

        <section>
          <h3>Weather</h3>
          <div className="setting">
            <div>
              <b>{s.location?.name ?? 'No location set'}</b>
              <small>Forecasts from Open-Meteo</small>
            </div>
            <Segmented
              label="Units"
              value={s.units}
              onChange={(v) => {
                clearWeatherCache();
                actions.setSettings({ units: v });
              }}
              options={[
                { value: 'c', label: '°C' },
                { value: 'f', label: '°F' },
              ]}
            />
          </div>
          <form className="row" onSubmit={search} style={{ marginTop: 8 }}>
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a city…" aria-label="Search a city" />
            <button className="btn" style={{ flex: 'none' }} aria-label="Search">
              <Search size={14} />
            </button>
            <button type="button" className="btn" style={{ flex: 'none' }} title="Use my location" aria-label="Use my location" onClick={() => setLocation(undefined)}>
              <LocateFixed size={14} />
            </button>
          </form>
          {results.length > 0 && (
            <div className="place-results">
              {results.map((p) => (
                <button key={`${p.latitude},${p.longitude}`} onClick={() => setLocation(p)}>
                  {p.name}
                </button>
              ))}
            </div>
          )}
        </section>

        <section>
          <h3>Your data</h3>
          <div className="setting">
            <div>
              <b>{synced ? 'On this device and in your Google Drive' : 'Stored on this device'}</b>
              <small>{synced ? 'Works offline; syncs when it can. A backup file is handy too.' : 'Nothing leaves your browser unless you connect Google Drive above.'}</small>
            </div>
          </div>
          <div className="row" style={{ marginTop: 6 }}>
            <button className="btn" onClick={exportData}>
              <Download size={14} /> Export backup
            </button>
            <button className="btn" onClick={() => fileRef.current?.click()}>
              <Upload size={14} /> Import
            </button>
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && importData(e.target.files[0])} />
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <button
              className="btn ghost"
              onClick={() => {
                const before = getState();
                replaceState({ ...demoState(s.name || 'there'), settings: before.settings });
                toast('Sample data loaded', { label: 'Undo', run: () => replaceState(before) }, 8000);
              }}
            >
              <Flame size={14} /> Load sample day
            </button>
            <button
              className="btn ghost danger"
              onClick={() => {
                if (!confirm(synced ? 'Erase everything? This also erases it from Google Drive and your other devices on their next sync. You can undo right after.' : 'Erase everything on this device? You can undo right after.')) return;
                const before = getState();
                replaceState({ ...emptyState(), onboarded: true, settings: before.settings });
                toast('Everything erased', { label: 'Undo', run: () => replaceState(before) }, 10000);
              }}
            >
              Erase all
            </button>
          </div>
        </section>
      </div>
    </Dialog>
  );
}

/* ---------- Shortcuts ---------- */

export const SHORTCUTS: [string[], string][] = [
  [['⌘', 'K'], 'Command menu'],
  [['1', '–', '8'], 'Switch tab (Today, Tasks, Schedule, Projects, Jobs, Notes, Journal, Insights)'],
  [['['], 'Collapse / expand sidebar'],
  [['P'], 'Plan my day'],
  [['S'], 'Shut down for the day'],
  [['W'], 'Weekly review'],
  [['⇧', 'F'], 'Full-screen focus mode'],
  [['/'], 'Quick add'],
  [['N'], 'New task'],
  [['E'], 'New event'],
  [['F'], 'Start / pause focus timer'],
  [['J'], 'Journal'],
  [['T'], 'Toggle light / dark'],
  [['?'], 'Show shortcuts'],
  [['Esc'], 'Close any dialog'],
];

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} label="Keyboard shortcuts">
      <DialogHead title="Keyboard shortcuts" onClose={onClose} />
      <div className="modal-body">
        <div className="shortcuts">
          {SHORTCUTS.map(([keys, label]) => (
            <div key={label}>
              {label}
              <span>
                {keys.map((k) => (
                  <kbd key={k}>{k}</kbd>
                ))}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Dialog>
  );
}
