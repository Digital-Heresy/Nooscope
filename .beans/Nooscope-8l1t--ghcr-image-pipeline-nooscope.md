---
# Nooscope-8l1t
title: GHCR image pipeline (Nooscope)
status: todo
type: epic
priority: high
created_at: 2026-05-14T07:41:32Z
updated_at: 2026-05-14T07:41:32Z
parent: Nooscope-lm3k
---

## Scope (NS side)

Build + publish Nooscope's container image to private GHCR with multi-arch manifests. Lockstep tag stream with MindHive and PersonaForge.

## Acceptance criteria

- 'nooscope' image publishes to ghcr.io/digital-heresy/nooscope with linux/amd64 + linux/arm64 manifests
- Pushing to 'main' produces ':main' and ':main-<sha>' tags (no deploy)
- Tagging 'v0.x.y' produces ':v0.x.y' and ':latest'
- Tag protection on 'v*' active

## Checklist (all routine; no separate tasks)

- [ ] Multi-arch buildx for nooscope image in .github/workflows/build-main.yml
- [ ] release.yml triggered on 'v*' tag push
- [ ] GitHub tag protection rules on 'v*'
- [ ] Smoke test: pull ':main-<sha>' on arm64, container serves index.html

## Cross-system reference

- MindHive-tkje (MH GHCR pipeline)
- MindHive-7lvb (lockstep coordination doc)
- PersonaForge-jbry (PF GHCR pipeline)