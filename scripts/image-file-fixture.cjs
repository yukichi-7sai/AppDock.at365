const fs = require('node:fs/promises');
const { createDeflate } = require('node:zlib');
const { once } = require('node:events');
const table = Array.from({ length: 256 }, (_, i) => {
  for (let bit = 0; bit < 8; bit++) i = i & 1 ? 0xedb88320 ^ (i >>> 1) : i >>> 1;
  return i >>> 0;
});
function chunk(type, bytes) {
  const data = Buffer.concat([Buffer.from(type), bytes]);
  let crc = 0xffffffff;
  for (const value of data) crc = table[(crc ^ value) & 255] ^ (crc >>> 8);
  const result = Buffer.alloc(data.length + 8);
  result.writeUInt32BE(bytes.length);
  data.copy(result, 4);
  result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4);
  return result;
}
exports.writePng = async (file, width, height, noisy = false) => {
  const handle = await fs.open(file, 'wx');
  try {
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width);
    header.writeUInt32BE(height, 4);
    header[8] = 8;
    header[9] = 6;
    await handle.write(Buffer.from('89504e470d0a1a0a', 'hex'));
    await handle.write(chunk('IHDR', header));
    const encoder = createDeflate();
    const consume = (async () => {
      for await (const bytes of encoder) await handle.write(chunk('IDAT', bytes));
    })();
    let random = 123456789;
    for (let y = 0; y < height; y++) {
      const row = Buffer.alloc(1 + width * 4);
      for (let x = 0; x < width; x++) {
        random ^= random << 13;
        random ^= random >>> 17;
        random ^= random << 5;
        const pixel = 1 + x * 4;
        row[pixel] = noisy && x % 4 === 0 ? random & 255 : 40;
        row[pixel + 1] = noisy && x % 4 === 0 ? (random >>> 8) & 255 : 120;
        row[pixel + 2] = noisy && x % 4 === 0 ? (random >>> 16) & 255 : 200;
        row[pixel + 3] = 180;
      }
      if (!encoder.write(row)) await once(encoder, 'drain');
    }
    encoder.end();
    await consume;
    await handle.write(chunk('IEND', Buffer.alloc(0)));
  } finally {
    await handle.close();
  }
};
