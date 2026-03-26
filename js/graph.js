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
    this.favorites = new Set();  // session-only favorited node IDs
    this.onNodeSelect = null;   // callback
    this.onNodeUpdated = null;  // callback for live refresh of info panel
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

    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || (window.innerHeight - 40);
    const self = this;

    this.graph = ForceGraph3D()(this.container)
      .width(width)
      .height(height)
      .graphData(this.graphData)
      .backgroundColor('#0a0a1a')
      .nodeThreeObject(node => {
        const group = new THREE.Group();

        // Main sphere
        const size = self._currentNodeSize(node);
        const color = self._currentNodeColor(node);
        const geometry = new THREE.SphereGeometry(size, 16, 12);
        const material = new THREE.MeshLambertMaterial({
          color: color,
          transparent: true,
          opacity: 0.9,
        });
        const sphere = new THREE.Mesh(geometry, material);
        group.add(sphere);

        // Selection halo ring
        const ringGeo = new THREE.RingGeometry(size * 1.6, size * 2.0, 32);
        const ringMat = new THREE.MeshBasicMaterial({
          color: '#00e5ff',
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.name = 'selectionRing';
        group.add(ring);

        // Favorite star indicator
        if (self.favorites.has(node.id)) {
          const starGeo = new THREE.RingGeometry(size * 2.2, size * 2.5, 5);
          const starMat = new THREE.MeshBasicMaterial({
            color: '#ffd700',
            transparent: true,
            opacity: 0.7,
            side: THREE.DoubleSide,
          });
          const star = new THREE.Mesh(starGeo, starMat);
          star.name = 'favoriteStar';
          group.add(star);
        }

        node._threeObj = group;
        return group;
      })
      .nodeThreeObjectExtend(false)
      .linkWidth(l => Math.max(0.2, l.weight * 2.5))
      .linkColor(l => ORIGIN_COLORS[l.origin] || '#444')
      .linkOpacity(0.3)
      .linkDirectionalParticles(0)
      .onNodeClick(node => {
        this.selectedNode = node;
        if (this.onNodeSelect) this.onNodeSelect(node);
        this._updateSelectionVisuals();
      })
      .warmupTicks(100)
      .cooldownTicks(200)
      // Slightly weaker force to spread the dense clique
      .d3Force('charge', null);

    // Re-add charge with slightly less strength
    if (this.graph.d3Force) {
      const d3 = window.d3 || (this.graph.d3Force('charge') && null);
      // 3d-force-graph exposes d3 forces -- reduce charge magnitude
      this.graph.d3Force('charge').strength(-40);
    }

    // Start animation loop
    this._animate();
  }

  _currentNodeSize(node) {
    const now = Date.now();
    let size = node._baseSize;
    if (node._pulseUntil > now) {
      const progress = (node._pulseUntil - now) / 700;
      size = size * (1 + 0.5 * progress);
    }
    return size;
  }

  _currentNodeColor(node) {
    const now = Date.now();
    if (node._pulseUntil > now) return '#ffffff';
    return scopeColor(node.scope);
  }

  _updateSelectionVisuals() {
    // Update all node ring opacities
    for (const [id, node] of this.nodeMap) {
      if (node._threeObj) {
        const ring = node._threeObj.getObjectByName('selectionRing');
        if (ring) {
          ring.material.opacity = (this.selectedNode && this.selectedNode.id === id) ? 0.8 : 0;
        }
      }
    }
  }

  _animate() {
    if (!this.graph) return;

    const now = Date.now();

    // Update node visuals for pulses and selection
    for (const [id, node] of this.nodeMap) {
      if (!node._threeObj) continue;
      const sphere = node._threeObj.children[0];
      if (!sphere || !sphere.geometry) continue;

      const size = this._currentNodeSize(node);
      const color = this._currentNodeColor(node);

      // Update sphere scale (cheaper than rebuilding geometry)
      const baseScale = size / node._baseSize;
      sphere.scale.set(baseScale, baseScale, baseScale);
      sphere.material.color.set(color);

      // Rotate selection ring to face camera
      const ring = node._threeObj.getObjectByName('selectionRing');
      if (ring && ring.material.opacity > 0) {
        ring.rotation.x += 0.02;
        ring.rotation.y += 0.01;
      }
    }

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

      // Refresh info panel if this is the selected node
      if (this.selectedNode && this.selectedNode.id === nodeId) {
        if (this.onNodeUpdated) this.onNodeUpdated(node);
      }
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

  addEdge(sourceId, targetId, weight, origin) {
    // Only add if both nodes exist and edge doesn't already exist
    if (!this.nodeMap.has(sourceId) || !this.nodeMap.has(targetId)) return;

    const exists = this.graphData.links.some(l => {
      const src = typeof l.source === 'object' ? l.source.id : l.source;
      const tgt = typeof l.target === 'object' ? l.target.id : l.target;
      return src === sourceId && tgt === targetId;
    });
    if (exists) return;

    this.graphData.links.push({
      source: sourceId,
      target: targetId,
      weight: weight || 0.3,
      origin: origin || 'co_activation',
    });

    // Re-feed graph data to trigger force simulation update
    this.graph.graphData(this.graphData);
  }

  updateEdge(sourceId, targetId, weight) {
    for (const l of this.graphData.links) {
      const src = typeof l.source === 'object' ? l.source.id : l.source;
      const tgt = typeof l.target === 'object' ? l.target.id : l.target;
      if (src === sourceId && tgt === targetId) {
        l.weight = weight;
        break;
      }
    }
  }

  highlightRecall(nodeIds) {
    for (const id of nodeIds) {
      this.pulseNode(id);
    }
    if (this.graph) {
      this.graph.linkDirectionalParticles(l => {
        const srcId = typeof l.source === 'object' ? l.source.id : l.source;
        const tgtId = typeof l.target === 'object' ? l.target.id : l.target;
        if (nodeIds.includes(srcId) && nodeIds.includes(tgtId)) return 4;
        return 0;
      });
      this.graph.linkDirectionalParticleColor(() => '#00e5ff');
      this.graph.linkDirectionalParticleWidth(1.5);

      setTimeout(() => {
        if (this.graph) {
          this.graph.linkDirectionalParticles(0);
        }
      }, 3000);
    }
  }

  // ---- Favorites (session-only) ----

  toggleFavorite(nodeId) {
    if (this.favorites.has(nodeId)) {
      this.favorites.delete(nodeId);
    } else {
      this.favorites.add(nodeId);
    }
    // Force rebuild of the node's three object to show/hide star
    if (this.graph) {
      this.graph.nodeThreeObject(this.graph.nodeThreeObject());
    }
    return this.favorites.has(nodeId);
  }

  isFavorite(nodeId) {
    return this.favorites.has(nodeId);
  }

  getFavorites() {
    return [...this.favorites].map(id => this.nodeMap.get(id)).filter(Boolean);
  }

  getStats() {
    return {
      nodes: this.graphData.nodes.length,
      edges: this.graphData.links.length,
    };
  }
}
