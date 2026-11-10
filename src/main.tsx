import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/geist';
import '@fontsource/instrument-serif/400.css';
import '@fontsource/instrument-serif/400-italic.css';
import './styles/app.css';
import App from './App';
import { demoState } from './lib/demo';
import { demoMode, replaceState } from './lib/store';
import { initDriveSync } from './lib/sync/driveSync';
import { initCalendar } from './lib/gcal';

if (demoMode) {
  const demo = demoState('Alex');
  replaceState({ ...demo, settings: { ...demo.settings, location: { name: 'San Francisco, CA, US', latitude: 37.77, longitude: -122.42 } } });
}

initDriveSync();
initCalendar();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
