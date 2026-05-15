/**
 * Nooscope — Social Graph viewer (Nooscope-nkvw).
 *
 * Renders a Scion's acquaintance graph from the PF admin web's
 * /scions/{id}/social-graph endpoints. Operator-facing tool for spotting
 * relationship drift, alias pollution, and identity collisions visually
 * instead of via direct mongo queries.
 */

const TOKEN_KEY = 'nooscope_raven_token';

// Hardcoded scion list — interim until PersonaForge-n3kx ships the JSON
// variant of /scions. Once that lands, replace this with a fetch on page
// load that filters to live-* badge states.
const ADMIN_SCIONS = [
  { id: 'dh-speaker', name: 'Speaker' },
  { id: 'dh-helix',   name: 'Helix' },
];

// Severity → highlight color (rgba). Critical/high get the red treatment;
// medium gets yellow; informational gets a faint blue dot. Order matches
// the priority used when a node is flagged by multiple anomalies — higher
// severity wins the visual.
const SEVERITY_RANK = ['critical', 'high', 'medium', 'informational'];
const SEVERITY_COLORS = {
  critical:      'rgba(255, 60, 60, 0.85)',
  high:          'rgba(255, 100, 100, 0.7)',
  medium:        'rgba(255, 200, 60, 0.65)',
  informational: 'rgba(80, 160, 255, 0.45)',
};

// Creator node color. The creator is the human behind the Scion — every
// acquaintance's `relationship_to_creator` ("wife", "brother") points back
// to this node, not to the Scion itself. Bright orange so it pops as the
// "second center" alongside the cyan Scion focal point.
const CREATOR_COLOR = '#ff8c00';
const CREATOR_COLOR_RGB = '255, 140, 0';

// Edge attestation style. Patterns are [dash, gap] arrays for setLineDash;
// empty array = solid. Opacity baked into the stroke color at draw time.
// `color` is "r, g, b" so drawLink can compose with the style's alpha.
const ATTESTATION_STYLES = {
  creator:      { dash: [],         alpha: 1.0, color: CREATOR_COLOR_RGB },
  self:         { dash: [6, 4],     alpha: 0.8  },
  conversation: { dash: [2, 4],     alpha: 0.6  },
  dream:        { dash: [8, 3, 2, 3], alpha: 0.7 },
};
const DEFAULT_ATTESTATION = { dash: [4, 4], alpha: 0.5 };

// Operator-chain edge color (bot/scion_peer → its operator). Violet so it
// reads as a distinct relationship type next to the creator-orange (which
// is reserved for relationship_to_creator) and the scion-cyan focal point.
// Attestation still drives dash + alpha via ATTESTATION_STYLES:
// `creator`-attested = solid/full (operator-confirmed),
// `self`-attested = dashed/dimmed (bot self-claim).
const OPERATOR_EDGE_COLOR_RGB = '183, 148, 246';

// Platform → branded badge. Single-letter inside a brand-colored circle
// reads at small sizes on the canvas; the full name shows in the side
// panel where there's room. Brand colors match each platform's official
// palette as closely as a single hex allows.
const PLATFORM_GLYPHS = {
  telegram: { letter: 'T', color: '#229ED9' },
  discord:  { letter: 'D', color: '#5865F2' },
  matrix:   { letter: 'M', color: '#0DBD8B' },
};

// Parse PR-#88-style met_via strings into a structured shape so the side
// panel can render platform / chat-shape / chat-name as discrete chips.
//
// Accepted forms (PersonaForge-rqrl):
//   "telegram"                                 -> legacy bare-platform
//   "telegram (dm)"                            -> DM
//   "telegram (group)"                         -> group, no resolvable name
//   "telegram (group: Digital Heresy - Fam)"   -> group with name
//   "discord (group: Server / #channel)"       -> discord guild channel
//
// Returns null when the input is empty/malformed so callers can fall
// back to a "—" placeholder cleanly.
function parseMetVia(metVia) {
  if (!metVia || typeof metVia !== 'string') return null;
  const m = metVia.match(/^(\w+)(?:\s\((dm|group)(?::\s*(.+))?\))?$/);
  if (!m) return { platform: metVia, shape: null, chatName: null };
  return {
    platform: m[1],
    shape: m[2] || null,        // 'dm' | 'group' | null (legacy bare)
    chatName: m[3] || null,     // group name when present
  };
}

// Entity-kind colors. Until PF persists an authoritative is_bot/kind field,
// we infer from display_name patterns: "Scion X" prefix → another Scion in
// the Hive; "_Bot" suffix → conventional Discord bot. Everything else
// renders as a human (blue). Heuristic, not authoritative — visual hint
// only. A schema-backed kind field is its own follow-up bean.
//
// Bot is a darker blue than the scion-peer cyan so the orange palette
// belongs solely to the creator node and its relationship edges.
const ENTITY_COLORS = {
  scion: '#00e5ff',  // cyan — matches the central Scion-self node
  bot:   '#2196f3',  // medium blue — darker than scion cyan
  human: '#7a86ad',  // blue-grey — current default
};

function classifyEntity(acquaintance) {
  const name = (acquaintance.display_name || '').trim();
  if (/^scion\s/i.test(name)) return 'scion';
  if (/_[Bb]ot$/.test(name)) return 'bot';
  return 'human';
}

// --- State ---
let forceGraph = null;
let currentScionId = null;
let lastPayload = null;       // raw /social-graph response
let lastAnomalies = null;     // raw /social-graph/anomalies response
let anomalyMap = {};          // person_id -> highest-severity entry
let searchQuery = '';
let filters = {
  status: new Set(['active', 'blocked']),
  severity: new Set(['critical', 'high', 'medium', 'informational']),
  platform: new Set(),  // populated from data; empty Set means "no filter"
};

// PF telemetry WS subscription. Listens for the 6 social-graph life-cycle
// events from PersonaForge-vvsw (PR #93) and triggers a debounced refetch
// of the social-graph + anomalies endpoints. Per the PR contract the
// stream signals "look again"; the REST endpoint stays source of truth.
let pfStream = null;
let pfStreamScionId = null;   // scion the current WS is bound to
let refetchTimer = null;
let currentPanelPersonId = null;  // person currently shown in side panel, if any

// Social-graph life-cycle event types (PersonaForge-vvsw). Any of these
// arriving means the social graph mutated; refetch covers all of them.
// Held as a Set so the membership check stays tidy as PF adds more.
const SOCIAL_EVENT_TYPES = new Set([
  'acquaintance_created',
  'acquaintance_updated',
  'identity_linked',
  'acquaintance_blocked',
  'acquaintance_unblocked',
  'acquaintance_forgotten',
]);

// --- Auth helpers ---
function getToken() { return sessionStorage.getItem(TOKEN_KEY); }
function isAdmin()  { return !!getToken(); }

function updateModeUI() {
  const badge = document.getElementById('mode-badge');
  const adminBtn = document.getElementById('admin-toggle-btn');
  const loginBtn = document.getElementById('admin-login-btn');
  const logoutBtn = document.getElementById('admin-logout-btn');
  if (isAdmin()) {
    badge.textContent = 'ADMIN';
    badge.className = 'mode-badge admin';
    adminBtn.className = 'admin-btn active';
    adminBtn.innerHTML = '&#128275;';
    if (loginBtn) loginBtn.classList.add('hidden');
    if (logoutBtn) logoutBtn.classList.remove('hidden');
  } else {
    badge.textContent = 'PUBLIC';
    badge.className = 'mode-badge public';
    adminBtn.className = 'admin-btn';
    adminBtn.innerHTML = '&#128274;';
    if (loginBtn) loginBtn.classList.remove('hidden');
    if (logoutBtn) logoutBtn.classList.add('hidden');
  }
}

// --- DOM init ---
document.addEventListener('DOMContentLoaded', () => {
  populateScionSelect();
  initForceGraph();
  wireUI();
  updateModeUI();
  applyAdminGate();
});

function populateScionSelect() {
  const select = document.getElementById('scion-select');
  select.innerHTML = '';
  for (const s of ADMIN_SCIONS) {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.name;
    select.appendChild(opt);
  }
}

function initForceGraph() {
  const container = document.getElementById('social-graph-container');
  forceGraph = ForceGraph()(container)
    .backgroundColor('#0a0a1a')
    .nodeRelSize(6)
    .nodeId('id')
    .nodeLabel(node => node.label || node.id)
    .nodeVal(node => node.isScion ? 8 : 4)
    .linkSource('source')
    .linkTarget('target')
    .nodeVisibility(isNodeVisible)
    .linkVisibility(isLinkVisible)
    .nodeCanvasObject(drawNode)
    .nodeCanvasObjectMode(() => 'replace')
    .linkCanvasObject(drawLink)
    .linkCanvasObjectMode(() => 'replace')
    .onNodeClick(node => {
      // Synthetic centers (scion, and the fallback __creator__ when PF
      // couldn't resolve a real creator_person_id) have no Acquaintance
      // payload to inspect, so suppress the side panel for them.
      if (node.isScion || !node.data) return;
      showAcquaintancePanel(node);
    })
    .cooldownTicks(120)
    .d3AlphaDecay(0.02)
    .d3VelocityDecay(0.3);

  // Resize on window changes
  window.addEventListener('resize', () => {
    forceGraph.width(container.clientWidth).height(container.clientHeight);
  });
  forceGraph.width(container.clientWidth).height(container.clientHeight);
}

function wireUI() {
  document.getElementById('scion-select').addEventListener('change', e => {
    loadScion(e.target.value);
  });
  document.getElementById('refresh-btn').addEventListener('click', () => {
    if (currentScionId) loadScion(currentScionId);
  });
  document.getElementById('search-input').addEventListener('input', e => {
    searchQuery = e.target.value.trim().toLowerCase();
    if (forceGraph) forceGraph.refresh();
  });

  // Filter chips: status + severity start checked, platform populated dynamically
  for (const group of document.querySelectorAll('.chip-options')) {
    const filterKey = group.dataset.filter;
    group.addEventListener('change', () => {
      const checked = new Set(
        Array.from(group.querySelectorAll('input[type=checkbox]:checked'))
          .map(cb => cb.value),
      );
      filters[filterKey] = checked;
      if (forceGraph) forceGraph.refresh();
    });
  }

  // Acquaintance panel close
  document.getElementById('acquaintance-panel-close').addEventListener('click', closeAcquaintancePanel);

  // Admin dialog (mirrors index.html)
  document.getElementById('admin-toggle-btn').addEventListener('click', toggleAdminDialog);
  document.getElementById('admin-dialog-close').addEventListener('click', closeAdminDialog);
  document.getElementById('admin-login-btn').addEventListener('click', adminLogin);
  document.getElementById('admin-logout-btn').addEventListener('click', adminLogout);
  document.getElementById('admin-dialog').addEventListener('click', e => {
    if (e.target.id === 'admin-dialog') closeAdminDialog();
  });
}

function toggleAdminDialog() {
  const dialog = document.getElementById('admin-dialog');
  dialog.classList.toggle('hidden');
  if (!dialog.classList.contains('hidden')) {
    document.getElementById('admin-token-input').focus();
  }
}
function closeAdminDialog() {
  document.getElementById('admin-dialog').classList.add('hidden');
}
function adminLogin() {
  const input = document.getElementById('admin-token-input');
  const token = input.value.trim();
  if (!token) return;
  sessionStorage.setItem(TOKEN_KEY, token);
  input.value = '';
  closeAdminDialog();
  updateModeUI();
  applyAdminGate();
}
function adminLogout() {
  sessionStorage.removeItem(TOKEN_KEY);
  closePfStream();
  closeAdminDialog();
  updateModeUI();
  applyAdminGate();
}

// Show empty/login state when not in admin mode; auto-load first scion when in.
function applyAdminGate() {
  const empty = document.getElementById('social-empty');
  const msg = document.getElementById('empty-message');
  const container = document.getElementById('social-graph-container');
  if (!isAdmin()) {
    msg.textContent = 'Admin login required to view social graphs.';
    empty.classList.remove('hidden');
    container.classList.add('hidden');
    forceGraph.graphData({ nodes: [], links: [] });
    closePfStream();
    return;
  }
  empty.classList.add('hidden');
  container.classList.remove('hidden');
  // Auto-load the currently-selected scion
  const selected = document.getElementById('scion-select').value;
  if (selected) loadScion(selected);
}

// --- Data loading ---
// loadScion handles the user-initiated switch (dropdown change, refresh
// click, admin gate opening): it also (re)binds the PF telemetry WS so
// incremental acquaintance events for the newly-selected scion come in.
async function loadScion(scionId) {
  currentScionId = scionId;
  if (!isAdmin()) {
    closePfStream();
    return;
  }
  openPfStream(scionId);
  await fetchSocialGraph(scionId);
}

// fetchSocialGraph is the pure REST refresh — invoked by loadScion AND by
// the debounced WS-event refetch. Keeps the WS lifecycle out of the hot path
// so an `acquaintance_updated` storm doesn't churn the socket connection.
async function fetchSocialGraph(scionId) {
  if (!isAdmin()) return;
  const empty = document.getElementById('social-empty');
  const container = document.getElementById('social-graph-container');
  const token = getToken();
  const headers = { 'Authorization': `Bearer ${token}` };

  try {
    const [graphResp, anomResp] = await Promise.all([
      fetch(`/admin/scions/${scionId}/social-graph`, { headers }),
      fetch(`/admin/scions/${scionId}/social-graph/anomalies`, { headers }),
    ]);
    if (graphResp.status === 404) {
      showEmpty(`Scion '${scionId}' not found.`);
      return;
    }
    if (graphResp.status === 401) {
      showEmpty('Admin token rejected. Try logging in again.');
      return;
    }
    if (!graphResp.ok) {
      showEmpty(`Graph fetch failed: HTTP ${graphResp.status}`);
      return;
    }
    lastPayload = await graphResp.json();
    lastAnomalies = anomResp.ok ? await anomResp.json() : { anomalies: [] };
  } catch (err) {
    console.error('[social] fetch failed', err);
    showEmpty(`Network error: ${err.message}`);
    return;
  }

  const acqList = (lastPayload && lastPayload.acquaintances) || [];
  if (acqList.length === 0) {
    showEmpty(`Scion '${scionDisplayName(scionId)}' has no acquaintances yet.`);
    updateStatBar();
    return;
  }

  empty.classList.add('hidden');
  container.classList.remove('hidden');
  renderGraph();
  renderAnomalyBanner();
  updateStatBar();
  populatePlatformChips();
}

// --- PF telemetry subscription ---
// Listens for acquaintance lifecycle events on the per-scion PF telemetry
// WS so the social view updates without manual refresh. Per the pending PF
// bean (acquaintance_created / acquaintance_updated). Anything else on
// the stream is ignored — the activity page is the kitchen sink, this view
// only cares about social-graph state changes.
function openPfStream(scionId) {
  if (pfStream && pfStreamScionId === scionId) return;
  closePfStream();
  const token = getToken();
  if (!token) return;
  // ADMIN_SCIONS uses "dh-speaker" / "dh-helix" but nginx routes are at
  // "/speaker" / "/helix" — strip the dh- prefix to bridge the two.
  const prefix = scionId.replace(/^dh-/, '');
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = `${protocol}//${location.host}/${prefix}/ws/pf/telemetry`;
  pfStream = new TelemetryStream('pf-social', url, {
    onEvent: handlePfEvent,
    onStatus: handlePfStatus,
  }, token);
  pfStreamScionId = scionId;
  pfStream.connect();
}

function closePfStream() {
  if (pfStream) {
    pfStream.disconnect();
    pfStream = null;
  }
  pfStreamScionId = null;
  setLiveDot('offline');
}

function handlePfEvent(_name, event) {
  // Trigger a refresh for any social-graph life-cycle event. PF telemetry is
  // already per-scion-scoped on the wire (the WS itself is bound to the
  // selected scion's forge), so no scion-id check needed here.
  if (!SOCIAL_EVENT_TYPES.has(event.type)) return;

  // If the side panel is open showing the person who just got forgotten,
  // close it — the refetch is about to drop that node from the graph and
  // the panel would be stranded on stale data.
  if (event.type === 'acquaintance_forgotten'
      && event.payload && event.payload.person_id === currentPanelPersonId) {
    closeAcquaintancePanel();
  }
  scheduleRefetch();
}

function closeAcquaintancePanel() {
  document.getElementById('acquaintance-panel').classList.add('hidden');
  currentPanelPersonId = null;
}

function handlePfStatus(_name, status) {
  // TelemetryStream emits 'reconnecting' / 'connected' / 'disconnected'.
  // Map onto the dot's three visual states.
  if (status === 'connected') setLiveDot('online');
  else if (status === 'reconnecting') setLiveDot('connecting');
  else setLiveDot('offline');
}

function setLiveDot(state) {
  const dot = document.getElementById('pf-live-dot');
  if (!dot) return;
  dot.className = `live-dot ${state}`;
  const titles = {
    online: 'Live updates: connected',
    connecting: 'Live updates: reconnecting…',
    offline: 'Live updates: disconnected',
  };
  dot.title = titles[state] || titles.offline;
}

// Coalesce bursty acquaintance events into a single refetch — a creator
// merging two records or backfilling identities can fire several updates
// in quick succession; 500ms is short enough to feel "live" while still
// flattening obvious bursts.
function scheduleRefetch() {
  if (refetchTimer) return;
  refetchTimer = setTimeout(() => {
    refetchTimer = null;
    if (currentScionId && isAdmin()) fetchSocialGraph(currentScionId);
  }, 500);
}

function showEmpty(message) {
  const empty = document.getElementById('social-empty');
  const container = document.getElementById('social-graph-container');
  document.getElementById('empty-message').textContent = message;
  empty.classList.remove('hidden');
  container.classList.add('hidden');
  forceGraph.graphData({ nodes: [], links: [] });
}

// --- Rendering ---
function renderGraph() {
  const acquaintances = (lastPayload && lastPayload.acquaintances) || [];
  const anomalies    = (lastAnomalies && lastAnomalies.anomalies) || [];

  // Build per-person highest-severity map (earlier in SEVERITY_RANK = higher).
  anomalyMap = {};
  for (const a of anomalies) {
    for (const pid of a.subjects || []) {
      const existing = anomalyMap[pid];
      const newRank = SEVERITY_RANK.indexOf(a.severity);
      if (newRank < 0) continue;
      if (!existing || newRank < SEVERITY_RANK.indexOf(existing.severity)) {
        anomalyMap[pid] = a;
      }
    }
  }

  // The Scion (cyan) is always synthetic. The Creator (orange) is either:
  //  - the real Acquaintance whose identity matched the Scion's allowlist,
  //    per PersonaForge-otjk's payload.creator_person_id, OR
  //  - a synthetic __creator__ placeholder when PF returned null (fresh
  //    Scion, creator hasn't messaged the bot yet).
  // relationship_to_creator edges and the scion-creator center-pair glue
  // anchor to whichever resolves.
  const creatorPersonId = (lastPayload && lastPayload.creator_person_id) || null;
  const creatorAnchorId = creatorPersonId || '__creator__';

  const scionNode = {
    id: '__scion__',
    label: scionDisplayName(currentScionId),
    isScion: true,
  };
  const nodes = [scionNode];
  if (!creatorPersonId) {
    nodes.push({ id: '__creator__', label: 'Creator', isCreator: true });
  }
  const links = [
    // Faint glue between the Scion and whoever-the-creator-is so the
    // layout treats them as a paired anchor.
    {
      source: '__scion__',
      target: creatorAnchorId,
      kind: '__center__',
      attested_by: '__center__',
      confidence: 0.3,
    },
  ];

  for (const acq of acquaintances) {
    const isRealCreator = !!creatorPersonId && acq.person_id === creatorPersonId;
    nodes.push({
      id: acq.person_id,
      label: acq.display_name || acq.person_id,
      data: acq,
      status: acq.status || 'active',
      platforms: (acq.identities || []).map(i => i.platform).filter(Boolean),
      kind: classifyEntity(acq),
      isCreator: isRealCreator,
    });
    // Skip the scion-glue spoke for the real creator — the scion-creator
    // center-pair link above already anchors them.
    if (!isRealCreator) {
      links.push({
        source: '__scion__',
        target: acq.person_id,
        kind: '__center__',
        attested_by: '__center__',
        confidence: 0.3,
      });
    }
    // Bright creator->acquaintance edge labeled with the relationship
    // word ("wife", "brother", …). Only emitted when the acquaintance
    // record carries a relationship_to_creator value AND isn't the
    // creator themselves (no orange self-loop).
    const rel = (acq.relationship_to_creator || '').trim();
    if (rel && !isRealCreator) {
      links.push({
        source: creatorAnchorId,
        target: acq.person_id,
        kind: rel,
        attested_by: 'creator',
        confidence: 0.9,
      });
    }
    for (const e of acq.edges || []) {
      links.push({
        source: acq.person_id,
        target: e.target_person_id,
        kind: e.kind,
        attested_by: e.attested_by,
        confidence: typeof e.confidence === 'number' ? e.confidence : 0.5,
      });
    }
    // Operator-chain edge (PersonaForge-yjw4). created_by_person_id is only
    // set for bot / scion_peer records; humans always carry null. The write
    // path validates the target exists in the same payload, so no orphan
    // guard needed here. attested_by distinguishes operator-confirmed
    // (creator) from bot self-claim (self) via dash/alpha in drawLink.
    if (acq.created_by_person_id) {
      links.push({
        source: acq.person_id,
        target: acq.created_by_person_id,
        kind: 'operated by',
        attested_by: acq.created_by_attested_by || 'self',
        confidence: 0.9,
        isOperatorEdge: true,
      });
    }
  }

  forceGraph.graphData({ nodes, links });
}

function scionDisplayName(scionId) {
  const match = ADMIN_SCIONS.find(s => s.id === scionId);
  return match ? match.name : (scionId || 'Scion');
}

function renderAnomalyBanner() {
  const banner = document.getElementById('anomaly-banner');
  const list = (lastAnomalies && lastAnomalies.anomalies) || [];
  if (list.length === 0) {
    banner.classList.add('hidden');
    banner.innerHTML = '';
    return;
  }
  const counts = {};
  for (const a of list) counts[a.severity] = (counts[a.severity] || 0) + 1;
  const parts = [];
  for (const sev of SEVERITY_RANK) {
    if (counts[sev]) {
      parts.push(`<span class="sev-pill sev-${sev}">${counts[sev]} ${sev}</span>`);
    }
  }
  banner.innerHTML = `<strong>${list.length} anomalies:</strong> ${parts.join(' ')}`;
  banner.classList.remove('hidden');
}

function updateStatBar() {
  const acqCount = (lastPayload && lastPayload.acquaintances || []).length;
  const anomCount = (lastAnomalies && lastAnomalies.anomalies || []).length;
  document.getElementById('acquaintance-count').textContent =
    `${acqCount} acquaintance${acqCount === 1 ? '' : 's'}`;
  document.getElementById('anomaly-count').textContent =
    `${anomCount} anomal${anomCount === 1 ? 'y' : 'ies'}`;
}

function populatePlatformChips() {
  const platforms = new Set();
  for (const acq of (lastPayload && lastPayload.acquaintances) || []) {
    for (const ident of acq.identities || []) {
      if (ident.platform) platforms.add(ident.platform);
    }
  }
  const container = document.querySelector('.chip-options[data-filter="platform"]');
  container.innerHTML = '';
  // Empty platform filter set means "show all" — so we DON'T pre-check
  // anything; ticking a box becomes a positive filter, which reads more
  // naturally than "untick what you don't want".
  for (const p of [...platforms].sort()) {
    const label = document.createElement('label');
    label.innerHTML = `<input type="checkbox" value="${p}"> ${p}`;
    container.appendChild(label);
  }
  filters.platform = new Set();
}

// --- Custom canvas drawing ---
function drawNode(node, ctx, globalScale) {
  // isFocal = visual prominence (bigger radius, never dimmed by search).
  // isSynthetic = no underlying Acquaintance record — skip anomaly glow
  // and platform glyphs. Post PersonaForge-otjk the creator is usually a
  // real Acquaintance (data + identities), so it's focal but NOT
  // synthetic and should glow/show-glyphs like any other person.
  const isFocal = node.isScion || node.isCreator;
  const isSynthetic = !node.data;
  const baseRadius = isFocal ? 8 : 5;

  // Color by entity kind (scion / creator / bot / human). Blocked
  // acquaintances are overridden to a dim grey so the status filter's
  // effect reads even when blocked nodes ARE shown — drift is easier to
  // spot when "blocked" doesn't compete visually with the kind palette.
  let fill;
  if (node.isScion) fill = '#00e5ff';
  else if (node.isCreator) fill = CREATOR_COLOR;
  else fill = (ENTITY_COLORS[node.kind] || ENTITY_COLORS.human);
  if (!isFocal && node.status === 'blocked') fill = '#444';

  // Search highlight: matching nodes get a bright ring; non-matching dim.
  // Focals stay bright so the layout's anchors remain readable.
  const isMatch = matchesSearch(node);
  const isSearchActive = !!searchQuery;
  const shouldDim = isSearchActive && !isMatch && !isFocal;
  const alpha = shouldDim ? 0.3 : 1.0;

  // Anomaly glow — only for nodes backed by an Acquaintance record.
  if (!isSynthetic) {
    const anom = anomalyMap[node.id];
    if (anom && filters.severity.has(anom.severity)) {
      const color = SEVERITY_COLORS[anom.severity];
      ctx.beginPath();
      ctx.arc(node.x, node.y, baseRadius + 5, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();
    }
  }

  // Search match outer ring.
  if (isMatch && isSearchActive) {
    ctx.beginPath();
    ctx.arc(node.x, node.y, baseRadius + 3, 0, 2 * Math.PI);
    ctx.strokeStyle = '#ffeb3b';
    ctx.lineWidth = 2 / globalScale;
    ctx.stroke();
  }

  // Main body
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.arc(node.x, node.y, baseRadius, 0, 2 * Math.PI);
  ctx.fillStyle = fill;
  ctx.fill();

  // Label
  const fontSize = Math.max(11 / globalScale, 2);
  ctx.font = `${fontSize}px Consolas, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#e0e0e0';
  ctx.fillText(node.label, node.x, node.y + baseRadius + 2);

  // Platform-branded glyphs: brand-colored circle with a single white
  // letter (T/D/M) inside. Stacked clockwise around the upper-right of
  // the node so multi-platform people read at a glance which platforms
  // they're on.
  if (!isSynthetic && node.platforms && node.platforms.length) {
    const glyphRadius = Math.max(4, baseRadius * 0.7);
    // Place glyphs at fixed offsets around the node's upper-right so
    // they don't overlap the label below or the anomaly glow above.
    const angles = [-Math.PI / 4, -Math.PI / 8, Math.PI / 8, Math.PI / 4];
    const orbit = baseRadius + glyphRadius * 0.7;
    let i = 0;
    for (const p of node.platforms) {
      const meta = PLATFORM_GLYPHS[p];
      if (!meta) continue;
      const angle = angles[i % angles.length];
      const cx = node.x + Math.cos(angle) * orbit;
      const cy = node.y + Math.sin(angle) * orbit;

      // Filter dimming: when a platform filter is active and this
      // platform isn't in it, fade the glyph (the node itself stays
      // visible because the visibility predicate has already gated).
      const platformActive = filters.platform.size === 0 || filters.platform.has(p);
      ctx.globalAlpha = platformActive ? alpha : alpha * 0.25;

      // Brand-colored disk
      ctx.beginPath();
      ctx.arc(cx, cy, glyphRadius, 0, 2 * Math.PI);
      ctx.fillStyle = meta.color;
      ctx.fill();
      // White outline so the disk reads against the dark background
      // even when it sits on top of the entity-color body.
      ctx.lineWidth = Math.max(0.8 / globalScale, 0.3);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.stroke();

      // Brand letter (white, bold, sized to fit). Draw at fixed pixel
      // size relative to the glyph radius; let force-graph's transform
      // handle world-to-screen scaling so text stays readable when
      // zoomed out.
      const letterSize = glyphRadius * 1.4;
      ctx.font = `bold ${letterSize}px Consolas, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      ctx.fillText(meta.letter, cx, cy);

      i++;
    }
  }
  ctx.globalAlpha = 1.0;
}

function drawLink(link, ctx, globalScale) {
  const src = link.source;
  const tgt = link.target;
  if (!src || !tgt || typeof src.x !== 'number' || typeof tgt.x !== 'number') return;

  let style;
  if (link.attested_by === '__center__') {
    style = { dash: [], alpha: 0.15 };
  } else if (link.isOperatorEdge) {
    // Operator edges share the attestation's dash/alpha vocabulary but
    // override color to violet — the orange palette is reserved for
    // relationship_to_creator and shouldn't be reused for ownership.
    const attest = ATTESTATION_STYLES[link.attested_by] || DEFAULT_ATTESTATION;
    style = { dash: attest.dash, alpha: attest.alpha, color: OPERATOR_EDGE_COLOR_RGB };
  } else {
    style = ATTESTATION_STYLES[link.attested_by] || DEFAULT_ATTESTATION;
  }
  const conf = Math.max(0.0, Math.min(1.0, link.confidence || 0.5));
  const width = Math.max(0.4, conf * 2.5) / globalScale;

  // Stroke color comes from the attestation style when defined (creator
  // edges get orange, operator edges get violet), default to neutral
  // grey-blue otherwise.
  const strokeRgb = style.color || '180, 190, 210';

  ctx.save();
  ctx.setLineDash(style.dash || []);
  ctx.lineWidth = width;
  ctx.strokeStyle = `rgba(${strokeRgb}, ${style.alpha})`;
  ctx.beginPath();
  ctx.moveTo(src.x, src.y);
  ctx.lineTo(tgt.x, tgt.y);
  ctx.stroke();
  ctx.restore();

  // Edge kind label at midpoint (only for inter-acquaintance edges, not
  // the synthetic scion-center spokes — those would clutter the view).
  // Creator-attested edges echo the orange stroke in their label so the
  // relationship word ("wife", "brother") reads as part of the same band.
  if (link.attested_by !== '__center__' && globalScale > 0.6) {
    const fontSize = Math.max(9 / globalScale, 1.5);
    ctx.font = `${fontSize}px Consolas, monospace`;
    ctx.fillStyle = style.color
      ? `rgba(${style.color}, 0.95)`
      : 'rgba(160, 170, 200, 0.7)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(link.kind || '', (src.x + tgt.x) / 2, (src.y + tgt.y) / 2);
  }
}

// Visibility predicates: status + platform filters HIDE nodes; severity
// only controls which anomaly glows paint (handled inside drawNode).
function isNodeVisible(node) {
  if (node.isScion || node.isCreator) return true;
  if (!filters.status.has(node.status || 'active')) return false;
  if (filters.platform.size > 0) {
    const platforms = node.platforms || [];
    if (!platforms.some(p => filters.platform.has(p))) return false;
  }
  return true;
}

function isLinkVisible(link) {
  // Link visible only when both endpoints are visible. force-graph passes
  // resolved source/target objects after simulation starts; before that
  // they're string ids — in which case we look them up on the live data.
  const data = forceGraph.graphData();
  const findNode = ref => typeof ref === 'object' && ref !== null
    ? ref
    : data.nodes.find(n => n.id === ref);
  const src = findNode(link.source);
  const tgt = findNode(link.target);
  if (!src || !tgt) return true;
  return isNodeVisible(src) && isNodeVisible(tgt);
}

function matchesSearch(node) {
  if (!searchQuery || node.isScion) return false;
  const acq = node.data;
  if (!acq) return false;
  const haystack = [
    acq.display_name || '',
    ...(acq.nicknames || []),
    ...(acq.identities || []).map(i => i.username || ''),
  ].join(' ').toLowerCase();
  return haystack.includes(searchQuery);
}

// --- Side panel ---
function showAcquaintancePanel(node) {
  const panel = document.getElementById('acquaintance-panel');
  const title = document.getElementById('acquaintance-panel-title');
  const body  = document.getElementById('acquaintance-panel-body');
  const acq = node.data;
  if (!acq) return;
  // Some call sites (raw graphData lookups) might not carry the inferred
  // kind. Compute on demand so the panel always has it.
  if (!node.kind) node.kind = classifyEntity(acq);
  currentPanelPersonId = acq.person_id;
  title.textContent = acq.display_name || node.id;

  // Group edges by kind for readable rendering.
  const edgesByKind = {};
  for (const e of acq.edges || []) {
    edgesByKind[e.kind] = edgesByKind[e.kind] || [];
    edgesByKind[e.kind].push(e);
  }

  const anom = anomalyMap[acq.person_id];

  // Fields rendered inline above are removed from the raw dump so they
  // don't double-print; anything else lives in the collapsible Raw block,
  // which catches new fields automatically as the Acquaintance schema grows.
  const RENDERED = new Set([
    'person_id', 'display_name', 'status', 'pronouns', 'relationship_to_creator',
    'nicknames', 'identities', 'met_at', 'met_via', 'entity_node_id',
    'notes', 'edges', 'created_by_person_id', 'created_by_attested_by',
  ]);
  const rawExtras = Object.fromEntries(
    Object.entries(acq).filter(([k]) => !RENDERED.has(k)),
  );

  body.innerHTML = `
    ${anom ? `<div class="panel-anomaly sev-${anom.severity}"><strong>${anom.severity.toUpperCase()}:</strong> ${escapeHtml(anom.summary || '')}</div>` : ''}
    <dl class="acq-fields">
      <dt>person_id</dt><dd><code>${escapeHtml(acq.person_id)}</code>
        <button class="copy-btn" data-copy="${escapeHtml(acq.person_id)}" title="copy">⎘</button></dd>
      <dt>kind</dt><dd>${node.isCreator ? '<span class="kind-pill kind-creator">creator</span> ' : ''}<span class="kind-pill kind-${node.kind}">${node.kind}</span> <span class="dim">(inferred)</span></dd>
      <dt>status</dt><dd>${escapeHtml(acq.status || 'active')}</dd>
      <dt>pronouns</dt><dd>${escapeHtml(acq.pronouns || '—')}</dd>
      <dt>relationship</dt><dd>${escapeHtml(acq.relationship_to_creator || '—')}</dd>
      <dt>operated by</dt><dd>${renderCreatedBy(acq)}</dd>
      <dt>nicknames</dt><dd>${(acq.nicknames || []).map(n => `<span class="tag">${escapeHtml(n)}</span>`).join('') || '—'}</dd>
      <dt>identities</dt><dd>${renderIdentities(acq.identities || [])}</dd>
      <dt>met_at</dt><dd>${escapeHtml(acq.met_at || '—')}</dd>
      <dt>met_via</dt><dd>${renderMetVia(acq.met_via)}</dd>
      ${acq.met_in_chat_id != null ? `
      <dt>chat_id</dt><dd><code>${escapeHtml(String(acq.met_in_chat_id))}</code>
        <button class="copy-btn" data-copy="${escapeHtml(String(acq.met_in_chat_id))}" title="copy">⎘</button></dd>
      ` : ''}
      <dt>entity_node</dt><dd>${acq.entity_node_id ? `<code>${escapeHtml(acq.entity_node_id)}</code>` : '—'}</dd>
      <dt>notes</dt><dd>${renderNotes(acq.notes || {})}</dd>
      <dt>edges</dt><dd>${renderEdges(edgesByKind)}</dd>
    </dl>
    ${Object.keys(rawExtras).length ? `
    <details class="raw-extras">
      <summary>Other fields (${Object.keys(rawExtras).length})</summary>
      <pre>${escapeHtml(JSON.stringify(rawExtras, null, 2))}</pre>
    </details>` : ''}
  `;
  panel.classList.remove('hidden');

  // Copy buttons
  for (const btn of panel.querySelectorAll('.copy-btn')) {
    btn.addEventListener('click', e => {
      navigator.clipboard.writeText(e.target.dataset.copy);
      e.target.textContent = '✓';
      setTimeout(() => { e.target.textContent = '⎘'; }, 1200);
    });
  }
}

// Render the operator-chain row. The target person_id is guaranteed to be
// present in the same payload (write-path-validated), so look up the
// display_name to show a readable label; fall back to the raw id only if
// the lookup misses for some reason (race with a refetch, etc.). The
// attestation tag rides alongside as a small pill so operators can spot
// self-claimed entries at a glance.
function renderCreatedBy(acq) {
  const targetId = acq.created_by_person_id;
  if (!targetId) return '—';
  const attest = acq.created_by_attested_by || 'self';
  const target = (lastPayload && lastPayload.acquaintances || [])
    .find(a => a.person_id === targetId);
  const label = target && target.display_name ? target.display_name : targetId;
  return `
    <span class="operator-link">${escapeHtml(label)}</span>
    <span class="attest-pill attest-${escapeHtml(attest)}">${escapeHtml(attest)}-attested</span>
    <button class="copy-btn" data-copy="${escapeHtml(targetId)}" title="copy person_id">⎘</button>
  `;
}

function renderMetVia(metVia) {
  const parsed = parseMetVia(metVia);
  if (!parsed) return '—';
  const platformPill = `<span class="met-platform-pill">${escapeHtml(parsed.platform)}</span>`;
  if (!parsed.shape) {
    // Legacy bare-platform — no chat-shape info available.
    return `${platformPill} <span class="dim">(legacy, no chat context)</span>`;
  }
  const shapePill = `<span class="met-shape-pill met-shape-${parsed.shape}">${parsed.shape}</span>`;
  const namePart = parsed.chatName
    ? ` <span class="met-chat-name">${escapeHtml(parsed.chatName)}</span>`
    : '';
  return `${platformPill} ${shapePill}${namePart}`;
}

function renderIdentities(idents) {
  if (!idents.length) return '—';
  return idents.map(i => {
    const verified = i.verified ? '✓' : '<span class="unverified">?</span>';
    return `<div class="identity">
      <span class="ident-platform">${escapeHtml(i.platform || '?')}</span>
      <span class="ident-handle">${escapeHtml(i.username || i.user_id || '?')}</span>
      <span class="ident-verified">${verified}</span>
    </div>`;
  }).join('');
}

function renderNotes(notes) {
  const keys = Object.keys(notes);
  if (!keys.length) return '—';
  return keys.map(k =>
    `<div class="note-row"><span class="note-key">${escapeHtml(k)}:</span> ${escapeHtml(String(notes[k]))}</div>`,
  ).join('');
}

function renderEdges(byKind) {
  const kinds = Object.keys(byKind);
  if (!kinds.length) return '<span class="dim">none</span>';
  return kinds.map(kind => {
    const rows = byKind[kind].map(e =>
      `<div class="edge-row">
        → <code>${escapeHtml(e.target_person_id)}</code>
        <span class="edge-meta">[${escapeHtml(e.attested_by || '?')}, conf ${(e.confidence || 0).toFixed(2)}]</span>
        ${e.description ? `<div class="edge-desc">${escapeHtml(e.description)}</div>` : ''}
      </div>`,
    ).join('');
    return `<div class="edge-group"><strong>${escapeHtml(kind)}</strong>${rows}</div>`;
  }).join('');
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
