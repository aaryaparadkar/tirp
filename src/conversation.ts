import type { Database } from './db.js';
import { id, now } from './lib.js';
import type { ConversationTurn, Intent } from './types.js';

export async function ensureConversationTable(db: Database): Promise<void> {
  // Idempotent for local/tunnel testing without running full migrations.
  await db.query(
    `CREATE TABLE IF NOT EXISTS conversation_messages (
      id TEXT PRIMARY KEY,
      contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
      wa_message_id TEXT,
      direction TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
      message_type TEXT NOT NULL DEFAULT 'text',
      body TEXT NOT NULL DEFAULT '',
      intent TEXT,
      source_ids JSONB NOT NULL DEFAULT '[]',
      llm_model TEXT,
      llm_key_slot INTEGER,
      latency_ms INTEGER,
      error_code TEXT,
      created_at TIMESTAMPTZ NOT NULL
    )`,
  );
  await db.query(`CREATE INDEX IF NOT EXISTS idx_conversation_contact ON conversation_messages(contact_id, created_at)`);
}

export async function saveTurn(
  db: Database,
  contactId: string,
  direction: 'inbound' | 'outbound',
  body: string,
  opts: {
    waMessageId?: string;
    messageType?: string;
    intent?: Intent | string;
    sourceIds?: string[];
    llmModel?: string;
    llmKeySlot?: number;
    latencyMs?: number;
    errorCode?: string;
  } = {},
): Promise<void> {
  try {
    await ensureConversationTable(db);
    await db.query(
      `INSERT INTO conversation_messages
        (id, contact_id, wa_message_id, direction, message_type, body, intent, source_ids, llm_model, llm_key_slot, latency_ms, error_code, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        id(),
        contactId,
        opts.waMessageId || null,
        direction,
        opts.messageType || 'text',
        (body || '').slice(0, 4000),
        opts.intent || null,
        JSON.stringify(opts.sourceIds || []),
        opts.llmModel || null,
        typeof opts.llmKeySlot === 'number' ? opts.llmKeySlot : null,
        typeof opts.latencyMs === 'number' ? opts.latencyMs : null,
        opts.errorCode || null,
        now(),
      ],
    );
  } catch (error) {
    // Conversation logging must never break replies.
    console.error('conversation save failed', error);
  }
}

export async function recentTurns(db: Database, contactId: string, limit = 8): Promise<ConversationTurn[]> {
  try {
    await ensureConversationTable(db);
    const res = await db.query<{ direction: string; body: string }>(
      `SELECT direction, body FROM conversation_messages WHERE contact_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [contactId, limit],
    );
    return res.rows.reverse().map((r) => ({
      role: r.direction === 'outbound' ? 'assistant' : 'user',
      body: r.body || '',
    }));
  } catch {
    return [];
  }
}
