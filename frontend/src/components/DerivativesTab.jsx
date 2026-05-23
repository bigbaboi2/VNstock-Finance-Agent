import { Activity, Zap, HelpCircle, BarChart3, BrainCircuit } from 'lucide-react';
import TradingChart from './TradingChart';
import AtomLoader from './AtomLoader';

export default function DerivativesTab({
  isDark, UI,
  derivRadar,
  derivChartData,
  derivInterval, setDerivInterval,
  derivAnalysis,
  volumeProfile,
  showLeaderInfo, setShowLeaderInfo,
  showVolInfo, setShowVolInfo,
  demoBalance,
  demoPosition, setDemoPosition,
  demoEntryPrice, setDemoEntryPrice,
  demoVolume, setDemoVolume,
  addLog,
}) {
  return (
    <>
                 {/* CỘT TRÁI PHÁI SINH: VN30 ENGINE & BASIS RADAR */}
                <div className={`w-[450px] border-r flex flex-col shrink-0 overflow-hidden relative h-full transition-colors duration-300 ${UI.leftCol} animate-in fade-in slide-in-from-left-4`}>
                    
                    {/* 🚀 1. HEADER CARD: GIÁ & BASIS */}
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

                    {/* 🚀 2. PHẦN CUỘN: TRỤ DẪN DẮT & WIDGETS */}
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
                                    
                                    {/* 1. TÊN MÃ */}
                                    <span className="font-black text-sm text-yellow-500 w-10">{stock.symbol}</span>
                                    
                                    {/* 2. TRỤC THANH ĐỐI XỨNG  */}
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
                                    
                                    {/* 3. CON SỐ PHẦN TRĂM & LỰC TÁC ĐỘNG THỰC TẾ  */}
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
                    {/* WIDGET CẬP NHẬT: OI & KHỐI NGOẠI RÒNG CHUẨN TERMINAL */}
                    <div className="mt-8 grid grid-cols-2 gap-4 pb-10">
                            {/* WIDGET 1: VỊ THẾ MỞ (OI) */}
                            <div className={`p-4 rounded-2xl border shadow-sm ${isDark ? 'bg-black/40 border-white/5' : 'bg-white border-slate-200'}`}>
                                <p className={`text-[10px] font-black uppercase tracking-wider mb-1.5 ${UI.textMuted}`}>Vị thế mở (OI)</p>
                                <p className={`text-xl font-mono font-black ${UI.textBold}`}>
                                    {/* FIX LỖI : Ép kiểu an toàn trước khi toLocaleString */}
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

        {/* CHART AREA WITH VOLUME PROFILE */}
                    <div className="grid grid-cols-4 gap-6 mb-8">
                        {/* KHU VỰC 1: ĐỒ THỊ KỸ THUẬT PHÁI SINH */}
                        <div className={`col-span-3 h-[500px] rounded-[24px] border overflow-hidden shadow-xl relative flex items-center justify-center ${isDark ? 'bg-black/40 border-orange-500/20' : 'bg-white border-orange-200'}`}>
                            {derivChartData ? (
                                <TradingChart 
                                    data={derivChartData} 
                                    theme={isDark ? 'dark' : 'light'}
                                    onIntervalChange={setDerivInterval} 
                                    currentInterval={derivInterval}
                                />
                            ) : (
                                <AtomLoader message="ĐANG ĐỒNG BỘ CHART PHÁI SINH REALTIME..." />
                            )}
                        </div>

                        {/* KHU VỰC 2: BỨC TƯỜNG KHỐI LƯỢNG VOLUME PROFILE */}
                        <div className={`col-span-1 rounded-[24px] border shadow-sm p-4 flex flex-col relative ${isDark ? 'bg-black/20 border-white/5' : 'bg-white border-slate-200'}`}>
                            <div className="flex items-center justify-between mb-4">
                                <p className={`text-[9px] font-black uppercase tracking-widest ${UI.textMuted}`}>Volume Profile</p>
                                <div onMouseEnter={() => setShowVolInfo(true)} onMouseLeave={() => setShowVolInfo(false)}>
                                    <HelpCircle size={14} className="text-orange-500 cursor-pointer" />
                                    {showVolInfo && (
                                        <div className={`absolute right-0 top-10 mt-1 w-56 p-3 rounded-xl shadow-xl z-50 text-[10px] font-bold leading-relaxed ${isDark ? 'bg-[#1a222e] text-slate-300 border border-slate-700' : 'bg-white text-slate-600 border border-slate-200'}`}>
                                            Biểu đồ bức tường khối lượng (Intraday). Hiển thị các mức giá xảy ra nhiều giao dịch nhất trong ngày. Giúp xác định vùng kẹt lệnh (POC) làm hỗ trợ/kháng cự cứng.
                                        </div>
                                    )}
                                </div>
                            </div>
                            
                            <div className="flex-1 flex flex-col gap-1 justify-around">
                                {volumeProfile ? (
                                    volumeProfile.bins.map((bin, idx) => (
                                        <div key={idx} className="flex items-center gap-2">
                                            <span className={`text-[10px] font-mono w-10 ${UI.textMuted}`}>{bin.priceCenter}</span>
                                            <div className={`flex-1 h-3 rounded-sm overflow-hidden flex ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`}>
                                                <div className="bg-orange-500/60 h-full transition-all duration-500" style={{width: `${(bin.volume / volumeProfile.maxVol) * 100}%`}}></div>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="flex flex-col items-center justify-center py-12 opacity-80">
                                        <div className="scale-75">
                                            <AtomLoader message="READING POC..." />
                                        </div>
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
                        <div className="grid grid-cols-3 gap-6">

                            {/* ================================================= */}
                            {/* CỘT 1: BIẾN SỐ ĐỘNG LỰC HỌC                       */}
                            {/* ================================================= */}
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 text-yellow-500">
                                    <Activity size={16} />
                                    <span className="text-xs font-black uppercase tracking-widest">Biến số Động lực học</span>
                                </div>
                                <ul className={`text-[11px] leading-relaxed font-bold space-y-2 ${UI.textMuted}`}>
                                    <li className="flex items-center gap-1.5 relative group cursor-default">
                                        <span>• Tốc độ xé Basis:</span>
                                        <HelpCircle size={12} className="text-slate-400 hover:text-yellow-500 transition-colors" />
                                        <span className={(parseFloat(derivRadar?.basisSpeed) || 0) > 0 ? 'text-emerald-500' : (parseFloat(derivRadar?.basisSpeed) || 0) < 0 ? 'text-red-500' : 'text-slate-400'}>
                                            {(parseFloat(derivRadar?.basisSpeed) || 0) > 0 ? '+' : ''}{derivRadar?.basisSpeed || 0} điểm/nhịp
                                        </span>
                                    </li>

                                    <li className="flex items-center gap-1.5 relative group cursor-default">
                                        <span>• Tổng lực 10 Trụ:</span>
                                        <HelpCircle size={12} className="text-slate-400 hover:text-yellow-500 transition-colors" />
                                        <span className={(derivRadar?.influencers || []).reduce((sum, stock) => sum + (parseFloat(stock.realImpact) || 0), 0) > 0 ? 'text-emerald-500' : 'text-red-500'}>
                                            {(derivRadar?.influencers || []).reduce((sum, stock) => sum + (parseFloat(stock.realImpact) || 0), 0) > 0 ? '+' : ''}{(derivRadar?.influencers || []).reduce((sum, stock) => sum + (parseFloat(stock.realImpact) || 0), 0).toFixed(2)} điểm
                                        </span>
                                    </li>

                                    <li className="flex items-center gap-1.5 relative group cursor-default">
                                        <span>• Vùng kẹt POC:</span>
                                        <HelpCircle size={12} className="text-slate-400 hover:text-yellow-500 transition-colors" />
                                        <span className={`px-1.5 py-0.5 rounded ${isDark ? 'text-white bg-white/10' : 'text-slate-800 bg-black/10'}`}>
                                            {volumeProfile?.pocPrice ? parseFloat(volumeProfile.pocPrice).toFixed(1) : 'Đang tính...'}
                                        </span>
                                    </li>

                                    <li className="flex items-center gap-1.5 relative group cursor-default">
                                        <span>• Xu thái OI:</span>
                                        <HelpCircle size={12} className="text-slate-400 hover:text-yellow-500 transition-colors" />
                                        <span className="text-orange-500">{derivRadar?.oiTrend || 'ĐANG QUÉT...'}</span>
                                    </li>

                                    <li className="flex items-center gap-1.5 relative group cursor-default">
                                        <span>• Ngoại ròng (Net):</span>
                                        <HelpCircle size={12} className="text-slate-400 hover:text-yellow-500 transition-colors" />
                                        <span className={(parseFloat(derivRadar?.foreignNet) || 0) > 0 ? 'text-emerald-500' : 'text-red-500'}>
                                            {(parseFloat(derivRadar?.foreignNet) || 0) > 0 ? '+' : ''}{derivRadar?.foreignNet || 0} HĐ
                                        </span>
                                    </li>

                                    <li>• VWAP: <span className={(parseFloat(derivRadar?.vn30f1m) || 0) >= parseFloat(derivAnalysis.vwap) ? 'text-emerald-500' : 'text-red-500'}>
                                        {derivAnalysis.vwap} ({(parseFloat(derivRadar?.vn30f1m) || 0) >= parseFloat(derivAnalysis.vwap) ? 'TRÊN ↑' : 'DƯỚI ↓'})
                                    </span></li>

                                    <li>• Session H/L: <span className="text-yellow-500">{derivAnalysis.sessionHigh}</span>
                                        {' / '}<span className="text-red-400">{derivAnalysis.sessionLow}</span>
                                    </li>

                                    <li>• CVD: <span className={(derivAnalysis.cvd || 0) >= 0 ? 'text-emerald-500' : 'text-red-500'}>
                                        {(derivAnalysis.cvd || 0) >= 0 ? '+' : ''}{Number(derivAnalysis.cvd || 0).toLocaleString('vi-VN')} HĐ
                                    </span></li>

                                    <li>• ROC(5): <span className={parseFloat(derivAnalysis.roc5) >= 0 ? 'text-emerald-500' : 'text-red-500'}>
                                        {derivAnalysis.roc5}%
                                    </span></li>

                                    <li>• OI Signal: <span className={derivAnalysis.oiInterpretation.color}>
                                        {derivAnalysis.oiInterpretation.label}
                                    </span></li>
                                </ul>
                            </div>

                            {/* ================================================= */}
                            {/* CỘT 2: KHU VỰC ĐẶT LỆNH DEMO TRADING             */}
                            {/* ================================================= */}
                            <div className={`border-l pl-6 space-y-4 ${isDark ? 'border-white/10' : 'border-orange-200'}`}>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 text-blue-400">
                                        <Activity size={16} />
                                        <span className="text-[10px] font-black uppercase tracking-widest">Demo Trading</span>
                                    </div>
                                    <span className="text-[9px] font-bold text-slate-500 uppercase bg-slate-500/10 px-2 py-0.5 rounded">1 Điểm = 100K</span>
                                </div>

                                <div className={`p-4 rounded-xl border shadow-sm ${isDark ? 'bg-[#151b24] border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                                    <div className="flex justify-between items-center mb-3">
                                        <span className="text-[9px] uppercase font-black tracking-widest text-slate-500">NAV (VNĐ)</span>
                                        <span className="font-mono font-black text-lg">{demoBalance.toLocaleString('vi-VN')}</span>
                                    </div>
                                    <div className="flex justify-between items-center pt-3 border-t border-dashed border-slate-500/30">
                                        <span className="text-[9px] uppercase font-black tracking-widest text-slate-500">Lãi/Lỗ Tạm Tính</span>
                                        <span className={`font-mono font-black text-lg ${((parseFloat(derivRadar?.vn30f1m) || 0) - demoEntryPrice) * demoPosition * 100000 > 0 ? 'text-emerald-500' : ((parseFloat(derivRadar?.vn30f1m) || 0) - demoEntryPrice) * demoPosition * 100000 < 0 ? 'text-red-500' : 'text-slate-500'}`}>
                                            {demoPosition !== 0 && (parseFloat(derivRadar?.vn30f1m) || 0) > 0 
                                                ? `${((parseFloat(derivRadar?.vn30f1m) || 0) - demoEntryPrice) * demoPosition * 100000 > 0 ? '+' : ''}${(((parseFloat(derivRadar?.vn30f1m) || 0) - demoEntryPrice) * demoPosition * 100000).toLocaleString('vi-VN')}`
                                                : '0'
                                            }
                                        </span>
                                    </div>
                                </div>

                                <div className={`flex items-center justify-between p-3 rounded-xl border ${demoPosition !== 0 ? (demoPosition > 0 ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-red-500/50 bg-red-500/10') : 'border-dashed border-slate-500/50'}`}>
                                    <div className="flex flex-col">
                                        <span className="text-[9px] uppercase font-bold text-slate-500">Trạng thái</span>
                                        <span className={`font-black text-sm mt-0.5 ${demoPosition > 0 ? 'text-emerald-500' : demoPosition < 0 ? 'text-red-500' : 'text-slate-400'}`}>
                                            {demoPosition > 0 ? `LONG ${demoPosition} HĐ` : demoPosition < 0 ? `SHORT ${Math.abs(demoPosition)} HĐ` : 'FLAT'}
                                        </span>
                                    </div>
                                    <div className="flex flex-col text-right">
                                        <span className="text-[9px] uppercase font-bold text-slate-500">Giá vốn</span>
                                        <span className="font-black text-sm mt-0.5 text-yellow-500">{demoPosition !== 0 ? demoEntryPrice.toFixed(1) : '---'}</span>
                                    </div>
                                </div>

                                <div className="pt-2">
                                    <div className="flex items-center gap-3 mb-3">
                                        <span className="text-[9px] font-bold text-slate-500 uppercase">Khối lượng:</span>
                                        <input
                                            type="number"
                                            min="1"
                                            value={demoVolume}
                                            onChange={(e) => setDemoVolume(Math.max(1, parseInt(e.target.value) || 1))}
                                            className={`w-16 h-8 rounded text-center font-black outline-none border ${isDark ? 'bg-black/50 border-white/10 text-white' : 'bg-white border-slate-300 text-black'}`}
                                        />
                                        <span className="text-[9px] font-bold text-slate-500 uppercase">Hợp đồng</span>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3 mb-3">
                                        <button 
                                            onClick={() => {
                                                const price = parseFloat(derivRadar?.vn30f1m) || 0;
                                                if(!price) return addLog('[DEMO] Chưa có giá hợp lệ!');
                                                if(demoPosition < 0) {
                                                    setDemoBalance(p => p + (price - demoEntryPrice) * demoPosition * 100000);
                                                    setDemoPosition(demoVolume);
                                                    setDemoEntryPrice(price);
                                                    addLog(`[DEMO] Đảo sang LONG ${demoVolume} HĐ tại ${price}`);
                                                } else {
                                                    const totalVol = demoPosition + demoVolume;
                                                    const avgPrice = ((demoEntryPrice * demoPosition) + (price * demoVolume)) / totalVol;
                                                    setDemoPosition(totalVol);
                                                    setDemoEntryPrice(avgPrice);
                                                    addLog(`[DEMO] Mở/Nhồi LONG ${demoVolume} HĐ tại ${price}`);
                                                }
                                            }}
                                            className="h-11 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-white font-black text-[11px] uppercase tracking-wider transition-all active:scale-95 shadow-lg shadow-emerald-500/20"
                                        >
                                            Mua (Long)
                                        </button>
                                        <button 
                                            onClick={() => {
                                                const price = parseFloat(derivRadar?.vn30f1m) || 0;
                                                if(!price) return addLog('[DEMO] Chưa có giá hợp lệ!');
                                                if(demoPosition > 0) {
                                                    setDemoBalance(p => p + (price - demoEntryPrice) * demoPosition * 100000);
                                                    setDemoPosition(-demoVolume);
                                                    setDemoEntryPrice(price);
                                                    addLog(`[DEMO] Đảo sang SHORT ${demoVolume} HĐ tại ${price}`);
                                                } else {
                                                    const currentAbs = Math.abs(demoPosition);
                                                    const totalVol = currentAbs + demoVolume;
                                                    const avgPrice = ((demoEntryPrice * currentAbs) + (price * demoVolume)) / totalVol;
                                                    setDemoPosition(-totalVol);
                                                    setDemoEntryPrice(avgPrice);
                                                    addLog(`[DEMO] Mở/Nhồi SHORT ${demoVolume} HĐ tại ${price}`);
                                                }
                                            }}
                                            className="h-11 rounded-lg bg-red-500 hover:bg-red-400 text-white font-black text-[11px] uppercase tracking-wider transition-all active:scale-95 shadow-lg shadow-red-500/20"
                                        >
                                            Bán (Short)
                                        </button>
                                    </div>
                                    <button 
                                        onClick={() => {
                                            const price = parseFloat(derivRadar?.vn30f1m) || 0;
                                            const pnl = (price - demoEntryPrice) * demoPosition * 100000;
                                            setDemoBalance(p => p + pnl);
                                            setDemoPosition(0);
                                            setDemoEntryPrice(0);
                                            addLog(`[DEMO] Chốt vị thế. PnL: ${pnl > 0 ? '+' : ''}${pnl.toLocaleString()} VNĐ`);
                                        }} 
                                        disabled={demoPosition === 0}
                                        className="w-full h-10 rounded-lg bg-slate-600 hover:bg-yellow-500 disabled:opacity-50 disabled:hover:bg-slate-600 text-white disabled:text-slate-400 hover:text-black font-black text-[10px] uppercase tracking-widest transition-all active:scale-95"
                                    >
                                        Đóng Toàn Bộ Vị Thế
                                    </button>
                                </div>
                            </div>

                            {/* ================================================= */}
                            {/* CỘT 3: CONFLUENCE SIGNAL METRIC                  */}
                            {/* ================================================= */}
                            <div className={`border-l pl-6 space-y-6 ${isDark ? 'border-white/10' : 'border-orange-200'}`}>
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

                                <div className={`rounded-3xl border p-6 ${derivAnalysis.bgColor}`}>
                                    <div className={`text-2xl font-black mb-4 ${derivAnalysis.mechColor}`}>
                                        {derivAnalysis.mechAction}
                                    </div>
                                    <div className="space-y-3 mb-6">
                                        <div className="flex justify-between">
                                            <span className="text-slate-400 font-bold">ENTRY</span>
                                            <span className="font-black">{(parseFloat(derivRadar?.vn30f1m) || 0).toFixed(1)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-red-400 font-bold">SL (-1.5 ATR)</span>
                                            <span className="font-black">{derivAnalysis.sl}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-emerald-400 font-bold">TP1 (1R)</span>
                                            <span className="font-black">{derivAnalysis.tp1}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-emerald-400 font-bold">TP2 (2.2R)</span>
                                            <span className="font-black">{derivAnalysis.tp2}</span>
                                        </div>
                                        <div className="flex justify-between pt-2 border-t border-white/10">
                                            <span className="text-yellow-400 font-bold">R:R Ratio</span>
                                            <span className="font-black">1:{derivAnalysis.rrRatio}</span>
                                        </div>
                                    </div>
                                    <div className={`text-sm italic leading-relaxed ${UI.textNormal}`}>
                                        {derivAnalysis.mechReason}
                                    </div>
                                </div>
                            </div>

                        </div>  
                    </div>  
                </div> 
        </>
  );
}