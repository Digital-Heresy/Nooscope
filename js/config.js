/**
 * Nooscope configuration — override via Docker volume mount.
 *
 * In Docker, mount your own config.js over this file:
 *   volumes:
 *     - ./my-config.js:/app/js/config.js
 *
 * Or generate it from environment variables at container startup.
 */
const NOOSCOPE_CONFIG = {
  scions: {
    speaker: { thriden: 3030, pf: 8100, token: 'EfI7EGuWNUi5Dcg8yoZQ3mAOIq4wblu4TAwKjfyl6BI' },
    helix:   { thriden: 3031, pf: 8101, token: '9wmoKrbRNEJnkbE5KCzZ_GbR3k8bxIbR-qLMPWkD9KA' },
  },
  defaults: {
    thridenPort: 3030,
    pfPort: 8100,
  },
};
