import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Database } from '../src/db.js';

// ---- Outbound capture -----------------------------------------------------
const sent: Array<{ kind: string; body: string; url?: string; label?: string }> = [];

vi.mock('../src/kapso.js', () => ({
  sendText: vi.fn(async (_p: string, _to: string, body: string) => { sent.push({ kind: 'text', body }); }),
  sendFormattedText: vi.fn(async (_p: string, _to: string, body: string) => { sent.push({ kind: 'text', body }); }),
  sendList: vi.fn(async (_p: string, _to: string, body: string, _btn: string, sections: Array<{ rows: Array<{ id: string; title: string }> }>) => {
    sent.push({ kind: 'list', body: `${body}\n${sections.flatMap((x) => x.rows.map((r) => `${r.id}|${r.title}`)).join('\n')}` });
  }),
  sendButtons: vi.fn(async (_p: string, _to: string, body: string) => { sent.push({ kind: 'buttons', body }); }),
  sendEmergencyNumber: vi.fn(async (_p: string, _to: string, body: string, opts: { callUrl?: string; buttonText?: string }) => {
    sent.push({ kind: 'call-button', body, url: opts.callUrl ?? undefined, label: opts.buttonText });
  }),
}));
vi.mock('../src/conversation.js', () => ({
  saveTurn: vi.fn(async () => undefined),
  recentTurns: vi.fn(async () => []),
}));
vi.mock('../src/quiz/service.js', () => ({
  handleQuizText: vi.fn(async () => false),
  answerQuiz: vi.fn(async () => false),
}));
vi.mock('../src/catalogue.js', () => ({
  ensureContact: vi.fn(async (_db: unknown, phone: string, name: string) => ({
    id: 'contact-1', phone, name, locale: 'en_US', preferredLanguage: 'en', optedIn: true,
  })),
  lockPreferredLanguage: vi.fn(async () => 'en'),
  listCategories: vi.fn(async () => []),
  listServices: vi.fn(async () => []),
  sendCatalogueFlow: vi.fn(),
  servicesReply: vi.fn(() => ''),
  catalogueReply: vi.fn(() => ''),
}));

const { handleWebhook } = await import('../src/webhook.js');
const { FlowRegistry } = await import('../src/flows.js');

// ---- Minimal in-memory DB for the onboarding queries ----------------------
interface OnboardingRow { student_name: string | null; onboarded_at: Date | null; name_requested_at: Date | null }
function memoryDb() {
  const onboarding = new Map<string, OnboardingRow>();
  const contacts = new Map<string, string>();
  const finder = new Map<string, { step: string; postcode: string | null; suburb: string | null; provider_type: string | null }>();
  const db = {
    onboarding,
    contacts,
    finder,
    async query(sql: string, values: unknown[] = []) {
      const s = sql.replace(/\s+/g, ' ');
      if (s.startsWith('INSERT INTO webhook_events')) return { rowCount: 1, rows: [] };
      if (s.startsWith('UPDATE webhook_events') || s.startsWith('DELETE FROM webhook_events')) return { rowCount: 1, rows: [] };
      if (s.includes('INSERT INTO onboarding_state')) {
        const id = values[0] as string;
        if (!onboarding.has(id)) onboarding.set(id, { student_name: null, onboarded_at: null, name_requested_at: null });
        return { rowCount: 1, rows: [] };
      }
      if (s.includes('SET name_requested_at = now()')) {
        const row = onboarding.get(values[0] as string)!;
        row.name_requested_at = new Date();
        return { rowCount: 1, rows: [{ student_name: row.student_name, onboarded_at: row.onboarded_at }] };
      }
      if (s.includes('AS pending')) {
        const row = onboarding.get(values[0] as string);
        if (!row?.name_requested_at) return { rowCount: 0, rows: [] };
        return { rowCount: 1, rows: [{ pending: Date.now() - row.name_requested_at.getTime() < 30 * 60_000 }] };
      }
      if (s.includes('SET name_requested_at = NULL')) {
        const row = onboarding.get(values[0] as string);
        if (row) row.name_requested_at = null;
        return { rowCount: row ? 1 : 0, rows: [] };
      }
      if (s.includes('DELETE FROM provider_search_state')) {
        finder.delete(values[0] as string);
        return { rowCount: 1, rows: [] };
      }
      if (s.includes('FROM provider_search_state')) {
        const row = finder.get(values[0] as string);
        return { rowCount: row ? 1 : 0, rows: row ? [row] : [] };
      }
      if (s.includes('INSERT INTO provider_search_state')) {
        const [id, step, postcode, suburb, provider_type] = values as string[];
        finder.set(id, { step, postcode, suburb, provider_type });
        return { rowCount: 1, rows: [] };
      }
      if (s.includes('DELETE FROM provider_search_state')) {
        finder.delete(values[0] as string);
        return { rowCount: 1, rows: [] };
      }
      if (s.startsWith('UPDATE contacts SET name')) {
        contacts.set(values[0] as string, values[1] as string);
        return { rowCount: 1, rows: [] };
      }
      if (s.includes('SET student_name = $2')) {
        const row = onboarding.get(values[0] as string)!;
        row.student_name = values[1] as string;
        row.onboarded_at ??= new Date();
        row.name_requested_at = null;
        return { rowCount: 1, rows: [] };
      }
      return { rowCount: 0, rows: [] };
    },
    close: async () => undefined,
  };
  return db as typeof db & Database;
}

const SECRET = 'test-secret';
let counter = 0;
async function say(db: Database, body: string, interactiveId?: string): Promise<string[]> {
  sent.length = 0;
  const message = interactiveId
    ? { id: `m${++counter}`, from: '61400000000', type: 'interactive', interactive: { list_reply: { id: interactiveId, title: body } } }
    : { id: `m${++counter}`, from: '61400000000', type: 'text', text: { body } };
  const raw = JSON.stringify({ message });
  const signature = createHmac('sha256', SECRET).update(raw).digest('hex');
  const res = await handleWebhook(
    new Request('http://localhost/webhooks/kapso', { method: 'POST', body: raw, headers: { 'x-webhook-signature': signature } }),
    db,
    new FlowRegistry(),
  );
  expect(res.status).toBe(200);
  return sent.map((m) => m.body);
}

const savedEnv = { ...process.env };
beforeEach(() => {
  process.env.KAPSO_WEBHOOK_SECRET = SECRET;
  process.env.PUBLIC_BASE_URL = 'https://oshc.example.com';
  delete process.env.MISTRAL_API_KEYS;
  delete process.env.MISTRAL_API_KEY;
  delete process.env.KAPSO_PHONE_NUMBER_ID;
});
afterAll(() => { process.env = savedEnv; });

describe('self-service onboarding over WhatsApp', () => {
  it('ONBOARD → asks name → name → onboarded (no API call)', async () => {
    const db = memoryDb();
    const [ask] = await say(db, 'onboard');
    expect(ask).toMatch(/What's your name/);
    expect(db.onboarding.has('contact-1')).toBe(true);

    const [done] = await say(db, 'my name is priya sharma');
    expect(done).toMatch(/You're onboarded, Priya Sharma/);
    expect(db.contacts.get('contact-1')).toBe('Priya Sharma');
    expect(db.onboarding.get('contact-1')?.onboarded_at).toBeInstanceOf(Date);
    expect(db.onboarding.get('contact-1')?.name_requested_at).toBeNull();
  });

  it('re-prompts on a non-name and lets questions through', async () => {
    const db = memoryDb();
    await say(db, 'ONBOARDING');
    const [retry] = await say(db, '12345');
    expect(retry).toMatch(/doesn't look like a name/);
    // A real question closes the prompt and is answered normally.
    const [answer] = await say(db, 'how do I claim a GP visit?');
    expect(answer).toMatch(/How to make a claim/);
    expect(db.onboarding.get('contact-1')?.name_requested_at).toBeNull();
  });

  it('CANCEL closes the prompt; ONBOARD again offers a name update', async () => {
    const db = memoryDb();
    await say(db, 'onboard');
    await say(db, 'Mei Lin');
    const [again] = await say(db, 'onboard');
    expect(again).toMatch(/already onboarded as \*Mei Lin\*/);
    const [cancel] = await say(db, 'cancel');
    expect(cancel).toMatch(/cancelled/);
  });
});

describe('menu selections give complete topic guides', () => {
  it.each([
    ['menu:coverage', /Understanding your OSHC cover/],
    ['menu:claims', /How to make a claim/],
    ['menu:pharmacy', /Pharmacy and medicines/],
    ['menu:visa', /Visa rules and waiting periods/],
    ['menu:forms', /Forms and member guides/],
  ])('%s', async (id, title) => {
    const [body] = await say(memoryDb(), 'tap', id);
    expect(body).toMatch(title);
    expect(body).toMatch(/\*Next step:\*/);
    // No raw KB artefacts: markdown links, tables, PDF headers, mid-word cuts.
    expect(body).not.toMatch(/\]\(|\|\s*---|Member Guide \|\s*\d|…$/);
    // No ragged one-word lines from PDF hard wraps.
    for (const line of body.split('\n')) if (line.trim()) expect(line.trim().length).toBeGreaterThan(10);
  });

  it('numbers map to the same guides as the menu list', async () => {
    expect((await say(memoryDb(), '2'))[0]).toMatch(/How to make a claim/);
    expect((await say(memoryDb(), '3'))[0]).toMatch(/What's your postcode/);
  });

  it('bare topic words (with typos) get the guide too', async () => {
    expect((await say(memoryDb(), 'cliam'))[0]).toMatch(/How to make a claim/);
    expect((await say(memoryDb(), 'covre'))[0]).toMatch(/Understanding your OSHC cover/);
  });
});

describe('illegible input', () => {
  it.each(['asdfghjkl', 'jkjkjk lol', 'qwpoeiru zxmnv', '🤔🤔', '.....', '9876543'])('%s → says it could not understand', async (text) => {
    const [body] = await say(memoryDb(), text);
    expect(body).toMatch(/couldn't read that message/);
    expect(body).not.toMatch(/How to make a claim|Understanding your OSHC cover/);
  });

  it('typo-heavy but real questions still route', async () => {
    const [body] = await say(memoryDb(), 'hw do i cliam my gp vist');
    expect(body).not.toMatch(/couldn't read/);
  });
});

describe('emergency button', () => {
  it('sends text with 000 plus a Call 000 button that opens the dialer page', async () => {
    const db = memoryDb();
    await say(db, "my friend isn't breathing");
    expect(sent[0].body).toContain('000');
    const button = sent.find((m) => m.kind === 'call-button');
    expect(button?.label).toBe('Call 000');
    expect(button?.url).toBe('https://oshc.example.com/call/000?lang=en');
  });

  it('cover questions about ambulances are not emergencies', async () => {
    await say(memoryDb(), 'Is an ambulance covered?');
    expect(sent.find((m) => m.kind === 'call-button')).toBeUndefined();
  });
});

describe('find a doctor or clinic (live Medibank search, mocked)', () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/provider-search-parkville-gp.json', import.meta.url), 'utf8'));
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  beforeEach(() => {
    calls.length = 0;
    // Saturday 31 Oct 2026, 2:30 pm in Melbourne.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-31T03:30:00Z'));
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify(fixture), { status: 200, headers: { 'content-type': 'application/json' } });
    }));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('menu 3 → postcode → type → 2 nearest open now + deep link', async () => {
    const db = memoryDb();
    expect((await say(db, 'tap', 'menu:providers'))[0]).toMatch(/What's your postcode/);

    const [picker] = await say(db, '3052');
    expect(picker).toMatch(/near \*Parkville VIC 3052\*/);
    expect(picker).toMatch(/provider:gp\|1\. GP/);
    expect(picker).toMatch(/provider:afterhours/);

    const [results] = await say(db, 'GP', 'provider:gp');
    expect(calls[0].url).toBe('https://www.medibank.com.au/api/provider-search/v1/search/');
    expect(calls[0].body).toMatchObject({ serviceTypes: ['GENERAL PRACTICE CLINIC'], searchRadius: 10, location: { latitude: -37.78624, longitude: 144.94742 } });
    // Only Primecare (Sat 1:00–5:30 PM) is open at 2:30 pm Saturday.
    expect(results).toMatch(/Nearest GPs open now near Parkville VIC 3052/);
    expect(results).toMatch(/1\. \*Primecare Medical\* — 2\.4 km/);
    expect(results).toMatch(/Open now · today: 1:00 – 5:30 PM/);
    expect(results).not.toMatch(/Brunswick Central|Vita Medical/);
    expect(results).toContain('https://www.medibankoshc.com.au/find-provider/#/List/Parkville_VIC_3052,_Australia/General_Practitioners_%28GP%29');
    expect(db.finder.size).toBe(0);
  });

  it('number reply picks the type; shortcut "hospital near 3053" skips questions', async () => {
    const db = memoryDb();
    await say(db, '3');
    expect((await say(db, 'carlton'))[0]).toMatch(/more than one place[\s\S]*Carlton VIC 3053/);
    await say(db, 'carlton vic');
    const [res] = await say(db, '2');
    expect(res).toContain('/Carlton_VIC_3053,_Australia/OSHC_Direct_Billing_Clinic');

    const [direct] = await say(memoryDb(), 'any hospital near 3053?');
    expect(calls.at(-1)?.body).toMatchObject({ serviceTypes: ['Hospitals'] });
    expect(direct).toContain('/Carlton_VIC_3053,_Australia/Hospitals');
  });

  it('when nothing is open, says so and shows the nearest with hours', async () => {
    vi.setSystemTime(new Date('2026-10-31T12:00:00Z')); // 11 pm Saturday
    const db = memoryDb();
    await say(db, '3');
    await say(db, '3052');
    const [res] = await say(db, '1');
    expect(res).toMatch(/No nearby GPs are open right now/);
    expect(res).toMatch(/Brunswick Central Medical Centre/);
    expect(res).toMatch(/Closed now · today: 9:00 AM – 12:00 PM/);
  });

  it('bad postcode, cancel, and API failure all degrade gracefully', async () => {
    const db = memoryDb();
    await say(db, '3');
    expect((await say(db, '9999'))[0]).toMatch(/couldn't find postcode \*9999\*/);
    expect((await say(db, 'cancel'))[0]).toMatch(/search cancelled/);

    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 503 })));
    const [fail] = await say(memoryDb(), 'gp near 3000');
    expect(fail).toMatch(/couldn't reach Medibank's provider search/);
    expect(fail).toContain('/Melbourne_VIC_3000,_Australia/General_Practitioners_%28GP%29');
  });

  it('a question mid-search leaves the finder and is answered normally', async () => {
    const db = memoryDb();
    await say(db, '3');
    const [ans] = await say(db, 'how do I claim a GP visit?');
    expect(ans).toMatch(/How to make a claim/);
    expect(db.finder.size).toBe(0);
  });
});
