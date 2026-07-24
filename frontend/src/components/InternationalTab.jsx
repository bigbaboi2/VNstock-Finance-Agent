/**
 * InternationalTab — Tab 4 Quốc tế
 * TA + tin (Google/Reddit/X) + đề xuất thô. Không AI.
 * Ưu tiên paint-first, lazy chart, AbortController, multi-style.
 */
import axios from 'axios';
import React, { useState, useEffect, useRef, useCallback, useTransition, startTransition } from 'react';
import TradingChart from './TradingChart';
import UltraStack from './UltraStack';
import {
    Search, Activity, BarChart3, TrendingUp,
    RefreshCw, Globe, Newspaper, ExternalLink, AlertTriangle,
    Landmark, Filter,
} from 'lucide-react';

const fmt = (n, dec = 2) => (n != null && !Number.isNaN(Number(n)) ? Number(n).toFixed(dec) : '-');
const fmtPct = (n) => {
    if (n == null || Number.isNaN(Number(n))) return '-';
    return `${Number(n) >= 0 ? '+' : ''}${Number(n).toFixed(2)}%`;
};
const fmtPrice = (n, currency) => {
    if (n == null || Number.isNaN(Number(n))) return '-';
    const v = Number(n);
    const body = v >= 1000
        ? v.toLocaleString('en-US', { maximumFractionDigits: 2 })
        : v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: v < 1 ? 4 : 2 });
    return currency ? `${body} ${currency}` : body;
};

const T = {
    pageBg: (d) => (d ? 'bg-[#060A10]' : 'bg-slate-50'),
    panelBg: (d) => (d ? 'bg-[#0C1118]' : 'bg-white'),
    border: (d) => (d ? 'border-white/8' : 'border-slate-200'),
    textHero: (d) => (d ? 'text-white' : 'text-slate-900'),
    textBody: (d) => (d ? 'text-slate-300' : 'text-slate-700'),
    textMute: (d) => (d ? 'text-slate-500' : 'text-slate-400'),
    accent: 'text-teal-400',
    accentBg: 'bg-teal-500/10',
    accentBorder: 'border-teal-500/30',
    accentSolid: 'bg-teal-600 hover:bg-teal-700',
    accentOutline: (d) =>
        d
            ? 'border-teal-500/40 text-teal-400 hover:bg-teal-500/10'
            : 'border-teal-400 text-teal-700 hover:bg-teal-50',
    bull: 'text-emerald-400',
    bear: 'text-red-400',
};

const INTERVAL_OPTIONS = [
    { label: '5 phút', value: '5m' },
    { label: '15 phút', value: '15m' },
    { label: '1 giờ', value: '1h' },
    { label: '4 giờ', value: '4h' },
    { label: '1 ngày', value: '1d' },
    { label: '1 tuần', value: '1w' },
];

const enc = (sym) => encodeURIComponent(String(sym || ''));

function Panel({ children, isDark, className = '', accent = false }) {
    return (
        <div
            className={`rounded-xl border ${T.panelBg(isDark)} ${accent ? T.accentBorder : T.border(isDark)} ${className}`}
        >
            {children}
        </div>
    );
}

function SectionHeader({ icon: Icon, title, isDark, action }) {
    return (
        <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
                {Icon && <Icon size={14} className={T.accent} />}
                <span className={`text-xs font-semibold uppercase tracking-wider ${T.textMute(isDark)}`}>{title}</span>
            </div>
            {action}
        </div>
    );
}

function SentimentBadge({ sentiment }) {
    if (sentiment === 'positive') {
        return (
            <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                +
            </span>
        );
    }
    if (sentiment === 'negative') {
        return (
            <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-red-500/15 text-red-400 border border-red-500/20">
                −
            </span>
        );
    }
    return (
        <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-slate-500/15 text-slate-400 border border-slate-500/20">
            =
        </span>
    );
}

function ChannelBadge({ channel }) {
    const map = {
        google: 'Google',
        reddit: 'Reddit',
        x: 'X',
    };
    return (
        <span className={`text-[9px] font-bold uppercase tracking-wide ${T.accent}`}>
            {map[channel] || channel || 'News'}
        </span>
    );
}

function ActionBanner({ action, isDark }) {
    const a = String(action || '');
    let color = isDark ? 'border-white/10 bg-white/5 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-700';
    if (a.includes('MUA') && !a.includes('thiên bán')) color = 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400';
    if (a.includes('BÁN')) color = 'border-red-500/40 bg-red-500/10 text-red-400';
    if (a.includes('THEO DÕI')) color = 'border-amber-500/40 bg-amber-500/10 text-amber-400';
    return (
        <div className={`rounded-xl border px-3 py-2.5 ${color}`}>
            <p className="text-[10px] font-black uppercase tracking-widest opacity-70">Đề xuất thô</p>
            <p className="text-sm font-black mt-0.5">{a}</p>
        </div>
    );
}

function Skeleton({ className = '' }) {
    return <div className={`animate-pulse rounded-lg bg-teal-500/10 ${className}`} />;
}

export default function InternationalTab({
    isDark,
    UI,
    uiStyle = 'classic',
    addLog = () => {},
    initialSymbol = null,
    onSymbolChange = null,
}) {
    const isUltra = uiStyle === 'ultra';
    const reduceMotion = uiStyle === 'minimal' || uiStyle === 'ultra' || UI?.reduceMotion;
    const [, startUi] = useTransition();

    const bootSym = (initialSymbol || 'AAPL').toUpperCase();
    const [markets, setMarkets] = useState([]);
    const [country, setCountry] = useState('US');
    const [symbol, setSymbol] = useState(bootSym);
    const [searchInput, setSearchInput] = useState(bootSym);
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);

    const [quotes, setQuotes] = useState([]);
    const [quote, setQuote] = useState(null);
    const [chartData, setChartData] = useState([]);
    const [technicals, setTechnicals] = useState(null);
    const [proposal, setProposal] = useState(null);
    const [news, setNews] = useState(null);

    const [intervalLabel, setIntervalLabel] = useState('1 ngày');
    const [loadingQuotes, setLoadingQuotes] = useState(false);
    const [loadingChart, setLoadingChart] = useState(false);
    const [loadingSide, setLoadingSide] = useState(false);
    const [loadError, setLoadError] = useState(false);
    const [newsFilter, setNewsFilter] = useState('all');
    const [mobileTab, setMobileTab] = useState('chart');
    const [ultraOpenId, setUltraOpenId] = useState('chart');
    const [chartReady, setChartReady] = useState(false);

    // Resizable layout (desktop)
    const readStored = (key, fallback) => {
        try {
            const v = Number(localStorage.getItem(key));
            return Number.isFinite(v) && v > 0 ? v : fallback;
        } catch (_) {
            return fallback;
        }
    };
    const [leftWidth, setLeftWidth] = useState(() => readStored('omni_intl_left_w', 240));
    const [chartHeight, setChartHeight] = useState(() => readStored('omni_intl_chart_h', 420));
    const [taWidth, setTaWidth] = useState(() => readStored('omni_intl_ta_w', 280));
    const [dragging, setDragging] = useState(null); // 'left' | 'chart' | 'ta'

    const searchRef = useRef(null);
    const reqIdRef = useRef(0);
    const abortRef = useRef(null);
    const dragRef = useRef({ type: null, startX: 0, startY: 0, startLeft: 240, startChartH: 420, startTa: 280 });
    const mainColRef = useRef(null);

    // Mount chart after first paint
    useEffect(() => {
        const t = window.setTimeout(() => setChartReady(true), reduceMotion ? 0 : 40);
        return () => window.clearTimeout(t);
    }, [reduceMotion]);

    // Persist layout sizes
    useEffect(() => {
        try {
            localStorage.setItem('omni_intl_left_w', String(leftWidth));
            localStorage.setItem('omni_intl_chart_h', String(chartHeight));
            localStorage.setItem('omni_intl_ta_w', String(taWidth));
        } catch (_) { /* ignore */ }
    }, [leftWidth, chartHeight, taWidth]);

    const onResizePointerDown = useCallback((type, e) => {
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget?.setPointerCapture?.(e.pointerId);
        dragRef.current = {
            type,
            startX: e.clientX,
            startY: e.clientY,
            startLeft: leftWidth,
            startChartH: chartHeight,
            startTa: taWidth,
        };
        setDragging(type);
        document.body.style.userSelect = 'none';
        document.body.style.cursor = type === 'chart' ? 'row-resize' : 'col-resize';
    }, [leftWidth, chartHeight, taWidth]);

    useEffect(() => {
        if (!dragging) return undefined;
        const onMove = (e) => {
            const d = dragRef.current;
            if (!d?.type) return;
            if (d.type === 'left') {
                const next = Math.max(180, Math.min(420, d.startLeft + (e.clientX - d.startX)));
                setLeftWidth(next);
            } else if (d.type === 'chart') {
                const mainH = mainColRef.current?.clientHeight || 700;
                const maxH = Math.max(260, mainH - 160);
                const next = Math.max(220, Math.min(maxH, d.startChartH + (e.clientY - d.startY)));
                setChartHeight(next);
            } else if (d.type === 'ta') {
                const next = Math.max(200, Math.min(480, d.startTa + (e.clientX - d.startX)));
                setTaWidth(next);
            }
        };
        const onUp = () => {
            dragRef.current.type = null;
            setDragging(null);
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
        return () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
        };
    }, [dragging]);

    useEffect(() => {
        axios
            .get('/api/international/markets')
            .then((res) => {
                if (res.data?.success) setMarkets(res.data.data || []);
            })
            .catch(() => {});
    }, []);

    useEffect(() => {
        const handler = (e) => {
            if (!searchRef.current?.contains(e.target)) setShowSuggestions(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    useEffect(() => {
        if (!searchInput.trim()) {
            setSuggestions([]);
            return undefined;
        }
        const t = window.setTimeout(() => {
            axios
                .get(`/api/international/search?q=${enc(searchInput)}`)
                .then((res) => {
                    if (res.data?.success) setSuggestions(res.data.data || []);
                })
                .catch(() => {});
        }, 180);
        return () => window.clearTimeout(t);
    }, [searchInput]);

    const selectSymbol = useCallback(
        (sym, nextCountry) => {
            const clean = String(sym || '').trim().toUpperCase();
            if (!clean) return;
            startUi(() => {
                setSymbol(clean);
                setSearchInput(clean);
                setShowSuggestions(false);
                if (nextCountry) setCountry(nextCountry);
            });
            onSymbolChange?.(clean);
            addLog?.(`[QUỐC TẾ] Chọn ${clean}`);
        },
        [addLog, onSymbolChange, startUi]
    );

    const fetchQuotesForCountry = useCallback(
        async (countryId, signal) => {
            setLoadingQuotes(true);
            try {
                const res = await axios.get(`/api/international/quotes?country=${countryId}`, { signal });
                if (res.data?.success) setQuotes(res.data.data || []);
            } catch (e) {
                if (e.name !== 'CanceledError' && e.code !== 'ERR_CANCELED') {
                    addLog?.(`[LỖI] Quotes: ${e.message}`);
                }
            } finally {
                setLoadingQuotes(false);
            }
        },
        [addLog]
    );

    const fetchCore = useCallback(
        async (sym, interval, requestId) => {
            setLoadingChart(true);
            setLoadError(false);
            try {
                const histRes = await axios.get(
                    `/api/international/history/${enc(sym)}?interval=${enc(interval)}`
                );
                if (requestId !== reqIdRef.current) return;
                if (histRes.data?.success && histRes.data.data) {
                    const d = histRes.data.data;
                    setChartData(d.candles || []);
                    setQuote(d.quote || null);
                    setTechnicals(d.technicals || null);
                    addLog?.(`[QUỐC TẾ] Chart ${sym}: ${d.candles?.length || 0} nến`);
                } else {
                    setChartData([]);
                    setLoadError(true);
                }
            } catch (e) {
                if (requestId === reqIdRef.current) {
                    setLoadError(true);
                    addLog?.(`[LỖI] Chart ${sym}: ${e.message}`);
                }
            } finally {
                if (requestId === reqIdRef.current) setLoadingChart(false);
            }
        },
        [addLog]
    );

    const fetchSide = useCallback(
        async (sym, interval, requestId) => {
            setLoadingSide(true);
            try {
                const res = await axios.get(
                    `/api/international/proposal/${enc(sym)}?interval=${enc(interval)}`
                );
                if (requestId !== reqIdRef.current) return;
                if (res.data?.success && res.data.data) {
                    setProposal(res.data.data.proposal || null);
                    setNews(res.data.data.news || null);
                    if (res.data.data.technicals) setTechnicals(res.data.data.technicals);
                    if (res.data.data.quote) setQuote(res.data.data.quote);
                }
            } catch (e) {
                if (requestId === reqIdRef.current) {
                    addLog?.(`[CẢNH BÁO] Tin/đề xuất: ${e.message}`);
                }
            } finally {
                if (requestId === reqIdRef.current) setLoadingSide(false);
            }
        },
        [addLog]
    );

    // Country → quotes
    useEffect(() => {
        const ctrl = new AbortController();
        fetchQuotesForCountry(country, ctrl.signal);
        return () => ctrl.abort();
    }, [country, fetchQuotesForCountry]);

    // Symbol / interval — paint chart first, then news/proposal
    useEffect(() => {
        if (!symbol) return undefined;
        const id = ++reqIdRef.current;
        if (abortRef.current) abortRef.current.abort();
        abortRef.current = new AbortController();

        fetchCore(symbol, intervalLabel, id);
        const defer = window.setTimeout(() => {
            if (document.visibilityState === 'hidden') return;
            fetchSide(symbol, intervalLabel, id);
        }, 80);

        return () => window.clearTimeout(defer);
    }, [symbol, intervalLabel, fetchCore, fetchSide]);

    // Sync initialSymbol from parent URL
    useEffect(() => {
        if (!initialSymbol) return;
        const clean = String(initialSymbol).trim().toUpperCase();
        if (clean && clean !== symbol) {
            setSymbol(clean);
            setSearchInput(clean);
            const hit = markets
                .flatMap((m) => (m.symbols || []).map((s) => ({ ...s, country: m.id })))
                .find((s) => s.symbol === clean || s.yahooSymbol === clean);
            if (hit?.country) setCountry(hit.country);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialSymbol, markets]);

    const refreshAll = () => {
        const id = ++reqIdRef.current;
        fetchQuotesForCountry(country);
        fetchCore(symbol, intervalLabel, id);
        fetchSide(symbol, intervalLabel, id);
    };

    const filteredNews = (news?.items || []).filter((n) => {
        if (newsFilter === 'all') return true;
        return n.channel === newsFilter;
    });

    const px = quote?.price;
    const chg = quote?.changePercent;
    const up = Number(chg) >= 0;

    const watchlistPanel = (
        <Panel isDark={isDark} className="p-3 h-full flex flex-col min-h-0">
            <SectionHeader icon={Globe} title="Thị trường" isDark={isDark} />
            <div className="flex flex-wrap gap-1 mb-3 shrink-0">
                {markets.map((m) => (
                    <button
                        key={m.id}
                        type="button"
                        onClick={() => startTransition(() => setCountry(m.id))}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-black border transition-colors ${
                            country === m.id
                                ? `${T.accentBg} ${T.accentBorder} ${T.accent}`
                                : T.border(isDark)
                        }`}
                    >
                        {m.label}
                    </button>
                ))}
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar space-y-0.5">
                {loadingQuotes && !quotes.length ? (
                    <>
                        <Skeleton className="h-9 mb-1" />
                        <Skeleton className="h-9 mb-1" />
                        <Skeleton className="h-9" />
                    </>
                ) : (
                    quotes.map((q) => {
                        const sym = q.yahooSymbol || q.symbol;
                        const active = sym === symbol;
                        const qUp = Number(q.changePercent) >= 0;
                        return (
                            <button
                                key={sym}
                                type="button"
                                onClick={() => selectSymbol(sym, country)}
                                className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-left border ${
                                    active ? `${T.accentBg} ${T.accentBorder}` : `${T.border(isDark)} hover:bg-teal-500/5`
                                }`}
                            >
                                <div className="min-w-0">
                                    <p className={`text-xs font-black truncate ${T.textHero(isDark)}`}>{sym}</p>
                                    <p className={`text-[10px] truncate ${T.textMute(isDark)}`}>{q.name}</p>
                                </div>
                                <div className="text-right shrink-0">
                                    <p className={`text-xs font-bold tabular-nums ${T.textBody(isDark)}`}>
                                        {fmt(q.price)}
                                    </p>
                                    <p className={`text-[10px] font-bold tabular-nums ${qUp ? T.bull : T.bear}`}>
                                        {fmtPct(q.changePercent)}
                                    </p>
                                </div>
                            </button>
                        );
                    })
                )}
            </div>
        </Panel>
    );

    const quoteHeader = (
        <Panel isDark={isDark} className="p-3 shrink-0" accent>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0" ref={searchRef}>
                    <div className="relative">
                        <Search size={14} className={`absolute left-2.5 top-1/2 -translate-y-1/2 ${T.textMute(isDark)}`} />
                        <input
                            type="text"
                            value={searchInput}
                            onChange={(e) => {
                                setSearchInput(e.target.value.toUpperCase());
                                setShowSuggestions(true);
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') selectSymbol(searchInput);
                            }}
                            placeholder="AAPL, 7203.T, 0700.HK…"
                            className={`w-full sm:w-64 h-9 pl-8 pr-2 rounded-lg border text-xs font-bold outline-none ${
                                isDark
                                    ? 'bg-black/40 border-white/10 text-teal-300'
                                    : 'bg-white border-slate-300 text-teal-800'
                            }`}
                        />
                        {showSuggestions && suggestions.length > 0 && (
                            <div
                                className={`absolute z-40 top-full left-0 right-0 mt-1 max-h-56 overflow-y-auto rounded-xl border shadow-xl ${T.panelBg(isDark)} ${T.border(isDark)}`}
                            >
                                {suggestions.map((s) => (
                                    <button
                                        key={`${s.yahooSymbol}-${s.country}`}
                                        type="button"
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            selectSymbol(s.yahooSymbol, s.country || country);
                                        }}
                                        className={`w-full text-left px-3 py-2 text-xs border-b last:border-0 ${isDark ? 'border-white/5 hover:bg-white/5' : 'border-slate-100 hover:bg-slate-50'}`}
                                    >
                                        <span className={`font-black ${T.accent}`}>{s.yahooSymbol}</span>
                                        <span className={`ml-2 ${T.textMute(isDark)}`}>{s.name}</span>
                                        {s.countryLabel && (
                                            <span className={`ml-2 text-[10px] ${T.textMute(isDark)}`}>
                                                {s.countryLabel}
                                            </span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <h2 className={`text-lg font-black ${T.textHero(isDark)}`}>{symbol}</h2>
                        <span className={`text-xl font-black tabular-nums ${up ? T.bull : T.bear}`}>
                            {fmtPrice(px, quote?.currency)}
                        </span>
                        <span className={`text-sm font-bold tabular-nums ${up ? T.bull : T.bear}`}>
                            {fmtPct(chg)}
                        </span>
                        {quote?.name && (
                            <span className={`text-xs ${T.textMute(isDark)}`}>{quote.name}</span>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-1.5">
                    <button
                        type="button"
                        onClick={refreshAll}
                        className={`h-9 w-9 rounded-lg border flex items-center justify-center ${T.border(isDark)}`}
                        title="Làm mới"
                    >
                        <RefreshCw size={13} className={loadingChart ? `animate-spin ${T.accent}` : T.textMute(isDark)} />
                    </button>
                </div>
            </div>
            <div className="flex gap-1 flex-wrap mt-3">
                {INTERVAL_OPTIONS.map(({ label }) => (
                    <button
                        key={label}
                        type="button"
                        onClick={() => setIntervalLabel(label)}
                        className={`px-2 py-1 rounded-md text-[10px] font-bold border ${
                            intervalLabel === label
                                ? `${T.accentBg} ${T.accentBorder} ${T.accent}`
                                : T.border(isDark)
                        }`}
                    >
                        {label}
                    </button>
                ))}
            </div>
        </Panel>
    );

    const chartBody = (
        <Panel isDark={isDark} className="h-full min-h-0 overflow-hidden relative">
            {chartReady && chartData?.length ? (
                <TradingChart
                    data={chartData}
                    theme={isDark ? 'dark' : 'light'}
                    accent="teal"
                    onIntervalChange={setIntervalLabel}
                    currentInterval={intervalLabel}
                    allowPageScroll={isUltra}
                />
            ) : loadError && !loadingChart ? (
                <div className="h-full flex flex-col items-center justify-center gap-2 px-4 text-center">
                    <AlertTriangle size={24} className="text-amber-400" />
                    <p className={`text-xs ${T.textMute(isDark)}`}>Không tải được {symbol}</p>
                    <button
                        type="button"
                        onClick={refreshAll}
                        className={`h-8 px-3 rounded-lg ${T.accentSolid} text-white text-xs font-bold`}
                    >
                        Thử lại
                    </button>
                </div>
            ) : (
                <div className="h-full flex items-center justify-center">
                    <Activity size={24} className={`${reduceMotion ? '' : 'animate-pulse'} ${T.accent}`} />
                </div>
            )}
        </Panel>
    );

    // Mobile / ultra still use stacked chart+header
    const chartPanel = (
        <div className="h-full flex flex-col min-h-0 gap-2">
            {quoteHeader}
            <div className="flex-1 min-h-[280px]">{chartBody}</div>
        </div>
    );

    const taBlock = (
        <Panel isDark={isDark} className="p-3 h-full min-h-0 overflow-y-auto custom-scrollbar">
            <SectionHeader icon={BarChart3} title="Phân tích kỹ thuật" isDark={isDark} />
            {technicals ? (
                <div className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                        <span className={T.textMute(isDark)}>Score</span>
                        <span className={`font-black tabular-nums ${T.accent}`}>{technicals.score}</span>
                    </div>
                    <div className="h-2 rounded-full bg-black/20 overflow-hidden">
                        <div
                            className="h-full bg-teal-500 rounded-full"
                            style={{ width: `${Math.min(100, technicals.score || 0)}%` }}
                        />
                    </div>
                    <div className="flex justify-between text-xs pt-1">
                        <span className={T.textMute(isDark)}>Xu hướng</span>
                        <span className={`font-bold ${technicals.trendColor === 'green' ? T.bull : technicals.trendColor === 'red' ? T.bear : 'text-amber-400'}`}>
                            {technicals.trend}
                        </span>
                    </div>
                    <div className="flex justify-between text-xs">
                        <span className={T.textMute(isDark)}>RSI</span>
                        <span className={`font-bold tabular-nums ${T.textBody(isDark)}`}>
                            {fmt(technicals.rsi, 1)} · {proposal?.plain?.rsiLabel || '—'}
                        </span>
                    </div>
                    <div className="flex justify-between text-xs">
                        <span className={T.textMute(isDark)}>MACD</span>
                        <span className={`font-bold tabular-nums ${T.textBody(isDark)}`}>{fmt(technicals.macdLine)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                        <span className={T.textMute(isDark)}>EMA20 / 50</span>
                        <span className={`font-bold tabular-nums ${T.textBody(isDark)}`}>
                            {fmt(technicals.ema20)} / {fmt(technicals.ema50)}
                        </span>
                    </div>
                </div>
            ) : (
                <p className={`text-xs ${T.textMute(isDark)}`}>{loadingChart ? 'Đang tính…' : 'Chưa có chỉ báo'}</p>
            )}
        </Panel>
    );

    const proposalBlock = (
        <Panel isDark={isDark} className="p-3 h-full min-h-0 overflow-y-auto custom-scrollbar" accent>
            <SectionHeader icon={TrendingUp} title="Đề xuất thô" isDark={isDark} />
            {loadingSide && !proposal ? (
                <Skeleton className="h-16" />
            ) : proposal ? (
                <div className="space-y-2">
                    <ActionBanner action={proposal.action} isDark={isDark} />
                    <div className="grid grid-cols-2 gap-2">
                        {(proposal.weights || []).map((w) => (
                            <div key={w.label} className={`rounded-lg border px-2 py-1.5 ${T.border(isDark)}`}>
                                <p className={`text-[9px] font-bold uppercase ${T.textMute(isDark)}`}>{w.label}</p>
                                <p className={`text-sm font-black tabular-nums ${w.points >= 0 ? T.bull : T.bear}`}>
                                    {w.points >= 0 ? '+' : ''}
                                    {w.points}
                                    <span className={`text-[10px] font-medium ${T.textMute(isDark)}`}>/{w.max}</span>
                                </p>
                            </div>
                        ))}
                    </div>
                    <ul className="space-y-1">
                        {(proposal.reasons || []).slice(0, 5).map((r, i) => (
                            <li key={i} className={`text-[11px] leading-snug ${T.textBody(isDark)}`}>
                                · {r}
                            </li>
                        ))}
                    </ul>
                    <p className={`text-[10px] leading-relaxed ${T.textMute(isDark)}`}>{proposal.disclaimer}</p>
                </div>
            ) : (
                <p className={`text-xs ${T.textMute(isDark)}`}>Chưa có đề xuất</p>
            )}
        </Panel>
    );

    const newsBlock = (
        <Panel isDark={isDark} className="p-3 h-full min-h-0 flex flex-col">
            <SectionHeader
                icon={Newspaper}
                title="Tin & sentiment"
                isDark={isDark}
                action={
                    news ? (
                        <span className={`text-[10px] font-black tabular-nums ${news.bias === 'positive' ? T.bull : news.bias === 'negative' ? T.bear : T.textMute(isDark)}`}>
                            {news.score >= 0 ? '+' : ''}
                            {news.score}
                        </span>
                    ) : null
                }
            />
            <div className="flex flex-wrap gap-1 mb-2 shrink-0">
                {[
                    { id: 'all', label: 'Tất cả' },
                    { id: 'google', label: 'Google' },
                    { id: 'reddit', label: 'Reddit' },
                    { id: 'x', label: 'X' },
                ].map((f) => (
                    <button
                        key={f.id}
                        type="button"
                        onClick={() => setNewsFilter(f.id)}
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold border flex items-center gap-1 ${
                            newsFilter === f.id
                                ? `${T.accentBg} ${T.accentBorder} ${T.accent}`
                                : T.border(isDark)
                        }`}
                    >
                        {f.id === 'all' && <Filter size={10} />}
                        {f.label}
                    </button>
                ))}
            </div>
            <div className="space-y-1.5 flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                {loadingSide && !filteredNews.length ? (
                    <Skeleton className="h-12" />
                ) : filteredNews.length ? (
                    filteredNews.map((n, i) => (
                        <a
                            key={`${n.link}-${i}`}
                            href={n.link || '#'}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`block rounded-lg border px-2.5 py-2 hover:border-teal-500/40 transition-colors ${T.border(isDark)}`}
                        >
                            <div className="flex items-center gap-1.5 mb-1">
                                <SentimentBadge sentiment={n.sentiment} />
                                <ChannelBadge channel={n.channel} />
                                <span className={`text-[9px] ml-auto ${T.textMute(isDark)}`}>{n.source}</span>
                            </div>
                            <p className={`text-[11px] font-semibold leading-snug line-clamp-2 ${T.textBody(isDark)}`}>
                                {n.title}
                            </p>
                            {n.link && (
                                <ExternalLink size={10} className={`mt-1 ${T.textMute(isDark)}`} />
                            )}
                        </a>
                    ))
                ) : (
                    <p className={`text-xs py-4 text-center ${T.textMute(isDark)}`}>
                        {loadingSide ? 'Đang tải tin…' : 'Chưa có tin'}
                    </p>
                )}
            </div>
        </Panel>
    );

    const sidePanel = (
        <div className="h-full flex flex-col gap-2 min-h-0 overflow-y-auto custom-scrollbar">
            {taBlock}
            {proposalBlock}
            {newsBlock}
        </div>
    );

    const ResizeCol = ({ type, active }) => (
        <div
            role="separator"
            aria-orientation="vertical"
            onPointerDown={(e) => onResizePointerDown(type, e)}
            className={`hidden lg:flex w-1.5 shrink-0 cursor-col-resize touch-none select-none items-center justify-center self-stretch rounded-full transition-colors ${
                active ? 'bg-teal-400/50' : isDark ? 'hover:bg-teal-400/25 bg-white/5' : 'hover:bg-teal-500/30 bg-slate-200/80'
            }`}
            title="Kéo để đổi kích thước"
        />
    );

    const ResizeRow = ({ active }) => (
        <div
            role="separator"
            aria-orientation="horizontal"
            onPointerDown={(e) => onResizePointerDown('chart', e)}
            className={`hidden lg:flex h-2 shrink-0 w-full cursor-row-resize touch-none select-none items-center justify-center rounded-full transition-colors ${
                active ? 'bg-teal-400/50' : isDark ? 'hover:bg-teal-400/25 bg-white/5' : 'hover:bg-teal-500/30 bg-slate-200/80'
            }`}
            title="Kéo để đổi chiều cao chart"
        >
            <div className={`h-0.5 w-10 rounded-full ${isDark ? 'bg-white/25' : 'bg-slate-400/50'}`} />
        </div>
    );

    if (isUltra) {
        const ultraSections = [
            {
                id: 'chart',
                title: `Biểu đồ · ${symbol}`,
                icon: BarChart3,
                summary: px ? fmt(px) : loadingChart ? 'Đang tải…' : 'Đóng',
                render: () => <div className="h-[min(60vh,480px)]">{chartPanel}</div>,
            },
            {
                id: 'ta',
                title: 'TA · đề xuất · tin',
                icon: TrendingUp,
                summary: proposal?.action || 'Đóng',
                render: () => sidePanel,
            },
            {
                id: 'watchlist',
                title: 'Watchlist theo nước',
                icon: Globe,
                summary: country,
                render: () => <div className="h-[min(50vh,360px)]">{watchlistPanel}</div>,
            },
        ];
        return (
            <div className={`flex flex-col w-full h-full min-h-0 overflow-hidden ${T.pageBg(isDark)}`}>
                <div
                    className={`shrink-0 px-4 py-2.5 border-b ${
                        isDark ? 'border-white/10 bg-[#0B0F14]' : 'border-slate-200 bg-white'
                    }`}
                >
                    <p className="text-[10px] font-black uppercase tracking-widest text-teal-400">
                        Siêu tối giản · Quốc tế
                    </p>
                    <p className={`text-sm font-bold ${T.textHero(isDark)}`}>
                        {symbol}
                        {px ? ` · ${fmtPrice(px, quote?.currency)}` : ''} · Chạm từng mục để mở
                    </p>
                </div>
                <UltraStack
                    sections={ultraSections}
                    openId={ultraOpenId}
                    onOpenChange={setUltraOpenId}
                    isDark={isDark}
                />
            </div>
        );
    }

    return (
        <div className={`flex flex-col w-full h-full overflow-hidden ${T.pageBg(isDark)}`}>
            <div
                className={`lg:hidden flex shrink-0 border-b ${
                    isDark ? 'bg-[#0C1118] border-white/8' : 'bg-white border-slate-200'
                } z-50`}
            >
                {[
                    { key: 'chart', label: 'Biểu đồ', icon: BarChart3 },
                    { key: 'side', label: 'TA & Tin', icon: Newspaper },
                    { key: 'list', label: 'Thị trường', icon: Globe },
                ].map(({ key, label, icon: Icon }) => (
                    <button
                        key={key}
                        type="button"
                        onClick={() => setMobileTab(key)}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[10px] font-black uppercase tracking-wide border-b-2 ${
                            mobileTab === key
                                ? 'border-teal-500 text-teal-400'
                                : `border-transparent ${T.textMute(isDark)}`
                        }`}
                    >
                        <Icon size={12} /> {label}
                    </button>
                ))}
            </div>

            {/* Desktop: watchlist | chart(top) + TA/tin(bottom) — resizable */}
            <div className="hidden lg:flex flex-1 min-h-0 p-2 gap-0">
                <div className="min-h-0 shrink-0" style={{ width: leftWidth }}>
                    {watchlistPanel}
                </div>
                <ResizeCol type="left" active={dragging === 'left'} />

                <div ref={mainColRef} className="flex-1 min-w-0 min-h-0 flex flex-col gap-0">
                    <div className="shrink-0">{quoteHeader}</div>
                    <div className="shrink-0 mt-2 min-h-0" style={{ height: chartHeight }}>
                        {chartBody}
                    </div>
                    <ResizeRow active={dragging === 'chart'} />

                    <div className="flex-1 min-h-[140px] flex gap-0 mt-0.5">
                        <div className="min-h-0 shrink-0" style={{ width: taWidth }}>
                            <div className="h-full flex flex-col gap-2 min-h-0">
                                <div className="flex-[1.1] min-h-0">{taBlock}</div>
                                <div className="flex-1 min-h-0">{proposalBlock}</div>
                            </div>
                        </div>
                        <ResizeCol type="ta" active={dragging === 'ta'} />
                        <div className="flex-1 min-w-0 min-h-0">{newsBlock}</div>
                    </div>
                </div>
            </div>

            <div className="lg:hidden flex-1 min-h-0 p-2 overflow-hidden">
                {mobileTab === 'list' && <div className="h-full">{watchlistPanel}</div>}
                {mobileTab === 'chart' && <div className="h-full">{chartPanel}</div>}
                {mobileTab === 'side' && <div className="h-full overflow-y-auto">{sidePanel}</div>}
            </div>

            <div
                className={`shrink-0 px-3 py-1.5 border-t flex items-center gap-2 text-[10px] ${
                    isDark ? 'border-white/5' : 'border-slate-200'
                } ${T.textMute(isDark)}`}
            >
                <Landmark size={11} className={T.accent} />
                <span>Quốc tế · chart trên · kéo thanh để đổi kích thước</span>
                {news?.sources && (
                    <span className="ml-auto tabular-nums">
                        G{news.sources.google || 0} · R{news.sources.reddit || 0} · X{news.sources.x || 0}
                    </span>
                )}
            </div>
        </div>
    );
}
