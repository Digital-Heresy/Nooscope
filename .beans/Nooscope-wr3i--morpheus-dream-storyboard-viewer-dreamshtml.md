---
# Nooscope-wr3i
title: Morpheus — Dream Storyboard Viewer (dreams.html)
status: completed
type: feature
priority: high
created_at: 2026-04-06T05:20:40Z
updated_at: 2026-04-06T21:54:47Z
parent: Nooscope-ajek
---

New Nooscope page for viewing and rendering dream storyboards. Consumes PF's Morpheus API endpoints.

## Context

PersonaForge now exposes Morpheus endpoints for dream visualization:
- `GET /morpheus/dreams` — list dream logs with storyboard metadata
- `GET /morpheus/dreams/{id}` — full dream with storyboard payload (panels, prompts, cohesion notes)
- `POST /morpheus/dreams/{id}/render` — trigger BFL Flux rendering. Accepts `{"model": "klein"|"pro"}` (default klein). Returns `cost_credits` in response.
- `GET /morpheus/dreams/{id}/panels/{n}` — serve rendered panel as raw PNG bytes
- `GET /morpheus/credits` — check BFL credit balance. Returns `{credits, cost_per_credit_usd}`

Auth: `morpheus_token` (separate from `raven_token`). Bearer token via Authorization header.

## Design

### Page Layout: `dreams.html`

Same scion-picker pattern as `index.html`:
1. **Scion selector** — pick which Scion's dreams to view
2. **Dream timeline** — chronological list of dream cycles (most recent first)
   - Each entry shows: date, duration, cluster count, mutation count, proposal count, panel count
   - Visual indicator: has storyboard? rendered? render model used?
   - Cost badge: credits consumed per dream render (from `render_cost_credits`)
3. **Dream detail view** — expand a dream to see:
   - Storyboard panels (prompt text + rendered image side by side)
   - Cohesion notes and style seed
   - Reflection text (Phase 3 output)
   - Triage summary (what was merged/absorbed/linked)
   - Per-panel cost breakdown (from `rendered_panels[].cost_credits`)
4. **Render controls**:
   - Render button with model selector (Klein default, Pro for upscale)
   - Loading state while BFL generates (~10-15s per panel)
   - Progress indicator (panel 1 establishing shot → panels 2-N parallel)
5. **Credits display** — show BFL balance from `/morpheus/credits` (header or footer)

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
  ├── GET /morpheus/dreams (list view — includes render_model, render_cost_credits)
  ├── GET /morpheus/dreams/{id} (detail view — full storyboard + rendered_panels with cost_credits)
  ├── POST /morpheus/dreams/{id}/render (render button — body: {"model": "klein"|"pro"})
  │     └── response includes cost_credits total
  ├── GET /morpheus/dreams/{id}/panels/{n} (image src)
  └── GET /morpheus/credits (balance display — {credits, cost_per_credit_usd})
```

No WebSocket needed — this is request/response, not real-time streaming. The telemetry WebSocket on index.html handles live `dream_started`/`dream_completed` events.

### API Response Metadata

Fields available on dream list entries (from GET /morpheus/dreams):
- `dream_id`, `scion_id`, `started_at`, `completed_at`, `duration_s`
- `clusters_received`, `mutations_count`, `soul_proposals_count`
- `dream_storyboard.cohesion_notes`, `dream_storyboard.style_seed`
- `rendered_panels_count` — number of successfully rendered panels (0 if unrendered)
- `render_model` — "klein" or "pro" (null if unrendered)
- `render_cost_credits` — total BFL credits consumed (null if unrendered)
- `reflections` — Phase 3 reflection text
- `error` — dream cycle error if any

Fields available per rendered panel (from GET /morpheus/dreams/{id}):
- `index`, `panel_prompt`, `width`, `height`, `content_type`
- `cost_credits` — BFL credits for this specific panel
- `was_filtered` — content moderation flag
- `error` — per-panel error if any
- `image_b64` — base64 image data (available in detail view, not list)

## Checklist

- [x] Create `dreams.html` with scion picker and connection config
- [x] Dream list view: fetch and display dream timeline
- [x] Dream detail view: storyboard panels with prompts and metadata
- [x] Render trigger: POST to /render with model selector (klein/pro), continue mode
- [x] Panel image display: inline base64 from rendered_panels[].image_b64
- [x] Unrendered state: show prompt text in styled placeholder with pulse animation
- [x] Reflection + triage summary display
- [x] Dark dream-journal aesthetic (CSS)
- [x] Link from index.html navigation (Activity / Dreams nav)
- [x] Credits balance display from GET /morpheus/credits
- [x] Cost display: per-dream total and per-panel breakdown (rounded)
- [x] Model selector on render button (Klein default, Pro upscale option)
- [x] Re-render button with force:true for fully rendered dreams
- [x] Per-scion morpheus_token storage in localStorage
- [x] Dream detail caching (fully rendered dreams served instantly)
- [x] Docker deployment: nginx per-scion proxy routing (Engram/PF/Morpheus)
- [ ] PF-side: has_content=true filter needs tightening (returns empty dreams)

## Dependencies

- PF Morpheus endpoints (complete — `forge/core/health.py`, `forge/dreams/renderer.py`)
- BFL_API_KEY configured in PF environment (done)
- At least one dream cycle with `dream_visuals_enabled: true` (Speaker + Helix already configured)