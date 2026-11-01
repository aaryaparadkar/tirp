/**
 * "Welcome to Australia" check-in.
 *
 * Sent once, on (or after) the day the arrival check-in falls due — two days
 * after the student lands (quiz_due_at). It reassures them they're not on
 * their own and nudges the quiz: "Start my quiz" if they opted in, or an
 * opt-in button if they said not now.
 *
 * Delivery is claimed atomically on onboarding_state.quiz_invite_claimed_at,
 * shared with the scheduler, so a student never gets it twice.
 */
import type { Database } from '../db.js';
import { catalogueConfig } from '../config.js';
import type { SupportedLanguage } from '../types.js';

/** Button ids. "QUIZ" is the plain quiz command, so a tap starts a session. */
export const WELCOME_START_QUIZ_ID = 'QUIZ';
export const WELCOME_OPT_IN_ID = 'quiz_optin:yes';

export function welcomeMessage(name: string | null, lang: SupportedLanguage, optedIn: boolean): string {
  const first = (name || '').trim().split(/\s+/)[0];
  if (lang === 'zh-CN') {
    return (
      `*欢迎来到澳大利亚${first ? `，${first}` : ''}！* 🇦🇺\n\n` +
      `希望你一路顺利，已经开始适应新生活。请记住：你不是一个人。不舒服、不知道去哪看病，或者对保险有疑问时，随时发消息给我。\n\n` +
      `• 回复*你好*查看主菜单\n` +
      `• 需要人工帮助：24/7 学生健康与支持热线 *1800 887 283*\n` +
      `• 紧急情况：立即拨打 *000*\n\n` +
      (optedIn
        ? `你的第一次 OSHC 小测验已经准备好了，集满 XP 可兑换*免费健康检查*。点击下方开始！`
        : `现在可以加入 OSHC 小测验了：简短问题，集满 XP 可兑换*免费健康检查*。点击下方加入！`)
    );
  }
  if (lang === 'es') {
    return (
      `*¡Bienvenido a Australia${first ? `, ${first}` : ''}!* 🇦🇺\n\n` +
      `Esperamos que el viaje haya ido bien y que te estés instalando. Recuerda: no estás solo. Si te sientes mal, no sabes adónde ir o tienes dudas con tu cobertura, escríbeme cuando quieras.\n\n` +
      `• Responde *HOLA* para el menú principal\n` +
      `• Apoyo 24/7 para estudiantes: *1800 887 283*\n` +
      `• Emergencias: llama al *000*\n\n` +
      (optedIn
        ? `Tu primer quiz de OSHC ya está listo — gana XP y canjéalos por un *chequeo de salud gratis*. ¡Toca abajo para empezar!`
        : `Ya puedes unirte al quiz de OSHC — preguntas cortas, y con los XP consigues un *chequeo de salud gratis*. ¡Toca abajo para apuntarte!`)
    );
  }
  return (
    `*G'day${first ? ` ${first}` : ''}, welcome to Australia!* 🇦🇺🦘\n\n` +
    `Hope the flight was a breeze and you're settling in. Just so you know, you're not on your own here, mate. Feeling crook, not sure where to go, or scratching your head over your cover? Flick me a message any time and we'll sort it out together.\n\n` +
    `• Reply *HELLO* for the main menu\n` +
    `• 24/7 Student Health and Support Line: *1800 887 283*\n` +
    `• Emergency? Call *000* straight away\n\n` +
    (optedIn
      ? `Your first OSHC quiz is ready to go. Earn XP and redeem a *free health checkup*. Tap below to get stuck in!`
      : `Reckon you're ready for the OSHC quiz? Quick questions, and the XP you earn gets you a *free health checkup*. Tap below to opt in!`)
  );
}

function buttonFor(lang: SupportedLanguage, optedIn: boolean): { id: string; title: string } {
  if (optedIn) {
    return { id: WELCOME_START_QUIZ_ID, title: lang === 'zh-CN' ? '开始测验' : lang === 'es' ? 'Empezar quiz' : 'Start my quiz' };
  }
  return { id: WELCOME_OPT_IN_ID, title: lang === 'zh-CN' ? '好的，加入' : lang === 'es' ? 'Sí, inscríbeme' : 'Yes, opt me in' };
}

/**
 * Send the welcome if the arrival check-in is due today or earlier (Sydney
 * date) and it hasn't been sent or claimed yet. Returns the text sent, or null.
 */
export async function sendWelcomeIfDue(
  db: Database,
  contact: { id: string; phone: string; name?: string | null },
  lang: SupportedLanguage,
): Promise<string | null> {
  const claim = await db.query<{ opted_in: boolean; student_name: string | null }>(
    `UPDATE onboarding_state
        SET quiz_invite_claimed_at = now(),
            quiz_invite_delivery_error = NULL,
            updated_at = now()
      WHERE contact_id = $1
        AND quiz_due_at IS NOT NULL
        AND (quiz_due_at AT TIME ZONE 'Australia/Sydney')::date <= (now() AT TIME ZONE 'Australia/Sydney')::date
        AND quiz_invite_sent_at IS NULL
        AND quiz_invite_claimed_at IS NULL
        AND arrival_quiz_started_at IS NULL
      RETURNING (quiz_invite_opted_in_at IS NOT NULL AND quiz_invite_opted_out_at IS NULL) AS opted_in, student_name`,
    [contact.id],
  );
  const row = claim.rows[0];
  if (!row) return null;

  const optedIn = Boolean(row.opted_in);
  const text = welcomeMessage(row.student_name || contact.name || null, lang, optedIn);
  const kapso = await import('../kapso.js');
  try {
    try {
      await kapso.sendButtons(catalogueConfig.phoneNumberId, contact.phone, text, [buttonFor(lang, optedIn)]);
    } catch {
      await kapso.sendFormattedText(
        catalogueConfig.phoneNumberId,
        contact.phone,
        `${text}\n\nReply *${optedIn ? 'QUIZ' : 'YES'}*.`,
        { maxChars: 1500 },
      );
    }
    await db.query(
      `UPDATE onboarding_state SET quiz_invite_sent_at = now(), updated_at = now() WHERE contact_id = $1`,
      [contact.id],
    );
    return text;
  } catch (error) {
    await db.query(
      `UPDATE onboarding_state SET quiz_invite_delivery_error = $2, updated_at = now() WHERE contact_id = $1`,
      [contact.id, error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500)],
    ).catch(() => undefined);
    throw error;
  }
}
