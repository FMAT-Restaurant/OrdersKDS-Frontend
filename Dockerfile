# ==========================================
# Stage 1: Build stage
# ==========================================
FROM node:20-alpine AS builder

WORKDIR /app

# Enable Corepack and activate pinned pnpm version (bundled in Node 20)
RUN corepack enable && corepack prepare pnpm@12.18.0 --activate

# Install dependencies with frozen lockfile and scripts disabled
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts

# Copy the remaining project files and build
COPY . .
ARG VITE_API_URL
ARG VITE_API_BASE_URL
ARG VITE_WS_URL
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_WS_URL=${VITE_WS_URL}
RUN pnpm run build

# ==========================================
# Stage 2: Production stage with unprivileged Nginx
# ==========================================
FROM nginxinc/nginx-unprivileged:alpine

# Copy build artifacts to Nginx web root (keep root:root read-only ownership)
COPY --from=builder /app/dist /usr/share/nginx/html

# Configure Nginx on unprivileged port 8080 with CORS headers for Module Federation
RUN printf 'server {\n\
    listen 8080;\n\
    server_name localhost;\n\
\n\
    location / {\n\
        root /usr/share/nginx/html;\n\
        index index.html index.htm;\n\
        try_files $uri $uri/ /index.html;\n\
\n\
        # CORS headers\n\
        add_header Access-Control-Allow-Origin * always;\n\
        add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, PATCH, OPTIONS" always;\n\
        add_header Access-Control-Allow-Headers "DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range,Authorization" always;\n\
        add_header Access-Control-Expose-Headers "Content-Length,Content-Range" always;\n\
\n\
        if ($request_method = "OPTIONS") {\n\
            add_header Access-Control-Allow-Origin *;\n\
            add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, PATCH, OPTIONS";\n\
            add_header Access-Control-Allow-Headers "DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range,Authorization";\n\
            add_header Access-Control-Max-Age 1728000;\n\
            add_header Content-Type "text/plain; charset=utf-8";\n\
            add_header Content-Length 0;\n\
            return 204;\n\
        }\n\
    }\n\
}\n' > /etc/nginx/conf.d/default.conf

# Run explicitly as non-root user
USER nginx

# Expose unprivileged port 8080
EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
