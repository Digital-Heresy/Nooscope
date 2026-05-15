---
# Nooscope-03z5
title: TLS termination via Caddy (no in-container TLS)
status: todo
type: task
created_at: 2026-05-14T07:41:57Z
updated_at: 2026-05-14T07:41:57Z
parent: Nooscope-ges3
---

Configuration. Nooscope's container serves plain HTTP internally; Caddy on the Pi5 terminates TLS at noo.thriden.dev using the wildcard cert. Ensure: (1) nginx.conf or equivalent in the Nooscope image listens on plain HTTP, no internal TLS; (2) no Strict-Transport-Security or other TLS-only assumptions in served headers that would conflict with HTTPS-only upstream contract from Caddy; (3) Caddy snippet for noo.thriden.dev reverse_proxies to nooscope:80 with appropriate websocket upgrade rules (for the telemetry stream). Acceptance: curl -k https://noo.thriden.dev/ + ws connection succeeds.