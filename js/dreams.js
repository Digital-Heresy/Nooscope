/**
 * Nooscope Dream Viewer — Morpheus storyboard browser.
 * REST client for PF's Morpheus API endpoints.
 */

const SCION_PRESETS = NOOSCOPE_CONFIG.scions;
const TOKEN_PREFIX = 'morpheus_token_';

// ---- State ----
const DreamState = {
  pfBaseUrl: null,
  token: null,
  scionName: null,      // current scion name for per-scion token storage
  dreams: [],
  selectedDreamId: null,
  selectedDream: null,
  dreamCache: new Map(), // dreamId → { dream, fullyRendered }
  _authPromptActive: false, // prevent 401 re-prompt loop
  renderPollTimer: null,
  renderPollStart: 0,
  isConnected: false,
  credits: null,        // { credits, cost_per_credit_usd }
};

function tokenKey() {
  return TOKEN_PREFIX + (DreamState.scionName || 'default');
}

function loadToken() {
  DreamState.token = localStorage.getItem(tokenKey());
}

function saveToken(token) {
  DreamState.token = token;
  localStorage.setItem(tokenKey(), token);
}

function clearToken() {
  DreamState.token = null;
  localStorage.removeItem(tokenKey());
}

// ---- Init ----
document.addEventListener('DOMContentLoaded', () => {

  // Populate scion dropdown
  const scionSelect = document.getElementById('scion-select');
  const customOpt = scionSelect.querySelector('option[value="custom"]');
  for (const [name, cfg] of Object.entries(SCION_PRESETS)) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = `${name.charAt(0).toUpperCase() + name.slice(1)} (${cfg.pf || cfg.host || '?'})`;
    scionSelect.insertBefore(opt, customOpt);
  }
  scionSelect.value = Object.keys(SCION_PRESETS)[0] || 'custom';

  // Wire events
  document.getElementById('connect-btn').addEventListener('click', onConnect);
  document.getElementById('scion-select').addEventListener('change', onScionChange);
  document.getElementById('custom-connect-btn').addEventListener('click', onCustomConnect);
  document.getElementById('refresh-btn').addEventListener('click', () => {
    const btn = document.getElementById('refresh-btn');
    btn.classList.add('spinning');
    fetchDreamList().finally(() => btn.classList.remove('spinning'));
  });
  document.getElementById('token-save-btn').addEventListener('click', onTokenSave);
  document.getElementById('token-dialog-close').addEventListener('click', closeTokenDialog);
  document.getElementById('token-dialog').addEventListener('click', (e) => {
    if (e.target.id === 'token-dialog') closeTokenDialog();
  });

  // Cleanup blob URLs on page unload


  // Check URL params
  const params = new URLSearchParams(window.location.search);
  const scionParam = params.get('scion');
  if (scionParam && SCION_PRESETS[scionParam]) {
    scionSelect.value = scionParam;
    connectToScion(SCION_PRESETS[scionParam], scionParam);
  }
});

// ---- Connection ----

function buildPfBaseUrl(scionConfig) {
  if (scionConfig.host) {
    // Production: use proxy path prefix (e.g. /speaker/morpheus/)
    const protocol = location.protocol;
    const base = `${protocol}//${scionConfig.host}`;
    return scionConfig.pfPrefix ? `${base}${scionConfig.pfPrefix}` : base;
  }
  // If served over HTTP (Docker/nginx), use same-origin proxy paths to avoid CORS
  if (DreamState.scionName && (location.protocol === 'http:' || location.protocol === 'https:')) {
    return `${location.origin}/${DreamState.scionName}`;
  }
  // file:// fallback — direct port access
  return `http://localhost:${scionConfig.pf}`;
}

function connectToScion(scionConfig, scionName) {
  DreamState.scionName = scionName || 'custom';
  DreamState.pfBaseUrl = buildPfBaseUrl(scionConfig);
  DreamState._authPromptActive = false;
  loadToken();

  if (!DreamState.token) {
    showTokenDialog();
    return;
  }

  setPfStatus('connected');
  setConnectedState(true);
  fetchDreamList();
  fetchCredits();
}

function disconnectAll() {
  DreamState.isConnected = false;
  DreamState.pfBaseUrl = null;
  DreamState.dreams = [];
  DreamState.selectedDreamId = null;
  DreamState.selectedDream = null;
  DreamState.credits = null;
  DreamState.dreamCache.clear();
  stopRenderPoll();
  setPfStatus('disconnected');
  setConnectedState(false);
  updateDreamCount(null);

  // Clear UI
  document.getElementById('dream-list').innerHTML = '';
  document.getElementById('detail-header').classList.add('hidden');
  document.getElementById('detail-header').innerHTML = '';
  document.getElementById('storyboard-strip').classList.add('hidden');
  document.getElementById('storyboard-strip').innerHTML = '';
  document.getElementById('dream-meta').classList.add('hidden');
  document.getElementById('dream-meta').innerHTML = '';
  document.getElementById('detail-empty').innerHTML = '<p>Select a dream from the timeline</p>';
  document.getElementById('detail-empty').classList.remove('hidden');
  document.getElementById('credits-display').classList.add('hidden');
}

function setConnectedState(connected) {
  DreamState.isConnected = connected;
  const btn = document.getElementById('connect-btn');
  btn.textContent = connected ? 'Disconnect' : 'Connect';
  btn.style.background = connected ? 'var(--status-disconnected)' : '';
  document.getElementById('scion-select').disabled = connected;
}

function onConnect() {
  if (DreamState.isConnected) {
    disconnectAll();
    return;
  }
  const val = document.getElementById('scion-select').value;
  if (val === 'custom') {
    document.getElementById('custom-dialog').classList.remove('hidden');
    return;
  }
  const preset = SCION_PRESETS[val];
  if (preset) connectToScion(preset, val);
}

function onScionChange() {
  const val = document.getElementById('scion-select').value;
  const dialog = document.getElementById('custom-dialog');
  if (val === 'custom') {
    dialog.classList.remove('hidden');
  } else {
    dialog.classList.add('hidden');
  }
}

function onCustomConnect() {
  const pfPort = parseInt(document.getElementById('custom-pf').value);
  const token = document.getElementById('custom-token').value.trim();
  document.getElementById('custom-dialog').classList.add('hidden');

  DreamState.scionName = 'custom';
  if (token) {
    saveToken(token);
  }

  connectToScion({ pf: pfPort }, 'custom');
}

// ---- Token dialog ----

function showTokenDialog() {
  document.getElementById('token-dialog').classList.remove('hidden');
  document.getElementById('token-input').focus();
}

function closeTokenDialog() {
  document.getElementById('token-dialog').classList.add('hidden');
}

function onTokenSave() {
  const token = document.getElementById('token-input').value.trim();
  if (!token) return;

  saveToken(token);
  DreamState._authPromptActive = false;
  document.getElementById('token-input').value = '';
  closeTokenDialog();

  if (DreamState.pfBaseUrl) {
    setPfStatus('connected');
    setConnectedState(true);
    fetchDreamList();
    fetchCredits();
  }
}

// ---- API ----

async function apiRequest(path, options = {}) {
  if (!DreamState.pfBaseUrl) throw new Error('Not connected');
  if (!DreamState.token) throw new Error('No token');

  const url = `${DreamState.pfBaseUrl}${path}`;
  const headers = {
    'Authorization': `Bearer ${DreamState.token}`,
    ...options.headers,
  };

  const resp = await fetch(url, { ...options, headers });

  if (resp.status === 401) {
    if (!DreamState._authPromptActive) {
      DreamState._authPromptActive = true;
      // Clear token from memory only — keep localStorage so reconnect can retry
      DreamState.token = null;
      setConnectedState(false);
      setPfStatus('disconnected');
      showTokenDialog();
    }
    throw new Error('Unauthorized — token expired or invalid');
  }

  if (resp.status === 409) {
    throw new Error('All panels already rendered — use Re-render to regenerate');
  }

  if (!resp.ok) {
    throw new Error(`API error: ${resp.status} ${resp.statusText}`);
  }

  return resp;
}

async function apiJson(path, options = {}) {
  const resp = await apiRequest(path, options);
  return resp.json();
}



// ---- Status ----

function setPfStatus(status) {
  const el = document.getElementById('pf-status');
  el.className = `status-indicator ${status}`;
}

function updateDreamCount(count) {
  document.getElementById('dream-count').textContent =
    count !== null ? `${count} dream${count !== 1 ? 's' : ''}` : '—';
}

// ---- Credits ----

async function fetchCredits() {
  try {
    const data = await apiJson('/morpheus/credits');
    DreamState.credits = data;
    renderCredits();
  } catch (err) {
    // Credits endpoint is optional — silently ignore 404
    if (!err.message?.includes('404')) {
      console.warn('[dreams] credits fetch failed:', err);
    }
  }
}

function renderCredits() {
  const el = document.getElementById('credits-display');
  if (!el || !DreamState.credits) return;
  const c = DreamState.credits;
  const usd = c.cost_per_credit_usd ? ` (~$${(c.credits * c.cost_per_credit_usd).toFixed(2)})` : '';
  el.textContent = `${c.credits} credits${usd}`;
  el.classList.remove('hidden');
}

function formatCost(credits) {
  if (credits == null) return '';
  const rounded = Math.round(credits * 100) / 100;
  const c = DreamState.credits;
  if (c && c.cost_per_credit_usd) {
    return `${rounded} cr (~$${(credits * c.cost_per_credit_usd).toFixed(4)})`;
  }
  return `${rounded} cr`;
}

// ---- Dream list ----

async function fetchDreamList() {
  try {
    const data = await apiJson('/morpheus/dreams?has_storyboard=true');
    DreamState.dreams = Array.isArray(data) ? data : (data.dreams || []);
    updateDreamCount(DreamState.dreams.length);
    renderDreamList();
  } catch (err) {
    console.error('[dreams] fetch list failed:', err);
    setPfStatus('disconnected');
    DreamState.isConnected = false;
    updateDreamCount(null);
  }
}

function renderDreamList() {
  const container = document.getElementById('dream-list');
  container.innerHTML = '';

  if (DreamState.dreams.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>No dreams yet</p></div>';
    return;
  }

  for (const dream of DreamState.dreams) {
    const entry = document.createElement('div');
    entry.className = 'dream-entry' +
      (dream.dream_id === DreamState.selectedDreamId ? ' selected' : '');
    entry.dataset.dreamId = dream.dream_id;

    const date = formatDate(dream.timestamp || dream.started_at);
    const duration = formatDuration(dream.duration_s);
    const panelCount = dream.storyboard_panels || dream.panel_count || 0;
    const hasStoryboard = panelCount > 0;
    const isRendered = dream.rendered_panels_count > 0 || dream.is_rendered || dream.rendered;

    entry.innerHTML = `
      <div class="dream-date">${date}</div>
      <div class="dream-stats">
        ${duration ? `<span class="dream-stat">${duration}</span>` : ''}
        ${dream.clusters_received || dream.clusters_triaged ? `<span class="dream-stat">${dream.clusters_received || dream.clusters_triaged} clusters</span>` : ''}
        ${dream.mutations_count || dream.mutations ? `<span class="dream-stat">${dream.mutations_count || dream.mutations} mutations</span>` : ''}
        ${dream.soul_proposals_count || dream.soul_proposals ? `<span class="dream-stat">${dream.soul_proposals_count || dream.soul_proposals} proposals</span>` : ''}
        ${panelCount ? `<span class="dream-stat">${panelCount} panels</span>` : ''}
        ${dream.render_model ? `<span class="dream-stat model">${dream.render_model}</span>` : ''}
        ${dream.render_cost_credits ? `<span class="dream-stat cost">${formatCost(dream.render_cost_credits)}</span>` : ''}
      </div>
      <div class="dream-indicators">
        <span class="indicator-dot ${hasStoryboard ? 'storyboard' : 'inactive'}" title="${hasStoryboard ? 'Has storyboard' : 'No storyboard'}"></span>
        <span class="indicator-dot ${isRendered ? 'rendered' : 'inactive'}" title="${isRendered ? 'Rendered' : 'Not rendered'}"></span>
      </div>
    `;

    entry.addEventListener('click', () => selectDream(dream.dream_id));
    container.appendChild(entry);
  }
}

// ---- Dream cache ----

function cacheDream(dreamId, dream) {
  const panels = dream.dream_storyboard?.panels || dream.storyboard?.panels || dream.panels || [];
  const renderedPanels = dream.rendered_panels || [];
  const fullyRendered = panels.length > 0 && panels.every((p, i) => {
    const rp = renderedPanels.find(r => r.index === i) || renderedPanels[i];
    return rp && rp.image_b64 && !rp.error;
  });
  DreamState.dreamCache.set(dreamId, { dream, fullyRendered });
}

function invalidateCache(dreamId) {
  DreamState.dreamCache.delete(dreamId);
}

// ---- Dream detail ----

async function selectDream(dreamId) {
  DreamState.selectedDreamId = dreamId;
  stopRenderPoll();
  // Highlight in list
  document.querySelectorAll('.dream-entry').forEach(el => {
    el.classList.toggle('selected', el.dataset.dreamId === dreamId);
  });

  // Check cache — serve instantly if fully rendered
  const cached = DreamState.dreamCache.get(dreamId);
  if (cached && cached.fullyRendered) {
    DreamState.selectedDream = cached.dream;
    renderDreamDetail();
    return;
  }

  // Show loading state immediately
  document.getElementById('detail-empty').innerHTML = '<p>Loading details...</p>';
  document.getElementById('detail-empty').classList.remove('hidden');
  document.getElementById('detail-header').classList.add('hidden');
  document.getElementById('storyboard-strip').classList.add('hidden');
  document.getElementById('dream-meta').classList.add('hidden');

  try {
    const dream = await apiJson(`/morpheus/dreams/${dreamId}`);
    DreamState.selectedDream = dream;
    cacheDream(dreamId, dream);
    renderDreamDetail();
  } catch (err) {
    console.warn('[dreams] fetch detail failed, retrying...', err);
    // One automatic retry after a short delay
    try {
      await new Promise(r => setTimeout(r, 500));
      const dream = await apiJson(`/morpheus/dreams/${dreamId}`);
      DreamState.selectedDream = dream;
      cacheDream(dreamId, dream);
      renderDreamDetail();
    } catch (retryErr) {
      console.error('[dreams] fetch detail retry failed:', retryErr);
      document.getElementById('detail-empty').innerHTML = '<p>Failed to load dream — click to retry</p>';
    }
  }
}

function renderDreamDetail() {
  const dream = DreamState.selectedDream;
  if (!dream) return;

  // Hide empty state, show sections
  document.getElementById('detail-empty').classList.add('hidden');

  // Header
  const header = document.getElementById('detail-header');
  header.classList.remove('hidden');

  const date = formatDate(dream.timestamp || dream.started_at);
  const duration = formatDuration(dream.duration_s);
  const panels = dream.dream_storyboard?.panels || dream.storyboard?.panels || dream.panels || [];
  const renderedPanels = dream.rendered_panels || [];
  const allRendered = panels.length > 0 && panels.every((p, i) => {
    const rp = renderedPanels.find(r => r.index === i) || renderedPanels[i];
    return rp && rp.image_b64 && !rp.error;
  });
  const clusters = dream.clusters_received || dream.clusters_triaged;
  const mutations = dream.mutations_count || dream.mutations;
  const proposals = dream.soul_proposals_count || dream.soul_proposals;
  const styleSeed = dream.dream_storyboard?.style_seed || dream.style_seed;

  header.innerHTML = `
    <div class="detail-title">${date}${styleSeed ? ` — ${escapeHtml(styleSeed)}` : ''}</div>
    <div class="detail-stats">
      ${duration ? `<span class="detail-stat">Duration: <span class="value">${duration}</span></span>` : ''}
      ${clusters != null ? `<span class="detail-stat">Clusters: <span class="value">${clusters}</span></span>` : ''}
      ${mutations != null ? `<span class="detail-stat">Mutations: <span class="value">${mutations}</span></span>` : ''}
      ${proposals != null ? `<span class="detail-stat">Proposals: <span class="value">${proposals}</span></span>` : ''}
      ${panels.length ? `<span class="detail-stat">Panels: <span class="value">${panels.length}</span></span>` : ''}
      ${dream.render_model ? `<span class="detail-stat">Model: <span class="value">${dream.render_model}</span></span>` : ''}
      ${dream.render_cost_credits ? `<span class="detail-stat">Cost: <span class="value">${formatCost(dream.render_cost_credits)}</span></span>` : ''}
    </div>
    ${panels.length > 0 ? `
      <div class="detail-actions">
        <select id="render-model" class="render-model-select">
          <option value="klein" selected>Klein (fast)</option>
          <option value="pro">Pro (upscale)</option>
        </select>
        ${!allRendered
          ? `<button class="render-btn" id="render-btn">Render Storyboard</button>`
          : `<button class="render-btn rerender" id="rerender-btn">Re-render</button>`
        }
        <div class="render-progress hidden" id="render-progress">
          <div class="render-progress-bar" id="render-progress-bar"></div>
        </div>
      </div>
    ` : ''}
  `;

  // Wire render buttons
  const renderBtn = document.getElementById('render-btn');
  if (renderBtn) {
    renderBtn.addEventListener('click', () => triggerRender(dream.dream_id, false));
  }
  const rerenderBtn = document.getElementById('rerender-btn');
  if (rerenderBtn) {
    rerenderBtn.addEventListener('click', () => triggerRender(dream.dream_id, true));
  }

  // Storyboard
  const strip = document.getElementById('storyboard-strip');
  if (panels.length > 0) {
    strip.classList.remove('hidden');
    strip.innerHTML = '';

    panels.forEach((panel, i) => {
      // Cohesion note before panel (if present)
      const note = panel.scene_note || panel.cohesion_note;
      if (note && i > 0) {
        const noteEl = document.createElement('div');
        noteEl.className = 'cohesion-note';
        noteEl.textContent = note;
        strip.appendChild(noteEl);
      }

      const panelEl = document.createElement('div');
      panelEl.className = 'storyboard-panel';
      panelEl.dataset.panelIndex = i;

      const entryType = panel.entry_type || 'cluster';
      // Match storyboard panel with rendered panel by index
      const rp = renderedPanels.find(r => r.index === i) || renderedPanels[i];
      const isRendered = rp && rp.image_b64 && !rp.error;
      const isMissingImage = rp && !rp.image_b64 && !rp.error && rp.cost_credits;
      const panelCost = rp?.cost_credits;
      const wasFiltered = rp?.was_filtered;
      const panelError = rp?.error;

      panelEl.innerHTML = `
        <div class="panel-meta">
          <span class="entry-type-badge ${entryType}">${entryType}</span>
          ${panel.source_summary ? `<div class="panel-source">${escapeHtml(panel.source_summary)}</div>` : ''}
          ${panel.panel_prompt ? `
            <details class="panel-prompt-toggle">
              <summary>Prompt</summary>
              <div class="panel-prompt-text">${escapeHtml(panel.panel_prompt)}</div>
            </details>
          ` : ''}
          ${panelCost != null ? `<div class="panel-cost">${formatCost(panelCost)}</div>` : ''}
          ${wasFiltered ? '<div class="panel-filtered">Content filtered</div>' : ''}
          ${panelError ? `<div class="panel-filtered">${escapeHtml(panelError)}</div>` : ''}
          ${isMissingImage ? '<div class="panel-filtered">Charged but image missing — retry render</div>' : ''}
        </div>
        <div class="panel-visual">
          ${isRendered
            ? `<img class="panel-image" src="data:image/png;base64,${rp.image_b64}" alt="Panel ${i + 1}">`
            : `<div class="panel-placeholder">${panel.panel_prompt ? escapeHtml(panel.panel_prompt.substring(0, 200)) + '...' : 'No prompt'}</div>`
          }
        </div>
      `;

      strip.appendChild(panelEl);
    });
  } else {
    strip.classList.remove('hidden');
    strip.innerHTML = '<div class="empty-state" style="height:auto;padding:40px 0"><p>No storyboard for this dream cycle</p></div>';
  }

  // Meta section (reflection, triage)
  const meta = document.getElementById('dream-meta');
  const reflection = dream.reflections || dream.reflection || dream.storyboard?.reflection;
  const triage = dream.triage_summary || dream.triage;
  const cohesionNotes = dream.dream_storyboard?.cohesion_notes || dream.storyboard?.cohesion_notes || dream.cohesion_notes;

  if (reflection || triage || cohesionNotes) {
    meta.classList.remove('hidden');
    meta.innerHTML = '';

    if (cohesionNotes) {
      meta.innerHTML += `
        <div class="meta-section">
          <div class="meta-section-title">Cohesion Notes</div>
          <div class="meta-section-body">${escapeHtml(cohesionNotes)}</div>
        </div>
      `;
    }

    if (reflection) {
      meta.innerHTML += `
        <div class="meta-section">
          <div class="meta-section-title">Reflection</div>
          <div class="meta-section-body">${escapeHtml(reflection)}</div>
        </div>
      `;
    }

    if (triage && Array.isArray(triage)) {
      meta.innerHTML += `
        <div class="meta-section">
          <div class="meta-section-title">Triage Summary</div>
          ${triage.map(t => `
            <div class="triage-item">
              <span class="action">${escapeHtml(t.action || t.type || '?')}</span>
              ${escapeHtml(t.description || t.summary || '')}
            </div>
          `).join('')}
        </div>
      `;
    }
  } else {
    meta.classList.add('hidden');
    meta.innerHTML = '';
  }
}

// ---- Panel images ----
// Images are rendered inline as base64 data URIs from rendered_panels[].image_b64.
// No blob URLs or separate panel endpoint needed.

// ---- Render trigger ----

async function triggerRender(dreamId, force = false) {
  const btn = document.getElementById('render-btn') || document.getElementById('rerender-btn');
  const modelSelect = document.getElementById('render-model');
  const model = modelSelect ? modelSelect.value : 'klein';

  if (btn) {
    btn.disabled = true;
    btn.textContent = force ? 'Re-rendering...' : 'Rendering...';
  }

  // Show progress immediately — the POST may block for the full render duration
  const progressEl = document.getElementById('render-progress');
  if (progressEl) progressEl.classList.remove('hidden');
  document.querySelectorAll('.panel-placeholder').forEach(el => el.classList.add('loading'));

  const body = { model };
  if (force) body.force = true;

  try {
    const result = await apiJson(`/morpheus/dreams/${dreamId}/render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (result.cost_credits != null) {
      console.log(`[dreams] render complete — cost: ${formatCost(result.cost_credits)}`);
    }
    // Render is done — invalidate cache and refresh
    invalidateCache(dreamId);
    fetchCredits();
    const dream = await apiJson(`/morpheus/dreams/${dreamId}`);
    DreamState.selectedDream = dream;
    renderDreamDetail();
    fetchDreamList(); // Refresh list to show updated cost/model
  } catch (err) {
    console.error('[dreams] render trigger failed:', err);
    if (btn) {
      btn.disabled = false;
      btn.textContent = force ? 'Re-render' : 'Render Storyboard';
    }
    const pg = document.getElementById('render-progress');
    if (pg) pg.classList.add('hidden');
    document.querySelectorAll('.panel-placeholder.loading').forEach(el => el.classList.remove('loading'));
  }
}

function stopRenderPoll() {
  if (DreamState.renderPollTimer) {
    clearTimeout(DreamState.renderPollTimer);
    DreamState.renderPollTimer = null;
  }

  const progressEl = document.getElementById('render-progress');
  if (progressEl) progressEl.classList.add('hidden');

  document.querySelectorAll('.panel-placeholder.loading').forEach(el => el.classList.remove('loading'));

  const btn = document.getElementById('render-btn');
  if (btn) {
    btn.disabled = false;
    btn.textContent = 'Render Storyboard';
  }
}

// ---- Helpers ----

function formatDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatDuration(seconds) {
  if (!seconds) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}
