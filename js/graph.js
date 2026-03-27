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
    // Keep nodes small -- the THREE sphere radius, not the force-graph nodeVal
    return Math.max(0.5, Math.log2(activationCount + 1)) * 0.8;
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
        const ringGeo = new THREE.RingGeometry(size + 0.5, size + 0.8, 32);
        const ringMat = new THREE.MeshBasicMaterial({
          color: '#00e5ff',
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.name = 'selectionRing';
        group.add(ring);

        // Birth glow (visible only for newly created nodes)
        const glowGeo = new THREE.SphereGeometry(size * 3, 16, 12);
        const glowMat = new THREE.MeshBasicMaterial({
          color: scopeColor(node.scope),
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        const glow = new THREE.Mesh(glowGeo, glowMat);
        glow.name = 'birthGlow';
        group.add(glow);

        // Favorite star indicator
        if (self.favorites.has(node.id)) {
          const starGeo = new THREE.RingGeometry(size + 1.0, size + 1.3, 5);
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
      .cooldownTicks(200);

    // Start camera closer (default is ~300, bring to ~120)
    this.graph.cameraPosition({ x: 0, y: 0, z: 120 });

    // Increase repulsion so the dense clique spreads out
    const charge = this.graph.d3Force('charge');
    if (charge) {
      charge.strength(-80);
      charge.distanceMax(300);
    }
    // Increase link distance so connected nodes don't collapse
    const link = this.graph.d3Force('link');
    if (link) {
      link.distance(40);
    }

    // Start animation loop
    this._animate();
  }

  _currentNodeSize(node) {
    const now = Date.now();
    let size = node._baseSize;
    if (node._pulseUntil > now) {
      const progress = (node._pulseUntil - now) / 1000;
      size = size * (1 + 1.5 * progress); // More dramatic pulse
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

      // Animate birth glow
      const glow = node._threeObj.getObjectByName('birthGlow');
      if (glow && node._glowUntil > now) {
        const remaining = (node._glowUntil - now) / 3000; // 0→1
        glow.material.opacity = 0.45 * remaining;
        const glowScale = 1 + 1.5 * (1 - remaining); // grows outward as it fades
        glow.scale.set(glowScale, glowScale, glowScale);
      } else if (glow) {
        glow.material.opacity = 0;
      }
    }

    // Manual camera orbit (ForceGraph3D kills its loop after cooldown)
    if (this._autoRotate) {
      const cam = this.graph.camera();
      const angle = this._autoRotateSpeed * 0.002;
      const x = cam.position.x, z = cam.position.z;
      cam.position.x = x * Math.cos(angle) - z * Math.sin(angle);
      cam.position.z = x * Math.sin(angle) + z * Math.cos(angle);
      cam.lookAt(0, 0, 0);
    }

    requestAnimationFrame(() => this._animate());
  }

  // ---- Live update methods ----

  pulseNode(nodeId) {
    const node = this.nodeMap.get(nodeId);
    if (node) {
      node._pulseUntil = Date.now() + 1000;
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
      _glowUntil: Date.now() + 3000,
      _baseSize: this._nodeSize(0),
    };
    // Pin position if specified (used by intro logo)
    if (nodeData.fx !== undefined) node.fx = nodeData.fx;
    if (nodeData.fy !== undefined) node.fy = nodeData.fy;
    if (nodeData.fz !== undefined) node.fz = nodeData.fz;

    this.nodeMap.set(node.id, node);

    // Use the graph's own data reference for incremental updates --
    // d3-force mutates link source/target from IDs to object refs,
    // so we must work with the live data, not our stale copy.
    const { nodes, links } = this.graph.graphData();
    nodes.push(node);
    this.graph.graphData({ nodes, links });
  }

  addEdge(sourceId, targetId, weight, origin) {
    // If either node hasn't arrived yet, queue and retry
    if (!this.nodeMap.has(sourceId) || !this.nodeMap.has(targetId)) {
      console.warn(`[addEdge] deferred: ${sourceId} -> ${targetId} (missing node)`);
      this._pendingEdges = this._pendingEdges || [];
      this._pendingEdges.push({ sourceId, targetId, weight, origin, retries: 0 });
      this._schedulePendingEdgeFlush();
      return;
    }

    const { nodes, links } = this.graph.graphData();

    const linkId = (l) => typeof l.source === 'object' ? l.source.id : l.source;
    const linkTgt = (l) => typeof l.target === 'object' ? l.target.id : l.target;

    const exists = links.some(l => linkId(l) === sourceId && linkTgt(l) === targetId);
    if (exists) return;

    const werePreviouslyLinked = links.some(l =>
      (linkId(l) === sourceId && linkTgt(l) === targetId) ||
      (linkId(l) === targetId && linkTgt(l) === sourceId)
    );

    const sourceNode = nodes.find(n => n.id === sourceId);
    const targetNode = nodes.find(n => n.id === targetId);

    if (!sourceNode || !targetNode) {
      console.warn(`[addEdge] node in map but not in graphData: ${sourceId} -> ${targetId}`);
      return;
    }

    links.push({
      source: sourceNode,
      target: targetNode,
      weight: weight || 0.3,
      origin: origin || 'co_activation',
    });

    console.log(`[addEdge] ${sourceId} -> ${targetId} (w=${weight}, ${origin})`);
    this.graph.graphData({ nodes, links });

    if (!werePreviouslyLinked) {
      this._snapNewConnection(sourceId, targetId);
    }
  }

  _schedulePendingEdgeFlush() {
    if (this._pendingEdgeTimer) return;
    this._pendingEdgeTimer = setTimeout(() => {
      this._pendingEdgeTimer = null;
      const still = [];
      for (const pe of (this._pendingEdges || [])) {
        if (this.nodeMap.has(pe.sourceId) && this.nodeMap.has(pe.targetId)) {
          this.addEdge(pe.sourceId, pe.targetId, pe.weight, pe.origin);
        } else if (pe.retries < 10) {
          pe.retries++;
          still.push(pe);
        } else {
          console.warn(`[addEdge] gave up: ${pe.sourceId} -> ${pe.targetId}`);
        }
      }
      this._pendingEdges = still;
      if (still.length > 0) this._schedulePendingEdgeFlush();
    }, 500);
  }

  _snapNewConnection(sourceId, targetId) {
    // Reheat the simulation so the force pull is visible
    this.graph.d3ReheatSimulation();

    // Pulse both endpoint nodes
    this.pulseNode(sourceId);
    this.pulseNode(targetId);

    // Fire directional particles along the new edge for a few seconds
    const newLinkPair = new Set([sourceId, targetId]);
    this.graph
      .linkDirectionalParticles(l => {
        const src = typeof l.source === 'object' ? l.source.id : l.source;
        const tgt = typeof l.target === 'object' ? l.target.id : l.target;
        return newLinkPair.has(src) && newLinkPair.has(tgt) ? 6 : 0;
      })
      .linkDirectionalParticleColor(() => '#00e5ff')
      .linkDirectionalParticleWidth(2)
      .linkDirectionalParticleSpeed(0.02);

    // Turn off particles after 3s
    setTimeout(() => {
      if (this.graph) {
        this.graph.linkDirectionalParticles(0);
      }
    }, 3000);
  }

  updateEdge(sourceId, targetId, weight) {
    const { links } = this.graph.graphData();
    for (const l of links) {
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

  setAutoRotate(enabled, speed) {
    this._autoRotate = enabled;
    this._autoRotateSpeed = speed || 0.3;
  }
}
