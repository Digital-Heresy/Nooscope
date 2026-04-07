---
# Nooscope-niac
title: 'Outbound Action Signals'
status: done
type: feature
priority: low
created_at: 2026-04-05T00:00:00Z
updated_at: 2026-04-05T00:00:00Z
parent: Nooscope-mbfj
---

Forward-looking stub for visualizing future PF action dispatch events as outbound impulses radiating from decision nodes.

## What to build

- **Outbound signal**: expanding ring or particle burst originating at a node, traveling outward toward graph periphery
- **Distinct visual**: warm color, expanding geometry — clearly different from inbound formation signals
- **Stub handler**: case in `handleEvent()` for `action_dispatched` (or whatever the PF event name becomes)

## Checklist

- [ ] New `showOutboundSignal(nodeId, color, durationMs)` in MemoryGraph
- [ ] Expanding ring mesh that grows and fades from node position
- [ ] Stub `action_dispatched` case in `handleEvent()` switch

## Dependencies

PF event type doesn't exist yet — stub only, wire up when available.
