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
}

async function getCached(key) {
  return store.get(key);
}

async function setCached(key, value, ttlMs = DEFAULT_TTL_MS) {
  return store.set(key, value, ttlMs);
}

module.exports = { getCached, setCached, setStore, createMemoryStore, DEFAULT_TTL_MS };
