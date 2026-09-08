import { writeFileSync, mkdirSync } from "node:fs";
import { zlibSync } from "fflate";
function crc(data) {
  let c = 0xffffffff;
  for (const b of data) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(name, data) {
  const type = Buffer.from(name),
    len = Buffer.alloc(4),
    sum = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  sum.writeUInt32BE(crc(Buffer.concat([type, data])));
  return Buffer.concat([len, type, data, sum]);
}
mkdirSync("public/icons", { recursive: true });
for (const n of [16, 32, 48, 128]) {
  const raw = Buffer.alloc(n * (1 + n * 4));
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const a = x / n,
        b = y / n;
      const chevron =
        (Math.abs(a - (0.23 + Math.abs(b - 0.5) * 0.6)) < 0.035 ||
          Math.abs(a - (0.77 - Math.abs(b - 0.5) * 0.6)) < 0.035) &&
        b > 0.3 &&
        b < 0.7;
      const slash =
        Math.abs(a - (0.5 + (b - 0.5) * -0.3)) < 0.025 && b > 0.27 && b < 0.73;
      const color = chevron || slash ? [242, 244, 225, 255] : [36, 78, 57, 255];
      raw.set(color, y * (1 + n * 4) + 1 + x * 4);
    }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(n, 0);
  header.writeUInt32BE(n, 4);
  header[8] = 8;
  header[9] = 6;
  writeFileSync(
    `public/icons/${n}.png`,
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk("IHDR", header),
      chunk("IDAT", Buffer.from(zlibSync(raw))),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
}
