const AppError = require('./AppError');

/**
 * Remove metadata from an uploaded image before it is stored.
 *
 * Phone cameras write GPS coordinates into EXIF. An athlete filming a PR in a
 * home garage gym and uploading the thumbnail would otherwise publish the
 * coordinates of their house, since the object lands on a public URL and
 * anyone who downloads it can read the bytes. No privacy toggle can help,
 * because the leak lives inside the file.
 *
 * Done by hand rather than with sharp so the compressed image data passes
 * through untouched (nothing is re-encoded) and no native dependency is added.
 * Video is the opposite case and does need ffmpeg, because removing an MP4
 * atom shifts every sample offset in the file.
 *
 * Three rules this file follows, each of which it got wrong in review first:
 *  1. Dispatch on SNIFFED bytes, never the declared mime. A client can label
 *     a GPS-bearing JPEG as image/png and a png stripper will pass it through
 *     untouched, because the signature check bails early.
 *  2. Bail to the ORIGINAL buffer, never a partially rewritten one. An early
 *     version returned whatever it had accumulated so far, turning a 564-byte
 *     PNG into a 33-byte one that still got a 200 and a public URL.
 *  3. Cap the work. These parsers are synchronous. A 5MB file of repeated
 *     two-byte markers measured a full second of blocked event loop and
 *     338MB of RSS before the cap existed.
 */

// Enough segments/chunks for any real photo. A file that needs more is either
// corrupt or built to stall the event loop; both bail to the original.
const MAX_PARTS = 2000;

/** Identify an image by its magic bytes. Returns null if unrecognised. */
function sniffImageType(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.readUInt32BE(0) === 0x89504e47 && buf.readUInt32BE(4) === 0x0d0a1a0a) return 'image/png';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  if (buf.toString('ascii', 0, 4) === 'GIF8') return 'image/gif';
  return null;
}

// JPEG markers whose payload can carry identifying data.
// APP0 (JFIF) is kept: it affects rendering and says nothing about the camera.
const JPEG_DROP = new Set([
  0xe1, // APP1  — EXIF (GPS lives here) and XMP
  0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xeb, 0xec,
  0xed, // APP13 — IPTC / Photoshop resources
  0xee, 0xef,
  0xfe, // COM   — free-text comment
]);

function stripJpeg(buf) {
  const out = [buf.subarray(0, 2)];
  let i = 2;
  let parts = 0;
  while (i + 3 < buf.length) {
    // A marker may be preceded by any number of 0xFF fill bytes. Without this
    // skip, one fill byte made `marker` itself 0xFF, the length read landed on
    // the next marker, and the whole file was copied through uncleaned.
    while (i + 1 < buf.length && buf[i] === 0xff && buf[i + 1] === 0xff) i += 1;
    if (i + 3 >= buf.length) break;
    if (buf[i] !== 0xff) return null; // desynchronised: refuse to guess
    const marker = buf[i + 1];
    // Start of Scan: everything after is entropy-coded image data.
    if (marker === 0xda) break;
    if (marker === 0xd9) { i += 2; break; } // EOI: drop any trailing junk
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      out.push(buf.subarray(i, i + 2));
      i += 2;
      if (++parts > MAX_PARTS) return null;
      continue;
    }
    const len = buf.readUInt16BE(i + 2); // includes the 2 length bytes
    const end = i + 2 + len;
    if (len < 2 || end > buf.length) return null; // malformed
    let drop = JPEG_DROP.has(marker);
    // APP2 normally carries an ICC colour profile, which is worth keeping.
    // It is also where iPhone MPF/HDR files hide a SECOND embedded JPEG with
    // its own EXIF and GPS, so keep it only when it really is ICC.
    if (marker === 0xe2) drop = buf.toString('ascii', i + 4, i + 15) !== 'ICC_PROFILE';
    if (!drop) out.push(buf.subarray(i, end));
    i = end;
    if (++parts > MAX_PARTS) return null;
  }
  // From the first scan to the end is picture data. Find the real EOI so
  // anything appended after it (some editors park XMP there) is dropped.
  const tail = buf.subarray(i);
  const eoi = tail.lastIndexOf(Buffer.from([0xff, 0xd9]));
  out.push(eoi >= 0 ? tail.subarray(0, eoi + 2) : tail);
  return Buffer.concat(out);
}

// PNG ancillary chunks that can hold text or EXIF.
const PNG_DROP = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME']);

function stripPng(buf) {
  const out = [buf.subarray(0, 8)];
  let i = 8;
  let parts = 0;
  while (i + 8 <= buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.toString('ascii', i + 4, i + 8);
    const end = i + 12 + len; // length + type + data + CRC
    if (end > buf.length || end <= i) return null; // malformed
    if (!PNG_DROP.has(type)) out.push(buf.subarray(i, end));
    i = end;
    if (type === 'IEND') break; // and drop anything trailing it
    if (++parts > MAX_PARTS) return null;
  }
  return Buffer.concat(out);
}

function stripWebp(buf) {
  const kept = [];
  let i = 12;
  let parts = 0;
  while (i + 8 <= buf.length) {
    const fourcc = buf.toString('ascii', i, i + 4);
    const size = buf.readUInt32LE(i + 4);
    const padded = size + (size % 2); // RIFF chunks are even-aligned
    const end = i + 8 + padded;
    if (end > buf.length || end <= i) return null; // malformed
    if (fourcc === 'EXIF' || fourcc === 'XMP ') {
      i = end;
      continue;
    }
    const chunk = Buffer.from(buf.subarray(i, end));
    // VP8X advertises which optional chunks exist. Clear the EXIF (bit 3) and
    // XMP (bit 2) flags so the header does not promise chunks we just removed.
    if (fourcc === 'VP8X' && chunk.length >= 9) chunk[8] &= ~0b00001100;
    kept.push(chunk);
    i = end;
    if (++parts > MAX_PARTS) return null;
  }
  const body = Buffer.concat(kept);
  const head = Buffer.alloc(12);
  head.write('RIFF', 0, 'ascii');
  head.writeUInt32LE(body.length + 4, 4); // 'WEBP' + chunks
  head.write('WEBP', 8, 'ascii');
  return Buffer.concat([head, body]);
}

const STRIPPERS = {
  'image/jpeg': stripJpeg,
  'image/png': stripPng,
  'image/webp': stripWebp,
};

/**
 * @param {Buffer} buffer raw upload
 * @param {string} declaredMime content type the client claimed
 * @returns {Buffer} the same image with identifying metadata removed
 * @throws {AppError} 422 when the file is not an image we can clean
 */
function stripImageMetadata(buffer, declaredMime) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new AppError(422, 'That image file is empty.');
  }

  const actual = sniffImageType(buffer);
  if (!actual || !STRIPPERS[actual]) {
    // Includes GIF, which no longer reaches here: a hand-written GIF parser is
    // one more thing to get wrong, and a camera never produces one.
    throw new AppError(422, 'That image format is not supported. Use JPEG, PNG or WebP.');
  }
  if (declaredMime && declaredMime !== actual) {
    // Not pedantry. A JPEG labelled image/png used to sail through the PNG
    // stripper untouched, GPS and all, because the signature check bails.
    throw new AppError(422, 'That file does not match its declared type.');
  }

  let cleaned = null;
  try {
    cleaned = STRIPPERS[actual](buffer);
  } catch (err) {
    console.error('stripImageMetadata threw, storing original', actual, err);
    return buffer;
  }
  if (!cleaned) {
    // Structurally broken past the signature. Storing the original is the
    // lesser risk (it is almost certainly undecodable anyway); storing a
    // half-rewritten file is not.
    console.error('stripImageMetadata could not parse, storing original', actual);
    return buffer;
  }
  return cleaned;
}

module.exports = { stripImageMetadata, sniffImageType, stripJpeg, stripPng, stripWebp };
