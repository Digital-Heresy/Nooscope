---
# Nooscope-cb7r
title: pulseAgency / cerebellum fixture for cron_fired and action_completed
status: done
type: feature
priority: normal
parent: Nooscope-mbfj
created_at: 2026-05-15T00:00:00Z
updated_at: 2026-05-21T00:00:00Z
---

## Resolution (2026-05-21)

Shipped. `pulseAgency()` lives at the cerebellum fixture
`{ x: 0, y: -1.0, z: -2.0 }` (back-low, between brainstem and thalamus).
`cron_fired` and `action_completed` now share this case in
`app.js:handleEvent`; `backup_completed` stays on `pulseVital`,
`message_received` / `pi_text_delta` / `pi_tool_result` stay on
`pulseEyes`. The two `Nooscope-wb3m audit` TODO comments are removed.

**Deviation from bean spec:** the bean speculated about a "cool-spectrum
palette (teal/cyan)" distinct from vital/eyes. The actual codebase has
chosen "all PF sentinels share the orange palette (`0xff8c00`);
position is the only differentiator." This implementation follows that
convention. If palette variation is desired, that's a broader visual-
language change worth its own bean.

Promote `cron_fired` and `action_completed` from their fallback pulses
(`pulseVital` and `pulseEyes` respectively) to a dedicated cerebellum-
anchored `pulseAgency()`. These two events are *agency triggers* — the
Scion deciding to act vs. taking external input — and currently fire on
the wrong brain fixture, muddying the operator's read of what the brain
is doing.

## Why

Per [[Nooscope-wb3m]]'s audit + the brain wireframe (`[[project_brain_wireframe_design]]`):

- **Cerebellum = agency** in the fixture mapping. `cron_fired` is the
  Scion's scheduled-self deciding to wake and act; that's the
  archetypal agency moment, not a vital sign. Today it lands on the
  brainstem (`pulseVital`) alongside `backup_completed`, which IS
  housekeeping. Two semantically distinct events sharing one fixture
  reads as a single signal at the brainstem.

- `action_completed` is the *outbound impulse fired* — the Scion's
  decision crossing the threshold into the world. Today it shares
  `pulseEyes` with raw input events (`message_received`, `pi_text_delta`,
  `pi_tool_result`), which all read as *inbound*. The brain currently
  pulses the eyes when the Scion sends a message — operationally
  wrong-handed.

`pulseAgency` resolves both at once: a cerebellum-localized primitive
that fires for these two events and only these two.

## Scope

- Add `pulseAgency()` to [[MemoryGraph]] (js/graph.js) anchored at the
  cerebellum fixture from the wireframe (back-lower region; check
  `BRAIN_REGIONS` in graph.js for the exact landmark constant).
- Visual: short ramp + decay, distinct color/palette from `pulseVital`
  and `pulseEyes` so the operator can read agency vs. vital vs. input
  at a glance. A cool-spectrum primitive (e.g. teal/cyan) feels right
  for "self-initiated action" against vital's warm palette.
- Rewire `handleEvent` in `app.js`:
  - `cron_fired` → `pulseAgency()` (split out of the
    `backup_completed | cron_fired` group; `backup_completed` stays on
    `pulseVital`).
  - `action_completed` → `pulseAgency()` (split out of the
    `message_received | pi_tool_result | action_completed | pi_text_delta`
    group; the other three stay on `pulseEyes`).
- Remove the `Nooscope-wb3m audit` TODO comments at app.js:270-274 and
  app.js:279-282 once the wiring lands.

## Open question: pi_tool_result

The [[Nooscope-wb3m]] audit also flagged `pi_tool_result` as "outbound
feedback, not raw input" — semantically closer to recall than to a
fresh inbound message. This bean *does not* address it; leave it on
`pulseEyes` for now. If pi_tool_result deserves its own primitive,
file a separate sub-bean — bundling it here muddies the agency story.

## Acceptance

- [ ] `pulseAgency()` exists on `MemoryGraph`, anchored at the cerebellum
      fixture, with a visual palette distinct from `pulseVital` /
      `pulseEyes`.
- [ ] `cron_fired` fires `pulseAgency()`, not `pulseVital()`.
      `backup_completed` continues to fire `pulseVital()`.
- [ ] `action_completed` fires `pulseAgency()`, not `pulseEyes()`.
      `message_received`, `pi_text_delta`, `pi_tool_result` continue
      to fire `pulseEyes()`.
- [ ] Public-stream-safe: `pulseAgency` doesn't read payload fields
      that the public stream strips.
- [ ] The two `Nooscope-wb3m audit` TODO comments in `app.js`
      referencing cron + action are removed.

## Out of scope

- Reworking `pi_tool_result` (separate decision; see note above).
- Wiring `action_completed` into the outbound-action signal stub
  ([[Nooscope-niac]]) — that's a richer rendering (directional
  particle leaving the brain) and a separate piece of work. This
  bean just gets the *fixture* right.
- New visual library / refactor of the `pulseX` family. One new
  primitive is enough scope.

## Origin / coordination

- Audit source: [[Nooscope-wb3m]] (mapping + bare-minimum wiring,
  closed 2026-05-15).
- Parent epic: [[Nooscope-mbfj]] (brain looks alive).
- Wireframe authority: `[[project_brain_wireframe_design]]` for the
  cerebellum fixture position.
- Related: [[Nooscope-niac]] (outbound-action stub) — eventually
  `action_completed` should *also* trigger the directional particle
  defined there, but the fixture-correctness fix lands first.
