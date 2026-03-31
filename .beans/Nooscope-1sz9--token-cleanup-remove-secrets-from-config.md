---
# Nooscope-1sz9
title: 'Token Cleanup: Remove Secrets from Config'
status: todo
type: feature
priority: high
created_at: 2026-03-31T09:18:47Z
updated_at: 2026-03-31T09:18:47Z
parent: Nooscope-kyyw
---

Remove raven tokens from Nooscope's config entirely. Tokens should never be in config.js, docker-compose env, or git history.

After Phase 2 (frontend mode switch), tokens are entered manually by admin users in the browser UI — they never need to be in the served config.

**Also fix the current security issue: production tokens are committed in config.js right now.**

## Checklist
- [ ] Remove SPEAKER_RAVEN_TOKEN and HELIX_RAVEN_TOKEN from Nooscope service in MindHive docker-compose
- [ ] Update docker-entrypoint.sh: config.js contains ports and scion names only, no tokens
- [ ] Add js/config.js to .gitignore (generated at container start, must not be committed)
- [ ] Delete committed config.js with production tokens (rotate tokens after removal)