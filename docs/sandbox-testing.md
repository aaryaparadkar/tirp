# Sandbox testing (Kapso + local tunnel)

## 1. Configure env

```bash
cp .env.example .env
# edit .env:
# PORT=3000
# DATABASE_URL=postgresql://user:password@localhost:5432/oshc_catalogue
# KAPSO_API_KEY=<kapso sandbox key>
# KAPSO_WEBHOOK_SECRET=<kapso sandbox webhook secret>
# KAPSO_PHONE_NUMBER_ID=<kapso sandbox phone number id>
# MISTRAL_API_KEYS=key1,key2,key3
# MISTRAL_MODEL=mistral-small-latest
# KAPSO_SKIP_SIGNATURE=false  # set true ONLY for local curl testing, never in Kapso
```

Start Postgres locally if needed:

```bash
docker run --name oshc-pg -e POSTGRES_PASSWORD=password -e POSTGRES_USER=user -e POSTGRES_DB=oshc_catalogue -p 5432:5432 -d postgres:16
```

## 2. Migrate + run

```bash
npm ci
npm run migrate
npm run dev
curl http://localhost:3000/health
# {"ok":true,"service":"oshc-whatsapp-catalogue"}
```

## 3. Expose local server

Option A — Cloudflare Tunnel (no account needed for quick tunnels):

```bash
cloudflared tunnel --url http://localhost:3000
# copy the https://<slug>.trycloudflare.com URL
```

Option B — ngrok:

```bash
ngrok http 3000
# copy the https://<id>.ngrok-free.app URL
```

Webhook URL for Kapso sandbox:

```text
https://<tunnel-host>/webhooks/kapso
```

Set this + `KAPSO_WEBHOOK_SECRET` in the Kapso sandbox webhook settings.
Keep `KAPSO_SKIP_SIGNATURE=false` when testing through Kapso.

## 4. Local curl test (no Kapso needed)

```bash
export KAPSO_SKIP_SIGNATURE=true
export KAPSO_PHONE_NUMBER_ID=test-phone-id
# DATABASE_URL must still point at a reachable Postgres
curl -X POST http://localhost:3000/webhooks/kapso \
  -H 'content-type: application/json' \
  -d '{"phone_number_id":"test-phone-id","message":{"id":"msg-1","from":"+61400000000","text":{"body":"Hi"}}}'
```

Expected: greeting menu is sent (Kapso send will fail without a real key — that's
fine; check server logs for pipeline errors, and DB `conversation_messages` row).

## 5. Kapso sandbox checklist

Send from the sandbox tester number, in order:

1. `Hi` → greeting with 9 options (cover, claims, providers, pharmacy, visa/waiting, rewards, updates, forms, urgent).
2. `2` → claims pathways (online member services, claim form, mail, in-store).
3. `What does Essentials cover vs Comprehensive?` → grounded answer, Essentials vs Comprehensive distinguished, sources listed.
4. `How do I claim a GP visit?` → routes to 13-oshc-online-claims + general claims.
5. `How do I get reimbursed?` → reimbursement path, bank account note.
6. `Where can I find a direct billing clinic?` → provider links.
7. `Are prescription medicines covered?` → $30 contribution + annual limits, Essentials vs Comprehensive.
8. `What is the waiting period?` → waiting period explainer.
9. `Does OSHC satisfy my student visa?` → subclass 500 answer.
10. `Where are student rewards?` → official Live Better URL only, no invented offers.
11. `What are the latest updates?` → official sources only, no invented news.
12. `I had a serious accident` → STAY CALM + Call 000 immediately, NO Mistral call.
13. `I cannot breathe` → same emergency path.
14. `I have a mild cold` → NOT emergency; GP/pharmacy guidance.
15. `Will my claim be approved?` → refusal to predict + support route.
16. Unrelated question (e.g. `Who won the football?`) → out-of-scope + MENU redirect.
17. With `MISTRAL_API_KEYS` unset → deterministic fallbacks still answer menu/claims/rewards.
18. Duplicate delivery (same `message.id` twice) → second returns `{ok:true}` with no duplicate reply.

Emergency acceptance: reply says “Stay calm”, shows `000`, and the Call button
(`sendInteractiveCallPermission` → `tel:000` fallback) renders. If WhatsApp/Kapso
blocks `000` as a call target, the `tel:000` text fallback still satisfies the
requirement — record which behavior the sandbox shows.

## 6. Multilingual checklist (en / zh-CN / es)

Run `npm run migrate` first so `contacts.preferred_language` and
`conversation_messages.language` exist. Use three separate sandbox sender numbers,
one per language, so language locking can be verified independently.

- `Hi` → English greeting, 9 options.
- `Hola` → Spanish greeting (`Hola, soy el asistente...`), 9 Spanish options.
- `你好` → Mandarin greeting, 9 Chinese options.
- From the Spanish number, send `¿Cómo hago un reclamo?` → Spanish claims answer.
  Then send `How do I claim?` from the same number → answer must still be Spanish
  (language is locked, not re-detected).
- From the Mandarin number, send `处方药可以报销吗？` → Chinese pharmacy answer.
- `我出事故了` → Mandarin emergency (`请保持冷静`, contains `000`, no LLM call).
- `Tuve un accidente grave` → Spanish emergency (`Mantén la calma`, contains `000`).
- `我有点感冒怎么办？` → NOT emergency; Chinese GP/pharmacy guidance.
- With `MISTRAL_API_KEYS` unset, Mandarin/Spanish questions must get a localized
  limitation response with official links — never raw English KB excerpts.
- Check DB: `contacts.preferred_language` is `en` / `es` / `zh-CN` per sender, and
  every `conversation_messages` row carries the same `language`.

## 7. Logs to watch

- `conversation save failed` → DB issue (replies still send).
- `Mistral HTTP 429/401` → key rotation working; check that next key succeeds.
- `all_keys_failed` → all Mistral keys exhausted; bot falls back to extractive/static answers.
- Duplicate `message:id` → deduped via `webhook_events.event_key`.
