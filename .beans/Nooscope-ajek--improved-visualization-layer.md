---
# Nooscope-ajek
title: Improved Visualization Layer
status: in-progress
type: milestone
priority: normal
created_at: 2026-04-05T00:00:00Z
updated_at: 2026-04-06T00:00:00Z
---

Evolve Nooscope's 3D graph from a spherical constellation/yarn-ball into a structurally meaningful brain visualization with distinct anatomical regions and visible information flow.

## Problem

The current layout uses three crude region blobs (universal at z-, self at center, other/intimate at z+) with random jitter. Dense graphs collapse into an indistinguishable sphere with a tangled core. There's no visual distinction between memory structure (what the brain *is*) and neural activity (what the brain *does*).

## Vision

Two complementary visualization layers:

1. **Memory architecture** (Engram) — the "gray matter." Nodes and edges organized by scope, consolidation level, and cluster topology so the graph reads like brain hemispheres with lobes, not a point cloud. Structural relationships (co-activation, semantic clustering) should create visible anatomy.

2. **Neural activity** (PersonaForge) — the "nervous system." Recall pathways, memory formation events, session lifecycles, and working memory updates rendered as transient signal flows across the structure. Actions being taken and spawned should be visible as pulses propagating through the network.

## Current state (2026-04-06)

- `RegionGeometry` global (graph.js) replaces old flat region system — layered shells per consolidation level, salience-weighted seeding, hemisphere assignment for identities
- Homing force pulls toward level-specific positions (episodic=outer, cluster=mid, abstract=core)
- Direction: moving toward a **wireframe brain model** (GLTF) as the structural container, with Engram nodes placed inside anatomical regions and PF reflex categories in their own lobes

## Children

- **Nooscope-v60v** — Engram Memory Architecture: structural brain layout
- **Nooscope-mbfj** — PersonaForge Neural Activity: signal flow visualization
- **Nooscope-cj8w** — PF Public Telemetry: Reflex Categories & Content Stripping
- **Nooscope-wr3i** — Morpheus: Dream Storyboard Viewer (dreams.html)
