/**
 * Legibility gate.
 *
 * Keyboard mashes ("asdkjh"), random letters ("xqzv"), emoji/punctuation-only
 * messages and long digit strings used to fall through to fuzzy menu matching
 * or KB retrieval, which then confidently answered a question nobody asked.
 * This module decides — deterministically, with no LLM — whether we
 * understood *any* word in the message. If not, the bot says so.
 *
 * Vocabulary = the knowledge base itself + common English/Spanish words +
 * chat filler. A message is legible if at least one meaningful token is a
 * known word (exact, or within a small typo budget for longer tokens).
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { levenshtein, normalizeInput } from './input-normalization.js';

const COMMON_WORDS = `
a about above after again all also am an and any are as ask at back be because been before being best bill both but by
can cant cannot come could day did do does doing done dont down each even every few find first for from get gets getting
give go going good got had has have having he hello help her here hi him his how i if im in into is it its just know last
let like look make many may me more most much must my need new next no not now of off ok okay on once one only or other
our out over own pay please plz pls same say see she should so some still such sure take tell than thank thanks thx that
the their them then there these they thing think this those through to too try under until up us use very want was way
we well were what when where which while who why will with without would yes yeah yep yo you your yours
hmm hmmm umm uh oh ah lol haha hahaha ok okk okay okey cool nice great fine sorry bye goodbye cheers mate
student students uni university college study studying australia australian melbourne sydney brisbane perth adelaide
doctor doctors gp hospital clinic dentist dental optical physio medicine medicines pharmacy chemist prescription sick ill
pain hurt injury injured ambulance emergency urgent cover covered coverage claim claims refund money card member membership
policy oshc medibank ahm visa waiting period periods insurance insured health healthcare quiz menu support onboard arrival
hola gracias por favor si sí no que qué como cómo donde dónde cuando cuándo cual cuál quien quién yo tu tú mi mis el la los
las un una unos unas de del en con para sin es son esta está estoy tengo tiene necesito quiero puedo ayuda médico medico
doctor hospital clínica clinica farmacia receta seguro cobertura reclamo reembolso visa espera estudiante dinero tarjeta
buenos buenas dias días tardes noches bien mal dolor enfermo enferma urgencia emergencia ambulancia
`;

let vocab: Set<string> | null = null;
let vocabByLength: Map<number, string[]> | null = null;

function fold(word: string): string {
  return word.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function addWords(target: Set<string>, text: string): void {
  for (const m of text.toLowerCase().matchAll(/[a-záéíóúüñ']+/g)) {
    const w = fold(m[0].replace(/^'+|'+$/g, ''));
    if (w.length >= 1 && w.length <= 24) target.add(w);
    if (w.includes("'")) target.add(w.replace(/'/g, ''));
  }
}

/** Build (once) the known-word vocabulary. KB load failure degrades gracefully. */
export function knownVocabulary(kbDirectory = path.join(process.cwd(), 'kb')): Set<string> {
  if (vocab) return vocab;
  const words = new Set<string>();
  addWords(words, COMMON_WORDS);
  try {
    for (const file of readdirSync(kbDirectory)) {
      if (!file.endsWith('.md')) continue;
      // Drop URLs so link slugs don't become "words".
      addWords(words, readFileSync(path.join(kbDirectory, file), 'utf8').replace(/https?:\/\/\S+/g, ' '));
    }
  } catch {
    /* heuristics + common words still work */
  }
  vocab = words;
  vocabByLength = new Map();
  for (const w of words) {
    const list = vocabByLength.get(w.length) || [];
    list.push(w);
    vocabByLength.set(w.length, list);
  }
  return vocab;
}

/** Test hook: inject a vocabulary (and reset the length index). */
export function setVocabularyForTests(words: Iterable<string> | null): void {
  if (!words) {
    vocab = null;
    vocabByLength = null;
    return;
  }
  vocab = new Set([...words].map(fold));
  addWords(vocab, COMMON_WORDS);
  vocabByLength = new Map();
  for (const w of vocab) {
    const list = vocabByLength.get(w.length) || [];
    list.push(w);
    vocabByLength.set(w.length, list);
  }
}

function typoBudget(len: number): number {
  if (len <= 4) return 0;
  if (len <= 7) return 1;
  return 2;
}

function isKnownWord(token: string): boolean {
  const words = knownVocabulary();
  if (words.has(token)) return true;
  const budget = typoBudget(token.length);
  if (!budget || !vocabByLength) return false;
  for (let len = token.length - budget; len <= token.length + budget; len++) {
    for (const w of vocabByLength.get(len) || []) {
      if (levenshtein(token, w) <= budget) return true;
    }
  }
  return false;
}

const FILLER = new Set(['lol', 'lmao', 'haha', 'hahaha', 'hehe', 'hmm', 'hmmm', 'umm', 'uh', 'oh', 'ah', 'ok', 'okk', 'okay', 'k', 'xd', 'idk']);

const KEYBOARD_RUNS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm', 'qazwsx', 'plmokn'];

/** Token-level junk heuristics that do not need a vocabulary. */
export function looksLikeJunkToken(token: string): boolean {
  const t = fold(token);
  if (t.length < 3) return false;
  if (/(.)\1{3,}/.test(t)) return true; // ffff, aaaaa
  if (/^(..?)\1{2,}$/.test(t)) return true; // jkjkjk, hahaha handled by vocab first
  if (t.length >= 4 && !/[aeiouy]/.test(t)) return true; // xqzv, hgfd
  if (/[bcdfghjklmnpqrstvwxz]{5,}/.test(t)) return true; // dfghjk
  for (const row of KEYBOARD_RUNS) {
    for (let i = 0; i + 4 <= row.length; i++) {
      const run = row.slice(i, i + 4);
      if (t.includes(run) || t.includes([...run].reverse().join(''))) return true;
    }
  }
  return false;
}

export interface LegibilityResult {
  legible: boolean;
  reason?: 'no_content' | 'digits_only' | 'unrecognised_words';
  knownTokens: number;
  totalTokens: number;
}

/**
 * Decide whether we understood any of the message.
 * Non-Latin scripts (e.g. Chinese) are treated as legible — the router and
 * LLM handle them; we only police Latin-script gibberish and empty noise.
 */
export function assessLegibility(text: string): LegibilityResult {
  const raw = normalizeInput(text);
  const lettersOrDigits = raw.replace(/[^\p{L}\p{N}]/gu, '');
  if (!lettersOrDigits) return { legible: false, reason: 'no_content', knownTokens: 0, totalTokens: 0 };

  // Any CJK / other non-Latin letters → leave to language-aware routing.
  if (/[\p{L}]/u.test(raw) && /[^\p{Script=Latin}\p{N}\p{P}\p{S}\p{Z}\p{M}\s]/u.test(raw)) {
    return { legible: true, knownTokens: 1, totalTokens: 1 };
  }

  if (/^\p{N}+$/u.test(lettersOrDigits)) {
    // Single menu digit is meaningful; long numbers on their own are not a request.
    return /^[1-9]$/.test(lettersOrDigits)
      ? { legible: true, knownTokens: 1, totalTokens: 1 }
      : { legible: false, reason: 'digits_only', knownTokens: 0, totalTokens: 1 };
  }

  const tokens = (fold(raw).match(/[a-z']+/g) || [])
    .map((t) => t.replace(/^'+|'+$/g, ''))
    .filter(Boolean);
  if (!tokens.length) return { legible: false, reason: 'no_content', knownTokens: 0, totalTokens: 0 };

  let known = 0;
  for (const token of tokens) {
    if (isKnownWord(token) || isKnownWord(token.replace(/'/g, ''))) known += 1;
    else if (token.length >= 2 && token.endsWith('s') && isKnownWord(token.slice(0, -1))) known += 1;
  }
  const junk = tokens.filter((t) => looksLikeJunkToken(t) && !isKnownWord(t)).length;

  if (known === 0) return { legible: false, reason: 'unrecognised_words', knownTokens: 0, totalTokens: tokens.length };
  // "jkjkjk lol" — chat filler next to mash carries no request.
  const meaningful = tokens.filter((t) => !FILLER.has(t) && (isKnownWord(t) || isKnownWord(t.replace(/'/g, '')))).length;
  if (junk >= 1 && meaningful === 0) {
    return { legible: false, reason: 'unrecognised_words', knownTokens: known, totalTokens: tokens.length };
  }
  // A stray real word inside a wall of mash ("asdkj ok qwpoei zxmnv") is still mash.
  if (tokens.length >= 3 && known / tokens.length < 0.34 && junk >= 2) {
    return { legible: false, reason: 'unrecognised_words', knownTokens: known, totalTokens: tokens.length };
  }
  return { legible: true, knownTokens: known, totalTokens: tokens.length };
}

export function isIllegible(text: string): boolean {
  return !assessLegibility(text).legible;
}
