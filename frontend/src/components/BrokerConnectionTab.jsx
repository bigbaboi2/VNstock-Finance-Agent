import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Plus, Plug, RefreshCw, Loader2, Link2, Flame, History, ShieldCheck } from 'lucide-react';
import ConnectExchangeForm from './broker/ConnectExchangeForm';
import ConnectionCard from './broker/ConnectionCard';
import BrokerDashboard from './broker/BrokerDashboard';
import ExchangeOrderLog from './broker/ExchangeOrderLog';
import LivePositionsPanel from './broker/LivePositionsPanel';
import UltraStack from './UltraStack';

/**
 * TAB 7 — TRUNG TÂM GIAO DỊCH LIVE / BROKER
 * Bố cục theo LUỒNG 3 BƯỚC:
 *   ① Kết nối sàn  →  ② Theo dõi vị thế LIVE  →  ③ Lịch sử lệnh thực
 * Cascade fetch (giống tab 6): lite trước → UI hiện sớm → equity/PnL enrich sau.
 */

function StepHeader({ step, color, icon: Icon, title, desc, UI, right }) {
    return (
        <div className="flex items-center justify-between gap-3 mb-3">
            <div className={`flex items-center gap-3 pl-1 border-l-4`} style={{ borderColor: color }}>
                <div className="ml-2 flex items-center gap-2">
                    <span
                        className="flex items-center justify-center w-6 h-6 rounded-lg text-[11px] font-black text-white shrink-0"
                        style={{ backgroundColor: color }}
                    >
                        {step}
                    </span>
                    <Icon size={16} style={{ color }} />
                    <div className="flex flex-col">
                        <span className={`text-xs font-black uppercase tracking-widest ${UI.textBold}`}>{title}</span>
                        {desc && <span className={`text-[10px] font-bold ${UI.textMuted}`}>{desc}</span>}
                    </div>
                </div>
            </div>
            {right}
        </div>
    );
}

export default function BrokerConnectionTab({ username, isDark, UI, uiStyle = 'classic' }) {
    const [connections, setConnections] = useState([]);
    const [orders, setOrders] = useState([]);
    const [orderStats, setOrderStats] = useState(null);
    const [walletSummary, setWalletSummary] = useState(null);
    const [liveTrades, setLiveTrades] = useState([]);
    const [showAddForm, setShowAddForm] = useState(false);
    const [connectionsLoading, setConnectionsLoading] = useState(true);
    const [positionsLoading, setPositionsLoading] = useState(true);
    const [ordersLoading, setOrdersLoading] = useState(true);
    const [enriching, setEnriching] = useState(false);
    const [ultraOpenId, setUltraOpenId] = useState(null);
    const fetchSeqRef = useRef(0);
    const initialDoneRef = useRef(false);
    const isUltra = uiStyle === 'ultra';
    const loading = connectionsLoading;

    const fetchAll = useCallback(async () => {
        if (!username) return;
        const seq = ++fetchSeqRef.current;

        try {
            // Tầng 1 — kết nối lite (không gọi Binance equity) → hiện card sớm
            const connLite = await axios.get(`/api/exchange-connections/${username}`, {
                params: { lite: 1 },
            }).catch(() => ({ data: { success: false } }));
            if (seq !== fetchSeqRef.current) return;
            if (connLite.data.success) {
                setConnections(connLite.data.data || []);
            }
            setConnectionsLoading(false);

            // Tầng 2 — vị thế LIVE + lệnh lite song song
            const [liveRes, orderLite] = await Promise.all([
                axios.get('/api/auto-trade/open-live').catch(() => ({ data: { success: false } })),
                axios.get(`/api/exchange-connections/orders/${username}`, {
                    params: { lite: 1 },
                }).catch(() => ({ data: { success: false } })),
            ]);
            if (seq !== fetchSeqRef.current) return;
            if (liveRes.data.success) setLiveTrades(liveRes.data.data || []);
            setPositionsLoading(false);
            if (orderLite.data.success) {
                setOrders(orderLite.data.data || []);
                setOrderStats(orderLite.data.stats || null);
            }
            setOrdersLoading(false);
            initialDoneRef.current = true;

            // Tầng 3 — equity ví + PnL lệnh đầy đủ (chậm) — không chặn UI
            setEnriching(true);
            const [connFull, orderFull] = await Promise.all([
                axios.get(`/api/exchange-connections/${username}`).catch(() => ({ data: { success: false } })),
                axios.get(`/api/exchange-connections/orders/${username}`).catch(() => ({ data: { success: false } })),
            ]);
            if (seq !== fetchSeqRef.current) return;
            if (connFull.data.success) {
                setConnections(connFull.data.data || []);
                if (connFull.data.walletSummary) setWalletSummary(connFull.data.walletSummary);
            }
            if (orderFull.data.success) {
                setOrders(orderFull.data.data || []);
                setOrderStats(orderFull.data.stats || null);
            }
        } catch {
            if (seq !== fetchSeqRef.current) return;
            if (!initialDoneRef.current) {
                setConnectionsLoading(false);
                setPositionsLoading(false);
                setOrdersLoading(false);
            }
        } finally {
            if (seq === fetchSeqRef.current) setEnriching(false);
        }
    }, [username]);

    useEffect(() => {
        initialDoneRef.current = false;
        setConnectionsLoading(true);
        setPositionsLoading(true);
        setOrdersLoading(true);
        fetchAll();
        const interval = setInterval(fetchAll, 30_000);
        return () => clearInterval(interval);
    }, [fetchAll]);

    const activeCount = connections.filter(c => c.isActive).length;

    const dashboardProps = {
        connections,
        orderStats,
        orders,
        walletSummary,
        username,
        isDark,
        UI,
        onChanged: fetchAll,
        enriching,
    };

    if (isUltra) {
        const ultraSections = [
            {
                id: 'dashboard',
                title: 'Tổng quan ví & lệnh',
                icon: Plug,
                summary: enriching
                    ? `${activeCount} kết nối · đang làm giàu…`
                    : `${activeCount} kết nối · ${orderStats?.totalOrders || 0} lệnh`,
                render: () => (
                    <div className="space-y-3">
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={fetchAll}
                                className={`flex-1 px-3 py-2.5 rounded-xl border text-xs font-black flex items-center justify-center gap-2 ${UI.cardHover} ${UI.textNormal}`}
                            >
                                <RefreshCw size={14} className={enriching ? 'animate-spin' : ''} /> Làm mới
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowAddForm(v => !v)}
                                className="flex-1 px-3 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-black flex items-center justify-center gap-2"
                            >
                                <Plus size={14} /> Thêm kết nối
                            </button>
                        </div>
                        <BrokerDashboard {...dashboardProps} />
                    </div>
                ),
            },
            {
                id: 'connections',
                title: 'Kết nối sàn',
                icon: Link2,
                summary: loading ? 'Đang tải…' : `${connections.length} sàn`,
                render: () => (
                    <div className="space-y-3">
                        {showAddForm && (
                            <ConnectExchangeForm
                                username={username}
                                isDark={isDark}
                                UI={UI}
                                onClose={() => setShowAddForm(false)}
                                onCreated={() => { setShowAddForm(false); fetchAll(); }}
                            />
                        )}
                        {loading ? (
                            <div className={`flex items-center justify-center p-10 ${UI.textMuted}`}>
                                <Loader2 size={20} className="animate-spin" />
                            </div>
                        ) : connections.length === 0 ? (
                            <div className={`rounded-2xl border border-dashed p-8 text-center ${UI.border}`}>
                                <Plug size={28} className={`mx-auto mb-2 ${UI.textMuted}`} />
                                <p className={`text-sm font-black ${UI.textNormal}`}>Chưa có kết nối sàn nào</p>
                                <button
                                    type="button"
                                    onClick={() => setShowAddForm(true)}
                                    className="mt-3 px-4 py-2 rounded-xl bg-emerald-500 text-white text-xs font-black"
                                >
                                    Thêm kết nối mới
                                </button>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-3">
                                {connections.map(conn => (
                                    <ConnectionCard
                                        key={conn._id}
                                        conn={conn}
                                        username={username}
                                        isDark={isDark}
                                        UI={UI}
                                        onChanged={fetchAll}
                                        managedBases={liveTrades.map(t => String(t.symbol || '').replace(/USDT$/i, '').toUpperCase()).filter(Boolean)}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                ),
            },
            {
                id: 'positions',
                title: 'Vị thế LIVE',
                icon: Flame,
                summary: positionsLoading ? 'Đang tải…' : `${liveTrades.length} vị thế`,
                render: () => (
                    positionsLoading ? (
                        <div className={`flex items-center justify-center p-8 ${UI.textMuted}`}>
                            <Loader2 size={18} className="animate-spin" />
                        </div>
                    ) : (
                        <LivePositionsPanel liveTrades={liveTrades} isDark={isDark} UI={UI} />
                    )
                ),
            },
            {
                id: 'orders',
                title: 'Lịch sử lệnh thực',
                icon: History,
                summary: ordersLoading
                    ? 'Đang tải…'
                    : orderStats
                        ? `${orderStats.filledOrders || 0} khớp`
                        : 'Đóng',
                render: () => (
                    ordersLoading ? (
                        <div className={`flex items-center justify-center p-8 ${UI.textMuted}`}>
                            <Loader2 size={18} className="animate-spin" />
                        </div>
                    ) : (
                        <ExchangeOrderLog orders={orders} isDark={isDark} UI={UI} />
                    )
                ),
            },
            {
                id: 'safety',
                title: 'Lưu ý bảo mật',
                icon: ShieldCheck,
                summary: 'AES-256 · Testnet',
                render: () => (
                    <div className={`rounded-2xl border p-4 text-[11px] font-semibold leading-relaxed flex gap-3 ${isDark ? 'bg-yellow-500/5 border-yellow-500/20' : 'bg-yellow-50 border-yellow-200'} ${UI.textMuted}`}>
                        <ShieldCheck size={18} className="text-yellow-500 shrink-0 mt-0.5" />
                        <div>
                            <p className="text-yellow-500 font-black mb-1">Lưu ý bảo mật & an toàn</p>
                            <p>· API key/secret được mã hóa AES-256-GCM trước khi lưu.</p>
                            <p>· Tuyệt đối KHÔNG cấp quyền Rút tiền (Withdraw) cho key dùng ở đây.</p>
                            <p>· LIVE: tạo gói lệnh ở tab AutoDuck và chọn kết nối sàn. Spot chỉ LONG/MUA.</p>
                            <p>· Mặc định Testnet — kiểm chứng trước khi chuyển Live.</p>
                        </div>
                    </div>
                ),
            },
        ];

        return (
            <div className={`flex flex-col w-full h-full min-h-0 overflow-hidden ${isDark ? 'bg-[#06080B]' : 'bg-[#F8FAFC]'}`}>
                <div className={`shrink-0 px-4 py-2.5 border-b ${isDark ? 'border-white/10 bg-[#0B0F14]' : 'border-slate-200 bg-white'}`}>
                    <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Siêu tối giản · Broker</p>
                    <p className={`text-sm font-bold ${UI.textBold}`}>Chạm từng mục để mở · chỉ render khi cần</p>
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
        <div className="flex flex-col gap-6 p-4 lg:p-6 max-w-[1400px] mx-auto w-full h-full overflow-y-auto">
            <div className={`shrink-0 rounded-2xl border overflow-hidden ${isDark ? 'bg-[#080c14] border-emerald-500/20' : 'bg-white border-emerald-300 shadow-sm'}`}>
                <div className="h-0.5 w-full bg-emerald-500" />
                <div className="px-5 py-4 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <Plug className="text-emerald-400" size={22} />
                        <div>
                            <h2 className={`text-lg font-black uppercase tracking-widest ${UI.textBold}`}>
                                Trung tâm giao dịch LIVE — Broker
                            </h2>
                            <p className={`text-[11px] font-bold ${UI.textMuted}`}>
                                Ví sàn (equity/MTM) tách biệt sổ lệnh AutoDuck · CK VN cập nhật sau
                                {enriching ? ' · đang cập nhật equity/PnL…' : ''}
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={fetchAll}
                            className={`px-3 py-2.5 rounded-xl border text-xs font-black flex items-center gap-2 transition-colors ${UI.cardHover} ${UI.textNormal}`}>
                            <RefreshCw size={14} className={enriching ? 'animate-spin' : ''} /> Làm mới
                        </button>
                        <button onClick={() => setShowAddForm(v => !v)}
                            className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-black flex items-center gap-2 transition-colors shadow-lg shadow-emerald-500/20">
                            <Plus size={14} /> Thêm kết nối mới
                        </button>
                    </div>
                </div>
                <div className="px-5 pb-5">
                    <BrokerDashboard {...dashboardProps} />
                </div>
            </div>

            <section>
                <StepHeader
                    step="1" color="#10b981" icon={Link2} UI={UI}
                    title="Kết nối sàn giao dịch"
                    desc={`Binance / OKX / Bybit · ${activeCount}/5 kết nối đang bật`}
                />

                {showAddForm && (
                    <div className="mb-3">
                        <ConnectExchangeForm
                            username={username}
                            isDark={isDark}
                            UI={UI}
                            onClose={() => setShowAddForm(false)}
                            onCreated={() => { setShowAddForm(false); fetchAll(); }}
                        />
                    </div>
                )}

                {loading ? (
                    <div className={`flex items-center justify-center p-10 ${UI.textMuted}`}>
                        <Loader2 size={20} className="animate-spin" />
                    </div>
                ) : connections.length === 0 ? (
                    <div className={`rounded-2xl border border-dashed p-8 text-center ${UI.border}`}>
                        <Plug size={28} className={`mx-auto mb-2 ${UI.textMuted}`} />
                        <p className={`text-sm font-black ${UI.textNormal}`}>Chưa có kết nối sàn nào</p>
                        <p className={`text-xs mt-1 ${UI.textMuted}`}>
                            Bấm "Thêm kết nối mới" để liên kết tài khoản Binance/OKX/Bybit.
                            Khuyến nghị bắt đầu với <b className="text-emerald-400">Testnet</b> để kiểm chứng hệ thống trước khi dùng tiền thật.
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                        {connections.map(conn => (
                            <ConnectionCard
                                key={conn._id}
                                conn={conn}
                                username={username}
                                isDark={isDark}
                                UI={UI}
                                onChanged={fetchAll}
                                managedBases={liveTrades.map(t => String(t.symbol || '').replace(/USDT$/i, '').toUpperCase()).filter(Boolean)}
                            />
                        ))}
                    </div>
                )}
            </section>

            <section>
                <StepHeader
                    step="2" color="#ef4444" icon={Flame} UI={UI}
                    title="Vị thế LIVE đang mở"
                    desc={positionsLoading
                        ? 'Đang tải vị thế…'
                        : `${liveTrades.length} vị thế thực do AutoDuck Engine quản lý · TP/SL tự động`}
                />
                {positionsLoading ? (
                    <div className={`flex items-center justify-center p-8 ${UI.textMuted}`}>
                        <Loader2 size={18} className="animate-spin" />
                    </div>
                ) : (
                    <LivePositionsPanel liveTrades={liveTrades} isDark={isDark} UI={UI} />
                )}
            </section>

            <section>
                <StepHeader
                    step="3" color="#06b6d4" icon={History} UI={UI}
                    title="Lịch sử lệnh thực gửi ra sàn"
                    desc={ordersLoading
                        ? 'Đang tải lịch sử…'
                        : `${orderStats?.totalOrders || 0} lệnh · ${orderStats?.filledOrders || 0} khớp · ${orderStats?.failedOrders || 0} lỗi`}
                />
                {ordersLoading ? (
                    <div className={`flex items-center justify-center p-8 ${UI.textMuted}`}>
                        <Loader2 size={18} className="animate-spin" />
                    </div>
                ) : (
                    <ExchangeOrderLog orders={orders} isDark={isDark} UI={UI} />
                )}
            </section>

            <div className={`rounded-2xl border p-4 text-[11px] font-semibold leading-relaxed flex gap-3 ${isDark ? 'bg-yellow-500/5 border-yellow-500/20' : 'bg-yellow-50 border-yellow-200'} ${UI.textMuted}`}>
                <ShieldCheck size={18} className="text-yellow-500 shrink-0 mt-0.5" />
                <div>
                    <p className="text-yellow-500 font-black mb-1">Lưu ý bảo mật & an toàn</p>
                    <p>· API key/secret được mã hóa AES-256-GCM trước khi lưu — không bao giờ hiển thị lại bản gốc.</p>
                    <p>· Tuyệt đối KHÔNG cấp quyền Rút tiền (Withdraw) cho key dùng ở đây.</p>
                    <p>· Để dùng chế độ LIVE: tạo gói lệnh ở tab "Tự động vào lệnh AI" và chọn "Live" kèm kết nối sàn. Spot chỉ hỗ trợ lệnh LONG/MUA.</p>
                    <p>· Mặc định Testnet — hãy kiểm chứng end-to-end trên Testnet trước khi chuyển sang môi trường Live.</p>
                </div>
            </div>
        </div>
    );
}
