import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
    Bot, Zap, TrendingUp, Target, Activity, BrainCircuit, 
    AlertCircle, Crosshair, Clock, TrendingDown, ShieldAlert
} from 'lucide-react';

export default function AutoDuckTab({ username, isDark, UI }) {
    const [systemLogs, setSystemLogs] = useState([]);
    const [userOrders, setUserOrders] = useState([]);
    const [aiLessons, setAiLessons] = useState([]);
    const [metrics, setMetrics] = useState({ winRate: 0, avgPnl: "0.00", totalTrades: 0, maxWinStreak: 0 });
    const [loading, setLoading] = useState(false);
    const [actionMessage, setActionMessage] = useState({ text: '', isError: false });

    const [formData, setFormData] = useState({
        capital: 5000000,
        targetPct: 15,
        stopLossPct: 5,
        assetType: 'ALL'
    });

    const fetchAllData = async () => {
        if (!username) return; 
        try {
            const resLogs = await axios.get('/api/auto-trade/logs');
            if (resLogs.data.success) {
                setSystemLogs(resLogs.data.data);
                setMetrics(resLogs.data.metrics);
            }
            const resUser = await axios.get(`/api/auto-trade/user-order/${username}`);
            if (resUser.data.success) setUserOrders(resUser.data.data);

            const resLessons = await axios.get('/api/auto-trade/ai-lessons');
            if (resLessons.data.success) setAiLessons(resLogs.data.success ? resLessons.data.data : []);
        } catch (err) {}
    };

    useEffect(() => {
        fetchAllData();
        const interval = setInterval(fetchAllData, 20000); 
        return () => clearInterval(interval);
    }, [username]); 

    const handleFormSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setActionMessage({ text: '', isError: false });
        try {
            const res = await axios.post('/api/auto-trade/user-order', {
                username, 
                capital: Number(formData.capital),
                targetPct: Number(formData.targetPct),
                stopLossPct: Number(formData.stopLossPct),
                assetType: formData.assetType
            });
            if (res.data.success) {
                setActionMessage({ text: res.data.message, isError: false });
                fetchAllData();
            } else { setActionMessage({ text: `CẢNH BÁO: ${res.data.message}`, isError: true }); }
        } catch (err) {
            setActionMessage({ text: 'Lỗi đường truyền hệ thống AI.', isError: true });
        } finally { setLoading(false); }
    };

    const handleForceTrigger = async () => {
        setLoading(true);
        try {
            await axios.post('/api/auto-trade/force-trigger', { assetType: formData.assetType });
            setActionMessage({ text: '⚡ Đã ép xung AI quét định lượng thành công!', isError: false });
            setTimeout(fetchAllData, 2000);
        } catch (err) { setActionMessage({ text: 'Lỗi ép xung.', isError: true }); } 
        finally { setLoading(false); }
    };

    return (
        <div className={`w-full h-full flex flex-col overflow-y-auto custom-scrollbar p-4 lg:p-6 transition-colors duration-300 ${UI.main}`}>
            
            {/* HEADER */}
            <div className={`w-full rounded-2xl border mb-6 overflow-hidden ${isDark ? 'bg-[#080c14] border-cyan-500/20 shadow-sm' : 'bg-white border-cyan-400/30 shadow-md'}`}>
                <div className="h-0.5 w-full bg-gradient-to-r from-cyan-500 via-blue-400 to-cyan-500" />
                <div className="px-5 py-4 lg:flex lg:items-center lg:justify-between gap-4">
                    <div className="flex items-start gap-4 mb-4 lg:mb-0">
                        <div className={`shrink-0 w-12 h-12 rounded-xl flex items-center justify-center border ${isDark ? 'bg-cyan-500/10 border-cyan-500/20' : 'bg-cyan-50 border-cyan-200'}`}>
                            <Bot size={24} className="text-cyan-500" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <h1 className={`text-xl font-black tracking-widest uppercase ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`}>HỆ THỐNG AUTODUCK V2</h1>
                                <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border animate-pulse ${isDark ? 'bg-red-500/10 text-red-400 border-red-500/30' : 'bg-red-50 text-red-600 border-red-300'}`}>
                                    REAL-TIME QUANT ENGINE
                                </span>
                            </div>
                            <p className={`text-[11px] font-bold ${UI.textMuted}`}>Hệ thống giao dịch 2 chiều LONG/SHORT tự động theo kỹ thuật ATR.</p>
                        </div>
                    </div>

                    <div className="flex flex-col md:flex-row items-center gap-4 shrink-0">
                        <div className={`grid grid-cols-4 gap-2 text-center ${UI.textNormal}`}>
                            <div className={`p-2 rounded-xl border flex flex-col items-center justify-center min-w-[80px] ${UI.card}`}>
                                <p className={`text-[8px] mb-1 font-black tracking-widest uppercase ${UI.textMuted}`}>WIN RATE</p>
                                <p className="font-black text-sm text-emerald-500">{metrics.winRate}%</p>
                            </div>
                            <div className={`p-2 rounded-xl border flex flex-col items-center justify-center min-w-[80px] ${UI.card}`}>
                                <p className={`text-[8px] mb-1 font-black tracking-widest uppercase ${UI.textMuted}`}>AVG PNL</p>
                                <p className={`font-black text-sm ${Number(metrics.avgPnl) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{metrics.avgPnl}%</p>
                            </div>
                            <div className={`p-2 rounded-xl border flex flex-col items-center justify-center min-w-[80px] ${UI.card}`}>
                                <p className={`text-[8px] mb-1 font-black tracking-widest uppercase ${UI.textMuted}`}>TOTAL</p>
                                <p className="font-black text-sm text-cyan-500">{metrics.totalTrades}</p>
                            </div>
                        </div>
                        <button onClick={handleForceTrigger} disabled={loading}
                            className={`h-11 px-4 rounded-xl font-black text-[10px] tracking-widest uppercase transition-all flex items-center justify-center gap-2 border active:scale-95 ${loading ? 'opacity-50 cursor-not-allowed border-slate-500 text-slate-500' : isDark ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30 hover:bg-cyan-500/20' : 'bg-cyan-50 text-cyan-700 border-cyan-300 hover:bg-cyan-100'}`}
                        >
                            <Zap size={14} className={loading ? 'animate-pulse' : ''} />
                            {loading ? 'ĐANG PHÂN TÍCH...' : 'QUÉT LỆNH AI NGAY'}
                        </button>
                    </div>
                </div>
            </div>

            {/* TWO PANELS */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-6">
                
                {/* PANEL 1: LOGS (7 Cols) */}
                <div className={`lg:col-span-7 rounded-2xl border flex flex-col h-[650px] overflow-hidden ${UI.card}`}>
                    <div className={`px-5 py-4 flex items-center justify-between border-b ${UI.border}`}>
                        <div className="flex items-center gap-2">
                            <Activity size={16} className="text-cyan-500" />
                            <span className={`text-[11px] font-black uppercase tracking-widest ${UI.textBold}`}>Lệnh Khớp Real-Time Toàn Cầu</span>
                        </div>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                        {systemLogs.length === 0 ? (
                            <div className={`flex flex-col items-center justify-center h-full opacity-50 ${UI.textMuted}`}>
                                <Crosshair size={32} className="mb-3" />
                                <p className="text-[10px] font-black uppercase tracking-widest">Chưa có tín hiệu Quant/AI nào thỏa mãn.</p>
                            </div>
                        ) : (
                            systemLogs.map((log) => {
                                const isLong = log.direction.includes('MUA') || log.direction.includes('LONG');
                                const colorCfg = isLong ? 'emerald' : 'red';
                                const DirIcon = isLong ? TrendingUp : TrendingDown;

                                return (
                                <div key={log._id} className={`w-full rounded-2xl border-2 overflow-hidden transition-all duration-300 ${isDark ? `bg-[#0a0f18] border-${colorCfg}-500/20 hover:border-${colorCfg}-500/40` : `bg-white border-${colorCfg}-300 shadow-sm`}`}>
                                    <div className={`px-4 py-3 flex items-center justify-between border-b ${isDark ? 'border-white/5 bg-white/5' : 'border-slate-100 bg-slate-50'}`}>
                                        <div className="flex items-center gap-3">
                                            <div className="relative shrink-0">
                                                <div className={`w-3 h-3 rounded-full bg-${colorCfg}-500 flex items-center justify-center`}></div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className={`text-base font-black tracking-widest ${UI.textBold}`}>{log.symbol}</span>
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest border flex items-center gap-1 bg-${colorCfg}-500/10 text-${colorCfg}-500 border-${colorCfg}-500/20`}>
                                                    <DirIcon size={12} strokeWidth={3} /> {log.direction}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${log.status === 'OPEN' ? (isDark ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30 animate-pulse' : 'bg-cyan-50 text-cyan-600 border-cyan-300') : (isDark ? 'bg-white/5 text-slate-400 border-white/10' : 'bg-slate-100 text-slate-500 border-slate-200')}`}>
                                                {log.status === 'OPEN' ? '🟢 VỊ THẾ MỞ' : '⚪ ĐÃ ĐÓNG'}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="p-4">
                                        <div className="flex justify-between items-center mb-3 pb-2 border-b border-white/5">
                                            <div className={`text-[10px] font-black uppercase tracking-widest ${UI.textMuted}`}>
                                                <Clock size={12} className="inline mr-1 mb-0.5" /> {new Date(log.openedAt).toLocaleString('vi-VN')}
                                            </div>
                                            <div className={`text-[10px] font-black uppercase tracking-widest ${UI.textMuted}`}>
                                                AI SCORE: <span className="text-purple-400 text-sm font-mono">{log.aiScore}/100</span>
                                            </div>
                                        </div>

                                        <p className={`text-[11px] font-medium leading-relaxed italic mb-4 ${UI.textMuted}`}>
                                            <span className="font-black not-italic text-cyan-500 mr-1">Tín Hiệu:</span>{log.reason}
                                        </p>

                                        {/* Real-time SL/TP Progress visualizer */}
                                        <div className={`w-full p-3 rounded-lg border flex flex-col gap-2 mb-4 ${isDark ? 'bg-black/30 border-white/5' : 'bg-slate-100 border-slate-200'}`}>
                                            <div className="flex justify-between text-[9px] font-black uppercase tracking-widest">
                                                <span className="text-red-500 flex items-center gap-1"><ShieldAlert size={10}/> SL: {log.stopLossPrice?.toLocaleString()}</span>
                                                <span className="text-cyan-400">ENTRY: {log.entryPrice?.toLocaleString()}</span>
                                                <span className="text-emerald-500 flex items-center gap-1"><Target size={10}/> TP: {log.takeProfitPrice?.toLocaleString()}</span>
                                            </div>
                                            {/* Thanh UI Progress */}
                                            <div className="w-full h-1.5 bg-slate-800 rounded-full flex overflow-hidden">
                                                <div className={`h-full ${isLong ? 'bg-emerald-500 w-1/2 ml-auto' : 'bg-red-500 w-1/2'}`}></div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-3 gap-3">
                                            <div className={`p-2.5 rounded-xl border flex flex-col justify-center ${isDark ? 'bg-black/20 border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                                                <p className={`text-[8px] font-black uppercase tracking-widest mb-1 ${UI.textMuted}`}>Vốn Vào Lệnh</p>
                                                <p className={`font-black text-sm leading-none font-mono ${UI.textBold}`}>{log.investedAmount?.toLocaleString()}</p>
                                            </div>
                                            <div className={`p-2.5 rounded-xl border flex flex-col justify-center ${isDark ? 'bg-black/20 border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                                                <p className={`text-[8px] font-black uppercase tracking-widest mb-1 ${UI.textMuted}`}>Trạng thái PnL</p>
                                                <p className={`font-black text-sm leading-none font-mono ${log.pnlPercent >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                                    {log.pnlPercent >= 0 ? `+${log.pnlPercent}` : log.pnlPercent}%
                                                </p>
                                            </div>
                                            <div className={`p-2.5 rounded-xl border flex flex-col justify-center ${isDark ? 'bg-black/20 border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                                                <p className={`text-[8px] font-black uppercase tracking-widest mb-1 ${UI.textMuted}`}>Trạng thái Thoát</p>
                                                <p className={`font-black text-sm leading-none font-mono ${UI.textBold}`}>
                                                    {log.status === 'OPEN' ? 'Đang chạy...' : log.exitPrice?.toLocaleString()}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )})
                        )}
                    </div>
                </div>

                {/* PANEL 2: CẤU HÌNH VỐN */}
                <div className={`lg:col-span-5 rounded-2xl border flex flex-col h-[650px] overflow-hidden relative ${UI.card}`}>
                    <div className={`px-5 py-4 flex items-center gap-2 border-b relative z-10 ${UI.border}`}>
                        <Target size={16} className="text-purple-500" />
                        <span className={`text-[11px] font-black uppercase tracking-widest ${UI.textBold}`}>Bơm Vốn Ủy Thác Cho AI</span>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 custom-scrollbar relative z-10">
                        <form onSubmit={handleFormSubmit} className="space-y-4 mb-6">
                            <div className="grid grid-cols-2 gap-3">
                                <div className={`p-3 rounded-xl border flex flex-col justify-center ${UI.searchBg}`}>
                                    <label className={`block text-[9px] font-black uppercase tracking-widest mb-2 ${UI.textMuted}`}>Nguồn Vốn (VNĐ)</label>
                                    <input type="text"
                                        value={formData.capital ? Number(formData.capital).toLocaleString('en-US') : ''}
                                        onChange={(e) => {
                                            const rawValue = e.target.value.replace(/,/g, '');
                                            if (/^\d*$/.test(rawValue)) setFormData({...formData, capital: rawValue ? Number(rawValue) : ''});
                                        }}
                                        className={`w-full bg-transparent text-xl font-black font-mono outline-none ${UI.searchInput}`} required />
                                </div>
                                <div className={`p-3 rounded-xl border flex flex-col justify-center ${UI.searchBg}`}>
                                    <label className={`block text-[9px] font-black uppercase tracking-widest mb-2 ${UI.textMuted}`}>Phân Khúc</label>
                                    <select value={formData.assetType} onChange={(e) => setFormData({...formData, assetType: e.target.value})}
                                        className={`w-full bg-transparent text-[11px] font-black uppercase tracking-wider outline-none cursor-pointer ${UI.searchInput}`}>
                                        <option value="ALL">ALL (Phân bổ tối ưu)</option>
                                        <option value="VN_STOCK">Chứng khoán VN</option>
                                        <option value="DERIVATIVES">Phái sinh VN30</option>
                                        <option value="CRYPTO">Crypto (24/7)</option>
                                    </select>
                                </div>
                            </div>
                            <button type="submit" disabled={loading}
                                className={`w-full h-11 rounded-xl font-black text-[11px] tracking-widest uppercase transition-all flex items-center justify-center gap-2 border active:scale-95 ${loading ? 'bg-slate-800 text-slate-500 cursor-not-allowed border-slate-700' : isDark ? 'bg-gradient-to-r from-purple-600 to-blue-500 text-white shadow-[0_0_15px_rgba(168,85,247,0.3)] hover:shadow-[0_0_25px_rgba(168,85,247,0.5)] border-transparent' : 'bg-gradient-to-r from-purple-500 to-blue-600 text-white shadow-lg border-transparent'}`}>
                                <Zap size={14} className={loading ? 'animate-pulse' : ''} /> {loading ? 'ĐANG KẾT NỐI...' : 'XUẤT LỆNH BƠM VỐN'}
                            </button>
                        </form>

                        {actionMessage.text && (
                            <div className={`p-3 rounded-xl border flex items-start gap-2 mb-5 animate-in fade-in ${actionMessage.isError ? (isDark ? 'bg-red-500/10 border-red-500/30' : 'bg-red-50 border-red-200') : (isDark ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-emerald-50 border-emerald-200')}`}>
                                <AlertCircle size={14} className={`mt-0.5 shrink-0 ${actionMessage.isError ? 'text-red-500' : 'text-emerald-500'}`} />
                                <span className={`text-[11px] font-bold leading-relaxed ${actionMessage.isError ? 'text-red-500' : 'text-emerald-600'}`}>{actionMessage.text}</span>
                            </div>
                        )}

                        <div>
                            <div className={`text-[9px] font-black uppercase tracking-widest mb-3 border-b pb-2 ${UI.textMuted} ${UI.border}`}>Trạng Thái Gói Vốn</div>
                            <div className="space-y-3">
                                {userOrders.length === 0 ? (
                                    <div className={`text-center text-[10px] uppercase tracking-widest font-bold py-6 ${UI.textMuted}`}>Chưa có lệnh ủy thác nào</div>
                                ) : (
                                    userOrders.map((order) => (
                                        <div key={order._id} className={`p-3 rounded-xl border ${isDark ? 'bg-[#10151c] border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                                            <div className="flex justify-between items-center mb-2">
                                                <span className={`text-sm font-black font-mono ${UI.textBold}`}>{order.capital.toLocaleString()} đ</span>
                                                <span className={`px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-widest border ${
                                                    order.status === 'MATCHED' ? 'bg-cyan-500/10 text-cyan-500 border-cyan-500/30' :
                                                    order.status === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30' :
                                                    'bg-white/5 text-slate-400 border-white/10'
                                                }`}>{order.status}</span>
                                            </div>
                                            <p className={`text-[10px] font-medium leading-relaxed italic mb-3 ${UI.textMuted}`}>{order.result.message}</p>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            {/* AI REFLECTIONS GIỮ NGUYÊN */}
        </div>
    );
}