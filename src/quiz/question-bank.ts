import { QuizQuestion } from './types.js';

export const QUESTION_BANK: QuizQuestion[] = [
  // ==========================================
  // TOPIC 1: finding_healthcare (7 questions)
  // ==========================================
  {
    id: 'find_hc_1',
    topic: 'finding_healthcare',
    difficulty: 1,
    question:
      'You have had a persistent sore throat, mild fever, and tiredness for four days. You want medical advice, but it is not an emergency. What is generally the most appropriate first step?',
    options: [
      { id: 'a', text: 'Go directly to a major hospital emergency department' },
      { id: 'b', text: 'Book an appointment with a General Practitioner (GP)' },
      { id: 'c', text: 'Wait for symptoms to disappear before starting classes' },
      { id: 'd', text: 'Call emergency services (000) for ambulance transport' },
    ],
    correctOptionId: 'b',
    explanation:
      'In Australia, a General Practitioner (GP) is generally your primary healthcare contact for non-emergency illnesses. Emergency departments and 000 ambulances are reserved for life-threatening medical situations.',
    xp: 10,
    source: {
      title: 'What to do if you get sick in Australia',
      url: 'https://www.medibank.com.au/overseas-health-insurance/guides/articles/getting-sick-in-australia/',
      chunk_id: 'kb/10-getting-sick-in-australia.md',
    },
    tags: ['gp', 'healthcare_navigation', 'non_emergency'],
  },
  {
    id: 'find_hc_2',
    topic: 'finding_healthcare',
    difficulty: 2,
    question:
      'You want to consult a specialist doctor, such as a dermatologist for an ongoing skin rash. Under the Australian healthcare system, what must you do first to ensure OSHC benefit eligibility?',
    options: [
      { id: 'a', text: 'Turn up at a private specialist clinic without an appointment' },
      { id: 'b', text: 'Consult a GP first to obtain an official referral letter' },
      { id: 'c', text: 'Apply directly to Medicare for special overseas approval' },
      { id: 'd', text: 'Request permission from the Department of Home Affairs' },
    ],
    correctOptionId: 'b',
    explanation:
      'In Australia, specialist consultations generally require a referral letter from a GP. Without a valid referral, your OSHC insurer may not pay benefits for the specialist appointment.',
    xp: 10,
    source: {
      title: 'What you need to know about the Australian healthcare system',
      url: 'https://www.medibank.com.au/overseas-health-insurance/guides/articles/understanding-australian-healthcare/',
      chunk_id: 'kb/09-understanding-australian-healthcare.md',
    },
    tags: ['specialist', 'referral', 'gp', 'healthcare_navigation'],
  },
  {
    id: 'find_hc_3',
    topic: 'finding_healthcare',
    difficulty: 3,
    question:
      'You are booking a routine doctor consultation and want to minimize upfront fees and claim paperwork. What type of medical clinic should you look for?',
    options: [
      { id: 'a', text: 'A medical practice in your OSHC insurer’s direct billing network' },
      { id: 'b', text: 'A boutique private surgical hospital offering elective procedures' },
      { id: 'c', text: 'A public hospital emergency department during normal clinic hours' },
      { id: 'd', text: 'An unregistered community wellness clinic outside the health system' },
    ],
    correctOptionId: 'a',
    explanation:
      'Direct billing network clinics have agreements with your OSHC provider to send the medical bill directly to the insurer. This helps reduce or eliminate the upfront payment you need to make at the time of your visit.',
    xp: 10,
    source: {
      title: 'What to do if you get sick in Australia',
      url: 'https://www.medibank.com.au/overseas-health-insurance/guides/articles/getting-sick-in-australia/',
      chunk_id: 'kb/10-getting-sick-in-australia.md',
    },
    tags: ['direct_billing', 'medical_clinic', 'costs', 'oshc_network'],
  },
  {
    id: 'find_hc_4',
    topic: 'finding_healthcare',
    difficulty: 2,
    question:
      'You feel unwell in your student apartment late at night and need a medical certificate and advice before missing class tomorrow. Which digital service is available through your OSHC app?',
    options: [
      { id: 'a', text: 'Online Doctor consultations for 24/7 video or phone appointments' },
      { id: 'b', text: 'Automatic emergency prescription delivery through state hospitals' },
      { id: 'c', text: 'An online tool that lets students self-issue medical sick certificates' },
      { id: 'd', text: 'A government portal that reimburses taxi travel to hospital clinics' },
    ],
    correctOptionId: 'a',
    explanation:
      'Many OSHC apps offer a 24/7 Online Doctor service where students can speak with qualified doctors via video or phone for medical advice, prescriptions, and certificates with no out-of-pocket costs.',
    xp: 10,
    source: {
      title: 'Overseas Student Health Cover (OSHC) | Overseas | Medibank',
      url: 'https://www.medibank.com.au/overseas-health-insurance/oshc/',
      chunk_id: 'kb/01-oshc-overview.md',
    },
    tags: ['online_doctor', 'telehealth', 'medical_certificate', 'healthcare_navigation'],
  },
  {
    id: 'find_hc_5',
    topic: 'finding_healthcare',
    difficulty: 1,
    question:
      'You have just moved to a new suburb for university and want to locate a general doctor close to your accommodation. Where can you reliably search for registered healthcare practices?',
    options: [
      { id: 'a', text: 'The National Health Services Directory via Healthdirect or your OSHC provider' },
      { id: 'b', text: 'Random classified advertising flyers posted around local street corners' },
      { id: 'c', text: 'International student social chat groups offering unlicensed home visits' },
      { id: 'd', text: 'The Australian Border Force customs baggage inspection office' },
    ],
    correctOptionId: 'a',
    explanation:
      'You can find accredited general practices and medical clinics using the Australian Government’s Healthdirect directory or the provider search tool on your OSHC insurer’s website and app.',
    xp: 10,
    source: {
      title: 'What to do if you get sick in Australia',
      url: 'https://www.medibank.com.au/overseas-health-insurance/guides/articles/getting-sick-in-australia/',
      chunk_id: 'kb/10-getting-sick-in-australia.md',
    },
    tags: ['healthdirect', 'find_provider', 'gp', 'healthcare_navigation'],
  },
  {
    id: 'find_hc_6',
    topic: 'finding_healthcare',
    difficulty: 2,
    question:
      'A doctor examines you and recommends a blood test and an ankle X-ray. How do diagnostic pathology and imaging services generally work under the Australian healthcare system?',
    options: [
      { id: 'a', text: 'The GP gives you a referral form to take to an accredited pathology or imaging clinic' },
      { id: 'b', text: 'You must personally purchase blood testing machinery from a local pharmacy shop' },
      { id: 'c', text: 'Diagnostic scans can only be performed if you are admitted overnight to hospital' },
      { id: 'd', text: 'Blood tests are illegal for temporary international visa holders in Australia' },
    ],
    correctOptionId: 'a',
    explanation:
      'In Australia, doctors provide referral request forms for pathology (blood tests) or radiology (X-rays/ultrasounds), which you take to an accredited diagnostic clinic. OSHC contributes benefits towards included MBS diagnostic items.',
    xp: 10,
    source: {
      title: 'Medibank OSHC Member Guide',
      url: 'https://www.medibank.com.au/content/dam/b2c/docs/mpl/Medibank_OSHC_Member_Guide.pdf',
      chunk_id: 'kb/04-oshc-member-guide.md',
    },
    tags: ['pathology', 'radiology', 'referral', 'diagnostic_services'],
  },
  {
    id: 'find_hc_7',
    topic: 'finding_healthcare',
    difficulty: 3,
    question:
      'You need planned medical treatment in a private hospital. Why is it advantageous to check whether the private hospital is in your insurer’s "Members’ Choice" network?',
    options: [
      { id: 'a', text: 'Members’ Choice hospitals have agreed rates that help reduce unexpected out-of-pocket costs' },
      { id: 'b', text: 'Non-network hospitals are completely free for all international university students' },
      { id: 'c', text: 'Members’ Choice hospitals allow patients to bypass Australian visa requirements' },
      { id: 'd', text: 'Choosing a network hospital guarantees that your semester grades will increase' },
    ],
    correctOptionId: 'a',
    explanation:
      'Members’ Choice private hospitals have agreements with your health insurer establishing agreed pricing for hospital accommodation and theatre fees, minimizing out-of-pocket gap expenses. Non-network private hospitals may result in significantly higher out-of-pocket costs.',
    xp: 10,
    source: {
      title: 'Medibank OSHC Member Guide',
      url: 'https://www.medibank.com.au/content/dam/b2c/docs/mpl/Medibank_OSHC_Member_Guide.pdf',
      chunk_id: 'kb/04-oshc-member-guide.md',
    },
    tags: ['members_choice', 'hospital_care', 'gap_fee', 'cost_awareness'],
  },

  // ==========================================
  // TOPIC 2: emergency_care (7 questions)
  // ==========================================
  {
    id: 'emerg_1',
    topic: 'emergency_care',
    difficulty: 1,
    question:
      'While on campus, a friend collapses, becomes unresponsive, and is struggling to breathe. What is the correct emergency phone number to call in Australia?',
    options: [
      { id: 'a', text: '911 (North American emergency number)' },
      { id: 'b', text: '999 (United Kingdom emergency number)' },
      { id: 'c', text: '000 (Triple Zero for emergency services)' },
      { id: 'd', text: '111 (General non-emergency helpline)' },
    ],
    correctOptionId: 'c',
    explanation:
      'In Australia, 000 (Triple Zero) is the national emergency telephone number for Ambulance, Police, and Fire services. It is free to call from any mobile or landline in an emergency.',
    xp: 10,
    source: {
      title: 'What you need to know about the Australian healthcare system',
      url: 'https://www.medibank.com.au/overseas-health-insurance/guides/articles/understanding-australian-healthcare/',
      chunk_id: 'kb/09-understanding-australian-healthcare.md',
    },
    tags: ['emergency', 'triple_zero', 'ambulance', 'urgent'],
  },
  {
    id: 'emerg_2',
    topic: 'emergency_care',
    difficulty: 2,
    question:
      'You experience a sudden, severe medical crisis and require an emergency ambulance to take you to the nearest hospital. How does OSHC generally treat emergency ambulance transport?',
    options: [
      { id: 'a', text: 'Emergency ambulance transport is not covered by any private health funds' },
      { id: 'b', text: 'Emergency ambulance transport is standardly covered when medically necessary' },
      { id: 'c', text: 'Ambulances are only covered if booked two weeks in advance by your university' },
      { id: 'd', text: 'Transport is covered only if you travel in a private passenger vehicle instead' },
    ],
    correctOptionId: 'b',
    explanation:
      'Standard OSHC policies include cover for emergency ambulance attendance and transport to a hospital when immediate professional medical attention is required and you cannot be safely transported another way.',
    xp: 10,
    source: {
      title: 'Overseas Student Health Cover (OSHC) | Overseas | Medibank',
      url: 'https://www.medibank.com.au/overseas-health-insurance/oshc/',
      chunk_id: 'kb/01-oshc-overview.md',
    },
    tags: ['ambulance', 'emergency_transport', 'hospital', 'oshc_benefits'],
  },
  {
    id: 'emerg_3',
    topic: 'emergency_care',
    difficulty: 3,
    question:
      'Late on a Sunday evening, you twist your ankle playing sports. It is painful and swollen, but you can still move and breathe easily. Regular clinics are closed. What is the most appropriate action?',
    options: [
      { id: 'a', text: 'Call 000 immediately to request an urgent lights-and-sirens ambulance' },
      { id: 'b', text: 'Attend an Urgent Care Clinic or contact an after-hours GP service' },
      { id: 'c', text: 'Book an international flight home for routine non-emergency medical care' },
      { id: 'd', text: 'Wait two full weeks before mentioning any pain or discomfort to anyone' },
    ],
    correctOptionId: 'b',
    explanation:
      'For urgent health concerns that are not life-threatening when regular GP clinics are closed, Medicare Urgent Care Clinics, after-hours medical services, or telephone nurse advice lines provide appropriate prompt care without crowding hospital emergency departments.',
    xp: 10,
    source: {
      title: 'What to do if you get sick in Australia',
      url: 'https://www.medibank.com.au/overseas-health-insurance/guides/articles/getting-sick-in-australia/',
      chunk_id: 'kb/10-getting-sick-in-australia.md',
    },
    tags: ['urgent_care', 'after_hours', 'emergency_department', 'healthcare_navigation'],
  },
  {
    id: 'emerg_4',
    topic: 'emergency_care',
    difficulty: 2,
    question:
      'A student is deciding between visiting a hospital emergency department and booking an appointment with a local GP. Which symptom clearly warrants going directly to the emergency department?',
    options: [
      { id: 'a', text: 'A mild headache that started this afternoon after studying' },
      { id: 'b', text: 'Severe chest pain, heavy breathing difficulty, or deep uncontrolled bleeding' },
      { id: 'c', text: 'A slight runny nose and seasonal sneezing caused by autumn pollen' },
      { id: 'd', text: 'Needing a routine dental cleaning or a standard eye examination check' },
    ],
    correctOptionId: 'b',
    explanation:
      'Hospital emergency departments are designed for critical, life-threatening conditions such as severe chest pain, breathing difficulties, or serious trauma. Mild symptoms and routine checkups should be managed by a GP or community healthcare provider.',
    xp: 10,
    source: {
      title: 'The Australian Healthcare System | Overseas health insurance | Medibank',
      url: 'https://www.medibank.com.au/overseas-health-insurance/guides/australian-healthcare/',
      chunk_id: 'kb/08-australian-healthcare.md',
    },
    tags: ['emergency_department', 'triage', 'gp', 'decision_making'],
  },
  {
    id: 'emerg_5',
    topic: 'emergency_care',
    difficulty: 3,
    question:
      'After being treated and discharged from hospital following a sprained knee, you want an ambulance to drive you back to your rental house because you do not have a car. Is this non-emergency transport covered by OSHC?',
    options: [
      { id: 'a', text: 'Yes, OSHC provides free routine passenger transport for all university trips' },
      { id: 'b', text: 'No, OSHC ambulance benefits exclude non-emergency transport after hospital discharge' },
      { id: 'c', text: 'Yes, if the ambulance driver agrees to stop at a grocery market on the way' },
      { id: 'd', text: 'No, students are prohibited from traveling in taxis or rideshare cars after injury' },
    ],
    correctOptionId: 'b',
    explanation:
      'OSHC covers emergency ambulance transport when immediate professional medical attention is required. Routine transport, such as a ride home from the hospital after discharge, is not covered and must be arranged privately (e.g., via taxi, rideshare, or friend).',
    xp: 10,
    source: {
      title: 'Medibank OSHC Member Guide',
      url: 'https://www.medibank.com.au/content/dam/b2c/docs/mpl/Medibank_OSHC_Member_Guide.pdf',
      chunk_id: 'kb/04-oshc-member-guide.md',
    },
    tags: ['ambulance', 'exclusions', 'non_emergency_transport', 'hospital_discharge'],
  },
  {
    id: 'emerg_6',
    topic: 'emergency_care',
    difficulty: 1,
    question:
      'You witness a severe traffic accident near your student campus and need to call for emergency paramedics. Do you need mobile credit or a local phone plan to dial 000 in Australia?',
    options: [
      { id: 'a', text: 'Yes, emergency calls require a minimum of $20 international calling credit' },
      { id: 'b', text: 'No, calls to 000 are completely free from any mobile phone, landline, or payphone' },
      { id: 'c', text: 'Yes, you must enter your student visa identification number before connecting' },
      { id: 'd', text: 'No, but you can only call 000 if your university campus security office is open' },
    ],
    correctOptionId: 'b',
    explanation:
      'In Australia, calls to 000 (Triple Zero) are free of charge from any telephone, including mobile phones without credit, SIM cards, or landlines.',
    xp: 10,
    source: {
      title: 'What you need to know about the Australian healthcare system',
      url: 'https://www.medibank.com.au/overseas-health-insurance/guides/articles/understanding-australian-healthcare/',
      chunk_id: 'kb/09-understanding-australian-healthcare.md',
    },
    tags: ['emergency', 'triple_zero', 'phone_call', 'ambulance'],
  },
  {
    id: 'emerg_7',
    topic: 'emergency_care',
    difficulty: 2,
    question:
      'You attend a public hospital emergency department with a minor finger cut. Other patients who arrive after you with severe chest pain are seen first. Why does this occur?',
    options: [
      { id: 'a', text: 'Australian hospital emergency departments treat patients based on medical urgency (triage)' },
      { id: 'b', text: 'The hospital prioritizes patients based on how long their student visa lasts' },
      { id: 'c', text: 'International students are always placed at the end of the line regardless of symptoms' },
      { id: 'd', text: 'The receptionists only treat patients who hold private Australian citizenship cards' },
    ],
    correctOptionId: 'a',
    explanation:
      'Australian emergency departments operate on clinical triage, meaning patients with critical or life-threatening conditions are always treated first. Non-urgent cases may experience long waiting times, which is why a GP or urgent care clinic is often more appropriate for minor issues.',
    xp: 10,
    source: {
      title: 'The Australian Healthcare System | Overseas health insurance | Medibank',
      url: 'https://www.medibank.com.au/overseas-health-insurance/guides/australian-healthcare/',
      chunk_id: 'kb/08-australian-healthcare.md',
    },
    tags: ['triage', 'emergency_department', 'hospital', 'healthcare_navigation'],
  },

  // ==========================================
  // TOPIC 3: pharmacy (7 questions)
  // ==========================================
  {
    id: 'pharm_1',
    topic: 'pharmacy',
    difficulty: 1,
    question:
      'A doctor consults with you and provides an electronic prescription token (eScript) for an antibiotic. Where in Australia can you have this prescription dispensed?',
    options: [
      { id: 'a', text: 'Any community pharmacy or chemist' },
      { id: 'b', text: 'The university student administration office' },
      { id: 'c', text: 'A local post office or newsagency shop' },
      { id: 'd', text: 'The state department of transportation desk' },
    ],
    correctOptionId: 'a',
    explanation:
      'In Australia, prescription medicines must be dispensed by a registered pharmacist at a community pharmacy or chemist. You can present your paper prescription or digital eScript token there.',
    xp: 10,
    source: {
      title: 'What to do if you get sick in Australia',
      url: 'https://www.medibank.com.au/overseas-health-insurance/guides/articles/getting-sick-in-australia/',
      chunk_id: 'kb/10-getting-sick-in-australia.md',
    },
    tags: ['pharmacy', 'chemist', 'prescriptions', 'medication'],
  },
  {
    id: 'pharm_2',
    topic: 'pharmacy',
    difficulty: 2,
    question:
      'You are picking up an eligible prescription medication at a pharmacy. How do OSHC prescription medicine benefits generally work for eligible PBS medicines?',
    options: [
      { id: 'a', text: 'You pay an initial contribution per item, and OSHC may pay benefits above it' },
      { id: 'b', text: 'All prescription medicines, vitamins, and skincare are 100% free with no limits' },
      { id: 'c', text: 'OSHC policies completely exclude all forms of prescribed pharmaceutical items' },
      { id: 'd', text: 'The pharmacy bills the Australian Taxation Office directly on your behalf' },
    ],
    correctOptionId: 'a',
    explanation:
      'Under OSHC pharmacy cover, students generally pay a member contribution (co-payment) towards each eligible prescription medicine before the insurer contributes benefits up to annual policy limits.',
    xp: 10,
    source: {
      title: 'Overseas Student Health Cover (OSHC) | Overseas | Medibank',
      url: 'https://www.medibank.com.au/overseas-health-insurance/oshc/',
      chunk_id: 'kb/01-oshc-overview.md',
    },
    tags: ['pharmacy', 'copayment', 'prescription_benefit', 'out_of_pocket'],
  },
  {
    id: 'pharm_3',
    topic: 'pharmacy',
    difficulty: 3,
    question:
      'You arrived in Australia with prescription medication for an ongoing condition and will need a refill soon. Your prescription was written by a doctor in your home country. What should you do?',
    options: [
      { id: 'a', text: 'Take your overseas prescription directly to any pharmacy to have it filled' },
      { id: 'b', text: 'Visit an Australian GP with your medical notes to get a local prescription' },
      { id: 'c', text: 'Order unverified medications from unregulated social media chat channels' },
      { id: 'd', text: 'Stop taking your prescribed medication completely while living in Australia' },
    ],
    correctOptionId: 'b',
    explanation:
      'Australian pharmacies can only dispense medications prescribed by practitioners registered in Australia. International students should bring their medical summary from home and visit an Australian GP to receive a valid Australian prescription.',
    xp: 10,
    source: {
      title: 'What you need to know about the Australian healthcare system',
      url: 'https://www.medibank.com.au/overseas-health-insurance/guides/articles/understanding-australian-healthcare/',
      chunk_id: 'kb/09-understanding-australian-healthcare.md',
    },
    tags: ['prescriptions', 'gp_consultation', 'overseas_students', 'pharmacy'],
  },
  {
    id: 'pharm_4',
    topic: 'pharmacy',
    difficulty: 1,
    question:
      'You have a mild runny nose and occasional dry cough, but feel generally well otherwise. Where can you get quick professional advice on over-the-counter remedies without an appointment?',
    options: [
      { id: 'a', text: 'A community pharmacist at a chemist' },
      { id: 'b', text: 'The emergency surgical ward at a hospital' },
      { id: 'c', text: 'An ambulance paramedic on emergency dispatch' },
      { id: 'd', text: 'The Department of Home Affairs visa counter' },
    ],
    correctOptionId: 'a',
    explanation:
      'Pharmacists are trained healthcare professionals who can provide advice on managing minor ailments and recommend over-the-counter medicines without requiring a doctor appointment.',
    xp: 10,
    source: {
      title: 'What to do if you get sick in Australia',
      url: 'https://www.medibank.com.au/overseas-health-insurance/guides/articles/getting-sick-in-australia/',
      chunk_id: 'kb/10-getting-sick-in-australia.md',
    },
    tags: ['pharmacist', 'over_the_counter', 'minor_ailments', 'healthcare_navigation'],
  },
  {
    id: 'pharm_5',
    topic: 'pharmacy',
    difficulty: 2,
    question:
      'You buy basic paracetamol tablets and vitamin C gummies over the counter at a chemist without a doctor’s prescription. Can you claim a refund for these items under your OSHC?',
    options: [
      { id: 'a', text: 'Yes, all non-prescription drugstore products are fully reimbursed under OSHC' },
      { id: 'b', text: 'No, OSHC only pays benefits towards eligible doctor-prescribed medications' },
      { id: 'c', text: 'Yes, if you present your student identity card at the supermarket checkout' },
      { id: 'd', text: 'No, international students are forbidden by law from buying over-the-counter drugs' },
    ],
    correctOptionId: 'b',
    explanation:
      'OSHC pharmacy benefits only apply to eligible medications prescribed by a registered doctor (GP or specialist) to treat an illness or condition. Over-the-counter medicines, vitamins, and herbal products are paid out-of-pocket.',
    xp: 10,
    source: {
      title: 'Medibank OSHC Member Guide',
      url: 'https://www.medibank.com.au/content/dam/b2c/docs/mpl/Medibank_OSHC_Member_Guide.pdf',
      chunk_id: 'kb/04-oshc-member-guide.md',
    },
    tags: ['pharmacy', 'exclusions', 'over_the_counter', 'vitamins'],
  },
  {
    id: 'pharm_6',
    topic: 'pharmacy',
    difficulty: 3,
    question:
      'A student is prescribed specialized medication for a complex condition. The pharmacist explains that the medication is not subsidized by the government PBS for non-residents. What should the student understand about costs?',
    options: [
      { id: 'a', text: 'OSHC benefits for pharmaceuticals have set limits, meaning high-cost drugs can have large gaps' },
      { id: 'b', text: 'The Australian government pays 100% of all experimental treatments for foreign visitors' },
      { id: 'c', text: 'Private health insurers will automatically buy the pharmaceutical company on your behalf' },
      { id: 'd', text: 'The student must immediately renounce their visa to receive medication in Australia' },
    ],
    correctOptionId: 'a',
    explanation:
      'Because international students are generally not eligible for PBS government subsidies, high-cost medicines can be expensive. OSHC policies have annual pharmaceutical benefit limits, which may result in significant out-of-pocket expenses.',
    xp: 10,
    source: {
      title: 'Medibank OSHC Member Guide',
      url: 'https://www.medibank.com.au/content/dam/b2c/docs/mpl/Medibank_OSHC_Member_Guide.pdf',
      chunk_id: 'kb/04-oshc-member-guide.md',
    },
    tags: ['pharmacy', 'pbs', 'annual_limits', 'out_of_pocket'],
  },
  {
    id: 'pharm_7',
    topic: 'pharmacy',
    difficulty: 2,
    question:
      'Following a telehealth or clinic appointment, your GP issues your prescription as an electronic "token" sent by SMS to your smartphone. How do you use this token at the pharmacy?',
    options: [
      { id: 'a', text: 'Show the QR code or link in the SMS to the chemist to dispense the medicine' },
      { id: 'b', text: 'Print the SMS on paper and mail it to the Australian Federal Police department' },
      { id: 'c', text: 'Enter the code into a university exam portal to prove you were sick today' },
      { id: 'd', text: 'Electronic prescriptions are invalid in Australia and must be handwritten on parchment' },
    ],
    correctOptionId: 'a',
    explanation:
      'In Australia, electronic prescriptions (eScripts) arrive as an SMS or email token with a barcode or QR code. The community pharmacist scans the token directly from your smartphone to dispense your medicine.',
    xp: 10,
    source: {
      title: 'What you need to know about the Australian healthcare system',
      url: 'https://www.medibank.com.au/overseas-health-insurance/guides/articles/understanding-australian-healthcare/',
      chunk_id: 'kb/09-understanding-australian-healthcare.md',
    },
    tags: ['escript', 'pharmacy', 'digital_health', 'prescriptions'],
  },

  // ==========================================
  // TOPIC 4: claims (7 questions)
  // ==========================================
  {
    id: 'claims_1',
    topic: 'claims',
    difficulty: 1,
    question:
      'You paid for a doctor consultation upfront because the clinic does not offer direct billing. What key document must you request from the receptionist to claim your refund from your OSHC provider?',
    options: [
      { id: 'a', text: 'An informal handwritten note with only the doctor’s first name' },
      { id: 'b', text: 'An itemized medical receipt with provider number and MBS item codes' },
      { id: 'c', text: 'A generic bank account statement showing your total card balance' },
      { id: 'd', text: 'A stamped university enrollment confirmation letter for this term' },
    ],
    correctOptionId: 'b',
    explanation:
      'To process your claim, insurers require an itemized tax invoice or receipt showing the doctor’s provider number, date of service, MBS item numbers, and the amount paid.',
    xp: 10,
    source: {
      title: 'How to Claim | Medibank Overseas Student Health Cover',
      url: 'https://www.medibankoshc.com.au/how-to-make-an-online-claim/',
      chunk_id: 'kb/13-oshc-online-claims.md',
    },
    tags: ['claims', 'itemized_receipt', 'mbs_item', 'refunds'],
  },
  {
    id: 'claims_2',
    topic: 'claims',
    difficulty: 2,
    question:
      'A private GP clinic charges you $85 for a standard consultation, but your OSHC provider refunds you $42.85 (100% of the government MBS fee). What explains the difference?',
    options: [
      { id: 'a', text: 'The insurer applied a penalty because you visited a doctor on a weekday' },
      { id: 'b', text: 'The difference is the out-of-pocket gap fee set by the private medical practice' },
      { id: 'c', text: 'OSHC regulations require that only half of every medical claim can ever be paid' },
      { id: 'd', text: 'International students are not eligible for any doctor consultation benefits' },
    ],
    correctOptionId: 'b',
    explanation:
      'In Australia, doctors can set their own consultation fees above the government MBS schedule fee. The difference between what the doctor charges and what your insurer pays is your out-of-pocket gap fee.',
    xp: 10,
    source: {
      title: 'What to do if you get sick in Australia',
      url: 'https://www.medibank.com.au/overseas-health-insurance/guides/articles/getting-sick-in-australia/',
      chunk_id: 'kb/10-getting-sick-in-australia.md',
    },
    tags: ['gap_fee', 'out_of_pocket', 'mbs_fee', 'costs'],
  },
  {
    id: 'claims_3',
    topic: 'claims',
    difficulty: 3,
    question:
      'You paid upfront for a medical consultation and want to receive your reimbursement as quickly as possible. What is generally the fastest way to submit your claim?',
    options: [
      { id: 'a', text: 'Upload a photo of your receipt via your OSHC mobile app or online portal' },
      { id: 'b', text: 'Mail printed paper receipts via standard postal mail to government offices' },
      { id: 'c', text: 'Hand-deliver your documents to the Department of Home Affairs visa desk' },
      { id: 'd', text: 'Bring cash receipts to the Australian Taxation Office during annual tax time' },
    ],
    correctOptionId: 'a',
    explanation:
      'Submitting claims online or through your insurer’s mobile app by uploading a photo of your receipt is the fastest method.',
    xp: 10,
    source: {
      title: 'How to Claim | Medibank Overseas Student Health Cover',
      url: 'https://www.medibankoshc.com.au/how-to-make-an-online-claim/',
      chunk_id: 'kb/13-oshc-online-claims.md',
    },
    tags: ['online_claims', 'mobile_app', 'reimbursement', 'banking'],
  },
  {
    id: 'claims_4',
    topic: 'claims',
    difficulty: 2,
    question:
      'Before booking an appointment with a specialist or non-direct billing clinic, what practical step should you take to avoid unexpected medical bills?',
    options: [
      { id: 'a', text: 'Ask the clinic about their consultation fee and any out-of-pocket gap upfront' },
      { id: 'b', text: 'Assume all private specialist fees are fully covered with zero gap automatically' },
      { id: 'c', text: 'Request that the Australian government pay the doctor before your appointment' },
      { id: 'd', text: 'Pay the maximum estimated fee into an overseas bank account prior to arrival' },
    ],
    correctOptionId: 'a',
    explanation:
      'Under Informed Financial Consent, it is always wise to ask the provider in advance what they charge and how much may be out-of-pocket, then check with your insurer to understand what benefit you will receive back.',
    xp: 10,
    source: {
      title: 'What you need to know about the Australian healthcare system',
      url: 'https://www.medibank.com.au/overseas-health-insurance/guides/articles/understanding-australian-healthcare/',
      chunk_id: 'kb/09-understanding-australian-healthcare.md',
    },
    tags: ['informed_consent', 'financial_awareness', 'costs', 'gap_fee'],
  },
  // {
  //   id: 'claims_5',
  //   topic: 'claims',
  //   difficulty: 3,
  //   question:
  //     'A student finds an old medical invoice from a doctor consultation that occurred 18 months ago while studying in Melbourne. Can this medical claim still be submitted to the OSHC insurer?',
  //   options: [
  //     { id: 'a', text: 'Yes, claims can generally be submitted up to two years from the service date' },
  //     { id: 'b', text: 'No, all medical claims expire within 48 hours of the doctor consultation ending' },
  //     { id: 'c', text: 'Yes, but only if the student retakes the entire university academic semester' },
  //     { id: 'd', text: 'No, claims can only be processed on the exact day that the illness occurred' },
  //   ],
  //   correctOptionId: 'a',
  //   explanation:
  //     'Under Medibank OSHC rules, claims must be submitted within two years of the date of service or purchase. Claims submitted after two years are no longer eligible for benefit payment.',
  //   xp: 10,
  //   source: {
  //     title: 'Medibank OSHC Member Guide',
  //     url: 'https://www.medibank.com.au/content/dam/b2c/docs/mpl/Medibank_OSHC_Member_Guide.pdf',
  //     chunk_id: 'kb/04-oshc-member-guide.md',
  //   },
  //   tags: ['claims_timeframe', 'two_year_limit', 'reimbursement', 'rules'],
  // },
  {
    id: 'claims_6',
    topic: 'claims',
    difficulty: 2,
    question:
      'You submit a successful online OSHC claim for doctor fees you paid upfront. Into what kind of bank account can the insurer deposit your benefit refund?',
    options: [
      { id: 'a', text: 'An active Australian bank account nominated in your online member profile' },
      { id: 'b', text: 'Any foreign currency credit card issued by an overseas department store' },
      { id: 'c', text: 'A digital cryptocurrency wallet linked to an anonymous online account' },
      { id: 'd', text: 'An overseas joint account registered under a former high school teacher' },
    ],
    correctOptionId: 'a',
    explanation:
      'OSHC benefit payments are issued in Australian dollars and can only be deposited directly into an active Australian bank account. Ensuring your bank details are up to date in your member portal ensures fast reimbursement.',
    xp: 10,
    source: {
      title: 'Medibank OSHC Member Guide',
      url: 'https://www.medibank.com.au/content/dam/b2c/docs/mpl/Medibank_OSHC_Member_Guide.pdf',
      chunk_id: 'kb/04-oshc-member-guide.md',
    },
    tags: ['australian_bank_account', 'reimbursement', 'direct_deposit', 'claims'],
  },
  {
    id: 'claims_7',
    topic: 'claims',
    difficulty: 1,
    question:
      'You visit a clinic that offers direct billing for Medibank OSHC. You present your valid OSHC membership card and photo ID. What happens with the bill for eligible consultation fees?',
    options: [
      { id: 'a', text: 'The clinic sends the bill directly to Medibank, reducing what you pay upfront' },
      { id: 'b', text: 'You must pay the total bill in cash and physically mail checks to Canberra' },
      { id: 'c', text: 'The clinic reports your medical history directly to immigration border control' },
      { id: 'd', text: 'You are required to perform voluntary administrative clinic duties instead of paying' },
    ],
    correctOptionId: 'a',
    explanation:
      'At a direct billing clinic, the provider bills the insurer directly for the benefit amount. You only pay any remaining gap fee if the doctor charges above the benefit, eliminating the need to submit a claim later.',
    xp: 10,
    source: {
      title: 'What to do if you get sick in Australia',
      url: 'https://www.medibank.com.au/overseas-health-insurance/guides/articles/getting-sick-in-australia/',
      chunk_id: 'kb/10-getting-sick-in-australia.md',
    },
    tags: ['direct_billing', 'membership_card', 'claims', 'upfront_costs'],
  },

  // ==========================================
  // TOPIC 5: policy_management (7 questions)
  // ==========================================
  {
    id: 'policy_1',
    topic: 'policy_management',
    difficulty: 1,
    question:
      'You are considering booking a routine dental cleaning and an eye exam for new glasses. Are these services generally covered by a standard basic OSHC policy?',
    options: [
      { id: 'a', text: 'Yes, basic OSHC policies include unlimited free dental and optical treatment' },
      { id: 'b', text: 'No, routine dental and optical services usually require separate Extras cover' },
      { id: 'c', text: 'Yes, dental checkups are paid in full if you attend a university hospital' },
      { id: 'd', text: 'No, international students are legally barred from visiting Australian dentists' },
    ],
    correctOptionId: 'b',
    explanation:
      'Standard OSHC covers medical services and hospital treatments. Ancillary services like general dental, optical, and physiotherapy are generally excluded unless you purchase separate Extras cover.',
    xp: 10,
    source: {
      title: 'What health insurance do I need for my Australian visa? | Medibank',
      url: 'https://www.medibank.com.au/overseas-health-insurance/guides/articles/which-health-cover-for-my-visa/',
      chunk_id: 'kb/12-oshc-visa-requirements.md',
    },
    tags: ['extras_cover', 'dental', 'optical', 'policy_coverage'],
  },
  {
    id: 'policy_2',
    topic: 'policy_management',
    difficulty: 2,
    question:
      'As an international student on a Student Visa (Subclass 500), what does mandatory Visa Condition 8501 require regarding your health insurance?',
    options: [
      { id: 'a', text: 'You only need to hold insurance during scheduled university examination weeks' },
      { id: 'b', text: 'You must maintain continuous, valid health insurance for your entire visa stay' },
      { id: 'c', text: 'Health insurance is optional once you complete your initial arrival semester' },
      { id: 'd', text: 'You only need health cover if you participate in competitive campus sports' },
    ],
    correctOptionId: 'b',
    explanation:
      'Visa Condition 8501 requires Student Visa holders to maintain adequate health insurance (typically OSHC) continuously for the entire duration of their stay in Australia. Allowing cover to lapse breaches visa conditions.',
    xp: 10,
    source: {
      title: 'What health insurance do I need for my Australian visa? | Medibank',
      url: 'https://www.medibank.com.au/overseas-health-insurance/guides/articles/which-health-cover-for-my-visa/',
      chunk_id: 'kb/12-oshc-visa-requirements.md',
    },
    tags: ['visa_500', 'condition_8501', 'visa_compliance', 'policy_management'],
  },
  // {
  //   id: 'policy_3',
  //   topic: 'policy_management',
  //   difficulty: 3,
  //   question:
  //     'What does a "pre-existing condition waiting period" mean under an Australian OSHC policy?',
  //   options: [
  //     { id: 'a', text: 'A period before benefits are payable for conditions that existed before cover' },
  //     { id: 'b', text: 'The scheduled minutes a student must sit in a clinic waiting room before care' },
  //     { id: 'c', text: 'The time an insurer takes to transfer monthly premium money between accounts' },
  //     { id: 'd', text: 'A mandatory period during which international students cannot visit any doctor' },
  //   ],
  //   correctOptionId: 'a',
  //   explanation:
  //     'A waiting period is the time you must wait after joining before your policy will pay benefits for certain services, such as conditions that existed before your arrival in Australia (typically 12 months). Emergency care for unforeseen accidents is generally not subject to waiting periods.',
  //   xp: 10,
  //   source: {
  //     title: 'What is a waiting period? | Medibank',
  //     url: 'https://www.medibank.com.au/overseas-health-insurance/guides/articles/what-are-waiting-periods/',
  //     chunk_id: 'kb/11-waiting-periods.md',
  //   },
  //   tags: ['waiting_periods', 'pre_existing_conditions', 'policy_coverage', 'oshc_rules'],
  // },
  {
    id: 'policy_4',
    topic: 'policy_management',
    difficulty: 2,
    question:
      'A student’s parents are visiting Australia on holiday for three weeks. The student has a Medibank OSHC policy. Are the visiting parents covered under the student’s OSHC?',
    options: [
      { id: 'a', text: 'Yes, OSHC automatically covers all visiting parents, siblings, and relatives' },
      { id: 'b', text: 'No, OSHC only covers the student and eligible dependants listed on their visa' },
      { id: 'c', text: 'Yes, provided the parents stay in the same student rental apartment address' },
      { id: 'd', text: 'No, overseas visitors are legally prohibited from obtaining healthcare here' },
    ],
    correctOptionId: 'b',
    explanation:
      'OSHC policies only cover the primary student and any eligible partner or dependent children listed on their student visa. Extended family members, including visiting parents, require separate Overseas Visitor Health Cover (OVHC) or travel insurance.',
    xp: 10,
    source: {
      title: 'FAQs | Medibank',
      url: 'https://www.medibank.com.au/overseas-health-insurance/oshc/faqs/',
      chunk_id: 'kb/06-oshc-faq.md',
    },
    tags: ['family_cover', 'dependants', 'ovhc', 'policy_management'],
  },
  // {
  //   id: 'policy_5',
  //   topic: 'policy_management',
  //   difficulty: 3,
  //   question:
  //     'You switch your OSHC from another registered Australian insurer to Medibank without any gap in coverage. What happens to the waiting periods you have already completed?',
  //   options: [
  //     { id: 'a', text: 'Your completed waiting periods are credited and count towards your new cover' },
  //     { id: 'b', text: 'All waiting periods are permanently reset to zero whenever you switch funds' },
  //     { id: 'c', text: 'Switching health funds automatically cancels your Australian student visa' },
  //     { id: 'd', text: 'You must pay double monthly premiums for twelve months following any transfer' },
  //   ],
  //   correctOptionId: 'a',
  //   explanation:
  //     'When you transfer continuously from another Australian OSHC provider without a gap in cover, the time served towards waiting periods with your former insurer is recognized by your new provider.',
  //   xp: 10,
  //   source: {
  //     title: 'FAQs | Medibank',
  //     url: 'https://www.medibank.com.au/overseas-health-insurance/oshc/faqs/',
  //     chunk_id: 'kb/06-oshc-faq.md',
  //   },
  //   tags: ['switching_funds', 'waiting_periods', 'transfer_rules', 'policy_continuity'],
  // },
  {
    id: 'policy_6',
    topic: 'policy_management',
    difficulty: 1,
    question:
      'You bought your OSHC online before leaving your home country and arrived in Australia one week later. When does your active health cover period start?',
    options: [
      { id: 'a', text: 'From the confirmed date of your arrival in Australia' },
      { id: 'b', text: 'Exactly one full year after your university degree ends' },
      { id: 'c', text: 'Only once you pass your first end-of-semester exam paper' },
      { id: 'd', text: 'From the date your high school diploma was first issued' },
    ],
    correctOptionId: 'a',
    explanation:
      'When you purchase OSHC prior to arrival, your membership commences on the date you arrive in Australia. If your flight or arrival date changes, you should inform your insurer so they can adjust your records.',
    xp: 10,
    source: {
      title: 'FAQs | Medibank',
      url: 'https://www.medibank.com.au/overseas-health-insurance/oshc/faqs/',
      chunk_id: 'kb/06-oshc-faq.md',
    },
    tags: ['arrival_date', 'membership_start', 'visa_requirements', 'policy_management'],
  },
  {
    id: 'policy_7',
    topic: 'policy_management',
    difficulty: 2,
    question:
      'You have just graduated from university and are transitioning from a Student Visa to a Temporary Graduate Visa (Subclass 485). Can you remain on your student OSHC policy?',
    options: [
      { id: 'a', text: 'Yes, OSHC can be renewed for lifetime coverage even after your student visa ends' },
      { id: 'b', text: 'No, you must transition to an Overseas Visitors or Working Visa Health Cover' },
      { id: 'c', text: 'Yes, if your university professors write a special letter to your local doctor' },
      { id: 'd', text: 'No, graduates are strictly barred from holding any private insurance in Australia' },
    ],
    correctOptionId: 'b',
    explanation:
      'OSHC is exclusively for student visa holders. Once you move to a graduate or working visa (such as Subclass 485), you must transition to an Overseas Visitors Health Cover (OVHC) or Working Visa Cover to satisfy visa conditions.',
    xp: 10,
    source: {
      title: 'What health insurance do I need for my Australian visa? | Medibank',
      url: 'https://www.medibank.com.au/overseas-health-insurance/guides/articles/which-health-cover-for-my-visa/',
      chunk_id: 'kb/12-oshc-visa-requirements.md',
    },
    tags: ['graduate_visa_485', 'ovhc', 'visa_transition', 'policy_management'],
  },
];

export const TOTAL_QUIZ_QUESTIONS = 5;
export const XP_PER_CORRECT_ANSWER = 10;
