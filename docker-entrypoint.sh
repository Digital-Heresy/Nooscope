#!/bin/sh
# Generate config.js from environment variables.
# Tokens and ports are injected at container start, never baked into the image.
#
# SECURITY WARNING: The generated config.js is served as static JS to browsers.
# Any token injected here is FULLY VISIBLE to browser users via:
#   - View page source
#   - Browser console: window.NOOSCOPE_CONFIG
#   - DevTools Network tab
#
# Best practice: Use read-only scoped tokens if available.
# Current limitation: Engram tokens grant full API access (ingest/delete/admin).

CONFIG_PATH="/usr/share/nginx/html/js/config.js"

cat > "$CONFIG_PATH" <<EOF
const NOOSCOPE_CONFIG = {
  scions: {
    speaker: {
      thriden: ${SPEAKER_THRIDEN_PORT:-3030},
      pf: ${SPEAKER_PF_PORT:-8100},
      token: '${SPEAKER_RAVEN_TOKEN:-}'
    },
    helix: {
      thriden: ${HELIX_THRIDEN_PORT:-3031},
      pf: ${HELIX_PF_PORT:-8101},
      token: '${HELIX_RAVEN_TOKEN:-}'
    },
  },
  defaults: {
    thridenPort: ${SPEAKER_THRIDEN_PORT:-3030},
    pfPort: ${SPEAKER_PF_PORT:-8100},
  },
};
EOF

echo "Nooscope config generated ($(grep -c token "$CONFIG_PATH") scion(s))"

exec "$@"
