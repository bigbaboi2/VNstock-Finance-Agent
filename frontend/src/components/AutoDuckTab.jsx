import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
    Activity,
    AlertCircle,
    Briefcase,
    Bot,
    ChevronDown,
    BrainCircuit,
    Clock,
    Crosshair,
    DatabaseZap,
    Gauge,
    LineChart,
    Play,
    ShieldAlert,
    Target,
    TrendingDown,
    TrendingUp,
    Zap,
} from 'lucide-react';

const formatNumber = (value, digits = 0) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return '--';
    return n.toLocaleString('vi-VN', {
        maximumFractionDigits: digits,
        minimumFractionDigits: digits,
    });
};

const formatDateTime = (value) => {
    if (!value) return '--';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '--';
    return date.toLocaleString('vi-VN');
};

const getRewardRiskPct = (log) => {
    const entry = Number(log.entryPrice);
    const tp = Number(log.takeProfitPrice);
    const sl = Number(log.stopLossPrice);
    if (!entry || !tp || !sl) return { rewardPct: 0, riskPct: 0 };

    const isLong = String(log.direction).includes('LONG') || String(log.direction).includes('MUA');
    const rewardPct = isLong ? ((tp - entry) / entry) * 100 : ((entry - tp) / entry) * 100;
    const riskPct = isLong ? ((entry - sl) / entry) * 100 : ((sl - entry) / entry) * 100;

    return {
        rewardPct: Math.max(0, rewardPct),
        riskPct: Math.max(0, riskPct),
    };
};

const getSignalBreakdown = (log) => log.signalBreakdown || {};

export default function AutoDuckTab({ username, isDark, UI }) {
    const [systemLogs, setSystemLogs] = useState([]);
    const [userOrders, setUserOrders] = useState([]);
    const [aiLessons, setAiLessons] = useState([]);
    const [metrics, setMetrics] = useState({ 
        winRate: 0, avgPnl: '0.00', totalTrades: 0, maxWinStreak: 0,
        totalPnlAmount: 0, winningTrades: 0, losingTrades: 0 
    });
    const [loading, setLoading] = useState(false);
    const [actionMessage, setActionMessage] = useState({ text: '', isError: false });
    
    // State cho quản lý vốn
    const [totalCapital, setTotalCapital] = useState(5_000_000_000);
    const [isEditingCapital, setIsEditingCapital] = useState(false);
    const [capitalInput, setCapitalInput] = useState('5,000,000,000');
    
    const [formData, setFormData] = useState({
        capital: 5000000,
        targetPct: 5,
        stopLossPct: 3,
        assetType: 'ALL',
    });

    const performance = useMemo(() => {
        const closed = systemLogs.filter((log) => log.status === 'CLOSED' || log.status === 'REJECTED' || log.status === 'SKIP');
        const open = systemLogs.filter((log) => log.status === 'OPEN' || log.status === 'PENDING');
        const openExposure = open.reduce((sum, log) => sum + (Number(log.investedAmount) || 0), 0);
        const bestTrade = closed.reduce((best, log) => {
            if (!best) return log;
            return Number(log.pnlPercent) > Number(best.pnlPercent) ? log : best;
        }, null);
        const worstTrade = closed.reduce((worst, log) => {
            if (!worst) return log;
            return Number(log.pnlPercent) < Number(worst.pnlPercent) ? log : worst;
        }, null);

        return {
            openTrades: open.length,
            closedTrades: closed.length,
            openExposure,
            bestTrade,
            worstTrade,
        };
    }, [systemLogs]);

    // Tính toán phân bổ vốn
    const allocatedCapital = performance.openExposure;
    const allocationPercent = totalCapital > 0 ? Math.min(100, (allocatedCapital / totalCapital) * 100) : 0;

    const fetchAllData = async () => {
        if (!username) return;
        try {
            const [resLogs, resUser, resLessons, resSettings] = await Promise.all([
                axios.get('/api/auto-trade/logs').catch(() => ({ data: { success: false } })),
                axios.get(`/api/auto-trade/user-order/${username}`).catch(() => ({ data: { success: false } })),
                axios.get('/api/auto-trade/ai-lessons').catch(() => ({ data: { success: false } })),
                axios.get('/api/auto-trade/settings').catch(() => ({ data: { success: false } })),
            ]);

            if (resLogs.data.success) {
                setSystemLogs(resLogs.data.data);
                setMetrics(resLogs.data.metrics);
            }
            if (resUser.data.success) setUserOrders(resUser.data.data);
            if (resLessons.data.success) setAiLessons(resLessons.data.data);
            if (resSettings.data.success && resSettings.data.data?.value) {
                setTotalCapital(resSettings.data.data.value);
                if (!isEditingCapital) {
                    setCapitalInput(Number(resSettings.data.data.value).toLocaleString('vi-VN'));
                }
            }
        } catch (err) {
            setActionMessage({ text: 'Không tải được dữ liệu AutoTrade. Kiểm tra backend/API.', isError: true });
        }
    };

    useEffect(() => {
        fetchAllData();
        const interval = setInterval(fetchAllData, 20000);
        return () => clearInterval(interval);
    }, [username]);

    const handleSaveCapital = async () => {
        const numericValue = Number(String(capitalInput).replace(/,/g, ''));
        if (isNaN(numericValue) || numericValue < 100_000_000) {
            setActionMessage({ text: 'Vốn phải là số và tối thiểu 100,000,000 đ.', isError: true });
            return;
        }
        setLoading(true);
        try {
            await axios.post('/api/auto-trade/settings', { totalCapital: numericValue });
            setTotalCapital(numericValue);
            setIsEditingCapital(false);
            setActionMessage({ text: 'Đã cập nhật tổng vốn cho AI thành công!', isError: false });
        } catch (err) {
            setActionMessage({ text: 'Lỗi khi cập nhật vốn.', isError: true });
        } finally {
            setLoading(false);
        }
    };

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
                assetType: formData.assetType,
            });

            if (res.data.success) {
                setActionMessage({ text: res.data.message, isError: false });
                fetchAllData();
            } else {
                setActionMessage({ text: `Cảnh báo: ${res.data.message}`, isError: true });
            }
        } catch (err) {
            setActionMessage({ text: 'Lỗi kết nối khi gửi gói ủy thác.', isError: true });
        } finally {
            setLoading(false);
        }
    };

    const handleForceTrigger = async () => {
        setLoading(true);
        setActionMessage({ text: '', isError: false });

        try {
            await axios.post('/api/auto-trade/force-trigger', { assetType: formData.assetType });
            setActionMessage({
                text: 'Đã kích hoạt engine quét tín hiệu theo dữ liệu thị trường hiện có.',
                isError: false,
            });
            setTimeout(fetchAllData, 2000);
        } catch (err) {
            setActionMessage({ text: 'Không kích hoạt được engine quét lệnh.', isError: true });
        } finally {
            setLoading(false);
        }
    };

    const updateFormNumber = (key, value) => {
        const rawValue = String(value).replace(/,/g, '');
        if (/^\d*\.?\d*$/.test(rawValue)) {
            setFormData({ ...formData, [key]: rawValue === '' ? '' : Number(rawValue) });
        }
    };

    return (
        <div className={`w-full h-full flex flex-col overflow-y-auto custom-scrollbar p-4 lg:p-6 transition-colors duration-300 ${UI.main}`}>
            <div className={`w-full rounded-xl border mb-6 overflow-hidden ${isDark ? 'bg-[#080c14] border-cyan-500/20' : 'bg-white border-cyan-300 shadow-sm'}`}>
                <div className="h-0.5 w-full bg-cyan-500" />
                <div className="px-5 py-4 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
                    <div className="flex items-start gap-4">
                        <div className={`shrink-0 w-11 h-11 rounded-lg flex items-center justify-center border ${isDark ? 'bg-cyan-500/10 border-cyan-500/20' : 'bg-cyan-50 border-cyan-200'}`}>
                            <Bot size={22} className="text-cyan-500" />
                        </div>
                        <div>
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                                <h1 className={`text-xl font-black tracking-widest uppercase ${isDark ? 'text-cyan-400' : 'text-cyan-700'}`}>AutoTrade Engine</h1>
                                <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border ${isDark ? 'bg-amber-500/10 text-amber-300 border-amber-500/30' : 'bg-amber-50 text-amber-700 border-amber-300'}`}>
                                    Paper execution
                                </span>
                            </div>
                            <p className={`text-[11px] font-semibold leading-relaxed ${UI.textMuted}`}>
                                Đặt lệnh mô phỏng theo giá giao dịch thị trường thực. Chưa gửi lệnh lên broker/sàn thật; phần broker gateway sẽ bổ sung sau.
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center">
                        <MetricCard UI={UI} label="WIN RATE" value={`${metrics.winRate}%`} tone="text-emerald-500" />
                        <MetricCard UI={UI} label="AVG PNL" value={`${metrics.avgPnl}%`} tone={Number(metrics.avgPnl) >= 0 ? 'text-emerald-500' : 'text-red-500'} />
                        <MetricCard UI={UI} label="CLOSED" value={metrics.totalTrades} tone="text-cyan-500" />
                        <MetricCard UI={UI} label="OPEN" value={performance.openTrades} tone="text-amber-500" />
                    </div>
                </div>
            </div>

            {/* THẺ QUẢN LÝ PHÂN BỔ VỐN AI */}
            <div className={`p-6 rounded-3xl border shadow-lg mb-6 ${isDark ? 'bg-[#0f141e] border-white/10' : 'bg-white border-slate-200'}`}>
                <div className="flex items-center gap-3 mb-4">
                    <Briefcase className="text-purple-500" />
                    <h3 className={`text-lg font-black uppercase tracking-widest ${UI.textBold}`}>
                        AI Capital Manager
                    </h3>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-3 gap-6 mb-6">
                    <div>
                        <p className="text-[10px] uppercase font-bold text-slate-500 mb-1">Tổng Vốn Cấu Hình</p>
                        <p className={`text-2xl font-mono font-black ${UI.textBold}`}>{totalCapital.toLocaleString()} đ</p>
                    </div>
                    <div>
                        <p className="text-[10px] uppercase font-bold text-slate-500 mb-1">Đã Giải Ngân</p>
                        <p className="text-2xl font-mono font-black text-emerald-500">{allocatedCapital.toLocaleString()} đ</p>
                    </div>
                    <div>
                        <p className="text-[10px] uppercase font-bold text-slate-500 mb-1">Khả Dụng</p>
                        <p className="text-2xl font-mono font-black text-yellow-500">{(totalCapital - allocatedCapital).toLocaleString()} đ</p>
                    </div>
                </div>

                <div className="w-full h-3 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden flex">
                    <div className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all duration-700" style={{ width: `${allocationPercent}%` }} />
                </div>
                <p className="text-right text-[10px] mt-2 font-bold text-slate-400">Tỷ lệ giải ngân: {allocationPercent.toFixed(1)}%</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 mb-6">
                <ResultCard
                    UI={UI}
                    isDark={isDark}
                    label="Tổng Lãi/Lỗ Hệ Thống"
                    value={`${metrics.totalPnlAmount >= 0 ? '+' : ''}${formatNumber(metrics.totalPnlAmount)} đ`}
                    tone={metrics.totalPnlAmount >= 0 ? 'text-emerald-500' : 'text-red-500'}
                    detail={`${metrics.winningTrades || 0} thắng · ${metrics.losingTrades || 0} thua`}
                />
                <ResultCard
                    UI={UI}
                    isDark={isDark}
                    label="Tỷ lệ thắng (Win Rate)"
                    value={`${metrics.winRate}%`}
                    tone="text-cyan-500"
                    detail={`Chuỗi thắng tối đa: ${metrics.maxWinStreak}`}
                />
                <ResultCard
                    UI={UI}
                    isDark={isDark}
                    label="Lãi/Lỗ Trung Bình"
                    value={`${metrics.avgPnl}% / lệnh`}
                    tone={Number(metrics.avgPnl) >= 0 ? 'text-emerald-500' : 'text-red-500'}
                    detail="Tính trên các lệnh đã đóng"
                />
                <ResultCard
                    UI={UI}
                    isDark={isDark}
                    label="Vốn đang mở"
                    value={`${formatNumber(performance.openExposure)} đ`}
                    tone="text-amber-500"
                    detail={`${performance.openTrades} vị thế đang chạy`}
                />
                <ResultCard
                    UI={UI}
                    isDark={isDark}
                    label="Lệnh tốt nhất"
                    value={performance.bestTrade ? `${performance.bestTrade.symbol} +${formatNumber(performance.bestTrade.pnlPercent, 2)}%` : '--'}
                    tone="text-emerald-500"
                    detail={performance.bestTrade ? `${formatNumber(performance.bestTrade.pnl)} đ` : 'Chưa có lệnh đóng'}
                />
                <ResultCard
                    UI={UI}
                    isDark={isDark}
                    label="Lệnh xấu nhất"
                    value={performance.worstTrade ? `${performance.worstTrade.symbol} ${formatNumber(performance.worstTrade.pnlPercent, 2)}%` : '--'}
                    tone="text-red-500"
                    detail={performance.worstTrade ? `${formatNumber(performance.worstTrade.pnl)} đ` : 'Chưa có lệnh đóng'}
                />
            </div>

            <div className={`mb-6 rounded-xl border px-4 py-3 flex items-start gap-3 ${isDark ? 'bg-slate-950/70 border-amber-500/20' : 'bg-amber-50 border-amber-200'}`}>
                <DatabaseZap size={16} className="text-amber-500 mt-0.5 shrink-0" />
                <div>
                    <p className={`text-[11px] font-black uppercase tracking-widest mb-1 ${isDark ? 'text-amber-300' : 'text-amber-700'}`}>Execution mode</p>
                    <p className={`text-[12px] leading-relaxed ${UI.textMuted}`}>
                        Hệ thống đang khớp nội bộ theo quote thị trường: Binance ticker cho crypto, Entrade 15m close cho VN/derivatives. Đây là mô phỏng có dữ liệu thật, không phải xác nhận FILLED từ sàn.
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 mb-6">
                <section className={`xl:col-span-12 rounded-xl border flex flex-col h-[720px] overflow-hidden ${UI.card}`}>
                    <div className={`px-5 py-4 flex items-center justify-between border-b ${UI.border} shrink-0`}>
                        <div className="flex items-center gap-2">
                            <Activity size={16} className="text-cyan-500" />
                            <span className={`text-[11px] font-black uppercase tracking-widest ${UI.textBold}`}>Tín hiệu & lệnh mô phỏng</span>
                        </div>
                        <button
                            onClick={handleForceTrigger}
                            disabled={loading}
                            className={`h-9 px-3 rounded-lg font-black text-[10px] tracking-widest uppercase transition-all flex items-center justify-center gap-2 border active:scale-95 ${loading ? 'opacity-50 cursor-not-allowed border-slate-500 text-slate-500' : isDark ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30 hover:bg-cyan-500/20' : 'bg-cyan-50 text-cyan-700 border-cyan-300 hover:bg-cyan-100'}`}
                        >
                            <Play size={13} className={loading ? 'animate-pulse' : ''} />
                            {loading ? 'Đang quét' : 'Quét ngay'}
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                        {systemLogs.length === 0 ? (
                            <div className={`flex flex-col items-center justify-center h-full opacity-60 ${UI.textMuted}`}>
                                <Crosshair size={32} className="mb-3" />
                                <p className="text-[10px] font-black uppercase tracking-widest">Chưa có tín hiệu thỏa điều kiện.</p>
                            </div>
                        ) : (
                            systemLogs.map((log) => <TradeCard key={log._id} log={log} isDark={isDark} UI={UI} />)
                        )}
                    </div>
                </section>
            </div>

            {aiLessons.length > 0 && (
                <section className={`rounded-xl border p-4 ${UI.card}`}>
                    <div className="flex items-center gap-2 mb-3">
                        <BrainCircuit size={16} className="text-purple-500" />
                        <span className={`text-[11px] font-black uppercase tracking-widest ${UI.textBold}`}>AI lessons</span>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                        {aiLessons.slice(0, 3).map((lesson) => (
                            <div key={lesson._id} className={`rounded-lg border p-3 ${isDark ? 'bg-black/20 border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                                <p className={`text-[10px] font-black uppercase tracking-widest mb-2 ${UI.textMuted}`}>
                                    {lesson.symbol} · {formatDateTime(lesson.date)}
                                </p>
                                <p className={`text-[11px] leading-relaxed ${UI.textMuted}`}>{lesson.lesson}</p>
                            </div>
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
}

function MetricCard({ UI, label, value, tone }) {
    return (
        <div className={`p-2 rounded-lg border flex flex-col items-center justify-center min-w-[76px] ${UI.card}`}>
            <p className={`text-[8px] mb-1 font-black tracking-widest uppercase ${UI.textMuted}`}>{label}</p>
            <p className={`font-black text-sm ${tone}`}>{value}</p>
        </div>
    );
}

function ResultCard({ UI, isDark, label, value, tone, detail }) {
    return (
        <div className={`rounded-xl border p-4 ${isDark ? 'bg-[#0a0f18] border-white/10' : 'bg-white border-slate-200 shadow-sm'}`}>
            <p className={`text-[9px] font-black uppercase tracking-widest mb-2 ${UI.textMuted}`}>{label}</p>
            <p className={`text-lg font-black font-mono leading-tight ${tone}`}>{value}</p>
            <p className={`text-[10px] font-semibold mt-2 ${UI.textMuted}`}>{detail}</p>
        </div>
    );
}

function FieldShell({ UI, label, children }) {
    return (
        <div className={`p-3 rounded-lg border flex flex-col justify-center ${UI.searchBg}`}>
            <label className={`block text-[9px] font-black uppercase tracking-widest mb-2 ${UI.textMuted}`}>{label}</label>
            {children}
        </div>
    );
}

function TradeCard({ log, isDark, UI }) {
    const [isExpanded, setIsExpanded] = useState(false);
    const isLong = String(log.direction).includes('MUA') || String(log.direction).includes('LONG');
    const directionTone = isLong ? 'emerald' : 'red';
    const DirectionIcon = isLong ? TrendingUp : TrendingDown;
    const breakdown = getSignalBreakdown(log);
    const { rewardPct, riskPct } = getRewardRiskPct(log);
    const isOpen = log.status === 'OPEN';

    const shellClass = isLong
        ? isDark ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-emerald-50 border-emerald-200'
        : isDark ? 'bg-red-500/5 border-red-500/20' : 'bg-red-50 border-red-200';
    const badgeClass = isLong
        ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/25'
        : 'bg-red-500/10 text-red-500 border-red-500/25';

    return (
        <article className={`w-full rounded-xl border overflow-hidden transition-all duration-300 ${shellClass} shadow-sm ${isExpanded ? (isDark ? 'shadow-cyan-500/10' : 'shadow-lg') : ''}`}>
            <button
                onClick={() => setIsExpanded(v => !v)}
                className={`w-full text-left px-4 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3 ${isExpanded ? 'border-b' : ''} ${isDark ? 'border-white/5' : 'border-slate-100'} transition-colors ${isExpanded ? (isDark ? 'bg-white/10' : 'bg-slate-100') : (isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-slate-50 hover:bg-slate-100')}`}
            >
                <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-9 h-9 rounded-lg border flex items-center justify-center ${badgeClass}`}>
                        <DirectionIcon size={17} strokeWidth={3} />
                    </div>
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className={`text-base font-black tracking-widest ${UI.textBold}`}>{log.symbol}</span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest border ${badgeClass}`}>{log.direction}{log.status === 'PENDING' ? ' (CHỜ)' : ''}</span>
                            <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border ${
                                log.status === 'PENDING' 
                                    ? (isDark ? 'bg-yellow-500/10 text-yellow-300 border-yellow-500/25' : 'bg-yellow-50 text-yellow-700 border-yellow-300')
                                    : (isDark ? 'bg-amber-500/10 text-amber-300 border-amber-500/25' : 'bg-amber-50 text-amber-700 border-amber-300')
                            }`}>
                                {log.status === 'PENDING' ? 'Lệnh chờ' : 'Simulated'}
                            </span>
                        </div>
                        <p className={`text-[10px] font-bold mt-1 ${UI.textMuted}`}>
                            {log.assetType} · mở lúc {formatDateTime(log.openedAt)}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-widest border ${
                        log.status === 'OPEN' ? 'bg-cyan-500/10 text-cyan-500 border-cyan-500/30' : 
                        log.status === 'PENDING' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30' : 
                        'bg-slate-500/10 text-slate-400 border-slate-500/30'
                    }`}>
                        {log.status}
                    </span>
                    {!isOpen && log.status !== 'PENDING' && (
                        <span className={`px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-widest border ${log.pnlPercent >= 0 ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' : 'bg-red-500/10 text-red-500 border-red-500/30'}`}>
                            PnL {log.pnlPercent >= 0 ? '+' : ''}{formatNumber(log.pnlPercent, 2)}%
                        </span>
                    )}
                    {isOpen && (
                        <span className={`px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-widest border bg-blue-500/10 text-blue-400 border-blue-500/30`}>
                            LIVE PNL ĐANG CHẠY
                        </span>
                    )}
                    <ChevronDown size={18} className={`ml-2 shrink-0 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''} ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
                </div>
            </button>

            {isExpanded && (
                <div className="p-4 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <InfoTile UI={UI} isDark={isDark} icon={LineChart} label="Entry" value={formatNumber(log.entryPrice, 2)} />
                        <InfoTile UI={UI} isDark={isDark} icon={Target} label="TP" value={formatNumber(log.takeProfitPrice, 2)} tone="text-emerald-500" />
                        <InfoTile UI={UI} isDark={isDark} icon={ShieldAlert} label={isOpen ? "SL (Trailing)" : "SL"} value={formatNumber(log.stopLossPrice, 2)} tone="text-red-500" />
                        <InfoTile UI={UI} isDark={isDark} icon={Gauge} label="AI score" value={`${log.aiScore}/100`} tone="text-purple-400" />
                    </div>

                    <div className={`rounded-lg border p-3 ${isDark ? 'bg-black/25 border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                        <p className={`text-[8px] font-black uppercase tracking-widest mb-1 ${UI.textMuted}`}>Quy mô vốn (ước tính)</p>
                        <p className={`font-black text-base font-mono ${UI.textBold}`}>{formatNumber(log.investedAmount)} đ</p>
                    </div>

                    <div className={`rounded-lg border p-3 ${isDark ? 'bg-black/25 border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                            <ScoreBlock label="Long" value={breakdown.longScore} tone="text-emerald-500" />
                            <ScoreBlock label="Short" value={breakdown.shortScore} tone="text-red-500" />
                            <ScoreBlock label="Edge" value={breakdown.edge} tone="text-cyan-500" />
                            <ScoreBlock label="Reward" value={`+${formatNumber(rewardPct, 2)}%`} tone="text-emerald-500" />
                            <ScoreBlock label="Risk" value={`-${formatNumber(riskPct, 2)}%`} tone="text-red-500" />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className={`rounded-lg border p-3 ${isDark ? 'bg-black/20 border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                            <p className={`text-[8px] font-black uppercase tracking-widest mb-2 ${UI.textMuted}`}>Nguồn giá</p>
                            <p className={`text-[11px] font-black uppercase tracking-widest ${UI.textBold}`}>
                                {log.executionMeta?.priceSource || 'Legacy record'}
                            </p>
                            {log.executionMeta?.contextSource && (
                                <p className={`text-[10px] mt-1 ${UI.textMuted}`}>
                                    Context: {log.executionMeta.contextSource}
                                </p>
                            )}
                            <p className={`text-[10px] mt-1 ${UI.textMuted}`}>
                                <Clock size={11} className="inline mr-1 mb-0.5" />
                                {formatDateTime(log.executionMeta?.fetchedAt || log.openedAt)}
                            </p>
                        </div>
                        <div className={`rounded-lg border p-3 ${isDark ? 'bg-black/20 border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                            <p className={`text-[8px] font-black uppercase tracking-widest mb-2 ${UI.textMuted}`}>Lý do tín hiệu</p>
                            <p className={`text-[11px] leading-relaxed ${UI.textMuted}`}>{log.reason}</p>
                        </div>
                    </div>
                </div>
            )}
        </article>
    );
}

function InfoTile({ UI, isDark, icon: Icon, label, value, tone = '' }) {
    return (
        <div className={`p-3 rounded-lg border ${isDark ? 'bg-black/20 border-white/5' : 'bg-slate-50 border-slate-200'}`}>
            <p className={`text-[8px] font-black uppercase tracking-widest mb-2 flex items-center gap-1 ${UI.textMuted}`}>
                <Icon size={10} />
                {label}
            </p>
            <p className={`font-black text-sm leading-none font-mono ${tone || UI.textBold}`}>{value}</p>
        </div>
    );
}

function ScoreBlock({ label, value, tone }) {
    return (
        <div>
            <p className="text-[8px] font-black uppercase tracking-widest text-slate-500 mb-1">{label}</p>
            <p className={`font-black text-sm font-mono ${tone}`}>{value ?? '--'}</p>
        </div>
    );
}

function UserOrderCard({ order, isDark, UI }) {
    const statusClass =
        order.status === 'MATCHED' ? 'bg-cyan-500/10 text-cyan-500 border-cyan-500/30' :
        order.status === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30' :
        order.status === 'REJECTED' ? 'bg-red-500/10 text-red-500 border-red-500/30' :
        'bg-slate-500/10 text-slate-400 border-slate-500/30';

    return (
        <div className={`p-3 rounded-lg border ${isDark ? 'bg-[#10151c] border-white/5' : 'bg-slate-50 border-slate-200'}`}>
            <div className="flex justify-between items-center gap-3 mb-2">
                <span className={`text-sm font-black font-mono ${UI.textBold}`}>{formatNumber(order.capital)} đ</span>
                <span className={`px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-widest border ${statusClass}`}>{order.status}</span>
            </div>
            <div className="flex flex-wrap gap-2 mb-2">
                <span className={`text-[9px] font-black uppercase tracking-widest ${UI.textMuted}`}>Target +{order.targetPct}%</span>
                <span className={`text-[9px] font-black uppercase tracking-widest ${UI.textMuted}`}>SL -{order.stopLossPct}%</span>
                <span className={`text-[9px] font-black uppercase tracking-widest ${UI.textMuted}`}>{order.assetType}</span>
            </div>
            <p className={`text-[10px] font-medium leading-relaxed ${UI.textMuted}`}>{order.result?.message}</p>
        </div>
    );
}
