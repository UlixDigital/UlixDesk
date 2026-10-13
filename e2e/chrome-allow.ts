import { execFileSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { inflateSync } from "node:zlib";

type Rgb = (r: number, g: number, b: number) => boolean;

function readPng(filePath: string) {
  const data = readFileSync(filePath);
  let pos = 8;
  let width = 0;
  let height = 0;
  const idat: Buffer[] = [];
  while (pos < data.length) {
    const length = data.readUInt32BE(pos);
    const type = data.toString("ascii", pos + 4, pos + 8);
    const chunk = data.subarray(pos + 8, pos + 8 + length);
    pos += 12 + length;
    if (type === "IHDR") {
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
    } else if (type === "IDAT") {
      idat.push(chunk);
    } else if (type === "IEND") {
      break;
    }
  }
  const raw = inflateSync(Buffer.concat(idat));
  const rows: Buffer[] = [];
  let offset = 0;
  const stride = width * 3;
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[offset];
    offset += 1;
    const row = Buffer.from(raw.subarray(offset, offset + stride));
    offset += stride;
    if (filter === 1) {
      for (let x = 0; x < stride; x += 1) row[x] = (row[x] + (x >= 3 ? row[x - 3] : 0)) & 255;
    } else if (filter === 2) {
      for (let x = 0; x < stride; x += 1) row[x] = (row[x] + prev[x]) & 255;
    } else if (filter === 3) {
      for (let x = 0; x < stride; x += 1) {
        const left = x >= 3 ? row[x - 3] : 0;
        row[x] = (row[x] + ((left + prev[x]) >> 1)) & 255;
      }
    } else if (filter === 4) {
      for (let x = 0; x < stride; x += 1) {
        const a = x >= 3 ? row[x - 3] : 0;
        const b = prev[x];
        const c = x >= 3 ? prev[x - 3] : 0;
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        row[x] = (row[x] + pr) & 255;
      }
    } else if (filter !== 0) {
      throw new Error(`Unsupported PNG filter ${filter}`);
    }
    prev = row;
    rows.push(row);
  }
  return { width, height, rows };
}

function isTonalBlue(r: number, g: number, b: number) {
  return r > 180 && r < 235 && g > 195 && g < 245 && b >= 230 && b > r + 20 && g > r;
}

function findButton(filePath: string, match: Rgb) {
  const { width, height, rows } = readPng(filePath);
  const seen = new Uint8Array(width * height);
  let best: { count: number; x: number; y: number } | null = null;
  for (let y = 0; y < height; y += 1) {
    const row = rows[y];
    for (let x = 0; x < width; x += 1) {
      const start = y * width + x;
      if (seen[start]) continue;
      if (!match(row[x * 3], row[x * 3 + 1], row[x * 3 + 2])) continue;
      const stack = [start];
      seen[start] = 1;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let count = 0;
      while (stack.length > 0) {
        const current = stack.pop() ?? 0;
        const cx = current % width;
        const cy = (current / width) | 0;
        count += 1;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;
        for (const next of [current - 1, current + 1, current - width, current + width]) {
          if (next < 0 || next >= seen.length || seen[next]) continue;
          const nx = next % width;
          const ny = (next / width) | 0;
          if (Math.abs(nx - cx) > 1) continue;
          const sample = rows[ny];
          if (!match(sample[nx * 3], sample[nx * 3 + 1], sample[nx * 3 + 2])) continue;
          seen[next] = 1;
          stack.push(next);
        }
      }
      const boxWidth = maxX - minX;
      const boxHeight = maxY - minY;
      if (count < 400 || boxWidth < 40 || boxWidth > 260 || boxHeight < 16 || boxHeight > 90) continue;
      if (!best || count > best.count) best = { count, x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
    }
  }
  return best;
}

/** Chrome draws the optional-host Allow control as a tonal blue button, outside the page DOM. */
export function acceptChromePermissionDialog() {
  const display = process.env.DISPLAY;
  if (!display) {
    throw new Error(
      "DISPLAY is not set, so the extension test will not click Chrome's permission dialog.",
    );
  }
  const [width, height] = execFileSync("xdotool", ["getdisplaygeometry"], { encoding: "utf8" })
    .trim()
    .split(/\s+/)
    .map(Number);
  const shot = path.join(os.tmpdir(), `ulixdesk-allow-${process.pid}.png`);
  let point: { x: number; y: number } | null = null;
  for (let attempt = 0; attempt < 6 && !point; attempt += 1) {
    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-f",
        "x11grab",
        "-video_size",
        `${width}x${height}`,
        "-i",
        display,
        "-frames:v",
        "1",
        "-update",
        "1",
        shot,
      ],
      { stdio: "ignore" },
    );
    const found = findButton(shot, isTonalBlue);
    if (found) point = found;
    else execFileSync("sleep", ["0.3"]);
  }
  rmSync(shot, { force: true });
  if (!point) throw new Error("Chrome did not show an Allow button for the extension permission.");
  execFileSync("xdotool", ["mousemove", "--sync", String(Math.round(point.x)), String(Math.round(point.y))]);
  execFileSync("xdotool", ["click", "1"]);
}
