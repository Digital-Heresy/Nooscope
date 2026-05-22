# Scion config registry: source of truth

**Status:** decision (Nooscope-pxfn), 2026-05-21
**Implements gate for:** [Nooscope-de9m](../.beans/Nooscope-de9m--update-docker-entrypointsh-to-consume-dynamic-scio.md)
**Parent:** [Nooscope-rxnd](../.beans/Nooscope-rxnd--scion-config-registry-sync.md) / [Nooscope-lm3k](../.beans/Nooscope-lm3k--thriden-stack-v1-nooscope-contributions.md) (Thriden Stack v1)

## Decision

**Pick (b): PersonaForge admin web's JSON `/scions` endpoint.**

On container start, `docker-entrypoint.sh` fetches `GET /scions` with
`Accept: application/json` from `forge-web` on the backend docker network
(`http://forge-web:8200/scions`), filters to `live-*` badge states, and
writes the result into `config.js`'s `scions:` block.

## Context

Nooscope's `docker-entrypoint.sh` currently hard-codes a two-Scion list
(`speaker`, `helix`) when generating `config.js`. For the Thriden Stack v1
deployment, new Scions provision dynamically — DM Cairn lands during
validation; further Scions later. Nooscope needs to learn about them
without rebuilding the image.

Four candidate sources were considered.

## Options surveyed

### (a) HiveMind registry — `GET /instances` on fleet-manager

`engram-hivemind` exposes `GET /instances` (with optional `?status=healthy`
filter), returning `{ scion_name, port, status, ... }` per provisioned
brain. Bearer-auth-gated by `HIVEMIND_RAVEN_TOKEN`.

**Pros:**
- Real-time view of provisioned brains.
- Already returns JSON, already paginates trivially.
- Status field gives health filtering for free.

**Cons:**
- Requires a new secret on the Nooscope host (`HIVEMIND_RAVEN_TOKEN`).
- Queries the *wrong layer* for Nooscope's question. HiveMind tracks
  brain instances; Nooscope wants to know which Scions PF has awakened.
  A Scion exists conceptually in PF whether or not its brain is up; a
  brain can exist in HiveMind without a forge runtime that uses it (per
  MindHive-thrz). For "what should appear in the Scion selector," PF
  is closer to the source of truth.
- Doesn't give us display name or PF-side state (`badge`). Nooscope
  would still need to bridge `scion_name` to PF's display conventions.
- `MindHive-thrz` doesn't *block* this option for Nooscope's use case
  (Nooscope doesn't consume the `engram_url` field, it routes via
  nginx pfPrefix), but the bug indicates HiveMind's networking story
  is not yet fully baked.

### (b) PersonaForge admin web — `GET /scions` with `Accept: application/json`

`forge-web:8200` exposes a JSON variant of `/scions` since
[PersonaForge-n3kx](../../PersonaForge/.beans/PersonaForge-n3kx--admin-web-json-variant-of-scions-list-for-program.md)
shipped 2026-05-13. Returns `{ scion_id, name, owner, model_name, badge,
engram_bound }` per Scion. Bind-to-localhost (no app-layer auth);
reachable from sibling containers on the docker backend network.

**Pros:**
- Authoritative for the question Nooscope is actually asking. PF is
  where Scions exist conceptually — Souls, identities, runtime state.
- `badge` field gives "live-online" / "live-offline" / "awaiting-kiln"
  filtering for free. Nooscope just keeps the `live-*` ones.
- Zero new secrets. forge-web is reachable on the backend network
  without auth (single-creator localhost / Pi5 deploy posture).
- Already a dependency. nginx already proxies `/admin/scions/...`
  routes to forge-web for the social-graph viewer (Nooscope-nkvw).
  Adding `/admin/scions` (the list) is one more route, not a new
  service relationship.
- One operator action when DM Cairn lands ("forge it on PF") makes it
  appear in Nooscope automatically on next container restart. No
  separate "tell Nooscope about Cairn" step.

**Cons:**
- Naming-convention bridge required (see below).
- Synchronous HTTP dependency at container start. forge-web has to be
  up before Nooscope's entrypoint completes. Mitigation: retry-with-
  backoff in the entrypoint; fallback to a baked-in minimal list
  (speaker, helix) if forge-web doesn't respond within ~10s.

### (c) Compose env var — operator maintains a list in MindHive `.env`

Encode the Scion list in a single env var (e.g.
`NS_SCIONS=speaker:Speaker,helix:Helix,cairn:Cairn`). Entrypoint
parses and emits the `scions:` block.

**Pros:**
- Zero new infrastructure or HTTP dependencies. Pure config.
- Predictable. The list Nooscope shows is exactly what the operator typed.
- Trivial to debug (`docker exec nooscope env | grep NS_SCIONS`).

**Cons:**
- Defeats the milestone goal. The Thriden Stack v1 acceptance criterion
  is "DM Cairn appears in Nooscope's Scion selector automatically once
  provisioned." Option (c) requires an explicit operator action per
  new Scion — exactly the manual step we're trying to eliminate.
- Two places to keep in sync (PF Soul + this env var). Drift surface.

### (d) Filesystem mount — JSON file in a watched volume

Operator drops `scions.json` in a docker-mounted volume; entrypoint
reads it on container start.

**Pros:**
- Like (c), no HTTP dependency, no new secrets.
- Slightly richer than (c) — JSON structure can carry display names,
  prefixes, future fields.

**Cons:**
- Same fundamental flaw as (c): requires manual operator action per
  new Scion. Doesn't satisfy the auto-discovery acceptance criterion.
- New artifact to manage. Volume mount, file lifecycle, format
  versioning. More moving parts than env var for no real upside.

## Why (b) over (a)

PF and HiveMind both *could* serve this list, but they're answering
different questions:

| Question                              | Best source       |
| ------------------------------------- | ----------------- |
| "What brains has HiveMind allocated?" | HiveMind          |
| "What Scions does the operator know?" | PersonaForge      |
| "What should Nooscope's selector show?"| PersonaForge     |

Nooscope's job is to visualize a Scion as an *entity* — its memory
graph, its dreams, its social model. The right scope is "every Scion
PF knows about, filtered to ones that are currently reachable." PF's
`badge` field expresses exactly that: `live-online` means "forge is up
and brain is reachable from it." That's the Nooscope-relevant question
in one field, server-side.

HiveMind sees a different slice. A brain can be provisioned without a
forge runtime; a forge can exist with a `live-offline` badge if its
brain is down. Either ambiguity defeats Nooscope's "is this Scion
currently inspectable" question.

(b) also avoids introducing a new secret. (a) requires
`HIVEMIND_RAVEN_TOKEN` to flow into Nooscope's env — one more SOPS
recipient, one more rotation concern. (b) leverages the existing
forge-web reachability story.

## Why (b) over (c)/(d)

Both manual-config options fail the milestone acceptance criterion:
*"DM Cairn appears in Nooscope's Scion selector automatically once
provisioned on the stack."* Provisioning Cairn means awakening it on PF
(creating the Soul + binding a brain). After that, in option (b),
Nooscope picks up Cairn on the next container restart with zero
additional operator action. In options (c)/(d), the operator still has
to edit a file and restart compose. The auto-discovery goal is the
*reason* we're filing rxnd in the first place; the manual options
recreate the problem they were filed to solve.

## Naming convention bridge — depends on PF adding `scion_slug`

PF uses canonical `scion_id` values like `dh-speaker`, `dh-helix`
(`dh-` is the org prefix for "Digital Heresy"). Nooscope's existing
artifacts use shortnames:

- `js/config.js`: `scions: { speaker: {...}, helix: {...} }`
- `nginx.conf.template`: `/speaker/ws/telemetry`,
  `set $engram_speaker engram-speaker:3030`
- Docker compose service names: `engram-speaker`, `forge-speaker`
- Env vars: `RAVEN_TOKEN_SPEAKER`, `MORPHEUS_TOKEN_SPEAKER`

**Decision:** introduce a first-class `scion_slug` field on the PF
Scion model, exposed in the `/scions` JSON response. Nooscope reads
the slug directly. No prefix stripping, no per-org conventions.

Stripping `dh-` would work today but assumes every Scion is a Digital
Heresy entity. That assumption doesn't hold (DM Cairn is a DMScion
blueprint; future Scions may not be DH-orbit at all). Burying that
assumption in a `sed` line in the entrypoint creates a latent bug — the
first non-DH Scion would get a slug equal to its full `scion_id`,
silently mismatching every operational artifact (containers, nginx
routes, env vars).

The slug is the right shape of field for this purpose: short, URL-safe,
matches the operational namespace used by docker-compose service names
and env-var suffixes. PF owns the canonical Scion model, so PF owns the
canonical slug.

**Filed:** [PersonaForge-slg9](../../PersonaForge/.beans/PersonaForge-slg9--add-scion-slug-field-to-scion-model-and-expose-in-jso.md)
— adds the field, backfills `dh-speaker → speaker` and `dh-helix → helix`
for existing Scions, requires capture at creation time (either derived
automatically from `scion_id` with documented rules, or captured during
Genesis ergonomics).

**Blocking relationship:** Nooscope-de9m's implementation waits on
PersonaForge-slg9. Per MH-h9fz's execution DAG, de9m is in step 7
(late) and PF work runs in parallel from step 2 onward, so this should
not actually delay the milestone. If timeline pressure forces de9m to
ship first, an interim `${scion_id#dh-}` strip is acceptable as a
clearly-flagged TODO — but plan A is to wait for slg9.

## Implementation outline (handed to Nooscope-de9m)

`docker-entrypoint.sh`, when `NOOSCOPE_HOST` is set (production mode):

1. `curl -sf --max-time 10 --retry 3 --retry-delay 2 -H "Accept: application/json" http://forge-web:8200/scions`
2. Parse JSON with `jq`. Keep every Scion where `engram_bound: true`
   (i.e. has been awakened against a brain — excludes pure `forged` /
   `awaiting-kiln` souls that aren't yet operational). Do **not**
   filter on `live-online` — offline-but-awakened Scions still belong
   in the selector, just visually marked (see below).
3. For each kept Scion, project to `{ slug, display_name, badge }`
   and emit a `scions:` block entry with `pfPrefix: /{slug}`,
   `host: $NOOSCOPE_HOST`, plus the `badge` field passed through so
   the frontend can render state.
4. If the fetch fails after all retries, **fail the container start**
   with a clear log message. Do not fall back to a baked-in list —
   any hardcoded list embeds an assumption about which Scions exist
   that becomes a latent lie when the fleet changes. A failing
   container start is the right failure mode: it forces the operator
   to notice forge-web is down rather than silently serving stale
   Scion lists. (Compose's restart-on-failure brings Nooscope back
   automatically once forge-web recovers.)

Dev mode (`NOOSCOPE_HOST` unset) keeps the existing hardcoded
`speaker:3030 / 8100`, `helix:3031 / 8101` shape — no behavior change.
Discovery is a prod-only concern; dev is fine with the static list,
which there is real and not a guess.

### Frontend rendering of badge state

`config.js` carries `badge` through to the browser; the selector
renders accordingly:

| `badge`         | Rendering                                    |
| --------------- | -------------------------------------------- |
| `live-online`   | Normal — bright label, fully selectable      |
| `live-sleeping` | Normal — bright label, fully selectable      |
| `live-offline`  | Dark-grey label + ` — Offline` suffix        |
| (anything else) | Dark-grey label + ` — ${badge}` suffix       |

Offline Scions remain *selectable* — the operator may want to choose
one to see what they last looked like, or to know the structural
shape is preserved. Selecting an offline Scion triggers a connection
attempt; the existing reconnect-backoff UX takes over from there
(`TelemetryStream` already handles "upstream not reachable" cleanly).

The selector's role is informational: it says "here's what the
operator's view of the fleet ought to be, here's what's actually up
right now." A discrepancy between those two views is a signal worth
surfacing, not hiding.

### Token allow-list for nginx envsubst

Per Nooscope-r5kh, nginx envsubst injects per-Scion bearer tokens
from env. The allow-list today is hardcoded to
`${RAVEN_TOKEN_SPEAKER} ${RAVEN_TOKEN_HELIX} ${MORPHEUS_TOKEN_SPEAKER}
${MORPHEUS_TOKEN_HELIX} ${FORGE_WEB_ADMIN_TOKEN}`. With dynamic
discovery, the allow-list expands based on the discovered Scion
slugs — uppercase the slug and append to the envsubst arglist.
When Cairn appears, `${RAVEN_TOKEN_CAIRN}` and `${MORPHEUS_TOKEN_CAIRN}`
join the allow-list automatically. Missing token env vars substitute
to empty — the per-Scion routes will 401 upstream, which is a clear
failure mode the operator can diagnose.

## Out of scope

- **Live discovery** (poll forge-web mid-run, hot-reload `config.js`).
  Stretch goal from rxnd. v1 ships with "container restart picks up
  new Scions" which is good enough for the validation timeline.
- **WebSocket push from PF on Scion lifecycle events.** Possible
  future enhancement; n3kx explicitly defers this.
- **Decommissioning UX.** When a Scion is retired in PF, it disappears
  from the JSON list on the next entrypoint run. No special handling
  needed on Nooscope's side; the selector just stops showing it.

## Follow-ups

- Update `js/social.js`'s hardcoded `ADMIN_SCIONS` to fetch from the
  same endpoint at page load. The TODO comment on line 14 already
  references PersonaForge-n3kx — that swap can happen independently
  of the entrypoint work, but the same logic (strip `dh-`, filter
  `live-*`) applies. Not in scope for de9m; file as a small follow-up.
