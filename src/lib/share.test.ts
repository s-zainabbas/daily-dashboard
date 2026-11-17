import { describe, expect, it } from 'vitest';
import { readShare, withoutShare } from './share';

describe('shared from another app', () => {
  it('nothing shared', () => {
    expect(readShare('?action=plan')).toBeNull();
  });
  it('a page with a title and link', () => {
    expect(readShare('?share-title=Great%20article&share-url=https%3A%2F%2Fexample.com%2Fa')).toEqual({ title: 'Great article', body: 'https://example.com/a', url: 'https://example.com/a' });
  });
  it('a link inside the text (how many Android apps share)', () => {
    expect(readShare('?share-text=Check%20this%20out%20https%3A%2F%2Fwww.example.com%2Fx')).toEqual({ title: 'Check this out', body: 'https://www.example.com/x', url: 'https://www.example.com/x' });
  });
  it('just a link: named after the site', () => {
    expect(readShare('?share-text=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3D1')?.title).toBe('youtube.com');
  });
  it('several lines of text: first line is the title', () => {
    expect(readShare('?share-text=Buy%20milk%0Aand%20eggs')).toMatchObject({ title: 'Buy milk', body: 'and eggs' });
  });
  it('cleans the address afterwards', () => {
    expect(withoutShare('?share-title=a&share-url=b')).toBe('');
    expect(withoutShare('?demo&share-text=a')).toBe('?demo=');
  });
});
