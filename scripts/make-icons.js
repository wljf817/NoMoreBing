// Renders the extension icons (a magnifier on a rounded square) to PNG
// without dependencies. Shapes are signed distance functions in a 128x128
// design space, so every size is drawn natively with anti-aliasing.
// Usage: npm run icons

import { mkdirSync, writeFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';

const SIZES = [16, 32, 48, 128];
const BACKGROUND = [11, 107, 203];
const FOREGROUND = [255, 255, 255];

const length = (x, y) => Math.hypot(x, y);
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

function roundedRect(x, y, cx, cy, half, radius) {
  const qx = Math.abs(x - cx) - (half - radius);
  const qy = Math.abs(y - cy) - (half - radius);
  return length(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
}

function ring(x, y, cx, cy, radius, width) {
  return Math.abs(length(x - cx, y - cy) - radius) - width / 2;
}

function capsule(x, y, ax, ay, bx, by, radius) {
  const [px, py, dx, dy] = [x - ax, y - ay, bx - ax, by - ay];
  const h = clamp((px * dx + py * dy) / (dx * dx + dy * dy), 0, 1);
  return length(px - dx * h, py - dy * h) - radius;
}

const background = (x, y) => roundedRect(x, y, 64, 64, 60, 28);
const foreground = (x, y) =>
  Math.min(ring(x, y, 56, 56, 26, 12), capsule(x, y, 76, 76, 97, 97, 7));

function render(size) {
  const scale = 128 / size;
  const coverage = (d) => clamp(0.5 - d / scale, 0, 1);
  const pixels = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const x = (px + 0.5) * scale;
      const y = (py + 0.5) * scale;
      const bg = coverage(background(x, y));
      const fg = coverage(foreground(x, y)) * bg;
      const alpha = bg;
      const i = (py * size + px) * 4;
      for (let c = 0; c < 3; c++) {
        const premultiplied = FOREGROUND[c] * fg + BACKGROUND[c] * bg * (1 - fg);
        pixels[i + c] = alpha ? Math.round(premultiplied / alpha) : 0;
      }
      pixels[i + 3] = Math.round(alpha * 255);
    }
  }
  return pixels;
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
}

function encodePng(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA, no interlace
  const rows = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    pixels.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const outDir = new URL('../icons/', import.meta.url);
mkdirSync(outDir, { recursive: true });
for (const size of SIZES) {
  writeFileSync(new URL(`icon${size}.png`, outDir), encodePng(size, render(size)));
}
