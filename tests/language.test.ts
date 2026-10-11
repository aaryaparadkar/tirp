import { describe, expect, it } from 'vitest';
import { detectLanguage } from '../src/language.js';

describe('language detection', () => {
  it('detects English', () => {
    expect(detectLanguage('Hi').language).toBe('en');
    expect(detectLanguage('How do I make a claim?').language).toBe('en');
    expect(detectLanguage('2').language).toBe('en');
    expect(detectLanguage('menu:claims').language).toBe('en');
  });
  it('detects Spanish', () => {
    expect(detectLanguage('Hola').language).toBe('es');
    expect(detectLanguage('¿Cómo hago un reclamo?').language).toBe('es');
    expect(detectLanguage('Gracias por tu ayuda con mi cobertura').language).toBe('es');
  });
  it('detects Mandarin', () => {
    expect(detectLanguage('你好').language).toBe('zh-CN');
    expect(detectLanguage('我如何申请报销？').language).toBe('zh-CN');
    expect(detectLanguage('请问签证有什么要求？').language).toBe('zh-CN');
  });
});
