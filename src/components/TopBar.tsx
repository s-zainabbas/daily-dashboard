import { useEffect, useState } from 'react';
import { BookOpen, Command, MapPin, Moon, Settings as Cog, Sun } from 'lucide-react';
import { greeting, longDate } from '../lib/date';
import { useNow, useResolvedTheme } from '../lib/hooks';
import { actions, useStore } from '../lib/store';
import { cachedWeather, describe, fetchWeather, type Weather } from '../lib/weather';

function isoWeek(d: Date) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - y.getTime()) / 864e5 + 1) / 7);
}

async function reverseGeocode(lat: number, lon: number): Promise<string> {
  try {
    const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`);
    const j = await r.json();
    return j.city || j.locality || j.principalSubdivision || 'Your location';
  } catch {
    return 'Your location';
  }
}

function WeatherPill({ onOpenSettings }: { onOpenSettings: () => void }) {
  const location = useStore((s) => s.settings.location);
  const units = useStore((s) => s.settings.units);
  const [w, setW] = useState<Weather | null>(() => cachedWeather());
  const [status, setStatus] = useState<'idle' | 'loading' | 'denied' | 'error'>('idle');

  useEffect(() => {
    let cancelled = false;
    const cached = cachedWeather();
    if (cached && (!location || cached.place === location.name)) {
      setW(cached);
      return;
    }
    const load = (lat: number, lon: number, place: string) =>
      fetchWeather(lat, lon, place, units)
        .then((x) => !cancelled && setW(x))
        .catch(() => !cancelled && setStatus('error'));

    setStatus('loading');
    if (location) {
      load(location.latitude, location.longitude, location.name);
    } else if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        async ({ coords }) => {
          const place = await reverseGeocode(coords.latitude, coords.longitude);
          if (cancelled) return;
          actions.setSettings({ location: { name: place, latitude: coords.latitude, longitude: coords.longitude } });
        },
        () => !cancelled && setStatus('denied'),
        { timeout: 10_000, maximumAge: 36e5 },
      );
    } else setStatus('denied');
    const id = setInterval(() => location && load(location.latitude, location.longitude, location.name), 30 * 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [location, units]);

  if (!w) {
    return (
      <button className="weather" onClick={onOpenSettings}>
        <div className="weather-icon">
          <MapPin size={16} />
        </div>
        <div>
          <strong>{status === 'loading' ? 'Checking the sky…' : 'Add your city'}</strong>
          <span>{status === 'loading' ? 'Fetching local weather' : 'For local weather'}</span>
        </div>
      </button>
    );
  }
  const { label, Icon } = describe(w.code, w.isDay);
  return (
    <button className="weather" onClick={onOpenSettings} title="Change location">
      <div className="weather-icon">
        <Icon size={18} />
      </div>
      <div>
        <strong className="num">
          {w.temp}° · {label}
        </strong>
        <span className="num">
          {w.place.split(',')[0]} · H {w.high}° L {w.low}°{w.rainChance >= 30 ? ` · ${w.rainChance}% rain` : ''}
        </span>
      </div>
    </button>
  );
}

export function TopBar({ onPalette, onJournal, onSettings }: { onPalette: () => void; onJournal: () => void; onSettings: () => void }) {
  const now = useNow(1000);
  const name = useStore((s) => s.settings.name);
  const use24h = useStore((s) => s.settings.use24h);
  const theme = useStore((s) => s.settings.theme);
  const isLight = useResolvedTheme(theme) === 'light';

  return (
    <header className="topbar">
      <div className="greeting">
        <h1>
          {greeting(now)}
          {name ? (
            <>
              , <em>{name}</em>.
            </>
          ) : (
            '.'
          )}
        </h1>
        <div className="dateline">
          <span>{longDate(now)}</span>
          <span className="dot-sep" />
          <span>Week {isoWeek(now)}</span>
          <span className="dot-sep" />
          <span className="clock num">{now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: !use24h })}</span>
        </div>
      </div>
      <div className="top-right">
        <WeatherPill onOpenSettings={onSettings} />
        <div className="toolbar">
          <button className="icon-btn" onClick={onPalette} title="Command menu (⌘K)" aria-label="Open command menu">
            <Command size={17} />
          </button>
          <button className="icon-btn" onClick={onJournal} title="Journal (J)" aria-label="Open journal">
            <BookOpen size={17} />
          </button>
          <button
            className="icon-btn"
            onClick={() => actions.setSettings({ theme: isLight ? 'dark' : 'light' })}
            title={`Switch to ${isLight ? 'dark' : 'light'} mode (T)`}
            aria-label="Toggle theme"
          >
            {isLight ? <Moon size={17} /> : <Sun size={17} />}
          </button>
          <button className="icon-btn" onClick={onSettings} title="Settings" aria-label="Open settings">
            <Cog size={17} />
          </button>
        </div>
      </div>
    </header>
  );
}
