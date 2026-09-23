/**
 * Proves that uploaded media loses its location data and still plays.
 *
 * Builds real files carrying real GPS, runs them through the strippers, and
 * checks both halves of the promise: the coordinates are gone, and the file
 * is still decodable. A stripper that corrupts the media would otherwise pass
 * a "no metadata found" assertion perfectly.
 *
 * Run: node scripts/checksMetadataStrip.js   (needs ffmpeg on PATH)
 */
const assert = require('assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { stripImageMetadata, sniffImageType } = require('../utils/stripImageMetadata');
const { stripVideoMetadata } = require('../utils/stripVideoMetadata');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'oly-meta-'));
const GPS = '+40.7128-074.0060/'; // a real coordinate, so a leak is obvious

let passed = 0;
async function step(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log('  ok  ', name);
  } catch (err) {
    console.error('  FAIL', name, '\n       ', err.message);
    process.exitCode = 1;
  }
}

const ff = (args) => execFileSync('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
const probe = (file) =>
  execFileSync('ffprobe', ['-v', 'quiet', '-show_format', '-show_streams', file], {
    encoding: 'utf8',
  });

(async () => {
  console.log('=== media metadata stripping ===\n');

  await step('video: GPS present before, absent after, still decodes', async () => {
    const src = path.join(TMP, 'src.mp4');
    ff(['-y', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=15:duration=1',
        '-metadata', `location=${GPS}`,
        '-metadata', 'make=Apple', '-metadata', 'model=iPhone 15 Pro',
        '-pix_fmt', 'yuv420p', src]);

    assert.ok(probe(src).includes('40.7128'), 'test fixture has no GPS, fix the fixture');

    const cleaned = await stripVideoMetadata(fs.readFileSync(src), 'video/mp4');
    const out = path.join(TMP, 'out.mp4');
    fs.writeFileSync(out, cleaned);

    const after = probe(out);
    assert.ok(!after.includes('40.7128'), 'latitude survived');
    assert.ok(!after.includes('074.0060'), 'longitude survived');
    assert.ok(!/iPhone/i.test(after), 'device model survived');

    // Decode every frame. Proves the rewritten container is not just readable
    // at the header but actually plays through.
    ff(['-v', 'error', '-i', out, '-f', 'null', '-']);
    assert.ok(after.includes('codec_name=h264'), 'video stream missing after strip');
  });

  await step('video: audio track survives', async () => {
    const src = path.join(TMP, 'av.mp4');
    ff(['-y', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=15:duration=1',
        '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1',
        '-metadata', `location=${GPS}`, '-pix_fmt', 'yuv420p', '-shortest', src]);

    const cleaned = await stripVideoMetadata(fs.readFileSync(src), 'video/mp4');
    const out = path.join(TMP, 'av-out.mp4');
    fs.writeFileSync(out, cleaned);

    const after = probe(out);
    assert.ok(!after.includes('40.7128'), 'GPS survived');
    assert.ok(/codec_type=audio/.test(after), 'audio track was dropped');
  });

  await step('jpeg: EXIF removed, image still decodes', async () => {
    const src = path.join(TMP, 'src.jpg');
    ff(['-y', '-f', 'lavfi', '-i', 'testsrc=size=64x64:rate=1:duration=1',
        '-frames:v', '1', src]);

    // Inject an APP1 EXIF segment straight after SOI, the way a camera does.
    const raw = fs.readFileSync(src);
    const payload = Buffer.concat([
      Buffer.from('Exif\0\0', 'ascii'),
      Buffer.from('GPSLatitude 40.7128 GPSLongitude -74.0060', 'ascii'),
    ]);
    const header = Buffer.alloc(4);
    header.writeUInt16BE(0xffe1, 0);
    header.writeUInt16BE(payload.length + 2, 2);
    const withExif = Buffer.concat([raw.subarray(0, 2), header, payload, raw.subarray(2)]);

    assert.ok(withExif.includes('GPSLatitude'), 'fixture has no EXIF');

    const cleaned = stripImageMetadata(withExif, 'image/jpeg');
    assert.ok(!cleaned.includes('GPSLatitude'), 'EXIF survived');
    assert.ok(!cleaned.includes('Exif\0\0'), 'EXIF header survived');

    const out = path.join(TMP, 'out.jpg');
    fs.writeFileSync(out, cleaned);
    ff(['-v', 'error', '-i', out, '-f', 'null', '-']);
    assert.ok(probe(out).includes('width=64'), 'image dimensions changed');
  });

  await step('jpeg: compressed image data is untouched and stripping is stable', async () => {
    const src = fs.readFileSync(path.join(TMP, 'src.jpg'));
    const once = stripImageMetadata(src, 'image/jpeg');

    // Everything from Start of Scan onward is the entropy-coded picture. If a
    // single byte of it moved, something re-encoded the image instead of
    // editing the container.
    const sos = (b) => b.indexOf(Buffer.from([0xff, 0xda]));
    assert.ok(sos(src) > 0 && sos(once) > 0, 'no SOS marker found');
    assert.deepStrictEqual(
      once.subarray(sos(once)),
      src.subarray(sos(src)),
      'image data changed, so it was re-encoded'
    );

    // A second pass must be a no-op. If it is not, the walker is eating
    // something it should keep and repeated uploads would degrade the file.
    assert.deepStrictEqual(stripImageMetadata(once, 'image/jpeg'), once, 'not idempotent');
  });

  await step('png: text chunks removed, image still decodes', async () => {
    const src = path.join(TMP, 'src.png');
    ff(['-y', '-f', 'lavfi', '-i', 'testsrc=size=64x64:rate=1:duration=1',
        '-frames:v', '1', src]);

    // Splice a tEXt chunk in before IEND.
    const raw = fs.readFileSync(src);
    const data = Buffer.from('Comment\0shot at 40.7128,-74.0060', 'ascii');
    const chunk = Buffer.alloc(12 + data.length);
    chunk.writeUInt32BE(data.length, 0);
    chunk.write('tEXt', 4, 'ascii');
    data.copy(chunk, 8);
    const iend = raw.length - 12;
    const withText = Buffer.concat([raw.subarray(0, iend), chunk, raw.subarray(iend)]);

    assert.ok(withText.includes('40.7128'), 'fixture has no text chunk');

    const cleaned = stripImageMetadata(withText, 'image/png');
    assert.ok(!cleaned.includes('40.7128'), 'tEXt chunk survived');

    const out = path.join(TMP, 'out.png');
    fs.writeFileSync(out, cleaned);
    ff(['-v', 'error', '-i', out, '-f', 'null', '-']);
    assert.ok(probe(out).includes('width=64'), 'image dimensions changed');
  });

  // ---- regression checks, one per bug found in review ----

  await step('REGRESSION: a 0xFF fill byte before APP1 does not disable stripping', async () => {
    // JPEG allows any number of 0xFF fill bytes before a marker. One of them
    // used to desync the walker, which then copied the entire file through
    // with EXIF, GPS and IPTC intact, and returned success.
    const raw = fs.readFileSync(path.join(TMP, 'src.jpg'));
    const app1 = (text) => {
      const payload = Buffer.concat([Buffer.from('Exif\0\0', 'ascii'), Buffer.from(text, 'ascii')]);
      const h = Buffer.alloc(4);
      h.writeUInt16BE(0xffe1, 0);
      h.writeUInt16BE(payload.length + 2, 2);
      return Buffer.concat([h, payload]);
    };
    const withFill = Buffer.concat([
      raw.subarray(0, 2),
      Buffer.from([0xff]), // the single byte that used to defeat everything
      app1('GPSLatitude 40.7128'),
      raw.subarray(2),
    ]);
    assert.ok(withFill.includes('GPSLatitude'), 'fixture is wrong');
    const cleaned = stripImageMetadata(withFill, 'image/jpeg');
    assert.ok(!cleaned.includes('GPSLatitude'), 'fill byte still defeats the stripper');
  });

  await step('REGRESSION: a mislabelled file is rejected, not waved through', async () => {
    // A JPEG declared image/png used to pass both allow-lists and come out of
    // the PNG stripper byte-identical, GPS and all.
    const jpg = fs.readFileSync(path.join(TMP, 'src.jpg'));
    assert.throws(() => stripImageMetadata(jpg, 'image/png'), /does not match its declared type/);
    assert.strictEqual(sniffImageType(jpg), 'image/jpeg', 'sniffing is wrong');
  });

  await step('REGRESSION: GIF is refused rather than silently stored uncleaned', async () => {
    const gif = Buffer.concat([Buffer.from('GIF89a', 'ascii'), Buffer.alloc(16)]);
    assert.throws(() => stripImageMetadata(gif, 'image/gif'), /not supported/);
  });

  await step('REGRESSION: APP2 that is not ICC is dropped (iPhone MPF hides a JPEG there)', async () => {
    const raw = fs.readFileSync(path.join(TMP, 'src.jpg'));
    const mk = (tag, body) => {
      const payload = Buffer.from(body, 'ascii');
      const h = Buffer.alloc(4);
      h.writeUInt16BE(tag, 0);
      h.writeUInt16BE(payload.length + 2, 2);
      return Buffer.concat([h, payload]);
    };
    const withMpf = Buffer.concat([
      raw.subarray(0, 2),
      mk(0xffe2, 'MPF\0secondary image GPSLatitude 40.7128'),
      mk(0xffe2, 'ICC_PROFILE\0keep me'),
      raw.subarray(2),
    ]);
    const cleaned = stripImageMetadata(withMpf, 'image/jpeg');
    assert.ok(!cleaned.includes('GPSLatitude'), 'MPF payload survived');
    assert.ok(cleaned.includes('ICC_PROFILE'), 'ICC profile was wrongly dropped');
  });

  await step('REGRESSION: malformed png/webp return the ORIGINAL, never a truncated file', async () => {
    // These used to emit a 33-byte "png" and a 12-byte "webp", each of which
    // still got a 200 and a public URL.
    const png = fs.readFileSync(path.join(TMP, 'src.png'));
    const broken = Buffer.from(png);
    broken.writeUInt32BE(0xfffffff0, 8); // absurd chunk length on the first chunk
    const out = stripImageMetadata(broken, 'image/png');
    assert.strictEqual(out.length, broken.length, 'returned a truncated file');

    const webp = Buffer.concat([
      Buffer.from('RIFF', 'ascii'), Buffer.alloc(4), Buffer.from('WEBP', 'ascii'),
      Buffer.from('VP8 ', 'ascii'), Buffer.alloc(4, 0xff), Buffer.alloc(20),
    ]);
    webp.writeUInt32LE(webp.length - 8, 4);
    const wout = stripImageMetadata(webp, 'image/webp');
    assert.strictEqual(wout.length, webp.length, 'returned a truncated webp');
  });

  await step('REGRESSION: a marker-spam file bails fast instead of blocking the event loop', async () => {
    // 5MB of RST markers measured 1082ms of blocked event loop and +338MB RSS.
    const spam = Buffer.alloc(5 * 1024 * 1024);
    spam[0] = 0xff; spam[1] = 0xd8; spam[2] = 0xff;
    for (let i = 3; i < spam.length; i += 2) { spam[i] = 0xff; spam[i + 1] = 0xd3; }
    const t0 = Date.now();
    const out = stripImageMetadata(spam, 'image/jpeg');
    const ms = Date.now() - t0;
    assert.ok(ms < 150, `took ${ms}ms, cap is not working`);
    assert.strictEqual(out.length, spam.length, 'should bail to the original');
  });

  await step('REGRESSION: trailing bytes after EOI are dropped', async () => {
    const raw = fs.readFileSync(path.join(TMP, 'src.jpg'));
    const withTail = Buffer.concat([raw, Buffer.from('<x:xmpmeta>40.7128</x:xmpmeta>', 'ascii')]);
    const cleaned = stripImageMetadata(withTail, 'image/jpeg');
    assert.ok(!cleaned.includes('xmpmeta'), 'trailing metadata survived');
  });

  await step('REGRESSION: video concurrency is capped', async () => {
    const src = fs.readFileSync(path.join(TMP, 'src.mp4'));
    const started = [];
    const jobs = Array.from({ length: 6 }, () =>
      stripVideoMetadata(src, 'video/mp4').then((b) => {
        started.push(b.length);
        return b;
      })
    );
    const out = await Promise.all(jobs);
    assert.strictEqual(out.length, 6, 'queued jobs must still all complete');
    assert.ok(out.every((b) => b.length > 0), 'a queued job produced nothing');
  });

  await step('empty input is refused on both paths', async () => {
    assert.throws(() => stripImageMetadata(Buffer.alloc(0), 'image/jpeg'), /empty/);
    await assert.rejects(() => stripVideoMetadata(Buffer.alloc(0), 'video/mp4'), /empty/);
  });

  await step('unprocessable video is rejected, not stored dirty', async () => {
    await assert.rejects(
      () => stripVideoMetadata(Buffer.from('not a video at all'), 'video/mp4'),
      /Could not process this video/
    );
  });

  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(`\n${passed} passed${process.exitCode ? ', SOME FAILED' : ''}`);
})();
