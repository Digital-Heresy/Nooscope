---
# Nooscope-bf3x
title: Distinct visual primitives for acquaintance_blocked and acquaintance_forgotten
status: done
type: feature
priority: normal
parent: Nooscope-mbfj
created_at: 2026-05-15T00:00:00Z
updated_at: 2026-05-21T00:00:00Z
---

## Resolution (2026-05-21)

Shipped. `js/graph.js` + `js/app.js` carry the new fixtures and wiring;
`.claude/knowledge/brain-viz.md` is updated to reflect the palette
break and the new event→sentinel mapping.

**New fixtures.** Two midline-frontal sentinels were added alongside
the existing hemi-split `social-created` / `social-expired`:

- `social-blocked` at `(0, 1.1, 1.8)` — red `0xc02828`. Bumps a normal
  decay-style scale plus arms `_blockDampUntil = now + 300ms`, which
  the animate loop reads to apply a 0.4× opacity multiplier to every
  *other* sentinel and a snappier-eased target on the brain wireframe.
  The visual reading: blocked sentinel snaps bright, everything else
  briefly darkens, recovers within ~300ms. "Heightened defensive
  attention" without spelling out the person involved.
- `social-forgotten` at `(0, 0.9, 2.0)` — grey `0x888888`. Drives a
  bell-curve envelope keyed off `_socialForgottenAnimUntil` (600ms
  total, `sin(phase·π)` shape, peaks at ~half the normal sentinel
  max). Rises and falls in one breath rather than the standard
  decay's sharp rise + slow fall. No brain-wide damping.

**Palette break.** These are the first PF sentinels that aren't
`0xff8c00` orange. `makeSentinel` grew an optional `color` parameter
(default still PF orange) so the convention is preserved everywhere
else. Brain-viz knowledge file documents the intentional break.

**Wiring.** `app.js`'s grouped `acquaintance_blocked` /
`acquaintance_forgotten` case split into two cases targeting the new
methods. The Nooscope-wb3m audit comment at the social-event block
was removed — the audit's recommendation is now implemented, the
note's job is done.

**Public-stream safety.** Neither method touches payload fields; both
take zero arguments. Public stream (which strips `person_id` /
`display_name`) renders these identically to the admin stream — the
visual identity comes from the event *type*, not its contents.

**Not visually verified.** Container rebuilt + served, symbols
confirmed present in the served JS. Animation correctness needs a
live block/forget at a Scion to confirm; operator follow-up.

## Acceptance criteria met

- [x] `pulseSocialBlocked()` exists on `MemoryGraph` — red palette at
      midline frontal fixture + brief brain-wide damping.
- [x] `pulseSocialForgotten()` exists on `MemoryGraph` — bell-curve
      erasure fade at midline frontal fixture, no damping.
- [x] `acquaintance_blocked` fires `pulseSocialBlocked`.
- [x] `acquaintance_forgotten` fires `pulseSocialForgotten`.
- [x] Other four social events (`acquaintance_created`,
      `acquaintance_updated`, `identity_linked`, `acquaintance_unblocked`)
      still fire `pulseSocialCreated`.
- [x] Public-stream-safe (no payload reads).
- [x] `Nooscope-wb3m audit` comment removed from `app.js`.

`acquaintance_blocked` and `acquaintance_forgotten` currently share
`pulseSocialExpired` with each other and read as "something left the
active set". Both events are *defensive* / *erasure-shaped* — they
deserve their own visual language so the brain view tells the operator
"the Scion just took action against a person", not just "social activity
happened".

## Why

Per [[Nooscope-wb3m]]'s audit:

- `acquaintance_blocked` is the Scion's *defensive* response — putting
  up a wall against a specific person. Reusing `pulseSocialExpired`
  (the same pulse as a session ending naturally) loses the
  intentionality. The operator should be able to look at the brain and
  see "oh, the Scion just blocked someone" without checking the event
  log.
- `acquaintance_forgotten` is *erasure* — a person leaving the model
  entirely, not just a session ending. Today it pulses identically to
  a session expiring, which is wrong-shaped.

Operationally these are also the social events most worth catching
visually: a block or a forget signals a meaningful Scion-level decision
that an operator might want to investigate (was the block justified?
did the forget lose context we wanted to keep?). The current rendering
buries them under generic social activity.

## Scope

### `pulseSocialBlocked()`

- Anchored at the frontal-lobe social fixture (same locus as the other
  acquaintance pulses).
- **Distinct palette**: red/grey, not the standard social color.
  Reusing the eye-redshift palette from the input-overload primitive
  is a candidate per the wb3m audit — same "defensive posture" semantic.
- **Brain-wide damping**: brief dimming of all other activity (~300ms)
  so the block reads as a moment of heightened defensive attention.
  This is the visual cue that separates blocked from "merely expired".

### `pulseSocialForgotten()`

- Anchored at the frontal-lobe social fixture.
- **Erasure animation**: a brief node-fade or dissolve at the social
  fixture. No real Engram node disappears — the brain page doesn't
  render acquaintance nodes directly — so this is a *symbolic* erasure:
  fade-in-then-out of a transient marker at the fixture, scaled smaller
  than a normal social pulse.
- **No brain-wide damping** (unlike blocked). Forgetting is a quieter
  action, not a defensive one.

### Wiring

- Split the current grouped case in `app.js:handleEvent`:
  ```
  case 'acquaintance_blocked':
    if (graph) graph.pulseSocialBlocked();
    break;
  case 'acquaintance_forgotten':
    if (graph) graph.pulseSocialForgotten();
    break;
  ```
- Remove the `Nooscope-wb3m audit` comment block at app.js:292-297
  once the wiring lands.

## Acceptance

- [ ] `pulseSocialBlocked()` exists on `MemoryGraph`: red/grey palette
      at the frontal-lobe fixture + brief brain-wide damping.
- [ ] `pulseSocialForgotten()` exists on `MemoryGraph`: symbolic
      erasure animation at the frontal-lobe fixture, no damping.
- [ ] `acquaintance_blocked` fires `pulseSocialBlocked`, not
      `pulseSocialExpired`.
- [ ] `acquaintance_forgotten` fires `pulseSocialForgotten`, not
      `pulseSocialExpired`.
- [ ] The other four social events (`acquaintance_created`,
      `acquaintance_updated`, `identity_linked`, `acquaintance_unblocked`)
      continue to fire `pulseSocialCreated` unchanged.
- [ ] Public-stream-safe: neither primitive reads `person_id` /
      `display_name` (those are stripped on the public stream).
- [ ] The `Nooscope-wb3m audit` comment at app.js:292-297 is removed.

## Out of scope

- Per-field intensity on `acquaintance_updated` via `changed_fields`
  (the wb3m audit's nuance suggestion). Separate concern if it ever
  becomes interesting; lumped under the unchanged "created" pulse for
  now.
- Social-page (`social.html`) rendering of these events — that's
  [[Nooscope-nkvw]]'s territory and already partially wired.
- Reusing these primitives elsewhere. Scope is exactly the two events.

## Origin / coordination

- Audit source: [[Nooscope-wb3m]] (mapping + bare-minimum wiring,
  closed 2026-05-15).
- Parent epic: [[Nooscope-mbfj]] (brain looks alive).
- Wireframe authority: `[[project_brain_wireframe_design]]` for the
  frontal-lobe social fixture position.
- Related: [[Nooscope-nkvw]] for the social-page counterpart hooks.
