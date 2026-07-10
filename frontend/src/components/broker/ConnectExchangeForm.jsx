import React, { useState } from 'react';
import axios from 'axios';
import { Eye, EyeOff, Loader2, ShieldAlert, ShieldCheck, X, ExternalLink, Info } from 'lucide-react';
import ExchangeGuideModal from './ExchangeGuideModal';

const EXCHANGES = [
    {
        id: 'BINANCE', name: 'Binance', color: '#F0B90B',
        apiUrl: 'https://www.binance.com/en/my/settings/api-management',
        needsPassphrase: false,
    },
    {
        id: 'OKX', name: 'OKX', color: '#2980fe',
        apiUrl: 'https://www.okx.com/account/my-api',
        needsPassphrase: true,
    },
    {
        id: 'BYBIT', name: 'Bybit', color: '#FF6B2B',
        apiUrl: 'https://www.bybit.com/app/user/api-management',
        needsPassphrase: false,
    },
    {
        id: 'DNSE', name: 'DNSE', color: '#F26A44',
        apiUrl: 'https://entradex.dnse.com.vn/',
        needsPassphrase: false,
        isVNStock: true,
    },
];

export default function ConnectExchangeForm({ username, isDark, UI, onClose, onCreated }) {
    const [form, setForm] = useState({
        exchangeName: 'BINANCE',
        label: '',
        apiKey: '',
        secret: '',
        passphrase: '',
        environment: 'TESTNET',
    });
    const [showKey, setShowKey] = useState(false);
    const [showSecret, setShowSecret] = useState(false);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [showGuide, setShowGuide] = useState(false);

    const exchange = EXCHANGES.find(e => e.id === form.exchangeName);
    const inputCls = `w-full px-3 py-2.5 rounded-xl border text-sm font-mono outline-none transition-colors ${
        isDark ? 'bg-[#0B0F14] border-white/10 text-white focus:border-emerald-400/50' : 'bg-white border-slate-300 text-black focus:border-emerald-500'
    }`;

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.apiKey || !form.secret) {
            setResult({ success: false, message: exchange.isVNStock ? 'Vui lòng nhập đầy đủ Tên đăng nhập và Mật khẩu.' : 'Vui lòng nhập đầy đủ API Key và Secret Key.' });
            return;
        }
        if (exchange.needsPassphrase && !form.passphrase) {
            setResult({ success: false, message: 'Sàn này bắt buộc phải có Passphrase.' });
            return;
        }
        setLoading(true);
        setResult(null);
        try {
            const res = await axios.post('/api/exchange-connections', { ...form, username });
            setResult({
                success: res.data.testResult?.success ?? res.data.success,
                message: res.data.message,
                warning: res.data.warning,
                balances: res.data.testResult?.balances,
                latencyMs: res.data.testResult?.latencyMs,
                permissions: res.data.testResult?.permissions,
            });
            if (res.data.success) {
                setTimeout(() => { onCreated?.(); }, 1800);
            }
        } catch (err) {
            setResult({ success: false, message: err.response?.data?.message || 'Lỗi kết nối server.' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className={`rounded-2xl border p-5 ${UI.card} animate-in fade-in slide-in-from-top-2 duration-200`}>
            <div className="flex items-center justify-between mb-4">
                <h3 className={`font-black text-sm uppercase tracking-wider ${UI.textBold}`}>🔑 Thêm kết nối sàn mới</h3>
                <button onClick={onClose} className={`p-1.5 rounded-lg ${isDark ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`}>
                    <X size={16} className={UI.textMuted} />
                </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                {/* CHỌN SÀN */}
                <div className="grid grid-cols-4 gap-2">
                    {EXCHANGES.map(ex => (
                        <button
                            key={ex.id}
                            type="button"
                            onClick={() => setForm({ ...form, exchangeName: ex.id })}
                            className={`py-2.5 rounded-xl font-black text-sm border-2 transition-all ${
                                form.exchangeName === ex.id
                                    ? 'text-black shadow-lg'
                                    : (isDark ? 'border-white/10 text-slate-400 hover:border-white/30' : 'border-slate-300 text-slate-600 hover:border-slate-400')
                            }`}
                            style={form.exchangeName === ex.id ? { backgroundColor: ex.color, borderColor: ex.color } : {}}
                        >
                            {ex.name}
                        </button>
                    ))}
                </div>

                {/* HƯỚNG DẪN LẤY KEY */}
                <button type="button" onClick={() => setShowGuide(true)}
                    className="flex items-center gap-1.5 text-xs font-bold text-blue-400 hover:underline w-fit">
                    <Info size={14} /> Hướng dẫn: Xem cách tạo API key trên {exchange.name} tại đây
                </button>

                {/* KHUYẾN NGHỊ QUYỀN */}
                <div className={`rounded-xl p-3 text-xs font-semibold border ${isDark ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-emerald-50 border-emerald-200'}`}>
                    <p className="text-emerald-500 mb-1 font-black">Quyền khuyến nghị khi tạo key trên sàn:</p>
                    <p className={UI.textMuted}>✅ Bật: Đọc thông tin tài khoản &nbsp;|&nbsp; ✅ Bật: Giao dịch Spot</p>
                    <p className="text-red-400 font-black mt-1">❌ TUYỆT ĐỐI KHÔNG cấp quyền Rút tiền (Withdraw)!</p>
                </div>

                {/* NHÃN */}
                <div>
                    <label className={`text-[10px] font-black uppercase tracking-widest ${UI.textMuted}`}>Nhãn hiển thị</label>
                    <input className={inputCls} placeholder={`Vd: ${exchange.name} main account`}
                        value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} />
                </div>

                {/* API KEY / USERNAME */}
                <div>
                    <label className={`text-[10px] font-black uppercase tracking-widest ${UI.textMuted}`}>
                        API Key
                    </label>
                    <div className="relative">
                        <input className={inputCls} type={showKey ? 'text' : 'password'} autoComplete="off"
                            value={form.apiKey} onChange={e => setForm({ ...form, apiKey: e.target.value.trim() })} />
                        <button type="button" onClick={() => setShowKey(!showKey)}
                            className={`absolute right-3 top-1/2 -translate-y-1/2 ${UI.textMuted}`}>
                            {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                    </div>
                </div>

                {/* SECRET / PASSWORD */}
                <div>
                    <label className={`text-[10px] font-black uppercase tracking-widest ${UI.textMuted}`}>
                        Secret Key
                    </label>
                    <div className="relative">
                        <input className={inputCls} type={showSecret ? 'text' : 'password'} autoComplete="off"
                            value={form.secret} onChange={e => setForm({ ...form, secret: e.target.value.trim() })} />
                        <button type="button" onClick={() => setShowSecret(!showSecret)}
                            className={`absolute right-3 top-1/2 -translate-y-1/2 ${UI.textMuted}`}>
                            {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                    </div>
                </div>

                {/* PASSPHRASE / PIN */}
                {exchange.needsPassphrase && (
                    <div>
                        <label className={`text-[10px] font-black uppercase tracking-widest ${UI.textMuted}`}>
                            {exchange.isVNStock ? 'Mã PIN (Dùng để xác thực Trading Token)' : 'Passphrase (OKX bắt buộc)'}
                        </label>
                        <input className={inputCls} type="password" autoComplete="off"
                            value={form.passphrase} onChange={e => setForm({ ...form, passphrase: e.target.value })} />
                    </div>
                )}

                {/* MÔI TRƯỜNG */}
                <div>
                    <label className={`text-[10px] font-black uppercase tracking-widest ${UI.textMuted}`}>Môi trường</label>
                    <div className="grid grid-cols-2 gap-2 mt-1">
                        <button type="button" onClick={() => setForm({ ...form, environment: 'TESTNET' })}
                            className={`py-2.5 rounded-xl font-black text-sm border-2 transition-all flex items-center justify-center gap-2 ${
                                form.environment === 'TESTNET'
                                    ? 'bg-emerald-500 border-emerald-500 text-white'
                                    : (isDark ? 'border-white/10 text-slate-400' : 'border-slate-300 text-slate-600')
                            }`}>
                            <ShieldCheck size={15} /> Testnet (an toàn)
                        </button>
                        <button type="button" onClick={() => setForm({ ...form, environment: 'LIVE' })}
                            className={`py-2.5 rounded-xl font-black text-sm border-2 transition-all flex items-center justify-center gap-2 ${
                                form.environment === 'LIVE'
                                    ? 'bg-red-500 border-red-500 text-white'
                                    : (isDark ? 'border-white/10 text-slate-400' : 'border-slate-300 text-slate-600')
                            }`}>
                            <ShieldAlert size={15} /> Live ⚠️
                        </button>
                    </div>
                    {form.environment === 'LIVE' && (
                        <p className="text-xs font-black text-red-400 mt-2 animate-pulse">
                            ⚠️ CẢNH BÁO: Môi trường LIVE — lệnh sẽ được gửi THỰC TẾ ra sàn bằng tiền thật!
                        </p>
                    )}
                </div>

                {/* KẾT QUẢ */}
                {result && (
                    <div className={`rounded-xl p-3 text-xs font-bold border ${
                        result.success
                            ? (isDark ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-emerald-50 border-emerald-300 text-emerald-700')
                            : (isDark ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-red-50 border-red-300 text-red-600')
                    }`}>
                        <p>{result.message}</p>
                        {result.warning && <p className="text-orange-400 mt-1">{result.warning}</p>}
                        {result.success && result.balances && (
                            <p className={`mt-1 font-mono ${UI.textMuted}`}>
                                Balance: {Object.entries(result.balances).slice(0, 5).map(([k, v]) => `${k}: ${v}`).join(' | ') || 'Trống'}
                                {result.latencyMs != null && ` · ${result.latencyMs}ms`}
                            </p>
                        )}
                    </div>
                )}

                <button type="submit" disabled={loading}
                    className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-black text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                    {loading ? <><Loader2 size={16} className="animate-spin" /> Đang kiểm tra kết nối với sàn...</> : 'Lưu & Kiểm tra kết nối'}
                </button>
            </form>
            {showGuide && (
                <ExchangeGuideModal
                    exchangeName={exchange.id}
                    isDark={isDark}
                    UI={UI}
                    onClose={() => setShowGuide(false)}
                />
            )}
        </div>
    );
}
