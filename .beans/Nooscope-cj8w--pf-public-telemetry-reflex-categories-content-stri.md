---
# Nooscope-cj8w
title: 'PF Public Telemetry: Reflex Categories & Content Stripping'
status: todo
type: feature
created_at: 2026-04-06T01:53:28Z
updated_at: 2026-04-06T01:53:28Z
parent: Nooscope-mbfj
---

Connect Nooscope to PersonaForge's public WebSocket telemetry stream and render PF cognitive events as reflex-category activity nodes.

## Context

PF will expose `GET /ws/telemetry/public` (no auth, content-stripped) alongside the existing authenticated `/ws/telemetry`. The public stream shows the **shape** of cognition without revealing content. Full spec: [Telemetry — Public and Authenticated Streams](https://github.com/Digital-Heresy/PersonaForge/wiki/Telemetry-—-Public-and-Authenticated-Streams)

## Reflex Categories

PF events don't map to Engram's node/edge graph. Instead, they group into six "reflex categories" — each rendered as a capability node that pulses on activity:

| Category | Events | Visual Metaphor |
|----------|--------|-----------------|
| **Recall** | `recall_fired`, `memory_promoted` | Retrieval — the brain searching and finding |
| **Formation** | `memory_formed`, `working_memory_updated` | Creation — new memories crystallizing |
| **Social** | `session_created`, `session_expired` | Engagement — the brain interfacing with the world |
| **Agency** | `pi_text_delta`, `pi_tool_result`, `action_completed` | Execution — the brain acting on decisions |
| **Circadian** | `dream_started`, `dream_completed`, `dream_storyboard_ready`, `cron_fired` | Sleep/wake rhythm — the autonomic cycle |
| **Vital** | `backup_completed` | Maintenance — housekeeping for survival |

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