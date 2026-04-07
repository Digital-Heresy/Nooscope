---
# Nooscope-cj8w
title: 'Telemetry Brain Region Mapping: PF Reflex Categories & Engram Events'
status: done
type: feature
created_at: 2026-04-06T01:53:28Z
updated_at: 2026-04-06T01:53:28Z
parent: Nooscope-mbfj
---

Connect Nooscope to PersonaForge's public WebSocket telemetry stream and render PF cognitive events as reflex-category activity nodes.

## Context

PF will expose `GET /ws/telemetry/public` (no auth, content-stripped) alongside the existing authenticated `/ws/telemetry`. The public stream shows the **shape** of cognition without revealing content. Full spec: [Telemetry — Public and Authenticated Streams](https://github.com/Digital-Heresy/PersonaForge/wiki/Telemetry-—-Public-and-Authenticated-Streams)

## Brain Region Mapping

### PersonaForge Events

PF events don't map to Engram's node/edge graph. Instead, they group into six "reflex categories" — each rendered as a capability node that pulses on activity:

| Category | Events | Brain Region | Rationale |
|----------|--------|-------------|-----------|
| **Recall** | `recall_fired`, `memory_promoted` | Temporal Lobe | Retrieval — the brain searching and finding (hippocampal recall) |
| **Formation** | `memory_formed`, `working_memory_updated` | Temporal Lobe | Creation — new memories crystallizing (hippocampal encoding) |
| **Social** | `session_created`, `session_expired` | Frontal Lobe | Engagement — the brain interfacing with the world (social cognition, prefrontal) |
| **Agency** | `pi_text_delta`, `pi_tool_result`, `action_completed` | Cerebellum | Execution — the brain acting on decisions (motor output) |
| **Circadian** | `dream_started`, `dream_completed`, `dream_storyboard_ready`, `cron_fired` | Thalamus | Sleep/wake rhythm — the autonomic cycle (sleep-state gatekeeper) |
| **Vital** | `backup_completed` | Brainstem | Maintenance — housekeeping for survival (autonomic regulation) |

### Engram Events

Engram events map directly to the memory graph — nodes and edges firing in real time.

| Event | Trigger | Brain Region | Rationale |
|-------|---------|-------------|-----------|
| `snapshot` | WebSocket connect | — (diagnostic) | Full graph state dump, not a cognitive event |
| `node_created` | POST /ingest | Temporal Lobe | Hippocampus — new memory encoding |
| `node_activated` | Query results (each hit) | Temporal Lobe | Hippocampus — retrieval re-activates existing traces |
| `edge_created` | Hebbian threshold crossed (co-retrieval count) | Frontal Lobe | Prefrontal association — "this goes with that" judgment |
| `edge_reinforced` | Hebbian reinforcement (co-retrieved pair) | Frontal Lobe | Prefrontal pattern recognition — edges strengthen through repeated co-activation |
| `decay_pass_completed` | Background decay worker | Brainstem | Synaptic homeostasis — overnight downscaling of weak connections |
| `nap_completed` | POST /admin/nap | Brainstem | Janitorial cleanup — autonomic maintenance |
| `graph_wiped` | POST /admin/wipe (dev-only) | Brainstem | Lobotomy — catastrophic reset |
| `sleep_completed` | POST /admin/sleep | Thalamus | Sleep-state gatekeeper — orchestrates consolidation cycle |

**Frequency note:** Temporal lobe events dominate by volume (every ingest, every query hit). Frontal/Hebbian events fire in O(n²) bursts after queries. Brainstem maintenance events are rare — once every few hours at most.

### Consolidated Region Summary

| Brain Region | PF Categories | Engram Events | Signal Density |
|---|---|---|---|
| **Temporal Lobe** | Recall, Formation | node_created, node_activated | Highest — fires on every ingest and query |
| **Frontal Lobe** | Social | edge_created, edge_reinforced | High — O(n²) bursts after queries |
| **Cerebellum** | Agency | — | Medium — tool calls, action completions |
| **Thalamus** | Circadian | sleep_completed | Low — sleep cycles, cron jobs |
| **Brainstem** | Vital | decay_pass, nap, graph_wiped | Rare — maintenance events every few hours |

Every region receives signal from at least one service. Temporal and Frontal get signal from both, ensuring the brain feels alive even with only one service connected.

## PF Public Stream — What's Available

Events on the public stream carry structural metadata only. Content-revealing fields (queries, text previews, session/chat IDs, note IDs) are stripped.

### What each event sends on public:

**Recall:**
- `recall_fired` → `scopes_searched`, `node_count` (derived from node_ids length)
- `memory_promoted` → `scope`, `salience`

**Formation:**
- `memory_formed` → `scope`, `source`, `salience`
- `working_memory_updated` → event type + timestamp only

**Social:**
- `session_created` → `chat_type`
- `session_expired` → `message_count`, `participant_count`

**Agency:**
- `pi_text_delta` → **SUPPRESSED** (pure content, no structural signal)
- `pi_tool_result` → `tool`, `is_error`
- `action_completed` → `tool_count`, `duration_s`, `error` (bool only)

**Circadian:**
- `dream_started` → `dream_id`
- `dream_completed` → `dream_id`, `duration_s`, `clusters_triaged`, `mutations`, `soul_proposals`, `storyboard_panels`, `error` (bool)
- `dream_storyboard_ready` → `dream_id`, `panel_count`
- `cron_fired` → `schedule`

**Vital:**
- `backup_completed` → `zip_size_bytes`, `duration_s`

## Envelope Format

Same as Engram telemetry, with added `category` field:
```json
{
  "type": "recall_fired",
  "scion_id": "dh-speaker",
  "timestamp": "2026-04-05T23:15:00.000Z",
  "category": "recall",
  "payload": { ... }
}
```

## PF Endpoints

Per-Scion ports (from docker-compose):
- Speaker: `localhost:8100`
- Helix: `localhost:8101`

Public stream: `ws://localhost:{port}/ws/telemetry/public`

## Checklist

- [ ] Add PF WebSocket connections to Nooscope backend (alongside Engram connections)
- [ ] Create reflex-category node layout (6 nodes arranged as a nervous system diagram)
- [ ] Map incoming PF events to their reflex category
- [ ] Pulse/glow animation on category node when events fire
- [ ] Activity intensity scaling (rapid events = brighter/faster pulse)
- [ ] Category node labels and event count badges
- [ ] Handle PF connection lifecycle (reconnect on drop, show offline state)