---
# Nooscope-lm3k
title: Thriden Stack v1 — Nooscope contributions
status: done
type: milestone
priority: high
created_at: 2026-05-14T07:41:23Z
updated_at: 2026-06-05T01:16:52Z
---

## Closure (2026-06-04)

All Nooscope-side contributions to Thriden Stack v1 are shipped. Per-criterion status:

1. **GHCR multi-arch image pipeline** — done via [[Nooscope-8l1t]]. `ghcr.io/digital-heresy/nooscope:main` + `:main-<sha>` published amd64+arm64.
2. **noo.thriden.dev + public/admin mode** — substrate done via [[Nooscope-ges3]] (TLS via Caddy + SOPS env wiring). The Scion-dependent half (per-Scion bearer injection on outbound proxy requests, public-mode WS to each Scion's forge) was folded into the post-v1 Helix/Speaker migration bean during ges3's closure — the mechanics ([[Nooscope-r5kh]] envsubst + bearer headers) are in place; only the SOPS-side per-Scion token generation is pending, and it only makes sense once those Scions actually live on Thriden.
3. **Dynamic Scion config** — done via [[Nooscope-de9m]] (entrypoint consumes forge-web `/scions`) + [[Nooscope-rxnd]] (config registry sync). [[Nooscope-thvl]] added first-run-gate tolerance so the registry probe survives a fresh Pi5 with PF setup not yet completed.
4. **DM Cairn auto-appears in the Scion selector once provisioned** — Nooscope-side mechanics ready (de9m's dynamic registry will pick up Cairn the next time the nooscope container starts after Cairn lands in PF's `/scions` roster). Actual Cairn provisioning is a PF/operator event tracked under [[MindHive-h9fz]], not a Nooscope code item.

**Smoke-test Pi5 readiness:** the stack should bring up cleanly end-to-end with zero Scions today — Caddy serves the bundle over TLS at `noo.thriden.dev`, the thvl fix means PF's setup_required 503 no longer restart-loops the container, admin login resolves the SOPS-provided password, and `/healthz` reports `scions=0`. Live verification happens on the next Pi5 deploy run; no Nooscope code blocks it.

Post-v1 Scion migration (Helix/Speaker → Thriden) will exercise the per-Scion token pipeline. Until then, this milestone's Nooscope deliverables are complete.

---

## Original Bean Body (preserved for history)

## Scope (Nooscope side)

Nooscope's contributions to the Thriden Stack v1 deployment milestone. The master milestone lives in MindHive as 'MindHive-h9fz' — see that bean for overall goal, architecture decisions, and cross-system context.

## Acceptance criteria (NS-specific)

- Nooscope image publishes to private GHCR with multi-arch (amd64+arm64) manifests via tagged-release workflow
- Nooscope deployed at https://noo.thriden.dev with valid wildcard TLS, public/admin mode discrimination working
- Scion config (the served config.js) is dynamically populated from a source of truth, not baked at image build
- DM Cairn appears in Nooscope's Scion selector automatically once provisioned on the stack

## Cross-repo

Reference: MindHive-h9fz (master milestone). PersonaForge's parallel milestone is in ../PersonaForge/.beans (PersonaForge-ucxr).

## Relationship to existing Nooscope work

The 'Network-facing public/admin mode' epic ([[Nooscope-ges3]]) in this milestone is the active deployment context for the public/admin posture established in [[Nooscope-kyyw]] (content-blind streams, structural-only data) and the auth mechanism shipped in [[Nooscope-r5kh]] (Nooscope-level admin password → server-side nginx envsubst of per-Scion bearer headers; browser never holds upstream credentials).

Both kyyw and r5kh remain source-of-truth design docs. The ges3 epic carries Thriden-specific deployment context: TLS via Caddy at *.thriden.dev, wiring SOPS-decrypted upstream tokens into the Pi5 docker-compose so nginx envsubst has values to inject on outbound requests to Pi5-resident brains.

## Out of scope (parked)

- Mobile-friendly view, embedded thumbnail mode, etc. — separate enhancement milestone