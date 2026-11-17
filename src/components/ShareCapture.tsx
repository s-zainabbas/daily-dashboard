import { useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, NotebookPen, Share2 } from 'lucide-react';
import { today, addDays } from '../lib/date';
import { readShare, withoutShare, type Shared } from '../lib/share';
import { actions } from '../lib/store';
import { Dialog, DialogHead, Segmented, toast } from './ui';

type Kind = 'task' | 'note';
type When = 'none' | 'today' | 'tomorrow';

/**
 * "Share → Daily Dashboard" from another app on your phone (once the dashboard is installed to the
 * home screen). Whatever was shared opens here to save as a task or a note.
 */
export function ShareCapture() {
  const [shared, setShared] = useState<Shared | null>(null);
  const [kind, setKind] = useState<Kind>('task');
  const [when, setWhen] = useState<When>('none');
  const [title, setTitle] = useState('');

  useEffect(() => {
    const s = readShare(location.search);
    if (!s) return;
    history.replaceState(null, '', `${location.pathname}${withoutShare(location.search)}${location.hash}`);
    setShared(s);
    setTitle(s.title);
    // Long text reads better as a note.
    if (s.body.length > 280) setKind('note');
  }, []);

  if (!shared) return null;
  const close = () => setShared(null);

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !shared) return;
    if (kind === 'task') {
      actions.addTask({ title: title.trim(), notes: shared.body || undefined, priority: 'med', dueDate: when === 'today' ? today() : when === 'tomorrow' ? addDays(today(), 1) : undefined });
      toast('Saved as a task');
    } else {
      actions.addPage({ title: title.trim(), body: shared.body });
      toast('Saved as a note', { label: 'Open', run: () => (location.hash = 'notes') });
    }
    close();
  }

  return (
    <Dialog open onClose={close} label="Save what you shared">
      <DialogHead
        title={
          <span className="plan-title">
            <Share2 size={16} /> Save to your dashboard
          </span>
        }
        onClose={close}
      />
      <form className="modal-body" onSubmit={save}>
        <Segmented
          label="Save as"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'task', label: <><CheckCircle2 size={13} /> Task</> },
            { value: 'note', label: <><NotebookPen size={13} /> Note</> },
          ]}
        />
        <label className="field">
          <span>Title</span>
          <input className="input" autoFocus data-autofocus required value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        {kind === 'task' && (
          <div className="field">
            <span>When</span>
            <Segmented
              label="When"
              value={when}
              onChange={setWhen}
              options={[
                { value: 'none', label: 'Anytime' },
                { value: 'today', label: 'Today' },
                { value: 'tomorrow', label: 'Tomorrow' },
              ]}
            />
          </div>
        )}
        {shared.body && (
          <div className="share-body">
            {shared.url && (
              <a href={shared.url} target="_blank" rel="noopener noreferrer">
                {shared.url} <ExternalLink size={11} />
              </a>
            )}
            {shared.body.replace(shared.url ?? '\u0000', '').trim() && <p>{shared.body.replace(shared.url ?? '\u0000', '').trim()}</p>}
          </div>
        )}
        <div className="modal-foot">
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={close}>
            Cancel
          </button>
          <button className="btn primary">Save {kind}</button>
        </div>
      </form>
    </Dialog>
  );
}
