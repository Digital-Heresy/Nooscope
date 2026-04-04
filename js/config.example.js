/**
 * Nooscope configuration — EXAMPLE TEMPLATE
 *
 * DO NOT commit actual tokens to this file!
 *
 * For development:
 *   1. Copy this to config.js: cp js/config.example.js js/config.js
 *   2. Fill in your tokens and ports in config.js
 *   3. config.js is .gitignored and will not be committed
 *
 * For Docker:
 *   docker-entrypoint.sh will generate config.js from environment variables:
 *     - SPEAKER_RAVEN_TOKEN / HELIX_RAVEN_TOKEN
 *     - SPEAKER_THRIDEN_PORT / SPEAKER_PF_PORT
 *     - HELIX_THRIDEN_PORT / HELIX_PF_PORT
 */
const NOOSCOPE_CONFIG = {
  scions: {
    speaker: { thriden: 3030, pf: 8100, token: '' },  // Fill in your token
    helix:   { thriden: 3031, pf: 8101, token: '' },  // Fill in your token
  },
  defaults: {
    thridenPort: 3030,
    pfPort: 8100,
  },
};
