/**
 * Self-service onboarding over WhatsApp.
 *
 *   student: ONBOARD
 *   bot:     What's your name?
 *   student: Priya Sharma
 *   bot:     You're onboarded, Priya ✅
 *
 * This replaces the operator-only POST /onboarding/purchase step for the
 * common case. The onboarding_state row is created (idempotently) when the
 * student types ONBOARD, so arrival-date capture and ARRIVAL QUIZ ON work
 * straight away afterwards.
 */
import type { Database } from '../db.js';
import { canonicalizeForMatch, levenshtein, normalizeInput } from '../input-normalization.js';
import type { SupportedLanguage } from '../types.js';

/** How long a "what's your name?" prompt stays open. */
export const NAME_REQUEST_TTL_MINUTES = 30;

const ONBOARD_WORDS = ['onboard', 'onboarding', 'register', 'registration', 'signup', 'enrol', 'enroll'];
const ONBOARD_PHRASES = ['on board', 'sign up', 'sign me up', 'onboard me', 'register me', 'get onboarded', 'start onboarding'];
const ONBOARD_OTHER = ['registrarme', 'registro', 'inscribirme', '注册', '登记', '入职'];

/** True when the message is a request to start onboarding (typo tolerant). */
export function isOnboardCommand(text: string): boolean {
  const raw = normalizeInput(text);
  if (ONBOARD_OTHER.some((w) => raw === w)) return true;
  const c = canonicalizeForMatch(raw);
  if (!c || c.split(' ').length > 3) return false;
  if (ONBOARD_PHRASES.includes(c)) return true;
  const compact = c.replace(/\s+/g, '');
  if (ONBOARD_WORDS.includes(compact) || ONBOARD_OTHER.includes(compact)) return true;
  // One-word typos like "onbaord", "onbord", "onbaording".
  if (!c.includes(' ') && compact.length >= 6) {
    return ['onboard', 'onboarding'].some((w) => levenshtein(compact, w) <= 2);
  }
  return false;
}

export function isCancelCommand(text: string): boolean {
  return /^(cancel|skip|stop|nevermind|never mind|no|cancelar|取消)$/i.test(canonicalizeForMatch(text) || normalizeInput(text));
}

const NAME_PREFIX =
  /^(?:hi[,!.\s]+|hello[,!.\s]+|hey[,!.\s]+)?(?:my\s+name\s+is|my\s+name'?s|name\s*[:\-]|i\s+am|i'?m|im|it'?s|this\s+is|call\s+me|me\s+llamo|mi\s+nombre\s+es|soy|我叫|我的名字是|我是)\s*/iu;

/**
 * Extract a plausible person name from a reply. Returns null when the text
 * does not look like a name (digits, URLs, questions, long sentences).
 */
export function parseStudentName(input: string): string | null {
  let value = normalizeInput(input).replace(/\s+/g, ' ');
  value = value.replace(NAME_PREFIX, '').replace(/[.!。！]+$/u, '').trim();
  if (!value || value.length > 60) return null;
  if (/[?？@#/\\:;=<>{}\[\]_|~^*+$%&0-9]/u.test(value)) return null;
  if (/https?|www\./i.test(value)) return null;
  // Letters (any script), spaces, apostrophes, hyphens, dots, commas only.
  if (!/^[\p{L}\p{M}][\p{L}\p{M}' .,\-’]*$/u.test(value)) return null;
  const words = value.split(' ').filter(Boolean);
  if (words.length > 5) return null;
  // Title-case all-lowercase / all-uppercase Latin names; keep mixed case as typed.
  const latin = /^[\p{Script=Latin}' .,\-’]+$/u.test(value);
  if (latin && (value === value.toLowerCase() || value === value.toUpperCase())) {
    value = words
      .map((w) => w.toLowerCase().replace(/(^|[-'’])(\p{L})/gu, (_m, sep: string, ch: string) => `${sep}${ch.toUpperCase()}`))
      .join(' ');
  }
  return value;
}

export interface OnboardingSnapshot {
  onboarded: boolean;
  studentName: string | null;
}

/**
 * Create the onboarding record if needed and open a name prompt.
 * Safe to call repeatedly — the same contact never gets duplicate rows.
 */
export async function startSelfOnboarding(db: Database, contactId: string): Promise<OnboardingSnapshot> {
  await db.query(
    `INSERT INTO onboarding_state (contact_id, purchase_event_key)
     VALUES ($1, $2)
     ON CONFLICT (contact_id) DO NOTHING`,
    [contactId, `self-onboard:${contactId}`],
  );
  const result = await db.query<{ student_name: string | null; onboarded_at: Date | null }>(
    `UPDATE onboarding_state
        SET name_requested_at = now(),
            updated_at = now()
      WHERE contact_id = $1
      RETURNING student_name, onboarded_at`,
    [contactId],
  );
  const row = result.rows[0];
  return { onboarded: Boolean(row?.onboarded_at), studentName: row?.student_name ?? null };
}

/** True while a name prompt sent to this contact is still open. */
export async function hasPendingNameRequest(db: Database, contactId: string): Promise<boolean> {
  try {
    const result = await db.query<{ pending: boolean }>(
      `SELECT (name_requested_at > now() - ($2 || ' minutes')::interval) AS pending
         FROM onboarding_state
        WHERE contact_id = $1
          AND name_requested_at IS NOT NULL`,
      [contactId, String(NAME_REQUEST_TTL_MINUTES)],
    );
    return result.rows[0]?.pending === true;
  } catch {
    // Migration 0009 not applied yet: behave as if nothing is pending.
    return false;
  }
}

export async function clearNameRequest(db: Database, contactId: string): Promise<void> {
  await db.query(
    `UPDATE onboarding_state SET name_requested_at = NULL, updated_at = now() WHERE contact_id = $1`,
    [contactId],
  ).catch(() => undefined);
}

/** Save the name on both the contact and onboarding record, closing the prompt. */
export async function completeSelfOnboarding(db: Database, contactId: string, name: string): Promise<void> {
  const run = async (tx: Database): Promise<void> => {
    await tx.query(`UPDATE contacts SET name = $2, updated_at = now() WHERE id = $1`, [contactId, name]);
    await tx.query(
      `UPDATE onboarding_state
          SET student_name = $2,
              onboarded_at = COALESCE(onboarded_at, now()),
              name_requested_at = NULL,
              updated_at = now()
        WHERE contact_id = $1`,
      [contactId, name],
    );
  };
  if (db.transaction) await db.transaction(run);
  else await run(db);
}

type OnboardingCopy = {
  quizAsk: string;
  quizYesButton: string;
  quizNoButton: string;
  quizYes: string;
  quizNo: string;
  askName: string;
  askNameAgain: (current: string) => string;
  invalidName: string;
  done: (name: string) => string;
  cancelled: string;
  failed: string;
};

const COPY: Record<SupportedLanguage, OnboardingCopy> = {
  en: {
    quizAsk:
      `*One last thing — want to join the OSHC quiz?* 🧠\n\n` +
      `Short, friendly questions that teach you how to use your cover in Australia (GPs, claims, pharmacies, emergencies). Earn XP as you go.`,
    quizYesButton: 'Yes, opt me in',
    quizNoButton: 'Not now',
    quizYes:
      `*You're in!* ✅ You'll get quiz invitations, including one a couple of days after you arrive.\n\n` +
      `Reply *QUIZ* any time to start, or *HELLO* for the main menu.`,
    quizNo: `No problem. Reply *QUIZ* any time if you change your mind, or *HELLO* for the main menu.`,
    askName: `*Welcome to OSHC Compass!* 👋\n\nLet's get you set up. What's your name?\n\nReply with just your name (for example: Priya Sharma).`,
    askNameAgain: (current) =>
      `You're already onboarded as *${current}*.\n\nTo update your name, reply with it now. Reply CANCEL to keep it as is.`,
    invalidName: `That doesn't look like a name. Please reply with just your name (for example: Priya Sharma), or CANCEL to stop.`,
    done: (name) =>
      `*You're onboarded, ${name}!* ✅\n\n` +
      `I can help with your Medibank OSHC cover, claims, finding a doctor, medicines and visa rules.`,
    cancelled: `No problem, onboarding cancelled. Reply ONBOARD whenever you're ready, or MENU for help.`,
    failed: `Sorry, I couldn't finish onboarding right now. Please reply ONBOARD to try again in a minute.`,
  },
  'zh-CN': {
    quizAsk: `*最后一步：想参加 OSHC 小测验吗？* 🧠\n\n简短有趣的问题，教你在澳大利亚如何使用保险（看医生、理赔、药房、紧急情况），还能赚取 XP。`,
    quizYesButton: '好的，加入',
    quizNoButton: '以后再说',
    quizYes: `*已加入！* ✅ 你会收到测验邀请，包括抵达后几天的一次。\n\n随时回复 *QUIZ* 开始，或回复*你好*查看主菜单。`,
    quizNo: `没问题。改变主意时随时回复 *QUIZ*，或回复*你好*查看主菜单。`,
    askName: `*欢迎使用 OSHC Compass！* 👋\n\n我们来完成注册。请问你叫什么名字？\n\n请只回复你的名字（例如：王小明）。`,
    askNameAgain: (current) => `你已经以 *${current}* 完成注册。\n\n如需修改名字，请直接回复新名字；回复“取消”保持不变。`,
    invalidName: `这看起来不像名字。请只回复你的名字（例如：王小明），或回复“取消”。`,
    done: (name) =>
      `*${name}，注册完成！* ✅\n\n` +
      `我可以帮你了解 Medibank OSHC 保障、理赔、找医生、药品和签证要求。`,
    cancelled: `好的，已取消注册。准备好后回复 ONBOARD，或回复“菜单”获取帮助。`,
    failed: `抱歉，暂时无法完成注册。请稍后回复 ONBOARD 重试。`,
  },
  es: {
    quizAsk: `*Una última cosa: ¿quieres unirte al quiz de OSHC?* 🧠\n\nPreguntas cortas que te enseñan a usar tu cobertura en Australia (médicos, reclamos, farmacias, emergencias). Ganas XP.`,
    quizYesButton: 'Sí, inscríbeme',
    quizNoButton: 'Ahora no',
    quizYes: `*¡Listo!* ✅ Recibirás invitaciones al quiz, incluida una pocos días después de tu llegada.\n\nResponde *QUIZ* cuando quieras para empezar, o *HOLA* para el menú principal.`,
    quizNo: `Sin problema. Responde *QUIZ* si cambias de opinión, o *HOLA* para el menú principal.`,
    askName: `*¡Bienvenido a OSHC Compass!* 👋\n\nVamos a registrarte. ¿Cómo te llamas?\n\nResponde solo con tu nombre (por ejemplo: Priya Sharma).`,
    askNameAgain: (current) =>
      `Ya estás registrado como *${current}*.\n\nPara cambiar tu nombre, respóndelo ahora. Responde CANCELAR para dejarlo igual.`,
    invalidName: `Eso no parece un nombre. Responde solo con tu nombre (por ejemplo: Priya Sharma) o CANCELAR.`,
    done: (name) =>
      `*¡Listo, ${name}! Ya estás registrado.* ✅\n\n` +
      `Puedo ayudarte con tu cobertura Medibank OSHC, reclamos, buscar un médico, medicamentos y requisitos de visa.`,
    cancelled: `Sin problema, registro cancelado. Responde ONBOARD cuando quieras o MENÚ para ayuda.`,
    failed: `Lo siento, no pude completar el registro ahora. Responde ONBOARD para intentarlo de nuevo en un minuto.`,
  },
};

export function onboardingCopy(lang: SupportedLanguage): OnboardingCopy {
  return COPY[lang] || COPY.en;
}

// ---------------------------------------------------------------------------
// Quiz opt-in question asked right after onboarding
// ---------------------------------------------------------------------------

export const QUIZ_OPTIN_YES = 'quiz_optin:yes';
export const QUIZ_OPTIN_NO = 'quiz_optin:no';

/** yes / no / null (not an answer). Button ids always count. */
export function parseQuizOptIn(text: string): boolean | null {
  const raw = normalizeInput(text).toLowerCase();
  if (raw === QUIZ_OPTIN_YES) return true;
  if (raw === QUIZ_OPTIN_NO) return false;
  const c = canonicalizeForMatch(raw);
  if (/^(yes|y|yeah|yep|yup|sure|ok|okay|opt in|opt me in|yes opt me in|yes please|si|sí|sí inscríbeme|si inscribeme|claro|好|好的|是|好的 加入|加入)$/.test(c) || /^(好的|是的?|加入)/.test(raw)) return true;
  if (/^(no|n|nope|nah|not now|later|maybe later|no thanks|no gracias|ahora no|不|不用|以后再说)$/.test(c) || /^(不|以后)/.test(raw)) return false;
  return null;
}

export async function markQuizPrompted(db: Database, contactId: string): Promise<void> {
  await db.query(
    `UPDATE onboarding_state SET quiz_prompted_at = now(), updated_at = now() WHERE contact_id = $1`,
    [contactId],
  ).catch(() => undefined);
}

export async function hasPendingQuizPrompt(db: Database, contactId: string): Promise<boolean> {
  try {
    const result = await db.query<{ pending: boolean }>(
      `SELECT (quiz_prompted_at > now() - ($2 || ' minutes')::interval) AS pending
         FROM onboarding_state
        WHERE contact_id = $1 AND quiz_prompted_at IS NOT NULL`,
      [contactId, String(NAME_REQUEST_TTL_MINUTES)],
    );
    return result.rows[0]?.pending === true;
  } catch {
    return false;
  }
}

/** Record the answer: consent for arrival invitations + weekly quiz opt-in. */
export async function answerQuizPrompt(db: Database, contactId: string, optIn: boolean): Promise<void> {
  const run = async (tx: Database): Promise<void> => {
    await tx.query(
      optIn
        ? `UPDATE onboarding_state
              SET quiz_prompted_at = NULL,
                  quiz_invite_opted_in_at = now(),
                  quiz_invite_opted_out_at = NULL,
                  updated_at = now()
            WHERE contact_id = $1`
        : `UPDATE onboarding_state
              SET quiz_prompted_at = NULL,
                  quiz_invite_opted_out_at = now(),
                  updated_at = now()
            WHERE contact_id = $1`,
      [contactId],
    );
    await tx.query('UPDATE contacts SET quiz_opted_in = $2 WHERE id = $1', [contactId, optIn]);
  };
  if (db.transaction) await db.transaction(run);
  else await run(db);
}

export async function clearQuizPrompt(db: Database, contactId: string): Promise<void> {
  await db.query(
    `UPDATE onboarding_state SET quiz_prompted_at = NULL, updated_at = now() WHERE contact_id = $1`,
    [contactId],
  ).catch(() => undefined);
}
