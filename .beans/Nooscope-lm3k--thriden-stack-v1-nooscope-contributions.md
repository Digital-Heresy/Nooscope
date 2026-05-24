---
# Nooscope-lm3k
title: Thriden Stack v1 — Nooscope contributions
status: todo
type: milestone
priority: high
created_at: 2026-05-14T07:41:23Z
updated_at: 2026-05-21T00:00:00Z
---

## Scope (Nooscope side)

Nooscope's contributions to the Thriden Stack v1 deployment milestone. The master milestone lives in MindHive as 'MindHive-h9fz' — see that bean for overall goal, architecture decisions, and cross-system context.

## Acceptance criteria (NS-specific)

- Nooscope image publishes to private GHCR with multi-arch (amd64+arm64) manifests via tagged-release workflow
- Nooscope deployed at https://noo.thriden.dev with valid wildcard TLS, public/admin mode discrimination working
- Scion config (the served config.js) is dynamically populated from a source of truth, not baked at image build
- DM Cairn appears in Nooscope's Scion selector automatically once provisioned on the stack

## Cross-repo

Reference: MindHive-h9fz (master milestone). PersonaForge's parallel milestone is in ../PersonaForge/.beans (PersonaForge-ucxr).

## Relationship to existing Nooscope work

The 'Network-facing public/admin mode' epic ([[Nooscope-ges3]]) in this milestone is the active deployment context for the public/admin posture established in [[Nooscope-kyyw]] (content-blind streams, structural-only data) and the auth mechanism shipped in [[Nooscope-r5kh]] (Nooscope-level admin password → server-side nginx envsubst of per-Scion bearer headers; browser never holds upstream credentials).

Both kyyw and r5kh remain source-of-truth design docs. The ges3 epic carries Thriden-specific deployment context: TLS via Caddy at *.thriden.dev, wiring SOPS-decrypted upstream tokens into the Pi5 docker-compose so nginx envsubst has values to inject on outbound requests to Pi5-resident brains.

## Out of scope (parked)

- Mobile-friendly view, embedded thumbnail mode, etc. — separate enhancement milestone