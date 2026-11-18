import zlib from 'node:zlib';
import { fail } from '../core/errors.js';

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;
const MAX_UNCOMPRESSED = 300 * 1024 * 1024;

function u16(buffer, offset) {
  return buffer.readUInt16LE(offset);
}

function u32(buffer, offset) {
  return buffer.readUInt32LE(offset);
}

/**
 * Read the .vyp database from a Vyapar .vyb.zip without modifying the archive.
 * Supports the standard store/deflate ZIP methods used by Vyapar backups.
 */
export function extractVypFromZip(buffer) {
  const minimum = Math.max(0, buffer.length - 66560);
  let eocd = -1;
  for (let offset = buffer.length - 22; offset >= minimum; offset -= 1) {
    if (u32(buffer, offset) === EOCD) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) fail('This is not a readable Vyapar .vyb.zip archive.');

  const entries = u16(buffer, eocd + 10);
  const directorySize = u32(buffer, eocd + 12);
  const directoryOffset = u32(buffer, eocd + 16);
  if (directoryOffset === 0xffffffff || directorySize === 0xffffffff || entries === 0xffff) {
    fail('This Vyapar archive uses ZIP64, which this importer does not support.');
  }
  if (directoryOffset + directorySize > buffer.length) fail('The Vyapar archive directory is incomplete.');

  let offset = directoryOffset;
  for (let index = 0; index < entries; index += 1) {
    if (offset + 46 > buffer.length || u32(buffer, offset) !== CENTRAL) {
      fail('The Vyapar archive directory is damaged.');
    }
    const method = u16(buffer, offset + 10);
    const flags = u16(buffer, offset + 8);
    if (flags & 1) fail('This Vyapar archive is password-protected and cannot be read.');
    const compressedSize = u32(buffer, offset + 20);
    const uncompressedSize = u32(buffer, offset + 24);
    const nameLength = u16(buffer, offset + 28);
    const extraLength = u16(buffer, offset + 30);
    const commentLength = u16(buffer, offset + 32);
    const localOffset = u32(buffer, offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');

    if (/\.vyp$/i.test(name)) {
      if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff) {
        fail('This Vyapar archive uses ZIP64, which this importer does not support.');
      }
      if (uncompressedSize > MAX_UNCOMPRESSED) fail('The Vyapar database inside the archive is too large.');
      if (localOffset + 30 > buffer.length || u32(buffer, localOffset) !== LOCAL) {
        fail('The Vyapar database entry is damaged.');
      }
      const localNameLength = u16(buffer, localOffset + 26);
      const localExtraLength = u16(buffer, localOffset + 28);
      const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
      const data = buffer.subarray(dataOffset, dataOffset + compressedSize);
      if (method === 0) return { name, buffer: data };
      if (method === 8) {
        try {
          return { name, buffer: zlib.inflateRawSync(data, { maxOutputLength: MAX_UNCOMPRESSED }) };
        } catch (error) {
          fail(`The Vyapar database could not be decompressed: ${error?.message || 'invalid deflate data'}`);
        }
      }
      fail('The Vyapar archive uses an unsupported compression method.');
    }

    offset += 46 + nameLength + extraLength + commentLength;
  }

  fail('No .vyp database was found inside this Vyapar archive.');
}
