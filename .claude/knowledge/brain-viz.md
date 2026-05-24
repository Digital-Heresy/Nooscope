# Brain visualization

The 3D scene is a force-directed graph rendered inside a wireframe brain model. There are two coexisting rendering strategies, one for each upstream telemetry source, and a small set of visual encoding rules that the rest of the code assumes.

## Two rendering strategies

**Engram events = ornaments on a tree.** Each Engram node is a real, distinct memory. Nodes are distributed evenly throughout their scope's brain lobe — like ornaments on a Christmas tree, spread out so they don't clump. `RegionGeometry.seedPosition()` handles spherical-shell placement by scope, consolidation depth, and salience. Edges form organically wherever Hebbian co-activation creates them; the visualizer doesn't control the wiring, it just renders what Engram emits.

**PersonaForge events = fixed sentinel dots at anatomical landmarks.** PF events don't represent individual memories — they represent *capability channels*. Each reflex category gets fixed dot(s) at a strategic brain location that pulse reactively when events fire. The pattern is:

1. Place a small solid sphere at the anatomical landmark (e.g. eye centers for input signals).
2. On event fire, bump a scale factor toward 1.0 (stacking — rapid events keep inflating).
3. Animate decay back to resting size over ~2s.
4. Cap max size to the containing wireframe geometry.

`message_received` → eye nerve dots is the first implementation of this pattern. The same shape (fixed placement, pulse on event, decay animation, geometry-bounded scale cap) applies to every PF reflex category.

## Brain model

`models/brain.obj` — 1,298 verts, 5,711 faces, two hemispheres (`rh.pial.asc`, `lh.pial.asc`) plus eye fixtures. Loaded via an inline OBJ parser, not Three's `OBJLoader` — Three.js r160 dropped UMD addon builds so the bundled CDN deps don't ship a loader. There's a toggle button to hide the brain mesh and eyes when you want the raw graph.

## Region mapping

Finalized in Nooscope-cj8w.

| Brain Region | Scope (Engram) | PF Category | Signal Density |
|---|---|---|---|
| Temporal Lobe | — | Recall, Formation | Highest |
| Frontal Lobe | Other/intimate (L/R by identity) | Social | High |
| Parietal (center-top) | Self | — | — |
| Occipital (back) | Universal | — | — |
| Cerebellum (back-bottom) | — | Agency | Medium |
| Thalamus | — | Circadian | Low |
| Brainstem | — | Vital | Rare |
| Eyes (front fixtures) | — | Input (`message_received`) | Event-driven |

The brain container gives spatial meaning to the force graph. Engram ornaments and PF sentinel dots coexist — Engram fills the lobes with real memories, PF dots pulse at fixed landmarks showing capability-channel activity.

## Telemetry event types

From Thriden/Engram: `snapshot`, `node_activated`, `node_created`, `edge_reinforced`, `edge_created`, `graph_wiped`.

From PersonaForge: `recall_fired`, `memory_promoted`, `memory_formed`, `working_memory_updated`, `session_created`, `session_expired`, `acquaintance_created`, `acquaintance_updated`, `acquaintance_blocked`, `acquaintance_unblocked`, `acquaintance_forgotten`, `identity_linked`, `message_received`, `pi_text_delta`, `pi_tool_result`, `action_completed`, `dream_started`, `dream_completed`, `dream_storyboard_ready`, `backup_completed`, `cron_fired`.

`memory_promoted` pulses the formation sentinel (consolidation-shaped), not recall. Acquaintance/identity events pulse the social fixtures: `acquaintance_created` / `acquaintance_updated` / `acquaintance_unblocked` / `identity_linked` on Social (Created); `acquaintance_blocked` on a dedicated **Social (Blocked)** midline fixture (red, with a brief brain-wide attention dim); `acquaintance_forgotten` on a dedicated **Social (Forgotten)** midline fixture (grey, bell-curve erasure fade). These two are the only PF sentinels that *don't* use the universal `0xff8c00` orange — the palette break is intentional (Nooscope-bf3x): blocked = defensive, forgotten = erasure, neither reads as "session ending naturally".

Dispatched by `handleEvent()` in `js/app.js`, which switches on `event.type` and calls the matching `MemoryGraph` method.

## Node visual encoding

- **Color by scope:** `self` → pink, `universal` → green, `other:*` / `intimate:*` → blue.
- **Size:** `log2(activation_count + 1) * 0.8`, minimum 0.5.
- **Pulse:** white flash for 1s on activation, 2s on creation.

## Edge visual encoding

- **Color by origin:** `co_activation` → orange, `explicit` → white, `semantic_clustering` → purple.
- **Width:** `weight * 2.5`, minimum 0.2.

## Graph data invariants

A couple of d3-force quirks that the incremental-update code in `js/graph.js` has to respect:

- **`source`/`target` are mutated post-simulation.** d3-force rewrites link `source` and `target` from string IDs to object references after the first tick. All edge-lookup code must handle both forms — see `addEdge` and `updateEdge` for the pattern.
- **Read `graphData()` live, not from the cached field.** The `this.graphData` copy goes stale during incremental updates. When doing an incremental add/update, always pull the current data from the graph instance.

## Module wiring

`js/graph.js` owns `nodeMap` (Map of id → node), `graphData` ({nodes, links}), and the favorites set. It wraps `ForceGraph3D` and exposes snapshot init, incremental adds, pulse animations, recall highlighting, and a selection halo built from THREE.js custom objects.

The module-level globals `graph`, `eventLog`, `infoPanel`, `thridenStream`, `pfStream` are defined in `js/app.js` and referenced cross-file — e.g. `toggleFavorite()` in `js/effects.js` reads `graph` and `infoPanel` directly. Treat these as the integration surface between the four script files.
