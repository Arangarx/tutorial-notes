#!/usr/bin/env node
/**
 * Copies the pdfjs-dist worker bundle into `public/pdfjs/` so that
 * `pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs"`
 * resolves at runtime in the browser.
 *
 * Why we don't import the worker through the bundler:
 *   - pdfjs ships its worker as a separate ES module that expects to
 *     run as `new Worker(url, { type: "module" })`. Next.js doesn't
 *     have first-class worker support (no `?worker` suffix like Vite),
 *     and trying to teach Webpack/Turbopack to chunk an arbitrary
 *     dynamic import as a worker entry leads to subtle production-vs-
 *     dev breakage (the worker chunk gets a different file name than
 *     the main bundle expects, the URL constructor rewrite gets
 *     skipped, etc.).
 *   - Hosting the worker as a static file in `public/` sidesteps all
 *     of that. The worker URL is stable across builds, the file is
 *     CDN-cached, and there's nothing for the bundler to reason about.
 *
 * Cadence: runs from npm `postinstall`. The destination is
 * `.gitignored`, so a fresh clone followed by `npm install` always
 * picks up the worker that matches the locked pdfjs-dist version.
 *
 * If pdfjs-dist isn't installed yet (e.g. a partial CI cache restore)
 * we exit 0 with a warning so we don't block the rest of postinstall.
 */
import { existsSync, mkdirSync, copyFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

const sourceDir = join(repoRoot, "node_modules", "pdfjs-dist", "build");
const destDir = join(repoRoot, "public", "pdfjs");

const filesToCopy = [
  // The worker is the only file we strictly need; the readable mjs
  // copy is useful when debugging in dev.
  "pdf.worker.min.mjs",
];

function main() {
  if (!existsSync(sourceDir)) {
    console.warn(
      `[copy-pdfjs-worker] pdfjs-dist not found at ${sourceDir}; skipping. ` +
        `If you expected pdfjs to be installed, re-run \`npm install\` and check the output.`
    );
    return;
  }

  mkdirSync(destDir, { recursive: true });
  for (const file of filesToCopy) {
    const src = join(sourceDir, file);
    const dst = join(destDir, file);
    if (!existsSync(src)) {
      console.warn(`[copy-pdfjs-worker] missing source file: ${src}`);
      continue;
    }
    copyFileSync(src, dst);
    console.log(`[copy-pdfjs-worker] copied ${file} -> public/pdfjs/${file}`);
  }
}

main();
