import React, { useMemo, useState } from 'react';
import axios from 'axios';
import { Wallet, Activity, TrendingUp, Plug, Landmark, RotateCcw, Loader2, Briefcase } from 'lucide-react';

const MAX_CONNECTIONS = 5;

const fmtUsd = (n, digits = 2) =>
    `$${(Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: 0 })}`;

const fmtSignedUsd = (n) => {
    const v = Number(n) || 0;
    return `${v >= 0 ? '+' : ''}${fmtUsd(v)}`;
};

const timeAgoShort = (date) => {
    if (!date) return null;
    const diffMin = Math.round((Date.now() - new Date(date).getTime()) / 60000);
    if (diffMin < 1) return 'vừa xong';
    if (diffMin < 60) return `${diffMin} phút trước`;
    const diffH = Math.round(diffMin / 60);
    if (diffH < 24) return `${diffH} giờ trước`;
    return `${Math.round(diffH / 24)} ngày trước`;
};

function MetricCard({ icon: Icon, label, value, sub, color, UI, footer }) {
    return (
        <div className={`rounded-2xl border p-4 flex flex-col ${UI.card}`}>
            <div className="flex items-center gap-2 mb-2">
                <Icon size={14} className={color} />
                <p className={`text-[10px] uppercase tracking-widest font-black ${UI.textMuted}`}>{label}</p>
            </div>
            <p className={`text-xl font-black font-mono ${color}`}>{value}</p>
            {sub && <p className={`text-[10px] mt-1 ${UI.textMuted}`}>{sub}</p>}
            {footer}
        </div>
    );
}

export default function BrokerDashboard({
    connections,
    orderStats,
    orders,
    walletSummary,
    username,
    isDark,
    UI,
    onChanged,
}) {
    const [resetBusy, setResetBusy] = useState(false);

    const metrics = useMemo(() => {
        const activeConns = connections.filter(c => c.isActive);

        // Fallback stable-only nếu API chưa trả walletSummary
        let totalUSDT = 0;
        for (const conn of activeConns) {
            const snap = conn.balanceSnapshot || {};
            for (const [asset, amount] of Object.entries(snap)) {
                if (['USDT', 'USDC', 'BUSD', 'FDUSD', 'DAI'].includes(asset)) totalUSDT += Number(amount) || 0;
            }
        }

        const filledByTrade = new Map();
        for (const o of orders || []) {
            if (o.status !== 'FILLED' || !o.autoTradeId) continue;
            const group = filledByTrade.get(String(o.autoTradeId)) || { entry: 0, exit: 0 };
            const value = (o.filledPrice || 0) * (o.filledQuantity || 0);
            if (o.purpose === 'ENTRY') group.entry += value;
            if (o.purpose === 'EXIT') group.exit += value;
            filledByTrade.set(String(o.autoTradeId), group);
        }
        let realizedPnlFallback = 0;
        for (const g of filledByTrade.values()) {
            if (g.entry > 0 && g.exit > 0) realizedPnlFallback += g.exit - g.entry;
        }

        // Ưu tiên stats từ backend (fill − fee, direction-aware)
        const realizedPnl = orderStats?.liveRealizedPnlUSDT != null
            ? Number(orderStats.liveRealizedPnlUSDT)
            : realizedPnlFallback;
        const realizedPnlVnd = orderStats?.liveRealizedPnlVND != null
            ? Number(orderStats.liveRealizedPnlVND)
            : null;
        const eligibleTrades = orderStats?.liveEligibleTrades ?? null;
        const currentPkgPnl = orderStats?.liveCurrentPackagePnlUSDT != null
            ? Number(orderStats.liveCurrentPackagePnlUSDT)
            : null;
        const currentPkgPnlVnd = orderStats?.liveCurrentPackagePnlVND != null
            ? Number(orderStats.liveCurrentPackagePnlVND)
            : null;
        const currentPkgTrades = orderStats?.liveCurrentPackageTrades ?? null;
        const currentPkgCount = orderStats?.liveCurrentPackageCount ?? 0;

        const equity = walletSummary?.equityUSDT ?? totalUSDT;
        const stable = walletSummary?.stableUSDT ?? totalUSDT;
        const alts = walletSummary?.altsUSDT ?? 0;
        const walletPnl = walletSummary?.pnlVsBaselineUSDT;
        const baseline = walletSummary?.baselineUSDT;
        const unpriced = walletSummary?.unpricedCount || 0;
        const usdVnd = walletSummary?.usdVndRate;

        return {
            equity,
            stable,
            alts,
            walletPnl,
            baseline,
            unpriced,
            usdVnd,
            liveOrders: orderStats?.filledOrders ?? 0,
            pendingOrders: orderStats?.pendingOrders ?? 0,
            failedOrders: orderStats?.failedOrders ?? 0,
            realizedPnl,
            realizedPnlVnd,
            eligibleTrades,
            currentPkgPnl,
            currentPkgPnlVnd,
            currentPkgTrades,
            currentPkgCount,
            activeCount: activeConns.length,
        };
    }, [connections, orderStats, orders, walletSummary]);

    const handleResetAllBaselines = async () => {
        const active = connections.filter(c => c.isActive);
        if (active.length === 0) return;
        if (!window.confirm(
            `Đặt lại mốc ví cho ${active.length} kết nối active?\nPnL ví sẽ về ~$0 so với equity hiện tại (không ảnh hưởng PnL lệnh AutoDuck).`
        )) return;

        setResetBusy(true);
        try {
            await Promise.all(
                active.map(c =>
                    axios.post(`/api/exchange-connections/${c._id}/reset-equity-baseline`, { username })
                )
            );
            onChanged?.();
        } catch (err) {
            window.alert(err.response?.data?.message || 'Không đặt lại được mốc ví.');
        } finally {
            setResetBusy(false);
        }
    };

    const earliestBaseline = useMemo(() => {
        const dates = connections
            .filter(c => c.isActive && c.equityBaselineAt)
            .map(c => new Date(c.equityBaselineAt).getTime());
        if (!dates.length) return null;
        return new Date(Math.min(...dates));
    }, [connections]);

    const walletPnlColor = metrics.walletPnl == null
        ? UI.textMuted
        : metrics.walletPnl >= 0 ? 'text-emerald-400' : 'text-red-400';
    const botPnlColor = metrics.realizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400';
    const currentPkgPnlColor = metrics.currentPkgPnl == null
        ? UI.textMuted
        : metrics.currentPkgPnl >= 0 ? 'text-emerald-400' : 'text-red-400';

    return (
        <div className="flex flex-col gap-3">
            {/* Legend */}
            <div className="flex flex-wrap items-center gap-2">
                <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-md border ${
                    isDark ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-400' : 'border-cyan-300 bg-cyan-50 text-cyan-700'
                }`}>
                    Ví sàn
                </span>
                <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-md border ${
                    isDark ? 'border-violet-500/30 bg-violet-500/10 text-violet-400' : 'border-violet-300 bg-violet-50 text-violet-700'
                }`}>
                    Sổ bot AutoDuck
                </span>
                {metrics.usdVnd != null && (
                    <span className={`text-[10px] font-bold ${UI.textMuted}`}>
                        Tỷ giá VCB: {Number(metrics.usdVnd).toLocaleString('vi-VN')} đ/USD
                    </span>
                )}
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                <MetricCard
                    UI={UI}
                    icon={Wallet}
                    label="Equity ví (ước tính)"
                    value={`~${fmtUsd(metrics.equity)}`}
                    sub={`Stable ${fmtUsd(metrics.stable)} · Coin khác ~${fmtUsd(metrics.alts)}${
                        metrics.unpriced > 0 ? ` · ${metrics.unpriced} asset chưa quy giá` : ''
                    }`}
                    color="text-cyan-400"
                />
                <MetricCard
                    UI={UI}
                    icon={Landmark}
                    label="PnL ví vs mốc"
                    value={metrics.walletPnl == null ? '—' : fmtSignedUsd(metrics.walletPnl)}
                    sub={
                        metrics.baseline == null
                            ? 'Chưa có mốc — bấm Test/Balance để ghi lần đầu'
                            : `Mốc ${fmtUsd(metrics.baseline)}${earliestBaseline ? ` · ${timeAgoShort(earliestBaseline)}` : ''} · gồm coin ngoài bot`
                    }
                    color={walletPnlColor}
                    footer={
                        <button
                            type="button"
                            onClick={handleResetAllBaselines}
                            disabled={resetBusy || metrics.activeCount === 0}
                            className={`mt-2 self-start inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wide px-2 py-1 rounded-md border transition-colors disabled:opacity-40 ${
                                isDark
                                    ? 'border-white/10 text-slate-400 hover:bg-white/5 hover:text-white'
                                    : 'border-slate-200 text-slate-500 hover:bg-slate-100'
                            }`}
                        >
                            {resetBusy ? <Loader2 size={10} className="animate-spin" /> : <RotateCcw size={10} />}
                            Đặt lại mốc ví
                        </button>
                    }
                />
                <MetricCard
                    UI={UI}
                    icon={TrendingUp}
                    label="PnL Autoduck Tổng (từ đầu)"
                    value={fmtSignedUsd(metrics.realizedPnl)}
                    sub={
                        metrics.realizedPnlVnd != null
                            ? `Mọi lệnh LIVE đã đóng · ${metrics.eligibleTrades ?? '—'} lệnh · ≈${Number(metrics.realizedPnlVnd).toLocaleString('vi-VN')}đ · kể cả gói đã xóa`
                            : 'Fill − phí · mọi lệnh LIVE từ lúc khởi tạo'
                    }
                    color={botPnlColor}
                />
                <MetricCard
                    UI={UI}
                    icon={Briefcase}
                    label="PnL gói hiện tại"
                    value={metrics.currentPkgPnl == null ? '—' : fmtSignedUsd(metrics.currentPkgPnl)}
                    sub={
                        metrics.currentPkgCount === 0
                            ? 'Không còn gói LIVE trên Tab 6'
                            : metrics.currentPkgPnlVnd != null
                                ? `${metrics.currentPkgCount} gói · ${metrics.currentPkgTrades ?? 0} lệnh đóng · ≈${Number(metrics.currentPkgPnlVnd).toLocaleString('vi-VN')}đ`
                                : `${metrics.currentPkgCount} gói LIVE còn trong danh sách`
                    }
                    color={currentPkgPnlColor}
                />
                <MetricCard
                    UI={UI}
                    icon={Activity}
                    label="Lệnh live đã khớp"
                    value={`${metrics.liveOrders} lệnh`}
                    sub={`${metrics.pendingOrders} đang chờ · ${metrics.failedOrders} lỗi`}
                    color="text-cyan-400"
                />
                <MetricCard
                    UI={UI}
                    icon={Wallet}
                    label="Stablecoin (cash)"
                    value={`~${fmtUsd(metrics.stable)}`}
                    sub="USDT/USDC… trong snapshot — phần sẵn sàng vào lệnh"
                    color="text-emerald-400"
                />
                <MetricCard
                    UI={UI}
                    icon={Plug}
                    label="Kết nối Active"
                    value={`${metrics.activeCount}/${MAX_CONNECTIONS}`}
                    sub="Giới hạn mỗi tài khoản"
                    color="text-yellow-400"
                />
            </div>
        </div>
    );
}
