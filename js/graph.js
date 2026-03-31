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

// How long (ms) before a "hot" edge fully desaturates to gray
const EDGE_DECAY_MS = 60000;
const EDGE_COLD_COLOR = { r: 0.3, g: 0.3, b: 0.3 };

// Parse hex color to {r, g, b} in 0-1 range
function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return { r: ((n >> 16) & 0xff) / 255, g: ((n >> 8) & 0xff) / 255, b: (n & 0xff) / 255 };
}

// Lerp between two {r,g,b} objects, return hex string
function lerpColor(a, b, t) {
  const r = Math.round((a.r + (b.r - a.r) * t) * 255);
  const g = Math.round((a.g + (b.g - a.g) * t) * 255);
  const bl = Math.round((a.b + (b.b - a.b) * t) * 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1)}`;
}

// Get edge color based on origin + recency
function edgeColor(link) {
  const baseHex = ORIGIN_COLORS[link.origin] || '#444444';
  if (!link._lastTouched) return lerpColor(hexToRgb(baseHex), EDGE_COLD_COLOR, 0.7);
  const age = Date.now() - link._lastTouched;
  const decay = Math.min(age / EDGE_DECAY_MS, 1); // 0 = just touched, 1 = fully cold
  return lerpColor(hexToRgb(baseHex), EDGE_COLD_COLOR, decay * 0.85);
}

// ---- Brain-topology region mapping ----
// Back (z-) = universal, Center (z=0) = self, Front (z+) = other/intimate (split L/R)

const REGION = {
  universal: { x: 0,   y: 0, z: -80 },
  self:      { x: 0,   y: 0, z: 0 },
  // other/intimate are assigned dynamically per identity → left or right hemisphere
};

const REGION_JITTER = 25; // random scatter within a region

// Deterministic hash of a string to a number
function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return h;
}

// Map to track which hemisphere each "other" identity is assigned to
const _hemisphereMap = new Map();
let _nextHemisphere = 0; // alternates 0 (left) / 1 (right)

function regionForScope(scope) {
  if (scope === 'self') return { ...REGION.self };
  if (scope === 'universal') return { ...REGION.universal };

  // other:X, intimate:X — extract the identity part
  const colonIdx = scope.indexOf(':');
  const identity = colonIdx >= 0 ? scope.substring(colonIdx + 1) : scope;

  if (!_hemisphereMap.has(identity)) {
    // Assign alternating hemispheres so they spread evenly
    _hemisphereMap.set(identity, _nextHemisphere);
    _nextHemisphere = 1 - _nextHemisphere;
  }

  const side = _hemisphereMap.get(identity) === 0 ? -1 : 1;
  return { x: side * 50, y: 0, z: 60 };
}

function jitteredRegion(scope) {
  const r = regionForScope(scope);
  r.x += (Math.random() - 0.5) * REGION_JITTER;
  r.y += (Math.random() - 0.5) * REGION_JITTER;
  r.z += (Math.random() - 0.5) * REGION_JITTER * 0.5;
  return r;
}

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

    // Reset hemisphere assignments for fresh layout
    _hemisphereMap.clear();
    _nextHemisphere = 0;

    for (const n of snapshot.nodes) {
      const pos = jitteredRegion(n.scope);
      const node = {
        id: n.id,
        label: n.content_preview,
        scope: n.scope,
        activationCount: n.activation_count,
        salience: n.salience,
        level: n.consolidation_level,
        // Seed position in brain region
        x: pos.x, y: pos.y, z: pos.z,
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
    // THREE sphere radius. Log scale with a cap so high-activation nodes
    // don't balloon into a giant blob.
    return Math.min(3, Math.max(0.5, Math.log2(activationCount + 1) * 0.8));
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

        // Pin indicator (diamond shape, visible when user-pinned)
        const pinGeo = new THREE.RingGeometry(size + 0.8, size + 1.1, 4);
        const pinMat = new THREE.MeshBasicMaterial({
          color: '#ff6600',
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
        });
        const pin = new THREE.Mesh(pinGeo, pinMat);
        pin.name = 'pinIndicator';
        pin.rotation.z = Math.PI / 4; // rotate to diamond
        group.add(pin);

        // Favorite star indicator
        if (self.favorites.has(node.id)) {
          const starGeo = new THREE.RingGeometry(size + 1.3, size + 1.6, 5);
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
      .linkColor(l => edgeColor(l))
      .linkOpacity(0.5)
      .linkDirectionalParticles(0)
      .onNodeClick(node => {
        this.selectedNode = node;
        if (this.onNodeSelect) this.onNodeSelect(node);
        this._updateSelectionVisuals();
      })
      .enableNodeDrag(true)
      .onNodeDragEnd(node => {
        // Pin the node where the user dropped it
        node.fx = node.x;
        node.fy = node.y;
        node.fz = node.z;
        node._userPinned = true;
        this._updatePinVisuals();
        // Refresh info panel if this node is selected
        if (this.selectedNode && this.selectedNode.id === node.id) {
          if (this.onNodeSelect) this.onNodeSelect(node);
        }
      })
      .warmupTicks(100)
      .cooldownTicks(200);

    // Camera position — close enough for the intro logo, far enough for a full brain
    this.graph.cameraPosition({ x: 0, y: 0, z: 200 });

    // Scale forces based on graph density so dense graphs don't collapse
    this._tuneForces();

    // Homing force — gentle pull toward brain region
    const HOMING_STRENGTH = 0.03;
    this.graph.d3Force('homing', (alpha) => {
      for (const node of this.graph.graphData().nodes) {
        // Skip pinned nodes (user-pinned or logo)
        if (node.fx !== undefined) continue;
        const home = regionForScope(node.scope);
        node.vx += (home.x - node.x) * HOMING_STRENGTH * alpha;
        node.vy += (home.y - node.y) * HOMING_STRENGTH * alpha;
        node.vz += (home.z - node.z) * HOMING_STRENGTH * alpha;
      }
    });

    // Start animation loop
    this._animate();
  }

  _tuneForces() {
    const data = this.graph.graphData();
    const nNodes = data.nodes.length;
    const nLinks = data.links.length;
    const density = nNodes > 0 ? nLinks / nNodes : 0;

    // Charge: base -80, ramp up for dense graphs
    const chargeStrength = -80 - (density * 8);
    const charge = this.graph.d3Force('charge');
    if (charge) {
      charge.strength(chargeStrength);
      charge.distanceMax(400);
    }

    // Link distance: stretch links apart in dense graphs
    const linkDist = 40 + (density * 3);
    const link = this.graph.d3Force('link');
    if (link) {
      link.distance(linkDist);
    }
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

  _updatePinVisuals() {
    for (const [id, node] of this.nodeMap) {
      if (!node._threeObj) continue;
      const pin = node._threeObj.getObjectByName('pinIndicator');
      if (pin) {
        pin.material.opacity = node._userPinned ? 0.7 : 0;
      }
    }
  }

  unpinNode(nodeId) {
    const node = this.nodeMap.get(nodeId);
    if (!node) return;
    node.fx = undefined;
    node.fy = undefined;
    node.fz = undefined;
    node._userPinned = false;
    this._updatePinVisuals();
    // Reheat so the node finds its natural position
    if (this.graph) this.graph.d3ReheatSimulation();
  }

  togglePin(nodeId) {
    const node = this.nodeMap.get(nodeId);
    if (!node) return;
    if (node._userPinned) {
      this.unpinNode(nodeId);
    } else {
      node.fx = node.x;
      node.fy = node.y;
      node.fz = node.z;
      node._userPinned = true;
      this._updatePinVisuals();
    }
    return node._userPinned;
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

    // Refresh edge colors every ~2s so decay is visible
    this._edgeColorTick = (this._edgeColorTick || 0) + 1;
    if (this._edgeColorTick % 120 === 0) {
      this.graph.linkColor(l => edgeColor(l));
    }

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

      // Spin pin indicator
      const pinInd = node._threeObj.getObjectByName('pinIndicator');
      if (pinInd && pinInd.material.opacity > 0) {
        pinInd.rotation.z += 0.015;
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

  // Spread activation glow along edges connected to a node
  pulseEdges(nodeId) {
    if (!this.graph) return;
    this.graph
      .linkDirectionalParticles(l => {
        const src = typeof l.source === 'object' ? l.source.id : l.source;
        const tgt = typeof l.target === 'object' ? l.target.id : l.target;
        return (src === nodeId || tgt === nodeId) ? 3 : 0;
      })
      .linkDirectionalParticleColor(() => '#ffffff')
      .linkDirectionalParticleWidth(1.5)
      .linkDirectionalParticleSpeed(0.015);

    setTimeout(() => {
      if (this.graph) this.graph.linkDirectionalParticles(0);
    }, 1500);
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
    if (nodeData.fx !== undefined) {
      node.fx = nodeData.fx;
      node.fy = nodeData.fy;
      node.fz = nodeData.fz;
    } else {
      // Seed position in brain region
      const pos = jitteredRegion(nodeData.scope);
      node.x = pos.x;
      node.y = pos.y;
      node.z = pos.z;
    }

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
      _lastTouched: Date.now(),
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
        l._lastTouched = Date.now();
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
