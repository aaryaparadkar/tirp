import { describe, expect, it } from 'vitest';
import { emergencyReply, isEmergency, isGreeting } from '../src/safety.js';

describe('emergency detection', () => {
  it('flags high-risk messages', () => {
    expect(isEmergency('I had a serious accident, please help')).toBe(true);
    expect(isEmergency('I cannot breathe')).toBe(true);
    expect(isEmergency("can't breathe, need help")).toBe(true);
    expect(isEmergency('Someone is unconscious next to me')).toBe(true);
    expect(isEmergency('call an ambulance now')).toBe(true);
    expect(isEmergency('chest pain, need urgent help')).toBe(true);
  });

  it('does not flag mild illness', () => {
    expect(isEmergency('I have a mild cold, what should I do?')).toBe(false);
    expect(isEmergency('I have a slight headache')).toBe(false);
    expect(isEmergency('How do I claim a GP visit?')).toBe(false);
    expect(isEmergency('What does Essentials cover?')).toBe(false);
  });

  it('emergency reply contains 000 and stay calm', () => {
    const reply = emergencyReply();
    expect(reply).toMatch(/stay calm/i);
    expect(reply).toContain('000');
  });
});

describe('greeting detection', () => {
  it('matches hi/hello/menu', () => {
    expect(isGreeting('Hi')).toBe(true);
    expect(isGreeting('hello')).toBe(true);
    expect(isGreeting('MENU')).toBe(true);
    expect(isGreeting('start')).toBe(true);
  });
  it('does not match questions', () => {
    expect(isGreeting('How do I claim?')).toBe(false);
  });
});
