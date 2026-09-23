/**
 * Quiet hours, in the athlete's own timezone.
 *
 * 10pm to 8am means 10pm where the PERSON is. Oly already has athletes in
 * Calgary and in Cali, so a server-side window would buzz half of them at
 * three in the morning.
 *
 * Done with Intl rather than a date library. Node ships the full IANA
 * database, the whole job is two conversions, and a dependency that parses
 * timezones is a dependency that can break a deploy.
 */

const DEFAULT_START = 22; // 10pm
const DEFAULT_END = 8; //  8am

/**
 * How far the given zone is from UTC at that instant, in ms.
 * Reads the wall clock in the zone and compares it to the wall clock in UTC,
 * which is the only way to get this right across DST without a table.
 */
function offsetMs(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
    .formatToParts(date)
    .reduce((acc, p) => (p.type === 'literal' ? acc : ((acc[p.type] = p.value), acc)), {});

  const asIfUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    // en-US with hour12:false renders midnight as 24; Date.UTC wants 0.
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second)
  );
  return asIfUtc - date.getTime();
}

/** The wall-clock hour in that zone, 0-23. */
function localHour(date, timeZone) {
  return new Date(date.getTime() + offsetMs(date, timeZone)).getUTCHours();
}

/**
 * The instant at which a given wall-clock time next occurs in a zone.
 * Resolved twice because the offset can differ between the guess and the
 * answer, which is exactly what happens on the two DST days a year.
 */
function instantForLocalHour(after, timeZone, hour) {
  let guess = new Date(after.getTime());
  for (let i = 0; i < 2; i += 1) {
    const local = new Date(guess.getTime() + offsetMs(guess, timeZone));
    local.setUTCHours(hour, 0, 0, 0);
    let target = local.getTime() - offsetMs(guess, timeZone);
    if (target <= after.getTime()) target += 24 * 60 * 60 * 1000;
    guess = new Date(target);
  }
  return guess;
}

/**
 * When may this be delivered?
 *
 * Returns `at` unchanged when it is outside quiet hours, when quiet hours are
 * off, or when we do not know the athlete's zone. That last one is
 * deliberate: an unknown zone must not hold a notification for ever, and a
 * badly timed buzz is a smaller failure than silence.
 */
function deliverableAt(at, timeZone, { enabled = true, start = DEFAULT_START, end = DEFAULT_END } = {}) {
  if (!enabled || !timeZone) return at;
  let hour;
  try {
    hour = localHour(at, timeZone);
  } catch (err) {
    // An invalid zone string from a client. Send rather than swallow.
    return at;
  }
  const inQuiet = start > end ? hour >= start || hour < end : hour >= start && hour < end;
  if (!inQuiet) return at;
  return instantForLocalHour(at, timeZone, end);
}

module.exports = { deliverableAt, localHour, offsetMs, instantForLocalHour, DEFAULT_START, DEFAULT_END };
