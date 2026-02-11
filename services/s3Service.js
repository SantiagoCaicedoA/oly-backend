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

const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
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

  await s3Client.send(
    new PutObjectCommand({
      Bucket: imageBucket,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    })
  );

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

  await s3Client.send(
    new PutObjectCommand({
      Bucket: videoBucket,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    })
  );

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

  await s3Client.send(
    new PutObjectCommand({
      Bucket: videoBucket,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    })
  );

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

  await s3Client.send(
    new PutObjectCommand({
      Bucket: videoBucket,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    })
  );

  const url = `https://${videoBucket}.s3.${region}.amazonaws.com/${key}`;
  return url;
}

module.exports = { uploadProfileImage, uploadProfileVideo, uploadVideo, uploadPostVideo, s3Client };
