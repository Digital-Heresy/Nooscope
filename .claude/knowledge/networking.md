# Networking

Nooscope's container is a thin nginx in front of two upstream fleets — Engram (telemetry WebSockets) and PersonaForge (Morpheus REST + PF telemetry WebSocket + admin web). Everything user-facing flows through `nginx.conf`. Two recurring infra patterns govern how it talks to those upstreams.

## nginx upstream DNS — variable proxy_pass, never static `upstream {}`

When nginx proxies to other containers in a docker-compose stack, **do not** use static `upstream { server name:port; }` blocks. nginx resolves those hostnames once at worker startup and caches the IPs forever. When backend containers restart, Docker reassigns IPs, and nginx keeps routing to whatever container now holds the old IP — silently sending traffic to the wrong backend.

The correct pattern, as encoded in `nginx.conf`:

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

`/admin/scions/` proxies to `forge-web:8200`, which has no app-layer auth (it's designed to bind 127.0.0.1 on its host). The gateway provides a soft gate: any non-empty `Authorization` header passes, no header → 401. The SPA only sends the header when the user is in admin mode (`sessionStorage` `nooscope_raven_token`). This is not real auth — anyone with curl can forge a token string — but it blocks drive-by access from the public web UI and matches the existing admin/public mode pattern. Replacing it with real auth is its own bean.
