---
# Nooscope-e5nv
title: Wire SOPS-decrypted upstream tokens into Pi5 docker-compose
status: todo
type: task
priority: high
created_at: 2026-05-21T00:00:00Z
updated_at: 2026-05-21T00:00:00Z
parent: Nooscope-ges3
---

Make the Pi5 deployment of Nooscope work end-to-end against *.thriden.dev brains by ensuring the per-Scion upstream tokens are present in the Nooscope container's environment, where `docker-entrypoint.sh` + nginx envsubst expect them. The tokens themselves are produced by MindHive's SOPS+age infrastructure; this bean is the wiring between that infrastructure and the Nooscope container.

## Why

[[Nooscope-r5kh]] established that per-Scion upstream credentials live in env vars on the Nooscope host, not in the served browser bundle. `docker-entrypoint.sh` reads them and runs `envsubst` on `nginx.conf.template` with an explicit allow-list:

```
${RAVEN_TOKEN_SPEAKER} ${RAVEN_TOKEN_HELIX}
${MORPHEUS_TOKEN_SPEAKER} ${MORPHEUS_TOKEN_HELIX}
${FORGE_WEB_ADMIN_TOKEN}
```

On localhost dev, these come from `MindHive/.env` via compose. On the Pi5, they need to come from the SOPS-decrypted secrets bundle that `MindHive-n1kd` produces. The plumbing between "SOPS decrypts on the host" and "the Nooscope container sees env vars" is what this bean covers.

## Scope

- Identify which `docker-compose.yml` (or stack file) on the Pi5 defines the Nooscope service. Likely lives in the MindHive repo's deployment dir.
- Add an `env_file:` or per-var `environment:` mapping pulling from the SOPS-decrypted artifact (per [[MindHive-n1kd]]'s output shape — verify name/path during impl).
- Confirm the same env vars Nooscope reads on dev (`RAVEN_TOKEN_SPEAKER` etc.) are the names SOPS emits, or document the mapping if names differ.
- Confirm `NOOSCOPE_ADMIN_PASSWORD` (per r5kh) also flows through — it's the same env-var pattern but a different secret tier (rotatable, narrower recipient set perhaps).
- Confirm `NOOSCOPE_HOST` is set to `noo.thriden.dev` in the prod compose so docker-entrypoint takes the production-mode branch when writing `config.js`.

## Acceptance

- [ ] `docker compose up -d nooscope` on the Pi5 starts the container with the full env-var set populated from SOPS.
- [ ] `docker exec nooscope env | grep -E '^(RAVEN|MORPHEUS|FORGE_WEB|NOOSCOPE)_' ` shows all expected vars populated (non-empty values).
- [ ] `docker logs nooscope` shows `Nooscope ready (mode: production, admin: enabled)`.
- [ ] From a browser, logging into admin mode at `https://noo.thriden.dev` and switching to a Scion shows admin-gated telemetry events (proves nginx envsubst injected real tokens, upstream auth succeeded).
- [ ] No upstream tokens visible in `config.js` served to the browser (verify with curl + grep).
- [ ] Bouncing the container without re-pushing the image preserves token availability (proves env wiring is durable across restarts, not just a one-time `docker run -e` shape).

## Out of scope

- Producing the SOPS bundle itself — that's [[MindHive-n1kd]]'s deliverable.
- Adding new Scions to the upstream-token allow-list — that's tangled with [[Nooscope-de9m]]'s dynamic registry work.
- Cross-Scion `FORGE_WEB_ADMIN_TOKEN` enforcement on the PF side — forge-web's app-layer auth is a separate PF concern (r5kh notes this).
- Rotating tokens. Mechanism for `docker compose up -d` to pick up rotated secrets is part of MindHive's secret-rotation story, not Nooscope's.

## Origin / coordination

- Replaces [[Nooscope-o83r]] (abandoned 2026-05-21, superseded by r5kh).
- [[Nooscope-r5kh]] (done): established the env-var-driven nginx envsubst model this bean depends on.
- [[Nooscope-ges3]] (parent epic): Thriden-deploy context for the public/admin posture.
- MindHive-n1kd (SOPS+age infra): produces the secrets bundle this bean reads from.
- MindHive-6h33 (Pi5 host provisioning): provides the host environment compose runs inside.
- MindHive-h9fz (master milestone): the broader Thriden Stack v1 deployment this bean contributes to.
