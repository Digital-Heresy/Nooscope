# Nooscope

3D memory visualization for [Thriden](https://github.com/Digital-Heresy/MindHive) + [PersonaForge](https://github.com/Digital-Heresy/PersonaForge) telemetry.

Nooscope is the "MRI machine" -- it observes both structural signals (nodes, edges, activation) from Thriden and behavioral signals (recall events, memory formation, sessions) from PersonaForge, rendering them as a live 3D force-directed graph.

## Quick Start

1. Make sure Thriden and PersonaForge are running with WebSocket telemetry enabled
2. Open `index.html` in a browser
3. Select a scion (Speaker/Helix) or enter custom ports
4. Click Connect

Or open directly with URL params:

```
index.html?scion=speaker
index.html?thriden=3030&pf=8100
```

## Requirements

- A modern browser (Chrome, Firefox, Edge)
- Thriden instance with `/ws/telemetry` endpoint (v0.2.6+)
- PersonaForge instance with `/ws/telemetry` endpoint (optional, for behavioral events)

No build tools, no npm, no dependencies to install. Just HTML + JS.

## Configuration

All connection settings live in `js/config.js` — a plain JS file that declares a single `NOOSCOPE_CONFIG` global. The scion dropdown, ports, and auth tokens are all driven from this file.

```js
const NOOSCOPE_CONFIG = {
  scions: {
    speaker: { thriden: 3030, pf: 8100, token: 'your-raven-token-here' },
    helix:   { thriden: 3031, pf: 8101, token: 'your-raven-token-here' },
  },
  defaults: {
    thridenPort: 3030,
    pfPort: 8100,
  },
};
```

### Authentication

Both Thriden and PersonaForge require a bearer token on the WebSocket upgrade request. Since browser `WebSocket` doesn't support custom headers, Nooscope uses the subprotocol trick — the token is sent as `Sec-WebSocket-Protocol: bearer.<token>` and the server echoes it back in the 101 response.

Named scion presets include their tokens in the config. For custom connections, enter the token in the connection dialog.

### Docker

When containerized, override `config.js` via volume mount:

```yaml
services:
  nooscope:
    image: nooscope
    volumes:
      - ./nooscope-config.js:/app/js/config.js
```

Or generate it from environment variables at container startup with an entrypoint script:

```sh
#!/bin/sh
cat > /app/js/config.js <<EOF
const NOOSCOPE_CONFIG = {
  scions: {
    speaker: { thriden: ${SPEAKER_THRIDEN_PORT:-3030}, pf: ${SPEAKER_PF_PORT:-8100}, token: '${SPEAKER_TOKEN}' },
    helix:   { thriden: ${HELIX_THRIDEN_PORT:-3031}, pf: ${HELIX_PF_PORT:-8101}, token: '${HELIX_TOKEN}' },
  },
  defaults: {
    thridenPort: ${DEFAULT_THRIDEN_PORT:-3030},
    pfPort: ${DEFAULT_PF_PORT:-8100},
  },
};
EOF
exec nginx -g 'daemon off;'
```

## What You See

- **Nodes** -- sized by activation count, colored by scope (blue=about someone, pink=self-reflection, green=knowledge)
- **Edges** -- width by association weight, colored by origin (orange=co-activation, white=explicit, purple=semantic)
- **Pulses** -- nodes flash when activated by a query
- **Recall arcs** -- when PersonaForge recalls memories, particles flow along the edges connecting recalled nodes
- **Live updates** -- new nodes fade in, edges thicken as they're reinforced

## Architecture

```
Nooscope (browser)
  |
  |-- ws://localhost:{thriden_port}/ws/telemetry
  |     snapshot on connect, then node_activated, node_created, edge_*
  |
  |-- ws://localhost:{pf_port}/ws/telemetry
  |     recall_fired, memory_formed, session_*, working_memory_updated
```

## License

AGPL-3.0
