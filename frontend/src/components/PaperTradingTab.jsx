import {
    Activity, Zap, Database, HelpCircle, BarChart3,
    ChevronDown, ChevronUp, X, RefreshCw, BrainCircuit,
    TrendingUp, TrendingDown, Minus, Wallet, Clock,
    BookOpen, Search, ChevronRight, CircleDot
} from 'lucide-react';
import TradingChart from './TradingChart';
import StockAiChat from './StockAiChat';
import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';

// ─── Tooltip nhỏ gọn (đồng bộ DerivativesTab) ────────────────────────────────
function Tip({ text, children, side = 'top' }) {
    const [show, setShow] = useState(false);
    const posClass = side === 'top'
        ? 'bottom-full mb-2 left-0'
        : side === 'bottom'
        ? 'top-full mt-2 left-0'
        : 'bottom-full mb-2 right-0';
    return (
        <span className="relative inline-flex items-center" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
            {children}
            {show && (
                <span className={`absolute ${posClass} w-60 p-2.5 rounded-xl shadow-2xl text-[10px] font-semibold leading-relaxed z-[200] bg-[#1a222e] text-slate-300 border border-slate-700 pointer-events-none`}>
                    {text}
                </span>
            )}
        </span>
    );
}

// ─── Card wrapper (purple accent thay orange) ──────────────────────────────────
function Card({ children, className = '', isDark, accent = false, noPad = false }) {
    const base = isDark
        ? accent ? 'bg-[#0f1020] border-purple-500/25' : 'bg-[#131922] border-white/6'
        : accent ? 'bg-purple-50 border-purple-200' : 'bg-white border-slate-200';
    return (
        <div className={`rounded-2xl border ${noPad ? '' : 'p-4'} ${base} ${className}`}>
            {children}
        </div>
    );
}

// ─── StatRow: label + value (đồng bộ DerivativesTab) ─────────────────────────
function StatRow({ label, value, valueClass = '', tip }) {
    return (
        <div className="flex items-center justify-between py-1.5 border-b border-white/4 last:border-0">
            <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1">
                {label}
                {tip && (
                    <Tip text={tip}>
                        <HelpCircle size={11} className="text-slate-500 hover:text-yellow-400 transition-colors cursor-default" />
                    </Tip>
                )}
            </span>
            <span className={`text-[11px] font-black tabular-nums ${valueClass}`}>{value}</span>
        </div>
    );
}

// ─── MiniStat (đồng bộ DerivativesTab) ───────────────────────────────────────
function MiniStat({ label, value, valueClass = '', isDark }) {
    return (
        <div className={`rounded-xl p-3 flex flex-col items-center gap-0.5 ${isDark ? 'bg-black/30 border border-white/5' : 'bg-slate-50 border border-slate-200'}`}>
            <span className="text-[8px] font-black uppercase tracking-wider text-slate-400">{label}</span>
            <span className={`text-sm font-black tabular-nums ${valueClass}`}>{value}</span>
        </div>
    );
}

// ─── SectionLabel (đồng bộ DerivativesTab) ───────────────────────────────────
function SectionLabel({ icon: Icon, label, color = 'text-slate-400', tip, action }) {
    return (
        <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
                {Icon && <Icon size={13} className={color} />}
                <span className={`text-[10px] font-black uppercase tracking-widest ${color}`}>{label}</span>
                {tip && (
                    <Tip text={tip}>
                        <HelpCircle size={12} className="text-slate-500 hover:text-yellow-400 transition-colors cursor-default" />
                    </Tip>
                )}
            </div>
            {action}
        </div>
    );
}

// ─── ScrollableColumn (đồng bộ DerivativesTab, accent đổi sang purple) ────────
function ScrollableColumn({ children, className = '', isDark }) {
    const scrollRef = useRef(null);
    const [canScrollUp, setCanScrollUp] = useState(false);
    const [canScrollDown, setCanScrollDown] = useState(false);

    const checkScroll = useCallback(() => {
        if (scrollRef.current) {
            const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
            setCanScrollUp(scrollTop > 5);
            setCanScrollDown(scrollTop + clientHeight < scrollHeight - 5);
        }
    }, []);

    useEffect(() => {
        checkScroll();
        const observer = new ResizeObserver(() => checkScroll());
        if (scrollRef.current) {
            observer.observe(scrollRef.current);
            if (scrollRef.current.firstElementChild) observer.observe(scrollRef.current.firstElementChild);
        }
        return () => observer.disconnect();
    }, [checkScroll]);

    useEffect(() => { checkScroll(); }, [children, checkScroll]);

    const scrollByAmount = (amount) => scrollRef.current?.scrollBy({ top: amount, behavior: 'smooth' });

    const btnBase = `pointer-events-auto p-1.5 rounded-full shadow-lg transition-all duration-200 hover:scale-110 border backdrop-blur-sm ${
        isDark
            ? 'bg-slate-900/90 text-purple-400 border-purple-500/30'
            : 'bg-white/90 text-purple-600 border-purple-300'
    }`;

    return (
        <div className="relative h-auto lg:h-full flex flex-col min-h-0 w-full">
            {canScrollUp && (
                <div className="hidden lg:flex absolute top-1 left-0 right-3 justify-center z-20 pointer-events-none">
                    <button onClick={() => scrollByAmount(-250)} title="Cuộn lên" className={btnBase}>
                        <ChevronUp size={14} strokeWidth={3} />
                    </button>
                </div>
            )}
            <div ref={scrollRef} onScroll={checkScroll} className={`flex-none lg:flex-1 lg:overflow-y-auto custom-scrollbar ${className}`}>
                {children}
            </div>
            {canScrollDown && (
                <div className="hidden lg:flex absolute bottom-1 left-0 right-3 justify-center z-20 pointer-events-none">
                    <button onClick={() => scrollByAmount(250)} title="Cuộn xuống" className={btnBase}>
                        <ChevronDown size={14} strokeWidth={3} />
                    </button>
                </div>
            )}
        </div>
    );
}

// ─── Mobile tab button (accent purple) ───────────────────────────────────────
function MobileTabBtn({ active, onClick, icon: Icon, label, isDark }) {
    return (
        <button
            onClick={onClick}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-black uppercase tracking-widest transition-all border-b-2 ${
                active
                    ? 'border-purple-500 text-purple-500'
                    : `border-transparent ${isDark ? 'text-slate-500 hover:text-slate-400' : 'text-slate-400 hover:text-slate-500'}`
            }`}
        >
            <Icon size={15} />
            {label}
        </button>
    );
}

// ─── Badge: trạng thái lệnh ───────────────────────────────────────────────────
function OrderTypeBadge({ type }) {
    if (type === 'BUY') return (
        <span className="inline-flex items-center gap-0.5 text-[9px] font-black px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
            <TrendingUp size={9} /> MUA
        </span>
    );
    return (
        <span className="inline-flex items-center gap-0.5 text-[9px] font-black px-1.5 py-0.5 rounded-md bg-red-500/15 text-red-400 border border-red-500/20">
            <TrendingDown size={9} /> BÁN
        </span>
    );
}

// ─── Badge: loại thị trường ───────────────────────────────────────────────────
function MarketBadge({ market }) {
    const map = {
        VN_STOCKS: { label: 'HOSE/HNX', color: 'text-sky-400 bg-sky-500/10 border-sky-500/20' },
        CRYPTO: { label: 'CRYPTO', color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20' },
        VN_DERIVATIVES: { label: 'F1M', color: 'text-orange-400 bg-orange-500/10 border-orange-500/20' },
        GLOBAL: { label: 'GLOBAL', color: 'text-slate-400 bg-slate-500/10 border-slate-500/20' },
    };
    const m = map[market] || map.GLOBAL;
    return (
        <span className={`inline-flex text-[8px] font-black px-1.5 py-0.5 rounded border ${m.color}`}>{m.label}</span>
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
export default function PaperTradingTab({
    isDark, UI,
    currentUser,
    portfolio,
    allStocks,
    paperMarket, setPaperMarket,
    paperSymbol,
    paperSearchInput, setPaperSearchInput,
    paperSuggestions,
    showPaperSuggestions, setShowPaperSuggestions,
    paperVolume, setPaperVolume,
    paperOrderType, setPaperOrderType,
    paperLimitPrice, setPaperLimitPrice,
    paperChartData,
    paperInterval, setPaperInterval,
    showPaperHelp, setShowPaperHelp,
    marketOpen,
    expandedSymbol, setExpandedSymbol,
    executePaperSearch,
    handlePaperTrade,
    handleCancelOrder,
}) {
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [mobileTab, setMobileTab] = useState('trade');
    const [livePrices, setLivePrices] = useState({});

    // ─── Live price polling (giữ nguyên logic gốc) ─────────────────────────
    useEffect(() => {
        if (!portfolio?.holdings || portfolio.holdings.length === 0) return;

        const fetchHoldingsPrices = async () => {
            const newPrices = { ...livePrices };
            await Promise.all(portfolio.holdings.map(async (h) => {
                try {
                    let url = '';
                    if (h.assetType === 'VN_STOCKS') url = `/api/history/${h.symbol}?interval=1 ngày`;
                    else if (h.assetType === 'CRYPTO') url = `/api/crypto/history/${h.symbol}?interval=1 ngày`;
                    if (url) {
                        const res = await axios.get(url);
                        if (res.data?.success && res.data.data?.length > 0) {
                            let closePrice = res.data.data[res.data.data.length - 1].close;
                            if (h.assetType === 'VN_STOCKS' && closePrice < 1000) closePrice *= 1000;
                            newPrices[h.symbol] = closePrice;
                        }
                    }
                } catch {}
            }));
            setLivePrices(newPrices);
        };

        fetchHoldingsPrices();
        const timer = setInterval(fetchHoldingsPrices, 10000);
        return () => clearInterval(timer);
    }, [portfolio?.holdings]);

    // ─── Derived values ─────────────────────────────────────────────────────
    const c = {
        up: 'text-emerald-400',
        down: 'text-red-400',
        neutral: 'text-slate-400',
        accent: 'text-purple-500',
        white: isDark ? 'text-white' : 'text-slate-800',
    };

    const totalRealizedPnL = portfolio?.history?.reduce((sum, h) => sum + (h.realizedPnL || 0), 0) || 0;

    const currentMarketPrice = paperChartData?.length
        ? paperChartData[paperChartData.length - 1].close *
          (paperMarket === 'VN_STOCKS' && paperChartData[paperChartData.length - 1].close < 1000 ? 1000 : 1)
        : null;

    const estimatedTotal = (() => {
        const price = paperOrderType === 'LO' && paperLimitPrice
            ? Number(paperLimitPrice)
            : currentMarketPrice;
        return price && paperVolume ? price * Number(paperVolume) : null;
    })();

    return (
        <div className="flex flex-col w-full h-full overflow-hidden">

            {/* ── MOBILE TAB BAR ──────────────────────────────────────────── */}
            <div className={`lg:hidden flex w-full shrink-0 border-b ${isDark ? 'bg-[#080C11] border-white/8' : 'bg-slate-50 border-slate-200'}`}>
                <MobileTabBtn isDark={isDark} active={mobileTab === 'portfolio'} onClick={() => setMobileTab('portfolio')} icon={Wallet} label="Ví" />
                <MobileTabBtn isDark={isDark} active={mobileTab === 'trade'} onClick={() => setMobileTab('trade')} icon={BarChart3} label="Giao dịch" />
                <MobileTabBtn isDark={isDark} active={mobileTab === 'orders'} onClick={() => setMobileTab('orders')} icon={BookOpen} label="Lệnh chờ" />
            </div>

            {/* ── 3-COLUMN LAYOUT (đồng bộ cấu trúc DerivativesTab) ─────── */}
            <div className="flex-1 flex flex-row w-full min-h-0 overflow-hidden">

                {/* ══ COL 1: VÍ & DANH MỤC ════════════════════════════════ */}
                <div className={`${mobileTab === 'portfolio' || mobileTab === 'orders' ? 'flex' : 'hidden'} lg:flex w-full lg:w-[340px] xl:w-[380px] border-r flex-col overflow-hidden ${isDark ? 'bg-[#080C11] border-white/8' : 'bg-slate-50 border-slate-200'}`}>

                    {/* Header nhỏ gọn */}
                    <div className={`px-5 pt-4 pb-3 shrink-0 border-b ${isDark ? 'border-white/6' : 'border-slate-200'}`}>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                                <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${isDark ? 'bg-purple-500/20' : 'bg-purple-100'}`}>
                                    <Wallet size={15} className="text-purple-500" />
                                </div>
                                <div>
                                    <p className={`text-[13px] font-black ${c.accent}`}>Đầu Tư Giả Lập</p>
                                    <div className="flex items-center gap-1.5">
                                        <CircleDot size={8} className={marketOpen ? 'text-emerald-400' : 'text-slate-500'} />
                                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                                            {marketOpen ? 'Thị trường mở' : 'Ngoài giờ GD'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            {/* Nút help */}
                            <div
                                className="relative flex items-center justify-center cursor-help"
                                onMouseEnter={() => setShowPaperHelp(true)}
                                onMouseLeave={() => setShowPaperHelp(false)}
                                onClick={() => setShowPaperHelp(!showPaperHelp)}
                            >
                                <HelpCircle size={15} className={`transition-colors ${isDark ? 'text-slate-500 hover:text-purple-400' : 'text-slate-400 hover:text-purple-500'}`} />
                                {showPaperHelp && (
                                    <div className={`absolute right-0 top-full mt-2 w-[300px] p-4 rounded-xl shadow-2xl z-[99999] text-[10px] font-semibold leading-relaxed border ${isDark ? 'bg-[#1a222e] text-slate-300 border-purple-500/30' : 'bg-white text-slate-600 border-purple-200'}`}>
                                        <h4 className="text-purple-500 font-black uppercase mb-2 pb-2 border-b border-dashed border-purple-500/30">
                                            Cơ chế Shadow Matching
                                        </h4>
                                        <div className="space-y-2">
                                            <p className="flex gap-2"><span className="text-emerald-400 shrink-0">■</span><span><strong className="text-emerald-400">Trong giờ GD:</strong> Lệnh MP khớp ngay theo giá TT. Lệnh LO treo chờ, tự động khớp khi giá chạm mục tiêu.</span></p>
                                            <p className="flex gap-2"><span className="text-yellow-400 shrink-0">■</span><span><strong className="text-yellow-400">Ngoài giờ GD:</strong> Lệnh nằm an toàn trong Sổ Lệnh Chờ đến khi thị trường mở lại.</span></p>
                                            <p className="flex gap-2"><span className="text-blue-400 shrink-0">■</span><span><strong className="text-blue-400">Quản trị vốn:</strong> Lệnh MUA chờ phong tỏa sức mua. Hủy lệnh hoàn trả tiền ngay lập tức.</span></p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* ─── BALANCE CARD ─────────────────────────────────── */}
                    <div className={`mx-4 mt-4 mb-0 rounded-2xl border p-4 relative overflow-hidden shrink-0 ${isDark ? 'bg-gradient-to-br from-[#160d24] to-[#0a0f16] border-purple-500/25' : 'bg-gradient-to-br from-purple-50 to-white border-purple-200'}`}>
                        {/* Decorative glyph */}
                        <div className="absolute top-3 right-3 opacity-10 pointer-events-none">
                            <Zap size={36} className="text-purple-400" />
                        </div>
                        <p className={`text-[9px] font-black uppercase tracking-widest mb-1 ${isDark ? 'text-purple-400' : 'text-purple-600'}`}>
                            Sức mua khả dụng
                        </p>
                        <p className={`text-2xl font-black tabular-nums mb-3 ${c.white}`}>
                            {portfolio?.balance != null
                                ? portfolio.balance.toLocaleString('vi-VN')
                                : <span className="text-slate-500 text-base">Đang đồng bộ...</span>
                            }
                            {portfolio?.balance != null && (
                                <span className={`text-[11px] font-bold ml-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>₫</span>
                            )}
                        </p>
                        <div className={`pt-3 border-t flex items-center justify-between ${isDark ? 'border-purple-500/15' : 'border-purple-200'}`}>
                            <Tip text="Tổng lãi/lỗ thực tế đã khớp và chốt từ tất cả các lệnh bán trong lịch sử giao dịch.">
                                <span className={`text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 cursor-default ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                                    <HelpCircle size={10} />
                                    Tổng P&amp;L đã chốt
                                </span>
                            </Tip>
                            <span className={`font-mono font-black text-sm tabular-nums ${totalRealizedPnL >= 0 ? c.up : c.down}`}>
                                {totalRealizedPnL >= 0 ? '+' : ''}{totalRealizedPnL.toLocaleString('vi-VN')} ₫
                            </span>
                        </div>
                    </div>

                    {/* ─── HOLDINGS ─────────────────────────────────────── */}
                    <div className="flex-1 min-h-0 flex flex-col overflow-hidden mt-4">
                        <div className={`px-5 pb-2.5 shrink-0 flex items-center justify-between`}>
                            <SectionLabel
                                icon={Activity}
                                label="Danh mục đầu tư"
                                color="text-purple-500"
                                tip="Tất cả tài sản đang nắm giữ. Nhấn vào mã để xem chi tiết lịch sử khớp lệnh và tải chart."
                            />
                            <span className={`text-[9px] font-black text-slate-500 uppercase -mt-3`}>
                                {portfolio?.holdings?.length || 0} mã
                            </span>
                        </div>

                        <ScrollableColumn isDark={isDark} className="px-4 pb-3 space-y-2">
                            {/* Empty state */}
                            {(!portfolio?.holdings || portfolio.holdings.length === 0) && (
                                <div className={`p-6 rounded-2xl border border-dashed flex flex-col items-center justify-center gap-2 ${isDark ? 'border-white/10' : 'border-slate-300'}`}>
                                    <Database size={22} className="text-slate-500" />
                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">
                                        Ví trống. Đặt lệnh đầu tiên.
                                    </p>
                                </div>
                            )}

                            {portfolio?.holdings?.map((h, i) => {
                                const stockInfo = allStocks.find(s => s.symbol === h.symbol) || {};
                                const isExpanded = expandedSymbol === h.symbol;
                                const isActive = paperSymbol === h.symbol;

                                let currentPrice = livePrices[h.symbol] || h.avgPrice;
                                if (paperChartData && paperSymbol === h.symbol && paperChartData.length > 0) {
                                    let chartPrice = paperChartData[paperChartData.length - 1].close;
                                    if (h.assetType === 'VN_STOCKS' && chartPrice < 1000) chartPrice *= 1000;
                                    currentPrice = chartPrice;
                                }
                                const pnl = (currentPrice - h.avgPrice) * h.volume;
                                const pnlPercent = h.avgPrice > 0 ? ((currentPrice - h.avgPrice) / h.avgPrice) * 100 : 0;
                                const isGain = pnl >= 0;

                                return (
                                    <div
                                        key={i}
                                        onClick={() => {
                                            setExpandedSymbol(isExpanded ? null : h.symbol);
                                            executePaperSearch(h.symbol);
                                        }}
                                        className={`rounded-xl border px-3.5 py-2.5 transition-all duration-200 cursor-pointer ${
                                            isExpanded
                                                ? isDark ? 'bg-purple-500/8 border-purple-500/30' : 'bg-purple-50 border-purple-300'
                                                : isActive
                                                ? isDark ? 'bg-white/4 border-purple-500/20' : 'bg-slate-50 border-purple-200'
                                                : isDark ? 'bg-white/2 border-white/5 hover:border-purple-500/20' : 'bg-white border-slate-100 hover:border-purple-200'
                                        }`}
                                    >
                                        {/* Header row */}
                                        <div className="flex items-start justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[14px] font-black text-yellow-400">{h.symbol}</span>
                                                <MarketBadge market={h.assetType} />
                                            </div>
                                            <div className="text-right">
                                                <p className={`font-mono font-black text-[13px] tabular-nums leading-none ${isGain ? c.up : c.down}`}>
                                                    {isGain ? '+' : ''}{pnl.toLocaleString('vi-VN')} ₫
                                                </p>
                                                <p className={`text-[10px] font-black tabular-nums ${isGain ? c.up : c.down}`}>
                                                    {isGain ? '▲' : '▼'} {pnlPercent.toFixed(2)}%
                                                </p>
                                            </div>
                                        </div>

                                        {/* Stat grid */}
                                        <div className={`h-px mb-2 ${isDark ? 'bg-white/6' : 'bg-slate-200'}`} />
                                        <div className="grid grid-cols-3 gap-1">
                                            {[
                                                { label: 'Giá vốn', value: h.avgPrice.toLocaleString('vi-VN') },
                                                { label: 'Giá TT', value: currentPrice.toLocaleString('vi-VN'), highlight: isActive },
                                                { label: 'KL (CP)', value: h.volume.toLocaleString('vi-VN') },
                                            ].map(s => (
                                                <div key={s.label}>
                                                    <p className="text-[8px] font-bold text-slate-500 uppercase">{s.label}</p>
                                                    <p className={`text-[11px] font-black tabular-nums mt-0.5 ${s.highlight ? 'text-blue-400' : isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                                                        {s.value}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Expand button */}
                                        <div className={`mt-2 flex items-center justify-end gap-1 text-[9px] font-bold uppercase tracking-wide ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
                                            {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                                            {isExpanded ? 'Ẩn lịch sử' : 'Xem lịch sử'}
                                        </div>

                                        {/* Expanded: history log */}
                                        {isExpanded && (
                                            <div className="mt-3 pt-3 border-t border-dashed border-slate-500/25 space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
                                                <p className={`text-[9px] font-black uppercase tracking-wider mb-2 ${c.accent}`}>
                                                    Nhật ký khớp lệnh
                                                </p>
                                                <div className="max-h-40 overflow-y-auto custom-scrollbar space-y-1.5 pr-0.5">
                                                    {(portfolio?.history?.filter(item => item.symbol === h.symbol) || []).length === 0 ? (
                                                        <p className="text-[10px] italic text-slate-500 text-center py-3">Chưa ghi nhận khớp lệnh.</p>
                                                    ) : (
                                                        portfolio.history
                                                            .filter(item => item.symbol === h.symbol)
                                                            .map((histItem, idx) => (
                                                                <div key={idx} className={`px-2.5 py-2 rounded-lg border flex items-center justify-between ${isDark ? 'bg-black/40 border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                                                                    <div className="flex items-center gap-2">
                                                                        <OrderTypeBadge type={histItem.type} />
                                                                        <div>
                                                                            <p className={`text-[11px] font-mono font-black tabular-nums ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                                                                                {histItem.price.toLocaleString('vi-VN')} ₫
                                                                            </p>
                                                                            <p className="text-[8px] text-slate-500">{new Date(histItem.timestamp).toLocaleString('vi-VN')}</p>
                                                                        </div>
                                                                    </div>
                                                                    <div className="text-right">
                                                                        <p className={`font-mono font-black text-[11px] tabular-nums ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                                                                            {histItem.volume.toLocaleString('vi-VN')} CP
                                                                        </p>
                                                                        <span className="text-[8px] font-black text-emerald-400 uppercase">Đã khớp</span>
                                                                    </div>
                                                                </div>
                                                            ))
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}

                            {/* ─── SỔ LỆNH CHỜ ─────────────────────────── */}
                            {portfolio?.pendingOrders?.length > 0 && (
                                <div className={`mt-2 pt-4 border-t ${isDark ? 'border-white/6' : 'border-slate-200'}`}>
                                    <SectionLabel
                                        icon={Clock}
                                        label="Sổ lệnh chờ"
                                        color="text-yellow-500"
                                        tip="Lệnh giới hạn (LO) đang chờ giá thị trường chạm ngưỡng. Hủy lệnh để hoàn trả sức mua."
                                    />
                                    <div className="space-y-2">
                                        {portfolio.pendingOrders.map((order, idx) => (
                                            <div
                                                key={idx}
                                                className={`rounded-xl border px-3 py-2.5 flex items-center justify-between transition-all ${isDark ? 'bg-yellow-500/5 border-yellow-500/20 hover:border-yellow-500/35' : 'bg-yellow-50 border-yellow-200'}`}
                                            >
                                                <div className="flex items-center gap-2.5">
                                                    <OrderTypeBadge type={order.type} />
                                                    <div>
                                                        <div className="flex items-center gap-1.5">
                                                            <p className={`font-black text-[13px] text-yellow-400`}>{order.symbol}</p>
                                                            <span className={`text-[8px] font-black px-1 py-0.5 rounded ${isDark ? 'bg-white/8 text-slate-400' : 'bg-slate-200 text-slate-500'}`}>
                                                                {order.orderType}
                                                            </span>
                                                        </div>
                                                        <p className={`text-[9px] font-bold tabular-nums ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                                                            {order.volume.toLocaleString('vi-VN')} CP
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2.5">
                                                    <div className="text-right">
                                                        <p className={`text-[8px] font-bold uppercase text-slate-500`}>Giá chờ</p>
                                                        <p className={`font-mono font-black text-[12px] tabular-nums ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                                                            {order.targetPrice.toLocaleString('vi-VN')}
                                                        </p>
                                                    </div>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleCancelOrder(order._id); }}
                                                        className={`h-7 w-7 flex items-center justify-center rounded-lg border transition-all active:scale-95 ${isDark ? 'bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500 hover:text-white' : 'bg-red-50 border-red-200 text-red-500 hover:bg-red-500 hover:text-white'}`}
                                                        title="Hủy lệnh chờ"
                                                    >
                                                        <X size={12} strokeWidth={2.5} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </ScrollableColumn>
                    </div>
                </div>

                {/* ══ COL 2 + 3: CHART & ORDER PANEL ══════════════════════ */}
                <div className={`${mobileTab === 'trade' ? 'flex' : 'hidden'} lg:flex flex-1 flex-col min-h-0 overflow-hidden`}>

                    {/* ─── MARKET SELECTOR (header strip) ──────────────── */}
                    <div className={`shrink-0 px-4 py-2.5 flex items-center gap-2 border-b overflow-x-auto custom-scrollbar ${isDark ? 'bg-[#080C11] border-white/6' : 'bg-slate-50 border-slate-200'}`}>
                        {[
                            { id: 'VN_STOCKS', label: 'Chứng khoán VN' },
                            { id: 'VN_DERIVATIVES', label: 'Phái sinh' },
                            { id: 'CRYPTO', label: 'Crypto' },
                            { id: 'GLOBAL', label: 'Quốc tế' },
                        ].map((market) => (
                            <button
                                key={market.id}
                                onClick={() => setPaperMarket(market.id)}
                                className={`px-4 py-1.5 rounded-lg border font-black text-[10px] uppercase tracking-widest transition-all shrink-0 ${
                                    paperMarket === market.id
                                        ? 'border-purple-500 bg-purple-500/15 text-purple-400 shadow-[0_0_12px_rgba(168,85,247,0.2)]'
                                        : isDark
                                        ? 'border-white/8 text-slate-500 hover:text-slate-300 hover:border-white/15'
                                        : 'border-slate-200 text-slate-500 hover:text-slate-700 hover:border-slate-300'
                                }`}
                            >
                                {market.label}
                            </button>
                        ))}
                    </div>

                    {/* ─── CHART + ORDER PANEL GRID ─────────────────────── */}
                    <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-3 gap-0 overflow-hidden">

                        {/* ── COL 2: BIỂU ĐỒ ── */}
                        <div className={`col-span-1 lg:col-span-2 flex flex-col h-[360px] lg:h-auto border-r overflow-hidden ${isDark ? 'border-white/6' : 'border-slate-200'}`}>
                            {paperChartData ? (
                                <div className="flex-1 w-full min-h-0">
                                    <TradingChart
                                        data={paperChartData}
                                        theme={isDark ? 'dark' : 'light'}
                                        onIntervalChange={setPaperInterval}
                                        currentInterval={paperInterval}
                                    />
                                </div>
                            ) : (
                                <div className="flex-1 flex flex-col items-center justify-center gap-3">
                                    <Activity size={36} className={`animate-pulse ${isDark ? 'text-purple-500/40' : 'text-purple-300'}`} />
                                    <p className={`text-[10px] font-black uppercase tracking-widest ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
                                        Tìm kiếm mã tài sản để hiển thị biểu đồ
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* ── COL 3: ORDER PANEL ── */}
                        <ScrollableColumn isDark={isDark} className="p-4 pb-6 flex flex-col gap-4">

                            <SectionLabel
                                icon={BarChart3}
                                label={`Đặt lệnh · ${paperMarket.replace('_', ' ')}`}
                                color="text-purple-500"
                            />

                            {/* Tìm kiếm mã */}
                            <div>
                                <label className={`text-[9px] font-black uppercase tracking-widest mb-1.5 block ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                                    Mã tài sản
                                </label>
                                <div className="relative">
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={paperSearchInput}
                                            onChange={(e) => {
                                                setPaperSearchInput(e.target.value.toUpperCase());
                                                setShowPaperSuggestions(true);
                                            }}
                                            className={`flex-1 h-10 rounded-xl px-3 font-black uppercase text-[14px] border outline-none transition-colors ${
                                                isDark
                                                    ? 'bg-black/50 border-white/10 text-yellow-400 focus:border-purple-500/60 placeholder:text-slate-600'
                                                    : 'bg-slate-50 border-slate-300 text-yellow-600 focus:border-purple-400 placeholder:text-slate-400'
                                            }`}
                                            placeholder="VD: MBB..."
                                        />
                                        <button
                                            onClick={() => executePaperSearch(paperSearchInput)}
                                            className="h-10 px-3 rounded-xl bg-purple-500 hover:bg-purple-400 text-white font-black text-[10px] uppercase shadow-lg shadow-purple-500/25 transition-all active:scale-95"
                                        >
                                            <Search size={14} />
                                        </button>
                                    </div>

                                    {/* Suggestion dropdown */}
                                    {showPaperSuggestions && paperSuggestions.length > 0 && (
                                        <div className={`absolute top-full mt-1.5 left-0 right-0 z-50 border rounded-xl overflow-hidden shadow-2xl ${isDark ? 'bg-[#1a222e] border-white/10' : 'bg-white border-slate-300'}`}>
                                            {paperSuggestions.map((stock, idx) => (
                                                <button
                                                    key={idx}
                                                    onClick={() => executePaperSearch(stock.symbol)}
                                                    className={`w-full text-left px-3.5 py-2.5 text-[11px] font-bold border-b last:border-0 transition-colors flex items-center gap-2 ${
                                                        isDark
                                                            ? 'border-white/5 hover:bg-white/5 text-slate-300 hover:text-purple-400'
                                                            : 'border-slate-100 hover:bg-slate-50 text-slate-700 hover:text-purple-600'
                                                    }`}
                                                >
                                                    <span className="text-purple-500 font-black">{stock.symbol}</span>
                                                    <span className={`truncate ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{stock.companyName}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Loại lệnh */}
                            <div>
                                <label className={`text-[9px] font-black uppercase tracking-widest mb-1.5 block ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                                    Loại lệnh
                                </label>
                                <div className="grid grid-cols-4 gap-1.5">
                                    {['MP', 'LO', 'ATO', 'ATC'].map(type => (
                                        <Tip
                                            key={type}
                                            text={
                                                type === 'MP' ? 'Lệnh thị trường — khớp ngay theo giá hiện tại.' :
                                                type === 'LO' ? 'Lệnh giới hạn — chờ khớp khi giá chạm ngưỡng đặt.' :
                                                type === 'ATO' ? 'Khớp lệnh khi mở cửa (ATO).' :
                                                'Khớp lệnh khi đóng cửa (ATC).'
                                            }
                                        >
                                            <button
                                                onClick={() => setPaperOrderType(type)}
                                                className={`w-full py-2 rounded-lg font-black text-[10px] tracking-wider border transition-all active:scale-95 ${
                                                    paperOrderType === type
                                                        ? 'bg-purple-500/20 border-purple-500 text-purple-400'
                                                        : isDark
                                                        ? 'border-white/8 text-slate-500 hover:bg-white/5 hover:text-slate-300'
                                                        : 'border-slate-300 text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                                                }`}
                                            >
                                                {type}
                                            </button>
                                        </Tip>
                                    ))}
                                </div>
                            </div>

                            {/* Giá & Khối lượng */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className={`text-[9px] font-black uppercase tracking-widest mb-1.5 block ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                                        Giá (₫)
                                    </label>
                                    <input
                                        type="number"
                                        disabled={paperOrderType !== 'LO'}
                                        value={paperOrderType === 'LO' ? paperLimitPrice : ''}
                                        placeholder={paperOrderType !== 'LO' ? 'Theo TT' : 'VD: 24500'}
                                        onChange={(e) => setPaperLimitPrice(e.target.value)}
                                        className={`w-full h-10 rounded-xl px-3 font-black text-sm border outline-none transition-colors ${
                                            isDark
                                                ? 'bg-black/50 border-white/10 text-white focus:border-purple-500/60 disabled:opacity-40 placeholder:text-slate-600'
                                                : 'bg-slate-50 border-slate-300 text-black focus:border-purple-400 disabled:opacity-40 placeholder:text-slate-400'
                                        }`}
                                    />
                                </div>
                                <div>
                                    <label className={`text-[9px] font-black uppercase tracking-widest mb-1.5 block ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                                        Khối lượng
                                    </label>
                                    <input
                                        type="number"
                                        value={paperVolume}
                                        onChange={(e) => setPaperVolume(e.target.value)}
                                        className={`w-full h-10 rounded-xl px-3 font-black text-sm border outline-none transition-colors ${
                                            isDark
                                                ? 'bg-black/50 border-white/10 text-white focus:border-purple-500/60 placeholder:text-slate-600'
                                                : 'bg-slate-50 border-slate-300 text-black focus:border-purple-400'
                                        }`}
                                    />
                                </div>
                            </div>

                            {/* Tổng quan giá & dự tính */}
                            {paperChartData && (
                                <Card isDark={isDark} className="gap-0">
                                    <StatRow
                                        label="Giá market hiện tại"
                                        value={currentMarketPrice ? currentMarketPrice.toLocaleString('vi-VN') + ' ₫' : '---'}
                                        valueClass={c.white}
                                        tip="Giá đóng cửa nến gần nhất từ chart đang hiển thị."
                                    />
                                    <StatRow
                                        label="Dự tính thanh toán"
                                        value={estimatedTotal ? estimatedTotal.toLocaleString('vi-VN') + ' ₫' : '---'}
                                        valueClass="text-purple-400"
                                        tip="Ước tính = Giá đặt × Khối lượng. Chưa tính phí."
                                    />
                                </Card>
                            )}

                            {/* Nút AI chat */}
                            {paperSymbol && (
                                <button
                                    onClick={() => setIsChatOpen(true)}
                                    className={`w-full h-10 rounded-xl flex items-center justify-center gap-2 font-black text-[10px] uppercase tracking-widest transition-all border active:scale-95 ${
                                        isDark
                                            ? 'bg-blue-500/10 text-blue-400 border-blue-500/30 hover:bg-blue-500/20'
                                            : 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100'
                                    }`}
                                >
                                    <BrainCircuit size={14} />
                                    Hỏi AI trước khi vào lệnh · {paperSymbol}
                                </button>
                            )}

                            {/* BUY / SELL */}
                            <div className="grid grid-cols-2 gap-3 pt-1">
                                <button
                                    onClick={() => handlePaperTrade('BUY')}
                                    className="h-12 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white font-black text-sm uppercase tracking-widest shadow-lg shadow-emerald-500/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                                >
                                    <TrendingUp size={16} />
                                    Mua
                                </button>
                                <button
                                    onClick={() => handlePaperTrade('SELL')}
                                    className="h-12 rounded-xl bg-red-500 hover:bg-red-400 text-white font-black text-sm uppercase tracking-widest shadow-lg shadow-red-500/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                                >
                                    <TrendingDown size={16} />
                                    Bán
                                </button>
                            </div>

                        </ScrollableColumn>
                    </div>
                </div>
            </div>

            {/* ── AI CHAT MODAL ─────────────────────────────────────────── */}
            <StockAiChat
                isOpen={isChatOpen}
                onClose={() => setIsChatOpen(false)}
                ticker={paperSymbol}
                companyName={allStocks.find(s => s.symbol === paperSymbol)?.companyName || paperSymbol}
                aiReport={null}
                isDark={isDark}
                currentUser={currentUser}
            />
        </div>
    );
}