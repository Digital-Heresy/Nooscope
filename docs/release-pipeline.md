# Release pipeline & lockstep coordination

**Status:** proposal — to be ratified as **MindHive-7lvb** ("Lockstep
release coordination doc (MH/PF/NS)"). Drafted from Nooscope as part of
[Nooscope-8l1t](../.beans/Nooscope-8l1t--ghcr-image-pipeline-nooscope.md);
the canonical home should move to MindHive once the doc is reviewed by
the other two repos.

## Goal

Three repos (MindHive, PersonaForge, Nooscope) build container images
that are deployed together as the Thriden stack. This doc defines the
shared conventions so that:

- `docker compose pull` on the Pi5 deploys a consistent stack version.
- `:main` images from any of the three repos can be co-tested locally
  against each other.
- Rolling back the stack to an immutable version is a single mental
  operation, not a per-repo treasure hunt.

## Image registry

`ghcr.io/digital-heresy/<repo>` for all three:

- `ghcr.io/digital-heresy/mindhive`
- `ghcr.io/digital-heresy/personaforge`
- `ghcr.io/digital-heresy/nooscope`

Private packages, owned by the `digital-heresy` org. Each repo's CI
authenticates with `GITHUB_TOKEN` (built-in) plus `packages: write`
permission on its workflow jobs.

## Tag streams

Two tag streams per repo. All images are multi-arch
(`linux/amd64` + `linux/arm64`).

### Rolling `:main` stream

- `:main` — rolling tag, points at the latest `main` HEAD.
- `:main-<sha>` — immutable per-commit tag, full git SHA. Lets
  someone running local stack against `:main` pin a specific build
  when chasing a bug.

Push trigger: any push to `main`. No deploy fires from this stream.
This is for local-dev consumption only.

### Versioned `:v*` stream

- `:v0.3.0` — immutable, exact version. Hosted Scions track this stream.
- `:v0.3` — major.minor floating pointer. Convenience for "give me the
  newest 0.3.x" without committing to a specific patch. Not for
  production reference.
- `:latest` — rolling, latest released version. Convenience for ad-hoc
  pulls; not for production reference.

Push trigger: pushing a git tag matching `v*` (semver: `v<major>.<minor>.<patch>`).
The release workflow builds + pushes both tags.

**Tag protection:** `v*` is protected in GitHub repo settings on all
three repos. Without protection, anyone with push access could mutate
a released tag and silently swap the contents of a deployed Scion.
Protection is configured per-repo via Settings → Tags → New tag
protection rule (`v*`).

## Lockstep coordination

The three repos version *independently*. A stack version is the
specific *tuple* of three image versions, not a single number.

What "lockstep" means here:

- All three repos publish a `:v0.3.0` style tag on release.
- Each repo's release is independent — MindHive doesn't have to release
  to allow PF to release.
- Deployers pick a triple (e.g. `MH v0.4.1` + `PF v0.5.0` + `NS v0.3.2`)
  for a given stack rollout. Compose file pins each image's tag
  explicitly. Compatibility between specific triples is tracked in
  MindHive's deploy docs / release notes, not via constraints in the
  registry.

This avoids the trap of forcing all three repos to share one version
number — they evolve at different cadences and conflating them creates
phantom "releases" of repos that didn't actually change.

## Why not `:latest`-only deploys?

Hosted Scions never reference `:latest` directly. Reasons:

- **No rollback story.** `:latest` is a moving target; "the version
  that was running yesterday" isn't recoverable without out-of-band
  tracking.
- **Indirect cache problems.** Compose's pull behavior differs across
  environments; subtle inconsistencies (one Pi5 on `latest@sha-abc`,
  another on `latest@sha-def`) become invisible without explicit tags.
- **Tag protection only meaningful on immutable tags.** A protected
  `:latest` would just be "you can't push to latest" — useless.

`:latest` is published for human convenience. Machines pin `:v0.x.y`.

## Compose pinning convention (deployment-side)

On the Pi5, the production compose file references images by immutable
tag:

```yaml
services:
  nooscope:
    image: ghcr.io/digital-heresy/nooscope:v0.3.2
  forge-speaker:
    image: ghcr.io/digital-heresy/personaforge:v0.5.0
  engram-speaker:
    image: ghcr.io/digital-heresy/mindhive:v0.4.1
```

`docker compose pull && docker compose up -d` swaps versions as part of
a deploy. Rolling back is `git revert` on the compose file +
`docker compose up -d`.

## Operator one-time setup (per repo, per fresh checkout)

- GitHub repo Settings → Tags → New tag protection rule → `v*` →
  apply. Without this, a release tag is mutable and the protection
  story above is fiction.
- GHCR package settings (after first push) → Manage Actions access →
  add the repo with `Write` role. Default access usually works for
  org-owned packages but verify first push lands in the right org.
- For pulls from the Pi5: create a personal access token (classic)
  with `read:packages`, store in 1Password, install on the Pi5 as
  the docker pull credential.

## Out of scope

- **Stack-level release tagging** (one tag for the whole-stack
  triple). Possible future MindHive bean if releasing the stack as a
  unit gets painful. For now, MindHive's deploy docs track which
  triples are blessed.
- **SBOM / SLSA provenance attestations.** Docker scout flagged the
  base image as "auto-detected" because we don't ship provenance
  attestations on builds. Worth adding for security posture, but
  separate concern — file as its own bean if/when we want it.
- **Automated PR-trigger builds** (build without push on PR for
  validation). Useful for non-trivial Dockerfile changes; not in
  the v1 scope.
- **Per-build smoke tests in CI.** Could verify the published image
  actually starts under arm64 QEMU before labelling. Skipped in v1
  to keep CI minimal and lockstep with the MindHive shape; revisit
  if a bad image ever ships and we can't catch it earlier.
