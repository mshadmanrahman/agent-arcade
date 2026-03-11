#!/usr/bin/env node
/**
 * Bundle webview TypeScript into a single JS file using esbuild.
 * Produces out/webview/bundle.js and out/webview/index.html.
 */

const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, '..', 'src', 'webview');
const OUT_DIR = path.join(__dirname, '..', 'out', 'webview');

async function bundle() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // Bundle renderer.ts (which imports all other webview modules)
  const result = await esbuild.build({
    entryPoints: [path.join(SRC_DIR, 'renderer.ts')],
    bundle: true,
    outfile: path.join(OUT_DIR, 'bundle.js'),
    format: 'iife',
    platform: 'browser',
    target: 'es2020',
    minify: false,
    sourcemap: false,
    // Don't try to resolve 'vscode' API; it's provided by the webview runtime
    external: [],
    define: {
      'process.env.NODE_ENV': '"production"',
    },
  });

  if (result.errors.length > 0) {
    console.error('esbuild errors:', result.errors);
    process.exit(1);
  }

  // Read the bundled JS
  const bundleJs = fs.readFileSync(path.join(OUT_DIR, 'bundle.js'), 'utf-8');

  // Read HTML template and inline the bundle
  let html = fs.readFileSync(path.join(SRC_DIR, 'index.html'), 'utf-8');
  html = html.replace('<!-- SCRIPTS_PLACEHOLDER -->', `<script>\n${bundleJs}\n</script>`);
  fs.writeFileSync(path.join(OUT_DIR, 'index.html'), html);

  console.log('Webview bundled successfully with esbuild');
}

bundle().catch((err) => {
  console.error('Bundle failed:', err);
  process.exit(1);
});
