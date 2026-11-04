import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync, constants } from 'node:zlib';

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error('Usage: node scripts/pack-raw-texture.mjs <input.raw> <output.rawz>');

const file = readFileSync(input);
const format = file.readUInt32LE(12);
const bytesPerValue = format === 1 ? 2 : format === 2 ? 4 : 0;
if (!bytesPerValue) throw new Error(`Unsupported raw format: ${format}`);

const payload = file.subarray(16);
const valueCount = payload.length / bytesPerValue;
const planar = Buffer.alloc(file.length);
file.copy(planar, 0, 0, 16);
for (let value = 0; value < valueCount; value++)
  for (let byte = 0; byte < bytesPerValue; byte++)
    planar[16 + byte * valueCount + value] = payload[value * bytesPerValue + byte];

writeFileSync(output, gzipSync(planar, { level: constants.Z_BEST_COMPRESSION }));
