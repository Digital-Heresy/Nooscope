---
# Nooscope-pxfn
title: Decide source of truth for Scion config registry
status: done
type: task
created_at: 2026-05-14T07:42:05Z
updated_at: 2026-05-21T00:00:00Z
parent: Nooscope-rxnd
---

## Decision (2026-05-21)

**Pick (b) PF admin API** — `GET /scions` with `Accept: application/json`
on `forge-web:8200`. Decision doc: [`docs/scion-registry-source.md`](../docs/scion-registry-source.md).

The bean's original tentative lean toward (c) was written 2026-05-14,
one day after [PersonaForge-n3kx](../../PersonaForge/.beans/PersonaForge-n3kx--admin-web-json-variant-of-scions-list-for-program.md)
shipped the JSON `/scions` endpoint. With that endpoint live, (b) is
the cleanest answer: PF is the authoritative source for "which Scions
exist," already reachable from sibling containers, already proxied by
Nooscope's nginx (for nkvw's social-graph view), and the `badge` field
gives free live/offline state for the selector.

## Spinoff: PersonaForge-slg9

The decision uncovered a naming-convention mismatch between PF's
`scion_id` (`dh-speaker`) and Nooscope/MH's operational shortname
(`speaker`). Filed [[PersonaForge-slg9]] to add a first-class
`scion_slug` field on the PF side rather than embedding a `dh-` strip
in Nooscope's entrypoint. de9m's implementation blocks on slg9.

## Original brief

Decision bean, gate-locked. Pick (a) HiveMind registry, (b) PF admin API, (c) compose env, (d) filesystem mount. Tradeoffs: HiveMind is the natural fleet-manager but currently has a network-reachability caveat (MindHive-thrz); PF admin API requires raven token + per-Scion query loop; compose env is simplest but requires operator action per Scion; filesystem mount sits between compose env and a real registry. Recommendation likely (c) for v1 (simplest, operator-controlled, no new dependencies) with (a) as the eventual target post-thrz. Output: short doc 'docs/scion-registry-source.md' with pick + rationale.