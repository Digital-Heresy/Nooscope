---
# Nooscope-msb7
title: Production Nginx Config
status: todo
type: feature
priority: normal
created_at: 2026-03-31T09:18:54Z
updated_at: 2026-03-31T09:18:54Z
parent: Nooscope-kyyw
---

Harden the nginx config for network-facing deployment. Nooscope is currently served with a minimal nginx:alpine config suitable for localhost only.

## Checklist
- [ ] WebSocket proxy pass for both /ws/telemetry and /ws/telemetry/public
- [ ] Static asset caching headers (JS, CSS, images)
- [ ] Rate limiting on public WebSocket connections
- [ ] CORS configuration for cross-origin access