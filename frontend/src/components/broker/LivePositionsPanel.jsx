import React from 'react';
import { useTranslation } from 'react-i18next';
import { Flame, TrendingUp, TrendingDown } from 'lucide-react';

const fmtPrice = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return '--';
    return n.toLocaleString('en-US', { maximumFractionDigits: n < 10 ? 4 : 2 });
};

const holdTime = (openedAt) => {
    if (!openedAt) return '--';
    const h = Math.floor((Date.now() - new Date(openedAt).getTime()) / 3600000);
    if (h < 1) return `${Math.round((Date.now() - new Date(openedAt).getTime()) / 60000)}m`;
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d${h % 24}h`;
};

/**
 * Vị thế LIVE đang mở trên sàn — panel trung tâm của tab Broker.
 * (PnL chính xác xem qua balance / order log; ở đây hiển thị kế hoạch lệnh)
 */
export default function LivePositionsPanel({ liveTrades, isDark, UI }) {
    const { t } = useTranslation('broker');
    return (
        <div className={`rounded-2xl border overflow-hidden ${UI.card}`}>
            <div className={`px-4 py-3 border-b flex items-center justify-between ${UI.border}`}>
                <div>
                    <h3 className={`font-black text-sm uppercase tracking-wider flex items-center gap-2 ${UI.textBold}`}>
                        <Flame size={15} className="text-red-500" /> {t('liveOpenPositions')} ({liveTrades.length})
                    </h3>
                    <p className={`text-[10px] ${UI.textMuted}`}>{t('livePositionsSubtitle')}</p>
                </div>
            </div>

            {liveTrades.length === 0 ? (
                <div className={`p-8 text-center text-sm font-bold ${UI.textMuted}`}>
                    {t('noOpenLivePositions')}
                    <p className="text-[11px] font-normal mt-1">{t('livePositionsEmpty')}</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 p-4">
                    {liveTrades.map(trade => {
                        const isLong = trade.direction === 'LONG' || trade.direction === 'MUA';
                        return (
                            <div key={trade._id} className={`rounded-xl border p-3 ${isDark ? 'bg-red-500/[0.04] border-red-500/20' : 'bg-red-50/40 border-red-200'}`}>
                                <div className="flex items-center justify-between mb-2">
                                    <span className={`font-black font-mono text-sm ${UI.textBold}`}>{trade.symbol}</span>
                                    <span className={`flex items-center gap-1 text-[10px] font-black ${isLong ? 'text-emerald-500' : 'text-red-500'}`}>
                                        {isLong ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                                        {trade.direction}
                                    </span>
                                </div>
                                <div className={`grid grid-cols-3 gap-1 text-[10px] font-mono font-bold ${UI.textMuted}`}>
                                    <div>
                                        <p className="text-[8px] uppercase tracking-widest">{t('entry')}</p>
                                        <p className={UI.textNormal}>{fmtPrice(trade.entryPrice)}</p>
                                    </div>
                                    <div>
                                        <p className="text-[8px] uppercase tracking-widest text-emerald-500">{t('tp')}</p>
                                        <p className="text-emerald-500">{fmtPrice(trade.takeProfitPrice)}</p>
                                    </div>
                                    <div>
                                        <p className="text-[8px] uppercase tracking-widest text-red-400">{t('sl')}</p>
                                        <p className="text-red-400">{fmtPrice(trade.stopLossPrice)}</p>
                                    </div>
                                </div>
                                <div className={`flex justify-between mt-2 pt-2 border-t text-[10px] font-bold ${isDark ? 'border-white/5' : 'border-slate-200'} ${UI.textMuted}`}>
                                    <span>Vốn: {((trade.investedAmount || 0) / 1e6).toFixed(2)}Tr</span>
                                    <span>Score: {trade.aiScore}</span>
                                    <span>⏱ {holdTime(trade.openedAt)}</span>
                                </div>
                                {trade.externalOrderId && (
                                    <p className={`text-[9px] font-mono mt-1 truncate ${UI.textMuted}`}>OrderID: {trade.externalOrderId}</p>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
