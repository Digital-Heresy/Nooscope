---
# Nooscope-bmew
title: 'Scion roster empty: /admin/scions/ proxied to /scions/ (307)'
status: completed
type: bug
created_at: 2026-06-19T19:25:46Z
updated_at: 2026-06-19T19:25:46Z
---

Log inspector roster empty after a fresh Thriden deploy. nginx rewrote the bare /admin/scions/ list call to /scions/ (trailing slash); forge-web 307-redirects (FastAPI redirect_slashes) to an internal localhost:8200/scions the browser can't follow -> empty roster. Fixed by a targeted 'rewrite ^/admin/scions/?$ /scions break;' before the generic /admin rewrite. Per-Scion paths unaffected. Surfaced by the bjng DR-drill rebuild.