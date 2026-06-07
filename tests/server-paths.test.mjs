import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveProductionDistPath } from "../server.js";

const serverSource = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8");
const packageJson = JSON.parse(
  fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
const devDependencyNames = new Set(Object.keys(packageJson.devDependencies || {}));

const topLevelPackageImports = [...serverSource.matchAll(/^import\s+.+?\s+from\s+"([^./][^"]*)";/gm)]
  .map((match) => match[1]);

assert.doesNotMatch(
  serverSource,
  /^import\s+\{[^}]*createServer\s+as\s+createViteServer[^}]*\}\s+from\s+"vite";/m,
  "production server entry should not require vite at module load time",
);
assert.match(
  serverSource,
  /await import\("vite"\)/,
  "development-only vite loading should stay lazy to avoid production runtime dependency",
);
assert.deepEqual(
  topLevelPackageImports.filter((name) => devDependencyNames.has(name)),
  [],
  "production server entry should not import devDependencies at module load time",
);

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "baozhi-server-paths-"));

const rootModeDir = path.join(tempRoot, "root-mode");
fs.mkdirSync(path.join(rootModeDir, "dist"), { recursive: true });
fs.writeFileSync(path.join(rootModeDir, "dist", "index.html"), "<html></html>");

assert.equal(
  resolveProductionDistPath(rootModeDir),
  path.join(rootModeDir, "dist"),
  "unbundled production server should serve the root dist directory",
);

const bundledModeDir = path.join(tempRoot, "bundled-mode");
fs.mkdirSync(bundledModeDir, { recursive: true });
fs.writeFileSync(path.join(bundledModeDir, "index.html"), "<html></html>");

assert.equal(
  resolveProductionDistPath(bundledModeDir),
  bundledModeDir,
  "bundled dist/server.js should serve static assets from its own directory",
);

fs.rmSync(tempRoot, { recursive: true, force: true });

console.log("server path test passed");
