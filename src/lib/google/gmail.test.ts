import { afterEach, describe, expect, it, vi } from 'vitest';
import { gmailLink, listStarred, senderName } from './gmail';

describe('Gmail', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows the sender’s name', () => {
    expect(senderName('"Sam Lee" <sam@x.com>')).toBe('Sam Lee');
    expect(senderName('Dana <d@y.io>')).toBe('Dana');
    expect(senderName('noreply@z.com')).toBe('noreply@z.com');
  });

  it('lists starred emails, newest first', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/messages?')) return new Response(JSON.stringify({ messages: [{ id: 'a', threadId: 'ta' }, { id: 'b', threadId: 'tb' }] }));
        const id = url.includes('/messages/a') ? 'a' : 'b';
        return new Response(
          JSON.stringify({ id, threadId: `t${id}`, snippet: 'Hi &amp; hello', internalDate: id === 'a' ? '1000' : '2000', payload: { headers: [{ name: 'Subject', value: `Subject ${id}` }, { name: 'From', value: 'Sam <s@x.com>' }] } }),
        );
      }),
    );
    const out = await listStarred('tok');
    expect(out.map((m) => [m.id, m.subject, m.from, m.snippet])).toEqual([
      ['b', 'Subject b', 'Sam', 'Hi & hello'],
      ['a', 'Subject a', 'Sam', 'Hi & hello'],
    ]);
  });

  it('explains when the Gmail API is switched off', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { message: 'Gmail API has not been used', errors: [{ reason: 'accessNotConfigured' }] } }), { status: 403 })));
    await expect(listStarred('tok')).rejects.toMatchObject({ kind: 'disabled' });
  });

  it('links to the conversation in the right account', () => {
    expect(gmailLink('t1', 'me@gmail.com')).toBe('https://mail.google.com/mail/?authuser=me%40gmail.com#all/t1');
  });
});
