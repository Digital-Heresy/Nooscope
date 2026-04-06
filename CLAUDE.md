# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Nooscope

Nooscope is a zero-build-tool browser app that renders a live 3D force-directed graph of memory telemetry from two upstream services:

- **Thriden** — structural graph data (nodes, edges, activation, snapshots) via `ws://localhost:{port}/ws/telemetry`
- **PersonaForge** — behavioral events (recall, memory formation, sessions) via `ws://localhost:{port}/ws/telemetry`

No npm, no bundler. Open `index.html` in a browser. CDN deps: three.js 0.160.0, 3d-force-graph 1.79.1.

## Development

To run: open `index.html` directly in a browser, or use any static file server. No build step.

URL params for auto-connect: `?scion=speaker`, `?scion=helix`, or `?thriden=3030&pf=8100`.

## Architecture

Four JS files loaded as plain `<script>` tags (order matters):

1. **`js/stream.js`** — `TelemetryStream` class. WebSocket client with exponential-backoff auto-reconnect. Parses JSON events and dispatches to callbacks.
2. **`js/graph.js`** — `MemoryGraph` class. Wraps ForceGraph3D. Owns `nodeMap` (Map of id→node), `graphData` ({nodes, links}), favorites set. Handles snapshot init, incremental node/edge adds, pulse animations, recall highlighting, and selection halo via THREE.js custom objects.
3. **`js/effects.js`** — `EventLog` and `InfoPanel` UI classes plus the global `toggleFavorite()` function.
4. **`js/app.js`** — Entry point. Wires DOM events, manages connection lifecycle, dispatches telemetry events by type to graph methods, renders a test graph on startup.

Key data flow: `TelemetryStream.onmessage` → `handleEvent()` (app.js) → switch on `event.type` → calls `MemoryGraph` methods → ForceGraph3D re-renders.

## Telemetry event types

From Thriden: `snapshot`, `node_activated`, `node_created`, `edge_reinforced`, `edge_created`, `graph_wiped`
From PersonaForge: `recall_fired`, `memory_formed`, `session_created`, `session_expired`, `working_memory_updated`

## Node visual encoding

- **Color by scope**: `self` → pink, `universal` → green, `other:*`/`intimate:*` → blue
- **Size**: `log2(activation_count + 1) * 0.8`, minimum 0.5
- **Pulse**: white flash for 1s on activation, 2s on creation
- **Edge color by origin**: `co_activation` → orange, `explicit` → white, `semantic_clustering` → purple
- **Edge width**: `weight * 2.5`, minimum 0.2

## Important patterns

- d3-force mutates link `source`/`target` from string IDs to object references after simulation starts. All edge lookup code must handle both forms (see `addEdge`, `updateEdge`).
- `graphData()` returns the live mutable data — always read it from the graph instance rather than using the stale `this.graphData` copy when doing incremental updates.
- Globals: `graph`, `eventLog`, `infoPanel`, `thridenStream`, `pfStream` are module-level in app.js and referenced across files (e.g., `toggleFavorite` in effects.js uses `graph` and `infoPanel`).

## Scion presets

Defined in `NOOSCOPE_CONFIG.scions` (config.js): Speaker (3030/8100), Helix (3031/8101). "Custom" shows a port input dialog.

## Pages

- **`index.html`** — Main 3D brain visualizer (WebSocket telemetry)
- **`dreams.html`** — Morpheus dream storyboard viewer (REST API to PersonaForge)

## Docker deployment (local dev testing)

Nooscope runs as a container in the MindHive docker-compose stack. The Dockerfile does a local COPY (not repo clone), so changes are tested by rebuilding without committing.

**To rebuild and test changes**, run:
```
docker compose -f C:/Users/ronin/Documents/Projects/MindHive/docker-compose.yml up --build nooscope -d
```

Then access at `http://localhost:8080` (index.html) or `http://localhost:8080/dreams.html`.

This rebuilds only the Nooscope container using the local working directory. The nginx proxy handles CORS and routes `/morpheus/` requests to PersonaForge and `/ws/telemetry` to Engram.

**When to rebuild**: After any HTML, CSS, JS, nginx.conf, or Dockerfile changes that need live testing against the backend services. Always offer to rebuild when the user wants to test changes.
