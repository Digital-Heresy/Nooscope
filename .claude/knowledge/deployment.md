# Deployment

Nooscope runs as a single container in the MindHive docker-compose stack. The Dockerfile uses a local `COPY` (not a repo clone), so the deployed image reflects the working tree — changes are tested by rebuilding from the local directory without committing first.

## Rebuild and serve

```
docker compose -f C:/Users/ronin/Documents/Projects/MindHive/docker-compose.yml up --build nooscope -d
```

Then visit `http://localhost:8080` (`index.html`) or `http://localhost:8080/dreams.html`. Rebuild after any change to HTML, CSS, JS, `nginx.conf`, or the `Dockerfile` that needs live testing against the backend services.

## Line endings — `*.sh` must stay LF

`docker-entrypoint.sh` is `COPY`'d into the image and exec'd by `/bin/sh`. If it carries
CRLF terminators the kernel looks for `/bin/sh\r`, the container crash-loops, and
`docker logs` shows `exec /docker-entrypoint.sh: no such file or directory`. A Windows
clone with `git config core.autocrlf=true` will mangle the checkout this way even though
the committed blob is LF — so a local rebuild fails while the Pi (Linux) deploy is fine.
`.gitattributes` pins `*.sh` to `eol=lf` to prevent this; if you hit the crash-loop,
check the on-disk EOL (`file docker-entrypoint.sh`) and renormalize
(`rm docker-entrypoint.sh && git checkout -- docker-entrypoint.sh`).

When adding a root HTML page, also add it to the `COPY` line in the `Dockerfile` — root
HTML files are listed individually (not globbed), unlike `css/` and `js/` which copy
wholesale.

## Why not `python -m http.server`?

Several pages — `dreams.html` and anything calling the Morpheus REST API — require a same-origin proxy that routes `/morpheus/` to PersonaForge and `/ws/telemetry` to Engram. The nginx container in `Dockerfile` is what provides that. A bare static server skips the proxy and trips CORS on the first API call.

## Compose service shape

The Nooscope service in `MindHive/docker-compose.yml`:

- Builds from `../nooscope` (this repo).
- Maps `127.0.0.1:8080:8080` — bound to loopback, not exposed to the LAN.
- Lives on the `frontend` network alongside the forge-* / engram-* services it proxies to.
- Health-gated on `forge-speaker` and `forge-helix` being healthy (which transitively gates on their engrams). This avoids serving a frontend whose backing data sources are still cold.

## Container security posture

Every service in MindHive's compose — Nooscope included — runs with:

```yaml
security_opt: [no-new-privileges:true]
cap_drop: [ALL]
```

Applied in commit `78f5168` (SEC-014) as part of a defense-in-depth pass to minimize container-breakout surface.

The practical consequence for image choice: any base image that needs `CAP_CHOWN`, `CAP_SETUID`, `CAP_SETGID`, `CAP_NET_BIND_SERVICE`, or `CAP_DAC_OVERRIDE` at boot will fail to start. Plain `nginx:alpine` is one such image — it tries to chown `/var/cache/nginx/*` at startup and needs `CAP_CHOWN`. Nooscope's `Dockerfile` therefore uses `nginxinc/nginx-unprivileged:alpine` with `listen 8080`, which boots clean under `cap_drop: ALL`.

The rule: prefer rootless-by-design images over adding caps back. If a cap genuinely must be re-added, use `cap_add:` with a minimal list — do not remove `cap_drop: ALL`.

## config.js generation & background refresh

`docker-entrypoint.sh` generates `js/config.js` (the Scion roster + `adminConfigured`) from forge-web's `/scions` at container start. Because that was a one-shot at boot, any operator-side change after start — a flipped `soul_managed`, a badge/name edit — stayed invisible until the container restarted (the bug behind the Cairn SOUL-notice triage, **Nooscope-rl8v**).

As of rl8v, the generator is the `write_config_js` function, and in **prod mode** (`NOOSCOPE_HOST` set) the entrypoint backgrounds a `refresh_config_js` loop before `exec`ing nginx:

- Interval: `NOOSCOPE_CONFIG_REFRESH_SECONDS` (default `60`; `0` disables).
- Each tick best-effort re-fetches `/scions`; on failure it keeps the last good `config.js` (never crashes the loop — the subshell runs `set +e`).
- **Field-only**: it rewrites `config.js` (atomic temp+`mv`) only when the live roster's slug set still matches boot. A **membership** change (Scion added/removed) is logged and left for a restart, because new routes need the per-Scion nginx blocks regenerated + a reload, which the loop does not do.
- The loop survives the `exec` (it becomes a child of nginx as PID 1, reaping its own pipeline children — no zombies). dev mode has no `/scions`, so no refresher runs.

A browser only sees refreshed values on its next `config.js` load (the file is served `no-store`, so a page reload suffices — no container restart).

## Cross-references

- nginx proxy routing and DNS resolution patterns: see `networking.md`.
- The MindHive compose owns service inventory across the full fleet; this file only covers the Nooscope-shaped slice.
