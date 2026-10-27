import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Standard CRC32 table
function crc32(buf) {
  let table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Pure Node.js ZIP packager (Zero external dependencies)
 */
function createZip(sourceDir, outZipPath) {
  const files = [];

  function scan(dir, base = '') {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      const relPath = base ? `${base}/${ent.name}` : ent.name;
      const fullPath = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        scan(fullPath, relPath);
      } else {
        files.push({ relPath, fullPath });
      }
    }
  }

  scan(sourceDir);

  const localHeaders = [];
  const centralHeaders = [];
  let currentOffset = 0;

  for (const f of files) {
    const rawData = fs.readFileSync(f.fullPath);
    const compressed = zlib.deflateRawSync(rawData);
    const fileCrc = crc32(rawData);
    const nameBuf = Buffer.from(f.relPath, 'utf8');

    // Local file header (30 bytes + name)
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // Local header signature
    localHeader.writeUInt16LE(20, 4);         // Version needed: 2.0
    localHeader.writeUInt16LE(0, 6);          // General purpose bit flag
    localHeader.writeUInt16LE(8, 8);          // Compression method: Deflate (8)
    localHeader.writeUInt16LE(0, 10);         // Mod time
    localHeader.writeUInt16LE(0, 12);         // Mod date
    localHeader.writeUInt32LE(fileCrc, 14);   // CRC-32
    localHeader.writeUInt32LE(compressed.length, 18); // Compressed size
    localHeader.writeUInt32LE(rawData.length, 22);    // Uncompressed size
    localHeader.writeUInt16LE(nameBuf.length, 26);    // Filename length
    localHeader.writeUInt16LE(0, 28);                 // Extra field length

    const localChunk = Buffer.concat([localHeader, nameBuf, compressed]);
    localHeaders.push(localChunk);

    // Central directory header (46 bytes + name)
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0); // Central header signature
    centralHeader.writeUInt16LE(20, 4);         // Version made by: 2.0
    centralHeader.writeUInt16LE(20, 6);         // Version needed: 2.0
    centralHeader.writeUInt16LE(0, 8);          // General purpose bit flag
    centralHeader.writeUInt16LE(8, 10);         // Compression method: Deflate (8)
    centralHeader.writeUInt16LE(0, 12);         // Mod time
    centralHeader.writeUInt16LE(0, 14);         // Mod date
    centralHeader.writeUInt32LE(fileCrc, 16);   // CRC-32
    centralHeader.writeUInt32LE(compressed.length, 20); // Compressed size
    centralHeader.writeUInt32LE(rawData.length, 24);    // Uncompressed size
    centralHeader.writeUInt16LE(nameBuf.length, 28);    // Filename length
    centralHeader.writeUInt16LE(0, 30);                 // Extra field length
    centralHeader.writeUInt16LE(0, 32);                 // File comment length
    centralHeader.writeUInt16LE(0, 34);                 // Disk number start
    centralHeader.writeUInt16LE(0, 36);                 // Internal file attributes
    centralHeader.writeUInt32LE(0, 38);                 // External file attributes
    centralHeader.writeUInt32LE(currentOffset, 42);     // Relative offset of local header

    centralHeaders.push(Buffer.concat([centralHeader, nameBuf]));
    currentOffset += localChunk.length;
  }

  const centralDirOffset = currentOffset;
  const centralDirSize = centralHeaders.reduce((acc, h) => acc + h.length, 0);

  // End of central directory record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);       // EOCD signature
  eocd.writeUInt16LE(0, 4);                // Number of this disk
  eocd.writeUInt16LE(0, 6);                // Disk where central directory starts
  eocd.writeUInt16LE(files.length, 8);     // Total entries in central dir on this disk
  eocd.writeUInt16LE(files.length, 10);    // Total entries in central dir
  eocd.writeUInt32LE(centralDirSize, 12);  // Size of central directory
  eocd.writeUInt32LE(centralDirOffset, 16);// Offset of start of central directory
  eocd.writeUInt16LE(0, 20);               // Comment length

  const finalZip = Buffer.concat([...localHeaders, ...centralHeaders, eocd]);
  fs.writeFileSync(outZipPath, finalZip);
}

const extensionDir = path.resolve(__dirname, '../extensions/ygn-db-helper');
const distDir = path.resolve(__dirname, '../dist');
const zipPath = path.resolve(distDir, 'ygn-db-helper.zip');

fs.mkdirSync(distDir, { recursive: true });

console.log('Packaging Manifest V3 WebExtension (pure Node.js)...');
createZip(extensionDir, zipPath);

const stats = fs.statSync(zipPath);
console.log(`✓ WebExtension packaged successfully: ${zipPath} (${(stats.size / 1024).toFixed(1)} KB)`);
