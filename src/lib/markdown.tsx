import { Fragment, type ReactNode } from 'react';
import { safeUrl } from './hooks';

/**
 * A small, safe renderer for note formatting — never injects HTML.
 *   # Heading / ## Smaller heading
 *   **bold**, *italic*, `code`, [text](https://link) and bare https:// links
 *   - list item, 1. numbered item
 *   - [ ] checkbox / - [x] done (clickable when `onToggle` is given)
 */

const INLINE = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\)|https?:\/\/[^\s)]+)/g;

export function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(INLINE)) {
    const tok = m[0];
    if (m.index! > last) out.push(text.slice(last, m.index));
    const k = i++;
    if (tok.startsWith('**')) out.push(<strong key={k}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith('`')) out.push(<code key={k}>{tok.slice(1, -1)}</code>);
    else if (tok.startsWith('*')) out.push(<em key={k}>{tok.slice(1, -1)}</em>);
    else {
      const md = tok.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
      const href = safeUrl(md ? md[2] : tok);
      out.push(
        href ? (
          <a key={k} href={href} target="_blank" rel="noopener noreferrer">
            {md ? md[1] : tok.replace(/^https?:\/\/(www\.)?/, '')}
          </a>
        ) : (
          tok
        ),
      );
    }
    last = m.index! + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text, onToggle }: { text: string; onToggle?: (line: number) => void }) {
  const lines = text.split('\n');
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: ReactNode[] } | null = null;
  const flush = () => {
    if (!list) return;
    blocks.push(list.ordered ? <ol key={blocks.length}>{list.items}</ol> : <ul key={blocks.length}>{list.items}</ul>);
    list = null;
  };

  lines.forEach((raw, n) => {
    const line = raw.trimEnd();
    const task = line.match(/^\s*[-*]\s+\[([ xX])\]\s?(.*)$/);
    const bullet = line.match(/^\s*[-*•–]\s+(.*)$/);
    const num = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const head = line.match(/^(#{1,3})\s+(.*)$/);
    if (task || bullet || num) {
      const ordered = !!num && !task && !bullet;
      if (list && list.ordered !== ordered) flush();
      list ??= { ordered, items: [] };
      if (task) {
        const done = task[1].toLowerCase() === 'x';
        list.items.push(
          <li key={n} className={`md-task ${done ? 'done' : ''}`}>
            <input type="checkbox" checked={done} disabled={!onToggle} onChange={() => onToggle?.(n)} aria-label={task[2] || 'Checkbox'} />
            <span>{inline(task[2])}</span>
          </li>,
        );
      } else list.items.push(<li key={n}>{inline((bullet ?? num)![1])}</li>);
      return;
    }
    flush();
    if (head) {
      const H = (['h3', 'h4', 'h5'] as const)[head[1].length - 1];
      blocks.push(<H key={n}>{inline(head[2])}</H>);
    } else if (!line.trim()) blocks.push(<div key={n} className="md-gap" />);
    else blocks.push(<p key={n}>{inline(line)}</p>);
  });
  flush();
  return <div className="md">{blocks.map((b, i) => <Fragment key={i}>{b}</Fragment>)}</div>;
}

/** Tick or untick the checkbox on line `n`. */
export function toggleCheckbox(text: string, n: number): string {
  const lines = text.split('\n');
  lines[n] = lines[n].replace(/\[([ xX])\]/, (_, c: string) => (c.trim() ? '[ ]' : '[x]'));
  return lines.join('\n');
}

/** A note's title: its own, or its first line without formatting. */
export function noteTitle(title: string, body: string): string {
  if (title.trim()) return title.trim();
  const first = body.split('\n').find((l) => l.trim()) ?? '';
  return first.replace(/^#+\s*|^\s*[-*]\s+(\[[ xX]\]\s*)?|\*\*/g, '').trim().slice(0, 60) || 'Untitled';
}
