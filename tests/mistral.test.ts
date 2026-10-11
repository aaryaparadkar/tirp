import { describe, expect, it } from 'vitest';
import { MistralKeyPool, mistralChat, resetKeyPoolForTests } from '../src/llm/mistral.js';

function jsonResponse(text: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content: text } }] }),
  } as unknown as Response;
}

describe('key rotation', () => {
  it('round-robins across keys', () => {
    const pool = new MistralKeyPool(['a', 'b', 'c']);
    expect(pool.nextSlot()).toBe(0);
    expect(pool.nextSlot()).toBe(1);
    expect(pool.nextSlot()).toBe(2);
    expect(pool.nextSlot()).toBe(0);
  });

  it('skips keys in cooldown', () => {
    const pool = new MistralKeyPool(['a', 'b']);
    pool.markFailed(0, 60_000);
    expect(pool.nextSlot()).toBe(1);
  });

  it('rotates on 429 then succeeds', async () => {
    resetKeyPoolForTests(['k1', 'k2']);
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      if (calls === 1) return { ok: false, status: 429, json: async () => ({}) } as unknown as Response;
      return jsonResponse('hello');
    }) as unknown as typeof fetch;
    const res = await mistralChat([{ role: 'user', content: 'hi' }], {
      fetchImpl,
      pool: resetKeyPoolForTests(['k1', 'k2']),
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.text).toBe('hello');
    expect(calls).toBe(2);
  });

  it('fails cleanly with no keys', async () => {
    const res = await mistralChat([{ role: 'user', content: 'hi' }], {
      pool: new MistralKeyPool([]),
    });
    expect(res.ok).toBe(false);
  });
});
