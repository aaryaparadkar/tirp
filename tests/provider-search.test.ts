import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseProviderType, renderResults, wantsProviderSearch } from '../src/providers/flow.js';
import { lookupPlace, placeForPostcode } from '../src/providers/postcodes.js';
import {
  cleanHours,
  findProviderUrl,
  isOpenNow,
  normalizeProvider,
  parseDayHours,
  searchProviders,
} from '../src/providers/search.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/provider-search-parkville-gp.json', import.meta.url), 'utf8'));
// Saturday 31 Oct 2026 2:30 pm AEDT
const SAT_AFTERNOON = new Date('2026-10-31T03:30:00Z');

describe('find-provider URL', () => {
  it('rebuilds the public deep link for every type', () => {
    const place = placeForPostcode('3052')!;
    expect(findProviderUrl(place, 'gp')).toBe('https://www.medibankoshc.com.au/find-provider/#/List/Parkville_VIC_3052,_Australia/General_Practitioners_%28GP%29');
    expect(findProviderUrl(place, 'dbc')).toBe('https://www.medibankoshc.com.au/find-provider/#/List/Parkville_VIC_3052,_Australia/OSHC_Direct_Billing_Clinic');
    expect(findProviderUrl(place, 'hospital')).toBe('https://www.medibankoshc.com.au/find-provider/#/List/Parkville_VIC_3052,_Australia/Hospitals');
    expect(findProviderUrl(place, 'afterhours')).toBe('https://www.medibankoshc.com.au/find-provider/#/List/Parkville_VIC_3052,_Australia/Medical_Deputising_Services_%28after_hours_doctor_home_visits%29');
  });
});

describe('postcode lookup', () => {
  it('resolves postcodes and suburbs', () => {
    expect(placeForPostcode('3052')).toMatchObject({ suburb: 'Parkville', state: 'VIC' });
    expect(placeForPostcode('2000')).toMatchObject({ suburb: 'Sydney', state: 'NSW' });
    expect(lookupPlace('my postcode is 3053')).toMatchObject({ kind: 'found', place: { suburb: 'Carlton' } });
    expect(lookupPlace('Parkville VIC')).toMatchObject({ kind: 'found', place: { postcode: '3052', suburb: 'Parkville' } });
    expect(lookupPlace('carlton').kind).toBe('ambiguous');
    expect(lookupPlace('9999')).toEqual({ kind: 'unknown_postcode', postcode: '9999' });
    expect(lookupPlace('hello').kind).toBe('none');
  });
});

describe('opening hours', () => {
  it('cleans the API mojibake', () => {
    expect(cleanHours('9:30?AM?–?5:30?PM')).toBe('9:30 AM – 5:30 PM');
    expect(cleanHours(' 8:00 AM – 5:00 PM')).toBe('8:00 AM – 5:00 PM');
  });
  it('parses every format seen in the live API', () => {
    expect(parseDayHours('')).toEqual({ kind: 'unknown' });
    expect(parseDayHours(' CLOSED')).toEqual({ kind: 'closed' });
    expect(parseDayHours(' OPEN 24 HOURS')).toEqual({ kind: 'always' });
    expect(parseDayHours('9:00 AM – 6:00 PM')).toEqual({ kind: 'ranges', ranges: [[540, 1080]] });
    expect(parseDayHours('1:00?–?5:30?PM')).toEqual({ kind: 'ranges', ranges: [[780, 1050]] });
    expect(parseDayHours('12:00 – 1:00 PM, 4:00 – 8:00 PM')).toEqual({ kind: 'ranges', ranges: [[720, 780], [960, 1200]] });
    expect(parseDayHours('11:00 – 1:00 PM')).toEqual({ kind: 'ranges', ranges: [[660, 780]] });
    expect(parseDayHours(' 6:00 PM – 8:00 AM')).toEqual({ kind: 'ranges', ranges: [[1080, 1920]] });
    expect(parseDayHours(' 12:00 PM – 12:00 AM')).toEqual({ kind: 'ranges', ranges: [[720, 1440]] });
  });
  it('knows who is open now (in the provider state timezone)', () => {
    const providers = fixture.providers.map(normalizeProvider);
    const open = providers.filter((p: ReturnType<typeof normalizeProvider>) => isOpenNow(p, SAT_AFTERNOON) === true).map((p: { name: string }) => p.name);
    expect(open).toEqual(['Primecare Medical']);
    const sundayAllUnknown = providers.map((p: ReturnType<typeof normalizeProvider>) => isOpenNow(p, new Date('2026-11-01T01:00:00Z')));
    expect(sundayAllUnknown.every((v: boolean | null) => v === null)).toBe(true);
  });
  it('overnight shifts stay open after midnight', () => {
    const p = { state: 'QLD', openDays: { MON: ' 6:00 PM – 8:00 AM', TUE: ' 6:00 PM – 8:00 AM' } };
    // Tuesday 2:00 am Brisbane (UTC+10) = Monday 16:00Z
    expect(isOpenNow(p, new Date('2026-11-02T16:00:00Z'))).toBe(true);
    // Tuesday 10:00 am Brisbane
    expect(isOpenNow(p, new Date('2026-11-03T00:00:00Z'))).toBe(false);
  });
});

describe('result rendering', () => {
  it('shows only open providers, nearest first, max two', () => {
    const providers = fixture.providers.map(normalizeProvider);
    const r = renderResults(placeForPostcode('3052')!, 'gp', providers, 'en', SAT_AFTERNOON);
    expect(r.shown.map((p) => p.name)).toEqual(['Primecare Medical']);
    expect(r.text).toMatch(/📍 Suite 101, 538-540 Swanston Street, Carlton VIC 3053/);
    expect(r.text).toMatch(/📞 03 8820 1788/);
    expect(r.text).toMatch(/🗺️ https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=-37\.80405%2C144\.96362/);
    expect(r.text).toMatch(/For more options, check:\n.*General_Practitioners_%28GP%29/);
    // Every line keeps its own row (no prose reflow merging fields).
    expect(r.text.split('\n').filter((l) => l.startsWith('📍')).length).toBe(1);
    expect(r.text.length).toBeLessThan(1500);
  });
  it('is localised', () => {
    const providers = fixture.providers.map(normalizeProvider);
    expect(renderResults(placeForPostcode('3052')!, 'gp', providers, 'zh-CN', SAT_AFTERNOON).text).toMatch(/现在营业/);
    expect(renderResults(placeForPostcode('3052')!, 'gp', providers, 'es', SAT_AFTERNOON).text).toMatch(/Abierto ahora/);
  });
});

describe('open-now within 5 km', () => {
  const base: ReturnType<typeof normalizeProvider>[] = fixture.providers.map(normalizeProvider);
  const place = placeForPostcode('3052')!;

  it('Sunday with no listed hours: says none confirmed within 5 km, never "closed"', () => {
    const sunday = new Date('2026-11-01T00:24:00Z'); // Sun 11:24 am AEDT, like the screenshot
    const r = renderResults(place, 'gp', base, 'en', sunday);
    expect(r.text).toMatch(/No GPs confirmed open within 5 km of Parkville VIC 3052 right now/);
    expect(r.text).toMatch(/check their hours and call ahead/);
    expect(r.text).toMatch(/Hours not listed — call ahead/);
    expect(r.text).not.toMatch(/Closed now/);
  });

  it('open but further than 5 km: says so, then shows the nearest open ones', () => {
    const far = base.map((p) => (p.name === 'Primecare Medical' ? { ...p, distanceKm: 7.2 } : p));
    const r = renderResults(place, 'gp', far, 'en', SAT_AFTERNOON);
    expect(r.text).toMatch(/No GPs confirmed open within 5 km/);
    expect(r.text).toMatch(/nearest ones open now, a little further away/);
    expect(r.shown.map((p) => p.name)).toEqual(['Primecare Medical']);
  });

  it('open within 5 km: normal open-now heading', () => {
    const r = renderResults(place, 'gp', base, 'en', SAT_AFTERNOON);
    expect(r.text).toMatch(/Nearest GPs open now near Parkville VIC 3052/);
    expect(r.text).not.toMatch(/confirmed open within/);
  });
});

describe('intent detection', () => {
  it('provider types', () => {
    expect(parseProviderType('provider:hospital')).toBe('hospital');
    expect(parseProviderType('3', { allowNumber: true })).toBe('hospital');
    expect(parseProviderType('3')).toBeNull();
    expect(parseProviderType('direct billing please')).toBe('dbc');
    expect(parseProviderType('after hours home doctor')).toBe('afterhours');
    expect(parseProviderType('a doctor')).toBe('gp');
  });
  it('typed finder requests vs questions', () => {
    expect(wantsProviderSearch('GP near 3052')).toBe(true);
    expect(wantsProviderSearch('where is the nearest hospital')).toBe(true);
    expect(wantsProviderSearch('find a direct billing clinic')).toBe(true);
    expect(wantsProviderSearch('How do I claim a GP visit?')).toBe(false);
    expect(wantsProviderSearch('Is direct billing free?')).toBe(false);
  });
});

describe('API client', () => {
  it('posts what the Medibank page posts and sorts by distance', async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      const shuffled = { ...fixture, providers: [...fixture.providers].reverse() };
      return new Response(JSON.stringify(shuffled), { status: 200 });
    }) as unknown as typeof fetch;
    const out = await searchProviders(placeForPostcode('3052')!, 'hospital', { fetchImpl, radiusKm: 25 });
    expect(seen!.url).toBe('https://www.medibank.com.au/api/provider-search/v1/search/');
    expect(JSON.parse(String(seen!.init.body))).toEqual({
      serviceTypes: ['Hospitals'], pageNumber: 0, pageSize: 100,
      location: { latitude: -37.78624, longitude: 144.94742 }, searchRadius: 25,
    });
    expect((seen!.init.headers as Record<string, string>).x_mspa_version).toBe('1.9');
    expect(out.map((p) => p.distanceKm)).toEqual([...out.map((p) => p.distanceKm)].sort((a, b) => a - b));
  });
});
