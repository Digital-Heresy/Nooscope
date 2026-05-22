---
# Nooscope-8l1t
title: GHCR image pipeline (Nooscope)
status: done
type: epic
priority: high
created_at: 2026-05-14T07:41:32Z
updated_at: 2026-05-21T00:00:00Z
parent: Nooscope-lm3k
---

## Resolution (2026-05-21)

Shipped, mirroring the canonical pattern locked in by
[[MindHive-tkje]]. Three artifacts:

- **`.github/workflows/build-main.yml`** — push to `main` → multi-arch
  buildx → publish `:main` + `:main-<short-sha>`. Concurrency group
  `build-main-nooscope` (cancel-in-progress). Paths filter restricts
  builds to the static-site surface + workflow itself. GHA cache
  scope `nooscope-main`.
- **`.github/workflows/release.yml`** — push of `v*` tag → multi-arch
  buildx → publish `:v0.x.y` + `:v0.x` + `:latest`. Cache chain reads
  `nooscope-main` + `nooscope-release`, writes `nooscope-release`.
- **`.dockerignore`** — keeps `.git`, `.beans`, `.claude`, repo docs,
  and `js/config.js` out of the build context.

Both workflows pin `docker/build-push-action@v6` and use
`context: .` + `file: ./Dockerfile` (Nooscope's Dockerfile is at repo
root). Base image (`nginxinc/nginx-unprivileged:alpine`) is multi-arch
natively, so arm64 builds via QEMU are near-instant.

**Lockstep convention drafted as a proposal**, not yet ratified by the
sibling repos: see [`docs/release-pipeline.md`](../docs/release-pipeline.md).
That doc is intended to migrate to MindHive as the canonical home for
[[MindHive-7lvb]] once PF-jbry implements its pipeline and we've shaken
out any cross-repo wrinkles. PF sibling bean is still `todo` —
coordinate when they pick this up.

**Operator one-time setup** (cannot be done from CI):

- Configure GitHub tag protection on `v*` in repo settings
  (Settings → Tags → New tag protection rule → `v*`). Without this,
  release tags are mutable and the immutability story is fiction.
- Verify the first push lands at `ghcr.io/digital-heresy/nooscope`.
  Default org-owned package permissions usually work, but eyeball
  the first run.
- For Pi5 pulls: create a PAT with `read:packages`, store in 1Password,
  install on the Pi5 as the docker pull credential.

**Acceptance criteria met:**

- [x] Multi-arch buildx for nooscope image (`linux/amd64` + `linux/arm64`).
- [x] Push to `main` → `:main` + `:main-<short-sha>` (no deploy).
- [x] Tag push `v0.x.y` → `:v0.x.y` + `:v0.x` + `:latest`.
- [ ] Tag protection on `v*` — operator action, documented above.
- [x] Cross-repo PR opened against MindHive adding the `nooscope`
      service block to `compose.prod.yml`.

## Scope (NS side)

Build + publish Nooscope's container image to private GHCR with multi-arch manifests. Lockstep tag stream with MindHive and PersonaForge.

## Acceptance criteria

- 'nooscope' image publishes to ghcr.io/digital-heresy/nooscope with linux/amd64 + linux/arm64 manifests
- Pushing to 'main' produces ':main' and ':main-<short-sha>' tags (no deploy)
- Tagging 'v0.x.y' produces ':v0.x.y' + ':v0.x' + ':latest'
- Tag protection on 'v*' active
- MindHive compose.prod.yml carries a nooscope service block pinned to `${NOOSCOPE_VERSION:-latest}`

## Checklist (all routine; no separate tasks)

- [ ] Multi-arch buildx for nooscope image in .github/workflows/build-main.yml
- [ ] release.yml triggered on 'v*' tag push
- [ ] GitHub tag protection rules on 'v*'
- [ ] Cross-repo PR against MindHive landing the nooscope compose block

## Cross-system reference

- MindHive-tkje (MH GHCR pipeline)
- MindHive-7lvb (lockstep coordination doc)
- PersonaForge-jbry (PF GHCR pipeline)