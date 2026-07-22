import { Activity, Zap, HelpCircle, BarChart3, BrainCircuit, Database, Globe, RefreshCw, ChevronUp, ChevronDown, GripHorizontal, TrendingUp, TrendingDown, Minus, ExternalLink } from 'lucide-react';
import TradingChart from './TradingChart';
import AtomLoader from './AtomLoader';
import ReactMarkdown from 'react-markdown';
import { useState, useEffect, useRef, useCallback } from 'react';
import StockAiChat from './StockAiChat';
import { AI_REPORT_COOLDOWN_MS } from '../constants/aiReportCooldown';

// ─── Tooltip nhỏ gọn, dùng lại ───────────────────────────────────────────────
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
                <span className={`absolute ${posClass} w-56 p-2.5 rounded-xl shadow-2xl text-[10px] font-semibold leading-relaxed z-[200] bg-[#1a222e] text-slate-300 border border-slate-700 pointer-events-none`}>
                    {text}
                </span>
            )}
        </span>
    );
}

// ─── Badge màu cảm xúc ───────────────────────────────────────────────────────
function SentimentBadge({ sentiment }) {
    if (sentiment === 'positive') return <span className="inline-flex items-center gap-0.5 text-[9px] font-black px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"><TrendingUp size={9}/>TÍCH CỰC</span>;
    if (sentiment === 'negative') return <span className="inline-flex items-center gap-0.5 text-[9px] font-black px-1.5 py-0.5 rounded-md bg-red-500/15 text-red-400 border border-red-500/20"><TrendingDown size={9}/>TIÊU CỰC</span>;
    return <span className="inline-flex items-center gap-0.5 text-[9px] font-black px-1.5 py-0.5 rounded-md bg-slate-500/15 text-slate-400 border border-slate-500/20"><Minus size={9}/>TRUNG LẬP</span>;
}

// ─── Label section nhỏ ───────────────────────────────────────────────────────
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

// ─── Card wrapper ─────────────────────────────────────────────────────────────
function Card({ children, className = '', isDark, accent = false, noPad = false }) {
    const base = isDark
        ? accent ? 'bg-[#0f1520] border-orange-500/25' : 'bg-[#131922] border-white/6'
        : accent ? 'bg-orange-50 border-orange-200' : 'bg-white border-slate-200';
    return (
        <div className={`rounded-2xl border ${noPad ? '' : 'p-4'} ${base} ${className}`}>
            {children}
        </div>
    );
}

// ─── Stat item: label + value ─────────────────────────────────────────────────
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

// ─── Mini stat box ────────────────────────────────────────────────────────────
function MiniStat({ label, value, valueClass = '', isDark }) {
    return (
        <div className={`rounded-xl p-3 flex flex-col items-center gap-0.5 ${isDark ? 'bg-black/30 border border-white/5' : 'bg-slate-50 border border-slate-200'}`}>
            <span className="text-[8px] font-black uppercase tracking-wider text-slate-400">{label}</span>
            <span className={`text-sm font-black ${valueClass}`}>{value}</span>
        </div>
    );
}

// ─── ScrollableColumn (giữ nguyên logic, cải thiện style) ─────────────────────
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
        isDark ? 'bg-slate-900/90 text-orange-400 border-orange-500/30' : 'bg-white/90 text-orange-600 border-orange-300'
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

// ─── Tab button cho mobile ────────────────────────────────────────────────────
function MobileTabBtn({ active, onClick, icon: Icon, label, isDark }) {
    return (
        <button
            onClick={onClick}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-black uppercase tracking-widest transition-all border-b-2 ${
                active
                    ? 'border-orange-500 text-orange-500'
                    : `border-transparent ${isDark ? 'text-slate-500 hover:text-slate-400' : 'text-slate-400 hover:text-slate-500'}`
            }`}
        >
            <Icon size={15} />
            {label}
        </button>
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
export default function DerivativesTab({
    derivNews, lastNewsSave, refreshingNews, handleRefreshDerivNews,
    aiDerivReport, analyzingDeriv, handleAiDerivAnalysis,
    isDark, UI,
    derivRadar, derivChartData,
    derivInterval, setDerivInterval,
    derivAnalysis, volumeProfile,
    showLeaderInfo, setShowLeaderInfo,
    showVolInfo, setShowVolInfo,
    addLog, handleExportDeriv, exportingDeriv,
    macroContext, lastAiDerivTime,
    currentUser, derivActionData,
}) {
    // MOBILE: 3 tab — radar/tin tức | chart+kỹ thuật | AI
    const [mobileTab, setMobileTab] = useState('chart');
    const [chartHeight, setChartHeight] = useState(() =>
        typeof window !== 'undefined' && window.innerWidth < 1024 ? 340 : 480
    );
    const dragStartY = useRef(null);
    const dragStartH = useRef(null);
    const [isChatOpen, setIsChatOpen] = useState(false);

    // ─── Kéo thả chart ─────────────────────────────────────────────────────
    const onChartDragStart = useCallback((e) => {
        e.preventDefault();
        document.body.style.userSelect = 'none';
        dragStartY.current = e.clientY;
        dragStartH.current = chartHeight;
        const onMouseMove = (ev) => {
            const delta = ev.clientY - dragStartY.current;
            setChartHeight(Math.min(800, Math.max(240, dragStartH.current + delta)));
        };
        const onMouseUp = () => {
            document.body.style.userSelect = '';
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    }, [chartHeight]);

    // ─── Helpers ───────────────────────────────────────────────────────────
    const changeNum = Number(derivRadar?.change) || 0;
    const basisNum = Number(derivRadar?.basis) || 0;
    const foreignNet = parseFloat(derivRadar?.foreignNet) || 0;
    const basisSpeed = parseFloat(derivRadar?.basisSpeed) || 0;
    const totalImpact = (derivRadar?.influencers || []).reduce((s, x) => s + (parseFloat(x.realImpact) || 0), 0);

    const aiStatusLabel = (() => {
        if (!lastAiDerivTime) return null;
        const elapsed = Date.now() - lastAiDerivTime;
        const canCall = elapsed >= AI_REPORT_COOLDOWN_MS;
        const remainMs = AI_REPORT_COOLDOWN_MS - elapsed;
        const remainMin = Math.floor(remainMs / 60000);
        const remainSec = Math.floor((remainMs % 60000) / 1000);
        return { canCall, time: new Date(lastAiDerivTime).toLocaleTimeString('vi-VN'), countdown: `${remainMin}:${String(remainSec).padStart(2, '0')}` };
    })();

    // ─── Colors ────────────────────────────────────────────────────────────
    const c = {
        up: 'text-emerald-400',
        down: 'text-red-400',
        neutral: 'text-slate-400',
        accent: 'text-orange-500',
        white: isDark ? 'text-white' : 'text-slate-800',
    };

    return (
        <div className="flex flex-col w-full h-full overflow-hidden">

            {/* ── MOBILE TAB BAR ──────────────────────────────────────────── */}
            <div className={`lg:hidden flex w-full shrink-0 border-b ${isDark ? 'bg-[#080C11] border-white/8' : 'bg-slate-50 border-slate-200'}`}>
                <MobileTabBtn isDark={isDark} active={mobileTab === 'radar'} onClick={() => setMobileTab('radar')} icon={Activity} label="Radar" />
                <MobileTabBtn isDark={isDark} active={mobileTab === 'chart'} onClick={() => setMobileTab('chart')} icon={BarChart3} label="Chart" />
                <MobileTabBtn isDark={isDark} active={mobileTab === 'ai'} onClick={() => setMobileTab('ai')} icon={BrainCircuit} label="AI" />
            </div>

            {/* ── MAIN LAYOUT ─────────────────────────────────────────────── */}
            <div className="flex-1 flex min-h-0 overflow-hidden">

                {/* ╔══════════════════════════════════════════════════════════╗
                    ║  CỘT TRÁI — Radar, Trụ dẫn dắt, Tin vĩ mô              ║
                    ╚══════════════════════════════════════════════════════════╝ */}
                <div className={`
                    ${mobileTab === 'radar' ? 'flex' : 'hidden'} lg:flex
                    w-full lg:w-[380px] xl:w-[420px] shrink-0
                    flex-col border-r overflow-hidden
                    transition-colors duration-300
                    ${isDark ? 'bg-[#080C11] border-white/8' : 'bg-slate-50 border-slate-200'}
                `}>
                    {/* ── PRICE HEADER ── */}
                    <div className={`px-5 py-4 border-b shrink-0 ${isDark ? 'border-white/8 bg-black/30' : 'border-slate-200 bg-white'}`}>
                        {/* Tiêu đề + giá */}
                        <div className="flex items-start justify-between mb-4">
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <h2 className="text-2xl font-black tracking-tight text-orange-500">VN30F1M</h2>
                                    <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-orange-500 text-white animate-pulse">LIVE</span>
                                </div>
                                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Hợp đồng tương lai VN30</p>
                            </div>
                            <div className="text-right">
                                <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-widest mb-0.5">Giá hiện tại</p>
                                <p className={`text-2xl font-black leading-none tabular-nums ${c.white}`}>{derivRadar?.vn30f1m || '---'}</p>
                                <div className={`flex items-center justify-end gap-1 mt-1 text-sm font-black ${changeNum >= 0 ? c.up : c.down}`}>
                                    {changeNum >= 0 ? <TrendingUp size={14}/> : <TrendingDown size={14}/>}
                                    {Math.abs(derivRadar?.change || 0)} ({derivRadar?.changePercent || 0}%)
                                </div>
                            </div>
                        </div>

                        {/* VN30 Index + Basis */}
                        <div className="grid grid-cols-2 gap-2.5">
                            <div className={`rounded-xl p-3 border flex flex-col items-center ${isDark ? 'bg-white/4 border-white/6' : 'bg-slate-50 border-slate-200'}`}>
                                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5">VN30 INDEX</span>
                                <span className={`text-base font-black ${c.white}`}>{derivRadar?.vn30 || '---'}</span>
                            </div>
                            <div className={`rounded-xl p-3 border flex flex-col items-center transition-all duration-500 ${
                                !derivRadar ? (isDark ? 'bg-white/4 border-white/6' : 'bg-slate-50 border-slate-200')
                                : basisNum >= 0 ? 'bg-emerald-500/10 border-emerald-500/25' : 'bg-red-500/10 border-red-500/25'
                            }`}>
                                <span className={`text-[9px] font-black uppercase tracking-widest mb-0.5 flex items-center gap-1 ${!derivRadar ? 'text-slate-400' : basisNum >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                    Basis
                                    <Tip text="Khoảng cách giữa giá F1M và VN30 Index. Basis dương = Future đang giao dịch cao hơn Index (kỳ vọng tăng)." side="bottom">
                                        <HelpCircle size={11} className="cursor-default" />
                                    </Tip>
                                </span>
                                <span className={`text-base font-black ${!derivRadar ? 'text-slate-400' : basisNum >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {basisNum > 0 ? `+${derivRadar.basis}` : derivRadar?.basis || '---'}
                                </span>
                            </div>
                        </div>

                        {/* OI + Khối ngoại */}
                        <div className="grid grid-cols-2 gap-2.5 mt-2.5">
                            <div className={`rounded-xl p-3 border flex flex-col ${isDark ? 'bg-white/4 border-white/6' : 'bg-white border-slate-200'}`}>
                                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5 flex items-center gap-1">
                                    Vị thế mở (OI)
                                    <Tip text="Open Interest — số hợp đồng đang mở. OI tăng = tiền mới đổ vào thị trường, tín hiệu xu hướng mạnh hơn." side="bottom">
                                        <HelpCircle size={11} className="cursor-default text-slate-500"/>
                                    </Tip>
                                </span>
                                <span className={`text-sm font-black tabular-nums ${c.white}`}>
                                    {(derivRadar && !isNaN(Number(derivRadar.oi))) ? Number(derivRadar.oi).toLocaleString('vi-VN') : '---'}
                                    <span className="text-[9px] font-semibold text-slate-500 ml-1">HĐ</span>
                                </span>
                            </div>
                            <div className={`rounded-xl p-3 border flex flex-col ${isDark ? 'bg-white/4 border-white/6' : 'bg-white border-slate-200'}`}>
                                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-0.5 flex items-center gap-1">
                                    Khối ngoại ròng
                                    <Tip text="Số HĐ Khối ngoại mua/bán ròng trong phiên. Mua ròng mạnh = tín hiệu Long đáng tin." side="bottom">
                                        <HelpCircle size={11} className="cursor-default text-slate-500"/>
                                    </Tip>
                                </span>
                                <span className={`text-sm font-black tabular-nums ${
                                    !derivRadar || isNaN(foreignNet) ? 'text-slate-400'
                                    : foreignNet > 0 ? c.up : foreignNet < 0 ? c.down : 'text-slate-400'
                                }`}>
                                    {(derivRadar && !isNaN(foreignNet))
                                        ? (foreignNet > 0 ? `+${Number(foreignNet).toLocaleString('vi-VN')}` : Number(foreignNet).toLocaleString('vi-VN'))
                                        : '---'
                                    }
                                    <span className="text-[9px] font-semibold text-slate-500 ml-1">HĐ</span>
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* ── TRỤ DẪN DẮT (cuộn được) ── */}
                    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                        <div className="px-5 pt-3.5 pb-2.5 shrink-0 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className={`text-[10px] font-black uppercase tracking-widest ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Trụ dẫn dắt VN30</span>
                                <Tip text="Theo dõi 10 mã vốn hóa lớn nhất VN30. Dùng để dự đoán nhịp kéo/xả nhân tạo nhằm điều tiết điểm số Phái sinh." side="bottom">
                                    <HelpCircle size={13} className="text-slate-500 hover:text-yellow-400 transition-colors cursor-default" />
                                </Tip>
                            </div>
                            <span className="text-[9px] font-black text-slate-500 uppercase">{(derivRadar?.influencers || []).length} mã</span>
                        </div>

                        <ScrollableColumn isDark={isDark} className="px-5 pb-3 space-y-2">
                            {(derivRadar?.influencers || []).map(stock => {
                                const chg = parseFloat(stock.change) || 0;
                                const barW = Math.min((Math.abs(chg) / 5) * 100, 100);
                                const isUp = chg >= 0;
                                const isNull = stock.change === null;
                                const impactNum = Number(stock.realImpact);

                                return (
                                    <div key={stock.symbol} className={`rounded-xl border px-3.5 py-2.5 transition-colors ${
                                        isDark
                                            ? isNull ? 'bg-white/3 border-white/5' : isUp ? 'bg-emerald-500/6 border-emerald-500/12' : 'bg-red-500/6 border-red-500/12'
                                            : isNull ? 'bg-slate-50 border-slate-200' : isUp ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'
                                    }`}>
                                        <div className="flex items-center justify-between mb-1.5">
                                            <span className="font-black text-[13px] text-yellow-500">{stock.symbol}</span>
                                            <div className="text-right">
                                                <div className={`text-sm font-black leading-none ${isNull ? 'text-slate-400' : isUp ? c.up : c.down}`}>
                                                    {isNull ? '---' : `${isUp ? '+' : ''}${chg}%`}
                                                </div>
                                                {!isNull && (
                                                    <div className={`text-[9px] font-bold mt-0.5 ${Number(stock.momentum) > 0 ? c.up : Number(stock.momentum) < 0 ? c.down : 'text-slate-500'}`}>
                                                        1p: {Number(stock.momentum) > 0 ? '+' : ''}{stock.momentum}%
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        {/* Thanh đối xứng */}
                                        <div className={`h-1.5 rounded-full flex relative ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`}>
                                            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-slate-500/40 z-10" />
                                            <div className="w-1/2 h-full relative">
                                                {!isUp && !isNull && <div className="absolute right-0 h-full bg-red-500 rounded-l-full transition-all duration-500" style={{ width: `${barW}%` }} />}
                                            </div>
                                            <div className="w-1/2 h-full relative">
                                                {isUp && !isNull && <div className="absolute left-0 h-full bg-emerald-500 rounded-r-full transition-all duration-500" style={{ width: `${barW}%` }} />}
                                            </div>
                                        </div>
                                        <p className={`text-[10px] font-bold mt-1 ${isNull ? 'text-slate-500' : impactNum >= 0 ? 'text-emerald-400/80' : 'text-red-400/80'}`}>
                                            Lực: {isNull ? '---' : `${impactNum > 0 ? '+' : ''}${stock.realImpact}`}
                                        </p>
                                    </div>
                                );
                            })}
                        </ScrollableColumn>
                    </div>

                    {/* ── TIN VĨ MÔ & SOCIAL ── */}
                    <div className={`shrink-0 border-t flex flex-col h-[280px] lg:h-[300px] ${isDark ? 'border-white/8' : 'border-slate-200'}`}>
                        <div className={`px-5 pt-3 pb-2 flex items-center justify-between shrink-0 ${isDark ? 'bg-black/20' : 'bg-slate-50/80'}`}>
                            <div className="flex items-center gap-2">
                                <Globe size={13} className="text-orange-500" />
                                <span className={`text-[10px] font-black uppercase tracking-widest ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Vĩ mô & Social Feed</span>
                            </div>
                            <div className="flex items-center gap-2">
                                {lastNewsSave && <span className="text-[9px] font-mono text-slate-500">{lastNewsSave}</span>}
                                <button
                                    onClick={handleRefreshDerivNews}
                                    disabled={refreshingNews}
                                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wide bg-orange-500/10 border border-orange-500/20 text-orange-400 hover:bg-orange-500 hover:text-white transition-all active:scale-95 disabled:opacity-50"
                                >
                                    <RefreshCw size={9} className={refreshingNews ? 'animate-spin' : ''} />
                                    {refreshingNews ? 'Đang lấy...' : 'Làm mới'}
                                </button>
                                <button
                                    onClick={handleExportDeriv}
                                    disabled={exportingDeriv || !derivRadar || !derivChartData}
                                    title="Xuất toàn bộ dữ liệu: giá, chỉ số kỹ thuật, tin tức, volume profile ra file JSON để AI phân tích"
                                    className="flex items-center gap-1 px-2 py-1 rounded-lg border text-[9px] font-black uppercase tracking-wide transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-white"
                                >
                                    <Database size={9} className={exportingDeriv ? 'animate-pulse' : ''} />
                                    {exportingDeriv ? 'Đang xuất...' : 'JSON'}
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-5 pb-3 space-y-1.5 pt-1">
                            {(!derivNews || derivNews.length === 0) ? (
                                <div className="flex flex-col items-center justify-center h-full opacity-50">
                                    <Globe size={18} className="mb-2 text-orange-500 animate-bounce" />
                                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Đang nạp bản tin...</p>
                                </div>
                            ) : derivNews.map((n, i) => (
                                <a key={i} href={n.link} target="_blank" rel="noreferrer"
                                    className={`group flex flex-col gap-1.5 p-3 rounded-xl border transition-all ${isDark ? 'bg-black/30 border-white/5 hover:border-orange-500/30 hover:bg-orange-500/5' : 'bg-white border-slate-200 hover:border-orange-300'}`}>
                                    <div className="flex items-start justify-between gap-2">
                                        <p className={`text-[11px] font-semibold leading-snug line-clamp-2 flex-1 ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>{n.title}</p>
                                        <ExternalLink size={10} className="text-slate-400 opacity-0 group-hover:opacity-100 mt-0.5 shrink-0 transition-opacity" />
                                    </div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <SentimentBadge sentiment={n.sentiment} />
                                        <span className={`text-[9px] font-black uppercase ${n.source?.includes('Reddit') ? 'text-orange-400' : n.source?.includes('Facebook') ? 'text-blue-400' : 'text-slate-500'}`}>
                                            {n.source}
                                        </span>
                                        <span className="text-[9px] font-mono text-slate-500 ml-auto">
                                            {new Date(n.timestamp).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                </a>
                            ))}
                        </div>
                    </div>
                </div>

                {/* ╔══════════════════════════════════════════════════════════╗
                    ║  CỘT PHẢI — Chart + AI Execution Engine                 ║
                    ╚══════════════════════════════════════════════════════════╝ */}
                <div className={`
                    ${mobileTab === 'chart' || mobileTab === 'ai' ? 'flex' : 'hidden'} lg:flex
                    flex-1 min-w-0 flex-col overflow-y-auto lg:overflow-hidden
                    transition-colors duration-300 custom-scrollbar
                    ${isDark ? 'bg-[#080C11]' : 'bg-slate-100'}
                `}>
                    {/* ── CHART AREA ── */}
                    <div className={`
                        ${mobileTab === 'ai' ? 'hidden lg:block' : 'block'}
                        shrink-0 p-4 lg:p-5
                    `}>
                        <div className="flex gap-4 lg:gap-5">
                            {/* Chart chính */}
                            <div className={`flex-1 min-w-0 rounded-2xl border overflow-hidden shadow-lg relative flex items-center justify-center ${isDark ? 'bg-black/50 border-orange-500/15' : 'bg-white border-orange-200'}`}
                                style={{ height: chartHeight + 'px' }}>
                                {derivChartData
                                    ? <TradingChart data={derivChartData} theme={isDark ? 'dark' : 'light'} accent="yellow" onIntervalChange={setDerivInterval} currentInterval={derivInterval} />
                                    : <AtomLoader message="ĐANG ĐỒNG BỘ CHART PHÁI SINH..." />
                                }
                                {/* Drag handle */}
                                <div
                                    onMouseDown={onChartDragStart}
                                    className={`absolute bottom-0 left-0 right-0 h-7 cursor-ns-resize hidden lg:flex items-center justify-center group transition-colors ${isDark ? 'hover:bg-white/4' : 'hover:bg-black/3'}`}
                                    title="Kéo để thay đổi chiều cao chart"
                                >
                                    <div className={`flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity ${isDark ? 'text-orange-400' : 'text-orange-500'}`}>
                                        <GripHorizontal size={16} />
                                        <span className="text-[9px] font-black uppercase tracking-widest select-none">Kéo để thay đổi kích thước</span>
                                    </div>
                                </div>
                            </div>

                            {/* Volume Profile */}
                            <div className={`hidden lg:flex w-[140px] xl:w-[160px] shrink-0 rounded-2xl border shadow-sm p-3.5 flex-col relative ${isDark ? 'bg-black/30 border-white/5' : 'bg-white border-slate-200'}`}
                                style={{ height: chartHeight + 'px' }}>
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Vol Profile</span>
                                    <Tip text="Biểu đồ bức tường khối lượng (Intraday). Các mức giá xảy ra nhiều giao dịch nhất trong ngày — nơi giá hay quay về." side="bottom">
                                        <HelpCircle size={12} className="text-orange-500 cursor-default" />
                                    </Tip>
                                </div>
                                <div className="flex-1 flex flex-col gap-0.5 justify-around min-h-0 overflow-hidden">
                                    {volumeProfile ? volumeProfile.bins.map((bin, idx) => (
                                        <div key={idx} className="flex items-center gap-1.5">
                                            <span className={`text-[9px] font-mono w-9 shrink-0 ${bin.priceCenter == volumeProfile.pocPrice ? 'text-orange-500 font-black' : 'text-slate-500'}`}>
                                                {bin.priceCenter}
                                            </span>
                                            <div className={`flex-1 h-2.5 rounded-sm overflow-hidden ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`}>
                                                <div
                                                    className={`h-full transition-all duration-500 ${bin.priceCenter == volumeProfile.pocPrice ? 'bg-orange-500' : 'bg-orange-500/40'}`}
                                                    style={{ width: `${(bin.volume / volumeProfile.maxVol) * 100}%` }}
                                                />
                                            </div>
                                        </div>
                                    )) : (
                                        <div className="flex flex-col items-center justify-center h-full opacity-70">
                                            <div className="scale-50 -my-8"><AtomLoader message=""/></div>
                                            <p className="text-[9px] text-slate-500 mt-2">Đọc POC...</p>
                                        </div>
                                    )}
                                </div>
                                {volumeProfile && (
                                    <p className="text-[10px] font-black text-orange-500 mt-2 text-center">
                                        POC: {volumeProfile.pocPrice}
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* ── AI SCALPING ENGINE (3 cột kỹ thuật) ── */}
                    <div className={`flex-none lg:flex-1 mx-4 lg:mx-5 mb-4 lg:mb-5 rounded-2xl border overflow-hidden flex flex-col min-h-0 transition-all duration-300 ${isDark ? 'bg-[#0d1219] border-orange-500/20 shadow-[0_0_40px_rgba(249,115,22,0.06)]' : 'bg-white border-orange-200'}`}>
                        {/* Panel header */}
                        <div className={`flex items-center gap-3 px-5 py-3.5 border-b shrink-0 ${isDark ? 'border-white/6 bg-black/20' : 'border-orange-100 bg-orange-50/60'}`}>
                            <div className="w-8 h-8 rounded-xl bg-orange-500 flex items-center justify-center shadow-md shadow-orange-500/30">
                                <BrainCircuit size={16} className="text-white"/>
                            </div>
                            <div className="flex-1 min-w-0">
                                <h4 className={`text-sm font-black uppercase tracking-widest leading-none ${c.white}`}>AI Scalping Engine</h4>
                                <p className="text-[9px] font-bold text-orange-500 mt-0.5">Derivatives Execution Flow · Real-time</p>
                            </div>
                            <div className="flex items-center gap-2">
                                {/* Mobile: chỉ hiện khi ở tab 'ai' */}
                                <div className={`lg:hidden flex items-center gap-1.5 ${mobileTab === 'chart' ? 'flex' : 'hidden'}`}>
                                    <button onClick={() => setMobileTab('ai')} className="text-[9px] font-black text-orange-400 uppercase tracking-wide px-2 py-1 rounded-lg bg-orange-500/10 border border-orange-500/20">
                                        Xem AI →
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* 3 cột nội dung */}
                        <div className={`
                            ${mobileTab === 'chart' ? 'hidden lg:grid' : 'grid'}
                            flex-none lg:flex-1 grid-cols-1 lg:grid-cols-3 gap-0 divide-y lg:divide-y-0 lg:divide-x
                            min-h-0 lg:overflow-hidden
                            ${isDark ? 'divide-white/6' : 'divide-orange-100'}
                        `}>

                            {/* ── COL 1: ORDER FLOW & MACRO ── */}
                            <ScrollableColumn isDark={isDark} className="p-4 pb-6 flex flex-col gap-4">
                                <SectionLabel icon={Database} label="Order Flow & Macro Matrix" color="text-purple-400"
                                    action={<span className="text-[9px] font-black text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded">Quant</span>} />

                                {/* Bid/Ask Imbalance */}
                                <Card isDark={isDark}>
                                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2.5 flex items-center gap-1">
                                        Độ lệch sổ lệnh (Bid/Ask)
                                        <Tip text="Tỷ lệ áp lực mua/bán tức thời trên sổ lệnh. Bid &gt; Ask = phe Long đang chiếm ưu thế.">
                                            <HelpCircle size={11} className="text-slate-500 cursor-default" />
                                        </Tip>
                                    </p>
                                    <div className="flex justify-between text-[10px] font-black mb-1.5">
                                        <span className={c.up}>BID 54%</span>
                                        <span className={c.down}>ASK 46%</span>
                                    </div>
                                    <div className={`flex h-2 rounded-full overflow-hidden ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`}>
                                        <div className="bg-emerald-500 h-full transition-all shadow-[0_0_6px_rgba(16,185,129,0.4)]" style={{ width: '54%' }} />
                                        <div className="bg-red-500 h-full" style={{ width: '46%' }} />
                                    </div>
                                    <p className="text-[9px] font-semibold italic mt-1.5 text-right text-slate-500">Phe Long đang giữ tường mua chủ động</p>
                                </Card>

                                {/* Whale Sweep */}
                                <Card isDark={isDark}>
                                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-1">
                                        Quét lệnh cá mập (&gt;50 HĐ)
                                        <Tip text="Lệnh đơn lẻ có khối lượng &gt;50 HĐ — dấu hiệu tổ chức đang ra/vào vị thế. Nhiều SWEEP LONG liên tiếp = tín hiệu tích cực.">
                                            <HelpCircle size={11} className="text-slate-500 cursor-default" />
                                        </Tip>
                                    </p>
                                    <div className="space-y-1.5 max-h-[100px] overflow-y-auto custom-scrollbar pr-0.5">
                                        {[
                                            { type: 'LONG', time: '14:42:10', vol: '+120 HĐ' },
                                            { type: 'SHORT', time: '14:41:05', vol: '−65 HĐ' },
                                            { type: 'LONG', time: '14:38:50', vol: '+80 HĐ' },
                                            { type: null, time: '14:35:12', vol: '---' },
                                        ].map((s, i) => (
                                            <div key={i} className={`flex justify-between items-center px-2 py-1 rounded-lg text-[10px] font-black font-mono ${
                                                s.type === 'LONG' ? (isDark ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-100 text-emerald-700')
                                                : s.type === 'SHORT' ? (isDark ? 'bg-red-500/10 text-red-400' : 'bg-red-100 text-red-700')
                                                : (isDark ? 'bg-white/4 text-slate-500' : 'bg-slate-100 text-slate-500')
                                            }`}>
                                                <span>[{s.time}] {s.type ? `SWEEP ${s.type}` : 'NO LARGE'}</span>
                                                <span>{s.vol}</span>
                                            </div>
                                        ))}
                                    </div>
                                </Card>

                                {/* Macro Context */}
                                <Card isDark={isDark}>
                                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Cảnh báo vĩ mô & Liên thị trường</p>
                                    <StatRow label="Đáo hạn Phái sinh:" value={macroContext?.expiryLabel || 'Còn 4 ngày'} valueClass="text-yellow-400" />
                                    <StatRow label="Sức mạnh USD (DXY):" value={`${macroContext?.dxy?.value || '104.2'} (${macroContext?.dxy?.changePercent >= 0 ? '+' : ''}${macroContext?.dxy?.changePercent || '+0.25'}%)`} valueClass={parseFloat(macroContext?.dxy?.change) >= 0 ? c.down : c.up} />
                                    <StatRow label="Dow Jones Futures:" value={`${parseFloat(macroContext?.dowFutures?.change) >= 0 ? '+' : ''}${macroContext?.dowFutures?.change || '+180.5'} đ`} valueClass={parseFloat(macroContext?.dowFutures?.change) >= 0 ? c.up : c.down} />
                                    <StatRow label="USD/VND (VCB):" value={macroContext?.usdVnd?.official || '25.480'} valueClass={c.down} />
                                </Card>

                                {/* Confluence Score */}
                                <Card isDark={isDark} accent>
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1">
                                            Confluence Score
                                            <Tip text="Điểm tổng hợp 0–100 từ các chỉ báo kỹ thuật và dòng tiền. &gt;60 = xu hướng rõ, &lt;40 = thị trường không có định hướng.">
                                                <HelpCircle size={11} className="text-slate-500 cursor-default" />
                                            </Tip>
                                        </span>
                                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg ${derivAnalysis.bgColor}`}>{derivAnalysis.mechTrend}</span>
                                    </div>
                                    <div className="flex items-center gap-2.5">
                                        <div className={`flex-1 h-3 rounded-full overflow-hidden ${isDark ? 'bg-black/40' : 'bg-slate-200'}`}>
                                            <div className="h-full bg-orange-500 transition-all duration-700 rounded-full" style={{ width: `${derivAnalysis.score}%` }} />
                                        </div>
                                        <span className="text-[13px] font-black text-orange-500 w-10 text-right tabular-nums">{derivAnalysis.score}</span>
                                    </div>
                                </Card>
                            </ScrollableColumn>

                            {/* ── COL 2: CHỈ BÁO KỸ THUẬT ── */}
                            <ScrollableColumn isDark={isDark} className="p-4 pb-6 flex flex-col gap-4">
                                <SectionLabel icon={Activity} label={`Chỉ báo định lượng — ${derivAnalysis.mechAction}`} color={derivAnalysis.mechColor} />

                                {/* Entry / SL / TP */}
                                <Card isDark={isDark} accent>
                                    <div className="grid grid-cols-2 gap-2 mb-3">
                                        <MiniStat isDark={isDark} label="ENTRY" value={(parseFloat(derivRadar?.vn30f1m) || 0).toFixed(1)} valueClass={c.white} />
                                        <MiniStat isDark={isDark} label="SL (−1.5 ATR)" value={derivAnalysis.sl} valueClass={c.down} />
                                        <MiniStat isDark={isDark} label="TP1 (1R)" value={derivAnalysis.tp1} valueClass={c.up} />
                                        <MiniStat isDark={isDark} label="TP2 (2.2R)" value={derivAnalysis.tp2} valueClass="text-emerald-300" />
                                    </div>
                                    {/* R:R Ratio */}
                                    <div className={`flex items-center justify-between px-3 py-2 rounded-xl ${isDark ? 'bg-black/20' : 'bg-white border border-slate-200'}`}>
                                        <span className={`text-[10px] font-black uppercase flex items-center gap-1 ${isDark ? 'text-yellow-400' : 'text-orange-600'}`}>
                                            R:R Ratio
                                            <Tip text="Risk/Reward — lợi nhuận TP1 chia cho rủi ro SL. Lý tưởng &gt; 1:1. Dưới 1:1 cần Winrate cực cao để có lãi dài hạn.">
                                                <HelpCircle size={11} className="text-slate-400 cursor-default" />
                                            </Tip>
                                        </span>
                                        <span className={`text-base font-black ${c.white}`}>1 : {derivAnalysis.rrRatio}</span>
                                    </div>
                                </Card>

                                {/* Signal badges */}
                                <div>
                                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-2">Tín hiệu tổng hợp</p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {[
                                            { label: `EMA3 ${derivAnalysis.shortTermTrend === 1 ? '↑' : '↓'} EMA8`, ok: true },
                                            { label: `OI ${derivAnalysis.oiInterpretation?.label}`, ok: derivAnalysis.oiUp },
                                            { label: `Ngoại ${(parseFloat(derivRadar?.foreignNet) || 0) >= 0 ? 'MUA' : 'BÁN'} ${Math.abs(parseFloat(derivRadar?.foreignNet) || 0)} HĐ`, ok: (parseFloat(derivRadar?.foreignNet) || 0) >= 0 },
                                            { label: `Trụ ${(derivAnalysis.totalImpact || 0) >= 0 ? '+' : ''}${Number(derivAnalysis.totalImpact || 0).toFixed(2)} đ`, ok: (parseFloat(derivAnalysis.totalImpact) || 0) >= 0 },
                                            { label: `POC ${derivAnalysis.pocDistance}`, ok: true },
                                            { label: `Score ${derivAnalysis.score}/100`, ok: derivAnalysis.score >= 50 },
                                        ].map((b, i) => (
                                            <span key={i} className={`text-[9px] font-black px-2.5 py-1 rounded-full ${
                                                b.ok
                                                    ? isDark ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                                                    : isDark ? 'bg-red-500/15 text-red-400 border border-red-500/20' : 'bg-red-100 text-red-700 border border-red-200'
                                            }`}>
                                                {b.ok ? '✓' : '✗'} {b.label}
                                            </span>
                                        ))}
                                    </div>
                                </div>

                                <p className={`text-[11px] italic leading-relaxed font-medium ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{derivAnalysis.mechReason}</p>

                                {/* ATR Visual */}
                                <Card isDark={isDark}>
                                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2.5 flex items-center gap-1">
                                        Biến động ATR
                                        <Tip text="Average True Range — biên độ dao động trung bình N nến gần nhất. ATR cao → SL/TP cần đặt xa hơn. Hệ thống dùng ATR×1.5 cho SL, ATR×1.0/2.2 cho TP.">
                                            <HelpCircle size={11} className="text-slate-500 cursor-default" />
                                        </Tip>
                                    </p>
                                    <div className="flex justify-between text-[10px] font-bold mb-2">
                                        <span className="text-slate-400">ATR hiện tại</span>
                                        <span className="text-orange-500 font-black">{derivAnalysis.atr} điểm</span>
                                    </div>
                                    <div className={`w-full h-2.5 rounded-full ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`}>
                                        <div className="h-full bg-orange-500 rounded-full transition-all duration-700"
                                            style={{ width: `${Math.min((parseFloat(derivAnalysis.atr) || 0) / 10 * 100, 100)}%` }} />
                                    </div>
                                    <div className="flex justify-between text-[9px] mt-1 text-slate-500">
                                        <span>Thấp</span><span>Cao (10 đ)</span>
                                    </div>
                                </Card>

                                {/* Biến số động lực học */}
                                <Card isDark={isDark}>
                                    <SectionLabel icon={Activity} label="Biến số động lực học" color="text-yellow-400" />
                                    {[
                                        { label: 'Tốc độ xé Basis:', val: `${basisSpeed > 0 ? '+' : ''}${derivRadar?.basisSpeed || 0} đ/nhịp`, color: basisSpeed > 0 ? c.up : basisSpeed < 0 ? c.down : c.neutral, tip: 'Tốc độ thu hẹp/mở rộng khoảng cách F1M vs VN30 Index. Basis xé nhanh → dòng tiền đang chạy mạnh về một phía.' },
                                        { label: 'Tổng lực 10 Trụ:', val: `${totalImpact > 0 ? '+' : ''}${totalImpact.toFixed(2)} đ`, color: totalImpact > 0 ? c.up : c.down, tip: 'Tổng điểm tác động thực tế của 10 mã vốn hóa lớn nhất lên VN30. Âm = sức kéo xuống.' },
                                        { label: 'Vùng kẹt POC:', val: volumeProfile?.pocPrice ? parseFloat(volumeProfile.pocPrice).toFixed(1) : 'Đang tính...', color: c.white, tip: 'Point of Control — mức giá có khối lượng lớn nhất phiên. Giá hay bị hút về đây.' },
                                        { label: 'Xu thế OI:', val: derivRadar?.oiTrend || 'ĐANG QUÉT...', color: c.accent, tip: 'OI tăng = tiền mới vào thị trường. OI giảm = đang đóng vị thế hàng loạt.' },
                                        { label: 'Ngoại ròng:', val: `${foreignNet > 0 ? '+' : ''}${derivRadar?.foreignNet || 0} HĐ`, color: foreignNet > 0 ? c.up : c.down, tip: 'Số HĐ Khối ngoại mua/bán ròng. Ngoại mua ròng mạnh = tín hiệu Long đáng tin.' },
                                    ].map((item, idx) => (
                                        <StatRow key={idx} label={<span className="flex items-center gap-1">{item.label}<Tip text={item.tip}><HelpCircle size={10} className="text-slate-500 cursor-default" /></Tip></span>} value={item.val} valueClass={item.color} />
                                    ))}
                                    <StatRow label="VWAP:" value={`${derivAnalysis.vwap} (${(parseFloat(derivRadar?.vn30f1m) || 0) >= parseFloat(derivAnalysis.vwap) ? 'TRÊN ↑' : 'DƯỚI ↓'})`} valueClass={(parseFloat(derivRadar?.vn30f1m) || 0) >= parseFloat(derivAnalysis.vwap) ? c.up : c.down} />
                                    <StatRow label="CVD:" value={`${(derivAnalysis.cvd || 0) >= 0 ? '+' : ''}${Number(derivAnalysis.cvd || 0).toLocaleString('vi-VN')} HĐ`} valueClass={(derivAnalysis.cvd || 0) >= 0 ? c.up : c.down} />
                                    <StatRow label="OI Signal:" value={derivAnalysis.oiInterpretation.label} valueClass={derivAnalysis.oiInterpretation.color} />
                                </Card>

                                {/* Biên phiên */}
                                <Card isDark={isDark}>
                                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Biên phiên hôm nay</p>
                                    <StatRow label="High phiên" value={derivAnalysis.sessionHigh} valueClass={c.up} />
                                    <StatRow label="Low phiên" value={derivAnalysis.sessionLow} valueClass={c.down} />
                                    <StatRow label="VWAP" value={derivAnalysis.vwap} valueClass="text-yellow-400" />
                                </Card>

                                {/* Nút phân tích lại */}
                                <button
                                    onClick={() => handleAiDerivAnalysis(true)}
                                    disabled={analyzingDeriv}
                                    title="Bỏ qua cache, ép AI phân tích lại ngay lập tức dù chưa đủ 1.5 giờ hoặc chưa có biến động lớn"
                                    className={`w-full py-2 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all disabled:opacity-30 active:scale-95 ${isDark ? 'border-white/10 text-slate-400 hover:border-orange-500/40 hover:text-orange-400' : 'border-slate-200 text-slate-400 hover:border-orange-300 hover:text-orange-500'}`}
                                >
                                    ↻ Phân tích lại ngay
                                </button>
                            </ScrollableColumn>

                            {/* ── COL 3: AI STRATEGY PANEL ── */}
                            <ScrollableColumn isDark={isDark} className="p-4 pb-6 flex flex-col gap-4">
                                <SectionLabel icon={BrainCircuit} label="AI Strategy Panel" color="text-orange-500" />

                                {/* AI Action Card */}
                                {derivActionData ? (
                                    <div className={`rounded-2xl border p-4 relative overflow-hidden ${
                                        derivActionData.action === 'LONG' ? isDark ? 'bg-emerald-900/20 border-emerald-500/25' : 'bg-emerald-50 border-emerald-300'
                                        : derivActionData.action === 'SHORT' ? isDark ? 'bg-red-900/20 border-red-500/25' : 'bg-red-50 border-red-300'
                                        : isDark ? 'bg-slate-800/50 border-slate-600' : 'bg-slate-100 border-slate-300'
                                    }`}>
                                        <div className="flex items-center gap-2 mb-3">
                                            <BrainCircuit size={14} className={derivActionData.action === 'LONG' ? 'text-emerald-500' : derivActionData.action === 'SHORT' ? 'text-red-500' : 'text-slate-500'} />
                                            <span className={`text-[10px] font-black uppercase tracking-widest ${derivActionData.action === 'LONG' ? 'text-emerald-500' : derivActionData.action === 'SHORT' ? 'text-red-500' : 'text-slate-500'}`}>
                                                AI Nhận định — {derivActionData.action || 'QUAN SÁT'}
                                            </span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2 mb-3">
                                            <MiniStat isDark={isDark} label="ENTRY" value={derivActionData.entry || '---'} valueClass={c.white} />
                                            <MiniStat isDark={isDark} label="DỪNG LỖ (SL)" value={derivActionData.sl || '---'} valueClass={c.down} />
                                            <div className={`col-span-2 rounded-xl p-3 flex flex-col items-center ${isDark ? 'bg-black/30 border border-white/5' : 'bg-slate-50 border border-slate-200'}`}>
                                                <span className="text-[8px] font-black uppercase tracking-wider text-slate-400 mb-0.5">CHỐT LỜI (TP MỤC TIÊU)</span>
                                                <span className={`text-sm font-black ${c.up}`}>{derivActionData.tp || '---'}</span>
                                            </div>
                                        </div>
                                        <div className={`p-3 rounded-xl ${isDark ? 'bg-black/25' : 'bg-white/60 border border-white'}`}>
                                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">Lý do nhận định</span>
                                            <p className={`text-[11px] leading-relaxed font-medium ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                                                {derivActionData.reason || 'AI đang tổng hợp dữ liệu...'}
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className={`rounded-2xl border p-6 flex flex-col items-center justify-center text-center ${isDark ? 'bg-[#131922] border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                                        <BrainCircuit size={28} className={`mb-3 ${isDark ? 'text-slate-600' : 'text-slate-300'}`} />
                                        <p className={`text-[10px] font-black uppercase tracking-widest ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>AI Strategy Panel</p>
                                        <p className="text-[9px] mt-1.5 text-slate-500 leading-relaxed">Bấm nút bên dưới để AI sinh kế hoạch giao dịch dựa trên Vĩ mô & Kỹ thuật.</p>
                                    </div>
                                )}

                                {/* AI Timer status */}
                                {aiStatusLabel && (
                                    <div className={`text-center rounded-xl px-3 py-2 ${isDark ? 'bg-black/20' : 'bg-slate-50 border border-slate-200'}`}>
                                        <p className={`text-[9px] font-mono ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                                            Phân tích gần nhất: {aiStatusLabel.time}
                                        </p>
                                        {aiStatusLabel.canCall
                                            ? <p className={`text-[9px] font-black uppercase tracking-wide mt-0.5 ${c.up}`}>✓ Sẵn sàng phân tích mới</p>
                                            : <p className="text-[9px] font-mono text-orange-400 mt-0.5">Tối ưu sau: {aiStatusLabel.countdown} (hoặc bấm ↻ để chạy ngay)</p>
                                        }
                                    </div>
                                )}

                                {/* CTA buttons */}
                                {analyzingDeriv ? (
                                    <div className={`rounded-xl overflow-hidden border ${isDark ? 'bg-slate-800/60 border-orange-500/20' : 'bg-orange-50 border-orange-200'}`}>
                                        <AtomLoader message="ĐANG PACK DỮ LIỆU CHO AI..." />
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => handleAiDerivAnalysis(false)}
                                        className="w-full h-12 rounded-xl flex items-center justify-center gap-2 font-black text-[11px] uppercase tracking-widest transition-all shadow-lg bg-orange-500 hover:bg-orange-400 text-white shadow-orange-500/25 active:scale-95"
                                    >
                                        <BrainCircuit size={16} className="animate-pulse" />
                                        AI lập kế hoạch vào lệnh
                                    </button>
                                )}

                                <button
                                    onClick={() => setIsChatOpen(true)}
                                    className={`w-full h-11 rounded-xl flex items-center justify-center gap-2 font-black text-[11px] uppercase tracking-widest transition-all border shadow-sm active:scale-95 ${isDark ? 'bg-orange-500/10 text-orange-400 border-orange-500/30 hover:bg-orange-500/20' : 'bg-orange-50 text-orange-600 border-orange-200 hover:bg-orange-100'}`}
                                >
                                    <BrainCircuit size={15} />
                                    {aiDerivReport ? 'Chat với AI về phái sinh' : 'Hỏi AI về phái sinh'}
                                </button>

                                {/* AI Report */}
                                {aiDerivReport && (
                                    <div className={`rounded-2xl border p-4 ${isDark ? 'bg-[#0a0e14] border-orange-500/20' : 'bg-white border-orange-200 shadow-inner'}`}>
                                        <p className="text-[9px] font-black uppercase tracking-widest text-orange-500/70 mb-3">Báo cáo phân tích AI</p>
                                        <div className={`prose max-w-none prose-sm prose-headings:text-orange-500 prose-headings:font-black prose-headings:uppercase prose-p:leading-relaxed prose-strong:text-emerald-400 prose-li:text-[11px] ${isDark ? 'prose-invert prose-p:text-slate-300' : 'prose-p:text-slate-700'}`}>
                                            <ReactMarkdown>{aiDerivReport}</ReactMarkdown>
                                        </div>
                                    </div>
                                )}
                            </ScrollableColumn>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── CHAT MODAL ── */}
            <StockAiChat
                isOpen={isChatOpen}
                onClose={() => setIsChatOpen(false)}
                ticker="VN30F1M"
                companyName="Hợp đồng tương lai VN30"
                aiReport={aiDerivReport}
                isDark={isDark}
                currentUser={currentUser}
            />
        </div>
    );
}