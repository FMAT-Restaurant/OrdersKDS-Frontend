import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(__dirname, '../..');

function readRepoFile(relativePath: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

describe('Docker, Nginx, and Vite security configuration', () => {
  it('uses Node 24, pinned pnpm@9.15.9, and external nginx.conf without wildcard CORS in Dockerfile', () => {
    const dockerfile = readRepoFile('Dockerfile');

    expect(dockerfile).toContain('FROM node:24-alpine AS builder');
    expect(dockerfile).toContain('pnpm@9.15.9');
    expect(dockerfile).toContain('COPY nginx.conf /etc/nginx/conf.d/default.conf');
    expect(dockerfile).toContain('USER nginx');
    expect(dockerfile).toContain('EXPOSE 8080');
    expect(dockerfile).not.toContain('node:20-alpine');
    expect(dockerfile).not.toContain('Access-Control-Allow-Origin *');
  });

  it('enforces explicit CORS allowlist and strict production CSP in nginx.conf', () => {
    const nginxConf = readRepoFile('nginx.conf');

    expect(nginxConf).toContain('map $http_origin $cors_origin');
    expect(nginxConf).toContain('default "";');
    expect(nginxConf).toContain('add_header Access-Control-Allow-Origin $cors_origin always;');
    expect(nginxConf).toContain('add_header Vary "Origin" always;');
    expect(nginxConf).not.toContain('Access-Control-Allow-Origin *');

    for (const port of ['3000', '4173', '5173', '5174', '5175', '5176', '5177', '5178', '5179', '8000']) {
      expect(nginxConf).toContain(port);
    }

    expect(nginxConf).toContain('add_header Content-Security-Policy');
    expect(nginxConf).not.toContain('unsafe-inline');
    expect(nginxConf).not.toContain('unsafe-eval');
    expect(nginxConf).toContain('add_header Cross-Origin-Opener-Policy "same-origin" always;');
    expect(nginxConf).toContain('add_header Cross-Origin-Resource-Policy "cross-origin" always;');
    expect(nginxConf).toContain('add_header Permissions-Policy "geolocation=(), camera=(), microphone=()" always;');
    expect(nginxConf).toContain('add_header Referrer-Policy "strict-origin-when-cross-origin" always;');
    expect(nginxConf).toContain('add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;');
    expect(nginxConf).toContain('add_header X-Content-Type-Options "nosniff" always;');
    expect(nginxConf).toContain('add_header X-Frame-Options "DENY" always;');
  });

  it('includes all FMAT MFE and Shell ports in vite.config.ts default allowlist without wildcard', () => {
    const viteConfig = readRepoFile('vite.config.ts');

    for (const port of ['3000', '4173', '5173', '5174', '5175', '5176', '5177', '5178', '5179', '8000']) {
      expect(viteConfig).toContain(port);
    }
    expect(viteConfig).toContain('VITE_CORS_ALLOWED_ORIGINS must not contain a wildcard origin.');
  });

  it('self-hosts Inter font locally without external Google Fonts links in index.html', () => {
    const indexHtml = readRepoFile('index.html');
    const mainTsx = readRepoFile('src/main.tsx');

    expect(indexHtml).not.toContain('fonts.googleapis.com');
    expect(indexHtml).not.toContain('fonts.gstatic.com');
    expect(mainTsx).toContain("@fontsource/inter/400.css");
    expect(mainTsx).toContain("@fontsource/inter/900.css");
  });
});
