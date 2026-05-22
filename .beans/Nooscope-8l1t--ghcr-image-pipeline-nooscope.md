---
# Nooscope-8l1t
title: GHCR image pipeline (Nooscope)
status: done
type: epic
priority: high
created_at: 2026-05-14T07:41:32Z
updated_at: 2026-05-22T00:00:00Z
parent: Nooscope-lm3k
---

## Resolution (2026-05-22)

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

**First successful build:** commit `ca9e132` → `:main` + `:main-ca9e132`,
manifest list digest `sha256:79b159cc7990…`. Live OCI index confirmed
to contain both `linux/amd64` (`sha256:05bb80a70925…`) and
`linux/arm64` (`sha256:a962af699b35…`), each with a `mode=max`
provenance attestation. End-to-end build took 59s.

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
      First run on `ca9e132` succeeded and registry index verified.
- [x] Tag push `v0.x.y` → `:v0.x.y` + `:v0.x` + `:latest` (workflow
      shipped; will fire on first NS release tag).
- [ ] Tag protection on `v*` — operator action, documented above.
- [x] Cross-repo handoff to MindHive: `compose.prod.yml` block drafted
      locally in MH checkout (build reset, `image:
      ghcr.io/digital-heresy/nooscope:${NOOSCOPE_VERSION:-latest}`,
      `pull_policy: always`) with recap blurb delivered for the MH
      session to commit on its own cadence.

## Scope (NS side)

Build + publish Nooscope's container image to private GHCR with multi-arch manifests. Lockstep tag stream with MindHive and PersonaForge.

## Acceptance criteria

- 'nooscope' image publishes to ghcr.io/digital-heresy/nooscope with linux/amd64 + linux/arm64 manifests
- Pushing to 'main' produces ':main' and ':main-<short-sha>' tags (no deploy)
- Tagging 'v0.x.y' produces ':v0.x.y' + ':v0.x' + ':latest'
- Tag protection on 'v*' active
- MindHive compose.prod.yml carries a nooscope service block pinned to `${NOOSCOPE_VERSION:-latest}`

## Checklist (all routine; no separate tasks)

- [x] Multi-arch buildx for nooscope image in .github/workflows/build-main.yml
- [x] release.yml triggered on 'v*' tag push (workflow shipped; not yet exercised — no NS release tag cut)
- [ ] GitHub tag protection rules on 'v*' (operator-side)
- [x] Cross-repo handoff to MindHive for the nooscope compose block (local edit + blurb delivered)

## Cross-system reference

- MindHive-tkje (MH GHCR pipeline)
- MindHive-7lvb (lockstep coordination doc)
- PersonaForge-jbry (PF GHCR pipeline)