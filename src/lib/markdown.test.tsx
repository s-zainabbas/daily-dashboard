import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Markdown, noteTitle, toggleCheckbox } from './markdown';

const html = (t: string) => renderToStaticMarkup(<Markdown text={t} />);

describe('note formatting', () => {
  it('renders headings, emphasis, lists and links', () => {
    const out = html('# Plan\n**Bold** and *soft* with `code`\n- one\n- two\n1. first\n[Site](https://example.com) or https://x.org/a');
    expect(out).toContain('<h3>Plan</h3>');
    expect(out).toContain('<strong>Bold</strong>');
    expect(out).toContain('<em>soft</em>');
    expect(out).toContain('<code>code</code>');
    expect(out).toContain('<ul><li>one</li><li>two</li></ul><ol><li>first</li></ol>');
    expect(out).toContain('href="https://example.com/"');
    expect(out).toContain('>x.org/a</a>');
  });

  it('never injects HTML or unsafe links', () => {
    const out = html('<img src=x onerror=alert(1)> [bad](javascript:alert(1))');
    expect(out).not.toContain('<img');
    expect(out).not.toContain('href="javascript');
    expect(out).not.toContain('<a');
  });

  it('checkboxes', () => {
    expect(html('- [x] done\n- [ ] todo')).toContain('class="md-task done"');
    expect(toggleCheckbox('- [ ] a\n- [x] b', 0)).toBe('- [x] a\n- [x] b');
    expect(toggleCheckbox('- [ ] a\n- [x] b', 1)).toBe('- [ ] a\n- [ ] b');
  });

  it('titles fall back to the first line', () => {
    expect(noteTitle('', '\n# Trip ideas\nmore')).toBe('Trip ideas');
    expect(noteTitle('', '- [ ] Passport')).toBe('Passport');
    expect(noteTitle('Mine', 'x')).toBe('Mine');
    expect(noteTitle('', '')).toBe('Untitled');
  });
});
