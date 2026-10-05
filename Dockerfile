# ==========================================
# Stage 1: Build stage
# ==========================================
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm globally
RUN npm install -g pnpm

# Install dependencies with frozen lockfile
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy the remaining project files and build
COPY . .
RUN pnpm run build

# ==========================================
# Stage 2: Production stage with Nginx
# ==========================================
FROM nginx:alpine

# Copy build artifacts to Nginx web root
COPY --from=builder /app/dist /usr/share/nginx/html

# Configure Nginx with CORS headers for Module Federation remote access
RUN printf 'server {\n\
    listen 80;\n\
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

# Expose port 80
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
