---
# Nooscope-rl8v
title: 'config.js is boot-only — roster / soul_managed / badge drift lingers until restart'
status: done
type: task
created_at: 2026-06-22T00:00:00Z
updated_at: 2026-06-22T00:00:00Z
---

**Implemented (approach 1, container-side refresh).** `docker-entrypoint.sh` now
extracts config.js generation into `write_config_js()` and, in prod mode,
backgrounds a `refresh_config_js` loop (default 60s, `NOOSCOPE_CONFIG_REFRESH_SECONDS`,
0 disables). Each tick best-effort re-fetches `/scions`, and — if the roster
slug set still matches boot (membership guard) — atomically rewrites config.js
with fresh field values (soulRepo/badge/name). Membership changes are logged and
left for a restart (per-Scion nginx blocks aren't touched). Stacked on hm4c.


`docker-entrypoint.sh` fetches forge-web `/scions` **once at container start** and bakes the
result (host, pfPrefix, name, badge, scionId, soulRepo) into a static `config.js`. The browser
reads that file. Any operator-side change after boot — a Scion forged/awakened, `soul_managed`
flipped, a badge change — is invisible until the nooscope container restarts.

Surfaced live during the Cairn SOUL-in-Git triage: `dreams.js` showed "SOUL-in-Git isn't set up"
because the baked `soulRepo` was stale relative to the live `/scions`. Same boot-only-staleness
class the SPA-fallback (Nooscope-8wvs) and CRLF-splice (Nooscope-dyez) fixes worried about, and
deploy races get more likely around the Thriden mint.

**Constraint that shapes the fix:** `/scions` is admin-gated at the gateway
(`location /admin/scions/`, requires the admin cookie). A *public* dreams/index viewer therefore
**cannot** re-fetch the roster client-side — so "just read `soulRepo` live from the browser" only
works in admin mode and is a non-starter for public pages. The refresh has to happen
container-side (where the forge-web admin bearer lives) or via a new public read.

**Candidate approaches:**

1. **Container-side refresh loop.** Background a periodic re-run of the roster fetch + `config.js`
   regen in the entrypoint (e.g. `while sleep N; regen_config_js; done &` before `exec nginx`).
   Field-only changes (soulRepo, badge, name) need no nginx reload — just an atomic rewrite of the
   served `config.js`. Roster *membership* changes (new/removed Scion) also need the per-Scion
   nginx blocks regenerated + `nginx -s reload`, which is heavier — scope this bean to the
   field-only refresh first, leave membership to a restart. Works for public + admin. No client
   change.
2. **Live read in admin mode only.** `dreams.js`/`social.js` fetch `/scions` for the fresh
   `soulRepo`/badge when `NooscopeAuth.isAdmin()`. Cheap, but leaves public viewers on baked data —
   only half-closes the gap.
3. **Document + accept.** "Restart nooscope after roster changes." Zero code; the workaround we're
   already using. Fine if (1) is deemed not worth the long-running subprocess in the container.

Leaning (1) scoped to field-only refresh — it's the only option that fixes public pages without a
new endpoint, and the badge half is being corrected PF-side anyway (PersonaForge-cdso), so the
durable win here is `soulRepo` + future field drift. Decide the refresh interval and whether a
long-running background loop is acceptable under the `cap_drop: ALL` posture.

Acceptance: an operator flips `soul_managed` on a live Scion and, within one refresh interval and
with no container restart, that Scion's dreams.html stops/starts showing the SOUL notice
accordingly.
