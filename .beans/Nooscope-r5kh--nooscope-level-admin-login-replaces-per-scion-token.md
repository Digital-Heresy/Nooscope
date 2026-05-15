---
# Nooscope-r5kh
title: Nooscope-level admin login (replaces per-Scion raven token UX)
status: completed
type: feature
priority: high
created_at: 2026-05-10T00:00:00Z
updated_at: 2026-05-15T00:00:00Z
---

Replace Nooscope's current "user supplies a Scion's raven_token" auth UX
with a single Nooscope-level admin login that gates "seeing extra stuff"
on every page. Per-Scion upstream credentials move to env vars and stay
server-side; the browser never handles them.

## Why

The current model from Nooscope-kyyw treats admin mode as "do you possess
a Scion's raven_token". That worked while every admin route was per-Scion
and the upstream validated the token. Two recent changes broke its tidy
posture:

1. **Cross-Scion admin views.** Nooscope-nkvw added the social-graph view
   which talks to PF's admin web (`forge-web:8200`) — a single shared
   service that knows about every Scion and has zero app-layer auth.
   Per-Scion raven_tokens don't validate against it. We added a
   nginx-side "any non-empty Authorization header" gate as a soft
   patch, but it doesn't actually enforce per-Scion access — log in
   with Speaker's token and you can swap the dropdown to Helix and see
   their data without re-prompting (live-reproduced 2026-05-10).

2. **Conceptual mismatch.** "Am I a Nooscope admin" is the question the
   UI is actually asking, not "do I hold THIS Scion's token". Forcing
   the user to think about per-Scion tokens drags upstream-internal
   state into the visualizer's UX.

This bean separates the two concerns: a Nooscope-level admin secret
controls UI privilege; per-Scion upstream credentials live in env on
the Nooscope server and get injected into outbound proxy requests.

## Per-page UX target

- **Activity** (`index.html`): not logged in → public stream (existing
  `/ws/telemetry/public`). Logged in → privileged stream
  (`/ws/telemetry`) which currently carries the same content-stripped
  data per Nooscope-kyyw, but unlocks admin-only affordances as those
  ship (Nooscope-kyyw notes manual edge creation, consolidation
  controls, REST `GET /node/{id}` for content read). Remove the
  raven-token dialog entirely.

- **Dreams** (`dreams.html`): not logged in → dream timeline reads,
  visible. Hidden when not admin: storyboard panel rendering, post to
  dreamlog, credits-remaining stat. Logged in → all of the above
  unlocked. Remove the morpheus-token dialog entirely.

- **Social** (`social.html`): not logged in → "Social" nav link hidden
  on every page; if URL hit directly, page renders the login modal
  immediately and stays empty until login. Logged in → full
  functionality.

## Architecture

### Auth secret

- Single `NOOSCOPE_ADMIN_PASSWORD` env var (or token — same shape).
  Configured in MindHive's `.env` (kept out of git) and passed through
  to the Nooscope service via docker-compose.
- `docker-entrypoint.sh` writes the value into `js/config.js`'s
  `NOOSCOPE_CONFIG.adminHash` as a SHA-256 hex digest. Plaintext never
  reaches the browser.
- Login modal: input → SHA-256 → compare against the configured hash.
  On match, set `sessionStorage['nooscope_admin'] = 'true'`.
- Threat model: single-creator localhost incubator. Soft hash compare
  is fine — anyone with shell on the Nooscope host can read the env
  var directly anyway. If we ever expose Nooscope to a real network, a
  small backend session-cookie service replaces this; the bean
  acknowledges the limitation but doesn't build for it yet.

### Per-Scion upstream credentials

- Per-Scion env vars live in MindHive's `.env`:
  `RAVEN_TOKEN_SPEAKER`, `RAVEN_TOKEN_HELIX`, `MORPHEUS_TOKEN_SPEAKER`,
  `MORPHEUS_TOKEN_HELIX`, plus a single `FORGE_WEB_ADMIN_TOKEN` for
  the cross-Scion admin web (depends on PersonaForge-side auth for
  forge-web — sister bean, see below).
- `docker-entrypoint.sh` runs `envsubst` on a `nginx.conf.template` at
  container start, materializing the tokens directly into the
  rendered `nginx.conf`. Tokens stay in container memory; they don't
  reach `js/config.js`.
- nginx routes inject the right token per upstream:
  - `/speaker/ws/telemetry` (admin variant): `Sec-WebSocket-Protocol:
    bearer.$RAVEN_TOKEN_SPEAKER` injected by nginx during the
    upstream upgrade. Browser opens the WS unauthenticated; nginx
    adds the subprotocol header before forwarding.
  - `/speaker/morpheus/...`: `Authorization: Bearer
    $MORPHEUS_TOKEN_SPEAKER` injected.
  - `/admin/scions/.../social-graph`: `Authorization: Bearer
    $FORGE_WEB_ADMIN_TOKEN` injected (once forge-web auth lands).
- Nginx admin routes 401 unless the request carries a Nooscope
  session cookie / header that signals "admin session". The session
  marker is just a known-key cookie set client-side after the modal
  login passes. (Same soft-gate posture as the auth secret itself —
  real session cookies require a backend.)

### Login modal

- One shared modal partial included on all three pages (already mostly
  shaped — the existing `#admin-dialog` overlay is the seed; rename to
  generalize and de-Scion-specify the copy).
- Triggered by:
  1. Existing lock-icon button in the status bar (any page)
  2. Auto-open on page load when `social.html` loads without an admin
     session
- "Logout" button clears `sessionStorage` and reloads the page so each
  surface re-evaluates its admin gate.

### Per-page gate hooks

- Centralize the admin check in a small shared module (e.g.,
  `js/auth.js`) exposing `isAdmin()`, `requireAdmin()`,
  `onAdminStateChange(callback)`. Each page imports it; the per-page
  JS uses the change callback to show/hide affordances reactively.
- Nav-link visibility (Social hidden when public) is controlled
  server-side in the future (nginx-rendered template) but for v0 a
  client-side `display: none` toggle is fine — the route gate is the
  real defense.

## Acceptance

- [ ] Login modal opens on lock-icon click on every page; same
      experience across index/dreams/social.
- [ ] `NOOSCOPE_ADMIN_PASSWORD` env var → SHA-256 hash → injected
      into config.js by docker-entrypoint.
- [ ] Successful login sets `sessionStorage['nooscope_admin']`; the
      lock icon flips to "open"; the badge flips to "ADMIN".
- [ ] Activity page: in admin mode, connects to `/ws/telemetry`
      (privileged); in public mode, `/ws/telemetry/public`. No raven
      token dialog anywhere.
- [ ] Dreams page: morpheus token dialog removed. Timeline reads in
      both modes; storyboard render / dreamlog post / credits stat
      gated on admin.
- [ ] Social page: nav link hidden in public mode; landing on the URL
      directly opens the login modal automatically and shows nothing
      else.
- [ ] All upstream credentials (raven, morpheus, forge-web) live in
      env vars; `js/config.js` carries no tokens.
- [ ] nginx config materializes per-Scion tokens via envsubst at
      container start; tokens never leak to client.
- [ ] Logout clears the session and reloads to re-evaluate gates.

## Out of scope

- **Multi-user.** Single-creator instance; one password, no roles.
- **Real session cookies / HMAC tokens.** Soft gate today; backend
  session service is a future bean if we ever go network-facing for
  real (the existing kyyw bean's framing).
- **PF admin-web auth.** forge-web at :8200 still has zero app-layer
  auth and currently relies on bind-to-localhost. A separate PF bean
  needs to add token-based auth there before the
  `FORGE_WEB_ADMIN_TOKEN` injection above is meaningful as enforcement
  rather than ceremony. (Note: that bean is not yet filed; this bean
  doesn't block on it because the nginx-side gate still serves the
  "stop drive-by" goal, and forge-web is bind-to-localhost regardless.)
- **WebSocket auth via injected Sec-WebSocket-Protocol.** Approach
  documented above but the actual nginx behavior with subprotocol
  injection on the upgrade path needs validation against engram's
  handler — there's an implementation risk that engram requires the
  subprotocol to be echoed in the *client* upgrade request and won't
  accept it added by the proxy. If that turns out to be the case, the
  fallback is to either (a) lobby engram for a query-param or
  Authorization-header auth alternative, or (b) accept that the
  browser still holds the raven_tokens for WS connections only,
  injected from config.js via the entrypoint. Resolve during
  implementation.

## Origin / coordination

- Nooscope-kyyw (epic, done): established public/admin posture.
  This bean evolves the model — same posture, different mechanism.
- Nooscope-1sz9 (token cleanup, done): removed raven tokens from
  config.js / git history. This bean re-introduces them as env-var
  injection at runtime; tokens still don't enter git.
- Nooscope-nkvw (social view): the trigger that surfaced the gap
  in the current model. Once this bean lands, the social.html
  hardcoded admin gate becomes a clean per-page admin-state read.
- PersonaForge-n3kx (JSON variant of /scions): consumed once it
  ships, in the social view's dropdown. Authenticated via
  `FORGE_WEB_ADMIN_TOKEN` once forge-web auth exists.
