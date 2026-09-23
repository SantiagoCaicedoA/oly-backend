const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Device — one Expo push token, which is one app install.
 *
 * Keyed on the token rather than the user, because one athlete can have a
 * phone and a tablet and expects both to buzz, and because a token can move
 * between accounts: reinstall the app and sign in as someone else and Expo
 * hands out the SAME token. The upsert therefore reassigns the token to the
 * new user rather than creating a second row, which is what stops one
 * athlete's notifications arriving on another's lock screen.
 */
const DeviceSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    // ExponentPushToken[...]. Validated on the way in; Expo rejects the rest.
    token: { type: String, required: true, unique: true },
    platform: { type: String, enum: ['ios', 'android'], required: true },
    // The device's IANA zone, e.g. "America/Edmonton". Quiet hours are 10pm
    // to 8am for the PERSON, and the server has no other way to know when
    // that is. Nullable, and the sender falls back to sending rather than
    // holding a notification forever because a zone was missing.
    timezone: { type: String, default: null },
    // Set when Expo reports DeviceNotRegistered. The row is kept rather than
    // deleted so a reinstall can revive it, and so "why did this person stop
    // getting notifications" stays answerable.
    disabledAt: { type: Date, default: null },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// The send path asks "live tokens for these users" on every notification.
DeviceSchema.index({ user: 1, disabledAt: 1 });

module.exports = mongoose.model('Device', DeviceSchema);
