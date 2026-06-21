# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Nooscope

Nooscope is a zero-build-tool browser app that renders a live 3D force-directed graph of memory telemetry from two upstream services:

- **Thriden / Engram** — structural graph data (nodes, edges, activation, snapshots) via `ws://localhost:{port}/ws/telemetry`
- **PersonaForge** — behavioral events (recall, memory formation, sessions) via `ws://localhost:{port}/ws/telemetry`

No npm, no bundler. Open `index.html` in a browser. CDN deps: three.js 0.160.0, 3d-force-graph 1.79.1.

## Knowledge folder

Topic-specific reference docs live in `.claude/knowledge/`. When working on a subsystem listed below, read its file first; when you add, remove, or meaningfully change the underlying surface (new event type, new proxy route, changed visual encoding, new compose service), update the matching file in the same change.

- `brain-viz.md` — Two rendering strategies (Engram ornaments vs PF sentinel dots), brain model + region mapping, telemetry event types, node/edge visual encoding, d3-force / graph-data invariants
- `deployment.md` — Docker rebuild workflow, compose service shape, container security posture, image-choice rules under `cap_drop: ALL`
- `networking.md` — nginx variable-`proxy_pass` + path-rewrite pattern, CORS-at-the-gateway rule, container outbound DNS override, admin gate on forge-web

## Versioning

This repo ships the **nooscope** image (`ghcr.io/digital-heresy/nooscope`) under Thriden per-component semver. **Version-of-record: the `VERSION` file** (repo root) — a `vX.Y.Z` git tag must match it (bump `VERSION` in the same change, then tag; `release.yml` builds the GHCR image on the tag). The full scheme — bump rules, the umbrella release procedure, the preflight gate — lives in **`../MindHive/docs/versioning.md`**, and the **`/release` skill** (in MindHive) encodes the mint mechanics.

## Development

Open `index.html` directly in a browser for static testing, or rebuild the Docker container (see `knowledge/deployment.md`) to test against the live Engram + PF backends. URL params for auto-connect: `?scion=speaker`, `?scion=helix`, `?thriden=3030&pf=8100`.

## Architecture

Four JS files loaded as plain `<script>` tags (order matters):

1. **`js/stream.js`** — `TelemetryStream` class. WebSocket client with exponential-backoff auto-reconnect. Parses JSON events and dispatches to callbacks.
2. **`js/graph.js`** — `MemoryGraph` class. Wraps `ForceGraph3D`. Owns `nodeMap`, `graphData`, favorites. Handles snapshot init, incremental adds, pulses, recall highlighting, selection halo. See `knowledge/brain-viz.md`.
3. **`js/effects.js`** — `EventLog` and `InfoPanel` UI classes plus the global `toggleFavorite()`.
4. **`js/app.js`** — Entry point. Wires DOM events, manages connection lifecycle, dispatches telemetry events to graph methods, renders a test graph on startup.

Data flow: `TelemetryStream.onmessage` → `handleEvent()` (app.js) → switch on `event.type` → `MemoryGraph` methods → `ForceGraph3D` re-renders.

## Scion presets

Defined in `NOOSCOPE_CONFIG.scions` (config.js): Speaker (3030/8100), Helix (3031/8101). "Custom" shows a port input dialog.

## Pages

- **`index.html`** — Main 3D brain visualizer (WebSocket telemetry)
- **`dreams.html`** — Morpheus dream storyboard viewer (REST API to PersonaForge)
- **`social.html`** — Social graph view (in progress, see `Nooscope-nkvw`)
- **`logs.html`** — Admin-only container log inspector (`Nooscope-lginsp`). Auto-polls `/admin/scions/{scionId}/logs` (forge-web tails the `forge-<short>` PersonaForge container's docker logs) and renders the last N lines with client-side Full/Warnings/Errors filtering. Reuses the existing `/admin/scions/` nginx gate — no per-Scion proxy block.
