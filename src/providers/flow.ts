/**
 * "Find a doctor or clinic" conversation.
 *
 *   student: 3 (or taps "Find healthcare", or "GP near me")
 *   bot:     What's your postcode?
 *   student: 3052
 *   bot:     [list] GP / OSHC Direct Billing Clinic / Hospital / After-hours home doctor
 *   student: GP
 *   bot:     2 nearest GPs that are open right now + "more options" deep link
 *
 * Shortcuts: "GP near 3052" or "hospital in Parkville" skip straight to the
 * results; "hospital near me" skips the type question.
 */
import type { Database } from '../db.js';
import { formatWhatsAppAnswer } from '../response-format.js';
import type { Contact, SupportedLanguage } from '../types.js';
import { lookupPlace, type Place } from './postcodes.js';
import {
  findProviderUrl,
  hoursToday,
  isOpenNow,
  mapsLink,
  PROVIDER_TYPES,
  providerType,
  searchNearest,
  type Provider,
  type ProviderTypeKey,
  type SearchOptions,
} from './search.js';

export const PROVIDER_STATE_TTL_MINUTES = 30;

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/** Detect a provider type in free text, a list-row id, or (when allowed) a 1–4 reply. */
export function parseProviderType(text: string, opts: { allowNumber?: boolean } = {}): ProviderTypeKey | null {
  const t = (text || '').normalize('NFKC').trim().toLowerCase();
  const row = /^provider:(gp|dbc|hospital|afterhours)$/.exec(t);
  if (row) return row[1] as ProviderTypeKey;
  if (opts.allowNumber) {
    const n = /^\s*([1-4])\s*[.)]?\s*$/.exec(t)?.[1];
    if (n) return PROVIDER_TYPES[Number(n) - 1].key;
  }
  if (/after[\s-]?hours?|home[\s-]?(visit|doctor)|house[\s-]?call|deputi|上门|夜间|a domicilio|fuera de horario/.test(t)) return 'afterhours';
  if (/direct[\s-]?bill|bulk[\s-]?bill|直付|facturaci[oó]n directa/.test(t)) return 'dbc';
  if (/hospital|emergency department|医院/.test(t)) return 'hospital';
  if (/\bgp\b|general practi|doctor|docter|clinic|m[eé]dico|全科|医生|诊所/.test(t)) return 'gp';
  return null;
}

/** Typed requests that should open the finder rather than get a prose answer. */
export function wantsProviderSearch(text: string): boolean {
  const t = (text || '').toLowerCase();
  const hasPostcode = /(?:^|\D)\d{4}(?:\D|$)/.test(t);
  const findSignal = /\b(find|near|nearby|nearest|closest|around|where|book|locate|search)\b|附近|找|cerca|buscar|d[oó]nde/.test(t);
  return Boolean(parseProviderType(t)) && (findSignal || hasPostcode);
}

const CANCEL = /^(cancel|stop|exit|quit|no|nevermind|never mind|cancelar|取消)$/i;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface SearchState {
  step: 'postcode' | 'type';
  postcode: string | null;
  suburb: string | null;
  providerType: ProviderTypeKey | null;
}

async function getState(db: Database, contactId: string): Promise<SearchState | null> {
  try {
    const res = await db.query<{ step: 'postcode' | 'type'; postcode: string | null; suburb: string | null; provider_type: ProviderTypeKey | null }>(
      `SELECT step, postcode, suburb, provider_type
         FROM provider_search_state
        WHERE contact_id = $1
          AND updated_at > now() - ($2 || ' minutes')::interval`,
      [contactId, String(PROVIDER_STATE_TTL_MINUTES)],
    );
    const row = res.rows[0];
    return row ? { step: row.step, postcode: row.postcode, suburb: row.suburb, providerType: row.provider_type } : null;
  } catch {
    return null; // migration 0010 not applied yet
  }
}

async function setState(db: Database, contactId: string, state: SearchState): Promise<void> {
  await db.query(
    `INSERT INTO provider_search_state (contact_id, step, postcode, suburb, provider_type, updated_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (contact_id) DO UPDATE
       SET step = EXCLUDED.step, postcode = EXCLUDED.postcode, suburb = EXCLUDED.suburb,
           provider_type = EXCLUDED.provider_type, updated_at = now()`,
    [contactId, state.step, state.postcode, state.suburb, state.providerType],
  );
}

export async function clearProviderSearch(db: Database, contactId: string): Promise<void> {
  await db.query('DELETE FROM provider_search_state WHERE contact_id = $1', [contactId]).catch(() => undefined);
}

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

const TYPE_NAMES: Record<SupportedLanguage, Record<ProviderTypeKey, [string, string]>> = {
  // [singular, plural]
  en: { gp: ['GP', 'GPs'], dbc: ['OSHC Direct Billing Clinic', 'OSHC Direct Billing Clinics'], hospital: ['hospital', 'hospitals'], afterhours: ['after-hours home doctor service', 'after-hours home doctor services'] },
  'zh-CN': { gp: ['全科诊所', '全科诊所'], dbc: ['OSHC 直付诊所', 'OSHC 直付诊所'], hospital: ['医院', '医院'], afterhours: ['夜间上门医生', '夜间上门医生'] },
  es: { gp: ['médico de cabecera (GP)', 'médicos de cabecera (GP)'], dbc: ['clínica con facturación directa OSHC', 'clínicas con facturación directa OSHC'], hospital: ['hospital', 'hospitales'], afterhours: ['médico a domicilio fuera de horario', 'médicos a domicilio fuera de horario'] },
};

const COPY = {
  en: {
    askPostcode: `*Let's find care near you* 📍\n\nWhat's your postcode? (e.g. 3052)\n\nYou can also send a suburb name, like "Parkville".\n\nEmergency? Call *000* now.`,
    askPostcodeAgain: `Please send a 4-digit Australian postcode (e.g. 3052) or your suburb name. Reply CANCEL to stop.`,
    unknownPostcode: (pc: string) => `I couldn't find postcode *${pc}*. Please check it and send it again (e.g. 3052), or send your suburb name.`,
    ambiguous: (opts: string) => `That suburb name is in more than one place. Which one? Send the postcode:\n\n${opts}`,
    askType: (where: string) => `*What do you need near ${where}?*\n\n1. GP (doctor)\n2. OSHC Direct Billing Clinic\n3. Hospital\n4. After-hours home doctor\n\nReply *1-4*.`,
    askTypeList: (where: string) => `What do you need near *${where}*?`,
    chooseType: 'Choose type',
    searching: '',
    openNowHeading: (n: number, plural: string, where: string) => `*${n === 1 ? 'Nearest' : `${n} nearest`} ${plural} open now near ${where}* 🟢`,
    noneOpenHeading: (plural: string, where: string) => `*No nearby ${plural} are open right now near ${where}.* 🔴\n\nHere are the closest — check their hours and call ahead:`,
    afterHoursHeading: (plural: string, where: string) => `*${plural[0].toUpperCase()}${plural.slice(1)} covering ${where}*\n\nA doctor comes to you, usually evenings, overnight and weekends. Call to book.`,
    noResults: (plural: string, where: string) => `I couldn't find any ${plural} within 50 km of ${where}.`,
    openNow: 'Open now',
    closedNow: 'Closed now',
    hoursUnknown: 'Hours not listed — call ahead',
    today: 'today',
    km: 'km',
    more: 'For more options, check:',
    failed: (url: string) => `Sorry, I couldn't reach Medibank's provider search just now.\n\nYou can search directly here:\n${url}`,
    nextStep: `*Next step:* reply *2* to learn how to claim, or send another postcode to search again.`,
    cancelled: `No problem — search cancelled. Reply *MENU* for other topics.`,
    emergency: `Emergency? Call *000* now.`,
  },
  'zh-CN': {
    askPostcode: `*帮你查找附近的医疗服务* 📍\n\n请发送你的邮编（例如 3052）。\n\n也可以发送区名，例如 "Parkville"。\n\n紧急情况请立即拨打 *000*。`,
    askPostcodeAgain: `请发送 4 位澳大利亚邮编（例如 3052）或区名。回复“取消”停止。`,
    unknownPostcode: (pc: string) => `找不到邮编 *${pc}*。请检查后重新发送（例如 3052），或发送区名。`,
    ambiguous: (opts: string) => `这个区名在多个地方都有。请发送对应的邮编：\n\n${opts}`,
    askType: (where: string) => `*你在 ${where} 附近需要什么？*\n\n1. 全科医生（GP）\n2. OSHC 直付诊所\n3. 医院\n4. 夜间上门医生\n\n请回复 *1-4*。`,
    askTypeList: (where: string) => `你在 *${where}* 附近需要什么？`,
    chooseType: '选择类型',
    searching: '',
    openNowHeading: (_n: number, plural: string, where: string) => `*${where} 附近现在营业的${plural}* 🟢`,
    noneOpenHeading: (plural: string, where: string) => `*${where} 附近的${plural}现在都未营业。* 🔴\n\n以下是最近的几家，请查看营业时间并提前致电：`,
    afterHoursHeading: (plural: string, where: string) => `*覆盖 ${where} 的${plural}*\n\n医生上门服务，通常在晚间、夜间和周末。请致电预约。`,
    noResults: (plural: string, where: string) => `在 ${where} 50 公里范围内没有找到${plural}。`,
    openNow: '现在营业',
    closedNow: '现在未营业',
    hoursUnknown: '未列出营业时间，请提前致电',
    today: '今天',
    km: '公里',
    more: '更多选择请查看：',
    failed: (url: string) => `抱歉，暂时无法连接 Medibank 医疗机构搜索。\n\n你可以直接在这里搜索：\n${url}`,
    nextStep: `*下一步：*回复 *2* 了解如何理赔，或发送其他邮编重新搜索。`,
    cancelled: `好的，已取消搜索。回复*菜单*查看其他主题。`,
    emergency: `紧急情况请立即拨打 *000*。`,
  },
  es: {
    askPostcode: `*Busquemos atención cerca de ti* 📍\n\n¿Cuál es tu código postal? (por ejemplo 3052)\n\nTambién puedes enviar el nombre de tu barrio, como "Parkville".\n\n¿Emergencia? Llama al *000* ahora.`,
    askPostcodeAgain: `Envía un código postal australiano de 4 dígitos (por ejemplo 3052) o el nombre de tu barrio. Responde CANCELAR para salir.`,
    unknownPostcode: (pc: string) => `No encontré el código postal *${pc}*. Revísalo y envíalo de nuevo (por ejemplo 3052), o envía tu barrio.`,
    ambiguous: (opts: string) => `Ese barrio existe en varios lugares. ¿Cuál? Envía el código postal:\n\n${opts}`,
    askType: (where: string) => `*¿Qué necesitas cerca de ${where}?*\n\n1. Médico de cabecera (GP)\n2. Clínica con facturación directa OSHC\n3. Hospital\n4. Médico a domicilio fuera de horario\n\nResponde *1-4*.`,
    askTypeList: (where: string) => `¿Qué necesitas cerca de *${where}*?`,
    chooseType: 'Elegir tipo',
    searching: '',
    openNowHeading: (n: number, plural: string, where: string) => `*${n === 1 ? 'El más cercano' : `Los ${n} más cercanos`}: ${plural} abiertos ahora cerca de ${where}* 🟢`,
    noneOpenHeading: (plural: string, where: string) => `*No hay ${plural} abiertos ahora cerca de ${where}.* 🔴\n\nEstos son los más cercanos — revisa su horario y llama antes:`,
    afterHoursHeading: (plural: string, where: string) => `*${plural[0].toUpperCase()}${plural.slice(1)} que cubren ${where}*\n\nUn médico va a tu casa, normalmente por la noche y fines de semana. Llama para reservar.`,
    noResults: (plural: string, where: string) => `No encontré ${plural} a menos de 50 km de ${where}.`,
    openNow: 'Abierto ahora',
    closedNow: 'Cerrado ahora',
    hoursUnknown: 'Horario no disponible — llama antes',
    today: 'hoy',
    km: 'km',
    more: 'Para más opciones, consulta:',
    failed: (url: string) => `Lo siento, no pude conectar con el buscador de Medibank ahora.\n\nPuedes buscar directamente aquí:\n${url}`,
    nextStep: `*Siguiente paso:* responde *2* para saber cómo reclamar, o envía otro código postal para buscar de nuevo.`,
    cancelled: `Sin problema — búsqueda cancelada. Responde *MENÚ* para otros temas.`,
    emergency: `¿Emergencia? Llama al *000* ahora.`,
  },
} satisfies Record<SupportedLanguage, Record<string, unknown>>;

export function providerCopy(lang: SupportedLanguage) {
  return COPY[lang] || COPY.en;
}

function where(place: Pick<Place, 'suburb' | 'state' | 'postcode'>): string {
  return `${place.suburb} ${place.state} ${place.postcode}`;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderProvider(index: number, p: Provider, status: boolean | null, lang: SupportedLanguage, now: Date): string {
  const c = providerCopy(lang);
  const today = hoursToday(p, now);
  const statusLabel = status === true ? c.openNow : status === false ? c.closedNow : null;
  const hoursLine = statusLabel
    ? `🕒 ${statusLabel}${today ? ` · ${c.today}: ${today}` : ''}`
    : `🕒 ${today ? `${c.today}: ${today}` : c.hoursUnknown}`;
  const lines = [
    `${index}. *${p.name}* — ${p.distanceKm.toFixed(1)} ${c.km}`,
    `📍 ${p.address}`,
    hoursLine,
    p.phone ? `📞 ${p.phone}` : null,
    `🗺️ ${mapsLink(p)}`,
  ];
  return lines.filter(Boolean).join('\n');
}

export interface RenderedResults {
  text: string;
  shown: Provider[];
  openCount: number;
  url: string;
}

/**
 * Pick and render up to two providers. Open-now ones are preferred; if none
 * are open we say so and show the nearest with their hours instead.
 */
export function renderResults(
  place: Place,
  type: ProviderTypeKey,
  providers: Provider[],
  lang: SupportedLanguage = 'en',
  now: Date = new Date(),
): RenderedResults {
  const c = providerCopy(lang);
  const plural = TYPE_NAMES[lang][type][1];
  const url = findProviderUrl(place, type);
  const at = where(place);
  const footer = `🔗 ${c.more}\n${url}\n\n${c.nextStep}\n\n${c.emergency}`;

  if (!providers.length) {
    return { text: `${c.noResults(plural, at)}\n\n${footer}`, shown: [], openCount: 0, url };
  }

  const withStatus = providers.map((p) => ({ p, open: isOpenNow(p, now) }));
  const open = withStatus.filter((x) => x.open === true);

  let heading: string;
  let picked: typeof withStatus;
  if (type === 'afterhours') {
    // Home-visit services rarely publish hours; they exist for after-hours anyway.
    heading = c.afterHoursHeading(plural, at);
    picked = withStatus.slice(0, 2);
  } else if (open.length) {
    picked = open.slice(0, 2);
    heading = c.openNowHeading(picked.length, plural, at);
  } else {
    heading = c.noneOpenHeading(plural, at);
    picked = withStatus.slice(0, 2);
  }

  const body = picked.map((x, i) => renderProvider(i + 1, x.p, x.open, lang, now)).join('\n\n');
  const text = formatWhatsAppAnswer(`${heading}\n\n${body}\n\n${footer}`, { maxChars: 1500 });
  return { text, shown: picked.map((x) => x.p), openCount: open.length, url };
}

// ---------------------------------------------------------------------------
// Conversation handler
// ---------------------------------------------------------------------------

export interface ProviderFlowDeps {
  send: (text: string) => Promise<void>;
  /** Interactive list for the type choice; may throw (falls back to text). */
  sendTypeList?: (body: string, buttonText: string, rows: Array<{ id: string; title: string; description: string }>) => Promise<void>;
  /** Returns true for greetings, menu, questions etc. that should leave the finder. */
  isOtherRequest: (text: string) => boolean;
  search?: (place: Place, type: ProviderTypeKey) => Promise<Provider[]>;
  searchOptions?: SearchOptions;
  now?: () => Date;
}

// Small in-memory cache: the same postcode/type asked twice in 10 minutes
// should not hit Medibank twice (GP and Direct Billing share one API query).
const cache = new Map<string, { at: number; providers: Provider[] }>();
const CACHE_MS = 10 * 60_000;

async function cachedSearch(place: Place, type: ProviderTypeKey, deps: ProviderFlowDeps): Promise<Provider[]> {
  if (deps.search) return deps.search(place, type);
  const key = `${place.postcode}:${place.suburb}:${providerType(type).serviceType}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.providers;
  const { providers } = await searchNearest(place, type, deps.searchOptions);
  cache.set(key, { at: Date.now(), providers });
  if (cache.size > 500) cache.delete(cache.keys().next().value as string);
  return providers;
}

async function askType(db: Database, contact: Contact, place: Place, lang: SupportedLanguage, deps: ProviderFlowDeps): Promise<string> {
  await setState(db, contact.id, { step: 'type', postcode: place.postcode, suburb: place.suburb, providerType: null });
  const c = providerCopy(lang);
  const at = where(place);
  if (deps.sendTypeList) {
    try {
      await deps.sendTypeList(c.askTypeList(at), c.chooseType, PROVIDER_TYPES.map((t, i) => ({
        id: `provider:${t.key}`,
        title: `${i + 1}. ${t.short}`.slice(0, 24),
        description: t.description.slice(0, 72),
      })));
      return c.askTypeList(at);
    } catch { /* fall back to text */ }
  }
  const text = formatWhatsAppAnswer(c.askType(at));
  await deps.send(text);
  return text;
}

async function runSearch(db: Database, contact: Contact, place: Place, type: ProviderTypeKey, lang: SupportedLanguage, deps: ProviderFlowDeps): Promise<string> {
  await clearProviderSearch(db, contact.id);
  const c = providerCopy(lang);
  let text: string;
  try {
    const providers = await cachedSearch(place, type, deps);
    text = renderResults(place, type, providers, lang, deps.now ? deps.now() : new Date()).text;
  } catch (error) {
    console.error('[providers] search failed', error);
    text = formatWhatsAppAnswer(c.failed(findProviderUrl(place, type)));
  }
  await deps.send(text);
  return text;
}

async function handlePlace(db: Database, contact: Contact, text: string, presetType: ProviderTypeKey | null, lang: SupportedLanguage, deps: ProviderFlowDeps): Promise<string | null> {
  const c = providerCopy(lang);
  const found = lookupPlace(text);
  if (found.kind === 'found') {
    const type = presetType || parseProviderType(text);
    return type ? runSearch(db, contact, found.place, type, lang, deps) : askType(db, contact, found.place, lang, deps);
  }
  if (found.kind === 'ambiguous') {
    const reply = c.ambiguous(found.options.map((p) => `• ${where(p)}`).join('\n'));
    await deps.send(reply);
    return reply;
  }
  if (found.kind === 'unknown_postcode') {
    const reply = c.unknownPostcode(found.postcode);
    await deps.send(reply);
    return reply;
  }
  return null;
}

/**
 * Open the finder. `initialText` lets "GP near 3052" or "hospital in
 * Parkville" skip the questions it already answers.
 * Returns the text that was sent (for the conversation log).
 */
export async function startProviderSearch(
  db: Database,
  contact: Contact,
  lang: SupportedLanguage,
  deps: ProviderFlowDeps,
  initialText = '',
): Promise<string> {
  const presetType = parseProviderType(initialText);
  if (/(?:^|\D)\d{4}(?:\D|$)/.test(initialText)) {
    const handled = await handlePlace(db, contact, initialText, presetType, lang, deps);
    if (handled) return handled;
  }
  await setState(db, contact.id, { step: 'postcode', postcode: null, suburb: null, providerType: presetType });
  const text = providerCopy(lang).askPostcode;
  await deps.send(text);
  return text;
}

/**
 * Continue an open finder conversation. Returns the reply text when the
 * message was consumed, or null when it should be routed normally.
 */
export async function continueProviderSearch(
  db: Database,
  contact: Contact,
  text: string,
  lang: SupportedLanguage,
  deps: ProviderFlowDeps,
): Promise<string | null> {
  const state = await getState(db, contact.id);
  if (!state) return null;
  const c = providerCopy(lang);

  if (CANCEL.test(text.trim())) {
    await clearProviderSearch(db, contact.id);
    await deps.send(c.cancelled);
    return c.cancelled;
  }

  if (state.step === 'type' && state.postcode) {
    const type = parseProviderType(text, { allowNumber: true });
    const place = lookupPlace(state.postcode);
    if (type && place.kind === 'found') {
      const resolved = state.suburb ? { ...place.place, suburb: state.suburb } : place.place;
      return runSearch(db, contact, resolved, type, lang, deps);
    }
    // A new postcode/suburb restarts the type question for that place.
    const moved = await handlePlace(db, contact, text, null, lang, deps);
    if (moved) return moved;
    if (deps.isOtherRequest(text)) {
      await clearProviderSearch(db, contact.id);
      return null;
    }
    if (place.kind === 'found') return askType(db, contact, state.suburb ? { ...place.place, suburb: state.suburb } : place.place, lang, deps);
    await clearProviderSearch(db, contact.id);
    return null;
  }

  // step === 'postcode'
  const handled = await handlePlace(db, contact, text, state.providerType, lang, deps);
  if (handled) return handled;
  if (deps.isOtherRequest(text)) {
    await clearProviderSearch(db, contact.id);
    return null;
  }
  // "hospital" before the postcode: remember the type, still need the place.
  const typeOnly = parseProviderType(text);
  if (typeOnly) {
    await setState(db, contact.id, { ...state, providerType: typeOnly });
    await deps.send(c.askPostcode);
    return c.askPostcode;
  }
  if (deps.isOtherRequest(text)) {
    await clearProviderSearch(db, contact.id);
    return null;
  }
  await deps.send(c.askPostcodeAgain);
  return c.askPostcodeAgain;
}
