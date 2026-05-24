---
# Nooscope-o83r
title: Admin token handling for *.thriden.dev/ws/telemetry
status: abandoned
type: task
created_at: 2026-05-14T07:42:01Z
updated_at: 2026-05-21T00:00:00Z
parent: Nooscope-ges3
---

## Superseded by [[Nooscope-e5nv]] (2026-05-21)

This bean was written against the pre-r5kh model where the operator pasted a per-Scion raven token into the browser at login and Nooscope attached `Authorization: Bearer ...` from JavaScript. That entire model died with [[Nooscope-r5kh]] (shipped 2026-05-15):

- Browser no longer holds upstream tokens — `js/config.js` carries only the admin-password SHA-256 hash, not raven/morpheus/forge-web tokens.
- The admin login modal now authenticates against the Nooscope-level password, not a per-Scion token.
- Per-Scion tokens live in env vars on the Nooscope host and are injected by nginx during outbound proxy via envsubst + bearer header injection.

The remaining Thriden deployment task is no longer "update the admin-mode UI to handle raven tokens" — the UI is already correct. It's "make sure the Pi5 docker-compose has the right env vars populated from SOPS-decrypted secrets so nginx envsubst has values to inject." That work is filed as [[Nooscope-e5nv]].

## Original (pre-r5kh) text

Engineering. In dev, Nooscope's admin mode prompts for a raven token entered manually and connects to ws://localhost:<port>/ws/telemetry. For Thriden deploy, connections target wss://<scion>.thriden.dev/ws/telemetry on the Pi5-resident brains. Update the admin-mode UI to: (1) prompt for the raven token (no token storage in served bundle); (2) construct wss:// URLs using the served config's Scion list; (3) attach Authorization header on WS handshake. Document the operator workflow: 'pull raven token from 1Password, paste into admin login, choose Scion'. Acceptance: admin mode shows admin-gated telemetry events from each Scion.