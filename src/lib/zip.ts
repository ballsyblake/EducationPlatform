/**
 * Reading and writing zip archives, with nothing added to `package.json`.
 *
 * Two things in this app are zips: an `.xlsx` register coming in, and a bundle
 * of `.docx` exports going out. Both are the stored/deflate subset of the
 * format that every tool has written since 1993, and `node:zlib` already does
 * the only hard part. A dependency for the rest would be a few hundred lines of
 * someone else's edge cases plus a new line in `npm audit` — see the
 * `overrides` block in `package.json` for how much that costs here.
 *
 * Deliberately *not* general. No encryption, no zip64, no multi-disk, no
 * directory entries on write. A register that needs any of those is not a
 * register, and `readZip` says so rather than guessing.
 */

import { deflateRawSync, inflateRawSync } from "node:zlib";

const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const END_SIG = 0x06054b50;
const ZIP64_END_LOCATOR_SIG = 0x07064b50;

const STORED = 0;
const DEFLATED = 8;

export class ZipError extends Error {}

/**
 * The entries of a zip, by name, decompressed on demand.
 *
 * Read through the central directory at the end of the file rather than by
 * walking local headers from the front: the local header's sizes are allowed to
 * be zero with the real figures in a trailing data descriptor, and Excel does
 * exactly that for some entries. The central directory always carries them.
 *
 * Lazy because of the registers. One is 52 MB, almost all of it embedded
 * photographs of coaches, and the parser wants four small XML entries out of
 * it. Inflating the rest to reach them would be most of a minute and most of a
 * gigabyte of heap for nothing.
 */
export type ZipArchive = {
  names: string[];
  has(name: string): boolean;
  /** The entry's bytes, or null where there is no such entry. */
  read(name: string): Buffer | null;
};

function findEndRecord(buf: Buffer) {
  // The end record is 22 bytes plus a comment of up to 65535. Scanned
  // backwards, so a file whose contents happen to contain the signature does
  // not win over the real record at the end.
  const earliest = Math.max(0, buf.length - 22 - 0xffff);
  for (let i = buf.length - 22; i >= earliest; i--) {
    if (buf.readUInt32LE(i) === END_SIG) return i;
  }
  return -1;
}

export function readZip(buf: Buffer): ZipArchive {
  const end = findEndRecord(buf);
  if (end < 0) throw new ZipError("Not a zip file: no end-of-directory record.");

  // A zip64 locator sits immediately before the end record. Rejected rather
  // than half-supported: the 32-bit offsets in the record we just found are
  // 0xffffffff placeholders, so reading on would give nonsense.
  if (end >= 20 && buf.readUInt32LE(end - 20) === ZIP64_END_LOCATOR_SIG) {
    throw new ZipError("This zip uses the zip64 extension, which is not supported.");
  }

  const count = buf.readUInt16LE(end + 10);
  let offset = buf.readUInt32LE(end + 16);

  const entries = new Map<
    string,
    { method: number; start: number; compressed: number; size: number }
  >();

  for (let i = 0; i < count; i++) {
    if (offset + 46 > buf.length || buf.readUInt32LE(offset) !== CENTRAL_SIG) {
      throw new ZipError("This zip's directory is damaged.");
    }
    const method = buf.readUInt16LE(offset + 10);
    const compressed = buf.readUInt32LE(offset + 20);
    const size = buf.readUInt32LE(offset + 24);
    const nameLen = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const commentLen = buf.readUInt16LE(offset + 32);
    const localOffset = buf.readUInt32LE(offset + 42);
    const name = buf.toString("utf8", offset + 46, offset + 46 + nameLen);

    if (!name.endsWith("/")) {
      entries.set(name, { method, start: localOffset, compressed, size });
    }
    offset += 46 + nameLen + extraLen + commentLen;
  }

  function read(name: string) {
    const entry = entries.get(name);
    if (!entry) return null;

    // The local header is re-read for its own name and extra-field lengths:
    // the central directory's extra field is a different field and a different
    // length, so the data cannot be located from it.
    const { start } = entry;
    if (start + 30 > buf.length || buf.readUInt32LE(start) !== LOCAL_SIG) {
      throw new ZipError(`Damaged entry: ${name}`);
    }
    const nameLen = buf.readUInt16LE(start + 26);
    const extraLen = buf.readUInt16LE(start + 28);
    const from = start + 30 + nameLen + extraLen;
    const slice = buf.subarray(from, from + entry.compressed);

    if (entry.method === STORED) return Buffer.from(slice);
    if (entry.method === DEFLATED) return inflateRawSync(slice);
    throw new ZipError(`Entry "${name}" uses compression method ${entry.method}.`);
  }

  return { names: [...entries.keys()], has: (n) => entries.has(n), read };
}

/* ------------------------------- Writing --------------------------------- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  return table;
})();

function crc32(buf: Buffer) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/**
 * MS-DOS date and time, which is what a zip entry carries.
 *
 * In local time by definition — the format has no zone — and the server's
 * timezone is the host's, so an entry's stamp is only ever approximately when
 * the file was made. Nothing reads it; it exists because an archive with a
 * zeroed date shows up as 1980 in Explorer and looks broken.
 */
function dosStamp(date: Date) {
  const year = Math.max(1980, date.getFullYear());
  return {
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    time:
      (date.getHours() << 11) |
      (date.getMinutes() << 5) |
      Math.floor(date.getSeconds() / 2),
  };
}

export type ZipFile = { name: string; data: Buffer };

/**
 * A zip of the files given, deflated.
 *
 * Everything is in memory at once, which is fine for what this writes: a
 * cohort's worth of Word documents is a few megabytes. Don't hand it film.
 */
export function writeZip(files: ZipFile[], now = new Date()): Buffer {
  const { date, time } = dosStamp(now);
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const deflated = deflateRawSync(file.data);
    // A tiny or already-compressed payload can deflate larger than it started.
    const stored = deflated.length >= file.data.length;
    const body = stored ? file.data : deflated;
    const crc = crc32(file.data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(LOCAL_SIG, 0);
    local.writeUInt16LE(20, 4); // Version needed: 2.0, which is deflate.
    local.writeUInt16LE(0x0800, 6); // Bit 11: the name is UTF-8.
    local.writeUInt16LE(stored ? STORED : DEFLATED, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(CENTRAL_SIG, 0);
    central.writeUInt16LE(20, 4); // Made by.
    central.writeUInt16LE(20, 6); // Version needed.
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(stored ? STORED : DEFLATED, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(file.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + body.length;
  }

  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(END_SIG, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, directory, end]);
}
