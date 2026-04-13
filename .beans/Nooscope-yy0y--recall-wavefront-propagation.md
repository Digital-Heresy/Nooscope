---
# Nooscope-yy0y
title: 'Recall Wavefront Propagation'
status: done
type: feature
priority: high
created_at: 2026-04-05T00:00:00Z
updated_at: 2026-04-05T00:00:00Z
parent: Nooscope-mbfj
---

Replace the simultaneous recall pulse with a BFS wavefront that visibly propagates along edges from an origin node through the recalled subgraph.

## Current state

`highlightRecall()` in graph.js (lines 632-652) pulses all recalled nodes simultaneously and fires particles on all connecting edges at once. No sense of signal flow or directionality.

## What to build

- **Recall subgraph**: compute the edges connecting recalled node_ids
- **BFS from root**: pick the most-connected recalled node as root, BFS outward through the recall subgraph
- **Staggered animation**: particle bursts at ~200ms per hop, so the wavefront visibly travels from root outward
- **Edge highlight**: temporary cyan color override on recall subgraph edges (`_recallHighlightUntil` timestamp), checked in `edgeColor()`
- Existing node pulse (white flash) preserved, just staggered per BFS layer

## Checklist

- [ ] New `_recallSubgraph(nodeIds)` helper: returns `{ root, layers: [[edges], ...] }` BFS structure
- [ ] Rewrite `highlightRecall()` to use BFS-staggered animation
- [ ] Add `_recallHighlightUntil` field to links
- [ ] Update `edgeColor()` to check recall highlight timestamp
- [ ] Node pulses staggered per BFS layer

## Dependencies

Best visual results after Nooscope-fwob (wavefront through organized structure), but functional without it.
