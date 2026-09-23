const Notification = require('../models/Notification');
const { sendToUser } = require('../services/pushSender');

/**
 * Drains due notifications.
 *
 * Same shape as the board outbox worker, and for the same reason: the claim
 * has to be atomic. Without it two ticks both match the same pending row and
 * the athlete's phone buzzes twice for one like, which is exactly the kind of
 * thing that gets notifications switched off.
 *
 * Runs in-process on a timer for now. Everything here is written so it stays
 * correct when it moves out of process: the claim is a findOneAndUpdate, the
 * reaper returns crashed claims, and retries back off rather than burning
 * their attempts in one second.
 */

const MAX_ATTEMPTS = 5;
const CLAIM_TIMEOUT_MS = 2 * 60 * 1000;
const BATCH = 50;

/** Backoff: 30s, 2m, 8m, 32m. A two-second Mongo blip must not exhaust it. */
function backoffMs(attempts) {
  return Math.min(30 * 1000 * Math.pow(4, Math.max(0, attempts - 1)), 60 * 60 * 1000);
}

/** Return rows claimed by a worker that died mid-send. */
async function reapStuck() {
  const cutoff = new Date(Date.now() - CLAIM_TIMEOUT_MS);
  const res = await Notification.updateMany(
    { status: 'processing', claimedAt: { $lt: cutoff } },
    { $set: { status: 'pending', claimedAt: null } }
  );
  return res.modifiedCount || 0;
}

/**
 * Claim one due notification. findOneAndUpdate is atomic, so two workers
 * racing here produce one winner and one null rather than two sends.
 */
async function claimOne() {
  return Notification.findOneAndUpdate(
    { status: 'pending', availableAt: { $lte: new Date() } },
    { $set: { status: 'processing', claimedAt: new Date() }, $inc: { attempts: 1 } },
    { sort: { availableAt: 1 }, new: true }
  );
}

async function deliver(note) {
  try {
    const { sent, noDevices } = await sendToUser(note.user, {
      title: note.title,
      body: note.body,
      data: { ...(note.data || {}), notificationId: String(note._id), type: note.type },
    });

    // No device is a settled outcome, not a failure to retry. Most athletes
    // will never grant push permission and their rows would otherwise churn
    // through five attempts each.
    note.status = noDevices || sent === 0 ? 'suppressed' : 'sent';
    note.sentAt = sent > 0 ? new Date() : null;
    note.lastError = null;
    await note.save();
    return note.status;
  } catch (err) {
    note.lastError = String(err && err.message).slice(0, 500);
    if (note.attempts >= MAX_ATTEMPTS) {
      note.status = 'failed';
    } else {
      note.status = 'pending';
      note.availableAt = new Date(Date.now() + backoffMs(note.attempts));
    }
    await note.save();
    return note.status;
  }
}

/** One pass. Returns what it did, so the checks can assert on it. */
async function tick({ batch = BATCH } = {}) {
  const reaped = await reapStuck();
  const out = { reaped, sent: 0, suppressed: 0, failed: 0, retried: 0 };
  for (let i = 0; i < batch; i += 1) {
    const note = await claimOne();
    if (!note) break;
    const result = await deliver(note);
    if (result === 'sent') out.sent += 1;
    else if (result === 'suppressed') out.suppressed += 1;
    else if (result === 'failed') out.failed += 1;
    else out.retried += 1;
  }
  return out;
}

let timer = null;

function start({ intervalMs = 30 * 1000 } = {}) {
  if (timer) return timer;
  // unref so the timer never keeps the process alive on shutdown.
  timer = setInterval(() => {
    tick().catch((err) => console.error('notification worker tick failed', err));
  }, intervalMs);
  if (timer.unref) timer.unref();
  console.log(`Notification worker started (every ${Math.round(intervalMs / 1000)}s)`);
  return timer;
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { tick, start, stop, claimOne, reapStuck, backoffMs, MAX_ATTEMPTS };
