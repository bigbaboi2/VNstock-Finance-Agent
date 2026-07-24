/**
 * Curated international equity / index universe for Tab 4.
 * yahooSymbol is the Yahoo Finance ticker.
 */

export const INTERNATIONAL_MARKETS = [
    {
        id: 'US',
        label: 'Mỹ',
        labelEn: 'United States',
        currencyHint: 'USD',
        timezone: 'America/New_York',
        symbols: [
            { symbol: 'AAPL', yahooSymbol: 'AAPL', name: 'Apple' },
            { symbol: 'MSFT', yahooSymbol: 'MSFT', name: 'Microsoft' },
            { symbol: 'NVDA', yahooSymbol: 'NVDA', name: 'NVIDIA' },
            { symbol: 'GOOGL', yahooSymbol: 'GOOGL', name: 'Alphabet' },
            { symbol: 'AMZN', yahooSymbol: 'AMZN', name: 'Amazon' },
            { symbol: 'META', yahooSymbol: 'META', name: 'Meta' },
            { symbol: 'TSLA', yahooSymbol: 'TSLA', name: 'Tesla' },
            { symbol: 'SPY', yahooSymbol: 'SPY', name: 'SPDR S&P 500 ETF' },
            { symbol: 'QQQ', yahooSymbol: 'QQQ', name: 'Invesco QQQ' },
            { symbol: '^GSPC', yahooSymbol: '^GSPC', name: 'S&P 500' },
            { symbol: '^DJI', yahooSymbol: '^DJI', name: 'Dow Jones' },
            { symbol: '^IXIC', yahooSymbol: '^IXIC', name: 'Nasdaq Composite' },
        ],
    },
    {
        id: 'JP',
        label: 'Nhật',
        labelEn: 'Japan',
        currencyHint: 'JPY',
        timezone: 'Asia/Tokyo',
        symbols: [
            { symbol: '7203.T', yahooSymbol: '7203.T', name: 'Toyota' },
            { symbol: '6758.T', yahooSymbol: '6758.T', name: 'Sony' },
            { symbol: '9984.T', yahooSymbol: '9984.T', name: 'SoftBank' },
            { symbol: '6861.T', yahooSymbol: '6861.T', name: 'Keyence' },
            { symbol: '8306.T', yahooSymbol: '8306.T', name: 'Mitsubishi UFJ' },
            { symbol: '^N225', yahooSymbol: '^N225', name: 'Nikkei 225' },
        ],
    },
    {
        id: 'KR',
        label: 'Hàn',
        labelEn: 'South Korea',
        currencyHint: 'KRW',
        timezone: 'Asia/Seoul',
        symbols: [
            { symbol: '005930.KS', yahooSymbol: '005930.KS', name: 'Samsung Electronics' },
            { symbol: '000660.KS', yahooSymbol: '000660.KS', name: 'SK Hynix' },
            { symbol: '035420.KS', yahooSymbol: '035420.KS', name: 'Naver' },
            { symbol: '035720.KS', yahooSymbol: '035720.KS', name: 'Kakao' },
            { symbol: '^KS11', yahooSymbol: '^KS11', name: 'KOSPI' },
        ],
    },
    {
        id: 'CN_HK',
        label: 'Trung–HK',
        labelEn: 'China / Hong Kong',
        currencyHint: 'HKD/CNY',
        timezone: 'Asia/Hong_Kong',
        symbols: [
            { symbol: '0700.HK', yahooSymbol: '0700.HK', name: 'Tencent' },
            { symbol: '9988.HK', yahooSymbol: '9988.HK', name: 'Alibaba' },
            { symbol: '9618.HK', yahooSymbol: '9618.HK', name: 'JD.com' },
            { symbol: '3690.HK', yahooSymbol: '3690.HK', name: 'Meituan' },
            { symbol: '000001.SS', yahooSymbol: '000001.SS', name: 'SSE Composite' },
            { symbol: '^HSI', yahooSymbol: '^HSI', name: 'Hang Seng' },
        ],
    },
    {
        id: 'EU',
        label: 'Châu Âu',
        labelEn: 'Europe',
        currencyHint: 'EUR/GBP',
        timezone: 'Europe/London',
        symbols: [
            { symbol: 'ASML.AS', yahooSymbol: 'ASML.AS', name: 'ASML' },
            { symbol: 'SAP.DE', yahooSymbol: 'SAP.DE', name: 'SAP' },
            { symbol: 'MC.PA', yahooSymbol: 'MC.PA', name: 'LVMH' },
            { symbol: 'SHEL.L', yahooSymbol: 'SHEL.L', name: 'Shell' },
            { symbol: '^FTSE', yahooSymbol: '^FTSE', name: 'FTSE 100' },
            { symbol: '^GDAXI', yahooSymbol: '^GDAXI', name: 'DAX' },
        ],
    },
];

const FLAT = INTERNATIONAL_MARKETS.flatMap((m) =>
    m.symbols.map((s) => ({ ...s, country: m.id, countryLabel: m.label }))
);

const BY_YAHOO = new Map(FLAT.map((s) => [s.yahooSymbol.toUpperCase(), s]));
const BY_SYMBOL = new Map(FLAT.map((s) => [s.symbol.toUpperCase(), s]));

export const listMarketsMeta = () =>
    INTERNATIONAL_MARKETS.map(({ id, label, labelEn, currencyHint, timezone, symbols }) => ({
        id,
        label,
        labelEn,
        currencyHint,
        timezone,
        count: symbols.length,
        symbols: symbols.map(({ symbol, yahooSymbol, name }) => ({ symbol, yahooSymbol, name })),
    }));

export const getMarketById = (id) =>
    INTERNATIONAL_MARKETS.find((m) => m.id === String(id || '').toUpperCase()) || null;

export const resolveUniverseEntry = (raw) => {
    const key = String(raw || '').trim().toUpperCase();
    if (!key) return null;
    return BY_YAHOO.get(key) || BY_SYMBOL.get(key) || null;
};

export const searchUniverse = (q, limit = 20) => {
    const kw = String(q || '').trim().toUpperCase();
    if (!kw) return FLAT.slice(0, limit);
    return FLAT.filter(
        (s) =>
            s.symbol.toUpperCase().includes(kw)
            || s.yahooSymbol.toUpperCase().includes(kw)
            || s.name.toUpperCase().includes(kw)
            || s.countryLabel.toUpperCase().includes(kw)
    ).slice(0, limit);
};

export const allYahooSymbols = () => FLAT.map((s) => s.yahooSymbol);

/** Accept free-form Yahoo tickers not in curated list. */
export const toYahooSymbol = (raw) => {
    const entry = resolveUniverseEntry(raw);
    if (entry) return entry.yahooSymbol;
    const clean = String(raw || '').trim();
    return clean || null;
};
