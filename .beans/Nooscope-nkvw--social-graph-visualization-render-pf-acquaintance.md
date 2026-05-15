---
# Nooscope-nkvw
title: Social-graph visualization — render PF acquaintance graph with anomaly highlights
status: completed
type: feature
created_at: 2026-05-10T06:13:55Z
updated_at: 2026-05-15T00:00:00Z
---

Render each Scion's social graph as an inspectable network diagram. Operator can spot relationship confusion, alias pollution, broken identity links, and cross-Scion divergence visually instead of via mongo queries.

This is the Nooscope-side companion to PersonaForge-38tn (PF-side data layer + anomaly detection, shipped 2026-05-10 in PR #86). The PF endpoints are live; this bean is the rendering surface that consumes them.

## Why

Surfaced live (2026-05-08): a stray nickname on the creator's Acquaintance record on Speaker mis-routed a directive to the wrong person. Diagnosed via direct mongo query — would have lit up immediately on a visual social graph view as 'creator's record has an alias matching a third-party identity.'

The social graph is the Scion's address book. When it drifts from reality, every routing/recall/relationship surface gets confused. This view gives the operator a signal-rich way to spot drift before it manifests as user-facing bugs.

## PF endpoints already shipped

Both routes are read-only, scoped per Scion, hosted by the PF admin web (`personaforge-web`). Same single-creator deploy posture as the rest of admin — no app-layer auth, bind-to-localhost; in our compose stack Nooscope reaches them on the backend network.

- `GET /scions/{scion_id}/social-graph` — full payload:
  ```
  {
    "scion_id": "...",
    "acquaintances": [
      {
        "person_id": "...",
        "display_name": "...",
        "nicknames": [...],
        "identities": [{platform, user_id, username, linked_at, verified}, ...],
        "pronouns": "...",
        "relationship_to_creator": "...",
        "notes": {key: value, ...},
        "edges": [{kind, target_person_id, attested_by, attested_at, confidence, description}, ...],
        "status": "active" | "blocked",
        "entity_node_id": "...",
        "met_at": "ISO8601",
        "met_via": "..."
      },
      ...
    ],
    "stats": {
      "total": int, "blocked": int,
      "by_platform": {"telegram": int, "discord": int, ...},
      "verified_cross_platform": int
    }
  }
  ```

- `GET /scions/{scion_id}/social-graph/anomalies` — consistency findings:
  ```
  {
    "scion_id": "...",
    "anomalies": [
      {
        "kind": "stray_nickname" | "orphan_edge" | "self_loop" | "unverified_multi_identity" | "conflicting_attestations" | "identity_collision",
        "severity": "critical" | "high" | "medium" | "informational",
        "summary": "human-readable",
        "subjects": [person_id, ...],
        "detail": {kind-specific structured context}
      },
      ...
    ]
  }
  ```
  Sorted critical → informational. Empty list = clean graph.

## Where to learn more

- **PF wiki — [Social Graph: Acquaintance Model](https://github.com/Digital-Heresy/PersonaForge/wiki/Social-Graph-%E2%80%94-Acquaintance-Model)** — full data model, relational edges (typed kinds + attestation provenance + confidence defaults), anomaly detection check semantics, the bidirectional sync with entity-memory.
- **PF wiki — [Web Incubator](https://github.com/Digital-Heresy/PersonaForge/wiki/The-Incubator-%E2%80%94-Web-Dashboard#social-graph-endpoints-personaforge-38tn)** — the endpoints' auth posture and full route definitions.
- **PF source** — `forge/admin/web/social_graph.py` (pure-logic anomaly detector; the six checks have detailed docstrings explaining what each catches and why the severity is what it is).

## Visual encoding (suggested, adapt as needed)

- Force-directed layout. Scion at center is one option; pure equal-weight force is another — pick what reads best in practice.
- Acquaintance nodes labeled with display_name; platform identities shown as small icon annotations (telegram/discord glyphs).
- Edges between acquaintances labeled with edge `kind`, styled by `attested_by`:
  - `creator` → solid line, full opacity
  - `self` → dashed line, ~80% opacity
  - `conversation` → dotted line, ~60% opacity
  - `dream` → dot-dash, ~70% opacity
  - Line weight scales with `confidence` (0.0–1.0).
- Status indicators: blocked acquaintances rendered desaturated; unverified identities show a '?' badge.
- **Anomaly highlights**: nodes/edges flagged by the anomalies endpoint get severity-colored treatment — red glow for critical/high, yellow for medium, faint blue dot for informational. `subjects` array tells you which person_ids to highlight.

## Inspect side panel (suggested)

- Slides in on click of a node.
- Renders the full Acquaintance dump — every field surfaced, nothing hidden behind copy buttons.
- Edge list grouped by kind, with provenance + confidence.
- met_at, met_via.
- Quick action: 'copy person_id' for use in other admin tools.

## Search/filter (v0)

- Free-text search across display_name + nicknames + identity usernames → matches highlighted in the diagram.
- Filter chips: by platform, by status, by anomaly severity, by relationship_to_creator presence.

## Out of scope for v0 (future slices, deferred)

- **Real-time updates via WebSocket telemetry.** PF emits social-graph mutation events (acquaintance_created, profile_updated, acquaintance_blocked, acquaintance_forgotten) over its existing telemetry WS but the v0 of this view uses manual reload. Real-time live-update mode is a follow-on slice.
- **Edit affordances.** Click-to-edit aliases, merge duplicate records, etc. — routes through PF's admin layer; separate slice.
- **Time-series replay.** Slider to scrub through history of when edges were attested. Cool but not essential for v0.
- **Cross-Scion compare view** (stretch — possibly v0+1). Pick two Scions, diff their graphs. Visual: shared people in middle, Scion-A-only on left, Scion-B-only on right. The 'why does Helix know X but Speaker doesn't' case becomes a glance instead of a query.

## Acceptance check

[ ] Per-Scion route (e.g. /social.html or query-param into existing index.html) renders the graph with all active acquaintances, edges (attestation-styled), and anomaly highlights.
[ ] Click acquaintance → side panel shows full Acquaintance record.
[ ] Search '@<handle>' or display_name highlights matching record(s) in the diagram.
[ ] Filter chips by platform/status/severity work.
[ ] Empty graph (newly-onboarded Scion with no acquaintances) renders a clean placeholder rather than crashing.
[ ] 404 path (unknown scion_id) surfaces a friendly message rather than a console error.
[ ] Anomaly endpoint findings paint with the correct severity color on the listed `subjects`.

## Origin / coordination

- PersonaForge-38tn: PF-side data layer + anomaly detection (shipped, PR #86). This bean consumes its endpoints.
- PersonaForge-5vmy: relational edge data model (shipped). Edge styling on this view reads attestation-provenance from edges produced under that schema.
- PersonaForge-40xy / -42l5: bidirectional dream-cycle sync (both shipped). Mostly invisible to this view, but the inspect side panel can surface 'last entity sync' / 'last profile extraction' timestamps from the Acquaintance record once worth showing.