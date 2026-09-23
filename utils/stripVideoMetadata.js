const { spawn } = require('child_process');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const AppError = require('./AppError');

/**
 * Remove metadata from an uploaded video before it is stored.
 *
 * iOS writes GPS into the QuickTime container (the `©xyz` / `loci` atoms) on
 * every clip the camera records, and Android does the same. A lift filmed at
 * a home gym and posted publicly would otherwise carry the coordinates of the
 * athlete's house to anyone who downloads the file.
 *
 * Unlike images, this cannot be done by deleting bytes. Sample offsets in an
 * MP4 are absolute, so removing an atom ahead of the media data invalidates
 * every offset in the file and the video stops playing. ffmpeg rebuilds the
 * container and rewrites those offsets. `-c copy` means the compressed video
 * is passed through without re-encoding, so there is no quality loss and the
 * work is IO-bound rather than CPU-bound.
 */

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const TIMEOUT_MS = Number(process.env.FFMPEG_TIMEOUT_MS || 60000);

// Demuxer to force, so ffmpeg does not probe the content and decide for
// itself. Without this a playlist named .mp4 is read as HLS, which is the
// shape of every ffmpeg SSRF writeup.
const MIME_TO_FORMAT = {
  'video/mp4': 'mov,mp4,m4a,3gp,3g2,mj2',
  'video/quicktime': 'mov,mp4,m4a,3gp,3g2,mj2',
  'video/webm': 'matroska,webm',
  'video/x-msvideo': 'avi',
};

// Whole-file copies live in memory while this runs. Measured at five
// concurrent 100MB uploads: 1081MB in node plus 250MB in ffmpeg, which OOMs
// a 2GB task. Queueing is slower for the fifth uploader and survivable for
// everyone else.
const MAX_CONCURRENT = Number(process.env.VIDEO_STRIP_CONCURRENCY || 2);
let active = 0;
const waiting = [];

function acquire() {
  if (active < MAX_CONCURRENT) {
    active += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => waiting.push(resolve));
}

function release() {
  const next = waiting.shift();
  if (next) return next();
  active -= 1;
}

const MIME_TO_EXT = {
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/webm': '.webm',
  'video/x-msvideo': '.avi',
};

/**
 * Reject if a promise has not settled in time. Node's fs promises cannot be
 * cancelled, so the underlying IO keeps running; the point is that a request
 * stops waiting on it rather than holding a 100MB buffer indefinitely.
 */
function withDeadline(promise, ms, what) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`timed out ${what} after ${ms}ms`)), ms);
    }),
  ]);
}

function run(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    let settled = false;
    const finish = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      return err ? reject(err) : resolve();
    };
    // Reject from the timer itself. Waiting for 'close' is not enough: close
    // only fires once every stdio pipe is closed too, so a child that outlives
    // the kill while holding stderr left the promise pending forever, holding
    // the whole video in memory.
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      finish(new Error(`ffmpeg timed out after ${TIMEOUT_MS}ms`));
    }, TIMEOUT_MS);
    proc.stderr.on('data', (d) => {
      // Keep the tail only. A failing ffmpeg can emit a lot and the useful
      // part is always last.
      stderr = (stderr + d.toString()).slice(-2000);
    });
    proc.on('error', (err) => finish(err));
    // 'exit' fires when the process is gone, regardless of who still holds a
    // pipe. That is the signal we actually want.
    proc.on('exit', (code) => {
      if (code === 0) return finish();
      finish(new Error(`ffmpeg exited ${code}: ${stderr.trim()}`));
    });
  });
}

/**
 * @param {Buffer} buffer raw upload
 * @param {string} mimeType declared content type
 * @returns {Promise<Buffer>} the same video, re-containered without metadata
 */
async function stripVideoMetadata(buffer, mimeType) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new AppError(422, 'That video file is empty.');
  }
  await acquire();
  try {
    return await run_(buffer, mimeType);
  } finally {
    release();
  }
}

async function run_(buffer, mimeType) {
  const ext = MIME_TO_EXT[mimeType] || '.mp4';
  const id = crypto.randomBytes(8).toString('hex');
  // Deliberately the OS temp dir, not a connected volume: these are somebody's
  // unpublished training videos and should not outlive the request.
  const dir = os.tmpdir();
  const inPath = path.join(dir, `oly-in-${id}${ext}`);
  const outPath = path.join(dir, `oly-out-${id}${ext}`);

  const deadline = Date.now() + TIMEOUT_MS;
  const remaining = () => Math.max(1, deadline - Date.now());
  try {
    await withDeadline(fs.writeFile(inPath, buffer), remaining(), 'writing the upload');
    await run([
      '-y',
      '-loglevel', 'error',
      // Local files only, and only the demuxer the declared type implies.
      '-protocol_whitelist', 'file',
      '-f', MIME_TO_FORMAT[mimeType] || 'mov,mp4,m4a,3gp,3g2,mj2',
      '-i', inPath,
      // Video plus audio only. Any timecode or data stream is dropped, which
      // matters because that is another place camera metadata hides.
      // Capital V excludes attached_pic streams, so an embedded cover image
      // can never be selected instead of the actual footage.
      '-map', '0:V:0',
      '-map', '0:a?',
      '-map_metadata', '-1',
      '-map_chapters', '-1',
      '-c', 'copy',
      // Stops ffmpeg writing its own version string back in as an encoder tag.
      '-fflags', '+bitexact',
      // Moves the index to the front so the video starts playing before the
      // whole file has downloaded. Free here since we are rewriting anyway.
      '-movflags', '+faststart',
      outPath,
    ]);
    const cleaned = await withDeadline(fs.readFile(outPath), remaining(), 'reading the result');
    if (cleaned.length === 0) throw new Error('ffmpeg produced an empty file');
    return cleaned;
  } catch (err) {
    // An upload that cannot be cleaned is REJECTED, not stored as-is. The
    // image path can fall back to the original because a stray EXIF block is
    // a smaller risk than a broken avatar, but a video is the main way
    // location leaks here, so failing closed is the right default.
    console.error('stripVideoMetadata failed', mimeType, err);
    // 422, not a bare Error. The handler maps a plain Error to 500, so the
    // same failure was a 400 on one endpoint and a 500 on two others.
    throw new AppError(422, 'Could not process this video. Please try uploading it again.');
  } finally {
    await Promise.allSettled([fs.unlink(inPath), fs.unlink(outPath)]);
  }
}

module.exports = { stripVideoMetadata };
