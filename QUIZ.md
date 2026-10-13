# WhatsApp Informative Learning & Quiz

Users can reply `QUIZ` to opt in and start. Each session begins with an informative topic lesson followed by a five-question quiz.

## Key Features

1. **WhatsApp Flow Integration**:
   - The session can be rendered natively inside WhatsApp as an interactive **WhatsApp Flow** (`OshcQuizFlow`).
   - **Screen 1 (`LESSON`)**: Informative learning session detailing primary care, emergencies, medicines, claims, or policies.
   - **Screen 2 (`QUIZ`)**: Interactive multiple-choice form (RadioButtons) with questions and options A–D.
   - Submissions are received automatically, graded against the question bank, and awarded XP.
   - The standalone Meta Flow JSON is available at `flows/oshc_quiz_flow.json`.
   - To activate the flow on WhatsApp, set `QUIZ_FLOW_ID` in `.env` to the published flow ID. If omitted, the bot smoothly falls back to interactive text chat so testing always works.

2. **Deterministic Sequence & Zero Repetition**:
   - The curriculum is standardized across 7 sessions covering all 32 questions in `src/quiz/curriculum.ts`.
   - **Same format, flow, and sequence for every user**:
     - Session 1: Finding Healthcare in Australia (`find_hc_1` to `find_hc_5`)
     - Session 2: Urgent and Emergency Care (`emerg_1` to `emerg_5`)
     - Session 3: Pharmacies and Prescription Medicines (`pharm_1` to `pharm_5`)
     - Session 4: Making and Tracking Claims (`claims_1` to `claims_4`, `claims_6`)
     - Session 5: Understanding Your Policy & Visa Rules (`policy_1`, `policy_2`, `policy_4`, `policy_6`, `policy_7`)
     - Session 6: Advanced Healthcare Navigation & Diagnostics (`find_hc_6`, `find_hc_7`, `emerg_6`, `emerg_7`, `pharm_6`)
     - Session 7: Final Mastery & Seamless Care (`pharm_7`, `claims_7`)
   - **Zero Question Repetition**: Questions across sessions are strictly disjoint. Once a user completes a session, those questions are never repeated.

3. **XP Tracking & Mastery Reward**:
   - XP is tracked persistently in PostgreSQL (`user_quiz_state` and `quiz_sessions`).
   - Each question awards 10 XP upon first correct answer.
   - Mastering all 32 questions earns 320/320 XP and qualifies the user for the free health checkup announcement.

4. **Weekly Reminders**:
   - Users receive one reminder each week after opting in.
   - `STOP QUIZ` turns off reminders; `QUIZ` resumes.
   - Set `QUIZ_REMINDER_TEMPLATE` to an approved WhatsApp template name for production reminders (disabled by default in sandbox).
