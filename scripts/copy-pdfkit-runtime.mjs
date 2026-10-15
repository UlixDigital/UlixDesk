/**
 * Copy pdfkit and its production dependency closure for the Docker runner.
 * pdfkit is a server external (AFM files and fontkit), so Next standalone
 * does not bundle it. Headless Chromium is not used.
 */
import { cpSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const root = process.cwd();
const dest = process.argv[2];
if (!dest) {
  console.error("Usage: node scripts/copy-pdfkit-runtime.mjs <dest>");
  process.exit(1);
}

const seen = new Set();

function walk(name) {
  if (seen.has(name)) return;
  const pkgPath = join(root, "node_modules", name, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  seen.add(name);
  for (const dep of Object.keys(pkg.dependencies ?? {})) walk(dep);
}

walk("pdfkit");

for (const name of seen) {
  const from = join(root, "node_modules", name);
  const to = join(dest, name);
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to, { recursive: true, dereference: true });
}

console.log([...seen].sort().join("\n"));
