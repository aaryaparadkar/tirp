import type { SupportedLanguage } from './types.js';

export interface LanguageDetection {
  language: SupportedLanguage;
  confidence: number;
  method: 'script' | 'lexicon' | 'default';
}

const HAN_RE = /\p{Script=Han}/u;

const ZH_LEXICON = [
  '你好', '您好', '嗨', '哈喽', '谢谢', '我想', '请问', '怎么', '哪里', '哪里',
  '可以', '如何', '什么', '报销', '理赔', '保障', '保险', '药房', '处方',
  '签证', '等待期', '学生', '帮助', '紧急', '救命', '救护车', '事故',
];

const ES_ACCENT_RE = /[áéíóúüñ¿¡]/i;
const ES_LEXICON = [
  'hola', 'buenos', 'buenas', 'gracias', 'por favor', 'cómo', 'como',
  'dónde', 'donde', 'qué', 'que ', 'cuál', 'cual', 'cuánto', 'cuanto',
  'reembolso', 'reclamo', 'reclamación', 'cobertura', 'farmacia',
  'medicamento', 'medicamentos', 'emergencia', 'ayuda', 'visa',
  'espera', 'estudiante', 'salud', 'doctor', 'hospital', 'clínica', 'clinica',
];

function countHan(text: string): number {
  const m = text.match(/\p{Script=Han}/gu);
  return m ? m.length : 0;
}

export function detectLanguage(text: string): LanguageDetection {
  const t = (text || '').trim();
  if (!t) return { language: 'en', confidence: 0.3, method: 'default' };
  const lower = t.toLowerCase();

  // 1) Script signal: meaningful Han presence => Mandarin.
  const han = countHan(t);
  const letters = (t.match(/\p{L}/gu) || []).length;
  if (han > 0 && (han >= 2 || (letters > 0 && han / letters >= 0.2))) {
    return { language: 'zh-CN', confidence: han >= 4 ? 0.98 : 0.9, method: 'script' };
  }
  // Short exact Mandarin greetings.
  if (/^(你好|您好|嗨|哈喽|在吗)\W*$/u.test(t)) {
    return { language: 'zh-CN', confidence: 0.95, method: 'lexicon' };
  }
  if (ZH_LEXICON.some((w) => lower.includes(w.toLowerCase()) || t.includes(w))) {
    // Only claim zh if we actually saw Han or a distinctive token; pinyin-free tokens above are Han so this is safe.
    if (han > 0) return { language: 'zh-CN', confidence: 0.9, method: 'lexicon' };
  }

  // 2) Spanish signals: punctuation/accents are strong; otherwise need lexicon hit.
  if (/[¿¡]/.test(t)) return { language: 'es', confidence: 0.95, method: 'lexicon' };
  const hasAccent = ES_ACCENT_RE.test(t);
  const esHits = ES_LEXICON.filter((w) => lower.includes(w)).length;
  // Exact short greeting.
  if (/^(hola|buenas|buenos d[ií]as|buenas tardes|buenas noches)\W*$/i.test(t.trim())) {
    return { language: 'es', confidence: 0.95, method: 'lexicon' };
  }
  if (hasAccent && esHits >= 1) return { language: 'es', confidence: 0.92, method: 'lexicon' };
  if (esHits >= 2) return { language: 'es', confidence: 0.88, method: 'lexicon' };
  if (esHits === 1) {
    // Single common word like "hola/gracias/emergencia/ayuda" inside a longer sentence is enough.
    if (/\b(hola|gracias|emergencia|ayuda|reembolso|cobertura|farmacia)\b/i.test(t)) {
      return { language: 'es', confidence: 0.85, method: 'lexicon' };
    }
  }

  // 3) Default English (includes numbers, button ids, language-neutral menu picks).
  return { language: 'en', confidence: 0.6, method: 'default' };
}

export function isSupportedLanguage(v: unknown): v is SupportedLanguage {
  return v === 'en' || v === 'zh-CN' || v === 'es';
}
