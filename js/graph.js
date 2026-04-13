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

// Get edge color based on origin + recency.
// Recall wavefront overrides with cyan while _recallHighlightUntil is in the future.
function edgeColor(link) {
  const now = Date.now();
  if (link._recallHighlightUntil && link._recallHighlightUntil > now) {
    return '#00e5ff';
  }
  const baseHex = ORIGIN_COLORS[link.origin] || '#444444';
  if (!link._lastTouched) return lerpColor(hexToRgb(baseHex), EDGE_COLD_COLOR, 0.7);
  const age = now - link._lastTouched;
  const decay = Math.min(age / EDGE_DECAY_MS, 1); // 0 = just touched, 1 = fully cold
  return lerpColor(hexToRgb(baseHex), EDGE_COLD_COLOR, decay * 0.85);
}

// ---- Brain-topology region mapping ----
// Layered geometry: scope → region center, consolidation_level → shell depth,
// salience → prominence within shell. Creates cortex-like structure.
//
// Back (z-) = universal, Center (z=0) = self, Front (z+) = other/intimate (split L/R)
// Outer shell = episodic (level 0), mid = cluster (level 1), core = abstract (level 2)

const RegionGeometry = {
  // Multi-region layout — nodes round-robin across pockets inside the brain mesh.
  // Brain mesh: scale 25, offset (0, 5, -10). Interior bounds: x ±40, y [-30,45], z [-65,45]
  //
  // Universal: 2 small regions (1 per hemi), occipital (back)
  // Self: 4 medium regions (2 per hemi), parietal (top)
  // Other/intimate: 6 regions (3 per hemi), along hemisphere channels

  regions: {
    universal: [
      { x: -15, y: 15, z: -55 },   // left occipital
      { x:  15, y: 15, z: -55 },   // right occipital
    ],
    self: [
      { x: -15, y: 45, z:   5 },   // left parietal front
      { x:  15, y: 45, z:   5 },   // right parietal front
      { x: -15, y: 45, z: -25 },   // left parietal rear
      { x:  15, y: 45, z: -25 },   // right parietal rear
    ],
    other: [
      { x: -28, y: 15, z:  25 },   // left hemi front
      { x:  28, y: 15, z:  25 },   // right hemi front
      { x: -32, y: 15, z:  -5 },   // left hemi mid
      { x:  32, y: 15, z:  -5 },   // right hemi mid
      { x: -28, y: 15, z: -35 },   // left hemi rear
      { x:  28, y: 15, z: -35 },   // right hemi rear
      { x: -25, y: -5, z: -35 },   // left hemi rear-low (temporal sag)
      { x:  25, y: -5, z: -35 },   // right hemi rear-low (temporal sag)
    ],
  },

  // Shell radii per consolidation level [episodic, cluster, abstract]
  shellRadii: {
    universal: [8, 5, 3],
    self:      [10, 6, 3],
    other:     [10, 6, 3],
  },

  // Round-robin counters per scope type
  _counters: { universal: 0, self: 0, other: 0 },

  // Node-to-region assignment (nodeId → region index) for stable homing
  _nodeRegions: new Map(),

  reset() {
    this._counters = { universal: 0, self: 0, other: 0 };
    this._nodeRegions.clear();
  },

  // Resolve scope to region type key
  _scopeType(scope) {
    if (scope === 'universal') return 'universal';
    if (scope === 'self') return 'self';
    return 'other';  // other:*, intimate:*
  },

  // Assign a node to its next round-robin region, or return existing assignment
  _assignRegion(nodeId, scope) {
    if (this._nodeRegions.has(nodeId)) return this._nodeRegions.get(nodeId);
    const type = this._scopeType(scope);
    const regions = this.regions[type];
    const idx = this._counters[type] % regions.length;
    this._counters[type]++;
    const assignment = { type, idx };
    this._nodeRegions.set(nodeId, assignment);
    return assignment;
  },

  // Get the center point for a node's assigned region
  regionCenter(scope, nodeId) {
    if (nodeId) {
      const assignment = this._assignRegion(nodeId, scope);
      const center = this.regions[assignment.type][assignment.idx];
      return { ...center };
    }
    // Fallback: return first region center for this scope type
    const type = this._scopeType(scope);
    return { ...this.regions[type][0] };
  },

  // Target position for homing force
  homePosition(scope, level, nodeId) {
    const center = this.regionCenter(scope, nodeId);
    const type = this._scopeType(scope);
    const radii = this.shellRadii[type];
    const radius = radii[Math.min(level || 0, 2)];
    // Home target is the region center offset slightly by level
    return {
      x: center.x,
      y: center.y + radius * 0.2,
      z: center.z,
    };
  },

  // Seed position for initial node placement: scattered within region pocket
  seedPosition(scope, level, salience, nodeId) {
    const center = this.regionCenter(scope, nodeId);
    const type = this._scopeType(scope);
    const radii = this.shellRadii[type];
    const outerRadius = radii[Math.min(level || 0, 2)];

    // Salience shifts within the shell band: high salience = tighter to center
    const salFactor = 1 - (salience || 0.5) * 0.3;
    const radius = outerRadius * salFactor;

    // Random point on sphere surface at this radius from region center
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    return {
      x: center.x + radius * Math.sin(phi) * Math.cos(theta),
      y: center.y + radius * Math.sin(phi) * Math.sin(theta),
      z: center.z + radius * Math.cos(phi),
    };
  },
};

// ---- Minimal OBJ parser ----
// Parses OBJ text with named objects into an array of { name, geometry }
// Only handles `v`, `f`, and `o` lines (no normals, UVs, or materials)
function parseOBJ(text) {
  const globalVerts = [];
  const objects = [];
  let current = null;

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed[0] === '#') continue;

    if (trimmed.startsWith('v ')) {
      const parts = trimmed.split(/\s+/);
      globalVerts.push(parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3]));
    } else if (trimmed.startsWith('o ')) {
      current = { name: trimmed.substring(2).trim(), indices: [] };
      objects.push(current);
    } else if (trimmed.startsWith('f ')) {
      if (!current) { current = { name: 'default', indices: [] }; objects.push(current); }
      const parts = trimmed.split(/\s+/).slice(1);
      // Fan-triangulate for quads+
      const verts = parts.map(p => parseInt(p.split('/')[0]) - 1);
      for (let i = 1; i < verts.length - 1; i++) {
        current.indices.push(verts[0], verts[i], verts[i + 1]);
      }
    }
  }

  return objects.map(obj => {
    const positions = new Float32Array(globalVerts);
    const indices = new Uint16Array(obj.indices);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.computeVertexNormals();
    return { name: obj.name, geometry };
  });
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
    this._brainGroup = null;    // THREE.Group for brain wireframe overlay
    this._brainVisible = true;
    this._nerveLeft = null;     // Solid sphere at left eye center
    this._nerveRight = null;    // Solid sphere at right eye center
    this._nerveScale = 0;       // Current pulse scale (0 = resting, 1 = max)
    this._vitalDot = null;      // Brainstem sentinel — backup_completed
    this._vitalScale = 0;
    this._socialCreated = null;  // Frontal left (blue hemi) — session_created
    this._socialCreatedScale = 0;
    this._socialExpired = null;  // Frontal right (pink hemi) — session_expired
    this._socialExpiredScale = 0;
    this._recallDot = null;      // Temporal seam forward — recall_fired, memory_promoted
    this._recallScale = 0;
    this._formationDot = null;   // Temporal seam rearward — memory_formed, working_memory_updated
    this._formationScale = 0;
    this._circadianDot = null;   // Thalamus — dream events
    this._circadianScale = 0;
    // Ambient session halo — brain-shaped additive glow (one mesh per
    // hemisphere, built from the brain OBJ geometry) lit while the scion
    // is cognitively active. Driven by an "active until" timestamp that
    // any PF event extends; session_expired hard-kills it.
    this._ambientHaloMeshes = [];
    this._ambientActiveUntil = 0;   // epoch ms — halo lit while now < this
    this._ambientCurrentOpacity = 0;
    this._ambientPhase = 0;
    this._sentinelRaycaster = new THREE.Raycaster();
    this._sentinelMouse = new THREE.Vector2();
    this.onSentinelSelect = null; // callback for sentinel clicks

    // Causal tracer system — comet trails between PF sentinels
    this._lastSentinelName = null;
    this._lastSentinelTime = 0;
    this._tracers = [];  // { line, dot, startPos, endPos, progress, fadeOut }

    // Sentinel metadata — keyed by mesh name
    this._sentinelMeta = {
      'nerve-left':      { label: 'Left Eye (I/O)', category: 'Input + Agency', region: 'Eyes', events: ['message_received', 'pi_text_delta', 'pi_tool_result', 'action_completed'], description: 'All external I/O — inbound messages, Pi streaming output, tool calls, and action completions. The eyes see everything.' },
      'nerve-right':     { label: 'Right Eye (I/O)', category: 'Input + Agency', region: 'Eyes', events: ['message_received', 'pi_text_delta', 'pi_tool_result', 'action_completed'], description: 'All external I/O — inbound messages, Pi streaming output, tool calls, and action completions. The eyes see everything.' },
      'vital':           { label: 'Brainstem (Vital)', category: 'Vital', region: 'Brainstem', events: ['backup_completed', 'cron_fired'], description: 'Autonomic maintenance — housekeeping and scheduled tasks. Pulses on backups and cron jobs.' },
      'social-created':  { label: 'Session Open (Social)', category: 'Social', region: 'Frontal Lobe (L)', events: ['session_created'], description: 'A new conversation session has started. The brain is engaging with the world.' },
      'social-expired':  { label: 'Session Close (Social)', category: 'Social', region: 'Frontal Lobe (R)', events: ['session_expired'], description: 'A conversation session has ended. The brain is disengaging.' },
      'recall':          { label: 'Recall', category: 'Recall', region: 'Temporal Lobe', events: ['recall_fired', 'memory_promoted'], description: 'Memory retrieval — the brain searching and finding existing traces. Fires on every query.' },
      'formation':       { label: 'Formation', category: 'Formation', region: 'Temporal Lobe', events: ['memory_formed', 'working_memory_updated'], description: 'Memory encoding — new memories crystallizing into the graph. Working memory buffer updates.' },
      'circadian':       { label: 'Circadian', category: 'Circadian', region: 'Thalamus', events: ['dream_started', 'dream_completed', 'dream_storyboard_ready'], description: 'Sleep/wake rhythm — dream cycles and consolidation. The gatekeeper between waking and sleeping states.' },
    };
  }

  initFromSnapshot(snapshot) {
    const nodes = [];
    const rawLinks = [];
    this.nodeMap.clear();

    // Reset hemisphere assignments for fresh layout
    RegionGeometry.reset();

    // Pass 1: build all nodes
    for (const n of snapshot.nodes) {
      const pos = RegionGeometry.seedPosition(n.scope, n.consolidation_level, n.salience, n.id);
      const node = {
        id: n.id,
        label: n.content_preview || n.id.substring(0, 12) + '...',
        scope: n.scope,
        activationCount: n.activation_count,
        salience: n.salience,
        level: n.consolidation_level,
        x: pos.x, y: pos.y, z: pos.z,
        _pulseUntil: 0,
        _baseSize: this._nodeSize(n.activation_count),
      };
      nodes.push(node);
      this.nodeMap.set(n.id, node);

      for (const e of n.edges) {
        rawLinks.push({
          source: n.id,
          target: e.target_id,
          weight: e.weight,
          origin: e.origin,
        });
      }
    }

    // Pass 2: filter out edges with missing endpoints
    const links = rawLinks.filter(l => this.nodeMap.has(l.source) && this.nodeMap.has(l.target));
    if (links.length < rawLinks.length) {
      console.warn(`[snapshot] dropped ${rawLinks.length - links.length} edges with missing endpoints`);
    }

    this.graphData = { nodes, links };
    this._render();
  }

  _nodeSize(activationCount) {
    // THREE sphere radius. Log scale with a cap so high-activation nodes
    // don't balloon into a giant blob.
    return Math.min(1.5, Math.max(0.3, Math.log2(activationCount + 1) * 0.4));
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
      .linkWidth(l => Math.max(0.1, l.weight * 1.0))
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

    // Homing force — pull toward assigned region pocket (stronger for blue/other)
    const HOMING_BASE = 0.25;
    const HOMING_OTHER = 0.40;
    this.graph.d3Force('homing', (alpha) => {
      for (const node of this.graph.graphData().nodes) {
        if (node.fx !== undefined) continue;
        const home = RegionGeometry.homePosition(node.scope, node.level || 0, node.id);
        const strength = (node.scope.startsWith('other:') || node.scope.startsWith('intimate:'))
          ? HOMING_OTHER : HOMING_BASE;
        node.vx += (home.x - node.x) * strength * alpha;
        node.vy += (home.y - node.y) * strength * alpha;
        node.vz += (home.z - node.z) * strength * alpha;
      }
    });

    // Fishbowl containment — brain hull as ellipsoid boundary
    // Brain mesh world bounds: center (0, 5, -10), half-extents (~50, 45, 65)
    // Shrink slightly so nodes stay inside the wireframe, not on it
    const HULL_CENTER = { x: 0, y: 5, z: -10 };
    const HULL_RADII = { x: 45, y: 40, z: 60 };
    const HULL_PUSH = 0.5;  // how hard to push back when outside

    this.graph.d3Force('containment', (alpha) => {
      for (const node of this.graph.graphData().nodes) {
        if (node.fx !== undefined) continue;
        // Normalized distance from hull center (>1 = outside ellipsoid)
        const dx = (node.x - HULL_CENTER.x) / HULL_RADII.x;
        const dy = (node.y - HULL_CENTER.y) / HULL_RADII.y;
        const dz = (node.z - HULL_CENTER.z) / HULL_RADII.z;
        const dist = dx * dx + dy * dy + dz * dz;
        if (dist > 1) {
          // Push back toward center proportional to how far outside
          const overshoot = Math.sqrt(dist) - 1;
          const push = HULL_PUSH * overshoot * alpha;
          node.vx -= dx * push * HULL_RADII.x;
          node.vy -= dy * push * HULL_RADII.y;
          node.vz -= dz * push * HULL_RADII.z;
        }
      }
    });

    // Sentinel click handler — raycasts against PF dots before force-graph handles it
    this.container.addEventListener('click', (e) => this._onSentinelClick(e));

    // Start animation loop
    this._animate();

    // Load brain wireframe overlay
    this._addBrainOverlay();
  }

  _getSentinelMeshes() {
    return [this._nerveLeft, this._nerveRight, this._vitalDot,
            this._socialCreated, this._socialExpired,
            this._recallDot, this._formationDot,
            this._circadianDot].filter(Boolean);
  }

  _onSentinelClick(e) {
    if (!this._brainGroup || !this._brainVisible) return;
    const rect = this.container.getBoundingClientRect();
    this._sentinelMouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this._sentinelMouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this._sentinelRaycaster.setFromCamera(this._sentinelMouse, this.graph.camera());

    const meshes = this._getSentinelMeshes();
    // Sentinel meshes are children of brainGroup which has scale/offset,
    // so we need to raycast against them in world space
    const intersects = this._sentinelRaycaster.intersectObjects(meshes, false);
    if (intersects.length > 0) {
      const name = intersects[0].object.name;
      const meta = this._sentinelMeta[name];
      if (meta && this.onSentinelSelect) {
        this.onSentinelSelect(meta);
      }
    }
  }

  _addBrainOverlay() {
    // Remove previous brain if re-rendering
    if (this._brainGroup) {
      this.graph.scene().remove(this._brainGroup);
      this._brainGroup = null;
    }

    fetch('models/brain.obj')
      .then(r => r.text())
      .then(text => {
        if (!this.graph) return;
        const objects = parseOBJ(text);
        const group = new THREE.Group();

        // Brain mesh bounds: x[-2.07, 2.09], y[-1.71, 2.09], z[-2.66, 2.67]
        // RegionGeometry bounds: x[-50, 50], y[~0], z[-80, 60]
        // Scale brain to fill the graph space
        // Brain z-span: 5.33 → Graph z-span: 140 → scale ~26
        // Use 25 for round numbers, then offset to align centers
        const BRAIN_SCALE = 25;
        // Brain center is ~(0, 0.19, 0.005) — nearly centered
        // Graph center is ~(0, 0, -10) — shifted back because universal is at z=-80
        // Offset brain so front (z+) maps to frontal (z=+60) and back (z-) to occipital (z=-80)
        // Brain front at z=2.67 * 25 = 66.75, back at z=-2.66 * 25 = -66.5
        // That's roughly [-67, 67] which maps well to [-80, 60] with a small z-offset
        const BRAIN_OFFSET = { x: 0, y: 5, z: -10 };

        this._ambientHaloMeshes = [];
        for (const obj of objects) {
          const isRightHemi = obj.name.includes('rh');
          const material = new THREE.MeshBasicMaterial({
            color: isRightHemi ? 0xff4a9e : 0x4a9eff,
            wireframe: true,
            transparent: true,
            opacity: 0.15,
            depthWrite: false,
          });
          const mesh = new THREE.Mesh(obj.geometry, material);
          group.add(mesh);

          // Ambient halo — share the exact brain geometry, solid additive
          // glow on the inside of a slightly inflated copy so the aura
          // traces the brain's actual silhouette. Dim off-white so additive
          // blending stays gentle over any background color.
          const haloMat = new THREE.MeshBasicMaterial({
            color: 0x666666,
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.BackSide,
          });
          const halo = new THREE.Mesh(obj.geometry, haloMat);
          halo.scale.set(1.05, 1.05, 1.05);
          group.add(halo);
          this._ambientHaloMeshes.push(halo);
        }

        // Eye fixtures (local coordinates — group.scale handles the rest)
        const eyeGeom = new THREE.SphereGeometry(0.28, 12, 8);

        const leftEyeMat = new THREE.MeshBasicMaterial({
          color: 0xff4a9e, wireframe: true, transparent: true, opacity: 0.3, depthWrite: false,
        });
        const leftEye = new THREE.Mesh(eyeGeom, leftEyeMat);
        leftEye.position.set(-0.7, -1.2, 2.5);
        leftEye.name = 'eye-left';
        group.add(leftEye);

        const rightEyeMat = new THREE.MeshBasicMaterial({
          color: 0x4a9eff, wireframe: true, transparent: true, opacity: 0.3, depthWrite: false,
        });
        const rightEye = new THREE.Mesh(eyeGeom, rightEyeMat);
        rightEye.position.set(0.7, -1.2, 2.5);
        rightEye.name = 'eye-right';
        group.add(rightEye);

        // Optic nerve lines
        const leftNerveMat = new THREE.LineBasicMaterial({ color: 0xff4a9e, transparent: true, opacity: 0.15 });
        const leftNerveGeom = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(-0.7, -1.2, 2.5),
          new THREE.Vector3(-0.3, -0.2, 1.2),
          new THREE.Vector3(-0.1, -0.1, 0.0),
        ]);
        group.add(new THREE.Line(leftNerveGeom, leftNerveMat));

        const rightNerveMat = new THREE.LineBasicMaterial({ color: 0x4a9eff, transparent: true, opacity: 0.15 });
        const rightNerveGeom = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(0.7, -1.2, 2.5),
          new THREE.Vector3(0.3, -0.2, 1.2),
          new THREE.Vector3(0.1, -0.1, 0.0),
        ]);
        group.add(new THREE.Line(rightNerveGeom, rightNerveMat));

        // ---- PF Sentinel dots ----
        // All PF dots are orange (0xff8c00). Unit sphere geometry, scaled dynamically.
        const PF_COLOR = 0xff8c00;
        const sentinelGeom = new THREE.SphereGeometry(1, 12, 8);
        const SENTINEL_REST = 0.06;

        function makeSentinel(name, pos) {
          const mat = new THREE.MeshBasicMaterial({
            color: PF_COLOR, transparent: true, opacity: 0.9,
          });
          const mesh = new THREE.Mesh(sentinelGeom, mat);
          mesh.position.set(pos.x, pos.y, pos.z);
          mesh.scale.setScalar(SENTINEL_REST);
          mesh.name = name;
          return mesh;
        }

        // Input — eye nerve dots (pulse on message_received)
        this._nerveLeft = makeSentinel('nerve-left', { x: -0.7, y: -1.2, z: 2.5 });
        group.add(this._nerveLeft);
        this._nerveRight = makeSentinel('nerve-right', { x: 0.7, y: -1.2, z: 2.5 });
        group.add(this._nerveRight);
        this._nerveScale = 0;

        // Vital — brainstem, rear-low midline (pulse on backup_completed)
        this._vitalDot = makeSentinel('vital', { x: 0, y: -1.3, z: -2.2 });
        group.add(this._vitalDot);
        this._vitalScale = 0;

        // Social — frontal lobe, split across hemispheres
        // session_created → blue (left) hemi side, front-upper
        this._socialCreated = makeSentinel('social-created', { x: -1.0, y: 0.8, z: 1.8 });
        group.add(this._socialCreated);
        this._socialCreatedScale = 0;
        // session_expired → pink (right) hemi side, front-upper (mirror)
        this._socialExpired = makeSentinel('social-expired', { x: 1.0, y: 0.8, z: 1.8 });
        group.add(this._socialExpired);
        this._socialExpiredScale = 0;

        // Recall — temporal seam, forward (pulse on recall_fired, memory_promoted)
        this._recallDot = makeSentinel('recall', { x: 0, y: -0.4, z: 0.8 });
        group.add(this._recallDot);
        this._recallScale = 0;

        // Formation — temporal seam, rearward (pulse on memory_formed, working_memory_updated)
        this._formationDot = makeSentinel('formation', { x: 0, y: -0.4, z: -0.3 });
        group.add(this._formationDot);
        this._formationScale = 0;

        // Circadian — thalamus, deep center near brainstem (pulse on dream events)
        this._circadianDot = makeSentinel('circadian', { x: 0, y: -0.8, z: -1.5 });
        group.add(this._circadianDot);
        this._circadianScale = 0;

        // Apply scale and offset
        group.scale.set(BRAIN_SCALE, BRAIN_SCALE, BRAIN_SCALE);
        group.position.set(BRAIN_OFFSET.x, BRAIN_OFFSET.y, BRAIN_OFFSET.z);

        group.visible = this._brainVisible;
        this._brainGroup = group;
        this.graph.scene().add(group);

        // Debug pockets disabled — enable by uncommenting
        // this._debugPockets = [];
        // const pocketColors = { universal: 0x4aff7f, self: 0xff4a9e, other: 0x4a9eff };
        // for (const [type, centers] of Object.entries(RegionGeometry.regions)) {
        //   const radius = RegionGeometry.shellRadii[type][0];
        //   for (const c of centers) {
        //     const geo = new THREE.SphereGeometry(radius, 12, 8);
        //     const mat = new THREE.MeshBasicMaterial({ color: pocketColors[type], wireframe: true, transparent: true, opacity: 0.15, depthWrite: false });
        //     const mesh = new THREE.Mesh(geo, mat);
        //     mesh.position.set(c.x, c.y, c.z);
        //     this.graph.scene().add(mesh);
        //     this._debugPockets.push(mesh);
        //   }
        // }
      })
      .catch(err => console.warn('[brain] Failed to load brain.obj:', err));
  }

  toggleBrain() {
    this._brainVisible = !this._brainVisible;
    if (this._brainGroup) {
      this._brainGroup.visible = this._brainVisible;
    }
    return this._brainVisible;
  }

  // ---- PF sentinel pulse methods ----
  // Each bumps a scale factor toward 1.0; decay in _animate() shrinks back.
  // Rapid events stack (multiple calls before decay finishes = bigger pulse).
  // _fireSentinel() handles both the pulse AND the causal tracer from the previous sentinel.

  // Fire one logical sentinel event. `meshes` may be a single THREE mesh or
  // an array (for mirrored sentinels like the eyes — both dots represent one
  // logical event and should share the causal tracer connections).
  _fireSentinel(name, meshes) {
    const meshArr = Array.isArray(meshes) ? meshes.filter(Boolean) : (meshes ? [meshes] : []);
    if (meshArr.length === 0) return;
    const now = Date.now();
    const CAUSAL_WINDOW = 4000; // ms — max gap to draw a tracer

    // Fire tracers from every previous-sentinel mesh to every new-sentinel
    // mesh (full cross product), so mirrored pairs both participate.
    if (this._lastSentinelMeshes && this._lastSentinelName !== name &&
        (now - this._lastSentinelTime) < CAUSAL_WINDOW && this._brainGroup) {
      for (const prev of this._lastSentinelMeshes) {
        for (const next of meshArr) {
          this._spawnTracer(prev, next);
        }
      }
    }

    this._lastSentinelName = name;
    this._lastSentinelMeshes = meshArr;
    this._lastSentinelTime = now;
  }

  _spawnTracer(fromMesh, toMesh) {
    if (!this._brainGroup || !this.graph) return;

    // Get world positions of the sentinel meshes
    const startPos = new THREE.Vector3();
    const endPos = new THREE.Vector3();
    fromMesh.getWorldPosition(startPos);
    toMesh.getWorldPosition(endPos);

    // Trail line — starts as a single point, grows as the dot moves
    const trailMat = new THREE.LineBasicMaterial({
      color: 0xff8c00, transparent: true, opacity: 0.8,
    });
    const trailGeom = new THREE.BufferGeometry();
    // Pre-allocate positions for 20 trail segments
    const positions = new Float32Array(20 * 3);
    trailGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    trailGeom.setDrawRange(0, 0);
    const line = new THREE.Line(trailGeom, trailMat);

    // Traveling dot
    const dotMat = new THREE.MeshBasicMaterial({
      color: 0xffcc00, transparent: true, opacity: 1.0,
    });
    const dot = new THREE.Mesh(new THREE.SphereGeometry(1.2, 8, 6), dotMat);
    dot.position.copy(startPos);

    this.graph.scene().add(line);
    this.graph.scene().add(dot);

    this._tracers.push({
      line, dot, trailMat, trailGeom, dotMat,
      startPos, endPos,
      progress: 0,    // 0→1: dot traveling. >1: dot arrived, trail fading
      fadeOut: 0,      // 0→1: trail fade after arrival
    });
  }

  pulseEyes() {
    this._nerveScale = Math.min(1.0, this._nerveScale + 0.35);
    this._fireSentinel('nerve', [this._nerveLeft, this._nerveRight]);
  }

  // Bump the "brain is awake" window. Any PF cognitive event calls this;
  // the halo stays lit until 90s after the last event.
  bumpAmbient() {
    this._ambientActiveUntil = Date.now() + 90000;
  }

  // Hard-kill the halo (session_expired → fade out immediately).
  killAmbient() {
    this._ambientActiveUntil = 0;
  }

  pulseVital() {
    this._vitalScale = Math.min(1.0, this._vitalScale + 0.5);
    this._fireSentinel('vital', this._vitalDot);
  }

  pulseSocialCreated() {
    this._socialCreatedScale = Math.min(1.0, this._socialCreatedScale + 0.4);
    this._fireSentinel('social-created', this._socialCreated);
  }

  pulseSocialExpired() {
    this._socialExpiredScale = Math.min(1.0, this._socialExpiredScale + 0.4);
    this._fireSentinel('social-expired', this._socialExpired);
  }

  pulseRecall() {
    this._recallScale = Math.min(1.0, this._recallScale + 0.25);
    this._fireSentinel('recall', this._recallDot);
  }

  pulseFormation() {
    this._formationScale = Math.min(1.0, this._formationScale + 0.3);
    this._fireSentinel('formation', this._formationDot);
  }

  pulseCircadian() {
    this._circadianScale = Math.min(1.0, this._circadianScale + 0.5);
    this._fireSentinel('circadian', this._circadianDot);
  }

  _tuneForces() {
    const data = this.graph.graphData();
    const nNodes = data.nodes.length;
    const nLinks = data.links.length;
    const density = nNodes > 0 ? nLinks / nNodes : 0;

    // Charge: gentle repulsion so nodes don't overlap, but weak enough that
    // homing force can hold them in their region pockets
    const chargeStrength = -8 - (density * 2);
    const charge = this.graph.d3Force('charge');
    if (charge) {
      charge.strength(chargeStrength);
      charge.distanceMax(25);  // only repel immediate neighbors
    }

    // Link distance: short to keep connected nodes close
    const linkDist = 5 + (density * 1.5);
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

    // PF sentinel dot decay — shrink all dots back toward resting size
    const SENTINEL_REST = 0.06;
    const SENTINEL_MAX = 0.28;
    const DECAY_RATE = 0.008; // per frame, ~0.48/s at 60fps — full decay in ~2s

    const decaySentinel = (mesh, scale) => {
      if (!mesh) return scale;
      if (scale > 0) scale = Math.max(0, scale - DECAY_RATE);
      const radius = SENTINEL_REST + (SENTINEL_MAX - SENTINEL_REST) * scale;
      mesh.scale.setScalar(radius);
      mesh.material.opacity = 0.5 + 0.5 * scale;
      return scale;
    };

    // Eyes (paired)
    this._nerveScale = decaySentinel(this._nerveLeft, this._nerveScale);
    decaySentinel(this._nerveRight, this._nerveScale);
    // Vital
    this._vitalScale = decaySentinel(this._vitalDot, this._vitalScale);
    // Social
    this._socialCreatedScale = decaySentinel(this._socialCreated, this._socialCreatedScale);
    this._socialExpiredScale = decaySentinel(this._socialExpired, this._socialExpiredScale);
    // Recall & Formation
    this._recallScale = decaySentinel(this._recallDot, this._recallScale);
    this._formationScale = decaySentinel(this._formationDot, this._formationScale);
    // Circadian
    this._circadianScale = decaySentinel(this._circadianDot, this._circadianScale);

    // Ambient session halo — target opacity from "active until" timestamp,
    // eased, modulated with a slow breathing pulse when active.
    if (this._ambientHaloMeshes.length > 0) {
      const EASE = 0.04;
      const target = (now < this._ambientActiveUntil) ? 0.12 : 0;
      this._ambientCurrentOpacity += (target - this._ambientCurrentOpacity) * EASE;
      this._ambientPhase = (this._ambientPhase + 0.012) % (Math.PI * 2);
      const breathe = 0.75 + 0.25 * Math.sin(this._ambientPhase); // 0.5..1.0
      const opacity = this._ambientCurrentOpacity * breathe;
      for (const m of this._ambientHaloMeshes) m.material.opacity = opacity;
    }

    // Causal tracers — animate comet trails between sentinels
    const TRACER_SPEED = 0.025;   // progress per frame (~1.5s travel at 60fps)
    const TRAIL_FADE_SPEED = 0.02; // fade per frame after arrival (~0.8s fade)
    const TRAIL_SEGMENTS = 20;

    for (let i = this._tracers.length - 1; i >= 0; i--) {
      const t = this._tracers[i];

      if (t.progress <= 1.0) {
        // Dot is traveling
        t.progress = Math.min(1.0, t.progress + TRACER_SPEED);

        // Move dot along the path
        t.dot.position.lerpVectors(t.startPos, t.endPos, t.progress);

        // Update trail: draw segments from start to current dot position
        const posAttr = t.trailGeom.getAttribute('position');
        const segCount = Math.min(TRAIL_SEGMENTS, Math.ceil(t.progress * TRAIL_SEGMENTS));
        for (let s = 0; s <= segCount; s++) {
          const frac = segCount > 0 ? (s / segCount) * t.progress : 0;
          const px = t.startPos.x + (t.endPos.x - t.startPos.x) * frac;
          const py = t.startPos.y + (t.endPos.y - t.startPos.y) * frac;
          const pz = t.startPos.z + (t.endPos.z - t.startPos.z) * frac;
          posAttr.setXYZ(s, px, py, pz);
        }
        posAttr.needsUpdate = true;
        t.trailGeom.setDrawRange(0, segCount + 1);

        // Dot pulses brighter as it travels
        t.dotMat.opacity = 0.7 + 0.3 * Math.sin(t.progress * Math.PI);

        if (t.progress >= 1.0) {
          // Dot arrived — start fading
          t.fadeOut = 0.01;
        }
      } else {
        // Trail fading out, dot shrinking
        t.fadeOut = Math.min(1.0, t.fadeOut + TRAIL_FADE_SPEED);
        t.trailMat.opacity = 0.8 * (1 - t.fadeOut);
        t.dotMat.opacity = 1.0 * (1 - t.fadeOut);
        t.dot.scale.setScalar(1 - t.fadeOut * 0.8);

        if (t.fadeOut >= 1.0) {
          // Cleanup
          this.graph.scene().remove(t.line);
          this.graph.scene().remove(t.dot);
          t.trailGeom.dispose();
          t.trailMat.dispose();
          t.dotMat.dispose();
          this._tracers.splice(i, 1);
        }
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
      label: nodeData.content_preview || nodeData.node_id.substring(0, 12) + '...',
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
      // Seed position in brain region (layered by consolidation level)
      const pos = RegionGeometry.seedPosition(nodeData.scope, nodeData.consolidation_level || 0, nodeData.salience, nodeData.node_id);
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

  // BFS-staggered recall: pulse propagates from the most-connected recalled
  // node outward through the subgraph induced by the recall set, one hop per
  // HOP_MS. Edges light cyan, nodes white-flash in layer order.
  highlightRecall(nodeIds) {
    if (!this.graph || !nodeIds || nodeIds.length === 0) return;

    const HOP_MS = 200;
    const EDGE_HIGHLIGHT_MS = 1500;

    const recallSet = new Set(nodeIds);
    const links = this.graph.graphData().links;

    // Build adjacency limited to the recall subgraph
    const adj = new Map(); // nodeId -> [{ other, link }]
    for (const id of nodeIds) adj.set(id, []);
    for (const l of links) {
      const src = typeof l.source === 'object' ? l.source.id : l.source;
      const tgt = typeof l.target === 'object' ? l.target.id : l.target;
      if (recallSet.has(src) && recallSet.has(tgt)) {
        adj.get(src).push({ other: tgt, link: l });
        adj.get(tgt).push({ other: src, link: l });
      }
    }

    // Root = most-connected node in the recall subgraph (ties → first)
    let root = nodeIds[0];
    let rootDeg = adj.get(root).length;
    for (const id of nodeIds) {
      const d = adj.get(id).length;
      if (d > rootDeg) { root = id; rootDeg = d; }
    }

    // BFS — nodeLayers[k] = nodes first reached at hop k;
    // edgeLayers[k] = edges traversed to reach layer k (empty for layer 0)
    const nodeLayers = [[root]];
    const edgeLayers = [[]];
    const visited = new Set([root]);
    let frontier = [root];
    while (frontier.length > 0) {
      const nextNodes = [];
      const nextEdges = [];
      for (const n of frontier) {
        for (const { other, link } of adj.get(n)) {
          if (!visited.has(other)) {
            visited.add(other);
            nextNodes.push(other);
            nextEdges.push(link);
          }
        }
      }
      if (nextNodes.length === 0) break;
      nodeLayers.push(nextNodes);
      edgeLayers.push(nextEdges);
      frontier = nextNodes;
    }

    // Any recalled nodes unreachable from root (disconnected subgraph)
    // still get pulsed in a final synthetic layer so nothing is dropped.
    const orphans = nodeIds.filter(id => !visited.has(id));
    if (orphans.length > 0) {
      nodeLayers.push(orphans);
      edgeLayers.push([]);
    }

    // Install a single particle accessor that reads per-link timestamps.
    // Re-invoking the setter on each hop forces 3d-force-graph to re-eval.
    const particleAccessor = (l) =>
      (l._recallHighlightUntil && l._recallHighlightUntil > Date.now()) ? 4 : 0;
    this.graph.linkDirectionalParticleColor(() => '#00e5ff');
    this.graph.linkDirectionalParticleWidth(1.5);
    this.graph.linkDirectionalParticles(particleAccessor);

    // Fire each layer on its stagger
    nodeLayers.forEach((nodes, layerIdx) => {
      setTimeout(() => {
        for (const id of nodes) this.pulseNode(id);
        const now = Date.now();
        for (const link of edgeLayers[layerIdx]) {
          link._recallHighlightUntil = now + EDGE_HIGHLIGHT_MS;
        }
        // Force re-evaluation of particle and color accessors
        if (this.graph) {
          this.graph.linkDirectionalParticles(particleAccessor);
          this.graph.linkColor(l => edgeColor(l));
        }
      }, layerIdx * HOP_MS);
    });

    // Clean up: clear particles once the final layer's highlight window lapses
    const totalMs = (nodeLayers.length - 1) * HOP_MS + EDGE_HIGHLIGHT_MS + 100;
    setTimeout(() => {
      if (!this.graph) return;
      this.graph.linkDirectionalParticles(0);
      this.graph.linkColor(l => edgeColor(l));
    }, totalMs);
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
