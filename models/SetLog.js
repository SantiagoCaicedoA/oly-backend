const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const setLogSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    set_number: { type: Number, required: true },
    exercise_name: { type: String, required: true },
    time: { type: String, default: '' },
    day: { type: String, required: true, enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] },
    completed_at: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

setLogSchema.index({ user: 1, day: 1, completed_at: -1 });

module.exports = mongoose.model('SetLog', setLogSchema);
