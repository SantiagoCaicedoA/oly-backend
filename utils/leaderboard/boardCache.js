/**
 * Short-TTL cache for page-1 board responses.
 *
 * Correctness depends on the board endpoint being viewer-independent
 * (GET /leaderboard carries no per-user data; /me and /friends are never
 * cached here). Keys are the full filter tuple.
 *
 * STORE INTERFACE ON PURPOSE: this in-process Map implementation is correct
 * on a single API instance only. Before running >1 instance, swap
 * createMemoryStore() for a Redis-backed store with the same get/set —
 * configuration, not surgery (design doc §7/§9).
 */

const DEFAULT_TTL_MS = 45 * 1000;
const MAX_ENTRIES = 500; // bounded: filter-tuple space is small in practice

/**
 * HARD GUARD (review): "we'll remember not to scale out" is not a control.
 * If the process is visibly one of several instances (pm2 cluster sets
 * NODE_APP_INSTANCE, Heroku-style deploys set WEB_CONCURRENCY) and the
 * cache is still the in-process store, refuse to boot — a fleet of
 * per-instance caches serves inconsistent boards with nothing in the logs.
 * Swapping in a shared store via setStore() clears the flag.
 */
let usingMemoryStore = true;
function assertSingleInstance(env = process.env) {
  if (!usingMemoryStore) return; // shared store installed — scale freely
  const webConcurrency = parseInt(env.WEB_CONCURRENCY || '1', 10);
  const pm2Instance = env.NODE_APP_INSTANCE != null ? parseInt(env.NODE_APP_INSTANCE, 10) : 0;
  if (webConcurrency > 1 || pm2Instance > 0) {
    throw new Error(
      'boardCache: in-process cache detected in a multi-instance deployment ' +
        '(WEB_CONCURRENCY/NODE_APP_INSTANCE). Install a shared store via ' +
        'setStore() (e.g. Redis) before scaling out — design doc §7/§9.'
    );
  }
}
assertSingleInstance();

function createMemoryStore() {
  const map = new Map();
  return {
    async get(key) {
      const hit = map.get(key);
      if (!hit) return null;
      if (hit.expiresAt < Date.now()) {
        map.delete(key);
        return null;
      }
      return hit.value;
    },
    async set(key, value, ttlMs) {
      if (map.size >= MAX_ENTRIES) {
        // drop the oldest entry (Map preserves insertion order)
        map.delete(map.keys().next().value);
      }
      map.set(key, { value, expiresAt: Date.now() + ttlMs });
    },
  };
}

let store = createMemoryStore();

/** Swap the backing store (e.g. Redis) without touching call sites. */
function setStore(customStore) {
  store = customStore;
  usingMemoryStore = false;
}

async function getCached(key) {
  return store.get(key);
}

async function setCached(key, value, ttlMs = DEFAULT_TTL_MS) {
  return store.set(key, value, ttlMs);
}

module.exports = {
  getCached,
  setCached,
  setStore,
  createMemoryStore,
  DEFAULT_TTL_MS,
  assertSingleInstance, // exported for the DB-free checks
};
