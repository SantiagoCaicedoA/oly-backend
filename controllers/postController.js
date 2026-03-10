const path = require('path');
const fs = require('fs');
const Post = require('../models/Post');
const Like = require('../models/Like');
const Comment = require('../models/Comment');
const { uploadPostVideo, uploadPostThumbnail } = require('../services/s3Service');

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
    out.context_value = sessionDetail.context_value != null ? String(sessionDetail.context_value) : '';
  }

  // lift_name, opinion: trim strings
  if (out.lift_name != null) out.lift_name = String(out.lift_name).trim();
  if (out.opinion != null) out.opinion = String(out.opinion).trim();

  // Remove frontend-only keys so we don't store them as top-level
  delete out.is_private;
  delete out.is_public;

  return out;
}

/** Convert post document to frontend response shape. Includes thumbnail_url so feed can show thumbnails instead of loading all videos. */
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
    thumbnail_url: p.thumbnail_url || '',
    is_private: !isPublic,
    is_public: isPublic,
    lift_name: p.lift_name || '',
    opinion: p.opinion || '',
    context_value: p.context_value || '',
    session_detail: p.session_detail || null,
    status: p.status || 'DRAFT',
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    country: p.user?.profile?.country || '',
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

      // Thumbnail: optional — upload (field "thumbnail") or thumbnail_url in body (for feed so app doesn't load all videos)
      const thumbnailFile = req.files && req.files.thumbnail && req.files.thumbnail[0];
      if (thumbnailFile) {
        if (thumbnailFile.size > MAX_IMAGE_SIZE) {
          return res.status(400).json({
            success: false,
            message: 'Thumbnail must be 5MB or less',
            errors: [{ field: 'thumbnail', message: 'Thumbnail must be 5MB or less' }],
          });
        }
        const thumbnailUrl = await uploadPostThumbnail(
          thumbnailFile.buffer,
          thumbnailFile.mimetype,
          String(req.user._id)
        );
        body.thumbnail_url = thumbnailUrl;
      } else {
        body.thumbnail_url = body.thumbnail_url || '';
      }

      body = normalizePostBody(body);

      const post = new Post({
        user: req.user._id,
        name: body.name ?? '',
        username: body.username ?? '',
        image_url: body.image_url ?? '',
        video_url: body.video_url ?? '',
        thumbnail_url: body.thumbnail_url ?? '',
        lift_name: body.lift_name ?? '',
        opinion: body.opinion ?? '',
        session_detail: body.session_detail != null ? body.session_detail : null,
        load_lifted: body.load_lifted != null ? body.load_lifted : null,
        load_unit: body.load_unit || 'kg',
        context: body.context ?? '',
        context_value: body.context_value ?? '',
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
   * Query params: status, page, limit
   */
  async getPosts(req, res, next) {
    try {
      const { status, page = 1, limit = 10 } = req.query;

      const filter = {};
      if (status) {
        filter.status = status;
      }

      // Only return posts that are shared with friends (not private)
      filter.visibility = { $in: ['SHARED_WITH_FRIENDS'] };

      const pageNum = Math.max(1, parseInt(page) || 1);
      const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 10));
      const skip = (pageNum - 1) * limitNum;

      const posts = await Post.find(filter)
        .sort({ createdAt: -1 })
        .limit(limitNum)
        .skip(skip)
        .populate('user', 'name profile_image_url profile.country');

      // Get like counts and comment counts for all posts efficiently
      const postIds = posts.map(p => p._id);
      const [likeCounts, commentCounts] = await Promise.all([
        Like.aggregate([
          { $match: { post: { $in: postIds } } },
          { $group: { _id: '$post', count: { $sum: 1 } } }
        ]),
        Comment.aggregate([
          { $match: { post: { $in: postIds } } },
          { $group: { _id: '$post', count: { $sum: 1 } } }
        ])
      ]);

      // Create lookup maps
      const likeCountMap = new Map(likeCounts.map(l => [l._id.toString(), l.count]));
      const commentCountMap = new Map(commentCounts.map(c => [c._id.toString(), c.count]));

      // Get current user's likes for these posts
      const userLikes = await Like.find({
        post: { $in: postIds },
        user: req.user._id
      }).select('post');
      const likedPostIds = new Set(userLikes.map(l => l.post.toString()));

      const postsWithCounts = posts.map((p) => {
        const postId = p._id.toString();
        return {
          ...postToFrontendFormat(p),
          likeCount: likeCountMap.get(postId) || 0,
          commentCount: commentCountMap.get(postId) || 0,
          isLiked: likedPostIds.has(postId),
        };
      });

      const total = await Post.countDocuments(filter);
      const totalPages = Math.ceil(total / limitNum);

      res.status(200).json({
        success: true,
        count: posts.length,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1,
        data: postsWithCounts,
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
      const post = await Post.findById(id).populate('user', 'name profile_image_url profile.country');

      if (!post) {
        return res.status(404).json({
          success: false,
          message: 'Post not found',
        });
      }

      // Get like count, comment count, and isLiked for this post
      const [likeCount, commentCount, userLike] = await Promise.all([
        Like.countDocuments({ post: id }),
        Comment.countDocuments({ post: id }),
        Like.findOne({ post: id, user: req.user._id })
      ]);

      res.status(200).json({
        success: true,
        data: {
          ...postToFrontendFormat(post),
          likeCount,
          commentCount,
          isLiked: !!userLike,
        },
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

      // Clean up likes and comments
      await Like.deleteMany({ post: id });
      await Comment.deleteMany({ post: id });

      res.status(200).json({
        success: true,
        message: 'Post deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Like a post
   * POST /api/posts/:id/like
   */
  async likePost(req, res, next) {
    try {
      const { id } = req.params;

      // Check if post exists
      const post = await Post.findById(id);
      if (!post) {
        return res.status(404).json({
          success: false,
          message: 'Post not found',
        });
      }

      // Create like (will fail if already liked due to unique index)
      try {
        const like = new Like({
          post: id,
          user: req.user._id,
        });
        await like.save();
      } catch (err) {
        if (err.code === 11000) {
          return res.status(400).json({
            success: false,
            message: 'You already liked this post',
          });
        }
        throw err;
      }

      // Get updated like count
      const likeCount = await Like.countDocuments({ post: id });

      res.status(200).json({
        success: true,
        message: 'Post liked successfully',
        likeCount,
        isLiked: true,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Unlike a post
   * DELETE /api/posts/:id/like
   */
  async unlikePost(req, res, next) {
    try {
      const { id } = req.params;

      const result = await Like.findOneAndDelete({
        post: id,
        user: req.user._id,
      });

      if (!result) {
        return res.status(400).json({
          success: false,
          message: 'You have not liked this post',
        });
      }

      // Get updated like count
      const likeCount = await Like.countDocuments({ post: id });

      res.status(200).json({
        success: true,
        message: 'Post unliked successfully',
        likeCount,
        isLiked: false,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Add a comment to a post
   * POST /api/posts/:id/comments
   */
  async addComment(req, res, next) {
    try {
      const { id } = req.params;
      const { text, parentComment } = req.body;

      if (!text || !text.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Comment text is required',
        });
      }

      // Check if post exists
      const post = await Post.findById(id);
      if (!post) {
        return res.status(404).json({
          success: false,
          message: 'Post not found',
        });
      }

      // If it's a reply, verify parent comment exists
      if (parentComment) {
        const parent = await Comment.findById(parentComment);
        if (!parent) {
          return res.status(404).json({
            success: false,
            message: 'Parent comment not found',
          });
        }
      }

      const comment = new Comment({
        post: id,
        user: req.user._id,
        text: text.trim(),
        parentComment: parentComment || null,
      });

      await comment.save();
      await comment.populate('user', 'name profile_image_url');

      // Get updated comment count
      const commentCount = await Comment.countDocuments({ post: id });

      res.status(201).json({
        success: true,
        message: 'Comment added successfully',
        data: {
          _id: comment._id,
          text: comment.text,
          user: comment.user,
          createdAt: comment.createdAt,
          parentComment: comment.parentComment,
        },
        commentCount,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get comments for a post
   * GET /api/posts/:id/comments?page=1&limit=20
   */
  async getComments(req, res, next) {
    try {
      const { id } = req.params;
      const { page = 1, limit = 20 } = req.query;

      // Check if post exists
      const post = await Post.findById(id);
      if (!post) {
        return res.status(404).json({
          success: false,
          message: 'Post not found',
        });
      }

      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
      const skip = (pageNum - 1) * limitNum;

      // Get top-level comments (no parentComment) sorted by newest
      const comments = await Comment.find({
        post: id,
        parentComment: null, // Only top-level comments
      })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate('user', 'name profile_image_url');

      // Get replies for each comment (limited to 5 per comment for performance)
      const commentsWithReplies = await Promise.all(
        comments.map(async (comment) => {
          const replies = await Comment.find({
            parentComment: comment._id,
          })
            .sort({ createdAt: 1 })
            .limit(5)
            .populate('user', 'name profile_image_url');

          return {
            ...comment.toObject(),
            replies,
            replyCount: await Comment.countDocuments({ parentComment: comment._id }),
          };
        })
      );

      const total = await Comment.countDocuments({ post: id, parentComment: null });
      const totalPages = Math.ceil(total / limitNum);

      res.status(200).json({
        success: true,
        count: comments.length,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1,
        data: commentsWithReplies,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete a comment
   * DELETE /api/posts/:id/comments/:commentId
   */
  async deleteComment(req, res, next) {
    try {
      const { id, commentId } = req.params;

      const comment = await Comment.findOne({
        _id: commentId,
        post: id,
        user: req.user._id, // Can only delete own comments
      });

      if (!comment) {
        return res.status(404).json({
          success: false,
          message: 'Comment not found or you are not authorized to delete it',
        });
      }

      // Delete the comment and all its replies
      await Comment.deleteMany({
        $or: [
          { _id: commentId },
          { parentComment: commentId },
        ],
      });

      // Get updated comment count
      const commentCount = await Comment.countDocuments({ post: id });

      res.status(200).json({
        success: true,
        message: 'Comment deleted successfully',
        commentCount,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new PostController();
