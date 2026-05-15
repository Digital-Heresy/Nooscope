---
# Nooscope-rxnd
title: Scion config registry sync
status: todo
type: epic
priority: high
created_at: 2026-05-14T07:41:48Z
updated_at: 2026-05-14T07:41:48Z
parent: Nooscope-lm3k
---

## Scope

Nooscope's docker-entrypoint.sh currently writes config.js with a hard-coded list of Scion ports + names. For the Thriden deploy, Scions are provisioned dynamically (DM Cairn lands during validation; future Scions land later). Nooscope needs to learn about new Scions without an image rebuild.

## Source-of-truth options (decision in sub-task)

- (a) HiveMind registry — Nooscope queries fleet-manager's API on startup
- (b) PersonaForge admin API — Nooscope queries PF for the active Scion list
- (c) Compose env — operator updates a docker compose env var; entrypoint reads it
- (d) Filesystem mount — operator drops a JSON file in a watched volume; entrypoint reads it on container start

## Acceptance criteria

- Nooscope's served config.js reflects the current Scion roster without rebuilding the image
- Provisioning DM Cairn (during validation) makes Cairn appear in Nooscope's Scion selector after at most a container restart (live discovery is a stretch goal)

## Sub-tasks broken out

- Decide source of truth (decision bean, gate-locked)
- Update docker-entrypoint.sh to consume the chosen source

## Checklist (routine, post-decision)

- [ ] Add DM Cairn to the chosen source as the validation step

## Cross-system reference

- Nooscope-1sz9 (existing bean: token cleanup in served config.js — adjacent to this work)
- MindHive-y8bp (MH validation: e2e Cairn verification — requires Cairn visible in Nooscope)