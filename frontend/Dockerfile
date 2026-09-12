# No build stage needed - this is plain HTML/CSS/JS (ES modules), no bundler.
# nginx just serves the files directly.
FROM nginx:alpine
COPY . /usr/share/nginx/html

# config.js is gitignored (for local dev - see frontend/js/config.example.js).
# Render builds from the GitHub repo, not your local disk, so config.js
# simply won't be present in that build context. Fall back to the committed
# production config in that case - see config.production.example.js for why
# this is safe to commit (no real secret lives in it since the OpenFreeMap
# switch removed the Mapbox token requirement).
RUN if [ ! -f /usr/share/nginx/html/js/config.js ]; then \
      cp /usr/share/nginx/html/js/config.production.example.js /usr/share/nginx/html/js/config.js; \
    fi

EXPOSE 80
