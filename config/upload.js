const path = require('path');
const fs = require('fs');
const multer = require('multer');

const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'images');
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
    const safeExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext) ? ext : '.jpg';
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}${safeExt}`;
    cb(null, unique);
  },
});

const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIMES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type. Allowed: ${ALLOWED_MIMES.join(', ')}`), false);
  }
};

const uploadPostImage = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE },
}).single('image');

// Memory storage for S3 upload (profile image) – no disk write
const memoryStorage = multer.memoryStorage();
const uploadProfileImageToMemory = multer({
  storage: memoryStorage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE },
}).single('image');

// Video upload for S3 (memory, 100MB)
const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100MB
const VIDEO_MIMES = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo'];
const videoFileFilter = (req, file, cb) => {
  if (VIDEO_MIMES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid video type. Allowed: ${VIDEO_MIMES.join(', ')}`), false);
  }
};
const uploadVideoToMemory = multer({
  storage: memoryStorage,
  fileFilter: videoFileFilter,
  limits: { fileSize: MAX_VIDEO_SIZE },
}).single('video');

// Create post: optional image + optional video + optional thumbnail (thumbnail → S3, for feed so app doesn't load all videos)
const postFileFilter = (req, file, cb) => {
  if (file.fieldname === 'image' && ALLOWED_MIMES.includes(file.mimetype)) return cb(null, true);
  if (file.fieldname === 'video' && VIDEO_MIMES.includes(file.mimetype)) return cb(null, true);
  if (file.fieldname === 'thumbnail' && ALLOWED_MIMES.includes(file.mimetype)) return cb(null, true);
  if (file.fieldname === 'image') return cb(new Error(`Invalid image type. Allowed: ${ALLOWED_MIMES.join(', ')}`), false);
  if (file.fieldname === 'video') return cb(new Error(`Invalid video type. Allowed: ${VIDEO_MIMES.join(', ')}`), false);
  if (file.fieldname === 'thumbnail') return cb(new Error(`Invalid thumbnail type. Allowed: ${ALLOWED_MIMES.join(', ')}`), false);
  cb(null, false);
};
const uploadPostMedia = multer({
  storage: memoryStorage,
  fileFilter: postFileFilter,
  limits: { fileSize: MAX_VIDEO_SIZE }, // 100MB so video fits; image/thumbnail size checked in controller
}).fields([{ name: 'image', maxCount: 1 }, { name: 'video', maxCount: 1 }, { name: 'thumbnail', maxCount: 1 }]);

module.exports = { uploadPostImage, uploadPostMedia, uploadProfileImageToMemory, uploadVideoToMemory, UPLOAD_DIR, MAX_FILE_SIZE };
