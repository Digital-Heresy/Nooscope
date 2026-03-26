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
        return `${(p.node_id || '').substring(0, 8)}... "${(p.content_preview || '').substring(0, 40)}"`;
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
      case 'working_memory_updated':
        return `"${(p.content_preview || '').substring(0, 40)}"`;
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

    this.content.innerHTML = `
      <div class="field">
        <div class="field-label">ID</div>
        <div class="field-value highlight">${node.id}</div>
      </div>
      <div class="field">
        <div class="field-label">Content</div>
        <div class="field-value">${this._escape(node.label || '')}</div>
      </div>
      <div class="field">
        <div class="field-label">Scope</div>
        <div class="field-value" style="color: ${scopeColor(node.scope)}">${node.scope}</div>
      </div>
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
  // Refresh the info panel
  const node = graph.nodeMap.get(nodeId);
  if (node) {
    infoPanel._renderContent(node, graph);
  }
}
