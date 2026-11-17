/**
 * Voice input for quick add, with the browser's own speech recognition (Chrome, Edge, Safari).
 * Nothing is sent anywhere by the dashboard; the browser handles the audio.
 */

interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

type Ctor = new () => Recognition;

const ctor = (): Ctor | undefined =>
  typeof window === 'undefined' ? undefined : ((window as unknown as { SpeechRecognition?: Ctor }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: Ctor }).webkitSpeechRecognition);

export const speechSupported = () => !!ctor();

/** Listen once. `onText` gets the words so far (and the final ones); returns a stop function. */
export function listen(onText: (text: string, final: boolean) => void, onEnd: (error?: string) => void): () => void {
  const C = ctor();
  if (!C) {
    onEnd('unsupported');
    return () => {};
  }
  const r = new C();
  r.lang = navigator.language || 'en-US';
  r.interimResults = true;
  r.continuous = false;
  let error: string | undefined;
  r.onresult = (e) => {
    const parts = Array.from(e.results);
    const text = parts.map((x) => x[0].transcript).join(' ').replace(/\s+/g, ' ').trim();
    onText(text, parts.every((x) => x.isFinal));
  };
  r.onerror = (e) => (error = e.error);
  r.onend = () => onEnd(error);
  try {
    r.start();
  } catch {
    onEnd('busy');
  }
  return () => r.stop();
}
