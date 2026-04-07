---
# Nooscope-xc3y
title: 'Region Boundary Hints'
status: todo
type: feature
priority: low
created_at: 2026-04-05T00:00:00Z
updated_at: 2026-04-05T00:00:00Z
parent: Nooscope-v60v
---

Load `models/brain.obj` as a non-interactive wireframe overlay in the Activity page 3D scene. The brain gives spatial meaning to the force graph — nodes aren't floating in space, they're inside anatomical regions.

## What to build

- Load `brain.obj` via OBJLoader into the ForceGraph3D scene (not as a force-graph node)
- Two hemispheres: pink (right, `rh`), blue (left, `lh`) — same colors as brain-preview.html
- Wireframe material, low opacity (~0.4), `depthWrite: false`
- Eye fixtures: pink left eye at (-0.7, -1.2, 2.5), blue right eye at (0.7, -1.2, 2.5) with optic nerve lines
- Scale brain mesh to align with RegionGeometry coordinate space (mesh is ~6 units, graph is ~160 units)
- Non-interactive — users can't click/drag the brain, only the nodes inside it
- Toggle button in status bar to show/hide brain + eyes

## Brain anatomy → scope region mapping

| Brain Region | Scope | RegionGeometry position |
|---|---|---|
| Parietal (center-top) | Self | z=0 (origin) |
| Occipital (back) | Universal | z=-80 |
| Frontal lobes (front, L/R) | Other/intimate | z=+60, split by identity |
| Cerebellum (back-bottom) | Reserved for Agency (PF outbound actions) | — |
| Eyes (front fixtures) | Input signals (inbound messages) | — |

## Checklist

- [ ] Add OBJLoader import (CDN, same Three.js version as existing)
- [ ] New `_addBrainOverlay()` method in MemoryGraph, called from `_render()`
- [ ] Load brain.obj, scale/position to match RegionGeometry bounds
- [ ] Add eye fixtures + optic nerve lines (reuse brain-preview.html positioning, scaled)
- [ ] Store references for cleanup on re-render
- [ ] Toggle button in status bar (show/hide brain + eyes)
- [ ] Update RegionGeometry centers to align with brain mesh anatomy

## Dependencies

- `models/brain.obj` (committed — 1,298 verts, 5,711 faces)
- `brain-preview.html` for reference positioning of eyes and hemisphere colors
