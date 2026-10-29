import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

// `vite preview` sends the same security headers (CSP etc.) as production, so local tests
// catch anything the Content-Security-Policy would block.
const vercel = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8')) as {
  headers: { source: string; headers: { key: string; value: string }[] }[];
};
const securityHeaders = Object.fromEntries(
  (vercel.headers.find((h) => h.source === '/(.*)')?.headers ?? [])
    .filter((h) => h.key !== 'Strict-Transport-Security' && !h.value.includes('upgrade-insecure-requests'))
    .map((h) => [h.key, h.value]),
);
const csp = vercel.headers.find((h) => h.source === '/(.*)')?.headers.find((h) => h.key === 'Content-Security-Policy')?.value;
if (csp) securityHeaders['Content-Security-Policy'] = csp.replace(/;\s*upgrade-insecure-requests/, '');

export default defineConfig({
  esbuild: { jsx: 'transform', jsxFactory: 'React.createElement', jsxFragment: 'React.Fragment' },
  build: { outDir: 'dist', sourcemap: false },
  // Local full-stack: `npm run dev:api` serves /api on :3001.
  server: { proxy: { '/api': { target: 'http://localhost:3001', changeOrigin: false } } },
  preview: { proxy: { '/api': { target: 'http://localhost:3001', changeOrigin: false } }, headers: securityHeaders },
});
