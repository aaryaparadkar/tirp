/**
 * Medibank OSHC provider search.
 *
 * Reverse-engineered from https://www.medibankoshc.com.au/find-provider/
 * (bundle main.*-oshc.js, config providers-oshc.js):
 *
 *   POST https://www.medibank.com.au/api/provider-search/v1/search/
 *   { serviceTypes: [<value>], pageNumber: 0, pageSize: 100,
 *     location: { latitude, longitude }, searchRadius: <km> }
 *   → { providers: [...], resultsRadius }
 *
 * Results come back unsorted; each provider carries distance (km), address,
 * phone and tradingHours.openDays { MON..SUN: "9:00 AM – 6:00 PM" | ... }.
 *
 * The public page deep-links as
 *   /find-provider/#/List/<Suburb>_<STATE>_<postcode>,_Australia/<Type_Label>
 * which is what we hand back as "see more options".
 */
import type { Place } from './postcodes.js';

export type ProviderTypeKey = 'gp' | 'dbc' | 'hospital' | 'afterhours';

export interface ProviderType {
  key: ProviderTypeKey;
  /** Label used by the Medibank page (and its URL slug). */
  label: string;
  /** serviceTypes value the API expects. */
  serviceType: string;
  /** Short label for WhatsApp list rows (max 24 chars). */
  short: string;
  description: string;
}

export const PROVIDER_TYPES: ProviderType[] = [
  { key: 'gp', label: 'General Practitioners (GP)', serviceType: 'GENERAL PRACTICE CLINIC', short: 'GP (doctor)', description: 'General practitioners for everyday health issues' },
  { key: 'dbc', label: 'OSHC Direct Billing Clinic', serviceType: 'GENERAL PRACTICE CLINIC', short: 'Direct Billing Clinic', description: 'Clinics that bill Medibank directly — little or no upfront cost' },
  { key: 'hospital', label: 'Hospitals', serviceType: 'Hospitals', short: 'Hospital', description: 'Hospitals and day facilities' },
  { key: 'afterhours', label: 'Medical Deputising Services (after hours doctor home visits)', serviceType: 'MEDICAL DEPUTISING SERVICE', short: 'After-hours home GP', description: 'A doctor visits you at home after hours' },
];

export function providerType(key: ProviderTypeKey): ProviderType {
  return PROVIDER_TYPES.find((t) => t.key === key)!;
}

export const SEARCH_API_URL = 'https://www.medibank.com.au/api/provider-search/v1/search/';
const FIND_PROVIDER_BASE = 'https://www.medibankoshc.com.au/find-provider/#/List/';

/** Encode a hash-route segment: spaces→_, and (),' percent-encoded so WhatsApp links don't break. */
function routeSegment(value: string): string {
  return encodeURIComponent(value.trim().replace(/\s+/g, '_'))
    .replace(/%2C/gi, ',')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/'/g, '%27');
}

/**
 * Rebuild the public find-provider URL, e.g.
 * https://www.medibankoshc.com.au/find-provider/#/List/Parkville_VIC_3052,_Australia/General_Practitioners_%28GP%29
 */
export function findProviderUrl(place: Pick<Place, 'suburb' | 'state' | 'postcode'>, type: ProviderTypeKey): string {
  const location = routeSegment(`${place.suburb} ${place.state} ${place.postcode}, Australia`);
  return `${FIND_PROVIDER_BASE}${location}/${routeSegment(providerType(type).label)}`;
}

export interface Provider {
  id: string;
  name: string;
  distanceKm: number;
  address: string;
  state: string;
  phone: string;
  website: string;
  latitude: number | null;
  longitude: number | null;
  openDays: Record<string, string>;
}

interface RawProvider {
  id?: string;
  url?: string;
  name?: { businessName?: string; title?: string; firstName?: string; lastName?: string };
  distance?: number;
  location?: { latitude?: number; longitude?: number };
  address?: { line1?: string; line2?: string; suburb?: string; state?: string; postcode?: string };
  tradingHours?: { openDays?: Record<string, string> };
  phone?: string;
}

function clean(value: string | undefined): string {
  return (value || '').replace(/\s*,\s*/g, ', ').replace(/\s+/g, ' ').trim().replace(/,$/, '');
}

export function normalizeProvider(raw: RawProvider): Provider {
  const n = raw.name || {};
  const person = [n.title, n.firstName, n.lastName].map(clean).filter(Boolean).join(' ');
  const a = raw.address || {};
  const street = [clean(a.line1), clean(a.line2)].filter(Boolean).join(', ');
  const locality = [clean(a.suburb), clean(a.state), clean(a.postcode)].filter(Boolean).join(' ');
  return {
    id: String(raw.id ?? ''),
    name: clean(n.businessName) || person || 'Provider',
    distanceKm: typeof raw.distance === 'number' ? raw.distance : Number.POSITIVE_INFINITY,
    address: [street, locality].filter(Boolean).join(', '),
    state: clean(a.state).toUpperCase(),
    phone: clean(raw.phone),
    website: clean(raw.url),
    latitude: typeof raw.location?.latitude === 'number' ? raw.location.latitude : null,
    longitude: typeof raw.location?.longitude === 'number' ? raw.location.longitude : null,
    openDays: raw.tradingHours?.openDays || {},
  };
}

export interface SearchOptions {
  radiusKm?: number;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/** Call the Medibank search API. Throws on network/HTTP errors. */
export async function searchProviders(place: Place, type: ProviderTypeKey, opts: SearchOptions = {}): Promise<Provider[]> {
  const doFetch = opts.fetchImpl || fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? Number(process.env.PROVIDER_SEARCH_TIMEOUT_MS || 8000));
  try {
    const res = await doFetch(process.env.PROVIDER_SEARCH_URL || SEARCH_API_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        // Same headers the official page sends.
        x_mspa_mode: 'dev',
        x_mspa_version: '1.9',
        x_mspa_version_label: '3.2.0',
        Origin: 'https://www.medibankoshc.com.au',
        Referer: 'https://www.medibankoshc.com.au/find-provider/',
      },
      body: JSON.stringify({
        serviceTypes: [providerType(type).serviceType],
        pageNumber: 0,
        pageSize: 100,
        location: { latitude: place.latitude, longitude: place.longitude },
        searchRadius: opts.radiusKm ?? 10,
      }),
    });
    if (!res.ok) throw new Error(`Provider search HTTP ${res.status}`);
    const body = (await res.json()) as { providers?: RawProvider[] };
    return (body.providers || []).map(normalizeProvider).sort((a, b) => a.distanceKm - b.distanceKm);
  } finally {
    clearTimeout(timer);
  }
}

/** Widen the radius until something turns up (10 → 25 → 50 km). */
export async function searchNearest(place: Place, type: ProviderTypeKey, opts: SearchOptions = {}): Promise<{ providers: Provider[]; radiusKm: number }> {
  for (const radiusKm of [10, 25, 50]) {
    const providers = await searchProviders(place, type, { ...opts, radiusKm });
    if (providers.length) return { providers, radiusKm };
  }
  return { providers: [], radiusKm: 50 };
}

// ---------------------------------------------------------------------------
// Opening hours
// ---------------------------------------------------------------------------

const DAY_KEYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;

const STATE_TZ: Record<string, string> = {
  VIC: 'Australia/Melbourne',
  NSW: 'Australia/Sydney',
  ACT: 'Australia/Sydney',
  TAS: 'Australia/Hobart',
  QLD: 'Australia/Brisbane',
  SA: 'Australia/Adelaide',
  NT: 'Australia/Darwin',
  WA: 'Australia/Perth',
};

/** Clean the API's hours text: "9:30?AM?–?5:30?PM" → "9:30 AM – 5:30 PM". */
export function cleanHours(value: string | undefined): string {
  return (value || '')
    .replace(/[?   ]/g, ' ')
    .replace(/\s*[–—-]\s*/g, ' – ')
    .replace(/\s+/g, ' ')
    .trim();
}

export type DayHours =
  | { kind: 'unknown' }
  | { kind: 'closed' }
  | { kind: 'always' }
  | { kind: 'ranges'; ranges: Array<[number, number]> }; // minutes from midnight; end may exceed 1440 (overnight)

function toMinutes(h: string, m: string, meridiem: string): number {
  let hour = Number(h) % 12;
  if (meridiem === 'PM') hour += 12;
  return hour * 60 + Number(m || 0);
}

/** Parse one day's hours. Handles split shifts, missing start AM/PM and overnight ranges. */
export function parseDayHours(value: string | undefined): DayHours {
  const text = cleanHours(value).toUpperCase();
  if (!text) return { kind: 'unknown' };
  if (/CLOSED/.test(text)) return { kind: 'closed' };
  if (/24\s*HOURS|24\/7/.test(text)) return { kind: 'always' };
  const ranges: Array<[number, number]> = [];
  for (const part of text.split(/[,;&]| AND /)) {
    const m = /(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?\s*–\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/.exec(part);
    if (!m) continue;
    const endMer = m[6];
    const end = toMinutes(m[4], m[5], endMer);
    // "3:00 – 9:00 PM" → start shares the end's meridiem unless that puts it after the end.
    let start = toMinutes(m[1], m[2], m[3] || endMer);
    if (!m[3] && start > end) start = toMinutes(m[1], m[2], endMer === 'PM' ? 'AM' : 'PM');
    let endAdj = end;
    if (endAdj <= start) endAdj += 1440; // "6:00 PM – 8:00 AM", "12:00 PM – 12:00 AM"
    ranges.push([start, endAdj]);
  }
  return ranges.length ? { kind: 'ranges', ranges } : { kind: 'unknown' };
}

/** Local weekday + minutes-since-midnight for a provider's state. */
export function localClock(state: string, now: Date = new Date()): { day: (typeof DAY_KEYS)[number]; minutes: number } {
  const tz = STATE_TZ[state] || 'Australia/Melbourne';
  const parts = new Intl.DateTimeFormat('en-AU', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const weekday = parts.find((p) => p.type === 'weekday')?.value.slice(0, 3).toUpperCase() || 'MON';
  const hour = Number(parts.find((p) => p.type === 'hour')?.value || 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value || 0);
  return { day: (DAY_KEYS as readonly string[]).includes(weekday) ? (weekday as (typeof DAY_KEYS)[number]) : 'MON', minutes: hour * 60 + minute };
}

/** true = open now, false = closed now, null = hours not listed. */
export function isOpenNow(provider: Pick<Provider, 'openDays' | 'state'>, now: Date = new Date()): boolean | null {
  const { day, minutes } = localClock(provider.state, now);
  const today = parseDayHours(provider.openDays[day]);
  const yesterdayKey = DAY_KEYS[(DAY_KEYS.indexOf(day) + 6) % 7];
  const yesterday = parseDayHours(provider.openDays[yesterdayKey]);
  // Spill-over from last night's overnight shift ("6:00 PM – 8:00 AM").
  if (yesterday.kind === 'ranges' && yesterday.ranges.some(([, end]) => end > 1440 && minutes < end - 1440)) return true;
  switch (today.kind) {
    case 'always':
      return true;
    case 'closed':
      return false;
    case 'unknown':
      return null;
    case 'ranges':
      return today.ranges.some(([start, end]) => minutes >= start && minutes < end);
  }
}

/** Today's hours as display text ("9:00 AM – 6:00 PM", "Closed today", "Open 24 hours"). */
export function hoursToday(provider: Pick<Provider, 'openDays' | 'state'>, now: Date = new Date()): string | null {
  const { day } = localClock(provider.state, now);
  const parsed = parseDayHours(provider.openDays[day]);
  if (parsed.kind === 'unknown') return null;
  if (parsed.kind === 'closed') return 'Closed today';
  if (parsed.kind === 'always') return 'Open 24 hours';
  return cleanHours(provider.openDays[day]);
}

export function mapsLink(provider: Provider): string {
  const q = provider.latitude !== null && provider.longitude !== null
    ? `${provider.latitude},${provider.longitude}`
    : `${provider.name}, ${provider.address}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}
