---
# Nooscope-gdgh
title: 'Backend: Tiered WebSocket Streams'
status: completed
type: feature
priority: high
created_at: 2026-03-31T09:18:30Z
updated_at: 2026-04-05T00:00:00Z
parent: Nooscope-kyyw
---

**COMPLETED in MindHive repo (2026-04-05).** See MindHive-d91w for full details.

Engram now exposes two WebSocket telemetry endpoints:
- `GET /ws/telemetry` -- auth required, content-stripped
- `GET /ws/telemetry/public` -- no auth, content-stripped

**Important:** Both streams are content-blind. The original plan had the authenticated stream carrying full `content_preview` -- that is no longer the case. Both streams strip memory text. Auth gates access to the stream, not the detail level.

Structural data that IS available on both streams:
- Snapshot nodes: id, scope, salience, activation_count, consolidation_level, full edge list (target_id, weight, origin)
- node_activated: node_id, activation_count, salience
- edge_created / edge_reinforced: source_id, target_id, weight, delta, origin
- node_created: node_id, scope, salience (content_preview is empty string)
- decay/nap/sleep events: full structural stats
- Shared connection limit: max 10 across both endpoints

Nooscope needs to update its connection logic to use `/ws/telemetry/public` for unauthenticated access.
