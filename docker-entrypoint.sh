#!/bin/sh
# Generate config.js from environment variables.
# Tokens and ports are injected at container start, never baked into the image.

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
