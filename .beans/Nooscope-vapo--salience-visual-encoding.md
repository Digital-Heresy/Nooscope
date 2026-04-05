---
# Nooscope-vapo
title: 'Salience Visual Encoding'
status: todo
type: feature
priority: low
created_at: 2026-04-05T00:00:00Z
updated_at: 2026-04-05T00:00:00Z
parent: Nooscope-v60v
---

Make salience visible as node brightness and opacity so important memories stand out.

## Current state

Salience is tracked per node but only displayed in the info panel text. No visual encoding — all nodes at the same opacity/brightness regardless of salience.

## What to build

- **Opacity**: scale with salience, range 0.4 (low) to 0.95 (high) — even dim nodes remain visible
- **Emissive glow**: `material.emissive` + `material.emissiveIntensity` scaled by salience — high-salience nodes glow slightly
- Must compose correctly with existing pulse effects (white flash overrides during pulse)

## Checklist

- [ ] Update `nodeThreeObject()` material: set opacity from `node.salience`
- [ ] Add `material.emissive` and `material.emissiveIntensity` based on salience
- [ ] Update `_animate()` to preserve salience encoding alongside pulse color override
- [ ] Verify low-salience nodes still visible against dark background

## Dependencies

None — purely visual, can slot in anywhere in the implementation order.
