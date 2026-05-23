/**
 * Shared admin-mode auth (Nooscope-r5kh).
 *
 * Replaces the per-page raven/morpheus token dialogs with a single
 * Nooscope-level password gate. The plaintext password never leaves the
 * browser; we SHA-256 it via Web Crypto and compare to the digest baked
 * into config.js by docker-entrypoint at container start.
 *
 * State lives in two places that nginx and the SPA share:
 *   sessionStorage['nooscope_admin'] = '1'   — read by the SPA
 *   document.cookie nooscope_admin=1         — read by nginx (admin gate)
 *
 * Both are wiped on logout. Soft-gate threat model — anyone with shell on
 * the host can forge the cookie. Real session-cookie HMAC is the
 * network-facing follow-up bean (kyyw note); intentionally not built here.
 */

(function (global) {
  'use strict';

  const SESSION_KEY = 'nooscope_admin';
  const COOKIE_KEY  = 'nooscope_admin';
  const listeners = new Set();

  function isAdmin() {
    return sessionStorage.getItem(SESSION_KEY) === '1';
  }

  // Configured = entrypoint had NOOSCOPE_ADMIN_PASSWORD set. When unset
  // (dev quick-starts, hostile envs), the UI omits the lock icon entirely
  // rather than offering a login that can't succeed.
  //
  // Note: NOOSCOPE_CONFIG is declared with `const` in config.js — top-level
  // `const` lives in the global lexical scope, NOT on `window`. Reference
  // the bare name, not `window.NOOSCOPE_CONFIG` (which would be undefined).
  function isConfigured() {
    return !!(typeof NOOSCOPE_CONFIG !== 'undefined' && NOOSCOPE_CONFIG.adminHash);
  }

  async function sha256Hex(text) {
    const buf = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(digest))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  async function login(password) {
    if (!isConfigured()) return { ok: false, reason: 'no-admin-configured' };
    if (!password) return { ok: false, reason: 'empty-password' };
    const digest = await sha256Hex(password);
    if (digest !== NOOSCOPE_CONFIG.adminHash) {
      return { ok: false, reason: 'mismatch' };
    }
    sessionStorage.setItem(SESSION_KEY, '1');
    // Path=/ so every nginx location sees it. Session-scoped (no
    // Max-Age/Expires) so closing the tab logs you out — matches
    // sessionStorage's lifetime, which is the source of truth.
    // `Secure` only when actually served over HTTPS — plain-HTTP
    // localhost dev would silently fail to set the cookie otherwise
    // (Nooscope-03z5 deferred touch, landed for the noo.thriden.dev
    // deploy posture).
    document.cookie = `${COOKIE_KEY}=1; Path=/; SameSite=Strict${cookieSecureAttr()}`;
    notify(true);
    return { ok: true };
  }

  function logout() {
    sessionStorage.removeItem(SESSION_KEY);
    // Expire the cookie immediately. Mirror the Secure flag from the
    // set side so the browser matches the cookie identity correctly
    // before applying Max-Age=0.
    document.cookie = `${COOKIE_KEY}=; Path=/; Max-Age=0; SameSite=Strict${cookieSecureAttr()}`;
    notify(false);
  }

  function cookieSecureAttr() {
    return location.protocol === 'https:' ? '; Secure' : '';
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
    // Social link is admin-only by policy (Nooscope-r5kh per-page UX).
    for (const link of document.querySelectorAll('a.nav-link[href="social.html"]')) {
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
