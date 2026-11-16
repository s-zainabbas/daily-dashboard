import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/geist';
import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import './styles/app.css';
import App from './App';
import { demoState } from './lib/demo';
import { initKv } from './lib/kv';
import { demoMode, reloadFromStorage, replaceState, STORAGE_KEY } from './lib/store';
import { initDriveSync } from './lib/sync/driveSync';
import { BACKUP_KEY, BASE_KEY } from './lib/sync/local';
import { initCalendar } from './lib/gcal';
import { initPhoneReminders } from './lib/phoneReminders';

async function boot() {
  if (demoMode) {
    const demo = demoState('Alex');
    replaceState({ ...demo, settings: { ...demo.settings, location: { name: 'San Francisco, CA, US', latitude: 37.77, longitude: -122.42 } } });
  } else {
    // Your data lives in IndexedDB (no 5 MB limit). Load it before anything reads it.
    await initKv([STORAGE_KEY, BASE_KEY, BACKUP_KEY]);
    reloadFromStorage();
  }

  initDriveSync();
  initCalendar();
  initPhoneReminders();

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

boot();

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
