---
# Nooscope-wb3m
title: Brain-activity render hooks for the post-PR #93 telemetry event surface
status: done
type: feature
priority: normal
parent: Nooscope-mbfj
created_at: 2026-05-11T00:00:00Z
updated_at: 2026-05-15T00:00:00Z
---

## Resolution (2026-05-15)

Closed as **audit + plumbing done**. The mapping deliverable (this
document) is the source-of-truth inventory; the bare-minimum hook
wiring is in `app.js:handleEvent` — every PR #93 event hits a `case`,
nothing falls through. `dream_storyboard_ready` was confirmed still
emitted by PF (`forge/dreams/subsystem.py`) and kept.

Distinct visual primitives flagged in the inventory are spun out to
sibling sub-beans under [[Nooscope-mbfj]]:

- [[Nooscope-cb7r]] — `pulseAgency` / cerebellum fixture for
  `cron_fired` and `action_completed` (replaces today's shared
  `pulseVital` / `pulseEyes` fallbacks)
- [[Nooscope-bf3x]] — distinct visuals for `acquaintance_blocked`
  (defensive red/grey + brain-wide damping) and `acquaintance_forgotten`
  (erasure animation)
- [[Nooscope-da2m]] — dream ambient state: toggle on `dream_started`,
  release on `dream_completed`; pulses ride on top

`app.js` carries three `Nooscope-wb3m audit` TODO comments at the
fallback cases — those resolve naturally as the sub-beans above land.

## Original scope

PersonaForge PR #93 (PersonaForge-vvsw) re-inventoried `/ws/telemetry` and
added 6 social-graph life-cycle events to the existing cognitive surface.
This bean walks the full 20-event inventory, maps each one to a render
hook on the brain-activity page (`index.html`), and flags the ones that
need new visual primitives vs. the ones the existing `pulseX()` library
already covers.

## Why

The brain-activity page is the "is the Scion *alive* right now" surface
([[project_brain_wireframe_design]]). When a category of activity has no
visual hook, the brain looks dead during a real-world flurry of that
activity — which silently teaches the operator to discount the view.

Two reasons to revisit hooks now:

1. **New event types arrived.** PR #93 lands 6 social events
   (`acquaintance_created/updated/blocked/unblocked/forgotten`,
   `identity_linked`) plus the `changed_fields` discriminator on
   `acquaintance_updated`. These currently fall through `handleEvent`'s
   default case — every social-graph mutation is invisible on the brain
   view.

2. **Audit existing hooks against the canonical inventory.** The PR #93
   doc is now the source of truth for what fires on the wire; this is
   the natural moment to confirm every wire-event has an intended hook
   and that no hook fires for an event that no longer exists.

## Inventory + render hook proposal

Each row: event → current hook in `app.js` → proposed hook (delta or
keep). Brain-region landmarks from the wireframe design.

### Cognitive (14) — mostly wired, audit for completeness

| Event                    | Current                                            | Proposed                                                                                                                                                                                                       |
| ------------------------ | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `message_received`       | `pulseEyes()`                                      | Keep. Inbound signal, eye fixture is correct.                                                                                                                                                                  |
| `recall_fired`           | `handleRecallFired` + `pulseRecall()`              | Keep — wavefront work in [[Nooscope-yy0y]] supersedes the bare pulse.                                                                                                                                          |
| `memory_formed`          | log-only; `pulseFormation()` waits for `node_created` | Keep — formation signal proper lives in [[Nooscope-0bp4]].                                                                                                                                                  |
| `memory_promoted`        | `pulseRecall()` (shared with recall)               | **Change:** give promotion its own pulse (e.g. session-tail → long-term feels like consolidation, distinct from a fresh recall). Could be a slow inbound wave from the session-tail position toward temporal. |
| `working_memory_updated` | `pulseFormation()` + event log                     | Spotlight ([[Nooscope-rnrm]]) is the proper hook; current behaviour is a placeholder.                                                                                                                          |
| `session_created`        | `handleSessionCreated` + `pulseSocialCreated()`    | Ambient session glow ([[Nooscope-4xpf]]) is the proper hook; pulse is the transient on top.                                                                                                                    |
| `session_expired`        | `handleSessionExpired` + `pulseSocialExpired()`    | Same — release the ambient state when last session expires.                                                                                                                                                    |
| `pi_text_delta`          | `pulseEyes()`                                      | Keep, but **throttle:** delta events fire at chunk rate (>10 Hz on long streams). One pulseEyes per N chunks is enough — stacking is fine but unbounded is wasted.                                            |
| `pi_tool_result`         | `pulseEyes()`                                      | **Change:** tool result is *outbound feedback* arriving back into the Scion, not raw input. Closer to recall's "result from somewhere out there". Consider a distinct fixture or palette.                      |
| `action_completed`       | `pulseEyes()`                                      | **Change:** wire to [[Nooscope-niac]]'s outbound-action signal. An action completing IS the outbound-impulse moment.                                                                                           |
| `dream_started`          | `pulseCircadian()`                                 | Audit: a brief thalamic pulse is fine, but a dream is a *state* — should it also light up a persistent "dreaming" ambient (dimmed brain + thalamus glow) until `dream_completed`?                              |
| `dream_completed`        | `pulseCircadian()`                                 | Release the dreaming ambient state. If `payload.mutations > 0` or `soul_proposals > 0`, brief follow-up flash to signal "the brain changed during the dream".                                                  |
| `cron_fired`             | `pulseVital()`                                     | **Change:** cron is an *agency* trigger, not vital signs. Cerebellum is the agency fixture per the wireframe. `pulseAgency()` or rename `pulseVital` clients accordingly.                                      |
| `backup_completed`       | `pulseVital()`                                     | Keep on the brainstem (system-housekeeping reads as vital). Optionally also surface a one-line blip in the event log with `zip_size_bytes` for operator confirmation.                                          |

Also wired in app.js but **not in the PR #93 inventory** — verify still on the wire or remove from `handleEvent`:

- `dream_storyboard_ready` — case exists in app.js, not in PR #93's list. Either PF still emits it (and the doc missed it) or it was renamed/removed. Confirm with PF; if dead, drop the case.

### Social-graph life-cycle (6) — entirely new on the brain page

All six events should at minimum land in the event log. Visual hooks:

| Event                    | Proposed hook                                                                                                                                                          |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `acquaintance_created`   | Frontal-lobe pulse (existing `pulseSocialCreated` if it lives in the frontal-lobe fixture; otherwise a new social pulse there). New person entered the address book.   |
| `acquaintance_updated`   | Frontal-lobe pulse, *intensity by `changed_fields.length`*. See note below for per-field nuance.                                                                       |
| `identity_linked`        | Frontal-lobe pulse, slightly brighter — verified cross-platform link is a higher-confidence event than a raw update.                                                   |
| `acquaintance_blocked`   | **New visual primitive:** distinct red/grey pulse at the frontal lobe + brief brain-wide damping (the Scion just took a defensive action). Could reuse the eye-redshift palette from input.                                                  |
| `acquaintance_unblocked` | Green frontal-lobe pulse, mirror of blocked. No brain-wide damping.                                                                                                    |
| `acquaintance_forgotten` | **New visual primitive:** brief erasure animation — a node fades out at the frontal fixture (no real Engram node disappears on the brain view; it's symbolic).         |

#### `changed_fields` nuance

The `changed_fields` array on `acquaintance_updated` lets the brain view
distinguish operator-edit-shape from organic learning:

- `display_name`, `nicknames`, `pronouns`, `notes` → "metadata polish".
  Single faint pulse.
- `relationship_to_creator` → semantically heavier (the orange
  creator-edge label changes on the social page). Could warrant a
  slightly brighter pulse on the brain view too, even though the brain
  view doesn't render the creator-edge directly. It's a signal that the
  Scion's *world model of who its creator is to others* shifted.

Default if `changed_fields` is missing or empty: a single neutral pulse.

## Contract notes

- **Idempotent replays don't fire.** PR #93 specifies: if PF sees the
  same value re-asserted (e.g. two `<profile pronouns="...">` directives
  in one response, both with the same value), only the first emits.
  Don't add receiver-side dedupe — trust the wire.
- **Public stream strips identity fields.** On
  `/ws/telemetry/public`, social events arrive with `person_id` and
  `display_name` blanked. That still leaves the *event type* and
  *timing* — enough to fire ambient activity pulses, just not enough to
  route the event to a specific node. The brain page should treat the
  events as activity-shape signals regardless of whether identity
  fields are present.
- **The event log shows everything.** Independent of visual hooks,
  every event should land as one row in the event log so the operator
  has a textual trace to scroll back through.

## Acceptance

- [ ] Every event type from the PR #93 inventory has a corresponding
      `case` in `handleEvent` — no event falls through to `default`.
- [ ] Cognitive audit: `memory_promoted`, `pi_tool_result`,
      `action_completed`, and `cron_fired` each have a dedicated hook
      (not just sharing a generic pulse with a sibling category).
- [ ] All 6 social-graph events fire frontal-lobe pulses; blocked and
      forgotten have their own distinct visual primitives.
- [ ] Dream lifecycle: entering DREAMING toggles an ambient state that
      releases on `dream_completed`; the pulses are the transient on
      top of the state, not a replacement for it.
- [ ] `dream_storyboard_ready` resolved with PF: either kept (if still
      emitted) or removed from `handleEvent`.
- [ ] Hooks survive public-stream mode (no payload-field assumptions
      that break when identity is stripped).

## Out of scope

- **Building each new visual primitive.** This bean is the *mapping*.
  Distinct visuals for `acquaintance_blocked` / `acquaintance_forgotten`
  / dreaming-ambient-state become their own sub-beans if they take more
  than a few hours to design + animate.
- **Social-graph page reactions.** Covered by [[Nooscope-nkvw]] +
  follow-up; the spec already lists per-event suggested hooks for
  `social.html`. PR #93's "look again" semantics are already wired on
  social.js (see comment on `handlePfEvent`).
- **Wire-level dedupe / replay handling.** Per the contract, PF
  guarantees no idempotent re-fires. If that turns out to be wrong in
  practice, it's a PF bug, not a Nooscope rendering concern.

## Origin / coordination

- **PR #93 / PersonaForge-vvsw** — the event-surface authority. Inventory
  in this bean must stay in sync with the PR's documented types.
- **[[Nooscope-mbfj]]** — parent epic ("brain looks alive"). Sub-beans
  for each visual primitive hang off mbfj alongside this one.
- **[[project_brain_wireframe_design]]** — region/fixture mapping.
  Frontal lobe = social, cerebellum = agency, thalamus = circadian,
  brainstem = vital, temporal = recall/formation, eyes = input.
- **[[Nooscope-niac]]** — outbound-action stub. `action_completed`
  should finally wire into that stub instead of pulseEyes.
- **[[Nooscope-nkvw]]** — social-graph page; counterpart bean for the
  social events' page-level hooks (already partially implemented).
