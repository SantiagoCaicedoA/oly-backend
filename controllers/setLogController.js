const SetLog = require('../models/SetLog');

class SetLogController {
  /**
   * Log a completed set
   * POST /api/set-log
   * Body: { set_number, exercise_name, time?, day }
   */
  async logSet(req, res, next) {
    try {
      const { set_number, exercise_name, time, day } = req.body;

      // Validation
      if (!set_number || typeof set_number !== 'number') {
        return res.status(400).json({
          success: false,
          message: 'set_number is required and must be a number',
        });
      }

      if (!exercise_name || typeof exercise_name !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'exercise_name is required and must be a string',
        });
      }

      if (!day || typeof day !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'day is required and must be a string',
        });
      }

      const validDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
      if (!validDays.includes(day.toLowerCase())) {
        return res.status(400).json({
          success: false,
          message: `day must be one of: ${validDays.join(', ')}`,
        });
      }

      const setLog = new SetLog({
        user: req.user._id,
        set_number,
        exercise_name: exercise_name.trim(),
        time: time ? String(time).trim() : '',
        day: day.toLowerCase(),
      });

      await setLog.save();

      res.status(201).json({
        success: true,
        data: {
          _id: setLog._id,
          set_number: setLog.set_number,
          exercise_name: setLog.exercise_name,
          time: setLog.time,
          day: setLog.day,
          completed_at: setLog.completed_at,
          createdAt: setLog.createdAt,
        },
        message: 'Set logged successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get user's set logs
   * GET /api/set-log?day=&limit=&page=
   */
  async getSetLogs(req, res, next) {
    try {
      const { day, page = 1, limit = 20 } = req.query;

      const filter = { user: req.user._id };
      if (day) {
        const validDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
        if (validDays.includes(day.toLowerCase())) {
          filter.day = day.toLowerCase();
        }
      }

      const pageNum = Math.max(1, parseInt(page) || 1);
      const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 20));
      const skip = (pageNum - 1) * limitNum;

      const logs = await SetLog.find(filter)
        .sort({ completed_at: -1 })
        .limit(limitNum)
        .skip(skip);

      const total = await SetLog.countDocuments(filter);
      const totalPages = Math.ceil(total / limitNum);

      res.status(200).json({
        success: true,
        count: logs.length,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1,
        data: logs,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete a set log
   * DELETE /api/set-log/:id
   */
  async deleteSetLog(req, res, next) {
    try {
      const { id } = req.params;

      const log = await SetLog.findOneAndDelete({
        _id: id,
        user: req.user._id,
      });

      if (!log) {
        return res.status(404).json({
          success: false,
          message: 'Set log not found',
        });
      }

      res.status(200).json({
        success: true,
        message: 'Set log deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new SetLogController();
