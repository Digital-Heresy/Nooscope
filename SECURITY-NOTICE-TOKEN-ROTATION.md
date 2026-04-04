# Security Notice: Raven Token Rotation Required

**Date:** 2026-04-04  
**Severity:** HIGH  
**Issue:** Nooscope-v7k1 (Raven Token Browser Exposure)

## Summary

Production Raven tokens for **Speaker** and **Helix** were accidentally committed to git in `js/config.js` (commit 8b8c401). These tokens are now considered **compromised** and must be rotated.

## Compromised Tokens

The following tokens were exposed in git history and served to browsers:

- **Speaker Raven Token:** `EfI7EGuWNUi5Dcg8yoZQ3mAOIq4wblu4TAwKjfyl6BI`
- **Helix Raven Token:** `9wmoKrbRNEJnkbE5KCzZ_GbR3k8bxIbR-qLMPWkD9KA`

## Impact

Anyone with:
- Access to the git repository
- Access to the Nooscope web interface (before this fix)

...can extract these tokens and use them to call Engram APIs with full privileges (ingest, delete, admin/wipe).

## Required Actions

### Immediate (DH Coordination Required)

1. **Rotate both tokens** in the Engram/Raven token management system
2. **Update environment variables** in the MindHive deployment:
   - `SPEAKER_RAVEN_TOKEN` (new token)
   - `HELIX_RAVEN_TOKEN` (new token)
3. **Restart Nooscope containers** to pick up new tokens
4. **Verify** old tokens no longer work against Engram API

### Completed in This Fix

- ✅ Removed hardcoded tokens from `js/config.js`
- ✅ Created `js/config.example.js` as template
- ✅ Added `js/config.js` to `.gitignore`
- ✅ Updated `docker-entrypoint.sh` with security warnings
- ✅ Documented the issue

## Architecture Limitation

Nooscope uses browser-direct-to-Engram architecture. **Any token given to Nooscope is inherently visible to the browser user.** This is by design—there is no backend proxy.

## Long-Term Mitigation (Future Work)

Consider implementing read-only scoped tokens in Engram:
- A `/ws/telemetry` read-only token scope
- Separate admin tokens (never sent to browser)
- This requires Engram-side changes (tracked in MindHive-r46f)

Until scoped tokens exist, **never deploy Nooscope with full-access tokens on untrusted networks.**

## References

- Bean: `.beans/Nooscope-v7k1--raven-token-browser-exposure.md`
- Parent Epic: MindHive-r46f (Security Hardening)
- Git commit: 8b8c401 (contains exposed tokens)

## Contact

Coordinate token rotation with **DH** (Engram/Raven admin).
