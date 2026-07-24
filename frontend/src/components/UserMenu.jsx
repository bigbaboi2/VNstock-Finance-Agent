import { useState } from 'react';
import {
  Activity, Globe, Database, Zap, X, User, Bot, Plug,
  Settings, ArrowLeft, Sun, Moon, BookOpen, Sparkles, Minus, Type, Layers,
} from 'lucide-react';
import { APP_MODES, buildAppPath } from '../routes/appRoutes';

const MODE_ITEMS = [
  {
    mode: APP_MODES.VN_STOCKS,
    label: '1. Chứng khoán VN',
    pathHint: '/vn-stocks',
    icon: Activity,
    activeClass: 'bg-yellow-400 text-black',
  },
  {
    mode: APP_MODES.VN_DERIVATIVES,
    label: '2. Phái sinh VN',
    pathHint: '/vn-derivatives',
    icon: Zap,
    activeClass: 'bg-orange-500 text-white shadow-lg shadow-orange-500/20',
  },
  {
    mode: APP_MODES.CRYPTO,
    label: '3. Tài sản số (Crypto)',
    pathHint: '/crypto',
    icon: Globe,
    activeClass: 'bg-blue-500 text-white',
  },
];

const STYLE_OPTIONS = [
  {
    id: 'classic',
    label: 'Hiện tại',
    desc: 'Giao diện đầy đủ hiệu ứng',
    icon: Sparkles,
  },
  {
    id: 'minimal',
    label: 'Tối giản',
    desc: 'Giảm hiệu ứng, ưu tiên FPS',
    icon: Minus,
  },
  {
    id: 'ultra',
    label: 'Siêu tối giản',
    desc: 'Ngăn xếp — chỉ render khi mở',
    icon: Layers,
  },
  {
    id: 'book',
    label: 'Chế độ sách',
    desc: 'Font & màu kiểu trang sách',
    icon: BookOpen,
  },
];

const FONT_SCALE_OPTIONS = [
  { id: 'sm', label: 'A', hint: 'Nhỏ', sampleClass: 'text-[11px]' },
  { id: 'md', label: 'A', hint: 'Vừa', sampleClass: 'text-sm' },
  { id: 'lg', label: 'A', hint: 'Lớn', sampleClass: 'text-base' },
  { id: 'xl', label: 'A', hint: 'Rất lớn', sampleClass: 'text-lg' },
];

export default function UserMenu({
  isDark, UI, currentUser, activeMode,
  setActiveMode, setShowUserMenu, handleLogout,
  is3DClock = true,
  uiStyle = 'classic',
  fontScale = 'md',
  handleToggleTheme,
  handleToggleClockMode,
  handleSetUiStyle,
  handleSetFontScale,
}) {
  const [menuView, setMenuView] = useState('main');
  const go = (mode, extras) => {
    setActiveMode(mode, extras);
    setShowUserMenu(false);
  };

  const touchBtn = 'min-h-[44px]';
  const panelClass = `absolute top-full right-0 mt-3 w-[min(18rem,calc(100vw-1.5rem))] sm:w-72 rounded-2xl border-2 shadow-2xl overflow-hidden z-[999999] ${
    UI.reduceMotion ? '' : 'animate-in slide-in-from-top-2 fade-in duration-200'
  } ${
    isDark
      ? 'bg-[#10151C] border-white/35 shadow-[0_0_0_1px_rgba(255,255,255,0.12),0_20px_50px_rgba(0,0,0,0.55)]'
      : 'bg-white border-slate-300'
  } ${
    uiStyle === 'book' ? (isDark ? '!bg-[#241e18] !border-[#c4a574]/70 !rounded-md' : '!bg-[#fffdf8] !border-[#d4c8b0] !rounded-md') : ''
  }`;

  return (
    <div className={panelClass}>
      {menuView === 'main' ? (
        <div className="user-menu-main font-sans [font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe_UI',Roboto,'Helvetica_Neue',Arial,sans-serif]">
          <div className={`p-4 border-b ${isDark ? 'border-white/5 bg-white/5' : 'border-slate-100 bg-slate-50'} ${uiStyle === 'book' ? (isDark ? '!border-[#3d3428] !bg-[#2a221a]/40' : '!border-[#d4c8b0] !bg-[#efe8dc]/50') : ''}`}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-black shrink-0 ${
                uiStyle === 'book'
                  ? 'bg-[#c4a574]'
                  : 'bg-gradient-to-tr from-yellow-400 to-emerald-400'
              }`}>
                <User size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <p className={`text-[10px] uppercase tracking-widest font-bold ${UI.textMuted}`}>Hệ thống Omni Duck</p>
                <p className={`font-bold text-sm truncate ${UI.textBold}`}>{currentUser}</p>
              </div>
              <button
                type="button"
                onClick={() => setMenuView('settings')}
                className={`${touchBtn} w-11 shrink-0 flex items-center justify-center rounded-xl border transition-colors ${UI.btnLog}`}
                title="Cài đặt phong cách"
                aria-label="Cài đặt phong cách"
              >
                <Settings size={18} />
              </button>
            </div>
          </div>

          <div className="p-2 flex flex-col gap-1 max-h-[min(60dvh,28rem)] overflow-y-auto">
            {MODE_ITEMS.map(({ mode, label, pathHint, icon: Icon, activeClass }) => (
              <button
                key={mode}
                type="button"
                title={pathHint}
                onClick={() => go(mode)}
                className={`${touchBtn} w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-semibold text-sm transition-all ${activeMode === mode ? activeClass : (isDark ? 'hover:bg-white/5 text-slate-300' : 'hover:bg-slate-100 text-slate-700')}`}
              >
                <Icon size={16} /> {label}
              </button>
            ))}

            <button type="button" disabled className={`${touchBtn} w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-semibold text-sm opacity-40 grayscale cursor-not-allowed text-left`}>
              <Database size={16} /> 4. Quốc tế (Update sau)
            </button>

            <button
              type="button"
              title={buildAppPath({ mode: APP_MODES.PAPER_TRADING })}
              onClick={() => go(APP_MODES.PAPER_TRADING, { paperMarket: 'VN_STOCKS' })}
              className={`${touchBtn} w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-semibold text-sm transition-all text-left ${
                activeMode === APP_MODES.PAPER_TRADING
                  ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/20'
                  : (isDark ? 'hover:bg-white/5 text-slate-300' : 'hover:bg-slate-100 text-slate-700')
              }`}
            >
              <Activity size={16} /> 5. Giao dịch giả lập
            </button>

            <button
              type="button"
              title="/auto-duck"
              onClick={() => go(APP_MODES.AUTO_TRADE)}
              className={`${touchBtn} w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-semibold text-sm transition-all text-left ${
                activeMode === APP_MODES.AUTO_TRADE
                  ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/20'
                  : (isDark ? 'hover:bg-white/5 text-slate-300' : 'hover:bg-slate-100 text-slate-700')
              }`}
            >
              <Bot size={16} /> 6. Tự động vào lệnh AI
            </button>

            <button
              type="button"
              title="/broker"
              onClick={() => go(APP_MODES.BROKER_CONNECTION)}
              className={`${touchBtn} w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-semibold text-sm transition-all text-left ${
                activeMode === APP_MODES.BROKER_CONNECTION
                  ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                  : (isDark ? 'hover:bg-white/5 text-slate-300' : 'hover:bg-slate-100 text-slate-700')
              }`}
            >
              <Plug size={16} /> 7. Kết nối sàn / Broker
            </button>
          </div>

          <div className={`p-2 border-t ${isDark ? 'border-white/5' : 'border-slate-100'}`}>
            <button
              type="button"
              onClick={handleLogout}
              className={`${touchBtn} w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-red-500 hover:bg-red-500/10 font-semibold text-sm transition-colors text-left`}
            >
              <X size={16} /> Đăng xuất hệ thống
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className={`p-3 border-b flex items-center gap-2 ${isDark ? 'border-white/5 bg-white/5' : 'border-slate-100 bg-slate-50'} ${uiStyle === 'book' ? (isDark ? '!border-[#3d3428] !bg-[#2a221a]/40' : '!border-[#d4c8b0] !bg-[#efe8dc]/50') : ''}`}>
            <button
              type="button"
              onClick={() => setMenuView('main')}
              className={`${touchBtn} w-11 shrink-0 flex items-center justify-center rounded-xl border ${UI.btnLog}`}
              title="Trở lại"
              aria-label="Trở lại menu"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="min-w-0">
              <p className={`text-[10px] uppercase tracking-widest font-black ${UI.textMuted}`}>Cài đặt</p>
              <p className={`font-black text-sm truncate ${UI.textBold}`}>Cài đặt phong cách</p>
            </div>
          </div>

          <div className="p-3 flex flex-col gap-4 max-h-[min(70dvh,32rem)] overflow-y-auto">
            <div>
              <p className={`text-[10px] uppercase tracking-widest font-black mb-2 ${UI.textMuted}`}>Giao diện sáng / tối</p>
              <button
                type="button"
                onClick={handleToggleTheme}
                className={`${touchBtn} w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border font-bold text-sm ${UI.btnLog}`}
              >
                <span className="flex items-center gap-2">
                  {isDark ? <Sun size={16} className="text-yellow-400" /> : <Moon size={16} />}
                  {isDark ? 'Chế độ tối' : 'Chế độ sáng'}
                </span>
                <span className={`text-[10px] uppercase ${UI.textMuted}`}>{isDark ? 'Dark' : 'Light'}</span>
              </button>
            </div>

            <div>
              <p className={`text-[10px] uppercase tracking-widest font-black mb-2 ${UI.textMuted}`}>Đồng hồ</p>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleToggleClockMode?.();
                }}
                className={`${touchBtn} w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border font-bold text-sm ${UI.btnLog}`}
              >
                <span>Clock {is3DClock ? '3D' : '2D'}</span>
                <span
                  className={`relative flex items-center w-11 h-6 rounded-full p-[2px] border pointer-events-none ${
                    isDark ? 'border-white/10' : 'border-slate-300'
                  } ${is3DClock ? 'bg-emerald-500/20' : 'bg-slate-500/10'}`}
                >
                  <span
                    className={`h-full aspect-square rounded-full flex items-center justify-center shadow-md text-[8px] font-black text-white transition-transform ${
                      is3DClock ? 'translate-x-5 bg-emerald-500' : 'translate-x-0 bg-slate-400'
                    }`}
                  >
                    {is3DClock ? '3D' : '2D'}
                  </span>
                </span>
              </button>
            </div>

            <div>
              <p className={`text-[10px] uppercase tracking-widest font-black mb-2 flex items-center gap-1.5 ${UI.textMuted}`}>
                <Type size={12} /> Cỡ chữ
              </p>
              <div className="grid grid-cols-4 gap-1.5">
                {FONT_SCALE_OPTIONS.map(({ id, label, hint, sampleClass }) => {
                  const active = fontScale === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => handleSetFontScale?.(id)}
                      title={hint}
                      className={`${touchBtn} flex flex-col items-center justify-center gap-0.5 px-1 py-2 rounded-xl border transition-colors ${
                        active
                          ? (uiStyle === 'book'
                            ? (isDark ? 'bg-[#3d3428] border-[#c4a574] text-[#f2ebe0]' : 'bg-[#efe8dc] border-[#8a6b3d] text-[#1f1912]')
                            : 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300')
                          : UI.btnLog
                      }`}
                    >
                      <span className={`font-black leading-none ${sampleClass}`}>{label}</span>
                      <span className={`text-[9px] font-bold uppercase tracking-wide ${active ? 'opacity-90' : UI.textMuted}`}>{hint}</span>
                    </button>
                  );
                })}
              </div>
              <p className={`mt-2 text-[11px] ${UI.textMuted}`}>Áp dụng toàn app · lưu theo tài khoản</p>
            </div>

            <div>
              <p className={`text-[10px] uppercase tracking-widest font-black mb-2 ${UI.textMuted}`}>Phong cách frontend</p>
              <div className="flex flex-col gap-1.5">
                {STYLE_OPTIONS.map(({ id, label, desc, icon: Icon }) => {
                  const active = uiStyle === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => handleSetUiStyle?.(id)}
                      className={`${touchBtn} w-full flex items-start gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors ${
                        active
                          ? (uiStyle === 'book' || id === 'book'
                            ? (isDark ? 'bg-[#3d3428] border-[#c4a574] text-[#f2ebe0]' : 'bg-[#efe8dc] border-[#8a6b3d] text-[#1f1912]')
                            : 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300')
                          : `${UI.btnLog}`
                      }`}
                    >
                      <Icon size={16} className="mt-0.5 shrink-0" />
                      <span className="min-w-0">
                        <span className={`block font-black text-sm ${active ? '' : UI.textBold}`}>{label}</span>
                        <span className={`block text-[11px] mt-0.5 ${active ? 'opacity-80' : UI.textMuted}`}>{desc}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
