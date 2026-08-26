// Copies the pdf.js worker that ships with our pinned pdfjs-dist version
// into /public so react-pdf can load it from same-origin instead of an
// unpinned, no-SRI unpkg.com CDN URL. Runs automatically via postinstall
// so it always matches the installed pdfjs-dist version.
const fs = require("node:fs");
const path = require("node:path");

const src = require.resolve("pdfjs-dist/build/pdf.worker.min.mjs");
const destDir = path.join(__dirname, "..", "public");
const dest = path.join(destDir, "pdf.worker.min.mjs");

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);
console.log(`[copy-pdf-worker] copied ${src} -> ${dest}`);
