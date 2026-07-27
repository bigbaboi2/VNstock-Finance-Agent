//====  AppHeader.jsx ====
import React, { useRef, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Globe, Zap, TerminalSquare, Menu } from 'lucide-react';
import CyberpunkClock from './CyberpunkClock';
import UserMenu from './UserMenu';
import { formatCompanyName } from '../lib/formatCompanyName';

function MobileHeaderClock({ marketOpen, isDark }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const color = marketOpen
    ? (isDark ? 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10' : 'text-emerald-700 border-emerald-300 bg-emerald-50')
    : (isDark ? 'text-red-400 border-red-500/40 bg-red-500/10' : 'text-red-700 border-red-300 bg-red-50');
  return (
    <div className={`xl:hidden shrink-0 flex items-center gap-1 px-2 h-9 rounded-xl border font-black tabular-nums text-[11px] sm:text-xs tracking-wider ${color}`}>
      <span className={`ui-dot w-1.5 h-1.5 rounded-full shrink-0 ${marketOpen ? 'bg-emerald-400' : 'bg-red-400'}`} />
      {hh}:{mm}<span className="opacity-60 hidden min-[360px]:inline">:{ss}</span>
    </div>
  );
}

const AppHeader = ({
  isDark, UI,
  uiStyle = 'classic',
  activeMode, marketOpen,
  input, setInput,
  showSuggestions, setShowSuggestions,
  suggestions, setSuggestions,
  showLogs, setShowLogs,
  showUserMenu, setShowUserMenu,
  errorAlert,
  loadingMarket,
  currentUser,
  is3DClock = true,
  setActiveMode, handleLogout,
  handleGoHome,
  handleToggleTheme,
  handleToggleClockMode,
  handleSetUiStyle,
  handleSetFontScale,
  fontScale = 'md',
  language = 'vi',
  handleSetLanguage,
  fetchMarketData, executePaperSearch,
}) => {
   const { t } = useTranslation('common');
   const searchWrapperRef = useRef(null);
   const clockIs3D = (uiStyle === 'ultra') ? false : is3DClock;

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchWrapperRef.current && !searchWrapperRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [setShowSuggestions]);

  const runSearch = () => {
    activeMode === 'PAPER_TRADING' ? executePaperSearch(input) : fetchMarketData();
    setShowSuggestions(false);
  };

  return (
    <header
      data-app-header
      className={`relative z-[99999] border-b px-2 sm:px-6 py-1.5 flex items-center gap-2 sm:gap-3 shrink-0 w-full transition-colors duration-300 ${UI.header}`}
    >
        {/* ── LEFT: Logo / Brand (Home Button) ── */}
        <button
          type="button"
          className="flex items-center gap-2 shrink-0 cursor-pointer hover:scale-105 active:scale-95 transition-transform duration-150 outline-none text-left bg-transparent border-0 p-0"
          onClick={handleGoHome}
          title={t('header.homeTitle') || 'Trang chủ VNStock (Home)'}
          aria-label="Trang chủ VNStock"
        >
          <div className="w-9 h-9 sm:w-11 sm:h-11 flex items-center justify-center shrink-0 drop-shadow-md p-1 rounded-full hover:bg-yellow-400/10 transition-colors">
            <img src="/favicon.svg" alt={t('brand.logoAlt')} className="w-full h-full object-contain drop-shadow-[0_0_8px_rgba(250,204,21,0.3)]" />
          </div>
          <div className="hidden lg:block">
            <h1 className={`text-xl font-black tracking-tight leading-none ${UI.textBold} ${uiStyle === 'book' ? 'font-book tracking-normal' : ''}`}>
              OMNI <span className={uiStyle === 'book' ? (isDark ? 'text-[#c4a574] italic' : 'text-[#8a6b3d] italic') : 'text-yellow-400 italic'}>DUCK</span>
            </h1>
            <p className={`text-[9px] uppercase tracking-widest font-bold mt-1 ${UI.textMuted}`}>
              {t('brand.tagline')}
            </p>
          </div>
        </button>

        {/* ── CENTER: Search bar ── */}
        <div className="flex-1 relative min-w-0" ref={searchWrapperRef}>
            <div className={`absolute top-full mt-2 left-1/2 transform -translate-x-1/2 z-[60] px-4 py-2 bg-red-500/95 backdrop-blur-md text-white font-black text-xs tracking-widest rounded-full shadow-2xl transition-all duration-500 pointer-events-none max-w-[90vw] truncate
              ${errorAlert ? 'opacity-100 translate-y-0 visible' : 'opacity-0 -translate-y-4 invisible'}`}
            >
              {errorAlert}
            </div>

            {activeMode === 'CRYPTO' ? (
              <div className={`flex items-center justify-center h-9 sm:h-10 border rounded-xl px-3 border-purple-500/30 bg-purple-500/5`}>
                    <Globe size={14} className="text-purple-500 mr-2 animate-pulse shrink-0" />
                    <span className="text-purple-500 font-black uppercase tracking-widest text-[10px] sm:text-xs truncate">{t('header.cryptoTerminal')}</span>
                </div>
            ) : activeMode === 'INTERNATIONAL' ? (
              <div className={`flex items-center justify-center h-9 sm:h-10 border rounded-xl px-3 border-teal-500/30 bg-teal-500/5`}>
                    <Globe size={14} className="text-teal-400 mr-2 shrink-0" />
                    <span className="text-teal-400 font-black uppercase tracking-widest text-[10px] sm:text-xs truncate">{t('header.internationalTerminal')}</span>
                </div>
            ) : (activeMode === 'AUTO_TRADE' || activeMode === 'BROKER_CONNECTION') ? (
                <div
                  className={`flex items-center h-9 sm:h-10 border rounded-xl px-3 opacity-45 grayscale pointer-events-none select-none ${UI.searchBg}`}
                  title={t('search.disabledTitle')}
                  aria-disabled="true"
                >
                    <Search size={14} className="text-slate-400 mr-2 shrink-0" />
                    <input
                        type="text"
                        tabIndex={-1}
                        readOnly
                        disabled
                        placeholder={t('search.placeholderUnavailable')}
                        value=""
                        className={`flex-1 min-w-0 bg-transparent outline-none text-xs sm:text-sm font-bold uppercase cursor-not-allowed ${UI.searchInput}`}
                    />
                </div>
            ) : (
                <div className={`flex items-center h-9 sm:h-10 border rounded-xl px-2.5 sm:px-3 focus-within:border-yellow-400/50 transition-all ${UI.searchBg}`}>
                    <Search size={14} className="text-yellow-400 mr-2 shrink-0" />
                    <input
                        type="text"
                        placeholder={activeMode === 'VN_DERIVATIVES' ? t('search.placeholderDeriv') : t('search.placeholderSymbol')}
                        className={`flex-1 min-w-0 bg-transparent outline-none text-xs sm:text-sm font-bold uppercase ${UI.searchInput}`}
                        value={activeMode === 'VN_DERIVATIVES' ? "VN30F1M" : input}
                        onChange={(e) => { setInput(e.target.value.toUpperCase()); setShowSuggestions(true); }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') runSearch();
                          if (e.key === 'Escape') setShowSuggestions(false);
                        }}
                        onFocus={() => { if (input.trim()) setShowSuggestions(true); }}
                        disabled={loadingMarket || activeMode === 'VN_DERIVATIVES'}
                    />
                    <button
                      type="button"
                      onClick={runSearch}
                      className="h-7 w-7 shrink-0 flex items-center justify-center rounded-lg bg-yellow-400 text-black disabled:opacity-50 ml-1.5 md:hidden"
                      disabled={loadingMarket || !input || activeMode === 'VN_DERIVATIVES'}
                      aria-label={t('search.ariaLabel')}
                    >
                      <Search size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={runSearch}
                      className="hidden md:block h-7 px-4 rounded-lg bg-yellow-400 hover:bg-yellow-300 text-black font-black text-xs transition-all active:scale-95 disabled:opacity-50 ml-2"
                      disabled={loadingMarket || !input}
                    >
                      {t('search.button')}
                    </button>
                </div>
            )}

            {showSuggestions && suggestions.length > 0 && activeMode !== 'CRYPTO' && activeMode !== 'INTERNATIONAL' && activeMode !== 'AUTO_TRADE' && activeMode !== 'BROKER_CONNECTION' && (
              <div
                className={`absolute top-[calc(100%+8px)] left-0 right-0 z-[70] border rounded-2xl overflow-y-auto max-h-[min(50dvh,420px)] shadow-2xl backdrop-blur-2xl custom-scrollbar ${UI.card}`}
                style={{ isolation: 'isolate' }}
              >
                {suggestions.map((stock, index) => (
                  <button
                    key={stock.symbol || index}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setInput(stock.symbol);
                      setSuggestions([]);
                      setShowSuggestions(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 sm:px-5 py-3 transition-all border-b last:border-0 text-left group ${UI.cardHover}`}
                  >
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 pr-2 sm:pr-4">
                      <Zap size={13} className="text-yellow-400 shrink-0 group-hover:animate-pulse" />
                      <span className={`font-black text-sm tracking-wider transition-colors ${isDark ? 'text-emerald-400 group-hover:text-yellow-400' : 'text-emerald-600 group-hover:text-yellow-500'}`}>
                        {stock.symbol}
                      </span>
                      <span className={`text-[11px] font-medium truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        {formatCompanyName(stock.name || stock.companyName) || t('search.updatingName')}
                      </span>
                    </div>

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

        {/* ── RIGHT: Clock + Actions ── */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Mobile clock - chỉ hiện dưới xl */}
          <MobileHeaderClock marketOpen={marketOpen} isDark={isDark} />

          {/* Desktop clock + market badge - chỉ hiện xl+ */}
          <div className="hidden xl:flex items-center gap-3 shrink-0 select-none">
            <CyberpunkClock marketOpen={marketOpen} theme={isDark ? 'dark' : 'light'} is3D={clockIs3D} />
            <div
              className={`w-[9.75rem] shrink-0 px-3 py-2 rounded-2xl border font-black uppercase tracking-widest text-[11px] text-center
              ${marketOpen
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/40 shadow-[0_0_18px_rgba(16,185,129,0.25)]'
                : 'bg-red-500/10 text-red-400 border-red-500/40 shadow-[0_0_18px_rgba(239,68,68,0.25)]'
              } ${uiStyle === 'minimal' ? '!shadow-none' : ''} ${uiStyle === 'book' ? '!rounded-md !shadow-none' : ''}`}
            >
              <div className="flex items-center justify-center gap-2 whitespace-nowrap">
                <div className={`ui-dot w-2 h-2 rounded-full shrink-0 ${marketOpen ? 'bg-emerald-400' : 'bg-red-400'} ${uiStyle === 'minimal' ? '' : 'animate-pulse'}`} />
                {marketOpen ? t('header.marketOpen') : t('header.marketClosed')}
              </div>
            </div>
          </div>

          {/* Terminal log button - ẩn trên mobile */}
          <button type="button" onClick={() => setShowLogs(!showLogs)} className={`hidden md:flex items-center gap-2 px-3 h-9 rounded-xl text-[10px] font-black uppercase border transition-all ${showLogs ? 'bg-yellow-400 text-black border-yellow-400' : UI.btnLog}`}>
            <TerminalSquare size={15} />
            <span className="hidden xl:inline">{showLogs ? t('header.logsClose') : t('header.logsOpen')}</span>
          </button>

          {/* User menu */}
          <div className="relative shrink-0 z-[999999]">
            <button type="button" onClick={() => setShowUserMenu(!showUserMenu)} className={`h-9 w-9 sm:h-10 sm:w-10 flex items-center justify-center rounded-xl border transition-all ${showUserMenu ? 'bg-emerald-500 border-emerald-500 text-black' : UI.btnLog}`}>
              <Menu size={16} />
            </button>
            {showUserMenu && (
              <UserMenu
                isDark={isDark}
                UI={UI}
                currentUser={currentUser}
                activeMode={activeMode}
                setActiveMode={setActiveMode}
                setShowUserMenu={setShowUserMenu}
                handleLogout={handleLogout}
                is3DClock={is3DClock}
                uiStyle={uiStyle}
                fontScale={fontScale}
                language={language}
                handleToggleTheme={handleToggleTheme}
                handleToggleClockMode={handleToggleClockMode}
                handleSetUiStyle={handleSetUiStyle}
                handleSetFontScale={handleSetFontScale}
                handleSetLanguage={handleSetLanguage}
              />
            )}
          </div>
        </div>
    </header>
  );
};

 export default React.memo(AppHeader);
