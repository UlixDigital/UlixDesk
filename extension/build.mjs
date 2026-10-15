import { execSync } from "node:child_process";
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { deflateRawSync } from "node:zlib";
import * as esbuild from "esbuild";
import { writeDosDateTime } from "./dos-date.mjs";

const root = process.cwd();
const dist = path.join(root, "extension", "dist");
const zipPath = path.join(root, "extension", "ulixdesk-extension.zip");

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

execSync("npx tsc -p extension/tsconfig.json --noEmit", { stdio: "inherit" });

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

await esbuild.build({
  entryPoints: {
    background: "extension/src/background.ts",
    popup: "extension/src/popup.ts",
    options: "extension/src/options.ts",
  },
  bundle: true,
  format: "esm",
  target: "chrome120",
  outdir: dist,
  legalComments: "none",
});

await esbuild.build({
  entryPoints: ["extension/src/extension.css"],
  bundle: true,
  outfile: path.join(dist, "extension.css"),
  legalComments: "none",
});

for (const file of ["popup.html", "options.html", "ulix-logo.svg"]) {
  cpSync(path.join(root, "extension", "src", file), path.join(dist, file));
}
cpSync(path.join(root, "extension", "manifest.json"), path.join(dist, "manifest.json"));

const iconDir = path.join(dist, "icons");
mkdirSync(iconDir, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  cpSync(
    path.join(root, "extension", "icons", `icon${size}.png`),
    path.join(iconDir, `icon${size}.png`),
  );
}

writeFileSync(zipPath, zipDirectory(dist));
console.log(`Unpacked extension: ${dist}`);
console.log(`Extension zip: ${zipPath}`);

function zipDirectory(directory, builtAt = new Date()) {
  const files = [];
  collect(directory, directory, files);
  const parts = [];
  const central = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name);
    const data = file.data;
    const compressed = deflateRawSync(data);
    const checksum = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8);
    writeDosDateTime(local, 10, builtAt);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const localRecord = Buffer.concat([local, name, compressed]);
    parts.push(localRecord);

    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(8, 10);
    writeDosDateTime(header, 12, builtAt);
    header.writeUInt32LE(checksum, 16);
    header.writeUInt32LE(compressed.length, 20);
    header.writeUInt32LE(data.length, 24);
    header.writeUInt16LE(name.length, 28);
    header.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([header, name]));
    offset += localRecord.length;
  }
  const centralDirectory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, centralDirectory, end]);
}

function collect(directory, base, files) {
  for (const entry of readdirSync(directory)) {
    const full = path.join(directory, entry);
    const info = statSync(full);
    if (info.isDirectory()) {
      collect(full, base, files);
      continue;
    }
    const name = path.relative(base, full).split(path.sep).join("/");
    files.push({ name, data: readFileSync(full) });
  }
}
