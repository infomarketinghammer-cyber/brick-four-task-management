/**
 * Builds the app in Vercel's Build Output API format (.vercel/output):
 *   static/            -> the Vite frontend (served from Vercel's CDN)
 *   functions/api.func -> the Express API bundled into one serverless function
 * Run by Vercel via `npm run build:vercel` (see vercel.json).
 */

import { build as viteBuild } from 'vite';
import { build as esbuild } from 'esbuild';
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const out = path.join(root, '.vercel', 'output');
const funcDir = path.join(out, 'functions', 'api.func');

fs.rmSync(out, { recursive: true, force: true });

// 1. Frontend. Socket.IO needs a long-running server, so the client polls for updates instead.
process.env.VITE_REALTIME = 'off';
await viteBuild({ build: { outDir: path.join(out, 'static'), emptyOutDir: true } });

// 2. API function: one self-contained CommonJS file (no node_modules needed at runtime)
await esbuild({
  entryPoints: [path.join(root, 'src', 'vercelHandler.ts')],
  outfile: path.join(funcDir, 'index.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  sourcemap: true,
  // vite is only used by the local dev server; the rest are optional native add-ons of mongodb/ws
  external: [
    'vite',
    'kerberos',
    '@mongodb-js/zstd',
    '@aws-sdk/credential-providers',
    'snappy',
    'socks',
    'aws4',
    'mongodb-client-encryption',
    'bufferutil',
    'utf-8-validate',
  ],
  // Some ESM dependencies (node-cron) read import.meta.url, which is empty in a CommonJS bundle
  define: { 'import.meta.url': '__importMetaUrl' },
  banner: { js: 'const __importMetaUrl = require("url").pathToFileURL(__filename).href;' },
  // Vercel's launcher expects the handler as the module export
  footer: { js: 'module.exports = module.exports.default;' },
  logLevel: 'warning',
});

fs.writeFileSync(
  path.join(funcDir, '.vc-config.json'),
  JSON.stringify({ runtime: 'nodejs20.x', handler: 'index.cjs', launcherType: 'Nodejs', maxDuration: 30 }, null, 2)
);

// 3. Routing: API calls go to the function; everything else is a static file or the SPA entry
fs.writeFileSync(
  path.join(out, 'config.json'),
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: '^/api/(.*)$', dest: '/api' },
        { handle: 'filesystem' },
        { src: '^/(.*)$', dest: '/index.html' },
      ],
    },
    null,
    2
  )
);

console.log('Vercel build output written to .vercel/output');
