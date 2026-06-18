FROM nginxinc/nginx-unprivileged:alpine

USER root

# Copy static files
COPY index.html dreams.html social.html logs.html /usr/share/nginx/html/
COPY favicon.ico favicon-16x16.png favicon-32x32.png apple-touch-icon.png /usr/share/nginx/html/
COPY css/ /usr/share/nginx/html/css/
COPY js/ /usr/share/nginx/html/js/
COPY models/ /usr/share/nginx/html/models/

# Production nginx config as a template — docker-entrypoint envsubsts per-
# Scion tokens into it at container start (Nooscope-r5kh).
COPY nginx.conf.template /etc/nginx/conf.d/default.conf.template

# Entrypoint generates config.js + nginx config from env / forge-web's
# /scions registry (Nooscope-de9m). Tooling:
#   - gettext (envsubst) — substitutes per-Scion bearer tokens into the
#     rendered nginx config without touching nginx's own `$variable`
#     references. The upstream image doesn't ship it.
#   - jq — parses the JSON shape returned by forge-web's /scions endpoint
#     so the entrypoint can loop over the discovered Scion roster.
# Fetching /scions uses BusyBox `nc` (already in the base image), NOT
# curl. f624b74 dropped curl to clear three High CVEs (alpine 3.23
# curl <8.19); we keep that posture. The probe speaks raw HTTP/1.0 over
# nc so it can read PF's first-run 503 body (BusyBox wget unlinks the
# body on any 4xx/5xx) — see docker-entrypoint.sh (Nooscope-thvl/oh9z).
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN apk add --no-cache gettext jq \
    && apk del curl \
    && chmod +x /docker-entrypoint.sh \
    && chown -R nginx:nginx /usr/share/nginx/html \
    && chown -R nginx:nginx /etc/nginx/conf.d

USER nginx

EXPOSE 8080

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
