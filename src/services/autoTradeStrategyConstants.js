/**
 * AutoTrade Strategy Constants and AI Evolution Timeline.
 */

export const ENTRY_STRATEGY_VERSION = 'V4_OPTIMIZED_LONG';

export const STRATEGY_PATCH_INFO = Object.freeze({
    version: 'V4_OPTIMIZED_LONG',
    patchedAt: '2026-08-16T21:15:00+07:00',
    rationale: 'Overhaul entry funnel (Mean Reversion / Relative Strength), fix TP1 distance (0.95 ATR for 50% partial exit + Breakeven SL), and add Dynamic Expectancy Cooldown Shield.',
    previousStats: {
        totalTrades: 540,
        winRate: '33.89%',
        realizedPnl: '-126,571,327 VND',
        rootCauses: [
            'BLOCK_HTF_DOWN starved all LONGs while SHORT was disabled',
            'TP1 at 1.7 ATR was only filled in 16.9% of trades, 83.1% retraced to SL',
            '5 toxic altcoins (STRK, NIGHT, WLD, XLM, SEI) caused > 280M VND in losses without a dynamic cooldown shield',
        ],
    },
});

export const DEFAULT_LONG_CORE_SYMBOLS = Object.freeze([
    'BTCUSDT',
    'ETHUSDT',
    'SOLUSDT',
    'BNBUSDT',
    'XRPUSDT',
    'ADAUSDT',
    'LINKUSDT',
    'TONUSDT',
    'NEARUSDT',
    'SUIUSDT',
    'AVAXUSDT',
    'DOGEUSDT',
]);

export const OFFICIAL_LIVE_PNL_SOURCE = 'LIVE_FILLS_NET_FEE';
