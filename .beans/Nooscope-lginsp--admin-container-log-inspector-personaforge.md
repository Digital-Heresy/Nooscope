---
# Nooscope-lginsp
title: Container log inspector — admin-only viewer for a Scion's PersonaForge container logs
status: in-progress
type: feature
created_at: 2026-06-17T00:00:00Z
updated_at: 2026-06-17T00:00:00Z
---

Admin-only page (`logs.html`) that watches a single Scion's **PersonaForge container** docker logs. PF is where most operational issues surface (uvicorn tracebacks, Morpheus render failures, first-run startup crashes) — far more than Engram or forge-web — so the v0 target is the `forge-<short>` container specifically.

Frontend + nginx routing shipped on the Nooscope side. The **backend log-tail endpoint on forge-web is the open dependency** (handoff to the PersonaForge repo — see contract below).

## Why

Operator currently shells into the Pi5 and runs `docker logs forge-speaker` to diagnose Scion misbehavior. A browser-side inspector tied to the same Scion selector as the rest of Nooscope keeps that within the admin surface instead of a separate SSH session, and works from anywhere the visualizer is reachable.

## Shape (shipped, Nooscope side)

- `logs.html` + `js/logs.js` + `css/logs.css`. Self-contained page (loads only `style.css` + `logs.css` + `config.js` + `auth.js` + `logs.js`).
- Admin-only, same posture as `social.html`: in public mode the page shows a login prompt and auto-opens the shared `NooscopeAuth` modal; the **Logs** nav link is hidden in public mode (extended `auth.js applyVisibility`).
- Scion selector mirrors `social.js` — `value = scion_id`, badge-aware labels.
- **Auto-poll** snapshot model: re-GETs the last N lines every 4s, replaces the buffer wholesale (no cursor/de-dup bookkeeping). Pausable; pauses automatically when the tab is hidden (`visibilitychange`). Manual refresh button + tail-size selector (50/100/200/500).
- **Level filter is client-side** over the fetched buffer — Full / Warnings / Errors tabs never hit the network. Plus a free-text filter and a wrap toggle.
- Severity is taken from the backend `level` when present, else re-derived from the line text (`/\b(CRITICAL|FATAL|ERROR|WARNING|...)\b/`). Rows are accent-colored by bucket; newest at the bottom with auto-follow only when already scrolled to bottom.

## Routing (no nginx change needed)

The browser holds no token. It calls:

```
GET /admin/scions/{scion_id}/logs?lines=N
```

The **existing** `location /admin/scions/` block in `nginx.conf.template` already:
- gates on `$cookie_nooscope_admin == "1"` (401s otherwise),
- strips `/admin` and proxies to `forge-web:8200` (→ `/scions/{scion_id}/logs?lines=N`),
- injects `Authorization: Bearer $FORGE_WEB_ADMIN_TOKEN`,
- hides upstream CORS headers.

So the backend route just has to live under forge-web's `/scions/{scion_id}/...` namespace and the gate covers it for free. `proxy_read_timeout` there is 60s — fine for a `docker logs --tail` snapshot.

## Backend contract (OPEN — handoff to PersonaForge / forge-web)

forge-web runs on the host and can reach the docker socket / `docker logs`. Add:

```
GET /scions/{scion_id}/logs?lines=N        (admin-bearer authed, same as other /scions admin routes)
```

- Resolves `scion_id` → its `runtime_short` → tails the `forge-<short>` container
  (`docker logs --tail N --timestamps forge-<short>`, capturing BOTH stdout and stderr).
- `N` clamped to a sane ceiling (e.g. 1000); default 50 if absent.
- Response (preferred shape — the frontend `normalizeLines()` is forgiving and also
  accepts a bare array or `{ logs: [...] }`, and string-or-object entries):

```json
{
  "scion_id": "dh-speaker",
  "service": "forge-speaker",
  "lines": [
    {
      "ts": "2026-06-17T10:23:45.123456Z",
      "level": "ERROR",
      "message": "Traceback (most recent call last): ..."
    }
  ]
}
```

- `level` is best-effort (parse Python-logging / uvicorn prefixes); the frontend
  re-derives it from `message` when absent, so an untagged `{ "message": "<raw line>" }`
  still renders and filters correctly.
- Ordering: oldest → newest (frontend renders top→bottom, newest at the bottom).
- Auth/error semantics already handled by the frontend: `401` → re-login prompt,
  `404` → "forge-web may not expose container logs yet", other non-2xx → status-line
  note while keeping the existing buffer + poll alive.

### Handoff blurb (relay to the PersonaForge repo)

> **Nooscope needs a forge-web log-tail endpoint** for the new admin log inspector.
> Add `GET /scions/{scion_id}/logs?lines=N` to the admin web (`personaforge-web`,
> the same surface that serves `/scions` and `/scions/{id}/social-graph`). It should
> resolve the scion to its `forge-<runtime_short>` container and return the last N
> lines of `docker logs` (stdout+stderr, with timestamps) as JSON
> `{ scion_id, service, lines: [{ ts, level, message }] }`. `level` best-effort from
> the log prefix; oldest→newest. Same admin-bearer auth as the other `/scions` routes —
> Nooscope's gateway injects `Authorization: Bearer <FORGE_WEB_ADMIN_TOKEN>` and gates
> on the `nooscope_admin` cookie, so no app-layer auth change is needed. Nooscope polls
> it every ~4s at tail sizes 50–500.

## Out of scope for v0 (deferred)

- **Live tail (WebSocket/SSE follow).** v0 is snapshot auto-poll; a `docker logs -f`
  stream is a follow-on if the 4s poll feels laggy in practice.
- **Engram / forge-web container logs.** v0 watches the PF container only (where the
  errors are). A container picker is a trivial extension once the backend can address
  other services.
- **Server-side level/grep filters.** All filtering is client-side over the tail buffer;
  fine at 50–500 lines.
- **Download / copy-all.** Could add a "copy visible" button later.

## Acceptance check

[ ] In admin mode, selecting a Scion renders its PF container's last N log lines, newest at bottom.
[ ] Full / Warnings / Errors tabs filter the buffer client-side without a refetch.
[ ] Auto-poll keeps the view current (~4s); Pause stops it; tab-hide pauses automatically.
[ ] Tail selector (50/100/200/500) refetches at the new depth.
[ ] Public mode hides the Logs nav link and gates the page behind the login modal.
[ ] 401 → re-login prompt; 404/missing endpoint → friendly message, no console spew.
[ ] Backend `/scions/{id}/logs` shipped on forge-web and reachable via `/admin/scions/{id}/logs`.

## Origin / coordination

- Reuses the `/admin/scions/` gateway gate from Nooscope-r5kh (admin cookie → forge-web bearer).
- Scion selector + `scion_id` plumbing from Nooscope-de9m (config.js roster).
- Backend endpoint is a PersonaForge / forge-web handoff (see blurb above) — the only blocker on the acceptance check's last two boxes.
