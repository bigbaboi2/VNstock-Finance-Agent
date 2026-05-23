import { 
  Activity, Zap, FileText, Database, BrainCircuit, 
  BarChart3, ChevronDown, ChevronUp, HelpCircle, Globe 
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import TradingChart from './TradingChart';
import MarketOverview from './MarketOverview';
import MarketRadar from './MarketRadar';
import { useState } from 'react';

export default function VnStocksTab({
  isDark, UI,
  allStocks,
  marketData,
  chartData,
  aiReport,
  analyzing,
  loadingMarket,
  loadingAiNews,
  activeInterval,
  showExtraStats, setShowExtraStats,
  showVolInfo, setShowVolInfo,
  actionData,
  isUpdatingAction,
  setShowPdfModal,
  vnIndexData,
  hnxIndexData,
  vn30Data,
  marketIntel,
  handleAiAnalysis,
  handleIntervalChange,
  fetchAiNews,
  stopNewsStream,
  fetchUserHistory,
  userHistory,
  setInput,
  fetchMarketData,
}) {
  const [historyLimit, setHistoryLimit] = useState(3);
  return (
    <>
            {/* GRID COLUMN 1: MARKET DATA & RADAR SUMMARY */}
        <div className={`w-[550px] border-r flex flex-col shrink-0 overflow-hidden relative h-full transition-colors duration-300 ${UI.leftCol}`}>
          <div className={`h-[6px] w-full shrink-0 z-50 relative overflow-hidden ${isDark ? 'bg-white/10' : 'bg-slate-300'}`}>
            {loadingMarket && (
              <div 
                className="absolute inset-0 bg-gradient-to-r from-transparent via-yellow-400 to-transparent animate-shimmer shadow-[0_0_15px_rgba(250,204,21,1)]"
                style={{ backgroundSize: '200% 100%', animation: 'shimmer 1.2s infinite linear' }}
              />
            )}
          </div>
          
          <div className="flex-1 flex flex-col overflow-y-auto min-h-0 custom-scrollbar">
              {!marketData ? (
                 <div className={`h-full flex flex-col items-center justify-center opacity-50 min-h-[400px] ${UI.textMuted}`}>
                    <Database size={48} className="mb-4" />
                    <p className="text-xs font-black uppercase">Waiting for Command</p>
                 </div>
              ) : (
                <div className="flex flex-col relative pb-4">

              {/* ROW PANEL: SYMBOL HEADINFO */}
              <div className={`shrink-0 p-6 border-b shadow-xl relative transition-colors duration-300 ${UI.card}`}>
                    <div className={`flex justify-between items-start mb-6 pb-6 border-b ${UI.border}`}>
                    <div>
                      <div className="flex items-end gap-2">
                        <h2 className={`text-5xl font-black tracking-tighter text-yellow-400 ${UI.textBold}`}>
                          {marketData.stockInfo.symbol}
                        </h2>
                        <span className="p-1 px-2 bg-emerald-500/10 text-emerald-500 rounded text-[10px] font-black uppercase tracking-widest mb-1">
                          {marketData.stockInfo?.exchange}
                        </span>
                      </div>
                      <p className={`text-[13px] font-medium mt-3 leading-tight italic max-w-[220px] ${UI.textNormal}`}>
                      {(marketData.companyProfile?.companyName && marketData.companyProfile.companyName !== marketData.stockInfo?.symbol) 
                          ? marketData.companyProfile.companyName 
                          : (allStocks.find(s => s.symbol === marketData.stockInfo?.symbol)?.companyName || 'Đang cập nhật...')}
                    </p>
                    </div>

                    <div className="text-right">
                      <p className={`text-[10px] uppercase tracking-widest font-black mb-1 ${UI.textMuted}`}>Giá Khớp Lệnh</p>
                      <h2 className={`text-3xl font-black leading-none ${UI.textBold}`}>
                        {marketData.stockInfo.currentPrice}
                      </h2>
                      <div className={`flex items-center justify-end gap-1 font-black text-sm mt-2 ${(marketData.stockInfo.change || 0) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                        {(marketData.stockInfo.change || 0) >= 0 ? '▲' : '▼'}
                        <span>
                          {Math.abs(marketData.stockInfo.change || 0).toLocaleString('vi-VN')} 
                          {' '}
                          ({Number(marketData.stockInfo.changePercent || 0).toFixed(2)}%)
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className={`grid grid-cols-4 gap-4 text-center mb-4 ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                    <div className={`p-3 rounded-xl border flex flex-col items-center justify-center ${isDark ? 'bg-[#1a1f2e] border-gray-700' : 'bg-gray-100 border-gray-200 shadow-sm'}`}>
                        <p className={`text-[10px] mb-2 font-black tracking-widest uppercase ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>VỐN HÓA</p>
                        <p className="font-black text-base lg:text-lg-2 leading-none whitespace-nowrap">{marketData.stockInfo.marketCap}</p>
                    </div>
                    <div className={`p-3 rounded-xl border flex flex-col items-center justify-center ${isDark ? 'bg-[#1a1f2e] border-gray-700' : 'bg-gray-100 border-gray-200 shadow-sm'}`}>
                        <p className={`text-[10px] mb-2 font-black tracking-widest uppercase ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>P/E</p>
                        <p className="font-black text-base lg:text-lg leading-none text-yellow-500 whitespace-nowrap">{marketData.stockInfo.pe}</p>
                    </div>
                    <div className={`p-3 rounded-xl border flex flex-col items-center justify-center ${isDark ? 'bg-[#1a1f2e] border-gray-700' : 'bg-gray-100 border-gray-200 shadow-sm'}`}>
                        <p className={`text-[10px] mb-2 font-black tracking-widest uppercase ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>TỔNG KL</p>
                        <p className="font-black text-base lg:text-lg leading-none whitespace-nowrap">{marketData.stockInfo.totalVolume}</p>
                    </div>
                    <div className={`p-3 px-4 rounded-xl border flex flex-col justify-center gap-2 ${isDark ? 'bg-[#1a1f2e] border-gray-700' : 'bg-gray-100 border-gray-200 shadow-sm'}`}>
                        <div className="flex justify-between items-center text-[13px] font-black text-emerald-500 leading-none">
                            <span className={`text-[6px] uppercase tracking-wider ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Mua</span>
                            <span className="whitespace-nowrap">{marketData.stockInfo.buyVolume}</span>
                        </div>
                        <div className="w-full h-2 flex rounded-full overflow-hidden bg-gray-800/20">
                            <div className="h-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" style={{ width: '60%' }}></div>
                            <div className="h-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" style={{ width: '40%' }}></div>
                        </div>
                        <div className="flex justify-between items-center text-[13px] font-black text-red-500 leading-none">
                            <span className={`text-[6px] uppercase tracking-wider ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Bán</span>
                            <span className="whitespace-nowrap">{marketData.stockInfo.sellVolume}</span>
                        </div>
                    </div>
                  </div>

                  <div className="flex justify-center mb-4 mt-2">
                      <button 
                          onClick={() => setShowExtraStats(!showExtraStats)}
                          className={`flex items-center gap-1 text-[10px] font-black tracking-widest uppercase px-4 py-1.5 rounded-full border transition-all ${
                              isDark ? 'text-gray-400 border-gray-700 hover:bg-gray-800 hover:text-yellow-400 hover:border-yellow-400/50' : 'text-gray-500 border-gray-300 hover:bg-yellow-50 hover:text-yellow-600 hover:border-yellow-400'
                          }`}
                      >
                          {showExtraStats ? <><ChevronUp size={14} /> THU GỌN CHỈ SỐ</> : <><ChevronDown size={14} /> XEM THÊM CHỈ SỐ TÀI CHÍNH</>}
                      </button>
                  </div>

                  {showExtraStats && (
                      <div className={`grid grid-cols-3 gap-4 text-center mb-6 p-4 rounded-xl border animate-in slide-in-from-top-2 fade-in duration-200 ${isDark ? 'bg-[#0f141e] border-gray-700' : 'bg-white border-gray-200 shadow-sm'}`}>
                          <div>
                              <p className={`text-[10px] mb-1 font-black tracking-widest uppercase ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>EPS (Nghìn)</p>
                              <p className="font-black text-lg">{marketData.stockInfo.eps}</p>
                          </div>
                          <div>
                              <p className={`text-[10px] mb-1 font-black tracking-widest uppercase ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>P/B</p>
                              <p className="font-black text-lg">{marketData.stockInfo.pb}</p>
                          </div>
                          <div>
                              <p className={`text-[10px] mb-1 font-black tracking-widest uppercase ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>GT Sổ sách</p>
                              <p className="font-black text-lg">{marketData.stockInfo.bvps}</p>
                          </div>
                      </div>
                  )}

                  <div className={`rounded-xl p-4 border mb-5 ${isDark ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                    <p className="text-[10px] uppercase tracking-widest text-yellow-500 font-black mb-1 flex items-center gap-2"><Activity size={12} /> Tổng quan doanh nghiệp</p>
                    <p className={`text-[11px] leading-relaxed italic line-clamp-2 ${UI.textMuted}`}>{marketData.companyProfile?.overview}</p>
                  </div>

                  <button
                    onClick={handleAiAnalysis}
                    disabled={analyzing}
                    className={`w-full h-12 rounded-xl hover:bg-yellow-400 hover:text-black font-black transition-all active:scale-95 flex items-center justify-center gap-3 disabled:opacity-50 mb-6 ${isDark ? 'bg-white text-black' : 'bg-slate-900 text-white'}`}
                  >
                    <BrainCircuit size={18} />
                    {analyzing ? 'AI ĐANG TƯ DUY...' : 'PHÂN TÍCH VỚI OMNI DUCK'}
                  </button>

                  <div className={`h-[6px] w-full shrink-0 relative overflow-hidden rounded-full ${isDark ? 'bg-white/5' : 'bg-slate-200'}`}>
                    {loadingMarket && <div className="absolute inset-0 bg-gradient-to-r from-transparent via-yellow-400 to-transparent animate-shimmer shadow-[0_0_15px_rgba(250,204,21,1)]" style={{ backgroundSize: '200% 100%', animation: 'shimmer 1.2s infinite linear' }} />}
                  </div>
              </div>

              {/* ROW PANEL: NEWS STREAM */}
              <div className="p-6">
                  <div className="space-y-3">
                   <button onClick={fetchAiNews} disabled={loadingAiNews} className={`w-full mt-4 h-12 rounded-xl font-black text-xs tracking-widest uppercase transition-all flex items-center justify-center gap-2 border border-dashed ${loadingAiNews ? 'opacity-50 border-slate-500 text-slate-500 cursor-not-allowed' : (isDark ? 'border-purple-500/50 text-purple-400 hover:bg-purple-500/10 hover:border-purple-500' : 'border-purple-400 text-purple-600 hover:bg-purple-50 hover:border-purple-500')}`}>
                    <BrainCircuit size={16} className={loadingAiNews ? "animate-pulse" : ""} />
                    {loadingAiNews ? 'ĐANG QUÉT MẠNG DEEP WEB...' : 'SĂN THÊM TIN BẰNG AI'}
                  </button>
                  <div className="flex items-center justify-between px-2 mb-4">
                    <h3 className={`text-[10px] uppercase tracking-[0.2em] font-black ${UI.textMuted}`}>Live News Stream</h3>
                    {loadingMarket ? (
                      <button onClick={stopNewsStream} className="flex items-center gap-2 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white px-3 py-1 rounded-full transition-all border border-red-500/30">
                        <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                        <span className="text-[9px] font-black uppercase tracking-widest">Dừng lấy tin</span>
                      </button>
                    ) : (
                      marketData.deepNewsData?.length > 0 && (
                        <div className="flex items-center gap-2 bg-emerald-500/10 text-emerald-500 px-3 py-1 rounded-full border border-emerald-500/30 animate-in fade-in slide-in-from-right-2">
                          <Zap size={10} fill="currentColor" />
                          <span className="text-[9px] font-black uppercase tracking-widest">Thành công: {marketData.deepNewsData.length} bài báo</span>
                        </div>
                      )
                    )}
                  </div>

                  {(marketData.deepNewsData || []).map((news, index) => (
                    <a key={index} href={news.link} target="_blank" rel="noopener noreferrer" className={`block rounded-2xl p-4 transition-all cursor-pointer group border ${UI.cardHover} ${news.isAiGenerated ? (isDark ? 'bg-[#1a1025] border-purple-500/50 shadow-[0_0_15px_rgba(168,85,247,0.15)]' : 'bg-purple-50 border-purple-400') : (isDark ? 'bg-[#10151C]' : 'bg-white')}`}>
                      <h3 className={`font-bold text-sm leading-snug transition-colors ${news.isAiGenerated ? 'text-purple-400 group-hover:text-purple-300' : `group-hover:text-yellow-500 ${UI.textNormal}`}`}>
                          {news.title}
                      </h3>
                      <div className="mt-3 flex justify-between items-center gap-3">
                        <div className="flex gap-2 items-center flex-1 min-w-0">
                           <span className={`shrink-0 text-[9px] px-2 py-1 rounded font-black uppercase tracking-widest ${news.isAiGenerated ? 'bg-purple-500 text-white shadow-[0_0_8px_rgba(168,85,247,0.5)]' : (isDark ? 'bg-white/5 text-slate-400' : 'bg-slate-100 text-slate-500')}`}>
                             {news.isAiGenerated ? 'AI FOUND' : `SOURCE ${index + 1}`}
                           </span>
                           <span className={`text-[10px] font-medium truncate ${UI.textMuted}`}>
                               {news.date && <span className={`${news.isAiGenerated ? 'text-purple-300' : 'text-yellow-500'} font-bold mr-1`}>{news.date}</span>}
                               <span className="opacity-60 italic">• {news.source || news.link || 'Internet'}</span>
                           </span>
                        </div>
                        <Globe size={14} className={`shrink-0 ${news.isAiGenerated ? 'text-purple-500' : UI.textMuted} group-hover:text-yellow-500 transition-colors`} />
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
          <MarketOverview 
            isDark={isDark} UI={UI} 
            marketIntel={marketIntel} 
            vnIndexData={vnIndexData} 
          />
      </div>

        {/* GRID COLUMN 2: ANALYTICAL VIEW & CHARTS */}
        <div className={`flex-1 overflow-y-auto p-8 lg:p-12 relative transition-colors duration-300 ${UI.rightCol} border-r ${UI.border}`}>
          
          {!marketData && !analyzing && (
            <div className="flex flex-col gap-6 animate-in fade-in duration-700">
                <div className="flex items-center justify-between border-b pb-4 mb-2">
                    <div>
                        <h2 className={`text-2xl font-black tracking-tight ${UI.textBold}`}>CÁC MÃ GẦN ĐÂY</h2>
                        <p className={`text-[10px] uppercase tracking-[0.2em] font-bold text-yellow-500 mt-1`}>Personal Intelligence Feed</p>
                    </div>
                    <button onClick={fetchUserHistory} className={`p-2 rounded-lg border ${UI.btnLog}`}><Activity size={16}/></button>
                </div>

                <div className="grid grid-cols-1 gap-4">
    {userHistory.slice(0, historyLimit).map((item, idx) => {
        const changePercent = parseFloat(item.changePercent) || 0;
        const isUp = changePercent > 0;
        const isDown = changePercent < 0;
        const formattedPercent = Math.abs(changePercent).toFixed(2);

        return (
            <div 
                key={idx}
                onClick={() => { setInput(item.symbol); fetchMarketData(item.symbol); }}
                className={`group relative flex flex-row items-center justify-between p-4 rounded-xl border transition-all cursor-pointer w-full min-h-[75px]
                    ${isDark ? 'bg-[#10151C] border-white/5 hover:bg-white/5' : 'bg-white border-slate-200 hover:bg-gray-50'}`}
            >
                <div className={`absolute left-0 top-1/4 bottom-1/4 w-1 rounded-r-full ${
                    item.lastAction?.includes('MUA') ? 'bg-emerald-500 shadow-[0_0_10px_#10b981]' : 
                    item.lastAction?.includes('BÁN') ? 'bg-red-500 shadow-[0_0_10px_#ef4444]' : 'bg-yellow-500'
                }`} />

                <div className="flex flex-row items-center gap-6 min-w-0 flex-1 ml-2">
                    <div className="flex-1 flex flex-col items-start gap-y-0.5 min-w-0 pr-4">
                        <div className="flex items-center gap-1.5">
                            <h3 className={`text-xl font-black tracking-tighter text-yellow-400 ${UI.textBold}`}>{item.symbol}</h3>
                            <span className="text-[10px] font-bold text-slate-600 uppercase">/ {item.exchange}</span>
                        </div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase whitespace-normal leading-tight">
                            {item.companyName || 'N/A'}
                        </p>
                    </div>

                    <div className="flex flex-col items-end gap-y-0.5 whitespace-nowrap">
                        <p className={`text-lg font-black flex items-center gap-1.5 justify-end ${isUp ? 'text-emerald-500' : isDown ? 'text-red-500' : 'text-slate-400'}`}>
                            {(item.price || 0).toLocaleString('vi-VN').replace(/,/g, '.')}
                            <span className="text-[11px] font-bold flex items-center ml-0.5">
                                {isUp && <ChevronUp size={14} className="mr-0.5" />}
                                {isDown && <ChevronDown size={14} className="mr-0.5" />}
                                ({formattedPercent}%)
                            </span>
                        </p>
                        <p className="text-[9px] font-bold text-slate-500 italic">
                            Cập nhật: {new Date(item.timestamp).toLocaleString('vi-VN')}
                        </p>
                    </div>
                </div>

                <div className="flex flex-col items-end gap-y-1.5 min-w-[110px] shrink-0 pl-4">
                    <span className={`px-4 py-1.5 rounded-full font-black text-[10px] uppercase border tracking-tight ${
                        item.lastAction?.includes('MUA') ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 
                        item.lastAction?.includes('BÁN') ? 'bg-red-500/20 text-red-400 border-red-500/30' : 
                        'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                    }`}>
                        {item.lastAction || 'QUAN SÁT'}
                    </span>
                </div>
            </div>
        );
    })}
</div>

                {userHistory.length > historyLimit && (
                    <button 
                        onClick={() => setHistoryLimit(prev => prev + 3)}
                        className={`w-full py-4 rounded-2xl border-2 border-dashed font-black text-[10px] tracking-[0.3em] uppercase transition-all ${UI.btnLog}`}
                    >
                        Tải thêm dữ liệu (+3)
                    </button>
                )}
            </div>
          )}

          {marketData && chartData && (
            <div className={`mb-8 border rounded-[40px] p-8 shadow-xl transition-colors duration-300 flex flex-col h-[600px] ${UI.card}`}>
              <div className={`flex items-center gap-3 mb-6 pb-4 border-b shrink-0 ${UI.border}`}>
                <BarChart3 className="text-yellow-500" size={24} />
                <h3 className={`font-black tracking-widest uppercase text-lg ${UI.textBold}`}>Biểu đồ Kỹ thuật ({marketData.stockInfo.symbol})</h3>
              </div>
              <div className="flex-1 w-full min-h-0 relative rounded-xl overflow-hidden">
    <TradingChart 
        data={chartData}       
        theme={isDark ? 'dark' : 'light'}
        onIntervalChange={handleIntervalChange} 
        currentInterval={activeInterval}
    />              
</div>
            </div>
          )}

          

          {!marketData && !analyzing && !aiReport && (
            <div className={`h-full rounded-[40px] border-2 border-dashed flex flex-col items-center justify-center ${isDark ? 'border-white/5 text-slate-700' : 'border-slate-200 text-slate-400'}`}>
              <BarChart3 size={80} className="mb-6 opacity-20" />
              <p className="uppercase tracking-[0.3em] text-[10px] font-black opacity-50">Hệ thống đang chờ lệnh</p>
            </div>
          )}

          {analyzing && (
            <div className={`h-full rounded-[40px] border flex flex-col items-center justify-center shadow-xl ${UI.card}`}>
              <div className="w-16 h-16 rounded-full border-4 border-yellow-400 border-t-transparent animate-spin mb-8" />
              <h2 className="text-yellow-500 font-black text-sm tracking-[0.3em] uppercase animate-pulse">OMNI DUCK ĐANG TƯ DUY...</h2>
            </div>
          )}

          {aiReport && (
            <div className={`w-full border rounded-[40px] p-10 shadow-2xl transition-colors duration-300 relative overflow-hidden ${isDark ? 'bg-[#10151C] border-yellow-400/20' : 'bg-white border-yellow-400/40'}`}>
            {actionData && (
              <div className={`mb-10 p-6 rounded-2xl border-2 shadow-lg relative overflow-hidden ${
                  actionData.action.includes('MUA') ? 'border-emerald-500 bg-emerald-500/10' : 
                  actionData.action.includes('BÁN') ? 'border-red-500 bg-red-500/10' : 'border-yellow-500 bg-yellow-500/10'
              }`}>
                  <div className="absolute top-0 right-0 p-3 opacity-50">
                      {isUpdatingAction ? <div className="w-3 h-3 bg-yellow-400 rounded-full animate-ping"/> : <div className="w-3 h-3 bg-emerald-400 rounded-full"/>}
                  </div>
                  <div className="flex items-center gap-4 mb-4">
                      <div className={`px-4 py-1.5 rounded-lg font-black tracking-widest text-lg text-white shadow-lg ${
                          actionData.action.includes('MUA') ? 'bg-emerald-500 shadow-emerald-500/50' : 
                          actionData.action.includes('BÁN') ? 'bg-red-500 shadow-red-500/50' : 'bg-yellow-500 shadow-yellow-500/50'
                      }`}>
                          {actionData.action}
                      </div>
                      <span className={`font-black uppercase tracking-widest text-xs ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                          Live Signal
                      </span>
                  </div>
                  
                  {/* KHUNG GIÁ NGẮN HẠN */}
                  <div className="grid grid-cols-3 gap-4 mb-4">
                      <div className="bg-black/20 p-3 rounded-xl border border-white/5">
                          <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">ENTRY (Vào lệnh)</p>
                          <p className={`font-black text-lg ${UI.textBold}`}>{actionData.entry}</p>
                      </div>
                      <div className="bg-black/20 p-3 rounded-xl border border-white/5">
                          <p className="text-[10px] text-red-400 font-black uppercase tracking-widest mb-1">STOPLOSS (Cắt lỗ)</p>
                          <p className={`font-black text-lg ${UI.textBold}`}>{actionData.stoploss}</p>
                      </div>
                      <div className="bg-black/20 p-3 rounded-xl border border-white/5">
                          <p className="text-[10px] text-emerald-400 font-black uppercase tracking-widest mb-1">TARGET (Chốt lời)</p>
                          <p className={`font-black text-lg ${UI.textBold}`}>{actionData.target}</p>
                          {/* HIỂN THỊ THỜI GIAN KỲ VỌNG  */}
                          {actionData.shortTermHorizon && (
                              <p className="text-[10px] text-slate-400 font-bold mt-1 italic">⏱ {actionData.shortTermHorizon}</p>
                          )}
                      </div>
                  </div>

                  {/* 🌟 TIỂU PANEL DỰ PHÓNG DÀI HẠN */}
                  {actionData.longTermTarget && actionData.longTermTarget !== 'N/A' && (
                      <div className="mb-4 p-3 rounded-xl bg-yellow-500/5 border border-yellow-500/20 flex justify-between items-center">
                          <div>
                              <p className="text-[9px] text-yellow-500 font-black uppercase tracking-widest">Dự phóng Dài hạn (6-12 tháng)</p>
                              <p className={`text-base font-black mt-0.5 ${UI.textBold}`}>Mục tiêu: {actionData.longTermTarget} VNĐ</p>
                          </div>
                          <div className="text-right">
                              <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest">Thời gian kỳ vọng</p>
                              <p className="text-sm font-black text-slate-300 mt-0.5">📅 {actionData.longTermHorizon || 'N/A'}</p>
                          </div>
                      </div>
                  )}

                  <p className={`text-sm font-bold italic ${UI.textNormal}`}>
                      Lý do: {actionData.reason}
                  </p>
              </div>
            )}

              <div className={`flex items-center gap-5 mb-10 pb-8 border-b ${UI.border}`}>
                <div className="w-16 h-16 rounded-3xl bg-yellow-400 text-black flex items-center justify-center shadow-xl shadow-yellow-400/20 shrink-0"><Zap size={28} /></div>
                <div>
                  <h2 className={`text-3xl lg:text-4xl font-black tracking-tight uppercase ${UI.textBold}`}>Strategic Intelligence</h2>
                  <p className="text-yellow-500 uppercase tracking-[0.3em] text-[10px] font-black mt-2">Omni Duck AI Framework</p>
                </div>
              </div>
              
              <div className={`prose max-w-none prose-headings:text-yellow-500 prose-headings:font-black prose-headings:italic prose-headings:uppercase prose-p:leading-loose prose-p:text-[16px] prose-strong:text-emerald-500 prose-strong:font-black prose-ul:list-disc prose-ul:pl-5 prose-li:mb-2 ${isDark ? 'prose-invert prose-p:text-slate-300 prose-li:text-slate-300' : 'prose-p:text-slate-700 prose-li:text-slate-700'}`}>
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{aiReport}</ReactMarkdown>
              </div>
            </div>
          )}
        </div>

        {/* GRID COLUMN 3: EXCHANGES INDEX & RADAR PREVIEWS */}
        <div className={`w-[350px] lg:w-[450px] flex flex-col border-l transition-colors duration-300 ${UI.leftCol} pb-10`}> 
          <div className="h-1/2 flex flex-col border-b border-white/10">
            <div className="h-2/5 flex border-b border-white/10">
              <div className="flex-1 border-r border-white/10 p-3 flex flex-col">
                <span className="text-[9px] font-black text-yellow-500 mb-1">VN-INDEX</span>
                <div className="flex-1 min-h-0"><MarketRadar data={vnIndexData} theme={isDark ? 'dark' : 'light'} color="#facc15" /></div>
              </div>
              <div className="flex-1 p-3 flex flex-col">
                <span className="text-[9px] font-black text-sky-400 mb-1">HNX-INDEX</span>
                <div className="flex-1 min-h-0"><MarketRadar data={hnxIndexData} theme={isDark ? 'dark' : 'light'} color="#38bdf8" /></div>
              </div>
            </div>
            <div className="h-3/5 p-4 flex flex-col">
              <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">VN30 Premium</span>
                <Activity size={14} className="text-emerald-500" />
              </div>
              <div className="flex-1 min-h-0 rounded-xl bg-black/20 border border-white/5 overflow-hidden">
                <MarketRadar data={vn30Data} theme={isDark ? 'dark' : 'light'} color="#10b981" />
              </div>
            </div>
          </div>

          <div className="h-1/2 flex flex-col overflow-hidden">
            <div className={`h-10 border-b flex items-center justify-between px-4 shrink-0 ${UI.header}`}>
              <div className="flex items-center gap-2">
                <FileText size={14} className="text-yellow-500" />
                <span className={`text-[10px] font-black uppercase tracking-widest ${UI.textBold}`}>TCBS Analysis</span>
              </div>
              {marketData?.reportPdf && (
                <button 
                   onClick={() => setShowPdfModal(true)}
                   className="text-[10px] font-black tracking-widest bg-yellow-400 text-black px-4 py-1.5 rounded-full hover:bg-yellow-300 shadow-lg transition-all active:scale-95"
                >
                   OPEN PDF
                </button>
              )}
            </div>
            
            <div className={`flex-1 relative ${isDark ? 'bg-[#242424]' : 'bg-slate-100'}`}>
              {marketData?.reportPdf ? (
                <iframe src={`${marketData.reportPdf}#toolbar=1&navpanes=0&scrollbar=1`} className="w-full h-full border-none" title="TCBS Report Viewer" />
              ) : (
                <div className="h-full flex flex-col items-center justify-center opacity-20">
                  <FileText size={32} className="mb-2" />
                  <p className="text-[9px] font-black uppercase">Waiting for Data</p>
                </div>
              )}
            </div>
          </div>
        </div>
    </>
  );
}