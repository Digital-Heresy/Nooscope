/**
 * Nooscope -- main application entry point.
 * Connects to Thriden + PersonaForge WebSocket telemetry and renders a live 3D memory graph.
 */

const SCION_PRESETS = NOOSCOPE_CONFIG.scions;

// Admin state lives in NooscopeAuth (js/auth.js) post-r5kh. Local alias so
// existing call sites stay readable.
const isAdmin = () => NooscopeAuth.isAdmin();

// Build a dropdown label from a Scion config entry. `name` is the
// PF-supplied display name when available (Nooscope-de9m); falls back to
// title-cased slug for older configs. `badge` is the PF live-state
// marker — `live-online` / `live-sleeping` render clean; anything else
// appends a status suffix (`— Offline` for `live-offline`, `— {badge}`
// otherwise). Dev mode keeps the port hint in parens.
function buildScionLabel(slug, cfg) {
  const display = cfg.name || (slug.charAt(0).toUpperCase() + slug.slice(1));
  const base = cfg.host ? display : `${display} (${cfg.thriden}/${cfg.pf})`;
  const badge = cfg.badge;
  if (!badge || badge === 'live-online' || badge === 'live-sleeping') return base;
  if (badge === 'live-offline') return `${base} — Offline`;
  return `${base} — ${badge}`;
}

// ---- State ----
let graph = null;
let eventLog = null;
let infoPanel = null;
let thridenStream = null;
let pfStream = null;
let isConnected = false;
let showPosControls = false;
let introRunning = false;
let currentScion = null; // track active scion config for reconnection

// ---- Init ----
document.addEventListener('DOMContentLoaded', () => {
  // Debug: verify three.js and 3d-force-graph loaded
  console.log('three.js loaded:', typeof THREE !== 'undefined');
  console.log('ForceGraph3D loaded:', typeof ForceGraph3D !== 'undefined');

  const container = document.getElementById('graph-container');
  console.log('Container size:', container.clientWidth, 'x', container.clientHeight);

  graph = new MemoryGraph('graph-container');
  eventLog = new EventLog('log-entries');
  infoPanel = new InfoPanel('info-panel', 'info-content', 'info-close');

  graph.onNodeSelect = (node) => infoPanel.show(node, graph);
  graph.onNodeUpdated = (node) => {
    infoPanel.refreshIfShowing(node, graph);
  };
  graph.onSentinelSelect = (meta) => infoPanel.showSentinel(meta);

  // Populate scion dropdown from config. Labels are name + badge-aware
  // suffix (live-* states normal; anything else gets an inline status
  // marker). Native <option> styling is unreliable cross-browser, so
  // state is conveyed in text rather than colour.
  const scionSelect = document.getElementById('scion-select');
  const customOpt = scionSelect.querySelector('option[value="custom"]');
  for (const [slug, cfg] of Object.entries(SCION_PRESETS)) {
    const opt = document.createElement('option');
    opt.value = slug;
    opt.textContent = buildScionLabel(slug, cfg);
    scionSelect.insertBefore(opt, customOpt);
  }
  scionSelect.value = Object.keys(SCION_PRESETS)[0] || 'custom';

  // Render a test graph immediately to verify rendering works
  renderTestGraph();

  // Parse URL params
  const params = new URLSearchParams(window.location.search);
  const scionParam = params.get('scion');
  const thridenPort = params.get('thriden');
  const pfPort = params.get('pf');

  if (thridenPort) {
    // Explicit ports from URL params
    connectTo({ thriden: parseInt(thridenPort), pf: parseInt(pfPort) || null });
  } else if (scionParam && SCION_PRESETS[scionParam]) {
    // Named scion
    document.getElementById('scion-select').value = scionParam;
    connectTo(SCION_PRESETS[scionParam]);
  }
  // Otherwise wait for user to click Connect

  // Initialize shared admin auth (Nooscope-r5kh). Installs the password
  // modal, wires the lock-icon, and toggles badge/lock state to match.
  NooscopeAuth.init();
  NooscopeAuth.onAdminStateChange(() => {
    // Reconnect on admin/public flip so the right WS path is used.
    if (currentScion) reconnectWithCurrentMode();
  });

  // UI wiring
  document.getElementById('connect-btn').addEventListener('click', onConnect);
  document.getElementById('scion-select').addEventListener('change', onScionChange);
  document.getElementById('custom-connect-btn').addEventListener('click', onCustomConnect);
  document.getElementById('rotate-btn').addEventListener('click', toggleRotation);
  document.getElementById('pos-toggle-btn').addEventListener('click', togglePosControls);
  document.getElementById('brain-toggle-btn').addEventListener('click', toggleBrain);

  // Pause rotation when user interacts with the 3D view
  const graphEl = document.getElementById('graph-container');
  graphEl.addEventListener('mousedown', () => { setRotation(false); });
  graphEl.addEventListener('touchstart', () => { setRotation(false); });
});

function onScionChange() {
  const val = document.getElementById('scion-select').value;
  const dialog = document.getElementById('custom-dialog');
  if (val === 'custom') {
    dialog.classList.remove('hidden');
  } else {
    dialog.classList.add('hidden');
  }
}

function onConnect() {
  if (introRunning) return;
  if (isConnected) {
    disconnectAll();
    return;
  }
  const val = document.getElementById('scion-select').value;
  if (val === 'custom') {
    document.getElementById('custom-dialog').classList.remove('hidden');
    return;
  }
  const preset = SCION_PRESETS[val];
  if (preset) connectTo(preset);
}

function disconnectAll() {
  if (thridenStream) { thridenStream.disconnect(); thridenStream = null; }
  if (pfStream) { pfStream.disconnect(); pfStream = null; }
  setConnectedState(false);
}

function setConnectedState(connected) {
  isConnected = connected;
  const btn = document.getElementById('connect-btn');
  btn.textContent = connected ? 'Disconnect' : 'Connect';
  btn.style.background = connected ? 'var(--status-disconnected)' : '';
}

function onCustomConnect() {
  const thridenPort = parseInt(document.getElementById('custom-thriden').value);
  const pfPort = parseInt(document.getElementById('custom-pf').value);
  document.getElementById('custom-dialog').classList.add('hidden');
  connectTo({ thriden: thridenPort, pf: pfPort || null });
}

// ---- Connection ----

function buildWsUrl(scionConfig, service) {
  // Admin → privileged endpoint (nginx injects bearer subprotocol upstream).
  // Public → /public variant (rate-limited, no auth required).
  const admin = isAdmin();
  const path = admin ? '/ws/telemetry' : '/ws/telemetry/public';

  if (scionConfig.host) {
    // Production: build the URL RELATIVE to the browser's current origin
    // (location.host/protocol) rather than a configured hostname, so
    // Nooscope works behind ANY ingress — a tunnel hostname, a raw LAN
    // IP:8080, or localhost — with no host config to get wrong. nooscope's
    // own nginx proxies the per-Scion proxy-path prefix (e.g.
    // /speaker/ws/telemetry) and injects the upstream bearer. scionConfig.host
    // is now only a prod-mode marker; its VALUE is intentionally ignored.
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const prefix = scionConfig.pfPrefix || '';
    const wsPath = service === 'pf' ? `/ws/pf/telemetry${admin ? '' : '/public'}` : path;
    return `${protocol}//${location.host}${prefix}${wsPath}`;
  } else {
    // Development: localhost with port
    const port = service === 'thriden' ? scionConfig.thriden : scionConfig.pf;
    if (!port) return null;
    return `ws://localhost:${port}${path}`;
  }
}

function connectTo(scionConfig) {
  // Disconnect existing
  if (thridenStream) thridenStream.disconnect();
  if (pfStream) pfStream.disconnect();

  currentScion = scionConfig;

  const callbacks = {
    onEvent: handleEvent,
    onStatus: handleStatus,
    onConnect: (name) => {
      console.log(`[${name}] connected (${isAdmin() ? 'admin' : 'public'})`);
      if (name === 'thriden') setConnectedState(true);
    },
    onDisconnect: (name) => {
      console.log(`[${name}] disconnected`);
      // Only flip to disconnected if Thriden drops and we didn't manually disconnect
      if (name === 'thriden' && thridenStream && thridenStream.shouldReconnect) {
        // Still reconnecting -- leave button as Disconnect
      } else if (name === 'thriden' && (!thridenStream || !thridenStream.shouldReconnect)) {
        setConnectedState(false);
      }
    },
  };

  const thridenUrl = buildWsUrl(scionConfig, 'thriden');
  if (thridenUrl) {
    thridenStream = new TelemetryStream('thriden', thridenUrl, callbacks);
    thridenStream.connect();
  }

  const pfUrl = buildWsUrl(scionConfig, 'pf');
  if (pfUrl) {
    pfStream = new TelemetryStream('pf', pfUrl, callbacks);
    pfStream.connect();
  }
}

function reconnectWithCurrentMode() {
  if (currentScion) {
    connectTo(currentScion);
  }
}

// ---- Event handling ----

function handleEvent(source, event) {
  const type = event.type;

  // Log all events
  if (type !== 'snapshot') {
    eventLog.add(event, source);
  }

  // Any PF cognitive activity keeps the ambient halo lit.
  if (source === 'pf' && graph) {
    graph.bumpAmbient();
  }

  switch (type) {
    case 'snapshot':
      handleSnapshot(event);
      break;
    case 'node_activated':
      handleNodeActivated(event);
      break;
    case 'node_created':
      handleNodeCreated(event);
      break;
    case 'edge_reinforced':
      handleEdgeReinforced(event);
      break;
    case 'edge_created':
      handleEdgeCreated(event);
      break;
    case 'recall_fired':
      handleRecallFired(event);
      if (graph) graph.pulseRecall();
      break;
    case 'memory_promoted':
      // Session-tail → long-term is consolidation-shaped, not recall-shaped
      // (Nooscope-wb3m audit). Use formation, which already lives at the
      // temporal-lobe fixture where promoted memories anchor.
      if (graph) graph.pulseFormation();
      break;
    case 'memory_formed':
      handleMemoryFormed(event);
      if (graph) graph.pulseFormation();
      break;
    case 'session_created':
      handleSessionCreated(event);
      if (graph) graph.pulseSocialCreated();
      break;
    case 'session_expired':
      handleSessionExpired(event);
      if (graph) graph.pulseSocialExpired();
      break;
    case 'graph_wiped':
      handleGraphWiped(event);
      break;
    case 'working_memory_updated':
      eventLog.add(event, source);
      if (graph) graph.pulseFormation();
      break;
    case 'message_received':
    case 'pi_text_delta':
    case 'pi_tool_result':
      // External input — eyes fixture. pi_tool_result is technically
      // outbound-feedback-returning-inbound; for now it shares pulseEyes
      // with raw input. Separating it is a future sub-bean (not cb7r).
      if (graph) graph.pulseEyes();
      break;
    case 'action_completed':
    case 'cron_fired':
      // Agency — self-initiated action at the cerebellum. cron_fired is
      // a scheduled-self trigger; action_completed is the outbound impulse
      // crossing the threshold into the world (Nooscope-cb7r).
      if (graph) graph.pulseAgency();
      break;
    case 'backup_completed':
      // System housekeeping — brainstem. Vital fires alone now that
      // cron_fired moved to agency (Nooscope-cb7r).
      if (graph) graph.pulseVital();
      break;
    case 'dream_started':
      // Enter DREAMING state (Nooscope-da2m). Wireframe dims, violet
      // ambient halo lights up, thalamic sentinel holds a soft glow.
      // The pulse rides on top of the state as the transient marker.
      if (graph) {
        graph.setDreamingState(true);
        graph.pulseCircadian();
      }
      break;
    case 'dream_completed':
      // Release DREAMING state. If the dream mutated the brain
      // (payload.mutations > 0 || soul_proposals > 0), flash to signal
      // "the brain changed" — operator cue that a review is pending.
      if (graph) {
        graph.setDreamingState(false);
        graph.pulseCircadian();
        const p = event.payload || {};
        if ((p.mutations && p.mutations > 0) || (p.soul_proposals && p.soul_proposals > 0)) {
          graph.flashConsolidation();
        }
      }
      break;
    case 'dream_storyboard_ready':
      // Fires during the dream as the storyboard renders — transient
      // pulse only, doesn't touch the dreaming state.
      if (graph) graph.pulseCircadian();
      break;
    // --- Social-graph life-cycle (PersonaForge-vvsw / PR #93) ------------
    case 'acquaintance_created':
    case 'acquaintance_updated':
    case 'identity_linked':
    case 'acquaintance_unblocked':
      if (graph) graph.pulseSocialCreated();
      break;
    case 'acquaintance_blocked':
      if (graph) graph.pulseSocialBlocked();
      break;
    case 'acquaintance_forgotten':
      if (graph) graph.pulseSocialForgotten();
      break;
    default:
      break;
  }

  updateStats();
}

function handleSnapshot(event) {
  const p = event.payload;
  graph.initFromSnapshot(p);
  eventLog.add(event, 'thriden');
  updateStats();
}

function handleNodeActivated(event) {
  const p = event.payload;
  graph.updateNode(p.node_id, p.activation_count, p.salience);
  graph.pulseNode(p.node_id);
  graph.pulseEdges(p.node_id);
}

function handleNodeCreated(event) {
  graph.addNode(event.payload);
}

function handleEdgeReinforced(event) {
  const p = event.payload;
  graph.updateEdge(p.source_id, p.target_id, p.weight);
}

function handleEdgeCreated(event) {
  const p = event.payload;
  graph.addEdge(p.source_id, p.target_id, 0.3, p.origin);
}

function handleRecallFired(event) {
  const p = event.payload;
  if (p.node_ids && p.node_ids.length > 0) {
    graph.highlightRecall(p.node_ids);
    graph.setWorkingMemory(p.node_ids);
  }
}

function handleMemoryFormed(event) {
  // The node will appear via Thriden's node_created event
}

function handleSessionCreated(event) {
  const el = document.getElementById('session-status');
  el.textContent = `Session active (${event.payload.chat_type || 'chat'})`;
  el.classList.remove('hidden');
}

function handleGraphWiped(event) {
  // Clear the entire graph and reset
  graph.initFromSnapshot({ nodes: [], total_nodes: 0, total_edges: 0 });
  updateStats();
}

function handleSessionExpired(event) {
  const el = document.getElementById('session-status');
  el.textContent = `Session ended (${event.payload.message_count || '?'} msgs)`;
  setTimeout(() => el.classList.add('hidden'), 5000);
  if (graph) {
    graph.killAmbient();
    graph.clearWorkingMemory();
  }
}

// ---- Status updates ----

function handleStatus(name, status) {
  const elId = name === 'thriden' ? 'thriden-status' : 'pf-status';
  const el = document.getElementById(elId);
  el.className = `status-indicator ${status}`;
}

function updateStats() {
  const stats = graph.getStats();
  document.getElementById('node-count').textContent = `${stats.nodes} nodes`;
  document.getElementById('edge-count').textContent = `${stats.edges} edges`;
}

// ---- Rotation control ----

function setRotation(enabled) {
  if (!graph) return;
  graph.setAutoRotate(enabled, 0.3);
  const btn = document.getElementById('rotate-btn');
  btn.innerHTML = enabled ? '&#9646;&#9646;' : '&#9654;';
  btn.className = enabled ? 'rotate-btn playing' : 'rotate-btn paused';
}

function toggleRotation() {
  if (!graph) return;
  setRotation(!graph._autoRotate);
}

// ---- Position controls toggle ----

function togglePosControls() {
  showPosControls = !showPosControls;
  const btn = document.getElementById('pos-toggle-btn');
  btn.className = showPosControls ? 'pos-toggle-btn active' : 'pos-toggle-btn';
  // Re-render info panel if it's open
  if (infoPanel && infoPanel.currentNodeId && graph) {
    const node = graph.nodeMap.get(infoPanel.currentNodeId);
    if (node) infoPanel._renderContent(node, graph);
  }
}

// ---- Brain wireframe toggle ----

function toggleBrain() {
  if (!graph) return;
  const visible = graph.toggleBrain();
  const btn = document.getElementById('brain-toggle-btn');
  btn.className = visible ? 'brain-btn active' : 'brain-btn';
}

// ---- Startup intro: Thriden logo (triangle + interleaved T) ----

function renderTestGraph() {
  console.log('Starting intro sequence...');

  // Boot the graph with an empty scene
  graph.initFromSnapshot({ nodes: [], total_nodes: 0, total_edges: 0 });

  // -- Triangle outline (outer + inner for thickness) --
  // Oriented vertically, all at z=0
  const triNodes = [
    { node_id: 'tri-ot',  content_preview: '', scope: 'other:frame', salience: 0.5, fx: 0,   fy: 18,  fz: 6.5 },
    { node_id: 'tri-obr', content_preview: '', scope: 'other:frame', salience: 0.5, fx: 16,  fy: -9,  fz: 0.5 },
    { node_id: 'tri-obl', content_preview: '', scope: 'other:frame', salience: 0.5, fx: -16, fy: -9,  fz: 0.5 },
    { node_id: 'tri-it',  content_preview: '', scope: 'other:frame', salience: 0.5, fx: 0,   fy: 9,   fz: 4.5 },
    { node_id: 'tri-ibr', content_preview: '', scope: 'other:frame', salience: 0.5, fx: 8,   fy: -4,  fz: 1.5 },
    { node_id: 'tri-ibl', content_preview: '', scope: 'other:frame', salience: 0.5, fx: -8,  fy: -4,  fz: 1.5 },
  ];

  const triEdges = [
    // Outer triangle
    { source: 'tri-ot',  target: 'tri-obr', weight: 0.6, origin: 'explicit' },
    { source: 'tri-obr', target: 'tri-obl', weight: 0.6, origin: 'explicit' },
    { source: 'tri-obl', target: 'tri-ot',  weight: 0.6, origin: 'explicit' },
    // Inner triangle
    { source: 'tri-it',  target: 'tri-ibr', weight: 0.6, origin: 'explicit' },
    { source: 'tri-ibr', target: 'tri-ibl', weight: 0.6, origin: 'explicit' },
    { source: 'tri-ibl', target: 'tri-it',  weight: 0.6, origin: 'explicit' },
    // Corner connections (give the outline thickness)
    { source: 'tri-ot',  target: 'tri-it',  weight: 0.4, origin: 'explicit' },
    { source: 'tri-obr', target: 'tri-ibr', weight: 0.4, origin: 'explicit' },
    { source: 'tri-obl', target: 'tri-ibl', weight: 0.4, origin: 'explicit' },
  ];

  // -- T shape: wings behind triangle (z=-3), stem in front (z=3) --
  // Inner corners at z=0 create the weave through the triangle plane
  const tNodes = [
    { node_id: 't-tl',  content_preview: '', scope: 'self', salience: 0.6, fx: -15, fy: 6,   fz: 2 },
    { node_id: 't-tr',  content_preview: '', scope: 'self', salience: 0.6, fx: 15,  fy: 6,   fz: 2 },
    { node_id: 't-blw', content_preview: '', scope: 'self', salience: 0.6, fx: -20, fy: 0,   fz: 2 },
    { node_id: 't-brw', content_preview: '', scope: 'self', salience: 0.6, fx: 20,  fy: 0,   fz: 2 },
    { node_id: 't-il',  content_preview: '', scope: 'self', salience: 0.6, fx: -6,  fy: 0,   fz: 2 },
    { node_id: 't-ir',  content_preview: '', scope: 'self', salience: 0.6, fx: 6,   fy: 0,   fz: 2 },
    // Mid-stem taper points (dovetail/coat-tail shape)
    { node_id: 't-sml', content_preview: '', scope: 'self', salience: 0.6, fx: -6,  fy: -20, fz: 2 },
    { node_id: 't-smr', content_preview: '', scope: 'self', salience: 0.6, fx: 6,   fy: -20, fz: 2 },
    // Stem bottom (tapers inward for dovetail)
    { node_id: 't-sbl', content_preview: '', scope: 'self', salience: 0.6, fx: -3,  fy: -28, fz: 2 },
    { node_id: 't-sbr', content_preview: '', scope: 'self', salience: 0.6, fx: 3,   fy: -28, fz: 2 },
  ];

  const tEdges = [
    // Crossbar top
    { source: 't-tl',  target: 't-tr',  weight: 0.6, origin: 'co_activation' },
    // Right wing down
    { source: 't-tr',  target: 't-brw', weight: 0.6, origin: 'co_activation' },
    // Right step in
    { source: 't-brw', target: 't-ir',  weight: 0.6, origin: 'co_activation' },
    // Right stem down to mid-taper
    { source: 't-ir',  target: 't-smr', weight: 0.6, origin: 'co_activation' },
    // Right mid-taper to flared bottom
    { source: 't-smr', target: 't-sbr', weight: 0.6, origin: 'co_activation' },
    // Stem bottom
    { source: 't-sbr', target: 't-sbl', weight: 0.6, origin: 'co_activation' },
    // Left flared bottom to mid-taper
    { source: 't-sbl', target: 't-sml', weight: 0.6, origin: 'co_activation' },
    // Left mid-taper up
    { source: 't-sml', target: 't-il',  weight: 0.6, origin: 'co_activation' },
    // Left step out
    { source: 't-il',  target: 't-blw', weight: 0.6, origin: 'co_activation' },
    // Left wing up (closes the T)
    { source: 't-blw', target: 't-tl',  weight: 0.6, origin: 'co_activation' },
  ];

  // -- Stage the sequence: triangle draws first, then T appears inside it --
  const nodeMs = 150;   // between each node
  const edgeMs = 80;    // between each edge
  const pause  = 250;   // breathing room between phases

  let t = 0;
  introRunning = true;
  document.getElementById('connect-btn').classList.add('disabled');

  // Phase 1: Triangle nodes
  triNodes.forEach((n, i) => {
    setTimeout(() => { graph.addNode(n); updateStats(); }, t + i * nodeMs);
  });
  t += triNodes.length * nodeMs + pause;

  // Phase 2: Triangle edges
  triEdges.forEach((e, i) => {
    setTimeout(() => { graph.addEdge(e.source, e.target, e.weight, e.origin); updateStats(); }, t + i * edgeMs);
  });
  t += triEdges.length * edgeMs + pause;

  // Phase 3: T nodes
  tNodes.forEach((n, i) => {
    setTimeout(() => { graph.addNode(n); updateStats(); }, t + i * nodeMs);
  });
  t += tNodes.length * nodeMs + pause;

  // Phase 4: T edges
  tEdges.forEach((e, i) => {
    setTimeout(() => { graph.addEdge(e.source, e.target, e.weight, e.origin); updateStats(); }, t + i * edgeMs);
  });
  t += tEdges.length * edgeMs + pause;

  // Phase 5: Slow auto-rotation + unlock Connect
  setTimeout(() => {
    setRotation(true);
    introRunning = false;
    document.getElementById('connect-btn').classList.remove('disabled');
  }, t);
}
