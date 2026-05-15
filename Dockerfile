FROM nginxinc/nginx-unprivileged:alpine

USER root

# Copy static files
COPY index.html dreams.html social.html /usr/share/nginx/html/
COPY favicon.ico favicon-16x16.png favicon-32x32.png apple-touch-icon.png /usr/share/nginx/html/
COPY css/ /usr/share/nginx/html/css/
COPY js/ /usr/share/nginx/html/js/
COPY models/ /usr/share/nginx/html/models/

# Production nginx config as a template — docker-entrypoint envsubsts per-
# Scion tokens into it at container start (Nooscope-r5kh).
COPY nginx.conf.template /etc/nginx/conf.d/default.conf.template

# Entrypoint generates config.js from env vars and materializes the nginx
# config from its template before nginx starts. gettext provides envsubst;
# the upstream image doesn't ship it.
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN apk add --no-cache gettext \
    && chmod +x /docker-entrypoint.sh \
    && chown -R nginx:nginx /usr/share/nginx/html \
    && chown -R nginx:nginx /etc/nginx/conf.d

USER nginx

EXPOSE 8080

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
