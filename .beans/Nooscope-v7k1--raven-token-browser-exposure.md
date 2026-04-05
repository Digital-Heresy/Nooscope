---
# Nooscope-v7k1
title: Raven Token Browser Exposure -- Credential Leak
status: done
type: bug
priority: high
tags:
    - security
    - raven-auth
created_at: 2026-04-04T06:00:00Z
updated_at: 2026-04-04T16:10:00Z
parent: MindHive-r46f
---

Security review (MindHive-r46f, M6) confirmed that Engram raven tokens are fully exposed to browser JavaScript. Two vectors:

## Vector 1: Hardcoded tokens in git

`js/config.js` lines 12-13 contain plaintext raven tokens committed to the repository. These are live production tokens for Speaker and Helix. Even if removed from HEAD, they're recoverable from git history.

## Vector 2: docker-entrypoint.sh injects tokens into served JS

`docker-entrypoint.sh` templates `SPEAKER_RAVEN_TOKEN` and `HELIX_RAVEN_TOKEN` into `config.js` at container start. nginx then serves this as a static file -- any browser user can read the tokens from page source or `NOOSCOPE_CONFIG` in the console.

## Impact

These tokens grant full Engram API access (ingest, delete, admin/wipe). An attacker with browser access to Nooscope can extract them trivially.

## Checklist

- [x] Remove hardcoded tokens from `js/config.js` (replaced with empty strings)
- [x] Create `js/config.example.js` as template pattern
- [x] Add `js/config.js` to `.gitignore`
- [x] Remove `js/config.js` from git index (`git rm --cached`)
- [x] Update `docker-entrypoint.sh` with security warnings
- [x] Create `SECURITY-NOTICE-TOKEN-ROTATION.md` documenting compromised tokens
- [x] Create `js/README-CONFIG.md` with developer setup instructions
- [x] **Coordinate token rotation with DH** -- the committed tokens are burned for anyone with repo access
- [x] **Consider read-only telemetry token** (future work, tracked in MindHive-r46f): Nooscope only needs `/ws/telemetry` (read-only). A separate limited-scope token that only authorizes WebSocket telemetry would contain the blast radius. This requires Engram-side work (token scoping).

## Notes

The browser-direct-to-Engram architecture means any token given to Nooscope is inherently visible to the user. The mitigation is ensuring that token has minimal privileges. Until Engram supports scoped tokens, the current full-access tokens should not be embedded in browser code served to untrusted networks.

## Cross-references
- MindHive-r46f: Security hardening epic (parent)
- MindHive-3hj2: Engram raven auth foundation
