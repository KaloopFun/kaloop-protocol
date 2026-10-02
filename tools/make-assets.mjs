// Derives site imagery from brand/ and writes it to src/assets/.
//   - logo-mark-512.png / logo-mark-112.png : cropped, premultiplied-resized transparent marks
//   - favicon.svg                            : 32x32 pixel grid sampled from the real logo
// The transparent logo stores pure black RGB under alpha 0, so every resize is premultiplied;
// a straight-alpha resize would drag black into the edges.
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';
import { decodePng } from './png.mjs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(root, 'brand/LOGO KALOOP PNG...png');
const OUT = resolve(root, 'src/assets');

function encodePng(n, rgba) {
  const stride = n * 4;
  const raw = Buffer.alloc((stride + 1) * n);
  for (let y = 0; y < n; y++) rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  const chunk = (type, data) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, 'latin1');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0);
    return Buffer.concat([head, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(n, 0);
  ihdr.writeUInt32BE(n, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// Area-weighted box resize of the square [x0,y0,side) region to n x n, premultiplied.
function resizePremultiplied({ w, px }, x0, y0, side, n) {
  const out = Buffer.alloc(n * n * 4);
  const step = side / n;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const sx0 = x0 + i * step, sx1 = sx0 + step, sy0 = y0 + j * step, sy1 = sy0 + step;
      let r = 0, g = 0, bl = 0, a = 0, wsum = 0;
      for (let y = Math.floor(sy0); y < Math.ceil(sy1); y++) {
        const wy = Math.min(y + 1, sy1) - Math.max(y, sy0);
        for (let x = Math.floor(sx0); x < Math.ceil(sx1); x++) {
          const wgt = wy * (Math.min(x + 1, sx1) - Math.max(x, sx0));
          const k = (y * w + x) * 4;
          const al = px[k + 3] / 255;
          r += px[k] * al * wgt; g += px[k + 1] * al * wgt; bl += px[k + 2] * al * wgt; a += al * wgt; wsum += wgt;
        }
      }
      const o = (j * n + i) * 4;
      if (a > 0) {
        out[o] = Math.round(r / a); out[o + 1] = Math.round(g / a); out[o + 2] = Math.round(bl / a);
        out[o + 3] = Math.round((a / wsum) * 255);
      }
    }
  }
  return out;
}

const img = decodePng(SRC);
let black = 0;
for (let i = 0; i < img.w * img.h; i++) if (img.px[i * 4 + 3] === 0 && !img.px[i * 4] && !img.px[i * 4 + 1] && !img.px[i * 4 + 2]) black++;
console.log(`transparent pure-black pixels: ${black} (premultiplied resize ${black ? 'required' : 'not required'})`);

// logo bounding box (alpha > 8), then a centred square with breathing room
let minX = img.w, minY = img.h, maxX = 0, maxY = 0;
for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) if (img.px[(y * img.w + x) * 4 + 3] > 8) {
  if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
}
const cx = (minX + maxX + 1) / 2, cy = (minY + maxY + 1) / 2;
const longest = Math.max(maxX - minX + 1, maxY - minY + 1);
const square = (pad) => { const side = longest * pad; return [Math.round(cx - side / 2), Math.round(cy - side / 2), Math.round(side)]; };

mkdirSync(OUT, { recursive: true });
for (const n of [512, 112]) {
  const [x0, y0, side] = square(1.12);
  writeFileSync(resolve(OUT, `logo-mark-${n}.png`), encodePng(n, resizePremultiplied(img, x0, y0, side, n)));
}

// Favicon: 32x32 grid, cells merged into horizontal runs of identical colour and opacity.
const N = 32;
const [fx, fy, fside] = square(1.06);
const grid = resizePremultiplied(img, fx, fy, fside, N);
// Edge cells carry a light halo from the source; the body colour is the sampled teal (see tools/palette.json).
const BODY = '#7dcdc2';
const rects = [];
for (let y = 0; y < N; y++) {
  let run = null;
  const flush = () => { if (run) rects.push(run); run = null; };
  for (let x = 0; x < N; x++) {
    const o = (y * N + x) * 4;
    let al = grid[o + 3] / 255;
    if (al < 0.04) { flush(); continue; }
    al = al > 0.93 ? 1 : Math.round(al * 10) / 10;
    if (al === 0) { flush(); continue; }
    const key = BODY + '|' + al.toFixed(2);
    if (run && run.key === key) run.w++;
    else { flush(); run = { key, x, y, w: 1 }; }
  }
  flush();
}
const body = rects.map((r) => {
  const [fill, op] = r.key.split('|');
  return `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="1" fill="${fill}"${op === '1.00' ? '' : ` fill-opacity="${op}"`}/>`;
}).join('');
writeFileSync(resolve(OUT, 'favicon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${N} ${N}" shape-rendering="crispEdges">${body}</svg>\n`);
console.log(`assets written: logo-mark-512.png, logo-mark-112.png, favicon.svg (${rects.length} runs)`);
