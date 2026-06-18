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

The `Secure` cookie attribute in `js/auth.js` (`cookieSecureAttr()`)
is already set at runtime whenever the browser sees the page over
`https:`, so HTTPS via an external tunnel works correctly without any
image-side change.

See the Thriden quickstart in MindHive's deploy docs for the
recommended tunnel setup.
