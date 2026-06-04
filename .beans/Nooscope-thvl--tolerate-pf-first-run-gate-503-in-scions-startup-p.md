---
# Nooscope-thvl
title: Tolerate PF first-run-gate 503 in /scions startup probe
status: done
type: task
created_at: 2026-06-04T08:01:48Z
updated_at: 2026-06-04T23:56:48Z
---

## Scope

Make Nooscope's startup probe tolerant of PF's first-run-gate response, so a fresh Pi5 deploy (where PF setup hasn't been walked through yet) doesn't put the Nooscope container into a restart-loop.

Closes the Nooscope-side half of `MindHive-jsei`. Audit and three-option trade-off chart live in `MindHive/docs/jsei-audit.md`; operator picked Option B (Nooscope-side fix) over A (PF bypass-list change) or C (operator runbook).

## Current behaviour

`docker-entrypoint.sh:71-96` does:

1. `wget --header "Accept: application/json" http://${FORGE_WEB_HOST}/scions`, 5 retries with 2s backoff.
2. The check is "did wget succeed?" Any non-2xx response (including PF's `503` with body `{"error": "setup_required", "setup_url": "/setup"}`) makes wget exit non-zero.
3. After 5 failed attempts: `exit 1` with a "FATAL: could not reach ... Refusing to start with a stale Scion list" message.
4. Docker compose restart-loops the container.

The PF-side gate (`PersonaForge/forge/admin/web/routes/setup.py:44-78`) returns 503 with a clearly-marked JSON sentinel until the operator completes setup via `POST /setup/complete`. That's intentional, not a bug — operator hasn't named the deployment yet.

## What to do

Modify the probe to inspect the response body, not just the wget exit code. If status is 503 AND body parses as JSON AND has `error == "setup_required"`, treat that as a deterministic "no scions yet, continue" signal — same downstream path as the empty `{"scions": []}` case (which `33e662d` already tolerates).

All other failure modes (network unreachable, 5xx without the sentinel, malformed body, non-503 errors) keep the existing "fail loud + exit 1" behaviour.

## Suggested implementation sketch

```bash
# Instead of `wget --quiet --output-document=- ...` exiting non-zero on 503:
HTTP_CODE=$(wget --server-response --header "Accept: application/json" \
  --output-document=/tmp/scions.body \
  "http://${FORGE_WEB_HOST}/scions" 2>&1 | awk '/^  HTTP\//{print $2}' | tail -1)

case "$HTTP_CODE" in
  200)
    SCIONS_JSON=$(cat /tmp/scions.body)
    ;;
  503)
    if jq -e '.error == "setup_required"' /tmp/scions.body >/dev/null 2>&1; then
      echo "PF reports setup_required; treating as empty roster"
      SCIONS_JSON='{"scions": []}'
    else
      # Real 503 (e.g. PF crashed) -- continue retrying
      sleep 2; continue
    fi
    ;;
  *)
    sleep 2; continue
    ;;
esac
```

(Sketch only — actual wget on the deployed Nooscope image may need slightly different flag handling. `jq` is already available; it's used downstream at line 112.)

## Acceptance

- Bringing up the Thriden stack on a fresh Pi5 (PF setup not yet completed) results in Nooscope starting successfully with an empty Scion roster, instead of restart-looping.
- After PF setup is completed and a Scion is provisioned, the probe sees the 200 + populated `{"scions": [...]}` response and behaves identically to today.
- A genuinely broken PF (5xx without the sentinel, network unreachable) still triggers the existing fail-loud behaviour.
- Unit / integration: a unit test or local stub of `forge-web` returning 503 + `setup_required` should let the entrypoint exit cleanly with `SCIONS_JSON='{"scions": []}'`.

## Cross-system

- Resolves the Nooscope-side half of `MindHive-jsei`. That MindHive bean closes when this lands.
- Unblocks `Nooscope-ges3` / `Nooscope-e5nv` validation that's been parked since 2026-05-23.
- Doesn't touch the PF-side setup gate — PF's "everything is locked until setup completes" guarantee stays uniformly strict, which is what tipped the decision toward Option B.

## Trade-offs accepted

- Encodes a PF-side error sentinel (`error: setup_required`) into Nooscope's startup logic. If PF's error shape changes, Nooscope breaks silently — mitigated by the jq exit-code check (a missing field triggers the "real 503" branch and retry).
- Slightly bigger shell diff than the PF-side fix would have been. Justified by keeping PF's gate semantics clean.

## Out of scope

- Refactoring the broader docker-entrypoint.sh probe logic.
- Adding a separate "PF healthcheck" endpoint to disambiguate from `/scions` (would be a PF change, which we're explicitly avoiding here).
