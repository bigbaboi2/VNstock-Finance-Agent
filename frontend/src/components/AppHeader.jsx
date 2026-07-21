//====  AppHeader.jsx ====
import React, { useRef, useEffect, useState } from 'react';
import { Search, TrendingUp, Globe, Zap, TerminalSquare, Home, Sun, Moon, Menu } from 'lucide-react';
import CyberpunkClock from './CyberpunkClock';
import UserMenu from './UserMenu';

const AppHeader = ({
  isDark, UI, theme,
  activeMode, marketOpen,
  input, setInput,
  showSuggestions, setShowSuggestions,
  suggestions, setSuggestions,
  showLogs, setShowLogs,
  showUserMenu, setShowUserMenu,
  errorAlert,
  loadingMarket,
  currentUser,
  setActiveMode, handleLogout,
  handleGoHome, handleToggleTheme,
  fetchMarketData, executePaperSearch,
}) => {
   const searchWrapperRef = useRef(null);
   const [is3DClock, setIs3DClock] = useState(true);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchWrapperRef.current && !searchWrapperRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [setShowSuggestions]);

  return (
    <header className={`relative z-[99999] border-b px-3 sm:px-6 py-2 sm:py-1 flex items-center justify-between shrink-0 w-full transition-colors duration-300 ${UI.header}`}>
        {/*CONTAINER BRAND LOGO */}
        <div
          className="flex items-center gap-2 sm:gap-4 sm:w-[300px] xl:w-[350px] shrink-0 cursor-pointer"
          onClick={handleGoHome}
          title="Trang chủ · /vn-stocks"
        >
          <div className="w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center shrink-0 drop-shadow-md">
            <img src="/favicon.svg" alt="Omni Duck Logo" className="w-full h-full object-contain drop-shadow-[0_0_8px_rgba(250,204,21,0.3)]" />
          </div>
          <div className="hidden lg:block">
            <h1 className={`text-xl font-black tracking-tight leading-none ${UI.textBold}`}>
              OMNI <span className="text-yellow-400 italic">DUCK</span>
            </h1>
            <p className={`text-[9px] uppercase tracking-widest font-bold mt-1 ${UI.textMuted}`}>
              Quantitative Terminal
            </p>
          </div>
        </div>

        {/*CONTAINER SEARCH & CLOCK CONTROL */}
        <div className="flex-1 flex items-center justify-center gap-2 sm:gap-8 relative px-2 sm:px-4 min-w-0">
              <button 
                  onClick={handleGoHome}
                  title="Trở về Trang chủ (Lịch sử lệnh)"
                  className={`flex-shrink-0 h-9 w-9 sm:h-12 sm:w-12 flex items-center justify-center rounded-xl sm:rounded-2xl border transition-all active:scale-95 hover:bg-yellow-400 hover:text-black hover:border-yellow-400 ${UI.btnLog}`}
              >
                  <Home size={16} className="sm:w-5 sm:h-5" />
              </button>

        {/*=== SEARCH WRAPPER with REF === */}
        <div className="w-full max-w-xl relative z-[99999] min-w-0" ref={searchWrapperRef}>
            <div className={`absolute top-full mt-3 left-1/2 transform -translate-x-1/2 z-[9999] px-6 py-2 bg-red-500/95 backdrop-blur-md text-white font-black text-xs tracking-widest rounded-full shadow-2xl transition-all duration-500 pointer-events-none
              ${errorAlert ? 'opacity-100 translate-y-0 visible' : 'opacity-0 -translate-y-4 invisible'}`}
            >
              {errorAlert}
            </div>
            
            {/*HIDDEN CONDITIONS SEARCH */}
            {activeMode !== 'CRYPTO' ? (
                <div className={`flex items-center h-9 sm:h-12 border rounded-xl sm:rounded-2xl px-3 sm:px-4 focus-within:border-yellow-400/50 transition-all ${UI.searchBg}`}>
                    <Search size={16} className="text-yellow-400 mr-2 sm:mr-3 sm:w-[18px] sm:h-[18px] shrink-0" />
                    <input
                        type="text"
                        placeholder={activeMode === 'VN_DERIVATIVES' ? "VN30F1M" : "Mã CP..."}
                        className={`flex-1 min-w-0 bg-transparent outline-none text-sm sm:text-base font-bold uppercase ${UI.searchInput}`}
                        value={activeMode === 'VN_DERIVATIVES' ? "VN30F1M" : input} 
                        onChange={(e) => { setInput(e.target.value.toUpperCase()); setShowSuggestions(true); }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            activeMode === 'PAPER_TRADING' ? executePaperSearch(input) : fetchMarketData();
                            setShowSuggestions(false);
                          }
                          if (e.key === 'Escape') setShowSuggestions(false);
                        }}
                        onFocus={() => { if (input.trim()) setShowSuggestions(true); }}
                        disabled={loadingMarket || activeMode === 'VN_DERIVATIVES'} 
                    />
                    <button
                      onClick={() => {
                        activeMode === 'PAPER_TRADING' ? executePaperSearch(input) : fetchMarketData();
                        setShowSuggestions(false);
                      }}
                      className="hidden sm:block h-8 px-6 rounded-lg bg-yellow-400 hover:bg-yellow-300 text-black font-black text-xs transition-all active:scale-95 disabled:opacity-50 ml-2"
                      disabled={loadingMarket || !input}
                    >
                      SEARCH
                    </button>
                </div>
            ) : (
              <div className={`flex items-center justify-center h-9 sm:h-12 border rounded-xl sm:rounded-2xl px-2 sm:px-4 border-purple-500/30 bg-purple-500/5`}>
                    <Globe size={16} className="text-purple-500 mr-2 sm:mr-3 animate-pulse sm:w-[18px] sm:h-[18px] shrink-0" />
                    <span className="text-purple-500 font-black uppercase tracking-widest text-[10px] sm:text-sm truncate">Crypto Terminal</span>
                </div>
            )}

            {/*DROPDOWN STOCK SUGGESTIONS */}
            {showSuggestions && suggestions.length > 0 && activeMode !== 'CRYPTO' && (
              <div
                className={`absolute top-[calc(100%+8px)] left-0 z-[99] right-0 border rounded-2xl overflow-y-auto max-h-[420px] z-[99999] shadow-2xl backdrop-blur-2xl custom-scrollbar ${UI.card}`}
                style={{ isolation: 'isolate' }}
              >
                {suggestions.map((stock, index) => (
                  <button
                    key={stock.symbol || index}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setInput(stock.symbol);
                      setSuggestions([]);
                      setShowSuggestions(false);
                    }}
                    className={`w-full flex items-center justify-between px-5 py-3 transition-all border-b last:border-0 text-left group ${UI.cardHover}`}
                  >
                    {/*Left side */}
                    <div className="flex items-center gap-3 min-w-0 flex-1 pr-4">
                      <Zap size={14} className="text-yellow-400 shrink-0 group-hover:animate-pulse" />
                      <span className={`font-black text-base tracking-wider transition-colors ${isDark ? 'text-emerald-400 group-hover:text-yellow-400' : 'text-emerald-600 group-hover:text-yellow-500'}`}>
                        {stock.symbol}
                      </span>
                      <span className={`text-[11px] font-medium truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        {stock.name || stock.companyName || 'Đang cập nhật...'}
                      </span>
                    </div>

                    {/*Right side: Exchange label */}
                    {stock.exchange && (
                      <span className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest shrink-0 ${
                        stock.exchange.toUpperCase() === 'HOSE' 
                            ? 'bg-red-500/10 text-red-500 border border-red-500/30' 
                            : stock.exchange.toUpperCase() === 'HNX'
                            ? 'bg-blue-500/10 text-blue-500 border border-blue-500/30'
                            : 'bg-amber-500/10 text-amber-500 border border-amber-500/30' 
                      }`}>
                        {stock.exchange}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
        </div>

          <div className="hidden xl:flex items-center gap-4 shrink-0 select-none ml-20">
            <CyberpunkClock marketOpen={marketOpen} theme={isDark ? 'dark' : 'light'} is3D={is3DClock} />
            <div
              className={`px-4 py-2 rounded-2xl border font-black uppercase tracking-widest text-[11px]
              ${marketOpen
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/40 shadow-[0_0_18px_rgba(16,185,129,0.25)]'
                : 'bg-red-500/10 text-red-400 border-red-500/40 shadow-[0_0_18px_rgba(239,68,68,0.25)]'
              }`}
            >
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full animate-pulse ${marketOpen ? 'bg-emerald-400' : 'bg-red-400'}`} />
                {marketOpen ? 'Market OPEN' : 'Market CLOSED'}
              </div>
            </div>
          </div>
        </div>

        {/*CONTAINER UTILITIES & ACCOUNT DROPDOWN */}
        <div className="flex items-center justify-end gap-1.5 sm:gap-3 sm:w-[300px] xl:w-[350px] shrink-0 relative">
          <button 
            onClick={() => setIs3DClock(!is3DClock)}
            className={`relative flex items-center w-11 h-6 rounded-full p-[2px] transition-colors duration-300 border ${isDark ? 'border-white/10' : 'border-slate-300'} ${is3DClock ? 'bg-emerald-500/20' : 'bg-slate-500/10'}`}
            title="Toggle 3D/2D Clock"
          >
            <div className={`h-full aspect-square rounded-full flex items-center justify-center shadow-md transition-transform duration-300 ${is3DClock ? 'translate-x-5 bg-emerald-500 text-white' : 'translate-x-0 bg-slate-400 text-white'}`}>
              <span className="text-[8px] font-black leading-none">{is3DClock ? '3D' : '2D'}</span>
            </div>
          </button>
          <button onClick={handleToggleTheme} className={`p-2 sm:p-2.5 rounded-xl border transition-all ${UI.btnLog}`}>
            {isDark ? <Sun size={16} className="text-yellow-400 sm:w-[18px] sm:h-[18px]" /> : <Moon size={16} className="sm:w-[18px] sm:h-[18px]" />}
          </button>
          
          <button onClick={() => setShowLogs(!showLogs)} className={`hidden md:flex items-center gap-2 px-4 h-10 rounded-xl text-[10px] font-black uppercase border transition-all ${showLogs ? 'bg-yellow-400 text-black border-yellow-400' : UI.btnLog}`}>
            <TerminalSquare size={16} />
            <span className="hidden xl:inline">{showLogs ? 'CLOSE' : 'LOGS'}</span>
          </button>

          <div className="relative">
            <button onClick={() => setShowUserMenu(!showUserMenu)} className={`p-2 sm:p-2.5 rounded-xl border transition-all ${showUserMenu ? 'bg-emerald-500 border-emerald-500 text-black' : UI.btnLog}`}>
              <Menu size={16} className="sm:w-[18px] sm:h-[18px]" />
            </button>
            {showUserMenu && (
              <UserMenu 
                isDark={isDark} UI={UI} currentUser={currentUser}
                activeMode={activeMode} setActiveMode={setActiveMode}
                setShowUserMenu={setShowUserMenu} handleLogout={handleLogout}
              />
            )}
          </div>
        </div>
    </header>
  );
};

 export default React.memo(AppHeader);