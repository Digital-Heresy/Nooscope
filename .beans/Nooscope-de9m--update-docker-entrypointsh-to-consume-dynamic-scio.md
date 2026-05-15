---
# Nooscope-de9m
title: Update docker-entrypoint.sh to consume dynamic Scion source
status: todo
type: task
created_at: 2026-05-14T07:42:08Z
updated_at: 2026-05-14T07:42:08Z
parent: Nooscope-rxnd
---

Engineering, depends on the source-of-truth decision task. Refactor docker-entrypoint.sh's config.js generation: replace the hard-coded Scion list with logic that reads from the chosen source on container start. Preserve the existing field shape (ports + names) so the frontend doesn't change. Add a /healthz endpoint that reports the loaded Scion count so the operator can verify the registry was populated. Acceptance: re-running 'docker compose up -d nooscope' after a new Scion lands picks up the new entry in config.js without rebuilding the image.