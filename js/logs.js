/**
 * Nooscope — Container Log Inspector (Nooscope-lginsp).
 *
 * Admin-only viewer for a single Scion's PersonaForge container logs. PF is
 * where most operational errors surface (uvicorn tracebacks, Morpheus render
 * failures, startup crashes), so this watches the `forge-<short>` container's
 * docker stdout/stderr rather than Engram or forge-web.
 *
 * Data path: the browser holds no token. It GETs
 *   /admin/scions/{scion_id}/logs?lines=N
 * which the existing nginx /admin/scions/ block admin-gates (nooscope_admin
 * cookie) and bearer-injects (FORGE_WEB_ADMIN_TOKEN) before proxying to
 * forge-web:8200, which tails `docker logs --tail N forge-<short>`. See the
 * handoff note in .beans/Nooscope-lginsp for the backend contract.
 *
 * Refresh model: snapshot GET on a timer (auto-poll), pausable. Each poll
 * replaces the buffer wholesale — at tail sizes of 50–500 lines this is cheap
 * and sidesteps the de-dup/cursor bookkeeping a streaming endpoint would need.
 * Level filtering (Full / Warnings / Errors) is purely client-side over the
 * fetched buffer, so flipping views never hits the network.
 */

// Scion roster (Nooscope-de9m). Mirror social.js: value = PF scion_id so the
// /admin/scions/{scionId}/... route keys correctly; `slug` kept for labels.
const LOG_SCIONS = Object.entries(NOOSCOPE_CONFIG.scions).map(([slug, cfg]) => ({
  slug,
  id: cfg.scionId || slug,
  name: cfg.name || (slug.charAt(0).toUpperCase() + slug.slice(1)),
  badge: cfg.badge,
}));

const POLL_INTERVAL_MS = 4000;
const DEFAULT_TAIL = 50;

// Level normalization. Docker log lines are raw text; the backend tags a
// `level` when it can parse one, but we re-derive defensively from the message
// when it's absent (older forge-web, or lines the parser couldn't classify).
// Ranked low→high so the Warnings/Errors tabs are simple threshold checks.
const LEVEL_RANK = { debug: 0, info: 1, notice: 1, warning: 2, warn: 2, error: 3, critical: 4, fatal: 4 };
const LEVEL_PATTERN = /\b(CRITICAL|FATAL|ERROR|WARNING|WARN|NOTICE|INFO|DEBUG)\b/;

// Tab → minimum rank shown. 'warn' shows warning and above; 'error' shows
// error and above; 'all' shows everything (including unclassified lines).
const TAB_MIN_RANK = { all: -1, warn: 2, error: 3 };

// --- State ---
const LogState = {
  scionId: null,
  lines: [],          // normalized [{ ts, level, rank, message }]
  tail: DEFAULT_TAIL,
  levelTab: 'all',
  textFilter: '',
  paused: false,
  pollTimer: null,
  inFlight: false,
  lastOk: null,       // Date of last successful fetch
};

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
  populateScionSelect();
  wireUI();
  NooscopeAuth.init();
  NooscopeAuth.onAdminStateChange(() => applyAdminGate());
  applyAdminGate();

  // Be a good citizen: don't poll a backgrounded tab.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopPolling();
    else if (!LogState.paused && isAdmin() && LogState.scionId) startPolling();
  });
});

function isAdmin() { return NooscopeAuth.isAdmin(); }

function populateScionSelect() {
  const select = document.getElementById('scion-select');
  select.innerHTML = '';
  for (const s of LOG_SCIONS) {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = scionOptionLabel(s);
    select.appendChild(opt);
  }
}

// Same badge-aware label shape used across app.js / dreams.js / social.js.
function scionOptionLabel(s) {
  const badge = s.badge;
  if (!badge || badge === 'live-online' || badge === 'live-sleeping') return s.name;
  if (badge === 'live-offline') return `${s.name} — Offline`;
  return `${s.name} — ${badge}`;
}

function scionDisplayName(scionId) {
  const m = LOG_SCIONS.find(s => s.id === scionId);
  return m ? m.name : scionId;
}

function wireUI() {
  document.getElementById('scion-select').addEventListener('change', e => {
    selectScion(e.target.value);
  });

  document.getElementById('refresh-btn').addEventListener('click', () => {
    if (LogState.scionId) fetchLogs({ spin: true });
  });

  document.getElementById('tail-select').addEventListener('change', e => {
    LogState.tail = parseInt(e.target.value, 10) || DEFAULT_TAIL;
    if (LogState.scionId) fetchLogs({ spin: true });
  });

  for (const tab of document.querySelectorAll('.level-tab')) {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.level-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      LogState.levelTab = tab.dataset.level;
      renderLines();
    });
  }

  const filterInput = document.getElementById('logs-filter');
  filterInput.addEventListener('input', e => {
    LogState.textFilter = e.target.value.trim().toLowerCase();
    renderLines();
  });

  document.getElementById('pause-btn').addEventListener('click', togglePause);

  document.getElementById('wrap-toggle').addEventListener('change', e => {
    document.getElementById('log-lines').classList.toggle('wrap', e.target.checked);
  });
}

// --- Admin gate ---
// Mirror social.js: in public mode show the prompt + auto-open the login
// modal so a direct URL hit doesn't dead-end. In admin mode, load the
// selected scion and start polling.
function applyAdminGate() {
  const empty = document.getElementById('logs-empty');
  const msg = document.getElementById('empty-message');
  const viewport = document.getElementById('logs-viewport');
  const controls = document.getElementById('logs-controls');

  if (!isAdmin()) {
    stopPolling();
    LogState.lines = [];
    document.getElementById('log-lines').innerHTML = '';
    msg.textContent = 'Admin login required to view container logs.';
    empty.classList.remove('hidden');
    viewport.classList.add('hidden');
    controls.classList.add('hidden');
    setPollDot('offline');
    NooscopeAuth.openModal();
    return;
  }

  controls.classList.remove('hidden');
  const selected = document.getElementById('scion-select').value;
  if (selected) selectScion(selected);
}

function selectScion(scionId) {
  LogState.scionId = scionId;
  LogState.lines = [];
  document.getElementById('log-lines').innerHTML = '';
  if (!isAdmin()) return;
  // Neutral placeholder so we don't flash the "login required" copy while
  // the first fetch is in flight.
  showEmpty(`Loading ${scionDisplayName(scionId)} container logs…`);
  fetchLogs({ spin: true });
  if (!LogState.paused) startPolling();
}

// --- Polling ---
function startPolling() {
  stopPolling();
  if (document.hidden) return;
  LogState.pollTimer = setInterval(() => {
    if (!LogState.paused && isAdmin() && LogState.scionId) fetchLogs();
  }, POLL_INTERVAL_MS);
  setPollDot('live');
}

function stopPolling() {
  if (LogState.pollTimer) {
    clearInterval(LogState.pollTimer);
    LogState.pollTimer = null;
  }
  setPollDot('offline');
}

function togglePause() {
  LogState.paused = !LogState.paused;
  const btn = document.getElementById('pause-btn');
  if (LogState.paused) {
    stopPolling();
    btn.textContent = '▶ Resume';
    btn.classList.add('paused');
  } else {
    btn.textContent = '⏸ Pause';
    btn.classList.remove('paused');
    if (LogState.scionId) { fetchLogs(); startPolling(); }
  }
}

function setPollDot(state) {
  const dot = document.getElementById('poll-dot');
  if (!dot) return;
  dot.className = `live-dot ${state}`;
  dot.title = state === 'live' ? 'Auto-refresh: on' : 'Auto-refresh: paused';
}

// --- Fetch ---
// No browser-side Authorization header — the nooscope_admin cookie gates the
// /admin/scions/ route at nginx, which injects the forge-web admin bearer
// upstream (Nooscope-r5kh).
async function fetchLogs({ spin = false } = {}) {
  if (!LogState.scionId || !isAdmin() || LogState.inFlight) return;
  LogState.inFlight = true;
  const scionId = LogState.scionId;
  const refreshBtn = document.getElementById('refresh-btn');
  if (spin) refreshBtn.classList.add('spinning');

  try {
    const resp = await fetch(`/admin/scions/${scionId}/logs?lines=${LogState.tail}`);
    // Scion may have changed mid-flight; drop a stale response.
    if (scionId !== LogState.scionId) return;

    if (resp.status === 401) {
      stopPolling();
      showEmpty('Admin token rejected. Try logging in again.');
      if (!isAdmin()) NooscopeAuth.openModal();
      return;
    }
    if (resp.status === 404) {
      stopPolling();
      showEmpty(`No log endpoint for '${scionDisplayName(scionId)}' — forge-web may not expose container logs yet.`);
      return;
    }
    if (!resp.ok) {
      // Transient failure: keep the existing buffer and the poll timer alive,
      // just surface it in the status line rather than blanking the view.
      setUpdatedStat(`HTTP ${resp.status}`);
      return;
    }

    const payload = await resp.json();
    LogState.lines = normalizeLines(payload);
    LogState.lastOk = new Date();
    hideEmpty();
    renderLines();
    setUpdatedStat();
  } catch (err) {
    console.error('[logs] fetch failed', err);
    setUpdatedStat('network error');
  } finally {
    LogState.inFlight = false;
    if (spin) refreshBtn.classList.remove('spinning');
  }
}

// Accept a few plausible shapes so the frontend isn't brittle to the exact
// backend contract: { lines: [...] }, a bare array, or { logs: [...] }. Each
// entry may be a string or an object { ts, level, message|raw }.
function normalizeLines(payload) {
  let raw = [];
  if (Array.isArray(payload)) raw = payload;
  else if (payload && Array.isArray(payload.lines)) raw = payload.lines;
  else if (payload && Array.isArray(payload.logs)) raw = payload.logs;

  return raw.map(entry => {
    if (typeof entry === 'string') return classifyLine({ message: entry });
    return classifyLine({
      ts: entry.ts || entry.timestamp || entry.time || null,
      level: entry.level || null,
      message: entry.message != null ? entry.message : (entry.raw || entry.line || ''),
    });
  });
}

function classifyLine({ ts, level, message }) {
  let lvl = (level || '').toString().toLowerCase();
  if (!(lvl in LEVEL_RANK)) {
    // Derive from the message text when the backend didn't tag a level.
    const m = String(message).match(LEVEL_PATTERN);
    lvl = m ? m[1].toLowerCase() : '';
  }
  const rank = lvl in LEVEL_RANK ? LEVEL_RANK[lvl] : -1;
  return { ts, level: lvl, rank, message: String(message) };
}

// --- Render ---
function visibleLines() {
  const minRank = TAB_MIN_RANK[LogState.levelTab] ?? -1;
  const txt = LogState.textFilter;
  return LogState.lines.filter(l => {
    if (l.rank < minRank) return false;
    if (txt && !l.message.toLowerCase().includes(txt)) return false;
    return true;
  });
}

function renderLines() {
  const container = document.getElementById('log-lines');
  const viewport = document.getElementById('logs-viewport');
  // Auto-follow only when the operator is already pinned near the bottom;
  // otherwise preserve their scroll position so reading history isn't yanked.
  const nearBottom =
    viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 40;

  const rows = visibleLines();
  if (rows.length === 0) {
    container.innerHTML = `<div class="log-empty-note">No ${LogState.levelTab === 'all' ? '' : LogState.levelTab + ' '}lines${LogState.textFilter ? ' match the filter' : ''}.</div>`;
    updateCountStat(0);
    return;
  }

  const frag = document.createDocumentFragment();
  for (const l of rows) {
    const row = document.createElement('div');
    row.className = `log-row level-${levelClass(l)}`;
    const lvlLabel = l.level ? l.level.toUpperCase() : '·';
    row.innerHTML =
      `<span class="log-ts">${escapeHtml(formatTs(l.ts))}</span>` +
      `<span class="log-lvl">${escapeHtml(lvlLabel)}</span>` +
      `<span class="log-msg">${escapeHtml(l.message)}</span>`;
    frag.appendChild(row);
  }
  container.innerHTML = '';
  container.appendChild(frag);
  updateCountStat(rows.length);

  if (nearBottom) viewport.scrollTop = viewport.scrollHeight;
}

// Collapse the level vocabulary to the four CSS color buckets.
function levelClass(l) {
  if (l.rank >= 3) return 'error';      // error / critical / fatal
  if (l.rank === 2) return 'warn';      // warning
  if (l.rank === 1) return 'info';      // info / notice
  if (l.rank === 0) return 'debug';
  return 'plain';                        // unclassified
}

// --- Status bar ---
function setUpdatedStat(note) {
  const el = document.getElementById('updated-stat');
  if (note) { el.textContent = note; return; }
  if (!LogState.lastOk) { el.textContent = '—'; return; }
  el.textContent = `updated ${LogState.lastOk.toLocaleTimeString('en-US', { hour12: false })}`;
}

function updateCountStat(shown) {
  const el = document.getElementById('count-stat');
  const total = LogState.lines.length;
  el.textContent = shown === total ? `${total} lines` : `${shown} / ${total} lines`;
}

// --- Empty state ---
function showEmpty(message) {
  const empty = document.getElementById('logs-empty');
  document.getElementById('empty-message').textContent = message;
  empty.classList.remove('hidden');
  document.getElementById('logs-viewport').classList.add('hidden');
}

function hideEmpty() {
  document.getElementById('logs-empty').classList.add('hidden');
  document.getElementById('logs-viewport').classList.remove('hidden');
}

// --- Helpers ---
function formatTs(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return String(ts);
  return d.toLocaleTimeString('en-US', { hour12: false }) +
    '.' + String(d.getMilliseconds()).padStart(3, '0');
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
