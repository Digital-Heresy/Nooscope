/*
 * Nooscope admin session auth (Nooscope-hm4c).
 *
 * Replaces the forgeable `nooscope_admin=1` soft gate. The cookie now carries
 * an HMAC-signed, expiring token that nginx verifies server-side via njs, so a
 * client that doesn't know the password cannot mint a cookie the gateway will
 * accept.
 *
 * Wiring (nginx.conf.template + docker-entrypoint.sh):
 *   js_import nooscope_auth from /etc/nginx/njs/nooscope-auth.js;
 *   js_set    $admin_valid nooscope_auth.verifyAdmin;   # "1" iff cookie valid
 *   location = /admin/login  { js_content nooscope_auth.login;  }
 *   location = /admin/logout { js_content nooscope_auth.logout; }
 * Every admin gate consumes $admin_valid (NOT the raw cookie). Two server-side
 * secrets reach njs through nginx variables, never the browser:
 *   $session_secret  per-boot HMAC key (entrypoint; override NOOSCOPE_SESSION_SECRET)
 *   $admin_hash      SHA-256 of NOOSCOPE_ADMIN_PASSWORD (entrypoint)
 *
 * Token shape: "<exp>.<hmac>" where exp = unix-seconds expiry and
 * hmac = HMAC-SHA256(session_secret, "<exp>") hex. Stateless: no server-side
 * session store, so a container restart (new random secret) invalidates every
 * outstanding cookie — acceptable for an operator tool with tab-scoped sessions.
 */

import crypto from 'crypto';

var COOKIE = 'nooscope_admin';
var TTL_SECONDS = 2 * 3600; // hard cap; the cookie is otherwise session-scoped.
// Kept short to bound replay of a stolen token — there is no server-side
// revocation short of rotating $session_secret (a container restart, or a
// changed NOOSCOPE_SESSION_SECRET). Pinning that env var to keep sessions
// alive across redeploys therefore also disables reboot-based revocation.

function nowSeconds() {
    return Math.floor(Date.now() / 1000);
}

function hmacHex(secret, msg) {
    return crypto.createHmac('sha256', secret).update(msg).digest('hex');
}

// Length-checked, constant-time-ish hex compare. Avoids leaking match length
// via early return — cheap insurance on the HMAC/hash comparisons.
function safeEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    if (a.length !== b.length) return false;
    var diff = 0;
    for (var i = 0; i < a.length; i++) {
        diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
}

// CSRF defense for the state-changing /admin/login and /admin/logout POSTs.
// The session cookie is SameSite=Strict (blocks cross-site cookie attachment),
// but these endpoints change state regardless of the cookie, so we also reject
// any request whose Origin is present and not same-origin. A cross-origin POST
// (even no-cors / text-plain, which would otherwise slip JSON past the body
// parser) always carries an Origin header, so this closes forced-login and the
// logout-DoS. Same-origin requests (Origin absent, or Origin host == Host) pass.
function sameOrigin(r) {
    var origin = r.headersIn['Origin'];
    if (!origin) return true;
    var host = r.headersIn['Host'] || '';
    return origin.replace(/^https?:\/\//, '') === host;
}

function cookieAttrs(r) {
    // TLS is terminated upstream (Caddy, Nooscope-03z5), so $scheme at nginx is
    // http even when the client is https. Trust X-Forwarded-Proto to decide the
    // Secure flag; on plain-HTTP LAN/dev we omit it so the cookie still sets.
    // We trust the header because nginx's port is published on 127.0.0.1 only
    // (see compose) — it is not directly reachable to spoof XFP; every external
    // request arrives through the Caddy terminator that sets it. If that
    // binding ever changes, restrict XFP trust (set_real_ip_from) accordingly.
    var secure = (r.headersIn['X-Forwarded-Proto'] === 'https') ? '; Secure' : '';
    return '; Path=/; HttpOnly; SameSite=Strict' + secure;
}

// js_set handler. Returns "1" when the request carries a structurally valid,
// correctly-signed, unexpired admin token; "" otherwise. Pure (no side
// effects) — js_set may evaluate it more than once per request.
function verifyAdmin(r) {
    var secret = r.variables.session_secret;
    if (!secret) return '';
    var token = r.variables.cookie_nooscope_admin;
    if (!token) return '';
    var dot = token.indexOf('.');
    if (dot < 1) return '';
    var exp = token.substring(0, dot);
    var sig = token.substring(dot + 1);
    if (!/^[0-9]+$/.test(exp)) return '';
    if (Number(exp) < nowSeconds()) return '';            // expired
    return safeEqual(sig, hmacHex(secret, exp)) ? '1' : '';
}

function reply(r, status, obj) {
    r.headersOut['Content-Type'] = 'application/json';
    r.return(status, JSON.stringify(obj));
}

// POST /admin/login  body: {"password": "..."}. Verifies the password against
// $admin_hash server-side and, on match, issues the signed cookie. The browser
// never sees $admin_hash or $session_secret.
function login(r) {
    if (r.method !== 'POST') { reply(r, 405, { ok: false, reason: 'method' }); return; }
    if (!sameOrigin(r)) { reply(r, 403, { ok: false, reason: 'cross-origin' }); return; }
    var hash = r.variables.admin_hash;
    if (!hash) { reply(r, 403, { ok: false, reason: 'no-admin-configured' }); return; }
    var pw = '';
    try { pw = (JSON.parse(r.requestText || '{}').password) || ''; } catch (e) { pw = ''; }
    if (!pw) { reply(r, 400, { ok: false, reason: 'empty-password' }); return; }
    var digest = crypto.createHash('sha256').update(pw).digest('hex');
    if (!safeEqual(digest, hash)) { reply(r, 401, { ok: false, reason: 'mismatch' }); return; }
    var exp = nowSeconds() + TTL_SECONDS;
    var token = exp + '.' + hmacHex(r.variables.session_secret, String(exp));
    r.headersOut['Set-Cookie'] = COOKIE + '=' + token + cookieAttrs(r);
    reply(r, 200, { ok: true });
}

// POST /admin/logout. Expires the cookie. sessionStorage (client source of
// truth for isAdmin()) is cleared separately by auth.js.
function logout(r) {
    if (!sameOrigin(r)) { reply(r, 403, { ok: false, reason: 'cross-origin' }); return; }
    r.headersOut['Set-Cookie'] = COOKIE + '=' + cookieAttrs(r) + '; Max-Age=0';
    reply(r, 200, { ok: true });
}

export default { verifyAdmin, login, logout };
