# ==========================================
# Stage 1: Build stage
# ==========================================
FROM node:24-alpine AS builder

WORKDIR /app

# Enable Corepack and activate pinned pnpm version (matching packageManager in package.json)
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

# Install dependencies with frozen lockfile and scripts disabled
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts

# Copy the remaining project files and build
COPY . .
ARG BUILD_MODE=production
ARG VITE_API_URL
ARG VITE_API_BASE_URL
ARG VITE_WS_URL
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_WS_URL=${VITE_WS_URL}
RUN if [ "$BUILD_MODE" = "cocina" ]; then \
      pnpm run build:cocina && cp -r /app/dist-cocina /app/out; \
    else \
      pnpm run build && cp -r /app/dist /app/out; \
    fi

# ==========================================
# Stage 2: Production stage with unprivileged Nginx
# ==========================================
FROM nginxinc/nginx-unprivileged:alpine

# Copy build artifacts to Nginx web root (keep root:root read-only ownership)
COPY --from=builder /app/out /usr/share/nginx/html

# Configure Nginx on unprivileged port 8080 with strict CSP and explicit CORS allowlist
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Run explicitly as non-root user
USER nginx

# Expose unprivileged port 8080
EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
