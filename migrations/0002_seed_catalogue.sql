INSERT INTO catalogue_categories (id, name, description, sort_order, created_at, updated_at)
VALUES
  ('cover-and-membership', 'Cover and membership', 'Understand your cover, membership, eligibility, and policy details.', 1, now(), now()),
  ('claims-and-payments', 'Claims and payments', 'Find information about claims, payments, refunds, and receipts.', 2, now(), now()),
  ('healthcare-and-providers', 'Healthcare and providers', 'Find care, direct billing providers, hospitals, and healthcare guidance.', 3, now(), now()),
  ('pharmacy-and-medicines', 'Pharmacy and medicines', 'Get help with medicines, prescriptions, and pharmacy benefits.', 4, now(), now()),
  ('visa-and-compliance', 'Visa and compliance', 'Find information related to visa health cover requirements.', 5, now(), now()),
  ('support', 'Support', 'Get help with your OSHC experience and next steps.', 6, now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO catalogue_services (id, category_id, name, description, sort_order, created_at, updated_at)
VALUES
  ('cover-summary', 'cover-and-membership', 'Understand my cover', 'Learn what your Essentials or Comprehensive cover includes.', 1, now(), now()),
  ('membership-help', 'cover-and-membership', 'Membership help', 'Find help with membership details, cards, waiting periods, and policy changes.', 2, now(), now()),
  ('general-claims', 'claims-and-payments', 'Make or track a claim', 'Find the right claim pathway and understand supporting documents.', 1, now(), now()),
  ('provider-claims', 'claims-and-payments', 'Provider and direct billing claims', 'Understand provider claims and direct billing arrangements.', 2, now(), now()),
  ('find-healthcare', 'healthcare-and-providers', 'Find healthcare', 'Learn how to find doctors, hospitals, and other healthcare services in Australia.', 1, now(), now()),
  ('pharmacy-help', 'pharmacy-and-medicines', 'Pharmacy and medicines', 'Understand pharmacy benefits, prescriptions, and medicine costs.', 1, now(), now()),
  ('visa-requirements', 'visa-and-compliance', 'Visa requirements', 'Check the health cover information relevant to your visa obligations.', 1, now(), now()),
  ('contact-support', 'support', 'Contact OSHC support', 'Get help when you cannot find the answer in the catalogue.', 1, now(), now())
ON CONFLICT (id) DO NOTHING;
