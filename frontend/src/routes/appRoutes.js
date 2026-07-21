/**
 * URL paths for OMNI DUCK terminal features.
 *
 * Examples:
 *   /login
 *   /vn-stocks
 *   /vn-stocks/TCB
 *   /vn-derivatives
 *   /crypto/BTC
 *   /paper-trading/vn-stocks/FPT
 *   /auto-duck
 *   /broker
 */

export const APP_MODES = {
  VN_STOCKS: 'VN_STOCKS',
  VN_DERIVATIVES: 'VN_DERIVATIVES',
  CRYPTO: 'CRYPTO',
  PAPER_TRADING: 'PAPER_TRADING',
  AUTO_TRADE: 'AUTO_TRADE',
  BROKER_CONNECTION: 'BROKER_CONNECTION',
};

export const PAPER_MARKETS = {
  VN_STOCKS: 'VN_STOCKS',
  VN_DERIVATIVES: 'VN_DERIVATIVES',
  CRYPTO: 'CRYPTO',
  GLOBAL: 'GLOBAL',
};

const MODE_BASE = {
  [APP_MODES.VN_STOCKS]: '/vn-stocks',
  [APP_MODES.VN_DERIVATIVES]: '/vn-derivatives',
  [APP_MODES.CRYPTO]: '/crypto',
  [APP_MODES.PAPER_TRADING]: '/paper-trading',
  [APP_MODES.AUTO_TRADE]: '/auto-duck',
  [APP_MODES.BROKER_CONNECTION]: '/broker',
};

const PAPER_MARKET_SLUG = {
  [PAPER_MARKETS.VN_STOCKS]: 'vn-stocks',
  [PAPER_MARKETS.VN_DERIVATIVES]: 'vn-derivatives',
  [PAPER_MARKETS.CRYPTO]: 'crypto',
  [PAPER_MARKETS.GLOBAL]: 'global',
};

const SLUG_TO_PAPER_MARKET = Object.fromEntries(
  Object.entries(PAPER_MARKET_SLUG).map(([market, slug]) => [slug, market])
);

const BASE_TO_MODE = Object.fromEntries(
  Object.entries(MODE_BASE).map(([mode, base]) => [base, mode])
);

const LEGACY_MODE_ALIASES = {
  VNSTOCK: APP_MODES.VN_STOCKS,
  VN_STOCK: APP_MODES.VN_STOCKS,
  STOCK: APP_MODES.VN_STOCKS,
  DERIVATIVES: APP_MODES.VN_DERIVATIVES,
  DERIV: APP_MODES.VN_DERIVATIVES,
  CRYPTO: APP_MODES.CRYPTO,
  PAPER: APP_MODES.PAPER_TRADING,
  PAPER_TRADING: APP_MODES.PAPER_TRADING,
  AUTO: APP_MODES.AUTO_TRADE,
  AUTO_TRADE: APP_MODES.AUTO_TRADE,
  AUTODUCK: APP_MODES.AUTO_TRADE,
  BROKER: APP_MODES.BROKER_CONNECTION,
  BROKER_CONNECTION: APP_MODES.BROKER_CONNECTION,
};

export const DEFAULT_MODE = APP_MODES.VN_STOCKS;
export const LOGIN_PATH = '/login';

const normalizeSymbol = (symbol) => {
  if (!symbol) return null;
  const clean = String(symbol).trim().toUpperCase();
  return clean || null;
};

/** Build a path for a terminal mode (+ optional symbol / paper market). */
export function buildAppPath({
  mode = DEFAULT_MODE,
  symbol,
  paperMarket = PAPER_MARKETS.VN_STOCKS,
} = {}) {
  const normalizedMode = LEGACY_MODE_ALIASES[String(mode || '').toUpperCase()] || mode;
  const sym = normalizeSymbol(symbol);

  if (normalizedMode === APP_MODES.PAPER_TRADING) {
    const marketKey = PAPER_MARKETS[paperMarket] ? paperMarket : PAPER_MARKETS.VN_STOCKS;
    const marketSlug = PAPER_MARKET_SLUG[marketKey];
    const base = `${MODE_BASE[APP_MODES.PAPER_TRADING]}/${marketSlug}`;
    return sym ? `${base}/${encodeURIComponent(sym)}` : base;
  }

  const base = MODE_BASE[normalizedMode] || MODE_BASE[DEFAULT_MODE];

  if (
    sym &&
    (normalizedMode === APP_MODES.VN_STOCKS ||
      normalizedMode === APP_MODES.CRYPTO ||
      normalizedMode === APP_MODES.VN_DERIVATIVES)
  ) {
    return `${base}/${encodeURIComponent(sym)}`;
  }

  return base;
}

/**
 * Parse pathname into mode / symbol / paperMarket.
 * @returns {{ mode: string|null, symbol: string|null, paperMarket: string|null, isLogin: boolean, isRoot: boolean }}
 */
export function parseAppLocation(pathname = '/') {
  const raw = String(pathname || '/').split('?')[0];
  const path = raw.length > 1 && raw.endsWith('/') ? raw.slice(0, -1) : raw;
  const parts = path.split('/').filter(Boolean);

  if (parts.length === 0) {
    return { mode: null, symbol: null, paperMarket: null, isLogin: false, isRoot: true };
  }

  if (parts[0] === 'login' || parts[0] === 'auth') {
    return { mode: null, symbol: null, paperMarket: null, isLogin: true, isRoot: false };
  }

  const base = `/${parts[0]}`;
  const mode = BASE_TO_MODE[base] || null;

  if (!mode) {
    return { mode: null, symbol: null, paperMarket: null, isLogin: false, isRoot: false };
  }

  if (mode === APP_MODES.PAPER_TRADING) {
    const marketSlug = parts[1];
    const paperMarket = SLUG_TO_PAPER_MARKET[marketSlug] || PAPER_MARKETS.VN_STOCKS;
    const symbol = normalizeSymbol(parts[2] ? decodeURIComponent(parts[2]) : null);
    return { mode, symbol, paperMarket, isLogin: false, isRoot: false };
  }

  const symbol = normalizeSymbol(parts[1] ? decodeURIComponent(parts[1]) : null);
  return {
    mode,
    symbol,
    paperMarket: mode === APP_MODES.PAPER_TRADING ? PAPER_MARKETS.VN_STOCKS : null,
    isLogin: false,
    isRoot: false,
  };
}

/** Resolve last-known mode from localStorage for `/` redirects. */
export function getDefaultModeFromStorage() {
  try {
    const saved = localStorage.getItem('lastActiveMode');
    if (saved && MODE_BASE[saved]) return saved;
  } catch (_) {
    /* ignore */
  }
  return DEFAULT_MODE;
}

/**
 * Legacy Telegram / web deep links: `/?symbol=TCB` or `/?mode=CRYPTO&symbol=BTC`
 * → modern path.
 */
export function legacyQueryToPath(search = '') {
  let params;
  try {
    params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
  } catch (_) {
    return null;
  }

  const rawSymbol = (params.get('symbol') || params.get('s') || '').trim().toUpperCase();
  const rawMode = (params.get('mode') || '').trim().toUpperCase();
  if (!rawSymbol && !rawMode) return null;

  const mode =
    LEGACY_MODE_ALIASES[rawMode] ||
    (rawMode && MODE_BASE[rawMode] ? rawMode : null) ||
    DEFAULT_MODE;

  const symbol =
    mode === APP_MODES.CRYPTO && rawSymbol
      ? rawSymbol.replace(/USDT$/i, '')
      : rawSymbol || null;

  return buildAppPath({ mode, symbol });
}

export function isKnownMode(mode) {
  return Boolean(MODE_BASE[mode]);
}

export { MODE_BASE, PAPER_MARKET_SLUG };
