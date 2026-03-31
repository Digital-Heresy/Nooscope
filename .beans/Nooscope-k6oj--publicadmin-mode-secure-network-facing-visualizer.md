---
# Nooscope-k6oj
title: Public/Admin Mode — Secure Network-Facing Visualizer
status: todo
type: epic
priority: high
created_at: 2026-03-31T09:18:14Z
updated_at: 2026-03-31T09:18:14Z
---

Evolve Nooscope from a localhost-only debug tool into a network-facing visualizer with two modes: a public 'fireworks' view and an authenticated admin view.

Currently raven tokens are baked into config.js and served to any browser — this must be fixed before network exposure (security review finding M6).

**Public mode:** anonymous 3D graph, nodes as colored dots, real-time animation, no memory content or sensitive data.
**Admin mode:** full current Nooscope experience, gated by raven token entered in browser UI (sessionStorage, never URL or config.js).

Ported from MindHive-d91w. Four phases of work across Nooscope and MindHive repos.