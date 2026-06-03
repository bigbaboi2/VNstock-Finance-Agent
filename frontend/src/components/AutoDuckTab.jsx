import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
    Activity,
    AlertCircle,
    Bot,
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
    const [metrics, setMetrics] = useState({ winRate: 0, avgPnl: '0.00', totalTrades: 0, maxWinStreak: 0 });
    const [loading, setLoading] = useState(false);
    const [actionMessage, setActionMessage] = useState({ text: '', isError: false });

    const [formData, setFormData] = useState({
        capital: 5000000,
        targetPct: 15,
        stopLossPct: 5,
        assetType: 'ALL',
    });

    const performance = useMemo(() => {
        const closed = systemLogs.filter((log) => log.status === 'CLOSED');
        const open = systemLogs.filter((log) => log.status === 'OPEN');
        const wins = closed.filter((log) => Number(log.pnlPercent) > 0);
        const losses = closed.filter((log) => Number(log.pnlPercent) < 0);
        const realizedPnl = closed.reduce((sum, log) => sum + (Number(log.pnl) || 0), 0);
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
            wins: wins.length,
            losses: losses.length,
            realizedPnl,
            openExposure,
            bestTrade,
            worstTrade,
        };
    }, [systemLogs]);

    const fetchAllData = async () => {
        if (!username) return;
        try {
            const [resLogs, resUser, resLessons] = await Promise.all([
                axios.get('/api/auto-trade/logs'),
                axios.get(`/api/auto-trade/user-order/${username}`),
                axios.get('/api/auto-trade/ai-lessons'),
            ]);

            if (resLogs.data.success) {
                setSystemLogs(resLogs.data.data);
                setMetrics(resLogs.data.metrics);
            }
            if (resUser.data.success) setUserOrders(resUser.data.data);
            if (resLessons.data.success) setAiLessons(resLessons.data.data);
        } catch (err) {
            setActionMessage({ text: 'Không tải được dữ liệu AutoTrade. Kiểm tra backend/API.', isError: true });
        }
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

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 mb-6">
                <ResultCard
                    UI={UI}
                    isDark={isDark}
                    label="Đã chốt lời/lỗ"
                    value={`${performance.realizedPnl >= 0 ? '+' : ''}${formatNumber(performance.realizedPnl)} đ`}
                    tone={performance.realizedPnl >= 0 ? 'text-emerald-500' : 'text-red-500'}
                    detail={`${performance.wins} thắng · ${performance.losses} thua`}
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
                <section className={`xl:col-span-8 rounded-xl border flex flex-col h-[720px] overflow-hidden ${UI.card}`}>
                    <div className={`px-5 py-4 flex items-center justify-between border-b ${UI.border}`}>
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

                <aside className={`xl:col-span-4 rounded-xl border flex flex-col h-[720px] overflow-hidden ${UI.card}`}>
                    <div className={`px-5 py-4 flex items-center gap-2 border-b ${UI.border}`}>
                        <Target size={16} className="text-purple-500" />
                        <span className={`text-[11px] font-black uppercase tracking-widest ${UI.textBold}`}>Cấu hình gói vốn</span>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                        <form onSubmit={handleFormSubmit} className="space-y-3 mb-5">
                            <FieldShell UI={UI} label="Nguồn vốn">
                                <input
                                    type="text"
                                    value={formData.capital ? Number(formData.capital).toLocaleString('en-US') : ''}
                                    onChange={(e) => updateFormNumber('capital', e.target.value)}
                                    className={`w-full bg-transparent text-xl font-black font-mono outline-none ${UI.searchInput}`}
                                    required
                                />
                            </FieldShell>

                            <div className="grid grid-cols-2 gap-3">
                                <FieldShell UI={UI} label="Target %">
                                    <input
                                        type="text"
                                        value={formData.targetPct}
                                        onChange={(e) => updateFormNumber('targetPct', e.target.value)}
                                        className={`w-full bg-transparent text-lg font-black font-mono outline-none ${UI.searchInput}`}
                                        required
                                    />
                                </FieldShell>
                                <FieldShell UI={UI} label="Stop loss %">
                                    <input
                                        type="text"
                                        value={formData.stopLossPct}
                                        onChange={(e) => updateFormNumber('stopLossPct', e.target.value)}
                                        className={`w-full bg-transparent text-lg font-black font-mono outline-none ${UI.searchInput}`}
                                        required
                                    />
                                </FieldShell>
                            </div>

                            <FieldShell UI={UI} label="Phân khúc">
                                <select
                                    value={formData.assetType}
                                    onChange={(e) => setFormData({ ...formData, assetType: e.target.value })}
                                    className={`w-full bg-transparent text-[11px] font-black uppercase tracking-wider outline-none cursor-pointer ${UI.searchInput}`}
                                >
                                    <option value="ALL">ALL</option>
                                    <option value="VN_STOCK">Chứng khoán VN</option>
                                    <option value="DERIVATIVES">Phái sinh VN30</option>
                                    <option value="CRYPTO">Crypto 24/7</option>
                                </select>
                            </FieldShell>

                            <button
                                type="submit"
                                disabled={loading}
                                className={`w-full h-11 rounded-lg font-black text-[11px] tracking-widest uppercase transition-all flex items-center justify-center gap-2 border active:scale-95 ${loading ? 'bg-slate-800 text-slate-500 cursor-not-allowed border-slate-700' : isDark ? 'bg-purple-600 text-white border-purple-500 hover:bg-purple-500' : 'bg-purple-600 text-white border-purple-600 hover:bg-purple-700'}`}
                            >
                                <Zap size={14} className={loading ? 'animate-pulse' : ''} />
                                {loading ? 'Đang gửi' : 'Gửi gói chờ khớp'}
                            </button>
                        </form>

                        {actionMessage.text && (
                            <div className={`p-3 rounded-lg border flex items-start gap-2 mb-5 ${actionMessage.isError ? (isDark ? 'bg-red-500/10 border-red-500/30' : 'bg-red-50 border-red-200') : (isDark ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-emerald-50 border-emerald-200')}`}>
                                <AlertCircle size={14} className={`mt-0.5 shrink-0 ${actionMessage.isError ? 'text-red-500' : 'text-emerald-500'}`} />
                                <span className={`text-[11px] font-bold leading-relaxed ${actionMessage.isError ? 'text-red-500' : 'text-emerald-600'}`}>{actionMessage.text}</span>
                            </div>
                        )}

                        <div className={`text-[9px] font-black uppercase tracking-widest mb-3 border-b pb-2 ${UI.textMuted} ${UI.border}`}>
                            Trạng thái gói vốn
                        </div>
                        <div className="space-y-3">
                            {userOrders.length === 0 ? (
                                <div className={`text-center text-[10px] uppercase tracking-widest font-bold py-6 ${UI.textMuted}`}>Chưa có gói vốn nào</div>
                            ) : (
                                userOrders.map((order) => <UserOrderCard key={order._id} order={order} isDark={isDark} UI={UI} />)
                            )}
                        </div>
                    </div>
                </aside>
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
    const isLong = String(log.direction).includes('MUA') || String(log.direction).includes('LONG');
    const directionTone = isLong ? 'emerald' : 'red';
    const DirectionIcon = isLong ? TrendingUp : TrendingDown;
    const breakdown = getSignalBreakdown(log);
    const { rewardPct, riskPct } = getRewardRiskPct(log);
    const isOpen = log.status === 'OPEN';

    const shellClass = isLong
        ? isDark ? 'bg-[#0a0f18] border-emerald-500/25' : 'bg-white border-emerald-300'
        : isDark ? 'bg-[#0a0f18] border-red-500/25' : 'bg-white border-red-300';
    const badgeClass = isLong
        ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/25'
        : 'bg-red-500/10 text-red-500 border-red-500/25';

    return (
        <article className={`w-full rounded-xl border overflow-hidden transition-all duration-300 ${shellClass}`}>
            <div className={`px-4 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3 border-b ${isDark ? 'border-white/5 bg-white/5' : 'border-slate-100 bg-slate-50'}`}>
                <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-9 h-9 rounded-lg border flex items-center justify-center ${badgeClass}`}>
                        <DirectionIcon size={17} strokeWidth={3} />
                    </div>
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className={`text-base font-black tracking-widest ${UI.textBold}`}>{log.symbol}</span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest border ${badgeClass}`}>{log.direction}</span>
                            <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border ${isDark ? 'bg-amber-500/10 text-amber-300 border-amber-500/25' : 'bg-amber-50 text-amber-700 border-amber-300'}`}>
                                Simulated
                            </span>
                        </div>
                        <p className={`text-[10px] font-bold mt-1 ${UI.textMuted}`}>
                            {log.assetType} · mở lúc {formatDateTime(log.openedAt)}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-widest border ${isOpen ? 'bg-cyan-500/10 text-cyan-500 border-cyan-500/30' : 'bg-slate-500/10 text-slate-400 border-slate-500/30'}`}>
                        {isOpen ? 'Đang mở' : 'Đã đóng'}
                    </span>
                    <span className={`px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-widest border ${log.pnlPercent >= 0 ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' : 'bg-red-500/10 text-red-500 border-red-500/30'}`}>
                        PnL {log.pnlPercent >= 0 ? '+' : ''}{formatNumber(log.pnlPercent, 2)}%
                    </span>
                </div>
            </div>

            <div className="p-4 space-y-4">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <InfoTile UI={UI} isDark={isDark} icon={LineChart} label="Entry" value={formatNumber(log.entryPrice, 2)} />
                    <InfoTile UI={UI} isDark={isDark} icon={Target} label="TP" value={formatNumber(log.takeProfitPrice, 2)} tone="text-emerald-500" />
                    <InfoTile UI={UI} isDark={isDark} icon={ShieldAlert} label="SL" value={formatNumber(log.stopLossPrice, 2)} tone="text-red-500" />
                    <InfoTile UI={UI} isDark={isDark} icon={Gauge} label="AI score" value={`${log.aiScore}/100`} tone="text-purple-400" />
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
                        <p className={`text-[11px] leading-relaxed line-clamp-3 ${UI.textMuted}`}>{log.reason}</p>
                    </div>
                </div>
            </div>
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
