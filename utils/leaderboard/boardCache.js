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
 * HARD GUARD, FAIL-CLOSED (review rounds 2+3): "we'll remember not to scale
 * out" is not a control — and neither is an allowlist of env var names.
 * The first version detected multi-instance deploys via WEB_CONCURRENCY /
 * NODE_APP_INSTANCE, which pm2 and Heroku set but Render, Fly, Railway and
 * Cloud Run do not — it failed open exactly where we'd actually deploy.
 * Inverted: in production, running the in-process store requires the
 * operator to explicitly DECLARE single-instance operation with
 * BOARD_CACHE=memory-single-instance. No declaration → refuse to boot.
 * Scaling out then has a natural forcing function: the operator must touch
 * this setting, and the comment they land on says to install a shared
 * store via setStore() (e.g. Redis) first — design doc §7/§9.
 * Dev/test boots freely.
 */
let usingMemoryStore = true;
function assertSingleInstance(env = process.env) {
  if (!usingMemoryStore) return; // shared store installed — scale freely
  if (env.NODE_ENV !== 'production') return;
  if (env.BOARD_CACHE !== 'memory-single-instance') {
    throw new Error(
      'boardCache: refusing to boot in production with the in-process cache ' +
        'undeclared. Either set BOARD_CACHE=memory-single-instance (single ' +
        'API instance ONLY — per-instance caches serve inconsistent boards) ' +
        'or install a shared store via setStore() (e.g. Redis) — design doc §7/§9.'
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
