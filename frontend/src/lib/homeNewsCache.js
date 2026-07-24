import { API_BASE_URL, API_FETCH_HEADERS } from './apiBase';

const STORAGE_KEY = 'omni_home_news_cache';
const TTL_MS = 5 * 60 * 1000; // 5 minutes TTL

/** Shared module cache for Macro & market news — initialized from localStorage for instant 0ms renders. */
let cache = (() => {
  if (typeof localStorage === 'undefined') return { data: [], ts: 0 };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { data: [], ts: 0 };
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.data)) {
      return { data: parsed.data, ts: Number(parsed.ts) || 0 };
    }
  } catch { /* ignore parse errors */ }
  return { data: [], ts: 0 };
})();

let inflight = null;

function saveLocalCache(nextCache) {
  cache = nextCache;
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextCache));
    } catch { /* ignore quota errors */ }
  }
}

export function getHomeNewsCache() {
  return cache;
}

export function peekHomeNews() {
  return Array.isArray(cache.data) ? cache.data : [];
}

export function isHomeNewsFresh() {
  return cache.data?.length > 0 && (Date.now() - cache.ts) < TTL_MS;
}

/**
 * Fetch home news. Uses memory/localStorage cache; revalidates in background.
 * @param {{ force?: boolean }} [opts]
 */
export async function fetchHomeNewsCached({ force = false } = {}) {
  if (!force && isHomeNewsFresh()) {
    return cache.data;
  }
  // Stale-while-revalidate: return stale immediately but still refresh background
  if (!force && cache.data?.length && inflight) {
    return cache.data;
  }
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/market/home-news`, {
        headers: API_FETCH_HEADERS,
      });
      const json = await res.json();
      if (json?.success && Array.isArray(json.data) && json.data.length > 0) {
        saveLocalCache({ data: json.data, ts: Date.now() });
      }
      return cache.data;
    } finally {
      inflight = null;
    }
  })();

  // If we already have stale data, don't wait — caller shows cached data instantly
  if (!force && cache.data?.length) {
    void inflight;
    return cache.data;
  }
  return inflight;
}

/** Kick off prefetch without awaiting (call from App boot / VN_STOCKS enter). */
export function prefetchHomeNews() {
  void fetchHomeNewsCached({ force: false });
}
