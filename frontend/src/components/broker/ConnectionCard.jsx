import React, { useState } from 'react';
import axios from 'axios';
import { Loader2, RefreshCw, Trash2, Wallet, Check, AlertTriangle } from 'lucide-react';

const EXCHANGE_COLORS = {
    BINANCE: '#F0B90B',
    OKX: '#2980fe',
    BYBIT: '#FF6B2B',
    DNSE: '#F26A44',
};

const timeAgo = (date) => {
    if (!date) return '--';
    const diffMin = Math.round((Date.now() - new Date(date).getTime()) / 60000);
    if (diffMin < 1) return 'vừa xong';
    if (diffMin < 60) return `${diffMin} phút trước`;
    const diffH = Math.round(diffMin / 60);
    if (diffH < 24) return `${diffH} giờ trước`;
    return `${Math.round(diffH / 24)} ngày trước`;
};

export default function ConnectionCard({ conn, username, isDark, UI, onChanged }) {
    const [busy, setBusy] = useState(null); // 'test' | 'balance' | 'delete' | 'toggle'
    const [flash, setFlash] = useState(null);
    const color = EXCHANGE_COLORS[conn.exchangeName] || '#888';

    const showFlash = (msg, isError = false) => {
        setFlash({ msg, isError });
        setTimeout(() => setFlash(null), 4000);
    };

    const handleTest = async () => {
        setBusy('test');
        try {
            const res = await axios.post(`/api/exchange-connections/${conn._id}/test`, { username });
            showFlash(res.data.success ? `Kết nối OK (${res.data.latencyMs}ms)` : res.data.message, !res.data.success);
            onChanged?.();
        } catch (err) {
            showFlash(err.response?.data?.message || 'Lỗi test kết nối.', true);
        } finally { setBusy(null); }
    };

    const handleBalance = async () => {
        setBusy('balance');
        try {
            await axios.get(`/api/exchange-connections/${conn._id}/balance`);
            showFlash('Đã làm mới balance từ sàn.');
            onChanged?.();
        } catch (err) {
            showFlash(err.response?.data?.message || 'Lỗi lấy balance.', true);
        } finally { setBusy(null); }
    };

    const handleToggle = async () => {
        setBusy('toggle');
        try {
            await axios.patch(`/api/exchange-connections/${conn._id}/toggle`, { isActive: !conn.isActive, username });
            onChanged?.();
        } catch (err) {
            showFlash(err.response?.data?.message || 'Lỗi bật/tắt.', true);
        } finally { setBusy(null); }
    };

    const handleDelete = async () => {
        if (!window.confirm(`Xóa kết nối "${conn.label}" (${conn.exchangeName})? Key đã mã hóa sẽ bị xóa vĩnh viễn.`)) return;
        setBusy('delete');
        try {
            await axios.delete(`/api/exchange-connections/${conn._id}`, { data: { username } });
            onChanged?.();
        } catch (err) {
            showFlash(err.response?.data?.message || 'Lỗi xóa kết nối.', true);
            setBusy(null);
        }
    };

    const handleSell = async (asset) => {
        const base = conn.exchangeName === 'DNSE' ? 'VNĐ' : 'USDT';
        if (!window.confirm(`Bạn có chắc muốn thanh lý BÁN TOÀN BỘ số dư ${asset} sang ${base} với giá Market không?`)) return;
        setBusy(`sell-${asset}`);
        try {
            const res = await axios.post(`/api/exchange-connections/${conn._id}/sell-to-usdt`, { asset });
            showFlash(res.data.message, !res.data.success);
            onChanged?.(); // Refresh lists and balances
        } catch (err) {
            showFlash(err.response?.data?.message || `Lỗi bán ${asset}`, true);
        } finally {
            setBusy(null);
        }
    };

    const balances = Object.entries(conn.balanceSnapshot || {})
        .filter(([, v]) => v > 0)
        .sort((a, b) => {
            if (a[0] === 'USDT' || a[0] === 'VND') return -1;
            if (b[0] === 'USDT' || b[0] === 'VND') return 1;
            return b[1] - a[1];
        })
        .slice(0, 8);

    return (
        <div className={`rounded-2xl border p-4 flex flex-col gap-3 transition-opacity ${UI.card} ${!conn.isActive ? 'opacity-50' : ''}`}>
            {/* HEADER */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                    <span className={`font-black text-sm ${UI.textBold}`}>{conn.exchangeName}</span>
                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase ${
                        conn.environment === 'LIVE' ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'
                    }`}>{conn.environment}</span>
                </div>
                <span className={`text-[10px] font-black flex items-center gap-1 ${conn.isActive ? 'text-emerald-400' : UI.textMuted}`}>
                    ● {conn.isActive ? 'Active' : 'Off'}
                </span>
            </div>

            <div>
                <p className={`font-bold text-sm ${UI.textNormal}`}>"{conn.label}"</p>
                <p className={`text-xs font-mono ${UI.textMuted}`}>API: {conn.apiKeyMasked}</p>
            </div>

            {/* BALANCE SNAPSHOT */}
            <div className={`rounded-xl p-2.5 border ${isDark ? 'bg-black/30 border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                <p className={`text-[9px] uppercase tracking-widest font-black mb-1 ${UI.textMuted}`}>Balance snapshot</p>
                {balances.length > 0 ? (
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                        {balances.map(([asset, amount]) => {
                            const displayName = asset === '这是测试币' ? 'TESTCOIN' : asset;
                            return (
                                <div key={asset} className={`flex items-center gap-1.5 group/coin px-2 py-1 rounded-md ${isDark ? 'bg-black/40 border border-white/5' : 'bg-slate-200/50 border border-slate-200'}`}>
                                    <span className={`text-[11px] font-mono font-bold ${(asset === 'USDT' || asset === 'VND') ? 'text-cyan-400' : UI.textBold}`}>
                                        {displayName}: {Number(amount).toLocaleString('en-US', { maximumFractionDigits: 6 })}
                                    </span>
                                {asset !== 'USDT' && asset !== 'VND' && Number(amount) > 0 && (
                                    <button
                                        onClick={() => handleSell(asset)}
                                        disabled={!!busy}
                                        title={`Bán toàn bộ ${asset} sang ${conn.exchangeName === 'DNSE' ? 'VNĐ' : 'USDT'}`}
                                        className="opacity-0 group-hover/coin:opacity-100 px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 hover:bg-red-500 hover:text-white transition-all text-[8px] uppercase font-black flex items-center gap-1 disabled:opacity-50"
                                    >
                                        {busy === `sell-${asset}` ? <Loader2 size={10} className="animate-spin" /> : 'Bán'}
                                    </button>
                                )}
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <p className={`text-xs ${UI.textMuted}`}>Chưa có dữ liệu — bấm Test hoặc Balance</p>
                )}
                <p className={`text-[10px] mt-1 ${UI.textMuted}`}>Cập nhật: {timeAgo(conn.balanceUpdatedAt)}</p>
            </div>

            {/* QUYỀN & TEST */}
            <div className="flex items-center justify-between text-[11px] font-bold">
                <span className={UI.textMuted}>
                    Quyền: {(conn.permissions || []).map(p => (
                        <span key={p} className={p === 'WITHDRAW' ? 'text-red-400' : 'text-emerald-400'}> {p}✓</span>
                    ))}
                </span>
                <span className={conn.lastTestStatus === 'OK' ? 'text-emerald-400' : conn.lastTestStatus === 'FAILED' ? 'text-red-400' : UI.textMuted}>
                    {conn.lastTestStatus === 'OK' && <Check size={11} className="inline" />}
                    {conn.lastTestStatus === 'FAILED' && <AlertTriangle size={11} className="inline" />}
                    {' '}Test: {conn.lastTestStatus}{conn.lastTestLatencyMs != null ? ` (${conn.lastTestLatencyMs}ms)` : ''}
                </span>
            </div>

            {conn.permissions?.includes('WITHDRAW') && (
                <p className="text-[10px] font-black text-red-400">⚠️ Key này có quyền RÚT TIỀN — hãy tạo lại key và tắt quyền Withdraw!</p>
            )}

            {flash && (
                <p className={`text-[11px] font-bold ${flash.isError ? 'text-red-400' : 'text-emerald-400'}`}>{flash.msg}</p>
            )}

            {/* ACTIONS */}
            <div className="grid grid-cols-3 gap-2">
                <button onClick={handleTest} disabled={!!busy}
                    className={`py-2 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 border transition-colors disabled:opacity-50 ${UI.cardHover} ${UI.textNormal}`}>
                    {busy === 'test' ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Test
                </button>
                <button onClick={handleBalance} disabled={!!busy}
                    className={`py-2 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 border transition-colors disabled:opacity-50 ${UI.cardHover} ${UI.textNormal}`}>
                    {busy === 'balance' ? <Loader2 size={13} className="animate-spin" /> : <Wallet size={13} />} Balance
                </button>
                <button onClick={handleDelete} disabled={!!busy}
                    className="py-2 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50">
                    {busy === 'delete' ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} Xóa
                </button>
            </div>

            {/* TOGGLE ACTIVE */}
            <button onClick={handleToggle} disabled={!!busy}
                className={`w-full py-2 rounded-xl text-xs font-black transition-colors disabled:opacity-50 ${
                    conn.isActive
                        ? 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25'
                        : (isDark ? 'bg-white/5 text-slate-400 hover:bg-white/10' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')
                }`}>
                {busy === 'toggle' ? <Loader2 size={13} className="animate-spin inline" /> : (conn.isActive ? '⏻ Đang BẬT — bấm để tắt' : '⏻ Đang TẮT — bấm để bật')}
            </button>
        </div>
    );
}
