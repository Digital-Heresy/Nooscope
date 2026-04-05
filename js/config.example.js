/**
 * Nooscope configuration — EXAMPLE TEMPLATE
 *
 * For development:
 *   1. Copy this to config.js: cp js/config.example.js js/config.js
 *   2. Adjust ports if needed in config.js
 *   3. config.js is .gitignored and will not be committed
 *
 * For Docker:
 *   docker-entrypoint.sh generates config.js from environment variables:
 *     - SPEAKER_THRIDEN_PORT / SPEAKER_PF_PORT
 *     - HELIX_THRIDEN_PORT / HELIX_PF_PORT
 *     - NOOSCOPE_HOST (optional, for production behind nginx)
 *
 * Admin tokens are entered via the browser UI, never stored in config.
 */
const NOOSCOPE_CONFIG = {
  scions: {
    speaker: { thriden: 3030, pf: 8100 },
    helix:   { thriden: 3031, pf: 8101 },
    // Production behind nginx (single host proxies both services):
    // speaker: { host: 'nooscope.example.com' },
  },
  defaults: {
    thridenPort: 3030,
    pfPort: 8100,
  },
};
