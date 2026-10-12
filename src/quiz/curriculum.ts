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
    title: 'Finding Healthcare in Australia 🩺',
    lesson:
      "G'day! Navigating healthcare in Australia is simple once you know the golden rules:\n\n" +
      '• *Rule 1: GP First:* A General Practitioner (GP) is your primary doctor for non-emergencies, prescriptions, and official uni sick certificates.\n\n' +
      '• *Rule 2: Direct Billing is Magic:* Choose a clinic in your OSHC insurer’s network that does "direct billing". They bill your insurer directly so you pay $0 upfront!\n\n' +
      '• *Rule 3: Need a Specialist?* Want to see a dermatologist or specialist? You MUST get a referral letter from your GP first to ensure your OSHC covers it.\n\n' +
      '• *Rule 4: Emergencies:* Call 000 only for serious, life-threatening emergencies.',
    questionIds: ['find_hc_1', 'find_hc_2', 'find_hc_3', 'find_hc_4', 'find_hc_5'],
  },
  {
    sessionNumber: 2,
    topic: 'emergency_care',
    title: 'Urgent vs Emergency Care 🚑',
    lesson:
      'Know what to do when illness strikes suddenly:\n\n' +
      '• *Call 000 (Triple Zero):* For severe chest pain, breathing difficulties, or unconsciousness. OSHC includes emergency ambulance transport!\n\n' +
      '• *ER Reality Check:* Hospital Emergency Rooms (ER) prioritize patients by medical urgency. For mild symptoms, waiting times can be long.\n\n' +
      '• *Pro-Tip: Medicare Urgent Care Clinics:* Sprains, cuts, or fevers? Medicare Urgent Care Clinics and after-hours GP services treat urgent issues without long ER waits.\n\n' +
      '• *Healthdirect Hotline:* Call 1800 022 222 anytime for free 24/7 registered nurse advice.',
    questionIds: ['emerg_1', 'emerg_2', 'emerg_3', 'emerg_4', 'emerg_5'],
  },
  {
    sessionNumber: 3,
    topic: 'pharmacy',
    title: 'Pharmacies & Prescription Medicines 💊',
    lesson:
      'Everything you need to know about medicine in Australia:\n\n' +
      '• *eScripts on Your Phone:* Doctors send prescriptions right to your smartphone via an SMS barcode token. Just show it at any community chemist!\n\n' +
      '• *OSHC Medicine Benefit:* OSHC helps cover the cost of eligible doctor-prescribed PBS medicines above the co-payment (typically up to $50 per script, up to your annual policy limit).\n\n' +
      '• *Over-the-Counter:* Panadol, cough lozenges, and vitamins bought without a prescription are not claimable.\n\n' +
      '• *Generic vs Brand:* Generic medicines have identical active ingredients and save you money!',
    questionIds: ['pharm_1', 'pharm_2', 'pharm_3', 'pharm_4', 'pharm_5'],
  },
  {
    sessionNumber: 4,
    topic: 'claims',
    title: 'Making & Tracking Claims 💵',
    lesson:
      'Get your money back fast with these claim tips:\n\n' +
      '• *Always Keep Invoices:* If paying upfront, ask for an itemised tax invoice showing the doctor’s provider number and Medicare item codes.\n\n' +
      '• *Claim via Your App:* Upload a photo of your receipt in your insurer’s mobile app (Bupa, Medibank, Allianz, etc.) for refunds within 2–5 business days.\n\n' +
      '• *Mind "The Gap":* OSHC covers 100% of the government-set Medicare Benefits Schedule (MBS) fee. If a private clinic charges higher rates, the difference is your out-of-pocket gap.\n\n' +
      '• *Shortcut:* Direct billing clinics eliminate the gap completely!',
    questionIds: ['claims_1', 'claims_2', 'claims_3', 'claims_4', 'claims_6'],
  },
  {
    sessionNumber: 5,
    topic: 'policy_management',
    title: 'Visa Condition 8501 & Policy Rules 🛡️',
    lesson:
      'Essential visa compliance and coverage rules:\n\n' +
      '• *Visa Condition 8501:* Maintaining continuous OSHC throughout your Australian stay is mandatory. A lapse in coverage risks visa cancellation!\n\n' +
      '• *Waiting Periods:* Pre-existing medical conditions (illnesses you had before arriving) and pregnancy services generally require a 12-month waiting period.\n\n' +
      '• *Not Covered by Standard OSHC:* Routine dental checkups, glasses/optometry, and cosmetic surgery require separate private extras cover.',
    questionIds: ['policy_1', 'policy_2', 'policy_4', 'policy_6', 'policy_7'],
  },
  {
    sessionNumber: 6,
    topic: 'advanced_navigation',
    title: 'Blood Tests, X-Rays & Hospital Care 🔬',
    lesson:
      'Mastering diagnostic tests and hospital services:\n\n' +
      '• *Pathology & Imaging:* When your GP gives you a referral for blood tests or X-rays, choose an approved provider network for direct billing.\n\n' +
      '• *Hospital Admissions:* If you need overnight care, public hospitals provide comprehensive care covered by OSHC. Contact your insurer promptly to issue a guarantee of payment.\n\n' +
      '• *Digital Records:* Keep your eScripts, specialist referrals, and immunisation history saved on your phone for easy access across Australian clinics.',
    questionIds: ['find_hc_6', 'find_hc_7', 'emerg_6', 'emerg_7', 'pharm_6'],
  },
  {
    sessionNumber: 7,
    topic: 'mastery_review',
    title: 'Final Mastery & Seamless Care 🏆',
    lesson:
      'Your final step to Australian healthcare mastery:\n\n' +
      '• *Repeat eScripts:* When your doctor issues an eScript with repeat supplies, the chemist will SMS you a new barcode token upon each dispensing. Keep it ready for your next refill!\n\n' +
      '• *Direct Billing Verification:* Always ask clinic reception or use your insurer app locator before appointments to confirm $0 gap billing.\n\n' +
      '• *Finish Line:* Complete this final quiz to unlock your Health Checkup eligibility!',
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
