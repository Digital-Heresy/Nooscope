---
# Nooscope-hm4c
title: 'Real session-cookie HMAC auth — replace the forgeable nooscope_admin=1 soft gate'
status: done
type: task
created_at: 2026-06-22T00:00:00Z
updated_at: 2026-06-22T00:00:00Z
---

**Implemented in PR #15** (approach 1, njs HMAC). `njs/nooscope-auth.js` verifies
an HMAC-signed `nooscope_admin=<exp>.<hmac>` cookie server-side via `$admin_valid`;
`POST /admin/login` verifies the password against `$admin_hash` and issues the
HttpOnly cookie; all admin gates + the morpheus map key off `$admin_valid`.
config.js ships only `adminConfigured`. Hardened per security + Copilot review:
same-origin CSRF guard, login rate-limit + 4k body cap, 2h TTL, secret-override
charset validation, logout POST-only. Acceptance verified live (forged cookie →
401, tampered sig → 401, real login → 200 → admin access).


The admin gate is cryptographically a no-op. Today's flow (Nooscope-r5kh):

- `config.js` carries `adminHash = SHA-256(password)`.
- `auth.js` verifies the password **client-side** (`sha256Hex(pw) === adminHash`), then sets a
  constant cookie `nooscope_admin=1`.
- nginx gates `/admin/scions/` on `$cookie_nooscope_admin != "1"` → 401, and injects the
  forge-web admin bearer upstream.

Weakness (called out in `auth.js:13-15` and `nginx.conf.template:98`): the cookie value is the
literal `1` and the password check never reaches the server. Anyone who reads the public bundle
can run `document.cookie='nooscope_admin=1'` and pass the gate **without the password**, reaching
all cross-Scion admin data (social graph, container logs, roster). The hash check is cosmetic.
"Closes the drive-by path" but not a real authn boundary — and the Thriden mint / network-facing
deployment is exactly where that matters.

**Goal:** a cookie nginx can *cryptographically verify* without trusting the client, and a
password check that actually happens server-side.

**Candidate approaches (decide before building):**

1. **nginx njs (`ngx_http_js_module`) HMAC verify.** Server holds a secret
   (`NOOSCOPE_SESSION_SECRET`, generated at entrypoint boot). A `/admin/login` location verifies
   the submitted password against `adminHash`, then `Set-Cookie nooscope_admin=<payload>.<hmac>`
   (payload = issued-at/expiry). njs `js_content`/`auth_request` recomputes the HMAC on each admin
   request and rejects mismatch/expiry. Lightest infra — no new service. Open Q: is njs present in
   `nginxinc/nginx-unprivileged:alpine`, or does it need `apk add nginx-module-njs` +
   `load_module`? (Mirrors the gettext/jq add already in the Dockerfile.) Keeps the
   curl-stripped / `cap_drop: ALL` posture.
2. **`auth_request` to a tiny sidecar** that owns login + HMAC issue/verify. Cleaner separation,
   but adds a service to MindHive's compose and a network hop — heavier than the problem warrants.
3. **Accept-as-is + document.** Only defensible if forge-web stays bound to 127.0.0.1 and Nooscope
   never faces a hostile network. The mint plan undercuts that assumption.

Leaning (1). Threat model to hold: an attacker with no password and full read of the static bundle
must not be able to forge a valid cookie. Secret rotation = container restart is acceptable
(session cookies are already tab-scoped, no Max-Age). Pairs with the existing secure-context
SHA-256 fallback (`auth.js:sha256Fallback`) so plain-HTTP LAN ingress still works.

Acceptance: forging `nooscope_admin=<anything>` without the password yields 401; a real login
issues a cookie that verifies; tampering with the payload or letting it expire yields 401.
Follow-up origin: `nginx.conf.template:99`, `auth.js:15` (kyyw note).
