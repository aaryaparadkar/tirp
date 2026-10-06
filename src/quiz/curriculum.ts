import { QUESTION_BANK } from './question-bank.js';
import type { QuizQuestion } from './types.js';

export interface QuizSessionConfig {
  sessionNumber: number;
  topic: string;
  title: string;
  lesson: string;
  questionIds: string[];
}

/**
 * Standardized, deterministic curriculum for all users.
 * 
 * Guarantees:
 * 1. The format, informative lesson, and question sequence are identical for every user.
 * 2. Questions across sessions are strictly disjoint: no question is ever repeated for a user.
 * 3. All 32 questions in the question bank are completed across 7 sessions.
 */
export const QUIZ_CURRICULUM: QuizSessionConfig[] = [
  {
    sessionNumber: 1,
    topic: 'finding_healthcare',
    title: 'Finding Healthcare in Australia',
    lesson:
      'For non-emergency illnesses, a General Practitioner (GP) is usually your primary healthcare contact in Australia. Always ask about fees before booking; insurer direct-billing clinics can reduce or eliminate upfront costs. GPs also issue required referral letters for specialist appointments. For life-threatening emergencies, call 000.',
    questionIds: ['find_hc_1', 'find_hc_2', 'find_hc_3', 'find_hc_4', 'find_hc_5'],
  },
  {
    sessionNumber: 2,
    topic: 'emergency_care',
    title: 'Urgent and Emergency Care',
    lesson:
      'Call 000 for life-threatening medical emergencies. Hospital emergency departments prioritize patients strictly by clinical urgency rather than arrival time. For urgent but non-life-threatening medical issues, consider Medicare Urgent Care Clinics or after-hours GP services. Always verify what ambulance services your OSHC policy covers.',
    questionIds: ['emerg_1', 'emerg_2', 'emerg_3', 'emerg_4', 'emerg_5'],
  },
  {
    sessionNumber: 3,
    topic: 'pharmacy',
    title: 'Pharmacies and Prescription Medicines',
    lesson:
      'Community pharmacies dispense prescriptions, including digital eScripts sent by SMS with a barcode/token. OSHC prescription medicine benefits depend on policy terms, eligible pharmaceutical benefits, co-payments, and annual benefit limits. Over-the-counter medicines without prescriptions are generally not claimable.',
    questionIds: ['pharm_1', 'pharm_2', 'pharm_3', 'pharm_4', 'pharm_5'],
  },
  {
    sessionNumber: 4,
    topic: 'claims',
    title: 'Making and Tracking Claims',
    lesson:
      'Keep itemised medical receipts and tax invoices when paying upfront. Submit claims online or via your insurer app. Be aware that the benefit paid is often based on the Medicare Benefits Schedule (MBS) fee, which may leave an out-of-pocket "gap" if the provider charges higher rates. Direct billing clinics avoid upfront payment.',
    questionIds: ['claims_1', 'claims_2', 'claims_3', 'claims_4', 'claims_6'],
  },
  {
    sessionNumber: 5,
    topic: 'policy_management',
    title: 'Understanding Your Policy & Visa Rules',
    lesson:
      'Check your policy documentation for waiting periods (e.g. pre-existing conditions and pregnancy) and exclusions like cosmetic surgery. Maintaining continuous, compliant health cover for the entire visa duration is a mandatory legal condition (8501) of your student visa (Subclass 500).',
    questionIds: ['policy_1', 'policy_2', 'policy_4', 'policy_6', 'policy_7'],
  },
  {
    sessionNumber: 6,
    topic: 'advanced_navigation',
    title: 'Advanced Healthcare Navigation & Diagnostics',
    lesson:
      'This session explores diagnostic blood tests and x-rays, private hospital admissions, managing medical records, emergency triage expectations, and specialized prescription medicine benefits.',
    questionIds: ['find_hc_6', 'find_hc_7', 'emerg_6', 'emerg_7', 'pharm_6'],
  },
  {
    sessionNumber: 7,
    topic: 'mastery_review',
    title: 'Final Mastery & Seamless Care',
    lesson:
      'The final mastery session covers managing repeat digital prescriptions (eScripts) and verifying direct billing clinics before consultations to avoid unexpected upfront bills.',
    questionIds: ['pharm_7', 'claims_7'],
  },
];

export const TOTAL_CURRICULUM_SESSIONS = QUIZ_CURRICULUM.length;
export const TOTAL_CURRICULUM_QUESTIONS = QUIZ_CURRICULUM.reduce((sum, s) => sum + s.questionIds.length, 0);
export const TOTAL_CURRICULUM_XP = QUESTION_BANK.reduce((sum, q) => sum + q.xp, 0);

export function getSessionConfig(completedSessions: number): QuizSessionConfig | null {
  if (completedSessions >= QUIZ_CURRICULUM.length) return null;
  return QUIZ_CURRICULUM[completedSessions];
}

export function getSessionQuestions(session: QuizSessionConfig): QuizQuestion[] {
  return session.questionIds
    .map((id) => QUESTION_BANK.find((q) => q.id === id))
    .filter((q): q is QuizQuestion => Boolean(q));
}
