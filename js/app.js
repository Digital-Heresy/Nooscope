/**
 * Nooscope -- main application entry point.
 * Connects to Thriden + PersonaForge WebSocket telemetry and renders a live 3D memory graph.
 */

const SCION_PORTS = {
  speaker: { thriden: 3030, pf: 8100 },
  helix:   { thriden: 3031, pf: 8101 },
};

// ---- State ----
let graph = null;
let eventLog = null;
let infoPanel = null;
let thridenStream = null;
let pfStream = null;

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

  graph.onNodeSelect = (node) => infoPanel.show(node);

  // Render a test graph immediately to verify rendering works
  renderTestGraph();

  // Parse URL params
  const params = new URLSearchParams(window.location.search);
  const scionParam = params.get('scion');
  const thridenPort = params.get('thriden');
  const pfPort = params.get('pf');

  if (thridenPort) {
    // Explicit ports
    connectTo(parseInt(thridenPort), parseInt(pfPort) || null);
  } else if (scionParam && SCION_PORTS[scionParam]) {
    // Named scion
    document.getElementById('scion-select').value = scionParam;
    const ports = SCION_PORTS[scionParam];
    connectTo(ports.thriden, ports.pf);
  }
  // Otherwise wait for user to click Connect

  // UI wiring
  document.getElementById('connect-btn').addEventListener('click', onConnect);
  document.getElementById('scion-select').addEventListener('change', onScionChange);
  document.getElementById('custom-connect-btn').addEventListener('click', onCustomConnect);
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
  const val = document.getElementById('scion-select').value;
  if (val === 'custom') {
    document.getElementById('custom-dialog').classList.remove('hidden');
    return;
  }
  const ports = SCION_PORTS[val];
  if (ports) connectTo(ports.thriden, ports.pf);
}

function onCustomConnect() {
  const thridenPort = parseInt(document.getElementById('custom-thriden').value);
  const pfPort = parseInt(document.getElementById('custom-pf').value);
  document.getElementById('custom-dialog').classList.add('hidden');
  connectTo(thridenPort, pfPort || null);
}

// ---- Connection ----

function connectTo(thridenPort, pfPort) {
  // Disconnect existing
  if (thridenStream) thridenStream.disconnect();
  if (pfStream) pfStream.disconnect();

  const callbacks = {
    onEvent: handleEvent,
    onStatus: handleStatus,
    onConnect: (name) => console.log(`[${name}] connected`),
    onDisconnect: (name) => console.log(`[${name}] disconnected`),
  };

  thridenStream = new TelemetryStream(
    'thriden',
    `ws://localhost:${thridenPort}/ws/telemetry`,
    callbacks
  );
  thridenStream.connect();

  if (pfPort) {
    pfStream = new TelemetryStream(
      'pf',
      `ws://localhost:${pfPort}/ws/telemetry`,
      callbacks
    );
    pfStream.connect();
  }
}

// ---- Event handling ----

function handleEvent(source, event) {
  const type = event.type;

  // Log all events
  if (type !== 'snapshot') {
    eventLog.add(event, source);
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
      break;
    case 'memory_formed':
      handleMemoryFormed(event);
      break;
    case 'session_created':
      handleSessionCreated(event);
      break;
    case 'session_expired':
      handleSessionExpired(event);
      break;
    case 'working_memory_updated':
      eventLog.add(event, source);
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
}

function handleNodeCreated(event) {
  graph.addNode(event.payload);
}

function handleEdgeReinforced(event) {
  // Future: update edge width in graph
}

function handleEdgeCreated(event) {
  // Future: add new edge to graph
}

function handleRecallFired(event) {
  const p = event.payload;
  if (p.node_ids && p.node_ids.length > 0) {
    graph.highlightRecall(p.node_ids);
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

function handleSessionExpired(event) {
  const el = document.getElementById('session-status');
  el.textContent = `Session ended (${event.payload.message_count || '?'} msgs)`;
  setTimeout(() => el.classList.add('hidden'), 5000);
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

// ---- Test graph (renders immediately to verify three.js works) ----

function renderTestGraph() {
  console.log('Rendering test graph...');
  const testSnapshot = {
    nodes: [
      { id: 'test-1', content_preview: 'Working Memory', scope: 'self', activation_count: 10, salience: 0.8, consolidation_level: 0, edges: [
        { target_id: 'test-2', weight: 0.7, origin: 'co_activation' },
        { target_id: 'test-3', weight: 0.5, origin: 'co_activation' },
      ]},
      { id: 'test-2', content_preview: 'Recall Pathway', scope: 'universal', activation_count: 8, salience: 0.6, consolidation_level: 0, edges: [
        { target_id: 'test-1', weight: 0.7, origin: 'co_activation' },
        { target_id: 'test-4', weight: 0.4, origin: 'co_activation' },
      ]},
      { id: 'test-3', content_preview: 'Memory Formation', scope: 'universal', activation_count: 5, salience: 0.5, consolidation_level: 0, edges: [
        { target_id: 'test-1', weight: 0.5, origin: 'co_activation' },
        { target_id: 'test-5', weight: 0.3, origin: 'explicit' },
      ]},
      { id: 'test-4', content_preview: 'Sensory Input', scope: 'other:external', activation_count: 3, salience: 0.4, consolidation_level: 0, edges: [
        { target_id: 'test-2', weight: 0.4, origin: 'co_activation' },
      ]},
      { id: 'test-5', content_preview: 'Consolidation', scope: 'self', activation_count: 1, salience: 0.3, consolidation_level: 0, edges: [
        { target_id: 'test-3', weight: 0.3, origin: 'explicit' },
      ]},
    ],
    total_nodes: 5,
    total_edges: 10,
  };

  try {
    graph.initFromSnapshot(testSnapshot);
    updateStats();
    console.log('Test graph rendered successfully');
  } catch (e) {
    console.error('Test graph failed:', e);
  }
}
