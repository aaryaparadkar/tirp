import { mistralConfig } from '../config.js';
import { errorMessage } from '../lib.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface MistralSuccess {
  ok: true;
  text: string;
  model: string;
  keySlot: number;
}

interface MistralFailure {
  ok: false;
  error: string;
  code: 'no_keys' | 'all_keys_failed' | 'timeout' | 'bad_response';
}

export class MistralKeyPool {
  private cursor = 0;
  private cooldownUntil: number[] = [];

  constructor(private readonly keys: string[]) {}

  get size(): number {
    return this.keys.length;
  }

  /** Round-robin slot selection, skipping keys in cooldown. */
  nextSlot(): number | null {
    if (!this.keys.length) return null;
    for (let i = 0; i < this.keys.length; i++) {
      const slot = (this.cursor + i) % this.keys.length;
      if ((this.cooldownUntil[slot] || 0) <= Date.now()) {
        this.cursor = (slot + 1) % this.keys.length;
        return slot;
      }
    }
    return null;
  }

  key(slot: number): string {
    return this.keys[slot];
  }

  markFailed(slot: number, cooldownMs = 60_000): void {
    this.cooldownUntil[slot] = Date.now() + cooldownMs;
  }
}

let sharedPool: MistralKeyPool | null = null;

export function keyPool(): MistralKeyPool {
  if (!sharedPool) sharedPool = new MistralKeyPool(mistralConfig().keys);
  return sharedPool;
}

export function resetKeyPoolForTests(keys: string[]): MistralKeyPool {
  sharedPool = new MistralKeyPool(keys);
  return sharedPool;
}

function isRotatableStatus(status: number): boolean {
  return status === 401 || status === 403 || status === 429 || (status >= 500 && status < 600);
}

export async function mistralChat(
  messages: ChatMessage[],
  opts: {
    jsonMode?: boolean;
    maxTokens?: number;
    temperature?: number;
    fetchImpl?: typeof fetch;
    pool?: MistralKeyPool;
  } = {},
): Promise<MistralSuccess | MistralFailure> {
  const cfg = mistralConfig();
  const pool = opts.pool || keyPool();
  if (!pool.size) return { ok: false, error: 'No MISTRAL_API_KEYS configured', code: 'no_keys' };

  const fetchImpl = opts.fetchImpl || fetch;
  const attempts = Math.min(pool.size, Math.max(1, cfg.maxRetries + 1), 5);
  let lastError = 'unknown provider error';
  const tried = new Set<number>();

  for (let attempt = 0; attempt < attempts; attempt++) {
    const slot = pool.nextSlot();
    if (slot === null || tried.has(slot)) break;
    tried.add(slot);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
    try {
      const res = await fetchImpl(`${cfg.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          // Never log this header.
          authorization: `Bearer ${pool.key(slot)}`,
        },
        body: JSON.stringify({
          model: cfg.model,
          messages,
          temperature: opts.temperature ?? 0.2,
          max_tokens: opts.maxTokens ?? cfg.maxTokensAnswer,
          ...(opts.jsonMode ? { response_format: { type: 'json_object' } } : {}),
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        lastError = `Mistral HTTP ${res.status}`;
        if (isRotatableStatus(res.status)) {
          pool.markFailed(slot, res.status === 429 ? 120_000 : 60_000);
          continue;
        }
        return { ok: false, error: lastError, code: 'bad_response' };
      }
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = data.choices?.[0]?.message?.content?.trim() || '';
      if (!text) {
        lastError = 'Empty Mistral response';
        continue;
      }
      return { ok: true, text, model: cfg.model, keySlot: slot };
    } catch (error) {
      const msg = errorMessage(error);
      lastError = /abort/i.test(msg) ? `Mistral timeout after ${cfg.timeoutMs}ms` : msg;
      pool.markFailed(slot);
      continue;
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, error: lastError, code: tried.size >= pool.size ? 'all_keys_failed' : 'bad_response' };
}
