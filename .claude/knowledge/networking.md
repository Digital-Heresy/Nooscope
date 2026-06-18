# Networking

Nooscope's container is a thin nginx in front of two upstream fleets — Engram (telemetry WebSockets) and PersonaForge (Morpheus REST + PF telemetry WebSocket + admin web). Everything user-facing flows through `nginx.conf`, which is **generated at container start** by `docker-entrypoint.sh` from a template plus a dynamic Scion roster. The shape of that generation is described first; the recurring nginx infra patterns follow.

## Per-Scion routes are rendered, not hardcoded

`nginx.conf.template` carries the skeleton (limit_req_zone, server block, static-asset rules, `/admin/scions/`, `/healthz`, SPA fallback) and two marker lines:

```nginx
# {{SCION_MAPS}}         ← at http level, gets one map per Scion
    # {{SCION_BLOCKS}}   ← inside server { }, gets per-Scion set + location
```

`docker-entrypoint.sh` discovers the Scion roster — prod mode fetches `http://forge-web:8200/scions` (`Accept: application/json`, busybox wget with retry), dev mode uses a hardcoded `speaker, helix` list — projects it to a TSV (`slug<TAB>name<TAB>badge<TAB>scion_id`), then loops over the rows. Each iteration sed-renders two embedded heredoc templates with three derived slug forms:

- `__SLUG__` — raw slug (`dm-cairn`). Used in URL paths and docker hostnames.
- `__SLUG_VAR__` — slug with hyphens → underscores (`dm_cairn`). Used in nginx variable names; nginx forbids `-` in `$variable` identifiers.
- `__SLUG_UPPER__` — uppercase + hyphens → underscores (`DM_CAIRN`). Used as the env-var suffix for envsubst (`${RAVEN_TOKEN_DM_CAIRN}`).

The substitution order matters — `__SLUG_UPPER__` and `__SLUG_VAR__` both contain `__SLUG__` as a substring, so the longer placeholders are substituted first. The envsubst allow-list is built in the same loop, accumulating `${RAVEN_TOKEN_<SLUG>}` and `${MORPHEUS_TOKEN_<SLUG>}` per Scion plus the static `${FORGE_WEB_ADMIN_TOKEN}`.

**Source of truth for the roster:** PersonaForge's admin web JSON `/scions` endpoint, filtered to `engram_bound: true`. Decided in Nooscope-pxfn; full rationale in `docs/scion-registry-source.md`. The slug is a first-class field on PF's Scion model (PersonaForge-slg9), not derived by stripping a `dh-` prefix on the Nooscope side. Container start fails closed if `/scions` is unreachable — no baked-in fallback list, because any fallback embeds a stale assumption about the fleet.

**`/healthz` reports the loaded roster** as a static text file emitted by the entrypoint and served by nginx at `/healthz`. `curl http://nooscope.host/healthz` is the operator's "did the registry populate" check after a container restart.

When adding a new per-Scion route, edit the heredoc templates inside `docker-entrypoint.sh`, not `nginx.conf.template` — the template only holds the skeleton.

## Two recurring nginx infra patterns

Both apply to the rendered per-Scion blocks.

## nginx upstream DNS — variable proxy_pass, never static `upstream {}`

When nginx proxies to other containers in a docker-compose stack, **do not** use static `upstream { server name:port; }` blocks. nginx resolves those hostnames once at worker startup and caches the IPs forever. When backend containers restart, Docker reassigns IPs, and nginx keeps routing to whatever container now holds the old IP — silently sending traffic to the wrong backend.

The correct pattern, as emitted into the rendered config:

```nginx
resolver 127.0.0.11 valid=10s ipv6=off;   # Docker embedded DNS
set $engram_speaker engram-speaker:3030;
set $forge_speaker  forge-speaker:8100;

location /speaker/ws/telemetry {
    rewrite ^/speaker(/.*)$ $1 break;
    proxy_pass http://$engram_speaker;     # NO URI suffix
    # ...
}
```

(The per-Scion `set` and `location` blocks above are loop-rendered from the templates inside `docker-entrypoint.sh`; see the "Per-Scion routes" section above.)

A variable in `proxy_pass` forces per-request DNS resolution against the resolver, which keeps a 10s cache. Static `upstream {}` blocks are only safe for external hosts with stable DNS — never for compose service names.

### The path-rewrite gotcha that comes with it

With a variable in `proxy_pass`, nginx does **not** strip the matched location prefix — it forwards the original request URI verbatim regardless of any URI you put on the `proxy_pass` line. Every location block needs an explicit `rewrite ... break;` to strip the scion segment (`/speaker`, `/helix`), and the `proxy_pass` must have no URI suffix. This bit Nooscope twice in April 2026 — once as DNS caching, once as path duplication — same root cause: variable `proxy_pass` has different semantics than literal-upstream `proxy_pass`.

## CORS at the gateway, not at the upstream

Both PF/Morpheus and forge-web emit their own `Access-Control-*` headers. If those reach the browser alongside the gateway's `add_header Access-Control-*` block, the response carries duplicates (`"*, *"`) and Chrome rejects with a CORS policy error. Every proxy block that hits a CORS-emitting upstream uses `proxy_hide_header` to strip the upstream set:

```nginx
proxy_hide_header Access-Control-Allow-Origin;
proxy_hide_header Access-Control-Allow-Headers;
proxy_hide_header Access-Control-Allow-Methods;
proxy_hide_header Access-Control-Allow-Credentials;
proxy_hide_header Access-Control-Expose-Headers;
proxy_hide_header Access-Control-Max-Age;
```

The gateway is the single source of truth for CORS. New proxy blocks that target Morpheus, forge-web, or anything else that sets these headers must hide them.

## Container outbound DNS — explicit override for external APIs

This rule lives at the docker-compose layer, not in Nooscope's nginx, but applies any time you add a service that talks to the public internet. Any compose service making outbound calls to external APIs (BFL, Voyage, Anthropic, OpenAI, etc.) needs an explicit `dns:` override:

```yaml
service-name:
  dns:
    - 8.8.8.8
    - 1.1.1.1
```

Docker's embedded resolver at `127.0.0.11` forwards to the host's DNS, but on cold lookups (fresh container, first request) it intermittently fails with `[Errno -5] No address associated with hostname`. The pattern: "first call failed with DNS error, the next five succeeded." Established precedent: `engram-speaker` / `engram-helix` got `dns:` in commit `bbe4f4b` for Voyage; `forge-speaker` / `forge-helix` got it in April 2026 after Morpheus's establishing-shot render flaked on `api.bfl.ai`.

Internal service-to-service traffic (mongodb, engram → forge, nooscope → forge) does not need this — only outbound to the public internet. And note that this is **distinct** from the nginx-upstream-DNS issue above: that's a proxy-layer resolver-caching problem, this is a kernel-resolver cold-start problem.

## Admin gate on forge-web

`/admin/scions/` proxies to `forge-web:8200`, which has no app-layer auth (it's designed to bind 127.0.0.1 on its host). Post-r5kh, the gateway checks `$cookie_nooscope_admin` and the SPA sets that cookie only after a password match against the SHA-256 `adminHash` baked into `config.js`. The gateway then injects the real `Authorization: Bearer $FORGE_WEB_ADMIN_TOKEN` upstream. Anyone can forge the cookie value `1` from the browser, so this still isn't real auth — it just blocks drive-by access and matches the admin/public-mode pattern across the rest of the gateway. Replacing it with real HMAC-signed session cookies is its own bean.

Because the block matches the whole `/admin/scions/` prefix and forwards any subpath verbatim, every forge-web admin read-API rides it with **no new nginx block** — `/scions/{id}/social-graph` (Nooscope-nkvw) and `/scions/{id}/logs` (Nooscope-lginsp) both reach forge-web through this one location. A new admin read-API only needs a route under forge-web's `/scions/{id}/...` namespace; the gateway side is already done.
