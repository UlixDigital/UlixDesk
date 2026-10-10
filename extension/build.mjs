import { execSync } from "node:child_process";
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { deflateRawSync, deflateSync } from "node:zlib";
import * as esbuild from "esbuild";

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

for (const file of ["popup.html", "options.html", "extension.css"]) {
  cpSync(path.join(root, "extension", "src", file), path.join(dist, file));
}
cpSync(path.join(root, "extension", "manifest.json"), path.join(dist, "manifest.json"));

const iconDir = path.join(dist, "icons");
mkdirSync(iconDir, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  writeFileSync(path.join(iconDir, `icon${size}.png`), png(size, size, drawIcon(size)));
}

writeFileSync(zipPath, zipDirectory(dist));
console.log(`Unpacked extension: ${dist}`);
console.log(`Extension zip: ${zipPath}`);

function drawIcon(size) {
  const pixels = Buffer.alloc(size * size * 4, 0);
  const teal = [15, 118, 110, 255];
  const white = [255, 255, 255, 255];
  const radius = size * 0.22;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (inRoundRect(x + 0.5, y + 0.5, size, radius)) setPixel(pixels, size, x, y, teal);
    }
  }
  const center = (size - 1) / 2;
  const outer = size * 0.28;
  const inner = outer - Math.max(1, size * 0.06);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const distance = Math.hypot(x - center, y - center);
      if (distance <= outer && distance >= inner) setPixel(pixels, size, x, y, white);
    }
  }
  stroke(pixels, size, center, center, center, center - outer * 0.72, white);
  stroke(pixels, size, center, center, center + outer * 0.55, center + outer * 0.15, white);
  return pixels;
}

function inRoundRect(x, y, size, radius) {
  const left = radius;
  const right = size - radius;
  const top = radius;
  const bottom = size - radius;
  if (x >= left && x <= right) return y >= 0 && y <= size;
  if (y >= top && y <= bottom) return x >= 0 && x <= size;
  const cx = x < left ? left : right;
  const cy = y < top ? top : bottom;
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
}

function setPixel(pixels, size, x, y, color) {
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  const offset = (y * size + x) * 4;
  pixels[offset] = color[0];
  pixels[offset + 1] = color[1];
  pixels[offset + 2] = color[2];
  pixels[offset + 3] = color[3];
}

function stroke(pixels, size, x0, y0, x1, y1, color) {
  const steps = Math.max(size, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2));
  const thickness = Math.max(1, size / 16);
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t;
    for (let oy = -thickness; oy <= thickness; oy += 1) {
      for (let ox = -thickness; ox <= thickness; ox += 1) {
        if (ox * ox + oy * oy <= thickness * thickness) {
          setPixel(pixels, size, Math.round(x + ox), Math.round(y + oy), color);
        }
      }
    }
  }
}

function png(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function zipDirectory(directory) {
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
