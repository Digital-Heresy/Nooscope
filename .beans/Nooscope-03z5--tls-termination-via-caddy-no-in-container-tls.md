---
# Nooscope-03z5
title: TLS termination via Caddy (no in-container TLS)
status: done
type: task
created_at: 2026-05-14T07:41:57Z
updated_at: 2026-05-23T00:00:00Z
parent: Nooscope-ges3
---

## Resolution (2026-05-21)

Design landed at [`docs/tls-and-caddy.md`](../docs/tls-and-caddy.md).

Key findings from the audit:

- **Image side is already correct.** Post-r5kh `nginx.conf.template`
  listens plain HTTP on `:8080` with no `ssl`, no HSTS, no
  `upgrade-insecure-requests`. No image change is needed for TLS
  termination to work.
- **Caddy is dumb-proxy.** A single `reverse_proxy nooscope:8080`
  covers WS + REST + static; Caddy v2 auto-handles `Upgrade` /
  `Connection` headers. Only non-defaults are `flush_interval -1`
  (stream telemetry events through, don't buffer) and `read_timeout
  24h` / `write_timeout 24h` on the transport block (match nginx's
  `proxy_read_timeout 86400` for long-lived WS).
- **Port correction vs the original bean body.** The unprivileged
  nginx image listens on `:8080`, not `:80`. The doc reflects this.
- **Two small alongside-deploy touches** (called out in the doc, not
  blockers for this bean closure, intended to bundle into the e5nv
  PR):
  - ✅ Add a runtime-conditional `Secure` attribute to the admin
    cookie in `js/auth.js` so it carries `Secure` over HTTPS but
    stays set-able on localhost dev (plain HTTP). **Landed
    2026-05-23** via `cookieSecureAttr()` helper applied to both the
    login set and the logout clear in `js/auth.js`.
  - Bind the Pi5 nooscope compose service to loopback / docker
    network only — Caddy is the public ingress, accidentally
    publishing `:8080` on the LAN bypasses TLS + HSTS + access logs.
    **MindHive-side** — folded into the [[Nooscope-e5nv]] handoff
    since `compose.prod.yml` lives there.

## Acceptance criteria met

- [x] nginx in the Nooscope image listens on plain HTTP, no internal TLS.
- [x] No `Strict-Transport-Security` or TLS-only headers conflict with
      Caddy's HSTS policy.
- [x] Caddy snippet for `noo.thriden.dev` documented, including WS
      flush + timeout handling and the route surface to forward.
- [x] Acceptance tests documented (curl static, websocat public WS,
      admin WS 401-without-cookie, admin login cookie carries `Secure`).

## Routes Caddy must handle

Per the post-r5kh routing surface (`nginx.conf.template`), Caddy's reverse_proxy needs to cover:

- **WebSocket upgrade required:**
  - `/{scion}/ws/telemetry` (admin structural stream, e.g. `/speaker/ws/telemetry`)
  - `/{scion}/ws/telemetry/public` (public structural stream)
  - `/{scion}/ws/pf/telemetry` (admin PF behavioral stream)
  - `/{scion}/ws/pf/telemetry/public` (public PF behavioral stream)
- **Plain HTTPS proxy:**
  - `/{scion}/morpheus/*` (dream REST, admin-gated)
  - `/admin/scions/*` (cross-Scion forge-web routes, e.g. social-graph)
  - `/` and `/js/*`, `/css/*` (static bundle)

All of these terminate inside the Nooscope nginx, which handles upstream routing + token injection. Caddy is dumb-proxy from its perspective; it only needs to forward Host + upgrade headers correctly.