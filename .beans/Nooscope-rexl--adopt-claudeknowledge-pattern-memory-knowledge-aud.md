---
# Nooscope-rexl
title: Adopt .claude/knowledge/ pattern + memory → knowledge audit
status: completed
type: task
created_at: 2026-05-14T08:13:41Z
updated_at: 2026-05-14T00:00:00Z
---

Mirror the PersonaForge pattern (PF-qx0p, shipped 2026-05-14) to debloat CLAUDE.md and split codebase-fact memories into a versioned knowledge folder.

# Strategy

CLAUDE.md should be a lean scannable index — one paragraph + a pointer per topic, not the full implementation detail. Topic-specific deep context lives in .claude/knowledge/<topic>.md files that CLAUDE.md references. Lazy-loaded: an agent only reads brain-viz.md when working on brain visualization.

Test for what migrates from memory → knowledge:
  knowledge = facts that should be true going forward (UI architecture, WebSocket protocol contracts, deployment topology, design decisions)
  memory    = facts that were true at a moment in time (deployment status, feature priorities, references)

Migration is a rewrite, not a copy — knowledge files are descriptive (here is how the system works) not prescriptive (here is what to do). Drop the Why:/How to apply: framing; keep the 'why we chose this' texture where it informs future decisions.

# Suggested work order

1. Create .claude/knowledge/ folder.
2. Audit current CLAUDE.md (98 lines, may already be lean enough). Identify any section that has grown fat enough to deserve its own file — likely candidates: WebSocket telemetry frame protocol (PF + Engram streams it consumes), brain-scan visualizer architecture, container/deploy topology, social.html / dreams.html page structure.
3. Audit current auto-memory dir (C:/Users/ronin/.claude/projects/C--Users-ronin-Documents-Projects-Nooscope/memory/) against the test above. Strong candidates spotted:
   - project_brain_wireframe_design.md → knowledge/brain-viz.md
   - project_engram_lock_flock.md → knowledge/engram-integration.md or memory if still in flux
   - project_container_security_hardening.md → knowledge/container-security.md
   - feedback_container_external_dns.md + feedback_nginx_upstream_dns.md → knowledge/networking.md (these are infra-architecture decisions, not personal preferences)
   Stays in memory: feedback_bean_scope, feedback_deploy_workflow, feedback_cost_display_skip, feedback_scion_curiosity_over_admin_tools, user_*, anything date-stamped or state-tracking.
4. Slim CLAUDE.md if any sections moved out: replace with one-paragraph summary + pointer.
5. Update MEMORY.md index to remove migrated entries.
6. Delete the migrated memory files.
7. Doc-only commit directly to main (no PR per project convention).

# Reference
PersonaForge commit 14e7c4c shows the pattern end-to-end. CLAUDE.md there has a 'Knowledge Folder' section that indexes 14 files; the migration audit is bean PersonaForge-qx0p.

# Note on scope
Nooscope is smaller than PF/MindHive — the audit may turn up only 3-5 knowledge files versus PF's 14. That is fine. The point is the *pattern*, not file count. If CLAUDE.md is already lean enough, the work may be entirely on the memory side.