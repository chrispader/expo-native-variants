import {mkdir, writeFile} from 'node:fs/promises';
import {deflateSync} from 'node:zlib';

// Small, reproducible geometric assets; no font or graphics-tool dependencies.
const size = 1024;
const variants = {
  production: {
    background: [11, 77, 58],
    lines: [
      [340, 515, 455, 635],
      [455, 635, 700, 370],
    ],
  },
  development: {
    background: [42, 45, 132],
    lines: [
      [410, 355, 280, 512],
      [280, 512, 410, 669],
      [614, 355, 744, 512],
      [744, 512, 614, 669],
    ],
  },
  preview: {
    background: [150, 66, 12],
    lines: [
      [390, 345, 685, 512],
      [685, 512, 390, 679],
      [390, 679, 390, 345],
    ],
  },
};

const destination = new URL('../example/assets/icons/', import.meta.url);
await mkdir(destination, {recursive: true});
for (const [variant, {background, lines}] of Object.entries(variants)) {
  const pixels = Buffer.alloc(size * (1 + size * 3));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const distance = Math.min(...lines.map((line) => distanceToSegment(x, y, line)));
      const coverage = Math.max(0, Math.min(1, 32.5 - distance));
      for (let channel = 0; channel < 3; channel++) {
        pixels[y * (1 + size * 3) + 1 + x * 3 + channel] = Math.round(
          background[channel] * (1 - coverage) + 255 * coverage,
        );
      }
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 2;
  await writeFile(
    new URL(`${variant}.png`, destination),
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', header),
      chunk('IDAT', deflateSync(pixels)),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
}

function distanceToSegment(x, y, [ax, ay, bx, by]) {
  const t = Math.max(
    0,
    Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)),
  );
  return Math.hypot(x - ax - t * (bx - ax), y - ay - t * (by - ay));
}

function chunk(type, data) {
  const payload = Buffer.concat([Buffer.from(type), data]);
  let crc = 0xffffffff;
  for (const byte of payload) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length);
  payload.copy(result, 4);
  result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4);
  return result;
}
