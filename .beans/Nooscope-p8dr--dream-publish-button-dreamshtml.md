---
# Nooscope-p8dr
title: Dream publish button in dreams.html
status: completed
type: feature
priority: normal
created_at: 2026-04-22T00:00:00Z
updated_at: 2026-04-22T00:00:00Z
parent: Nooscope-ajek
---

Rider on [PersonaForge-p4ch](../../../PersonaForge/.beans/PersonaForge-p4ch--publish-dreams-to-discord-telegram.md). PF owns the channel config, the slash commands, and the actual send. Nooscope's job is a button per platform in `dreams.html` that POSTs to the new publish endpoint and shows the result.

## Context

PF-p4ch adds two new Morpheus endpoints:
- `GET /morpheus/dream_channels` — returns `{discord?: {guild_name, channel_name, ...}, telegram?: {chat_title, chat_type, ...}}`. Keys omitted if not configured on that platform. Friendly names only, no raw IDs.
- `POST /morpheus/dreams/{id}/publish` — body `{"platform": "discord" | "telegram"}`. Returns `{ok, message_ids}` on success or `{ok: false, error}` with a 502 on failure.

Auth: same `morpheus_token` bearer as the rest of `/morpheus/*`.

## Design

### Channel config fetch

On connect (after `fetchDreamList` / `fetchCredits` fires), call `GET /morpheus/dream_channels` once and cache in `DreamState.dreamChannels`. No periodic refresh — `/setdreamchannel` is rare; re-fetch on reconnect is enough. Silent-ignore on 404 (same pattern as `/morpheus/credits`) so an older PF that doesn't implement the endpoint doesn't break the page.

### UI placement

In `renderDreamDetail`, next to the existing Render / Re-render button(s). One publish button per configured platform, only rendered when `allRendered` is true (no point publishing a half-rendered storyboard). Labels:

- Discord: `📤 Post to #{channel_name}` (tooltip: `{guild_name}`)
- Telegram: `📤 Post to {chat_title}` (tooltip: `{chat_type}`)

If neither platform is configured, no buttons appear — that's the user's signal to run `/setdreamchannel` in the target channel.

### Click handler

1. Disable the button, swap label to `📤 Posting…`.
2. `POST /morpheus/dreams/{id}/publish` with `{platform}`.
3. On success (`ok: true`): toast *"Posted to #dreamlog"*, re-enable button, label back to normal. No dialog.
4. On failure: toast the `error` field from the response. Common ones to expect per PF-p4ch's error taxonomy:
   - `"no dream channel configured for discord"` — shouldn't happen since we gated rendering on it, but handle defensively
   - `"dream has no rendered panels"` — ditto
   - `"channel may have been removed"` — suggest re-running `/setdreamchannel`
   - `"platform adapter offline"` — bot is down
5. Re-enable on failure regardless; the user can retry.

### No confirmation dialog in v1

Publishing is cheap (no credits, no destructive action). A misclick posts one extra message that the user can delete in the destination platform. Not worth a blocking confirm for now. If it turns out to be annoying in practice, add a one-line `confirm()` gate.

### Toast system

There's no toast component in Nooscope today — `dreams.js` uses `console.warn` / `console.error` for API failures. Add a minimal toast helper (one function, ~30 lines of JS + a handful of CSS rules in `dreams.css`). Bottom-right, auto-dismiss after ~4s, stacking if multiple. Reusable for future endpoints.

## Checklist

- [ ] `DreamState.dreamChannels` state + `fetchDreamChannels()` call after connect
- [ ] Minimal toast helper (`showToast(message, {kind: "success"|"error"})`)
- [ ] Publish button(s) in `renderDreamDetail`, per configured platform, behind `allRendered` gate
- [ ] Click handler: POST publish, disable-during-request, toast on result
- [ ] Style the publish button to sit comfortably next to Render / Re-render (existing `.detail-actions` row)
- [ ] Test: both platforms, neither, single platform; 502 paths; double-click debounce is natural from the disabled state
- [ ] Rebuild nooscope container and verify end-to-end once PF-p4ch lands

## Dependencies

- **PF-p4ch** must ship first. Until the new endpoints exist, `GET /morpheus/dream_channels` 404s and no buttons render — which is the correct fallback, so this can be merged opportunistically but will be dormant until PF catches up.
