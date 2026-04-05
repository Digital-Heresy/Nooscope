---
# Nooscope-ajek
title: Improved Visualization Layer
status: todo
type: milestone
priority: normal
created_at: 2026-04-05T00:00:00Z
updated_at: 2026-04-05T00:00:00Z
---

Evolve Nooscope's 3D graph from a spherical constellation/yarn-ball into a structurally meaningful brain visualization with distinct anatomical regions and visible information flow.

## Problem

The current layout uses three crude region blobs (universal at z-, self at center, other/intimate at z+) with random jitter. Dense graphs collapse into an indistinguishable sphere with a tangled core. There's no visual distinction between memory structure (what the brain *is*) and neural activity (what the brain *does*).

## Vision

Two complementary visualization layers:

1. **Memory architecture** (Engram) — the "gray matter." Nodes and edges organized by scope, consolidation level, and cluster topology so the graph reads like brain hemispheres with lobes, not a point cloud. Structural relationships (co-activation, semantic clustering) should create visible anatomy.

2. **Neural activity** (PersonaForge) — the "nervous system." Recall pathways, memory formation events, session lifecycles, and working memory updates rendered as transient signal flows across the structure. Actions being taken and spawned should be visible as pulses propagating through the network.

## Current state (graph.js)

- `regionForScope()` maps scope → 3D region (universal=back, self=center, other=front L/R hemispheres)
- `jitteredRegion()` adds random scatter within regions (REGION_JITTER=25)
- Homing force (HOMING_STRENGTH=0.03) gently pulls nodes toward their region
- Consolidation level is tracked per node but not used in layout
- Edge origin (co_activation, explicit, semantic_clustering) affects color but not structure
- PF events (recall, memory formation, sessions) trigger pulses/highlights but have no spatial representation

## Children

- **Nooscope-v60v** — Engram Memory Architecture: structural brain layout
- **Nooscope-mbfj** — PersonaForge Neural Activity: signal flow visualization
