import { useState } from 'react';
import { ExternalLink, MapPin, Repeat as RepeatIcon, StickyNote, Trash2 } from 'lucide-react';
import { formatTime, fromKey, fromMinutes, nowMinutes, toMinutes, today } from '../lib/date';
import { allowGoogleEditing, removeGoogleEvent, saveGoogleEvent, useGcal, writableCalendars } from '../lib/gcal';
import type { ShownEvent } from '../lib/google/calendar';
import { repeatLabel } from '../lib/repeat';
import { actions, getState, useStore } from '../lib/store';
import { useDriveSync } from '../lib/sync/driveSync';
import type { CalEvent, Repeat, RepeatFreq } from '../lib/types';
import { Dialog, DialogHead, toast } from './ui';

type Form = { title: string; date: string; start: string; end: string; location: string; notes: string; repeat: '' | RepeatFreq; target: string };

const LOCAL = 'local';

/**
 * Add or change an event. Your own events can repeat; Google Calendar events can be changed here
 * too when the calendar allows it (the first save asks Google for permission to edit events).
 * Events Google won't let you change here (multi-day, someone else's calendar) show their details
 * with a link to Google Calendar.
 */
export function EventEditor({ event, defaultDate, defaultStart, defaultEnd, onClose }: {
  event: ShownEvent | CalEvent | 'new' | null;
  defaultDate: string;
  defaultStart?: string;
  defaultEnd?: string;
  onClose: () => void;
}) {
  const g = useGcal();
  const account = useDriveSync().account;
  const use24h = useStore((s) => s.settings.use24h);
  const calendars = writableCalendars(g);
  const shown = event && event !== 'new' ? (event as ShownEvent) : undefined;
  // One day of a repeating event edits the whole series.
  const series = shown?.seriesId ? getState().events.find((x) => x.id === shown.seriesId) : undefined;
  const own = shown && !shown.google && !shown.jobId ? (series ?? shown) : undefined;
  const google = shown?.google ? shown : undefined;
  const googleEditable = !!google?.google?.writable && !google.google.multiDay && !!google.google.eventId && !!google.google.calendarId;

  const [form, setForm] = useState<Form>({ title: '', date: '', start: '', end: '', location: '', notes: '', repeat: '', target: LOCAL });
  const [busy, setBusy] = useState(false);
  const [forEvent, setForEvent] = useState<unknown>(null);
  if (event !== forEvent) {
    setForEvent(event);
    const src = own ?? google;
    const next = defaultStart ? toMinutes(defaultStart) : Math.ceil(nowMinutes() / 30) * 30;
    const start = src ? src.start ?? '' : fromMinutes(Math.min(next, 22 * 60));
    setForm({
      title: src?.title ?? '',
      date: src?.date ?? defaultDate,
      start,
      end: src ? src.end ?? '' : defaultEnd ?? fromMinutes(Math.min(toMinutes(start) + 60, 23 * 60 + 30)),
      location: src?.location ?? '',
      notes: src?.notes ?? '',
      repeat: own?.repeat?.freq ?? '',
      target: google?.google?.calendarId ?? LOCAL,
    });
  }
  const set = (p: Partial<Form>) => setForm((f) => ({ ...f, ...p }));
  const invalid = !!(form.start && form.end && form.end <= form.start);
  const toGoogle = form.target !== LOCAL;

  const repeat = (): Repeat | undefined => {
    if (!form.repeat) return undefined;
    // Keep chosen weekdays (e.g. "Mon, Wed, Fri" from quick add) while it stays weekly.
    if (own?.repeat?.freq === form.repeat) return own.repeat;
    return { freq: form.repeat };
  };

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || invalid || busy) return;
    const data = {
      title: form.title.trim(),
      date: form.date || today(),
      start: form.start || undefined,
      end: form.start ? form.end || undefined : undefined,
      location: form.location.trim() || undefined,
      notes: form.notes.trim() || undefined,
    };
    if (toGoogle) {
      // Asked for before anything is awaited, so Google's window may open from this click.
      setBusy(true);
      const eventId = google?.google?.eventId;
      allowGoogleEditing(account?.email)
        .then(() => saveGoogleEvent(form.target, { ...data, repeat: eventId ? undefined : repeat() }, eventId))
        .then(() => {
          toast(eventId ? 'Saved to Google Calendar' : `Added to ${calendars.find((c) => c.id === form.target)?.name ?? 'Google Calendar'}`);
          onClose();
        })
        .catch((err) => toast(err instanceof Error ? err.message : 'Couldn’t save to Google Calendar.', undefined, 7000))
        .finally(() => setBusy(false));
      return;
    }
    const r = repeat();
    if (own) actions.updateEvent(own.id, { ...data, repeat: r, ...(r ? {} : { skip: undefined, until: undefined }) });
    else actions.addEvent({ ...data, repeat: r });
    onClose();
  }

  function remove(scope: 'one' | 'all') {
    if (google) {
      if (!confirm(`Delete “${google.title}” from Google Calendar${google.google?.recurring ? ' (just this day)' : ''}?`)) return;
      setBusy(true);
      allowGoogleEditing(account?.email)
        .then(() => removeGoogleEvent(google.google!.calendarId!, google.google!.eventId!))
        .then(() => {
          toast('Deleted from Google Calendar');
          onClose();
        })
        .catch((err) => toast(err instanceof Error ? err.message : 'Couldn’t delete it.', undefined, 7000))
        .finally(() => setBusy(false));
      return;
    }
    if (!own) return;
    if (series && scope === 'one' && shown) {
      const skip = series.skip ?? [];
      actions.updateEvent(series.id, { skip: [...skip, shown.date] });
      toast('Removed this day', { label: 'Undo', run: () => actions.updateEvent(series.id, { skip }) });
    } else {
      const undo = actions.removeEvent(own.id);
      toast(own.repeat ? 'Repeating event deleted' : 'Event deleted', { label: 'Undo', run: undo });
    }
    onClose();
  }

  const label = google ? (googleEditable ? 'Google Calendar event' : 'Event details') : own ? 'Edit event' : 'New event';
  const weekday = fromKey(form.date || today()).toLocaleDateString(undefined, { weekday: 'long' });

  // Read-only: multi-day events and calendars you can't write to.
  if (google && !googleEditable) {
    return (
      <Dialog open={!!event} onClose={onClose} label={label}>
        <DialogHead title={google.title} onClose={onClose} />
        <div className="modal-body ev-details">
          <p className="ev-details-when">
            {fromKey(google.date).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
            {google.start ? ` · ${formatTime(google.start, use24h)}${google.end ? `–${formatTime(google.end, use24h)}` : ''}` : ' · all day'}
          </p>
          <p className="ev-details-cal">
            <i style={{ background: google.google?.color ?? 'var(--accent)' }} /> {google.google?.calendar}
          </p>
          {google.location && (
            <p>
              <MapPin size={13} /> {google.location}
            </p>
          )}
          {google.notes && (
            <p>
              <StickyNote size={13} /> {google.notes}
            </p>
          )}
          <small className="muted">{google.google?.multiDay ? 'Events over several days are changed in Google Calendar.' : 'This calendar is read-only for you.'}</small>
          <div className="modal-foot">
            <span className="spacer" />
            {google.google?.link && (
              <a className="btn primary" href={google.google.link} target="_blank" rel="noopener noreferrer">
                Open in Google Calendar <ExternalLink size={13} />
              </a>
            )}
          </div>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog open={!!event} onClose={onClose} label={label}>
      <DialogHead title={label} onClose={onClose} />
      <form className="modal-body" onSubmit={save}>
        <label className="field">
          <span>Title</span>
          <input className="input" autoFocus data-autofocus required value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="What’s happening?" />
        </label>
        <div className="row">
          <label className="field">
            <span>{form.repeat && !toGoogle ? 'From' : 'Date'}</span>
            <input className="input" type="date" required value={form.date} onChange={(e) => set({ date: e.target.value })} />
          </label>
          <label className="field">
            <span>Starts</span>
            <input className="input" type="time" value={form.start} onChange={(e) => set({ start: e.target.value })} />
          </label>
          <label className="field">
            <span>Ends</span>
            <input className="input" type="time" value={form.end} disabled={!form.start} onChange={(e) => set({ end: e.target.value })} />
          </label>
        </div>
        {invalid ? <small style={{ color: 'var(--bad)', marginTop: -6 }}>End time needs to be after the start.</small> : <small style={{ color: 'var(--muted)', marginTop: -6 }}>Leave the start empty for an all-day event.</small>}
        <div className="row">
          {!google && (
            <label className="field">
              <span>
                <RepeatIcon size={11} /> Repeats
              </span>
              <select className="input" value={form.repeat} onChange={(e) => set({ repeat: e.target.value as Form['repeat'] })}>
                <option value="">Doesn’t repeat</option>
                <option value="daily">Every day</option>
                <option value="weekdays">Every weekday (Mon–Fri)</option>
                <option value="weekly">{own?.repeat?.freq === 'weekly' ? repeatLabel(own.repeat) : `Every week on ${weekday}`}</option>
                <option value="monthly">Every month on the {fromKey(form.date || today()).getDate()}</option>
                <option value="yearly">Every year</option>
              </select>
            </label>
          )}
          {!own && !google && calendars.length > 0 && (
            <label className="field">
              <span>Save to</span>
              <select className="input" value={form.target} onChange={(e) => set({ target: e.target.value })}>
                <option value={LOCAL}>Dashboard only</option>
                {calendars.map((c) => (
                  <option key={c.id} value={c.id}>
                    Google · {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        {google?.google?.recurring && <small className="muted" style={{ marginTop: -6 }}>Part of a repeating Google event — changes apply to this day only.</small>}
        {series && <small className="muted" style={{ marginTop: -6 }}>Changes apply to every day of this repeating event.</small>}
        <label className="field">
          <span>Location</span>
          <input className="input" value={form.location} onChange={(e) => set({ location: e.target.value })} placeholder="Room, address or link" />
        </label>
        <label className="field">
          <span>Notes</span>
          <input className="input" value={form.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Agenda, prep…" />
        </label>
        <div className="modal-foot">
          {series && (
            <button type="button" className="btn ghost danger" onClick={() => remove('one')}>
              <Trash2 size={14} /> This day
            </button>
          )}
          {(own || google) && (
            <button type="button" className="btn ghost danger" disabled={busy} onClick={() => remove('all')}>
              <Trash2 size={14} /> {series ? 'All' : 'Delete'}
            </button>
          )}
          {google?.google?.link && (
            <a className="btn ghost" href={google.google.link} target="_blank" rel="noopener noreferrer" title="Open in Google Calendar">
              <ExternalLink size={14} />
            </a>
          )}
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? 'Saving…' : own || google ? 'Save' : 'Add event'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
