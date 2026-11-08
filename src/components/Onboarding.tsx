import { useState } from 'react';
import { CalendarDays, ListTodo, Timer } from 'lucide-react';
import { demoState } from '../lib/demo';
import { actions, replaceState } from '../lib/store';
import { driveConfigured } from '../lib/sync/driveSync';
import { ConnectButton } from './DriveSync';
import { Dialog } from './ui';

export function Onboarding({ open }: { open: boolean }) {
  const [name, setName] = useState('');
  return (
    <Dialog open={open} onClose={() => actions.finishOnboarding(name.trim())} className="modal onboard" label="Welcome">
      <form
        className="modal-body"
        onSubmit={(e) => {
          e.preventDefault();
          actions.finishOnboarding(name.trim());
        }}
      >
        <img className="onboard-mark" src="./icon.svg" alt="" />
        <h2>Make today count.</h2>
        <p>One calm place for your priority, tasks, schedule, focus time and habits. Everything stays on this device{driveConfigured ? ', or sync it with your Google Drive' : ''}.</p>
        <div className="onboard-feats">
          <div>
            <ListTodo size={18} />
            Tasks &amp; priority
          </div>
          <div>
            <CalendarDays size={18} />
            Day schedule
          </div>
          <div>
            <Timer size={18} />
            Focus &amp; habits
          </div>
        </div>
        <label className="sr-only" htmlFor="onboard-name">
          Your first name
        </label>
        <input id="onboard-name" className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="What should we call you?" maxLength={40} />
        <div className="onboard-actions">
          <button className="btn primary">Start my day</button>
          {driveConfigured && <ConnectButton className="btn" label="Restore from Google Drive" />}
          <button type="button" className="btn ghost" onClick={() => replaceState(demoState(name.trim() || 'there'))}>
            Explore with a sample day
          </button>
        </div>
      </form>
    </Dialog>
  );
}
