---
# Nooscope-ges3
title: Network-facing public/admin mode (Thriden deployment context)
status: todo
type: epic
priority: high
created_at: 2026-05-14T07:41:41Z
updated_at: 2026-05-14T07:41:41Z
parent: Nooscope-lm3k
---

## Scope

Land Nooscope at https://noo.thriden.dev with the public/admin mode distinction working over LAN-reachable TLS. The bulk of the design work for public/admin mode already lives in 'Nooscope-kyyw' ('Public/Admin Mode — Secure Network-Facing Visualizer'); this epic carries the Thriden-specific deployment context that wasn't covered there.

## Relationship to Nooscope-kyyw

kyyw remains the source-of-truth design doc for the public/admin discrimination model itself (which streams carry which content, how auth gates access vs. detail level, the structural-stream-only architecture). This epic claims kyyw's design and adds:

- Thriden subdomain serving (noo.thriden.dev) with TLS termination at Caddy, not in-container
- Admin token handling for ws://*.thriden.dev/ws/telemetry connections to Pi5-resident brains (not localhost like dev)

## Acceptance criteria

- noo.thriden.dev resolves + serves Nooscope's bundle over valid TLS (provided by Caddy's wildcard cert)
- Public mode connects to /ws/telemetry/public on each Scion's forge without auth, shows structural fireworks
- Admin mode authenticates with operator-entered raven token, connects to /ws/telemetry, shows admin-gated structural events

## Sub-tasks broken out

- TLS termination via Caddy (no in-container TLS)
- Admin token handling for *.thriden.dev/ws/telemetry connections

## Cross-system reference

- Nooscope-kyyw (design source — claimed by this epic)
- MindHive-9rg8 (MH DNS & endpoint epic — provides Caddy + wildcard cert)