---
# Nooscope-kyyw
title: Public/Admin Mode — Secure Network-Facing Visualizer
status: done
type: epic
priority: high
created_at: 2026-03-31T09:18:22Z
updated_at: 2026-04-05T00:00:00Z
---

Evolve Nooscope from a localhost-only debug tool into a network-facing visualizer with two modes: a public 'fireworks' view and an authenticated admin view.

## BREAKING CHANGE: Content-Blind Telemetry (MindHive decision, 2026-04-05)

MindHive now strips `content_preview` from ALL telemetry WebSocket streams -- both authenticated (`/ws/telemetry`) and public (`/ws/telemetry/public`). This is a deliberate security decision: **Nooscope is always the MRI, never the biopsy.**

**What this means for Nooscope:**
- The admin stream (`/ws/telemetry`) no longer carries memory text. Node inspection panels that display `content_preview` will now show empty strings. This is intentional, not a bug.
- There is no "full diagnostic view" via WebSocket anymore. If admin users need to read memory content, they must use the REST API (`GET /node/{id}`) directly -- Nooscope cannot surface it through the telemetry stream.
- The distinction between public and admin modes is now about **access control** (who can see the structural stream at all), not **detail level** (both streams carry identical data).
- Admin mode still has value: it gates access to the stream behind auth, and could in the future offer admin-only features (manual edge creation, consolidation controls, etc.) via REST API calls from the Nooscope UI.

**What changed in Engram (MindHive repo):**
- `GET /ws/telemetry/public` -- new endpoint, no auth, content-stripped
- `GET /ws/telemetry` -- existing endpoint, auth required, NOW ALSO content-stripped
- Both endpoints share a connection limit (max 10) and use the same `handle_socket` handler internally
- `TelemetryEvent::strip_content()` redacts `content_preview` from snapshots and `node_created` events; all structural data (edges, weights, origins, scopes, salience, consolidation levels, event payloads) passes through unmodified
- MindHive-d91w (Phase 1) is now completed

## Remaining Nooscope work

- **Nooscope-gdgh** -- Backend tiered streams: COMPLETED by MindHive. Update Nooscope connection logic to use the new endpoints.
- **Nooscope-qqr8** -- Frontend mode switch: Simplify scope -- both modes show the same data, admin mode just requires auth to connect. Remove any UI that assumes admin can see memory text.
- **Nooscope-1sz9** -- Token cleanup: Remove raven tokens from config.js / docker-entrypoint.sh / git history.
- **Nooscope-msb7** -- Production nginx config: WebSocket proxy for both endpoints.
