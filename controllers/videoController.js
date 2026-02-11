const Video = require('../models/Video');
const { uploadVideo } = require('../services/s3Service');

class VideoController {
    /**
     * POST /api/videos/upload – Upload video file to S3, return URL (no Video record created).
     */
    async uploadVideoFile(req, res, next) {
        try {
            if (!req.file || !req.file.buffer) {
                return res.status(400).json({
                    success: false,
                    message: 'No video file provided. Send multipart form with field "video".',
                });
            }

            const url = await uploadVideo(
                req.file.buffer,
                req.file.mimetype,
                String(req.user._id)
            );

            res.status(200).json({
                success: true,
                url,
                message: 'Video uploaded successfully. Use this URL in POST /api/videos with metadata.',
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Upload a new video (create Video record – expects video_url in body or from prior upload).
     */
    async uploadVideo(req, res, next) {
        try {
            const video = new Video({
                user: req.user._id,
                ...req.body
            });

            await video.save();

            res.status(201).json({
                success: true,
                data: video,
                message: 'Video uploaded successfully'
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Get all videos for current user with optional filtering
     * Query params: category, lift_name, limit, skip
     */
    async getVideos(req, res, next) {
        try {
            const { category, lift_name, limit = 50, skip = 0 } = req.query;

            const filter = { user: req.user._id };

            // Add optional filters
            if (category) {
                filter.category = category;
            }

            if (lift_name) {
                filter.lift_name = new RegExp(lift_name, 'i'); // Case-insensitive partial match
            }

            const videos = await Video.find(filter)
                .sort({ created_at: -1 }) // Most recent first
                .limit(parseInt(limit))
                .skip(parseInt(skip));

            const total = await Video.countDocuments(filter);

            res.status(200).json({
                success: true,
                count: videos.length,
                total,
                data: videos
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Get a single video by ID
     */
    async getVideoById(req, res, next) {
        try {
            const { id } = req.params;

            const video = await Video.findOne({
                _id: id,
                user: req.user._id
            });

            if (!video) {
                return res.status(404).json({
                    success: false,
                    message: 'Video not found'
                });
            }

            res.status(200).json({
                success: true,
                data: video
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Update video metadata
     */
    async updateVideo(req, res, next) {
        try {
            const { id } = req.params;

            const video = await Video.findOne({
                _id: id,
                user: req.user._id
            });

            if (!video) {
                return res.status(404).json({
                    success: false,
                    message: 'Video not found'
                });
            }

            Object.assign(video, req.body);
            await video.save();

            res.status(200).json({
                success: true,
                data: video,
                message: 'Video updated successfully'
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * Delete a video
     */
    async deleteVideo(req, res, next) {
        try {
            const { id } = req.params;

            const video = await Video.findOneAndDelete({
                _id: id,
                user: req.user._id
            });

            if (!video) {
                return res.status(404).json({
                    success: false,
                    message: 'Video not found'
                });
            }

            res.status(200).json({
                success: true,
                message: 'Video deleted successfully'
            });
        } catch (error) {
            next(error);
        }
    }
}

module.exports = new VideoController();
