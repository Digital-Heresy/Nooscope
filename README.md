# Nooscope

3D memory visualization for the [MindHive](https://github.com/Digital-Heresy/MindHive) cognitive stack.

Nooscope is the "MRI machine" for AI cognition — it observes structural signals (nodes, edges, activation) from [Engram](https://github.com/Digital-Heresy/MindHive) and behavioral signals (recall, memory formation, dreams) from [PersonaForge](https://github.com/Digital-Heresy/PersonaForge), rendering them as a live 3D force-directed brain graph.

## Pages

| Page | Purpose |
|------|---------|
| **Activity** (`index.html`) | Live 3D brain visualizer — WebSocket telemetry from Engram + PersonaForge |
| **Dreams** (`dreams.html`) | Morpheus dream storyboard viewer — browse, render, and view AI dream cycles |

## Quick Start

### Local Development

No build tools, no npm. Just HTML + JS + CDN deps.

1. Ensure Engram and PersonaForge are running with telemetry enabled
2. Copy `js/config.example.js` to `js/config.js` and set your ports
3. Serve the directory over HTTP (e.g., `python -m http.server 8080`)
4. Open `http://localhost:8080`

URL params for auto-connect: `?scion=speaker`, `?scion=helix`

### Docker (recommended)

Nooscope runs as part of the MindHive docker-compose stack:

```bash
docker compose up --build nooscope -d
```

Access at `http://localhost:8080`. The nginx proxy handles routing to Engram and PersonaForge backends — no CORS issues, no direct port access needed.

## Architecture

```
Browser
  ├── index.html (Activity)
  │   ├── ws → Engram /ws/telemetry[/public]     (snapshot, node/edge events)
  │   └── ws → PersonaForge /ws/telemetry[/public] (recall, sessions, dreams)
  │
  └── dreams.html (Dreams)
      └── REST → PersonaForge /morpheus/*          (dream list, detail, render)

Docker: nginx reverse-proxies all endpoints per-scion (/speaker/*, /helix/*)
```

### JS Modules (plain `<script>` tags, order matters)

1. **`js/config.js`** — `NOOSCOPE_CONFIG` with scion presets (ports, hosts)
2. **`js/stream.js`** — `TelemetryStream` WebSocket client with exponential-backoff reconnect
3. **`js/graph.js`** — `MemoryGraph` + `RegionGeometry` — 3D force-directed graph with layered brain topology
4. **`js/effects.js`** — `EventLog`, `InfoPanel` UI classes
5. **`js/app.js`** — Activity page entry point, event dispatch, public/admin mode
6. **`js/dreams.js`** — Dreams page, Morpheus REST client, storyboard rendering

## Authentication

**Activity page**: Two modes controlled via the status bar lock icon.
- **Public mode** — connects to `/ws/telemetry/public` (no auth, content-stripped)
- **Admin mode** — connects to `/ws/telemetry` with `Sec-WebSocket-Protocol: bearer.<token>` subprotocol auth. Token stored in `sessionStorage` (clears on tab close).

**Dreams page**: Uses `morpheus_token` (separate from raven token) stored per-scion in `localStorage`. Sent as `Authorization: Bearer <token>` on REST requests.

## Configuration

`js/config.js` is gitignored. Copy from `js/config.example.js`:

```js
const NOOSCOPE_CONFIG = {
  scions: {
    speaker: { thriden: 3030, pf: 8100 },
    helix:   { thriden: 3031, pf: 8101 },
  },
  defaults: {
    thridenPort: 3030,
    pfPort: 8100,
  },
};
```

In Docker, `docker-entrypoint.sh` generates this from environment variables. Set `NOOSCOPE_HOST` for production (adds per-scion proxy prefixes).

## What You See

### Activity Page

- **Nodes** — sized by activation count, colored by scope (pink=self, green=universal, blue=other/intimate)
- **Edges** — width by weight, colored by origin (orange=co-activation, white=explicit, purple=semantic clustering)
- **Layout** — brain-topology regions with layered consolidation depth (episodic=surface, cluster=mid, abstract=core)
- **Pulses** — nodes flash on activation, birth glow on creation
- **Recall arcs** — particles flow along edges when memories are recalled

### Dreams Page

- **Timeline** — chronological dream list with stat badges (clusters, mutations, proposals, panels)
- **Storyboard** — panel images with entry-type badges, prompts, cohesion notes
- **Render** — trigger BFL Flux image generation (Klein/Pro models), continue mode for partial renders
- **Credits** — BFL balance display with USD estimate

## License

AGPL-3.0

## Wiki

See the [Nooscope Wiki](https://github.com/Digital-Heresy/Nooscope/wiki) for detailed documentation.
