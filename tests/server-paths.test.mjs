import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveProductionDistPath } from "../server.js";

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
