import type { Intent, KbSource } from '../types.js';

// Explicit registry: which local file grounds which intent.
// Rewards / updates intentionally point at official live destinations
// because kb/ has no maintained, current offers document.
export const KB_SOURCES: KbSource[] = [
  {
    file: '01-oshc-overview.md',
    title: 'Overseas Student Health Cover (OSHC) overview',
    url: 'https://www.medibank.com.au/overseas-health-insurance/oshc/',
    intents: ['coverage', 'greeting', 'updates'],
    description: 'Essentials vs Comprehensive hospital/medical/pharmacy/ambulance summary.',
  },
  {
    file: '02-essentials-oshc.md',
    title: 'Essentials OSHC',
    url: 'https://www.medibank.com.au/overseas-health-insurance/oshc/essentials-oshc/',
    intents: ['coverage', 'waiting_periods', 'pharmacy', 'medicines'],
    description: 'Essentials inclusions, exclusions, waiting periods, pharmacy limits.',
  },
  {
    file: '03-comprehensive-oshc.md',
    title: 'Comprehensive OSHC',
    url: 'https://www.medibank.com.au/overseas-health-insurance/oshc/comprehensive-oshc/',
    intents: ['coverage', 'waiting_periods', 'pharmacy', 'medicines'],
    description: 'Comprehensive inclusions, mental-health, repatriation, pharmacy limits.',
  },
  {
    file: '04-oshc-member-guide.md',
    title: 'OSHC Member Guide',
    url: 'https://www.medibankoshc.com.au/oshc-support/oshc-information/',
    intents: ['coverage', 'support', 'forms_and_guides', 'visa_compliance'],
    description: 'Eligibility, membership duties, visa interaction.',
  },
  {
    file: '05-comprehensive-cover-summary.md',
    title: 'Comprehensive OSHC Cover Summary (PDF)',
    url: 'https://www.medibank.com.au/content/dam/b2c/docs/mpl/Comprehensive_OSHC_Cover_Summary.pdf',
    intents: ['coverage', 'waiting_periods', 'pharmacy'],
    description: 'Cover summary PDF bundled with repo knowledge.',
  },
  {
    file: '06-oshc-faq.md',
    title: 'OSHC FAQs',
    url: 'https://www.medibank.com.au/overseas-health-insurance/oshc/faqs/',
    intents: ['coverage', 'visa_compliance', 'claims', 'support'],
    description: 'Who needs OSHC, start dates, family cover.',
  },
  {
    file: '08-australian-healthcare.md',
    title: 'The Australian Healthcare System',
    url: 'https://www.medibank.com.au/overseas-health-insurance/guides/australian-healthcare/',
    intents: ['healthcare_navigation', 'coverage'],
    description: 'Public vs private system, Medicare, costs.',
  },
  {
    file: '09-understanding-australian-healthcare.md',
    title: 'Understanding Australian healthcare',
    url: 'https://www.medibank.com.au/overseas-health-insurance/guides/articles/understanding-australian-healthcare/',
    intents: ['healthcare_navigation', 'coverage', 'providers'],
    description: 'GP, Medicare eligibility, private insurance role.',
  },
  {
    file: '10-getting-sick-in-australia.md',
    title: 'What to do if you get sick in Australia',
    url: 'https://www.medibank.com.au/overseas-health-insurance/guides/articles/getting-sick-in-australia/',
    intents: ['healthcare_navigation', 'providers', 'pharmacy', 'emergency'],
    description: 'GP vs emergency, direct billing clinics, hospitals.',
  },
  {
    file: '11-waiting-periods.md',
    title: 'What is a waiting period?',
    url: 'https://www.medibank.com.au/overseas-health-insurance/guides/articles/what-are-waiting-periods/',
    intents: ['waiting_periods', 'coverage'],
    description: 'Waiting period definition and when it applies.',
  },
  {
    file: '12-oshc-visa-requirements.md',
    title: 'Health insurance for Australian visa',
    url: 'https://www.medibank.com.au/overseas-health-insurance/guides/articles/which-health-cover-for-my-visa/',
    intents: ['visa_compliance', 'coverage'],
    description: 'Subclass 500 OSHC requirement, exemptions.',
  },
  {
    file: '13-oshc-online-claims.md',
    title: 'How to make an OSHC online claim',
    url: 'https://www.medibankoshc.com.au/how-to-make-an-online-claim/',
    intents: ['claims', 'reimbursements'],
    description: 'Online Member Services, online claim form, mail, in-store.',
  },
  {
    file: '14-general-claims.md',
    title: 'Make a Health Insurance Claim',
    url: 'https://www.medibank.com.au/health-insurance/using-your-cover/claim/',
    intents: ['claims', 'reimbursements'],
    description: 'General claim steps, what can be claimed online.',
  },
  {
    file: '15-oshc-provider-claims.md',
    title: 'Making a non-resident / provider claim',
    url: 'https://www.medibank.com.au/providers/claims/nonresident-claim/',
    intents: ['claims', 'providers', 'reimbursements'],
    description: 'Direct billing portal, hospital HC21, outpatient claims.',
  },
  {
    file: '16-pharmacy-essentials.md',
    title: 'Pharmacy — Essentials OSHC',
    url: 'https://www.medibank.com.au/overseas-health-insurance/oshc/essentials-oshc/',
    intents: ['pharmacy', 'medicines', 'claims'],
    description: 'Essentials prescription limits and contributions.',
  },
  {
    file: '17-pharmacy-comprehensive.md',
    title: 'Pharmacy — Comprehensive OSHC',
    url: 'https://www.medibank.com.au/overseas-health-insurance/oshc/comprehensive-oshc/',
    intents: ['pharmacy', 'medicines', 'claims'],
    description: 'Comprehensive prescription limits and contributions.',
  },
  {
    file: '18-pharmaceuticals.md',
    title: 'Pharmaceuticals / prescription guidance',
    url: 'https://www.medibank.com.au/overseas-health-insurance/guides/articles/understanding-australian-healthcare/',
    intents: ['pharmacy', 'medicines'],
    description: 'Prescription costs and emergency guidance context.',
  },
  {
    file: '19-forms-and-brochures.md',
    title: 'Forms and brochures',
    url: 'https://www.medibank.com.au/health-insurance/using-your-cover/brochures-forms/',
    intents: ['forms_and_guides', 'claims'],
    description: 'Claim forms, authority, member guides.',
  },
];

export const REWARDS_DESTINATION = {
  title: 'Medibank Live Better Rewards',
  url: 'https://www.medibank.com.au/livebetter/rewards/',
  note: 'Student Rewards / Student Rewards Plus availability changes; check the official page for current eligibility.',
};

export const UPDATES_DESTINATIONS = [
  {
    title: 'Medibank OSHC',
    url: 'https://www.medibankoshc.com.au/',
  },
  {
    title: 'Overseas health cover guides',
    url: 'https://www.medibank.com.au/overseas-health-insurance/guides/',
  },
];

export const SUPPORT_DESTINATIONS = [
  { title: 'Contact Medibank OSHC', url: 'https://www.medibankoshc.com.au/contact-us/' },
  { title: 'Find a direct-billing provider', url: 'https://www.medibankoshc.com.au/find-provider/' },
  { title: 'Find a Members Choice provider', url: 'https://www.medibank.com.au/health-insurance/find-provider/' },
  { title: 'Online Member Services login', url: 'https://www.members.medibankoshc.com.au/login.html' },
  { title: 'Online claim form', url: 'https://www.members.medibankoshc.com.au/login/submit-claim.html' },
];

export function filesForIntent(intent: Intent): string[] {
  return KB_SOURCES.filter((s) => s.intents.includes(intent)).map((s) => s.file);
}
