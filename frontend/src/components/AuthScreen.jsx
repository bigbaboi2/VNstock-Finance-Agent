import { TrendingUp } from 'lucide-react';

export default function AuthScreen({ authForm, setAuthForm, authError, handleAuthSubmit }) {
  return (
    <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-[#05080C] bg-[radial-gradient(ellipse_at_center,rgba(250,204,21,0.05),transparent_50%)]">
      <div className="w-[400px] p-8 rounded-3xl border border-white/10 bg-[#0B0F14]/90 backdrop-blur-xl shadow-[0_0_50px_rgba(0,0,0,0.5)] flex flex-col items-center">
                <div className="w-16 h-16 rounded-2xl bg-yellow-400 flex items-center justify-center text-black shadow-[0_0_20px_rgba(250,204,21,0.4)] mb-6">
                    <TrendingUp size={32} />
                </div>
                <h2 className="text-2xl font-black text-white tracking-widest uppercase mb-1">OMNI DUCK</h2>
                <p className="text-[10px] text-yellow-500 tracking-[0.3em] uppercase font-bold mb-6">System Authorization</p>
                
                {authError && (
                    <div className="w-full bg-red-500/10 border border-red-500/50 text-red-400 text-xs font-bold p-3 rounded-lg mb-4 text-center animate-pulse">
                        ⚠️ {authError}
                    </div>
                )}
                
                <form onSubmit={handleAuthSubmit} className="w-full flex flex-col gap-4">
                    <input 
                        type="text" 
                        placeholder="Nhập tên đăng nhập (Tối thiểu 3 ký tự)" 
                        className="w-full h-12 bg-black/50 border border-white/10 rounded-xl px-4 text-white text-sm font-bold outline-none focus:border-yellow-400/50 transition-colors"
                        value={authForm.username}
                        onChange={e => setAuthForm({...authForm, username: e.target.value})}
                    />
                    <input 
                        type="password" 
                        placeholder="Mật khẩu (Tối thiểu 6 ký tự)" 
                        className="w-full h-12 bg-black/50 border border-white/10 rounded-xl px-4 text-white text-sm font-bold outline-none focus:border-yellow-400/50 transition-colors"
                        value={authForm.password}
                        onChange={e => setAuthForm({...authForm, password: e.target.value})}
                    />
                    <button type="submit" className="w-full h-12 mt-2 bg-yellow-400 hover:bg-yellow-300 text-black font-black uppercase tracking-widest rounded-xl transition-all active:scale-95 shadow-[0_0_15px_rgba(250,204,21,0.3)]">
                        {authForm.isRegister ? 'Tạo Tài Khoản' : 'Truy Cập Hệ Thống'}
                    </button>
                </form>
                <button 
                    onClick={() => {
                      setAuthForm({...authForm, isRegister: !authForm.isRegister});
                      setAuthError(''); 
                    }} 
                    className="mt-6 text-xs text-slate-400 hover:text-yellow-400 transition-colors"
                >
                    {authForm.isRegister ? 'Đã có tài khoản? Đăng nhập' : 'Chưa có tài khoản? Đăng ký'}
                </button>
            </div>
        </div>      
    );
}