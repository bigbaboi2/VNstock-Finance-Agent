import { Activity, Globe, Database, Zap, X, User } from 'lucide-react';

export default function UserMenu({ 
  isDark, UI, currentUser, activeMode, 
  setActiveMode, setShowUserMenu, handleLogout 
}) {
  return (
    <div className={`absolute top-full right-0 mt-3 w-64 rounded-2xl border shadow-2xl overflow-hidden z-[9999] animate-in slide-in-from-top-2 fade-in duration-200 ${isDark ? 'bg-[#10151C] border-white/10' : 'bg-white border-slate-300'}`}>
        {/* THÔNG TIN USER */}
        <div className={`p-4 border-b ${isDark ? 'border-white/5 bg-white/5' : 'border-slate-100 bg-slate-50'}`}>
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-yellow-400 to-emerald-400 flex items-center justify-center text-black">
                    <User size={20} />
                </div>
                <div>
                    <p className={`text-[10px] uppercase tracking-widest font-black ${UI.textMuted}`}>Hệ thống Omni Duck</p>
                    <p className={`font-black text-sm truncate ${UI.textBold}`}>{currentUser}</p>
                </div>
            </div>
        </div>

        {/* BỘ CHỌN THỊ TRƯỜNG */}
        <div className="p-2 flex flex-col gap-1">
            <button onClick={() => { setActiveMode('VN_STOCKS'); setShowUserMenu(false); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold text-sm transition-all ${activeMode === 'VN_STOCKS' ? 'bg-yellow-400 text-black' : (isDark ? 'hover:bg-white/5 text-slate-300' : 'hover:bg-slate-100 text-slate-700')}`}>
                <Activity size={16} /> 1. Chứng khoán VN
            </button>

            <button onClick={() => { setActiveMode('VN_DERIVATIVES'); setShowUserMenu(false); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold text-sm transition-all ${activeMode === 'VN_DERIVATIVES' ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20' : (isDark ? 'hover:bg-white/5 text-slate-300' : 'hover:bg-slate-100 text-slate-700')}`}>
                <Zap size={16} /> 2. Phái sinh VN
            </button>

            <button onClick={() => { setActiveMode('CRYPTO'); setShowUserMenu(false); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold text-sm transition-all ${activeMode === 'CRYPTO' ? 'bg-blue-500 text-white' : (isDark ? 'hover:bg-white/5 text-slate-300' : 'hover:bg-slate-100 text-slate-700')}`}>
                <Globe size={16} /> 3. Tài sản số (Crypto)
            </button>

            <button disabled className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold text-sm opacity-40 grayscale cursor-not-allowed text-left">
                <Database size={16} /> 4. Quốc tế (Update sau)
            </button>
              <button onClick={() => { setActiveMode('PAPER_TRADING'); setShowUserMenu(false); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-bold text-sm transition-all text-left ${
                    activeMode === 'PAPER_TRADING' 
                    ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/20' 
                    : (isDark ? 'hover:bg-white/5 text-slate-300' : 'hover:bg-slate-100 text-slate-700')
                }`}>
                <Activity size={16} /> 5. Giao dịch giả lập
              </button>
        </div>

        {/* ĐĂNG XUẤT */}
        <div className="p-2 border-t border-white/5">
            <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-red-500 hover:bg-red-500/10 font-bold text-sm transition-colors text-left">
                <X size={16} /> Đăng xuất hệ thống
            </button>
        </div>
    </div>
  );
}