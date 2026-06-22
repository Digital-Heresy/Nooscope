---
# Nooscope-8wvs
title: 'SPA fallback caches as the API response it shadows — add Cache-Control: no-store'
status: done
type: bug
created_at: 2026-06-20T04:02:36Z
updated_at: 2026-06-22T00:00:00Z
---

**Closed by PR #14 (commit `0f31cdd`).** `nginx.conf.template` `location /` now carries
`add_header Cache-Control "no-store" always;` (with the explanatory comment), so a transient
mis-routed `/<slug>/...` fallback can no longer poison the browser cache. Static assets keep
their own caching via the regex `location` above. Verified present 2026-06-22.


Follow-up to Nooscope-dyez. The nginx SPA fallback (location /) serves index.html with Last-Modified+ETag but no Cache-Control. When a per-Scion API route is transiently missing (deploy race, or the CRLF marker-splice bug), a request like /<slug>/morpheus/dreams falls through to the fallback and returns 200 + index.html. The browser heuristically caches that HTML and then replays it for the fetch() that expects JSON — surfacing as 'Unexpected token <, <!DOCTYPE' long AFTER the server is fixed, with no request reaching nginx (served from browser cache). Observed live: after fixing the CRLF splice (dyez) the local dreams page still threw <!DOCTYPE because the browser was replaying cached fallback HTML. Fix: add_header Cache-Control 'no-store' always; on location / so a stale mis-route can never poison the cache. Static assets keep their caching via the regex location. Matters before the Thriden mint where deploy races are likely.