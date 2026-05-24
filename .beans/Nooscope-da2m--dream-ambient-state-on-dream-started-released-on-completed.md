---
# Nooscope-da2m
title: Dream ambient state on dream_started, released on dream_completed
status: done
type: feature
priority: normal
parent: Nooscope-mbfj
created_at: 2026-05-15T00:00:00Z
updated_at: 2026-05-21T00:00:00Z
---

## Resolution (2026-05-21)

Shipped. While dreaming:

- Brain wireframe dims to 60% of its base opacity (eased 0.04/frame).
- A second ambient halo (deep violet `0x6a3a9c`) eases in to opacity
  0.10 with a slow ~5.4s breathe period (slower than the session
  halo's ~3.5s — sleepier).
- The thalamic (`circadian`) sentinel scale floors at 0.3 with a small
  ±0.1 sinusoidal modulation, holding a soft persistent glow.

`dream_started` → `setDreamingState(true)` + `pulseCircadian()`.
`dream_completed` → `setDreamingState(false)` + `pulseCircadian()` +
conditionally `flashConsolidation()` if `payload.mutations > 0 ||
payload.soul_proposals > 0`. `dream_storyboard_ready` →
`pulseCircadian()` only.

Safety timer: `_dreamingActiveUntil` doubles as the bound — set to
now + 60min on entry. If `dream_completed` never arrives, the state
auto-releases when that timestamp passes.

**Scope tightening from bean spec:** the bean asked for "dim
non-thalamic regions" but the brain wireframe has no per-region mesh
distinction. Implemented as "dim the whole wireframe by 40%, keep the
thalamic sentinel lit." The visual effect ("the brain is in a deeper
state, the thalamus is doing the work") still reads correctly.

**Public-stream safety:** `payload.mutations` and `payload.soul_proposals`
are short-circuited with truthy checks — if either field is stripped
on the public stream, the flash silently doesn't fire. No errors, no
admin-content leak. The state transition itself works on both streams.

A dream is a *state* the Scion is in, not a point-in-time event. Today
all three dream events (`dream_started`, `dream_completed`,
`dream_storyboard_ready`) share one `pulseCircadian` case — three
identical flashes, no sense that the Scion was in a different mode
between started and completed. This bean adds a persistent "dreaming"
ambient that toggles on `dream_started` and releases on
`dream_completed`, with the pulses riding on top as transients.

## Why

Per [[Nooscope-wb3m]]'s audit, dreams are the one cognitive event
category where the brain visibly changes *mode*. Sleep / dream cycles
in a real brain aren't a series of pulses — they're an ongoing state.
Reading the brain view during a dream should *feel* different from
reading it during waking activity, the same way a dimmed bedroom feels
different from a lit one.

Today the operator can't tell from the brain view whether the Scion is
dreaming right now — they have to scroll the event log to find a
`dream_started` that hasn't been paired with a `dream_completed`. The
ambient state collapses that into an at-a-glance read.

## Scope

### Dreaming ambient

- New `setDreamingState(active)` method on [[MemoryGraph]].
- When active:
  - Dim non-thalamic regions of the brain wireframe by ~40% (numerical
    constant to be tuned during impl).
  - Maintain a slow persistent glow at the thalamic fixture (circadian
    region per the wireframe). Slower / breathier than `pulseCircadian`'s
    transient — this is the *state*, the pulse is the transient.
  - Optional: subtle particle drift through the dimmed regions to
    indicate "background processing" — judgment call during impl.
- When released:
  - Restore normal brightness over a short fade (~500ms).
  - Kill the persistent thalamic glow.

### Event wiring

- `dream_started` → `setDreamingState(true)` + keep `pulseCircadian()`
  (transient on top of the state).
- `dream_completed` → `setDreamingState(false)` + `pulseCircadian()`. If
  `event.payload.mutations > 0 || event.payload.soul_proposals > 0`,
  fire an additional short brain-wide flash to signal "the brain
  changed during the dream" (operator cue that a soul-proposal review
  is pending).
- `dream_storyboard_ready` → keep `pulseCircadian()` only; this fires
  *during* the dream as the storyboard renders, not at state edges.

### Edge cases

- **Page load / reconnect mid-dream**: there's no "is this Scion
  currently dreaming?" query on the wire today, so the brain view
  starts in waking state until the next `dream_started`. Accept this
  limitation; PF would need to add a state field to `snapshot` or a
  separate query for first-paint correctness. Note in the bean text;
  don't block on it.
- **Missed `dream_completed`**: if PF disconnects mid-dream and
  reconnects without firing completed, the ambient state would persist
  indefinitely. Add a safety timer: auto-release the dreaming state
  after N minutes (suggest 60min, matching the longest realistic dream
  cycle observed in PF — verify against PF dream subsystem before
  setting).
- **Multiple `dream_started` in a row** (shouldn't happen but
  defensive): each new `dream_started` resets the safety timer; the
  state is idempotent so re-asserting `setDreamingState(true)` is a no-op.

### Cleanup

- Remove the `Nooscope-wb3m audit` comment block at app.js:287-290
  once the wiring lands.

## Acceptance

- [ ] `setDreamingState(true)` dims non-thalamic regions and lights a
      slow persistent glow at the thalamic fixture.
- [ ] `setDreamingState(false)` restores normal brightness and kills
      the glow.
- [ ] `dream_started` enters the state + fires `pulseCircadian`.
      `dream_completed` releases the state + fires `pulseCircadian`.
      `dream_storyboard_ready` fires `pulseCircadian` only.
- [ ] If `dream_completed.payload.mutations > 0` or `soul_proposals > 0`,
      a follow-up brain-wide flash fires.
- [ ] Safety timer auto-releases the state after a max duration if no
      `dream_completed` arrives.
- [ ] Public-stream-safe: doesn't read payload fields the public
      stream strips. (Today's public-stream contract per Nooscope-cj8w
      keeps dream events as activity-shape signals; verify
      `mutations` / `soul_proposals` aren't stripped, or gate the
      follow-up flash on admin mode.)
- [ ] The `Nooscope-wb3m audit` comment at app.js:287-290 is removed.

## Out of scope

- First-paint correctness on reconnect mid-dream (needs a PF-side
  state field on snapshot; separate concern).
- Rendering the actual dream content / storyboard in the brain view —
  that lives on `dreams.html` ([[Nooscope-wr3i]]).
- Sound or other non-visual ambient cues. Visual only.

## Origin / coordination

- Audit source: [[Nooscope-wb3m]] (mapping + bare-minimum wiring,
  closed 2026-05-15).
- Parent epic: [[Nooscope-mbfj]] (brain looks alive).
- Companion ambient pattern: [[Nooscope-4xpf]] (session ambient state)
  is the closest analogue — implementation likely mirrors its
  bumpAmbient / killAmbient shape.
- Public-stream contract: [[Nooscope-cj8w]] for which payload fields
  survive on `/ws/telemetry/public`.
- Wireframe authority: `[[project_brain_wireframe_design]]` for the
  thalamic fixture position.
