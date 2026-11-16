/**
 * System notifications. Phones (Android Chrome, installed apps) only allow notifications shown by
 * the service worker, so that's tried first; `new Notification()` is the fallback for desktop
 * browsers and for development, where no service worker is registered.
 */
export async function notify(title: string, options: NotificationOptions = {}): Promise<void> {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const opts: NotificationOptions = { icon: './icon-192.png', badge: './icon-192.png', ...options };
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    if (reg?.active) {
      await reg.showNotification(title, opts);
      return;
    }
  } catch {
    /* fall back below */
  }
  try {
    new Notification(title, opts);
  } catch {
    /* not supported here */
  }
}
