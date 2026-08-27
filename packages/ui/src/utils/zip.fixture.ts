import { crc32, deflateRawSync } from "node:zlib";

/**
 * Builds a ZIP archive in memory, for tests only — never imported by app
 * code, so it is tree-shaken out of the bundle. It sits beside zip.ts
 * because both Office readers under test (.xlsx and .docx) need the same
 * container built, in the same way.
 *
 * Fixtures are constructed rather than committed: real Salesforce and
 * customer documents are business data this repo deliberately never stores
 * (see .gitignore), and a hand-built archive keeps the quirks under test
 * visible in source instead of hidden inside a binary.
 *
 * Uses node:zlib rather than the DecompressionStream the reader itself uses,
 * so a bug in the reader cannot be masked by the fixture sharing it.
 */
export function zipFixture(entries: { name: string; text: string }[]): ArrayBuffer {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const uncompressed = Buffer.from(entry.text, "utf8");
    const compressed = deflateRawSync(uncompressed);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt32LE(crc32(uncompressed), 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(uncompressed.length, 22);
    local.writeUInt16LE(name.length, 26);

    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(8, 10);
    header.writeUInt32LE(crc32(uncompressed), 16);
    header.writeUInt32LE(compressed.length, 20);
    header.writeUInt32LE(uncompressed.length, 24);
    header.writeUInt16LE(name.length, 28);
    header.writeUInt32LE(offset, 42);

    locals.push(local, name, compressed);
    central.push(header, name);
    offset += local.length + name.length + compressed.length;
  }

  const centralBuffer = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(offset, 16);

  const zipped = Buffer.concat([...locals, centralBuffer, end]);
  return zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength) as ArrayBuffer;
}
