import React from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';

const STATUS_STYLE = {
    FILLED:    'bg-emerald-500/15 text-emerald-400',
    PENDING:   'bg-yellow-500/15 text-yellow-400',
    PARTIAL:   'bg-orange-500/15 text-orange-400',
    CANCELLED: 'bg-slate-500/15 text-slate-400',
    FAILED:    'bg-red-500/15 text-red-400',
};

const fmtNum = (v, digits = 6) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n === 0) return '--';
    return n.toLocaleString('en-US', { maximumFractionDigits: digits });
};

const fmtTime = (v) => {
    if (!v) return '--';
    return new Date(v).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
};

export default function ExchangeOrderLog({ orders, isDark, UI }) {
    return (
        <div className={`rounded-2xl border overflow-hidden ${UI.card}`}>
            <div className={`px-4 py-3 border-b ${UI.border}`}>
                <h3 className={`font-black text-sm uppercase tracking-wider ${UI.textBold}`}>
                    📋 Log lệnh thực gửi ra sàn
                </h3>
                <p className={`text-[10px] ${UI.textMuted}`}>Mọi lệnh live đều được ghi lại, kể cả lệnh thất bại</p>
            </div>

            {(!orders || orders.length === 0) ? (
                <div className={`p-8 text-center text-sm font-bold ${UI.textMuted}`}>
                    Chưa có lệnh thực nào được gửi ra sàn.
                    <p className="text-[11px] font-normal mt-1">Lệnh sẽ xuất hiện khi bạn tạo gói lệnh AutoDuck với chế độ LIVE và engine khớp được tín hiệu.</p>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                        <thead>
                            <tr className={`text-[9px] uppercase tracking-widest font-black ${UI.textMuted} ${isDark ? 'bg-white/[0.02]' : 'bg-slate-50'}`}>
                                <th className="px-3 py-2 text-left">Thời gian</th>
                                <th className="px-3 py-2 text-left">Sàn</th>
                                <th className="px-3 py-2 text-left">Symbol</th>
                                <th className="px-3 py-2 text-left">Side</th>
                                <th className="px-3 py-2 text-left">Loại</th>
                                <th className="px-3 py-2 text-right">Qty</th>
                                <th className="px-3 py-2 text-right">Giá khớp</th>
                                <th className="px-3 py-2 text-right">~USDT</th>
                                <th className="px-3 py-2 text-center">Status</th>
                                <th className="px-3 py-2 text-left">External ID</th>
                            </tr>
                        </thead>
                        <tbody>
                            {orders.map((o) => (
                                <tr key={o._id} className={`border-t ${UI.border} font-mono`}>
                                    <td className={`px-3 py-2 whitespace-nowrap ${UI.textMuted}`}>{fmtTime(o.sentAt)}</td>
                                    <td className="px-3 py-2">
                                        <span className={`font-black ${UI.textNormal}`}>{o.exchangeName}</span>
                                        <span className={`ml-1 text-[8px] font-black px-1 py-0.5 rounded ${
                                            o.environment === 'LIVE' ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'
                                        }`}>{o.environment === 'LIVE' ? 'LIVE' : 'TEST'}</span>
                                    </td>
                                    <td className={`px-3 py-2 font-black ${UI.textBold}`}>{o.symbol}</td>
                                    <td className={`px-3 py-2 font-black ${o.side === 'BUY' ? 'text-emerald-400' : 'text-red-400'}`}>
                                        {o.side}{o.purpose === 'EXIT' ? ' (exit)' : ''}
                                    </td>
                                    <td className={`px-3 py-2 ${UI.textMuted}`}>{o.orderType}</td>
                                    <td className={`px-3 py-2 text-right ${UI.textNormal}`}>{fmtNum(o.filledQuantity || o.quantity)}</td>
                                    <td className={`px-3 py-2 text-right ${UI.textNormal}`}>{fmtNum(o.filledPrice, 4)}</td>
                                    <td className={`px-3 py-2 text-right ${UI.textMuted}`}>{fmtNum(o.notionalUSDT, 2)}</td>
                                    <td className="px-3 py-2 text-center">
                                        <span
                                            title={o.errorMessage || ''}
                                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black ${STATUS_STYLE[o.status] || STATUS_STYLE.PENDING}`}
                                        >
                                            {o.status === 'PENDING' && <Loader2 size={9} className="animate-spin" />}
                                            {o.status === 'FAILED' && <AlertTriangle size={9} />}
                                            {o.status}
                                        </span>
                                        {o.status === 'FAILED' && o.errorMessage && (
                                            <p className="text-[9px] text-red-400 mt-0.5 max-w-[180px] truncate" title={o.errorMessage}>{o.errorMessage}</p>
                                        )}
                                    </td>
                                    <td className={`px-3 py-2 text-[10px] ${UI.textMuted}`}>{o.externalOrderId || '--'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
