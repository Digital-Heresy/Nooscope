---
# Nooscope-fwob
title: 'Layered Region Geometry'
status: todo
type: feature
priority: high
created_at: 2026-04-05T00:00:00Z
updated_at: 2026-04-05T00:00:00Z
parent: Nooscope-v60v
---

Foundation feature for structural brain layout. Replace the flat region system with a layered model that maps (scope, consolidation_level, salience) to 3D positions with cortex-like depth.

## Current state

`regionForScope()` and `jitteredRegion()` in graph.js (lines 54-98) map scope to a single point with random scatter. No consolidation or salience influence on position. Homing force (line 283) pulls all nodes in a scope toward the same center.

## What to build

A `RegionGeometry` global that computes layered target positions:

- **Three concentric shells per region**: episodic (level 0) = outer surface, cluster (level 1) = mid layer, abstract (level 2) = inner core
- **Salience shifts within a shell**: high salience = more central/prominent, low salience = periphery
- **Region centers** (preserve existing brain topology):
  - Universal: (0, 0, -80), shells at radii ~10/20/30
  - Self: (0, 0, 0), shells at radii ~10/20/30
  - Other/intimate: (+-50, 0, 60), shells at radii ~8/16/24 (smaller per-identity lobes)
- **Jitter** applied within shell surface, not as random volume scatter

## Checklist

- [ ] Create `RegionGeometry` object/class replacing `REGION`, `regionForScope()`, `jitteredRegion()`
- [ ] Accept (scope, consolidation_level, salience) and return target position
- [ ] Update `initFromSnapshot()` to pass consolidation_level to geometry
- [ ] Update `addNode()` to pass consolidation_level to geometry
- [ ] Update homing force to pull toward layered positions (needs node's consolidation_level)
- [ ] Expose as global so Epic 2 features can query it

## Risk

Directly changes force targets for every node. Mitigated by weak HOMING_STRENGTH (0.03) — nodes drift gradually. Intro logo uses fx/fy/fz pins and is unaffected.
