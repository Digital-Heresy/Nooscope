---
# Nooscope-4qyh
title: 'Identity Sub-Regions'
status: done
type: feature
priority: normal
created_at: 2026-04-05T00:00:00Z
updated_at: 2026-04-05T00:00:00Z
parent: Nooscope-v60v
---

Distribute other/intimate identities at distinct angular positions within their hemisphere so different people form visible lobes rather than overlapping.

## Current state

`_hemisphereMap` (graph.js line 72) alternates identities between left (x=-50) and right (x=+50). All identities on the same side share the exact same center point, differentiated only by random jitter.

## What to build

Extend `_hemisphereMap` to store `{ side, angle }` per identity. Within each hemisphere, distribute identities evenly around the center:
- 1st identity: 0 degrees
- 2nd identity: 60 degrees
- 3rd identity: 120 degrees
- etc.

Integrate into `RegionGeometry` (from Nooscope-fwob) so each identity gets its own sub-region center, producing distinct lobes.

## Checklist

- [ ] Extend `_hemisphereMap` entries to `{ side, angle }` format
- [ ] Compute angular slot on identity registration (evenly distributed)
- [ ] Update `RegionGeometry` to offset sub-region center by angle within hemisphere
- [ ] Each identity's lobe gets its own shell radii (scaled down from hemisphere)

## Dependencies

Nooscope-fwob (Layered Region Geometry)
