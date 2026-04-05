---
# Nooscope-4xpf
title: 'Session Ambient State'
status: todo
type: feature
priority: normal
created_at: 2026-04-05T00:00:00Z
updated_at: 2026-04-05T00:00:00Z
parent: Nooscope-mbfj
---

Replace text-only session banners with a subtle 3D ambient glow that persists while a session is active — making the brain look "awake."

## Current state

`handleSessionCreated()` in app.js sets a text banner. `handleSessionExpired()` hides it after 5s. No 3D visual effect.

## What to build

- **Active session state**: `activeSession` variable in app.js (currently no persistent state)
- **Ambient mesh**: large translucent sphere or torus at scene center, additive blending, slow opacity pulsing in `_animate()`
- **Chat type variation**: different ambient color/intensity per `chat_type`
- **Fade out**: 3-5s fade on `session_expired`
- Text banner can remain as secondary indicator

## Checklist

- [ ] Add `activeSession` state variable in app.js
- [ ] New `setAmbientState(active, chatType)` method in MemoryGraph
- [ ] Create ambient mesh (additive blending, depthWrite: false)
- [ ] Pulse opacity in `_animate()` when active
- [ ] Fade out over 3-5s on session expiry
- [ ] Wire to `handleSessionCreated()` and `handleSessionExpired()`

## Dependencies

None — fully independent.
