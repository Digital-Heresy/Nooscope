---
# Nooscope-0bp4
title: 'Memory Formation Signal'
status: todo
type: feature
priority: normal
created_at: 2026-04-05T00:00:00Z
updated_at: 2026-04-05T00:00:00Z
parent: Nooscope-mbfj
---

Visualize `memory_formed` PF events as inbound signals traveling from an input zone to where the new node appears — creating a visual narrative of "signal arrives, memory materializes."

## Current state

`handleMemoryFormed()` in app.js (line 254) is a no-op with a comment that the node will appear via Thriden's `node_created`.

## What to build

- **Input zone**: designated position at top of graph (y=+40) where inbound signals originate
- **Signal particle**: transient Three.js sprite/point that lerps from input zone toward the target region (computed from `memory_formed.scope` via RegionGeometry)
- **Formation queue**: pending formations stored with scope + timestamp, matched against subsequent `node_created` events for coordinated birth glow
- **Flash**: brief flash at input zone marks signal origin

## Checklist

- [ ] New `showInboundSignal(fromPos, toPos, color, durationMs)` in MemoryGraph
- [ ] Create transient sprite that lerps between positions, self-destructs after duration
- [ ] Wire `handleMemoryFormed()` to create signal toward scope's region
- [ ] Queue pending formations in app.js
- [ ] Match pending formations with `handleNodeCreated()` for coordinated birth glow

## Dependencies

Nooscope-fwob (RegionGeometry for computing target position from scope). Can fall back to current `regionForScope()` without it.
