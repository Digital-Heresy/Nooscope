---
# Nooscope-v60v
title: 'Engram Memory Architecture: Structural Brain Layout'
status: in-progress
type: epic
priority: normal
created_at: 2026-04-05T00:00:00Z
updated_at: 2026-04-05T00:00:00Z
parent: Nooscope-ajek
---

Rework how Engram's memory nodes and edges are spatially organized so the graph reads as brain anatomy rather than a random point cloud.

## What we have

- Scope-based regions: universal (back), self (center), other/intimate (front, L/R hemispheres)
- Random jitter within each region (REGION_JITTER=25)
- Flat homing force pulling all nodes in a scope toward a single point
- Consolidation level (episodic/cluster/abstract) tracked but unused in layout
- Edge origins (co_activation, explicit, semantic_clustering) colored but structurally ignored
- Size = log2(activation_count + 1) * 0.8

## What needs to change

The layout should produce visible structure — lobes, layers, clusters — not amorphous blobs. Key structural axes from Engram:

### Consolidation depth as vertical axis
- **Episodic** (level 0) — surface layer. Recent, granular memories. Positioned at the outer surface.
- **Cluster** (level 1) — mid layer. Grouped patterns. Positioned inward.
- **Abstract** (level 2) — deep core. High-level concepts. Positioned at the inner core of each region.

This creates a cortex-like layering: concrete memories on the outside, abstractions at the center.

### Scope as hemispheres (refine existing)
- Current L/R alternation for other/intimate identities is a good start
- Need sub-regions within each hemisphere so different identities form distinct lobes rather than overlapping
- Universal memories should wrap around the back as a shared substrate (corpus callosum / brainstem analogy)

### Edge topology as structure
- **Semantic clustering** edges should pull nodes into visible clusters (tighter force, shorter link distance)
- **Co-activation** edges form associative bridges between clusters (longer, more elastic)
- **Explicit** edges are structural scaffolding (medium rigidity)

### Salience as visual prominence
- High-salience nodes should sit slightly more prominently (larger, brighter, more central within their layer)
- Low-salience nodes fade to the periphery

## Children (implementation order)

1. **Nooscope-fwob** — Layered Region Geometry (foundation)
2. **Nooscope-qz2d** — Edge-Origin-Aware Forces
3. **Nooscope-4qyh** — Identity Sub-Regions (deps: fwob)
4. **Nooscope-vapo** — Salience Visual Encoding
5. **Nooscope-xc3y** — Region Boundary Hints (deps: fwob)
