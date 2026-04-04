# Nooscope Configuration

## Security Model

**IMPORTANT:** Nooscope serves `config.js` directly to browsers as static JavaScript. Any tokens in this file are **fully visible** to users via:
- Browser page source
- JavaScript console: `window.NOOSCOPE_CONFIG`
- Browser DevTools

**Never commit tokens to git!**

## Development Setup

1. Copy the example template:
   ```bash
   cp js/config.example.js js/config.js
   ```

2. Edit `js/config.js` and fill in your tokens:
   ```javascript
   const NOOSCOPE_CONFIG = {
     scions: {
       speaker: { thriden: 3030, pf: 8100, token: 'YOUR_SPEAKER_TOKEN_HERE' },
       helix:   { thriden: 3031, pf: 8101, token: 'YOUR_HELIX_TOKEN_HERE' },
     },
     // ...
   };
   ```

3. `js/config.js` is in `.gitignore` and will not be committed

## Docker Deployment

In Docker, `docker-entrypoint.sh` generates `config.js` from environment variables at container startup:

```yaml
# docker-compose.yml
environment:
  - SPEAKER_RAVEN_TOKEN=your_token_here
  - HELIX_RAVEN_TOKEN=your_token_here
  - SPEAKER_THRIDEN_PORT=3030
  - SPEAKER_PF_PORT=8100
  - HELIX_THRIDEN_PORT=3031
  - HELIX_PF_PORT=8101
```

## Files

- `config.example.js` — Template (committed to git, no tokens)
- `config.js` — Local copy (ignored by git, contains tokens)
- `../docker-entrypoint.sh` — Generates config.js in Docker

## Token Security Best Practices

1. **Use separate dev/prod tokens** — Never use production tokens in development
2. **Rotate tokens regularly** — Especially after team changes
3. **Use read-only tokens when available** — Nooscope only needs WebSocket telemetry access (future Engram enhancement)
4. **Restrict network access** — Deploy Nooscope behind VPN/authentication for production use

## What if I accidentally committed a token?

1. **Immediately rotate the token** in Engram/Raven
2. **Notify the team** — Consider the token compromised
3. **Update deployments** with the new token
4. Document in `SECURITY-NOTICE-TOKEN-ROTATION.md`

Note: Removing a token from git HEAD doesn't erase it from history. The token must be rotated.
