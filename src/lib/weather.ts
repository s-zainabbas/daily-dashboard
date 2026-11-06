import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Moon, Sun, type LucideIcon } from 'lucide-react';

export interface Weather {
  temp: number;
  feels: number;
  high: number;
  low: number;
  code: number;
  isDay: boolean;
  rainChance: number;
  place: string;
  fetchedAt: number;
}

const CACHE_KEY = 'daily-dashboard:weather';

export function describe(code: number, isDay = true): { label: string; Icon: LucideIcon } {
  if (code === 0) return { label: 'Clear', Icon: isDay ? Sun : Moon };
  if (code <= 2) return { label: code === 1 ? 'Mostly clear' : 'Partly cloudy', Icon: isDay ? CloudSun : Cloud };
  if (code === 3) return { label: 'Overcast', Icon: Cloud };
  if (code <= 48) return { label: 'Foggy', Icon: CloudFog };
  if (code <= 57) return { label: 'Drizzle', Icon: CloudDrizzle };
  if (code <= 67 || (code >= 80 && code <= 82)) return { label: code >= 80 ? 'Showers' : 'Rain', Icon: CloudRain };
  if (code <= 77 || code === 85 || code === 86) return { label: 'Snow', Icon: CloudSnow };
  return { label: 'Thunderstorms', Icon: CloudLightning };
}

export function cachedWeather(): Weather | null {
  try {
    const w = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null') as Weather | null;
    return w && Date.now() - w.fetchedAt < 30 * 60_000 ? w : null;
  } catch {
    return null;
  }
}

export async function fetchWeather(lat: number, lon: number, place: string, units: 'c' | 'f'): Promise<Weather> {
  const u = new URL('https://api.open-meteo.com/v1/forecast');
  u.search = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: 'temperature_2m,apparent_temperature,weather_code,is_day',
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    temperature_unit: units === 'f' ? 'fahrenheit' : 'celsius',
    timezone: 'auto',
    forecast_days: '1',
  }).toString();
  const r = await fetch(u);
  if (!r.ok) throw new Error(`Weather request failed (${r.status})`);
  const j = await r.json();
  const w: Weather = {
    temp: Math.round(j.current.temperature_2m),
    feels: Math.round(j.current.apparent_temperature),
    code: j.current.weather_code,
    isDay: !!j.current.is_day,
    high: Math.round(j.daily.temperature_2m_max[0]),
    low: Math.round(j.daily.temperature_2m_min[0]),
    rainChance: j.daily.precipitation_probability_max?.[0] ?? 0,
    place,
    fetchedAt: Date.now(),
  };
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(w));
  } catch {
    /* cache is optional */
  }
  return w;
}

export function clearWeatherCache() {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}

export interface Place {
  name: string;
  latitude: number;
  longitude: number;
}

export async function searchPlaces(q: string): Promise<Place[]> {
  const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=5&language=en&name=${encodeURIComponent(q)}`);
  if (!r.ok) return [];
  const j = await r.json();
  return (j.results ?? []).map((p: any) => ({
    name: [p.name, p.admin1, p.country_code].filter(Boolean).join(', '),
    latitude: p.latitude,
    longitude: p.longitude,
  }));
}
