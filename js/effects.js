/**
 * Event log, info panel, and UI effects for Nooscope.
 */

class EventLog {
  constructor(containerId, maxEntries = 50) {
    this.container = document.getElementById(containerId);
    this.maxEntries = maxEntries;
  }

  add(event, source) {
    const ts = event.timestamp ? event.timestamp.substring(11, 19) : '??:??:??';
    const type = event.type || 'unknown';
    const detail = this._formatDetail(event);

    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.innerHTML = `<span class="log-time">${ts}</span> <span class="log-type-${type}">${type}</span> <span class="log-detail">${detail}</span>`;

    this.container.insertBefore(entry, this.container.firstChild);

    while (this.container.children.length > this.maxEntries) {
      this.container.removeChild(this.container.lastChild);
    }
  }

  _formatDetail(event) {
    const p = event.payload || {};
    switch (event.type) {
      case 'snapshot':
        return `${p.total_nodes} nodes, ${p.total_edges} edges`;
      case 'node_activated':
        return `${(p.node_id || '').substring(0, 8)}... act=${p.activation_count}`;
      case 'node_created':
        return `${(p.node_id || '').substring(0, 8)}... scope=${p.scope}`;
      case 'recall_fired':
        return `${(p.node_ids || []).length} nodes recalled`;
      case 'memory_formed':
        return `${p.scope} sal=${p.salience}`;
      case 'session_created':
        return `${p.chat_type || 'session'}`;
      case 'session_expired':
        return `${p.message_count || '?'} msgs`;
      case 'edge_reinforced':
        return `${(p.source_id || '').substring(0, 8)}...->${(p.target_id || '').substring(0, 8)}... w=${(p.weight || 0).toFixed(3)}`;
      case 'edge_created':
        return `${(p.source_id || '').substring(0, 8)}...->${(p.target_id || '').substring(0, 8)}...`;
      case 'graph_wiped':
        return `${p.nodes_deleted} nodes cleared`;
      case 'working_memory_updated':
        return 'working memory updated';
      default:
        return JSON.stringify(p).substring(0, 60);
    }
  }
}

class InfoPanel {
  constructor(panelId, contentId, closeId) {
    this.panel = document.getElementById(panelId);
    this.content = document.getElementById(contentId);
    this.currentNodeId = null;
    document.getElementById(closeId).addEventListener('click', () => this.hide());
  }

  show(node, graph) {
    this.currentNodeId = node.id;
    this._renderContent(node, graph);
    this.panel.classList.remove('hidden');
  }

  refreshIfShowing(node, graph) {
    if (this.currentNodeId === node.id) {
      this._renderContent(node, graph);
    }
  }

  _renderContent(node, graph) {
    const isFav = graph && graph.isFavorite(node.id);
    const favBtnText = isFav ? '&#9733; Favorited' : '&#9734; Favorite';
    const favBtnClass = isFav ? 'fav-btn active' : 'fav-btn';

    // Pin/unpin button
    const isUserPinned = node._userPinned;
    const pinBtnText = isUserPinned ? '&#9899; Pinned — Unpin' : '&#9898; Pin in Space';
    const pinBtnClass = isUserPinned ? 'pin-btn active' : 'pin-btn';

    // Position editor for pinned nodes (only when pos controls toggled on)
    const isPinned = node.fx !== undefined;
    const posEditor = (isPinned && typeof showPosControls !== 'undefined' && showPosControls) ? `
      <div class="field">
        <div class="field-label">Position (fx / fy / fz)</div>
        <div class="pos-editor">
          <label>x <input type="number" id="pos-fx" value="${node.fx}" step="0.5"></label>
          <label>y <input type="number" id="pos-fy" value="${node.fy}" step="0.5"></label>
          <label>z <input type="number" id="pos-fz" value="${node.fz}" step="0.5"></label>
          <button class="pos-apply-btn" onclick="applyPosition('${node.id}')">Apply</button>
        </div>
      </div>
      <div class="field">
        <button class="pos-dump-btn" onclick="dumpAllPositions()">Dump all positions</button>
      </div>
    ` : '';

    const contentField = (typeof isAdmin === 'function' && isAdmin()) ? `
      <div class="field">
        <div class="field-label">Content</div>
        <div class="field-value" style="color: var(--text-dim); font-style: italic">Stripped from telemetry stream</div>
      </div>
    ` : '';

    this.content.innerHTML = `
      <div class="field">
        <div class="field-label">ID</div>
        <div class="field-value highlight">${node.id}</div>
      </div>
      ${contentField}
      <div class="field">
        <div class="field-label">Scope</div>
        <div class="field-value" style="color: ${scopeColor(node.scope)}">${node.scope}</div>
      </div>
      <div class="field">
        <button class="${pinBtnClass}" onclick="toggleNodePin('${node.id}')">${pinBtnText}</button>
      </div>
      ${posEditor}
      <div class="field">
        <div class="field-label">Activation Count</div>
        <div class="field-value">${node.activationCount}</div>
      </div>
      <div class="field">
        <div class="field-label">Salience</div>
        <div class="field-value">${node.salience.toFixed(4)}</div>
      </div>
      <div class="field">
        <div class="field-label">Consolidation Level</div>
        <div class="field-value">${node.level === 0 ? 'Episodic' : node.level === 1 ? 'Cluster' : 'Abstract'}</div>
      </div>
      <div class="field">
        <button class="${favBtnClass}" onclick="toggleFavorite('${node.id}')">${favBtnText}</button>
      </div>
    `;
  }

  showSentinel(sentinel) {
    this.currentNodeId = null; // not a graph node
    const evtList = sentinel.events.map(e => `<span class="log-type-${e}">${e}</span>`).join(', ');
    this.content.innerHTML = `
      <div class="field">
        <div class="field-label">Sentinel Node</div>
        <div class="field-value highlight" style="color: #ff8c00">${sentinel.label}</div>
      </div>
      <div class="field">
        <div class="field-label">Category</div>
        <div class="field-value">${sentinel.category}</div>
      </div>
      <div class="field">
        <div class="field-label">Brain Region</div>
        <div class="field-value">${sentinel.region}</div>
      </div>
      <div class="field">
        <div class="field-label">Events</div>
        <div class="field-value">${evtList}</div>
      </div>
      <div class="field">
        <div class="field-label">Description</div>
        <div class="field-value" style="color: var(--text-dim)">${sentinel.description}</div>
      </div>
    `;
    this.panel.classList.remove('hidden');
  }

  hide() {
    this.panel.classList.add('hidden');
    this.currentNodeId = null;
  }

  _escape(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}

// Global function for the favorite button onclick
function toggleFavorite(nodeId) {
  if (!graph) return;
  const isFav = graph.toggleFavorite(nodeId);
  const node = graph.nodeMap.get(nodeId);
  if (node) {
    infoPanel._renderContent(node, graph);
  }
}

// Global function for pin/unpin
function toggleNodePin(nodeId) {
  if (!graph) return;
  graph.togglePin(nodeId);
  const node = graph.nodeMap.get(nodeId);
  if (node) {
    infoPanel._renderContent(node, graph);
  }
}

// Global functions for the position editor (logo tuning)
function applyPosition(nodeId) {
  if (!graph) return;
  const node = graph.nodeMap.get(nodeId);
  if (!node) return;

  const fx = parseFloat(document.getElementById('pos-fx').value);
  const fy = parseFloat(document.getElementById('pos-fy').value);
  const fz = parseFloat(document.getElementById('pos-fz').value);

  node.fx = fx; node.x = fx;
  node.fy = fy; node.y = fy;
  node.fz = fz; node.z = fz;

  // Poke the graph so it picks up the new positions
  const data = graph.graph.graphData();
  graph.graph.graphData(data);
}

function dumpAllPositions() {
  if (!graph) return;
  const lines = [];
  for (const [id, node] of graph.nodeMap) {
    if (node.fx !== undefined) {
      lines.push(`${id}: fx=${node.fx}, fy=${node.fy}, fz=${node.fz}`);
    }
  }
  const output = lines.join('\n');
  console.log('--- Logo node positions ---\n' + output);
  // Also copy to clipboard
  navigator.clipboard.writeText(output).then(() => {
    console.log('Copied to clipboard!');
  });
}
