# TLS termination & Caddy reverse proxy

**Status:** design (Nooscope-03z5). Implementation happens at the Pi5
deploy in [[Nooscope-ges3]] / [[Nooscope-e5nv]]. Nothing in this doc
changes the Nooscope image — the image is already plain-HTTP-only as
of the post-r5kh nginx template. This doc captures the contract Caddy
on the Pi5 needs to satisfy, plus two small alongside-deploy touches.

## Decision

Caddy on the Pi5 terminates TLS at `noo.thriden.dev` using the
wildcard cert for `*.thriden.dev` (provisioned by MindHive's deploy
infra, [[MindHive-9rg8]]). Nooscope's container serves plain HTTP on
`:8080`. Caddy is dumb-proxy: forward Host + WS upgrade headers and
trust the nginx inside the Nooscope container to do auth + routing.

Why not in-container TLS:

- The wildcard cert is already managed centrally by Caddy alongside
  `mh.thriden.dev` and `pf.thriden.dev`. Distributing it into every
  container would mean rotating it in N places.
- `nginxinc/nginx-unprivileged:alpine` listens on `:8080` plain HTTP.
  Adding in-container TLS would mean either re-rolling the image
  with certs baked in (rotation nightmare) or mounting them in
  (operational coupling).
- The Pi5 docker network never leaves the host; Caddy → Nooscope on
  loopback / docker bridge doesn't need wire encryption.

## Pre-conditions (already true in the image)

Verified against `nginx.conf.template` on 2026-05-21:

- nginx listens on plain HTTP `8080`. No `ssl` directive anywhere.
- No `Strict-Transport-Security` header is set by Nooscope. HSTS is
  Caddy's job (its default policy for HTTPS sites includes
  `max-age=31536000`); Nooscope must not double-set it.
- No `upgrade-insecure-requests` CSP directive, no scheme-checking JS.

No image-side changes are needed for TLS termination to work. The
container is already correct.

## Alongside-deploy touches (small, not blocking 03z5)

These don't strictly belong to 03z5 — but they're cheap and worth
bundling into the same PR as `e5nv` so the network-facing posture is
coherent on first ship:

### 1. `Secure` attribute on the admin cookie

`js/auth.js:59` currently sets:

```js
document.cookie = `${COOKIE_KEY}=1; Path=/; SameSite=Strict`;
```

When served over HTTPS, the cookie should carry `Secure` so it can't
leak over a downgraded HTTP request. Detect at runtime so localhost
dev (plain HTTP) still works:

```js
const secureAttr = location.protocol === 'https:' ? '; Secure' : '';
document.cookie = `${COOKIE_KEY}=1; Path=/; SameSite=Strict${secureAttr}`;
```

Apply symmetrically to the logout path (`auth.js:67`).

### 2. Compose port binding on the Pi5

Production compose on the Pi5 should bind nooscope to
`127.0.0.1:8080` (or to the docker network alone, no host port),
since Caddy is the public ingress. If `:8080` accidentally publishes
on the LAN, traffic bypasses Caddy → bypasses TLS → bypasses any
edge protections Caddy provides (HSTS, rate limits, access logs).

The MindHive-side compose already does this for `mh.thriden.dev`;
nooscope just inherits the pattern.

## Caddy block

In the Pi5's `Caddyfile` (or imported snippet):

```caddy
noo.thriden.dev {
    # Wildcard cert managed at the parent Caddyfile (tls block for
    # *.thriden.dev). No per-site tls directive needed here.

    reverse_proxy nooscope:8080 {
        # Long-lived telemetry streams. Caddy buffers by default;
        # -1 streams events through as they arrive instead of
        # accumulating a buffer.
        flush_interval -1

        # nginx inside the container holds WS connections for 24h
        # (proxy_read_timeout 86400). Caddy must match or it'll
        # close the upstream side first.
        transport http {
            read_timeout 24h
            write_timeout 24h
        }

        # Caddy sets X-Forwarded-For + X-Forwarded-Proto by default.
        # nginx inside doesn't gate on them; they're available for
        # access logs if we ever want per-client analytics.
    }
}
```

Caddy v2's `reverse_proxy` auto-detects WebSocket upgrades and
forwards `Upgrade` / `Connection` headers natively. No `@websocket`
matcher or split route is needed.

## Routes Caddy forwards

All routes go to the same upstream as a single `reverse_proxy
nooscope:8080`. nginx inside the container does the scion + auth
routing (see `nginx.conf.template`):

- **WebSocket upgrade** (auto-handled by Caddy):
  - `/{scion}/ws/telemetry` — admin Engram structural stream
  - `/{scion}/ws/telemetry/public` — public Engram (rate-limited at nginx)
  - `/{scion}/ws/pf/telemetry` — admin PF behavioral stream
  - `/{scion}/ws/pf/telemetry/public` — public PF (rate-limited at nginx)
- **HTTPS REST**:
  - `/{scion}/morpheus/*` — dream REST; admin token injected by nginx when admin cookie present
  - `/admin/scions/*` — forge-web cross-Scion admin; `FORGE_WEB_ADMIN_TOKEN` injected by nginx
- **Static**: `/`, `/index.html`, `/dreams.html`, `/social.html`,
  `/js/*`, `/css/*`, models, favicons

## Acceptance tests

After Caddy reload + Pi5 nooscope service up:

```bash
# Static bundle served over TLS
curl -sf https://noo.thriden.dev/ | grep -q "Nooscope"
curl -sfI https://noo.thriden.dev/js/app.js | grep -q "200 OK"

# Public WS (no auth required, rate-limited at nginx)
websocat wss://noo.thriden.dev/speaker/ws/telemetry/public

# Admin WS without cookie → 401 (admin gate at nginx)
curl -sI -H "Upgrade: websocket" -H "Connection: Upgrade" \
     https://noo.thriden.dev/speaker/ws/telemetry | grep -q "401"

# Admin login flow via browser:
#   1. Visit https://noo.thriden.dev
#   2. Click lock icon, enter NOOSCOPE_ADMIN_PASSWORD
#   3. devtools → Application → Cookies: nooscope_admin=1; Secure
#   4. Admin WS now connects; structural stream renders.
```

## Out of scope

- **Per-Scion subdomains** (e.g. `speaker.noo.thriden.dev`). The scion
  segment in the URL path is sufficient and matches the existing
  `nginx.conf.template` routing. Revisit if we ever want CORS-isolated
  origins per Scion.
- **mTLS between Caddy and Nooscope**. Overkill for traffic on a
  single Pi5's docker network.
- **HTTP→HTTPS redirect**. Caddy does this automatically for any site
  with a TLS config; no Nooscope-side change required.
- **Edge rate-limiting at Caddy**. The `limit_req` zones inside
  nginx handle the public WS surface. Layering Caddy rate-limits on
  top is a follow-up if we see abuse patterns.
