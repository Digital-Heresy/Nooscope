---
# Nooscope-mbfj
title: 'PersonaForge Neural Activity: Signal Flow Visualization'
status: todo
type: epic
priority: normal
created_at: 2026-04-05T00:00:00Z
updated_at: 2026-04-05T00:00:00Z
parent: Nooscope-ajek
---

Visualize PersonaForge's behavioral events as transient neural signals flowing across the Engram memory structure — making the brain look *alive* rather than static.

## What we have

PF telemetry events currently trigger minimal visual effects:

- `recall_fired` — pulses recalled node IDs + directional particles for 3s
- `memory_formed` — no-op (waits for Thriden's node_created)
- `session_created` — text status banner
- `session_expired` — text status banner, fades after 5s
- `working_memory_updated` — event log entry only

These are point-in-time flashes with no sense of flow, origin, or pathway.

## What needs to change

PF events represent the brain *doing things*. They should feel like neural impulses traveling through the network:

### Recall as signal propagation
- `recall_fired` returns a set of node_ids. Currently we pulse them all simultaneously.
- Should visualize as a **wavefront**: signal originates from a trigger point and propagates outward along edges to the recalled nodes, with visible travel time.
- Recall pathways (the edges connecting recalled nodes) should light up as a transient subgraph.

### Memory formation as growth
- `memory_formed` is the birth of a new memory. Currently invisible until Thriden emits `node_created`.
- Should show an **inbound signal** — a pulse traveling from the PF "input region" toward the location where the new node will appear.
- When the node materializes (via Thriden's node_created), the birth glow should connect to the formation signal.

### Session lifecycle as ambient state
- `session_created` / `session_expired` currently just toggle a text banner.
- Active sessions should create a subtle ambient effect — a gentle glow or hum around the graph indicating the brain is "awake" and processing.
- Multiple session types (chat_type) could have different ambient signatures.

### Working memory as spotlight
- `working_memory_updated` is currently just a log line.
- Should highlight the active working set — the nodes currently in working memory get a distinct visual treatment (glow ring, elevated brightness) that persists until the next update.

### Actions spawned / taken
- Future PF events for actions being dispatched should visualize as **outbound signals** — impulses traveling from decision nodes toward the periphery, representing the brain sending commands.

## Children (implementation order)

1. **Nooscope-rnrm** — Working Memory Spotlight
2. **Nooscope-4xpf** — Session Ambient State
3. **Nooscope-yy0y** — Recall Wavefront Propagation (best after v60v fwob)
4. **Nooscope-0bp4** — Memory Formation Signal (deps: v60v fwob)
5. **Nooscope-niac** — Outbound Action Signals (future stub)
