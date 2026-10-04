import type { Database } from './db.js';
import { sendFlow, sendText } from './kapso.js';
import { catalogueConfig } from './config.js';
import { id, now } from './lib.js';
import type { CatalogueCategory, CatalogueService, Contact } from './types.js';

export async function ensureContact(db: Database, phone: string, name = 'WhatsApp user'): Promise<Contact> {
  const existing = await db.query<{ id: string; phone: string; name: string; locale: string; opted_in: boolean }>('SELECT id, phone, name, locale, opted_in FROM contacts WHERE phone = $1', [phone]);
  if (existing.rows[0]) return { ...existing.rows[0], optedIn: existing.rows[0].opted_in };
  const result = await db.query<{ id: string; phone: string; name: string; locale: string; opted_in: boolean }>(
    'INSERT INTO contacts (id, phone, name, locale, opted_in, created_at, updated_at) VALUES ($1, $2, $3, $4, true, $5, $5) RETURNING id, phone, name, locale, opted_in',
    [id(), phone, name, 'en_US', now()],
  );
  return { ...result.rows[0], optedIn: result.rows[0].opted_in };
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
