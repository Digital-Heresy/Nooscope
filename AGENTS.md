# AGENTS.md — Nooscope (pi supplement to CLAUDE.md)

Pi reads both this file and `CLAUDE.md`. Start with `CLAUDE.md` for the overview; this file adds deeper implementation details discovered from reading the actual source.

---

## File load order (index.html script tags)

```
js/config.js → js/stream.js → js/graph.js → js/effects.js → js/app.js
```

Everything is a plain global — no modules, no bundler. Earlier scripts define globals that later scripts consume.

---

## js/config.js

- Exports the `NOOSCOPE_CONFIG` global: `{ scions: { speaker: {...}, helix: {...} }, defaults: {...} }`
- Each scion entry: `{ thriden: <port>, pf: <port>, token: '<bearer>' }`
- In Docker, this file is overridden by volume mount or generated from env vars at startup:
  - `SPEAKER_RAVEN_TOKEN`, `HELIX_RAVEN_TOKEN`
  - `SPEAKER_THRIDEN_PORT`, `SPEAKER_PF_PORT`, `HELIX_THRIDEN_PORT`, `HELIX_PF_PORT`
- Docker is defined in **`../MindHive/docker-compose.yml`**, not in this repo. Container: `nooscope-1`, project: `mindhive`, nginx:alpine, port 8080→80.

---

## js/stream.js — TelemetryStream

- Auth: token is sent as the WebSocket subprotocol string `"bearer.<token>"` (not a header).
- Auto-reconnect: exponential backoff from 1 s doubling to 30 s max. `shouldReconnect` flag gates retries.
- `onStatus` fires `'reconnecting'` → `'connected'` / `'disconnected'` — drives the colored status dots in the UI.

---

## js/graph.js — MemoryGraph

### Brain topology (3D layout)

Nodes are seeded into regions based on scope, then pulled there by a custom homing force (strength `0.03`):

| Scope | Home position | Color |
|-------|--------------|-------|
| `self` | `{x:0, y:0, z:0}` | pink `#ff4a9e` |
| `universal` | `{x:0, y:0, z:-80}` | green `#4aff7f` |
| `other:X` / `intimate:X` | `{x:±50, y:0, z:+60}` | blue `#4a9eff` |

- `other`/`intimate` identities are assigned to alternating hemispheres (left x=-50, right x=+50) deterministically on first encounter via `_hemisphereMap`. Reset on `initFromSnapshot`.
- `REGION_JITTER = 25` — nodes scatter randomly within their region on init.

### Edge color / decay

- `EDGE_DECAY_MS = 60000` — edges fade from origin color to `EDGE_COLD_COLOR = {r:0.3, g:0.3, b:0.3}` over 60 s.
- `_lastTouched` timestamp on each link drives the lerp. New/untouched edges start 70% cold.
- Edge color refresh runs every 120 animation frames (≈2 s).

### Node consolidation levels

`node.level` value from snapshot: `0` = Episodic, `1` = Cluster, `2` = Abstract (displayed in InfoPanel).

### Pending edge queue

When `addEdge()` is called before both endpoint nodes exist, the edge is deferred into `_pendingEdges` and retried every 500 ms, up to 10 times, then dropped with a console warning.

### New connection effect (`_snapNewConnection`)

Fires on the first edge between two previously-unlinked nodes:
1. Reheats the d3 force simulation
2. Pulses both endpoint nodes
3. Shows cyan (`#00e5ff`) directional particles (6, width 2, speed 0.02) for 3 s

### Force tuning

`_tuneForces()` scales forces by graph density (`links/nodes`):
- Charge: `-80 - (density × 8)`, max distance 400
- Link distance: `40 + (density × 3)`

### Animation loop

ForceGraph3D kills its own render loop after `cooldownTicks=200`. The `_animate()` method runs a manual `requestAnimationFrame` loop indefinitely for:
- Node pulse / glow / ring / pin animations
- Manual camera orbit (`_autoRotate`)
- Periodic edge color refresh

### Camera

Starts at `{x:0, y:0, z:200}`. Auto-rotate speed `0.3` (passed to `setAutoRotate`), applied as `0.3 × 0.002` radians per frame.

### getStats() caveat

`getStats()` reads `this.graphData` (the stale reference set at last `_render()`), **not** the live `this.graph.graphData()`. The node/edge counts shown in the UI may lag behind incremental additions by exactly 0 or the count from the last full re-render.

---

## js/effects.js — EventLog / InfoPanel

- `EventLog` keeps the last 50 entries (newest on top via `insertBefore`).
- `InfoPanel` tracks `currentNodeId`. `refreshIfShowing(node, graph)` only redraws if that node is currently open.
- `showPosControls` is a **global from app.js** — `InfoPanel._renderContent` reads it directly to show/hide the position editor fields (developer tool for logo tuning).
- `dumpAllPositions()` — dumps all fx/fy/fz-pinned node positions to console and clipboard. Used when tweaking the intro logo geometry.
- `applyPosition(nodeId)` — reads the position editor inputs and applies `fx/fy/fz` then pokes `graph.graph.graphData(data)` to update.
- Global onclick handlers registered on the `window`: `toggleFavorite`, `toggleNodePin`, `applyPosition`, `dumpAllPositions`.

---

## js/app.js — Entry point

### Startup intro sequence (`renderTestGraph`)

Animates the Thriden logo (triangle + interleaved T) using pinned-position nodes:
- **Phase 1:** 6 triangle nodes (outer + inner for stroke thickness), 150 ms apart
- **Phase 2:** 9 triangle edges, 80 ms apart
- **Phase 3:** 10 T-shape nodes, 150 ms apart
- **Phase 4:** 10 T-shape edges, 80 ms apart
- **Phase 5:** Start auto-rotation, enable Connect button

`introRunning = true` disables Connect during the animation. Logo nodes have `fx/fy/fz` pinned so forces don't scatter them.

### URL parameter priority

1. `?thriden=<port>&pf=<port>` → explicit ports (no token)
2. `?scion=<name>` → named preset from config
3. No params → wait for user interaction

### Connection lifecycle

- `setConnectedState(true/false)` flips Connect↔Disconnect button and color.
- On Thriden disconnect: only flips to disconnected if `shouldReconnect` is false (manual disconnect). Auto-reconnect keeps button as "Disconnect".
- PF stream is optional (no port = skip).

### Globals used across files

| Global | Defined in | Used in |
|--------|-----------|---------|
| `graph` | app.js | effects.js (`toggleFavorite`, `toggleNodePin`, `applyPosition`, `dumpAllPositions`) |
| `infoPanel` | app.js | effects.js |
| `showPosControls` | app.js | effects.js (InfoPanel._renderContent) |
| `eventLog` | app.js | app.js only |
| `thridenStream`, `pfStream` | app.js | app.js only |

---

## Common pitfalls

- **d3-force link mutation**: After simulation starts, `link.source` and `link.target` become node objects, not string IDs. All edge lookups must handle both forms: `typeof l.source === 'object' ? l.source.id : l.source`. This applies in `addEdge`, `updateEdge`, `pulseEdges`, `highlightRecall`, `_snapNewConnection`.
- **Always use live graphData**: `this.graph.graphData()` for incremental adds/updates. `this.graphData` (the snapshot copy) is stale after any incremental change.
- **No build step**: Any syntax error anywhere breaks the whole app silently in the browser console. Test by opening index.html directly.
- **Favorites are session-only**: Not persisted anywhere. Lost on page reload.
