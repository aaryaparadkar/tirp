# WhatsApp Informative Learning & Quiz

Users can reply `QUIZ` to opt in and start. Each session begins with an informative topic lesson followed by a five-question quiz.

## Key Features

1. **WhatsApp Flow Integration**:
   - The session is rendered natively inside WhatsApp as an interactive **WhatsApp Flow** (`OshcQuizFlow`).
   - **Screen 1 (`LESSON`)**: Informative learning session detailing primary care, emergencies, medicines, claims, or policies.
   - **Screens 2..N (`QUESTION_ONE`..`QUESTION_FIVE`)**: One interactive multiple-choice screen per question, collecting `q_one`..`q_five`.
   - **Screen N+1 (`RESULTS`)**: Answer review plus a single `complete` payload carrying every answer back to the webhook.
   - Submissions are received automatically, graded against the question bank, and awarded XP.
   - **Single source of truth**: the whole Flow lives in one file, `flows/oshc_quiz_flow.json`. Import that file into Kapso (**WhatsApp → Flows → create/import → assign phone number → Publish**) and set `QUIZ_FLOW_ID` to the published Meta Flow ID. Edit the Flow with `npm run flow:export`; `npm run flow:check` and `tests/quiz-flow.test.ts` fail if the committed file drifts from the generator.
   - **Scope**: the published JSON encodes one fixed five-question session (curriculum session 1). Later sessions are delivered as text until their own Flow is published. A configured-but-placeholder `QUIZ_FLOW_ID` (for example `replace-with-...`) is ignored in favour of the text fallback.
   - If `QUIZ_FLOW_ID` is unset, the bot smoothly falls back to interactive text chat so testing always works.

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

## Triggering a quiz via API

Operators can start (or resume) a quiz for a user without waiting for them
to type `QUIZ`:

```bash
curl -X POST https://<service>/quiz/start \
  -H "Authorization: Bearer $QUIZ_TRIGGER_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"phone": "+61400000000"}'
```

- Requires `QUIZ_TRIGGER_TOKEN` (Bearer auth, timing-safe compare).
- `phone` must be E.164 (`+` optional, spaces/dashes tolerated).
- Idempotent: an existing active session is resumed, never duplicated
  (enforced by a partial unique index, migration `0005`).
- Rate-limited to 5 triggers per phone per minute.
- Response: `{"ok": true, "phone": "...", "session": 1, "resumed": false, "delivery": "flow"|"text"|"completed"}`.
- Set `QUIZ_FLOW_ID` to the published Flow ID (from `flows/oshc_quiz_flow.json`) to
  deliver the interactive Flow; otherwise the bot falls back to text chat.
- If Flow delivery fails, the placeholder session is rolled back and the
  request returns an error, so a retry starts cleanly instead of resuming a
  Flow-less text session.

## Register onboarding purchase

The purchase endpoint uses its own bearer token:

```env
ONBOARDING_TRIGGER_TOKEN=replace-with-a-different-secure-random-token
```

Example request:

```bash
curl -X POST "https://<service>/onboarding/purchase" \
  -H "Authorization: Bearer $ONBOARDING_TRIGGER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"phone":"+61400000000","name":"Demo Student","purchaseEventKey":"purchase-001"}'
```

The `purchaseEventKey` is idempotent for a contact. Set the variable in the
server `.env` and restart the server after changing it.

For a short demo, set:

```env
ONBOARDING_ARRIVAL_REMINDER_DELAY_MS=5000
```

After a successful arrival-date confirmation, the existing arrival quiz
reminder is then sent five seconds later. Leave it at `0` in normal operation
to use the scheduled onboarding worker instead. The server claims the reminder
in the database before sending so duplicate timers do not send duplicate
messages.
