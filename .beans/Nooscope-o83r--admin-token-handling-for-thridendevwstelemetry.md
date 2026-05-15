---
# Nooscope-o83r
title: Admin token handling for *.thriden.dev/ws/telemetry
status: todo
type: task
created_at: 2026-05-14T07:42:01Z
updated_at: 2026-05-14T07:42:01Z
parent: Nooscope-ges3
---

Engineering. In dev, Nooscope's admin mode prompts for a raven token entered manually and connects to ws://localhost:<port>/ws/telemetry. For Thriden deploy, connections target wss://<scion>.thriden.dev/ws/telemetry on the Pi5-resident brains. Update the admin-mode UI to: (1) prompt for the raven token (no token storage in served bundle); (2) construct wss:// URLs using the served config's Scion list; (3) attach Authorization header on WS handshake. Document the operator workflow: 'pull raven token from 1Password, paste into admin login, choose Scion'. Acceptance: admin mode shows admin-gated telemetry events from each Scion.