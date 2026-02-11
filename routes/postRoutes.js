const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const postController = require('../controllers/postController');
const auth = require('../middleware/auth');
const { uploadPostMedia } = require('../config/upload');

/** Merge JSON payload from form field (e.g. "data") into req.body so controller gets lift_name, opinion, session_detail. */
function mergePostBody(req, res, next) {
  const body = req.body || {};
  const jsonKeys = ['data', 'body', 'payload', 'json', 'formData', 'post'];
  for (const key of jsonKeys) {
    const raw = body[key];
    if (raw == null) continue;
    let parsed = null;
    if (typeof raw === 'string' && (raw.trim().startsWith('{') || raw.trim().startsWith('['))) {
      try {
        parsed = JSON.parse(raw);
      } catch {
        continue;
      }
    } else if (typeof raw === 'object' && !Array.isArray(raw)) {
      parsed = raw;
    }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      delete req.body[key];
      Object.assign(req.body, parsed);
      return next();
    }
  }
  for (const key of Object.keys(body)) {
    const raw = body[key];
    if (typeof raw === 'string' && raw.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          delete req.body[key];
          Object.assign(req.body, parsed);
          break;
        }
      } catch {
        // ignore
      }
    }
  }
  next();
}

const validate = (req, res, next) => {
  const result = validationResult(req);
  if (!result.isEmpty()) {
    const errors = result.array();
    const message = errors.map((e) => e.msg).join('. ') || 'Validation failed';
    return res.status(400).json({
      success: false,
      message,
      errors: errors.map((e) => ({ field: e.path, message: e.msg })),
    });
  }
  next();
};

// Require video: either uploaded (field "video") or video_url in body. Image is optional.
const requireVideo = (req, res, next) => {
  const hasVideoFile = req.files && req.files.video && req.files.video[0];
  const hasVideoUrl = req.body.video_url && String(req.body.video_url).trim();
  if (!hasVideoFile && !hasVideoUrl) {
    return res.status(400).json({
      success: false,
      message: 'Video is required: upload a video (field "video") or provide video_url in body',
      errors: [{ field: 'video', message: 'Video file or video_url is required' }],
    });
  }
  next();
};

const createPostValidation = [
  body('image_url').optional().trim().isLength({ max: 2048 }),
  body('video_url').optional().trim().isLength({ max: 2048 }),
  body('data').optional(), // JSON string of full payload (merged into body by mergePostBody)
  body('body').optional(),
  body('payload').optional(),
  // Frontend payload
  body('is_private').optional(),
  body('is_public').optional(),
  body('lift_name').optional().trim().isLength({ max: 200 }),
  body('opinion').optional().trim().isLength({ max: 2000 }),
  body('session_detail').optional(),
  // Legacy / mapped
  body('load_lifted').optional().isFloat({ min: 0 }).toFloat(),
  body('load_unit').optional().isIn(['kg', 'lbs']),
  body('context').optional().trim().isLength({ max: 500 }),
  body('intent').optional().trim().isLength({ max: 500 }),
  body('effort').optional().trim().isLength({ max: 500 }),
  body('rpe').optional().isFloat({ min: 0, max: 10 }).toFloat(),
  body('visibility').optional().isArray().withMessage('visibility must be an array'),
  body('visibility.*').optional().isIn(['PRIVATE', 'SHARED_WITH_FRIENDS']),
  body('status').optional().isIn(['DRAFT', 'PUBLISHED']),
];

router.use(auth);

// Create post: multipart with video (field "video") + other details in body. Image optional.
router.post(
  '/',
  (req, res, next) => {
    uploadPostMedia(req, res, (err) => {
      if (err) {
        const message = err.code === 'LIMIT_FILE_SIZE' ? 'File too large (video max 100MB)' : err.message;
        return res.status(400).json({ success: false, message, errors: [{ field: err.field || 'file', message }] });
      }
      next();
    });
  },
  mergePostBody,
  createPostValidation,
  validate,
  requireVideo,
  postController.createPost
);
router.get('/', postController.getPosts);
router.get('/:id', postController.getPostById);
router.put('/:id', postController.updatePost);
router.delete('/:id', postController.deletePost);

module.exports = router;
