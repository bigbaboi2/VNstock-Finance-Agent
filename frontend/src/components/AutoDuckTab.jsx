import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import {
    Activity,
    AlertCircle,
    Briefcase,
    Bot,
    Check,
    ChevronDown,
    BrainCircuit,
    Clock,
    Crosshair,
    DatabaseZap,
    Edit2,
    Gauge,
    HelpCircle,
    BookOpen,
    LineChart,
    ShieldAlert,
    Target,
    TrendingDown,
    TrendingUp,
    X,
    Zap,
    Loader2,
} from 'lucide-react';
import AutoDuckEnvSettingsPanel from './AutoDuckEnvSettingsPanel';
import UltraStack from './UltraStack';

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

const isMatchedAllocation = (order, allocation) => {
    if (!allocation || allocation.matchStatus === 'UNMATCHED') return false;
    if (order.executionMode === 'LIVE') return allocation.executionMode === 'LIVE';
    return true;
};

/** Số lệnh/vị thế đang mở thực tế trong một gói (PORTFOLIO hoặc FIXED). */
const countOpenOrdersInPackage = (order) => {
    if (order.allocationMode === 'PORTFOLIO') {
        return (order.tradeAllocations || []).filter(
            (a) => isMatchedAllocation(order, a) && !a.closedAt
        ).length;
    }
    if (order.status === 'MATCHED' && order.assignedTrade) {
        const trade = order.assignedTrade;
        if (typeof trade === 'object' && trade.status) {
            return ['OPEN', 'PENDING'].includes(trade.status) ? 1 : 0;
        }
        return 1;
    }
    return 0;
};

export default function AutoDuckTab({ username, isDark, UI, uiStyle = 'classic' }) {
    const { t } = useTranslation('autoDuck');
    const isAdmin = username === 'admin';
    const [systemLogs, setSystemLogs] = useState([]);
    const [userOrders, setUserOrders] = useState([]);
    const [aiLessons, setAiLessons] = useState([]);
    const [metrics, setMetrics] = useState({ 
        winRate: 0, avgPnl: '0.00', totalTrades: 0, maxWinStreak: 0,
        totalPnlAmount: 0, winningTrades: 0, losingTrades: 0 
    });
    const [metricsLive, setMetricsLive] = useState({
        winRate: 0, avgPnl: '0.00', totalTrades: 0,
        totalPnlAmount: 0, avgWinPct: 0, avgLossPct: 0, expectancyPct: 0,
    });
    const [loading, setLoading] = useState(false);
    const [logsLoading, setLogsLoading] = useState(true);
    const [packagesLoading, setPackagesLoading] = useState(true);
    const [isSubmittingPackage, setIsSubmittingPackage] = useState(false);
    const [actionMessage, setActionMessage] = useState({ text: '', isError: false });
    const fetchSeqRef = useRef(0);
    const logsReadyRef = useRef(false);
    
    // State bộ lọc và sắp xếp
    const [filterStatus, setFilterStatus] = useState('ALL');
    const [filterAsset, setFilterAsset] = useState('ALL');
    const [filterExecMode, setFilterExecMode] = useState('ALL');
    const [sortTime, setSortTime] = useState('DESC');
    const [riskLevel, setRiskLevel] = useState(2);
    const [isEngineEnabled, setIsEngineEnabled] = useState(null); // null = chưa load xong từ server

    // State cho quản lý vốn
    const [totalCapital, setTotalCapital] = useState(5_000_000_000);
    const [adminCode, setAdminCode] = useState('');
    const [isEditingCapital, setIsEditingCapital] = useState(false);
    const [isCapitalManagerCollapsed, setIsCapitalManagerCollapsed] = useState(true);
    const [showGuide, setShowGuide] = useState(false);
    const [capitalInput, setCapitalInput] = useState('5,000,000,000');
    
    const [formData, setFormData] = useState({
        capital: 5000000,
        targetPct: 5,
        stopLossPct: 3,
        assetType: 'ALL',
        executionMode: 'SIMULATED',
        exchangeConnectionId: '',
        // PORTFOLIO mode: bot tự quản lý & chia vốn
        allocationMode: 'FIXED',
        totalCapital: 50000000,
        allocationPercent: 10,
        maxConcurrentOrders: 5,
        dynamicSizing: true,
    });
    const [liveConnections, setLiveConnections] = useState([]);
    const [usdVndRate, setUsdVndRate] = useState(25400); // tỷ giá USD→VND, fetch realtime bên dưới
    const [ultraOpenId, setUltraOpenId] = useState(null);
    const isUltra = uiStyle === 'ultra';

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

    const userOrderStats = useMemo(() => {
        const totalOpenRunning = userOrders.reduce((sum, order) => sum + countOpenOrdersInPackage(order), 0);
        const activePackages = userOrders.filter((o) => ['ACTIVE', 'PENDING', 'MATCHED'].includes(o.status)).length;

        let fundLive = 0;
        let realizedPnl = 0;
        let closedN = 0;
        let wins = 0;
        for (const order of userOrders) {
            if (order.executionMode === 'LIVE' && order.allocationMode === 'PORTFOLIO') {
                fundLive += Number(order.totalCapital) || 0;
            }
            const allocs = order.allocationMode === 'PORTFOLIO'
                ? (order.tradeAllocations || []).filter((a) => isMatchedAllocation(order, a) && a.closedAt)
                : [];
            for (const a of allocs) {
                closedN += 1;
                const pnl = Number(a.pnl) || 0;
                realizedPnl += pnl;
                if (pnl > 0) wins += 1;
            }
            if (order.allocationMode !== 'PORTFOLIO' && order.status === 'COMPLETED') {
                realizedPnl += Number(order.result?.finalPnl) || 0;
            }
        }
        const packageWinRate = closedN > 0 ? Math.round((wins / closedN) * 100) : null;

        return {
            packageCount: userOrders.length,
            totalOpenRunning,
            activePackages,
            fundLive,
            realizedPnl,
            packageWinRate,
            closedN,
        };
    }, [userOrders]);

    const applySettingsPayload = (data) => {
        if (!data) return;
        if (data.autoTradeTotalCapital) {
            setTotalCapital(data.autoTradeTotalCapital);
            if (!isEditingCapital) {
                setCapitalInput(Number(data.autoTradeTotalCapital).toLocaleString('vi-VN'));
            }
        }
        if (data.autoTradeRiskLevel) {
            setRiskLevel(Number(data.autoTradeRiskLevel));
        }
        if (data.autoTradeEnabled !== undefined) {
            const raw = data.autoTradeEnabled;
            setIsEngineEnabled(raw === true || raw === 'true' || raw === 1);
        }
    };

    /** Tầng 1 — settings (nhanh nhất): bật/tắt engine, khẩu vị rủi ro. */
    const fetchSettingsFast = async (seq) => {
        const res = await axios.get('/api/auto-trade/settings').catch(() => ({ data: { success: false } }));
        if (seq !== fetchSeqRef.current) return;
        if (res.data.success) applySettingsPayload(res.data.data);
    };

    /** Tầng 2 — gói lệnh: hiện list + tổng ví/PnL sớm, không chờ broker equity. */
    const fetchPackagesFast = async (seq) => {
        const res = await axios.get(`/api/auto-trade/user-order/${username}`, {
            params: { lite: 1 },
        }).catch(() => ({ data: { success: false } }));
        if (seq !== fetchSeqRef.current) return;
        if (res.data.success) setUserOrders(res.data.data || []);
        setPackagesLoading(false);
    };

    /** Tầng 3 — kết nối sàn + lessons (có thể chậm vì equity Binance). */
    const fetchBrokerSide = async (seq) => {
        const [resLessons, resConns] = await Promise.all([
            axios.get('/api/auto-trade/ai-lessons').catch(() => ({ data: { success: false } })),
            axios.get(`/api/exchange-connections/${username}`).catch(() => ({ data: { success: false } })),
        ]);
        if (seq !== fetchSeqRef.current) return;
        if (resConns.data.success) {
            setLiveConnections(
                (resConns.data.data || []).filter((c) => c.isActive && (c.permissions || []).includes('TRADE'))
            );
        }
        if (resLessons.data.success) setAiLessons(resLessons.data.data);
        axios.get('/api/auto-trade/usd-rate')
            .then((r) => { if (r.data?.success && r.data.rate > 0) setUsdVndRate(r.data.rate); })
            .catch(() => {});
    };

    /** Tầng 4 — nhật ký / metrics LIVE (chậm nhất). */
    const fetchLogsData = async (seq, { isInitial } = {}) => {
        if (isInitial) setLogsLoading(true);
        try {
            const resLogs = await axios.get('/api/auto-trade/logs').catch(() => ({ data: { success: false } }));
            if (seq !== fetchSeqRef.current) return;
            if (resLogs.data.success) {
                setSystemLogs(resLogs.data.data || []);
                setMetrics(resLogs.data.metrics);
                if (resLogs.data.metricsLive) setMetricsLive(resLogs.data.metricsLive);
            }
        } finally {
            if (seq === fetchSeqRef.current && isInitial) {
                logsReadyRef.current = true;
                setLogsLoading(false);
            }
        }
    };

    /** Heal đầy đủ gói (sau lite) — không chặn UI. */
    const fetchPackagesFull = async (seq) => {
        const res = await axios.get(`/api/auto-trade/user-order/${username}`).catch(() => ({ data: { success: false } }));
        if (seq !== fetchSeqRef.current) return;
        if (res.data.success) setUserOrders(res.data.data || []);
    };

    const fetchAllData = async () => {
        if (!username) return;
        const seq = ++fetchSeqRef.current;
        const isInitialLogsLoad = !logsReadyRef.current;
        try {
            // Cascade hiển thị: settings → gói lite (UI sớm) → broker/heal/logs nền
            await fetchSettingsFast(seq);
            if (seq !== fetchSeqRef.current) return;

            // Bắt đầu logs sớm (chậm) nhưng không chặn hiện gói
            const logsPromise = fetchLogsData(seq, { isInitial: isInitialLogsLoad });

            await fetchPackagesFast(seq);
            if (seq !== fetchSeqRef.current) return;

            await Promise.all([
                fetchBrokerSide(seq),
                fetchPackagesFull(seq),
                logsPromise,
            ]);
        } catch (err) {
            if (seq !== fetchSeqRef.current) return;
            setActionMessage({ text: t('errLoadAutoTrade'), isError: true });
            setPackagesLoading(false);
            if (isInitialLogsLoad) {
                logsReadyRef.current = true;
                setLogsLoading(false);
            }
        }
    };

    useEffect(() => {
        logsReadyRef.current = false;
        setLogsLoading(true);
        setPackagesLoading(true);
        fetchAllData();
        const interval = setInterval(fetchAllData, 20000);
        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [username]);

    const filteredAndSortedLogs = useMemo(() => {
        let result = [...systemLogs];

        if (filterExecMode === 'LIVE') {
            result = result.filter((log) => log.executionMode === 'LIVE');
        } else if (filterExecMode === 'SIMULATED') {
            result = result.filter((log) => log.executionMode !== 'LIVE');
        }

        if (filterStatus === 'OPEN') {
            result = result.filter((log) => ['OPEN', 'PENDING'].includes(log.status));
        } else if (filterStatus === 'CLOSED') {
            result = result.filter((log) => ['CLOSED', 'REJECTED', 'SKIP'].includes(log.status));
        }

        if (filterAsset !== 'ALL') {
            result = result.filter((log) => log.assetType === filterAsset);
        }

        result.sort((a, b) => {
            const timeA = new Date(a.openedAt || a.createdAt).getTime();
            const timeB = new Date(b.openedAt || b.createdAt).getTime();
            return sortTime === 'DESC' ? timeB - timeA : timeA - timeB;
        });

        return result;
    }, [systemLogs, filterStatus, filterAsset, filterExecMode, sortTime]);

    const logExecModeCounts = useMemo(() => {
        let sim = 0;
        let live = 0;
        for (const log of systemLogs) {
            if (log.executionMode === 'LIVE') live += 1;
            else sim += 1;
        }
        return { all: systemLogs.length, sim, live };
    }, [systemLogs]);

    const allocatedCapital = performance.openExposure;
    const allocationPercent = totalCapital > 0 ? Math.min(100, (allocatedCapital / totalCapital) * 100) : 0;

    const handleSaveCapital = async () => {
        const numericValue = Number(String(capitalInput).replace(/\D/g, ''));
        if (isNaN(numericValue) || numericValue < 100_000_000) {
            setActionMessage({ text: t('errCapitalMin'), isError: true });
            return;
        }
        if (!isAdmin) {
            setActionMessage({ text: t('errAdminOnlyConfig'), isError: true });
            return;
        }
        setLoading(true);
        try {
            await axios.post('/api/auto-trade/settings', { totalCapital: numericValue, username });
            setTotalCapital(numericValue);
            setIsEditingCapital(false);
            setActionMessage({ text: t('successCapitalUpdated'), isError: false });
        } catch (err) {
            setActionMessage({ text: err.response?.data?.message || t('errUpdateCapital'), isError: true });
        } finally {
            setLoading(false);
        }
    };

    const handleRiskLevelChange = async (e) => {
        const level = Number(e.target.value);
        if (!isAdmin) {
            setActionMessage({ text: t('errAdminRiskOnly'), isError: true });
            return;
        }
        setLoading(true);
        try {
            await axios.post('/api/auto-trade/settings', { riskLevel: level, username });
            setRiskLevel(level);
            setActionMessage({ text: t('successRiskLevel', { level }), isError: false });
        } catch (err) {
            setActionMessage({ text: err.response?.data?.message || t('errUpdateRisk'), isError: true });
        } finally {
            setLoading(false);
        }
    };

    const handleToggleEngine = async () => {
        if (!isAdmin && !adminCode) {
            setActionMessage({ text: t('errAdminCodeRequired'), isError: true });
            return;
        }
        setLoading(true);
        const newState = !isEngineEnabled;
        try {
            await axios.post('/api/auto-trade/settings', { isEnabled: newState, username, adminCode });
            setIsEngineEnabled(newState);
            setActionMessage({ text: newState ? t('successEngineOn') : t('successEngineOff'), isError: false });
        } catch (err) {
            setActionMessage({ text: err.response?.data?.message || t('errEngineToggle'), isError: true });
        } finally {
            setLoading(false);
        }
    };

    const handleStopOrder = async (order) => {
        if (!window.confirm(t('confirmStopPortfolio', { cap: (Number(order.totalCapital) / 1e6).toFixed(1) }))) return;
        try {
            const res = await axios.post(`/api/auto-trade/user-order/${order._id}/stop`, { username });
            setActionMessage({ text: res.data.message, isError: !res.data.success });
            fetchAllData();
        } catch (err) {
            setActionMessage({ text: err.response?.data?.message || t('errStopPackage'), isError: true });
        }
    };

    const handleDeleteOrder = async (order) => {
        const capLabel = order.allocationMode === 'PORTFOLIO'
            ? `${(Number(order.totalCapital) / 1e6).toFixed(1)}Tr`
            : `${(Number(order.capital) / 1e6).toFixed(1)}Tr`;
        if (!window.confirm(t('confirmDeletePackage', { cap: capLabel, status: order.status }))) return;
        const orderId = String(order._id);
        try {
            const res = await axios.delete(`/api/auto-trade/user-order/${orderId}`, { data: { username } });
            if (res.data?.success) {
                // Gỡ khỏi UI ngay — không phụ thuộc refetch (tránh race với poll 20s / API lỗi tạm).
                setUserOrders((prev) => prev.filter((o) => String(o._id) !== orderId));
                setActionMessage({ text: res.data.message || t('successDeletePackage'), isError: false });
                fetchAllData();
            } else {
                setActionMessage({ text: res.data?.message || t('errDeletePackageFailed'), isError: true });
            }
        } catch (err) {
            setActionMessage({ text: err.response?.data?.message || t('errDeletePackage'), isError: true });
        }
    };

    const handleFormSubmit = async (e) => {
        e.preventDefault();
        if (isSubmittingPackage) return;
        setIsSubmittingPackage(true);
        setActionMessage({ text: '', isError: false });

        try {
            if (formData.executionMode === 'LIVE') {

                if (!formData.exchangeConnectionId) {
                    setActionMessage({ text: t('errSelectExchangeLive'), isError: true });
                    return;
                }
                const conn = liveConnections.find(c => c._id === formData.exchangeConnectionId);
                if (conn?.environment === 'LIVE') {
                    const ok = window.confirm(
                        t('confirmLiveTrading', { label: conn.label, exchange: conn.exchangeName })
                    );
                    if (!ok) return;
                }
            }

            const res = await axios.post('/api/auto-trade/user-order', {
                username,
                capital: Number(formData.capital),
                targetPct: Number(formData.targetPct),
                stopLossPct: Number(formData.stopLossPct),
                assetType: formData.assetType,
                executionMode: formData.executionMode,
                exchangeConnectionId: formData.executionMode === 'LIVE' ? formData.exchangeConnectionId : undefined,
                allocationMode: formData.allocationMode,
                totalCapital: formData.allocationMode === 'PORTFOLIO' ? Number(formData.totalCapital) : undefined,
                allocationPercent: formData.allocationMode === 'PORTFOLIO' ? Number(formData.allocationPercent) : undefined,
                maxConcurrentOrders: formData.allocationMode === 'PORTFOLIO' ? Number(formData.maxConcurrentOrders) : undefined,
                dynamicSizing: formData.allocationMode === 'PORTFOLIO' ? formData.dynamicSizing : undefined,
            });

            if (res.data.success) {
                setActionMessage({ text: res.data.message || t('successPackageCreated'), isError: false });
                await fetchAllData();
            } else {
                setActionMessage({ text: t('warningMessage', { message: res.data.message }), isError: true });
            }
        } catch (err) {
            setActionMessage({ text: err.response?.data?.message || t('errSubmitPackage'), isError: true });
        } finally {
            setIsSubmittingPackage(false);
        }
    };

    // Field tiền VND hiển thị dạng 5.000.000 (dấu chấm ngăn cách hàng nghìn kiểu VN)
    // → khi parse phải bỏ HẾT dấu chấm/phẩy. Field % cho phép số thập phân.
    const INTEGER_FIELDS = ['capital', 'totalCapital', 'maxConcurrentOrders'];
    const updateFormNumber = (key, value) => {
        const isInteger = INTEGER_FIELDS.includes(key);
        let rawValue = String(value);
        if (isInteger) {
            // Bỏ mọi ký tự không phải chữ số (dấu . , khoảng trắng…)
            rawValue = rawValue.replace(/[^\d]/g, '');
            setFormData({ ...formData, [key]: rawValue === '' ? '' : Number(rawValue) });
            return;
        }
        // Field thập phân (%): chỉ bỏ dấu phẩy nhóm nghìn, giữ 1 dấu chấm thập phân
        rawValue = rawValue.replace(/,/g, '');
        if (/^\d*\.?\d*$/.test(rawValue)) {
            setFormData({ ...formData, [key]: rawValue === '' ? '' : Number(rawValue) });
        }
    };

    // Set toàn bộ balance khả dụng của user (cộng stablecoin từ các kết nối active) vào quỹ
    const handleSetAllBalance = () => {
        const totalUSDT = liveConnections.reduce((sum, c) => {
            const snap = c.balanceSnapshot || {};
            for (const [asset, amount] of Object.entries(snap)) {
                if (['USDT', 'USDC', 'BUSD', 'FDUSD', 'DAI'].includes(asset)) sum += Number(amount) || 0;
            }
            return sum;
        }, 0);
        if (totalUSDT <= 0) {
            setActionMessage({ text: t('errNoBalance'), isError: true });
            return;
        }
        const vnd = Math.floor(totalUSDT * (usdVndRate || 25400));
        const targetKey = formData.allocationMode === 'PORTFOLIO' ? 'totalCapital' : 'capital';
        setFormData(prev => ({ ...prev, [targetKey]: vnd }));
        setActionMessage({
            text: t('successSetBalance', {
                vnd: vnd.toLocaleString('vi-VN'),
                usdt: totalUSDT.toLocaleString('en-US', { maximumFractionDigits: 2 }),
                count: liveConnections.length,
            }),
            isError: false,
        });
    };

    if (isUltra) {
        const ultraSections = [
            {
                id: 'settings',
                title: t('engineSettings'),
                icon: Gauge,
                summary: isEngineEnabled === false ? t('engineOff') : (isEngineEnabled ? t('engineOn') : '…'),
                render: () => (
                    <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-2">
                            <MetricCard UI={UI} label="WIN RATE" value={`${metrics.winRate}%`} tone="text-emerald-500" />
                            <MetricCard UI={UI} label="AVG PNL" value={`${metrics.avgPnl}%`} tone={Number(metrics.avgPnl) >= 0 ? 'text-emerald-500' : 'text-red-500'} />
                            <MetricCard UI={UI} label="CLOSED" value={metrics.totalTrades} tone="text-cyan-500" />
                            <MetricCard UI={UI} label="OPEN" value={performance.openTrades} tone="text-amber-500" />
                        </div>
                        <AutoDuckEnvSettingsPanel
                            username={username}
                            isAdmin={isAdmin}
                            isDark={isDark}
                            UI={UI}
                            adminCode={adminCode}
                            setAdminCode={setAdminCode}
                            riskLevel={riskLevel}
                            isEngineEnabled={isEngineEnabled}
                            loading={loading}
                            onToggleEngine={handleToggleEngine}
                            onRiskLevelChange={handleRiskLevelChange}
                            onMessage={setActionMessage}
                        />
                        <button
                            type="button"
                            onClick={() => setShowGuide(true)}
                            className={`w-full py-2 rounded-xl border text-xs font-black uppercase tracking-widest ${isDark ? 'border-cyan-500/40 text-cyan-300' : 'border-cyan-300 text-cyan-600'}`}
                        >
                            <BookOpen size={14} className="inline mr-1.5" /> {t('opsGuideShort')}
                        </button>
                    </div>
                ),
            },
            {
                id: 'packages',
                title: t('mandatePackages'),
                icon: Briefcase,
                summary: t('packagesSummaryUltra', { count: userOrderStats.packageCount, running: userOrderStats.totalOpenRunning }),
                render: () => (
                    <div className="space-y-4">
                        <section className={`rounded-xl border-2 p-4 ${UI.card} ${isDark ? '!border-white/80' : '!border-slate-300'}`}>
                            <div className={`flex items-center gap-2 mb-3 pb-2 border-b ${UI.border}`}>
                                <Briefcase size={16} className="text-emerald-500" />
                                <span className={`text-[11px] font-black uppercase tracking-widest ${UI.textBold}`}>{t('createPackage')}</span>
                            </div>
                            <form onSubmit={handleFormSubmit} className={`flex flex-col gap-3 ${isSubmittingPackage ? 'pointer-events-none opacity-80' : ''}`}>
                                <div className="grid grid-cols-2 gap-2">
                                    <button type="button" onClick={() => setFormData({ ...formData, allocationMode: 'FIXED' })}
                                        className={`py-2 rounded-lg text-[10px] font-black border-2 ${formData.allocationMode === 'FIXED' ? 'bg-emerald-500 border-emerald-500 text-white' : (isDark ? 'border-white/80 text-slate-300' : 'border-slate-300')}`}>
                                        {t('fixedLabel')}
                                    </button>
                                    <button type="button" onClick={() => setFormData({ ...formData, allocationMode: 'PORTFOLIO' })}
                                        className={`py-2 rounded-lg text-[10px] font-black border-2 ${formData.allocationMode === 'PORTFOLIO' ? 'bg-violet-500 border-violet-500 text-white' : (isDark ? 'border-white/80 text-slate-300' : 'border-slate-300')}`}>
                                        Portfolio
                                    </button>
                                </div>
                                {formData.allocationMode === 'FIXED' ? (
                                    <FieldShell UI={UI} label={t('capitalPerOrder')}>
                                        <input type="text" inputMode="numeric" value={Number(formData.capital || 0).toLocaleString('vi-VN')}
                                            onChange={e => updateFormNumber('capital', e.target.value)}
                                            className={`w-full bg-transparent font-mono font-black text-lg outline-none ${UI.textBold}`} />
                                    </FieldShell>
                                ) : (
                                    <FieldShell UI={UI} label={t('totalFund')}>
                                        <input type="text" inputMode="numeric" value={Number(formData.totalCapital || 0).toLocaleString('vi-VN')}
                                            onChange={e => updateFormNumber('totalCapital', e.target.value)}
                                            className={`w-full bg-transparent font-mono font-black text-lg outline-none text-violet-400`} />
                                    </FieldShell>
                                )}
                                <div className="grid grid-cols-2 gap-2">
                                    <FieldShell UI={UI} label={t('tpPercent')}>
                                        <input type="text" value={formData.targetPct} onChange={e => updateFormNumber('targetPct', e.target.value)}
                                            className={`w-full bg-transparent font-mono font-black outline-none text-emerald-500`} />
                                    </FieldShell>
                                    <FieldShell UI={UI} label={t('slPercent')}>
                                        <input type="text" value={formData.stopLossPct} onChange={e => updateFormNumber('stopLossPct', e.target.value)}
                                            className={`w-full bg-transparent font-mono font-black outline-none text-red-500`} />
                                    </FieldShell>
                                </div>
                                <FieldShell UI={UI} label={t('market')}>
                                    <select value={formData.assetType} onChange={e => {
                                        const assetType = e.target.value;
                                        setFormData(prev => ({ ...prev, assetType, ...(assetType !== 'CRYPTO' ? { executionMode: 'SIMULATED', exchangeConnectionId: '' } : {}) }));
                                    }} className={`w-full bg-transparent font-black text-sm outline-none ${UI.textBold}`}>
                                        <option value="ALL">{t('all')}</option>
                                        <option value="VN_STOCK">{t('vnStocks')}</option>
                                        <option value="CRYPTO">{t('crypto')}</option>
                                        <option value="DERIVATIVES">{t('derivatives')}</option>
                                    </select>
                                </FieldShell>
                                <div className="grid grid-cols-2 gap-2">
                                    <button type="button" onClick={() => setFormData({ ...formData, executionMode: 'SIMULATED', exchangeConnectionId: '' })}
                                        className={`py-2 rounded-lg text-[10px] font-black border-2 ${formData.executionMode === 'SIMULATED' ? 'bg-cyan-500 border-cyan-500 text-white' : (isDark ? 'border-white/80 text-slate-300' : 'border-slate-300')}`}>
                                        {t('simulatedLabel')}
                                    </button>
                                    <button type="button" onClick={() => setFormData({ ...formData, executionMode: 'LIVE' })}
                                        className={`py-2 rounded-lg text-[10px] font-black border-2 ${formData.executionMode === 'LIVE' ? 'bg-red-500 border-red-500 text-white' : (isDark ? 'border-white/80 text-slate-300' : 'border-slate-300')}`}>
                                        Live
                                    </button>
                                </div>
                                {formData.executionMode === 'LIVE' && (
                                    <select value={formData.exchangeConnectionId} onChange={e => setFormData({ ...formData, exchangeConnectionId: e.target.value })}
                                        className={`w-full px-2 py-2 rounded-lg border text-xs font-bold ${isDark ? 'bg-[#1a1f2e] border-slate-700' : 'bg-white border-slate-300'}`}>
                                        <option value="">{t('selectExchangeConn')}</option>
                                        {liveConnections.filter(c => formData.assetType === 'VN_STOCK' ? c.exchangeName === 'DNSE' : c.exchangeName !== 'DNSE').map(c => (
                                            <option key={c._id} value={c._id}>{c.exchangeName} · {c.label}</option>
                                        ))}
                                    </select>
                                )}
                                <button type="submit" disabled={isSubmittingPackage}
                                    className={`w-full py-3 rounded-xl font-black text-sm text-white ${formData.executionMode === 'LIVE' ? 'bg-red-500' : 'bg-emerald-500'} disabled:opacity-60`}>
                                    {isSubmittingPackage ? t('creatingShort') : (formData.executionMode === 'LIVE' ? t('registerLiveShort') : t('registerSimShort'))}
                                </button>
                                {actionMessage.text && (
                                    <p className={`text-[11px] font-bold ${actionMessage.isError ? 'text-red-400' : 'text-emerald-400'}`}>{actionMessage.text}</p>
                                )}
                            </form>
                        </section>
                        <section className={`rounded-xl border-2 flex flex-col overflow-hidden ${UI.card} ${isDark ? '!border-white/80' : '!border-slate-300'}`}>
                            <div className={`px-4 py-3 border-b ${UI.border}`}>
                                <span className={`text-[11px] font-black uppercase tracking-widest ${UI.textBold}`}>{t('yourPackagesWithCount', { count: userOrderStats.packageCount })}</span>
                            </div>
                            <div className="max-h-[420px] overflow-y-auto custom-scrollbar p-3 flex flex-col gap-3">
                                {packagesLoading ? (
                                    <div className={`flex items-center justify-center gap-2 py-8 ${UI.textMuted}`}>
                                        <Loader2 size={14} className="animate-spin text-emerald-500" />
                                        <span className="text-[10px] font-bold uppercase tracking-widest">{t('loadingPackages')}</span>
                                    </div>
                                ) : userOrders.length === 0 ? (
                                    <p className={`text-sm font-bold text-center py-6 ${UI.textMuted}`}>{t('noPackages')}</p>
                                ) : (
                                    userOrders.map((order, idx) => (
                                        <UserOrderCard key={order._id} index={idx + 1} order={order} isDark={isDark} UI={UI} onStop={handleStopOrder} onDelete={handleDeleteOrder} />
                                    ))
                                )}
                            </div>
                        </section>
                    </div>
                ),
            },
            {
                id: 'logs',
                title: t('signalLog'),
                icon: Activity,
                summary: t('ordersCountSummary', { count: filteredAndSortedLogs.length }),
                render: () => (
                    <div className={`rounded-xl border-2 flex flex-col overflow-hidden ${UI.card} ${isDark ? '!border-white/80' : '!border-slate-300'}`}>
                        <div className={`px-3 py-2 flex flex-wrap items-center gap-2 border-b ${UI.border}`}>
                            {[
                                { id: 'ALL', label: t('all') },
                                { id: 'SIMULATED', label: 'SIM' },
                                { id: 'LIVE', label: 'LIVE' },
                            ].map(({ id, label }) => (
                                <button key={id} type="button" onClick={() => setFilterExecMode(id)} disabled={logsLoading}
                                    className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase border ${filterExecMode === id ? 'border-cyan-500 bg-cyan-500/15 text-cyan-400' : (isDark ? 'border-white/15 text-slate-400' : 'border-slate-200 text-slate-500')}`}>
                                    {label}
                                </button>
                            ))}
                            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} disabled={logsLoading}
                                className={`text-[10px] font-bold px-2 py-1 rounded border ${isDark ? 'bg-[#1a1f2e] border-slate-700' : 'bg-white border-slate-300'}`}>
                                <option value="ALL">{t('allMarketsShort')}</option>
                                <option value="OPEN">{t('statusRunning')}</option>
                                <option value="CLOSED">{t('statusClosed')}</option>
                            </select>
                        </div>
                        <div className="max-h-[min(60vh,520px)] overflow-y-auto p-3 space-y-3 custom-scrollbar">
                            {logsLoading ? (
                                <div className={`flex flex-col items-center py-12 ${UI.textMuted}`}>
                                    <Loader2 size={28} className="animate-spin text-blue-500" />
                                </div>
                            ) : filteredAndSortedLogs.length === 0 ? (
                                <p className={`text-center py-8 text-[10px] font-black uppercase ${UI.textMuted}`}>{t('noOrders')}</p>
                            ) : (
                                filteredAndSortedLogs.map((log) => <TradeCard key={log._id} log={log} isDark={isDark} UI={UI} />)
                            )}
                        </div>
                    </div>
                ),
            },
            {
                id: 'capital',
                title: t('capitalPerformance'),
                icon: LineChart,
                summary: `${metrics.winRate}% win · ${formatNumber(metrics.totalPnlAmount)} đ`,
                render: () => (
                    <div className="space-y-3">
                        <div className={`rounded-xl border p-4 ${UI.card}`}>
                            <p className={`text-[10px] font-black uppercase mb-2 ${UI.textMuted}`}>{t('systemCapitalTotal')}</p>
                            <p className={`text-xl font-mono font-black ${UI.textBold}`}>{totalCapital.toLocaleString()} đ</p>
                            <div className="grid grid-cols-2 gap-2 mt-3 text-[11px]">
                                <div><span className={UI.textMuted}>{t('deployed')}: </span><span className="font-black text-emerald-500">{allocatedCapital.toLocaleString()} đ</span></div>
                                <div><span className={UI.textMuted}>{t('available')}: </span><span className="font-black text-yellow-500">{(totalCapital - allocatedCapital).toLocaleString()} đ</span></div>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <ResultCard UI={UI} isDark={isDark} label={t('totalPnl')} value={`${metrics.totalPnlAmount >= 0 ? '+' : ''}${formatNumber(metrics.totalPnlAmount)} đ`} tone={metrics.totalPnlAmount >= 0 ? 'text-emerald-500' : 'text-red-500'} detail={t('winsLossesShort', { wins: metrics.winningTrades || 0, losses: metrics.losingTrades || 0 })} />
                            <ResultCard UI={UI} isDark={isDark} label={t('openCapital')} value={`${formatNumber(performance.openExposure)} đ`} tone="text-amber-500" detail={t('positionsCount', { count: performance.openTrades })} />
                        </div>
                        {aiLessons.length > 0 && (
                            <div className={`rounded-xl border p-3 ${UI.card}`}>
                                <div className="flex items-center gap-2 mb-2">
                                    <BrainCircuit size={14} className="text-purple-500" />
                                    <span className={`text-[10px] font-black uppercase ${UI.textBold}`}>AI lessons</span>
                                </div>
                                <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                                    {aiLessons.slice(0, 5).map((lesson) => (
                                        <div key={lesson._id} className={`rounded-lg border p-2 text-[11px] ${isDark ? 'border-white/5' : 'border-slate-200'}`}>
                                            <p className={`font-black text-[10px] ${UI.textMuted}`}>{lesson.symbol}</p>
                                            <p className={UI.textMuted}>{lesson.lesson}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                ),
            },
        ];

        return (
            <div className={`flex flex-col w-full h-full min-h-0 overflow-hidden ${isDark ? 'bg-[#06080B]' : 'bg-[#F8FAFC]'}`}>
                {showGuide && <MechanismGuideModal isDark={isDark} UI={UI} onClose={() => setShowGuide(false)} />}
                <div className={`shrink-0 px-4 py-2.5 border-b ${isDark ? 'border-white/10 bg-[#0B0F14]' : 'border-slate-200 bg-white'}`}>
                    <p className="text-[10px] font-black uppercase tracking-widest text-cyan-400">{t('ultraMinimalAutoDuck')}</p>
                    <p className={`text-sm font-bold ${UI.textBold}`}>{t('tapToOpenLazy')}</p>
                </div>
                <UltraStack
                    sections={ultraSections}
                    openId={ultraOpenId}
                    onOpenChange={setUltraOpenId}
                    isDark={isDark}
                />
            </div>
        );
    }

    return (
        <div className={`w-full h-full flex flex-col overflow-y-auto custom-scrollbar p-4 lg:p-6 transition-colors duration-300 ${UI.main}`}>
            {showGuide && <MechanismGuideModal isDark={isDark} UI={UI} onClose={() => setShowGuide(false)} />}
            <div className={`w-full rounded-xl border mb-2 overflow-hidden ${isDark ? 'bg-[#080c14] border-cyan-500/20' : 'bg-white border-cyan-300 shadow-sm'}`}>
                <div className="h-0.5 w-full bg-cyan-500" />
                <div className="px-5 py-4 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
                    <div className="flex items-start gap-4">
                        <div className={`shrink-0 w-11 h-11 rounded-lg flex items-center justify-center border ${isDark ? 'bg-cyan-500/10 border-cyan-500/20' : 'bg-cyan-50 border-cyan-200'}`}>
                            <Bot size={22} className="text-cyan-500" />
                        </div>
                        <div>
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                                <h1 className={`text-xl font-black tracking-widest uppercase ${isDark ? 'text-cyan-400' : 'text-cyan-700'}`}>{t('autoTradeEngine')}</h1>
                                <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border ${isDark ? 'bg-amber-500/10 text-amber-300 border-amber-500/30' : 'bg-amber-50 text-amber-700 border-amber-300'}`}>
                                    Paper execution
                                </span>
                            </div>
                            <p className={`text-[11px] font-semibold leading-relaxed ${UI.textMuted}`}>
                                {t('paperExecutionDesc')}
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

            <AutoDuckEnvSettingsPanel
                username={username}
                isAdmin={isAdmin}
                isDark={isDark}
                UI={UI}
                adminCode={adminCode}
                setAdminCode={setAdminCode}
                riskLevel={riskLevel}
                isEngineEnabled={isEngineEnabled}
                loading={loading}
                onToggleEngine={handleToggleEngine}
                onRiskLevelChange={handleRiskLevelChange}
                onMessage={setActionMessage}
            />

            {/* ═══════ GÓI LỆNH ỦY THÁC CÁ NHÂN (SIMULATED / LIVE) ═══════ */}
            <div className={`flex items-center gap-2 mb-3 mt-4 pl-1 border-l-4 border-emerald-500`}>
                <span className={`ml-2 text-xs font-black uppercase tracking-widest ${UI.textBold}`}>{t('personalMandatePackages')}</span>
                <span className={`text-[10px] font-bold ${UI.textMuted}`}>{t('personalMandateSubtitle')}</span>
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 mb-6">
                <section data-book-outline className={`xl:col-span-5 rounded-xl border-2 p-5 ${UI.card} ${isDark ? '!border-white/80 shadow-[0_0_15px_rgba(255,255,255,0.1)]' : ''}`}>
                    <div className={`flex items-center gap-2 mb-4 pb-3 border-b-2 ${UI.border}`}>
                        <Briefcase size={16} className="text-emerald-500" />
                        <span className={`text-[11px] font-black uppercase tracking-widest ${UI.textBold}`}>{t('createMandatePackage')}</span>
                    </div>

                    <form onSubmit={handleFormSubmit} className={`flex flex-col gap-3 ${isSubmittingPackage ? 'pointer-events-none opacity-80' : ''}`}>
                        {/* ── CHẾ ĐỘ ỦY THÁC VỐN ── */}
                        <div className={`book-field p-3 rounded-lg border-2 flex flex-col gap-2 ${UI.searchBg}`}>
                            <label className={`flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest ${UI.textMuted}`}>
                                {t('mandateModeLabel')}
                                <button type="button" onClick={() => setShowGuide(true)} className="text-cyan-400 hover:text-cyan-300">
                                    <HelpCircle size={12} />
                                </button>
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                <button type="button"
                                    onClick={() => setFormData({ ...formData, allocationMode: 'FIXED' })}
                                    className={`py-2 rounded-lg text-[11px] font-black border-2 transition-all ${
                                        formData.allocationMode === 'FIXED'
                                            ? 'bg-emerald-500 border-emerald-500 text-white'
                                            : (isDark ? 'border-white/80 text-slate-300' : 'border-slate-300 text-slate-600')
                                    }`}>
                                    {t('fixedPerOrderBtn')}
                                </button>
                                <button type="button"
                                    onClick={() => setFormData({ ...formData, allocationMode: 'PORTFOLIO' })}
                                    className={`py-2 rounded-lg text-[11px] font-black border-2 transition-all ${
                                        formData.allocationMode === 'PORTFOLIO'
                                            ? 'bg-violet-500 border-violet-500 text-white'
                                            : (isDark ? 'border-white/80 text-slate-300' : 'border-slate-300 text-slate-600')
                                    }`}>
                                    {t('portfolioBotSplitBtn')}
                                </button>
                            </div>
                            <p className={`text-[10px] font-semibold leading-relaxed ${UI.textMuted}`}>
                                {formData.allocationMode === 'FIXED'
                                    ? t('fixedModeHelp')
                                    : t('portfolioModeHelp')}
                            </p>
                        </div>

                        {formData.allocationMode === 'FIXED' ? (
                            <FieldShell UI={UI} label={t('mandateCapitalPerOrder')} action={
                                <button type="button" onClick={handleSetAllBalance}
                                    title={t('pullAvailableBalance')}
                                    className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest border border-emerald-500/40 text-emerald-500 hover:bg-emerald-500/10 transition-colors">
                                    ⚡ All
                                </button>
                            }>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    value={Number(formData.capital || 0).toLocaleString('vi-VN')}
                                    onChange={e => updateFormNumber('capital', e.target.value)}
                                    className={`w-full bg-transparent font-mono font-black text-lg outline-none ${UI.textBold}`}
                                />
                            </FieldShell>
                        ) : (
                            <>
                                <FieldShell UI={UI} label={t('mandateTotalFund')} action={
                                    <button type="button" onClick={handleSetAllBalance}
                                        title={t('pullAvailableBalance')}
                                        className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest border border-violet-500/40 text-violet-400 hover:bg-violet-500/10 transition-colors">
                                        ⚡ All Balance
                                    </button>
                                }>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        value={Number(formData.totalCapital || 0).toLocaleString('vi-VN')}
                                        onChange={e => updateFormNumber('totalCapital', e.target.value)}
                                        className={`w-full bg-transparent font-mono font-black text-lg outline-none text-violet-400`}
                                    />
                                </FieldShell>
                                <div className="grid grid-cols-2 gap-3">
                                    <FieldShell UI={UI} label={t('maxFundPerOrderPct')}>
                                        <input type="text" value={formData.allocationPercent}
                                            onChange={e => updateFormNumber('allocationPercent', e.target.value)}
                                            className={`w-full bg-transparent font-mono font-black text-lg outline-none ${UI.textBold}`} />
                                    </FieldShell>
                                    <FieldShell UI={UI} label={t('maxConcurrentOrders')}>
                                        <input type="text" value={formData.maxConcurrentOrders}
                                            onChange={e => updateFormNumber('maxConcurrentOrders', e.target.value)}
                                            className={`w-full bg-transparent font-mono font-black text-lg outline-none ${UI.textBold}`} />
                                    </FieldShell>
                                </div>
                                <label className={`flex items-center gap-2 px-1 cursor-pointer text-[11px] font-bold ${UI.textNormal}`}>
                                    <input
                                        type="checkbox"
                                        checked={formData.dynamicSizing}
                                        onChange={e => setFormData({ ...formData, dynamicSizing: e.target.checked })}
                                        className="w-3.5 h-3.5 accent-violet-500"
                                    />
                                    {t('dynamicSizingLabel')}
                                </label>
                                <p className={`text-[10px] font-mono ${UI.textMuted}`}>
                                    {t('portfolioSizingPreview', {
                                        base: ((Number(formData.totalCapital) || 0) * (Number(formData.allocationPercent) || 10) / 100 / 1e6).toFixed(1),
                                        maxOrders: formData.maxConcurrentOrders,
                                        deployed: ((Number(formData.totalCapital) || 0) * (Number(formData.allocationPercent) || 10) / 100 * (Number(formData.maxConcurrentOrders) || 5) / 1e6).toFixed(0),
                                    })}
                                </p>
                            </>
                        )}

                        <div className="grid grid-cols-2 gap-3">
                            <FieldShell UI={UI} label={t('profitTargetPct')}>
                                <input type="text" value={formData.targetPct}
                                    onChange={e => updateFormNumber('targetPct', e.target.value)}
                                    className={`w-full bg-transparent font-mono font-black text-lg outline-none text-emerald-500`} />
                            </FieldShell>
                            <FieldShell UI={UI} label={t('stopLossPct')}>
                                <input type="text" value={formData.stopLossPct}
                                    onChange={e => updateFormNumber('stopLossPct', e.target.value)}
                                    className={`w-full bg-transparent font-mono font-black text-lg outline-none text-red-500`} />
                            </FieldShell>
                        </div>

                        <FieldShell UI={UI} label={t('market')}>
                            <select
                                value={formData.assetType}
                                onChange={e => {
                                    const assetType = e.target.value;
                                    setFormData(prev => ({
                                        ...prev,
                                        assetType,
                                        // LIVE chỉ hợp lệ với CRYPTO → auto reset nếu đổi thị trường
                                        ...(assetType !== 'CRYPTO' ? { executionMode: 'SIMULATED', exchangeConnectionId: '' } : {}),
                                    }));
                                }}
                                className={`w-full bg-transparent font-black text-sm outline-none cursor-pointer ${UI.textBold}`}
                            >
                                <option value="ALL" className={isDark ? 'bg-[#1a1f2e]' : 'bg-white'}>{t('allMarkets')}</option>
                                <option value="VN_STOCK" className={isDark ? 'bg-[#1a1f2e]' : 'bg-white'}>{t('vnEquities')}</option>
                                <option value="CRYPTO" className={isDark ? 'bg-[#1a1f2e]' : 'bg-white'}>{t('crypto')}</option>
                                <option value="DERIVATIVES" className={isDark ? 'bg-[#1a1f2e]' : 'bg-white'}>{t('vnDerivatives')}</option>
                            </select>
                        </FieldShell>

                        {/* CHẾ ĐỘ THỰC THI */}
                        <div className={`book-field p-3 rounded-lg border-2 flex flex-col gap-2 ${UI.searchBg}`}>
                            <label className={`flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest ${UI.textMuted}`}>
                                {t('executionModeLabel')}
                                <button type="button" onClick={() => setShowGuide(true)} className="text-cyan-400 hover:text-cyan-300">
                                    <HelpCircle size={12} />
                                </button>
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                <button type="button"
                                    onClick={() => setFormData({ ...formData, executionMode: 'SIMULATED', exchangeConnectionId: '' })}
                                    className={`py-2 rounded-lg text-[11px] font-black border-2 transition-all ${
                                        formData.executionMode === 'SIMULATED'
                                            ? 'bg-cyan-500 border-cyan-500 text-white'
                                            : (isDark ? 'border-white/80 text-slate-300' : 'border-slate-300 text-slate-600')
                                    }`}>
                                    {t('simulatedBtn')}
                                </button>
                                <button type="button"
                                    onClick={() => setFormData({ ...formData, executionMode: 'LIVE' })}
                                    className={`py-2 rounded-lg text-[11px] font-black border-2 transition-all ${
                                        formData.executionMode === 'LIVE'
                                            ? 'bg-red-500 border-red-500 text-white'
                                            : (isDark ? 'border-white/80 text-slate-300' : 'border-slate-300 text-slate-600')
                                    }`}>
                                    {t('liveRealOrdersBtn')}
                                </button>
                            </div>

                            {formData.executionMode === 'LIVE' && (() => {
                                const filteredConnections = liveConnections.filter(c => 
                                    formData.assetType === 'VN_STOCK' ? c.exchangeName === 'DNSE' : c.exchangeName !== 'DNSE'
                                );
                                return (
                                    <div className="flex flex-col gap-2 animate-in fade-in duration-200">
                                        {filteredConnections.length === 0 ? (
                                            <p className="text-[11px] font-bold text-amber-500">
                                                {formData.assetType === 'VN_STOCK' ? t('noActiveConnStock') : t('noActiveConnCrypto')}
                                            </p>
                                        ) : (
                                            <select
                                                value={formData.exchangeConnectionId}
                                                onChange={e => setFormData({ ...formData, exchangeConnectionId: e.target.value })}
                                                className={`w-full px-2 py-2 rounded-lg border font-bold text-xs outline-none cursor-pointer ${isDark ? 'bg-[#1a1f2e] text-slate-200 border-slate-700' : 'bg-white text-slate-700 border-slate-300'}`}
                                            >
                                                <option value="">{t('selectExchangeConn')}</option>
                                                {filteredConnections.map(c => (
                                                    <option key={c._id} value={c._id}>
                                                        {c.exchangeName} · {c.label} · {c.environment === 'LIVE' ? '⚠️ LIVE' : 'Testnet'}
                                                    </option>
                                                ))}
                                            </select>
                                        )}
                                        <p className="text-[10px] font-bold text-red-400 leading-relaxed">
                                            {t('liveOrderWarning')}
                                        </p>
                                    </div>
                                );
                            })()}
                        </div>

                        <button type="submit" disabled={isSubmittingPackage}
                            aria-busy={isSubmittingPackage}
                            className={`w-full py-3 rounded-xl font-black text-sm transition-all disabled:cursor-wait disabled:opacity-80 inline-flex items-center justify-center gap-2 ${
                                formData.executionMode === 'LIVE'
                                    ? 'bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/20'
                                    : 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/20'
                            } ${isSubmittingPackage ? 'animate-pulse' : ''}`}>
                            {isSubmittingPackage ? (
                                <>
                                    <Loader2 size={16} className="animate-spin shrink-0" />
                                    <span>{t('creatingPackage')}</span>
                                </>
                            ) : (
                                formData.executionMode === 'LIVE' ? t('registerLivePackageBtn') : t('registerSimPackageBtn')
                            )}
                        </button>

                        {actionMessage.text && (
                            <p className={`text-[11px] font-bold leading-relaxed inline-flex items-center gap-1.5 ${actionMessage.isError ? 'text-red-400' : 'text-emerald-400'}`}>
                                {isSubmittingPackage && !actionMessage.isError && (
                                    <Loader2 size={12} className="animate-spin shrink-0" />
                                )}
                                {actionMessage.text}
                            </p>
                        )}
                    </form>
                </section>

                <section data-book-outline className={`xl:col-span-7 rounded-xl border-2 flex flex-col h-full overflow-hidden relative ${UI.card} ${isDark ? '!border-white/80 shadow-[0_0_15px_rgba(255,255,255,0.1)]' : ''}`}>
                    {isSubmittingPackage && (
                        <div className={`absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 backdrop-blur-[2px] ${isDark ? 'bg-black/40' : 'bg-white/50'}`}>
                            <Loader2 size={28} className="animate-spin text-emerald-400" />
                            <p className={`text-[11px] font-black uppercase tracking-widest ${UI.textBold}`}>
                                {t('loadingPackageList')}
                            </p>
                        </div>
                    )}
                    <div className={`px-5 py-4 flex flex-col gap-3 border-b ${UI.border} shrink-0`}>
                        <div className="flex items-center gap-2">
                            <Target size={16} className="text-yellow-500 shrink-0" />
                            <span className={`text-[11px] font-black uppercase tracking-widest ${UI.textBold}`}>
                                {t('yourPackagesTitle')}
                            </span>
                            {isSubmittingPackage && (
                                <Loader2 size={12} className="animate-spin text-emerald-400" />
                            )}
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <div className={`rounded-lg border px-2.5 py-2 ${isDark ? 'bg-black/25 border-white/10' : 'bg-slate-50 border-slate-200'}`}>
                                <p className={`text-[8px] font-black uppercase tracking-widest ${UI.textMuted}`}>{t('liveFund')}</p>
                                <p className={`text-sm font-mono font-black ${packagesLoading ? UI.textMuted : 'text-cyan-500'}`}>
                                    {packagesLoading ? '…' : `${(userOrderStats.fundLive / 1e6).toFixed(2)}Tr`}
                                </p>
                            </div>
                            <div className={`rounded-lg border px-2.5 py-2 ${isDark ? 'bg-black/25 border-white/10' : 'bg-slate-50 border-slate-200'}`}>
                                <p className={`text-[8px] font-black uppercase tracking-widest ${UI.textMuted}`}>{t('packagePnl')}</p>
                                <p className={`text-sm font-mono font-black ${packagesLoading ? UI.textMuted : (userOrderStats.realizedPnl >= 0 ? 'text-emerald-500' : 'text-red-500')}`}>
                                    {packagesLoading
                                        ? '…'
                                        : `${userOrderStats.realizedPnl >= 0 ? '+' : ''}${Math.round(userOrderStats.realizedPnl / 1e3)}k`}
                                </p>
                            </div>
                            <div className={`rounded-lg border px-2.5 py-2 ${isDark ? 'bg-black/25 border-white/10' : 'bg-slate-50 border-slate-200'}`}>
                                <p className={`text-[8px] font-black uppercase tracking-widest ${UI.textMuted}`}>{t('packageWinrate')}</p>
                                <p className={`text-sm font-mono font-black ${packagesLoading ? UI.textMuted : 'text-amber-500'}`}>
                                    {packagesLoading
                                        ? '…'
                                        : (userOrderStats.packageWinRate != null ? `${userOrderStats.packageWinRate}%` : '—')}
                                </p>
                            </div>
                            <div className={`rounded-lg border px-2.5 py-2 ${isDark ? 'bg-black/25 border-white/10' : 'bg-slate-50 border-slate-200'}`}>
                                <p className={`text-[8px] font-black uppercase tracking-widest ${UI.textMuted}`}>
                                    {logsLoading ? 'LIVE WR …' : 'LIVE WR'}
                                </p>
                                <p className={`text-sm font-mono font-black ${logsLoading ? UI.textMuted : 'text-violet-400'}`}>
                                    {logsLoading ? '…' : `${metricsLive.winRate || metrics.winRate || 0}%`}
                                </p>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border ${isDark ? 'bg-white/5 border-white/10 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-600'}`}>
                                {packagesLoading ? '…' : t('packageCountChip', { count: userOrderStats.packageCount })}
                            </span>
                            <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border ${userOrderStats.totalOpenRunning > 0 ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400' : (isDark ? 'bg-white/5 border-white/10 text-slate-500' : 'bg-slate-50 border-slate-200 text-slate-500')}`}>
                                {packagesLoading ? '…' : t('ordersRunningChip', { count: userOrderStats.totalOpenRunning })}
                            </span>
                            {userOrderStats.activePackages > 0 && (
                                <span className={`text-[10px] font-bold ${UI.textMuted}`}>
                                    {t('botsActiveChip', { count: userOrderStats.activePackages })}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-4 flex flex-col gap-4">
                        {packagesLoading ? (
                            <div className={`flex items-center justify-center gap-2 py-10 ${UI.textMuted}`}>
                                <Loader2 size={16} className="animate-spin text-emerald-500" />
                                <span className="text-[11px] font-bold uppercase tracking-widest">{t('loadingPackages')}</span>
                            </div>
                        ) : userOrders.length === 0 ? (
                            <p className={`text-sm font-bold text-center py-8 ${UI.textMuted}`}>
                                {t('noPackagesHint')}
                            </p>
                        ) : (
                            userOrders.map((order, idx) => (
                                <UserOrderCard
                                    key={order._id}
                                    index={idx + 1}
                                    order={order}
                                    isDark={isDark}
                                    UI={UI}
                                    onStop={handleStopOrder}
                                    onDelete={handleDeleteOrder}
                                />
                            ))
                        )}
                    </div>
                </section>
            </div>

            <div className={`-mx-4 lg:-mx-6 h-[2px] shrink-0 my-10 ${isDark ? 'bg-white/80 shadow-[0_0_10px_rgba(255,255,255,0.2)]' : 'bg-slate-300'}`} />

            <div className={`flex items-center gap-2 mb-3 pl-1 border-l-4 border-violet-500`}>
                <span className={`ml-2 text-xs font-black uppercase tracking-widest ${UI.textBold}`}>{t('aiSignalLog')}</span>
                <span className={`text-[10px] font-bold ${UI.textMuted}`}>{t('signalLogSubtitle')}</span>
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 mb-6">
                <section className={`xl:col-span-12 rounded-xl border-2 flex flex-col h-[720px] overflow-hidden ${UI.card} ${isDark ? '!border-white/80 shadow-[0_0_15px_rgba(255,255,255,0.1)]' : '!border-slate-300'}`}>
                    <div className={`px-5 py-4 flex items-center justify-between border-b ${UI.border} shrink-0`}>
                        <div className="flex items-center gap-2">
                            <Activity size={16} className="text-cyan-500" />
                            <div className="flex flex-col">
                                <span className={`text-[11px] font-black uppercase tracking-widest ${UI.textBold}`}>🧠 {t('autoDuckOrderLog')}</span>
                                <span className={`text-[9px] font-bold normal-case tracking-normal ${UI.textMuted}`}>
                                    {filterExecMode === 'LIVE'
                                        ? t('viewingLiveOrders')
                                        : filterExecMode === 'SIMULATED'
                                            ? t('viewingSimOrders')
                                            : t('viewingAllOrders')}
                                    {' · '}{t('brokerTabDetailHint')}
                                </span>
                            </div>
                        </div>
                        {logsLoading && (
                            <div className="flex items-center gap-2 text-blue-500">
                                <Loader2 size={16} className="animate-spin" />
                                <span className="text-[10px] font-bold uppercase tracking-widest">{t('loading')}</span>
                            </div>
                        )}
                    </div>

                    <div className={`px-4 py-3 flex flex-wrap items-center gap-2 border-b ${isDark ? 'border-white/5 bg-[#0a0f18]' : 'border-slate-100 bg-slate-50'} shrink-0`}>
                        <div className="flex items-center gap-1.5 mr-1">
                            {[
                                { id: 'ALL', label: t('all'), count: logExecModeCounts.all, active: isDark ? 'border-slate-300 bg-white/10 text-white' : 'border-slate-400 bg-slate-200 text-slate-900' },
                                { id: 'SIMULATED', label: 'SIM', count: logExecModeCounts.sim, active: isDark ? 'border-violet-400/70 bg-violet-500/25 text-violet-100' : 'border-violet-400 bg-violet-100 text-violet-900' },
                                { id: 'LIVE', label: 'LIVE', count: logExecModeCounts.live, active: isDark ? 'border-emerald-400/70 bg-emerald-500/25 text-emerald-100' : 'border-emerald-500 bg-emerald-100 text-emerald-900' },
                            ].map(({ id, label, count, active }) => {
                                const isActive = filterExecMode === id;
                                return (
                                    <button
                                        key={id}
                                        type="button"
                                        disabled={logsLoading}
                                        onClick={() => setFilterExecMode(id)}
                                        className={`px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-colors active:scale-[0.97] disabled:opacity-50 ${
                                            isActive
                                                ? active
                                                : (isDark
                                                    ? 'border-white/15 bg-black/20 text-slate-400 hover:bg-white/5 hover:text-slate-200'
                                                    : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700')
                                        }`}
                                    >
                                        {label}
                                        <span className={`ml-1.5 normal-case tracking-normal font-bold opacity-80 ${isActive ? '' : 'opacity-60'}`}>
                                            {count}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} disabled={logsLoading} className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1.5 rounded outline-none border transition-colors cursor-pointer disabled:opacity-50 ${isDark ? 'bg-[#1a1f2e] text-slate-300 border-slate-700' : 'bg-white text-slate-600 border-slate-300'}`}>
                            <option value="ALL">{t('statusAll')}</option>
                            <option value="OPEN">{t('statusOpen')}</option>
                            <option value="CLOSED">{t('statusClosedFilter')}</option>
                        </select>
                        <select value={filterAsset} onChange={e => setFilterAsset(e.target.value)} disabled={logsLoading} className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1.5 rounded outline-none border transition-colors cursor-pointer disabled:opacity-50 ${isDark ? 'bg-[#1a1f2e] text-slate-300 border-slate-700' : 'bg-white text-slate-600 border-slate-300'}`}>
                            <option value="ALL">{t('marketAll')}</option>
                            <option value="VN_STOCK">{t('vnEquities')}</option>
                            <option value="CRYPTO">{t('crypto')}</option>
                            <option value="DERIVATIVES">{t('vnDerivatives')}</option>
                        </select>
                        <select value={sortTime} onChange={e => setSortTime(e.target.value)} disabled={logsLoading} className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1.5 rounded outline-none border transition-colors cursor-pointer disabled:opacity-50 ${isDark ? 'bg-[#1a1f2e] text-slate-300 border-slate-700' : 'bg-white text-slate-600 border-slate-300'}`}>
                            <option value="DESC">{t('sortNewest')}</option>
                            <option value="ASC">{t('sortOldest')}</option>
                        </select>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                        {logsLoading ? (
                            <div className={`flex flex-col items-center justify-center h-full gap-3 ${UI.textMuted}`}>
                                <Loader2 size={36} className="animate-spin text-blue-500" />
                                <p className="text-[10px] font-black uppercase tracking-widest text-blue-500">
                                    {t('extractingSignalLog')}
                                </p>
                            </div>
                        ) : filteredAndSortedLogs.length === 0 ? (
                            <div className={`flex flex-col items-center justify-center h-full opacity-60 ${UI.textMuted}`}>
                                <Crosshair size={32} className="mb-3" />
                                <p className="text-[10px] font-black uppercase tracking-widest">{t('noOrdersMatchFilter')}</p>
                            </div>
                        ) : (
                            filteredAndSortedLogs.map((log) => <TradeCard key={log._id} log={log} isDark={isDark} UI={UI} />)
                        )}
                    </div>
                </section>
            </div>


            <div className={`-mx-4 lg:-mx-6 h-[2px] shrink-0 my-10 ${isDark ? 'bg-white/80 shadow-[0_0_10px_rgba(255,255,255,0.2)]' : 'bg-slate-300'}`} />

            {/* THẺ QUẢN LÝ PHÂN BỔ VỐN AI */}
            <div className={`p-6 rounded-3xl border-2 shadow-lg mb-6 ${isDark ? 'bg-[#0f141e] !border-white/80 shadow-[0_0_15px_rgba(255,255,255,0.1)]' : 'bg-white border-slate-300'}`}>
                <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                    <div className="flex items-center gap-3">
                        <Briefcase className="text-purple-500" />
                        <h3 className={`text-lg font-black uppercase tracking-widest ${UI.textBold}`}>
                            AI Capital & Risk Manager
                        </h3>
                        <button
                            onClick={() => setShowGuide(true)}
                            title={t('opsGuideTitle')}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-colors border-2 ${isDark ? 'border-cyan-500/40 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300' : 'border-cyan-300 bg-cyan-50 hover:bg-cyan-100 text-cyan-600'}`}>
                            <BookOpen size={16} /> {t('guideBtn')}
                        </button>
                        <button
                            onClick={() => setIsCapitalManagerCollapsed(v => !v)}
                            title={isCapitalManagerCollapsed ? t('expand') : t('collapse')}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-colors border-2 ${isDark ? 'border-purple-500/40 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300' : 'border-purple-300 bg-purple-50 hover:bg-purple-100 text-purple-600'}`}>
                            <ChevronDown size={16} className={`transition-transform duration-300 ${isCapitalManagerCollapsed ? '-rotate-90' : ''}`} />
                            {isCapitalManagerCollapsed ? t('viewDetails') : t('collapse')}
                        </button>
                    </div>
                </div>
                {/* Tóm tắt nhanh khi đang thu gọn — vẫn nắm được vốn mà không cần mở */}
                {isCapitalManagerCollapsed && (
                    <div className={`flex flex-wrap items-center gap-x-6 gap-y-2 px-1 pt-3 mt-1 border-t ${UI.border}`}>
                        <div className="flex items-center gap-2">
                            <span className={`text-[10px] uppercase font-bold ${UI.textMuted}`}>{t('totalCapital')}:</span>
                            <span className={`text-base font-mono font-black ${UI.textBold}`}>{totalCapital.toLocaleString()} đ</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className={`text-[10px] uppercase font-bold ${UI.textMuted}`}>{t('deployedCapital')}:</span>
                            <span className="text-base font-mono font-black text-emerald-500">{allocatedCapital.toLocaleString()} đ</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className={`text-[10px] uppercase font-bold ${UI.textMuted}`}>{t('available')}:</span>
                            <span className="text-base font-mono font-black text-yellow-500">{(totalCapital - allocatedCapital).toLocaleString()} đ</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className={`text-[10px] uppercase font-bold ${UI.textMuted}`}>{t('totalPnl')}:</span>
                            <span className={`text-base font-mono font-black ${metrics.totalPnlAmount >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                {metrics.totalPnlAmount >= 0 ? '+' : ''}{formatNumber(metrics.totalPnlAmount)} đ
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className={`text-[10px] uppercase font-bold ${UI.textMuted}`}>{t('winRate')}:</span>
                            <span className="text-base font-mono font-black text-cyan-500">{metrics.winRate}%</span>
                        </div>
                    </div>
                )}

                {!isCapitalManagerCollapsed && (
                <>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-6 mb-6">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <p className="text-[10px] uppercase font-bold text-slate-500">{t('configuredTotalCapital')}</p>
                            {!isEditingCapital ? (
                                <button onClick={() => setIsEditingCapital(true)} className="text-purple-500 hover:text-purple-600 transition-colors">
                                    <Edit2 size={12} />
                                </button>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <button onClick={handleSaveCapital} className="text-emerald-500 hover:text-emerald-600 transition-colors"><Check size={14} /></button>
                                    <button onClick={() => { setIsEditingCapital(false); setCapitalInput(totalCapital.toLocaleString('vi-VN')); }} className="text-red-500 hover:text-red-600 transition-colors"><X size={14} /></button>
                                </div>
                            )}
                        </div>
                        {!isEditingCapital ? (
                            <p className={`text-2xl font-mono font-black ${UI.textBold}`}>{totalCapital.toLocaleString()} đ</p>
                        ) : (
                            <input
                                type="text"
                                value={capitalInput}
                                onChange={e => {
                                    const val = e.target.value.replace(/\D/g, '');
                                    setCapitalInput(val ? Number(val).toLocaleString('vi-VN') : '');
                                }}
                                className={`w-full bg-transparent border-b-2 border-purple-500 text-2xl font-mono font-black outline-none ${UI.textBold}`}
                            />
                        )}
                    </div>
                    <div>
                        <p className="text-[10px] uppercase font-bold text-slate-500 mb-1">{t('deployedCapital')}</p>
                        <p className="text-2xl font-mono font-black text-emerald-500">{allocatedCapital.toLocaleString()} đ</p>
                    </div>
                    <div>
                        <p className="text-[10px] uppercase font-bold text-slate-500 mb-1">{t('availableCapital')}</p>
                        <p className="text-2xl font-mono font-black text-yellow-500">{(totalCapital - allocatedCapital).toLocaleString()} đ</p>
                    </div>
                </div>

                <div className="w-full h-3 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden flex">
                    <div className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all duration-700" style={{ width: `${allocationPercent}%` }} />
                </div>
                <p className="text-right text-[10px] mt-2 font-bold text-slate-400">{t('allocationRatio')}: {allocationPercent.toFixed(1)}%</p>
                </>
                )}
            </div>

            {!isCapitalManagerCollapsed && (
            <>
            <div className={`flex items-center gap-2 mb-3 pl-1 border-l-4 border-cyan-500`}>
                <span className={`ml-2 text-xs font-black uppercase tracking-widest ${UI.textBold}`}>{t('systemPerformance')}</span>
                <span className={`text-[10px] font-bold ${UI.textMuted}`}>{t('systemPerfSubtitle')}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 mb-6">
                <ResultCard
                    UI={UI}
                    isDark={isDark}
                    label={t('totalSystemPnl')}
                    value={`${metrics.totalPnlAmount >= 0 ? '+' : ''}${formatNumber(metrics.totalPnlAmount)} đ`}
                    tone={metrics.totalPnlAmount >= 0 ? 'text-emerald-500' : 'text-red-500'}
                    detail={t('winsLossesLong', { wins: metrics.winningTrades || 0, losses: metrics.losingTrades || 0 })}
                />
                <ResultCard
                    UI={UI}
                    isDark={isDark}
                    label={t('winRateFull')}
                    value={`${metrics.winRate}%`}
                    tone="text-cyan-500"
                    detail={t('maxWinStreakDetail', { count: metrics.maxWinStreak })}
                />
                <ResultCard
                    UI={UI}
                    isDark={isDark}
                    label={t('avgPnlLabel')}
                    value={t('avgPnlPerOrderValue', { value: metrics.avgPnl })}
                    tone={Number(metrics.avgPnl) >= 0 ? 'text-emerald-500' : 'text-red-500'}
                    detail={t('basedOnClosedOrders')}
                />
                <ResultCard
                    UI={UI}
                    isDark={isDark}
                    label={t('openCapital')}
                    value={`${formatNumber(performance.openExposure)} đ`}
                    tone="text-amber-500"
                    detail={t('openPositionsRunning', { count: performance.openTrades })}
                />
                <ResultCard
                    UI={UI}
                    isDark={isDark}
                    label={t('bestTradeLabel')}
                    value={performance.bestTrade ? `${performance.bestTrade.symbol} +${formatNumber(performance.bestTrade.pnlPercent, 2)}%` : '--'}
                    tone="text-emerald-500"
                    detail={performance.bestTrade ? `${formatNumber(performance.bestTrade.pnl)} đ` : t('noClosedOrdersYet')}
                />
                <ResultCard
                    UI={UI}
                    isDark={isDark}
                    label={t('worstTradeLabel')}
                    value={performance.worstTrade ? `${performance.worstTrade.symbol} ${formatNumber(performance.worstTrade.pnlPercent, 2)}%` : '--'}
                    tone="text-red-500"
                    detail={performance.worstTrade ? `${formatNumber(performance.worstTrade.pnl)} đ` : t('noClosedOrdersYet')}
                />
            </div>

            {metricsLive.totalTrades > 0 && (
                <div className={`mb-6 rounded-xl border px-4 py-3 ${isDark ? 'bg-emerald-950/30 border-emerald-500/25' : 'bg-emerald-50 border-emerald-200'}`}>
                    <p className={`text-[10px] font-black uppercase tracking-widest mb-2 ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
                        {t('liveClosedCount', { count: metricsLive.totalTrades })}
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px] font-mono">
                        <div>
                            <span className={UI.textMuted}>Win rate </span>
                            <span className="font-black text-cyan-500">{metricsLive.winRate}%</span>
                        </div>
                        <div>
                            <span className={UI.textMuted}>{t('avgWin')} </span>
                            <span className="font-black text-emerald-500">+{metricsLive.avgWinPct}%</span>
                        </div>
                        <div>
                            <span className={UI.textMuted}>{t('avgLoss')} </span>
                            <span className="font-black text-red-500">{metricsLive.avgLossPct}%</span>
                        </div>
                        <div>
                            <span className={UI.textMuted}>Expectancy </span>
                            <span className={`font-black ${metricsLive.expectancyPct >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                {t('expectancyPerOrder', { value: `${metricsLive.expectancyPct >= 0 ? '+' : ''}${metricsLive.expectancyPct}` })}
                            </span>
                        </div>
                    </div>
                    <p className={`text-[10px] mt-2 ${UI.textMuted}`}>
                        {t('liveAccumPnlDetail', { pnl: `${metricsLive.totalPnlAmount >= 0 ? '+' : ''}${formatNumber(metricsLive.totalPnlAmount)} đ` })}
                        {metricsLive.totalPnlUSDT != null && (
                            <span className={`ml-2 ${UI.textMuted}`}>
                                · ≈${Number(metricsLive.totalPnlUSDT).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                            </span>
                        )}
                    </p>
                </div>
            )}

            <div className={`mb-6 rounded-xl border px-4 py-3 flex items-start gap-3 ${isDark ? 'bg-slate-950/70 border-amber-500/20' : 'bg-amber-50 border-amber-200'}`}>
                <DatabaseZap size={16} className="text-amber-500 mt-0.5 shrink-0" />
                <div>
                    <p className={`text-[11px] font-black uppercase tracking-widest mb-1 ${isDark ? 'text-amber-300' : 'text-amber-700'}`}>{t('executionMode')}</p>
                    <p className={`text-[12px] leading-relaxed ${UI.textMuted}`}>
                        {t('executionModeExplain')}
                    </p>
                </div>
            </div>
            </>
            )}


            {aiLessons.length > 0 && (
                <section className={`rounded-xl border p-4 ${UI.card}`}>
                    <div className="flex items-center gap-2 mb-3">
                        <BrainCircuit size={16} className="text-purple-500" />
                        <span className={`text-[11px] font-black uppercase tracking-widest ${UI.textBold}`}>AI lessons</span>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 max-h-72 overflow-y-auto custom-scrollbar pr-1">
                        {aiLessons.map((lesson) => (
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

function FieldShell({ UI, label, children, action }) {
    return (
        <div className={`book-field p-3 rounded-lg border-2 flex flex-col justify-center ${UI.searchBg}`}>
            <div className="flex items-center justify-between mb-2">
                <label className={`block text-[9px] font-black uppercase tracking-widest ${UI.textMuted}`}>{label}</label>
                {action}
            </div>
            {children}
        </div>
    );
}

function TradeCard({ log, isDark, UI }) {
    const { t } = useTranslation('autoDuck');
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
                            <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest border ${badgeClass}`}>{log.direction}{log.status === 'PENDING' ? t('pendingParen') : ''}</span>
                            <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border ${
                                log.executionMode === 'LIVE'
                                    ? 'bg-red-500/10 text-red-500 border-red-500/40 animate-pulse'
                                    : log.status === 'PENDING' 
                                        ? (isDark ? 'bg-yellow-500/10 text-yellow-300 border-yellow-500/25' : 'bg-yellow-50 text-yellow-700 border-yellow-300')
                                        : (isDark ? 'bg-amber-500/10 text-amber-300 border-amber-500/25' : 'bg-amber-50 text-amber-700 border-amber-300')
                            }`}>
                                {log.executionMode === 'LIVE'
                                    ? '🔴 Live'
                                    : (log.status === 'PENDING' ? t('orderPendingLabel') : 'Simulated')}
                            </span>
                            {log.executionMode === 'LIVE' && log.externalOrderId && (
                                <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold border ${isDark ? 'bg-white/5 text-slate-400 border-white/10' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                                    #{String(log.externalOrderId).slice(-8)}
                                </span>
                            )}
                            <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border ${
                                log.riskLevel === 1 ? 'bg-blue-500/10 text-blue-500 border-blue-500/30' :
                                log.riskLevel === 3 ? 'bg-amber-500/10 text-amber-500 border-amber-500/30' :
                                log.riskLevel === 4 ? 'bg-red-500/10 text-red-500 border-red-500/30' :
                                'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
                            }`}>
                                Risk Lvl {log.riskLevel || 2}
                            </span>
                        </div>
                        <p className={`text-[10px] font-bold mt-1 ${UI.textMuted}`}>
                            {log.assetType} · {t('openedLabel')}: {formatDateTime(log.openedAt)}
                            {log.closedAt && ` · ${t('closedLabel')}: ${formatDateTime(log.closedAt)}`}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-widest border ${
                        log.status === 'OPEN' ? 'bg-cyan-500/10 text-cyan-500 border-cyan-500/30' : 
                        log.status === 'PENDING' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30' : 
                        'bg-slate-500/10 text-slate-400 border-slate-500/30'
                    }`}>
                        {log.status === 'PENDING' ? 'PENDING' : log.status}
                    </span>
                    {log.status === 'PENDING' && (
                        <span
                            title={t('waitingFill')}
                            className="px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-widest border bg-yellow-500/10 text-yellow-400 border-yellow-500/30"
                        >
                            {t('awaitingFillBadge')}
                        </span>
                    )}
                    {!isOpen && log.status !== 'PENDING' && (
                        <span className={`px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-widest border ${log.pnlPercent >= 0 ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' : 'bg-red-500/10 text-red-500 border-red-500/30'}`}>
                            PnL {log.pnlPercent >= 0 ? '+' : ''}{formatNumber(log.pnlPercent, 2)}%
                        </span>
                    )}
                    {isOpen && (
                        <span className={`px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-widest border ${
                            log.executionMode === 'LIVE'
                                ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                                : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                        }`}>
                            {log.executionMode === 'LIVE' ? t('pnlLiveRunning') : t('pnlSimRunning')}
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
                        <p className={`text-[8px] font-black uppercase tracking-widest mb-1 ${UI.textMuted}`}>{t('estimatedSize')}</p>
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
                            <p className={`text-[8px] font-black uppercase tracking-widest mb-2 ${UI.textMuted}`}>{t('priceSource')}</p>
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
                            <p className={`text-[8px] font-black uppercase tracking-widest mb-2 ${UI.textMuted}`}>{t('signalReason')}</p>
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

function UserOrderCard({ index, order, isDark, UI, onStop, onDelete }) {
    const { t } = useTranslation('autoDuck');
    const statusClass =
        order.status === 'MATCHED' ? 'bg-cyan-500/10 text-cyan-500 border-cyan-500/30' :
        order.status === 'ACTIVE' ? 'bg-violet-500/10 text-violet-400 border-violet-500/30' :
        order.status === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30' :
        order.status === 'STOPPED' ? 'bg-orange-500/10 text-orange-500 border-orange-500/30' :
        order.status === 'REJECTED' ? 'bg-red-500/10 text-red-500 border-red-500/30' :
        'bg-slate-500/10 text-slate-400 border-slate-500/30';

    const isPortfolio = order.allocationMode === 'PORTFOLIO';
    const allAllocations = isPortfolio ? (order.tradeAllocations || []) : [];
    const matchedAllocs = allAllocations.filter((a) => isMatchedAllocation(order, a));
    const openCount = countOpenOrdersInPackage(order);
    const closedAllocs = matchedAllocs.filter(a => a.closedAt);
    const wins = closedAllocs.filter(a => a.pnl > 0).length;
    const winAllocs = closedAllocs.filter(a => a.pnl > 0);
    const lossAllocs = closedAllocs.filter(a => a.pnl < 0);
    const avgWinVnd = winAllocs.length
        ? Math.round(winAllocs.reduce((s, a) => s + (Number(a.pnl) || 0), 0) / winAllocs.length)
        : 0;
    const avgLossVnd = lossAllocs.length
        ? Math.round(lossAllocs.reduce((s, a) => s + (Number(a.pnl) || 0), 0) / lossAllocs.length)
        : 0;
    const expectancyVnd = closedAllocs.length > 0
        ? Math.round((wins / closedAllocs.length) * avgWinVnd + ((closedAllocs.length - wins) / closedAllocs.length) * avgLossVnd)
        : 0;
    const displayUsedCapital = matchedAllocs
        .filter(a => !a.closedAt)
        .reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
    const displayRealizedPnl = closedAllocs.reduce((sum, a) => sum + (Number(a.pnl) || 0), 0);

    const displayTotalCapital = isPortfolio
        ? Math.max(0, (Number(order.totalCapital) || 0) - (Number(order.realizedPnl) || 0) + displayRealizedPnl)
        : Number(order.capital) || 0;

    const initialCapital = isPortfolio
        ? Math.max(0, displayTotalCapital - displayRealizedPnl)
        : Number(order.capital) || 0;

    const currentCapital = isPortfolio
        ? displayTotalCapital
        : (initialCapital + displayRealizedPnl);

    const pnlPercent = initialCapital > 0
        ? ((displayRealizedPnl / initialCapital) * 100)
        : 0;

    const usedPct = isPortfolio && currentCapital > 0
        ? Math.min(100, Math.round(displayUsedCapital / currentCapital * 100))
        : 0;

    const packageOutline = openCount > 0
        ? (isDark ? 'ring-2 ring-cyan-500/35 border-2 border-cyan-500/25 shadow-[0_0_15px_rgba(34,211,238,0.12)]' : 'ring-2 ring-cyan-400/50 border-2 border-cyan-300 shadow-md')
        : isPortfolio
            ? (isDark ? 'border-2 border-violet-500/30 shadow-md' : 'border-2 border-violet-200 shadow-sm')
            : (isDark ? 'border-2 border-slate-700 shadow-md' : 'border-2 border-slate-200 shadow-sm');

    const packageBg = isPortfolio
        ? (isDark ? 'bg-slate-900/90' : 'bg-slate-50/80')
        : (isDark ? 'bg-[#10151c]' : 'bg-white');

    return (
        <div className={`rounded-2xl p-5 sm:p-7 lg:p-8 transition-all duration-200 ${packageBg} ${packageOutline}`}>
            {/* ── 1. HEADER GÓI LỆNH ── */}
            <div className={`flex flex-wrap items-center justify-between gap-2 mb-5 pb-4 px-1 border-b ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
                <div className="flex items-center gap-3 min-w-0">
                    <span className={`flex shrink-0 items-center justify-center w-9 h-9 rounded-xl text-xs font-black border shadow-inner ${
                        isPortfolio
                            ? (isDark ? 'bg-violet-500/20 border-violet-500/40 text-violet-300' : 'bg-violet-100 border-violet-300 text-violet-700')
                            : (isDark ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' : 'bg-amber-50 border-amber-300 text-amber-700')
                    }`}>
                        #{index}
                    </span>
                    <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-2">
                            <span className={`text-xs font-black uppercase tracking-wider ${UI.textBold}`}>
                                {isPortfolio ? t('packageNumPortfolio', { index }) : t('packageNumFixed', { index })}
                            </span>
                        </div>
                        <span className={`text-[10px] font-bold flex items-center gap-1.5 ${openCount > 0 ? 'text-cyan-400' : UI.textMuted}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${openCount > 0 ? 'bg-cyan-400 animate-ping' : 'bg-slate-400'}`} />
                            {openCount > 0
                                ? t('ordersRunningInPackage', { count: openCount })
                                : ['ACTIVE', 'PENDING'].includes(order.status)
                                    ? t('botActiveWaitSignal')
                                    : t('noRunningOrders')}
                        </span>
                    </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                    {openCount > 0 && (
                        <span className="px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border bg-cyan-500/15 text-cyan-400 border-cyan-500/30 shadow-sm">
                            ⚡ {t('runningShort', { count: openCount })}
                        </span>
                    )}
                    {isPortfolio && (
                        <span className="px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border bg-violet-500/15 text-violet-400 border-violet-500/30 shadow-sm">
                            💼 PORTFOLIO
                        </span>
                    )}
                    {order.executionMode === 'LIVE' && (
                        <span className="px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border bg-emerald-500/15 text-emerald-400 border-emerald-500/30 shadow-sm animate-pulse">
                            ● LIVE
                        </span>
                    )}
                    {order.riskPause?.active && (
                        <span title={order.riskPause.reason} className="px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border bg-red-500/15 text-red-400 border-red-500/30 shadow-sm">
                            CIRCUIT PAUSE
                        </span>
                    )}
                    <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border shadow-sm ${statusClass}`}>
                        {order.status}
                    </span>
                </div>
            </div>

            {/* ── 2. PHÂN VÙNG VỐN BAN ĐẦU, VỐN HIỆN TẠI & PNL TÍCH LŨY ── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
                {/* Vốn Ban Đầu */}
                <div className={`p-4 rounded-2xl border flex flex-col justify-between ${
                    isDark ? 'bg-black/30 border-white/10' : 'bg-slate-100/80 border-slate-200'
                }`}>
                    <div className="flex items-center justify-between mb-1">
                        <span className={`text-[10px] font-black uppercase tracking-wider ${UI.textMuted} flex items-center gap-1`}>
                            💼 {t('initialCapital', 'Vốn ban đầu')}
                        </span>
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-500/10 text-slate-400 border border-slate-500/20">Gốc</span>
                    </div>
                    <div className={`text-base font-mono font-black ${UI.textBold}`}>
                        {formatNumber(initialCapital)} đ
                    </div>
                </div>

                {/* Vốn Hiện Tại */}
                <div className={`p-4 rounded-2xl border flex flex-col justify-between ${
                    displayRealizedPnl >= 0
                        ? (isDark ? 'bg-emerald-950/25 border-emerald-500/30' : 'bg-emerald-50/80 border-emerald-200')
                        : (isDark ? 'bg-red-950/25 border-red-500/30' : 'bg-red-50/80 border-red-200')
                }`}>
                    <div className="flex items-center justify-between mb-1">
                        <span className={`text-[10px] font-black uppercase tracking-wider ${UI.textMuted} flex items-center gap-1`}>
                            💰 {t('currentCapital', 'Vốn hiện tại')}
                        </span>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                            displayRealizedPnl >= 0
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                : 'bg-red-500/10 text-red-400 border-red-500/30'
                        }`}>
                            Quỹ hiện tại
                        </span>
                    </div>
                    <div className={`text-base font-mono font-black ${displayRealizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {formatNumber(currentCapital)} đ
                    </div>
                </div>

                {/* PnL Tích Lũy */}
                <div className={`p-4 rounded-2xl border flex flex-col justify-between ${
                    displayRealizedPnl >= 0
                        ? (isDark ? 'bg-emerald-950/25 border-emerald-500/30' : 'bg-emerald-50/80 border-emerald-200')
                        : (isDark ? 'bg-red-950/25 border-red-500/30' : 'bg-red-50/80 border-red-200')
                }`}>
                    <div className="flex items-center justify-between mb-1">
                        <span className={`text-[10px] font-black uppercase tracking-wider ${UI.textMuted} flex items-center gap-1`}>
                            📈 {t('accumulatedPnl', 'PnL tích lũy')}
                        </span>
                        <span className={`text-[9px] font-bold font-mono px-1.5 py-0.5 rounded border ${
                            displayRealizedPnl >= 0
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                : 'bg-red-500/10 text-red-400 border-red-500/30'
                        }`}>
                            {pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%
                        </span>
                    </div>
                    <div className={`text-base font-mono font-black ${displayRealizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {displayRealizedPnl >= 0 ? '+' : ''}{formatNumber(displayRealizedPnl)} đ
                    </div>
                </div>
            </div>

            {/* ── 3. THANH SỬ DỤNG VỐN & THÔNG SỐ CẤU HÌNH GÓI ── */}
            {isPortfolio ? (
                <div className={`mb-5 p-4 sm:p-5 rounded-2xl border ${isDark ? 'bg-black/20 border-white/5' : 'bg-slate-100/60 border-slate-200'}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                        <span className={`text-[10px] font-mono font-bold ${UI.textMuted} flex items-center gap-1`}>
                            ⚡ {t('fundInUse', {
                                amount: formatNumber(displayUsedCapital),
                                pct: usedPct,
                                openCount,
                            })}
                        </span>
                        <span className={`text-[10px] font-mono font-black ${displayUsedCapital > 0 ? 'text-cyan-400' : UI.textMuted}`}>
                            Khả dụng: {formatNumber(Math.max(0, currentCapital - displayUsedCapital))} đ
                        </span>
                    </div>

                    <div className={`w-full h-2 rounded-full overflow-hidden mb-3 ${isDark ? 'bg-white/10' : 'bg-slate-200'}`}>
                        <div
                            className="h-full bg-gradient-to-r from-violet-500 to-cyan-400 transition-all duration-500 rounded-full"
                            style={{ width: `${usedPct}%` }}
                        />
                    </div>

                    <div className="flex flex-wrap gap-2 pt-2 border-t border-dashed border-white/10">
                        <span className={`px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-wider border ${
                            isDark ? 'bg-violet-500/10 text-violet-300 border-violet-500/20' : 'bg-violet-50 text-violet-700 border-violet-200'
                        }`}>
                            📊 %/Lệnh: {order.allocationPercent}%
                        </span>
                        <span className={`px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-wider border ${
                            isDark ? 'bg-blue-500/10 text-blue-300 border-blue-500/20' : 'bg-blue-50 text-blue-700 border-blue-200'
                        }`}>
                            🔢 Max đồng thời: {order.maxConcurrentOrders}
                        </span>
                        <span className={`px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-wider border ${
                            order.dynamicSizing
                                ? (isDark ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-emerald-50 text-emerald-700 border-emerald-200')
                                : (isDark ? 'bg-slate-500/10 text-slate-400 border-slate-500/20' : 'bg-slate-100 text-slate-600 border-slate-200')
                        }`}>
                            ⚡ Dynamic: {order.dynamicSizing ? t('dynamicOn') : t('dynamicOff')}
                        </span>
                        <span className={`px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-wider border ${
                            isDark ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}>
                            🎯 Target: +{order.targetPct}%
                        </span>
                        <span className={`px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-wider border ${
                            isDark ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-red-50 text-red-700 border-red-200'
                        }`}>
                            🛡️ SL: -{order.stopLossPct}%
                        </span>
                        <span className={`px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-wider border ${
                            isDark ? 'bg-amber-500/10 text-amber-300 border-amber-500/20' : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}>
                            🌐 {order.assetType}
                        </span>
                    </div>
                </div>
            ) : (
                <div className="flex flex-wrap gap-2 mb-5">
                    <span className={`px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-wider border ${
                        isDark ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    }`}>
                        🎯 Target +{order.targetPct}%
                    </span>
                    <span className={`px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-wider border ${
                        isDark ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-red-50 text-red-700 border-red-200'
                    }`}>
                        🛡️ SL -{order.stopLossPct}%
                    </span>
                    <span className={`px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-wider border ${
                        isDark ? 'bg-amber-500/10 text-amber-300 border-amber-500/20' : 'bg-amber-50 text-amber-700 border-amber-200'
                    }`}>
                        🌐 {order.assetType}
                    </span>
                </div>
            )}

            {/* ── 4. PHÂN VÙNG THỐNG KÊ LỆNH ĐÃ ĐÓNG (NẾU CÓ) ── */}
            {isPortfolio && closedAllocs.length > 0 && (
                <div className={`mb-5 p-4 sm:p-5 rounded-2xl border ${isDark ? 'bg-slate-950/60 border-white/10' : 'bg-white border-slate-200 shadow-sm'}`}>
                    <div className="flex items-center justify-between mb-2">
                        <span className={`text-[10px] font-black uppercase tracking-widest ${UI.textBold} flex items-center gap-1.5`}>
                            📊 Thống kê lệnh đã đóng ({closedAllocs.length} lệnh)
                        </span>
                        <span className="text-[10px] font-mono font-black text-cyan-400">
                            Winrate {Math.round(wins / closedAllocs.length * 100)}% ({wins}/{closedAllocs.length})
                        </span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px] font-mono">
                        <div className={`p-2.5 rounded-xl border ${isDark ? 'bg-black/30 border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                            <p className={`text-[8px] uppercase font-bold mb-0.5 ${UI.textMuted}`}>Thắng / Thua</p>
                            <p className="font-black text-emerald-400">{wins} <span className={UI.textMuted}>/</span> <span className="text-red-400">{closedAllocs.length - wins}</span></p>
                        </div>
                        <div className={`p-2.5 rounded-xl border ${isDark ? 'bg-black/30 border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                            <p className={`text-[8px] uppercase font-bold mb-0.5 ${UI.textMuted}`}>Avg Lãi</p>
                            <p className="font-black text-emerald-400">+{formatNumber(avgWinVnd)}đ</p>
                        </div>
                        <div className={`p-2.5 rounded-xl border ${isDark ? 'bg-black/30 border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                            <p className={`text-[8px] uppercase font-bold mb-0.5 ${UI.textMuted}`}>Avg Lỗ</p>
                            <p className="font-black text-red-400">{formatNumber(avgLossVnd)}đ</p>
                        </div>
                        <div className={`p-2.5 rounded-xl border ${isDark ? 'bg-black/30 border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                            <p className={`text-[8px] uppercase font-bold mb-0.5 ${UI.textMuted}`}>Kỳ vọng (Exp)</p>
                            <p className={`font-black ${expectancyVnd >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {expectancyVnd >= 0 ? '+' : ''}{formatNumber(expectancyVnd)}đ
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* ── 5. NHẬT KÝ TÍN HIỆU GẦN NHẤT ── */}
            {(order.result?.message || (isPortfolio && allAllocations.length > 0)) && (
                <div className={`mb-5 p-4 rounded-2xl border flex items-start gap-2.5 ${
                    isDark ? 'bg-cyan-950/20 border-cyan-500/20 text-cyan-200' : 'bg-cyan-50 border-cyan-200 text-cyan-900'
                }`}>
                    <Activity size={15} className="text-cyan-400 mt-0.5 shrink-0" />
                    <p className="text-[11px] font-mono leading-relaxed break-words">
                        {order.status === 'STOPPED' && openCount === 0
                            ? t('packageStoppedMsg')
                            : (order.result?.message || '')}
                    </p>
                </div>
            )}

            {/* ── 6. DANH SÁCH LỆNH ĐÃ VÀO ── */}
            {isPortfolio && allAllocations.length > 0 && (
                <div className={`mt-5 pt-4 border-t ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
                    <div className="flex items-center justify-between mb-2 px-1">
                        <span className={`text-[10px] font-black uppercase tracking-widest ${UI.textBold} flex items-center gap-1.5`}>
                            📋 {t('enteredOrdersTitle', { matched: matchedAllocs.length, total: allAllocations.length })}
                        </span>
                        <span className={`text-[9px] font-bold ${UI.textMuted}`}>
                            Cuộn để xem toàn bộ
                        </span>
                    </div>

                    <div className="flex flex-col gap-2 max-h-60 overflow-y-auto custom-scrollbar pr-1">
                        {[...allAllocations].reverse().map((a, i) => {
                            const isClosed = !!a.closedAt;
                            const isUnmatched = !isMatchedAllocation(order, a);
                            const tradeDoc = a.trade && typeof a.trade === 'object' ? a.trade : null;
                            const tradeStatus = tradeDoc?.status || null;
                            const isPendingFill = !isClosed && !isUnmatched && tradeStatus === 'PENDING';
                            const simStillRunning = isUnmatched && (
                                (tradeStatus && ['OPEN', 'PENDING'].includes(tradeStatus))
                                || (!tradeDoc && !isClosed)
                            );
                            const allocPnlPct = Number(a.pnlPercent || 0);
                            const reason = a.matchMessage || t('brokerMatchFailed');
                            const modeTag = isUnmatched
                                ? 'SIM'
                                : (a.executionMode === 'LIVE' ? 'LIVE' : 'SIM');

                            return (
                                <div key={i} className={`flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 rounded-2xl text-[10px] border transition-colors ${
                                    isDark ? 'bg-black/30 border-white/5 hover:border-white/20' : 'bg-white border-slate-200 hover:border-slate-300 shadow-sm'
                                }`}>
                                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                        <span className={`font-black font-mono text-xs ${UI.textBold}`}>{a.symbol || '—'}</span>
                                        {a.direction && (
                                            <span className={`px-1.5 py-0.5 rounded text-[8px] font-black tracking-wider ${
                                                a.direction.includes('LONG') || a.direction.includes('MUA') ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25' : 
                                                a.direction.includes('SHORT') || a.direction.includes('BÁN') ? 'bg-red-500/15 text-red-400 border border-red-500/25' : 
                                                'bg-slate-500/15 text-slate-400 border border-slate-500/25'
                                            }`}>
                                                {a.direction}
                                            </span>
                                        )}
                                        <span className={`px-1.5 py-0.5 rounded text-[8px] font-black border ${
                                            modeTag === 'LIVE'
                                                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                                : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                                        }`}>
                                            {modeTag}
                                        </span>
                                        {isUnmatched && (
                                            <span title={reason} className="px-1.5 py-0.5 rounded text-[8px] font-black bg-red-500/15 text-red-400 border border-red-500/30">
                                                UNMATCHED
                                            </span>
                                        )}
                                        {isPendingFill && (
                                            <span title={t('liveAwaitingFillTitle')} className="px-1.5 py-0.5 rounded text-[8px] font-black bg-yellow-500/15 text-yellow-400 border border-yellow-500/30">
                                                PENDING
                                            </span>
                                        )}
                                        {simStillRunning && (
                                            <span title={t('simOpeningTitle')} className="px-1.5 py-0.5 rounded text-[8px] font-black bg-sky-500/15 text-sky-400 border border-sky-500/30">
                                                OPENING
                                            </span>
                                        )}
                                        <span className={`font-mono text-[9px] ${UI.textMuted}`}>
                                            @{Number(a.entryPrice).toLocaleString('en-US', { maximumFractionDigits: 4 })}
                                            {a.openedAt && <span className="ml-1 opacity-60 text-[8px]">({new Date(a.openedAt).toLocaleString('vi-VN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })})</span>}
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                        <span className={`font-mono font-bold text-[11px] ${UI.textNormal}`}>{(a.amount / 1e6).toFixed(2)}Tr</span>
                                        {simStillRunning ? (
                                            <span title={t('simPnlHiddenTitle')} className="px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wide bg-sky-500/15 text-sky-400 border border-sky-500/30">
                                                OPENING
                                            </span>
                                        ) : isClosed ? (
                                            <span title={isUnmatched ? t('simPnlNotAddedLiveTitle') : undefined} className={`font-mono font-black text-xs ${allocPnlPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                {allocPnlPct >= 0 ? '+' : ''}{allocPnlPct.toFixed(2)}%
                                                {a.pnl != null && <span className="text-[9px] font-normal ml-1">({a.pnl >= 0 ? '+' : ''}{Math.round(a.pnl / 1e3)}k)</span>}
                                            </span>
                                        ) : null}
                                        {isUnmatched ? (
                                            <div className="group flex items-center justify-end w-[110px] cursor-default" title={reason}>
                                                <span className="text-[10px] font-black text-red-400 group-hover:hidden">UNMATCHED</span>
                                                <div className="hidden group-hover:flex relative overflow-hidden w-full mask-fade-edges items-center">
                                                    <span className="text-[9px] font-bold text-yellow-400 animate-marquee-left whitespace-nowrap">{reason}</span>
                                                </div>
                                            </div>
                                        ) : isPendingFill ? (
                                            <span className="px-2 py-0.5 rounded text-[8px] font-black bg-yellow-500/15 text-yellow-400 border border-yellow-500/30">{t('awaitingFillBadge')}</span>
                                        ) : !isClosed ? (
                                            <span className="px-2 py-0.5 rounded text-[8px] font-black bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">{t('openBadge')}</span>
                                        ) : null}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ── 7. NÚT DỪNG GÓI PORTFOLIO ĐANG CHẠY ── */}
            {isPortfolio && ['ACTIVE', 'PENDING'].includes(order.status) && onStop && (
                <button
                    onClick={() => onStop(order)}
                    className="mt-5 w-full py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border border-orange-500/40 text-orange-400 hover:bg-orange-500/10 transition-all flex items-center justify-center gap-1.5 shadow-sm">
                    <span>⏹</span> {t('stopPackageBtn')}
                </button>
            )}

            {/* ── 8. NÚT XÓA GÓI ĐÃ KẾT THÚC ── */}
            {!['ACTIVE', 'PENDING'].includes(order.status) && openCount === 0 && onDelete && (
                <button
                    onClick={() => onDelete(order)}
                    className="mt-5 w-full py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border border-red-500/40 text-red-400 hover:bg-red-500/10 transition-all flex items-center justify-center gap-1.5 shadow-sm">
                    <span>🗑</span> {t('deletePackageBtn')}
                </button>
            )}
        </div>
    );
}
// ════════════════════════════════════════════════════════════════
// MODAL HƯỚNG DẪN CƠ CHẾ VẬN HÀNH
// ════════════════════════════════════════════════════════════════
function MechanismGuideModal({ isDark, UI, onClose }) {
    const { t } = useTranslation('autoDuck');
    const Section = ({ color, icon, title, children }) => (
        <div className={`rounded-xl border p-4 ${isDark ? 'bg-black/20 border-white/5' : 'bg-slate-50 border-slate-200'}`}>
            <div className="flex items-center gap-2 mb-2 pl-1 border-l-4" style={{ borderColor: color }}>
                <span className="ml-1 text-base">{icon}</span>
                <h4 className={`text-sm font-black uppercase tracking-wider ${UI.textBold}`} style={{ color }}>{title}</h4>
            </div>
            <div className={`text-[12px] leading-relaxed space-y-1.5 ${UI.textNormal}`}>{children}</div>
        </div>
    );
    const Tag = ({ color, children }) => (
        <span className="px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-widest" style={{ backgroundColor: `${color}22`, color }}>{children}</span>
    );

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
            <div
                className={`w-full max-w-3xl max-h-[88vh] overflow-y-auto custom-scrollbar rounded-2xl border shadow-2xl ${isDark ? 'bg-[#0B0F14] border-white/10' : 'bg-white border-slate-300'}`}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className={`sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b ${isDark ? 'bg-[#0B0F14] border-white/10' : 'bg-white border-slate-200'}`}>
                    <h3 className={`text-base font-black uppercase tracking-widest flex items-center gap-2 ${UI.textBold}`}>
                        {t('guideTitle')}
                    </h3>
                    <button onClick={onClose} className={`p-1.5 rounded-lg ${isDark ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`}>
                        <X size={18} className={UI.textMuted} />
                    </button>
                </div>

                <div className="p-5 space-y-3">
                    {/* 1. Hai nguồn vốn */}
                    <Section color="#a855f7" icon="💼" title={t('guideS1Title')}>
                        <p>{t('guideS1P1')}</p>
                        <p>· <Tag color="#a855f7">{t('guideTagEngineCapital')}</Tag> {t('guideS1P2')}</p>
                        <p>· <Tag color="#10b981">{t('guideTagMandateCapital')}</Tag> {t('guideS1P3')}</p>
                        <p className={UI.textMuted}>{t('guideS1P4')}</p>
                    </Section>

                    <Section color="#10b981" icon="📊" title={t('guideS2Title')}>
                        <p>· <Tag color="#10b981">{t('guideTagFixed')}</Tag> {t('guideS2P1')}</p>
                        <p>· <Tag color="#a855f7">{t('guideTagPortfolio')}</Tag> {t('guideS2P2')}</p>
                        <p className={UI.textMuted}>{t('guideS2P3')}</p>
                    </Section>

                    <Section color="#06b6d4" icon="⚙️" title={t('guideS3Title')}>
                        <p>· <Tag color="#06b6d4">{t('guideTagSimulated')}</Tag> {t('guideS3P1')}</p>
                        <p>· <Tag color="#ef4444">{t('guideTagLive')}</Tag> {t('guideS3P2')}</p>
                        <p className={UI.textMuted}>{t('guideS3P3')}</p>
                    </Section>

                    <Section color="#f59e0b" icon="⏻" title={t('guideS4Title')}>
                        <p>· <Tag color="#10b981">{t('guideTagOn')}</Tag> {t('guideS4P1')}</p>
                        <p>· <Tag color="#64748b">{t('guideTagOff')}</Tag> {t('guideS4P2')}</p>
                    </Section>

                    <Section color="#ef4444" icon="🛡️" title={t('guideS5Title')}>
                        <p>{t('guideS5P1')}</p>
                        <p>{t('guideS5P2')}</p>
                        <p>{t('guideS5P3')}</p>
                    </Section>

                    <Section color="#8b5cf6" icon="🔄" title={t('guideS6Title')}>
                        <p className="font-mono text-[11px]">{t('guideS6P1')}</p>
                        <p className={UI.textMuted}>{t('guideS6P2')}</p>
                    </Section>
                </div>

                <div className={`sticky bottom-0 px-5 py-3 border-t ${isDark ? 'bg-[#0B0F14] border-white/10' : 'bg-white border-slate-200'}`}>
                    <button onClick={onClose} className="w-full py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-600 text-white font-black text-sm transition-colors">
                        {t('guideGotIt')}
                    </button>
                </div>
            </div>
        </div>
    );
}
