import { Activity, Zap, Database, HelpCircle, BarChart3, ChevronDown, ChevronUp, X } from 'lucide-react';
import TradingChart from './TradingChart';

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
  return (
    <div className={`flex-1 flex w-full h-full overflow-hidden animate-in zoom-in-95 duration-500 ${isDark ? 'bg-[#05080c]' : 'bg-slate-50'}`}>
        {/* CỘT TRÁI: QUẢN LÝ VÍ & DANH MỤC */}
                <div className={`w-[400px] border-r flex flex-col relative z-30 ${UI.leftCol}`}>
                    {/* 2. HEADER */}
                    <div className="p-6 pb-2 shrink-0">
                        <div className="flex items-center gap-3 relative">
                            <div className="w-12 h-12 rounded-xl bg-purple-500 text-white flex items-center justify-center shadow-lg shadow-purple-500/30">
                                <Database size={24} />
                            </div>
                            <div>
                                <h2 className="text-xl font-black text-purple-500 uppercase tracking-widest flex items-center gap-2">
                                    Đầu Tư Giả Lập
                                    
                                    {/* NÚT DẤU HỎI CHẤM  */}
                                    <div 
                                        className="relative flex items-center justify-center cursor-help"
                                        onMouseEnter={() => setShowPaperHelp(true)}
                                        onMouseLeave={() => setShowPaperHelp(false)}
                                        onClick={() => setShowPaperHelp(!showPaperHelp)}
                                    >
                                        <HelpCircle size={16} className="text-slate-400 hover:text-purple-500 transition-colors" />
                                        
                                        {/* BẢNG GIẢI THÍCH */}
                                        {showPaperHelp && (
                                            <div className={`absolute left-0 top-full mt-2 w-[320px] p-4 rounded-xl shadow-2xl z-[99999] text-[11px] font-bold leading-relaxed border animate-in fade-in slide-in-from-top-2 ${isDark ? 'bg-[#1a222e] text-slate-300 border-purple-500/30 shadow-[0_10px_30px_rgba(168,85,247,0.15)]' : 'bg-white text-slate-600 border-purple-200 shadow-[0_10px_30px_rgba(168,85,247,0.15)]'}`}>
                                                <h4 className="text-purple-500 font-black uppercase mb-2 border-b border-dashed border-purple-500/30 pb-2">
                                                    Cơ chế Khớp lệnh (Shadow Matching)
                                                </h4>
                                                <ul className="space-y-2">
                                                    <li className="flex gap-2">
                                                        <span className="text-emerald-500 mt-0.5">■</span>
                                                        <span><strong className={isDark ? "text-emerald-400" : "text-emerald-600"}>Trong giờ GD:</strong> Lệnh MP khớp ngay lập tức theo giá thị trường hiện tại. Lệnh LO sẽ được treo chờ, tự động khớp ngay khi giá thị trường thật chạm mục tiêu.</span>
                                                    </li>
                                                    <li className="flex gap-2">
                                                        <span className="text-yellow-500 mt-0.5">■</span>
                                                        <span><strong className={isDark ? "text-yellow-400" : "text-yellow-600"}>Ngoài giờ GD:</strong> Hệ thống tự động chặn khớp bậy. Lệnh LO/ATO/ATC sẽ nằm an toàn trong <span className="italic">Sổ Lệnh Chờ</span> cho đến khi thị trường mở cửa lại.</span>
                                                    </li>
                                                    <li className="flex gap-2">
                                                        <span className="text-blue-500 mt-0.5">■</span>
                                                        <span><strong className={isDark ? "text-blue-400" : "text-blue-600"}>Quản trị Vốn:</strong> Đặt lệnh MUA chờ sẽ phong tỏa sức mua tương ứng. Ấn HỦY lệnh sẽ lập tức hoàn trả tiền vào ví.</span>
                                                    </li>
                                                </ul>
                                            </div>
                                        )}
                                    </div>
                                </h2>
                                <p className={`text-[10px] font-bold uppercase tracking-[0.2em] ${UI.textMuted}`}>Live Paper Trading</p>
                            </div>
                        </div>
                    
                    {/* 3. KHU VỰC CHỨA SỐ DƯ & DANH MỤC TÀI SẢN */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar px-6 pb-6">
                        
                        {/* BALANCE CARD */}
                        <div className={`p-6 rounded-3xl border shadow-xl mb-6 mt-2 relative overflow-hidden ${isDark ? 'bg-gradient-to-br from-[#1a1525] to-[#0a0f16] border-purple-500/20' : 'bg-gradient-to-br from-purple-50 to-white border-purple-200'}`}>
                            <div className="absolute top-0 right-0 p-4 opacity-20"><Zap size={40} /></div>
                            <p className={`text-[10px] font-black uppercase tracking-[0.2em] mb-2 ${isDark ? 'text-purple-400' : 'text-purple-600'}`}>Sức mua khả dụng (VNĐ)</p>
                            <h3 className={`text-4xl font-mono font-black mb-4 ${UI.textBold}`}>
                                {portfolio?.balance ? portfolio.balance.toLocaleString('vi-VN') : 'Đang đồng bộ...'}
                            </h3>
                            <div className="flex justify-between items-center pt-4 border-t border-purple-500/20">
                                <span className={`text-[10px] font-bold uppercase tracking-widest ${UI.textMuted}`}>Tổng Lãi/Lỗ Đã Chốt</span>
                                <span className={`font-mono font-black ${
                                    (portfolio?.history?.reduce((sum, h) => sum + (h.realizedPnL || 0), 0) >= 0) 
                                    ? 'text-emerald-500' : 'text-red-500'
                                }`}>
                                    {portfolio?.history?.reduce((sum, h) => sum + (h.realizedPnL || 0), 0) >= 0 ? '+' : ''}
                                    {(portfolio?.history?.reduce((sum, h) => sum + (h.realizedPnL || 0), 0) || 0).toLocaleString('vi-VN')}
                                </span>
                            </div>
                        </div>

                        {/* HOLDINGS TÀI SẢN */}
                        <div className="mt-2">
                            <h3 className={`text-xs font-black uppercase tracking-widest mb-4 flex items-center gap-2 ${UI.textBold}`}>
                            <Activity size={14} className="text-purple-500" />
                            Danh mục đầu tư
                            </h3>
                        
                        <div className="flex flex-col gap-3">
                            {portfolio?.holdings?.length === 0 && (
                                <div className={`p-6 rounded-2xl border border-dashed flex flex-col items-center justify-center opacity-50 ${isDark ? 'border-white/20' : 'border-slate-300'}`}>
                                    <Database size={24} className="mb-2 text-slate-400" />
                                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Ví trống. Hãy đặt lệnh đầu tiên!</p>
                                </div>
                            )}
                            
                            {portfolio?.holdings?.map((h, i) => {
                                const stockInfo = allStocks.find(s => s.symbol === h.symbol) || {};
                                const isExpanded = expandedSymbol === h.symbol; // Kiểm tra xem mã này có đang được mở rộng không

                                let currentPrice = h.avgPrice;
                                if (paperChartData && paperSymbol === h.symbol) {
                                    currentPrice = paperChartData[paperChartData.length - 1].close;
                                    if (h.assetType === 'VN_STOCKS' && currentPrice < 1000) currentPrice *= 1000;
                                }
                                const pnl = (currentPrice - h.avgPrice) * h.volume;
                                const pnlPercent = h.avgPrice > 0 ? ((currentPrice - h.avgPrice) / h.avgPrice) * 100 : 0;
                                
                                return (
                                    <div 
                                        key={i} 
                                        onClick={() => {
                                            setExpandedSymbol(isExpanded ? null : h.symbol); // Click để bật/tắt đóng mở danh sách lệnh
                                            executePaperSearch(h.symbol);
                                        }}
                                        className={`p-4 rounded-2xl border shadow-sm transition-all duration-300 cursor-pointer ${
                                            isExpanded 
                                            ? (isDark ? 'bg-[#141a24] border-purple-500' : 'bg-purple-50/50 border-purple-400') 
                                            : (isDark ? 'bg-[#10151c] border-white/5 hover:border-purple-500/30' : 'bg-white border-slate-200 hover:border-purple-400')
                                        }`}
                                    >
                                        {/* HEADER: Mã & Lãi lỗ tổng của mã */}
                                        <div className="flex justify-between items-start mb-3 pb-2 border-b border-dashed border-slate-500/20">
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-lg font-black text-yellow-400">{h.symbol}</span>
                                                    <span className="text-[8px] px-1.5 py-0.5 bg-slate-500/20 rounded font-bold uppercase text-slate-400">{stockInfo.exchange || 'HOSE'}</span>
                                                </div>
                                                <p className={`text-[10px] font-bold truncate max-w-[150px] mt-0.5 ${UI.textMuted}`}>{stockInfo.name || stockInfo.companyName || 'Công ty CP ' + h.symbol}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className={`font-mono font-black text-base ${pnl >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                                    {pnl >= 0 ? '+' : ''}{pnl.toLocaleString('vi-VN')}
                                                </p>
                                                <p className={`text-[10px] font-black ${pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                    {pnl >= 0 ? '▲' : '▼'} {pnlPercent.toFixed(2)}%
                                                </p>
                                            </div>
                                        </div>
                                        
                                        {/* INFO GRID */}
                                        <div className="grid grid-cols-3 gap-2 text-[10px] uppercase font-bold text-slate-500">
                                            <div>
                                                <p className="text-[8px] text-slate-400">Giá vốn</p>
                                                <p className={`font-mono font-black mt-0.5 ${UI.textBold}`}>{h.avgPrice.toLocaleString('vi-VN')}</p>
                                            </div>
                                            <div>
                                                <p className="text-[8px] text-slate-400">Giá TT</p>
                                                <p className={`font-mono font-black mt-0.5 ${paperSymbol === h.symbol ? 'text-blue-400' : UI.textMuted}`}>
                                                    {currentPrice.toLocaleString('vi-VN')}
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-[8px] text-slate-400">Khối lượng</p>
                                                <p className={`font-mono font-black mt-0.5 ${UI.textBold}`}>{h.volume.toLocaleString('vi-VN')} CP</p>
                                            </div>
                                        </div>

                                        {/*  SUB-LIST: DANH SÁCH LỆNH ĐÃ VÀO CỦA MÃ NÀY (XUẤT HIỆN KHI ẤN CHỌN) */}
                                        {isExpanded && (
                                            <div className="mt-4 pt-3 border-t border-dashed border-slate-500/30 space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                                                <div className="flex justify-between items-center">
                                                    <p className="text-[9px] font-black uppercase tracking-wider text-purple-400">Nhật ký khớp lệnh chi tiết:</p>
                                                    <span className="text-[8px] font-bold text-slate-500">History Log</span>
                                                </div>
                                                <div className="max-h-44 overflow-y-auto custom-scrollbar space-y-1.5 pr-1">
                                                    {portfolio?.history?.filter(item => item.symbol === h.symbol).length === 0 ? (
                                                        <p className="text-[10px] italic text-slate-500 text-center py-2">Chưa ghi nhận dữ liệu khớp.</p>
                                                    ) : (
                                                        portfolio.history
                                                            .filter(item => item.symbol === h.symbol)
                                                            .map((historyItem, idx) => (
                                                                <div key={idx} className={`p-2 rounded-lg text-[11px] border flex justify-between items-center ${isDark ? 'bg-black/40 border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                                                                    <div>
                                                                        <span className={`px-1 py-0.5 text-[8px] font-black rounded mr-1.5 ${historyItem.type === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                                                                            {historyItem.type === 'BUY' ? 'MUA' : 'BÁN'}
                                                                        </span>
                                                                        <span className={`font-mono font-bold ${UI.textBold}`}>{historyItem.price.toLocaleString('vi-VN')}</span>
                                                                        <p className="text-[8px] text-slate-500 mt-0.5">{new Date(historyItem.timestamp).toLocaleString('vi-VN')}</p>
                                                                    </div>
                                                                    <div className="text-right">
                                                                        <p className={`font-mono font-black ${UI.textBold}`}>{historyItem.volume.toLocaleString('vi-VN')} CP</p>
                                                                        <p className="text-[8px] text-slate-400 uppercase tracking-tighter">Trạng thái: <span className="text-emerald-400 font-bold">Đã Khớp</span></p>
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
                        </div>

                        {/* SỔ LỆNH CHỜ (TÍCH HỢP NÚT HỦY LỆNH REALTIME) */}
                        {portfolio?.pendingOrders?.length > 0 && (
                            <div className="mt-8">
                                <h3 className={`text-xs font-black uppercase tracking-widest mb-4 flex items-center gap-2 ${UI.textBold}`}>
                                    <Database size={14} className="text-yellow-500" />
                                    Sổ Lệnh Chờ Duyệt (Pending)
                                </h3>
                                <div className="flex flex-col gap-2.5">
                                    {portfolio.pendingOrders.map((order, idx) => (
                                        <div key={idx} className={`p-3 rounded-xl border flex items-center justify-between shadow-sm transition-all ${isDark ? 'bg-[#131922] border-yellow-500/20' : 'bg-yellow-50/50 border-yellow-200'}`}>
                                            <div className="flex gap-3 items-center">
                                                <span className={`w-10 text-center py-1 rounded text-[9px] font-black uppercase ${order.type === 'BUY' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-red-500/20 text-red-400'}`}>
                                                    {order.type === 'BUY' ? 'MUA' : 'BÁN'}
                                                </span>
                                                <div>
                                                    <p className={`font-black text-sm ${UI.textBold}`}>{order.symbol}</p>
                                                    <p className={`text-[9px] font-bold uppercase tracking-wider ${UI.textMuted}`}>{order.orderType} • {order.volume.toLocaleString('vi-VN')} CP</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <div className="text-right">
                                                    <p className={`text-[8px] uppercase font-bold tracking-widest ${UI.textMuted}`}>Giá chờ</p>
                                                    <p className={`font-mono font-black text-sm ${UI.textBold}`}>{order.targetPrice.toLocaleString('vi-VN')}</p>
                                                </div>
                                                {/* 🌟 NÚT HỦY LỆNH CHỜ KHỚP */}
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); handleCancelOrder(order._id); }}
                                                    className="h-8 px-2.5 bg-red-500/10 hover:bg-red-500 border border-red-500/30 text-red-400 hover:text-white rounded-lg font-black text-[9px] tracking-widest uppercase transition-all active:scale-95"
                                                >
                                                    HỦY
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                    </div> 
                </div>
              </div>

                {/* CỘT PHẢI: BỘ LỌC THỊ TRƯỜNG & ĐẶT LỆNH */}
                    <div className="flex-1 flex flex-col p-6 h-full">
                    {/* TÙY CHỌN THỊ TRƯỜNG  */}
                    <div className="flex gap-4 mb-6">
                        {[
                            { id: 'VN_STOCKS', label: 'Chứng khoán VN' },
                            { id: 'VN_DERIVATIVES', label: 'Phái sinh VN' },
                            { id: 'CRYPTO', label: 'Tài sản số (Crypto)' },
                            { id: 'GLOBAL', label: 'Quốc tế' }
                        ].map((market) => (
                            <button 
                                key={market.id} 
                                onClick={() => setPaperMarket(market.id)}
                                className={`px-6 py-3 rounded-xl border-2 font-black text-[10px] uppercase tracking-widest transition-all ${
                                    paperMarket === market.id 
                                    ? 'border-purple-500 bg-purple-500/10 text-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.3)]' 
                                    : 'border-transparent bg-black/20 text-slate-500 hover:text-slate-300'
                                }`}
                            >
                                {market.label}
                            </button>
                        ))}
                    </div>

                    {/* KHU VỰC CHART VÀ ĐẶT LỆNH */}
                    <div className="flex-1 grid grid-cols-3 gap-6 min-h-0">
                        {/* BIỂU ĐỒ REALTIME */}
                        <div className={`col-span-2 rounded-[32px] border flex flex-col overflow-hidden shadow-xl relative ${isDark ? 'bg-black/40 border-white/5' : 'bg-white border-slate-200'}`}>
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
                                <div className="flex-1 flex flex-col items-center justify-center opacity-50">
                                    <Activity size={48} className="mb-4 animate-pulse text-purple-500" />
                                    <p className="font-black tracking-[0.2em] uppercase text-xs">VUI LÒNG TÌM KIẾM MÃ TÀI SẢN ĐỂ HIỂN THỊ ĐỒ THỊ</p>
                                </div>
                            )}
                        </div>
                        
                        {/* ORDER PANEL TÍCH HỢP CÁC LOẠI LỆNH LO, MP, ATO, ATC */}
                        <div className={`col-span-1 rounded-[32px] border p-6 flex flex-col ${isDark ? 'bg-[#0f141e] border-white/5' : 'bg-white border-slate-200'}`}>
                            <h3 className={`text-sm font-black uppercase tracking-widest mb-6 ${UI.textBold}`}>Khớp lệnh ({paperMarket})</h3>
                            
                            <div className="flex-1 space-y-4">
                                {/* THÊM TÌM KIẾM VÀ GỢI Ý MÃ CỤC BỘ */}
                                <div className="relative">
                                    <label className={`text-[10px] font-black uppercase tracking-widest mb-2 block ${UI.textMuted}`}>Mã tài sản</label>
                                    <div className="flex gap-2">
                                        <input 
                                            type="text" 
                                            value={paperSearchInput}
                                            onChange={(e) => { setPaperSearchInput(e.target.value.toUpperCase()); setShowPaperSuggestions(true); }}
                                            className={`flex-1 h-12 rounded-xl px-4 font-black uppercase text-lg border outline-none ${isDark ? 'bg-black/50 border-white/10 text-yellow-400 focus:border-purple-500' : 'bg-slate-50 border-slate-300 text-yellow-600 focus:border-purple-500'}`} 
                                            placeholder="VD: MBB..."
                                        />
                                        <button onClick={() => executePaperSearch(paperSearchInput)} className="h-12 px-4 rounded-xl bg-purple-500 hover:bg-purple-400 text-white font-black text-[10px] uppercase shadow-lg shadow-purple-500/30 transition-all active:scale-95">
                                            TÌM KIẾM
                                        </button>
                                    </div>
                                    
                                    {/* KHUNG SUGGESTION */}
                                    {showPaperSuggestions && paperSuggestions.length > 0 && (
                                        <div className={`absolute top-full mt-2 left-0 right-0 z-50 border rounded-xl overflow-hidden shadow-2xl ${isDark ? 'bg-[#1a222e] border-white/10' : 'bg-white border-slate-300'}`}>
                                            {paperSuggestions.map((stock, index) => (
                                                <button 
                                                    key={index} 
                                                    onClick={() => executePaperSearch(stock.symbol)}
                                                    className={`w-full text-left px-4 py-3 font-bold text-sm border-b last:border-0 transition-colors ${isDark ? 'border-white/5 hover:bg-white/5 text-slate-300 hover:text-purple-400' : 'border-slate-100 hover:bg-slate-50 text-slate-700 hover:text-purple-600'}`}
                                                >
                                                    <span className="text-purple-500 mr-2">{stock.symbol}</span> - {stock.companyName}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* CHỌN LOẠI LỆNH LO, MP, ATO, ATC */}
                                <div>
                                    <label className={`text-[10px] font-black uppercase tracking-widest mb-2 block ${UI.textMuted}`}>Loại lệnh</label>
                                    <div className="grid grid-cols-4 gap-2">
                                        {['MP', 'LO', 'ATO', 'ATC'].map(type => (
                                            <button 
                                                key={type}
                                                onClick={() => setPaperOrderType(type)}
                                                className={`py-2 rounded-lg font-black text-[10px] tracking-wider border transition-all ${
                                                    paperOrderType === type 
                                                    ? 'bg-purple-500/20 border-purple-500 text-purple-400' 
                                                    : (isDark ? 'border-white/10 text-slate-500 hover:bg-white/5' : 'border-slate-300 text-slate-500 hover:bg-slate-100')
                                                }`}
                                            >
                                                {type}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* KHỐI LƯỢNG & GIÁ ĐẶT */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className={`text-[10px] font-black uppercase tracking-widest mb-2 block ${UI.textMuted}`}>Giá (VNĐ)</label>
                                        <input 
                                            type="number" 
                                            disabled={paperOrderType !== 'LO'}
                                            value={paperOrderType === 'LO' ? paperLimitPrice : ''}
                                            placeholder={paperOrderType !== 'LO' ? "Giá Thị Trường" : "VD: 24500"}
                                            onChange={(e) => setPaperLimitPrice(e.target.value)}
                                            className={`w-full h-12 rounded-xl px-4 font-black text-sm border outline-none ${isDark ? 'bg-black/50 border-white/10 text-white disabled:opacity-50' : 'bg-slate-50 border-slate-300 text-black disabled:opacity-50'}`} 
                                        />
                                    </div>
                                    <div>
                                        <label className={`text-[10px] font-black uppercase tracking-widest mb-2 block ${UI.textMuted}`}>Khối lượng</label>
                                        <input 
                                            type="number" 
                                            value={paperVolume}
                                            onChange={(e) => setPaperVolume(e.target.value)}
                                            className={`w-full h-12 rounded-xl px-4 font-black text-lg border outline-none ${isDark ? 'bg-black/50 border-white/10 text-white focus:border-purple-500' : 'bg-slate-50 border-slate-300 text-black focus:border-purple-500'}`} 
                                        />
                                    </div>
                                </div>

                                {/* TỔNG QUAN TIỀN */}
                                {paperChartData && (
                                    <div className="pt-4 border-t border-white/10">
                                        <div className="flex justify-between items-center mb-2">
                                            <span className={`text-[10px] font-bold uppercase tracking-widest ${UI.textMuted}`}>Giá Market hiện tại:</span>
                                            <span className={`font-mono font-black ${UI.textBold}`}>
                                                {(paperChartData[paperChartData.length - 1].close * (paperMarket === 'VN_STOCKS' && paperChartData[paperChartData.length - 1].close < 1000 ? 1000 : 1)).toLocaleString('vi-VN')}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className={`text-[10px] font-bold uppercase tracking-widest ${UI.textMuted}`}>Dự tính thanh toán:</span>
                                            <span className="font-mono font-black text-purple-500">
                                                {((paperOrderType === 'LO' && paperLimitPrice ? Number(paperLimitPrice) : (paperChartData[paperChartData.length - 1].close * (paperMarket === 'VN_STOCKS' && paperChartData[paperChartData.length - 1].close < 1000 ? 1000 : 1))) * paperVolume).toLocaleString('vi-VN')} VNĐ
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-4 mt-6">
                                <button 
                                    onClick={() => handlePaperTrade('BUY')}
                                    className="h-14 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-white font-black text-sm uppercase tracking-widest shadow-lg shadow-emerald-500/20 active:scale-95 transition-all"
                                >
                                    MUA
                                </button>
                                <button 
                                    onClick={() => handlePaperTrade('SELL')}
                                    className="h-14 rounded-2xl bg-red-500 hover:bg-red-400 text-white font-black text-sm uppercase tracking-widest shadow-lg shadow-red-500/20 active:scale-95 transition-all"
                                >
                                    BÁN
                                </button>
                            </div>
                        </div>
                    </div>   
                </div>      
        </div>
  );
}