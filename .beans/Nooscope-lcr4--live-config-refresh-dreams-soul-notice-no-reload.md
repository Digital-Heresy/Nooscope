---
# Nooscope-lcr4
title: 'Live config refresh — dreams SOUL notice updates without a page reload'
status: todo
type: task
created_at: 2026-06-22T00:00:00Z
updated_at: 2026-06-22T00:00:00Z
---

Follow-up to Nooscope-rl8v. rl8v made the container re-fetch `/scions` and rewrite
`config.js` on an interval, but an already-open page still shows the *baked-at-load*
values until a manual reload — `config.js` is a `const NOOSCOPE_CONFIG = {...}` loaded
once via `<script>`. So a flipped `soul_managed` self-heals on next load, not live.

**Goal:** on `dreams.html`, the SOUL-in-Git notice appears/clears within an interval
of the operator flipping `soul_managed`, no reload.

**Approach:** a small `fetchFreshConfig()` helper re-fetches `/js/config.js` (already
served `no-store`) and evaluates it in an isolated scope —
`new Function(text + '; return NOOSCOPE_CONFIG;')()` — returning the fresh object
(robust real-JS parse, no fragile regex; the app has no CSP so `new Function` is fine,
and the source is same-origin trusted). `dreams.js` polls while connected and re-runs
`showSoulRepoNotice` for the connected Scion's fresh `soulRepo`. Keep the helper reusable
so `social.js`/`app.js` badge labels can adopt it later (out of scope here).

Acceptance: with the page open on a Scion's dreams view, flipping `soul_managed` on PF
shows/hides the notice within one poll interval without reloading.
