---
# Nooscope-qz2d
title: 'Edge-Origin-Aware Forces'
status: done
type: feature
priority: normal
created_at: 2026-04-05T00:00:00Z
updated_at: 2026-04-05T00:00:00Z
parent: Nooscope-v60v
---

Make different edge types behave differently in the force simulation so the graph self-organizes into visible clusters connected by bridges.

## Current state

`_tuneForces()` in graph.js (lines 298-318) applies uniform link distance and charge strength. Edge origin only affects color, not layout.

## What to build

Per-origin link distance and strength via d3-force's per-link function support:

| Origin | Distance | Strength | Effect |
|--------|----------|----------|--------|
| `semantic_clustering` | 20 | 1.0 | Tight clusters |
| `co_activation` | 60 | 0.3 | Loose associative bridges |
| `explicit` | 40 | 0.6 | Medium scaffolding |

Existing density scaling (based on links/nodes ratio) applies as a multiplier on top.

## Checklist

- [ ] Replace uniform `link.distance(linkDist)` with `link.distance(l => ...)` reading `l.origin`
- [ ] Replace uniform link strength with per-origin function
- [ ] Keep density multiplier from current `_tuneForces()`
- [ ] Test force stability — no oscillation or collapse

## Risk

Highest-risk feature for force stability. Per-link distances can create competing forces. Mitigated by homing force acting as stabilizer and moderate strength values.

## Dependencies

None (can parallel v60v-1), but visual result is best after Nooscope-fwob gives nodes distinct targets.
