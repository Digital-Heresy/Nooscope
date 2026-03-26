/**
 * 3D force-directed graph rendering using 3d-force-graph.
 * Consumes Thriden snapshot data and renders nodes/edges.
 */

const SCOPE_COLORS = {
  'self':      '#ff4a9e',
  'universal': '#4aff7f',
  'unknown':   '#666666',
};

// Anything starting with "other:" gets blue
function scopeColor(scope) {
  if (scope.startsWith('other:') || scope.startsWith('intimate:')) return '#4a9eff';
  return SCOPE_COLORS[scope] || SCOPE_COLORS['unknown'];
}

const ORIGIN_COLORS = {
  'co_activation':       '#ff8c00',
  'explicit':            '#ffffff',
  'semantic_clustering':  '#9b59b6',
};

class MemoryGraph {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.graph = null;
    this.nodeMap = new Map();   // id -> node data object
    this.graphData = { nodes: [], links: [] };
    this.selectedNode = null;
    this.onNodeSelect = null;   // callback
  }

  initFromSnapshot(snapshot) {
    const nodes = [];
    const links = [];
    this.nodeMap.clear();

    for (const n of snapshot.nodes) {
      const node = {
        id: n.id,
        label: n.content_preview,
        scope: n.scope,
        activationCount: n.activation_count,
        salience: n.salience,
        level: n.consolidation_level,
        // Visual state
        _pulseUntil: 0,
        _baseSize: this._nodeSize(n.activation_count),
      };
      nodes.push(node);
      this.nodeMap.set(n.id, node);

      for (const e of n.edges) {
        links.push({
          source: n.id,
          target: e.target_id,
          weight: e.weight,
          origin: e.origin,
        });
      }
    }

    this.graphData = { nodes, links };
    this._render();
  }

  _nodeSize(activationCount) {
    return Math.max(1, Math.log2(activationCount + 1)) * 2;
  }

  _render() {
    if (this.graph) {
      this.graph._destructor && this.graph._destructor();
    }

    this.graph = ForceGraph3D()(this.container)
      .graphData(this.graphData)
      .backgroundColor('#0a0a1a')
      .nodeVal(n => {
        const now = Date.now();
        if (n._pulseUntil > now) {
          const progress = (n._pulseUntil - now) / 700;
          return n._baseSize * (1 + 0.5 * progress);
        }
        return n._baseSize;
      })
      .nodeColor(n => {
        const now = Date.now();
        if (n._pulseUntil > now) return '#ffffff';
        return scopeColor(n.scope);
      })
      .nodeLabel(n => {
        const label = n.label || '';
        return `${label.substring(0, 60)}${label.length > 60 ? '...' : ''}\nact: ${n.activationCount} | sal: ${n.salience.toFixed(3)}`;
      })
      .nodeOpacity(0.9)
      .linkWidth(l => Math.max(0.2, l.weight * 2.5))
      .linkColor(l => ORIGIN_COLORS[l.origin] || '#444')
      .linkOpacity(0.3)
      .linkDirectionalParticles(0)
      .onNodeClick(node => {
        this.selectedNode = node;
        if (this.onNodeSelect) this.onNodeSelect(node);
      })
      .warmupTicks(100)
      .cooldownTicks(200);

    // Start animation loop for pulse effects
    this._animate();
  }

  _animate() {
    if (!this.graph) return;
    // Refresh node visuals periodically for pulse effects
    this.graph.nodeColor(this.graph.nodeColor());
    this.graph.nodeVal(this.graph.nodeVal());
    requestAnimationFrame(() => this._animate());
  }

  // ---- Live update methods ----

  pulseNode(nodeId) {
    const node = this.nodeMap.get(nodeId);
    if (node) {
      node._pulseUntil = Date.now() + 700;
    }
  }

  updateNode(nodeId, activationCount, salience) {
    const node = this.nodeMap.get(nodeId);
    if (node) {
      node.activationCount = activationCount;
      node.salience = salience;
      node._baseSize = this._nodeSize(activationCount);
    }
  }

  addNode(nodeData) {
    const node = {
      id: nodeData.node_id,
      label: nodeData.content_preview,
      scope: nodeData.scope,
      activationCount: 0,
      salience: nodeData.salience,
      level: 0,
      _pulseUntil: Date.now() + 2000,
      _baseSize: this._nodeSize(0),
    };
    this.nodeMap.set(node.id, node);
    this.graphData.nodes.push(node);
    this.graph.graphData(this.graphData);
  }

  highlightRecall(nodeIds) {
    for (const id of nodeIds) {
      this.pulseNode(id);
    }
    // Add temporary recall arc particles along edges connecting these nodes
    if (this.graph) {
      this.graph.linkDirectionalParticles(l => {
        const srcId = typeof l.source === 'object' ? l.source.id : l.source;
        const tgtId = typeof l.target === 'object' ? l.target.id : l.target;
        if (nodeIds.includes(srcId) && nodeIds.includes(tgtId)) return 4;
        return 0;
      });
      this.graph.linkDirectionalParticleColor(() => '#00e5ff');
      this.graph.linkDirectionalParticleWidth(1.5);

      // Reset particles after 3 seconds
      setTimeout(() => {
        if (this.graph) {
          this.graph.linkDirectionalParticles(0);
        }
      }, 3000);
    }
  }

  getStats() {
    return {
      nodes: this.graphData.nodes.length,
      edges: this.graphData.links.length,
    };
  }
}
