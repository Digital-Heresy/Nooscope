---
# Nooscope-h8r2
title: 'API Cost Display: Claude spend on Activity page'
status: todo
type: feature
created_at: 2026-04-07T00:00:00Z
updated_at: 2026-04-07T00:00:00Z
parent: Nooscope-ajek
---

Show Claude API remaining balance / spend on the Activity page status bar, similar to how BFL credits are shown on the Dreams page.

## Open questions

- Does Anthropic expose a billing/usage API endpoint?
- If not, can PF surface this data (it makes the API calls)?
- What format: remaining balance, daily spend, token counts, or USD estimate?

## Design

Status bar element showing cost info. Refreshes periodically or on connect.
