/**
 * The notification registry. One entry per kind of notification, and the only
 * place their behaviour is described.
 *
 * Each entry says four things:
 *   render    — the title and body, built at CREATE time. Rendering later
 *               would mean a notification's text changing when someone
 *               renames themselves, or a deleted post leaving a blank line
 *               in the history.
 *   groupKey  — what collapses together. Twenty likes on one lift is one
 *               notification saying twenty, not twenty notifications. This is
 *               the difference between a habit and an uninstall.
 *   delayMs   — how long to hold it open for more of the same to arrive.
 *               Zero means send immediately.
 *   quiet     — whether it waits for morning. Almost everything does.
 *
 * Listed in the order they matter. Social activity is the daily habit, a
 * verified lift closes the loop on the highest-effort thing anyone does here,
 * a rank change is the pull nothing else in the sport offers, and proximity
 * is the most motivating and the easiest to overdo.
 */

const MINUTE = 60 * 1000;

function name(actor) {
  return (actor && (actor.display_name || actor.name)) || 'Someone';
}

const TYPES = {
  // ---- 1. social activity ----
  like: {
    render: ({ actor, count }) =>
      count > 1
        ? { title: 'New likes', body: `${name(actor)} and ${count - 1} others liked your lift` }
        : { title: 'New like', body: `${name(actor)} liked your lift` },
    groupKey: ({ postId }) => `like:${postId}`,
    delayMs: 10 * MINUTE,
    quiet: true,
  },
  comment: {
    render: ({ actor, count, text }) =>
      count > 1
        ? { title: 'New comments', body: `${count} new comments on your lift` }
        : {
            title: 'New comment',
            // Truncated here rather than in the client: a push payload has a
            // hard size limit and a long comment silently drops the whole
            // notification.
            body: `${name(actor)}: ${String(text || '').slice(0, 120)}`,
          },
    groupKey: ({ postId }) => `comment:${postId}`,
    delayMs: 5 * MINUTE,
    quiet: true,
  },
  follow: {
    render: ({ actor, count }) =>
      count > 1
        ? { title: 'New followers', body: `${name(actor)} and ${count - 1} others followed you` }
        : { title: 'New follower', body: `${name(actor)} started following you` },
    // Grouped per recipient, not per follower, so a burst of new followers is
    // one notification.
    groupKey: () => 'follow',
    delayMs: 30 * MINUTE,
    quiet: true,
  },
  follow_request: {
    render: ({ actor }) => ({
      title: 'Follow request',
      body: `${name(actor)} wants to follow you`,
    }),
    groupKey: () => 'follow_request',
    delayMs: 30 * MINUTE,
    quiet: true,
  },

  // ---- 2. the lift they worked for ----
  lift_verified: {
    render: ({ liftLabel, weightKg }) => ({
      title: 'Lift verified',
      body: `Your ${liftLabel} at ${weightKg}kg is verified and now counts on the board`,
    }),
    // Never grouped and never held. This is the payoff for the highest-effort
    // thing anyone does in the app, and it should land the moment it happens.
    groupKey: null,
    delayMs: 0,
    quiet: false,
  },
  lift_rejected: {
    render: ({ liftLabel, reason }) => ({
      title: 'Lift needs another look',
      body: reason
        ? `Your ${liftLabel} was not verified: ${reason}`
        : `Your ${liftLabel} was not verified`,
    }),
    groupKey: null,
    delayMs: 0,
    // Bad news can wait for daylight.
    quiet: true,
  },

  // ---- 3. the board ----
  rank_up: {
    render: ({ places, weightClass, rank }) => ({
      title: 'You moved up',
      body: `Up ${places} ${places === 1 ? 'place' : 'places'} to #${rank} in ${weightClass}`,
    }),
    groupKey: ({ weightClass }) => `rank:${weightClass}`,
    delayMs: 15 * MINUTE,
    quiet: true,
  },
  rank_down: {
    render: ({ actor, weightClass, rank }) => ({
      title: 'Someone passed you',
      body: `${name(actor)} moved ahead of you. You are #${rank} in ${weightClass}`,
    }),
    groupKey: ({ weightClass }) => `rank:${weightClass}`,
    delayMs: 15 * MINUTE,
    quiet: true,
  },

  // ---- 4. the one that is easiest to overdo ----
  proximity: {
    render: ({ gapKg, rank, weightClass }) => ({
      title: 'Within reach',
      body: `${gapKg}kg from #${rank} in ${weightClass}`,
    }),
    groupKey: ({ weightClass }) => `proximity:${weightClass}`,
    delayMs: 0,
    quiet: true,
    // Once a week per class, at most. Without a cooldown this fires every
    // time anyone in the class lifts, which is the fastest route to someone
    // turning notifications off for good.
    cooldownMs: 7 * 24 * 60 * MINUTE,
  },
};

const TYPE_NAMES = Object.keys(TYPES);

function isType(t) {
  return typeof t === 'string' && Object.prototype.hasOwnProperty.call(TYPES, t);
}

function typeConfig(t) {
  return isType(t) ? TYPES[t] : null;
}

module.exports = { TYPES, TYPE_NAMES, isType, typeConfig, MINUTE };
