import type { Database } from './db.js';
import { sendFlow, sendText } from './kapso.js';
import { catalogueConfig } from './config.js';
import { id, now } from './lib.js';
import type { CatalogueCategory, CatalogueService, Contact } from './types.js';

type ContactRow = { id: string; phone: string; name: string; locale: string; preferred_language?: string | null; opted_in: boolean };

function toContact(row: ContactRow): Contact {
  return {
    id: row.id,
    phone: row.phone,
    name: row.name,
    locale: row.locale,
    preferredLanguage: (row.preferred_language as Contact['preferredLanguage']) || null,
    optedIn: row.opted_in,
  };
}

export async function ensureContact(db: Database, phone: string, name = 'WhatsApp user'): Promise<Contact> {
  const existing = await db.query<ContactRow>('SELECT id, phone, name, locale, preferred_language, opted_in FROM contacts WHERE phone = $1', [phone]).catch(async () => {
    // Fallback for DBs where the multilingual migration has not run yet.
    const legacy = await db.query<Omit<ContactRow, 'preferred_language'>>('SELECT id, phone, name, locale, opted_in FROM contacts WHERE phone = $1', [phone]);
    return { ...legacy, rows: legacy.rows.map((r) => ({ ...r, preferred_language: null })) };
  });
  if (existing.rows[0]) return toContact(existing.rows[0]);
  try {
    const result = await db.query<ContactRow>(
      'INSERT INTO contacts (id, phone, name, locale, preferred_language, opted_in, created_at, updated_at) VALUES ($1, $2, $3, $4, NULL, true, $5, $5) RETURNING id, phone, name, locale, preferred_language, opted_in',
      [id(), phone, name, 'en_US', now()],
    );
    return toContact(result.rows[0]);
  } catch {
    const result = await db.query<ContactRow>(
      'INSERT INTO contacts (id, phone, name, locale, opted_in, created_at, updated_at) VALUES ($1, $2, $3, $4, true, $5, $5) RETURNING id, phone, name, locale, opted_in',
      [id(), phone, name, 'en_US', now()],
    );
    return toContact({ ...result.rows[0], preferred_language: null });
  }
}

/** Atomically lock the first-detected language; concurrent first messages cannot overwrite each other. */
export async function lockPreferredLanguage(
  db: Database,
  contactId: string,
  language: 'en' | 'zh-CN' | 'es',
): Promise<'en' | 'zh-CN' | 'es'> {
  try {
    const res = await db.query<{ preferred_language: string }>(
      `UPDATE contacts SET preferred_language = $1, language_detected_at = now(), updated_at = now()
       WHERE id = $2 AND preferred_language IS NULL RETURNING preferred_language`,
      [language, contactId],
    );
    if (res.rows[0]?.preferred_language) return res.rows[0].preferred_language as 'en' | 'zh-CN' | 'es';
    const current = await db.query<ContactRow>('SELECT preferred_language FROM contacts WHERE id = $1', [contactId]).catch(() => ({ rows: [] as ContactRow[] }));
    const existing = (current as { rows: ContactRow[] }).rows[0]?.preferred_language;
    if (existing === 'en' || existing === 'zh-CN' || existing === 'es') return existing;
    return language;
  } catch {
    return language;
  }
}

export async function listCategories(db: Database): Promise<CatalogueCategory[]> {
  const result = await db.query<CatalogueCategory>('SELECT id, name, description FROM catalogue_categories WHERE active = true ORDER BY sort_order, name');
  return result.rows;
}

export async function listServices(db: Database, categoryId?: string): Promise<CatalogueService[]> {
  const values: string[] = [];
  const filter = categoryId ? 'AND category_id = $1' : '';
  if (categoryId) values.push(categoryId);
  const result = await db.query<{ id: string; category_id: string; name: string; description: string; flow_name?: string; flow_id?: string; action_label?: string }>(
    `SELECT id, category_id, name, description, flow_name, flow_id, action_label FROM catalogue_services WHERE active = true ${filter} ORDER BY sort_order, name`, values,
  );
  return result.rows.map((row) => ({ id: row.id, categoryId: row.category_id, name: row.name, description: row.description, flowName: row.flow_name, flowId: row.flow_id, actionLabel: row.action_label }));
}

export function catalogueReply(categories: CatalogueCategory[]): string {
  const items = categories.map((category, index) => `${index + 1}. ${category.name}`).join('\n');
  return `${catalogueConfig.greeting}\n\n${items}\n\nReply with a number or SERVICE to browse everything.\n${catalogueConfig.supportText}`;
}

export function servicesReply(services: CatalogueService[]): string {
  if (!services.length) return 'I could not find any services yet. Reply SUPPORT for help.';
  return services.map((service, index) => `${index + 1}. ${service.name}\n${service.description}`).join('\n\n');
}

export async function sendCatalogueFlow(contact: Contact, service: CatalogueService): Promise<void> {
  const flowId = service.flowId || catalogueConfig.flowId;
  if (!flowId) {
    await sendText(catalogueConfig.phoneNumberId, contact.phone, `${service.name}\n\n${service.description}`);
    return;
  }
  await sendFlow({ phoneNumberId: catalogueConfig.phoneNumberId, to: contact.phone, flowId, bodyText: service.description, flowCta: service.actionLabel || 'Open', flowToken: `${service.flowName || 'oshc_service_flow'}:${service.id}:${contact.id}` });
}
