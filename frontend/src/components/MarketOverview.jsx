import React, { useMemo } from 'react';
import { Globe, Zap, Loader2 } from 'lucide-react';

export default React.memo(function MarketOverview({ isDark, UI, marketIntel, vnIndexData }) {
    const isLoading = !marketIntel;

    const colorMap = useMemo(() => ({
        bullish: isDark ? 'text-emerald-400' : 'text-emerald-600',
        bearish: isDark ? 'text-red-400' : 'text-red-600',
        warning: isDark ? 'text-yellow-400' : 'text-yellow-600',
        neutral: isDark ? 'text-slate-400' : 'text-slate-600'
    }), [isDark]);

    const statusColor = colorMap[marketIntel?.statusType] || colorMap.neutral;
    const isUp = parseFloat(marketIntel?.indexChangePct || 0) >= 0;

    const emeraldBadge = isDark ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-emerald-100 text-emerald-700 border border-emerald-300';
    const redBadge = isDark ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-red-100 text-red-700 border border-red-300';

    if (isLoading) {
      return (
        <div className={`shrink-0 h-[180px] border-t flex items-center justify-center ${isDark ? 'border-white/10 bg-[#0B0F14]' : 'border-slate-300 bg-white'}`}>
          <div className="flex flex-col items-center gap-3 opacity-70">
            <Loader2 size={28} className="animate-spin text-yellow-400" />
            <p className="text-xs font-black uppercase tracking-[0.2em]">QUANT ENGINE ĐANG TÍNH TOÁN...</p>
          </div>
        </div>
      );
    }

    return (
      <div className={`shrink-0 border-t p-5 flex flex-col z-20 shadow-[0_-10px_30px_rgba(0,0,0,0.1)] ${isDark ? 'border-white/10 bg-[#0B0F14]' : 'border-slate-300 bg-slate-50'}`}>
        
        {/* HEADER: VN-INDEX */}
        <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-2">
                <Globe size={18} className={statusColor} />
                <h3 className={`text-sm font-black uppercase tracking-[0.2em] ${UI.textBold}`}>Hệ Sinh Thái VN-INDEX</h3>
            </div>
            <div className={`px-2 py-1 rounded text-[11px] font-black tracking-widest border ${isUp ? (isDark ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-emerald-50 border-emerald-400 text-emerald-600') : (isDark ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-red-50 border-red-400 text-red-600')}`}>
                VN-INDEX: {isUp ? '+' : ''}{marketIntel?.indexChangePct}%
            </div>
        </div>

        {/* Tech index */}
        <div className="grid grid-cols-2 gap-3 mb-4">
            <div className={`p-3 rounded-lg border flex flex-col justify-center shadow-sm ${isDark ? 'bg-black/40 border-white/5' : 'bg-white border-slate-200'}`}>
                <p className={`text-[9px] font-bold uppercase tracking-widest ${UI.textMuted}`}>Trạng thái Hệ thống</p>
                <p className={`text-[13px] font-black uppercase mt-1 ${statusColor}`}>{marketIntel?.marketStatus || 'ĐANG CẬP NHẬT'}</p>
            </div>
            <div className={`p-3 rounded-lg border flex flex-col justify-center shadow-sm ${isDark ? 'bg-black/40 border-white/5' : 'bg-white border-slate-200'}`}>
                <p className={`text-[9px] font-bold uppercase tracking-widest ${UI.textMuted}`}>Lan tỏa Dòng tiền</p>
                <p className={`text-[13px] font-black uppercase mt-1 ${UI.textBold}`}>{marketIntel?.breadthRatio}% Mã Tăng</p>
            </div>
        </div>
          
        {/*AI */}
        <p className={`text-[11px] italic font-medium mb-3 line-clamp-1 ${UI.textMuted}`}>
           <Zap size={10} className="inline mr-1 text-yellow-500"/> {marketIntel?.diagnosticDesc || 'Đang chờ đánh giá chuyên sâu từ hệ thống...'}
        </p>

        {/* Industry Group*/}
        <div className="flex flex-col gap-2.5">
            <div className="flex items-center gap-3">
                <span className={`w-16 shrink-0 text-[10px] font-black uppercase tracking-widest ${isDark ? 'text-emerald-500' : 'text-emerald-600'}`}>Hút Tiền:</span>
                <div className="flex gap-2 flex-wrap">
                    {marketIntel?.strongSectors && marketIntel.strongSectors.length > 0 ? marketIntel.strongSectors.map((sec, idx) => {
                        const name = sec.name || sec;  
                        const tickers = sec.tickers && sec.tickers.length > 0 ? sec.tickers.join(', ') : '';
                        
                        return (
                            <span key={name || idx} className={`px-2.5 py-1 text-[10px] font-black rounded shadow-sm flex items-center gap-1.5 ${emeraldBadge}`}>
                                {name}
                                {tickers && <span className="opacity-80 font-bold tracking-normal text-[9px]">({tickers})</span>}
                            </span>
                        );
                    }) : <span className={`text-[10px] italic ${UI.textMuted}`}>Không có dòng tiền dẫn dắt</span>}
                </div>
            </div>
            
            <div className="flex items-center gap-3">
                <span className={`w-16 shrink-0 text-[10px] font-black uppercase tracking-widest ${isDark ? 'text-red-500' : 'text-red-600'}`}>Rút Vốn:</span>
                <div className="flex gap-2 flex-wrap">
                    {marketIntel?.weakSectors && marketIntel.weakSectors.length > 0 ? marketIntel.weakSectors.map((sec, idx) => {
                        const name = sec.name || sec;
                        const tickers = sec.tickers && sec.tickers.length > 0 ? sec.tickers.join(', ') : '';
                        
                        return (
                            <span key={name || idx} className={`px-2.5 py-1 text-[10px] font-black rounded shadow-sm flex items-center gap-1.5 ${redBadge}`}>
                                {name}
                                {tickers && <span className="opacity-80 font-bold tracking-normal text-[9px]">({tickers})</span>}
                            </span>
                        );
                    }) : <span className={`text-[10px] italic ${UI.textMuted}`}>Áp lực bán không rõ rệt</span>}
                </div>
            </div>
        </div>
      </div>
    );
});