---
# Nooscope-wr3i
title: Morpheus — Dream Storyboard Viewer (dreams.html)
status: todo
type: feature
priority: high
created_at: 2026-04-06T05:20:40Z
updated_at: 2026-04-06T05:20:40Z
parent: Nooscope-ajek
---

New Nooscope page for viewing and rendering dream storyboards. Consumes PF's Morpheus API endpoints.

## Context

PersonaForge now exposes Morpheus endpoints for dream visualization:
- `GET /morpheus/dreams` — list dream logs with storyboard metadata
- `GET /morpheus/dreams/{id}` — full dream with storyboard payload (panels, prompts, cohesion notes)
- `POST /morpheus/dreams/{id}/render` — trigger fal.ai Flux Kontext Pro rendering (stores images in MongoDB)
- `GET /morpheus/dreams/{id}/panels/{n}` — serve rendered panel as raw PNG bytes

Auth: `morpheus_token` (separate from `raven_token`). Bearer token via Authorization header.

## Design

### Page Layout: `dreams.html`

Same scion-picker pattern as `index.html`:
1. **Scion selector** — pick which Scion's dreams to view
2. **Dream timeline** — chronological list of dream cycles (most recent first)
   - Each entry shows: date, duration, cluster count, mutation count, proposal count, panel count
   - Visual indicator: has storyboard? rendered?
3. **Dream detail view** — expand a dream to see:
   - Storyboard panels (prompt text + rendered image side by side)
   - Cohesion notes and style seed
   - Reflection text (Phase 3 output)
   - Triage summary (what was merged/absorbed/linked)
4. **Render button** — trigger rendering for unrendered storyboards
   - Loading state while fal.ai generates (~5-15s per panel)
   - Progress indicator (panel 1 establishing shot → panels 2-N parallel)

### Visual Style

Dream-appropriate aesthetic — darker palette than the main brain visualizer. The storyboard viewer should feel like looking through a dream journal, not a dashboard.

- Panel images displayed in sequence (horizontal scroll or vertical strip)
- Each panel shows: entry_type badge, source_summary, the image, panel_prompt (collapsed by default)
- Scene notes and cohesion notes as connecting tissue between panels
- Unrendered panels show the prompt text in a styled placeholder

### Connection Config

Same pattern as index.html — user provides:
- PF host + port (e.g. `localhost:8100`)
- Morpheus token (stored in localStorage)

### Data Flow

```
dreams.html
  ├── GET /morpheus/dreams (list view)
  ├── GET /morpheus/dreams/{id} (detail view)
  ├── POST /morpheus/dreams/{id}/render (render button)
  └── GET /morpheus/dreams/{id}/panels/{n} (image src)
```

No WebSocket needed — this is request/response, not real-time streaming. The telemetry WebSocket on index.html handles live `dream_started`/`dream_completed` events.

## Checklist

- [ ] Create `dreams.html` with scion picker and connection config
- [ ] Dream list view: fetch and display dream timeline
- [ ] Dream detail view: storyboard panels with prompts and metadata
- [ ] Render trigger: POST to /render, poll for completion, display results
- [ ] Panel image display: `<img src="/morpheus/dreams/{id}/panels/{n}">` with auth header
- [ ] Unrendered state: show prompt text in styled placeholder
- [ ] Reflection + triage summary display
- [ ] Dark dream-journal aesthetic (CSS)
- [ ] Link from index.html navigation (if applicable)

## Dependencies

- PF Morpheus endpoints (complete — `forge/core/health.py`, `forge/dreams/renderer.py`)
- FAL_KEY configured in PF vault (user action — fal.ai signup)
- At least one dream cycle with `dream_visuals_enabled: true` (Speaker + Helix already configured)