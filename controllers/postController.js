const path = require('path');
const fs = require('fs');
const Post = require('../models/Post');
const { uploadPostVideo } = require('../services/s3Service');

const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'images');
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * Parse session_detail from form-data (may be JSON string).
 */
function parseSessionDetail(sd) {
  if (sd == null) return null;
  if (typeof sd === 'object') return sd;
  if (typeof sd === 'string') {
    try {
      return JSON.parse(sd);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * If frontend sent the whole payload as a single JSON string (any form field),
 * parse it and merge into body so we don't lose lift_name, opinion, session_detail, etc.
 * Checks common keys first, then any field whose value is a string starting with '{'.
 */
function mergeJsonPayload(body) {
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
      delete body[key];
      Object.assign(body, parsed);
      return body;
    }
  }
  // Fallback: any key with a string value that looks like JSON
  for (const key of Object.keys(body)) {
    const raw = body[key];
    if (typeof raw === 'string' && raw.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          delete body[key];
          Object.assign(body, parsed);
          return body;
        }
      } catch {
        // ignore
      }
    }
  }
  return body;
}

/**
 * Normalize frontend payload to DB shape.
 * Frontend sends: is_private, is_public, lift_name, opinion, session_detail { context, effort_value, intent_opt, isEffort, isIntent, lifted_kg }.
 * Form-data: all values may be strings; session_detail may be JSON string.
 */
function normalizePostBody(body) {
  const out = { ...body };

  // is_private / is_public → visibility
  if (out.is_private !== undefined || out.is_public !== undefined) {
    const isPublic = out.is_public === true || out.is_public === 'true';
    out.visibility = isPublic ? ['SHARED_WITH_FRIENDS'] : ['PRIVATE'];
  }
  if (typeof out.visibility === 'string') {
    try {
      out.visibility = JSON.parse(out.visibility);
    } catch {
      out.visibility = out.visibility.split(',').map((s) => s.trim()).filter(Boolean);
    }
  }

  // session_detail: parse if string, store as-is and map to flat fields
  const sessionDetail = parseSessionDetail(out.session_detail);
  if (sessionDetail && typeof sessionDetail === 'object') {
    out.session_detail = sessionDetail;
    out.load_lifted = sessionDetail.lifted_kg != null ? Number(sessionDetail.lifted_kg) : null;
    out.load_unit = 'kg';
    out.intent = sessionDetail.intent_opt != null ? String(sessionDetail.intent_opt) : '';
    out.effort = sessionDetail.effort_value != null ? String(sessionDetail.effort_value) : '';
    out.context = sessionDetail.context != null ? String(sessionDetail.context) : '';
  }

  // lift_name, opinion: trim strings
  if (out.lift_name != null) out.lift_name = String(out.lift_name).trim();
  if (out.opinion != null) out.opinion = String(out.opinion).trim();

  // Remove frontend-only keys so we don't store them as top-level
  delete out.is_private;
  delete out.is_public;

  return out;
}

/** Convert post document to frontend response shape (is_private, is_public, lift_name, opinion, session_detail). image_url omitted from response. */
function postToFrontendFormat(post) {
  const p = post && typeof post.toObject === 'function' ? post.toObject() : { ...post };
  const visibility = p.visibility || [];
  const isPublic = visibility.includes('SHARED_WITH_FRIENDS');
  return {
    _id: p._id,
    user: p.user,
    name: p.name || '',
    username: p.username || '',
    video_url: p.video_url || '',
    is_private: !isPublic,
    is_public: isPublic,
    lift_name: p.lift_name || '',
    opinion: p.opinion || '',
    session_detail: p.session_detail || null,
    status: p.status || 'DRAFT',
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

class PostController {
  /**
   * Create a new post (draft or published).
   * Video required (upload field "video" or body video_url). Other details in body (form-data).
   * Image is optional.
   */
  async createPost(req, res, next) {
    try {
      let body = { ...req.body };
      body = mergeJsonPayload(body);

      // Optional image file: save to local uploads and set image_url
      const imageFile = req.files && req.files.image && req.files.image[0];
      if (imageFile) {
        if (imageFile.size > MAX_IMAGE_SIZE) {
          return res.status(400).json({
            success: false,
            message: 'Image must be 5MB or less',
            errors: [{ field: 'image', message: 'Image must be 5MB or less' }],
          });
        }
        const ext = (path.extname(imageFile.originalname) || '.jpg').toLowerCase();
        const safeExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext) ? ext : '.jpg';
        const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}${safeExt}`;
        if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
        fs.writeFileSync(path.join(UPLOAD_DIR, filename), imageFile.buffer);
        body.image_url = `/uploads/images/${filename}`;
      } else {
        body.image_url = body.image_url || '';
      }

      // Video: required — either uploaded (S3) or video_url in body
      const videoFile = req.files && req.files.video && req.files.video[0];
      if (videoFile) {
        const videoUrl = await uploadPostVideo(
          videoFile.buffer,
          videoFile.mimetype,
          String(req.user._id)
        );
        body.video_url = videoUrl;
      }

      body = normalizePostBody(body);

      const post = new Post({
        user: req.user._id,
        name: body.name ?? '',
        username: body.username ?? '',
        image_url: body.image_url ?? '',
        video_url: body.video_url ?? '',
        lift_name: body.lift_name ?? '',
        opinion: body.opinion ?? '',
        session_detail: body.session_detail != null ? body.session_detail : null,
        load_lifted: body.load_lifted != null ? body.load_lifted : null,
        load_unit: body.load_unit || 'kg',
        context: body.context ?? '',
        intent: body.intent ?? '',
        effort: body.effort ?? '',
        visibility: Array.isArray(body.visibility) ? body.visibility : ['PRIVATE'],
        status: body.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT',
      });

      await post.save();

      res.status(201).json({
        success: true,
        data: postToFrontendFormat(post),
        message:
          post.status === 'DRAFT'
            ? 'Draft saved successfully'
            : 'Post created successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get all posts from all users (feed). Optional filtering by status.
   * Query params: status, limit, skip
   */
  async getPosts(req, res, next) {
    try {
      const { status, limit = 50, skip = 0 } = req.query;

      const filter = {};
      if (status) {
        filter.status = status;
      }

      const posts = await Post.find(filter)
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip(parseInt(skip))
        .populate('user', 'name');

      const total = await Post.countDocuments(filter);

      res.status(200).json({
        success: true,
        count: posts.length,
        total,
        data: posts.map((p) => postToFrontendFormat(p)),
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get a single post by ID
   */
  async getPostById(req, res, next) {
    try {
      const { id } = req.params;
      console.log("id", id);
      console.log("request . user id", req.user._id);
      const post = await Post.findOne({
        _id: id,
        user: req.user._id,
      });

      if (!post) {
        return res.status(404).json({
          success: false,
          message: 'Post not found',
        });
      }

      res.status(200).json({
        success: true,
        data: postToFrontendFormat(post),
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update a post (e.g. edit draft, publish draft)
   */
  async updatePost(req, res, next) {
    try {
      const { id } = req.params;

      const post = await Post.findOne({
        _id: id,
        user: req.user._id,
      });

      if (!post) {
        return res.status(404).json({
          success: false,
          message: 'Post not found',
        });
      }

      const body = normalizePostBody({ ...req.body });
      Object.assign(post, body);
      await post.save();

      res.status(200).json({
        success: true,
        data: postToFrontendFormat(post),
        message: 'Post updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete a post
   */
  async deletePost(req, res, next) {
    try {
      const { id } = req.params;

      const post = await Post.findOneAndDelete({
        _id: id,
        user: req.user._id,
      });

      if (!post) {
        return res.status(404).json({
          success: false,
          message: 'Post not found',
        });
      }

      res.status(200).json({
        success: true,
        message: 'Post deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new PostController();
