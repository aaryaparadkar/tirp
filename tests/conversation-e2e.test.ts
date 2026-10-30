import { createHmac } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Database } from '../src/db.js';

// ---- Outbound capture -----------------------------------------------------
const sent: Array<{ kind: string; body: string; url?: string; label?: string }> = [];

vi.mock('../src/kapso.js', () => ({
  sendText: vi.fn(async (_p: string, _to: string, body: string) => { sent.push({ kind: 'text', body }); }),
  sendFormattedText: vi.fn(async (_p: string, _to: string, body: string) => { sent.push({ kind: 'text', body }); }),
  sendList: vi.fn(async (_p: string, _to: string, body: string) => { sent.push({ kind: 'list', body }); }),
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
  const db = {
    onboarding,
    contacts,
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
    ['menu:providers', /Finding a doctor or clinic/],
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
    expect((await say(memoryDb(), '3'))[0]).toMatch(/Finding a doctor or clinic/);
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
