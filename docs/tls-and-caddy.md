# Ingress / TLS model

**Status:** superseded. The bundled-Caddy + `noo.thriden.dev` model
described here was designed in Nooscope-03z5 / Nooscope-ges3 but was
never shipped: Thriden dropped its bundled ingress before that slice
landed (see MindHive-5shx). This file is kept as a stub so the old
bean links don't 404; the content below is the current model.

## Current model

Nooscope ships **no TLS and no reverse proxy of its own.** The
container binds `:8080` and serves plain HTTP. The operator is
responsible for fronting it with their own ingress — Pangolin,
Cloudflare Tunnel, an SSH tunnel, or any other reverse proxy they
choose.

This approach is safe because Nooscope's admin password gate and
per-upstream bearer injection (`NOOSCOPE_ADMIN_PASSWORD`,
`RAVEN_TOKEN_*`, `MORPHEUS_TOKEN_*`) make direct exposure workable;
the operator just needs to ensure the connection from their ingress to
the container is on a trusted network segment.

The `Secure` attribute on the admin session cookie is set server-side by
the njs login handler (`njs/nooscope-auth.js`, Nooscope-hm4c) whenever the
request arrives with `X-Forwarded-Proto: https` — i.e. whenever the ingress
terminates TLS and forwards that header. On a plain-HTTP segment the flag is
omitted so the cookie still sets. HTTPS via an external tunnel therefore works
correctly without any image-side change, as long as the tunnel forwards
`X-Forwarded-Proto`.

See the Thriden quickstart in MindHive's deploy docs for the
recommended tunnel setup.
