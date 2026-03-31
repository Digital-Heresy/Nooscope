---
# Nooscope-gdgh
title: 'Backend: Tiered WebSocket Streams'
status: todo
type: feature
priority: high
created_at: 2026-03-31T09:18:30Z
updated_at: 2026-03-31T09:24:51Z
parent: Nooscope-kyyw
---

Add a public (unauthenticated) WebSocket endpoint to Engram that serves stripped telemetry — no content, no payloads, just graph structure.

**NOTE: Work happens in the MindHive repo (Engram service), not Nooscope. Tracked on MindHive side as MindHive-d91w Phase 1 — same work, cross-referenced.**

Two endpoints (Option A):
- `GET /ws/telemetry` — existing full stream, requires auth
- `GET /ws/telemetry/public` — new stripped stream, no auth required

Public stream strips:
- Snapshot nodes: id, scope, salience, activation_count, consolidation_level only (no content_preview, no edge detail)
- Events: type + timestamp only (no payload details)
- Connection limit shared between both endpoints (existing max 10)

## Checklist
- [ ] Add GET /ws/telemetry/public endpoint (no auth, stripped data)
- [ ] Public snapshot: nodes have id, scope, salience, activation_count, consolidation_level only
- [ ] Public events: type + timestamp only, no payload details
- [ ] Connection limit shared between both endpoints