---
# Nooscope-rnrm
title: 'Working Memory Spotlight'
status: todo
type: feature
priority: normal
created_at: 2026-04-05T00:00:00Z
updated_at: 2026-04-05T00:00:00Z
parent: Nooscope-mbfj
---

Persistent visual highlight on nodes currently in working memory. Updates on each `working_memory_updated` PF event.

## Current state

`working_memory_updated` handler in app.js (line 277) only logs to the event log. No persistent visual state, no node highlighting.

## What to build

- **Working memory set**: tracked in `MemoryGraph.workingMemorySet` (Set of node IDs)
- **Gold ring mesh**: `wmRing` added to `nodeThreeObject()`, similar to `selectionRing` but distinct color (#ffd700 gold), gentle opacity pulse in `_animate()`
- **State management**: `setWorkingMemory(nodeIds)` method — removes highlights from old set, adds to new
- **Event wiring**: parse `working_memory_updated` payload for node IDs in app.js

## Checklist

- [ ] Add `workingMemorySet` property to MemoryGraph
- [ ] Add `setWorkingMemory(nodeIds)` method
- [ ] Add `wmRing` mesh in `nodeThreeObject()` (gold, initially opacity 0)
- [ ] Pulse `wmRing` opacity in `_animate()` for nodes in working memory set
- [ ] Wire `working_memory_updated` handler in app.js to call `graph.setWorkingMemory()`
- [ ] Verify ring clears when working memory updates to a different set

## Dependencies

None — fully independent.
