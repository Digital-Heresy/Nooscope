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

Add translucent wireframe shells around scope regions so brain anatomy is visible even when the graph is sparse.

## What to build

- `THREE.IcosahedronGeometry` wireframes positioned at each region center from `RegionGeometry`
- Scope-colored, very low opacity (0.05-0.1) — subtle background structure
- `depthWrite: false` to avoid z-fighting with nodes (same pattern as birth glow)
- Added directly to Three.js scene (not as force-graph nodes), not interactive

## Checklist

- [ ] New `_addRegionShells()` method in MemoryGraph, called from `_render()`
- [ ] Create wireframe meshes at region positions/radii from `RegionGeometry`
- [ ] Store references for cleanup on re-render
- [ ] Color-match to scope colors (pink=self, green=universal, blue=other)

## Dependencies

Nooscope-fwob (needs geometry definitions for positions and radii)
