import { useEffect, useState } from 'react';

/** Re-render every `ms` milliseconds, aligned to the clock. */
export function useNow(ms = 1000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let id: ReturnType<typeof setTimeout>;
    const tick = () => {
      setNow(new Date());
      id = setTimeout(tick, ms - (Date.now() % ms));
    };
    id = setTimeout(tick, ms - (Date.now() % ms));
    return () => clearTimeout(id);
  }, [ms]);
  return now;
}

export function useMediaQuery(q: string): boolean {
  const [match, setMatch] = useState(() => matchMedia(q).matches);
  useEffect(() => {
    const m = matchMedia(q);
    const on = () => setMatch(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, [q]);
  return match;
}

/** Only allow http(s) links — blocks `javascript:` URLs, which the original allowed. */
export function safeUrl(raw: string): string | null {
  let v = raw.trim();
  if (!v) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(v)) v = `https://${v}`;
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

export function useResolvedTheme(theme: 'system' | 'dark' | 'light'): 'dark' | 'light' {
  const prefersLight = useMediaQuery('(prefers-color-scheme: light)');
  return theme === 'system' ? (prefersLight ? 'light' : 'dark') : theme;
}
