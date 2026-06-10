---
# Nooscope-oh9z
title: 'thvl follow-up: rewrite /scions probe with curl instead of BusyBox nc (read-timing bug)'
status: done
type: bug
created_at: 2026-06-08T15:09:19Z
updated_at: 2026-06-10T00:00:00Z
---

## Scope

Follow-up to [[Nooscope-thvl]]. That bean shipped a fix for PF's first-run-gate 503 sentinel detection — the probe now distinguishes a `503 + {"error":"setup_required"}` body from a real failure and continues with an empty roster. The IMPLEMENTATION of that fix has a separate read-timing bug surfaced during MindHive's bjng zero-state install dry-run on 2026-06-04.

Live reproduction on pi5-smoke: Nooscope restart-loops with "FATAL: could not reach http://forge-web:8200/scions with a usable response after 5 attempts." despite the thvl fix being in `ghcr.io/digital-heresy/nooscope:main`. The 503 response from forge-web IS sent, but never reaches the capture file.

Confirmed reproducible from a sidecar container on the same image:

```
$ printf 'GET /scions HTTP/1.0\r\nHost: forge-web:8200\r\nAccept: application/json\r\nConnection: close\r\n\r\n' \
  | nc -w 10 forge-web 8200
(empty output)
```

Confirmed the response IS being sent, just not read, by keeping stdin open longer:

```
$ (printf '...'; sleep 2) | nc -w 5 forge-web 8200
HTTP/1.1 503 Service Unavailable
date: ...
{"error":"setup_required","setup_url":"/setup"}
```

## Root cause

BusyBox nc 1.37 (per `BusyBox v1.37.0 (2025-12-16)` in the nooscope image) closes the connection too eagerly after stdin EOF. The probe in `docker-entrypoint.sh:80-101` writes the request, hits stdin EOF, and the read side is torn down before forge-web's response arrives. The case statement in the probe (`docker-entrypoint.sh:114-138`) hits the empty-HTTP_CODE branch and logs "unreachable" on every attempt.

## Suggested fix

Switch from BusyBox nc to curl (already in the image; used for the post-success path at line 159). One concrete shape:

```sh
HTTP_CODE=$(curl -sS -o "$SCIONS_BODY" -w '%{http_code}' \
    --max-time 10 \
    --header "Accept: application/json" \
    "$SCIONS_URL" 2>/dev/null || echo "")
```

Drops the manual `printf '...' | nc | tr -d '\r' | awk | sed` pipeline (currently lines 100-108 of the entrypoint). The body lands directly in `$SCIONS_BODY` and the HTTP code is captured in one shot. The `case` statement at line 114 onward works unchanged.

Alternative: keep nc but add a `sleep 2` between printf and nc's stdin EOF. Fragile against future BusyBox versions; curl is the durable answer.

## Implementation (2026-06-10)

**Did NOT switch to curl** — the suggested fix's premise was wrong. curl is
not in the runtime image: `f624b74` (2026-05-21) ran `apk del curl` to clear
three High curl CVEs (CVE-2026-6276, -5773, -3805; alpine 3.23 curl <8.19),
post-rebuild Scout scan `0C/0H/0M/0L`, and `Dockerfile` + `.claude/knowledge/
deployment.md` codify the "don't re-add what was removed for CVEs" posture.
Re-adding curl would reintroduce that surface. Chose the durable-within-posture
path instead (operator confirmed).

**Fix shipped:** kept BusyBox nc, but the request is now written by a brace
group that holds nc's stdin open ~2s after the request
(`{ printf '...'; sleep 2; } | nc -w 10 ...` in `docker-entrypoint.sh`). That
stops nc 1.37 from tearing down the read side on stdin EOF before forge-web's
(immediate) 503 lands. The shell waits for the whole pipeline, so it costs a
fixed ~2s per probe attempt; the loop breaks on the first usable response, so
on the happy path that's paid once at container start. The `case` statement,
retry loop, and TSV parsing downstream are untouched.

Also corrected the stale `Dockerfile` comment that claimed the probe uses
`wget` (it's used nc since thvl).

**Verification (2026-06-10):** built the image and ran the real BusyBox-nc
runtime against a mock forge-web that reproduces the three response shapes.
All three local acceptance paths pass:
- first-run `503 + {"error":"setup_required"}` → container reaches "Nooscope
  ready", stays running (0 restarts), `/healthz` reports `scions=0`, empty
  config.js roster. The probe logs the setup_required branch, proving nc now
  *reads the 503 body* (the bug: it never did). This mock run is a faithful
  local reproduction of the bjng zero-state scenario.
- `200` + valid `{"scions":[...]}` → "loaded 1 Scion(s)", `scions=1`, roster
  row rendered. Happy path intact.
- forge-web unreachable → FATAL, exit 1 after 5 attempts. Fail-loud intact.

Remaining cross-system step: the formal re-run of MindHive's bjng zero-state
install dry-run (`docs/bjng-dry-run-2026-06-04.md`) on pi5-smoke is the
MindHive-side closure for [[MindHive-bjng]] — handed off to the operator (the
Nooscope code fix it depends on is now in the working tree, verified).

## Acceptance

- pi5-smoke nooscope container starts cleanly with PF in its first-run-gate state (503 + setup_required).
- Same probe still passes when forge-web returns 200 + valid `{"scions": [...]}` (post-setup).
- Other error modes (forge-web down, network unreachable, malformed body, non-503 5xx) still hit the existing fail-loud branches.
- A re-run of the MindHive bjng zero-state install dry-run (`docs/bjng-dry-run-2026-06-04.md`) gets Nooscope to "Running" instead of "Restart-looping."

## Cross-system

- Diagnosis lives in MindHive's `docs/bjng-dry-run-2026-06-04.md` finding #5.
- Closes the last live blocker for [[MindHive-bjng]]'s "Pi5 zero-state boot dry run" sub-task.
- [[Nooscope-thvl]] is the parent fix; this bean is the implementation-correctness follow-up.

## Out of scope

- Refactoring the broader probe logic (the case statement, the retry loop, the post-success TSV parsing — all working correctly today; only the nc invocation is the bug).
- Adding a separate /healthz endpoint on forge-web (PF-side concern, captured separately in the dry-run doc as finding #6).
