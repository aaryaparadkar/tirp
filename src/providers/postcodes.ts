/**
 * Australian postcode / suburb → coordinates.
 *
 * Medibank's find-provider page geocodes the location with Google Maps in
 * the browser, then sends lat/lng to its search API. We can't reuse their
 * browser key server-side, so we resolve postcodes from a bundled dataset
 * (data/au-postcodes.json, built from the open australianpostcodes CSV —
 * one representative suburb + coordinates per postcode, plus a suburb index).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

export interface Place {
  postcode: string;
  suburb: string;
  state: string;
  latitude: number;
  longitude: number;
}

interface Dataset {
  /** postcode → [suburb, state, lat, lng] */
  p: Record<string, [string, string, number, number]>;
  /** lowercase suburb → postcodes */
  s: Record<string, string[]>;
}

let dataset: Dataset | null = null;

export function loadPostcodes(file = path.join(process.cwd(), 'data', 'au-postcodes.json')): Dataset {
  if (!dataset) dataset = JSON.parse(readFileSync(file, 'utf8')) as Dataset;
  return dataset;
}

export function placeForPostcode(postcode: string): Place | null {
  const row = loadPostcodes().p[postcode];
  if (!row) return null;
  return { postcode, suburb: row[0], state: row[1], latitude: row[2], longitude: row[3] };
}

const STATES = ['VIC', 'NSW', 'QLD', 'SA', 'WA', 'TAS', 'NT', 'ACT'];

export type PlaceLookup =
  | { kind: 'found'; place: Place }
  | { kind: 'ambiguous'; options: Place[] }
  | { kind: 'unknown_postcode'; postcode: string }
  | { kind: 'none' };

/**
 * Resolve "3052", "Parkville", "parkville vic", "Richmond NSW 2753" etc.
 * A 4-digit postcode wins; otherwise a suburb name (optionally with state).
 */
export function lookupPlace(input: string): PlaceLookup {
  const text = (input || '').normalize('NFKC').trim();
  const postcode = /(?:^|\D)(\d{4})(?:\D|$)/.exec(text)?.[1];
  if (postcode) {
    const place = placeForPostcode(postcode);
    return place ? { kind: 'found', place } : { kind: 'unknown_postcode', postcode };
  }
  const words = text
    .toLowerCase()
    .replace(/[^a-z' -]/g, ' ')
    .replace(/\b(near|in|at|around|postcode|suburb|area|my|is|i'?m|live|australia)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!words) return { kind: 'none' };
  const stateMatch = new RegExp(`\\b(${STATES.join('|')})\\b`, 'i').exec(words);
  const state = stateMatch?.[1].toUpperCase();
  const name = words.replace(new RegExp(`\\b(${STATES.join('|')})\\b`, 'gi'), ' ').replace(/\s+/g, ' ').trim();
  const codes = loadPostcodes().s[name];
  if (!codes?.length) return { kind: 'none' };
  // The suburb's own name is more accurate than the postcode's representative.
  const places = codes
    .map((code) => placeForPostcode(code))
    .filter((p): p is Place => Boolean(p))
    .map((p) => ({ ...p, suburb: titleCase(name) }))
    .filter((p) => !state || p.state === state);
  if (places.length === 1) return { kind: 'found', place: places[0] };
  if (places.length > 1) return { kind: 'ambiguous', options: places.slice(0, 6) };
  return { kind: 'none' };
}

function titleCase(value: string): string {
  return value.replace(/(^|[\s'-])([a-z])/g, (_m, sep: string, ch: string) => `${sep}${ch.toUpperCase()}`);
}
