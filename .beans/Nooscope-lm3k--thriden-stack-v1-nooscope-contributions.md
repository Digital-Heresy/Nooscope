---
# Nooscope-lm3k
title: Thriden Stack v1 — Nooscope contributions
status: todo
type: milestone
priority: high
created_at: 2026-05-14T07:41:23Z
updated_at: 2026-05-14T07:41:23Z
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

The 'Network-facing public/admin mode' epic in this milestone is the active impl context for the existing 'Nooscope-kyyw' bean ('Public/Admin Mode — Secure Network-Facing Visualizer'). kyyw stays where it is as the source-of-truth design doc; the new epic carries Thriden-specific deployment context (TLS via Caddy, *.thriden.dev subdomain, admin token handling against Pi5-resident brains).

## Out of scope (parked)

- Mobile-friendly view, embedded thumbnail mode, etc. — separate enhancement milestone