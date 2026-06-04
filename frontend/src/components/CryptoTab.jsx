// import require
import axios from 'axios';

// ============================================================
  // Props nhận vào: { isDark, UI, addLog, allCryptos }
// ============================================================
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import TradingChart from './TradingChart';
import StockAiChat from './StockAiChat';
import {
    Search, Activity, Zap, BarChart3, TrendingUp, TrendingDown,
    BrainCircuit, HelpCircle, RefreshCw, Globe, Database,
    Newspaper, ChevronDown, ChevronUp, ExternalLink, AlertTriangle
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────
// HELPER: Format số
// ─────────────────────────────────────────────────────────────
const fmt = (n, dec = 2) => n != null && !isNaN(n) ? Number(n).toFixed(dec) : '---';
const fmtUSD = (n) => n != null && !isNaN(n)
    ? `$${Number(n) >= 1 ? Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : Number(n).toFixed(6)}`
    : '---';
const fmtLarge = (n) => {
    if (!n || isNaN(n)) return '---';
    if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
    if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
    return `$${Number(n).toLocaleString()}`;
};
const fmtPct = (n) => {
    if (n == null || isNaN(n)) return '---';
    return `${Number(n) >= 0 ? '+' : ''}${Number(n).toFixed(2)}%`;
};

// ─────────────────────────────────────────────────────────────
// SUB-COMPONENT: StatRow 
// ─────────────────────────────────────────────────────────────
function StatRow({ label, value, color = '', isDark, UI }) {
    return (
        <div className={`flex justify-between items-center py-2 border-b ${isDark ? 'border-white/5' : 'border-slate-100'} last:border-0`}>
            <span className={`text-[10px] font-bold uppercase tracking-wider ${UI.textMuted}`}>{label}</span>
            <span className={`text-[11px] font-black font-mono ${color || UI.textBold}`}>{value}</span>
        </div>
    );
}
// Giao diện thanh Bull/Bear
function SentimentBar({ score, isDark, UI }) {
     const bullPct = Math.min(Math.max(Math.round(score), 0), 100);
    const bearPct = 100 - bullPct;

    return (
        <div className="flex flex-col gap-2 w-full max-w-[200px]">
             <div className="flex items-center justify-between text-sm font-black">
                <span className="text-emerald-500 flex items-center gap-1">
                    <TrendingUp size={16} /> {bullPct}%
                </span>
                <span className="text-red-500 flex items-center gap-1">
                    {bearPct}% <TrendingDown size={16} />
                </span>
            </div>
            
             <div className={`flex h-3 w-full rounded-md overflow-hidden ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`}>
                {bullPct > 0 && (
                    <div 
                        className="bg-emerald-500 transition-all duration-700 shadow-[0_0_8px_rgba(16,185,129,0.5)]" 
                        style={{ width: `${bullPct}%` }} 
                    />
                )}
                {bearPct > 0 && (
                    <div 
                        className="bg-red-500 transition-all duration-700" 
                        style={{ width: `${bearPct}%` }} 
                    />
                )}
            </div>
            <p className={`text-[9px] font-bold text-center mt-1 uppercase tracking-widest ${UI.textMuted}`}>
                Hệ thống đánh giá
            </p>
        </div>
    );
}
// ─────────────────────────────────────────────────────────────
// SUB-COMPONENT: SectionLabel 
// ─────────────────────────────────────────────────────────────
function SectionLabel({ children, isDark, UI }) {
    return (
        <p className={`text-[9px] font-black uppercase tracking-[0.2em] mb-3 ${UI.textMuted}`}>{children}</p>
    );
}

// ─────────────────────────────────────────────────────────────
// SUB-COMPONENT: Fear & Greed Gauge  
// ─────────────────────────────────────────────────────────────
function FearGreedGauge({ value, labelVi, isDark, UI }) {
    const getStyle = (v) => {
        if (v <= 25) return { ring: 'border-red-500', text: 'text-red-500', bar: 'bg-red-500', label: 'Cực kỳ sợ hãi' };
        if (v <= 45) return { ring: 'border-orange-400', text: 'text-orange-400', bar: 'bg-orange-400', label: 'Sợ hãi' };
        if (v <= 55) return { ring: 'border-yellow-400', text: 'text-yellow-400', bar: 'bg-yellow-400', label: 'Trung lập' };
        if (v <= 75) return { ring: 'border-lime-400', text: 'text-lime-400', bar: 'bg-lime-400', label: 'Tham lam' };
        return { ring: 'border-emerald-400', text: 'text-emerald-400', bar: 'bg-emerald-400', label: 'Tham lam cực độ' };
    };
    const s = getStyle(value || 50);
    return (
        <div className="flex items-center gap-4">
            <div className={`w-[72px] h-[72px] rounded-full border-[6px] flex items-center justify-center shrink-0 ${s.ring} ${isDark ? 'bg-black/40' : 'bg-slate-50'}`}>
                <span className={`text-2xl font-black ${s.text}`}>{value ?? '?'}</span>
            </div>
            <div className="flex-1">
                <p className={`font-black text-sm ${s.text}`}>{labelVi || s.label}</p>
                <p className={`text-[9px] font-bold mt-0.5 ${UI.textMuted}`}>Nguồn: alternative.me</p>
                <div className={`mt-2 h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-white/10' : 'bg-slate-200'}`}>
                    <div className={`h-full rounded-full transition-all duration-700 ${s.bar}`} style={{ width: `${value ?? 50}%` }} />
                </div>
                <div className={`flex justify-between mt-0.5 text-[9px] font-bold ${UI.textMuted}`}>
                    <span>Cực sợ</span><span>Tham lam</span>
                </div>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// SUB-COMPONENT: Confluence Score Ring  
// ─────────────────────────────────────────────────────────────
function ConfluenceRing({ score, isDark }) {
    const getC = (s) => {
        if (s >= 68) return { ring: 'border-emerald-500', text: 'text-emerald-500', bg: 'bg-emerald-500/10 border-emerald-500/30', label: 'BULLISH STRONG' };
        if (s >= 55) return { ring: 'border-emerald-400', text: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-400/30', label: 'BULLISH BIAS' };
        if (s <= 32) return { ring: 'border-red-500', text: 'text-red-500', bg: 'bg-red-500/10 border-red-500/30', label: 'BEARISH STRONG' };
        if (s <= 45) return { ring: 'border-red-400', text: 'text-red-400', bg: 'bg-red-500/10 border-red-400/30', label: 'BEARISH BIAS' };
        return { ring: 'border-yellow-400', text: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-400/30', label: 'SIDEWAY' };
    };
    const c = getC(score);
    return (
        <div className="flex flex-col items-center gap-2 shrink-0">
            <div className={`w-[64px] h-[64px] rounded-full border-4 flex items-center justify-center ${c.ring} ${isDark ? 'bg-black/30' : 'bg-slate-50'}`}>
                <span className={`text-xl font-black ${c.text}`}>{score}</span>
            </div>
            <div className={`px-2 py-0.5 rounded-full text-[9px] font-black tracking-widest border ${c.bg} ${c.text}`}>{c.label}</div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// SUB-COMPONENT: Volume Profile 
// ─────────────────────────────────────────────────────────────
function CryptoVolumeProfile({ bins, maxVol, pocPrice, isDark, UI }) {
    if (!bins || bins.length === 0) return (
        <div className="flex flex-col items-center justify-center py-8 opacity-50">
            <Activity size={24} className="animate-pulse text-purple-400 mb-2" />
            <p className={`text-[9px] font-black uppercase tracking-widest ${UI.textMuted}`}>ĐANG TÍNH POC...</p>
        </div>
    );
    return (
        <div className="flex flex-col gap-1.5 flex-1">
            {bins.map((bin, i) => {
                const isPOC = String(bin.priceCenter) === String(pocPrice);
                const w = maxVol > 0 ? (bin.volume / maxVol) * 100 : 0;
                return (
                    <div key={i} className="flex items-center gap-2">
                        <span className={`text-[9px] font-mono w-[64px] text-right shrink-0 ${isPOC ? 'text-purple-400 font-black' : UI.textMuted}`}>
                            {Number(bin.priceCenter) > 1
                                ? Number(bin.priceCenter).toLocaleString('en-US', { maximumFractionDigits: 0 })
                                : Number(bin.priceCenter).toFixed(5)
                            }
                        </span>
                        <div className={`flex-1 h-3 rounded-sm overflow-hidden ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`}>
                            <div
                                className={`h-full transition-all duration-500 ${isPOC ? 'bg-purple-500 shadow-[0_0_6px_rgba(168,85,247,0.6)]' : 'bg-purple-500/35'}`}
                                style={{ width: `${w}%` }}
                            />
                        </div>
                        {isPOC && <span className="text-[9px] text-purple-400 font-black">◀</span>}
                    </div>
                );
            })}
            <p className="text-[10px] font-bold text-purple-400 mt-2 text-center italic">
                Vùng POC (Kẹt lệnh): {Number(pocPrice) > 1
                    ? Number(pocPrice).toLocaleString('en-US', { maximumFractionDigits: 0 })
                    : Number(pocPrice).toFixed(5)}
            </p>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// SUB-COMPONENT: News Card
// ─────────────────────────────────────────────────────────────
function NewsCard({ news, isDark, UI }) {
    const sentimentColor = {
        positive: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
        negative: 'text-red-400 bg-red-500/10 border-red-500/30',
        neutral: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30'
    }[news.sentiment] || 'text-slate-400 bg-slate-500/10 border-slate-500/30';

    return (
        <a href={news.link || '#'} target="_blank" rel="noopener noreferrer"
            className={`block p-3 rounded-xl border transition-all ${isDark ? 'bg-black/30 border-white/5 hover:border-purple-500/40 hover:bg-purple-500/5' : 'bg-white border-slate-200 hover:border-purple-300 hover:bg-purple-50/50'}`}
        >
            <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                    <p className={`text-[11px] font-bold leading-snug line-clamp-2 ${UI.textBold}`}>{news.title}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${sentimentColor}`}>
                            {news.sentiment === 'positive' ? '▲ Tích cực' : news.sentiment === 'negative' ? '▼ Tiêu cực' : '● Trung lập'}
                        </span>
                        <span className={`text-[9px] ${UI.textMuted}`}>{news.source || 'CryptoNews'}</span>
                        <span className={`text-[9px] ${UI.textMuted}`}>{news.time || ''}</span>
                    </div>
                </div>
                <ExternalLink size={12} className={`shrink-0 mt-0.5 ${UI.textMuted}`} />
            </div>
        </a>
    );
}

// ─────────────────────────────────────────────────────────────
// MAIN EXPORT: CryptoTab
// Props: { isDark, UI, addLog, allCryptos }
// ─────────────────────────────────────────────────────────────
export default function CryptoTab({ isDark, UI, addLog = [] }) {

    // ── STATE: TÌM KIẾM & SYMBOL ──
    const [allCryptos, setAllCryptos] = useState([]);
    const [searchInput, setSearchInput] = useState('BTC');
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [symbol, setSymbol] = useState('BTC');
    const [cryptoInterval, setCryptoInterval] = useState('1 ngày');

    // ── STATE: DATA ── NEWS
    const [chartData, setChartData] = useState(null);
    const [priceData, setPriceData] = useState(null);   // { currentPrice, change24h, volume24h, high24h, low24h, technicals, volProfile, orderbookImbalance, cvd }
    const [radarData, setRadarData] = useState(null);   // { fearGreed, dominance, globalMarket }
    const [topMovers, setTopMovers] = useState(null);
    const [fundingData, setFundingData] = useState(null);
    const [cryptoNews, setCryptoNews] = useState([]);   

    // ── STATE: LOADING ──
    const [loadingChart, setLoadingChart] = useState(false);
    const [loadingPrice, setLoadingPrice] = useState(false);
    const [loadingRadar, setLoadingRadar] = useState(false);
    const [loadingNews, setLoadingNews] = useState(false);
    // ── STATE: AI SIGNAL ──
    const [aiSignal, setAiSignal] = useState(null);
    const [loadingAi, setLoadingAi] = useState(false);
    const [isChatOpen, setIsChatOpen] = useState(false);

    // ── STATE: UI TOGGLES ──
    const [showVolInfo, setShowVolInfo] = useState(false);
    const [showOBInfo, setShowOBInfo] = useState(false);
    const [showNewsPanel, setShowNewsPanel] = useState(true);
    const [tradeMsg, setTradeMsg] = useState('');
    const [mobileTab, setMobileTab] = useState('chart');

    // ── STATE: DEMO TRADING ──
    const [balance, setBalance] = useState(10000); 
    const [positions, setPositions] = useState([]);   
    const [tradeQty, setTradeQty] = useState('0.01');

    const searchRef = useRef(null);

    // Intervals (  )
    const INTERVALS = ['5 phút', '15 phút', '1 giờ', '4 giờ', '1 ngày', '1 tuần'];
    const QUICK_COINS = ['BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'DOGE', 'AVAX', 'ADA', 'MATIC', 'LINK'];
    // Convert unit
    const [currUnit, setCurrUnit] = useState('USD');
    // TẢI DATA COINSYMBOLS
    useEffect(() => {
        axios.get('/api/crypto-symbols')
            .then(res => setAllCryptos(res.data))
            .catch(err => console.error("Lỗi tải danh sách coin:", err));
    }, []);
    // ───────────────────────────────────────────────────
    // FILTER GỢI Ý (dùng allCryptos từ App.jsx)
    // ───────────────────────────────────────────────────
    useEffect(() => {
        if (!searchInput.trim()) { setSuggestions([]); return; }
        const kw = searchInput.toUpperCase().trim();
        setSuggestions(
            allCryptos
                .filter(c => c.symbol?.toUpperCase().includes(kw) || c.name?.toUpperCase().includes(kw))
                .slice(0, 8)
        );
    }, [searchInput, allCryptos]);
    // ───────────────────────────────────────────────────
    // ACTIONS: Gọi AI phân tích tín hiệu
    // ───────────────────────────────────────────────────
    const handleAiAnalysis = async () => {
        if (!priceData || !symbol) return;
        setLoadingAi(true);
        try {
            const coinFunding = fundingData?.rates?.find(r => r.symbol === symbol)?.fundingRate || 0;
            const payload = {
                symbol: symbol,
                currentPrice: priceData.currentPrice,
                technicalScore: priceData.technicals?.score || 50,
                techDetails: priceData.technicals, // Gửi chi tiết RSI, MACD...
                derivatives: { fundingRate: coinFunding, longPercent: 50, shortPercent: 50 },
                newsList: cryptoNews
            };
            const res = await axios.post('/api/crypto/signal', payload);
            if (res.data.success) setAiSignal(res.data.data);
        } catch (error) { addLog("[LỖI] Lỗi AI: " + error.message); }
        finally { setLoadingAi(false); }
    };
    // ───────────────────────────────────────────────────
    // FETCH: Radar (Fear & Greed + Dominance + Global)
    // ───────────────────────────────────────────────────
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

    // ───────────────────────────────────────────────────
    // FETCH: Chart + Price + Technicals
    // ───────────────────────────────────────────────────
    const fetchCoin = useCallback(async (sym, intv) => {
        if (!sym) return;
        setLoadingChart(true);
        setLoadingPrice(true);
        addLog(`[CRYPTO] Đang tải ${sym} | Khung: ${intv}...`);
        try {
            // Song song 2 request
            const [chartRes, priceRes] = await Promise.all([
                axios.get(`/api/crypto/history/${sym}?interval=${intv}`).catch(() => null),
                axios.get(`/api/crypto/price/${sym}?interval=${intv}`).catch(() => null)
            ]);
            if (chartRes?.data?.success && chartRes.data.data?.length > 0) {
                 const raw = chartRes.data.data;
                const candles = Array.isArray(raw) ? raw : raw.chartData || [];
                setChartData(candles);
                addLog(`[CRYPTO] Chart ${sym}: ${candles.length} nến`);
            }
            if (priceRes?.data?.success) {
                const d = priceRes.data.data;
                setPriceData(d);
                
                if (d.lastSignal) {
                    setAiSignal(d.lastSignal); 
                } else {
                    setAiSignal(null); 
                }

                addLog(`[CRYPTO] Giá ${sym}: $${d.currentPrice?.toLocaleString()} | Score: ${d.technicals?.score ?? '--'}`);
            }
        } catch (e) {
            addLog(`[LỖI] Lỗi tải ${sym}: ${e.message}`);
        } finally {
            setLoadingChart(false);
            setLoadingPrice(false);
        }
    }, [addLog]);

    // ───────────────────────────────────────────────────
    // FETCH: Top Movers
    // ───────────────────────────────────────────────────
    const fetchMovers = useCallback(async () => {
        try {
            const res = await axios.get('/api/crypto/top-movers');
            if (res.data.success) setTopMovers(res.data.data);
        } catch (e) { /* silent */ }
    }, []);

    // ───────────────────────────────────────────────────
    // FETCH: Funding Rates
    // ───────────────────────────────────────────────────
    const fetchFunding = useCallback(async () => {
        try {
            const res = await axios.get('/api/crypto/funding');
            if (res.data.success) setFundingData(res.data.data);
        } catch (e) { /* silent */ }
    }, []);

    // ───────────────────────────────────────────────────
    // FETCH: News 
    // ───────────────────────────────────────────────────
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

    // ───────────────────────────────────────────────────
    // EFFECTS
    // ───────────────────────────────────────────────────
    useEffect(() => {
        fetchRadar();
        fetchMovers();
        fetchFunding();
        const radarTimer = setInterval(fetchRadar, 5 * 60 * 1000);
        const moversTimer = setInterval(fetchMovers, 2 * 60 * 1000);
        return () => { clearInterval(radarTimer); clearInterval(moversTimer); };
    }, []);

    useEffect(() => {
        fetchCoin(symbol, cryptoInterval);
        fetchNews(symbol);
    }, [symbol, cryptoInterval]);

    // Close gợi ý khi click ngoài
    useEffect(() => {
        const handler = (e) => { if (!searchRef.current?.contains(e.target)) setShowSuggestions(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // ───────────────────────────────────────────────────
    // ACTIONS: Chọn coin
    // ───────────────────────────────────────────────────
    const selectCoin = (sym) => {
        const s = sym.toUpperCase().trim();
        setSymbol(s);
        setSearchInput(s);
        setShowSuggestions(false);
    };

    // ───────────────────────────────────────────────────
    // COMPUTED: Technicals shorthand
    // ───────────────────────────────────────────────────
    const tech = priceData?.technicals;
    const volProf = priceData?.volProfile;
    const ob = priceData?.orderbookImbalance;
    const px = priceData?.currentPrice;
    const ch24 = priceData?.change24h;

    const totalPnL = useMemo(() => positions.reduce((sum, pos) => {
        const cur = pos.symbol === symbol ? (px || pos.entry) : pos.entry;
        return sum + (cur - pos.entry) * pos.qty;
    }, 0), [positions, px, symbol]);

    // ───────────────────────────────────────────────────
    // RENDER
    // ───────────────────────────────────────────────────
    return (
        <div className={`flex flex-col w-full h-full overflow-hidden animate-in zoom-in-95 duration-500 ${isDark ? 'bg-[#05080C]' : 'bg-slate-50'}`}>
            
            {/* MOBILE TABS */}
            <div className={`lg:hidden flex w-full border-b shrink-0 ${isDark ? 'bg-[#080C11] border-white/10' : 'bg-slate-50 border-slate-200'} z-50`}>
                <button onClick={() => setMobileTab('radar')} className={`flex-1 py-3.5 text-[11px] font-black uppercase tracking-widest border-b-[3px] transition-colors ${mobileTab === 'radar' ? 'border-purple-500 text-purple-500 bg-purple-500/10' : 'border-transparent text-slate-500 hover:text-slate-400'}`}>Radar</button>
                <button onClick={() => setMobileTab('chart')} className={`flex-1 py-3.5 text-[11px] font-black uppercase tracking-widest border-b-[3px] transition-colors ${mobileTab === 'chart' ? 'border-purple-500 text-purple-500 bg-purple-500/10' : 'border-transparent text-slate-500 hover:text-slate-400'}`}>Market & AI</button>
            </div>

            <div className="flex-1 flex flex-row w-full min-h-0 overflow-hidden relative">

            {/* ═══════════════════════════════════════════════
                CỘT TRÁI: CRYPTO RADAR
             ═══════════════════════════════════════════════ */}
            <div className={`${mobileTab === 'radar' ? 'flex' : 'hidden'} lg:flex w-full lg:w-[300px] shrink-0 border-r flex-col overflow-y-auto custom-scrollbar transition-colors duration-300 ${UI.leftCol} ${isDark ? 'border-white/5' : 'border-slate-200'}`}>

                {/* HEADER CỘT TRÁI */}
                <div className={`h-11 border-b shrink-0 flex items-center px-4 gap-2 sticky top-0 z-10 ${isDark ? 'bg-[#080C11] border-white/5' : 'bg-slate-100 border-slate-200'}`}>
                    <Globe size={14} className="text-purple-400" />
                    <span className={`text-[9px] font-black uppercase tracking-[0.2em] ${UI.textMuted}`}>Crypto Market Radar</span>
                    <button
                        onClick={() => { fetchRadar(); fetchMovers(); fetchFunding(); }}
                        className={`ml-auto p-1.5 rounded-lg transition-all ${isDark ? 'hover:bg-white/5' : 'hover:bg-slate-200'}`}
                        title="Làm mới"
                    >
                        <RefreshCw size={12} className={`${loadingRadar ? 'animate-spin text-purple-400' : UI.textMuted}`} />
                    </button>
                </div>

                <div className="p-4 flex flex-col gap-5 pb-16">

                    {/* 1. FEAR & GREED */}
                    <div className={`p-4 rounded-3xl border ${isDark ? 'bg-[#0A0E14] border-white/10' : 'bg-white border-slate-200 shadow-sm'}`}>
                        <SectionLabel isDark={isDark} UI={UI}>CHỈ SỐ SỢ HÃI & THAM LAM</SectionLabel>
                        <FearGreedGauge
                            value={radarData?.fearGreed?.value ?? 50}
                            labelVi={radarData?.fearGreed?.labelVi}
                            isDark={isDark} UI={UI}
                        />
                    </div>

                    {/* 2. BTC DOMINANCE */}
                    <div className={`p-4 rounded-3xl border ${isDark ? 'bg-[#0A0E14] border-white/10' : 'bg-white border-slate-200 shadow-sm'}`}>
                        <SectionLabel isDark={isDark} UI={UI}>Dominance & BTC.D</SectionLabel>
                        <StatRow label="BTC Dominance" value={radarData?.dominance?.btc ? `${radarData.dominance.btc}%` : '---'} color="text-yellow-400" isDark={isDark} UI={UI} />
                        <StatRow label="ETH Dominance" value={radarData?.dominance?.eth ? `${radarData.dominance.eth}%` : '---'} color="text-blue-400" isDark={isDark} UI={UI} />
                        <StatRow label="Altcoin Season" value={radarData?.dominance?.altSeason || '---'} color="text-purple-400" isDark={isDark} UI={UI} />
                        {radarData?.globalMarket && <>
                            <StatRow label="Tổng vốn hóa" value={radarData.globalMarket.totalMarketCap} isDark={isDark} UI={UI} />
                            <StatRow label="Volume 24h" value={radarData.globalMarket.volume24h} isDark={isDark} UI={UI} />
                            <StatRow label="Thay đổi 24h"
                                value={radarData.globalMarket.marketCapChangePercent ? fmtPct(radarData.globalMarket.marketCapChangePercent) : '---'}
                                color={parseFloat(radarData.globalMarket.marketCapChangePercent) >= 0 ? 'text-emerald-400' : 'text-red-400'}
                                isDark={isDark} UI={UI}
                            />
                        </>}
                    </div>

                    {/* 3. FUNDING RATES */}
                    {fundingData && (
                        <div className={`p-4 rounded-3xl border ${isDark ? 'bg-[#0A0E14] border-white/10' : 'bg-white border-slate-200 shadow-sm'}`}>
                            <SectionLabel isDark={isDark} UI={UI}>Funding Rate (Futures)</SectionLabel>
                            {fundingData.rates?.slice(0, 5).map(r => (
                                <StatRow key={r.symbol} label={r.symbol}
                                    value={`${r.fundingRate > 0 ? '+' : ''}${r.fundingRate}%`}
                                    color={r.fundingRate > 0 ? 'text-emerald-400' : r.fundingRate < 0 ? 'text-red-400' : 'text-slate-400'}
                                    isDark={isDark} UI={UI}
                                />
                            ))}
                            <div className={`mt-2 pt-2 border-t ${isDark ? 'border-white/5' : 'border-slate-100'}`}>
                                <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${fundingData.avgFunding > 0.01 ? 'bg-emerald-500/20 text-emerald-400' : fundingData.avgFunding < -0.005 ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                                    {fundingData.marketBias}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* 4. TOP MOVERS */}
                    {topMovers && (
                        <div className={`p-4 rounded-3xl border ${isDark ? 'bg-[#0A0E14] border-white/10' : 'bg-white border-slate-200 shadow-sm'}`}>
                            <SectionLabel isDark={isDark} UI={UI}>Top Movers 24h</SectionLabel>
                            <div className="flex flex-col gap-1.5">
                                {[...(topMovers.gainers || []).slice(0, 3), ...(topMovers.losers || []).slice(0, 3)].map(coin => (
                                    <button key={coin.symbol}
                                        onClick={() => selectCoin(coin.symbol)}
                                        className={`flex items-center justify-between p-2 rounded-xl border transition-all ${symbol === coin.symbol ? 'border-purple-500 bg-purple-500/10' : isDark ? 'border-white/5 hover:bg-white/5' : 'border-slate-100 hover:bg-slate-50'}`}
                                    >
                                        <span className={`text-[11px] font-black ${UI.textBold}`}>{coin.symbol}</span>
                                        <span className={`text-[11px] font-black font-mono ${coin.change >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                            {fmtPct(coin.change)}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                    {/* 5. ON-CHAIN SNIPPET  */}
                    {priceData && (
                        <div className={`p-4 rounded-3xl border ${isDark ? 'bg-[#0A0E14] border-white/10' : 'bg-white border-slate-200 shadow-sm'}`}>
                            <SectionLabel isDark={isDark} UI={UI}>On-chain & Market</SectionLabel>
                            <StatRow label="ATH" value={fmtUSD(priceData.ath)} isDark={isDark} UI={UI} />
                            <StatRow label="ATH Change" value={fmtPct(priceData.athChange)} color={parseFloat(priceData.athChange) >= 0 ? 'text-emerald-400' : 'text-red-400'} isDark={isDark} UI={UI} />
                            <StatRow label="Vốn hóa" value={fmtLarge(priceData.marketCap)} isDark={isDark} UI={UI} />
                            <StatRow label="Lưu hành" value={priceData.circulatingSupply ? `${Number(priceData.circulatingSupply).toLocaleString('en-US', { maximumFractionDigits: 0 })} ${symbol}` : '---'} isDark={isDark} UI={UI} />
                            {priceData.maxSupply > 0 && (
                                <>
                                    <StatRow label="Max Supply" value={Number(priceData.maxSupply).toLocaleString('en-US', { maximumFractionDigits: 0 })} isDark={isDark} UI={UI} />
                                    <div className={`mt-2 h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-white/10' : 'bg-slate-200'}`}>
                                        <div className="h-full bg-purple-500 rounded-full shadow-[0_0_6px_rgba(168,85,247,0.5)]"
                                            style={{ width: `${Math.min((priceData.circulatingSupply / priceData.maxSupply) * 100, 100)}%` }}
                                        />
                                    </div>
                                    <p className={`text-[9px] font-bold mt-1 text-right ${UI.textMuted}`}>
                                        {((priceData.circulatingSupply / priceData.maxSupply) * 100).toFixed(1)}% đã lưu hành
                                    </p>
                                </>
                            )}
                        </div>
                    )}
                </div>
                       </div>
            {/* ═══════════════════════════════════════════════
                CỘT GIỮA: CHART + SEARCH + AI ANALYSIS
            ═══════════════════════════════════════════════ */}
            <div className={`${mobileTab === 'chart' ? 'flex' : 'hidden'} lg:flex flex-1 flex-col overflow-y-auto custom-scrollbar transition-colors duration-300 ${UI.rightCol}`}>

                {/* SEARCH BAR   */}
                <div className={`sticky top-0 z-30 shrink-0 px-4 sm:px-6 py-3 border-b z-[999] ${isDark ? 'bg-[#05080C]/95 border-white/5 backdrop-blur-xl' : 'bg-white/95 border-slate-200 backdrop-blur-xl shadow-sm'}`}>
                    <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 sm:gap-3" ref={searchRef}>
                        {/* Input tìm kiếm */}
                        <div className="relative flex-1 min-w-[200px] max-w-sm">
                            <Search size={16} className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${UI.textMuted}`} />
                            <input
                                type="text"
                                value={searchInput}
                                onChange={e => { setSearchInput(e.target.value.toUpperCase()); setShowSuggestions(true); }}
                                onKeyDown={e => { if (e.key === 'Enter') selectCoin(searchInput); }}
                                onFocus={() => setShowSuggestions(true)}
                                placeholder="Nhập mã coin: BTC, ETH, SOL..."
                                className={`w-full h-11 pl-10 pr-4 rounded-2xl border font-black text-sm outline-none transition-all
                                    ${isDark ? 'bg-black/50 border-white/10 text-purple-400 focus:border-purple-500/60 placeholder:text-slate-600'
                                    : 'bg-slate-50 border-slate-300 text-purple-600 focus:border-purple-400 placeholder:text-slate-400'}`}
                            />
                            {/* Dropdown gợi ý */}
                            {showSuggestions && suggestions.length > 0 && (
                                <div className={`absolute top-full mt-2 left-0 right-0 border rounded-2xl overflow-hidden shadow-2xl z-[999999] max-h-72 overflow-y-auto custom-scrollbar ${isDark ? 'bg-[#1a222e] border-white/10' : 'bg-white border-slate-300'}`}>
                                    {suggestions.map((coin, idx) => (
                                        <button key={idx}
                                            onClick={() => selectCoin(coin.symbol)}
                                            className={`w-full text-left px-4 py-2.5 flex items-center gap-3 border-b last:border-0 transition-all font-bold text-sm ${isDark ? 'border-white/5 hover:bg-white/5 text-slate-300' : 'border-slate-100 hover:bg-purple-50 text-slate-700'}`}
                                        >
                                            {coin.image && <img src={coin.image} alt={coin.symbol} className="w-6 h-6 rounded-full" onError={e => e.target.style.display='none'} />}
                                            <span className="font-black text-purple-400">{coin.symbol?.toUpperCase()}</span>
                                            <span className={`text-[11px] truncate ${UI.textMuted}`}>{coin.name}</span>
                                            {coin.rank && <span className={`ml-auto text-[9px] font-black ${UI.textMuted}`}>#{coin.rank}</span>}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Nút phân tích */}
                        <button
                            onClick={() => selectCoin(searchInput)}
                            className="h-11 px-4 sm:px-6 rounded-2xl bg-purple-600 hover:bg-purple-500 active:scale-95 text-white font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-purple-500/20 shrink-0"
                        >TÌM</button>

                        {/* Refresh */}
                        <button
                            onClick={() => fetchCoin(symbol, cryptoInterval)}
                            className={`h-11 w-11 rounded-2xl border flex items-center justify-center transition-all ${isDark ? 'border-white/10 hover:bg-white/5' : 'border-slate-300 hover:bg-slate-100'}`}
                        >
                            <RefreshCw size={15} className={loadingChart ? 'animate-spin text-purple-400' : UI.textMuted} />
                        </button>

                        {/* Quick-select interval */}
                        <div className="flex gap-1.5 ml-2">
                            {INTERVALS.map(intv => (
                                <button key={intv}
                                    onClick={() => setCryptoInterval(intv)}
                                    className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase border transition-all ${cryptoInterval === intv
                                        ? 'bg-purple-500/20 border-purple-500 text-purple-400'
                                        : isDark ? 'border-white/10 text-slate-500 hover:bg-white/5' : 'border-slate-200 text-slate-400 hover:bg-slate-100'
                                    }`}
                                >{intv}</button>
                            ))}
                        </div>
                    </div>

                    {/* Quick coins */}
                    <div className="flex gap-2 mt-2.5 flex-wrap">
                        {QUICK_COINS.map(c => (
                            <button key={c} onClick={() => selectCoin(c)}
                                className={`px-3 py-1 rounded-lg text-[10px] font-black border transition-all ${symbol === c
                                    ? 'bg-purple-500/20 border-purple-500 text-purple-400 shadow-sm shadow-purple-500/20'
                                    : isDark ? 'border-white/5 text-slate-500 hover:bg-white/5 hover:text-slate-300' : 'border-slate-200 text-slate-400 hover:bg-slate-50'
                                }`}
                            >{c}</button>
                        ))}
                    </div>
                </div>

                <div className="p-6 flex flex-col gap-6">

                    {/* PRICE HEADER */}
                    {priceData && (
                        <div className={`p-4 sm:p-6 rounded-[32px] border mb-6 transition-all ${isDark ? 'bg-[#10151C] border-white/5' : 'bg-white border-slate-200 shadow-sm'}`}>
                            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                                
                                {/* 1. LOGO, TÊN & MÔ TẢ */}
                                <div className="flex items-center gap-4 flex-1 min-w-0">
                                    <img 
                                        src={`https://assets.coincap.io/assets/icons/${symbol.toLowerCase()}@2x.png`} 
                                        alt={symbol} 
                                        className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-white/10 p-1 shadow-lg shrink-0 object-contain"
                                        onError={(e) => {
                                             if (!e.target.dataset.retried) {
                                                e.target.dataset.retried = 'true';
                                                e.target.src = `https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/128/color/${symbol.toLowerCase()}.png`;
                                            } else {
                                                 e.target.style.display = 'none';
                                            }
                                        }}
                                    />
                                    <div>
                                        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                                            <h1 className={`text-2xl sm:text-4xl font-black leading-none ${UI.textBold}`}>{symbol}</h1>
                                            <span className={`px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest ${isDark ? 'bg-white/10 text-white' : 'bg-black/10 text-black'}`}>
                                                {allCryptos.find(c => c.symbol === symbol)?.name || 'Digital Asset'}
                                            </span>
                                        </div>
                                        <p className={`text-[10px] italic mt-2 line-clamp-2 leading-relaxed ${UI.textMuted}`}>
                                            {allCryptos.find(c => c.symbol === symbol)?.description || "Nền tảng tài sản số phi tập trung được mã hóa trên công nghệ Blockchain..."}
                                        </p>
                                    </div>
                                </div>

                                {/* 2. GIÁ, THÔNG SỐ & CHUYỂN ĐỔI */}
                                <div className="flex flex-col items-start lg:items-end gap-3 shrink-0">
                                    {/* Giá & Biến động */}
                                    <div className="flex items-baseline gap-2 sm:gap-3">
                                        <span className={`text-2xl sm:text-4xl font-mono font-black ${UI.textBold}`}>
                                            {currUnit === 'USD' ? fmtUSD(px) : `₫ ${(px * 25450).toLocaleString('vi-VN')}`}
                                        </span>
                                        <span className={`text-lg font-black ${parseFloat(ch24) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                            {fmtPct(ch24)}
                                        </span>
                                    </div>
                                    
                                    {/* Vol H L & Converter */}
                                    <div className="flex items-center gap-3 flex-wrap justify-end">
                                        <div className="flex gap-2">
                                            {[
                                                { label: 'Vol 24h', val: priceData.volume24h },
                                                { label: 'H', val: fmtUSD(priceData.high24h) },
                                                { label: 'L', val: fmtUSD(priceData.low24h) },
                                            ].map(({ label, val }) => (
                                                <span key={label} className={`px-2 py-1 text-[9px] font-black rounded-lg ${isDark ? 'bg-white/5 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>
                                                    {label}: <span className={UI.textBold}>{val}</span>
                                                </span>
                                            ))}
                                        </div>
                                        
                                        <div className={`w-px h-5 mx-1 ${isDark ? 'bg-white/10' : 'bg-slate-300'}`}></div>

                                        {/* BỘ CHUYỂN ĐỔI TIỀN TỆ */}
                                        <div className="flex items-center gap-1.5">
                                            <input 
                                                type="number" 
                                                defaultValue="1" 
                                                className={`w-14 h-7 rounded text-center font-bold text-[10px] outline-none ${isDark ? 'bg-black/50 text-white border border-white/10 focus:border-purple-500' : 'bg-slate-100 text-black border border-slate-200 focus:border-purple-400'}`} 
                                            />
                                            <select 
                                                value={currUnit} 
                                                onChange={(e) => setCurrUnit(e.target.value)} 
                                                className={`h-7 rounded px-1.5 font-black text-[9px] outline-none cursor-pointer ${isDark ? 'bg-black/50 text-white border border-white/10' : 'bg-slate-100 text-black border border-slate-200'}`}
                                            >
                                                <option value="USD">USD ($)</option>
                                                <option value="VND">VND (₫)</option>
                                            </select>
                                            <button 
                                                onClick={() => setCurrUnit(c => c === 'USD' ? 'VND' : 'USD')} 
                                                className={`p-1.5 rounded transition-colors ${isDark ? 'hover:bg-purple-500/20 text-purple-400' : 'hover:bg-purple-100 text-purple-600'}`}
                                            >
                                                <RefreshCw size={12} />
                                            </button>
                                        </div>
                                    </div>
                                </div>

                            </div>
                        </div>
                    )}

                    {/* CHART + VOLUME PROFILE */}
                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                        {/* TRADING CHART */}
                        <div className={`lg:col-span-3 h-[300px] sm:h-[420px] rounded-[28px] border overflow-hidden shadow-xl relative flex items-center justify-center ${isDark ? 'bg-black/40 border-purple-500/20' : 'bg-white border-purple-100 shadow-purple-100/50'}`}>
                            {chartData && chartData.length > 0 ? (
                                <TradingChart
                                    data={chartData}
                                    theme={isDark ? 'dark' : 'light'}
                                    onIntervalChange={setCryptoInterval}
                                    currentInterval={cryptoInterval}
                                />
                            ) : (
                                <div className="flex flex-col items-center opacity-40">
                                    <Activity size={40} className="animate-pulse text-purple-400 mb-3" />
                                    <p className={`text-[10px] font-black uppercase tracking-[0.2em] ${UI.textMuted}`}>
                                        {loadingChart ? 'ĐANG TẢI DỮ LIỆU...' : 'NHẬP MÃ COIN ĐỂ BẮT ĐẦU'}
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* VOLUME PROFILE */}
                        <div className={`lg:col-span-1 rounded-[28px] border p-4 flex flex-col ${isDark ? 'bg-black/20 border-white/5' : 'bg-white border-slate-200 shadow-sm'}`}>
                            <div className="flex items-center justify-between mb-3">
                                <p className={`text-[9px] font-black uppercase tracking-[0.2em] ${UI.textMuted}`}>Volume Profile</p>
                                <div className="relative" onMouseEnter={() => setShowVolInfo(true)} onMouseLeave={() => setShowVolInfo(false)}>
                                    <HelpCircle size={13} className={`cursor-pointer hover:text-purple-400 transition-colors ${UI.textMuted}`} />
                                    {showVolInfo && (
                                        <div className={`absolute right-0 top-5 w-52 p-3 rounded-xl shadow-2xl z-50 text-[10px] font-bold leading-relaxed border animate-in fade-in slide-in-from-top-2 ${isDark ? 'bg-[#1a222e] text-slate-300 border-slate-700' : 'bg-white text-slate-600 border-slate-200'}`}>
                                            Phân phối khối lượng giao dịch theo mức giá. POC (★) là vùng giao dịch nhiều nhất, thường là hỗ trợ/kháng cự cứng của crypto.
                                        </div>
                                    )}
                                </div>
                            </div>
                            <CryptoVolumeProfile
                                bins={volProf?.bins}
                                maxVol={volProf?.maxVol}
                                pocPrice={volProf?.pocPrice}
                                isDark={isDark} UI={UI}
                            />
                        </div>
                    </div>

                    {/* ══════════════════════════════════════════
                        AI CRYPTO ANALYST PANEL
                    ══════════════════════════════════════════ */}
            <div className={`p-6 rounded-[32px] border transition-all duration-500 ${isDark ? 'bg-[#10151C] border-purple-500/30 shadow-[0_0_30px_rgba(168,85,247,0.08)]' : 'bg-purple-50 border-purple-200 shadow-sm'}`}>
                <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-2xl bg-purple-500 text-white flex items-center justify-center shadow-lg shadow-purple-500/40 shrink-0">
                <BrainCircuit size={20} />
                </div>
                <div>
                <h4 className={`text-sm font-black uppercase tracking-widest ${UI.textBold}`}>AI Quantitative Strategy</h4>
                <p className="text-[9px] font-bold text-purple-400 uppercase">Real-time Signal Engine</p>
            </div>
            {tech && <div className="ml-auto"><SentimentBar score={tech.score} isDark={isDark} UI={UI} /></div>}
        </div>

    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* CỘT 1: BIẾN SỐ KỸ THUẬT (3 CỘT) */}
        <div className="lg:col-span-3 space-y-3">
            <div className="flex items-center gap-2 text-purple-400">
                <Activity size={15} />
                <span className="text-[10px] font-black uppercase tracking-widest">Biến số Kỹ thuật</span>
            </div>
            <ul className={`text-[11px] leading-relaxed font-bold space-y-2.5 ${UI.textMuted}`}>
                <li className="flex justify-between"><span>• RSI (14):</span> <span className={tech?.rsi > 70 ? 'text-red-400' : 'text-emerald-400'}>{fmt(tech?.rsi, 1)}</span></li>
                <li className="flex justify-between"><span>• MACD:</span> <span className={tech?.macdLine > 0 ? 'text-emerald-400' : 'text-red-400'}>{fmt(tech?.macdLine)}</span></li>
                <li className="flex justify-between"><span>• CVD:</span> <span className={priceData?.cvd >= 0 ? 'text-emerald-400' : 'text-red-400'}>{fmtLarge(priceData?.cvd)}</span></li>
                <li className="flex justify-between"><span>• ATR:</span> <span className={UI.textBold}>{fmtUSD(tech?.atr)}</span></li>
                <li className="flex justify-between"><span>• VWAP:</span> <span className="text-blue-400">{fmtUSD(tech?.vwap)}</span></li>
            </ul>
            
        <button onClick={handleAiAnalysis} disabled={loadingAi} className={`w-full h-12 mt-4 rounded-xl flex items-center justify-center gap-2 font-black text-[10px] uppercase transition-all shadow-lg ${loadingAi ? 'bg-slate-700 text-slate-400' : 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-500/30'}`}>
            <BrainCircuit size={16} className={loadingAi ? "animate-spin" : "animate-pulse"} />
            {loadingAi ? 'AI ĐANG SUY NGHĨ...' : (aiSignal ? 'CẬP NHẬT BÁO CÁO MỚI' : 'PHÂN TÍCH TÍN HIỆU')}
        </button>
        <button 
        onClick={() => setIsChatOpen(true)}
        className={`w-full mt-2 h-12 rounded-xl flex items-center justify-center gap-2 font-black text-[10px] uppercase transition-all border ${isDark ? 'border-purple-500/30 text-purple-400 hover:bg-purple-500/10' : 'border-purple-300 text-purple-600 hover:bg-purple-50'}`}
    >
        <BrainCircuit size={16} />
        {aiSignal ? 'CHAT VỚI AI VỀ COIN NÀY' : 'HỎI AI VỀ COIN NÀY'}
        </button>
    </div>

        {/* CỘT 2: AI REPORT (6 CỘT - THAY THẾ DEMO TRADING) */}
<div className={`lg:col-span-6 lg:border-l lg:border-r lg:px-6 relative ${isDark ? 'border-white/10' : 'border-purple-200'} mt-4 lg:mt-0`}>
        <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-blue-400">
                <Database size={15} />
                <span className="text-[10px] font-black uppercase tracking-widest">Omni Duck Intelligence Report</span>
            </div>
            {/* 🌟 Ngày giờ báo cáo */}
            {aiSignal?.timestamp && (
                <span className={`text-[9px] font-bold italic bg-purple-500/10 px-2 py-1 rounded border border-purple-500/20 ${UI.textMuted}`}>
                    Lần cuối: {new Date(aiSignal.timestamp).toLocaleString('vi-VN')}
                </span>
            )}
        </div>

        {/* 🌟 LỚP PHỦ MỜ KHI ĐANG LOADING AI */}
        {loadingAi && aiSignal && (
            <div className="absolute inset-0 top-10 z-10 bg-black/50 backdrop-blur-sm flex flex-col items-center justify-center rounded-xl border border-purple-500/50">
                <BrainCircuit size={32} className="animate-spin text-purple-400 mb-2" />
                <span className="text-[10px] font-black uppercase text-purple-400 tracking-widest bg-black/60 px-3 py-1 rounded-full shadow-lg shadow-purple-500/20">
                    ĐANG VẼ LẠI BIỂU ĐỒ TƯ DUY...
                </span>
            </div>
        )}

        {aiSignal ? (
            <div className={`space-y-4 transition-all duration-300 ${loadingAi ? 'opacity-40 scale-[0.98]' : 'animate-in fade-in slide-in-from-bottom-2'}`}>
                <div className={`p-4 rounded-2xl border ${isDark ? 'bg-black/40 border-purple-500/20 shadow-inner' : 'bg-white border-purple-100'}`}>
                    <p className="text-[9px] font-black uppercase text-purple-400 mb-2">Phân tích kỹ thuật & Vĩ mô</p>
                    <p className={`text-[11px] leading-relaxed italic ${UI.textNormal}`}>{aiSignal.tech_analysis}</p>
                    <div className="h-px bg-white/5 my-3" />
                    <p className={`text-[11px] leading-relaxed ${UI.textNormal}`}>{aiSignal.macro_analysis}</p>
                </div>
                <div className={`p-3 rounded-xl ${isDark ? 'bg-purple-500/10' : 'bg-purple-50'} border border-purple-500/30 shadow-[0_0_15px_rgba(168,85,247,0.1)]`}>
                    <p className="text-[9px] font-black uppercase text-purple-400 mb-1">Lời khuyên chiến thuật</p>
                    <p className="text-[11px] font-bold text-purple-300">{aiSignal.advice}</p>
                </div>
            </div>
        ) : (
            <div className="h-[250px] flex flex-col items-center justify-center opacity-30 border-2 border-dashed border-white/5 rounded-3xl">
                <BrainCircuit size={40} className="mb-3" />
                <p className="text-[10px] font-black uppercase">Chưa có dữ liệu phân tích</p>
            </div>
        )}
    </div>
        {/* CỘT 3: KHUNG LỆNH DỰ BÁO (3 CỘT) */}
<div className={`lg:col-span-3 space-y-3 transition-all duration-300 ${loadingAi ? 'opacity-40 pointer-events-none' : ''} mt-4 lg:mt-0`}>
        <div className="flex items-center gap-2 text-emerald-400">
            <TrendingUp size={15} />
            <span className="text-[10px] font-black uppercase tracking-widest">Dự báo vào lệnh</span>
        </div>

        <div className={`p-3 rounded-2xl text-center font-black text-sm uppercase tracking-widest border ${
            aiSignal?.signal === 'LONG' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.2)]' :
            aiSignal?.signal === 'SHORT' ? 'bg-red-500/10 border-red-500/30 text-red-500 shadow-[0_0_15px_rgba(239,68,68,0.2)]' :
            'bg-yellow-500/10 border-yellow-500/30 text-yellow-500'
        }`}>
            {aiSignal ? `${aiSignal.signal} (${aiSignal.confidence})` : 'QUAN SÁT'}
        </div>

        {[
            { label: 'Entry (Vào)', val: aiSignal?.entry || '---', color: UI.textBold },
            { label: 'Stop Loss (Cắt)', val: aiSignal?.sl || '---', color: 'text-red-400' },
            { label: 'Target (Chốt)', val: aiSignal?.tp || '---', color: 'text-emerald-400' },
            { label: 'Horizon (Kỳ vọng)', val: aiSignal?.horizon || '---', color: 'text-blue-400' },
        ].map(({ label, val, color }) => (
            <div key={label} className={`p-3 rounded-2xl border ${isDark ? 'bg-black/20 border-white/5' : 'bg-white border-slate-200'}`}>
                <p className={`text-[8px] font-black uppercase tracking-widest ${UI.textMuted}`}>{label}</p>
                <p className={`font-black text-xs font-mono mt-0.5 ${color}`}>{val}</p>
            </div>
        ))}
    </div>
    </div>
</div>

                    {/* ══════════════════════════════════════════
                        PANEL TIN TỨC CRYPTO
                    ══════════════════════════════════════════ */}
                    <div className={`rounded-[32px] border overflow-hidden ${isDark ? 'bg-[#0A0E14] border-white/10' : 'bg-white border-slate-200 shadow-sm'}`}>
                        <button
                            onClick={() => setShowNewsPanel(v => !v)}
                            className={`w-full flex items-center justify-between px-6 py-4 transition-all ${isDark ? 'hover:bg-white/5' : 'hover:bg-slate-50'}`}
                        >
                            <div className="flex items-center gap-2">
                                <Newspaper size={16} className="text-purple-400" />
                                <span className={`text-[10px] font-black uppercase tracking-widest ${UI.textBold}`}>
                                    Tin Tức {symbol} {cryptoNews.length > 0 && <span className="text-purple-400 ml-1">({cryptoNews.length})</span>}
                                </span>
                                {loadingNews && <RefreshCw size={12} className="animate-spin text-purple-400 ml-1" />}
                            </div>
                            <div className="flex items-center gap-2">
                                <span className={`text-[9px] font-bold ${UI.textMuted}`}>
                                    {cryptoNews.length === 0 && !loadingNews ? 'Cần thêm route /api/crypto/news/:symbol' : ''}
                                </span>
                                {showNewsPanel ? <ChevronUp size={16} className={UI.textMuted} /> : <ChevronDown size={16} className={UI.textMuted} />}
                            </div>
                        </button>

                        {showNewsPanel && (
                            <div className="px-6 pb-6">
                                {cryptoNews.length > 0 ? (
                                    <div className="flex flex-col gap-3 max-h-[600px] overflow-y-auto custom-scrollbar pr-2">
                                        {cryptoNews.map((n, i) => <NewsCard key={i} news={n} isDark={isDark} UI={UI} />)}
                                    </div>
                                ) : (
                                    <div className={`flex flex-col items-center justify-center py-10 rounded-2xl border border-dashed ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
                                        <AlertTriangle size={24} className="text-yellow-400 mb-3 opacity-60" />
                                        <p className={`text-[10px] font-black uppercase tracking-widest ${UI.textMuted} text-center`}>
                                            {loadingNews ? 'ĐANG TẢI TIN TỨC...' : 'Cần thêm API Key để tải tin X/Twitter'}
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                </div>
            </div>
            </div>
            <StockAiChat
            isOpen={isChatOpen}
            onClose={() => setIsChatOpen(false)}
            ticker={symbol}
            companyName={allCryptos.find(c => c.symbol === symbol)?.name || symbol}
            aiReport={aiSignal ? `Phân tích kỹ thuật: ${aiSignal.tech_analysis}\n\nVĩ mô: ${aiSignal.macro_analysis}\n\nChiến lược: ${aiSignal.advice}` : null}
            isDark={isDark}
        />
        </div>
    );
}
