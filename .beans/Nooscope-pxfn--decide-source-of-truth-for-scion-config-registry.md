---
# Nooscope-pxfn
title: Decide source of truth for Scion config registry
status: todo
type: task
created_at: 2026-05-14T07:42:05Z
updated_at: 2026-05-14T07:42:05Z
parent: Nooscope-rxnd
---

Decision bean, gate-locked. Pick (a) HiveMind registry, (b) PF admin API, (c) compose env, (d) filesystem mount. Tradeoffs: HiveMind is the natural fleet-manager but currently has a network-reachability caveat (MindHive-thrz); PF admin API requires raven token + per-Scion query loop; compose env is simplest but requires operator action per Scion; filesystem mount sits between compose env and a real registry. Recommendation likely (c) for v1 (simplest, operator-controlled, no new dependencies) with (a) as the eventual target post-thrz. Output: short doc 'docs/scion-registry-source.md' with pick + rationale.