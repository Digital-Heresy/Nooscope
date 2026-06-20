---
# Nooscope-dyez
title: CRLF in nginx.conf.template silently no-ops the per-Scion route splice
status: completed
type: bug
created_at: 2026-06-20T03:42:42Z
updated_at: 2026-06-20T03:49:00Z
---

docker-entrypoint.sh splices per-Scion {{SCION_MAPS}}/{{SCION_BLOCKS}} into the nginx config via an awk EXACT-line match ($0 == "# {{SCION_MAPS}}"). When nginx.conf.template is checked out / built with CRLF endings the marker line is '...}}\r', the match fails, the splice no-ops, and every per-Scion /<slug>/morpheus/* and /ws/telemetry route is absent -> falls through to the SPA fallback -> dreams.js/logs.js get '<!DOCTYPE' / 'Unexpected token <' instead of JSON. The committed blob is LF but the Windows working tree is CRLF, so a local docker build bakes CRLF into the image. Fix: (1) .gitattributes forces nginx.conf.template/*.template/*.conf to eol=lf; (2) harden the entrypoint awk with { sub(/\r$/, "") } so the splice is immune to CRLF regardless. Found live on the local Helix/Speaker nooscope; live-patched (tr -d '\r' + re-render + reload) to unblock viewing Helix's dream.