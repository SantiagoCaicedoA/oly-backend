const { Expo } = require('expo-server-sdk');
const Device = require('../models/Device');

/**
 * Sending to Expo.
 *
 * Expo's API is two steps and it matters that both happen. sendPushNotifications
 * returns a TICKET, which only says Expo accepted the message. Whether Apple or
 * Google actually delivered it comes back later in a RECEIPT, and that is the
 * only place DeviceNotRegistered appears. A sender that stops at tickets keeps
 * pushing to uninstalled apps for ever, and Expo eventually rate-limits the
 * whole project for it.
 */

// EXPO_ACCESS_TOKEN is optional. It is worth setting: without it, anyone who
// learns a push token can send notifications to that device as your app.
const expo = new Expo({ accessToken: process.env.EXPO_ACCESS_TOKEN || undefined });

/** Mark a token dead so nothing queues for it again. */
async function disableToken(token, reason) {
  await Device.updateOne({ token }, { $set: { disabledAt: new Date() } });
  console.warn('push token disabled', reason, token.slice(0, 24) + '…');
}

/**
 * Send one notification to every live device of its recipient.
 *
 * @returns {Promise<{sent:number, tickets:Array, noDevices:boolean}>}
 */
async function sendToUser(userId, { title, body, data }) {
  const devices = await Device.find({ user: userId, disabledAt: null }).select('token').lean();
  const tokens = devices.map((d) => d.token).filter((t) => Expo.isExpoPushToken(t));

  // Not an error. Plenty of athletes never grant push permission, and their
  // notifications still exist in the app.
  if (!tokens.length) return { sent: 0, tickets: [], noDevices: true };

  const messages = tokens.map((to) => ({
    to,
    sound: 'default',
    title,
    body,
    data: data || {},
    // Expo drops anything it cannot deliver within this. A stale "someone
    // passed you" landing three days later is worse than not landing.
    ttl: 24 * 60 * 60,
  }));

  const tickets = [];
  for (const chunk of expo.chunkPushNotifications(messages)) {
    try {
      const part = await expo.sendPushNotificationsAsync(chunk);
      part.forEach((ticket, i) => tickets.push({ ticket, token: chunk[i].to }));
    } catch (err) {
      // A whole chunk failed, which is a network or Expo problem rather than
      // a bad token. Throwing lets the worker retry with backoff.
      console.error('expo chunk failed', err.message);
      throw err;
    }
  }

  let sent = 0;
  for (const { ticket, token } of tickets) {
    if (ticket.status === 'ok') {
      sent += 1;
      continue;
    }
    const code = ticket.details && ticket.details.error;
    if (code === 'DeviceNotRegistered') await disableToken(token, code);
    else console.warn('push ticket error', code || ticket.message);
  }

  return { sent, tickets, noDevices: false };
}

/**
 * Check receipts for tickets sent earlier. This is where a token that looked
 * fine at send time turns out to be dead.
 */
async function reconcileReceipts(ticketIds) {
  const ids = (ticketIds || []).filter(Boolean);
  if (!ids.length) return { checked: 0, disabled: 0 };
  let disabled = 0;
  for (const chunk of expo.chunkPushNotificationReceiptIds(ids)) {
    let receipts;
    try {
      receipts = await expo.getPushNotificationReceiptsAsync(chunk);
    } catch (err) {
      console.error('expo receipts failed', err.message);
      continue;
    }
    for (const [, receipt] of Object.entries(receipts)) {
      if (receipt.status === 'ok') continue;
      const code = receipt.details && receipt.details.error;
      if (code === 'DeviceNotRegistered' && receipt.details.expoPushToken) {
        await disableToken(receipt.details.expoPushToken, code);
        disabled += 1;
      } else {
        console.warn('push receipt error', code || receipt.message);
      }
    }
  }
  return { checked: ids.length, disabled };
}

module.exports = { sendToUser, reconcileReceipts, disableToken, isExpoPushToken: Expo.isExpoPushToken };
