/**
 * A minimal PNG reader, so a test can ask what the screen actually looks
 * like rather than trusting the scene graph. The hangar bay was invisible
 * for most of development while every structural check passed; a pixel is
 * the only witness to "all I can see is white".
 *
 * Handles what Chromium writes: 8-bit RGB or RGBA, no interlacing.
 */
import { inflateSync } from 'node:zlib';

export function decodePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let off = 8, width = 0, height = 0, depth = 0, colour = 0, interlace = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      depth = data[8]; colour = data[9]; interlace = data[12];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += len + 12;
  }
  if (depth !== 8 || interlace !== 0 || (colour !== 2 && colour !== 6)) {
    throw new Error(`unsupported PNG: depth ${depth} colour ${colour} interlace ${interlace}`);
  }
  const ch = colour === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * ch;
  const out = Buffer.alloc(width * height * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const row = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? row[i - ch] : 0;
      const b = prev[i];
      const c = i >= ch ? prev[i - ch] : 0;
      let v = row[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      row[i] = v & 0xff;
    }
    for (let x = 0; x < width; x++) {
      out[(y * width + x) * 4 + 0] = row[x * ch + 0];
      out[(y * width + x) * 4 + 1] = row[x * ch + 1];
      out[(y * width + x) * 4 + 2] = row[x * ch + 2];
      out[(y * width + x) * 4 + 3] = ch === 4 ? row[x * ch + 3] : 255;
    }
    prev = row;
  }
  return { width, height, data: out };
}

/** Perceived brightness, 0..1. */
export const lum = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

/** Brightness statistics over a rectangle (defaults to the whole image). */
export function stats(img, x = 0, y = 0, w = img.width, h = img.height) {
  x = Math.max(0, Math.round(x)); y = Math.max(0, Math.round(y));
  w = Math.min(img.width - x, Math.round(w)); h = Math.min(img.height - y, Math.round(h));
  let n = 0, sum = 0, sum2 = 0, white = 0, min = 1, max = 0;
  for (let j = y; j < y + h; j++) {
    for (let i = x; i < x + w; i++) {
      const o = (j * img.width + i) * 4;
      const l = lum(img.data[o], img.data[o + 1], img.data[o + 2]);
      n++; sum += l; sum2 += l * l;
      if (l > 0.86) white++;
      if (l < min) min = l;
      if (l > max) max = l;
    }
  }
  const mean = n ? sum / n : 0;
  return { n, mean, sd: Math.sqrt(Math.max(0, (sum2 / Math.max(1, n)) - mean * mean)), white: n ? white / n : 0, min, max };
}
