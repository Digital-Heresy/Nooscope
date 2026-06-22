/**
 * Shared admin-mode auth (Nooscope-r5kh; HMAC session cookies Nooscope-hm4c).
 *
 * A single Nooscope-level password gate replaces the per-page raven/morpheus
 * token dialogs. As of hm4c the password is verified SERVER-SIDE: login POSTs
 * the plaintext to /admin/login (same-origin), nginx's njs handler compares
 * SHA-256(password) to the server-held digest and, on match, sets an
 * HMAC-signed, HttpOnly session cookie that the gateway verifies on every
 * admin request. The browser never holds the digest, never computes a hash,
 * and never sets the cookie itself — so the cookie can't be forged client-side
 * (the old `nooscope_admin=1` soft gate is gone).
 *
 * Client-side state is just a hint for the SPA's own visibility toggles:
 *   sessionStorage['nooscope_admin'] = '1'   — read by isAdmin()
 * The real authority is the HttpOnly cookie, which JS cannot read or write;
 * logout POSTs /admin/logout to have the server expire it. config.js carries
 * only `adminConfigured` (boolean), never the password digest.
 */

(function (global) {
  'use strict';

  const SESSION_KEY = 'nooscope_admin';
  const listeners = new Set();

  function isAdmin() {
    return sessionStorage.getItem(SESSION_KEY) === '1';
  }

  // Configured = entrypoint had NOOSCOPE_ADMIN_PASSWORD set. When unset
  // (dev quick-starts, hostile envs), the UI omits the lock icon entirely
  // rather than offering a login that can't succeed. config.js exposes this
  // as a boolean (hm4c) — the password digest stays server-side now.
  //
  // Note: NOOSCOPE_CONFIG is declared with `const` in config.js — top-level
  // `const` lives in the global lexical scope, NOT on `window`. Reference
  // the bare name, not `window.NOOSCOPE_CONFIG` (which would be undefined).
  function isConfigured() {
    return !!(typeof NOOSCOPE_CONFIG !== 'undefined' && NOOSCOPE_CONFIG.adminConfigured);
  }

  async function login(password) {
    if (!isConfigured()) return { ok: false, reason: 'no-admin-configured' };
    if (!password) return { ok: false, reason: 'empty-password' };
    // Server-side verification (hm4c): POST the password same-origin; nginx's
    // njs handler hashes + compares and, on match, sets the HttpOnly signed
    // cookie via Set-Cookie. No client-side hashing, no client-set cookie.
    let res;
    try {
      res = await fetch('/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
    } catch (e) {
      return { ok: false, reason: 'network' };
    }
    if (!res.ok) {
      // 401 = wrong password; 403 = admin not configured server-side; other =
      // unexpected. Map to the same reasons the UI already renders.
      return { ok: false, reason: res.status === 401 ? 'mismatch'
        : res.status === 403 ? 'no-admin-configured' : 'error' };
    }
    sessionStorage.setItem(SESSION_KEY, '1');
    notify(true);
    return { ok: true };
  }

  async function logout() {
    // Clear the local hint first so the UI reflects logged-out immediately,
    // then ask the server to expire the HttpOnly cookie (JS can't touch it).
    sessionStorage.removeItem(SESSION_KEY);
    notify(false);
    try {
      await fetch('/admin/logout', { method: 'POST' });
    } catch (e) {
      // Best-effort: local state is already cleared; the cookie expires on its
      // own TTL even if this request fails.
    }
  }

  function onAdminStateChange(cb) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  }

  function notify(state) {
    for (const cb of listeners) {
      try { cb(state); } catch (e) { console.error('[auth] listener error', e); }
    }
  }

  // Apply admin-vs-public visibility on a page. Toggles:
  //   - elements with [data-admin-only]   shown only when admin
  //   - elements with [data-public-only]  shown only when public
  //   - the Social nav link               hidden in public mode
  //   - the lock-icon badge state         flips on every state change
  function applyVisibility() {
    const admin = isAdmin();
    for (const el of document.querySelectorAll('[data-admin-only]')) {
      el.classList.toggle('hidden', !admin);
    }
    for (const el of document.querySelectorAll('[data-public-only]')) {
      el.classList.toggle('hidden', admin);
    }
    // Social + Logs links are admin-only by policy (Nooscope-r5kh per-page
    // UX; Logs added in Nooscope-lginsp — both are operator tools that hit
    // admin-gated forge-web routes, so they stay hidden in public mode).
    for (const link of document.querySelectorAll(
      'a.nav-link[href="social.html"], a.nav-link[href="logs.html"]')) {
      link.classList.toggle('hidden', !admin);
    }
    // Mode badge + lock icon, if present.
    const badge = document.getElementById('mode-badge');
    if (badge) {
      badge.textContent = admin ? 'ADMIN' : 'PUBLIC';
      badge.className = `mode-badge ${admin ? 'admin' : 'public'}`;
    }
    const lock = document.getElementById('admin-toggle-btn');
    if (lock) {
      lock.className = admin ? 'admin-btn active' : 'admin-btn';
      lock.innerHTML = admin ? '&#128275;' : '&#128274;'; // open vs closed lock
      // Hide the lock entirely when no password is configured.
      lock.classList.toggle('hidden', !isConfigured());
    }
  }

  // Inject a standard password modal once per page; idempotent so any page
  // can call NooscopeAuth.installModal() during init without duplicating
  // markup. Pages already carrying their own admin-dialog markup get a
  // no-op here — installModal only adds the partial when missing.
  function installModal() {
    if (document.getElementById('nooscope-admin-dialog')) return;
    const wrap = document.createElement('div');
    wrap.id = 'nooscope-admin-dialog';
    wrap.className = 'hidden';
    wrap.innerHTML = `
      <div class="admin-dialog-inner">
        <div class="panel-header">
          <span>Admin Login</span>
          <button id="nooscope-admin-dialog-close">&times;</button>
        </div>
        <div class="admin-dialog-body">
          <label>Password: <input id="nooscope-admin-password" type="password" autocomplete="current-password"></label>
          <div class="admin-dialog-error hidden" id="nooscope-admin-error"></div>
          <div class="admin-dialog-actions">
            <button id="nooscope-admin-login-btn">Login</button>
            <button id="nooscope-admin-logout-btn" class="hidden">Logout</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(wrap);

    wrap.addEventListener('click', e => {
      if (e.target.id === 'nooscope-admin-dialog') closeModal();
    });
    document.getElementById('nooscope-admin-dialog-close').addEventListener('click', closeModal);
    document.getElementById('nooscope-admin-login-btn').addEventListener('click', handleLoginClick);
    document.getElementById('nooscope-admin-logout-btn').addEventListener('click', handleLogoutClick);
    document.getElementById('nooscope-admin-password').addEventListener('keydown', e => {
      if (e.key === 'Enter') handleLoginClick();
    });
  }

  function openModal() {
    installModal();
    const dlg = document.getElementById('nooscope-admin-dialog');
    dlg.classList.remove('hidden');
    // Show login/logout depending on current state.
    const loginBtn = document.getElementById('nooscope-admin-login-btn');
    const logoutBtn = document.getElementById('nooscope-admin-logout-btn');
    const pwd = document.getElementById('nooscope-admin-password');
    if (isAdmin()) {
      loginBtn.classList.add('hidden');
      logoutBtn.classList.remove('hidden');
      pwd.classList.add('hidden');
    } else {
      loginBtn.classList.remove('hidden');
      logoutBtn.classList.add('hidden');
      pwd.classList.remove('hidden');
      pwd.value = '';
      setTimeout(() => pwd.focus(), 0);
    }
    clearError();
  }

  function closeModal() {
    const dlg = document.getElementById('nooscope-admin-dialog');
    if (dlg) dlg.classList.add('hidden');
  }

  async function handleLoginClick() {
    const pwd = document.getElementById('nooscope-admin-password');
    const result = await login(pwd.value);
    if (result.ok) {
      closeModal();
      applyVisibility();
    } else {
      showError(result.reason === 'no-admin-configured'
        ? 'Admin login not configured on this Nooscope instance.'
        : 'Incorrect password.');
    }
  }

  function handleLogoutClick() {
    logout();
    closeModal();
    applyVisibility();
    // Page-level state (open WS connections, cached admin data) is the
    // caller's concern — they subscribe via onAdminStateChange.
  }

  function showError(msg) {
    const err = document.getElementById('nooscope-admin-error');
    if (err) { err.textContent = msg; err.classList.remove('hidden'); }
  }

  function clearError() {
    const err = document.getElementById('nooscope-admin-error');
    if (err) { err.textContent = ''; err.classList.add('hidden'); }
  }

  // Wire up the standard lock-icon button on any page that has one.
  // Pages call NooscopeAuth.init() in DOMContentLoaded.
  function init() {
    installModal();
    applyVisibility();
    const lock = document.getElementById('admin-toggle-btn');
    if (lock) {
      lock.addEventListener('click', openModal);
    }
  }

  global.NooscopeAuth = {
    isAdmin,
    isConfigured,
    login,
    logout,
    onAdminStateChange,
    applyVisibility,
    openModal,
    closeModal,
    init,
  };
})(window);
