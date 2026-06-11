import React, { useMemo } from 'react';
import { Wallet, Activity, TrendingUp, Plug } from 'lucide-react';

const MAX_CONNECTIONS = 5;

export default function BrokerDashboard({ connections, orderStats, orders, isDark, UI }) {
    const metrics = useMemo(() => {
        const activeConns = connections.filter(c => c.isActive);

        // Tổng balance ước tính (USDT + stablecoin tương đương, từ snapshot)
        let totalUSDT = 0;
        for (const conn of activeConns) {
            const snap = conn.balanceSnapshot || {};
            for (const [asset, amount] of Object.entries(snap)) {
                if (['USDT', 'USDC', 'BUSD', 'FDUSD', 'DAI'].includes(asset)) totalUSDT += Number(amount) || 0;
            }
        }

        // PnL thực ước tính: ghép cặp ENTRY/EXIT đã FILLED theo autoTradeId
        const filledByTrade = new Map();
        for (const o of orders || []) {
            if (o.status !== 'FILLED' || !o.autoTradeId) continue;
            const group = filledByTrade.get(String(o.autoTradeId)) || { entry: 0, exit: 0 };
            const value = (o.filledPrice || 0) * (o.filledQuantity || 0);
            if (o.purpose === 'ENTRY') group.entry += value;
            if (o.purpose === 'EXIT') group.exit += value;
            filledByTrade.set(String(o.autoTradeId), group);
        }
        let realizedPnl = 0;
        for (const g of filledByTrade.values()) {
            if (g.entry > 0 && g.exit > 0) realizedPnl += g.exit - g.entry;
        }

        return {
            totalUSDT,
            liveOrders: orderStats?.filledOrders ?? 0,
            pendingOrders: orderStats?.pendingOrders ?? 0,
            failedOrders: orderStats?.failedOrders ?? 0,
            realizedPnl,
            activeCount: activeConns.length,
        };
    }, [connections, orderStats, orders]);

    const cards = [
        {
            icon: Wallet, label: 'Tổng Balance (ước tính)',
            value: `~$${metrics.totalUSDT.toLocaleString('en-US', { maximumFractionDigits: 2 })}`,
            sub: 'Stablecoin từ snapshot các kết nối active',
            color: 'text-emerald-400',
        },
        {
            icon: Activity, label: 'Lệnh live đã khớp',
            value: `${metrics.liveOrders} lệnh`,
            sub: `${metrics.pendingOrders} đang chờ · ${metrics.failedOrders} lỗi`,
            color: 'text-cyan-400',
        },
        {
            icon: TrendingUp, label: 'PnL thực (đã ghép cặp)',
            value: `${metrics.realizedPnl >= 0 ? '+' : ''}$${metrics.realizedPnl.toLocaleString('en-US', { maximumFractionDigits: 2 })}`,
            sub: 'Từ các cặp Entry/Exit đã khớp',
            color: metrics.realizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400',
        },
        {
            icon: Plug, label: 'Kết nối Active',
            value: `${metrics.activeCount}/${MAX_CONNECTIONS}`,
            sub: 'Giới hạn mỗi tài khoản',
            color: 'text-yellow-400',
        },
    ];

    return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {cards.map((card, i) => (
                <div key={i} className={`rounded-2xl border p-4 ${UI.card}`}>
                    <div className="flex items-center gap-2 mb-2">
                        <card.icon size={14} className={card.color} />
                        <p className={`text-[10px] uppercase tracking-widest font-black ${UI.textMuted}`}>{card.label}</p>
                    </div>
                    <p className={`text-xl font-black font-mono ${card.color}`}>{card.value}</p>
                    <p className={`text-[10px] mt-1 ${UI.textMuted}`}>{card.sub}</p>
                </div>
            ))}
        </div>
    );
}
