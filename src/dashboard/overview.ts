/**
 * Overview aggregation. Computed directly from indexed date filters, with a
 * short-lived cache and an ETag so repeated loads do not re-scan the same
 * window. Higher-volume rollups are a later scaling step and are not required
 * for the current operator volume.
 */

import type { Database } from '../db.js';
import { RANGE_DAYS, type RangeId } from './schemas.js';

export interface KpiMetricDto {
  id: string;
  label: string;
  value: number | null;
  unit: 'count' | 'pct' | 'ms';
  changePct: number | null;
  betterWhen: 'up' | 'down';
  hint: string;
}

export interface TimelinePointDto {
  label: string;
  inbound: number;
  outbound: number;
}

export interface IntentSliceDto {
  intent: string;
  label: string;
  count: number;
  sharePct: number;
}

export interface StatusSliceDto {
  status: string;
  label: string;
  count: number;
  sharePct: number;
}

export interface ShareSliceDto {
  id: string;
  label: string;
  count: number;
  sharePct: number;
}

export interface OverviewDto {
  range: RangeId;
  generatedAt: string;
  kpis: KpiMetricDto[];
  timeline: TimelinePointDto[];
  intents: IntentSliceDto[];
  statuses: StatusSliceDto[];
  languages: ShareSliceDto[];
  direction: { inbound: number; outbound: number };
  errors: ShareSliceDto[];
  peakTimes: { windowLabel: string; detail: string }[];
}

const CACHE_TTL_MS = 30_000;
const cache = new Map<RangeId, { expiresAt: number; etag: string; overview: OverviewDto }>();

function changePct(value: number, previous: number | null): number | null {
  if (previous === null || previous === 0) return null;
  return Math.round(((value - previous) / previous) * 100);
}

function share(count: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((count / total) * 100);
}

const INTENT_LABELS: Record<string, string> = {
  greeting: 'Greeting',
  coverage: 'Cover',
  claims: 'Claims',
  reimbursements: 'Reimbursements',
  healthcare_navigation: 'Healthcare navigation',
  providers: 'Providers',
  pharmacy: 'Pharmacy',
  medicines: 'Medicines',
  visa_compliance: 'Visa compliance',
  waiting_periods: 'Waiting periods',
  student_rewards: 'Student rewards',
  updates: 'Updates',
  forms_and_guides: 'Forms and guides',
  support: 'Support',
  emergency: 'Emergency',
  unknown: 'Unclassified',
};

const STATUS_LABELS: Record<string, string> = {
  new: 'New',
  in_progress: 'In progress',
  awaiting_contact: 'Awaiting reply',
  needs_review: 'Needs review',
  resolved: 'Resolved',
  failed: 'Failed',
};

const LANGUAGE_LABELS: Record<string, string> = {
  en: 'English',
  'zh-CN': '简体中文',
  es: 'Español',
};

const ERROR_LABELS: Record<string, string> = {
  'rate-limited': 'Rate limited',
  'llm-timeout': 'LLM timeout',
  'invalid-input': 'Invalid input',
  'delivery-failed': 'Delivery failed',
};

function titleCase(value: string): string {
  return value
    .split(/[-_]/)
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(' ');
}

interface MessageCountsRow {
  inbound: number;
  outbound: number;
  errors: number;
}

interface WindowRow {
  total: number;
  new_count: number;
  resolved_ai: number;
  handoff: number;
  failed: number;
}

async function messageCounts(db: Database, fromIso: string, toIso: string): Promise<MessageCountsRow> {
  const result = await db.query<MessageCountsRow>(
    `SELECT
       (COUNT(*) FILTER (WHERE direction = 'inbound'))::int AS inbound,
       (COUNT(*) FILTER (WHERE direction = 'outbound'))::int AS outbound,
       (COUNT(*) FILTER (WHERE error_code IS NOT NULL))::int AS errors
     FROM conversation_messages
     WHERE created_at >= $1 AND created_at < $2`,
    [fromIso, toIso],
  );
  return result.rows[0] ?? { inbound: 0, outbound: 0, errors: 0 };
}

async function windowCounts(db: Database, fromIso: string, toIso: string): Promise<WindowRow> {
  const result = await db.query<WindowRow>(
    `SELECT
       COUNT(*)::int AS total,
       (COUNT(*) FILTER (WHERE first_message_at >= $1 AND first_message_at < $2))::int AS new_count,
       (COUNT(*) FILTER (WHERE status = 'resolved' AND handling_mode = 'ai'))::int AS resolved_ai,
       (COUNT(*) FILTER (WHERE handling_mode IN ('human', 'escalated')))::int AS handoff,
       (COUNT(*) FILTER (WHERE status = 'failed' OR has_error))::int AS failed
     FROM conversations
     WHERE first_message_at >= $1 AND first_message_at < $2`,
    [fromIso, toIso],
  );
  return result.rows[0] ?? { total: 0, new_count: 0, resolved_ai: 0, handoff: 0, failed: 0 };
}

async function openAt(db: Database, boundaryIso: string): Promise<number> {
  const result = await db.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM conversations
      WHERE first_message_at < $1
        AND status <> 'failed'
        AND (resolved_at IS NULL OR resolved_at > $1)`,
    [boundaryIso],
  );
  return Number(result.rows[0]?.count || 0);
}

async function avgFirstResponse(db: Database, fromIso: string, toIso: string): Promise<number | null> {
  const result = await db.query<{ avg_ms: number | null }>(
    `SELECT AVG(EXTRACT(EPOCH FROM (first_out - first_in)) * 1000) AS avg_ms
       FROM (
         SELECT c.id,
                MIN(cm.created_at) FILTER (WHERE cm.direction = 'inbound') AS first_in,
                MIN(cm.created_at) FILTER (WHERE cm.direction = 'outbound') AS first_out
           FROM conversations c
           JOIN conversation_messages cm ON cm.conversation_id = c.id
          WHERE c.first_message_at >= $1 AND c.first_message_at < $2
          GROUP BY c.id
       ) t
      WHERE first_in IS NOT NULL AND first_out IS NOT NULL AND first_out >= first_in`,
    [fromIso, toIso],
  );
  const value = result.rows[0]?.avg_ms;
  return value === null || value === undefined ? null : Math.round(Number(value));
}

async function timeline(
  db: Database,
  range: RangeId,
  fromIso: string,
  toIso: string,
): Promise<TimelinePointDto[]> {
  const step = range === '24h' ? '1 hour' : '1 day';
  const format = range === '24h' ? 'HH24:00' : 'DD Mon';
  const trunc = range === '24h' ? 'hour' : 'day';
  const result = await db.query<{ label: string; inbound: number; outbound: number }>(
    `WITH buckets AS (
       SELECT generate_series(
         date_trunc($3, $1::timestamptz),
         $2::timestamptz,
         $4::interval
       ) AS bucket
     ),
     counts AS (
       SELECT date_trunc($3, created_at) AS bucket, direction, COUNT(*)::int AS count
         FROM conversation_messages
        WHERE created_at >= $1 AND created_at < $2
        GROUP BY 1, 2
     )
     SELECT to_char(b.bucket AT TIME ZONE 'UTC', $5) AS label,
            COALESCE(SUM(CASE WHEN c.direction = 'inbound' THEN c.count END), 0)::int AS inbound,
            COALESCE(SUM(CASE WHEN c.direction = 'outbound' THEN c.count END), 0)::int AS outbound
       FROM buckets b
       LEFT JOIN counts c ON c.bucket = b.bucket
      GROUP BY b.bucket
      ORDER BY b.bucket`,
    [fromIso, toIso, trunc, step, format],
  );
  return result.rows;
}

async function intentMix(db: Database, fromIso: string, toIso: string): Promise<IntentSliceDto[]> {
  const result = await db.query<{ intent: string; count: number }>(
    `SELECT COALESCE(current_intent, 'unknown') AS intent, COUNT(*)::int AS count
       FROM conversations
      WHERE first_message_at >= $1 AND first_message_at < $2
      GROUP BY 1
      ORDER BY count DESC`,
    [fromIso, toIso],
  );
  const total = result.rows.reduce((sum, row) => sum + Number(row.count), 0);
  return result.rows.map((row) => ({
    intent: row.intent,
    label: INTENT_LABELS[row.intent] ?? titleCase(row.intent),
    count: Number(row.count),
    sharePct: share(Number(row.count), total),
  }));
}

async function statusBreakdown(db: Database, fromIso: string, toIso: string): Promise<StatusSliceDto[]> {
  const result = await db.query<{ status: string; count: number }>(
    `SELECT status, COUNT(*)::int AS count
       FROM conversations
      WHERE first_message_at >= $1 AND first_message_at < $2
      GROUP BY 1
      ORDER BY count DESC`,
    [fromIso, toIso],
  );
  const total = result.rows.reduce((sum, row) => sum + Number(row.count), 0);
  return result.rows.map((row) => ({
    status: row.status,
    label: STATUS_LABELS[row.status] ?? titleCase(row.status),
    count: Number(row.count),
    sharePct: share(Number(row.count), total),
  }));
}

async function languageSplit(db: Database, fromIso: string, toIso: string): Promise<ShareSliceDto[]> {
  const result = await db.query<{ language: string; count: number }>(
    `SELECT COALESCE(ct.preferred_language, 'en') AS language, COUNT(*)::int AS count
       FROM conversations c
       JOIN contacts ct ON ct.id = c.contact_id
      WHERE c.first_message_at >= $1 AND c.first_message_at < $2
      GROUP BY 1
      ORDER BY count DESC`,
    [fromIso, toIso],
  );
  const total = result.rows.reduce((sum, row) => sum + Number(row.count), 0);
  return result.rows.map((row) => ({
    id: row.language,
    label: LANGUAGE_LABELS[row.language] ?? row.language,
    count: Number(row.count),
    sharePct: share(Number(row.count), total),
  }));
}

async function errorSplit(db: Database, fromIso: string, toIso: string): Promise<ShareSliceDto[]> {
  const result = await db.query<{ code: string; count: number }>(
    `SELECT error_code AS code, COUNT(*)::int AS count
       FROM conversation_messages
      WHERE created_at >= $1 AND created_at < $2 AND error_code IS NOT NULL
      GROUP BY 1
      ORDER BY count DESC
      LIMIT 5`,
    [fromIso, toIso],
  );
  const total = result.rows.reduce((sum, row) => sum + Number(row.count), 0);
  return result.rows.map((row) => ({
    id: row.code,
    label: ERROR_LABELS[row.code] ?? titleCase(row.code),
    count: Number(row.count),
    sharePct: share(Number(row.count), total),
  }));
}

async function peakTimes(
  db: Database,
  fromIso: string,
  toIso: string,
): Promise<{ windowLabel: string; detail: string }[]> {
  const result = await db.query<{ window_label: string; count: number }>(
    `SELECT to_char(created_at AT TIME ZONE 'Australia/Sydney', 'Dy HH24:00') AS window_label,
            COUNT(*)::int AS count
       FROM conversation_messages
      WHERE created_at >= $1 AND created_at < $2 AND direction = 'inbound'
      GROUP BY 1
      ORDER BY count DESC
      LIMIT 2`,
    [fromIso, toIso],
  );
  return result.rows.map((row) => ({
    windowLabel: row.window_label,
    detail: `${row.count} inbound enquiries recorded in this weekly window.`,
  }));
}

export async function buildOverview(
  db: Database,
  range: RangeId,
  nowIso: string = new Date().toISOString(),
): Promise<{ overview: OverviewDto; etag: string }> {
  const cached = cache.get(range);
  if (cached && cached.expiresAt > Date.now()) {
    return { overview: cached.overview, etag: cached.etag };
  }

  const dayMs = 86_400_000;
  const nowMs = new Date(nowIso).getTime();
  const fromMs = nowMs - RANGE_DAYS[range] * dayMs;
  const prevFromMs = fromMs - RANGE_DAYS[range] * dayMs;
  const fromIso = new Date(fromMs).toISOString();
  const prevFromIso = new Date(prevFromMs).toISOString();

  const [
    currentMessages,
    previousMessages,
    currentWindow,
    previousWindow,
    openNow,
    openPrev,
    avgFirst,
    prevAvgFirst,
    timelinePoints,
    intents,
    statuses,
    languages,
    errors,
    peaks,
  ] = await Promise.all([
    messageCounts(db, fromIso, nowIso),
    messageCounts(db, prevFromIso, fromIso),
    windowCounts(db, fromIso, nowIso),
    windowCounts(db, prevFromIso, fromIso),
    openAt(db, nowIso),
    openAt(db, fromIso),
    avgFirstResponse(db, fromIso, nowIso),
    avgFirstResponse(db, prevFromIso, fromIso),
    timeline(db, range, fromIso, nowIso),
    intentMix(db, fromIso, nowIso),
    statusBreakdown(db, fromIso, nowIso),
    languageSplit(db, fromIso, nowIso),
    errorSplit(db, fromIso, nowIso),
    peakTimes(db, fromIso, nowIso),
  ]);

  const aiResolution =
    currentWindow.total > 0 ? Math.round((currentWindow.resolved_ai / currentWindow.total) * 100) : 0;
  const prevAiResolution =
    previousWindow.total > 0
      ? Math.round((previousWindow.resolved_ai / previousWindow.total) * 100)
      : 0;
  const handoff =
    currentWindow.total > 0 ? Math.round((currentWindow.handoff / currentWindow.total) * 100) : 0;
  const prevHandoff =
    previousWindow.total > 0
      ? Math.round((previousWindow.handoff / previousWindow.total) * 100)
      : 0;

  const kpis: KpiMetricDto[] = [
    {
      id: 'total-enquiries',
      label: 'Total enquiries',
      value: currentMessages.inbound,
      unit: 'count',
      changePct: changePct(currentMessages.inbound, previousMessages.inbound),
      betterWhen: 'up',
      hint: 'All inbound enquiries, severity agnostic.',
    },
    {
      id: 'new-enquiries',
      label: 'New enquiries',
      value: currentWindow.new_count,
      unit: 'count',
      changePct: changePct(currentWindow.new_count, previousWindow.new_count),
      betterWhen: 'up',
      hint: 'First contact in the window.',
    },
    {
      id: 'open-conversations',
      label: 'Open conversations',
      value: openNow,
      unit: 'count',
      changePct: changePct(openNow, openPrev),
      betterWhen: 'down',
      hint: 'Awaiting reply, in progress, or for review.',
    },
    {
      id: 'avg-first-response',
      label: 'Avg first response',
      value: avgFirst,
      unit: 'ms',
      changePct: avgFirst === null ? null : changePct(avgFirst, prevAvgFirst),
      betterWhen: 'down',
      hint: 'Time from inbound to first assistant reply.',
    },
    {
      id: 'ai-resolution-rate',
      label: 'AI resolution rate',
      value: aiResolution,
      unit: 'pct',
      changePct: changePct(aiResolution, prevAiResolution),
      betterWhen: 'up',
      hint: 'Conversations the assistant closed without handoff.',
    },
    {
      id: 'handoff-rate',
      label: 'Handoff rate',
      value: handoff,
      unit: 'pct',
      changePct: changePct(handoff, prevHandoff),
      betterWhen: 'down',
      hint: 'Conversations escalated to a human agent.',
    },
    {
      id: 'failed-conversations',
      label: 'Failed conversations',
      value: currentWindow.failed,
      unit: 'count',
      changePct: changePct(currentWindow.failed, previousWindow.failed),
      betterWhen: 'down',
      hint: 'Delivery failure, rate limit, or fallback.',
    },
    {
      id: 'csat',
      label: 'Satisfaction (CSAT)',
      value: null,
      unit: 'pct',
      changePct: null,
      betterWhen: 'up',
      hint: 'No post-conversation survey is wired up yet.',
    },
  ];

  const overview: OverviewDto = {
    range,
    generatedAt: nowIso,
    kpis,
    timeline: timelinePoints,
    intents,
    statuses,
    languages,
    direction: { inbound: currentMessages.inbound, outbound: currentMessages.outbound },
    errors,
    peakTimes: peaks,
  };

  const etag = `W/"${Buffer.from(JSON.stringify(overview)).length}-${range}-${fromIso}"`;
  cache.set(range, { expiresAt: Date.now() + CACHE_TTL_MS, etag, overview });
  return { overview, etag };
}

/** Drop the in-process overview cache (used between test runs). */
export function resetOverviewCache(): void {
  cache.clear();
}
