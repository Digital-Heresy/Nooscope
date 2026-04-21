FROM nginxinc/nginx-unprivileged:alpine

USER root

# Copy static files
COPY index.html dreams.html /usr/share/nginx/html/
COPY favicon.ico favicon-16x16.png favicon-32x32.png apple-touch-icon.png /usr/share/nginx/html/
COPY css/ /usr/share/nginx/html/css/
COPY js/ /usr/share/nginx/html/js/
COPY models/ /usr/share/nginx/html/models/

# Production nginx config with WebSocket proxy
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Entrypoint generates config.js from env vars before nginx starts
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh \
    && chown -R nginx:nginx /usr/share/nginx/html

USER nginx

EXPOSE 8080

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
