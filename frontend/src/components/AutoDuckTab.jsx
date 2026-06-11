import React, { useEffect, useMemo, useState } from 'react';
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
    Play,
    ShieldAlert,
    Target,
    TrendingDown,
    TrendingUp,
    X,
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
    const isAdmin = username === 'admin';
    const [systemLogs, setSystemLogs] = useState([]);
    const [userOrders, setUserOrders] = useState([]);
    const [aiLessons, setAiLessons] = useState([]);
    const [metrics, setMetrics] = useState({ 
        winRate: 0, avgPnl: '0.00', totalTrades: 0, maxWinStreak: 0,
        totalPnlAmount: 0, winningTrades: 0, losingTrades: 0 
    });
    const [loading, setLoading] = useState(false);
    const [actionMessage, setActionMessage] = useState({ text: '', isError: false });
    
    // State bộ lọc và sắp xếp
    const [filterStatus, setFilterStatus] = useState('ALL');
    const [filterAsset, setFilterAsset] = useState('ALL');
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

    const filteredAndSortedLogs = useMemo(() => {
        let result = [...systemLogs];

        // Lọc theo trạng thái
        if (filterStatus === 'OPEN') {
            result = result.filter(log => ['OPEN', 'PENDING'].includes(log.status));
        } else if (filterStatus === 'CLOSED') {
            result = result.filter(log => ['CLOSED', 'REJECTED', 'SKIP'].includes(log.status));
        }

        // Lọc theo thị trường
        if (filterAsset !== 'ALL') {
            result = result.filter(log => log.assetType === filterAsset);
        }

        // Sắp xếp theo thời gian
        result.sort((a, b) => {
            const timeA = new Date(a.openedAt || a.createdAt).getTime();
            const timeB = new Date(b.openedAt || b.createdAt).getTime();
            return sortTime === 'DESC' ? timeB - timeA : timeA - timeB;
        });

        return result;
    }, [systemLogs, filterStatus, filterAsset, sortTime]);

    // Tính toán phân bổ vốn
    const allocatedCapital = performance.openExposure;
    const allocationPercent = totalCapital > 0 ? Math.min(100, (allocatedCapital / totalCapital) * 100) : 0;

    const fetchAllData = async () => {
        if (!username) return;
        try {
            const [resLogs, resUser, resLessons, resSettings, resConns] = await Promise.all([
                axios.get('/api/auto-trade/logs').catch(() => ({ data: { success: false } })),
                axios.get(`/api/auto-trade/user-order/${username}`).catch(() => ({ data: { success: false } })),
                axios.get('/api/auto-trade/ai-lessons').catch(() => ({ data: { success: false } })),
                axios.get('/api/auto-trade/settings').catch(() => ({ data: { success: false } })),
                axios.get(`/api/exchange-connections/${username}`).catch(() => ({ data: { success: false } })),
            ]);

            if (resConns.data.success) {
                setLiveConnections(
                    (resConns.data.data || []).filter(c => c.isActive && (c.permissions || []).includes('TRADE'))
                );
            }

            // Tỷ giá USD→VND realtime (Vietcombank, cache backend 1h)
            axios.get('/api/auto-trade/usd-rate')
                .then(r => { if (r.data?.success && r.data.rate > 0) setUsdVndRate(r.data.rate); })
                .catch(() => {});

            if (resLogs.data.success) {
                setSystemLogs(resLogs.data.data);
                setMetrics(resLogs.data.metrics);
            }
            if (resUser.data.success) setUserOrders(resUser.data.data);
            if (resLessons.data.success) setAiLessons(resLessons.data.data);
            if (resSettings.data.success && resSettings.data.data) {
                if (resSettings.data.data.autoTradeTotalCapital) {
                    setTotalCapital(resSettings.data.data.autoTradeTotalCapital);
                    if (!isEditingCapital) {
                        setCapitalInput(Number(resSettings.data.data.autoTradeTotalCapital).toLocaleString('vi-VN'));
                    }
                }
                if (resSettings.data.data.autoTradeRiskLevel) {
                    setRiskLevel(Number(resSettings.data.data.autoTradeRiskLevel));
                }
                if (resSettings.data.data.autoTradeEnabled !== undefined) {
                    // Ép Boolean: bắt cả string "false" / number 0 từ MongoDB
                    const raw = resSettings.data.data.autoTradeEnabled;
                    setIsEngineEnabled(raw === true || raw === 'true' || raw === 1);
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
        const numericValue = Number(String(capitalInput).replace(/\D/g, ''));
        if (isNaN(numericValue) || numericValue < 100_000_000) {
            setActionMessage({ text: 'Vốn phải là số và tối thiểu 100,000,000 đ.', isError: true });
            return;
        }
        if (!isAdmin) {
            setActionMessage({ text: 'Chỉ admin mới có quyền cấu hình hệ thống!', isError: true });
            return;
        }
        setLoading(true);
        try {
            await axios.post('/api/auto-trade/settings', { totalCapital: numericValue, username });
            setTotalCapital(numericValue);
            setIsEditingCapital(false);
            setActionMessage({ text: 'Đã cập nhật tổng vốn cho AI thành công!', isError: false });
        } catch (err) {
            setActionMessage({ text: err.response?.data?.message || 'Lỗi khi cập nhật vốn.', isError: true });
        } finally {
            setLoading(false);
        }
    };

    const handleRiskLevelChange = async (e) => {
        const level = Number(e.target.value);
        if (!isAdmin) {
            setActionMessage({ text: 'Chỉ admin mới có quyền đổi khẩu vị rủi ro!', isError: true });
            return;
        }
        setLoading(true);
        try {
            await axios.post('/api/auto-trade/settings', { riskLevel: level, username });
            setRiskLevel(level);
            setActionMessage({ text: `Đã chuyển hệ thống AI sang nhóm rủi ro mức ${level}.`, isError: false });
        } catch (err) {
            setActionMessage({ text: err.response?.data?.message || 'Lỗi khi cập nhật cấp độ rủi ro.', isError: true });
        } finally {
            setLoading(false);
        }
    };

    const handleToggleEngine = async () => {
        if (!isAdmin && !adminCode) {
            setActionMessage({ text: 'Cần mã Admin để bật/tắt hệ thống!', isError: true });
            return;
        }
        setLoading(true);
        const newState = !isEngineEnabled;
        try {
            await axios.post('/api/auto-trade/settings', { isEnabled: newState, username, adminCode });
            setIsEngineEnabled(newState);
            setActionMessage({ text: `Đã ${newState ? 'bật' : 'tắt'} chế độ AutoTrade tự động.`, isError: false });
        } catch (err) {
            setActionMessage({ text: err.response?.data?.message || 'Lỗi kết nối khi thay đổi trạng thái engine.', isError: true });
        } finally {
            setLoading(false);
        }
    };

    const handleStopOrder = async (order) => {
        if (!window.confirm(`Dừng gói portfolio ${(Number(order.totalCapital) / 1e6).toFixed(1)}Tr VNĐ?\nGói sẽ KHÔNG nhận lệnh mới. Các lệnh đang mở vẫn được giám sát đến khi đóng và vốn + PnL tự hoàn về quỹ.`)) return;
        try {
            const res = await axios.post(`/api/auto-trade/user-order/${order._id}/stop`, { username });
            setActionMessage({ text: res.data.message, isError: !res.data.success });
            fetchAllData();
        } catch (err) {
            setActionMessage({ text: err.response?.data?.message || 'Lỗi dừng gói lệnh.', isError: true });
        }
    };

    const handleFormSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setActionMessage({ text: '', isError: false });

        try {
            if (formData.executionMode === 'LIVE') {
                if (formData.assetType !== 'CRYPTO') {
                    setActionMessage({ text: 'Chế độ LIVE hiện chỉ hỗ trợ thị trường CRYPTO.', isError: true });
                    setLoading(false);
                    return;
                }
                if (!formData.exchangeConnectionId) {
                    setActionMessage({ text: 'Hãy chọn một kết nối sàn để dùng chế độ LIVE (tab Kết nối sàn / Broker).', isError: true });
                    setLoading(false);
                    return;
                }
                const conn = liveConnections.find(c => c._id === formData.exchangeConnectionId);
                if (conn?.environment === 'LIVE') {
                    const ok = window.confirm(
                        `⚠️ XÁC NHẬN LIVE TRADING\n\nKết nối "${conn.label}" (${conn.exchangeName}) đang ở môi trường LIVE.\nLệnh sẽ được gửi THỰC TẾ ra sàn bằng TIỀN THẬT khi engine khớp tín hiệu.\n\nBạn chắc chắn muốn tiếp tục?`
                    );
                    if (!ok) { setLoading(false); return; }
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
        if (!isAdmin) {
            setActionMessage({ text: 'Chỉ admin mới có quyền kích hoạt quét tín hiệu!', isError: true });
            return;
        }
        setLoading(true);
        setActionMessage({ text: '', isError: false });

        try {
            await axios.post('/api/auto-trade/force-trigger', { assetType: formData.assetType, username });
            setActionMessage({
                text: 'Đã kích hoạt engine quét tín hiệu theo dữ liệu thị trường hiện có.',
                isError: false,
            });
            setTimeout(fetchAllData, 2000);
        } catch (err) {
            setActionMessage({ text: err.response?.data?.message || 'Không kích hoạt được engine quét lệnh.', isError: true });
        } finally {
            setLoading(false);
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
            setActionMessage({ text: 'Chưa có balance khả dụng. Hãy thêm/làm mới kết nối sàn ở tab Broker (cần kết nối active có quyền TRADE).', isError: true });
            return;
        }
        const vnd = Math.floor(totalUSDT * (usdVndRate || 25400));
        const targetKey = formData.allocationMode === 'PORTFOLIO' ? 'totalCapital' : 'capital';
        setFormData(prev => ({ ...prev, [targetKey]: vnd }));
        setActionMessage({ text: `Đã set ${vnd.toLocaleString('vi-VN')}đ (~${totalUSDT.toLocaleString('en-US', { maximumFractionDigits: 2 })} USDT từ ${liveConnections.length} kết nối).`, isError: false });
    };

    return (
        <div className={`w-full h-full flex flex-col overflow-y-auto custom-scrollbar p-4 lg:p-6 transition-colors duration-300 ${UI.main}`}>
            {showGuide && <MechanismGuideModal isDark={isDark} UI={UI} onClose={() => setShowGuide(false)} />}
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
                <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                    <div className="flex items-center gap-3">
                        <Briefcase className="text-purple-500" />
                        <h3 className={`text-lg font-black uppercase tracking-widest ${UI.textBold}`}>
                            AI Capital & Risk Manager
                        </h3>
                        <button
                            onClick={() => setShowGuide(true)}
                            title="Hướng dẫn cơ chế vận hành"
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-colors border-2 ${isDark ? 'border-cyan-500/40 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300' : 'border-cyan-300 bg-cyan-50 hover:bg-cyan-100 text-cyan-600'}`}>
                            <BookOpen size={16} /> Hướng dẫn
                        </button>
                        <button
                            onClick={() => setIsCapitalManagerCollapsed(v => !v)}
                            title={isCapitalManagerCollapsed ? 'Mở rộng' : 'Thu gọn'}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-colors border-2 ${isDark ? 'border-purple-500/40 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300' : 'border-purple-300 bg-purple-50 hover:bg-purple-100 text-purple-600'}`}>
                            <ChevronDown size={16} className={`transition-transform duration-300 ${isCapitalManagerCollapsed ? '-rotate-90' : ''}`} />
                            {isCapitalManagerCollapsed ? 'Xem chi tiết' : 'Thu gọn'}
                        </button>
                    </div>
                    <div className="flex items-center gap-4">
                        {!isAdmin && (
                            <input 
                                type="password" 
                                placeholder="Nhập mã Admin..." 
                                value={adminCode}
                                onChange={e => setAdminCode(e.target.value)}
                                className={`w-32 text-[10px] font-bold tracking-widest px-2 py-1.5 rounded outline-none border transition-colors ${isDark ? 'bg-[#1a1f2e] text-slate-300 border-slate-700 focus:border-cyan-500' : 'bg-white text-slate-600 border-slate-300 focus:border-cyan-500'}`}
                            />
                        )}
                        <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-black uppercase tracking-widest ${UI.textMuted}`}>Trạng thái:</span>
                            <button
                                onClick={handleToggleEngine}
                                disabled={loading || isEngineEnabled === null || (!isAdmin && !adminCode)}
                                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors outline-none focus:ring-2 focus:ring-offset-1 focus:ring-cyan-500 ${
                                    isEngineEnabled === null ? 'bg-slate-600 animate-pulse' :
                                    isEngineEnabled ? 'bg-emerald-500' : 'bg-slate-400'
                                } ${(isEngineEnabled === null || !isAdmin && !adminCode) ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                                <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                                    isEngineEnabled ? 'translate-x-5' : 'translate-x-1'
                                }`} />
                            </button>
                            <span className={`text-[10px] font-black uppercase tracking-widest ${isEngineEnabled ? 'text-emerald-500' : 'text-slate-500'}`}>
                                {isEngineEnabled === null ? '···' : isEngineEnabled ? 'BẬT' : 'TẮT'}
                            </span>
                            <span className={`text-[9px] font-bold normal-case ${UI.textMuted}`} title="Tắt = dừng triển khai lệnh mô phỏng (training nền). Các gói LIVE & vị thế thực trên sàn VẪN được quét, giám sát và đóng lệnh bình thường.">
                                {isEngineEnabled === false ? '(LIVE vẫn chạy ⓘ)' : ''}
                            </span>
                        </div>

                        <div className={`w-px h-4 ${isDark ? 'bg-slate-700' : 'bg-slate-300'}`}></div>

                        <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-black uppercase tracking-widest ${UI.textMuted}`}>Khẩu vị Rủi ro:</span>
                            <select 
                            value={riskLevel}
                            onChange={handleRiskLevelChange}
                            disabled={loading || !isAdmin}
                            className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded outline-none border transition-colors cursor-pointer ${
                                riskLevel === 1 ? 'bg-blue-500/10 text-blue-500 border-blue-500/30' :
                                riskLevel === 3 ? 'bg-amber-500/10 text-amber-500 border-amber-500/30' :
                                riskLevel === 4 ? 'bg-red-500/10 text-red-500 border-red-500/30' :
                                'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
                            } ${!isAdmin ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            <option value={1} className={isDark ? "bg-[#1a1f2e] text-slate-300" : "bg-white text-slate-600"}>1 - RẤT THẬN TRỌNG</option>
                            <option value={2} className={isDark ? "bg-[#1a1f2e] text-slate-300" : "bg-white text-slate-600"}>2 - CÂN BẰNG (CHUẨN)</option>
                            <option value={3} className={isDark ? "bg-[#1a1f2e] text-slate-300" : "bg-white text-slate-600"}>3 - CHUYÊN GIA (ƯA RỦI RO)</option>
                            <option value={4} className={isDark ? "bg-[#1a1f2e] text-slate-300" : "bg-white text-slate-600"}>4 - DEGEN (MAX PROFIT)</option>
                        </select>
                    </div>
                    </div>
                </div>
                
                {/* Tóm tắt nhanh khi đang thu gọn — vẫn nắm được vốn mà không cần mở */}
                {isCapitalManagerCollapsed && (
                    <div className={`flex flex-wrap items-center gap-x-6 gap-y-2 px-1 pt-3 mt-1 border-t ${UI.border}`}>
                        <div className="flex items-center gap-2">
                            <span className={`text-[10px] uppercase font-bold ${UI.textMuted}`}>Tổng vốn:</span>
                            <span className={`text-base font-mono font-black ${UI.textBold}`}>{totalCapital.toLocaleString()} đ</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className={`text-[10px] uppercase font-bold ${UI.textMuted}`}>Đã giải ngân:</span>
                            <span className="text-base font-mono font-black text-emerald-500">{allocatedCapital.toLocaleString()} đ</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className={`text-[10px] uppercase font-bold ${UI.textMuted}`}>Khả dụng:</span>
                            <span className="text-base font-mono font-black text-yellow-500">{(totalCapital - allocatedCapital).toLocaleString()} đ</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className={`text-[10px] uppercase font-bold ${UI.textMuted}`}>Tổng PnL:</span>
                            <span className={`text-base font-mono font-black ${metrics.totalPnlAmount >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                {metrics.totalPnlAmount >= 0 ? '+' : ''}{formatNumber(metrics.totalPnlAmount)} đ
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className={`text-[10px] uppercase font-bold ${UI.textMuted}`}>Win rate:</span>
                            <span className="text-base font-mono font-black text-cyan-500">{metrics.winRate}%</span>
                        </div>
                    </div>
                )}

                {!isCapitalManagerCollapsed && (
                <>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-6 mb-6">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <p className="text-[10px] uppercase font-bold text-slate-500">Tổng Vốn Cấu Hình</p>
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
                </>
                )}
            </div>

            {!isCapitalManagerCollapsed && (
            <>
            <div className={`flex items-center gap-2 mb-3 pl-1 border-l-4 border-cyan-500`}>
                <span className={`ml-2 text-xs font-black uppercase tracking-widest ${UI.textBold}`}>Hiệu suất hệ thống</span>
                <span className={`text-[10px] font-bold ${UI.textMuted}`}>· Thống kê tổng hợp từ lệnh đã đóng & vị thế đang chạy</span>
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
            </>
            )}

            {/* ═══════ GÓI LỆNH ỦY THÁC CÁ NHÂN (SIMULATED / LIVE) ═══════ */}
            <div className={`flex items-center gap-2 mb-3 pl-1 border-l-4 border-emerald-500`}>
                <span className={`ml-2 text-xs font-black uppercase tracking-widest ${UI.textBold}`}>Gói lệnh ủy thác cá nhân</span>
                <span className={`text-[10px] font-bold ${UI.textMuted}`}>· Tạo lệnh để bot khớp & vào lệnh tự động (mô phỏng hoặc LIVE trên sàn)</span>
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 mb-6">
                <section className={`xl:col-span-5 rounded-xl border p-5 ${UI.card}`}>
                    <div className={`flex items-center gap-2 mb-4 pb-3 border-b ${UI.border}`}>
                        <Briefcase size={16} className="text-emerald-500" />
                        <span className={`text-[11px] font-black uppercase tracking-widest ${UI.textBold}`}>Tạo gói lệnh ủy thác</span>
                    </div>

                    <form onSubmit={handleFormSubmit} className="flex flex-col gap-3">
                        {/* ── CHẾ ĐỘ ỦY THÁC VỐN ── */}
                        <div className={`p-3 rounded-lg border flex flex-col gap-2 ${UI.searchBg}`}>
                            <label className={`flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest ${UI.textMuted}`}>
                                Chế độ ủy thác vốn
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
                                            : (isDark ? 'border-white/10 text-slate-400' : 'border-slate-300 text-slate-600')
                                    }`}>
                                    📌 Cố định / lệnh
                                </button>
                                <button type="button"
                                    onClick={() => setFormData({ ...formData, allocationMode: 'PORTFOLIO' })}
                                    className={`py-2 rounded-lg text-[11px] font-black border-2 transition-all ${
                                        formData.allocationMode === 'PORTFOLIO'
                                            ? 'bg-violet-500 border-violet-500 text-white'
                                            : (isDark ? 'border-white/10 text-slate-400' : 'border-slate-300 text-slate-600')
                                    }`}>
                                    💼 Portfolio — bot tự chia
                                </button>
                            </div>
                            <p className={`text-[10px] font-semibold leading-relaxed ${UI.textMuted}`}>
                                {formData.allocationMode === 'FIXED'
                                    ? 'Mỗi lệnh khớp sẽ dùng đúng số vốn bạn nhập. Gói hoàn tất sau 1 lệnh.'
                                    : 'Bạn ủy thác tổng quỹ — bot tự tính position size từng lệnh theo độ mạnh tín hiệu & rủi ro, chạy liên tục nhiều lệnh, lãi/lỗ tự cộng dồn vào quỹ (compound).'}
                            </p>
                        </div>

                        {formData.allocationMode === 'FIXED' ? (
                            <FieldShell UI={UI} label="Vốn ủy thác mỗi lệnh (VNĐ)" action={
                                <button type="button" onClick={handleSetAllBalance}
                                    title="Lấy toàn bộ balance khả dụng từ các kết nối sàn active"
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
                                <FieldShell UI={UI} label="Tổng quỹ ủy thác cho bot (VNĐ)" action={
                                    <button type="button" onClick={handleSetAllBalance}
                                        title="Lấy toàn bộ balance khả dụng từ các kết nối sàn active"
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
                                    <FieldShell UI={UI} label="% quỹ tối đa / lệnh">
                                        <input type="text" value={formData.allocationPercent}
                                            onChange={e => updateFormNumber('allocationPercent', e.target.value)}
                                            className={`w-full bg-transparent font-mono font-black text-lg outline-none ${UI.textBold}`} />
                                    </FieldShell>
                                    <FieldShell UI={UI} label="Lệnh đồng thời tối đa">
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
                                    🤖 Dynamic Sizing — bot tự điều chỉnh size theo độ mạnh tín hiệu & khoảng SL (giới hạn rủi ro ~1% quỹ/lệnh)
                                </label>
                                <p className={`text-[10px] font-mono ${UI.textMuted}`}>
                                    ≈ {((Number(formData.totalCapital) || 0) * (Number(formData.allocationPercent) || 10) / 100 / 1e6).toFixed(1)}Tr VNĐ/lệnh (cơ sở) · tối đa {formData.maxConcurrentOrders} lệnh = {((Number(formData.totalCapital) || 0) * (Number(formData.allocationPercent) || 10) / 100 * (Number(formData.maxConcurrentOrders) || 5) / 1e6).toFixed(0)}Tr triển khai đồng thời
                                </p>
                            </>
                        )}

                        <div className="grid grid-cols-2 gap-3">
                            <FieldShell UI={UI} label="Mục tiêu lãi (+%)">
                                <input type="text" value={formData.targetPct}
                                    onChange={e => updateFormNumber('targetPct', e.target.value)}
                                    className={`w-full bg-transparent font-mono font-black text-lg outline-none text-emerald-500`} />
                            </FieldShell>
                            <FieldShell UI={UI} label="Cắt lỗ (-%)">
                                <input type="text" value={formData.stopLossPct}
                                    onChange={e => updateFormNumber('stopLossPct', e.target.value)}
                                    className={`w-full bg-transparent font-mono font-black text-lg outline-none text-red-500`} />
                            </FieldShell>
                        </div>

                        <FieldShell UI={UI} label="Thị trường">
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
                                <option value="ALL" className={isDark ? 'bg-[#1a1f2e]' : 'bg-white'}>Tất cả thị trường</option>
                                <option value="VN_STOCK" className={isDark ? 'bg-[#1a1f2e]' : 'bg-white'}>Chứng khoán VN</option>
                                <option value="CRYPTO" className={isDark ? 'bg-[#1a1f2e]' : 'bg-white'}>Crypto</option>
                                <option value="DERIVATIVES" className={isDark ? 'bg-[#1a1f2e]' : 'bg-white'}>Phái sinh VN</option>
                            </select>
                        </FieldShell>

                        {/* CHẾ ĐỘ THỰC THI */}
                        <div className={`p-3 rounded-lg border flex flex-col gap-2 ${UI.searchBg}`}>
                            <label className={`flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest ${UI.textMuted}`}>
                                Chế độ thực thi
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
                                            : (isDark ? 'border-white/10 text-slate-400' : 'border-slate-300 text-slate-600')
                                    }`}>
                                    🧪 Mô phỏng
                                </button>
                                <button type="button"
                                    onClick={() => {
                                        if (formData.assetType !== 'CRYPTO') {
                                            setActionMessage({ text: 'Chế độ LIVE chỉ hỗ trợ CRYPTO — hãy chọn thị trường Crypto trước.', isError: true });
                                            return;
                                        }
                                        setFormData({ ...formData, executionMode: 'LIVE' });
                                    }}
                                    className={`py-2 rounded-lg text-[11px] font-black border-2 transition-all ${
                                        formData.executionMode === 'LIVE'
                                            ? 'bg-red-500 border-red-500 text-white'
                                            : (isDark ? 'border-white/10 text-slate-400' : 'border-slate-300 text-slate-600')
                                    } ${formData.assetType !== 'CRYPTO' ? 'opacity-40' : ''}`}>
                                    🔴 Live (gửi lệnh thực)
                                </button>
                            </div>

                            {formData.executionMode === 'LIVE' && (
                                <div className="flex flex-col gap-2 animate-in fade-in duration-200">
                                    {liveConnections.length === 0 ? (
                                        <p className="text-[11px] font-bold text-amber-500">
                                            Chưa có kết nối sàn nào active có quyền TRADE. Hãy thêm ở tab <b>7. Kết nối sàn / Broker</b>.
                                        </p>
                                    ) : (
                                        <select
                                            value={formData.exchangeConnectionId}
                                            onChange={e => setFormData({ ...formData, exchangeConnectionId: e.target.value })}
                                            className={`w-full px-2 py-2 rounded-lg border font-bold text-xs outline-none cursor-pointer ${isDark ? 'bg-[#1a1f2e] text-slate-200 border-slate-700' : 'bg-white text-slate-700 border-slate-300'}`}
                                        >
                                            <option value="">— Chọn kết nối sàn —</option>
                                            {liveConnections.map(c => (
                                                <option key={c._id} value={c._id}>
                                                    {c.exchangeName} · {c.label} · {c.environment === 'LIVE' ? '⚠️ LIVE' : 'Testnet'}
                                                </option>
                                            ))}
                                        </select>
                                    )}
                                    <p className="text-[10px] font-bold text-red-400 leading-relaxed">
                                        ⚠️ Cảnh báo: Khi engine khớp tín hiệu, lệnh sẽ được gửi thực tế đến sàn giao dịch.
                                        Spot chỉ hỗ trợ LONG/MUA. Đảm bảo bạn hiểu rõ rủi ro trước khi kích hoạt.
                                    </p>
                                </div>
                            )}
                        </div>

                        <button type="submit" disabled={loading}
                            className={`w-full py-3 rounded-xl font-black text-sm transition-colors disabled:opacity-50 ${
                                formData.executionMode === 'LIVE'
                                    ? 'bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/20'
                                    : 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/20'
                            }`}>
                            {loading ? 'Đang gửi...' : (formData.executionMode === 'LIVE' ? '🔴 Đăng ký gói lệnh LIVE' : 'Đăng ký gói lệnh mô phỏng')}
                        </button>

                        {actionMessage.text && (
                            <p className={`text-[11px] font-bold leading-relaxed ${actionMessage.isError ? 'text-red-400' : 'text-emerald-400'}`}>
                                {actionMessage.text}
                            </p>
                        )}
                    </form>
                </section>

                <section className={`xl:col-span-7 rounded-xl border flex flex-col max-h-[560px] overflow-hidden ${UI.card}`}>
                    <div className={`px-5 py-4 flex items-center gap-2 border-b ${UI.border} shrink-0`}>
                        <Target size={16} className="text-yellow-500" />
                        <span className={`text-[11px] font-black uppercase tracking-widest ${UI.textBold}`}>Gói lệnh của bạn ({userOrders.length})</span>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-4 flex flex-col gap-3">
                        {userOrders.length === 0 ? (
                            <p className={`text-sm font-bold text-center py-8 ${UI.textMuted}`}>
                                Chưa có gói lệnh nào. Tạo gói lệnh để AutoDuck tự khớp tín hiệu tối ưu cho bạn.
                            </p>
                        ) : (
                            userOrders.map(order => <UserOrderCard key={order._id} order={order} isDark={isDark} UI={UI} onStop={handleStopOrder} />)
                        )}
                    </div>
                </section>
            </div>

            <div className={`flex items-center gap-2 mb-3 pl-1 border-l-4 border-violet-500`}>
                <span className={`ml-2 text-xs font-black uppercase tracking-widest ${UI.textBold}`}>Nhật ký tín hiệu AI</span>
                <span className={`text-[10px] font-bold ${UI.textMuted}`}>· Lệnh mô phỏng chạy nền để AI học · Xem lệnh thực ở tab Broker</span>
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 mb-6">
                <section className={`xl:col-span-12 rounded-xl border flex flex-col h-[720px] overflow-hidden ${UI.card}`}>
                    <div className={`px-5 py-4 flex items-center justify-between border-b ${UI.border} shrink-0`}>
                        <div className="flex items-center gap-2">
                            <Activity size={16} className="text-cyan-500" />
                            <div className="flex flex-col">
                                <span className={`text-[11px] font-black uppercase tracking-widest ${UI.textBold}`}>🧠 Tín hiệu AI — Training nền (mô phỏng)</span>
                                <span className={`text-[9px] font-bold normal-case tracking-normal ${UI.textMuted}`}>Chạy ngầm để AI học & tăng tỷ lệ thắng · Không báo Telegram · Lệnh thực xem ở tab Broker</span>
                            </div>
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

                    <div className={`px-4 py-3 flex flex-wrap gap-2 border-b ${isDark ? 'border-white/5 bg-[#0a0f18]' : 'border-slate-100 bg-slate-50'} shrink-0`}>
                        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1.5 rounded outline-none border transition-colors cursor-pointer ${isDark ? 'bg-[#1a1f2e] text-slate-300 border-slate-700' : 'bg-white text-slate-600 border-slate-300'}`}>
                            <option value="ALL">Trạng thái: Tất cả</option>
                            <option value="OPEN">Trạng thái: Đang chạy</option>
                            <option value="CLOSED">Trạng thái: Đã đóng</option>
                        </select>
                        <select value={filterAsset} onChange={e => setFilterAsset(e.target.value)} className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1.5 rounded outline-none border transition-colors cursor-pointer ${isDark ? 'bg-[#1a1f2e] text-slate-300 border-slate-700' : 'bg-white text-slate-600 border-slate-300'}`}>
                            <option value="ALL">Thị trường: Tất cả</option>
                            <option value="VN_STOCK">Chứng khoán VN</option>
                            <option value="CRYPTO">Crypto</option>
                            <option value="DERIVATIVES">Phái sinh VN</option>
                        </select>
                        <select value={sortTime} onChange={e => setSortTime(e.target.value)} className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1.5 rounded outline-none border transition-colors cursor-pointer ${isDark ? 'bg-[#1a1f2e] text-slate-300 border-slate-700' : 'bg-white text-slate-600 border-slate-300'}`}>
                            <option value="DESC">Sắp xếp: Mới nhất</option>
                            <option value="ASC">Sắp xếp: Cũ nhất</option>
                        </select>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                        {filteredAndSortedLogs.length === 0 ? (
                            <div className={`flex flex-col items-center justify-center h-full opacity-60 ${UI.textMuted}`}>
                                <Crosshair size={32} className="mb-3" />
                                <p className="text-[10px] font-black uppercase tracking-widest">Không có lệnh nào thỏa mãn bộ lọc.</p>
                            </div>
                        ) : (
                            filteredAndSortedLogs.map((log) => <TradeCard key={log._id} log={log} isDark={isDark} UI={UI} />)
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
        <div className={`p-3 rounded-lg border flex flex-col justify-center ${UI.searchBg}`}>
            <div className="flex items-center justify-between mb-2">
                <label className={`block text-[9px] font-black uppercase tracking-widest ${UI.textMuted}`}>{label}</label>
                {action}
            </div>
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
                                log.executionMode === 'LIVE'
                                    ? 'bg-red-500/10 text-red-500 border-red-500/40 animate-pulse'
                                    : log.status === 'PENDING' 
                                        ? (isDark ? 'bg-yellow-500/10 text-yellow-300 border-yellow-500/25' : 'bg-yellow-50 text-yellow-700 border-yellow-300')
                                        : (isDark ? 'bg-amber-500/10 text-amber-300 border-amber-500/25' : 'bg-amber-50 text-amber-700 border-amber-300')
                            }`}>
                                {log.executionMode === 'LIVE'
                                    ? '🔴 Live'
                                    : (log.status === 'PENDING' ? 'Lệnh chờ' : 'Simulated')}
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
                            {log.assetType} · Mở: {formatDateTime(log.openedAt)}
                            {log.closedAt && ` · Đóng: ${formatDateTime(log.closedAt)}`}
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

function UserOrderCard({ order, isDark, UI, onStop }) {
    const statusClass =
        order.status === 'MATCHED' ? 'bg-cyan-500/10 text-cyan-500 border-cyan-500/30' :
        order.status === 'ACTIVE' ? 'bg-violet-500/10 text-violet-400 border-violet-500/30' :
        order.status === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30' :
        order.status === 'STOPPED' ? 'bg-orange-500/10 text-orange-500 border-orange-500/30' :
        order.status === 'REJECTED' ? 'bg-red-500/10 text-red-500 border-red-500/30' :
        'bg-slate-500/10 text-slate-400 border-slate-500/30';

    const isPortfolio = order.allocationMode === 'PORTFOLIO';
    const openAllocs = isPortfolio ? (order.tradeAllocations || []).filter(a => !a.closedAt).length : 0;
    const closedAllocs = isPortfolio ? (order.tradeAllocations || []).filter(a => a.closedAt) : [];
    const wins = closedAllocs.filter(a => a.pnl > 0).length;
    const usedPct = isPortfolio && order.totalCapital > 0
        ? Math.min(100, Math.round((order.usedCapital || 0) / order.totalCapital * 100))
        : 0;

    return (
        <div className={`p-3 rounded-lg border ${isPortfolio ? (isDark ? 'bg-violet-500/[0.04] border-violet-500/20' : 'bg-violet-50/50 border-violet-200') : (isDark ? 'bg-[#10151c] border-white/5' : 'bg-slate-50 border-slate-200')}`}>
            <div className="flex justify-between items-center gap-3 mb-2">
                <span className={`text-sm font-black font-mono ${UI.textBold}`}>
                    {isPortfolio ? `💼 ${formatNumber(order.totalCapital)} đ` : `${formatNumber(order.capital)} đ`}
                </span>
                <div className="flex items-center gap-1.5">
                    {isPortfolio && (
                        <span className="px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-widest border bg-violet-500/10 text-violet-400 border-violet-500/30">PORTFOLIO</span>
                    )}
                    {order.executionMode === 'LIVE' && (
                        <span className="px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-widest border bg-red-500/10 text-red-500 border-red-500/30 animate-pulse">🔴 LIVE</span>
                    )}
                    <span className={`px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-widest border ${statusClass}`}>{order.status}</span>
                </div>
            </div>

            {/* ── PORTFOLIO: thanh sử dụng quỹ + thống kê ── */}
            {isPortfolio && (
                <div className="mb-2 flex flex-col gap-1.5">
                    <div className={`h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-white/5' : 'bg-slate-200'}`}>
                        <div className="h-full bg-violet-500 transition-all" style={{ width: `${usedPct}%` }} />
                    </div>
                    <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5">
                        <span className={`text-[10px] font-mono font-bold ${UI.textMuted}`}>
                            Đang dùng: {formatNumber(order.usedCapital || 0)}đ ({usedPct}%) · {openAllocs} lệnh mở
                        </span>
                        <span className={`text-[10px] font-mono font-black ${(order.realizedPnl || 0) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                            PnL: {(order.realizedPnl || 0) >= 0 ? '+' : ''}{formatNumber(order.realizedPnl || 0)}đ
                        </span>
                    </div>
                    {closedAllocs.length > 0 && (
                        <span className={`text-[9px] font-bold ${UI.textMuted}`}>
                            Đã đóng {closedAllocs.length} lệnh · Thắng {wins} ({Math.round(wins / closedAllocs.length * 100)}%) · {order.allocationPercent}%/lệnh · Max {order.maxConcurrentOrders} · Dynamic {order.dynamicSizing ? 'BẬT' : 'TẮT'}
                        </span>
                    )}
                </div>
            )}

            <div className="flex flex-wrap gap-2 mb-2">
                <span className={`text-[9px] font-black uppercase tracking-widest ${UI.textMuted}`}>Target +{order.targetPct}%</span>
                <span className={`text-[9px] font-black uppercase tracking-widest ${UI.textMuted}`}>SL -{order.stopLossPct}%</span>
                <span className={`text-[9px] font-black uppercase tracking-widest ${UI.textMuted}`}>{order.assetType}</span>
            </div>
            <p className={`text-[10px] font-medium leading-relaxed ${UI.textMuted}`}>{order.result?.message}</p>

            {/* ── Danh sách lệnh đã vào của gói portfolio ── */}
            {isPortfolio && (order.tradeAllocations || []).length > 0 && (
                <div className={`mt-2 pt-2 border-t ${isDark ? 'border-white/5' : 'border-slate-200'}`}>
                    <p className={`text-[9px] font-black uppercase tracking-widest mb-1.5 ${UI.textMuted}`}>
                        Lệnh đã vào ({(order.tradeAllocations || []).length})
                    </p>
                    <div className="flex flex-col gap-1 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                        {[...(order.tradeAllocations || [])].reverse().map((a, i) => {
                            const isClosed = !!a.closedAt;
                            return (
                                <div key={i} className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg text-[10px] ${isDark ? 'bg-black/20' : 'bg-slate-50'}`}>
                                    <div className="flex items-center gap-1.5 min-w-0">
                                        <span className={`font-black font-mono ${UI.textBold}`}>{a.symbol || '—'}</span>
                                        {a.executionMode === 'LIVE'
                                            ? <span className="px-1 py-0.5 rounded text-[8px] font-black bg-red-500/15 text-red-500">LIVE</span>
                                            : <span className="px-1 py-0.5 rounded text-[8px] font-black bg-amber-500/15 text-amber-500">SIM</span>}
                                        <span className={`font-mono ${UI.textMuted}`}>@{Number(a.entryPrice).toLocaleString('en-US', { maximumFractionDigits: 4 })}</span>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <span className={`font-mono font-bold ${UI.textNormal}`}>{(a.amount / 1e6).toFixed(2)}Tr</span>
                                        {isClosed ? (
                                            <span className={`font-mono font-black ${a.pnl >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                                {a.pnlPercent >= 0 ? '+' : ''}{Number(a.pnlPercent || 0).toFixed(2)}%
                                            </span>
                                        ) : (
                                            <span className="px-1.5 py-0.5 rounded text-[8px] font-black bg-cyan-500/15 text-cyan-500">ĐANG MỞ</span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ── Nút dừng gói portfolio đang chạy ── */}
            {isPortfolio && ['ACTIVE', 'PENDING'].includes(order.status) && onStop && (
                <button
                    onClick={() => onStop(order)}
                    className="mt-2 w-full py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border border-orange-500/40 text-orange-500 hover:bg-orange-500/10 transition-colors">
                    ⏹ Dừng gói (lệnh mở vẫn được giám sát đến khi đóng)
                </button>
            )}
        </div>
    );
}
// ════════════════════════════════════════════════════════════════
// MODAL HƯỚNG DẪN CƠ CHẾ VẬN HÀNH
// ════════════════════════════════════════════════════════════════
function MechanismGuideModal({ isDark, UI, onClose }) {
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
                        📖 Cơ chế vận hành AutoDuck
                    </h3>
                    <button onClick={onClose} className={`p-1.5 rounded-lg ${isDark ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`}>
                        <X size={18} className={UI.textMuted} />
                    </button>
                </div>

                <div className="p-5 space-y-3">
                    {/* 1. Hai nguồn vốn */}
                    <Section color="#a855f7" icon="💼" title="1. Hai nguồn vốn — không xung đột">
                        <p>Hệ thống có <b>2 ví riêng biệt, hai sổ kế toán độc lập</b>:</p>
                        <p>· <Tag color="#a855f7">Vốn 5 tỷ (trên cùng)</Tag> Là <b>ngân sách MÔ PHỎNG của engine</b>. Engine tự quét thị trường, tự mở lệnh ảo bằng quỹ này để <b>training AI</b>. Thanh "Đã giải ngân / Khả dụng" chỉ phản ánh ví này.</p>
                        <p>· <Tag color="#10b981">Vốn gói ủy thác</Tag> Là <b>khoản của riêng bạn</b>. Gói không tạo lệnh mới mà <b>bám vào tín hiệu engine đã tìm</b>, rồi tính lãi/lỗ riêng cho bạn = vốn × % của lệnh đó.</p>
                        <p className={UI.textMuted}>→ Khớp gói KHÔNG trừ vào 5 tỷ. Hai sổ chạy song song.</p>
                    </Section>

                    {/* 2. FIXED vs PORTFOLIO */}
                    <Section color="#10b981" icon="📊" title="2. Chế độ ủy thác vốn">
                        <p>· <Tag color="#10b981">Cố định / lệnh</Tag> Mỗi lệnh khớp dùng đúng số vốn bạn nhập. Gói hoàn tất sau <b>1 lệnh</b>.</p>
                        <p>· <Tag color="#a855f7">Portfolio</Tag> Bạn ủy thác <b>tổng quỹ</b>, bot tự tính position size từng lệnh theo độ mạnh tín hiệu &amp; rủi ro, chạy <b>liên tục nhiều lệnh</b>. Lãi/lỗ tự cộng dồn vào quỹ (compound).</p>
                        <p className={UI.textMuted}>Dynamic Sizing: tín hiệu mạnh (score cao) → vào lớn hơn; giới hạn để mỗi lệnh nếu hit SL chỉ mất ~1% tổng quỹ.</p>
                    </Section>

                    {/* 3. SIMULATED vs LIVE */}
                    <Section color="#06b6d4" icon="⚙️" title="3. Chế độ thực thi">
                        <p>· <Tag color="#06b6d4">Mô phỏng</Tag> Không gửi ra sàn. Engine theo dõi giá thật (Binance/Entrade), tính PnL <b>giấy</b> theo vốn bạn nhập. Dùng để test chiến lược + nuôi AI học.</p>
                        <p>· <Tag color="#ef4444">Live</Tag> Vốn ánh xạ sang <b>số dư USDT thật trên sàn</b>. Khi engine khớp tín hiệu, lệnh được gửi THỰC. Chỉ hỗ trợ CRYPTO, spot chỉ LONG/MUA.</p>
                        <p className={UI.textMuted}>Nếu live thất bại (sai symbol, thiếu số dư) → lệnh tự lùi về chạy mô phỏng, vẫn được theo dõi.</p>
                    </Section>

                    {/* 4. Engine BẬT/TẮT */}
                    <Section color="#f59e0b" icon="⏻" title="4. Công tắc Engine (Trạng thái BẬT/TẮT)">
                        <p>· <Tag color="#10b981">BẬT</Tag> Quét đầy đủ: lệnh mô phỏng (training nền) + lệnh LIVE.</p>
                        <p>· <Tag color="#64748b">TẮT</Tag> Dừng triển khai lệnh mô phỏng mới. Nhưng <b>các gói LIVE và vị thế thực trên sàn VẪN được quét, giám sát và đóng lệnh</b> bình thường — tiền thật không bao giờ bị bỏ rơi.</p>
                    </Section>

                    {/* 5. Chốt chặn vốn */}
                    <Section color="#ef4444" icon="🛡️" title="5. Chốt chặn an toàn (LIVE)">
                        <p>· Khi tạo gói LIVE, hệ thống <b>kiểm tra số dư USDT thật</b> của kết nối ngay lúc đăng ký.</p>
                        <p>· Tổng vốn các gói LIVE trên cùng 1 kết nối <b>không được vượt số dư</b>. Nếu đã ủy thác hết (ALL), gói LIVE tiếp theo trên kết nối đó sẽ bị <b>chặn ngay</b> kèm thông báo số dư còn trống.</p>
                        <p>· Tối đa <b>5 lệnh LIVE đang chờ</b> và <b>5 kết nối active</b> mỗi tài khoản.</p>
                    </Section>

                    {/* 6. Luồng tổng */}
                    <Section color="#8b5cf6" icon="🔄" title="6. Luồng tổng quát">
                        <p className="font-mono text-[11px]">Tạo gói → Engine quét tín hiệu → Khớp gói vào lệnh phù hợp → (LIVE: gửi sàn / SIM: theo dõi ảo) → Hit TP/SL → Đóng lệnh → Tính PnL → (Portfolio: hoàn vốn + compound vào quỹ).</p>
                        <p className={UI.textMuted}>Xem vị thế LIVE thực &amp; log lệnh sàn ở tab <b>Broker</b>. Lệnh mô phỏng xem ở <b>Nhật ký tín hiệu AI</b>.</p>
                    </Section>
                </div>

                <div className={`sticky bottom-0 px-5 py-3 border-t ${isDark ? 'bg-[#0B0F14] border-white/10' : 'bg-white border-slate-200'}`}>
                    <button onClick={onClose} className="w-full py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-600 text-white font-black text-sm transition-colors">
                        Đã hiểu
                    </button>
                </div>
            </div>
        </div>
    );
}