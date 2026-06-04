import { Activity, Zap, HelpCircle, BarChart3, BrainCircuit, Database, Globe, RefreshCw } from 'lucide-react';
import TradingChart from './TradingChart';
import AtomLoader from './AtomLoader';
import ReactMarkdown from 'react-markdown';
import { useState, useEffect, useRef, useCallback } from 'react';
import StockAiChat from './StockAiChat';
// Component mini: Scrollable Signal
function ScrollableColumn({ children, className, isDark }) {
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
            if (scrollRef.current.firstElementChild) {
                observer.observe(scrollRef.current.firstElementChild);
            }
        }
        return () => observer.disconnect();
    }, [checkScroll]);

    useEffect(() => { checkScroll(); }, [children, checkScroll]);
    const scrollByAmount = (amount) => {
        if (scrollRef.current) {
            scrollRef.current.scrollBy({ top: amount, behavior: 'smooth' });
        }
    };

    return (
        <div className="relative h-auto lg:h-full flex flex-col min-h-0 w-full group/scroller">
            {}
            {canScrollUp && (
                <div className="hidden lg:flex absolute top-0 left-0 right-3 justify-center z-20 pointer-events-none">
                    <button 
                        onClick={() => scrollByAmount(-250)}
                        title="Cuộn lên"
                        className={`pointer-events-auto mt-2 p-2 rounded-full shadow-md transition-all duration-300 animate-bounce cursor-pointer border hover:scale-110 ${
                            isDark 
                                ? 'bg-slate-800 text-orange-500 border-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.3)]' 
                                : 'bg-white text-orange-600 border-orange-500 shadow-orange-500/30'
                        }`}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M18 15l-6-6-6 6"/></svg>
                    </button>
                </div>
            )}
            
            {}
            <div ref={scrollRef} onScroll={checkScroll} className={`flex-none lg:flex-1 lg:overflow-y-auto custom-scrollbar ${className}`}>
                {children}
            </div>

            {}
            {canScrollDown && (
                <div className="hidden lg:flex absolute bottom-0 left-0 right-3 justify-center z-20 pointer-events-none">
                    <button 
                        onClick={() => scrollByAmount(250)}
                        title="Cuộn xuống"
                        className={`pointer-events-auto mb-2 p-2 rounded-full shadow-md transition-all duration-300 animate-bounce cursor-pointer border hover:scale-110 ${
                            isDark 
                                ? 'bg-slate-800 text-orange-500 border-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.3)]' 
                                : 'bg-white text-orange-600 border-orange-500 shadow-orange-500/30'
                        }`}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6"/></svg>
                    </button>
                </div>
            )}
        </div>
    );
}

export default function DerivativesTab({
  derivNews,
  lastNewsSave,
  refreshingNews,
  handleRefreshDerivNews,
  aiDerivReport, 
  analyzingDeriv, 
  handleAiDerivAnalysis,
  isDark, UI,
  derivRadar,
  derivChartData,
  derivInterval, setDerivInterval,
  derivAnalysis,
  volumeProfile,
  showLeaderInfo, setShowLeaderInfo,
  showVolInfo, setShowVolInfo,
  addLog,
  handleExportDeriv,
  exportingDeriv,
  macroContext,   
  lastAiDerivTime,
  currentUser,
  derivActionData, 
}) {
const [mobileTab, setMobileTab] = useState('ai');
    // USESTATE
const [chartHeight, setChartHeight] = useState(() => typeof window !== 'undefined' && window.innerWidth < 1024 ? 380 : 500);
const dragStartY = useRef(null);
const dragStartH = useRef(null);
const [isChatOpen, setIsChatOpen] = useState(false);
const onChartDragStart = useCallback((e) => {
    e.preventDefault();  
    document.body.style.userSelect = 'none';
    dragStartY.current  = e.clientY;
    dragStartH.current  = chartHeight;
 
    const onMouseMove = (ev) => {
        
        const delta = ev.clientY - dragStartY.current;
         setChartHeight(Math.min(750, Math.max(280, dragStartH.current + delta)));
    };
    const onMouseUp = () => {
        document.body.style.userSelect = '';
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
}, [chartHeight]);

  return (
    <div className="flex flex-col w-full h-full overflow-hidden">
      {/* MOBILE TABS */}
      <div className={`lg:hidden flex w-full border-b shrink-0 ${isDark ? 'bg-[#080C11] border-white/10' : 'bg-slate-50 border-slate-200'} z-50`}>
        <button onClick={() => setMobileTab('radar')} className={`flex-1 py-3.5 text-[11px] font-black uppercase tracking-widest border-b-[3px] transition-colors ${mobileTab === 'radar' ? 'border-orange-500 text-orange-500 bg-orange-500/10' : 'border-transparent text-slate-500 hover:text-slate-400'}`}>Radar & Tin</button>
        <button onClick={() => setMobileTab('ai')} className={`flex-1 py-3.5 text-[11px] font-black uppercase tracking-widest border-b-[3px] transition-colors ${mobileTab === 'ai' ? 'border-orange-500 text-orange-500 bg-orange-500/10' : 'border-transparent text-slate-500 hover:text-slate-400'}`}>Omni AI</button>
      </div>

      <div className="flex-1 flex flex-row w-full min-h-0 overflow-hidden relative">
        {/* CỘT TRÁI PHÁI SINH: VN30 ENGINE , BASIS RADAR , NEWS*/}
            <div className={`${mobileTab === 'radar' ? 'flex' : 'hidden'} lg:flex w-full lg:w-[450px] border-r flex-col shrink-0 overflow-y-auto lg:overflow-hidden relative h-full transition-colors duration-300 ${UI.leftCol} animate-in fade-in slide-in-from-left-4 custom-scrollbar`}>
                
                {/*  1. HEADER CARD: GIÁ & BASIS */}
                    <div className={`p-6 border-b shadow-sm relative transition-colors duration-300 ${UI.card}`}>
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <div className="flex items-end gap-2">
                                    <h2 className="text-4xl font-black tracking-tighter text-orange-500 leading-none">VN30F1M</h2>
                                    <span className="p-1 px-2 bg-orange-500/10 text-orange-500 rounded text-[10px] font-black uppercase tracking-widest mb-1">LIVE</span>
                                </div>
                                <p className={`text-[11px] font-bold mt-2 uppercase tracking-widest ${UI.textMuted}`}>Hợp đồng tương lai VN30</p>
                            </div>

                            <div className="text-right">
                                <p className={`text-[10px] uppercase tracking-widest font-black mb-1 ${UI.textMuted}`}>Giá Hiện Tại</p>
                                <h2 className={`text-3xl font-black leading-none ${UI.textBold}`}>{derivRadar?.vn30f1m || '---'}</h2>
                                <div className={`flex items-center justify-end gap-1 font-black text-sm mt-2 ${Number(derivRadar?.change) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                    {Number(derivRadar?.change) >= 0 ? '▲' : '▼'}
                                    <span>{Math.abs(derivRadar?.change || 0)} ({derivRadar?.changePercent || 0}%)</span>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 mt-6">
                            <div className={`p-3 rounded-2xl border flex flex-col items-center shadow-sm ${isDark ? 'bg-black/40 border-white/5' : 'bg-white border-slate-200'}`}>
                                <span className={`text-[9px] font-black uppercase tracking-[0.2em] mb-1 ${UI.textMuted}`}>VN30 INDEX</span>
                                <span className={`text-lg font-black ${UI.textBold}`}>{derivRadar?.vn30 || '---'}</span>
                            </div>
                            <div className={`p-3 rounded-2xl border flex flex-col items-center shadow-sm transition-all duration-500 ${!derivRadar ? (isDark ? 'bg-black/40 border-white/5' : 'bg-white border-slate-200') : Number(derivRadar.basis) >= 0 ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
                                <span className={`text-[9px] font-black uppercase tracking-[0.2em] mb-1 ${!derivRadar ? UI.textMuted : Number(derivRadar.basis) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>ĐỘ LỆCH (BASIS)</span>
                                <span className={`text-lg font-black ${!derivRadar ? UI.textMuted : Number(derivRadar.basis) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                    {derivRadar?.basis > 0 ? `+${derivRadar.basis}` : derivRadar?.basis || '---'}
                                </span>
                            </div>
                        </div>
                    </div> 

                {/* TIÊU ĐỀ TRỤ DẪN DẮT (GHIM CỐ ĐỊNH) */}
                <div className="px-6 pt-4 pb-3 shrink-0 relative z-10 flex items-center gap-2">
                    <h3 className={`text-[11px] font-black uppercase tracking-widest ${UI.textMuted}`}>Trụ dẫn dắt VN30</h3>
                    <div onMouseEnter={() => setShowLeaderInfo(true)} onMouseLeave={() => setShowLeaderInfo(false)}>
                        <HelpCircle size={14} className={`${UI.textMuted} cursor-pointer hover:text-yellow-500 transition-colors`} />
                        {showLeaderInfo && (
                            <div className={`absolute left-0 top-full mt-2 w-64 p-3 rounded-xl shadow-xl z-50 text-[10px] font-bold leading-relaxed ${isDark ? 'bg-[#1a222e] text-slate-300 border border-slate-700' : 'bg-white text-slate-600 border border-slate-200'}`}>
                                Theo dõi 10 mã cổ phiếu có vốn hóa lớn nhất VN30. Dùng để dự đoán các nhịp kéo/xả "nhân tạo" nhằm điều tiết điểm số Phái sinh.
                            </div>
                        )}
                    </div>
                </div>

                {/* PHẦN CUỘN: DANH SÁCH MÃ */}
                <div className="px-6 flex-none lg:flex-1 lg:overflow-y-auto custom-scrollbar pb-2">
                    <div className="grid grid-cols-1 gap-3">
                        {(derivRadar?.influencers || []).map(stock => {
                            const changeVal = parseFloat(stock.change) || 0;
                            const barWidth = Math.min((Math.abs(changeVal) / 5) * 100, 100);
                            const isUp = changeVal >= 0;
                            const isNull = stock.change === null;

                            return (
                                <div key={stock.symbol} className={`p-3.5 rounded-xl border transition-all ${
                                    isDark
                                        ? isNull ? 'bg-white/3 border-white/5' : isUp ? 'bg-emerald-500/5 border-emerald-500/15' : 'bg-red-500/5 border-red-500/15'
                                        : isNull ? 'bg-slate-50 border-slate-200' : isUp ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'
                                }`}>
                                    {/* Symbol + % + Momentum 1p */}
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="font-black text-sm text-yellow-500">{stock.symbol}</span>
                                        
                                        <div className="text-right flex flex-col items-end gap-0.5">
                                            <span className={`text-sm font-black leading-none ${isNull ? UI.textMuted : isUp ? 'text-emerald-500' : 'text-red-500'}`}>
                                                {isNull ? '---' : `${isUp ? '+' : ''}${changeVal}%`}
                                            </span>
                                            {!isNull && (
                                                <span className={`text-[9px] font-bold tracking-widest uppercase ${Number(stock.momentum) > 0 ? 'text-emerald-400' : Number(stock.momentum) < 0 ? 'text-red-400' : 'text-slate-500'}`}>
                                                    1p: {Number(stock.momentum) > 0 ? '+' : ''}{stock.momentum}%
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    {/* Thanh đối xứng */}
                                    <div className={`h-1.5 rounded-full relative flex ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`}>
                                        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-slate-500/40 z-10" />
                                        <div className="w-1/2 h-full relative">
                                            {!isUp && !isNull && (
                                                <div className="absolute right-0 h-full bg-red-500 rounded-l-full transition-all duration-500"
                                                    style={{ width: `${barWidth}%` }} />
                                            )}
                                        </div>
                                        <div className="w-1/2 h-full relative">
                                            {isUp && !isNull && (
                                                <div className="absolute left-0 h-full bg-emerald-500 rounded-r-full transition-all duration-500"
                                                    style={{ width: `${barWidth}%` }} />
                                            )}
                                        </div>
                                    </div>
                                    {/* Lực tác động */}
                                    <p className={`text-[10px] font-bold mt-2 tracking-wider ${
                                        isNull ? UI.textMuted : Number(stock.realImpact) >= 0 ? 'text-emerald-500/80' : 'text-red-500/80'
                                    }`}>
                                        Lực: {isNull ? '---' : `${Number(stock.realImpact) > 0 ? '+' : ''}${stock.realImpact}`}
                                    </p>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* PHẦN GHIM CỐ ĐỊNH: WIDGETS OI & KHỐI NGOẠI RÒNG */}
                <div className="px-6 pb-3 pt-2 shrink-0 relative z-10">
                    <div className="grid grid-cols-2 gap-4">
                        {/* WIDGET 1: VỊ THẾ MỞ (OI) */}
                        <div className={`p-4 rounded-2xl border shadow-sm ${isDark ? 'bg-black/40 border-white/5' : 'bg-white border-slate-200'}`}>
                            <p className={`text-[10px] font-black uppercase tracking-wider mb-1.5 ${UI.textMuted}`}>Vị thế mở (OI)</p>
                            <p className={`text-xl font-mono font-black ${UI.textBold}`}>
                                 {(derivRadar && !isNaN(Number(derivRadar.oi))) 
                                    ? Number(derivRadar.oi).toLocaleString('vi-VN') 
                                    : '---'}
                                {(derivRadar && !isNaN(Number(derivRadar.oi))) && <span className="text-[10px] font-bold text-slate-500 ml-1">HĐ</span>}
                            </p>
                        </div>

                        {/* WIDGET 2: KHỐI NGOẠI RÒNG (HĐ) */}
                        <div className={`p-4 rounded-2xl border shadow-sm ${isDark ? 'bg-black/40 border-white/5' : 'bg-white border-slate-200'}`}>
                            <p className={`text-[10px] font-black uppercase tracking-wider mb-1.5 ${UI.textMuted}`}>Khối ngoại ròng (HĐ)</p>
                            <p className={`text-xl font-mono font-black ${
                                (!derivRadar || isNaN(Number(derivRadar.foreignNet))) ? UI.textMuted : 
                                Number(derivRadar.foreignNet) > 0 ? 'text-emerald-500' : 
                                Number(derivRadar.foreignNet) < 0 ? 'text-red-500' : 'text-slate-500'
                            }`}>
                                {(derivRadar && !isNaN(Number(derivRadar.foreignNet)))
                                    ? (Number(derivRadar.foreignNet) > 0 
                                        ? `+${Number(derivRadar.foreignNet).toLocaleString('vi-VN')}` 
                                        : Number(derivRadar.foreignNet).toLocaleString('vi-VN')) 
                                    : '---'
                                }
                            </p>
                        </div>
                    </div>
                </div>

                {/* 3: LIVE MACRO & DERIVATIVES NEWS FEED */}
                <div className="mt-2 pt-4 border-t border-white/10 flex flex-col h-auto lg:h-[380px] w-full px-6 pb-6 shrink-0">
                    <div className="flex items-center justify-between mb-3 border-b pb-2 border-white/10 w-full">
                        <h3 className={`text-[11px] font-black uppercase tracking-widest flex items-center gap-2 ${UI.textBold}`}>
                            <Globe size={14} className="text-orange-500 animate-spin-[spin_4s_linear_infinite]" />
                            Dòng sự kiện Vĩ mô & Social
                        </h3>
                    
                        <div className="flex items-center gap-2">
                            {lastNewsSave && (
                                <span className="text-[9px] font-mono text-slate-500 opacity-80">
                                    Lưu cuối: {lastNewsSave}
                                </span>
                            )}
                    
                            {/* NÚT LÀM MỚI TIN */}
                            <button
                                onClick={handleRefreshDerivNews}
                                disabled={refreshingNews}
                                className={`flex items-center gap-1 p-1 px-2 rounded bg-orange-500/10 border border-orange-500/20 text-orange-400 text-[9px] font-black uppercase tracking-wider hover:bg-orange-500 hover:text-white transition-all active:scale-95 disabled:opacity-50`}
                            >
                                <RefreshCw size={10} className={refreshingNews ? "animate-spin" : ""} />
                                {refreshingNews ? 'SCANNING...' : 'LẤY THÊM TIN MỚI'}
                            </button>
                    
                            {/* NÚT XUẤT FILE PHÂN TÍCH ĐẦY ĐỦ */}
                            <button
                                onClick={handleExportDeriv}
                                disabled={exportingDeriv || !derivRadar || !derivChartData}
                                title="Xuất toàn bộ dữ liệu: giá, chỉ số kỹ thuật, tin tức, volume profile ra file JSON để AI phân tích"
                                className={`flex items-center gap-1 p-1 px-2 rounded border text-[9px] font-black uppercase tracking-wider transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed
                                    ${exportingDeriv
                                        ? 'bg-slate-700 border-slate-600 text-slate-400'
                                        : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-white'
                                    }`}
                            >
                                <Database size={10} className={exportingDeriv ? "animate-pulse" : ""} />
                                {exportingDeriv ? 'ĐANG XUẤT...' : 'XUẤT AI DATA'}
                            </button>
                        </div>
                    </div>
                    
                    <div className="flex-none lg:flex-1 lg:overflow-y-auto custom-scrollbar pr-1 space-y-2 w-full">
                        {(!derivNews || derivNews.length === 0) ? (
                            <div className="flex flex-col items-center justify-center py-16 opacity-40 border border-dashed border-white/5 rounded-2xl">
                                <Globe size={20} className="mb-2 animate-bounce text-orange-500" />
                                <p className="text-[9px] font-black uppercase tracking-widest">Đang nạp bản tin vĩ mô...</p>
                            </div>
                        ) : (
                            derivNews.map((n, i) => (
                                <a 
                                    key={i} href={n.link} target="_blank" rel="noreferrer"
                                    className={`block p-3 rounded-xl border transition-all w-full ${isDark ? 'bg-black/30 border-white/5 hover:border-orange-500/40 hover:bg-orange-500/5' : 'bg-white border-slate-200 hover:border-orange-300'}`}
                                >
                                    <p className={`text-[11px] font-bold leading-snug line-clamp-2 ${UI.textBold}`}>{n.title}</p>
                                    <div className="flex items-center gap-2 mt-2 w-full">
                                        <span className={`text-[8px] font-black px-1.5 py-0.5 rounded shrink-0 ${n.sentiment === 'positive' ? 'bg-emerald-500/20 text-emerald-500' : n.sentiment === 'negative' ? 'bg-red-500/20 text-red-500' : 'bg-slate-500/20 text-slate-400'}`}>
                                            {n.sentiment === 'positive' ? '▲ TÍCH CỰC' : n.sentiment === 'negative' ? '▼ TIÊU CỰC' : '● TRUNG LẬP'}
                                        </span>
                                        
                                        <span className={`text-[9px] font-black uppercase ${n.source.includes('Reddit') ? 'text-orange-400' : n.source.includes('Facebook') ? 'text-blue-400' : UI.textMuted}`}>
                                            {n.source}
                                        </span>
                                        
                                        <span className={`text-[9px] ml-auto font-mono ${UI.textMuted}`}>
                                        {new Date(n.timestamp).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute:'2-digit' })}                                            
                                        </span>
                                    </div>
                                </a>
                            ))
                        )}
                    </div>
                </div>
            </div>

        {/* CỘT PHẢI PHÁI SINH: EXECUTION FLOW */}
        <div className={`${mobileTab === 'ai' ? 'flex' : 'hidden'} lg:flex flex-1 overflow-y-auto lg:overflow-hidden flex-col p-4 lg:p-8 pb-4 relative transition-colors duration-300 ${UI.rightCol} animate-in fade-in custom-scrollbar`}>            
            {/* HEADER CHIẾN THUẬT */}
            <div className={`shrink-0 flex items-center justify-between mb-6 pb-4 border-b ${UI.border}`}>
                    <div className="flex items-center gap-3">
                    <Zap className="text-orange-500" size={24} />
                    <h3 className={`font-black tracking-widest uppercase text-lg ${UI.textBold}`}>Derivatives Execution Flow</h3>
                </div>
            </div>
            {/* CHART AREA */}
            <div
                className="shrink-0 grid grid-cols-1 lg:grid-cols-4 gap-4 lg:gap-6 mb-4"
                style={{ paddingBottom: '8px' }}
            >
                {/* CHART */}
                <div className={`lg:col-span-3 col-span-1 rounded-[24px] border overflow-hidden shadow-xl relative flex items-center justify-center ${isDark?'bg-black/40 border-orange-500/20':'bg-white border-orange-200'}`}
                        style={{ height: chartHeight + 'px' }}
                    >
                        {derivChartData ? (
                            <TradingChart
                                data={derivChartData}
                                theme={isDark?'dark':'light'}
                                onIntervalChange={setDerivInterval}
                                currentInterval={derivInterval}
                            />
                        ) : (
                            <AtomLoader message="ĐANG ĐỒNG BỘ CHART PHÁI SINH REALTIME..." />
                        )}
                        {/* DRAG HANDLE */}
                    <div
                        onMouseDown={onChartDragStart}
                        className={`absolute bottom-0 left-0 right-0 h-6 cursor-ns-resize hidden lg:flex items-center justify-center group transition-colors duration-150 ${isDark ? 'hover:bg-white/5' : 'hover:bg-black/[0.03]'}`}
                        title="Kéo lên/xuống để thay đổi chiều cao chart"
                    >
                         <div className={`absolute right-3 flex items-center gap-1.5 transition-all duration-150 ${isDark ? 'text-white group-hover:text-orange-500' : 'text-slate-500 group-hover:text-orange-500'}`}>
                            
                            <span className="text-[9px] font-black tracking-widest uppercase select-none opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                Kéo thả
                            </span>
                            
                            <div className="p-0.5 animate-pulse group-hover:animate-none">
                                 <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                     <path d="M10 20 h10 v-10" />
                                     <path d="M11 15 h4 v-4" />
                                </svg>
                            </div>
                            
                        </div>
                    </div>
                </div>


                {/* VOLUME PROFILE */}
                <div
                    className={`lg:col-span-1 col-span-1 rounded-[24px] border shadow-sm p-4 flex flex-col relative ${isDark?'bg-black/20 border-white/5':'bg-white border-slate-200'}`}
                    style={typeof window !== 'undefined' && window.innerWidth < 1024 ? {} : { height: chartHeight + 'px' }}
                >
                    <div className="flex items-center justify-between mb-4">
                        <p className={`text-[9px] font-black uppercase tracking-widest ${UI.textMuted}`}>Volume Profile</p>
                        <div onMouseEnter={()=>setShowVolInfo(true)} onMouseLeave={()=>setShowVolInfo(false)}>
                            <HelpCircle size={14} className="text-orange-500 cursor-pointer"/>
                            {showVolInfo && (
                                <div className={`absolute right-0 top-10 mt-1 w-56 p-3 rounded-xl shadow-xl z-50 text-[10px] font-bold leading-relaxed ${isDark?'bg-[#1a222e] text-slate-300 border border-slate-700':'bg-white text-slate-600 border border-slate-200'}`}>
                                    Biểu đồ bức tường khối lượng (Intraday). Hiển thị các mức giá xảy ra nhiều giao dịch nhất trong ngày.
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="flex-1 flex flex-col gap-1 justify-around overflow-hidden">
                        {volumeProfile ? volumeProfile.bins.map((bin,idx)=>(
                            <div key={idx} className="flex items-center gap-2">
                                <span className={`text-[10px] font-mono w-10 ${UI.textMuted}`}>{bin.priceCenter}</span>
                                <div className={`flex-1 h-3 rounded-sm overflow-hidden flex ${isDark?'bg-slate-800':'bg-slate-100'}`}>
                                    <div className="bg-orange-500/60 h-full transition-all duration-500" style={{width:`${(bin.volume/volumeProfile.maxVol)*100}%`}}/>
                                </div>
                            </div>
                        )) : (
                            <div className="flex flex-col items-center justify-center py-12 opacity-80">
                                <div className="scale-75"><AtomLoader message="READING POC..."/></div>
                            </div>
                        )}
                    </div>
                    {volumeProfile && <p className="text-[10px] font-bold text-orange-500 mt-4 text-center italic">Vùng POC (Kẹt lệnh): {volumeProfile.pocPrice}</p>}
                </div>
            </div>

            {/* AI SCALPING ASSISTANT */}
            <div className={`flex-none lg:flex-1 flex flex-col min-h-0 p-4 lg:p-6 rounded-[32px] border transition-all duration-500 ${isDark ? 'bg-[#10151C] border-orange-500/30 shadow-[0_0_30px_rgba(249,115,22,0.1)]' : 'bg-orange-50 border-orange-200'}`}>
                {/* Đã bỏ 3 dấu chấm và bọc nội dung vào trong thẻ div chuẩn */}
                <div className="shrink-0 flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-2xl bg-orange-500 text-white flex items-center justify-center shadow-lg shadow-orange-500/40"><BrainCircuit size={20}/></div>
                    <div>
                        <h4 className={`text-sm font-black uppercase tracking-widest ${UI.textBold}`}>AI Scalping Assistant</h4>
                        <p className="text-[9px] font-bold text-orange-500 uppercase">Real-time Strategy Engine</p>
                    </div>
                </div>

                {/* MAIN GRID */}
                <div className="flex-none lg:flex-1 grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6 min-h-0 lg:overflow-hidden">
                    {/* ============================================================
                        COL 1: ORDER FLOW & MACRO MATRIX  
                        ============================================================ */}
                    <ScrollableColumn isDark={isDark} className="pr-2 pb-4 lg:pb-8 flex flex-col gap-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-purple-400">
                                <Database size={16} />
                                <span className="text-[10px] font-black uppercase tracking-widest">Order Flow & Macro Matrix</span>
                            </div>
                            <span className="text-[9px] font-bold text-purple-400 uppercase bg-purple-500/10 px-2 py-0.5 rounded">Quant Input</span>
                        </div>
                
                        {/* WIDGET 1: BID/ASK IMBALANCE */}
                        <div className={`p-4 rounded-2xl border shadow-sm ${isDark ? 'bg-[#131922] border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                            <p className="text-[9px] uppercase font-black tracking-widest text-slate-400 mb-2">Độ lệch Sổ lệnh (Bid/Ask Imbalance)</p>
                            <div className="flex items-center justify-between text-xs font-black mb-1">
                                <span className="text-emerald-500">BID: 54%</span>
                                <span className="text-red-500">ASK: 46%</span>
                            </div>
                            <div className={`flex h-2 w-full rounded-full overflow-hidden ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`}>
                                <div className="bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" style={{ width: '54%' }} />
                                <div className="bg-red-500" style={{ width: '46%' }} />
                            </div>
                            <p className={`text-[8px] font-bold italic mt-1 text-right ${UI.textMuted}`}>Phe Long đang giữ tường mua chủ động</p>
                        </div>
                
                        {/* WIDGET 2: WHALE SWEEP TRACKER */}
                        <div className={`p-4 rounded-2xl border shadow-sm flex flex-col h-32 ${isDark ? 'bg-[#131922] border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                            <p className="text-[9px] uppercase font-black tracking-widest text-slate-400 mb-2">Quét lệnh Cá mập (&gt;50 HĐ/Lệnh)</p>
                             <div className="flex-1 overflow-y-auto font-mono text-[10px] space-y-1.5 custom-scrollbar pr-1">
                                
                                 <div className={`flex justify-between font-bold px-2 py-1.5 rounded ${isDark ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-100 text-emerald-700'}`}>
                                    <span>[14:42:10] SWEEP LONG</span><span>+120 HĐ</span>
                                </div>
                                
                                 <div className={`flex justify-between font-bold px-2 py-1.5 rounded ${isDark ? 'bg-red-500/10 text-red-400' : 'bg-red-100 text-red-700'}`}>
                                    <span>[14:41:05] SWEEP SHORT</span><span>-65 HĐ</span>
                                </div>
                                
                                <div className={`flex justify-between font-bold px-2 py-1.5 rounded ${isDark ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-100 text-emerald-700'}`}>
                                    <span>[14:38:50] SWEEP LONG</span><span>+80 HĐ</span>
                                </div>
                                
                                 <div className={`flex justify-between font-bold px-2 py-1.5 rounded ${isDark ? 'bg-white/5 text-slate-400' : 'bg-slate-200/70 text-slate-600'}`}>
                                    <span>[14:35:12] NO LARGE TRADES</span><span>---</span>
                                </div>
                                
                            </div>
                        </div>
                
                        {/* WIDGET 3: MACRO CONTEXT —   with real data from macroContext prop */}
                        <div className={`p-4 rounded-2xl border shadow-sm space-y-2 ${isDark ? 'bg-[#131922] border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                            <p className="text-[9px] uppercase font-black tracking-widest text-slate-400 mb-1">Cảnh báo Vĩ mô & Liên thị trường</p>
                            <div className="flex justify-between items-center text-[11px] font-bold">
                                <span className={UI.textMuted}>• Đáo hạn Phái sinh:</span>
                                <span className="text-yellow-500 font-black">{macroContext?.expiryLabel || 'Còn 4 ngày'}</span>
                            </div>
                            <div className="flex justify-between items-center text-[11px] font-bold">
                                <span className={UI.textMuted}>• Sức mạnh USD (DXY):</span>
                                <span className={parseFloat(macroContext?.dxy?.change) >= 0 ? 'text-red-400' : 'text-emerald-400'}>
                                    {macroContext?.dxy?.value || '104.2'} ({macroContext?.dxy?.changePercent >= 0 ? '+' : ''}{macroContext?.dxy?.changePercent || '+0.25'}% {parseFloat(macroContext?.dxy?.change) >= 0 ? '↑' : '↓'})
                                </span>
                            </div>
                            <div className="flex justify-between items-center text-[11px] font-bold">
                                <span className={UI.textMuted}>• Dow Jones Futures:</span>
                                <span className={parseFloat(macroContext?.dowFutures?.change) >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                                    {parseFloat(macroContext?.dowFutures?.change) >= 0 ? '+' : ''}{macroContext?.dowFutures?.change || '+180.5'} điểm {parseFloat(macroContext?.dowFutures?.change) >= 0 ? '↑' : '↓'}
                                </span>
                            </div>
                            <div className="flex justify-between items-center text-[11px] font-bold">
                                <span className={UI.textMuted}>• Tỷ giá USD/VND (VCB):</span>
                                <span className="text-red-400">{macroContext?.usdVnd?.official || '25.480'} (Áp lực)</span>
                            </div>
                        </div>
                
                        {/* CONFLUENCE SCORE CARD */}
                        <div className={`rounded-2xl border p-5 ${derivAnalysis.bgColor}`}>
                            <div className="flex items-center justify-between mb-3">
                                <p className="text-[10px] uppercase tracking-[0.3em] font-black text-slate-400">Confluence Score</p>
                                <div className={`px-4 py-2 rounded-xl text-xs font-black tracking-widest ${derivAnalysis.bgColor}`}>
                                    {derivAnalysis.mechTrend}
                                </div>
                            </div>
                            <div className={`w-full h-4 rounded-full overflow-hidden ${isDark ? 'bg-black/40' : 'bg-slate-200'}`}>
                                <div className="h-full bg-orange-500 transition-all duration-700" style={{ width: `${derivAnalysis.score}%` }} />
                            </div>
                        </div>

                        {/* CHỈ BÁO ĐỊNH LƯỢNG  */}
                        <div className={`rounded-[24px] border p-5 mt-4 ${derivAnalysis.bgColor}`}>
                            <div className="flex items-center gap-2 mb-4">
                                <Activity size={16} className={derivAnalysis.mechColor} />
                                <span className={`text-[10px] font-black uppercase tracking-widest ${derivAnalysis.mechColor}`}>
                                    Chỉ báo định lượng (Cơ học) — {derivAnalysis.mechAction}
                                </span>
                            </div>
                    
                            <div className="grid grid-cols-2 gap-2 mb-3">
                                {[
                                    { label: 'ENTRY', val: `${(parseFloat(derivRadar?.vn30f1m)||0).toFixed(1)}`, color: isDark ? 'text-white' : 'text-slate-800' },
                                    { label: 'SL (−1.5 ATR)', val: derivAnalysis.sl, color: 'text-red-400' },
                                    { label: 'TP1 (1R)', val: derivAnalysis.tp1, color: isDark ? 'text-emerald-400' : 'text-emerald-600' },
                                    { label: 'TP2 (2.2R)', val: derivAnalysis.tp2, color: isDark ? 'text-emerald-300' : 'text-emerald-500' },
                                ].map(item => (
                                    <div key={item.label} className={`rounded-xl p-3 flex flex-col items-center ${isDark ? 'bg-black/30' : 'bg-white/60'} border border-white/10`}>
                                        <span className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">{item.label}</span>
                                        <span className={`text-base font-black ${item.color}`}>{item.val}</span>
                                    </div>
                                ))}
                            </div>
                    
                            <div className={`flex items-center justify-between px-3 py-2 rounded-xl mb-3 ${isDark ? 'bg-black/20' : 'bg-white border border-slate-200 shadow-sm'}`}>
                                <div className="flex items-center gap-1.5">
                                    <span className={`text-[10px] font-black uppercase ${isDark ? 'text-yellow-400' : 'text-orange-600'}`}>R:R Ratio</span>
                                    {/* Nút Help (Dấu chấm hỏi) */}
                                    <div className="relative group cursor-default">
                                        <HelpCircle size={12} className={`${isDark ? 'text-slate-400' : 'text-slate-400'} hover:text-yellow-500 transition-colors`}/>
                                        {/* Bảng giải thích hiện ra khi Hover */}
                                        <div className={`absolute left-0 bottom-full mb-2 w-64 p-3 rounded-xl shadow-xl text-[10px] font-bold leading-relaxed opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 ${isDark ? 'bg-[#1a222e] text-slate-300 border border-slate-700' : 'bg-white text-slate-600 border border-slate-200'}`}>
                                            <strong>Tỷ lệ Rủi ro : Lợi nhuận (Risk / Reward)</strong><br/>
                                            Thể hiện mức lợi nhuận thu được ở TP1 cho mỗi 1 phần rủi ro (SL). Tỷ lệ này lớn hơn 1:1 là lý tưởng. Nếu dưới 1:1, hệ thống cần có tỷ lệ thắng (Winrate) cực cao để bù đắp.
                                        </div>
                                    </div>
                                </div>
                                <span className={`text-sm font-black ${isDark ? 'text-white' : 'text-slate-800'}`}>1 : {derivAnalysis.rrRatio}</span>
                            </div>
                    
                            {/* CÁC NÚT CHỈ BÁO */}
                            <div className="flex flex-wrap gap-1.5 mb-3">
                                {[
                                    { label: `EMA3 ${derivAnalysis.shortTermTrend === 1 ? '↑' : '↓'} EMA8`, ok: true },
                                    { label: `OI ${derivAnalysis.oiInterpretation?.label}`, ok: derivAnalysis.oiUp },
                                    { label: `Khối ngoại ${(parseFloat(derivRadar?.foreignNet)||0) >= 0 ? 'MUA' : 'BÁN'} ${Math.abs(parseFloat(derivRadar?.foreignNet)||0)} HĐ`, ok: (parseFloat(derivRadar?.foreignNet)||0) >= 0 },
                                    { label: `Tổng trụ ${(derivAnalysis.totalImpact||0) >= 0 ? '+' : ''}${(derivAnalysis.totalImpact||0).toFixed ? Number(derivAnalysis.totalImpact).toFixed(2) : derivAnalysis.totalImpact} đ`, ok: (parseFloat(derivAnalysis.totalImpact)||0) >= 0 },
                                    { label: `POC ${derivAnalysis.pocDistance}`, ok: true },
                                    { label: `Score ${derivAnalysis.score}/100`, ok: derivAnalysis.score >= 50 },
                                ].map((b, i) => (
                                    <span key={i} className={`text-[9px] font-black px-2 py-0.5 rounded-full ${
                                        b.ok 
                                             ? (isDark ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-100 text-emerald-700 border border-emerald-200') 
                                             : (isDark ? 'bg-red-500/20 text-red-400' : 'bg-red-100 text-red-700 border border-red-200')
                                    }`}>
                                        {b.label}
                                    </span>
                                ))}
                            </div>
                    
                            <p className={`text-sm italic leading-loose font-medium ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{derivAnalysis.mechReason}</p>
                        </div>
                    </ScrollableColumn>
                        {/* ============================================================
                        COL 2: AI SCALPING ASSISTANT
                        ============================================================ */}
                        <ScrollableColumn isDark={isDark} className="pr-2 pb-4 lg:pb-8 flex flex-col gap-4">
                        
                        {/* --- GIAO DIỆN AI ACTION PANEL  --- */}
                        {derivActionData ? (
                             <div className={`shrink-0 rounded-[24px] border p-5 relative overflow-hidden shadow-sm transition-all ${
                                derivActionData.action === 'LONG' ? (isDark ? 'bg-emerald-900/20 border-emerald-500/30' : 'bg-emerald-50 border-emerald-300') :
                                derivActionData.action === 'SHORT' ? (isDark ? 'bg-red-900/20 border-red-500/30' : 'bg-red-50 border-red-300') :
                                (isDark ? 'bg-slate-800/50 border-slate-600' : 'bg-slate-100 border-slate-300')
                            }`}>
                                {/* 1. Tiêu đề Panel */}
                                <div className="flex items-center gap-2 mb-4 relative z-10">
                                    <BrainCircuit size={16} className={derivActionData.action === 'LONG' ? 'text-emerald-500' : derivActionData.action === 'SHORT' ? 'text-red-500' : 'text-slate-500'} />
                                    <span className={`text-[10px] font-black uppercase tracking-widest ${derivActionData.action === 'LONG' ? 'text-emerald-500' : derivActionData.action === 'SHORT' ? 'text-red-500' : 'text-slate-600'}`}>
                                        PHÂN TÍCH CỦA AI — {derivActionData.action || 'QUAN SÁT'}
                                    </span>
                                </div>
                    
                                {/* 2. Lưới thông số ENTRY, SL, TP */}
                                <div className="grid grid-cols-2 gap-2 mb-3 relative z-10">
                                    <div className={`rounded-xl p-3 flex flex-col items-center ${isDark ? 'bg-black/40' : 'bg-white/80'} border border-white/10`}>
                                        <span className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">ĐIỂM VÀO (ENTRY)</span>
                                        <span className={`text-base font-black ${isDark ? 'text-white' : 'text-slate-800'}`}>{derivActionData.entry || '---'}</span>
                                    </div>
                                    <div className={`rounded-xl p-3 flex flex-col items-center ${isDark ? 'bg-black/40' : 'bg-white/80'} border border-white/10`}>
                                        <span className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">DỪNG LỖ (SL)</span>
                                        <span className="text-base font-black text-red-500">{derivActionData.sl || '---'}</span>
                                    </div>
                                    <div className={`col-span-2 rounded-xl p-3 flex flex-col items-center justify-center ${isDark ? 'bg-black/40' : 'bg-white/80'} border border-white/10`}>
                                        <span className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">CHỐT LỜI (TP MỤC TIÊU)</span>
                                        <span className="text-base font-black text-emerald-500">{derivActionData.tp || '---'}</span>
                                    </div>
                                </div>
                    
                                {/* 3. Lý do nhận định */}
                                <div className={`p-3 rounded-xl mt-3 relative z-10 ${isDark ? 'bg-black/30' : 'bg-white/60'}`}>
                                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">AI NHẬN ĐỊNH LÝ DO</span>
                                    <p className={`text-[11px] leading-relaxed font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                                        {derivActionData.reason || 'AI đang tổng hợp dữ liệu...'}
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className={`shrink-0 rounded-[24px] border p-5 flex flex-col items-center justify-center text-center py-6 shadow-sm ${isDark ? 'bg-[#131922] border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                                <BrainCircuit size={24} className={`mb-3 ${UI.textMuted} opacity-50`} />
                                <p className={`text-[10px] font-black uppercase tracking-widest ${UI.textMuted}`}>AI STRATEGY PANEL</p>
                                <p className="text-[9px] mt-2 text-slate-500 px-4">Bấm nút phân tích bên dưới để AI sinh kế hoạch giao dịch dựa trên Vĩ mô & Kỹ thuật.</p>
                            </div>
                        )}
                        
                        {/* NÚT AI CALL BUTTON */}
                        <div className="shrink-0">
                            {lastAiDerivTime && (() => {
                                const elapsed = Date.now() - lastAiDerivTime;
                                const remainMs = 5 * 60 * 1000 - elapsed;
                                const canCallAI = elapsed >= 5 * 60 * 1000;
                                const remainMin = Math.floor(remainMs / 60000);
                                const remainSec = Math.floor((remainMs % 60000) / 1000);
                                return (
                                    <div className="text-center mb-2 space-y-0.5 mt-2">
                                        <p className={`text-[9px] font-mono ${UI.textMuted}`}>
                                            Phân tích gần nhất: {new Date(lastAiDerivTime).toLocaleTimeString('vi-VN')}
                                        </p>
                                        {canCallAI ? (
                                            <p className="text-[9px] font-black text-emerald-500 uppercase tracking-wider">
                                                ✓ Sẵn sàng phân tích mới
                                            </p>
                                        ) : (
                                            <p className="text-[10px] font-mono text-red-500">
                                                Còn {remainMin}:{String(remainSec).padStart(2,'0')} để tối ưu dữ liệu phân tích
                                                {' '}(hoặc bấm ↻ để phân tích mới ngay)
                                            </p>
                                        )}
                                    </div>
                                );
                            })()}

                            {analyzingDeriv ? (
                                <div className={`w-full rounded-xl overflow-hidden border ${isDark?'bg-slate-800/60 border-orange-500/20':'bg-orange-50 border-orange-200'}`}>
                                    <AtomLoader message="ĐANG PACK KHỐI DỮ LIỆU CHO AI..." />
                                </div>
                            ) : (
                            <button
                                    onClick={() => handleAiDerivAnalysis(false)}
                                    className="w-full h-12 rounded-xl flex items-center justify-center gap-2 font-black text-xs uppercase tracking-widest transition-all shadow-lg bg-orange-500 hover:bg-orange-400 text-white shadow-orange-500/20 active:scale-95"
                                >
                                    <BrainCircuit size={16} className="animate-pulse"/>
                                    AI LẬP KẾ HOẠCH VÀO LỆNH
                            </button>
                            )}
                            <button
                                onClick={() => setIsChatOpen(true)}
                                className={`w-full mt-2 h-12 rounded-xl flex items-center justify-center gap-2 font-black text-xs uppercase tracking-widest transition-all border shadow-sm active:scale-95
                                    ${isDark 
                                        ? 'bg-orange-500/10 text-orange-400 border-orange-500/30 hover:bg-orange-500/20' 
                                        : 'bg-orange-50 text-orange-600 border-orange-200 hover:bg-orange-100'
                                    }`}
                            >
                                <BrainCircuit size={16} />
                                {aiDerivReport ? 'CHAT VỚI AI VỀ PHÁI SINH' : 'HỎI AI VỀ PHÁI SINH'}
                            </button>
                        </div>

                        {/* AI REPORT TRẢ VỀ (BÀI VĂN DÀI) */}
                        {aiDerivReport && (
                            <div className={`shrink-0 rounded-2xl border p-4 ${isDark?'bg-[#0a0e14] border-orange-500/30':'bg-white border-orange-200 shadow-inner'}`}>
                                <div className={`prose max-w-none prose-sm prose-headings:text-orange-500 prose-headings:font-black prose-headings:uppercase prose-p:leading-relaxed prose-strong:text-emerald-500 prose-li:text-[11px] ${isDark?'prose-invert prose-p:text-slate-300':'prose-p:text-slate-700'}`}>
                                    <ReactMarkdown>{aiDerivReport}</ReactMarkdown>
                                </div>
                            </div>
                        )}
                        </ScrollableColumn>
                {/* ============================================================
                /// COL 3: TECHNICAL CONFLUENCE & DYNAMICS
                /// ============================================================ */}
                <div className={`lg:border-l lg:pl-6 relative h-auto lg:h-full flex flex-col min-h-0 mt-4 lg:mt-0 pt-4 lg:pt-0 border-t lg:border-t-0 ${isDark ? 'border-white/10' : 'border-orange-200'}`}>
                    <ScrollableColumn isDark={isDark} className="pr-2 pb-4 lg:pb-8 space-y-5"> 
    
                        {/* ATR Visual */}
                        <div>
                            <div className="flex items-center gap-1.5 mb-2">
                                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Biến động ATR</p>
                                <div className="relative group cursor-default">
                                    <HelpCircle size={12} className="text-slate-400 hover:text-yellow-500 transition-colors"/>
                                    <div className={`absolute left-0 bottom-full mb-2 w-56 p-2 rounded-lg shadow-xl text-[9px] font-bold leading-relaxed opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 ${isDark?'bg-[#1a222e] text-slate-300 border border-slate-700':'bg-white text-slate-600 border border-slate-200'}`}>
                                        <strong>ATR (Average True Range)</strong> — Đo biên độ dao động trung bình của giá trong N nến gần nhất. ATR càng cao → thị trường càng biến động mạnh → SL/TP cần đặt xa hơn. Hệ thống dùng ATR × 1.5 cho SL và ATR × 1.0 / 2.2 cho TP.
                                    </div>
                                </div>
                            </div>
                            <div className={`rounded-2xl p-4 border ${isDark?'bg-[#131922] border-white/5':'bg-slate-50 border-slate-200'}`}>
                                <div className="flex justify-between text-[10px] font-bold mb-2">
                                    <span className="text-slate-400">ATR hiện tại</span>
                                    <span className="text-orange-500 font-black">{derivAnalysis.atr} điểm</span>
                                </div>
                                <div className={`w-full h-2 rounded-full ${isDark?'bg-slate-800':'bg-slate-200'}`}>
                                    <div className="h-full bg-orange-500 rounded-full transition-all duration-700"
                                        style={{width:`${Math.min((parseFloat(derivAnalysis.atr)||0)/10*100,100)}%`}}/>
                                </div>
                                <div className="flex justify-between text-[9px] mt-1 text-slate-500">
                                    <span>Thấp</span><span>Cao (10đ)</span>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center gap-2 text-yellow-500 mb-1">
                                <Activity size={14} />
                                <span className="text-[9px] font-black uppercase tracking-widest">Biến số Động lực học</span>
                            </div>
                            <ul className={`text-[11px] leading-relaxed font-bold space-y-2.5 ${UI.textMuted}`}>
                                {[
                                    { label: 'Tốc độ xé Basis:', val: `${(parseFloat(derivRadar?.basisSpeed)||0)>0?'+':''}${derivRadar?.basisSpeed||0} đ/nhịp`, color: (parseFloat(derivRadar?.basisSpeed)||0)>0?'text-emerald-500':(parseFloat(derivRadar?.basisSpeed)||0)<0?'text-red-500':'text-slate-400', tip:'Tốc độ thu hẹp/mở rộng khoảng cách F1M vs VN30 Index. Basis xé nhanh → dòng tiền đang chạy mạnh về một phía.' },
                                    { label: 'Tổng lực 10 Trụ:', val: `${(derivRadar?.influencers||[]).reduce((s,x)=>s+(parseFloat(x.realImpact)||0),0)>0?'+':''}${(derivRadar?.influencers||[]).reduce((s,x)=>s+(parseFloat(x.realImpact)||0),0).toFixed(2)} đ`, color:(derivRadar?.influencers||[]).reduce((s,x)=>s+(parseFloat(x.realImpact)||0),0)>0?'text-emerald-500':'text-red-500', tip:'Tổng điểm tác động thực tế của 10 mã vốn hóa lớn nhất lên VN30. Âm = sức kéo xuống.' },
                                    { label: 'Vùng kẹt POC:', val: volumeProfile?.pocPrice ? parseFloat(volumeProfile.pocPrice).toFixed(1) : 'Đang tính...', color: isDark?'text-white':'text-slate-800', tip:'Point of Control — mức giá có khối lượng khớp lệnh lớn nhất phiên. Giá thường bị hút về đây.' },
                                    { label: 'Xu thế OI:', val: derivRadar?.oiTrend||'ĐANG QUÉT...', color:'text-orange-500', tip:'Open Interest tăng = tiền mới vào thị trường. OI giảm = đang đóng vị thế hàng loạt.' },
                                    { label: 'Ngoại ròng (Net):', val: `${(parseFloat(derivRadar?.foreignNet)||0)>0?'+':''}${derivRadar?.foreignNet||0} HĐ`, color:(parseFloat(derivRadar?.foreignNet)||0)>0?'text-emerald-500':'text-red-500', tip:'Số hợp đồng Khối ngoại mua/bán ròng. Ngoại mua ròng mạnh = tín hiệu Long đáng tin.' },
                                ].map((item,idx)=>(
                                    <li key={idx} className="flex items-center gap-1.5 relative group cursor-default">
                                        <span>• {item.label}</span>
                                        <HelpCircle size={11} className="text-slate-400 hover:text-yellow-500 transition-colors flex-shrink-0"/>
                                        <span className={`ml-auto ${item.color}`}>{item.val}</span>
                                        <div className={`absolute left-0 bottom-full mb-2 w-52 p-2 rounded-lg shadow-xl text-[9px] font-bold leading-relaxed opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 ${isDark?'bg-[#1a222e] text-slate-300 border border-slate-700':'bg-white text-slate-600 border border-slate-200'}`}>
                                            {item.tip}
                                        </div>
                                    </li>
                                ))}
                                <li>• VWAP: <span className={(parseFloat(derivRadar?.vn30f1m)||0)>=parseFloat(derivAnalysis.vwap)?'text-emerald-500':'text-red-500'}>{derivAnalysis.vwap} ({(parseFloat(derivRadar?.vn30f1m)||0)>=parseFloat(derivAnalysis.vwap)?'TRÊN ↑':'DƯỚI ↓'})</span></li>
                                <li>• CVD: <span className={(derivAnalysis.cvd||0)>=0?'text-emerald-500':'text-red-500'}>{(derivAnalysis.cvd||0)>=0?'+':''}{Number(derivAnalysis.cvd||0).toLocaleString('vi-VN')} HĐ</span></li>
                                <li>• OI Signal: <span className={derivAnalysis.oiInterpretation.color}>{derivAnalysis.oiInterpretation.label}</span></li>
                            </ul>
                        </div>

                        <div className={`rounded-2xl p-4 border space-y-2 ${isDark?'bg-[#131922] border-white/5':'bg-slate-50 border-slate-200'}`}>
                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Biên phiên hôm nay</p>
                            <div className="flex justify-between text-[11px] font-bold">
                                <span className="text-slate-400">High phiên</span>
                                <span className="text-emerald-400">{derivAnalysis.sessionHigh}</span>
                            </div>
                            <div className="flex justify-between text-[11px] font-bold">
                                <span className="text-slate-400">Low phiên</span>
                                <span className="text-red-400">{derivAnalysis.sessionLow}</span>
                            </div>
                            <div className="flex justify-between text-[11px] font-bold">
                                <span className="text-slate-400">VWAP</span>
                                <span className="text-yellow-400">{derivAnalysis.vwap}</span>
                            </div>
                        </div>

                        <button
                            onClick={() => handleAiDerivAnalysis(true)}
                            disabled={analyzingDeriv}
                            title="Bỏ qua cache, ép AI phân tích lại ngay lập tức dù chưa đủ 5 phút hoặc chưa có biến động lớn"
                            className={`w-full py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all
                                ${isDark?'border-white/10 text-slate-400 hover:border-orange-500/40 hover:text-orange-400':'border-slate-200 text-slate-400 hover:border-orange-300 hover:text-orange-500'}
                                disabled:opacity-30 active:scale-95`}
                        >
                            ↻ Phân tích lại ngay
                        </button>
                    </ScrollableColumn>
                </div>
            </div>  
        </div>
      </div>
    </div> 

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