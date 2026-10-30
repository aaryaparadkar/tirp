/**
 * "Call 000" bridge page.
 *
 * WhatsApp CTA-URL buttons only open http(s) links — Meta rejects `tel:` —
 * so the emergency button points here. The page immediately hands off to
 * `tel:000`, which opens the phone's dialer with 000 typed in. It never
 * places the call: Android opens the dialer (ACTION_DIAL) and iOS asks the
 * user to confirm. A big "Call 000" link stays on screen as a fallback for
 * browsers that block the automatic hand-off.
 */
import { EMERGENCY_NUMBER_AU } from './config.js';
import type { SupportedLanguage } from './types.js';

export const EMERGENCY_CALL_PATH = `/call/${EMERGENCY_NUMBER_AU}`;

/** Public https URL for the button, or null when PUBLIC_BASE_URL is not set. */
export function emergencyCallUrl(lang: SupportedLanguage = 'en'): string | null {
  const base = (process.env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
  if (!/^https:\/\/[^\s/]+/i.test(base)) return null;
  return `${base}${EMERGENCY_CALL_PATH}?lang=${encodeURIComponent(lang)}`;
}

const COPY: Record<SupportedLanguage, { title: string; button: string; note: string; html: string }> = {
  en: {
    html: 'en',
    title: 'Emergency — call 000',
    button: `Call ${EMERGENCY_NUMBER_AU}`,
    note: `This opens your phone's dialer with ${EMERGENCY_NUMBER_AU} typed in. Press the call button to connect. Police, fire, ambulance.`,
  },
  'zh-CN': {
    html: 'zh-CN',
    title: '紧急情况 — 拨打 000',
    button: `拨打 ${EMERGENCY_NUMBER_AU}`,
    note: `这会打开手机拨号界面并已输入 ${EMERGENCY_NUMBER_AU}。请按拨号键接通。警察、消防、救护车。`,
  },
  es: {
    html: 'es',
    title: 'Emergencia — llama al 000',
    button: `Llamar al ${EMERGENCY_NUMBER_AU}`,
    note: `Esto abre el marcador de tu teléfono con ${EMERGENCY_NUMBER_AU} escrito. Pulsa llamar para conectar. Policía, bomberos, ambulancia.`,
  },
};

function pageLanguage(value: string | null): SupportedLanguage {
  return value === 'zh-CN' || value === 'es' ? value : 'en';
}

export function emergencyCallPage(request: Request): Response {
  const lang = pageLanguage(new URL(request.url).searchParams.get('lang'));
  const c = COPY[lang];
  const tel = `tel:${EMERGENCY_NUMBER_AU}`;
  const html = `<!doctype html>
<html lang="${c.html}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${c.title}</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
         font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background: #fff5f5; color: #1a1a1a; }
  @media (prefers-color-scheme: dark) { body { background: #1c0d0d; color: #f5f5f5; } }
  main { width: 100%; max-width: 420px; padding: 24px 16px; text-align: center; }
  a.call { display: block; padding: 22px 16px; border-radius: 16px; background: #c8102e; color: #fff;
           font-size: 28px; font-weight: 700; text-decoration: none; }
  a.call:active { background: #9e0c24; }
  p { font-size: 16px; line-height: 1.5; margin: 16px 0 0; }
</style>
</head>
<body>
<main>
  <a class="call" id="call" href="${tel}">📞 ${c.button}</a>
  <p>${c.note}</p>
</main>
<script>
  // Hand off to the dialer right away; the link above is the fallback.
  setTimeout(function () { window.location.href = ${JSON.stringify(tel)}; }, 150);
</script>
</body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      // Page-specific CSP: inline style/script only, nothing external.
      'content-security-policy':
        "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    },
  });
}
