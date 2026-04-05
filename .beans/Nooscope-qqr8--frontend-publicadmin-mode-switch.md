---
# Nooscope-qqr8
title: 'Frontend: Public/Admin Mode Switch'
status: done
type: feature
priority: high
created_at: 2026-03-31T09:18:38Z
updated_at: 2026-04-05T00:00:00Z
parent: Nooscope-kyyw
---

Implement two-mode rendering in Nooscope's frontend. On load, check sessionStorage for a raven token to determine mode.

## Scope change (2026-04-05)

Both WebSocket streams now carry identical (content-stripped) data. The distinction between modes is **access control**, not detail level.

**Public mode** (no token): connect to `/ws/telemetry/public`. No auth needed. Graph renders identically to admin mode.

**Admin mode** (token present): connect to `/ws/telemetry` with `Sec-WebSocket-Protocol: bearer.<token>` subprotocol auth. Same structural data as public. Value of admin mode:
- Access control: stream is gated behind auth (useful when public endpoint is rate-limited or disabled)
- Future: admin-only REST API actions from the Nooscope UI (node inspection via `GET /node/{id}`, manual edge ops, consolidation triggers)

**BREAKING:** The old Nooscope behavior of displaying `content_preview` text in node inspection panels will no longer work -- the field is always an empty string on both streams. Any UI that renders memory text from the telemetry stream must either be removed or reworked to fetch content on-demand via the REST API (`GET /node/{id}`) using the admin token.

## Checklist
- [x] Mode detection: check sessionStorage for token on load
- [x] Public mode: connect to /ws/telemetry/public, no auth
- [x] Admin mode: connect to /ws/telemetry with subprotocol auth
- [x] Remove or adapt any UI that assumes content_preview contains text
- [ ] Optional: admin node inspector that fetches content via REST API on click (deferred — requires Engram REST endpoint)
- [x] Admin login dialog: paste token, store in sessionStorage
- [x] Logout: clear token, reconnect to public stream
- [x] Visual indicator of current mode (public vs admin)
