import { useEffect, useMemo, useState } from 'react';
import { BookOpen, CheckCircle2, ChevronLeft, ChevronRight, Search, Target, Timer } from 'lucide-react';
import { dateKey, formatDuration, fromKey, today as todayKey } from '../lib/date';
import { useStore } from '../lib/store';
import type { DayLog } from '../lib/types';
import { MOODS, Reflection } from './Panels';
import { Card, Empty, Segmented } from './ui';

type MoodFilter = 'all' | 'good' | 'tough';

/** Journal tab: a month of moods at a glance, today's review, and every past day, searchable. */
export function JournalView({ evening }: { evening: boolean }) {
  const journal = useStore((s) => s.journal);
  const t = todayKey();
  const [month, setMonth] = useState(() => t.slice(0, 7));
  const [q, setQ] = useState('');
  const [mood, setMood] = useState<MoodFilter>('all');
  const [picked, setPicked] = useState<string | null>(null);

  const byDate = useMemo(() => new Map(journal.map((j) => [j.date, j])), [journal]);
  const needle = q.trim().toLowerCase();
  const shown = journal.filter(
    (j) =>
      (mood === 'all' || (mood === 'good' ? (j.mood ?? 0) >= 4 : !!j.mood && j.mood <= 2)) &&
      (!needle || [j.shipped, j.slipped, j.priority, j.carries].some((v) => v?.toLowerCase().includes(needle))),
  );
  const hitRate = journal.filter((j) => j.priority).length ? Math.round((journal.filter((j) => j.priorityDone).length / journal.filter((j) => j.priority).length) * 100) : null;

  const open = (date: string) => {
    setPicked(date);
    setQ('');
    setMood('all');
    requestAnimationFrame(() => document.getElementById(`day-${date}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  };

  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<string>).detail;
      setMonth(d.slice(0, 7));
      open(d);
    };
    window.addEventListener('dd:open-day', on);
    return () => window.removeEventListener('dd:open-day', on);
  }, []);

  return (
    <main className="view-split journal-view" aria-label="Journal">
      <div className="col">
        <Card
          title="Past days"
          icon={<BookOpen size={16} />}
          meta={journal.length ? `${journal.length} logged` : undefined}
        >
          {journal.length > 0 && (
            <div className="job-tools journal-tools">
              <Segmented
                label="Filter by mood"
                value={mood}
                onChange={setMood}
                options={[
                  { value: 'all', label: 'All' },
                  { value: 'good', label: `${MOODS[3].face} Good days` },
                  { value: 'tough', label: `${MOODS[1].face} Tough days` },
                ]}
              />
              <label className="job-search">
                <Search size={13} />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search what shipped, slipped…" aria-label="Search the journal" />
              </label>
            </div>
          )}
          {journal.length === 0 ? (
            <Empty icon={<BookOpen size={26} />} title="Your journal starts tonight">
              Do the evening review (or press S for the shutdown routine). At midnight the day is saved here with your #1, tasks done and focus time.
            </Empty>
          ) : shown.length === 0 ? (
            <Empty title="No days match">Try a different search or filter.</Empty>
          ) : (
            <div className="journal-list">
              {shown.map((j) => (
                <DayEntry key={j.date} day={j} highlight={picked === j.date} />
              ))}
            </div>
          )}
        </Card>
      </div>
      <div className="col">
        <MonthCard month={month} setMonth={setMonth} byDate={byDate} today={t} onPick={open} />
        {journal.length > 0 && (
          <div className="journal-stats-row">
            <div className="card stat">
              <div>
                <div className="label">Days logged</div>
                <div className="value num">{journal.length}</div>
              </div>
            </div>
            <div className="card stat">
              <div>
                <div className="label">#1 priority hit</div>
                <div className="value num">{hitRate === null ? '—' : `${hitRate}%`}</div>
              </div>
            </div>
          </div>
        )}
        <Reflection evening={evening} />
      </div>
    </main>
  );
}

function DayEntry({ day: j, highlight }: { day: DayLog; highlight: boolean }) {
  return (
    <article className={`journal-day ${highlight ? 'picked' : ''}`} id={`day-${j.date}`}>
      <div className="journal-top">
        <b>{fromKey(j.date).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: j.date.slice(0, 4) === todayKey().slice(0, 4) ? undefined : 'numeric' })}</b>
        {j.mood && (
          <span className="mood-face" title={MOODS[j.mood - 1].label}>
            {MOODS[j.mood - 1].face}
          </span>
        )}
      </div>
      <div className="journal-stats num">
        {j.priority && (
          <span style={{ color: j.priorityDone ? 'var(--ok)' : undefined }}>
            <Target size={12} /> {j.priority} {j.priorityDone ? '✓' : ''}
          </span>
        )}
        <span>
          <CheckCircle2 size={12} /> {j.tasksDone} done
        </span>
        <span>
          <Timer size={12} /> {formatDuration(j.focusMinutes)}
        </span>
      </div>
      {j.shipped && (
        <div className="journal-line">
          <i>Shipped</i>
          <span style={{ whiteSpace: 'pre-wrap' }}>{j.shipped}</span>
        </div>
      )}
      {j.slipped && (
        <div className="journal-line">
          <i>Slipped</i>
          {j.slipped}
        </div>
      )}
    </article>
  );
}

/** One month as a calendar: each logged day shows its mood. */
function MonthCard({ month, setMonth, byDate, today: t, onPick }: {
  month: string;
  setMonth: (m: string) => void;
  byDate: Map<string, DayLog>;
  today: string;
  onPick: (date: string) => void;
}) {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const daysIn = new Date(y, m, 0).getDate();
  const lead = (first.getDay() + 6) % 7; // weeks start Monday
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysIn }, (_, i) => dateKey(new Date(y, m - 1, i + 1)))];
  const shift = (n: number) => {
    const d = new Date(y, m - 1 + n, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };
  return (
    <Card
      title={first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
      actions={
        <>
          <button className="icon-btn sm" onClick={() => shift(-1)} aria-label="Previous month">
            <ChevronLeft size={16} />
          </button>
          <button className="icon-btn sm" onClick={() => shift(1)} aria-label="Next month" disabled={month >= t.slice(0, 7)}>
            <ChevronRight size={16} />
          </button>
        </>
      }
    >
      <div className="month">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <span key={i} className="month-head">
            {d}
          </span>
        ))}
        {cells.map((d, i) => {
          if (!d) return <span key={`x${i}`} />;
          const j = byDate.get(d);
          const label = fromKey(d).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
          return j ? (
            <button key={d} className={`month-day logged ${d === t ? 'today' : ''}`} onClick={() => onPick(d)} aria-label={`${label}${j.mood ? `, ${MOODS[j.mood - 1].label}` : ''}`} title={label}>
              <small className="num">{Number(d.slice(8))}</small>
              <span>{j.mood ? MOODS[j.mood - 1].face : '•'}</span>
            </button>
          ) : (
            <span key={d} className={`month-day ${d === t ? 'today' : ''} ${d > t ? 'future' : ''}`}>
              <small className="num">{Number(d.slice(8))}</small>
            </span>
          );
        })}
      </div>
    </Card>
  );
}
