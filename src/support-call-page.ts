/**
 * "Call the support line" bridge pages — same trick as the Call 000 page:
 * WhatsApp CTA buttons can only open https links, so the button opens
 * /call/<number>, which hands off to `tel:<number>`. The phone's dialer
 * opens with the number typed in; nothing is dialled automatically.
 *
 * Only an allow-list of official Medibank OSHC numbers can be dialled, so
 * the route can't be abused as an open "call any number" link.
 */
import type { SupportedLanguage } from './types.js';

export interface SupportLine {
  /** Digits as dialled, used in the URL path and tel: link. */
  digits: string;
  /** As printed for people. */
  display: string;
  name: Record<SupportedLanguage, string>;
  note: Record<SupportedLanguage, string>;
}

export const STUDENT_HEALTH_LINE: SupportLine = {
  digits: '1800887283',
  display: '1800 887 283',
  name: {
    en: '24/7 Student Health and Support Line',
    'zh-CN': '24/7 学生健康与支持热线',
    es: 'Línea 24/7 de Salud y Apoyo al Estudiante',
  },
  note: {
    en: 'Free for Medibank OSHC members, any time of day or night, in around 160 languages. Nurses, counsellors, legal and travel-document help, interpreters.',
    'zh-CN': 'Medibank OSHC 会员免费，全天 24 小时，约 160 种语言。护士、心理咨询、法律与证件协助、口译。',
    es: 'Gratis para miembros de Medibank OSHC, a cualquier hora, en unos 160 idiomas. Enfermería, apoyo psicológico, ayuda legal y de documentos, intérpretes.',
  },
};

export const MEDIBANK_OSHC_LINE: SupportLine = {
  digits: '134148',
  display: '134 148',
  name: { en: 'Medibank OSHC', 'zh-CN': 'Medibank OSHC', es: 'Medibank OSHC' },
  note: {
    en: 'Questions about your cover, claims and membership.',
    'zh-CN': '保障、理赔和会员问题。',
    es: 'Preguntas sobre tu cobertura, reclamos y membresía.',
  },
};

const LINES = [STUDENT_HEALTH_LINE, MEDIBANK_OSHC_LINE];

export const SUPPORT_CALL_PATH = /^\/call\/(1800887283|134148)$/;

/** Public https URL for a call button, or null when PUBLIC_BASE_URL is unset. */
export function supportCallUrl(line: SupportLine, lang: SupportedLanguage = 'en'): string | null {
  const base = (process.env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
  if (!/^https:\/\/[^\s/]+/i.test(base)) return null;
  return `${base}/call/${line.digits}?lang=${encodeURIComponent(lang)}`;
}

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function supportCallPage(request: Request): Response {
  const url = new URL(request.url);
  const digits = SUPPORT_CALL_PATH.exec(url.pathname)?.[1];
  const line = LINES.find((item) => item.digits === digits);
  if (!line) return new Response('Not found', { status: 404 });
  const langParam = url.searchParams.get('lang');
  const lang: SupportedLanguage = langParam === 'zh-CN' || langParam === 'es' ? langParam : 'en';
  const tel = `tel:${line.digits}`;
  const button = lang === 'zh-CN' ? `拨打 ${line.display}` : lang === 'es' ? `Llamar al ${line.display}` : `Call ${line.display}`;
  const html = `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(line.name[lang])}</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
         font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background: #f2f8f8; color: #14232b; }
  @media (prefers-color-scheme: dark) { body { background: #0f1c20; color: #eef4f5; } }
  main { width: 100%; max-width: 420px; padding: 24px 16px; text-align: center; }
  h1 { font-size: 18px; margin: 0 0 16px; }
  a.call { display: block; padding: 20px 16px; background: #0b6e72; color: #fff;
           font-size: 26px; font-weight: 700; text-decoration: none; }
  a.call:active { background: #08585b; }
  p { font-size: 15px; line-height: 1.5; margin: 16px 0 0; }
</style>
</head>
<body>
<main>
  <h1>${esc(line.name[lang])}</h1>
  <a class="call" href="${tel}">📞 ${esc(button)}</a>
  <p>${esc(line.note[lang])}</p>
</main>
<script>
  setTimeout(function () { window.location.href = ${JSON.stringify(tel)}; }, 150);
</script>
</body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'content-security-policy':
        "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    },
  });
}
