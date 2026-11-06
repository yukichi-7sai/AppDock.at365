const { deflateSync, crc32 } = require('node:zlib');
// A deterministic, fully encoded PNG for HTTP and renderer integration checks.
const width = 240,
  height = 140;
function chunk(type, data) {
  const kind = Buffer.from(type),
    header = Buffer.alloc(4),
    crc = Buffer.alloc(4);
  header.writeUInt32BE(data.length);
  crc.writeUInt32BE(crc32(Buffer.concat([kind, data])));
  return Buffer.concat([header, kind, data, crc]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(width, 0);
ihdr.writeUInt32BE(height, 4);
ihdr[8] = 8;
ihdr[9] = 6;
const pixels = Buffer.alloc(height * (1 + width * 4));
for (let y = 0; y < height; y++)
  for (let x = 0; x < width; x++) {
    const i = y * (1 + width * 4) + 1 + x * 4;
    pixels[i] = 40 + Math.floor((100 * x) / width);
    pixels[i + 1] = 100 + Math.floor((80 * y) / height);
    pixels[i + 2] = 180;
    pixels[i + 3] = 255;
  }
module.exports = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(pixels)),
  chunk('IEND', Buffer.alloc(0)),
]);
