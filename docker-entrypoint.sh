#!/bin/sh
# Container start hook (Nooscope-r5kh, Nooscope-de9m):
#   1. Generate /js/config.js (Scion roster + adminConfigured flag) from
#      either a hardcoded dev list ([speaker, helix]) or a live fetch of
#      forge-web's /scions JSON (Nooscope-de9m).
#   2. Render /etc/nginx/conf.d/default.conf by:
#        a. Replacing the {{SCION_MAPS}} and {{SCION_BLOCKS}} markers
#           in nginx.conf.template with per-Scion content.
#        b. envsubst'ing per-Scion bearer tokens from env vars (the
#           allow-list expands based on the discovered slugs).
#   3. Write /healthz.txt so `GET /healthz` reports the loaded roster.
#
# Upstream secrets (RAVEN_TOKEN_*, MORPHEUS_TOKEN_*, FORGE_WEB_ADMIN_TOKEN)
# never reach js/config.js — only nginx's running config holds them, and
# nginx injects them as bearer headers on outbound proxy requests.
#
# Environment variables:
#   NOOSCOPE_ADMIN_PASSWORD          plain admin password; we SHA-256 it and
#                                    keep the digest server-side ($admin_hash)
#                                    for njs /admin/login to verify (hm4c). The
#                                    browser sees only adminConfigured. Empty
#                                    = admin login disabled (public-only).
#   NOOSCOPE_SESSION_SECRET          optional; HMAC key for signing admin
#                                    session cookies. Unset = fresh random key
#                                    per boot (restart invalidates sessions).
#   NOOSCOPE_HOST                    set for production. When set, the
#                                    entrypoint fetches forge-web's
#                                    /scions registry and renders prod-
#                                    shape config.js (host + pfPrefix per
#                                    Scion). When unset, dev shape with
#                                    hardcoded speaker/helix ports.
#   SPEAKER_THRIDEN_PORT             dev mode only — default 3030
#   SPEAKER_PF_PORT                  dev mode only — default 8100
#   HELIX_THRIDEN_PORT               dev mode only — default 3031
#   HELIX_PF_PORT                    dev mode only — default 8101
#   FORGE_WEB_HOST                   prod mode — default 'forge-web:8200'
#   RAVEN_TOKEN_<SLUG>               engram + forge telemetry WS bearer (per Scion)
#   MORPHEUS_TOKEN_<SLUG>            forge dream REST bearer (/morpheus/*, per Scion)
#   FORGE_WEB_ADMIN_TOKEN            cross-Scion admin web bearer

set -e

# --- 0. Version marker ---
# VERSION is the version-of-record, baked in by the Dockerfile. Echo it first
# so the running image is identifiable in `docker logs` ("new image running"
# marker). `|| echo unknown` keeps set -e from crashing if the file is absent.
NOOSCOPE_VERSION=$(cat /etc/nooscope-version 2>/dev/null || echo unknown)
echo "Nooscope ${NOOSCOPE_VERSION} starting"

CONFIG_PATH="/usr/share/nginx/html/js/config.js"
HEALTHZ_PATH="/usr/share/nginx/html/healthz.txt"
NGINX_TEMPLATE="/etc/nginx/conf.d/default.conf.template"
NGINX_CONF="/etc/nginx/conf.d/default.conf"
NGINX_INTERMEDIATE="/tmp/default.conf.markers-resolved"
SCION_TSV="/tmp/scions.tsv"
MAP_TPL="/tmp/nginx-scion-map.tpl"
BLOCK_TPL="/tmp/nginx-scion-block.tpl"
MAPS_FRAGMENT="/tmp/scion-maps.fragment"
BLOCKS_FRAGMENT="/tmp/scion-blocks.fragment"

# --- 1. Admin password hash + session secret (Nooscope-hm4c) ---
# SHA-256 the password and emit the lowercase hex digest. The plaintext
# never reaches disk in the served bundle, and unlike the pre-hm4c scheme the
# digest no longer reaches the BROWSER either — it stays server-side in nginx
# ($admin_hash) for the njs /admin/login handler to compare against. The
# browser only learns whether admin is configured (config.js adminConfigured).
# An empty password means "no admin login configured" — /admin/login 403s and
# no valid session cookie can be minted, so admin routes stay locked.
if [ -n "$NOOSCOPE_ADMIN_PASSWORD" ]; then
    ADMIN_HASH=$(printf '%s' "$NOOSCOPE_ADMIN_PASSWORD" | sha256sum | cut -d' ' -f1)
else
    ADMIN_HASH=""
fi
export ADMIN_HASH

# HMAC key for signing admin session cookies. Default: a fresh 32-byte random
# key per container boot (od -> hex, no special chars for nginx/envsubst). A
# new key on restart invalidates every outstanding cookie — fine for a
# tab-scoped operator tool. Set NOOSCOPE_SESSION_SECRET to pin a stable key
# across restarts (e.g. to keep sessions alive through a redeploy).
SESSION_SECRET="${NOOSCOPE_SESSION_SECRET:-$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')}"
export SESSION_SECRET

# --- 2. Discover Scion roster (TSV: slug, name, badge) ---
# Two paths:
#   prod (NOOSCOPE_HOST set): GET /scions on forge-web with retry. Fail
#       container start if forge-web doesn't respond after retries — no
#       baked-in fallback list (any fallback embeds a stale assumption
#       about the fleet). Special case (Nooscope-thvl): PF gates every
#       route behind /setup until the operator completes first-run
#       setup, returning 503 + `{"error":"setup_required"}` on a fresh
#       Pi5 deploy. We treat that sentinel as "no scions yet, continue"
#       — same downstream path as a legitimate empty `{"scions":[]}`.
#   dev (NOOSCOPE_HOST unset): hardcoded speaker + helix with badge
#       'live-online'. Keeps the dev-shape config.js (per-port) the
#       frontend already understands.
FORGE_WEB_HOST="${FORGE_WEB_HOST:-forge-web:8200}"

if [ -n "$NOOSCOPE_HOST" ]; then
    SCIONS_URL="http://${FORGE_WEB_HOST}/scions"
    echo "Nooscope: fetching Scion roster from ${SCIONS_URL}"

    # Why nc instead of wget: BusyBox wget unlinks the output file on
    # any 4xx/5xx response, so we can't read PF's 503 body to look for
    # the setup_required sentinel (Nooscope-thvl). Raw HTTP/1.0 over
    # BusyBox nc keeps both the status line and the body in one capture.
    # (curl would be cleaner, but f624b74 stripped it from the image to
    # clear three High curl CVEs; we keep that posture — see Dockerfile.)
    # We split FORGE_WEB_HOST (e.g. "forge-web:8200") into host + port;
    # default to port 80 if no colon. `|| true` after nc because `set -e`
    # and nc exits non-zero on connection refused / timeout.
    FORGE_WEB_NAME="${FORGE_WEB_HOST%:*}"
    case "$FORGE_WEB_HOST" in
        *:*) FORGE_WEB_PORT="${FORGE_WEB_HOST##*:}" ;;
        *)   FORGE_WEB_PORT="80" ;;
    esac

    SCIONS_JSON=""
    SCIONS_RAW="/tmp/scions.raw"
    SCIONS_BODY="/tmp/scions.body"
    attempt=1
    while [ "$attempt" -le 5 ]; do
        rm -f "$SCIONS_RAW" "$SCIONS_BODY"
        # Hold stdin open briefly after writing the request (Nooscope-oh9z):
        # BusyBox nc 1.37 tears down the socket read side the instant its
        # stdin hits EOF, which races ahead of forge-web's response —
        # notably PF's immediate first-run 503 — so the capture file lands
        # empty and every attempt logs "unreachable". The trailing `sleep`
        # keeps nc's stdin open long enough to read the full response
        # (forge-web answers in well under a second on the docker network).
        # The shell waits for the whole pipeline, so this adds a fixed ~2s
        # to a probe attempt; the loop breaks on the first usable response,
        # so on the happy path it is paid once at container start.
        { printf 'GET /scions HTTP/1.0\r\nHost: %s\r\nAccept: application/json\r\nConnection: close\r\n\r\n' \
            "$FORGE_WEB_HOST"; sleep 2; } \
            | nc -w 10 "$FORGE_WEB_NAME" "$FORGE_WEB_PORT" > "$SCIONS_RAW" 2>/dev/null \
            || true

        if [ -s "$SCIONS_RAW" ]; then
            # Strip \r so subsequent sed/awk are line-clean.
            tr -d '\r' < "$SCIONS_RAW" > "${SCIONS_RAW}.clean"
            HTTP_CODE=$(awk 'NR==1{print $2; exit}' "${SCIONS_RAW}.clean")
            # Body = everything after the first blank line.
            sed '1,/^$/d' "${SCIONS_RAW}.clean" > "$SCIONS_BODY"
        else
            HTTP_CODE=""
            : > "$SCIONS_BODY"
        fi

        case "$HTTP_CODE" in
            200)
                SCIONS_JSON=$(cat "$SCIONS_BODY")
                break
                ;;
            503)
                if jq -e '.error == "setup_required"' "$SCIONS_BODY" >/dev/null 2>&1; then
                    echo "Nooscope: PF reports setup_required (operator hasn't completed first-run setup); starting with empty Scion roster"
                    SCIONS_JSON='{"scions": []}'
                    break
                fi
                echo "Nooscope: /scions returned 503 without setup_required sentinel, attempt ${attempt}/5"
                ;;
            "")
                echo "Nooscope: /scions unreachable, attempt ${attempt}/5"
                ;;
            *)
                echo "Nooscope: /scions returned HTTP ${HTTP_CODE}, attempt ${attempt}/5"
                ;;
        esac

        attempt=$((attempt + 1))
        [ "$attempt" -le 5 ] && sleep 2
    done

    if [ -z "$SCIONS_JSON" ]; then
        echo "FATAL: could not reach ${SCIONS_URL} with a usable response after 5 attempts. Refusing to start with a stale Scion list." >&2
        exit 1
    fi

    # Project to TSV: slug, name, badge, scion_id. Filter to
    # engram_bound: true. Offline-but-awakened Scions stay in the
    # selector (rendered with a status suffix) — only excluded if they
    # have no brain at all. scion_id is the canonical PF identifier
    # that the admin-web API expects in /scions/{scion_id}/... URLs;
    # social.js reads it from config.js to call those routes (the slug
    # alone wouldn't address the PF API).
    #
    # A zero-row response is *valid* — a fresh Thriden deploy comes up
    # with no Scions forged yet. We render an empty selector, no per-
    # Scion nginx blocks, /healthz reports scions=0, and the operator
    # forges the first Scion on PF whenever they're ready (next
    # container restart picks it up). Only forge-web *unreachable*
    # fails the container start, not "reachable and empty."
    # 5th column: runtime_short — the compose service shortname
    # (engram-<short> / forge-<short>). It diverges from scion_slug when a
    # Scion was provisioned with a different short (e.g. slug "dm-cairn" but
    # runtime_short "dm" → services forge-dm / engram-dm). The upstream
    # proxy MUST address by runtime_short, not slug. `// ""` tolerates an
    # older forge-web that doesn't surface it (entrypoint falls back to slug).
    # 6th column: soul_managed — whether SOUL-in-Git is configured. The
    # dreams view warns when it's false. jq's `//` treats boolean false as
    # a fallback trigger (same as null), so we cannot use `// ""` here —
    # that would silently drop an explicit `soul_managed: false` to an empty
    # cell, map it to JS `undefined`, and the warning would never fire.
    # Instead: `if .soul_managed == null then "" else tostring end` returns
    # "" only when the field is truly absent/null (older forge-web) and
    # converts the boolean to "true"/"false" otherwise.
    printf '%s' "$SCIONS_JSON" \
        | jq -r '.scions[] | select(.engram_bound == true)
                | [.scion_slug, .name, .badge, .scion_id, (.runtime_short // ""),
                   (if .soul_managed == null then "" else (.soul_managed | tostring) end)] | @tsv' \
        > "$SCION_TSV"
else
    cat > "$SCION_TSV" <<'EOF'
speaker	Speaker	live-online	dh-speaker	speaker	false
helix	Helix	live-online	dh-helix	helix	false
EOF
fi

scion_count=$(wc -l < "$SCION_TSV")
scion_slugs=$(cut -f1 "$SCION_TSV" | tr '\n' ' ')
echo "Nooscope: loaded ${scion_count} Scion(s): ${scion_slugs}"

# --- 3. config.js ---
# Escape single quotes in `name` so they don't break the JS string. The
# scion_slug and badge fields are constrained by PF's validators (slug:
# [a-z0-9-]+, badge: a small enum) so no escaping needed.
escape_js_single() {
    # Replace ' with \' for embedding in single-quoted JS strings.
    printf '%s' "$1" | sed "s/'/\\\\'/g"
}

{
    printf 'const NOOSCOPE_CONFIG = {\n'
    printf '  scions: {\n'
    if [ -n "$NOOSCOPE_HOST" ]; then
        # Prod shape: { host, pfPrefix, name, badge, scionId, soulRepo }.
        while IFS='	' read -r slug name badge scion_id _short soul; do
            name_js=$(escape_js_single "$name")
            # soul_managed arrives as "true", "false", or "" (older forge-web
            # that doesn't surface the field). Map to valid JS: "true" →
            # true, "false" → false, "" → undefined (so dreams.js stays
            # quiet on a roster that predates the field).
            case "$soul" in
                "true")  soul=true  ;;
                "false") soul=false ;;
                *)       soul=undefined ;;
            esac
            # Quote the slug key — PF slugs are [a-z0-9-]+, and a hyphen
            # (e.g. "dm-cairn") is NOT a valid unquoted JS object key, so
            # an unquoted key breaks config.js parsing and blanks the whole
            # roster. Quoting makes any valid slug safe.
            printf "    \"%s\": { host: '%s', pfPrefix: '/%s', name: '%s', badge: '%s', scionId: '%s', soulRepo: %s },\n" \
                "$slug" "$NOOSCOPE_HOST" "$slug" "$name_js" "$badge" "$scion_id" "$soul"
        done < "$SCION_TSV"
    else
        # Dev shape: { thriden, pf, name, badge, scionId, soulRepo }. Only
        # speaker + helix are wired in dev — same scope as the pre-de9m
        # behavior. scionId carries the canonical PF identifier so
        # social.js can call /admin/scions/{scionId}/... uniformly.
        printf "    speaker: { thriden: %s, pf: %s, name: 'Speaker', badge: 'live-online', scionId: 'dh-speaker', soulRepo: false },\n" \
            "${SPEAKER_THRIDEN_PORT:-3030}" "${SPEAKER_PF_PORT:-8100}"
        printf "    helix:   { thriden: %s, pf: %s, name: 'Helix', badge: 'live-online', scionId: 'dh-helix', soulRepo: false },\n" \
            "${HELIX_THRIDEN_PORT:-3031}" "${HELIX_PF_PORT:-8101}"
    fi
    printf '  },\n'
    printf '  defaults: {\n'
    if [ -z "$NOOSCOPE_HOST" ]; then
        printf "    thridenPort: %s,\n" "${SPEAKER_THRIDEN_PORT:-3030}"
        printf "    pfPort: %s,\n" "${SPEAKER_PF_PORT:-8100}"
    fi
    printf '  },\n'
    # hm4c: ship only whether admin login is configured — never the digest.
    # Password verification moved server-side (njs /admin/login), so the
    # browser no longer needs (and must not hold) the SHA-256 hash.
    if [ -n "$ADMIN_HASH" ]; then admin_configured=true; else admin_configured=false; fi
    printf '  adminConfigured: %s,\n' "$admin_configured"
    printf '};\n'
} > "$CONFIG_PATH"

# --- 4. /healthz body ---
{
    if [ -n "$NOOSCOPE_HOST" ]; then
        printf 'ok prod\n'
    else
        printf 'ok dev\n'
    fi
    printf 'scions=%s\n' "$scion_count"
    while IFS='	' read -r slug name badge scion_id _short _soul; do
        printf '  %s\t%s\t%s\t%s\n' "$slug" "$name" "$badge" "$scion_id"
    done < "$SCION_TSV"
} > "$HEALTHZ_PATH"

# --- 5. Per-Scion nginx fragments ---
# Templates are written once to temp files; each iteration sed-renders
# them and appends to the fragment files. The placeholders __SLUG__,
# __SLUG_UPPER__, __SCION_NAME__ don't collide with nginx's `$variable`
# references or with the `${VAR}` envsubst placeholders.

cat > "$MAP_TPL" <<'EOF'
map $admin_valid $morpheus_auth___SLUG_VAR__ {
    "1"     "Bearer $MORPHEUS_TOKEN___SLUG_UPPER__";
    default "";
}
EOF

# Templates use these placeholders:
#   __SLUG__        the raw slug, used ONLY in URL paths (e.g. /dm-cairn/...).
#   __SHORT__       runtime_short — the compose service shortname, used ONLY
#                   in docker hostnames (engram-__SHORT__:3030 /
#                   forge-__SHORT__:8100). Distinct from __SLUG__ because the
#                   two diverge (slug "dm-cairn" vs runtime_short "dm").
#   __SLUG_VAR__    slug with hyphens → underscores, used in nginx variable
#                   names (e.g. $engram_dm_cairn). nginx forbids hyphens in
#                   variable names.
#   __SLUG_UPPER__  uppercase + hyphens → underscores, used as env-var
#                   suffix for envsubst (e.g. ${RAVEN_TOKEN_DM_CAIRN}).
#   __SCION_NAME__  display name (from PF), used only in comments.
cat > "$BLOCK_TPL" <<'EOF'

    # ---- __SCION_NAME__ (__SLUG__) ----
    set $engram___SLUG_VAR__ engram-__SHORT__:3030;
    set $forge___SLUG_VAR__  forge-__SHORT__:8100;

    location /__SLUG__/ws/telemetry {
        if ($admin_valid != "1") { return 401; }
        rewrite ^/__SLUG__(/.*)$ $1 break;
        proxy_pass http://$engram___SLUG_VAR__;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Sec-WebSocket-Protocol "bearer.$RAVEN_TOKEN___SLUG_UPPER__";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400;
        proxy_hide_header Sec-WebSocket-Protocol;
    }

    location /__SLUG__/ws/telemetry/public {
        limit_req zone=ws_public burst=5 nodelay;
        rewrite ^/__SLUG__(/.*)$ $1 break;
        proxy_pass http://$engram___SLUG_VAR__;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400;
    }

    location /__SLUG__/ws/pf/telemetry {
        if ($admin_valid != "1") { return 401; }
        rewrite ^/__SLUG__/ws/pf(/telemetry.*)$ /ws$1 break;
        proxy_pass http://$forge___SLUG_VAR__;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        # forge-dm /ws/telemetry is Raven-authed (health.py _AUTHED_ROUTES) —
        # same raven_token as the engram stream above. Morpheus is REST-only.
        proxy_set_header Sec-WebSocket-Protocol "bearer.$RAVEN_TOKEN___SLUG_UPPER__";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400;
        proxy_hide_header Sec-WebSocket-Protocol;
    }

    location /__SLUG__/ws/pf/telemetry/public {
        limit_req zone=ws_public burst=5 nodelay;
        rewrite ^/__SLUG__/ws/pf(/telemetry.*)$ /ws$1 break;
        proxy_pass http://$forge___SLUG_VAR__;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400;
    }

    location /__SLUG__/morpheus/ {
        if ($request_method = 'OPTIONS') { return 204; }
        rewrite ^/__SLUG__(/.*)$ $1 break;
        proxy_pass http://$forge___SLUG_VAR__;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header Authorization $morpheus_auth___SLUG_VAR__;
        proxy_read_timeout 120;
        proxy_hide_header Access-Control-Allow-Origin;
        proxy_hide_header Access-Control-Allow-Headers;
        proxy_hide_header Access-Control-Allow-Methods;
        proxy_hide_header Access-Control-Allow-Credentials;
        proxy_hide_header Access-Control-Expose-Headers;
        proxy_hide_header Access-Control-Max-Age;
    }
EOF

# Escape `name` for sed's replacement side (& and \ are sed-special) and
# pick a delimiter that won't appear in names — `|` (the placeholder
# fields themselves are all ASCII alphanumerics + underscores so the
# delimiter choice is safe for them too).
escape_sed_replacement() {
    printf '%s' "$1" | sed -e 's/[\\&|]/\\&/g'
}

# Fetch one Scion's telemetry tokens from forge-web, Bearer-authed by
# FORGE_WEB_ADMIN_TOKEN. Echoes the JSON body on HTTP 200, nothing
# otherwise. Raw HTTP/1.0 over nc — no curl/wget in the image (CVE
# posture; mirrors the /scions fetch above). Best-effort: any failure
# (unreachable, 403 when the admin token isn't wired, 404, 503) yields
# empty output and the caller leaves the token env var untouched.
fetch_telemetry_tokens() {
    _ftt_raw="/tmp/teltok.raw"
    rm -f "$_ftt_raw" "${_ftt_raw}.clean"
    { printf 'GET /scions/%s/telemetry-tokens HTTP/1.0\r\nHost: %s\r\nAuthorization: Bearer %s\r\nAccept: application/json\r\nConnection: close\r\n\r\n' \
        "$1" "$FORGE_WEB_HOST" "$FORGE_WEB_ADMIN_TOKEN"; sleep 2; } \
        | nc -w 10 "$FORGE_WEB_NAME" "$FORGE_WEB_PORT" > "$_ftt_raw" 2>/dev/null \
        || true
    if [ -s "$_ftt_raw" ]; then
        tr -d '\r' < "$_ftt_raw" > "${_ftt_raw}.clean"
        if [ "$(awk 'NR==1{print $2; exit}' "${_ftt_raw}.clean")" = "200" ]; then
            sed '1,/^$/d' "${_ftt_raw}.clean"
        fi
    fi
    # Wipe token material from /tmp — secrets must not persist in the
    # container filesystem after the caller has consumed the response.
    rm -f "$_ftt_raw" "${_ftt_raw}.clean"
}

: > "$MAPS_FRAGMENT"
: > "$BLOCKS_FRAGMENT"
# Admin auth secrets (Nooscope-hm4c) join the allow-list so envsubst injects
# them into the `set $session_secret`/`set $admin_hash` directives. Both are
# hex (or empty), so no nginx-string escaping concerns.
ENVSUBST_VARS='${FORGE_WEB_ADMIN_TOKEN} ${SESSION_SECRET} ${ADMIN_HASH}'

while IFS='	' read -r slug name badge scion_id short _soul; do
    # nginx variable names allow only [A-Za-z0-9_]; slugs with hyphens
    # need them translated to underscores for use in $engram_<slug> etc.
    slug_var=$(printf '%s' "$slug" | tr '-' '_')
    slug_upper=$(printf '%s' "$slug" | tr '[:lower:]-' '[:upper:]_')
    # runtime_short addresses the compose service (engram-<short> /
    # forge-<short>). Empty (older forge-web without the field) → fall back
    # to slug, which is correct whenever slug == runtime_short (speaker/helix).
    short=${short:-$slug}
    name_sed=$(escape_sed_replacement "$name")
    # Escape short for sed's replacement side (& \ | are special with the |
    # delimiter). In practice runtime_short is [a-z0-9-] (Docker Compose
    # service name constraints), so this never fires — but defensive escaping
    # costs nothing and is consistent with how name_sed is handled.
    short_sed=$(escape_sed_replacement "$short")

    # Per-Scion telemetry tokens: when the forge-web admin token is wired
    # up (prod mode), fetch each Scion's raven/morpheus tokens and export
    # them so envsubst injects the per-Scion bearer. This covers
    # dynamically-provisioned Scions whose tokens aren't hardcoded in the
    # compose env (only speaker/helix are). Best-effort: on any failure the
    # token env var stays as-is — public telemetry still works; admin
    # telemetry for that Scion degrades to a 401 the operator can diagnose.
    if [ -n "$FORGE_WEB_ADMIN_TOKEN" ] && [ -n "$NOOSCOPE_HOST" ]; then
        _ttok=$(fetch_telemetry_tokens "$scion_id")
        if [ -n "$_ttok" ]; then
            _rv=$(printf '%s' "$_ttok" | jq -r '.raven_token // ""')
            _mp=$(printf '%s' "$_ttok" | jq -r '.morpheus_token // ""')
            [ -n "$_rv" ] && export "RAVEN_TOKEN_${slug_upper}=${_rv}"
            [ -n "$_mp" ] && export "MORPHEUS_TOKEN_${slug_upper}=${_mp}"
        fi
    fi

    # The order of substitutions matters: __SLUG_VAR__ and __SLUG_UPPER__
    # both contain __SLUG__ as a substring, so we replace the more
    # specific placeholders first to avoid a leading __SLUG__ pass
    # eating the first segment of the longer placeholder.
    sed -e "s|__SLUG_UPPER__|${slug_upper}|g" \
        -e "s|__SLUG_VAR__|${slug_var}|g" \
        -e "s|__SLUG__|${slug}|g" \
        "$MAP_TPL" >> "$MAPS_FRAGMENT"

    sed -e "s|__SLUG_UPPER__|${slug_upper}|g" \
        -e "s|__SLUG_VAR__|${slug_var}|g" \
        -e "s|__SHORT__|${short_sed}|g" \
        -e "s|__SLUG__|${slug}|g" \
        -e "s|__SCION_NAME__|${name_sed}|g" \
        "$BLOCK_TPL" >> "$BLOCKS_FRAGMENT"

    # Grow the envsubst allow-list. Missing token env vars substitute
    # to empty — the per-Scion routes 401 upstream, which is a clear
    # failure mode the operator can diagnose from upstream logs.
    ENVSUBST_VARS="${ENVSUBST_VARS} \${RAVEN_TOKEN_${slug_upper}} \${MORPHEUS_TOKEN_${slug_upper}}"
done < "$SCION_TSV"

# --- 6. Splice fragments into the template + envsubst ---
awk -v maps_file="$MAPS_FRAGMENT" -v blocks_file="$BLOCKS_FRAGMENT" '
    # Strip a trailing CR first so a CRLF-checked-out template (a Windows
    # clone whose .gitattributes eol=lf rule did not win, or a local
    # docker build off a CRLF working tree) still matches the exact-line
    # markers below. Without this the splice silently no-ops and every
    # per-Scion /morpheus + /ws/telemetry route 404s to the SPA fallback,
    # surfacing as "<!DOCTYPE" / "Unexpected token <" in dreams.js & co.
    # Stripping CR from every line also normalizes the emitted config to LF.
    { sub(/\r$/, "") }
    # Exact-match the marker line so prose mentions of the placeholder in
    # the template header comment do not trigger splicing.
    $0 == "# {{SCION_MAPS}}" {
        while ((getline line < maps_file) > 0) print line
        close(maps_file)
        next
    }
    $0 == "    # {{SCION_BLOCKS}}" {
        while ((getline line < blocks_file) > 0) print line
        close(blocks_file)
        next
    }
    { print }
' "$NGINX_TEMPLATE" > "$NGINX_INTERMEDIATE"

envsubst "$ENVSUBST_VARS" < "$NGINX_INTERMEDIATE" > "$NGINX_CONF"

mode="${NOOSCOPE_HOST:+production}"
admin_state="${ADMIN_HASH:+enabled}"
echo "Nooscope ready (mode: ${mode:-dev}, admin: ${admin_state:-disabled})"

exec "$@"
