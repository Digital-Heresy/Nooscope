#!/bin/sh
# Generate config.js from environment variables at container start.
# Tokens are NOT injected here — admin users enter them via the browser UI.
#
# Environment variables:
#   SPEAKER_THRIDEN_PORT, SPEAKER_PF_PORT  (default 3030, 8100)
#   HELIX_THRIDEN_PORT, HELIX_PF_PORT      (default 3031, 8101)
#   NOOSCOPE_HOST                          (optional — set for production behind nginx)

CONFIG_PATH="/usr/share/nginx/html/js/config.js"

# When NOOSCOPE_HOST is set, generate host-based config for production (nginx proxy).
# Otherwise, generate port-based config for local development.
if [ -n "$NOOSCOPE_HOST" ]; then
cat > "$CONFIG_PATH" <<EOF
const NOOSCOPE_CONFIG = {
  scions: {
    speaker: { host: '${NOOSCOPE_HOST}', pfPrefix: '/speaker' },
    helix:   { host: '${NOOSCOPE_HOST}', pfPrefix: '/helix' },
  },
  defaults: {},
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
};
EOF
fi

mode="${NOOSCOPE_HOST:+production}"
echo "Nooscope config generated (mode: ${mode:-dev})"

exec "$@"
