---
# Nooscope-de9m
title: Update docker-entrypoint.sh to consume dynamic Scion source
status: done
type: task
created_at: 2026-05-14T07:42:08Z
updated_at: 2026-05-22T00:00:00Z
parent: Nooscope-rxnd
---

## Resolution (2026-05-22)

Shipped after [[PersonaForge-slg9]] unblocked the slug field.

**Backend rendering pipeline.** `docker-entrypoint.sh` is now a template
renderer. The static `nginx.conf.template` carries the http/server
skeleton plus two markers — `# {{SCION_MAPS}}` at http level and
`    # {{SCION_BLOCKS}}` inside the server block. The entrypoint:

1. **Discovers the roster.** Prod mode (`NOOSCOPE_HOST` set) fetches
   `http://forge-web:8200/scions` with `Accept: application/json` via
   BusyBox `wget` (added `jq` to the runtime image; `curl` stays out
   per the f624b74 CVE clearance). 5-attempt retry with 2s backoff;
   container start fails closed if forge-web is unreachable (no
   fallback list — embedding one would lie about the fleet). Dev mode
   uses a hardcoded `[speaker, helix]` TSV that preserves the prior
   per-port `config.js` shape so dev workflows don't change.
2. **Projects to TSV** (slug, name, badge, scion_id), filtering to
   `engram_bound: true`. Offline-but-awakened Scions stay in the
   selector with a status suffix; only brain-less Scions drop out.
3. **Loop-renders per-Scion fragments** by sed-substituting three slug
   forms into embedded heredoc templates:
   - `__SLUG__` — raw, for URL paths + docker hostnames (`/dm-cairn/`,
     `engram-dm-cairn:3030`)
   - `__SLUG_VAR__` — hyphens→underscores, for nginx variable names
     (`$engram_dm_cairn`; nginx forbids `-` in identifiers)
   - `__SLUG_UPPER__` — uppercase + underscores, for env-var suffixes
     (`${RAVEN_TOKEN_DM_CAIRN}`)
   The envsubst allow-list grows in the same loop.
4. **Emits `config.js`** with per-Scion `{ host, pfPrefix, name, badge,
   scionId }` in prod mode (or `{ thriden, pf, name, badge, scionId }`
   in dev). `name` is JS-escaped against single quotes.
5. **Emits `/healthz.txt`** with the loaded roster, served by a new
   `location = /healthz` route. `curl http://nooscope.host/healthz`
   is the operator's "registry populated" check.
6. **awk-splices fragments** into the template (exact-line marker match
   so prose mentions of `{{SCION_MAPS}}` in the template header comment
   don't trigger), then **envsubst** with the dynamic allow-list.

**Frontend.** `js/app.js` and `js/dreams.js` selector population now
reads `cfg.name` (PF display name) and `cfg.badge` from config.js. Live
states (`live-online` / `live-sleeping`) render clean; anything else
appends a status suffix (`— Offline` for `live-offline`, `— {badge}`
otherwise). Native `<option>` styling is unreliable cross-browser, so
badge state is text-only; richer visuals would need a custom dropdown
and were not in scope.

**social.js cleanup.** `ADMIN_SCIONS` is derived from
`Object.entries(NOOSCOPE_CONFIG.scions)` instead of being hardcoded —
no more `dh-` strip hack on line 339, no more `[dh-speaker, dh-helix]`
literal. `cfg.scionId` carries PF's canonical `scion_id` so the
existing `/admin/scions/${scionId}/...` fetches keep working without
URL-shape changes on the PF side. `openPfStream` now looks up the slug
from the same source rather than stripping `dh-`.

**Knowledge file:** `.claude/knowledge/networking.md` updated with the
"per-Scion routes are rendered, not hardcoded" section so a future
session reading that file finds the dynamic-rendering shape instead of
chasing a phantom static template.

## Acceptance

- [x] Prod mode fetches the live `/scions` roster on every container
      start; missing forge-web fails container start with a clear log.
- [x] Slugs with hyphens (DM Cairn → `dm-cairn`) produce valid nginx
      configs — variable names use underscores, paths use the raw
      slug, env vars use the uppercase + underscore form.
- [x] Selector renders badge state as a text suffix on all three pages
      (index, dreams, social).
- [x] `/healthz` reports the loaded roster.
- [x] Dev mode (`NOOSCOPE_HOST` unset) behavior unchanged — same two
      Scions, same `{ thriden, pf }` shape, plus the new `name` /
      `badge` / `scionId` fields that the frontend treats as optional.

## Original brief

Engineering, depends on the source-of-truth decision task. Refactor docker-entrypoint.sh's config.js generation: replace the hard-coded Scion list with logic that reads from the chosen source on container start. Preserve the existing field shape (ports + names) so the frontend doesn't change. Add a /healthz endpoint that reports the loaded Scion count so the operator can verify the registry was populated. Acceptance: re-running 'docker compose up -d nooscope' after a new Scion lands picks up the new entry in config.js without rebuilding the image.

## Source-of-truth decision (post-pxfn)

[Nooscope-pxfn](Nooscope-pxfn--decide-source-of-truth-for-scion-config-registry.md)
closed 2026-05-21: source is **PF admin web's JSON `/scions` endpoint**
on `forge-web:8200` (per [PersonaForge-n3kx](../../PersonaForge/.beans/PersonaForge-n3kx--admin-web-json-variant-of-scions-list-for-program.md)).
Full design rationale: [`docs/scion-registry-source.md`](../docs/scion-registry-source.md).

**Blocking dependency:** [PersonaForge-slg9](../../PersonaForge/.beans/PersonaForge-slg9--add-scion-slug-field-to-scion-model-and-expose-in-jso.md)
adds the `scion_slug` field to PF's Scion model and JSON response. Do
not ship de9m before slg9 lands — relying on `${scion_id#dh-}` would
bake a Digital-Heresy-only assumption into the entrypoint. Per the
MH-h9fz execution DAG, de9m is late in the sequence and slg9 runs in
parallel; they should naturally align.

**Key implementation points** (full detail in the decision doc):

- Fetch all Scions where `engram_bound: true` (not just `live-*`).
  Offline-but-awakened Scions still appear in the selector, just
  visually marked.
- Pass the `badge` field through to `config.js` → frontend renders
  offline Scions dark-grey with a status suffix.
- No baked-in fallback list. If forge-web is unreachable after retries,
  fail container start with a clear log message. Compose
  restart-on-failure handles recovery.
- Token allow-list for nginx envsubst expands dynamically based on
  discovered slugs (uppercase the slug, append `RAVEN_TOKEN_{SLUG}`
  and `MORPHEUS_TOKEN_{SLUG}` to the envsubst arglist).

## Post-r5kh context

docker-entrypoint.sh has evolved since this bean was filed. It now does three things at container start (see header comment in the file):

1. SHA-256 `NOOSCOPE_ADMIN_PASSWORD` and write the hex digest into `config.js` as `adminHash`.
2. Generate the `scions:` block in `config.js` from env (currently hard-coded speaker+helix shapes, with separate dev-mode and prod-mode branches keyed on `NOOSCOPE_HOST`).
3. Run `envsubst` on `nginx.conf.template` with an explicit allow-list of upstream-token vars (`RAVEN_TOKEN_*`, `MORPHEUS_TOKEN_*`, `FORGE_WEB_ADMIN_TOKEN`).

This bean's change slots into step 2. Constraints:

- **Don't break steps 1 and 3.** The dynamic Scion list still has to merge with `adminHash` in the same `config.js` write, and the envsubst step's token allow-list may need to expand if new Scions bring new `RAVEN_TOKEN_{NAME}` / `MORPHEUS_TOKEN_{NAME}` vars. Consider whether the allow-list should be derived from the registry too, or stay an explicit static list.
- **Two branches today.** The prod-mode branch (`NOOSCOPE_HOST` set) writes a different `scions:` shape — `{ host, pfPrefix }` rather than `{ thriden, pf }`. The dynamic source needs to feed both shapes, or the entrypoint logic collapses to one shape and the dev experience changes too. Decide during impl.
- **Token allow-list growth.** Adding DM Cairn means `RAVEN_TOKEN_CAIRN` / `MORPHEUS_TOKEN_CAIRN` should auto-flow into the envsubst step. Either expand the static allow-list per-Scion as part of provisioning, or generate it from the loaded registry.