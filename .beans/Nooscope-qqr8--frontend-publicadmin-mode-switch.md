---
# Nooscope-qqr8
title: 'Frontend: Public/Admin Mode Switch'
status: todo
type: feature
priority: high
created_at: 2026-03-31T09:18:38Z
updated_at: 2026-03-31T09:18:38Z
parent: Nooscope-kyyw
---

Implement two-mode rendering in Nooscope's frontend. On load, check sessionStorage for a raven token to determine mode.

**Public mode** (no token): connect to `/ws/telemetry/public`, render anonymous graph — nodes as scope-colored dots, edges by weight, no labels, no content, no scion names.

**Admin mode** (token present): connect to `/ws/telemetry` with subprotocol auth, render full diagnostic view (current Nooscope behavior).

Admin login dialog: user pastes token → stored in sessionStorage (cleared on tab close, never in URL or config.js).
Logout: clear sessionStorage, reconnect to public stream.

## Checklist
- [ ] Mode detection: check sessionStorage for token on load
- [ ] Public mode: connect to /ws/telemetry/public, anonymous rendering (no content_preview, no event payloads)
- [ ] Admin mode: connect to /ws/telemetry with subprotocol auth, full diagnostic view
- [ ] Admin login dialog: paste token, store in sessionStorage
- [ ] Logout: clear token, reconnect to public stream
- [ ] Visual indicator of current mode (public vs admin)