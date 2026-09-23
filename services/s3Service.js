const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const region = process.env.AWS_REGION || 'eu-north-1';
const imageBucket = process.env.AWS_IMAGE_BUCKET || 'oly-image';
const videoBucket = process.env.AWS_VIDEO_BUCKET || 'oly-video';

const s3Client = new S3Client({
  region,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const { stripImageMetadata, sniffImageType } = require('../utils/stripImageMetadata');
const { stripVideoMetadata } = require('../utils/stripVideoMetadata');

/**
 * The only way anything reaches S3 from this service.
 *
 * Every upload is cleaned of metadata first. Phone cameras write GPS into
 * EXIF and into the QuickTime container, and these objects land on public
 * URLs, so an athlete filming in a home gym would otherwise publish their
 * address to anyone who downloads the file.
 *
 * It is one function on purpose. When each upload helper did its own
 * PutObjectCommand, the sixth one added in six months would have quietly
 * skipped this step. Now there is nowhere else to write to.
 */
async function putClean(bucket, key, buffer, mimeType) {
  let body = buffer;
  let contentType = mimeType;
  if (String(mimeType).startsWith('video/')) {
    // Throws if it cannot be cleaned. A video that keeps its coordinates is
    // worse than an upload the athlete has to retry.
    body = await stripVideoMetadata(buffer, mimeType);
  } else if (String(mimeType).startsWith('image/')) {
    body = stripImageMetadata(buffer, mimeType);
    // Serve it as what it actually is. A PNG stored with ContentType
    // image/jpeg renders in most browsers and breaks in some.
    contentType = sniffImageType(body) || mimeType;
  }

  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
}

// GIF is deliberately absent. Nothing here can strip a GIF comment or
// application extension, and writing a fourth hand-rolled parser to clean a
// format no camera produces is not worth the bugs.
const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const MIME_TO_EXT = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
};

/**
 * Upload profile image to S3 and return public URL.
 * @param {Buffer} buffer - File buffer
 * @param {string} mimeType - e.g. 'image/jpeg'
 * @param {string} userId - User ID for key path
 * @returns {Promise<string>} Public URL of the uploaded object
 */
async function uploadProfileImage(buffer, mimeType, userId) {
  if (!ALLOWED_MIMES.includes(mimeType)) {
    throw new Error(`Invalid file type. Allowed: ${ALLOWED_MIMES.join(', ')}`);
  }

  const ext = MIME_TO_EXT[mimeType] || '.jpg';
  const key = `profiles/${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 9)}${ext}`;

  await putClean(imageBucket, key, buffer, mimeType);

  const url = `https://${imageBucket}.s3.${region}.amazonaws.com/${key}`;
  return url;
}

const VIDEO_MIMES = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo'];
const VIDEO_MIME_TO_EXT = {
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/webm': '.webm',
  'video/x-msvideo': '.avi',
};

/**
 * Upload video to S3 and return public URL.
 * @param {Buffer} buffer - File buffer
 * @param {string} mimeType - e.g. 'video/mp4'
 * @param {string} userId - User ID for key path
 * @returns {Promise<string>} Public URL of the uploaded object
 */
async function uploadVideo(buffer, mimeType, userId) {
  if (!VIDEO_MIMES.includes(mimeType)) {
    throw new Error(`Invalid video type. Allowed: ${VIDEO_MIMES.join(', ')}`);
  }

  const ext = VIDEO_MIME_TO_EXT[mimeType] || '.mp4';
  const key = `videos/${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 9)}${ext}`;

  await putClean(videoBucket, key, buffer, mimeType);

  const url = `https://${videoBucket}.s3.${region}.amazonaws.com/${key}`;
  return url;
}

/**
 * Upload profile video to S3 (athlete profile intro/highlight video) and return public URL.
 * Stores under profiles/{userId}/video/ so it's separate from lift videos.
 */
async function uploadProfileVideo(buffer, mimeType, userId) {
  if (!VIDEO_MIMES.includes(mimeType)) {
    throw new Error(`Invalid video type. Allowed: ${VIDEO_MIMES.join(', ')}`);
  }

  const ext = VIDEO_MIME_TO_EXT[mimeType] || '.mp4';
  const key = `profiles/${userId}/video/${Date.now()}-${Math.random().toString(36).slice(2, 9)}${ext}`;

  await putClean(videoBucket, key, buffer, mimeType);

  const url = `https://${videoBucket}.s3.${region}.amazonaws.com/${key}`;
  return url;
}

/**
 * Upload post video to S3 (video attached to a post). Returns public URL.
 */
async function uploadPostVideo(buffer, mimeType, userId) {
  if (!VIDEO_MIMES.includes(mimeType)) {
    throw new Error(`Invalid video type. Allowed: ${VIDEO_MIMES.join(', ')}`);
  }

  const ext = VIDEO_MIME_TO_EXT[mimeType] || '.mp4';
  const key = `posts/${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 9)}${ext}`;

  await putClean(videoBucket, key, buffer, mimeType);

  const url = `https://${videoBucket}.s3.${region}.amazonaws.com/${key}`;
  return url;
}

/**
 * Upload post thumbnail to S3 (image shown in feed instead of loading full video). Returns public URL.
 */
async function uploadPostThumbnail(buffer, mimeType, userId) {
  if (!ALLOWED_MIMES.includes(mimeType)) {
    throw new Error(`Invalid thumbnail type. Allowed: ${ALLOWED_MIMES.join(', ')}`);
  }

  const ext = MIME_TO_EXT[mimeType] || '.jpg';
  const key = `posts/${userId}/thumbnails/${Date.now()}-${Math.random().toString(36).slice(2, 9)}${ext}`;

  await putClean(imageBucket, key, buffer, mimeType);

  const url = `https://${imageBucket}.s3.${region}.amazonaws.com/${key}`;
  return url;
}

module.exports = { uploadProfileImage, uploadProfileVideo, uploadVideo, uploadPostVideo, uploadPostThumbnail, s3Client };
