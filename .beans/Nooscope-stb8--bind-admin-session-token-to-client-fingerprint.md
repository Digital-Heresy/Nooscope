---
# Nooscope-stb8
title: 'Bind admin session token to a client fingerprint (replay hardening)'
status: done
type: task
created_at: 2026-06-22T00:00:00Z
updated_at: 2026-06-22T00:00:00Z
---

**Implemented.** `njs/nooscope-auth.js` now folds `sha256(User-Agent)` into the token
signature (`tokenSig` used by both login mint + verifyAdmin check); the UA isn't stored
in the cookie. Verified live: cookie issued under one UA replays 200 with the same UA,
401 with a different UA (or curl's default), forged cookie still 401.


Hardening follow-up to Nooscope-hm4c, raised in its security review (MED — token not
bound to anything). The HMAC session token signs only `exp`, so a copied cookie replays
from any client until expiry. The cookie is HttpOnly (no JS theft) and TTL is 2h, but
there's no binding to the issuing client.

**Approach:** fold a coarse client fingerprint into the HMAC message — bind to the
`User-Agent`. Token stays `<exp>.<hmac>` but the signature becomes
`HMAC-SHA256(secret, exp + '|' + sha256(User-Agent))`; the UA is NOT stored in the
cookie, just recomputed on each verify. A cookie replayed from a different client
(curl, a different browser) gets a signature mismatch → 401. Contained entirely to
`njs/nooscope-auth.js` (login mints with binding, verifyAdmin checks it) — no nginx
change (UA is in `r.headersIn`).

**Accepted tradeoff:** a browser update changes the UA and invalidates the session
(re-login). Within the 2h TTL that's rare and acceptable for an operator tool. UA
binding is defense-in-depth (an attacker who captured the cookie via a logged proxy
likely also has the UA) — it meaningfully raises the bar against blind replay without
the UX cost of IP binding (which breaks on mobile/proxy IP changes).

Acceptance: a valid cookie replayed with a different `User-Agent` yields 401; same-UA
requests still pass; normal login/logout unaffected.
