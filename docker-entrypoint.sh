#!/bin/sh
# Container start hook (Nooscope-r5kh, Nooscope-de9m):
#   1. Generate /js/config.js (Scion roster + adminHash) from either a
#      hardcoded dev list ([speaker, helix]) or a live fetch of
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
#   NOOSCOPE_ADMIN_PASSWORD          plain admin password; we SHA-256 it
#                                    and only the hex digest reaches the
#                                    browser (config.js adminHash). Empty
#                                    = admin login disabled (public-only).
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
#   RAVEN_TOKEN_<SLUG>               engram WS auth bearer (per Scion)
#   MORPHEUS_TOKEN_<SLUG>            forge WS + REST bearer (per Scion)
#   FORGE_WEB_ADMIN_TOKEN            cross-Scion admin web bearer

set -e

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

# --- 1. Admin password hash ---
# SHA-256 the password and emit the lowercase hex digest. The plaintext
# never reaches disk in the served bundle. An empty password means
# "no admin login configured" — auth.js then treats login as disabled.
if [ -n "$NOOSCOPE_ADMIN_PASSWORD" ]; then
    ADMIN_HASH=$(printf '%s' "$NOOSCOPE_ADMIN_PASSWORD" | sha256sum | cut -d' ' -f1)
else
    ADMIN_HASH=""
fi

# --- 2. Discover Scion roster (TSV: slug, name, badge) ---
# Two paths:
#   prod (NOOSCOPE_HOST set): GET /scions on forge-web with retry. Fail
#       container start if forge-web doesn't respond after retries — no
#       baked-in fallback list (any fallback embeds a stale assumption
#       about the fleet).
#   dev (NOOSCOPE_HOST unset): hardcoded speaker + helix with badge
#       'live-online'. Keeps the dev-shape config.js (per-port) the
#       frontend already understands.
FORGE_WEB_HOST="${FORGE_WEB_HOST:-forge-web:8200}"

if [ -n "$NOOSCOPE_HOST" ]; then
    SCIONS_URL="http://${FORGE_WEB_HOST}/scions"
    echo "Nooscope: fetching Scion roster from ${SCIONS_URL}"

    # BusyBox wget supports --header, --timeout, --tries. We layer our
    # own retry loop on top because forge-web may not be up the instant
    # Nooscope starts (compose service ordering can race).
    SCIONS_JSON=""
    attempt=1
    while [ "$attempt" -le 5 ]; do
        if SCIONS_JSON=$(wget -q -O - \
                --header "Accept: application/json" \
                --timeout=10 \
                --tries=1 \
                "$SCIONS_URL" 2>/dev/null); then
            break
        fi
        echo "Nooscope: /scions fetch attempt ${attempt}/5 failed, retrying in 2s"
        attempt=$((attempt + 1))
        sleep 2
    done

    if [ -z "$SCIONS_JSON" ]; then
        echo "FATAL: could not reach ${SCIONS_URL} after 5 attempts. Refusing to start with a stale Scion list." >&2
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
    printf '%s' "$SCIONS_JSON" \
        | jq -r '.scions[] | select(.engram_bound == true)
                | [.scion_slug, .name, .badge, .scion_id] | @tsv' \
        > "$SCION_TSV"
else
    cat > "$SCION_TSV" <<'EOF'
speaker	Speaker	live-online	dh-speaker
helix	Helix	live-online	dh-helix
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
        # Prod shape: { host, pfPrefix, name, badge, scionId }.
        while IFS='	' read -r slug name badge scion_id; do
            name_js=$(escape_js_single "$name")
            printf "    %s: { host: '%s', pfPrefix: '/%s', name: '%s', badge: '%s', scionId: '%s' },\n" \
                "$slug" "$NOOSCOPE_HOST" "$slug" "$name_js" "$badge" "$scion_id"
        done < "$SCION_TSV"
    else
        # Dev shape: { thriden, pf, name, badge, scionId }. Only
        # speaker + helix are wired in dev — same scope as the pre-de9m
        # behavior. scionId carries the canonical PF identifier so
        # social.js can call /admin/scions/{scionId}/... uniformly.
        printf "    speaker: { thriden: %s, pf: %s, name: 'Speaker', badge: 'live-online', scionId: 'dh-speaker' },\n" \
            "${SPEAKER_THRIDEN_PORT:-3030}" "${SPEAKER_PF_PORT:-8100}"
        printf "    helix:   { thriden: %s, pf: %s, name: 'Helix', badge: 'live-online', scionId: 'dh-helix' },\n" \
            "${HELIX_THRIDEN_PORT:-3031}" "${HELIX_PF_PORT:-8101}"
    fi
    printf '  },\n'
    printf '  defaults: {\n'
    if [ -z "$NOOSCOPE_HOST" ]; then
        printf "    thridenPort: %s,\n" "${SPEAKER_THRIDEN_PORT:-3030}"
        printf "    pfPort: %s,\n" "${SPEAKER_PF_PORT:-8100}"
    fi
    printf '  },\n'
    printf "  adminHash: '%s',\n" "$ADMIN_HASH"
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
    while IFS='	' read -r slug name badge scion_id; do
        printf '  %s\t%s\t%s\t%s\n' "$slug" "$name" "$badge" "$scion_id"
    done < "$SCION_TSV"
} > "$HEALTHZ_PATH"

# --- 5. Per-Scion nginx fragments ---
# Templates are written once to temp files; each iteration sed-renders
# them and appends to the fragment files. The placeholders __SLUG__,
# __SLUG_UPPER__, __SCION_NAME__ don't collide with nginx's `$variable`
# references or with the `${VAR}` envsubst placeholders.

cat > "$MAP_TPL" <<'EOF'
map $cookie_nooscope_admin $morpheus_auth___SLUG_VAR__ {
    "1"     "Bearer $MORPHEUS_TOKEN___SLUG_UPPER__";
    default "";
}
EOF

# Templates use three placeholders:
#   __SLUG__        the raw slug, used in URL paths and docker hostnames
#                   (e.g. /dm-cairn/..., engram-dm-cairn:3030)
#   __SLUG_VAR__    slug with hyphens → underscores, used in nginx variable
#                   names (e.g. $engram_dm_cairn). nginx forbids hyphens in
#                   variable names.
#   __SLUG_UPPER__  uppercase + hyphens → underscores, used as env-var
#                   suffix for envsubst (e.g. ${RAVEN_TOKEN_DM_CAIRN}).
#   __SCION_NAME__  display name (from PF), used only in comments.
cat > "$BLOCK_TPL" <<'EOF'

    # ---- __SCION_NAME__ (__SLUG__) ----
    set $engram___SLUG_VAR__ engram-__SLUG__:3030;
    set $forge___SLUG_VAR__  forge-__SLUG__:8100;

    location /__SLUG__/ws/telemetry {
        if ($cookie_nooscope_admin != "1") { return 401; }
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
        if ($cookie_nooscope_admin != "1") { return 401; }
        rewrite ^/__SLUG__/ws/pf(/telemetry.*)$ /ws$1 break;
        proxy_pass http://$forge___SLUG_VAR__;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Sec-WebSocket-Protocol "bearer.$MORPHEUS_TOKEN___SLUG_UPPER__";
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

: > "$MAPS_FRAGMENT"
: > "$BLOCKS_FRAGMENT"
ENVSUBST_VARS='${FORGE_WEB_ADMIN_TOKEN}'

while IFS='	' read -r slug name badge scion_id; do
    # nginx variable names allow only [A-Za-z0-9_]; slugs with hyphens
    # need them translated to underscores for use in $engram_<slug> etc.
    slug_var=$(printf '%s' "$slug" | tr '-' '_')
    slug_upper=$(printf '%s' "$slug" | tr '[:lower:]-' '[:upper:]_')
    name_sed=$(escape_sed_replacement "$name")

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
