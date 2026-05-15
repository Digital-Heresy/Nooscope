#!/bin/sh
# Container start hook (Nooscope-r5kh):
#   1. Generate /js/config.js from env (Scion ports/host + adminHash).
#   2. Materialize /etc/nginx/conf.d/default.conf from nginx.conf.template by
#      substituting per-Scion upstream tokens from env vars.
#
# Upstream secrets (RAVEN_TOKEN_*, MORPHEUS_TOKEN_*, FORGE_WEB_ADMIN_TOKEN)
# never reach js/config.js — only nginx's running config holds them, and
# nginx injects them as bearer headers on outbound proxy requests.
#
# Environment variables:
#   NOOSCOPE_ADMIN_PASSWORD         plain admin password; we SHA-256 it and
#                                   only the hex digest reaches the browser
#                                   (config.js adminHash). Missing/empty =
#                                   admin login is disabled (public-only).
#   SPEAKER_THRIDEN_PORT, SPEAKER_PF_PORT  (default 3030, 8100)
#   HELIX_THRIDEN_PORT,   HELIX_PF_PORT    (default 3031, 8101)
#   NOOSCOPE_HOST                   set for production behind nginx prefixes
#   RAVEN_TOKEN_SPEAKER, RAVEN_TOKEN_HELIX            engram WS auth bearer
#   MORPHEUS_TOKEN_SPEAKER, MORPHEUS_TOKEN_HELIX      forge WS + REST bearer
#   FORGE_WEB_ADMIN_TOKEN                             cross-Scion admin web

set -e

CONFIG_PATH="/usr/share/nginx/html/js/config.js"
NGINX_TEMPLATE="/etc/nginx/conf.d/default.conf.template"
NGINX_CONF="/etc/nginx/conf.d/default.conf"

# --- 1. Admin password hash ---
# SHA-256 the password and emit the lowercase hex digest. The plaintext
# never reaches disk in the served bundle. An empty password means
# "no admin login configured" — auth.js then treats login as disabled.
if [ -n "$NOOSCOPE_ADMIN_PASSWORD" ]; then
    ADMIN_HASH=$(printf '%s' "$NOOSCOPE_ADMIN_PASSWORD" | sha256sum | cut -d' ' -f1)
else
    ADMIN_HASH=""
fi

# --- 2. config.js ---
if [ -n "$NOOSCOPE_HOST" ]; then
cat > "$CONFIG_PATH" <<EOF
const NOOSCOPE_CONFIG = {
  scions: {
    speaker: { host: '${NOOSCOPE_HOST}', pfPrefix: '/speaker' },
    helix:   { host: '${NOOSCOPE_HOST}', pfPrefix: '/helix' },
  },
  defaults: {},
  adminHash: '${ADMIN_HASH}',
};
EOF
else
cat > "$CONFIG_PATH" <<EOF
const NOOSCOPE_CONFIG = {
  scions: {
    speaker: {
      thriden: ${SPEAKER_THRIDEN_PORT:-3030},
      pf: ${SPEAKER_PF_PORT:-8100}
    },
    helix: {
      thriden: ${HELIX_THRIDEN_PORT:-3031},
      pf: ${HELIX_PF_PORT:-8101}
    },
  },
  defaults: {
    thridenPort: ${SPEAKER_THRIDEN_PORT:-3030},
    pfPort: ${SPEAKER_PF_PORT:-8100},
  },
  adminHash: '${ADMIN_HASH}',
};
EOF
fi

# --- 3. nginx.conf token substitution ---
# envsubst is invoked with an explicit allow-list so nginx's own
# `$variable` references (e.g. $http_upgrade, $cookie_nooscope_admin,
# $engram_speaker) survive untouched. Only the upstream-secret
# placeholders are replaced.
if [ -f "$NGINX_TEMPLATE" ]; then
    envsubst '${RAVEN_TOKEN_SPEAKER} ${RAVEN_TOKEN_HELIX} ${MORPHEUS_TOKEN_SPEAKER} ${MORPHEUS_TOKEN_HELIX} ${FORGE_WEB_ADMIN_TOKEN}' \
        < "$NGINX_TEMPLATE" \
        > "$NGINX_CONF"
fi

mode="${NOOSCOPE_HOST:+production}"
admin_state="${ADMIN_HASH:+enabled}"
echo "Nooscope ready (mode: ${mode:-dev}, admin: ${admin_state:-disabled})"

exec "$@"
