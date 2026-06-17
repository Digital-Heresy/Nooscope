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
    // Web Crypto (crypto.subtle) is only available in a SECURE CONTEXT —
    // HTTPS or localhost. Behind an operator's plain-HTTP ingress (e.g.
    // http://<lan-ip>:8080) it's undefined, which threw
    // "Cannot read properties of undefined (reading 'digest')" and blocked
    // admin login. Fall back to a pure-JS SHA-256 there. Output is identical
    // (lowercase hex digest), so it matches the server-computed adminHash.
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const digest = await crypto.subtle.digest('SHA-256', buf);
      return Array.from(new Uint8Array(digest))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    }
    return sha256Fallback(buf);
  }

  // Pure-JS SHA-256 (FIPS 180-4) over a Uint8Array → lowercase hex. Used only
  // when crypto.subtle is unavailable (insecure context). Byte-for-byte
  // compatible with crypto.subtle's SHA-256.
  function sha256Fallback(bytes) {
    const rr = (x, n) => (x >>> n) | (x << (32 - n));
    const K = [
      0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
      0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
      0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
      0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
      0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
      0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
      0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
      0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
    let H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    const l = bytes.length;
    const bitLen = l * 8;
    const withOne = l + 1;
    const pad = (56 - (withOne % 64) + 64) % 64;
    const total = withOne + pad + 8;
    const m = new Uint8Array(total);
    m.set(bytes);
    m[l] = 0x80;
    const dv = new DataView(m.buffer);
    dv.setUint32(total - 8, Math.floor(bitLen / 0x100000000), false);
    dv.setUint32(total - 4, bitLen >>> 0, false);
    const w = new Uint32Array(64);
    for (let i = 0; i < total; i += 64) {
      for (let t = 0; t < 16; t++) w[t] = dv.getUint32(i + t * 4, false);
      for (let t = 16; t < 64; t++) {
        const s0 = rr(w[t-15],7) ^ rr(w[t-15],18) ^ (w[t-15] >>> 3);
        const s1 = rr(w[t-2],17) ^ rr(w[t-2],19) ^ (w[t-2] >>> 10);
        w[t] = (w[t-16] + s0 + w[t-7] + s1) >>> 0;
      }
      let [a,b,c,d,e,f,g,h] = H;
      for (let t = 0; t < 64; t++) {
        const S1 = rr(e,6) ^ rr(e,11) ^ rr(e,25);
        const ch = (e & f) ^ (~e & g);
        const t1 = (h + S1 + ch + K[t] + w[t]) >>> 0;
        const S0 = rr(a,2) ^ rr(a,13) ^ rr(a,22);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + maj) >>> 0;
        h=g; g=f; f=e; e=(d + t1) >>> 0; d=c; c=b; b=a; a=(t1 + t2) >>> 0;
      }
      H = [(H[0]+a)>>>0,(H[1]+b)>>>0,(H[2]+c)>>>0,(H[3]+d)>>>0,
           (H[4]+e)>>>0,(H[5]+f)>>>0,(H[6]+g)>>>0,(H[7]+h)>>>0];
    }
    return H.map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
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
