---
# Nooscope-rxnd
title: Scion config registry sync
status: done
type: epic
priority: high
created_at: 2026-05-14T07:41:48Z
updated_at: 2026-05-22T00:00:00Z
parent: Nooscope-lm3k
---

## Resolution (2026-05-22)

Epic closes with both sub-tasks landed:

- [[Nooscope-pxfn]] (decision) — closed 2026-05-21 picking PF admin
  web's JSON `/scions` endpoint. See `docs/scion-registry-source.md`.
- [[Nooscope-de9m]] (implementation) — closed 2026-05-22 after
  [[PersonaForge-slg9]] unblocked the slug field. Full rendering
  pipeline detail lives in de9m's resolution; high-level: the
  entrypoint now renders nginx config + `config.js` from a live
  `/scions` fetch (prod) or a static `[speaker, helix]` list (dev).

Bundled scope: small follow-ups absorbed in the same commit per
operator direction —

- `js/social.js`'s `ADMIN_SCIONS` is now derived from `config.js` and
  no longer strips `dh-` to bridge to nginx routes; the slug field
  from PF flows through end-to-end.
- A `/healthz` route reports the loaded Scion roster as a text body
  so the operator can `curl` to verify the registry was populated.

DM Cairn provisioning (the milestone validation point) now lands in
Nooscope automatically: forging Cairn on PF causes it to appear in
`/scions`, the next Nooscope container restart picks it up, and the
selector / nginx routes / envsubst allow-list all expand to include
it without any Nooscope-side change.

**Live discovery** (poll mid-run, hot-reload `config.js`) was filed in
this bean as a stretch goal and stays out of scope — v1 ships with
"container restart picks up new Scions" which is good enough for the
Thriden Stack v1 validation timeline.

## Scope

Nooscope's docker-entrypoint.sh currently writes config.js with a hard-coded list of Scion ports + names. For the Thriden deploy, Scions are provisioned dynamically (DM Cairn lands during validation; future Scions land later). Nooscope needs to learn about new Scions without an image rebuild.

## Source-of-truth options (decision in sub-task)

- (a) HiveMind registry — Nooscope queries fleet-manager's API on startup
- (b) PersonaForge admin API — Nooscope queries PF for the active Scion list
- (c) Compose env — operator updates a docker compose env var; entrypoint reads it
- (d) Filesystem mount — operator drops a JSON file in a watched volume; entrypoint reads it on container start

## Acceptance criteria

- Nooscope's served config.js reflects the current Scion roster without rebuilding the image
- Provisioning DM Cairn (during validation) makes Cairn appear in Nooscope's Scion selector after at most a container restart (live discovery is a stretch goal)

## Sub-tasks broken out

- Decide source of truth (decision bean, gate-locked)
- Update docker-entrypoint.sh to consume the chosen source

## Checklist (routine, post-decision)

- [ ] Add DM Cairn to the chosen source as the validation step

## Source-of-truth decision (post-pxfn)

[[Nooscope-pxfn]] closed 2026-05-21 picking **(b) PF admin web JSON `/scions`**. Full rationale in [`docs/scion-registry-source.md`](../docs/scion-registry-source.md). [[Nooscope-de9m]] now blocks on [[PersonaForge-slg9]] (adds `scion_slug` to PF Scion model + JSON response).

## Cross-system reference

- Nooscope-1sz9 (existing bean: token cleanup in served config.js — adjacent to this work)
- PersonaForge-n3kx (done): JSON `/scions` endpoint that this work consumes
- PersonaForge-slg9: blocking — adds `scion_slug` field
- MindHive-y8bp (MH validation: e2e Cairn verification — requires Cairn visible in Nooscope)