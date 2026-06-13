import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { Plus, Plug, RefreshCw, Loader2, Link2, Flame, History, ShieldCheck } from 'lucide-react';
import ConnectExchangeForm from './broker/ConnectExchangeForm';
import ConnectionCard from './broker/ConnectionCard';
import BrokerDashboard from './broker/BrokerDashboard';
import ExchangeOrderLog from './broker/ExchangeOrderLog';
import LivePositionsPanel from './broker/LivePositionsPanel';

/**
 * TAB 7 — TRUNG TÂM GIAO DỊCH LIVE / BROKER
 * Bố cục theo LUỒNG 3 BƯỚC để dễ theo dõi:
 *   ① Kết nối sàn  →  ② Theo dõi vị thế LIVE  →  ③ Lịch sử lệnh thực
 * Giai đoạn 1: Crypto. Giai đoạn 2: Chứng khoán VN (update sau).
 */

// Thanh tiêu đề mục có accent bar + số bước — đồng bộ style "phân luồng" với các tab khác
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

export default function BrokerConnectionTab({ username, isDark, UI }) {
    const [connections, setConnections] = useState([]);
    const [orders, setOrders] = useState([]);
    const [orderStats, setOrderStats] = useState(null);
    const [liveTrades, setLiveTrades] = useState([]);
    const [showAddForm, setShowAddForm] = useState(false);
    const [loading, setLoading] = useState(true);

    const fetchAll = useCallback(async () => {
        if (!username) return;
        try {
            const [connRes, orderRes, logsRes] = await Promise.all([
                axios.get(`/api/exchange-connections/${username}`).catch(() => ({ data: { success: false } })),
                axios.get(`/api/exchange-connections/orders/${username}`).catch(() => ({ data: { success: false } })),
                axios.get('/api/auto-trade/logs').catch(() => ({ data: { success: false } })),
            ]);
            if (logsRes.data.success) {
                setLiveTrades(
                    (logsRes.data.data || []).filter(
                        t => t.executionMode === 'LIVE' && ['OPEN', 'PENDING'].includes(t.status)
                    )
                );
            }
            // Chỉ ghi đè danh sách khi fetch THÀNH CÔNG → tránh xoá trắng card đã hiển thị
            // khi một chu kỳ refresh bị lỗi (vd: 429). Lỗi tạm thời sẽ giữ nguyên dữ liệu cũ.
            if (connRes.data.success) setConnections(connRes.data.data || []);
            if (orderRes.data.success) {
                setOrders(orderRes.data.data || []);
                setOrderStats(orderRes.data.stats || null);
            }
        } finally {
            setLoading(false);
        }
    }, [username]);

    useEffect(() => {
        fetchAll();
        const interval = setInterval(fetchAll, 30_000); // refresh log lệnh mỗi 30s
        return () => clearInterval(interval);
    }, [fetchAll]);

    const activeCount = connections.filter(c => c.isActive).length;

    return (
        <div className="flex flex-col gap-6 p-4 lg:p-6 max-w-[1400px] mx-auto w-full h-full overflow-y-auto">
            {/* ═══════════ HEADER + DASHBOARD ═══════════ */}
            {/* shrink-0: bắt buộc — khối này có overflow-hidden nên trong flex-col có
                chiều cao cố định (h-full root) sẽ bị flex bóp về ~0px nếu không khoá. */}
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
                                Quản lý lệnh THỰC trên sàn · Mô phỏng chỉ là training AI nền (xem tab AutoDuck) · CK VN cập nhật sau
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={fetchAll}
                            className={`px-3 py-2.5 rounded-xl border text-xs font-black flex items-center gap-2 transition-colors ${UI.cardHover} ${UI.textNormal}`}>
                            <RefreshCw size={14} /> Làm mới
                        </button>
                        <button onClick={() => setShowAddForm(v => !v)}
                            className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-black flex items-center gap-2 transition-colors shadow-lg shadow-emerald-500/20">
                            <Plus size={14} /> Thêm kết nối mới
                        </button>
                    </div>
                </div>
                <div className="px-5 pb-5">
                    <BrokerDashboard
                        connections={connections}
                        orderStats={orderStats}
                        orders={orders}
                        isDark={isDark}
                        UI={UI}
                    />
                </div>
            </div>

            {/* ═══════════ BƯỚC ① KẾT NỐI SÀN ═══════════ */}
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
                            />
                        ))}
                    </div>
                )}
            </section>

            {/* ═══════════ BƯỚC ② VỊ THẾ LIVE ═══════════ */}
            <section>
                <StepHeader
                    step="2" color="#ef4444" icon={Flame} UI={UI}
                    title="Vị thế LIVE đang mở"
                    desc={`${liveTrades.length} vị thế thực do AutoDuck Engine quản lý · TP/SL tự động`}
                />
                <LivePositionsPanel liveTrades={liveTrades} isDark={isDark} UI={UI} />
            </section>

            {/* ═══════════ BƯỚC ③ LỊCH SỬ LỆNH ═══════════ */}
            <section>
                <StepHeader
                    step="3" color="#06b6d4" icon={History} UI={UI}
                    title="Lịch sử lệnh thực gửi ra sàn"
                    desc={`${orderStats?.totalOrders || 0} lệnh · ${orderStats?.filledOrders || 0} khớp · ${orderStats?.failedOrders || 0} lỗi`}
                />
                <ExchangeOrderLog orders={orders} isDark={isDark} UI={UI} />
            </section>

            {/* ═══════════ GHI CHÚ AN TOÀN ═══════════ */}
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