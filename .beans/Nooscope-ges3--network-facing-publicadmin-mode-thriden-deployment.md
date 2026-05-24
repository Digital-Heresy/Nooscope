---
# Nooscope-ges3
title: Network-facing public/admin mode (Thriden deployment context)
status: todo
type: epic
priority: high
created_at: 2026-05-14T07:41:41Z
updated_at: 2026-05-21T00:00:00Z
parent: Nooscope-lm3k
---

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