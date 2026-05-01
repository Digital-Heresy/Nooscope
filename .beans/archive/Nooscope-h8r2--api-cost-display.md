---
# Nooscope-h8r2
title: 'API Cost Display: Claude spend on Activity page'
status: abandoned
type: feature
created_at: 2026-04-07T00:00:00Z
updated_at: 2026-04-22T00:00:00Z
parent: Nooscope-ajek
---

**Abandoned 2026-04-22** — the Anthropic API has no first-class endpoint for per-request cost or account balance. The only path is inferring spend from token counts × model-specific rate cards, which drifts whenever pricing changes and is always approximate. BFL credits are shown on the Dreams page because BFL *does* expose explicit credit data; Claude doesn't, and fuzzy cost math isn't worth building or maintaining. Re-open if Anthropic publishes a billing/usage endpoint.

## Original description

Show Claude API remaining balance / spend on the Activity page status bar, similar to how BFL credits are shown on the Dreams page.

## Open questions

- Does Anthropic expose a billing/usage API endpoint?
- If not, can PF surface this data (it makes the API calls)?
- What format: remaining balance, daily spend, token counts, or USD estimate?

## Design

Status bar element showing cost info. Refreshes periodically or on connect.
