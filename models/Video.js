const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const VideoSchema = new Schema({
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    // Core Metadata
    lift_name: { type: String, required: true }, // e.g., "Pause Power Snatch + Hang Power Snatch"
    category: {
        type: String,
        enum: ['Classic', 'Squat', 'Press_Jerk', 'Variation'],
        required: true
    },

    // Lift Stats
    reps: { type: Number, required: true },
    weight_value: { type: Number, required: true },
    weight_unit: { type: String, enum: ['kg', 'lbs'], default: 'kg' },

    // Training Context (Optional - used when uploaded from training screen)
    intensity_percent: Number,
    percent_of: String, // e.g., "snatch"
    set_index: Number,
    set_total: Number,
    set_label: String, // "top_set", etc.

    // Subjective Metrics
    effort_meter: Number,
    bar_speed_label: String, // "fast", etc.
    coach_insight: String,

    // Media
    video_url: { type: String, required: true },
    thumbnail_url: String,

    created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Video', VideoSchema);
