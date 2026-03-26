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
