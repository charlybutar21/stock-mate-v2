import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const ASSETS_DIR = path.resolve(process.cwd(), 'dist', 'client', 'assets');
const MAX_ENTRY_RAW_KB = 250;
const MAX_ANY_CHUNK_RAW_KB = 500;

if (!fs.existsSync(ASSETS_DIR)) {
  console.error(`Bundle check failed: ${ASSETS_DIR} not found. Run "npm run build" first.`);
  process.exit(1);
}

const jsFiles = fs
  .readdirSync(ASSETS_DIR)
  .filter((name) => name.endsWith('.js'))
  .map((name) => {
    const fullPath = path.join(ASSETS_DIR, name);
    const buf = fs.readFileSync(fullPath);
    const gzipBytes = zlib.gzipSync(buf, { level: 9 }).length;
    return {
      name,
      rawKb: Number((buf.length / 1024).toFixed(2)),
      gzipKb: Number((gzipBytes / 1024).toFixed(2)),
    };
  })
  .sort((a, b) => b.rawKb - a.rawKb);

const entryChunk = jsFiles.find((f) => /^index-[A-Za-z0-9_-]+\.js$/.test(f.name));
if (!entryChunk) {
  console.error('Bundle check failed: main client entry chunk (index-*.js) not found.');
  process.exit(1);
}

let failed = false;

console.log(`Client entry chunk: ${entryChunk.name} — ${entryChunk.rawKb} kB (${entryChunk.gzipKb} kB gzip)`);

if (entryChunk.rawKb > MAX_ENTRY_RAW_KB) {
  console.error(
    `FAIL: Entry chunk ${entryChunk.rawKb} kB exceeds ${MAX_ENTRY_RAW_KB} kB budget.`,
  );
  failed = true;
}

for (const file of jsFiles) {
  if (file.rawKb > MAX_ANY_CHUNK_RAW_KB) {
    console.error(
      `FAIL: Chunk ${file.name} (${file.rawKb} kB) exceeds ${MAX_ANY_CHUNK_RAW_KB} kB single-chunk budget.`,
    );
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}

console.log(
  `PASS: All ${jsFiles.length} client JS chunks are within budgets (entry <= ${MAX_ENTRY_RAW_KB} kB, max chunk <= ${MAX_ANY_CHUNK_RAW_KB} kB).`,
);
