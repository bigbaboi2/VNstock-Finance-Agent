import { Activity, Zap, HelpCircle, BarChart3, BrainCircuit, Database, Globe, RefreshCw } from 'lucide-react';
import TradingChart from './TradingChart';
import AtomLoader from './AtomLoader';
import ReactMarkdown from 'react-markdown';
import { useState, useRef, useCallback } from 'react';

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
}) {
    // USESTATE
const [chartHeight, setChartHeight] = useState(500);
const dragStartY = useRef(null);
const dragStartH = useRef(null);
 
const onChartDragStart = useCallback((e) => {
    dragStartY.current  = e.clientY;
    dragStartH.current  = chartHeight;
 
    const onMouseMove = (ev) => {
        const delta = ev.clientY - dragStartY.current;
        // Clamp between 280px and 750px
        setChartHeight(Math.min(750, Math.max(280, dragStartH.current + delta)));
    };
    const onMouseUp = () => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
}, [chartHeight]);

  return (
    <>
        {/* CỘT TRÁI PHÁI SINH: VN30 ENGINE , BASIS RADAR , NEWS*/}
            <div className={`w-[450px] border-r flex flex-col shrink-0 overflow-hidden relative h-full transition-colors duration-300 ${UI.leftCol} animate-in fade-in slide-in-from-left-4`}>
                
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

                {/* 2. PHẦN CUỘN: TRỤ DẪN DẮT & WIDGETS */}
                    <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
                        <div className="flex items-center gap-2 mb-4 relative">
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

                        <div className="flex flex-col gap-3">
                        {(derivRadar?.influencers || []).map(stock => {
                            const changeVal = parseFloat(stock.change) || 0;
                            const barWidth = Math.min((Math.abs(changeVal) / 7) * 100, 100); 
                            const isUp = changeVal >= 0;

                            return (
                                <div key={stock.symbol} className={`flex items-center justify-between p-3 rounded-xl border shadow-sm transition-all ${isDark ? 'bg-white/5 border-white/5 hover:bg-white/10' : 'bg-white border-slate-200 hover:bg-slate-50'}`}>
                                    
                                     <span className="font-black text-sm text-yellow-500 w-10">{stock.symbol}</span>
                                    
                                     <div className={`flex-1 mx-4 h-1.5 rounded-full relative flex ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`}>
                                        <div className="absolute left-1/2 top-[-2px] bottom-[-2px] w-[2px] bg-slate-500/50 z-10 transform -translate-x-1/2 rounded-full"></div>
                                        
                                        <div className="w-1/2 h-full relative">
                                            {!isUp && (
                                                <div 
                                                    className="absolute right-0 h-full bg-red-500 rounded-l-full transition-all duration-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]"
                                                    style={{ width: `${barWidth}%` }}
                                                ></div>
                                            )}
                                        </div>
                                        
                                        <div className="w-1/2 h-full relative">
                                            {isUp && (
                                                <div 
                                                    className="absolute left-0 h-full bg-emerald-500 rounded-r-full transition-all duration-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                                                    style={{ width: `${barWidth}%` }}
                                                ></div>
                                            )}
                                        </div>
                                    </div>
                                    
                                     <div className="flex flex-col items-end w-16 shrink-0">
                                        <span className={`text-[11px] font-black ${isUp ? 'text-emerald-500' : 'text-red-500'}`}>
                                            {isUp ? '+' : ''}{changeVal}%
                                        </span>
                                        <span className={`text-[8px] font-bold mt-0.5 uppercase tracking-wider ${Number(stock.realImpact) >= 0 ? 'text-emerald-500/70' : 'text-red-500/70'}`}>
                                            Lực: {Number(stock.realImpact) > 0 ? '+' : ''}{stock.realImpact || '0.00'}
                                        </span>
                                    </div>
                                    
                                </div>
                            );
                        })}
                        </div>                                     
                         <div className="mt-8 grid grid-cols-2 gap-4 pb-10">
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
                                    {/*  */}
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
                    <div className="mt-8 pt-6 border-t border-white/10 flex flex-col h-[380px] w-full">
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
                        
                        <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-2 w-full">
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
            <div className={`flex-1 overflow-y-auto p-8 relative transition-colors duration-300 ${UI.rightCol} animate-in fade-in`}>
            
            {/* HEADER CHIẾN THUẬT */}
            <div className={`flex items-center justify-between mb-6 pb-4 border-b ${UI.border}`}>
                <div className="flex items-center gap-3">
                    <Zap className="text-orange-500" size={24} />
                    <h3 className={`font-black tracking-widest uppercase text-lg ${UI.textBold}`}>Derivatives Execution Flow</h3>
                </div>
            </div>
            {/* CHART AREA */}
            <div
                className={`sticky top-0 z-10 grid grid-cols-4 gap-6 mb-4 ${isDark ? 'bg-[#0d1117]' : 'bg-slate-50'}`}
                style={{ paddingBottom: '8px', paddingTop: '4px' }}
            >
                {/* CHART */}
                <div
                    className={`col-span-3 rounded-[24px] border overflow-hidden shadow-xl relative flex items-center justify-center ${isDark?'bg-black/40 border-orange-500/20':'bg-white border-orange-200'}`}
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
            
                {/* DRAG HANDLE — resize grip, always visible */}
                <div
                    onMouseDown={onChartDragStart}
                    className="absolute bottom-0 left-0 right-0 h-6 cursor-ns-resize flex flex-col items-center justify-center gap-[3px] group"
                    title="Kéo lên/xuống để thay đổi chiều cao chart"
                >
                    <div className={`w-8 h-[2px] rounded-full transition-all duration-150 ${isDark ? 'bg-white/20 group-hover:bg-orange-500' : 'bg-black/15 group-hover:bg-orange-500'}`} />
                    <div className={`w-5 h-[2px] rounded-full transition-all duration-150 ${isDark ? 'bg-white/20 group-hover:bg-orange-500' : 'bg-black/15 group-hover:bg-orange-500'}`} />
                    <div className={`text-[8px] font-black tracking-widest select-none transition-all duration-150 ${isDark ? 'text-white/20 group-hover:text-orange-500' : 'text-black/20 group-hover:text-orange-500'}`}>
                        ↕
                    </div>
                </div>
            </div>
                {/* VOLUME PROFILE */}
                <div
                    className={`col-span-1 rounded-[24px] border shadow-sm p-4 flex flex-col relative ${isDark?'bg-black/20 border-white/5':'bg-white border-slate-200'}`}
                    style={{ height: chartHeight + 'px' }}
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
            <div className={`p-6 rounded-[32px] border transition-all duration-500 ${isDark ? 'bg-[#10151C] border-orange-500/30 shadow-[0_0_30px_rgba(249,115,22,0.1)]' : 'bg-orange-50 border-orange-200'}`}>
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-2xl bg-orange-500 text-white flex items-center justify-center shadow-lg shadow-orange-500/40"><BrainCircuit size={20}/></div>
                    <div>
                        <h4 className={`text-sm font-black uppercase tracking-widest ${UI.textBold}`}>AI Scalping Assistant</h4>
                        <p className="text-[9px] font-bold text-orange-500 uppercase">Real-time Strategy Engine</p>
                    </div>
                </div>

                {/* MAIN GRID */}
                <div className="grid grid-cols-3 gap-6" style={{ minHeight: 0 }}>
 
                    {/* ============================================================
                        COL 1: ORDER FLOW & MACRO MATRIX  
                        ============================================================ */}
                    <div className="space-y-5">
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
                            <div className="flex-1 overflow-y-auto font-mono text-[10px] space-y-1 custom-scrollbar pr-1">
                                <div className="flex justify-between text-emerald-400 font-bold bg-emerald-500/5 p-1 rounded"><span>[14:42:10] SWEEP LONG</span><span>+120 HĐ</span></div>
                                <div className="flex justify-between text-red-400 font-bold bg-red-500/5 p-1 rounded"><span>[14:41:05] SWEEP SHORT</span><span>-65 HĐ</span></div>
                                <div className="flex justify-between text-emerald-400 font-bold bg-emerald-500/5 p-1 rounded"><span>[14:38:50] SWEEP LONG</span><span>+80 HĐ</span></div>
                                <div className="flex justify-between text-slate-400"><span>[14:35:12] NO LARGE TRADES</span><span>---</span></div>
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
                    </div>
                
                    {/* ============================================================
                        COL 2: AI SCALPING ASSISTANT — SCROLLS INDEPENDENTLY
                         ============================================================ */}
                    <div
                        className="flex flex-col gap-4 overflow-y-auto custom-scrollbar pr-1"
                        style={{ maxHeight: '680px' }}   
                    >
                        {/* --- TASK 4: ACTION PANEL (above AI report) --- */}
                        <div className={`rounded-[24px] border p-5 ${derivAnalysis.bgColor}`}>
                             <div className="flex items-center gap-2 mb-4">
                                <Zap size={16} className={derivAnalysis.mechColor} />
                                <span className={`text-[10px] font-black uppercase tracking-widest ${derivAnalysis.mechColor}`}>
                                    Action Panel — {derivAnalysis.mechAction}
                                </span>
                            </div>
                
                             <div className="grid grid-cols-2 gap-2 mb-3">
                                {[
                                    { label: 'ENTRY', val: `${(parseFloat(derivRadar?.vn30f1m)||0).toFixed(1)}`, color: 'text-white' },
                                    { label: 'SL (−1.5 ATR)', val: derivAnalysis.sl, color: 'text-red-400' },
                                    { label: 'TP1 (1R)', val: derivAnalysis.tp1, color: 'text-emerald-400' },
                                    { label: 'TP2 (2.2R)', val: derivAnalysis.tp2, color: 'text-emerald-300' },
                                ].map(item => (
                                    <div key={item.label} className={`rounded-xl p-3 flex flex-col items-center ${isDark ? 'bg-black/30' : 'bg-white/60'} border border-white/10`}>
                                        <span className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">{item.label}</span>
                                        <span className={`text-base font-black ${item.color}`}>{item.val}</span>
                                    </div>
                                ))}
                            </div>
                
                             <div className={`flex items-center justify-between px-3 py-2 rounded-xl mb-3 ${isDark ? 'bg-black/20' : 'bg-white/50'}`}>
                                <span className="text-[10px] font-black text-yellow-400 uppercase">R:R Ratio</span>
                                <span className="text-sm font-black">1 : {derivAnalysis.rrRatio}</span>
                            </div>
                
                             <div className="flex flex-wrap gap-1 mb-3">
                                {[
                                    { label: `EMA3 ${derivAnalysis.shortTermTrend === 1 ? '↑' : '↓'} EMA8`, ok: true },
                                    { label: `OI ${derivAnalysis.oiInterpretation?.label}`, ok: derivAnalysis.oiUp },
                                    { label: `Khối ngoại ${(parseFloat(derivRadar?.foreignNet)||0) >= 0 ? 'MUA' : 'BÁN'} ${Math.abs(parseFloat(derivRadar?.foreignNet)||0)} HĐ`, ok: (parseFloat(derivRadar?.foreignNet)||0) >= 0 },
                                    { label: `Tổng trụ ${(derivAnalysis.totalImpact||0) >= 0 ? '+' : ''}${(derivAnalysis.totalImpact||0).toFixed ? Number(derivAnalysis.totalImpact).toFixed(2) : derivAnalysis.totalImpact} đ`, ok: (parseFloat(derivAnalysis.totalImpact)||0) >= 0 },
                                    { label: `POC ${derivAnalysis.pocDistance}`, ok: true },
                                    { label: `Score ${derivAnalysis.score}/100`, ok: derivAnalysis.score >= 50 },
                                ].map((b, i) => (
                                    <span key={i} className={`text-[9px] font-black px-2 py-0.5 rounded-full ${b.ok ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                                        {b.label}
                                    </span>
                                ))}
                            </div>
                
                             <p className={`text-[10px] italic leading-relaxed ${UI.textMuted}`}>{derivAnalysis.mechReason}</p>
                        </div>
                        {/* AI CALL BUTTON */}
                        <div>
                            {lastAiDerivTime && (() => {
                                const elapsed = Date.now() - lastAiDerivTime;
                                const remainMs = 5 * 60 * 1000 - elapsed;
                                const canCallAI = elapsed >= 5 * 60 * 1000;
                                const remainMin = Math.floor(remainMs / 60000);
                                const remainSec = Math.floor((remainMs % 60000) / 1000);
                                return (
                                    <div className="text-center mb-2 space-y-0.5">
                                        <p className={`text-[9px] font-mono ${UI.textMuted}`}>
                                            Phân tích gần nhất: {new Date(lastAiDerivTime).toLocaleTimeString('vi-VN')}
                                        </p>
                                        {canCallAI ? (
                                            <p className="text-[9px] font-black text-emerald-500 uppercase tracking-wider">
                                                ✓ Sẵn sàng phân tích mới
                                            </p>
                                        ) : (
                                            <p className="text-[9px] font-mono text-yellow-500">
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
                                    onClick={handleAiDerivAnalysis}
                                    className="w-full h-12 rounded-xl flex items-center justify-center gap-2 font-black text-xs uppercase tracking-widest transition-all shadow-lg bg-orange-500 hover:bg-orange-400 text-white shadow-orange-500/20 active:scale-95"
                                >
                                    <BrainCircuit size={16} className="animate-pulse"/>
                                    AI LẬP KẾ HOẠCH VÀO LỆNH
                                </button>
                            )}
                        </div>
                
                        {/* AI REPORT */}
                        {aiDerivReport && (
                            <div className={`rounded-2xl border p-4 ${isDark?'bg-[#0a0e14] border-orange-500/30':'bg-white border-orange-200 shadow-inner'}`}>
                                <div className={`prose max-w-none prose-sm prose-headings:text-orange-500 prose-headings:font-black prose-headings:uppercase prose-p:leading-relaxed prose-strong:text-emerald-500 prose-li:text-[11px] ${isDark?'prose-invert prose-p:text-slate-300':'prose-p:text-slate-700'}`}>
                                    <ReactMarkdown>{aiDerivReport}</ReactMarkdown>
                                </div>
                            </div>
                        )}
                    </div>
                
                     <div className={`border-l pl-6 space-y-5 ${isDark?'border-white/10':'border-orange-200'}`}>

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
                                    { label: 'Xu thái OI:', val: derivRadar?.oiTrend||'ĐANG QUÉT...', color:'text-orange-500', tip:'Open Interest tăng = tiền mới vào thị trường. OI giảm = đang đóng vị thế hàng loạt.' },
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
                    </div>
                </div>
            </div>  
        </div> 
    </>
  );
}