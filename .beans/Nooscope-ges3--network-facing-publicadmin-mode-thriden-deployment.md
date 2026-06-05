---
# Nooscope-ges3
title: Network-facing public/admin mode (Thriden deployment context)
status: done
type: epic
priority: high
created_at: 2026-05-14T07:41:41Z
updated_at: 2026-06-05T01:00:18Z
parent: Nooscope-lm3k
---

## Closure (2026-06-04)

Both sub-tasks shipped:

- [[Nooscope-03z5]] — TLS termination via Caddy on `noo.thriden.dev` (closed 2026-05-30).
- [[Nooscope-e5nv]] — SOPS-decrypted env wiring (closed 2026-06-04). Audit showed the wiring was already in place via `MindHive/bin/thriden-deploy-payload.sh`'s `sops exec-env` wrapper + compose env-map inheritance; only the admin-tier secrets (`NOOSCOPE_ADMIN_PASSWORD`, `FORGE_WEB_ADMIN_TOKEN`) are needed on smoke-test, and they're in `stack.enc.env`.

**Substrate-side criterion satisfied** — `noo.thriden.dev` serves the Nooscope bundle over valid TLS through Caddy, with the env-var pipeline ready to inject upstream tokens whenever Scions exist.

**Scion-dependent criteria roll to post-v1.** The remaining acceptance items (public-mode connect to each Scion's `/ws/telemetry/public`, admin-mode bearer-token injection on outbound proxy requests, Pi5-vs-localhost parity) are inherently gated on Scions existing on the Pi5. The smoke-test Pi5 runs zero Scions by design (`project_thriden_smoke_test_scope`); the [[project_thriden_smoke_test_scope]] / per-Scion token generation lives with the Helix/Speaker-to-Thriden migration tracked under [[MindHive-h9fz]]. The Nooscope-side mechanics — per-Scion env-var slots in compose, nginx envsubst + bearer-header injection — are all in place from [[Nooscope-r5kh]] and the de9m dynamic registry; the migration bean only needs to populate `RAVEN_TOKEN_*` / `MORPHEUS_TOKEN_*` in SOPS and watch the existing pipeline carry them through.

The pre-flight thvl fix ([[Nooscope-thvl]], closed 2026-06-04) removed the last container-side blocker on a Scion-less Pi5: PF's first-run-gate 503 + `setup_required` sentinel is now tolerated as an empty roster instead of restart-looping.

---

## Original Bean Body (preserved for history)

## Scope

Land Nooscope at https://noo.thriden.dev with the public/admin mode distinction working over LAN-reachable TLS. The design work for the public/admin posture lives in [[Nooscope-kyyw]]; the auth mechanism that gates it lives in [[Nooscope-r5kh]] (shipped 2026-05-15). This epic carries the Thriden-specific deployment context that wasn't covered there.

## Relationship to kyyw + r5kh

- **kyyw** — source-of-truth for the *posture*: content-blind structural streams, public + admin variants of `/ws/telemetry`, Nooscope-as-MRI-never-biopsy.
- **r5kh** — source-of-truth for the *auth mechanism*: Nooscope-level admin password (SHA-256 hash in config.js), per-Scion upstream tokens (`RAVEN_TOKEN_*`, `MORPHEUS_TOKEN_*`, `FORGE_WEB_ADMIN_TOKEN`) injected server-side by nginx envsubst + bearer-header injection. Browser never touches upstream credentials.

This epic adds, on top of those two:

- Thriden subdomain serving (noo.thriden.dev) with TLS termination at Caddy, not in-container ([[Nooscope-03z5]]).
- Wiring SOPS-decrypted upstream tokens into the Pi5 docker-compose so nginx's envsubst has values to inject when talking to *.thriden.dev brains (new sub-bean [[Nooscope-e5nv]] — replaces the now-superseded `Nooscope-o83r`, which was written against the pre-r5kh "operator pastes raven token in browser" model).

## Acceptance criteria

- `noo.thriden.dev` resolves + serves Nooscope's bundle over valid TLS (provided by Caddy's wildcard cert).
- Public mode connects to `/ws/telemetry/public` on each Scion's forge without auth, shows structural fireworks.
- Admin mode: operator enters the Nooscope-level admin password (per r5kh); successful login flips the session into admin mode and reconnects to `/ws/telemetry`. nginx attaches per-Scion `Sec-WebSocket-Protocol: bearer.$RAVEN_TOKEN_{SCION}` (and analogous `Authorization: Bearer ...` for morpheus + forge-web) on outbound proxy requests using values from the Pi5 host env. Browser session carries no upstream tokens.
- The same admin posture works against Pi5-resident brains as it does against localhost dev brains: same UI flow, same config.js shape, only the upstream URLs differ.

## Sub-tasks broken out

- TLS termination via Caddy ([[Nooscope-03z5]])
- Wire SOPS-decrypted upstream tokens into Pi5 docker-compose ([[Nooscope-e5nv]])

## Cross-system reference

- [[Nooscope-kyyw]] (public/admin posture — design source)
- [[Nooscope-r5kh]] (admin auth mechanism — shipped, design source)
- MindHive-9rg8 (MH DNS & endpoint epic — provides Caddy + wildcard cert)
- MindHive-n1kd (SOPS+age secret infrastructure — produces the decrypted env that e5nv consumes)