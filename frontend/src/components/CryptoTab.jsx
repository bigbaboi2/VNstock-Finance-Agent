// CryptoTab.jsx — Redesigned v2
// Design: Dark fintech dashboard | Responsive mobile + PC | Fixed interval chart bug
// Dials: VARIANCE:5 / MOTION:4 / DENSITY:7

import axios from 'axios';
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import TradingChart from './TradingChart';
import StockAiChat from './StockAiChat';
import UltraStack from './UltraStack';
import {
    Search, Activity, Zap, BarChart3, TrendingUp, TrendingDown,
    BrainCircuit, HelpCircle, RefreshCw, Globe, Database,
    Newspaper, ChevronDown, ChevronUp, ExternalLink, AlertTriangle,
    Cpu, ArrowUpRight, ArrowDownRight, Clock
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────
// HELPERS: Format
// ─────────────────────────────────────────────────────────────
const fmt = (n, dec = 2) => n != null && !isNaN(n) ? Number(n).toFixed(dec) : '-';
const fmtUSD = (n) => (n != null && !isNaN(n) && Number(n) > 0)
    ? `$${Number(n) >= 1 ? Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : Number(n).toFixed(6)}`
    : '-';
const fmtLarge = (n) => {
    if (n == null || isNaN(n) || Number(n) <= 0) return '-';
    if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
    if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
    return `$${Number(n).toLocaleString()}`;
};
const fmtPct = (n) => {
    if (n == null || isNaN(n)) return '-';
    return `${Number(n) >= 0 ? '+' : ''}${Number(n).toFixed(2)}%`;
};

// ─────────────────────────────────────────────────────────────
// TOKEN: Màu sắc theo theme — dùng 1 chỗ, nhất quán toàn file
// ─────────────────────────────────────────────────────────────
const T = {
    // Surfaces
    pageBg:   (d) => d ? 'bg-[#060A10]'          : 'bg-slate-50',
    panelBg:  (d) => d ? 'bg-[#0C1118]'          : 'bg-white',
    cardBg:   (d) => d ? 'bg-[#111820]'          : 'bg-slate-50',
    inputBg:  (d) => d ? 'bg-[#0C1118]'          : 'bg-white',
    // Borders — light: slate-300 card / slate-400 seam (đủ tách khối trên bg-slate-50)
    border:   (d) => d ? 'border-white/8'        : 'border-slate-400',
    seam:     (d) => d ? 'border-white/10'       : 'border-slate-500',
    borderAcc:(d) => d ? 'border-purple-500/25'  : 'border-purple-300',
    divider:  (d) => d ? 'bg-white/6'            : 'bg-slate-300',
    // Text
    textHero: (d) => d ? 'text-white'            : 'text-slate-900',
    textBody: (d) => d ? 'text-slate-300'        : 'text-slate-700',
    textMute: (d) => d ? 'text-slate-500'        : 'text-slate-500',
    // Accent: Violet consistente
    accent:        'text-violet-400',
    accentBg:      'bg-violet-500/10',
    accentBorder:  'border-violet-500/30',
    accentSolid:   'bg-violet-600 hover:bg-violet-700',
    accentOutline: (d) => d ? 'border-violet-500/40 text-violet-400 hover:bg-violet-500/10' : 'border-violet-400 text-violet-600 hover:bg-violet-50',
    // Semantic
    bull:   'text-emerald-400',
    bullBg: 'bg-emerald-500/10',
    bullBdr:'border-emerald-500/30',
    bear:   'text-red-400',
    bearBg: 'bg-red-500/10',
    bearBdr:'border-red-500/30',
    warn:   'text-amber-400',
};

// ─────────────────────────────────────────────────────────────
// COMPONENT: Section Header — Label tiêu đề phần
// ─────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────
// COMPONENT: Panel — Card container nhất quán
// ─────────────────────────────────────────────────────────────
function Panel({ children, isDark, className = '', accent = false }) {
    const base = `rounded-xl border panel-outline ${T.panelBg(isDark)} ${accent ? T.accentBorder : T.border(isDark)}`;
    return <div className={`${base} ${className}`}>{children}</div>;
}

// ─────────────────────────────────────────────────────────────
// COMPONENT: StatRow
// ─────────────────────────────────────────────────────────────
function StatRow({ label, value, color = '', isDark, help }) {
    return (
        <div className={`flex justify-between items-center py-2 border-b last:border-0 ${isDark ? 'border-white/5' : 'border-slate-300'}`}>
            <div className="flex items-center gap-1.5">
                <span className={`text-xs font-medium ${T.textMute(isDark)}`}>{label}</span>
                {help && (
                    <div className="group relative">
                        <HelpCircle size={11} className={`cursor-help ${T.textMute(isDark)} opacity-50 hover:opacity-100 transition-opacity`} />
                        <div className={`absolute left-0 bottom-5 w-48 p-2.5 rounded-lg shadow-xl z-50 text-xs leading-relaxed border opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity ${isDark ? 'bg-[#1C2530] text-slate-300 border-white/10' : 'bg-white text-slate-600 border-slate-300'}`}>
                            {help}
                        </div>
                    </div>
                )}
            </div>
            <span className={`text-xs font-mono font-semibold ${color || T.textBody(isDark)}`}>{value}</span>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// COMPONENT: SentimentBar — Thanh Bull/Bear
// ─────────────────────────────────────────────────────────────
function SentimentBar({ score, isDark }) {
    const { t } = useTranslation('crypto');
    const bullPct = Math.min(Math.max(Math.round(score), 0), 100);
    const bearPct = 100 - bullPct;
    return (
        <div className="flex flex-col gap-1.5 w-full max-w-[180px]">
            <div className="flex items-center justify-between text-xs font-semibold">
                <span className={`flex items-center gap-1 ${T.bull}`}>
                    <TrendingUp size={11} /> {bullPct}%
                </span>
                <span className={`flex items-center gap-1 ${T.bear}`}>
                    {bearPct}% <TrendingDown size={11} />
                </span>
            </div>
            <div className={`flex h-1.5 w-full rounded-full overflow-hidden ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`}>
                {bullPct > 0 && <div className="bg-emerald-500 transition-all duration-700" style={{ width: `${bullPct}%` }} />}
                {bearPct > 0 && <div className="bg-red-500 transition-all duration-700" style={{ width: `${bearPct}%` }} />}
            </div>
            <p className={`text-[10px] text-center font-medium ${T.textMute(isDark)}`}>{t('ratingSystem')}</p>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// COMPONENT: Fear & Greed Gauge
// ─────────────────────────────────────────────────────────────
function FearGreedGauge({ value, labelVi, isDark }) {
    const { t } = useTranslation('crypto');
    const getStyle = (v) => {
        if (v <= 25) return { ring: 'border-red-500', text: 'text-red-400', bar: 'bg-red-500', label: t('extremeFear') };
        if (v <= 45) return { ring: 'border-orange-500', text: 'text-orange-400', bar: 'bg-orange-500', label: t('fear') };
        if (v <= 55) return { ring: 'border-amber-500', text: 'text-amber-400', bar: 'bg-amber-500', label: t('neutral') };
        if (v <= 75) return { ring: 'border-emerald-500', text: 'text-emerald-400', bar: 'bg-emerald-500', label: t('greed') };
        return { ring: 'border-emerald-400', text: 'text-emerald-400', bar: 'bg-emerald-500', label: t('extremeGreed') };
    };
    const s = getStyle(value || 50);
    return (
        <div className="flex items-center gap-4">
            <div className={`w-14 h-14 rounded-full border-[3px] flex items-center justify-center shrink-0 ${s.ring} ${isDark ? 'bg-black/20' : 'bg-slate-50'}`}>
                <span className={`text-base font-bold ${s.text}`}>{value ?? '?'}</span>
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline mb-1.5">
                    <p className={`font-semibold text-sm ${s.text}`}>{s.label}</p>
                    <p className={`text-[10px] ${T.textMute(isDark)}`}>alternative.me</p>
                </div>
                <div className={`h-1 rounded-full overflow-hidden ${isDark ? 'bg-white/10' : 'bg-slate-200'}`}>
                    <div className={`h-full rounded-full transition-all duration-700 ${s.bar}`} style={{ width: `${value ?? 50}%` }} />
                </div>
                <div className={`flex justify-between mt-1 text-[10px] ${T.textMute(isDark)}`}>
                    <span>{t('fearLabel')}</span><span>{t('greedLabel')}</span>
                </div>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// COMPONENT: Confluence Score Ring
// ─────────────────────────────────────────────────────────────
function ConfluenceRing({ score, isDark }) {
    const { t } = useTranslation('crypto');
    const getC = (s) => {
        if (s >= 68) return { ring: 'border-emerald-500', text: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30', label: t('strongUp') };
        if (s >= 55) return { ring: 'border-emerald-500', text: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30', label: t('up') };
        if (s <= 32) return { ring: 'border-red-500',     text: 'text-red-400',     bg: 'bg-red-500/10 border-red-500/30',         label: t('strongDown') };
        if (s <= 45) return { ring: 'border-red-500',     text: 'text-red-400',     bg: 'bg-red-500/10 border-red-500/30',         label: t('down') };
        return { ring: 'border-amber-500', text: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30', label: t('sideways') };
    };
    const c = getC(score);
    return (
        <div className="flex flex-col items-center gap-1.5 shrink-0">
            <div className={`w-14 h-14 rounded-full border-[3px] flex items-center justify-center ${c.ring} ${isDark ? 'bg-black/20' : 'bg-slate-50'}`}>
                <span className={`text-lg font-bold ${c.text}`}>{score}</span>
            </div>
            <div className={`px-2 py-0.5 rounded text-[9px] font-bold border ${c.bg} ${c.text}`}>{c.label}</div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// COMPONENT: Volume Profile
// ─────────────────────────────────────────────────────────────
function CryptoVolumeProfile({ bins, maxVol, pocPrice, isDark }) {
    const { t } = useTranslation('crypto');
    if (!bins || bins.length === 0) return (
        <div className="flex flex-col items-center justify-center py-8 opacity-50">
            <Activity size={20} className={`animate-pulse ${T.accent} mb-2`} />
            <p className={`text-xs font-medium ${T.textMute(isDark)}`}>{t('calculatingPoc')}</p>
        </div>
    );
    return (
        <div className="flex flex-col gap-1.5 flex-1">
            {bins.map((bin, i) => {
                const isPOC = String(bin.priceCenter) === String(pocPrice);
                const w = maxVol > 0 ? (bin.volume / maxVol) * 100 : 0;
                return (
                    <div key={i} className="flex items-center gap-2">
                        <span className={`text-[10px] font-mono w-16 text-right shrink-0 ${isPOC ? `${T.accent} font-bold` : T.textMute(isDark)}`}>
                            {Number(bin.priceCenter) > 1
                                ? Number(bin.priceCenter).toLocaleString('en-US', { maximumFractionDigits: 0 })
                                : Number(bin.priceCenter).toFixed(5)}
                        </span>
                        <div className={`flex-1 h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`}>
                            <div
                                className={`h-full transition-all duration-500 ${isPOC ? 'bg-violet-500' : 'bg-violet-500/25'}`}
                                style={{ width: `${w}%` }}
                            />
                        </div>
                        {isPOC && <span className={`text-[9px] font-bold ${T.accent} shrink-0`}>{t('poc')}</span>}
                    </div>
                );
            })}
            <p className={`text-[10px] font-semibold ${T.accent} mt-2 text-center`}>
                Vùng POC (Kẹt lệnh): {Number(pocPrice) > 1
                    ? Number(pocPrice).toLocaleString('en-US', { maximumFractionDigits: 0 })
                    : Number(pocPrice).toFixed(5)}
            </p>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// COMPONENT: News Card
// ─────────────────────────────────────────────────────────────
function NewsCard({ news, isDark }) {
    const { t } = useTranslation('crypto');
    const sentimentConfig = {
        positive: { cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', label: t('sentimentPositive') },
        negative: { cls: 'text-red-400 bg-red-500/10 border-red-500/20',           label: t('sentimentNegative') },
        neutral:  { cls: 'text-amber-400 bg-amber-500/10 border-amber-500/20',     label: t('sentimentNeutral') },
    };
    const sc = sentimentConfig[news.sentiment] || sentimentConfig.neutral;

    return (
        <a
            href={news.link || '#'}
            target="_blank"
            rel="noopener noreferrer"
            className={`group flex items-start gap-3 p-3.5 rounded-xl border transition-all ${
                isDark
                    ? 'bg-[#0C1118] border-white/6 hover:border-violet-500/30 hover:bg-[#111820]'
                    : 'bg-white border-slate-300 hover:border-violet-300 hover:bg-violet-50/30 panel-outline'
            }`}
        >
            <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium leading-snug line-clamp-2 ${T.textBody(isDark)} group-hover:${T.accent} transition-colors`}>
                    {news.title}
                </p>
                <div className="flex items-center gap-2.5 mt-2">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${sc.cls}`}>{sc.label}</span>
                    <span className={`text-[10px] ${T.textMute(isDark)}`}>{news.source || 'CryptoNews'}</span>
                    {news.time && <span className={`text-[10px] ${T.textMute(isDark)}`}>{news.time}</span>}
                </div>
            </div>
            <ExternalLink size={12} className={`shrink-0 mt-0.5 ${T.textMute(isDark)} group-hover:${T.accent} transition-colors`} />
        </a>
    );
}

// ─────────────────────────────────────────────────────────────
// COMPONENT: Skeleton Loading
// ─────────────────────────────────────────────────────────────
function Skeleton({ isDark, h = 'h-4', w = 'w-full', className = '' }) {
    return (
        <div className={`${h} ${w} rounded ${isDark ? 'bg-white/6 animate-pulse' : 'bg-slate-200 animate-pulse'} ${className}`} />
    );
}

// ─────────────────────────────────────────────────────────────
// MAIN EXPORT: CryptoTab
// ─────────────────────────────────────────────────────────────
export default function CryptoTab({ isDark, UI, uiStyle = 'classic', addLog = [], initialSymbol = null, onSymbolChange = null }) {
    const { t } = useTranslation('crypto');

    // ── STATE: SEARCH & SYMBOL ──
    const bootSymbol = (initialSymbol || 'BTC').toUpperCase().replace(/USDT$/i, '');
    const [allCryptos, setAllCryptos]         = useState([]);
    const [searchInput, setSearchInput]       = useState(bootSymbol);
    const [suggestions, setSuggestions]       = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [symbol, setSymbol]                 = useState(bootSymbol);
    const [cryptoInterval, setCryptoInterval] = useState('1d');

    // ── STATE: DATA ──
    const [chartData, setChartData]     = useState(null);
    const [priceData, setPriceData]     = useState(null);
    const [radarData, setRadarData]     = useState(null);
    const [topMovers, setTopMovers]     = useState(null);
    const [fundingData, setFundingData] = useState(null);
    const [cryptoNews, setCryptoNews]   = useState([]);

    // ── STATE: LOADING ──
    const [loadingChart, setLoadingChart] = useState(false);
    const [loadingPrice, setLoadingPrice] = useState(false);
    const [loadingRadar, setLoadingRadar] = useState(false);
    const [loadingNews, setLoadingNews]   = useState(false);
    const [loadError, setLoadError]       = useState(false);

    // ── STATE: AI ──
    const [aiSignal, setAiSignal]   = useState(null);
    const [loadingAi, setLoadingAi] = useState(false);
    const [isChatOpen, setIsChatOpen] = useState(false);

    // ── STATE: UI ──
    const [showVolInfo, setShowVolInfo]     = useState(false);
    const [showOBInfo, setShowOBInfo]       = useState(false);
    const [showNewsPanel, setShowNewsPanel] = useState(true);
    const [mobileTab, setMobileTab]         = useState('chart');
    const [ultraOpenId, setUltraOpenId]     = useState(null);
    const isUltra = uiStyle === 'ultra';
    const [currUnit, setCurrUnit]           = useState('USD');

    // ── STATE: DEMO TRADING ──
    const [balance, setBalance]     = useState(10000);
    const [positions, setPositions] = useState([]);
    const [tradeQty, setTradeQty]   = useState('0.01');
    const [tradeMsg, setTradeMsg]   = useState('');

    const searchRef = useRef(null);

    // ── CONSTANTS ──
    // Map nhãn hiển thị (hoặc API value) → giá trị gửi lên API
    // TradingChart still uses Vietnamese interval strings as API values
    const INTERVAL_CHART_LABEL = {
        '5m': '5 phút', '15m': '15 phút', '1h': '1 giờ',
        '4h': '4 giờ', '1d': '1 ngày', '1w': '1 tuần',
    };
    const resolveIntervalValue = (input) => {
        const legacyLabels = {
            '5 phút': '5m', '15 phút': '15m', '1 giờ': '1h', '4 giờ': '4h', '1 ngày': '1d', '1 tuần': '1w',
        };
        return legacyLabels[input] || input;
    };

    const INTERVAL_OPTIONS = useMemo(() => [
        { label: t('interval5m'),  value: '5m'  },
        { label: t('interval15m'), value: '15m' },
        { label: t('interval1h'),   value: '1h'  },
        { label: t('interval4h'),   value: '4h'  },
        { label: t('interval1d'),  value: '1d'  },
        { label: t('interval1w'),  value: '1w'  },
    ], [t]);

    const getChartIntervalLabel = useCallback((value) => {
        return INTERVAL_CHART_LABEL[value] || '1 ngày';
    }, []);

    const QUICK_COINS = ['BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'DOGE', 'AVAX', 'ADA', 'MATIC', 'LINK'];

    // ── TẢI DANH SÁCH COIN ──
    useEffect(() => {
        axios.get('/api/crypto-symbols')
            .then(res => setAllCryptos(res.data))
            .catch(err => console.error("Lỗi tải danh sách coin:", err));
    }, []);

    // ── FILTER GỢI Ý (ưu tiên khớp đúng symbol, rồi prefix, rồi chứa) ──
    useEffect(() => {
        if (!searchInput.trim()) { setSuggestions([]); return; }
        const kw = searchInput.toUpperCase().trim();
        const scored = allCryptos
            .map(c => {
                const sym = c.symbol?.toUpperCase() || '';
                const name = c.name?.toUpperCase() || '';
                let score = 0;
                if (sym === kw) score = 300;
                else if (sym.startsWith(kw)) score = 200;
                else if (name.startsWith(kw)) score = 150;
                else if (sym.includes(kw)) score = 100;
                else if (name.includes(kw)) score = 50;
                else return null;
                return { coin: c, score };
            })
            .filter(Boolean)
            .sort((a, b) => b.score - a.score)
            .slice(0, 8)
            .map(x => x.coin);
        setSuggestions(scored);
    }, [searchInput, allCryptos]);

    // ── CLOSE DROPDOWN KHI CLICK NGOÀI ──
    useEffect(() => {
        const handler = (e) => { if (!searchRef.current?.contains(e.target)) setShowSuggestions(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // ── ACTION: AI SIGNAL ──
    const handleAiAnalysis = async () => {
        if (!priceData || !symbol) return;
        setLoadingAi(true);
        try {
            const coinFunding = fundingData?.rates?.find(r => r.symbol === symbol)?.fundingRate || 0;
            const payload = {
                symbol,
                currentPrice: priceData.currentPrice,
                technicalScore: priceData.technicals?.score || 50,
                techDetails: priceData.technicals,
                derivatives: { fundingRate: coinFunding, longPercent: 50, shortPercent: 50 },
                newsList: cryptoNews
            };
            const res = await axios.post('/api/crypto/signal', payload);
            if (res.data.success) setAiSignal(res.data.data);
        } catch (error) {
            addLog("[LỖI] Lỗi AI: " + error.message);
        } finally {
            setLoadingAi(false);
        }
    };

    // ── FETCH: RADAR ──
    const fetchRadar = useCallback(async () => {
        setLoadingRadar(true);
        try {
            const res = await axios.get('/api/crypto/radar');
            if (res.data.success) {
                setRadarData(res.data.data);
                addLog('[HỆ THỐNG] Radar: Fear & Greed + Dominance đã cập nhật');
            }
        } catch (e) {
            addLog(`[LỖI] Lỗi radar: ${e.message}`);
        } finally {
            setLoadingRadar(false);
        }
    }, [addLog]);

    // ── FETCH: CHART + PRICE
    // FIX: cryptoInterval lưu API value; map nhãn TradingChart nếu cần
    const fetchCoin = useCallback(async (sym, intervalInput) => {
        if (!sym) return;
        const intervalVal = resolveIntervalValue(intervalInput);
        const intervalLabel = INTERVAL_OPTIONS.find(o => o.value === intervalVal)?.label
            || INTERVAL_CHART_LABEL[intervalVal]
            || intervalVal;
        setLoadingChart(true);
        setLoadingPrice(true);
        setLoadError(false);
        addLog(`[CRYPTO] Đang tải ${sym} | Khung: ${intervalLabel} (${intervalVal})...`);
        try {
            const [chartRes, priceRes] = await Promise.all([
                axios.get(`/api/crypto/history/${sym}?interval=${intervalVal}`).catch(() => null),
                axios.get(`/api/crypto/price/${sym}?interval=${intervalVal}`).catch(() => null)
            ]);
            let chartOk = false, priceOk = false;
            if (chartRes?.data?.success && chartRes.data.data?.length > 0) {
                const raw = chartRes.data.data;
                const candles = Array.isArray(raw) ? raw : raw.chartData || [];
                setChartData(candles);
                chartOk = candles.length > 0;
                addLog(`[CRYPTO] Chart ${sym}: ${candles.length} nến`);
            }
            if (priceRes?.data?.success) {
                const d = priceRes.data.data;
                setPriceData(d);
                if (d.lastSignal) setAiSignal(d.lastSignal);
                else setAiSignal(null);
                priceOk = true;
                addLog(`[CRYPTO] Giá ${sym}: $${d.currentPrice?.toLocaleString()} | Score: ${d.technicals?.score ?? '-'}`);
            }
            // Không nguồn nào trả dữ liệu → hiện trạng thái lỗi rõ ràng thay vì để trống
            if (!chartOk && !priceOk) {
                setChartData([]);
                setLoadError(true);
                addLog(`[CẢNH BÁO] Không có dữ liệu cho ${sym} (${intervalLabel}). Có thể coin không niêm yết cặp USDT.`);
            }
        } catch (e) {
            setLoadError(true);
            addLog(`[LỖI] Lỗi tải ${sym}: ${e.message}`);
        } finally {
            setLoadingChart(false);
            setLoadingPrice(false);
        }
    }, [addLog]);

    // ── FETCH: TOP MOVERS ──
    const fetchMovers = useCallback(async () => {
        try {
            const res = await axios.get('/api/crypto/top-movers');
            if (res.data.success) {
                const data = res.data.data;
                setTopMovers(data);
                // Gộp mã top movers vào danh sách tìm kiếm (M, FIGR_HELOC…)
                const extras = [
                    ...(data.gainers || []),
                    ...(data.losers || []),
                    ...(data.markets || []),
                ];
                if (extras.length) {
                    setAllCryptos(prev => {
                        const map = new Map(
                            (Array.isArray(prev) ? prev : []).map(c => [String(c.symbol || '').toUpperCase(), c])
                        );
                        for (const c of extras) {
                            const sym = String(c.symbol || '').toUpperCase();
                            if (!sym) continue;
                            const existing = map.get(sym);
                            map.set(sym, {
                                symbol: sym,
                                name: c.name || existing?.name || sym,
                                image: c.image || existing?.image || '',
                            });
                        }
                        return [...map.values()];
                    });
                }
            }
        } catch (e) { /* silent */ }
    }, []);

    // ── FETCH: FUNDING ──
    const fetchFunding = useCallback(async () => {
        try {
            const res = await axios.get('/api/crypto/funding');
            if (res.data.success) setFundingData(res.data.data);
        } catch (e) { /* silent */ }
    }, []);

    // ── FETCH: NEWS ──
    const fetchNews = useCallback(async (sym) => {
        if (!sym) return;
        setLoadingNews(true);
        try {
            const res = await axios.get(`/api/crypto/news/${sym}`);
            if (res.data.success && res.data.data?.length > 0) {
                setCryptoNews(res.data.data);
                addLog(`[CRYPTO] Tải ${res.data.data.length} tin tức cho ${sym}`);
            }
        } catch (e) {
            addLog(`[CẢNH BÁO] News API chưa sẵn sàng cho ${sym}`);
        } finally {
            setLoadingNews(false);
        }
    }, [addLog]);

    // ── EFFECTS ──
    useEffect(() => {
        fetchRadar();
        fetchMovers();
        fetchFunding();
        const radarTimer = setInterval(fetchRadar, 5 * 60 * 1000);
        const moversTimer = setInterval(fetchMovers, 2 * 60 * 1000);
        return () => { clearInterval(radarTimer); clearInterval(moversTimer); };
    }, []);

    // Đổi coin → xoá dữ liệu cũ ngay để tránh hiện biểu đồ/giá của coin trước (stale)
    useEffect(() => {
        setChartData(null);
        setPriceData(null);
        setAiSignal(null);
        setLoadError(false);
    }, [symbol]);

    // FIX: Effect phụ thuộc vào cả symbol VÀ cryptoInterval để re-fetch khi đổi khung thời gian
    useEffect(() => {
        fetchCoin(symbol, cryptoInterval);
        fetchNews(symbol);
    }, [symbol, cryptoInterval]);

    // ── SELECT COIN ──
    const selectCoin = (sym) => {
        const s = sym.toUpperCase().trim().replace(/USDT$/i, '');
        if (!s) return;
        setSymbol(s);
        setSearchInput(s);
        setShowSuggestions(false);
        onSymbolChange?.(s);
    };

    // Sync when parent route changes (/crypto/:symbol)
    useEffect(() => {
        if (!initialSymbol) return;
        const s = String(initialSymbol).toUpperCase().replace(/USDT$/i, '');
        if (!s) return;
        setSymbol((prev) => {
            if (prev === s) return prev;
            setSearchInput(s);
            return s;
        });
    }, [initialSymbol]);

    // ── CHANGE INTERVAL — reload chart + radar (radar không phụ thuộc khung, nhưng lần đầu hay miss data)
    const handleIntervalChange = (labelOrValue) => {
        setCryptoInterval(resolveIntervalValue(labelOrValue));
        fetchRadar();
        // Effect [symbol, cryptoInterval] tự động gọi fetchCoin với interval mới
    };

    // ── COMPUTED ──
    const tech   = priceData?.technicals;
    const volProf = priceData?.volProfile;
    const ob     = priceData?.orderbookImbalance;
    const px     = priceData?.currentPrice;
    const ch24   = priceData?.change24h;
    const isPosChange = parseFloat(ch24) >= 0;

    const totalPnL = useMemo(() => positions.reduce((sum, pos) => {
        const cur = pos.symbol === symbol ? (px || pos.entry) : pos.entry;
        return sum + (cur - pos.entry) * pos.qty;
    }, 0), [positions, px, symbol]);

    // ─────────────────────────────────────────────────────────────
    // RENDER
    // ─────────────────────────────────────────────────────────────
    if (isUltra) {
        const ultraSections = [
            {
                id: 'chart',
                title: symbol ? `Biểu đồ · ${symbol}` : 'Biểu đồ',
                icon: BarChart3,
                summary: px ? fmtUSD(px) : (loadingChart ? 'Đang tải…' : 'Đóng'),
                render: () => (
                    <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="relative flex-1 min-w-[120px]">
                                <Search size={14} className={`absolute left-2.5 top-1/2 -translate-y-1/2 ${T.textMute(isDark)}`} />
                                <input
                                    type="text"
                                    value={searchInput}
                                    onChange={e => { setSearchInput(e.target.value.toUpperCase()); setShowSuggestions(true); }}
                                    onKeyDown={e => { if (e.key === 'Enter') selectCoin(searchInput); }}
                                    placeholder={t('searchPlaceholderMini')}
                                    className={`w-full h-9 pl-8 pr-2 rounded-lg border text-xs font-bold outline-none ${isDark ? 'bg-black/40 border-white/10 text-violet-300' : 'bg-white border-slate-300 text-violet-700'}`}
                                />
                            </div>
                            <button type="button" onClick={() => selectCoin(searchInput)} className={`h-9 px-3 rounded-lg ${T.accentSolid} text-white text-xs font-bold`}>{t('search')}</button>
                            <button type="button" onClick={() => fetchCoin(symbol, cryptoInterval)} className={`h-9 w-9 rounded-lg border flex items-center justify-center ${T.border(isDark)}`}>
                                <RefreshCw size={13} className={loadingChart ? `animate-spin ${T.accent}` : T.textMute(isDark)} />
                            </button>
                        </div>
                        <div className="flex gap-1 flex-wrap">
                            {INTERVAL_OPTIONS.map(({ label, value }) => (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => handleIntervalChange(value)}
                                    className={`px-2 py-1 rounded-md text-[10px] font-bold border ${cryptoInterval === value ? `${T.accentBg} ${T.accentBorder} ${T.accent}` : T.border(isDark)}`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                        <div className={`h-[min(55vh,420px)] min-h-[280px] rounded-xl border overflow-hidden panel-outline ${isDark ? 'bg-black/30 border-white/6' : 'bg-white border-slate-300'}`}>
                            {chartData?.length ? (
                                <TradingChart
                                    data={chartData}
                                    theme={isDark ? 'dark' : 'light'}
                                    accent="violet"
                                    onIntervalChange={handleIntervalChange}
                                    currentInterval={getChartIntervalLabel(cryptoInterval)}
                                />
                            ) : loadError && !loadingChart ? (
                                <div className="h-full flex flex-col items-center justify-center gap-2 px-4 text-center">
                                    <AlertTriangle size={24} className="text-amber-400" />
                                    <p className={`text-xs ${T.textMute(isDark)}`}>{t('loadFailed')} {symbol}</p>
                                    <button type="button" onClick={() => fetchCoin(symbol, cryptoInterval)} className={`h-8 px-3 rounded-lg ${T.accentSolid} text-white text-xs font-bold`}>{t('retry')}</button>
                                </div>
                            ) : (
                                <div className="h-full flex items-center justify-center">
                                    <Activity size={24} className={`animate-pulse ${T.accent}`} />
                                </div>
                            )}
                        </div>
                    </div>
                ),
            },
            {
                id: 'radar',
                title: t('tabMarketRadar'),
                icon: Globe,
                summary: radarData?.fearGreed?.labelVi || t('closed'),
                render: () => (
                    <div className="space-y-3">
                        <Panel isDark={isDark} className="p-4">
                            <SectionHeader icon={Activity} title={t('fearGreed')} isDark={isDark} />
                            <FearGreedGauge value={radarData?.fearGreed?.value ?? 50} labelVi={radarData?.fearGreed?.labelVi} isDark={isDark} />
                        </Panel>
                        <Panel isDark={isDark} className="p-4">
                            <SectionHeader icon={BarChart3} title={t('dominance')} isDark={isDark} />
                            <StatRow label="BTC" value={radarData?.dominance?.btc ? `${radarData.dominance.btc}%` : '-'} color="text-amber-400" isDark={isDark} />
                            <StatRow label="ETH" value={radarData?.dominance?.eth ? `${radarData.dominance.eth}%` : '-'} color="text-blue-400" isDark={isDark} />
                            {radarData?.globalMarket && (
                                <StatRow label={t('marketCapLabel')} value={radarData.globalMarket.totalMarketCap} isDark={isDark} />
                            )}
                        </Panel>
                        {fundingData && (
                            <Panel isDark={isDark} className="p-4">
                                <SectionHeader icon={Zap} title={t('fundingRate')} isDark={isDark} />
                                {fundingData.rates?.slice(0, 5).map(r => (
                                    <StatRow key={r.symbol} label={r.symbol} value={`${r.fundingRate > 0 ? '+' : ''}${r.fundingRate}%`} isDark={isDark} />
                                ))}
                            </Panel>
                        )}
                        {topMovers && (
                            <Panel isDark={isDark} className="p-4">
                                <SectionHeader icon={TrendingUp} title={t('topMovers24h')} isDark={isDark} />
                                <div className="grid grid-cols-2 gap-1.5">
                                    {[...(topMovers.gainers || []).slice(0, 3), ...(topMovers.losers || []).slice(0, 3)].map(coin => (
                                        <button
                                            key={coin.symbol}
                                            type="button"
                                            onClick={() => selectCoin(coin.symbol)}
                                            title={coin.name ? `${coin.symbol} · ${coin.name}` : coin.symbol}
                                            className={`flex items-center gap-1.5 min-w-0 px-2.5 py-2 rounded-lg border text-left text-xs font-bold ${symbol === coin.symbol ? `${T.accentBg} ${T.accentBorder}` : T.border(isDark)}`}
                                        >
                                            <span className="min-w-0 truncate">
                                                {coin.symbol}
                                                {coin.name && coin.symbol.length <= 2 ? (
                                                    <span className={`font-medium opacity-60`}> · {coin.name}</span>
                                                ) : null}
                                            </span>
                                            <span className={`shrink-0 font-mono ${coin.change >= 0 ? T.bull : T.bear}`}>{fmtPct(coin.change)}</span>
                                        </button>
                                    ))}
                                </div>
                            </Panel>
                        )}
                        <button
                            type="button"
                            onClick={() => { fetchRadar(); fetchMovers(); fetchFunding(); }}
                            className={`w-full h-9 rounded-lg border text-xs font-bold ${T.accentOutline(isDark)}`}
                        >
                            {t('refreshRadar')}
                        </button>
                    </div>
                ),
            },
            {
                id: 'info',
                title: symbol ? t('priceSymbol', { symbol }) : t('coinInfo'),
                icon: Database,
                summary: px ? fmtPct(ch24) : t('closed'),
                render: () => (
                    <div className="space-y-3">
                        {priceData ? (
                            <>
                                <div className={`rounded-xl border p-4 ${T.border(isDark)} ${T.panelBg(isDark)}`}>
                                    <p className={`text-2xl font-black ${T.textHero(isDark)}`}>{symbol}</p>
                                    <p className={`text-xl font-mono font-black mt-2 ${T.textHero(isDark)}`}>{fmtUSD(px)}</p>
                                    <p className={`text-sm font-bold mt-1 ${isPosChange ? T.bull : T.bear}`}>{fmtPct(ch24)}</p>
                                </div>
                                <Panel isDark={isDark} className="p-4">
                                    <SectionHeader icon={Database} title={t('onChain')} isDark={isDark} />
                                    <StatRow label="ATH" value={fmtUSD(priceData.ath)} isDark={isDark} />
                                    <StatRow label={t('marketCapLabel')} value={fmtLarge(priceData.marketCap)} isDark={isDark} />
                                </Panel>
                                {volProf?.bins && (
                                    <Panel isDark={isDark} className="p-4">
                                        <SectionHeader icon={BarChart3} title={t('volumeProfile')} isDark={isDark} />
                                        <CryptoVolumeProfile bins={volProf.bins} maxVol={volProf.maxVol} pocPrice={volProf.pocPrice} isDark={isDark} />
                                    </Panel>
                                )}
                            </>
                        ) : (
                            <p className={`text-sm ${T.textMute(isDark)}`}>{t('selectCoinHint')}</p>
                        )}
                    </div>
                ),
            },
            {
                id: 'ai',
                title: t('aiAnalysis'),
                icon: BrainCircuit,
                summary: aiSignal ? aiSignal.signal : (loadingAi ? t('running') : t('closed')),
                render: () => (
                    <div className="space-y-3">
                        {tech && <SentimentBar score={tech.score} isDark={isDark} />}
                        <button
                            type="button"
                            onClick={handleAiAnalysis}
                            disabled={loadingAi}
                            className="w-full h-11 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-black text-sm disabled:opacity-40"
                        >
                            {loadingAi ? t('analyzing') : (aiSignal ? t('updateAnalysis') : t('analyzeSignal'))}
                        </button>
                        <button
                            type="button"
                            onClick={() => setIsChatOpen(true)}
                            className={`w-full h-10 rounded-xl border font-bold text-xs ${T.accentOutline(isDark)}`}
                        >
                            {t('askAiAbout', { symbol })}
                        </button>
                        {aiSignal ? (
                            <div className="space-y-2">
                                <div className={`p-3 rounded-xl border text-xs leading-relaxed ${T.border(isDark)} ${T.panelBg(isDark)}`}>
                                    <p className={T.textBody(isDark)}>{aiSignal.tech_analysis}</p>
                                    <p className={`mt-2 ${T.textBody(isDark)}`}>{aiSignal.macro_analysis}</p>
                                </div>
                                <div className={`p-3 rounded-xl border text-xs ${T.accentBorder} ${T.accentBg}`}>
                                    <p className="font-bold text-violet-400">{aiSignal.signal} ({aiSignal.confidence})</p>
                                    <p className={`mt-1 ${T.textBody(isDark)}`}>{aiSignal.advice}</p>
                                </div>
                            </div>
                        ) : (
                            <p className={`text-sm ${T.textMute(isDark)}`}>{t('noAiReport')}</p>
                        )}
                    </div>
                ),
            },
            {
                id: 'news',
                title: t('news'),
                icon: Newspaper,
                summary: cryptoNews.length ? t('newsCount', { count: cryptoNews.length }) : t('closed'),
                render: () => (
                    <div className="space-y-2 max-h-[480px] overflow-y-auto custom-scrollbar">
                        {cryptoNews.length > 0 ? (
                            cryptoNews.map((n, i) => <NewsCard key={i} news={n} isDark={isDark} />)
                        ) : (
                            <p className={`text-sm py-6 text-center ${T.textMute(isDark)}`}>
                                {loadingNews ? t('loadingNews') : t('noNewsFor', { symbol })}
                            </p>
                        )}
                    </div>
                ),
            },
        ];

        return (
            <div className={`flex flex-col w-full h-full min-h-0 overflow-hidden ${T.pageBg(isDark)}`}>
                <div className={`shrink-0 px-4 py-2.5 border-b ${isDark ? 'border-white/10 bg-[#0B0F14]' : 'border-slate-300 bg-white'}`}>
                    <p className="text-[10px] font-black uppercase tracking-widest text-violet-400">{t('ultraMinimalCrypto')}</p>
                    <p className={`text-sm font-bold ${T.textHero(isDark)}`}>
                        {symbol}{px ? ` · ${fmtUSD(px)}` : ''} · Chạm từng mục để mở
                    </p>
                </div>
                <UltraStack
                    sections={ultraSections}
                    openId={ultraOpenId}
                    onOpenChange={setUltraOpenId}
                    isDark={isDark}
                />
                <StockAiChat
                    isOpen={isChatOpen}
                    onClose={() => setIsChatOpen(false)}
                    ticker={symbol}
                    companyName={allCryptos.find(c => c.symbol === symbol)?.name || symbol}
                    aiReport={aiSignal ? `Phân tích kỹ thuật: ${aiSignal.tech_analysis}\n\nVĩ mô: ${aiSignal.macro_analysis}\n\nChiến lược: ${aiSignal.advice}` : null}
                    isDark={isDark}
                    assetType="crypto"
                />
            </div>
        );
    }

    return (
        <div className={`flex flex-col w-full h-full overflow-hidden ${T.pageBg(isDark)}`}>

            {/* ════════════════════════════════════════
                MOBILE TAB BAR — chỉ hiện trên mobile
            ════════════════════════════════════════ */}
            <div className={`lg:hidden flex shrink-0 border-b col-seam ${isDark ? 'bg-[#0C1118] border-white/8' : 'bg-white border-slate-500'} z-50`}>
                {[
                    { key: 'radar', label: t('tabMarketRadar') },
                    { key: 'chart', label: t('tabChartAi') },
                ].map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => setMobileTab(tab.key)}
                        className={`flex-1 py-3 text-xs font-semibold transition-colors ${
                            mobileTab === tab.key
                                ? `border-b-2 border-violet-500 ${T.accent} ${T.accentBg}`
                                : `${T.textMute(isDark)} hover:${T.textBody(isDark)}`
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            <div className="flex-1 flex flex-row w-full min-h-0 overflow-hidden">

                {/* ════════════════════════════════════════
                    CỘT TRÁI: CRYPTO RADAR
                    - Mobile: hiện khi mobileTab='radar'
                    - Desktop: luôn hiện, chiều rộng cố định
                ════════════════════════════════════════ */}
                <aside className={`
                    ${mobileTab === 'radar' ? 'flex' : 'hidden'} lg:flex
                    w-full lg:w-[300px] shrink-0
                    flex-col overflow-y-auto
                    border-r col-seam transition-colors duration-300
                    ${isDark ? 'bg-[#0A0F16] border-white/6' : 'bg-slate-50 border-slate-500'}
                `}>

                    {/* Header cột trái */}
                    <div className={`h-11 border-b shrink-0 flex items-center px-4 gap-2.5 sticky top-0 z-10 ${isDark ? 'bg-[#0C1118] border-white/6' : 'bg-white border-slate-300'}`}>
                        <Globe size={14} className={T.accent} />
                        <span className={`text-xs font-bold tracking-wide uppercase ${T.textBody(isDark)}`}>
                            Market Radar
                        </span>
                        <button
                            onClick={() => { fetchRadar(); fetchMovers(); fetchFunding(); }}
                            title={t('refreshData')}
                            className={`ml-auto p-1.5 rounded-lg transition-colors ${isDark ? 'hover:bg-white/8' : 'hover:bg-slate-100'}`}
                        >
                            <RefreshCw size={13} className={loadingRadar ? `animate-spin ${T.accent}` : T.textMute(isDark)} />
                        </button>
                    </div>

                    <div className="p-3 flex flex-col gap-3 pb-16">

                        {/* 1. FEAR & GREED */}
                        <Panel isDark={isDark} className="p-4">
                            <SectionHeader
                                icon={Activity}
                                title={t('fearGreed')}
                                isDark={isDark}
                            />
                            <FearGreedGauge
                                value={radarData?.fearGreed?.value ?? 50}
                                labelVi={radarData?.fearGreed?.labelVi}
                                isDark={isDark}
                            />
                        </Panel>

                        {/* 2. DOMINANCE */}
                        <Panel isDark={isDark} className="p-4">
                            <SectionHeader icon={BarChart3} title={t('dominanceMarket')} isDark={isDark} />
                            <StatRow
                                label="BTC Dominance"
                                value={radarData?.dominance?.btc ? `${radarData.dominance.btc}%` : '-'}
                                color="text-amber-400"
                                isDark={isDark}
                                help="Tỷ lệ vốn hóa Bitcoin so với toàn thị trường crypto"
                            />
                            <StatRow
                                label="ETH Dominance"
                                value={radarData?.dominance?.eth ? `${radarData.dominance.eth}%` : '-'}
                                color="text-blue-400"
                                isDark={isDark}
                                help="Tỷ lệ vốn hóa Ethereum so với toàn thị trường"
                            />
                            <StatRow
                                label="Altcoin Season"
                                value={radarData?.dominance?.altSeason || '-'}
                                color="text-violet-400"
                                isDark={isDark}
                                help="Chỉ số mùa altcoin: khi BTC dominance giảm, vốn thường chảy vào altcoin"
                            />
                            {radarData?.globalMarket && <>
                                <StatRow label={t('totalMarketCap')}  value={radarData.globalMarket.totalMarketCap} isDark={isDark} />
                                <StatRow label="Volume 24h"    value={radarData.globalMarket.volume24h} isDark={isDark} />
                                <StatRow
                                    label={t('change24h')}
                                    value={radarData.globalMarket.marketCapChangePercent ? fmtPct(radarData.globalMarket.marketCapChangePercent) : '-'}
                                    color={parseFloat(radarData.globalMarket.marketCapChangePercent) >= 0 ? T.bull : T.bear}
                                    isDark={isDark}
                                />
                            </>}
                        </Panel>

                        {/* 3. FUNDING RATES */}
                        {fundingData && (
                            <Panel isDark={isDark} className="p-4">
                                <SectionHeader
                                    icon={Zap}
                                    title={t('fundingRateFutures')}
                                    isDark={isDark}
                                />
                                <div className={`mb-2 px-2 py-1 rounded-lg flex justify-between items-center border ${isDark ? 'bg-white/4 border-white/6' : 'bg-slate-50 border-slate-300'}`}>
                                    <span className={`text-[10px] font-medium ${T.textMute(isDark)}`}>
                                        Funding rate dương = lệnh LONG trả phí cho SHORT (thị trường đang kỳ vọng tăng mạnh)
                                    </span>
                                </div>
                                {fundingData.rates?.slice(0, 5).map(r => (
                                    <StatRow
                                        key={r.symbol}
                                        label={r.symbol}
                                        value={`${r.fundingRate > 0 ? '+' : ''}${r.fundingRate}%`}
                                        color={r.fundingRate > 0 ? T.bull : r.fundingRate < 0 ? T.bear : T.textMute(isDark)}
                                        isDark={isDark}
                                    />
                                ))}
                                <div className={`mt-2.5 pt-2.5 border-t flex justify-between items-center ${isDark ? 'border-white/5' : 'border-slate-200'}`}>
                                    <span className={`text-[10px] font-medium ${T.textMute(isDark)}`}>{t('marketTrend')}</span>
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${fundingData.avgFunding > 0.01 ? 'bg-emerald-500/10 text-emerald-400' : fundingData.avgFunding < -0.005 ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-400'}`}>
                                        {fundingData.marketBias}
                                    </span>
                                </div>
                            </Panel>
                        )}

                        {/* 4. TOP MOVERS */}
                        {topMovers && (
                            <Panel isDark={isDark} className="p-4">
                                <SectionHeader icon={TrendingUp} title={t('topMovers24h')} isDark={isDark} />
                                <div className="grid grid-cols-2 gap-1.5">
                                    {[...(topMovers.gainers || []).slice(0, 3), ...(topMovers.losers || []).slice(0, 3)].map(coin => {
                                        const isGain = coin.change >= 0;
                                        return (
                                            <button
                                                key={coin.symbol}
                                                type="button"
                                                onClick={() => selectCoin(coin.symbol)}
                                                title={coin.name ? `${coin.symbol} · ${coin.name}` : coin.symbol}
                                                className={`flex items-center gap-1.5 min-w-0 px-2.5 py-2 rounded-lg border text-left transition-all active:scale-95 ${
                                                    symbol === coin.symbol
                                                        ? `${T.accentBg} ${T.accentBorder}`
                                                        : isDark
                                                            ? 'border-white/5 hover:bg-white/5'
                                                            : 'border-slate-200 hover:bg-slate-50'
                                                }`}
                                            >
                                                <span className={`min-w-0 truncate text-xs font-bold ${T.textBody(isDark)}`}>
                                                    {coin.symbol}
                                                    {coin.name && coin.symbol.length <= 2 ? (
                                                        <span className={`font-medium ${T.textMute(isDark)}`}> · {coin.name}</span>
                                                    ) : null}
                                                </span>
                                                <span className={`shrink-0 text-xs font-mono font-semibold flex items-center gap-0.5 ${isGain ? T.bull : T.bear}`}>
                                                    {isGain ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
                                                    {fmtPct(coin.change)}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </Panel>
                        )}

                        {/* 5. ON-CHAIN */}
                        {priceData && (
                            <Panel isDark={isDark} className="p-4">
                                <SectionHeader icon={Database} title={t('onChainHistory')} isDark={isDark} />
                                <StatRow label="ATH"           value={fmtUSD(priceData.ath)} isDark={isDark} help="All-Time High: mức giá cao nhất trong lịch sử" />
                                <StatRow
                                    label={t('fromAth')}
                                    value={priceData.ath != null ? fmtPct(priceData.athChange) : '-'}
                                    color={parseFloat(priceData.athChange) >= 0 ? T.bull : T.bear}
                                    isDark={isDark}
                                    help="Khoảng cách % từ giá hiện tại đến ATH"
                                />
                                <StatRow label={t('marketCapLabel')}      value={fmtLarge(priceData.marketCap)} isDark={isDark} />
                                <StatRow
                                    label={t('circulating')}
                                    value={priceData.circulatingSupply > 0 ? `${Number(priceData.circulatingSupply).toLocaleString('en-US', { maximumFractionDigits: 0 })} ${symbol}` : '-'}
                                    isDark={isDark}
                                    help="Số lượng coin đang được lưu hành trên thị trường"
                                />
                                {priceData.maxSupply > 0 && priceData.circulatingSupply > 0 && (
                                    <>
                                        <StatRow
                                            label={t('totalSupply')}
                                            value={Number(priceData.maxSupply).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                                            isDark={isDark}
                                            help="Tổng số coin tối đa sẽ tồn tại"
                                        />
                                        <div className={`mt-2 h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-white/8' : 'bg-slate-200'}`}>
                                            <div
                                                className="h-full bg-violet-500 rounded-full"
                                                style={{ width: `${Math.min((priceData.circulatingSupply / priceData.maxSupply) * 100, 100)}%` }}
                                            />
                                        </div>
                                        <p className={`text-[10px] font-medium mt-1 text-right ${T.textMute(isDark)}`}>
                                            {t('pctCirculating', { pct: ((priceData.circulatingSupply / priceData.maxSupply) * 100).toFixed(1) })}
                                        </p>
                                    </>
                                )}
                            </Panel>
                        )}
                    </div>
                </aside>

                {/* ════════════════════════════════════════
                    CỘT PHẢI: CHART + AI ANALYSIS + NEWS
                ════════════════════════════════════════ */}
                <main className={`
                    ${mobileTab === 'chart' ? 'flex' : 'hidden'} lg:flex
                    flex-1 flex-col overflow-y-auto min-w-0
                    ${isDark ? '' : 'bg-slate-50'}
                `} style={{ scrollbarGutter: 'stable' }}>

                    {/* ── SEARCH BAR (sticky) ── */}
                    <div className={`sticky top-0 z-[10000] shrink-0 border-b ${isDark ? 'bg-[#060A10]/95 border-white/6 backdrop-blur-xl' : 'bg-white/95 border-slate-500 backdrop-blur-xl'}`}>
                        <div className="px-4 py-3" ref={searchRef}>

                            {/* Row 1: Search + Interval */}
                            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">

                                {/* Search Input */}
                                <div className="relative flex-1 min-w-0 sm:max-w-xs">
                                    <Search size={15} className={`absolute left-3 top-1/2 -translate-y-1/2 ${T.textMute(isDark)}`} />
                                    <input
                                        type="text"
                                        value={searchInput}
                                        onChange={e => { setSearchInput(e.target.value.toUpperCase()); setShowSuggestions(true); }}
                                        onKeyDown={e => { if (e.key === 'Enter') selectCoin(searchInput); }}
                                        onFocus={() => setShowSuggestions(true)}
                                        placeholder={t('searchCoinPlaceholder')}
                                        className={`w-full h-9 pl-9 pr-3 rounded-lg border text-sm font-medium outline-none transition-all ${
                                            isDark
                                                ? `${T.inputBg(isDark)} border-white/8 text-violet-300 focus:border-violet-500/50 placeholder:text-slate-600`
                                                : 'bg-slate-50 border-slate-300 text-violet-700 focus:border-violet-400 placeholder:text-slate-400'
                                        }`}
                                    />
                                    {/* Dropdown gợi ý */}
                                    {showSuggestions && suggestions.length > 0 && (
                                        <div className={`absolute top-full mt-1.5 left-0 right-0 border rounded-xl overflow-hidden shadow-2xl z-50 max-h-64 overflow-y-auto ${isDark ? 'bg-[#141C28] border-white/10' : 'bg-white border-slate-300'}`}>
                                            {suggestions.map((coin, idx) => (
                                                <button
                                                    key={idx}
                                                    onClick={() => selectCoin(coin.symbol)}
                                                    className={`w-full text-left px-4 py-2.5 flex items-center gap-3 border-b last:border-0 transition-colors ${isDark ? 'border-white/5 hover:bg-white/6 text-slate-300' : 'border-slate-200 hover:bg-slate-50 text-slate-700'}`}
                                                >
                                                    {coin.image && <img src={coin.image} alt={coin.symbol} className="w-5 h-5 rounded-full shrink-0" onError={e => e.target.style.display = 'none'} />}
                                                    <span className={`font-bold text-xs ${T.accent}`}>{coin.symbol?.toUpperCase()}</span>
                                                    <span className={`text-xs truncate ${T.textMute(isDark)}`}>{coin.name}</span>
                                                    {coin.rank && <span className={`ml-auto text-[10px] ${T.textMute(isDark)}`}>#{coin.rank}</span>}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Nút Tìm kiếm */}
                                <button
                                    onClick={() => selectCoin(searchInput)}
                                    className={`h-9 px-4 rounded-lg ${T.accentSolid} text-white font-semibold text-xs transition-all active:scale-95 shrink-0`}
                                >
                                    Tìm kiếm
                                </button>

                                {/* Refresh */}
                                <button
                                    onClick={() => fetchCoin(symbol, cryptoInterval)}
                                    title={t('refreshChart')}
                                    className={`h-9 w-9 rounded-lg border flex items-center justify-center transition-all active:scale-95 shrink-0 ${isDark ? 'border-white/8 hover:bg-white/6' : 'border-slate-300 hover:bg-slate-100'}`}
                                >
                                    <RefreshCw size={14} className={loadingChart ? `animate-spin ${T.accent}` : T.textMute(isDark)} />
                                </button>

                                {/* Interval Selector — FIX: dùng handleIntervalChange */}
                                <div className="flex gap-1 ml-auto overflow-x-auto scrollbar-none">
                                    {INTERVAL_OPTIONS.map(({ label, value }) => (
                                        <button
                                            key={value}
                                            onClick={() => handleIntervalChange(value)}
                                            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all whitespace-nowrap active:scale-95 ${
                                                cryptoInterval === value
                                                    ? `${T.accentBg} ${T.accentBorder} ${T.accent}`
                                                    : isDark
                                                        ? 'border-white/8 text-slate-400 hover:bg-white/6'
                                                        : 'border-slate-300 text-slate-500 hover:bg-slate-100'
                                            }`}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Row 2: Quick coins */}
                            <div className="flex gap-1.5 mt-2.5 flex-wrap">
                                {QUICK_COINS.map(c => (
                                    <button
                                        key={c}
                                        onClick={() => selectCoin(c)}
                                        className={`px-3 py-1 rounded-md text-xs font-semibold border transition-all active:scale-95 ${
                                            symbol === c
                                                ? `${T.accentBg} ${T.accentBorder} ${T.accent}`
                                                : isDark
                                                    ? 'border-white/5 text-slate-400 hover:bg-white/5'
                                                    : 'border-slate-300 text-slate-500 hover:bg-slate-50'
                                        }`}
                                    >
                                        {c}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* ── CONTENT AREA ── */}
                    <div className="p-4 flex flex-col gap-4">

                        {/* ── PRICE HEADER ── */}
                        {priceData ? (
                            <Panel isDark={isDark} className="p-4">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">

                                    {/* Logo + Tên */}
                                    <div className="flex items-center gap-4 flex-1 min-w-0">
                                        <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 border ${isDark ? 'bg-black/40 border-white/8' : 'bg-white border-slate-300'}`}>
                                            <img
                                                src={`https://assets.coincap.io/assets/icons/${symbol.toLowerCase()}@2x.png`}
                                                alt={symbol}
                                                className="w-8 h-8 object-contain"
                                                onError={(e) => {
                                                    if (!e.target.dataset.retried) {
                                                        e.target.dataset.retried = 'true';
                                                        e.target.src = `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/${symbol.toLowerCase()}.png`;
                                                    } else {
                                                        e.target.style.display = 'none';
                                                    }
                                                }}
                                            />
                                        </div>
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <h1 className={`text-2xl font-bold leading-none ${T.textHero(isDark)}`}>{symbol}</h1>
                                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${isDark ? 'bg-white/8 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>
                                                    {allCryptos.find(c => c.symbol === symbol)?.name || 'Digital Asset'}
                                                </span>
                                            </div>
                                            <p className={`text-xs mt-1.5 line-clamp-1 ${T.textMute(isDark)}`}>
                                                {allCryptos.find(c => c.symbol === symbol)?.description || t('digitalAssetFallback')}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Giá + Stats + Converter */}
                                    <div className="flex flex-col items-start sm:items-end gap-3 shrink-0">
                                        {/* Giá chính */}
                                        <div className="flex items-baseline gap-2">
                                            <span className={`text-2xl font-mono font-bold ${T.textHero(isDark)}`}>
                                                {currUnit === 'USD' ? fmtUSD(px) : `₫${(px * 25450).toLocaleString('vi-VN')}`}
                                            </span>
                                            <span className={`text-base font-semibold flex items-center gap-0.5 ${isPosChange ? T.bull : T.bear}`}>
                                                {isPosChange ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
                                                {fmtPct(ch24)}
                                            </span>
                                        </div>

                                        {/* Vol H/L + Converter */}
                                        <div className="flex items-center gap-2 flex-wrap justify-end">
                                            {[
                                                { label: 'Vol 24h', val: priceData.volume24h },
                                                { label: t('highLabel'), val: fmtUSD(priceData.high24h) },
                                                { label: t('lowLabel'), val: fmtUSD(priceData.low24h) },
                                            ].map(({ label, val }) => (
                                                <span key={label} className={`px-2 py-1 text-[10px] font-medium rounded-md ${isDark ? 'bg-white/5 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>
                                                    {label}: <span className={`font-bold ${T.textBody(isDark)}`}>{val}</span>
                                                </span>
                                            ))}

                                            <div className={`w-px h-5 ${T.divider(isDark)}`} />

                                            {/* Bộ chuyển đổi tiền tệ */}
                                            <div className="flex items-center gap-1.5" title={t('currencyToggle')}>
                                                <input
                                                    type="number"
                                                    defaultValue="1"
                                                    className={`w-14 h-7 rounded-md text-center font-medium text-xs outline-none transition-all ${isDark ? 'bg-black/40 text-white border border-white/8 focus:border-violet-500' : 'bg-white text-black border border-slate-300 focus:border-violet-400'}`}
                                                />
                                                <select
                                                    value={currUnit}
                                                    onChange={(e) => setCurrUnit(e.target.value)}
                                                    className={`h-7 rounded-md px-1.5 font-semibold text-xs outline-none cursor-pointer border transition-all ${isDark ? 'bg-black/40 text-white border-white/8' : 'bg-white text-black border-slate-300'}`}
                                                >
                                                    <option value="USD">USD ($)</option>
                                                    <option value="VND">VND (₫)</option>
                                                </select>
                                                <button
                                                    onClick={() => setCurrUnit(c => c === 'USD' ? 'VND' : 'USD')}
                                                    title={t('changeUnit')}
                                                    className={`p-1.5 rounded-md transition-all active:scale-95 ${isDark ? 'hover:bg-white/8 text-slate-400' : 'hover:bg-slate-100 text-slate-500'}`}
                                                >
                                                    <RefreshCw size={12} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </Panel>
                        ) : loadingPrice ? (
                            <Panel isDark={isDark} className="p-4">
                                <div className="flex items-center gap-4">
                                    <Skeleton isDark={isDark} h="h-12" w="w-12" className="rounded-full" />
                                    <div className="flex-1 flex flex-col gap-2">
                                        <Skeleton isDark={isDark} h="h-5" w="w-32" />
                                        <Skeleton isDark={isDark} h="h-3" w="w-48" />
                                    </div>
                                    <div className="flex flex-col items-end gap-2">
                                        <Skeleton isDark={isDark} h="h-7" w="w-36" />
                                        <Skeleton isDark={isDark} h="h-4" w="w-24" />
                                    </div>
                                </div>
                            </Panel>
                        ) : null}

                        {/* ── CHART + VOLUME PROFILE ── */}
                        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">

                            {/* Trading Chart */}
                            <div className={`lg:col-span-3 h-[380px] sm:h-[420px] rounded-xl border overflow-hidden relative flex items-center justify-center panel-outline ${isDark ? 'bg-black/30 border-white/6' : 'bg-white border-slate-300'}`}>
                                {chartData && chartData.length > 0 ? (
                                    <TradingChart
                                        data={chartData}
                                        theme={isDark ? 'dark' : 'light'}
                                        accent="violet"
                                        onIntervalChange={handleIntervalChange}
                                        currentInterval={getChartIntervalLabel(cryptoInterval)}
                                    />
                                ) : loadError && !loadingChart ? (
                                    <div className="flex flex-col items-center gap-3 px-6 text-center">
                                        <AlertTriangle size={28} className="text-amber-400" />
                                        <p className={`text-xs font-medium ${T.textBody(isDark)}`}>
                                            Không tải được dữ liệu cho <span className="font-bold">{symbol}</span>.
                                        </p>
                                        <p className={`text-[11px] ${T.textMute(isDark)}`}>
                                            Coin có thể chưa niêm yết cặp USDT hoặc nguồn dữ liệu tạm gián đoạn.
                                        </p>
                                        <button
                                            onClick={() => fetchCoin(symbol, cryptoInterval)}
                                            className={`mt-1 h-8 px-4 rounded-lg ${T.accentSolid} text-white font-semibold text-xs transition-all active:scale-95 flex items-center gap-1.5`}
                                        >
                                            <RefreshCw size={13} /> {t('retry')}
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center gap-2 opacity-50">
                                        <Activity size={28} className={`animate-pulse ${T.accent}`} />
                                        <p className={`text-xs font-medium ${T.textMute(isDark)}`}>
                                            {loadingChart ? t('loadingChart') : t('enterCoinHint')}
                                        </p>
                                    </div>
                                )}
                                {/* Loading overlay khi đổi interval */}
                                {loadingChart && chartData && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-sm rounded-xl">
                                        <div className="flex flex-col items-center gap-2">
                                            <RefreshCw size={20} className={`animate-spin ${T.accent}`} />
                                            <span className={`text-xs font-medium ${T.accent}`}>{t('updating')}</span>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Volume Profile */}
                            <Panel isDark={isDark} className="lg:col-span-1 p-4 flex flex-col">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-1.5">
                                        <BarChart3 size={13} className={T.accent} />
                                        <span className={`text-xs font-bold ${T.textBody(isDark)}`}>{t('volumeProfile')}</span>
                                    </div>
                                    <div
                                        className="relative"
                                        onMouseEnter={() => setShowVolInfo(true)}
                                        onMouseLeave={() => setShowVolInfo(false)}
                                    >
                                        <HelpCircle size={13} className={`cursor-help ${T.textMute(isDark)} hover:${T.accent} transition-colors`} />
                                        {showVolInfo && (
                                            <div className={`absolute right-0 top-6 w-56 p-3 rounded-xl shadow-2xl z-50 text-xs leading-relaxed border ${isDark ? 'bg-[#1C2530] text-slate-300 border-white/10' : 'bg-white text-slate-600 border-slate-300'}`}>
                                                Phân phối khối lượng giao dịch theo mức giá. POC là vùng giao dịch nhiều nhất, thường đóng vai trò là mức hỗ trợ/kháng cự mạnh.
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <CryptoVolumeProfile
                                    bins={volProf?.bins}
                                    maxVol={volProf?.maxVol}
                                    pocPrice={volProf?.pocPrice}
                                    isDark={isDark}
                                />
                            </Panel>
                        </div>

                        {/* ════════════════════════════════════════
                            AI CRYPTO ANALYST PANEL
                        ════════════════════════════════════════ */}
                        <Panel isDark={isDark} accent className="overflow-hidden">
                            {/* Header AI panel */}
                            <div className={`px-5 py-4 border-b flex items-center gap-3 flex-wrap ${isDark ? 'bg-violet-500/5 border-violet-500/15' : 'bg-violet-50 border-violet-200'}`}>
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isDark ? 'bg-violet-500/20' : 'bg-violet-100'}`}>
                                    <BrainCircuit size={20} className="text-violet-500" />
                                </div>
                                <div>
                                    <h4 className={`text-sm font-bold ${T.textHero(isDark)}`}>{t('aiQuantStrategy')}</h4>
                                    <p className={`text-xs font-medium ${T.accent}`}>{t('realtimeSignalEngine')}</p>
                                </div>
                                {tech && (
                                    <div className="ml-auto">
                                        <SentimentBar score={tech.score} isDark={isDark} />
                                    </div>
                                )}
                            </div>

                            <div className="p-5">
                                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

                                    {/* CỘT 1: CHỈ BÁO KỸ THUẬT + ACTIONS */}
                                    <div className="lg:col-span-3 flex flex-col gap-4">
                                        <div className="flex items-center gap-1.5">
                                            <Activity size={13} className="text-violet-500" />
                                            <span className={`text-xs font-bold ${T.textBody(isDark)}`}>{t('technicalIndicators')}</span>
                                        </div>

                                        {tech ? (
                                            <div className={`rounded-xl border p-3 space-y-2 ${isDark ? 'bg-[#0C1118] border-white/6' : 'bg-slate-50 border-slate-300'}`}>
                                                {[
                                                    { label: t('rsi14'), val: fmt(tech.rsi, 1), color: tech?.rsi > 70 ? T.bear : T.bull, help: 'Chỉ số RSI đo lường tốc độ thay đổi giá. >70: quá mua, <30: quá bán' },
                                                    { label: 'MACD',    val: fmt(tech.macdLine), color: tech?.macdLine > 0 ? T.bull : T.bear, help: 'Moving Average Convergence Divergence — xu hướng momentum' },
                                                    { label: 'CVD',     val: fmtLarge(priceData?.cvd), color: (priceData?.cvd ?? 0) >= 0 ? T.bull : T.bear, help: 'Cumulative Volume Delta: tổng lượng mua trừ bán tích lũy' },
                                                    { label: 'ATR',     val: fmtUSD(tech.atr), color: T.textBody(isDark), help: 'Average True Range: độ biến động trung bình — cao = rủi ro cao' },
                                                    { label: 'VWAP',    val: fmtUSD(tech.vwap), color: 'text-blue-400', help: 'Volume Weighted Average Price: giá trung bình theo khối lượng giao dịch' },
                                                ].map(({ label, val, color, help }) => (
                                                    <div key={label} className="flex justify-between items-center">
                                                        <div className="flex items-center gap-1">
                                                            <span className={`text-xs font-medium ${T.textMute(isDark)}`}>{label}</span>
                                                            <div className="group relative">
                                                                <HelpCircle size={10} className={`cursor-help opacity-40 hover:opacity-100 ${T.textMute(isDark)} transition-opacity`} />
                                                                <div className={`absolute left-0 bottom-5 w-56 p-2.5 rounded-lg shadow-xl z-50 text-xs leading-relaxed border opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity ${isDark ? 'bg-[#1C2530] text-slate-300 border-white/10' : 'bg-white text-slate-600 border-slate-300'}`}>
                                                                    {help}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <span className={`text-xs font-mono font-bold ${color}`}>{val}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className={`rounded-xl border p-3 space-y-2 ${isDark ? 'bg-[#0C1118] border-white/6' : 'bg-slate-50 border-slate-300'}`}>
                                                {[...Array(5)].map((_, i) => <Skeleton key={i} isDark={isDark} h="h-3" />)}
                                            </div>
                                        )}

                                        <div className="mt-auto flex flex-col gap-2">
                                            <button
                                                onClick={handleAiAnalysis}
                                                disabled={loadingAi}
                                                className={`w-full h-10 rounded-xl flex items-center justify-center gap-2 font-bold text-xs transition-all active:scale-95 ${
                                                    loadingAi
                                                        ? 'bg-slate-200 text-slate-500 dark:bg-white/8 dark:text-slate-400 cursor-not-allowed'
                                                        : 'bg-violet-600 hover:bg-violet-700 text-white'
                                                }`}
                                            >
                                                <BrainCircuit size={16} className={loadingAi ? 'animate-spin' : ''} />
                                                {loadingAi ? t('analyzing') : (aiSignal ? t('updateAnalysis') : t('analyzeSignal'))}
                                            </button>
                                            <button
                                                onClick={() => setIsChatOpen(true)}
                                                className={`w-full h-10 rounded-xl flex items-center justify-center gap-2 font-bold text-xs transition-all active:scale-95 border ${T.accentOutline(isDark)}`}
                                            >
                                                <Cpu size={15} />
                                                {t('askAiAboutCoin')}
                                            </button>
                                        </div>
                                    </div>

                                    {/* CỘT 2: AI REPORT */}
                                    <div className={`lg:col-span-6 relative ${isDark ? 'lg:border-l lg:border-r lg:px-5 border-white/8' : 'lg:border-l lg:border-r lg:px-5 border-slate-500 col-seam'}`}>
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-1.5">
                                                <Database size={13} className="text-blue-400" />
                                                <span className={`text-xs font-bold ${T.textBody(isDark)}`}>{t('aiAnalysisReport')}</span>
                                            </div>
                                            {aiSignal?.timestamp && (
                                                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-md border flex items-center gap-1 ${isDark ? 'bg-white/4 border-white/8 text-slate-400' : 'bg-slate-50 border-slate-300 text-slate-500'}`}>
                                                    <Clock size={9} />
                                                    {new Date(aiSignal.timestamp).toLocaleString('vi-VN')}
                                                </span>
                                            )}
                                        </div>

                                        {/* Loading overlay */}
                                        {loadingAi && aiSignal && (
                                            <div className={`absolute inset-0 z-10 flex flex-col items-center justify-center rounded-xl border border-violet-500/20 ${isDark ? 'bg-black/50' : 'bg-white/70'} backdrop-blur-sm`}>
                                                <BrainCircuit size={28} className="animate-spin text-violet-500 mb-2" />
                                                <span className="text-xs font-semibold text-violet-500">{t('compilingData')}</span>
                                            </div>
                                        )}

                                        <div className={`transition-opacity duration-300 ${loadingAi ? 'opacity-30' : 'opacity-100'}`}>
                                            {aiSignal ? (
                                                <div className="space-y-3">
                                                    <div className={`p-4 rounded-xl border ${isDark ? 'bg-[#0C1118] border-white/6' : 'bg-white border-slate-300'}`}>
                                                        <p className={`text-[10px] font-bold text-violet-500 mb-1.5 uppercase tracking-wider`}>{t('techMacroAnalysis')}</p>
                                                        <p className={`text-xs leading-relaxed ${T.textBody(isDark)}`}>{aiSignal.tech_analysis}</p>
                                                        <div className={`h-px my-3 ${isDark ? 'bg-white/8' : 'bg-slate-200'}`} />
                                                        <p className={`text-xs leading-relaxed ${T.textBody(isDark)}`}>{aiSignal.macro_analysis}</p>
                                                    </div>
                                                    <div className={`p-3 rounded-xl border ${isDark ? 'bg-violet-500/8 border-violet-500/20' : 'bg-violet-50 border-violet-200'}`}>
                                                        <p className="text-[10px] font-bold text-violet-500 mb-1 uppercase tracking-wider">{t('proposedStrategy')}</p>
                                                        <p className={`text-xs font-medium ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{aiSignal.advice}</p>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className={`h-40 flex flex-col items-center justify-center rounded-xl border-2 border-dashed ${isDark ? 'border-white/8' : 'border-slate-300'}`}>
                                                    <BrainCircuit size={32} className={`mb-2 ${T.textMute(isDark)} opacity-30`} />
                                                    <p className={`text-xs font-medium ${T.textMute(isDark)}`}>{t('noReportYet')}</p>
                                                    <p className={`text-[10px] ${T.textMute(isDark)} mt-0.5`}>{t('pressAnalyzeHint')}</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* CỘT 3: TÍN HIỆU GIAO DỊCH */}
                                    <div className={`lg:col-span-3 flex flex-col gap-3 transition-opacity duration-300 ${loadingAi ? 'opacity-30 pointer-events-none' : ''}`}>
                                        <div className="flex items-center gap-1.5">
                                            <TrendingUp size={13} className="text-emerald-400" />
                                            <span className={`text-xs font-bold ${T.textBody(isDark)}`}>{t('tradeSignal')}</span>
                                        </div>

                                        {/* Signal badge */}
                                        <div className={`p-3 rounded-xl text-center font-bold text-sm border ${
                                            aiSignal?.signal === 'LONG'  ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400' :
                                            aiSignal?.signal === 'SHORT' ? 'bg-red-500/10 border-red-500/25 text-red-400' :
                                                                           'bg-amber-500/10 border-amber-500/25 text-amber-400'
                                        }`}>
                                            {aiSignal ? `${aiSignal.signal} (${aiSignal.confidence})` : t('observe')}
                                        </div>

                                        {/* Entry / SL / TP / Horizon */}
                                        <div className="flex flex-col gap-1.5">
                                            {[
                                                { label: t('entryPoint'), val: aiSignal?.entry || '-', color: T.textBody(isDark), help: t('helpEntry') },
                                                { label: t('stopLossSl'),      val: aiSignal?.sl || '-',    color: T.bear,            help: t('helpSl') },
                                                { label: t('takeProfitTp'),    val: aiSignal?.tp || '-',    color: T.bull,            help: t('helpTp') },
                                                { label: t('horizon'),val: aiSignal?.horizon || '-',color: 'text-blue-400',  help: t('helpHorizon') },
                                            ].map(({ label, val, color, help }) => (
                                                <div
                                                    key={label}
                                                    className={`px-3 py-2.5 rounded-lg border flex items-center justify-between gap-2 ${isDark ? 'bg-[#0C1118] border-white/6' : 'bg-white border-slate-300'}`}
                                                >
                                                    <div className="flex items-center gap-1">
                                                        <p className={`text-[10px] font-medium ${T.textMute(isDark)}`}>{label}</p>
                                                        <div className="group relative">
                                                            <HelpCircle size={10} className={`cursor-help opacity-40 hover:opacity-100 ${T.textMute(isDark)} transition-opacity`} />
                                                            <div className={`absolute left-0 bottom-5 w-52 p-2.5 rounded-lg shadow-xl z-50 text-xs leading-relaxed border opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity ${isDark ? 'bg-[#1C2530] text-slate-300 border-white/10' : 'bg-white text-slate-600 border-slate-300'}`}>
                                                                {help}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <p className={`font-mono font-bold text-xs ${color}`}>{val}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </Panel>

                        {/* ════════════════════════════════════════
                            TIN TỨC CRYPTO (Collapsible)
                        ════════════════════════════════════════ */}
                        <Panel isDark={isDark} className="overflow-hidden">
                            <button
                                onClick={() => setShowNewsPanel(v => !v)}
                                className={`w-full flex items-center justify-between px-4 py-3.5 transition-colors ${isDark ? 'hover:bg-white/4' : 'hover:bg-slate-50'}`}
                            >
                                <div className="flex items-center gap-2.5">
                                    <Newspaper size={15} className="text-violet-500" />
                                    <span className={`text-sm font-bold ${T.textBody(isDark)}`}>
                                        {t('marketNewsFor', { symbol })}
                                    </span>
                                    {cryptoNews.length > 0 && (
                                        <span className={`text-[10px] font-bold ${T.accent} ${T.accentBg} px-1.5 py-0.5 rounded-full border ${T.accentBorder}`}>
                                            {t('newsCount', { count: cryptoNews.length })}
                                        </span>
                                    )}
                                    {loadingNews && <RefreshCw size={12} className={`animate-spin ${T.accent}`} />}
                                </div>
                                <div className="flex items-center gap-2">
                                    {cryptoNews.length === 0 && !loadingNews && (
                                        <span className={`text-[10px] ${T.textMute(isDark)}`}>{t('updatingData')}</span>
                                    )}
                                    {showNewsPanel
                                        ? <ChevronUp size={15} className={T.textMute(isDark)} />
                                        : <ChevronDown size={15} className={T.textMute(isDark)} />
                                    }
                                </div>
                            </button>

                            {showNewsPanel && (
                                <div className="px-4 pb-4">
                                    {cryptoNews.length > 0 ? (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[480px] overflow-y-auto pr-1"
                                            style={{ scrollbarWidth: 'thin' }}>
                                            {cryptoNews.map((n, i) => (
                                                <NewsCard key={i} news={n} isDark={isDark} />
                                            ))}
                                        </div>
                                    ) : (
                                        <div className={`flex flex-col items-center justify-center py-10 rounded-xl border-2 border-dashed ${isDark ? 'border-white/8' : 'border-slate-300'}`}>
                                            <AlertTriangle size={24} className="text-amber-400 mb-2 opacity-50" />
                                            <p className={`text-xs font-medium text-center ${T.textMute(isDark)}`}>
                                                {loadingNews ? t('loadingNews') : t('noNewsFor', { symbol })}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </Panel>

                    </div>
                </main>
            </div>

            {/* AI CHAT MODAL */}
            <StockAiChat
                isOpen={isChatOpen}
                onClose={() => setIsChatOpen(false)}
                ticker={symbol}
                companyName={allCryptos.find(c => c.symbol === symbol)?.name || symbol}
                aiReport={aiSignal ? `Phân tích kỹ thuật: ${aiSignal.tech_analysis}\n\nVĩ mô: ${aiSignal.macro_analysis}\n\nChiến lược: ${aiSignal.advice}` : null}
                isDark={isDark}
                assetType="crypto"
            />
        </div>
    );
}