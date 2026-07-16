import { 
  Activity, Zap, FileText, Database, BrainCircuit, 
  BarChart3, ChevronDown, ChevronUp, HelpCircle,
  ArrowLeft, MessageSquare, FileJson, ExternalLink,
  TrendingUp, TrendingDown, Minus, ShieldAlert, Radio, Newspaper, Bot,
  Loader2, CheckCircle2, XCircle, Globe, Clock, RefreshCw,
  Sparkles, ChevronRight, ChevronLeft, Pause, Play, RotateCcw, Target,
  AlertTriangle, Info, Copy, BookOpen, Layers, X, Download, Plus
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';

import TradingChart from './TradingChart';
import MarketOverview from './MarketOverview';
import MarketRadar from './MarketRadar';
import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import StockAiChat from './StockAiChat';
import AtomLoader from './AtomLoader';
import MarketInsightPanel from './MarketInsightPanel';
import { tcbsPdfEmbedUrl, API_BASE_URL } from '../lib/apiBase';
import { AI_REPORT_COOLDOWN_MS } from '../constants/aiReportCooldown';
// =====================================================================
// SHARED SUB-COMPONENTS (đồng bộ với DerivativesTab)
// =====================================================================

// ─── Tooltip nhỏ gọn, dùng lại ───────────────────────────────────────────────
function Tip({ text, children, side = 'top' }) {
  const [show, setShow] = useState(false);
  const posClass = side === 'top'
    ? 'bottom-full mb-2 left-0'
    : side === 'bottom'
    ? 'top-full mt-2 left-0'
    : 'bottom-full mb-2 right-0';
  return (
    <span className="relative inline-flex items-center" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children}
      {show && (
        <span className={`absolute ${posClass} w-56 p-2.5 rounded-xl shadow-2xl text-[10px] font-semibold leading-relaxed z-[200] bg-[#1a222e] text-slate-300 border border-slate-700 pointer-events-none`}>
          {text}
        </span>
      )}
    </span>
  );
}

// ─── Label section nhỏ ───────────────────────────────────────────────────────
function SectionLabel({ icon: Icon, label, color = 'text-slate-400', tip, action }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        {Icon && <Icon size={13} className={color} />}
        <span className={`text-[10px] font-black uppercase tracking-widest ${color}`}>{label}</span>
        {tip && (
          <Tip text={tip}>
            <HelpCircle size={12} className="text-slate-500 hover:text-yellow-400 transition-colors cursor-default" />
          </Tip>
        )}
      </div>
      {action}
    </div>
  );
}

// ─── Stat item: label + value ─────────────────────────────────────────────────
function StatRow({ label, value, valueClass = '', tip }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-white/4 last:border-0">
      <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1">
        {label}
        {tip && (
          <Tip text={tip}>
            <HelpCircle size={11} className="text-slate-500 hover:text-yellow-400 transition-colors cursor-default" />
          </Tip>
        )}
      </span>
      <span className={`text-[11px] font-black tabular-nums ${valueClass}`}>{value}</span>
    </div>
  );
}

// ─── Mini stat box ────────────────────────────────────────────────────────────
function MiniStat({ label, value, valueClass = '', isDark }) {
  return (
    <div className={`rounded-xl p-3 flex flex-col items-center gap-0.5 ${isDark ? 'bg-black/30 border border-white/5' : 'bg-slate-50 border border-slate-200'}`}>
      <span className="text-[8px] font-black uppercase tracking-wider text-slate-400">{label}</span>
      <span className={`text-sm font-black ${valueClass}`}>{value}</span>
    </div>
  );
}

// ─── Mobile Tab Button (icon + label, đồng bộ DerivativesTab) ────────────────
function MobileTabBtn({ active, onClick, icon: Icon, label, isDark }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-black uppercase tracking-widest transition-all border-b-2 ${
        active
          ? 'border-yellow-500 text-yellow-500'
          : `border-transparent ${isDark ? 'text-slate-500 hover:text-slate-400' : 'text-slate-400 hover:text-slate-500'}`
      }`}
    >
      <Icon size={15} />
      {label}
    </button>
  );
}

// ─── Card wrapper (đồng bộ DerivativesTab) ────────────────────────────────────
function DataCard({ children, className = '', isDark, accent = false, noPad = false }) {
  const base = isDark
    ? accent ? 'bg-[#0f1520] border-yellow-500/25' : 'bg-[#131922] border-white/6'
    : accent ? 'bg-yellow-50 border-yellow-200' : 'bg-white border-slate-200';
  return (
    <div className={`rounded-2xl border ${noPad ? '' : 'p-4'} ${base} ${className}`}>
      {children}
    </div>
  );
}

// =====================================================================
// COMPONENT: COMPANY OVERVIEW 
// =====================================================================
const CompanyOverview = React.memo(function CompanyOverview({ profile, isDark, UI }) {
  const [expanded, setExpanded] = useState(false);
  const p = profile;
  const hasDetail = p?.industry || p?.address;

  return (
    <div className={`rounded-2xl border mb-5 overflow-hidden ${isDark ? 'bg-[#131922] border-white/6' : 'bg-white border-slate-200'}`}>
      <button
        onClick={() => setExpanded(v => !v)}
        className={`w-full flex items-center justify-between px-4 pt-4 pb-2 transition-colors ${isDark ? 'hover:bg-white/3' : 'hover:bg-slate-50'}`}
      >
        <p className="text-[10px] uppercase tracking-widest text-yellow-500 font-black flex items-center gap-2">
          <Activity size={12} /> Tổng quan doanh nghiệp
        </p>
        {hasDetail && (
          expanded
            ? <ChevronUp size={14} className={isDark ? 'text-gray-400' : 'text-gray-500'} />
            : <ChevronDown size={14} className={isDark ? 'text-gray-400' : 'text-gray-500'} />
        )}
      </button>

      {hasDetail ? (
        <div className="px-4 pb-3 space-y-1.5">
          {p.industry        && <p className={`text-[11px] ${UI.textMuted}`}>🏭 <span className="font-bold">Ngành:</span> {p.industry}</p>}
          {p.listing_date    && <p className={`text-[11px] ${UI.textMuted}`}>📅 <span className="font-bold">GDĐT:</span> {p.listing_date}</p>}
          {p.charter_capital && <p className={`text-[11px] ${UI.textMuted}`}>💰 <span className="font-bold">Vốn điều lệ:</span> {p.charter_capital}</p>}
          {p.shares_listed   && <p className={`text-[11px] ${UI.textMuted}`}>📊 <span className="font-bold">CP niêm yết:</span> {p.shares_listed}</p>}
        </div>
      ) : (
        <div className="px-4 pb-4">
          <p className={`text-[11px] leading-relaxed italic whitespace-pre-line ${UI.textMuted}`}>{p?.overview}</p>
        </div>
      )}

      {expanded && hasDetail && (
        <div className={`px-4 pb-4 pt-3 border-t space-y-1.5 ${isDark ? 'border-white/5' : 'border-slate-200'}`}>
          {p.address  && <p className={`text-[11px] ${UI.textMuted}`}>📍 {p.address}</p>}
          {p.phone    && <p className={`text-[11px] ${UI.textMuted}`}>📞 {p.phone}</p>}
          {p.email    && <a href={`mailto:${p.email}`} className="text-[11px] text-blue-400 hover:underline block">✉️ {p.email}</a>}
          {p.website  && <a href={p.website} target="_blank" rel="noreferrer" className="text-[11px] text-blue-400 hover:underline block">🌐 {p.website}</a>}
          {p.description && (
            <div className={`mt-2 pt-2 border-t space-y-2 ${isDark ? 'border-white/5' : 'border-slate-200'}`}>
              {p.description.split('\n\n').map((section, i) => (
                <p key={i} className={`text-[11px] leading-relaxed whitespace-pre-line ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  {section}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

// =====================================================================
// COMPONENT: LIVE DEBATE PREVIEW 
// =====================================================================
const LiveDebatePreview = React.memo(({ liveDebate, isDark }) => {
  const [isCollapsed, setIsCollapsed] = useState(true);  
  const steps = [
    { key: 'tech', icon: '📐', label: 'Kỹ thuật',      color: 'yellow' },
    { key: 'fund', icon: '🏦', label: 'Cơ bản',         color: 'yellow' },
    { key: 'news', icon: '📰', label: 'Tâm lý & Vĩ mô', color: 'yellow' },
    { key: 'bull', icon: '🟢', label: 'Phe Bò',          color: 'emerald' },
    { key: 'bear', icon: '🔴', label: 'Phe Gấu',         color: 'red' },
    { key: 'def',  icon: '⚡', label: 'Phản công Bò',   color: 'emerald' },
    { key: 'pm',   icon: '🏛️', label: 'PM Decision',    color: 'yellow' },
  ];
  const [activeKey, setActiveKey] = useState('tech');
  const available = steps.filter(s => liveDebate[s.key]);
  const completedCount = available.length;
  const isDebating = completedCount > 0 && completedCount < steps.length;  

  const liveDebateKeys = Object.keys(liveDebate).join(',');
  useEffect(() => {
    const latest = steps.filter(s => liveDebate[s.key]).pop();
    if (latest) setActiveKey(latest.key);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveDebateKeys]);

  if (available.length === 0) return null;

  const getTabStyle = (step) => {
    const isActive = activeKey === step.key;
    const isDone = !!liveDebate[step.key];
    if (!isDone) return `opacity-20 cursor-not-allowed ${isDark ? 'text-slate-600' : 'text-slate-300'}`;

    if (isActive) {
      if (step.color === 'red') return 'bg-red-500/15 text-red-400 border border-red-500/40 shadow-[0_0_10px_rgba(239,68,68,0.2)]';
      if (step.color === 'emerald') return 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/40 shadow-[0_0_10px_rgba(16,185,129,0.2)]';
      return 'bg-yellow-400/15 text-yellow-400 border border-yellow-400/40 shadow-[0_0_10px_rgba(250,204,21,0.2)]';
    }
    return isDark
      ? 'text-slate-400 border border-transparent hover:border-white/10 hover:text-slate-200 hover:bg-white/5'
      : 'text-slate-500 border border-transparent hover:border-slate-200 hover:bg-slate-100';
  };

  return (
    <div className={`w-full rounded-2xl border flex flex-col overflow-hidden animate-in fade-in duration-500 transition-all ${
      isDark ? 'bg-[#0a0f18] border-yellow-400/15' : 'bg-slate-50 border-yellow-400/30'
    } ${isDebating && isCollapsed ? 'shadow-[0_0_20px_rgba(234,179,8,0.2)] border-yellow-500/50 animate-pulse' : ''}`}>
      
      {/* Header (Bấm để đóng/mở) */}
      <button onClick={() => setIsCollapsed(!isCollapsed)} className={`px-4 py-3 flex items-center justify-between border-b shrink-0 transition-colors ${isDark ? 'border-white/6 hover:bg-white/3' : 'border-slate-200 hover:bg-slate-100'}`}>
        <div className="flex items-center gap-3">
          <div className="relative">
            <span className="text-yellow-400 text-sm">⚔️</span>
            {isDebating && <span className="absolute -top-1 -right-1 w-2 h-2 bg-yellow-400 rounded-full animate-ping opacity-75" />}
          </div>
          <div className="text-left flex-1 min-w-0">
            <span className="text-[10px] font-black uppercase tracking-widest text-yellow-500">Hội đồng AI đang tranh luận</span>
            <div className="flex items-center gap-2 mt-0.5">
              {steps.map((s) => (
                <div key={s.key} className={`w-4 h-1 rounded-full transition-all duration-500 ${
                  liveDebate[s.key] ? (s.color === 'red' ? 'bg-red-500' : s.color === 'emerald' ? 'bg-emerald-500' : 'bg-yellow-400') : (isDark ? 'bg-white/10' : 'bg-slate-200')
                }`} />
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-black tabular-nums px-2 py-0.5 rounded-full border ${isDark ? 'text-slate-400 border-white/10' : 'text-slate-500 border-slate-200'}`}>{completedCount}/7</span>
          <ChevronDown size={16} className={`transition-transform duration-300 ${isDark ? 'text-slate-400' : 'text-slate-500'} ${isCollapsed ? '' : 'rotate-180'}`} />
        </div>
      </button>

      {/* Content */}
      {!isCollapsed && (
        <div className="border-t border-white/6 bg-black/20">
          <div className="flex gap-1 p-2 overflow-x-auto shrink-0 custom-scrollbar border-b border-white/6">
            {steps.map(s => (
              <button key={s.key} onClick={() => liveDebate[s.key] && setActiveKey(s.key)} disabled={!liveDebate[s.key]} className={`shrink-0 px-2.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wide transition-all ${getTabStyle(s)}`}>
                {s.icon} {s.label}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto px-4 pb-4 pt-2 custom-scrollbar min-h-[180px]">
            <div className={`prose prose-sm max-w-none leading-relaxed
              ${isDark ? 'prose-invert prose-p:text-slate-300 prose-headings:text-yellow-400 prose-strong:text-white prose-li:text-slate-300' : 'prose-p:text-slate-700 prose-headings:text-yellow-600'}
              ${activeKey === 'bear' ? 'prose-headings:!text-red-400' : ''}
              ${activeKey === 'bull' || activeKey === 'def' ? 'prose-headings:!text-emerald-400' : ''}`}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{liveDebate[activeKey] || ''}</ReactMarkdown>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

// =====================================================================
// COMPONENT: DEBATE PANEL - KẾT QUẢ TRANH LUẬN
// =====================================================================
const LIVE_DEBATE_KEY_MAP = {
  tech: 'techAnalysis',
  fund: 'fundAnalysis',
  news: 'newsAnalysis',
  bull: 'bullCase',
  bear: 'bearCase',
  def: 'bullDefense',
  pm: 'pmDecision',
};

const coerceDebateResult = (debateResult, liveDebate) => {
  if (debateResult) return debateResult;
  if (!liveDebate || typeof liveDebate !== 'object') return null;
  const out = {};
  for (const [key, value] of Object.entries(liveDebate)) {
    const field = LIVE_DEBATE_KEY_MAP[key];
    if (field && value) out[field] = value;
  }
  return Object.keys(out).length > 0 ? out : null;
};

const DebatePanel = React.memo(({ debateResult, isDark, UI, forceCollapsed = false, defaultOpen = false, dockMode = false, hideDockHeader = false, open: openProp, onOpenChange, onLayoutChange }) => {
  const [openInternal, setOpenInternal] = useState(defaultOpen);
  const open = openProp !== undefined ? openProp : openInternal;
  const setOpen = onOpenChange ?? setOpenInternal;
  const [activeTab, setActiveTab] = useState('pm');

  useEffect(() => {
    if (forceCollapsed && !dockMode) setOpen(false);
  }, [forceCollapsed, dockMode, setOpen]);

  useEffect(() => {
    if (defaultOpen && debateResult && openProp === undefined) setOpen(true);
  }, [defaultOpen, debateResult, openProp, setOpen]);

  useEffect(() => {
    if (dockMode) onLayoutChange?.(open);
  }, [open, activeTab, dockMode, onLayoutChange]);

  if (!debateResult) return null;

  const tabs = [
    { id: 'pm',   label: 'PM Decision', icon: '🏛️', color: 'yellow',  content: debateResult.pmDecision },
    { id: 'bull', label: 'Phe Bò',      icon: '🟢', color: 'emerald', content: debateResult.bullCase },
    { id: 'bear', label: 'Phe Gấu',     icon: '🔴', color: 'red',     content: debateResult.bearCase },
    { id: 'def',  label: 'Phản công',   icon: '⚡', color: 'emerald', content: debateResult.bullDefense },
    { id: 'tech', label: 'Kỹ thuật',    icon: '📐', color: 'yellow',  content: debateResult.techAnalysis },
    { id: 'fund', label: 'Cơ bản',      icon: '🏦', color: 'yellow',  content: debateResult.fundAnalysis },
    { id: 'news', label: 'Tâm lý',      icon: '📰', color: 'yellow',  content: debateResult.newsAnalysis },
  ];

  const active = tabs.find(t => t.id === activeTab);

  const getTabActive = (tab) => {
    if (tab.color === 'red')     return 'bg-red-500/15 text-red-400 border border-red-500/35';
    if (tab.color === 'emerald') return 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/35';
    return 'bg-yellow-400/15 text-yellow-400 border border-yellow-400/35';
  };

  return (
    <div className={`w-full rounded-2xl border overflow-hidden transition-all duration-300 ${
      dockMode ? 'mb-0' : 'mb-6'
    } ${isDark ? 'bg-[#0a0f18] border-yellow-400/15' : 'bg-slate-50 border-yellow-400/30'}`}>
      {!(dockMode && hideDockHeader) && (
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between transition-all ${
          dockMode ? 'px-3 py-2' : 'px-5 py-4'
        } ${isDark ? 'hover:bg-white/3' : 'hover:bg-slate-100'}`}
      >
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center border transition-colors ${
            open
              ? isDark ? 'bg-yellow-400/15 border-yellow-400/30' : 'bg-yellow-50 border-yellow-300'
              : isDark ? 'bg-white/5 border-white/10' : 'bg-slate-100 border-slate-200'
          }`}>
            <span className="text-base">⚔️</span>
          </div>
          <div className="text-left">
            <p className="text-[11px] font-black uppercase tracking-widest text-yellow-500">
              Hội đồng AI Tranh luận Độc lập
            </p>
            <p className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              7 chuyên gia AI · Bull vs Bear · PM Decision
            </p>
          </div>
        </div>
        <div className={`flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-full border transition-all ${
          open
            ? isDark ? 'bg-yellow-400/10 border-yellow-400/30 text-yellow-400' : 'bg-yellow-50 border-yellow-300 text-yellow-600'
            : isDark ? 'border-white/10 text-slate-500' : 'border-slate-200 text-slate-400'
        }`}>
          {open
            ? <><ChevronUp size={12} /> Thu gọn</>
            : <><ChevronDown size={12} /> Xem tranh luận</>
          }
        </div>
      </button>
      )}

      {open && (
        <div className={`border-t animate-in slide-in-from-top-2 duration-300 ${isDark ? 'border-white/6' : 'border-slate-200'}`}>
          {/* Tabs */}
          <div className={`flex gap-1 p-3 overflow-x-auto border-b custom-scrollbar ${isDark ? 'border-white/6' : 'border-slate-200'}`}>
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`shrink-0 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wide transition-all ${
                  activeTab === tab.id
                    ? getTabActive(tab)
                    : isDark
                    ? 'text-slate-500 hover:text-slate-300 border border-transparent hover:border-white/10 hover:bg-white/5'
                    : 'text-slate-400 hover:text-slate-600 border border-transparent hover:border-slate-200 hover:bg-slate-50'
                }`}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="h-[340px] overflow-y-auto p-5 custom-scrollbar">
            <div className={`prose prose-sm max-w-none prose-headings:font-black prose-headings:uppercase
              ${isDark
                ? 'prose-invert prose-p:text-slate-300 prose-headings:text-yellow-400 prose-li:text-slate-300 prose-strong:text-white'
                : 'prose-p:text-slate-700 prose-headings:text-yellow-600 prose-li:text-slate-700'
              }
              ${active?.color === 'red' ? 'prose-headings:!text-red-400' : ''}
              ${active?.color === 'emerald' ? 'prose-headings:!text-emerald-400' : ''}
            `}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{active?.content || ''}</ReactMarkdown>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

// =====================================================================
// COMPONENT: TERMINAL NEWS STREAM ( UI IMPROVEMENTS)
// =====================================================================
const TerminalNewsStream = React.memo(({ newsList, loading, isDark }) => {
  const [displayedLines, setDisplayedLines] = useState([]);
  const [renderTick, setRenderTick] = useState(0); // single trigger for display updates

  // Keep typing state in refs to avoid re-renders on every keystroke
  const currentTextRef = useRef('');
  const newsIdxRef = useRef(0);
  const charIdxRef = useRef(0);
  const timerRef = useRef(null);

  useEffect(() => {
    // Reset khi news list thay đổi
    currentTextRef.current = '';
    newsIdxRef.current = 0;
    charIdxRef.current = 0;
    setRenderTick(t => t + 1);
  }, [newsList]);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    if (loading) {
      currentTextRef.current = 'SYS_LOG: FETCHING_DEEP_WEB_DATA_STREAM...';
      setRenderTick(t => t + 1);
      return;
    }
    if (!newsList || newsList.length === 0) {
      currentTextRef.current = 'SYS_LOG: NO_SIGNAL_FOUND. WAITING...';
      setRenderTick(t => t + 1);
      return;
    }

    const tick = () => {
      const currentNews = newsList[newsIdxRef.current];
      if (!currentNews) return;

      const prefix = currentNews.sentiment === 'positive' ? '[+🟢]' : currentNews.sentiment === 'negative' ? '[-🔴]' : '[*⚪]';
      const targetText = `root@omni-duck:~$ ${prefix} [${currentNews.date || 'Live'}] ${currentNews.title}`;

      if (charIdxRef.current < targetText.length) {
        // Advance 2-3 chars per tick để giảm số lần setState
        const step = Math.min(3, targetText.length - charIdxRef.current);
        charIdxRef.current += step;
        currentTextRef.current = targetText.slice(0, charIdxRef.current);
        setRenderTick(t => t + 1);
        timerRef.current = setTimeout(tick, 18 + Math.random() * 20);
      } else {
        timerRef.current = setTimeout(() => {
          setDisplayedLines(prev => [...prev.slice(-15), targetText]);
          charIdxRef.current = 0;
          currentTextRef.current = '';
          newsIdxRef.current = (newsIdxRef.current + 1) % newsList.length;
          setRenderTick(t => t + 1);
          timerRef.current = setTimeout(tick, 50);
        }, 2500);
      }
    };

    timerRef.current = setTimeout(tick, 50);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [newsList, loading]);

  return (
    <div className={`flex-1 h-full w-full min-h-[300px] p-5 font-mono text-[11px] relative overflow-hidden flex flex-col justify-end transition-colors duration-300 ${
      isDark
        ? 'bg-[#050505] text-emerald-400 shadow-[inset_0_0_40px_rgba(0,0,0,0.9)]'
        : 'bg-[#F1F5F9] text-slate-700 shadow-[inset_0_0_20px_rgba(0,0,0,0.05)] border-t border-slate-300'
    }`}>
      {isDark && <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_4px,3px_100%] opacity-20" />}
      <p className={`opacity-50 text-[9px] mb-3 border-b pb-1 uppercase tracking-widest ${
        isDark ? 'border-emerald-900/30 text-emerald-600' : 'border-slate-300 text-slate-500'
      }`}>
        Omni Duck Intelligence Terminal v2.4.0 // Secure Connection
      </p>
      <div className={`flex flex-col gap-1.5 ${isDark ? 'opacity-60' : 'opacity-80'}`}>
        {displayedLines.map((line, i) => (
          <p key={i} className="truncate">{line}</p>
        ))}
      </div>
      <div className="flex items-start mt-1.5 relative z-10">
        <span className="whitespace-pre-wrap leading-relaxed">{currentTextRef.current}</span>
        <span className={`w-1.5 h-3.5 animate-pulse ml-1 mt-0.5 inline-block ${isDark ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-slate-500'}`} />
      </div>
    </div>
  );
});

// =====================================================================
// COMPONENT : AI ANALYSIS LOADING SCREEN 
//Clearly separate the 3 stages: Launch → Debate → Stream report
// =====================================================================
const AiAnalysisLoader = React.memo(({
  analyzing, aiReport, liveDebate,
  analysisStep, analysisProgress, aiAnalysisEta,
  elapsedTime, isDark, UI,
  loadingCard, cardFlip, quizSelected, setQuizSelected,
  advanceCard, shownQuizIndicesRef,
  isAutoScroll, setIsAutoScroll
}) => {
  if (!analyzing) return null;

  const syncedProgress = Math.max(3, Math.min(100, Number(analysisProgress) || 3));
  const isStreaming = !!aiReport;
  const hasDebate = Object.keys(liveDebate || {}).length > 0;

  const etaLabel = typeof aiAnalysisEta === 'number'
    ? (aiAnalysisEta <= 0 ? 'Đang hoàn tất...' : `~${aiAnalysisEta}s`)
    : '...';

  // Progress segments: Pre-analysis (0-30%), Debate (30-80%), Streaming (80-100%)
  const phase = syncedProgress < 30 ? 'init'
    : syncedProgress < 80 ? 'debate'
    : 'stream';

  const phaseConfig = {
    init:   { label: 'Khởi động & Thu thập dữ liệu', color: 'text-sky-400',     bar: 'from-sky-500 to-sky-400'   },
    debate: { label: 'Hội đồng AI đang tranh luận',  color: 'text-yellow-400',  bar: 'from-yellow-500 to-amber-400' },
    stream: { label: 'Xuất báo cáo chính thức',       color: 'text-emerald-400', bar: 'from-emerald-500 to-emerald-400' },
  };
  const cfg = phaseConfig[phase];

  return (
    <div className="w-full mt-4 mb-6 animate-in fade-in duration-500 space-y-4">

      {/* ═══ PROGRESS HEADER ═══ */}
      <div className={`w-full rounded-2xl border overflow-hidden ${isDark ? 'bg-[#080c14] border-yellow-400/15' : 'bg-white border-yellow-300/40 shadow-sm'}`}>
        {/* Top accent bar - animated */}
        <div className="h-0.5 w-full overflow-hidden relative">
          <div
            className={`h-full bg-gradient-to-r ${cfg.bar} transition-all duration-1000 ease-out`}
            style={{ width: `${syncedProgress}%` }}
          />
          {/* Shimmer effect */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" style={{ backgroundSize: '200% 100%' }} />
        </div>

        <div className="px-5 py-4 flex items-start gap-4">
          {/* Atom Icon area */}
          <div className="shrink-0 pt-0.5">
            <AtomLoader message="" progress={syncedProgress} compact />
          </div>

          {/* Status text */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${
                phase === 'init'   ? (isDark ? 'text-sky-400 border-sky-500/30 bg-sky-500/10' : 'text-sky-600 border-sky-300 bg-sky-50') :
                phase === 'debate' ? (isDark ? 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10' : 'text-yellow-600 border-yellow-300 bg-yellow-50') :
                                     (isDark ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' : 'text-emerald-600 border-emerald-300 bg-emerald-50')
              }`}>
                {cfg.label}
              </span>
              <span className={`text-[10px] font-black tabular-nums ml-auto ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                {Math.round(syncedProgress)}%
              </span>
            </div>

            <p className={`text-[12px] font-semibold leading-snug truncate ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
              {analysisStep || 'OMNI DUCK đang khởi chạy hệ thống...'}
            </p>

            {/* Mini stats row */}
            <div className="flex items-center gap-4 mt-2.5">
              <span className={`flex items-center gap-1 text-[10px] font-bold ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                <Clock size={10} />
                {elapsedTime}s đã trôi
              </span>
              {aiAnalysisEta !== null && (
                <span className={`flex items-center gap-1 text-[10px] font-bold ${isDark ? 'text-yellow-500' : 'text-yellow-600'}`}>
                  <Zap size={10} />
                  ETA: {etaLabel}
                </span>
              )}
              {isStreaming && (
                <span className="flex items-center gap-1 text-[10px] font-black text-emerald-400 animate-pulse">
                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-ping" />
                  Đang stream báo cáo
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 3-phase progress track */}
        <div className={`px-5 pb-4 border-t ${isDark ? 'border-white/5' : 'border-slate-100'}`}>
          <div className="flex items-center gap-1 mt-3">
            {['init', 'debate', 'stream'].map((p, i) => {
              const done = (p === 'init' && syncedProgress >= 30)
                || (p === 'debate' && syncedProgress >= 80)
                || (p === 'stream' && syncedProgress >= 100);
              const active = phase === p;
              const labels = ['Khởi động', 'Tranh luận', 'Báo cáo'];
              return (
                <div key={p} className="flex items-center gap-1 flex-1">
                  <div className={`flex-1 flex items-center gap-1.5 py-1.5 px-2 rounded-lg border transition-all duration-500 ${
                    done    ? (isDark ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-emerald-50 border-emerald-200')   :
                    active  ? (isDark ? 'bg-yellow-500/10 border-yellow-400/30' : 'bg-yellow-50 border-yellow-300')       :
                              (isDark ? 'bg-white/3 border-white/5' : 'bg-slate-50 border-slate-200')
                  }`}>
                    <span className={`text-[9px] font-black uppercase tracking-wide ${
                      done   ? 'text-emerald-400' :
                      active ? 'text-yellow-400'  :
                               (isDark ? 'text-slate-600' : 'text-slate-300')
                    }`}>
                      {done ? '✓' : active ? '⟳' : '○'} {labels[i]}
                    </span>
                  </div>
                  {i < 2 && <ChevronRight size={10} className={isDark ? 'text-slate-700 shrink-0' : 'text-slate-300 shrink-0'} />}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ═══ DEBATE LIVE PREVIEW (hiện khi phase=debate hoặc stream) ═══ */}
      {(hasDebate) && (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
          <LiveDebatePreview liveDebate={liveDebate} isDark={isDark} />
        </div>
      )}

      {/* ═══ KNOWLEDGE CARD (hiện khi chưa stream) ═══ */}
      {!isStreaming && (
        <div className={`w-full rounded-2xl border overflow-hidden transition-all duration-350 ${
          cardFlip ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
        } ${isDark ? 'bg-[#0a0f18] border-white/8' : 'bg-white border-slate-200 shadow-sm'}`}>
          {loadingCard.type === 'fact' ? (
            <div className="p-4">
              <div className="flex items-center gap-2 mb-2.5">
                <span className="text-lg">{loadingCard.icon}</span>
                <span className={`text-[9px] font-black uppercase tracking-widest ${isDark ? 'text-yellow-400' : 'text-yellow-600'}`}>
                  Bạn có biết? · Chờ AI một chút nào...
                </span>
              </div>
              <p className={`text-[12px] leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                {loadingCard.text}
              </p>
            </div>
          ) : (
            <div className="p-4">
              <div className="flex items-center gap-2 mb-2.5">
                <span className="text-lg">{loadingCard.icon}</span>
                <span className={`text-[9px] font-black uppercase tracking-widest ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
                  Câu hỏi nhanh · Thử tài bạn nào
                </span>
              </div>
              <p className={`text-[12px] font-bold leading-snug mb-3 ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                {loadingCard.question}
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {loadingCard.options.map((opt, i) => {
                  const isCorrect = i === loadingCard.answer;
                  const isSelected = quizSelected === i;
                  const revealed = quizSelected !== null;
                  let cls = 'text-[11px] font-bold px-3 py-2 rounded-xl border text-left transition-all cursor-pointer ';
                  if (!revealed)       cls += isDark ? 'border-white/10 text-slate-400 hover:border-yellow-400/50 hover:text-yellow-300 hover:bg-yellow-400/5' : 'border-slate-200 text-slate-500 hover:border-yellow-400 hover:text-yellow-700 hover:bg-yellow-50';
                  else if (isCorrect)  cls += 'border-emerald-500 bg-emerald-500/15 text-emerald-400';
                  else if (isSelected) cls += 'border-red-500 bg-red-500/10 text-red-400';
                  else                 cls += isDark ? 'border-white/5 text-slate-600' : 'border-slate-100 text-slate-400';
                  return (
                    <button key={i} className={cls}
                      onClick={() => {
                        setQuizSelected(i);
                        setTimeout(() => advanceCard(pickUnseen(VN_QUIZ_ONLY, shownQuizIndicesRef.current)), 1800);
                      }}
                      disabled={revealed}
                    >
                      {revealed && isCorrect ? '✓ ' : revealed && isSelected ? '✗ ' : ''}{opt}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ AUTO-SCROLL CONTROL khi đang stream ═══ */}
      {isStreaming && (
        <div className={`flex items-center justify-between px-4 py-2.5 rounded-xl border animate-in fade-in duration-300 ${
          isDark ? 'bg-[#0a0f18] border-white/8' : 'bg-white border-slate-200'
        }`}>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
            <span className={`text-[10px] font-black uppercase tracking-widest ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Báo cáo đang được viết
            </span>
          </div>
          <button
            onClick={() => setIsAutoScroll(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wide border transition-all ${
              isAutoScroll
                ? (isDark ? 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' : 'bg-yellow-50 text-yellow-700 border-yellow-300')
                : (isDark ? 'bg-white/5 text-slate-500 border-white/10' : 'bg-slate-50 text-slate-400 border-slate-200')
            }`}
          >
            {isAutoScroll ? <><Pause size={10} /> Dừng cuộn</> : <><Play size={10} /> Cuộn theo</>}
          </button>
        </div>
      )}
    </div>
  );
});

// =====================================================================
// COMPONENT
// ======================================================================
const AiReportHeader = ({ isDark, UI, marketData, actionData, isUpdatingAction, aiAnalysisDuration, vnReportTimestamp, setShowPdfModal, scrollContainerRef, setIsChatOpen, aiReport, setShowFullReportModal, compact = false, dockMode = false, externalToolbar = false, showMore: showMoreProp, onShowMoreChange, onScrollToTop, onLayoutChange }) => {
  const [copied, setCopied] = useState(false);
  const [showMoreInternal, setShowMoreInternal] = useState(false);
  const showMore = showMoreProp !== undefined ? showMoreProp : showMoreInternal;
  const setShowMore = onShowMoreChange ?? setShowMoreInternal;
  const sym = marketData?.stockInfo?.symbol;
  const showFullLayout = dockMode || !compact;

  useEffect(() => {
    if (!compact && !dockMode) setShowMore(false);
  }, [compact, dockMode, setShowMore]);

  useEffect(() => {
    if (compact) onLayoutChange?.(showMore);
  }, [showMore, compact, onLayoutChange]);

  useEffect(() => {
    if (dockMode) onLayoutChange?.(true);
  }, [dockMode, onLayoutChange]);

  const scrollToTop = () => {
    if (onScrollToTop) onScrollToTop();
    else scrollContainerRef?.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCopy = () => {
    if (aiReport) {
      navigator.clipboard.writeText(aiReport).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  const safeTime = vnReportTimestamp ? new Date(vnReportTimestamp) : null;
  const isValidDate = safeTime && !isNaN(safeTime.getTime());
  
  const displayTime = isValidDate 
    ? safeTime.toLocaleTimeString('vi-VN', { 
        hour: '2-digit', minute: '2-digit', 
        day: '2-digit', month: '2-digit', year: 'numeric' 
      }) 
    : null;

  const isFresh = aiAnalysisDuration != null || (isValidDate && (Date.now() - safeTime.getTime() < AI_REPORT_COOLDOWN_MS));

  const timeColorClass = isFresh 
      ? (isDark ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' : 'text-emerald-600 border-emerald-300 bg-emerald-50')
      : (isDark ? 'text-slate-400 border-white/10 bg-white/5' : 'text-slate-500 border-slate-200 bg-slate-50');

  if (compact && externalToolbar && !showMore) return null;

  const paddingClass = dockMode ? 'px-4 py-3' : compact ? 'px-3 py-2' : 'px-5 py-4';
  const marginClass = dockMode ? 'mb-0' : compact ? 'mb-2' : 'mb-4';

  const fullLayout = (
    <>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isDark ? 'bg-yellow-400/10 border border-yellow-400/20' : 'bg-yellow-50 border border-yellow-200'}`}>
            <Sparkles size={16} className="text-yellow-400" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-yellow-500">Báo cáo Omni Duck AI</p>
            <p className={`text-[11px] font-bold truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              {sym} · {marketData?.companyProfile?.companyName || ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
          {displayTime && (
            <span className={`flex items-center gap-1 text-[9px] font-bold px-2.5 py-1 rounded-full border transition-colors duration-500 ${timeColorClass}`}>
              <Clock size={10} className={isFresh ? 'animate-pulse' : ''} />
              {isFresh ? 'Báo cáo vừa tạo:' : 'Báo cáo tạo ngày:'} {displayTime}
            </span>
          )}
          {aiAnalysisDuration && (
            <span className={`flex items-center gap-1 text-[9px] font-bold px-2 py-1 rounded-full border ${isDark ? 'text-sky-400 border-sky-500/20 bg-sky-500/5' : 'text-sky-600 border-sky-200 bg-sky-50'}`}>
              <Zap size={9} />
              {aiAnalysisDuration}s
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => setIsChatOpen(true)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wide transition-all active:scale-95 border ${
            isDark ? 'bg-yellow-400/10 text-yellow-400 border-yellow-500/25 hover:bg-yellow-400/20' : 'bg-yellow-50 text-yellow-700 border-yellow-300 hover:bg-yellow-100'
          }`}
        >
          <MessageSquare size={13} /> Chat về báo cáo này
        </button>

        {marketData?.reportPdf && (
          <button
            type="button"
            onClick={() => setShowPdfModal(true)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wide transition-all active:scale-95 border ${
              isDark ? 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <FileText size={13} /> Xem PDF TCBS
          </button>
        )}

        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setShowFullReportModal(true)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wide transition-all active:scale-95 border ${
              isDark ? 'bg-sky-500/15 text-sky-400 border-sky-500/30 hover:bg-sky-500/25' : 'bg-sky-50 text-sky-600 border-sky-300 hover:bg-sky-100'
            }`}
          >
            <BookOpen size={13} /> Đọc toàn bộ báo cáo
          </button>

          <button
            type="button"
            onClick={handleCopy}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wide transition-all active:scale-95 border ${
              copied
                ? (isDark ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' : 'bg-emerald-50 text-emerald-600 border-emerald-200')
                : (isDark ? 'bg-white/5 text-slate-500 border-white/8 hover:text-slate-300' : 'bg-slate-50 text-slate-400 border-slate-200 hover:text-slate-600')
            }`}
          >
            {copied ? <><CheckCircle2 size={13} /> Đã sao chép!</> : <><Copy size={13} /> Copy báo cáo</>}
          </button>

          {!dockMode && (
            <button
              type="button"
              onClick={scrollToTop}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wide transition-all active:scale-95 border ${
                isDark ? 'bg-white/5 text-slate-500 border-white/8 hover:text-slate-300' : 'bg-slate-50 text-slate-400 border-slate-200 hover:text-slate-600'
              }`}
            >
              <ChevronUp size={13} /> Lên đầu
            </button>
          )}
        </div>
      </div>
    </>
  );

  return (
    <div
      className={`w-full rounded-2xl border overflow-hidden ${marginClass} ${isDark ? 'border-yellow-400/15' : 'border-yellow-400/20 shadow-sm'}`}
      style={{ backgroundColor: isDark ? '#080c14' : '#ffffff' }}
    >
      <div className="h-0.5 w-full bg-gradient-to-r from-yellow-500 via-amber-400 to-yellow-500" />
      <div className={paddingClass}>
        {showFullLayout ? fullLayout : (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <Sparkles size={14} className="text-yellow-400 shrink-0" />
              <div className="min-w-0">
                <p className={`text-[11px] font-black uppercase tracking-widest truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>{sym}</p>
                {marketData?.companyProfile?.companyName && (
                  <p className={`text-[9px] font-semibold truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    {marketData.companyProfile.companyName}
                  </p>
                )}
              </div>
              {displayTime && (
                <span className={`hidden sm:flex items-center gap-1 text-[8px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${timeColorClass}`}>
                  <Clock size={9} />
                  {displayTime}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button type="button" onClick={() => setIsChatOpen(true)} title="Chat" className={`w-10 h-10 rounded-xl flex items-center justify-center border ${isDark ? 'bg-yellow-400/15 text-yellow-400 border-yellow-400/50' : 'bg-yellow-50 text-yellow-700 border-yellow-500/55'}`}>
                <MessageSquare size={16} />
              </button>
              <button type="button" onClick={() => setShowMore(!showMore)} title="Thêm" className={`w-10 h-10 rounded-xl flex items-center justify-center border ${showMore ? (isDark ? 'bg-yellow-400/20 text-yellow-300 border-yellow-400/55' : 'bg-yellow-100 text-yellow-800 border-yellow-500/60') : (isDark ? 'bg-white/8 text-slate-200 border-white/15' : 'bg-white text-slate-600 border-slate-300')}`}>
                <Plus size={17} className={`transition-transform ${showMore ? 'rotate-45' : ''}`} />
              </button>
            </div>
          </div>
        )}
        {compact && showMore && (
          <div className={`flex items-center gap-2 flex-wrap ${externalToolbar ? 'pt-1' : 'mt-2 pt-2 border-t border-white/6'}`}>
            {marketData?.reportPdf && (
              <button type="button" onClick={() => setShowPdfModal(true)} className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-bold uppercase border ${isDark ? 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}>
                <FileText size={13} /> PDF
              </button>
            )}
            <button type="button" onClick={() => setShowFullReportModal(true)} className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-bold uppercase border ${isDark ? 'bg-sky-500/15 text-sky-400 border-sky-500/30 hover:bg-sky-500/25' : 'bg-sky-50 text-sky-600 border-sky-300 hover:bg-sky-100'}`}>
              <BookOpen size={13} /> Full
            </button>
            <button type="button" onClick={handleCopy} className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-bold uppercase border ${copied ? (isDark ? 'text-emerald-400 border-emerald-500/25 bg-emerald-500/10' : 'text-emerald-600 border-emerald-200 bg-emerald-50') : (isDark ? 'text-slate-400 border-white/10 hover:bg-white/5' : 'text-slate-500 border-slate-200 hover:bg-slate-50')}`}>
              {copied ? <><CheckCircle2 size={13} /> Đã copy</> : <><Copy size={13} /> Copy</>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// =====================================================================
// COMPONENT: ACTION SIGNAL CARD 
// =====================================================================
const ActionSignalCard = ({ actionData, isUpdatingAction, isDark, UI, forceCollapsed = false, defaultCollapsed = false, dockMode = false, hideDockHeader = false, collapsed: collapsedProp, onCollapsedChange, className = '', onLayoutChange }) => {
  const [isCollapsedInternal, setIsCollapsedInternal] = useState(defaultCollapsed || (forceCollapsed && !dockMode));
  const isCollapsed = collapsedProp !== undefined ? collapsedProp : isCollapsedInternal;
  const setIsCollapsed = onCollapsedChange ?? setIsCollapsedInternal;

  useEffect(() => {
    if (forceCollapsed && !dockMode) setIsCollapsed(true);
  }, [forceCollapsed, dockMode, setIsCollapsed]);

  useEffect(() => {
    if (dockMode) onLayoutChange?.(!isCollapsed);
  }, [isCollapsed, dockMode, onLayoutChange]);

  if (!actionData?.action) return null;

  const isBuy  = actionData.action.includes('MUA');
  const isSell = actionData.action.includes('BÁN');
  const isHold = !isBuy && !isSell;

  const colorCfg = isBuy
    ? { border: 'border-emerald-500/60', bg: isDark ? 'bg-[#071a10]' : 'bg-emerald-50', bgSolid: isDark ? '#071a10' : '#ecfdf5', badge: 'bg-emerald-500 shadow-emerald-500/50', glow: isDark ? 'shadow-[0_0_30px_rgba(16,185,129,0.15)]' : '' }
    : isSell
    ? { border: 'border-red-500/60',     bg: isDark ? 'bg-[#130c0c]' : 'bg-red-50',     bgSolid: isDark ? '#130c0c' : '#fef2f2', badge: 'bg-red-500 shadow-red-500/50',         glow: isDark ? 'shadow-[0_0_30px_rgba(239,68,68,0.15)]' : '' }
    : { border: 'border-yellow-500/50',  bg: isDark ? 'bg-[#12100a]' : 'bg-yellow-50',  bgSolid: isDark ? '#12100a' : '#fefce8', badge: 'bg-yellow-500 shadow-yellow-500/50',    glow: isDark ? 'shadow-[0_0_30px_rgba(234,179,8,0.15)]'  : '' };

  return (
    <div
      className={`w-full rounded-2xl border-2 overflow-hidden ${dockMode ? 'mb-0' : 'mb-6 animate-in slide-in-from-top-3 duration-500'} ${colorCfg.border} ${colorCfg.bg} ${colorCfg.glow} ${className}`}
      style={{ backgroundColor: colorCfg.bgSolid }}
    >
      {!(dockMode && hideDockHeader) && (
      <div 
        onClick={() => setIsCollapsed(!isCollapsed)}
        className={`px-5 py-3 flex items-center gap-3 cursor-pointer group transition-colors select-none ${isCollapsed ? '' : 'border-b ' + (isDark ? 'border-white/5' : 'border-black/5')} ${isDark ? 'hover:bg-white/5' : 'hover:bg-slate-50'}`}
      >
        {/* Status dot */}
        <div className="relative shrink-0">
          <div className={`w-2.5 h-2.5 rounded-full ${isBuy ? 'bg-emerald-400' : isSell ? 'bg-red-400' : 'bg-yellow-400'}`} />
          {!isUpdatingAction && <div className={`absolute inset-0 rounded-full animate-ping ${isBuy ? 'bg-emerald-400' : isSell ? 'bg-red-400' : 'bg-yellow-400'} opacity-60`} />}
        </div>

        {/* Action badge */}
        <div className={`px-4 py-1 rounded-lg font-black tracking-widest text-sm text-white shadow-lg shrink-0 ${colorCfg.badge}`}>
          {actionData.action}
        </div>

        {/* Cấu hình hiển thị dồn 1 hàng khi Collapse */}
        {isCollapsed ? (
          <div className="flex-1 flex items-center gap-4 ml-2 overflow-x-auto no-scrollbar whitespace-nowrap">
             <div className="flex items-center gap-1.5">
               <span className={`text-[9px] font-black uppercase tracking-widest ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Entry</span>
               <span className={`text-[12px] font-black ${UI.textBold}`}>{actionData.entry}</span>
             </div>
             <div className="flex items-center gap-1.5">
               <span className={`text-[9px] font-black uppercase tracking-widest text-red-400/80`}>SL</span>
               <span className={`text-[12px] font-black text-red-400`}>{actionData.stoploss}</span>
             </div>
             <div className="flex items-center gap-1.5">
               <span className={`text-[9px] font-black uppercase tracking-widest text-emerald-400/80`}>T1</span>
               <span className={`text-[12px] font-black text-emerald-400`}>{actionData.target1 || 'N/A'}</span>
             </div>
             {(actionData.target2 && actionData.target2 !== 'N/A') && (
               <div className="flex items-center gap-1.5">
                 <span className={`text-[9px] font-black uppercase tracking-widest text-emerald-400/80`}>T2</span>
                 <span className={`text-[12px] font-black text-emerald-400`}>{actionData.target2}</span>
               </div>
             )}
          </div>
        ) : (
          <span className={`text-[10px] font-black uppercase tracking-widest shrink-0 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Live Signal
          </span>
        )}

        <div className="ml-auto flex items-center gap-3 shrink-0">
          {isUpdatingAction && (
            <span className={`flex items-center gap-1.5 text-[9px] font-bold ${isDark ? 'text-yellow-400' : 'text-yellow-600'}`}>
              <Loader2 size={11} className="animate-spin" /> Đang cập nhật...
            </span>
          )}

          {actionData.conviction && !isCollapsed && (
            <span className={`px-2.5 py-1 rounded-full text-[9px] font-black border ${
              actionData.conviction === 'Cao'
                ? (isDark ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' : 'bg-emerald-50 text-emerald-600 border-emerald-200')
                : (isDark ? 'bg-yellow-500/15 text-yellow-400 border-yellow-500/25' : 'bg-yellow-50 text-yellow-600 border-yellow-200')
            }`}>
              Độ tin cậy: {actionData.conviction}
            </span>
          )}
          
          {/* Nút Chevron biểu thị Collapse */}
          <div className={`p-1.5 rounded-full transition-colors ${isDark ? 'bg-white/5 text-slate-400 group-hover:bg-white/10' : 'bg-black/5 text-slate-500 group-hover:bg-black/10'}`}>
            {isCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </div>
        </div>
      </div>
      )}

      {dockMode && hideDockHeader && isCollapsed && actionData.reason && (
        <div className={`px-4 py-2.5 border-b ${isDark ? 'border-white/5' : 'border-black/5'}`}>
          <p className={`text-[10px] font-medium leading-relaxed italic line-clamp-2 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
            <span className="font-black not-italic text-yellow-500">Lý do: </span>{actionData.reason}
          </p>
        </div>
      )}

      {/* Expandable Content (Chỉ hiển thị khi đang mở) */}
      {!isCollapsed && (
        <div className="p-5 animate-in slide-in-from-top-2 duration-300">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            {/* Entry */}
            <div className={`col-span-1 p-3 rounded-xl border flex flex-col ${isDark ? 'bg-black/20 border-white/8' : 'bg-white/60 border-black/8'}`}>
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Entry</p>
              <p className={`font-black text-base leading-none ${UI.textBold}`}>{actionData.entry}</p>
            </div>

            {/* Stop Loss */}
            <div className={`col-span-1 p-3 rounded-xl border flex flex-col ${isDark ? 'bg-black/20 border-red-500/15' : 'bg-red-50/50 border-red-200/50'}`}>
              <p className="text-[9px] font-black uppercase tracking-widest text-red-400 mb-1">Stop Loss</p>
              <p className={`font-black text-base leading-none text-red-400`}>{actionData.stoploss}</p>
            </div>

            {/* T1 */}
            <div className={`p-3 rounded-xl border flex flex-col ${isDark ? 'bg-black/20 border-emerald-500/15' : 'bg-emerald-50/50 border-emerald-200/50'}`}>
              <p className="text-[9px] font-black uppercase tracking-widest text-emerald-400 mb-1">Target 1</p>
              <p className={`font-black text-sm leading-none text-emerald-400`}>{actionData.target1 || 'N/A'}</p>
            </div>

            {/* T2 */}
            <div className={`p-3 rounded-xl border flex flex-col ${isDark ? 'bg-black/20 border-emerald-500/15' : 'bg-emerald-50/50 border-emerald-200/50'}`}>
              <p className="text-[9px] font-black uppercase tracking-widest text-emerald-400 mb-1">Target 2</p>
              <p className={`font-black text-sm leading-none text-emerald-400`}>{actionData.target2 || 'N/A'}</p>
            </div>
          </div>

          {/* Long term target */}
          {actionData.longTermTarget && actionData.longTermTarget !== 'N/A' && (
            <div className={`mb-3 p-3 rounded-xl border flex items-center justify-between gap-3 ${isDark ? 'bg-yellow-500/5 border-yellow-500/15' : 'bg-yellow-50/70 border-yellow-200'}`}>
              <div>
                <p className="text-[9px] text-yellow-500 font-black uppercase tracking-widest">Dự phóng Dài hạn (6–12 tháng)</p>
                <p className={`text-sm font-black mt-0.5 ${UI.textBold}`}>Mục tiêu: {actionData.longTermTarget} VNĐ</p>
              </div>
              {actionData.longTermHorizon && (
                <div className="text-right shrink-0">
                  <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest">Kỳ vọng</p>
                  <p className="text-xs font-black text-slate-300 mt-0.5">📅 {actionData.longTermHorizon}</p>
                </div>
              )}
            </div>
          )}

          {/* Reason */}
          {actionData.reason && (
            <p className={`text-[11px] font-medium leading-relaxed italic ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
              <span className="font-black not-italic text-yellow-500">Lý do: </span>{actionData.reason}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

// =====================================================================
// COMPONENT: REPORT READING STICKY SHELL (stable DOM for scroll-driven height)
// =====================================================================
const ReportReadingStickyShell = React.memo(function ReportReadingStickyShell({
  stickyStackRef,
  chartSlotRef,
  chartClipRef,
  pinnedDockRef,
  savedChartHeight,
  chartHandleH,
  reportShellBg,
  isDark,
  chartCard,
  dock,
  scrollLayoutLocked = false,
}) {
  const shellClass = 'hidden lg:block sticky top-0 z-40 isolate -mx-2 [overflow-anchor:none] overflow-visible rounded-2xl border-2 border-yellow-400/45 ring-2 ring-yellow-400/15 ring-inset';
  const shellStyle = {
    backgroundColor: reportShellBg,
    boxShadow: isDark
      ? '0 0 0 1px rgba(250,204,21,0.12), 0 14px 36px rgba(0,0,0,0.55)'
      : '0 0 0 1px rgba(250,204,21,0.2), 0 14px 36px rgba(0,0,0,0.08)',
  };

  if (scrollLayoutLocked) {
    return (
      <div ref={stickyStackRef} className={shellClass} style={shellStyle}>
        <div className="shrink-0">{chartCard}</div>
      </div>
    );
  }

  return (
    <div ref={stickyStackRef} className={shellClass} style={shellStyle}>
      <div ref={chartSlotRef} className="overflow-hidden shrink-0">
        <div ref={chartClipRef} className="shrink-0">
          {chartCard}
        </div>
      </div>
      <div ref={pinnedDockRef} className="shrink-0 overflow-visible relative z-[2]">
        {dock}
      </div>
    </div>
  );
});

// =====================================================================
// COMPONENT: REPORT READING PINNED DOCK (scroll-driven tab)
// =====================================================================
const REPORT_PINNED_TABS = [
  { id: 'report', label: 'Omni Duck AI', emoji: '✨' },
  { id: 'action', label: 'Action Panel', emoji: '⚡' },
  { id: 'debate', label: 'Tranh luận AI', emoji: '⚔️' },
];

const ReportDockToolbar = React.memo(({
  isDark,
  UI,
  marketData,
  actionData,
  isUpdatingAction,
  debateResult,
  vnReportTimestamp,
  aiAnalysisDuration,
  activeTab,
  isExpanded,
  onChat,
  onToggleExpand,
}) => {
  const sym = marketData?.stockInfo?.symbol;
  const companyName = marketData?.companyProfile?.companyName;
  const safeTime = vnReportTimestamp ? new Date(vnReportTimestamp) : null;
  const isValidDate = safeTime && !isNaN(safeTime.getTime());
  const displayTime = isValidDate
    ? safeTime.toLocaleTimeString('vi-VN', {
        hour: '2-digit', minute: '2-digit',
        day: '2-digit', month: '2-digit', year: 'numeric',
      })
    : null;
  const isFresh = aiAnalysisDuration != null || (isValidDate && (Date.now() - safeTime.getTime() < AI_REPORT_COOLDOWN_MS));
  const timeColorClass = isFresh
    ? (isDark ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' : 'text-emerald-600 border-emerald-300 bg-emerald-50')
    : (isDark ? 'text-slate-400 border-white/10 bg-white/5' : 'text-slate-500 border-slate-200 bg-slate-50');

  const btnPrimary = isDark
    ? 'bg-yellow-400/15 text-yellow-400 border-yellow-400/50 hover:bg-yellow-400/25 shadow-[0_0_12px_rgba(250,204,21,0.12)]'
    : 'bg-yellow-50 text-yellow-700 border-yellow-500/55 hover:bg-yellow-100 shadow-sm';
  const btnSecondary = isExpanded
    ? (isDark ? 'bg-yellow-400/20 text-yellow-300 border-yellow-400/55' : 'bg-yellow-100 text-yellow-800 border-yellow-500/60')
    : (isDark ? 'bg-white/8 text-slate-200 border-white/15 hover:bg-white/12 hover:border-yellow-400/35' : 'bg-white text-slate-600 border-slate-300 hover:border-yellow-400/50 hover:bg-yellow-50');

  const tabIcons = ['✨', '⚡', '⚔️'];
  const tabSubtitles = [
    'Báo cáo Omni Duck AI',
    'Live Signal · Entry / SL / Target',
    debateResult ? '7 chuyên gia AI · Bull vs Bear' : 'Tranh luận AI',
  ];
  const expandTitles = ['Thêm tác vụ', 'Mở rộng Action Panel', 'Mở tranh luận AI'];

  const isBuy = actionData?.action?.includes('MUA');
  const isSell = actionData?.action?.includes('BÁN');
  const actionBadgeClass = isBuy
    ? 'bg-emerald-500 shadow-emerald-500/40'
    : isSell
    ? 'bg-red-500 shadow-red-500/40'
    : 'bg-yellow-500 shadow-yellow-500/40';

  return (
    <div className={`flex items-center justify-between gap-2 px-3 py-2.5 border-b ${isDark ? 'border-yellow-400/15 bg-[#080c14]/80' : 'border-yellow-400/25 bg-white/90'}`}>
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border text-base ${isDark ? 'bg-yellow-400/10 border-yellow-400/30' : 'bg-yellow-50 border-yellow-300/60'}`}>
          {tabIcons[activeTab] ?? '✨'}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className={`text-[12px] font-black uppercase tracking-wider truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>{sym}</p>
            {displayTime && (
              <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${timeColorClass}`}>
                <Clock size={10} />
                {displayTime}
              </span>
            )}
          </div>
          {companyName && (
            <p className={`text-[10px] font-semibold truncate mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              {companyName}
            </p>
          )}
          <p className={`text-[9px] font-bold uppercase tracking-wider mt-0.5 truncate ${isDark ? 'text-yellow-500/80' : 'text-yellow-600'}`}>
            {tabSubtitles[activeTab]}
          </p>
        </div>
      </div>

      {activeTab === 1 && actionData?.action && (
        <div className="flex items-center gap-2.5 shrink-0 max-w-[50%] overflow-x-auto no-scrollbar">
          <div className="flex flex-col items-center gap-0.5 shrink-0">
            <span className={`text-[9px] font-black uppercase tracking-wider ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              Hành động
            </span>
            <span className={`px-3 py-1.5 rounded-lg text-[11px] font-black tracking-wider text-white shadow-md ${actionBadgeClass}`}>
              {actionData.action}
            </span>
          </div>
          {!isExpanded && (
            <div className="flex items-end gap-2 shrink-0">
              <div className="flex flex-col items-center gap-0.5">
                <span className={`text-[9px] font-black uppercase tracking-wider ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Entry</span>
                <span className={`text-[13px] font-black leading-none ${UI?.textBold ?? ''} ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  {actionData.entry ?? 'N/A'}
                </span>
              </div>
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-[9px] font-black uppercase tracking-wider text-red-400/80">SL</span>
                <span className="text-[13px] font-black text-red-400 leading-none">{actionData.stoploss ?? 'N/A'}</span>
              </div>
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-[9px] font-black uppercase tracking-wider text-emerald-400/80">T1</span>
                <span className="text-[13px] font-black text-emerald-400 leading-none">{actionData.target1 ?? 'N/A'}</span>
              </div>
            </div>
          )}
          {actionData.conviction && (
            <div className="flex flex-col items-center gap-0.5 shrink-0">
              <span className={`text-[9px] font-black uppercase tracking-wider ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                Độ tin cậy
              </span>
              <span className={`px-2.5 py-1 rounded-full text-[10px] font-black border ${
                actionData.conviction === 'Cao'
                  ? (isDark ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' : 'bg-emerald-50 text-emerald-600 border-emerald-200')
                  : (isDark ? 'bg-yellow-500/15 text-yellow-400 border-yellow-500/25' : 'bg-yellow-50 text-yellow-600 border-yellow-200')
              }`}>
                {actionData.conviction}
              </span>
            </div>
          )}
          {isUpdatingAction && (
            <Loader2 size={16} className="animate-spin text-yellow-400 shrink-0 mb-1" />
          )}
        </div>
      )}

      {activeTab === 2 && !isExpanded && (
        <span className={`hidden md:inline text-[9px] font-bold uppercase tracking-wider shrink-0 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
          Nhấn + để xem
        </span>
      )}

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onChat}
          title="Chat về báo cáo"
          aria-label="Chat về báo cáo"
          className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center border transition-all active:scale-95 ${btnPrimary}`}
        >
          <MessageSquare size={17} strokeWidth={2.2} />
        </button>
        <button
          type="button"
          onClick={onToggleExpand}
          title={expandTitles[activeTab] ?? 'Mở rộng'}
          aria-label={expandTitles[activeTab] ?? 'Mở rộng'}
          aria-expanded={isExpanded}
          className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center border transition-all active:scale-95 ${btnSecondary}`}
        >
          {isExpanded
            ? <ChevronUp size={18} strokeWidth={2.5} />
            : <ChevronDown size={18} strokeWidth={2.5} />
          }
        </button>
      </div>
    </div>
  );
});

const ReportReadingPinnedDock = React.memo(({
  isDark,
  UI,
  marketData,
  actionData,
  isUpdatingAction,
  aiAnalysisDuration,
  vnReportTimestamp,
  setShowPdfModal,
  scrollContainerRef,
  setIsChatOpen,
  aiReport,
  setShowFullReportModal,
  debateResult,
  dockPanelExpandHandlers,
  onTabClick,
  activeTab = 0,
  dockReportMore = false,
  onDockReportMoreChange,
  dockActionOpen = false,
  onDockActionOpenChange,
  dockDebateOpen = false,
  onDockDebateOpenChange,
}) => {
  const tabActive = isDark
    ? 'bg-yellow-400/15 text-yellow-400 border-yellow-400/50 shadow-[0_0_14px_rgba(250,204,21,0.18)]'
    : 'bg-yellow-50 text-yellow-700 border-yellow-500/60 shadow-sm';
  const tabIdle = isDark
    ? 'text-slate-400 border-yellow-400/20 opacity-75 hover:border-yellow-400/45 hover:text-yellow-300/90 hover:bg-yellow-400/5'
    : 'text-slate-500 border-yellow-400/25 opacity-75 hover:border-yellow-500/50 hover:text-yellow-700 hover:bg-yellow-50';

  return (
  <div className={`shrink-0 border-t-2 ${isDark ? 'border-yellow-400/30' : 'border-yellow-400/40'}`}>
    <div className={`flex gap-1.5 px-2 py-1.5 border-b ${isDark ? 'bg-[#080c14]/95 border-yellow-400/20' : 'bg-slate-50 border-yellow-400/30'}`}>
      {REPORT_PINNED_TABS.map((tab, i) => (
        <button
          type="button"
          key={tab.id}
          data-tab-pill={i}
          onClick={() => onTabClick?.(i)}
          aria-label={tab.label}
          className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider border cursor-pointer transition-all duration-200 active:scale-[0.98] ${
            i === 0 ? tabActive : tabIdle
          }`}
        >
          <span>{tab.emoji}</span>
          <span className="truncate hidden sm:inline">{tab.label}</span>
        </button>
      ))}
    </div>
    {activeTab !== 0 && (
    <ReportDockToolbar
      isDark={isDark}
      UI={UI}
      marketData={marketData}
      actionData={actionData}
      isUpdatingAction={isUpdatingAction}
      debateResult={debateResult}
      vnReportTimestamp={vnReportTimestamp}
      aiAnalysisDuration={aiAnalysisDuration}
      activeTab={activeTab}
      isExpanded={activeTab === 1 ? dockActionOpen : dockDebateOpen}
      onChat={() => setIsChatOpen(true)}
      onToggleExpand={() => {
        if (activeTab === 1) onDockActionOpenChange?.(!dockActionOpen);
        else onDockDebateOpenChange?.(!dockDebateOpen);
      }}
    />
    )}
    <div data-dock-panels className={`relative px-2 pb-2 pt-1 overflow-visible border-t ${isDark ? 'border-yellow-400/15' : 'border-yellow-400/25'}`}>
      <div data-dock-panel="0" className="relative z-[2]">
        <AiReportHeader
          isDark={isDark}
          UI={UI}
          marketData={marketData}
          actionData={actionData}
          isUpdatingAction={isUpdatingAction}
          aiAnalysisDuration={aiAnalysisDuration}
          vnReportTimestamp={vnReportTimestamp}
          setShowPdfModal={setShowPdfModal}
          scrollContainerRef={scrollContainerRef}
          setIsChatOpen={setIsChatOpen}
          aiReport={aiReport}
          setShowFullReportModal={setShowFullReportModal}
          dockMode
          onLayoutChange={dockPanelExpandHandlers?.[0]}
        />
      </div>
      <div data-dock-panel="1" className="absolute left-2 right-2 top-1 z-[1] opacity-0 invisible pointer-events-none">
        <ActionSignalCard
          actionData={actionData}
          isUpdatingAction={isUpdatingAction}
          isDark={isDark}
          UI={UI}
          defaultCollapsed
          dockMode
          hideDockHeader
          collapsed={!dockActionOpen}
          onCollapsedChange={(v) => onDockActionOpenChange?.(!v)}
          onLayoutChange={dockPanelExpandHandlers?.[1]}
        />
      </div>
      <div data-dock-panel="2" className="absolute left-2 right-2 top-1 z-[1] opacity-0 invisible pointer-events-none">
        <DebatePanel
          debateResult={debateResult}
          isDark={isDark}
          UI={UI}
          defaultOpen={false}
          dockMode
          hideDockHeader
          open={dockDebateOpen}
          onOpenChange={onDockDebateOpenChange}
          onLayoutChange={dockPanelExpandHandlers?.[2]}
        />
      </div>
    </div>
  </div>
  );
});

// =====================================================================
// CONSTANTS — Định nghĩa ngoài component để không tạo lại mỗi render
// =====================================================================
const VN_STOCK_FACTS = [
  { type: 'fact', icon: '📊', text: 'HOSE (Sở GDCK TP.HCM) khai trương ngày 28/7/2000 với phiên đầu tiên chỉ có 2 mã: REE và SAM.' },
  { type: 'fact', icon: '🏛️', text: 'HNX (Sở GDCK Hà Nội) thành lập năm 2005, ban đầu là sàn OTC.' },
  { type: 'fact', icon: '📈', text: 'Biên độ dao động giá trên HOSE là ±7%/phiên, HNX ±10%/phiên, UPCoM ±15%/phiên.' },
  { type: 'fact', icon: '⏱️', text: 'Quy tắc T+2: Cổ phiếu mua ngày T sẽ được về tài khoản sau 2 ngày làm việc.' },
  { type: 'fact', icon: '🐋', text: '"Cá mập" trong thị trường VN ám chỉ tổ chức, quỹ lớn — hành vi của họ thường được theo dõi qua khối lượng.' },
  { type: 'fact', icon: '🏆', text: 'Mã VCB (Vietcombank) thường được coi là "cổ phiếu chuẩn mực" nhờ thanh khoản cao.' },
  { type: 'quiz', icon: '🧠', question: 'VN30 theo dõi bao nhiêu cổ phiếu?', options: ['20 mã', '30 mã', '50 mã', '100 mã'], answer: 1 },
  { type: 'quiz', icon: '🧠', question: 'Biên độ dao động tối đa/phiên trên HOSE là?', options: ['±5%', '±7%', '±10%', '±15%'], answer: 1 },
];
const VN_FACTS_ONLY = VN_STOCK_FACTS.filter(c => c.type === 'fact');
const VN_QUIZ_ONLY  = VN_STOCK_FACTS.filter(c => c.type === 'quiz');

// Hàm helper dùng chung — tránh tạo lại trong render
const formatReportTime = (ts) => {
  if (!ts) return 'LIVE STREAMING...';
  const d = new Date(ts);
  return isNaN(d.getTime()) ? ts : d.toLocaleString('vi-VN');
};

const pickUnseen = (arr, seenSet) => {
  if (seenSet.size >= arr.length) seenSet.clear();
  let attempts = 0;
  while (attempts < arr.length * 2) {
    const idx = Math.floor(Math.random() * arr.length);
    if (!seenSet.has(idx)) { seenSet.add(idx); return arr[idx]; }
    attempts++;
  }
  return arr[0];
};

// =====================================================================
// COMPONENT CHÍNH: VN STOCKS TAB
// =====================================================================
export default function VnStocksTab({
  isDark, UI,
  allStocks,
  marketData,
  chartData,
  aiReport,
  analyzing,
  analysisStep = '',
  analysisProgress = 0,
  aiAnalysisEta = null,
  loadingMarket,
  aiReportError,
  loadingAiNews,
  activeInterval,
  showExtraStats, setShowExtraStats,
  showVolInfo, setShowVolInfo,
  actionData,
  isUpdatingAction,
  setShowPdfModal,
  vnIndexData,
  hnxIndexData,
  vn30Data,
  marketIntel,
  handleAiAnalysis,
  handleIntervalChange,
  fetchAiNews,
  stopNewsStream,
  fetchUserHistory,
  userHistory,
  setInput,
  fetchMarketData,
  heatmapData = [],
  loadingHeatmap,
  lastAiVnTime,
  currentUser,
  onRequestCloseChat,
  aiAnalysisDuration,
  pdfMode = 'turbo',
  setPdfMode,
  newsMode = 'balanced',
  setNewsMode,
  vnReportTimestamp,
  debateResult,
  liveDebate = {},
  cancelAnalysis,
}) {
  const [mobileTab, setMobileTab] = useState('ai');
  // STATES & REFS
  const [isNewsOpen, setIsNewsOpen] = useState(false);
  const [historyLimit, setHistoryLimit] = useState(3);
  const [historySortMode, setHistorySortMode] = useState('time_desc');
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState(null);
  const aiError = aiReportError;
  const [isRightColOpen, setIsRightColOpen] = useState(true);
  // isRightColVisible trễ hơn isRightColOpen 300ms để col3 fade out trước khi unmount
  const [isRightColVisible, setIsRightColVisible] = useState(true);
  useEffect(() => {
    if (isRightColOpen) {
      setIsRightColVisible(true); // mount ngay khi mở
    } else {
      const t = setTimeout(() => setIsRightColVisible(false), 300); // unmount sau khi fade xong
      return () => clearTimeout(t);
    }
  }, [isRightColOpen]);

  const LEFT_COL_STORAGE_KEY = 'vnstock-left-col';
  const LEFT_COL_MIN = 320;
  const LEFT_COL_MAX = 720;
  const LEFT_COL_DEFAULT = 500;
  const [leftColWidth, setLeftColWidth] = useState(LEFT_COL_DEFAULT);
  const [isLeftColOpen, setIsLeftColOpen] = useState(true);
  const [isLeftColVisible, setIsLeftColVisible] = useState(true);
  const [isDraggingLeftCol, setIsDraggingLeftCol] = useState(false);
  const leftDragStartX = useRef(0);
  const leftStartWidth = useRef(LEFT_COL_DEFAULT);

  useEffect(() => {
    if (isLeftColOpen) {
      setIsLeftColVisible(true);
    } else {
      const t = setTimeout(() => setIsLeftColVisible(false), 300);
      return () => clearTimeout(t);
    }
  }, [isLeftColOpen]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LEFT_COL_STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (typeof saved.width === 'number') {
        setLeftColWidth(Math.max(LEFT_COL_MIN, Math.min(LEFT_COL_MAX, saved.width)));
      }
      if (typeof saved.open === 'boolean') {
        setIsLeftColOpen(saved.open);
        setIsLeftColVisible(saved.open);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(LEFT_COL_STORAGE_KEY, JSON.stringify({ width: leftColWidth, open: isLeftColOpen }));
    } catch { /* ignore */ }
  }, [leftColWidth, isLeftColOpen]);

  const [elapsedTime, setElapsedTime] = useState(0);
  const scrollContainerRef = useRef(null);
  const mobileScrollRef = useRef(null);
  const [isDraggingChart, setIsDraggingChart] = useState(false);
  const dragStartY = useRef(0);
  const startHeight = useRef(600);
  const resizeDragStartHeightRef = useRef(600);
  const chartWrapperRef = useRef(null);
  const chartWrapperEmbeddedRef = useRef(null);
  const [isAutoScroll, setIsAutoScroll] = useState(true);
  const [isDebateOpen, setIsDebateOpen] = useState(false);
  const tooltipRef = useRef(null);
  const newsScrollRef = useRef(null);
  const [showNewsScroll, setShowNewsScroll] = useState(false);
  const [homeNews, setHomeNews] = useState([]);
  const [loadingHomeNews, setLoadingHomeNews] = useState(false);

  // Fetch home news
  useEffect(() => {
    if (!marketData && homeNews.length === 0) {
      const fetchHomeNews = async () => {
        setLoadingHomeNews(true);
        try {
          const res = await fetch(API_BASE_URL + '/api/market/home-news');
          const data = await res.json();
          if (data.success) {
            setHomeNews(data.data);
          }
        } catch (e) {
          console.error(e);
        } finally {
          setLoadingHomeNews(false);
        }
      };
      fetchHomeNews();
    }
  }, [marketData, homeNews.length]);

  const [showFullReportModal, setShowFullReportModal] = useState(false);
  const [analysisNotice, setAnalysisNotice] = useState(null);
  const [showForceConfirm, setShowForceConfirm] = useState(false);
  // ─── STATE ĐIỀU KHIỂN THU GỌN KHỐI PDF VÀ NEWS ────────────────────
  const [isPdfConfigOpen, setIsPdfConfigOpen] = useState(false);
  const [isNewsConfigOpen, setIsNewsConfigOpen] = useState(false);

  const isFocusLayout = !isLeftColOpen && !isRightColOpen;
  const isReportReadingMode = !!(aiReport && !analyzing && marketData);
  const [savedChartHeight, setSavedChartHeight] = useState(600);
  const savedChartHeightRef = useRef(600);
  const [chartScrollLayoutLocked, setChartScrollLayoutLocked] = useState(false);
  const chartScrollLayoutLockedRef = useRef(false);
  const isScrollDrivenLayout = isReportReadingMode && !chartScrollLayoutLocked;
  const scrollPhaseRef = useRef('top');
  const visualChartHeightRef = useRef(600);
  const chartClipRef = useRef(null);
  const chartSlotRef = useRef(null);
  const stickyStackRef = useRef(null);
  const pinnedDockRef = useRef(null);
  const scrollRafRef = useRef(null);
  const lastSlotHRef = useRef(-1);
  const lastCropRef = useRef(-1);
  const lastScrollTopRef = useRef(0);
  const pinnedTabIndexRef = useRef(0);
  const pinnedDockThemeRef = useRef({ isDark: true });
  const dockPanelHeightRef = useRef(0);
  const chartChromeHRef = useRef(14);
  const chartInnerFullHRef = useRef(0);
  const suppressChartResizeRef = useRef(false);
  const scrollSettleTimerRef = useRef(null);
  const pendingPinRef = useRef(0);
  const pinStableFramesRef = useRef(0);
  const scrollDirRef = useRef('same');
  const isScrollingRef = useRef(false);
  const pin1SinceRef = useRef(0);
  const dockExpandedRef = useRef(false);
  const dockPanelExpandRef = useRef([false, false, false]);
  const pinnedTabManualUntilRef = useRef(0);
  const [dockActiveTab, setDockActiveTab] = useState(0);
  const [dockReportMore, setDockReportMore] = useState(false);
  const [dockActionOpen, setDockActionOpen] = useState(false);
  const [dockDebateOpen, setDockDebateOpen] = useState(false);

  const chartHandleH = 14;

  const effectiveDebateResult = useMemo(
    () => coerceDebateResult(debateResult, liveDebate),
    [debateResult, liveDebate]
  );

  const getVisualHeightPx = useCallback((scrollTop, focus) => {
    const savedH = savedChartHeightRef.current;
    const topH = savedH;
    const minH = focus ? 56 : 80;
    const scrollRange = Math.max(220, topH - minH + 60);
    if (scrollTop <= 0) return topH;
    const t = Math.min(1, Math.max(0, scrollTop / scrollRange));
    const eased = t * t * (3 - 2 * t);
    return topH - (topH - minH) * eased;
  }, []);

  const getPinnedTabIndex = useCallback((crop, maxSlotH, minSlotH, current, direction = 'same', snap = false) => {
    const shrinkSpan = Math.max(1, maxSlotH - minSlotH);
    const shrinkT = Math.min(1, Math.max(0, crop / shrinkSpan));
    const enterAction = 0.22;
    const exitAction = 0.08;
    const enterDebate = 0.78;
    const exitDebate = 0.66;

    let next = current;
    if (direction === 'up' && !snap) {
      if (current === 2) next = shrinkT < exitDebate ? 1 : 2;
      else if (current === 1) next = shrinkT < exitAction ? 0 : 1;
      else next = 0;
    } else {
      if (current === 0) next = shrinkT > enterAction ? 1 : 0;
      else if (current === 1) {
        if (shrinkT < exitAction) next = 0;
        else if (shrinkT > enterDebate) next = 2;
        else next = 1;
      } else {
        next = shrinkT < exitDebate ? 1 : 2;
      }
    }

    if (!snap && next === 2 && current === 1) {
      const dwellMs = Date.now() - (pin1SinceRef.current || 0);
      if (dwellMs < 700) next = 1;
    }

    if (!snap) {
      if (next > current + 1) next = current + 1;
      if (next < current - 1) next = current - 1;
    }

    return next;
  }, []);

  const setupChartClipLayout = useCallback(() => {
    if (chartScrollLayoutLockedRef.current) return;
    const slot = chartSlotRef.current;
    const clip = chartClipRef.current;
    if (!slot || !clip) return;
    slot.style.position = 'relative';
    slot.style.overflow = 'hidden';
    clip.style.position = 'absolute';
    clip.style.top = '0';
    clip.style.left = '0';
    clip.style.right = '0';
    clip.style.width = '100%';
    clip.style.willChange = 'transform';
  }, []);

  const resetScrollDrivenChartDOM = useCallback(() => {
    const slot = chartSlotRef.current;
    const clip = chartClipRef.current;
    const dock = pinnedDockRef.current;
    if (slot) {
      slot.style.height = '';
      slot.style.position = '';
      slot.style.overflow = '';
    }
    if (clip) {
      clip.style.height = '';
      clip.style.transform = '';
      clip.style.position = '';
      clip.style.top = '';
      clip.style.left = '';
      clip.style.right = '';
      clip.style.width = '';
      clip.style.willChange = '';
    }
    if (dock) dock.style.marginTop = '';
    lastCropRef.current = -1;
    lastSlotHRef.current = -1;
  }, []);

  const lockChartScrollLayout = useCallback(() => {
    if (chartScrollLayoutLockedRef.current) return;
    chartScrollLayoutLockedRef.current = true;
    setChartScrollLayoutLocked(true);
    resetScrollDrivenChartDOM();
    scrollPhaseRef.current = 'top';
    pinnedTabIndexRef.current = 0;
    dockExpandedRef.current = false;
    dockPanelExpandRef.current = [false, false, false];
    const el = scrollContainerRef.current;
    if (el) el.scrollTop = 0;
  }, [resetScrollDrivenChartDOM]);

  const measureChartInnerMetrics = useCallback(() => {
    if (chartScrollLayoutLockedRef.current) return;
    setupChartClipLayout();
    const clip = chartClipRef.current;
    const slot = chartSlotRef.current;
    if (!clip) return;
    const fullInner = clip.offsetHeight;
    const savedH = savedChartHeightRef.current;
    if (fullInner > 0) {
      chartInnerFullHRef.current = fullInner;
      chartChromeHRef.current = Math.max(chartHandleH, fullInner - savedH);
      if (slot) slot.style.height = `${fullInner}px`;
    }
  }, [chartHandleH, setupChartClipLayout]);

  const measureDockPanelsHeight = useCallback(() => {
    const root = pinnedDockRef.current;
    const container = root?.querySelector('[data-dock-panels]');
    const panels = root?.querySelectorAll('[data-dock-panel]');
    if (!container || !panels?.length) return 0;
    let h = 0;
    panels.forEach((panel) => {
      if (!panel.classList.contains('invisible')) {
        h = Math.max(h, panel.scrollHeight, panel.offsetHeight);
      }
    });
    container.style.height = 'auto';
    container.style.minHeight = h > 0 ? `${h}px` : '';
    container.style.overflow = 'visible';
    dockPanelHeightRef.current = h;
    return h;
  }, []);

  const syncDockExpandedFromActiveTab = useCallback(() => {
    dockExpandedRef.current = !!dockPanelExpandRef.current[pinnedTabIndexRef.current];
  }, []);

  const getScrollTopForPinnedTab = useCallback((tabIndex, focus) => {
    const savedH = savedChartHeightRef.current;
    const minH = focus ? 56 : 80;
    const scrollRange = Math.max(220, savedH - minH + 60);
    const ratios = [0, 0.48, 0.98];
    return (ratios[tabIndex] ?? 0) * scrollRange;
  }, []);

  const handleDockExpand = useCallback((expanded, panelIndex) => {
    if (panelIndex >= 0 && panelIndex < 3) {
      dockPanelExpandRef.current[panelIndex] = !!expanded;
      if (panelIndex === 0) setDockReportMore(!!expanded);
      else if (panelIndex === 1) setDockActionOpen(!!expanded);
      else if (panelIndex === 2) setDockDebateOpen(!!expanded);
    }
    syncDockExpandedFromActiveTab();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        measureDockPanelsHeight();
        const el = scrollContainerRef.current;
        const focus = !isLeftColOpen && !isRightColOpen;
        const dockExpanded = dockExpandedRef.current;
        if (dockExpanded) {
          const chromeH = chartChromeHRef.current;
          const maxSlotH = chartInnerFullHRef.current || savedChartHeightRef.current + chromeH;
          const minSlotH = (focus ? 56 : 80) + chromeH;
          lastCropRef.current = maxSlotH - minSlotH;
        }
        applyScrollLayoutRef.current?.(el?.scrollTop ?? 0, focus, true);
      });
    });
  }, [measureDockPanelsHeight, isLeftColOpen, isRightColOpen, syncDockExpandedFromActiveTab]);

  const dockPanelExpandHandlers = useMemo(
    () => [0, 1, 2].map((i) => (expanded) => handleDockExpand(expanded, i)),
    [handleDockExpand]
  );

  const syncPinnedDockUI = useCallback((index, fromIndex = null) => {
    const root = pinnedDockRef.current;
    if (!root) return;
    const prevIndex = fromIndex ?? pinnedTabIndexRef.current;
    setDockActiveTab(index);

    const isDarkTheme = pinnedDockThemeRef.current.isDark;
    const tabActive = isDarkTheme
      ? 'bg-yellow-400/15 text-yellow-400 border-yellow-400/50 shadow-[0_0_14px_rgba(250,204,21,0.18)]'
      : 'bg-yellow-50 text-yellow-700 border-yellow-500/60 shadow-sm';
    const tabIdle = isDarkTheme
      ? 'text-slate-400 border-yellow-400/20 opacity-75 hover:border-yellow-400/45 hover:text-yellow-300/90 hover:bg-yellow-400/5'
      : 'text-slate-500 border-yellow-400/25 opacity-75 hover:border-yellow-500/50 hover:text-yellow-700 hover:bg-yellow-50';
    root.querySelectorAll('[data-tab-pill]').forEach((pill) => {
      const i = Number(pill.getAttribute('data-tab-pill'));
      const active = i === index;
      pill.className = `flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider border cursor-pointer transition-all duration-200 active:scale-[0.98] ${
        active ? tabActive : tabIdle
      }`;
    });
    root.querySelectorAll('[data-dock-panel]').forEach((panel) => {
      const i = Number(panel.getAttribute('data-dock-panel'));
      const active = i === index;
      panel.className = active
        ? 'relative z-[2]'
        : 'absolute left-2 right-2 top-1 z-[1] opacity-0 invisible pointer-events-none';
    });

    measureDockPanelsHeight();
    syncDockExpandedFromActiveTab();

    if (prevIndex !== index) {
      if (index === 1) pin1SinceRef.current = Date.now();
      applyScrollLayoutRef.current?.(
        scrollContainerRef.current?.scrollTop ?? 0,
        !isLeftColOpen && !isRightColOpen,
        true
      );
    }
  }, [measureDockPanelsHeight, syncDockExpandedFromActiveTab, isLeftColOpen, isRightColOpen]);

  const getUiPhaseFromScroll = useCallback((scrollTop, focus, current) => {
    if (scrollTop < 8) return 'top';
    const enterCompact = focus ? 40 : 50;
    const exitCompact = focus ? 18 : 25;
    if (current === 'top') return scrollTop > enterCompact ? 'reading' : 'top';
    return scrollTop < exitCompact ? 'top' : 'reading';
  }, []);

  const applyChartVisual = useCallback((scrollTop, focus, snap = false) => {
    if (chartScrollLayoutLockedRef.current) return;
    const savedH = savedChartHeightRef.current;
    const chromeH = chartChromeHRef.current;
    const maxSlotH = chartInnerFullHRef.current || savedH + chromeH;
    const minSlotH = (focus ? 56 : 80) + chromeH;
    const direction = scrollDirRef.current;

    const targetVisualH = getVisualHeightPx(scrollTop, focus);
    let targetSlotH = targetVisualH + chromeH;
    targetSlotH = Math.max(minSlotH, Math.min(maxSlotH, targetSlotH));
    if (scrollTop <= 20) {
      targetSlotH = Math.min(maxSlotH, savedH + chromeH);
    }

    let targetCrop = Math.max(0, maxSlotH - targetSlotH);
    const prevCrop = lastCropRef.current >= 0 ? lastCropRef.current : targetCrop;

    if (direction === 'up' && scrollTop > 40) {
      targetCrop = Math.min(targetCrop, prevCrop);
    }

    const lerp = snap ? 1 : (direction === 'down' ? 0.36 : 0.48);
    let crop = prevCrop + (targetCrop - prevCrop) * lerp;
    if (Math.abs(crop - targetCrop) < 0.35) crop = targetCrop;

    const appliedSlotH = maxSlotH - crop;
    const shrinkSpan = Math.max(1, maxSlotH - minSlotH);
    const layoutShrink = dockExpandedRef.current && crop > shrinkSpan * 0.55;
    const slot = chartSlotRef.current;
    const clip = chartClipRef.current;
    const dock = pinnedDockRef.current;

    if (slot && maxSlotH > 0) {
      slot.style.height = layoutShrink
        ? `${Math.max(minSlotH, appliedSlotH).toFixed(2)}px`
        : `${maxSlotH}px`;
    }
    if (clip && maxSlotH > 0) {
      clip.style.height = `${maxSlotH}px`;
      clip.style.transform = crop > 0.5 ? `translate3d(0,${-crop.toFixed(2)}px,0)` : 'none';
    }
    if (dock) {
      dock.style.marginTop = layoutShrink ? '0px' : (crop > 0.5 ? `-${crop.toFixed(2)}px` : '0px');
    }
    lastCropRef.current = crop;
    lastSlotHRef.current = appliedSlotH;
    visualChartHeightRef.current = targetVisualH;

    let candidatePin = getPinnedTabIndex(
      crop,
      maxSlotH,
      minSlotH,
      pinnedTabIndexRef.current,
      direction,
      snap
    );
    if (Date.now() < pinnedTabManualUntilRef.current) {
      candidatePin = pinnedTabIndexRef.current;
    }
    if (candidatePin === pendingPinRef.current) {
      pinStableFramesRef.current += 1;
    } else {
      pendingPinRef.current = candidatePin;
      pinStableFramesRef.current = 0;
    }
    const pinFramesNeeded = snap
      ? 1
      : (candidatePin === 2 && pinnedTabIndexRef.current === 1 ? 6 : 3);
    if (pinStableFramesRef.current >= pinFramesNeeded && pinnedTabIndexRef.current !== candidatePin) {
      const prevPin = pinnedTabIndexRef.current;
      pinnedTabIndexRef.current = candidatePin;
      syncPinnedDockUI(candidatePin, prevPin);
    }
  }, [getVisualHeightPx, getPinnedTabIndex, syncPinnedDockUI]);

  const applyScrollLayout = useCallback((scrollTop, focus, snap = false) => {
    if (chartScrollLayoutLockedRef.current) return;
    applyChartVisual(scrollTop, focus, snap);
    const uiPhase = getUiPhaseFromScroll(scrollTop, focus, scrollPhaseRef.current);
    scrollPhaseRef.current = uiPhase;
  }, [getUiPhaseFromScroll, applyChartVisual]);

  const applyScrollLayoutRef = useRef(null);
  applyScrollLayoutRef.current = applyScrollLayout;
  const syncPinnedDockUIRef = useRef(null);
  syncPinnedDockUIRef.current = syncPinnedDockUI;
  const measureDockPanelsHeightRef = useRef(null);
  measureDockPanelsHeightRef.current = measureDockPanelsHeight;
  const measureChartInnerMetricsRef = useRef(null);
  measureChartInnerMetricsRef.current = measureChartInnerMetrics;

  useLayoutEffect(() => {
    savedChartHeightRef.current = savedChartHeight;
  }, [savedChartHeight]);

  useLayoutEffect(() => {
    pinnedDockThemeRef.current.isDark = isDark;
  }, [isDark]);

  useLayoutEffect(() => {
    if (!isReportReadingMode) return;
    if (chartScrollLayoutLocked) {
      resetScrollDrivenChartDOM();
      return;
    }
    const el = scrollContainerRef.current;
    const st = el?.scrollTop ?? 0;
    lastSlotHRef.current = -1;
    lastCropRef.current = -1;
    measureChartInnerMetricsRef.current?.();
    measureDockPanelsHeightRef.current?.();
    applyScrollLayoutRef.current?.(st, isFocusLayout);
    syncPinnedDockUIRef.current?.(0);
  }, [isReportReadingMode, savedChartHeight, isFocusLayout, chartScrollLayoutLocked, resetScrollDrivenChartDOM]);

  useLayoutEffect(() => {
    if (!isScrollDrivenLayout) return;
    measureDockPanelsHeightRef.current?.();
  }, [isScrollDrivenLayout, actionData, effectiveDebateResult]);

  useEffect(() => {
    if (!isScrollDrivenLayout) return;
    const root = pinnedDockRef.current;
    if (!root) return;
    const ro = new ResizeObserver(() => {
      if (isScrollingRef.current) return;
      measureDockPanelsHeightRef.current?.();
    });
    root.querySelectorAll('[data-dock-panel]').forEach((panel) => ro.observe(panel));
    return () => ro.disconnect();
  }, [isScrollDrivenLayout, actionData, effectiveDebateResult]);

  useEffect(() => {
    if (!aiReport) {
      scrollPhaseRef.current = 'top';
      lastSlotHRef.current = -1;
      lastCropRef.current = -1;
      pinnedTabIndexRef.current = 0;
      chartScrollLayoutLockedRef.current = false;
      setChartScrollLayoutLocked(false);
      setDockActiveTab(0);
      setDockReportMore(false);
      setDockActionOpen(false);
      setDockDebateOpen(false);
    }
  }, [aiReport]);

  // Format chart data for price chart component
  const priceChartData = useMemo(() => {
       if (!Array.isArray(chartData) || chartData.length === 0) return [];
      
      const rawData = chartData.slice(-30);

      return rawData.map((d, index) => {
           const rawPrice = d.close ?? d.c ?? d.price ?? d.value ?? 0;
          const rawVol = d.volume ?? d.v ?? d.vol ?? 0;

           const price = Number(rawPrice);
          const volume = Number(rawVol);

          return {
              date: d.time ? new Date(d.time * (d.time > 1e10 ? 1 : 1000)).toLocaleDateString('vi-VN') : `Phiên ${index + 1}`,
              price: isNaN(price) ? 0 : price,
              volume: isNaN(volume) ? 0 : volume
          };
      });
  }, [chartData]);

  // Memoize sorted history list — tránh sort lại mỗi render
  const sortedHistory = useMemo(() => {
    return [...userHistory]
      .sort((a, b) => {
        if (historySortMode === 'time_desc') return new Date(b.timestamp) - new Date(a.timestamp);
        if (historySortMode === 'time_asc') return new Date(a.timestamp) - new Date(b.timestamp);
        if (historySortMode === 'action') {
          const isAActive = a.lastAction === 'MUA' || a.lastAction === 'BÁN';
          const isBActive = b.lastAction === 'MUA' || b.lastAction === 'BÁN';
          if (isAActive && !isBActive) return -1;
          if (!isAActive && isBActive) return 1;
          return new Date(b.timestamp) - new Date(a.timestamp);
        }
        return 0;
      })
      .slice(0, historyLimit);
  }, [userHistory, historySortMode, historyLimit]);

  // Memoize heatmap watchlist và droplist — tránh flatMap+sort mỗi render
  const heatmapWatchlist = useMemo(() => {
    return heatmapData
      .flatMap(sec => (sec.watchlist || []).map(s => ({ ...s, sector: sec.name })))
      .sort((a, b) => b.changePct - a.changePct)
      .slice(0, 10);
  }, [heatmapData]);

  const heatmapDroplist = useMemo(() => {
    return heatmapData
      .flatMap(sec => (sec.droplist || []).map(s => ({ ...s, sector: sec.name })))
      .sort((a, b) => a.changePct - b.changePct)
      .slice(0, 10);
  }, [heatmapData]);

  // HANDLE EXPORT DATA
  const handleExportData = useCallback(async () => {
    if (isExporting || !marketData) return;
    const sym = marketData.stockInfo?.symbol;
    setIsExporting(true); setExportStatus(null);
    try {
      const optimizedNews = (marketData.deepNewsData || []).slice(0, 20).map(n => ({
        title: n.title, date: n.date, sentiment: n.sentiment || 'neutral', link: n.link || null,
        content: n.content && n.content !== n.title && n.content.length > 80 ? n.content.substring(0, 2000) : null,
      }));
      const payload = {
        stockInfo: marketData.stockInfo,
        companyProfile: { overview: marketData.companyProfile?.overview, companyName: marketData.companyProfile?.companyName },
        technicalData: chartData.slice(-30),
        marketContext: vnIndexData.slice(-5),
        news: optimizedNews,
        user: currentUser,
        pdfMode,
        timestamp: new Date().toISOString(),
      };
      if (aiReport?.trim()) {
        payload.aiReport = aiReport.trim();
        if (vnReportTimestamp) payload.aiReportTimestamp = vnReportTimestamp;
      }
      const res = await fetch(API_BASE_URL + `/api/debug-feed/${sym}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error(`Lỗi ${res.status}`);
      const json = await res.json();
      if (!json.success || !json.data) throw new Error(json.message || 'Export thất bại');
      const blob = new Blob([JSON.stringify(json.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const now = new Date();
      const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}h${String(now.getMinutes()).padStart(2, '0')}m`;
      const a = document.createElement('a');
      a.href = url;
      a.download = `${sym}_export_${stamp}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setExportStatus('success'); setTimeout(() => setExportStatus(null), 3000);
    } catch (err) { setExportStatus('error'); setTimeout(() => setExportStatus(null), 4000); } finally { setIsExporting(false); }
  }, [isExporting, marketData, chartData, vnIndexData, currentUser, pdfMode, aiReport, vnReportTimestamp]);

  // HANDLE DOWNLOAD MD REPORT
  const handleDownloadReport = useCallback(() => {
    if (!aiReport) return;
    const blob = new Blob([aiReport], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `OMNI_DUCK_REPORT_${marketData?.stockInfo?.symbol || 'REPORT'}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [aiReport, marketData]);

  // HANDLE LEFT COL DRAG TO RESIZE
  const handleLeftColDragStart = useCallback((e) => {
    if (!isLeftColOpen || (typeof window !== 'undefined' && window.innerWidth < 1024)) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget?.setPointerCapture?.(e.pointerId);
    setIsDraggingLeftCol(true);
    leftDragStartX.current = e.clientX;
    leftStartWidth.current = leftColWidth;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
  }, [isLeftColOpen, leftColWidth]);

  const getActiveChartWrapper = useCallback(() => {
    if (isReportReadingMode && typeof window !== 'undefined' && window.innerWidth >= 1024) {
      return chartWrapperEmbeddedRef.current ?? chartWrapperRef.current;
    }
    return chartWrapperRef.current;
  }, [isReportReadingMode]);

  // HANDLE CHART DRAG TO RESIZE
  const handleDragStart = useCallback((e) => {
    if (isScrollDrivenLayout) {
      const el = scrollContainerRef.current;
      if (el && el.scrollTop > 0) {
        el.scrollTop = 0;
        applyScrollLayoutRef.current?.(0, isFocusLayout, true);
        scrollPhaseRef.current = 'top';
      }
    }
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget?.setPointerCapture?.(e.pointerId);
    setIsDraggingChart(true);
    dragStartY.current = e.clientY;
    const wrapper = getActiveChartWrapper();
    startHeight.current = wrapper ? wrapper.offsetHeight : savedChartHeightRef.current;
    resizeDragStartHeightRef.current = startHeight.current;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'row-resize';
  }, [isScrollDrivenLayout, isFocusLayout, getActiveChartWrapper]);

  const handleReportScrollToTop = useCallback(() => {
    if (isScrollDrivenLayout) {
      pinnedTabManualUntilRef.current = Date.now() + 700;
      pinnedTabIndexRef.current = 0;
      syncPinnedDockUI(0);
      applyScrollLayout(0, isFocusLayout, true);
    }
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [isFocusLayout, isScrollDrivenLayout, applyScrollLayout, syncPinnedDockUI]);

  const handlePinnedTabClick = useCallback((tabIndex) => {
    pinnedTabManualUntilRef.current = Date.now() + 900;
    const prevPin = pinnedTabIndexRef.current;
    pinnedTabIndexRef.current = tabIndex;
    setDockActiveTab(tabIndex);
    if (tabIndex === 1) pin1SinceRef.current = Date.now();
    syncPinnedDockUI(tabIndex, prevPin);

    const el = scrollContainerRef.current;
    const focus = !isLeftColOpen && !isRightColOpen;
    const targetTop = getScrollTopForPinnedTab(tabIndex, focus);

    requestAnimationFrame(() => {
      applyScrollLayoutRef.current?.(targetTop, focus, true);
      el?.scrollTo({ top: targetTop, behavior: 'smooth' });
    });
  }, [getScrollTopForPinnedTab, syncPinnedDockUI, isLeftColOpen, isRightColOpen]);

  const handleNewsScroll = useCallback((e) => {
    setShowNewsScroll(e.target.scrollTop > 300);
  }, []);

  useEffect(() => {
    if (analyzing) setIsAutoScroll(true);
  }, [analyzing]);

  useEffect(() => {
    let timer;
    if (analyzing) {
      setElapsedTime(0);
      timer = setInterval(() => setElapsedTime(prev => prev + 1), 1000);
    } else {
      setElapsedTime(0);
    }
    return () => clearInterval(timer);
  }, [analyzing]);

  useEffect(() => {
    if (analyzing && aiReport && scrollContainerRef.current && isAutoScroll) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
    if (analyzing && aiReport && mobileScrollRef.current && isAutoScroll) {
      mobileScrollRef.current.scrollTop = mobileScrollRef.current.scrollHeight;
    }
  }, [aiReport, analyzing, isAutoScroll]);

  useEffect(() => {
    if (onRequestCloseChat) onRequestCloseChat(() => setIsChatOpen(false));
  }, [onRequestCloseChat]);

  useEffect(() => {
    if (!analysisNotice) return;
    const t = setTimeout(() => setAnalysisNotice(null), 7000);
    return () => clearTimeout(t);
  }, [analysisNotice]);

  useEffect(() => {
    const handleGlobalMouseMove = (e) => {
      if (!isDraggingChart) return;
      const delta = e.clientY - dragStartY.current;
      const isMobile = typeof window !== 'undefined' && window.innerWidth < 1024;
      const minHeight = isMobile ? 220 : 300;
      const maxHeight = isMobile ? Math.min(window.innerHeight * 0.78, 720) : 1200;
      const newHeight = Math.max(minHeight, Math.min(maxHeight, startHeight.current + delta));
      const wrapper = getActiveChartWrapper();
      if (wrapper) {
        wrapper.style.height = `${newHeight}px`;
        wrapper.style.flexBasis = `${newHeight}px`;
      }
    };
    const handleGlobalMouseUp = () => {
      if (isDraggingChart) {
        const wrapper = getActiveChartWrapper();
        if (wrapper) {
          const h = wrapper.offsetHeight;
          const didResize = Math.abs(h - resizeDragStartHeightRef.current) > 2;
          savedChartHeightRef.current = h;
          setSavedChartHeight(h);
          if (isReportReadingMode && didResize) {
            lockChartScrollLayout();
          }
        }
        setIsDraggingChart(false);
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      }
    };
    if (isDraggingChart) {
      window.addEventListener('pointermove', handleGlobalMouseMove);
      window.addEventListener('pointerup', handleGlobalMouseUp);
      window.addEventListener('pointercancel', handleGlobalMouseUp);
    }
    return () => {
      window.removeEventListener('pointermove', handleGlobalMouseMove);
      window.removeEventListener('pointerup', handleGlobalMouseUp);
      window.removeEventListener('pointercancel', handleGlobalMouseUp);
    };
  }, [isDraggingChart, isReportReadingMode, lockChartScrollLayout, getActiveChartWrapper]);

  useEffect(() => {
    const handleLeftColMove = (e) => {
      if (!isDraggingLeftCol) return;
      const delta = e.clientX - leftDragStartX.current;
      const newWidth = Math.max(LEFT_COL_MIN, Math.min(LEFT_COL_MAX, leftStartWidth.current + delta));
      setLeftColWidth(newWidth);
    };
    const handleLeftColUp = () => {
      if (isDraggingLeftCol) {
        setIsDraggingLeftCol(false);
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      }
    };
    if (isDraggingLeftCol) {
      window.addEventListener('pointermove', handleLeftColMove);
      window.addEventListener('pointerup', handleLeftColUp);
      window.addEventListener('pointercancel', handleLeftColUp);
    }
    return () => {
      window.removeEventListener('pointermove', handleLeftColMove);
      window.removeEventListener('pointerup', handleLeftColUp);
      window.removeEventListener('pointercancel', handleLeftColUp);
    };
  }, [isDraggingLeftCol]);

  const handleScroll = useCallback((e) => {
    if (analyzing) {
      const { scrollTop, clientHeight, scrollHeight } = e.target;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
      if (!isAtBottom && isAutoScroll) setIsAutoScroll(false);
      else if (isAtBottom && !isAutoScroll) setIsAutoScroll(true);
    }
  }, [analyzing, isAutoScroll]);

  const handleReportScroll = useCallback((e) => {
    handleScroll(e);
    if (!isScrollDrivenLayout) return;

    if (scrollRafRef.current !== null) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      const el = scrollContainerRef.current;
      if (!el) return;
      const st0 = el.scrollTop;
      const prevSt = lastScrollTopRef.current;
      const direction = st0 < prevSt - 0.5 ? 'up' : st0 > prevSt + 0.5 ? 'down' : 'same';
      scrollDirRef.current = direction;
      lastScrollTopRef.current = st0;
      isScrollingRef.current = true;
      suppressChartResizeRef.current = true;
      clearTimeout(scrollSettleTimerRef.current);
      scrollSettleTimerRef.current = setTimeout(() => {
        suppressChartResizeRef.current = false;
        isScrollingRef.current = false;
        const el2 = scrollContainerRef.current;
        if (el2) {
          applyScrollLayout(el2.scrollTop, !isLeftColOpen && !isRightColOpen, true);
        }
      }, 300);
      applyScrollLayout(st0, !isLeftColOpen && !isRightColOpen);
    });
  }, [handleScroll, isScrollDrivenLayout, isLeftColOpen, isRightColOpen, applyScrollLayout]);

  const handleHeatmapMouseMove = useCallback((e) => {
    if (tooltipRef.current) {
      tooltipRef.current.style.left = `${e.clientX + 14}px`;
      tooltipRef.current.style.top = `${e.clientY - 10}px`;
    }
  }, []);

  // Knowledge cards for loading screen
  const shownFactIndicesRef = useRef(new Set());
  const shownQuizIndicesRef = useRef(new Set());

  const [loadingCard, setLoadingCard] = useState(() => {
    const idx = Math.floor(Math.random() * VN_FACTS_ONLY.length);
    shownFactIndicesRef.current.add(idx);
    return VN_FACTS_ONLY[idx];
  });
  const [quizSelected, setQuizSelected] = useState(null);
  const [cardFlip, setCardFlip] = useState(false);

  const advanceCard = useCallback((nextCard) => {
    setCardFlip(true);
    setTimeout(() => {
      setLoadingCard(nextCard);
      setQuizSelected(null);
      setCardFlip(false);
    }, 350);
  }, []);

  useEffect(() => {
    if (!analyzing) {
      setQuizSelected(null);
      setCardFlip(false);
      shownFactIndicesRef.current.clear();
      shownQuizIndicesRef.current.clear();
      return;
    }
    if (loadingCard.type !== 'fact') return;
    const t = setTimeout(() => advanceCard(pickUnseen(VN_FACTS_ONLY, shownFactIndicesRef.current)), 15000);
    return () => clearTimeout(t);
  }, [analyzing, loadingCard]);

  const [heatmapView, setHeatmapView] = useState('sectors');
  const [heatmapSector, setHeatmapSector] = useState(null);
  const [hmColor, setHmColor] = useState('redGreen');
  const [hmShape, setHmShape] = useState('rectangle');
  const [hmMetric, setHmMetric] = useState('volume');
  const [hmHovered, setHmHovered] = useState(null);

  const reportShellBg = isDark ? '#0a0f18' : '#ffffff';

  const reportReadingDock = (
    <ReportReadingPinnedDock
      isDark={isDark}
      UI={UI}
      marketData={marketData}
      actionData={actionData}
      isUpdatingAction={isUpdatingAction}
      aiAnalysisDuration={aiAnalysisDuration}
      vnReportTimestamp={vnReportTimestamp}
      setShowPdfModal={setShowPdfModal}
      scrollContainerRef={scrollContainerRef}
      setIsChatOpen={setIsChatOpen}
      aiReport={aiReport}
      setShowFullReportModal={setShowFullReportModal}
      debateResult={effectiveDebateResult}
      dockPanelExpandHandlers={dockPanelExpandHandlers}
      onTabClick={handlePinnedTabClick}
      activeTab={dockActiveTab}
      dockReportMore={dockReportMore}
      onDockReportMoreChange={setDockReportMore}
      dockActionOpen={dockActionOpen}
      onDockActionOpenChange={setDockActionOpen}
      dockDebateOpen={dockDebateOpen}
      onDockDebateOpenChange={setDockDebateOpen}
    />
  );

  const renderChartCard = (embedded = false) => {
    const heightStyle = isDraggingChart
      ? undefined
      : { height: savedChartHeight, flexBasis: savedChartHeight };
    const heightClass = embedded ? '' : 'shrink-0 min-h-0';
    return (
      <div className={`px-2 ${embedded ? 'pt-0' : 'pt-2'} ${embedded ? '' : 'shrink-0'}`}>
        <div className={`w-full relative flex flex-col border rounded-2xl overflow-hidden ${
          embedded ? '' : (!isDraggingChart ? 'transition-all duration-300' : '')
        } ${
          isDark
            ? 'bg-[#0a0f18] border-yellow-400/40 shadow-[0_0_25px_rgba(34,197,94,0.1),_0_0_60px_rgba(34,197,94,0.05)]'
            : 'bg-white border-blue-400 shadow-[0_0_20px_rgba(250,204,21,0.3)]'
        }`}>
          <div
            ref={embedded ? chartWrapperEmbeddedRef : chartWrapperRef}
            style={heightStyle}
            className={`w-full shrink-0 relative flex flex-col ${heightClass} ${isDark ? 'bg-[#0a0f18]' : 'bg-white'}`}
          >
            <TradingChart
              key={isDark ? 'chart-dark' : 'chart-light'}
              data={chartData}
              theme={isDark ? 'dark' : 'light'}
              onIntervalChange={handleIntervalChange}
              currentInterval={activeInterval}
              suppressResizeRef={isReportReadingMode ? suppressChartResizeRef : null}
            />
          </div>
          <div
            onPointerDown={handleDragStart}
            className={`relative z-[60] h-5 lg:h-3.5 w-full cursor-row-resize flex items-center justify-center shrink-0 transition-colors border-t rounded-b-2xl touch-none select-none pointer-events-auto ${
              isDraggingChart
                ? 'bg-yellow-400/20 border-yellow-400/50'
                : isDark
                ? 'bg-white/5 border-yellow-400/40 hover:bg-yellow-400/10'
                : 'bg-slate-50 border-blue-200 hover:bg-blue-100'
            }`}
            title="Kéo để thay đổi kích thước biểu đồ"
          >
            <div className={`w-16 h-1 rounded-full ${isDraggingChart ? 'bg-yellow-400' : isDark ? 'bg-yellow-400/40' : 'bg-blue-300'}`} />
          </div>
        </div>
      </div>
    );
  };

  const renderReportMetaPanels = () => (
    <>
      <AiReportHeader
        isDark={isDark}
        UI={UI}
        marketData={marketData}
        actionData={actionData}
        isUpdatingAction={isUpdatingAction}
        aiAnalysisDuration={aiAnalysisDuration}
        vnReportTimestamp={vnReportTimestamp}
        setShowPdfModal={setShowPdfModal}
        scrollContainerRef={scrollContainerRef}
        setIsChatOpen={setIsChatOpen}
        aiReport={aiReport}
        setShowFullReportModal={setShowFullReportModal}
        compact={false}
      />
      <ActionSignalCard
        actionData={actionData}
        isUpdatingAction={isUpdatingAction}
        isDark={isDark}
        UI={UI}
      />
      <DebatePanel debateResult={effectiveDebateResult} isDark={isDark} UI={UI} defaultOpen={!!effectiveDebateResult} />
    </>
  );

  const renderChartBlock = (opts = {}) => {
    const { wrapperClass = '' } = opts;
    return <div className={wrapperClass}>{renderChartCard(false)}</div>;
  };

  // ─────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col w-full h-full overflow-hidden">
      {/* MOBILE TABS */}
      <div className={`lg:hidden flex w-full border-b shrink-0 ${isDark ? 'bg-[#080C11] border-white/8' : 'bg-slate-50 border-slate-200'} z-50`}>
        <MobileTabBtn isDark={isDark} active={mobileTab === 'market'} onClick={() => setMobileTab('market')} icon={Database} label="Dữ liệu" />
        <MobileTabBtn isDark={isDark} active={mobileTab === 'ai'} onClick={() => setMobileTab('ai')} icon={BrainCircuit} label="Omni AI" />
        <MobileTabBtn isDark={isDark} active={mobileTab === 'radar'} onClick={() => setMobileTab('radar')} icon={Activity} label="Radar" />
      </div>

      <div className="flex-1 flex flex-row w-full min-h-0 relative">

      {/* ── BOOKMARK TOGGLE COL 1 (desktop only) ── */}
      <button
        onClick={() => setIsLeftColOpen(v => !v)}
        title={isLeftColOpen ? 'Thu gọn bảng Dữ liệu' : 'Mở bảng Dữ liệu'}
        className="fixed z-[200] hidden lg:flex flex-col items-center justify-center"
        style={{
          top: '50%',
          transform: 'translateY(-50%)',
          left: isLeftColOpen ? `${leftColWidth}px` : '0px',
          opacity: 1,
          transition: isDraggingLeftCol
            ? 'none'
            : 'left 300ms cubic-bezier(0.4,0,0.2,1), opacity 200ms ease',
        }}
      >
        <div
          className="flex flex-col items-center justify-center gap-1.5 px-2 py-5 rounded-r-2xl active:scale-95"
          style={{
            transition: 'background 200ms, box-shadow 200ms, transform 100ms',
            borderTopWidth: '1px',
            borderBottomWidth: '1px',
            borderRightWidth: '1px',
            borderLeftWidth: '0px',
            borderStyle: 'solid',
            ...(isDark
              ? isLeftColOpen
                ? {
                    background: '#0d1219',
                    borderColor: 'rgba(250,204,21,0.22)',
                    color: '#facc15',
                    boxShadow: '4px 0 18px rgba(250,204,21,0.10)',
                  }
                : {
                    background: '#facc15',
                    borderColor: '#fde047',
                    color: '#000',
                    boxShadow: '4px 0 28px rgba(250,204,21,0.55)',
                  }
              : isLeftColOpen
                ? {
                    background: '#fff',
                    borderColor: '#cbd5e1',
                    color: '#475569',
                    boxShadow: '4px 0 12px rgba(0,0,0,0.10)',
                  }
                : {
                    background: '#facc15',
                    borderColor: '#fde047',
                    color: '#000',
                    boxShadow: '4px 0 20px rgba(250,204,21,0.45)',
                  }
            ),
          }}
        >
          <Database size={13} />
          <span
            className="text-[9px] font-black uppercase tracking-[0.18em] leading-none"
            style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
          >
            {isLeftColOpen ? 'Đóng' : 'Dữ liệu'}
          </span>
          <ChevronLeft
            size={11}
            style={{
              transition: 'transform 300ms',
              transform: isLeftColOpen ? 'rotate(0deg)' : 'rotate(180deg)',
            }}
          />
        </div>
      </button>

      {/* ── BOOKMARK TOGGLE COL 3 (desktop only) ──
           Khi col3 MỞ  → nút nằm ở cạnh TRÁI col3 (giữa col2 & col3), rounded-l
           Khi col3 ĐÓNG → nút trượt sang RIGHT edge màn hình, rounded-l, vàng nổi bật
           Transition: right + opacity đồng thời → hiệu ứng trượt + fade
      ── */}
      <button
        onClick={() => setIsRightColOpen(v => !v)}
        title={isRightColOpen ? 'Thu gọn bảng Radar & PDF' : 'Mở bảng Radar & PDF'}
        className="fixed z-[200] hidden lg:flex flex-col items-center justify-center"
        style={{
          top: '50%',
          transform: 'translateY(-50%)',
          /* Khi mở: right = độ rộng col3 (350px lg / 450px xl)
             Khi đóng: right = 0 (sát mép phải màn hình)
             CSS transition trên right tạo hiệu ứng trượt mượt */
          right: isRightColOpen ? 'clamp(350px, 27.5vw, 450px)' : '0px',
          opacity: 1,
          transition: 'right 300ms cubic-bezier(0.4,0,0.2,1), opacity 200ms ease',
        }}
      >
        <div
          className="flex flex-col items-center justify-center gap-1.5 px-2 py-5 rounded-l-2xl active:scale-95"
          style={{
            transition: 'background 200ms, box-shadow 200ms, transform 100ms',
            borderTopWidth: '1px',
            borderBottomWidth: '1px',
            borderLeftWidth: '1px',
            borderRightWidth: '0px',
            borderStyle: 'solid',
            ...(isDark
              ? isRightColOpen
                ? {
                    background: '#0d1219',
                    borderColor: 'rgba(250,204,21,0.22)',
                    color: '#facc15',
                    boxShadow: '-4px 0 18px rgba(250,204,21,0.10)',
                  }
                : {
                    background: '#facc15',
                    borderColor: '#fde047',
                    color: '#000',
                    boxShadow: '-4px 0 28px rgba(250,204,21,0.55)',
                  }
              : isRightColOpen
                ? {
                    background: '#fff',
                    borderColor: '#cbd5e1',
                    color: '#475569',
                    boxShadow: '-4px 0 12px rgba(0,0,0,0.10)',
                  }
                : {
                    background: '#facc15',
                    borderColor: '#fde047',
                    color: '#000',
                    boxShadow: '-4px 0 20px rgba(250,204,21,0.45)',
                  }
            ),
          }}
        >
          <Activity size={13} />
          <span
            className="text-[9px] font-black uppercase tracking-[0.18em] leading-none"
            style={{ writingMode: 'vertical-rl', textOrientation: 'mixed', transform: 'rotate(180deg)' }}
          >
            {isRightColOpen ? 'Đóng' : 'Radar'}
          </span>
          <ChevronRight
            size={11}
            style={{
              transition: 'transform 300ms',
              transform: isRightColOpen ? 'rotate(0deg)' : 'rotate(180deg)',
            }}
          />
        </div>
      </button>
      {/* ========================================================= */}
      {/* GRID COLUMN 1: MARKET DATA */}
      {/* ========================================================= */}
      <div
        className={`${mobileTab === 'market' ? 'flex' : 'hidden'} ${isLeftColVisible ? 'lg:flex' : 'lg:hidden'} w-full lg:w-[var(--left-col-w)] border-r flex-col shrink-0 relative h-full min-h-0 transition-colors duration-300 ${isDark ? 'bg-[#080C11] border-white/8' : 'bg-slate-50 border-slate-200'}`}
        style={{
          '--left-col-w': isLeftColOpen ? `${leftColWidth}px` : '0px',
          transition: isDraggingLeftCol
            ? 'opacity 280ms ease, transform 280ms cubic-bezier(0.4,0,0.2,1)'
            : 'opacity 280ms ease, transform 280ms cubic-bezier(0.4,0,0.2,1), width 300ms cubic-bezier(0.4,0,0.2,1)',
          opacity: isLeftColOpen ? 1 : 0,
          transform: isLeftColOpen ? 'translateX(0)' : 'translateX(-24px)',
          pointerEvents: isLeftColOpen ? 'auto' : 'none',
          overflow: 'hidden',
        }}
      >
          
        {/* Loading bar */}
        <div className={`h-[6px] w-full shrink-0 z-50 relative overflow-hidden ${isDark ? 'bg-white/10' : 'bg-slate-300'}`}>
          {loadingMarket && (
            <div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-yellow-400 to-transparent animate-shimmer shadow-[0_0_15px_rgba(250,204,21,1)]"
              style={{ backgroundSize: '200% 100%', animation: 'shimmer 1.2s infinite linear' }}
            />
          )}
        </div>
        {!marketData ? (
          /* ── IDLE STATE: Hiển thị Market Insight Panel ── */
          <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
            <MarketInsightPanel
              isDark={isDark}
              UI={UI}
              setInput={setInput}
              fetchMarketData={fetchMarketData}
            />
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0 relative">
            {/* HEADER: STOCK INFO */}
            <div className={`shrink-0 px-5 py-4 border-b shrink-0 z-20 relative ${isDark ? 'bg-black/30 border-white/8' : 'bg-white border-slate-200'}`}>
              <div className="flex justify-between items-start mb-4">
                <div>
                  <div className="flex items-end gap-2">
                    <h2 className={`text-4xl lg:text-5xl font-black tracking-tighter text-yellow-400 ${UI.textBold}`}>
                      {marketData.stockInfo.symbol}
                    </h2>
                    <span className="p-1 px-2 bg-emerald-500/10 text-emerald-500 rounded text-[10px] font-black uppercase tracking-widest mb-1 border border-emerald-500/20">
                      {marketData.stockInfo?.exchange}
                    </span>
                  </div>
                  <p className={`text-[12px] font-bold mt-1 leading-tight italic max-w-[220px] ${UI.textMuted}`}>
                    {(marketData.companyProfile?.companyName && marketData.companyProfile.companyName !== marketData.stockInfo?.symbol)
                      ? marketData.companyProfile.companyName
                      : (allStocks.find(s => s.symbol === marketData.stockInfo?.symbol)?.companyName || 'Đang cập nhật...')}
                  </p>
                </div>

                <div className="text-right">
                  <p className={`text-[9px] uppercase tracking-widest font-black mb-1 ${UI.textMuted}`}>Giá Khớp Lệnh</p>
                  <h2 className={`text-3xl lg:text-4xl font-black leading-none ${UI.textBold}`}>
                    {marketData.stockInfo.currentPrice ?? '---'}
                  </h2>
                  {marketData.stockInfo.change !== null && marketData.stockInfo.change !== undefined ? (
                    <div className={`flex items-center justify-end gap-1 font-black text-xs mt-2 ${marketData.stockInfo.change >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                      {marketData.stockInfo.change >= 0 ? '▲' : '▼'}
                      <span>
                        {Math.abs(marketData.stockInfo.change).toLocaleString('vi-VN')}
                        {' '}
                        ({Number(marketData.stockInfo.changePercent).toFixed(2)}%)
                      </span>
                    </div>
                  ) : (
                    <div className={`flex items-center justify-end gap-1 font-black text-xs mt-2 text-slate-500`}>
                      <span>Không có dữ liệu giao dịch</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* SCROLLABLE BODY */}
            <div
              ref={newsScrollRef}
              onScroll={handleNewsScroll}
              className={`flex-1 flex flex-col overflow-y-auto min-h-0 custom-scrollbar relative ${isDark ? 'bg-[#0a0f18]' : 'bg-slate-50'}`}
            >
              {/* MODULE 1: CHỈ SỐ TÀI CHÍNH */}
              <details className={`group shrink-0 border-b ${isDark ? 'border-white/6' : 'border-slate-200'}`}>
                <summary className={`flex items-center justify-between p-4 cursor-pointer select-none transition-colors sticky top-0 z-10 backdrop-blur-md ${isDark ? 'bg-[#0a0f18]/90 hover:bg-white/3' : 'bg-slate-50/90 hover:bg-slate-100'}`}>
                  <div className="flex items-center gap-2">
                    <BarChart3 size={16} className="text-emerald-400" />
                    <span className={`text-[11px] font-black uppercase tracking-widest ${UI.textBold}`}>Chỉ số & Tổng quan</span>
                  </div>
                  <ChevronDown size={16} className={`transition-transform duration-300 group-open:rotate-180 ${UI.textMuted}`} />
                </summary>
                
                <div className="px-4 pb-4 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className={`grid grid-cols-2 lg:grid-cols-4 gap-3 text-center mb-4 ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
                    <div className={`p-2.5 rounded-xl border flex flex-col items-center justify-center ${isDark ? 'bg-black/30 border-white/5' : 'bg-white border-gray-200 shadow-sm'}`}>
                      <p className={`text-[9px] mb-1.5 font-black tracking-widest uppercase ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>VỐN HÓA</p>
                      <p className="font-black text-sm leading-none whitespace-nowrap">{marketData.stockInfo.marketCap}</p>
                    </div>
                    <div className={`p-2.5 rounded-xl border flex flex-col items-center justify-center ${isDark ? 'bg-black/30 border-white/5' : 'bg-white border-gray-200 shadow-sm'}`}>
                      <p className={`text-[9px] mb-1.5 font-black tracking-widest uppercase ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>P/E</p>
                      <p className="font-black text-sm leading-none text-yellow-500 whitespace-nowrap">{marketData.stockInfo.pe}</p>
                    </div>
                    <div className={`p-2.5 rounded-xl border flex flex-col items-center justify-center ${isDark ? 'bg-black/30 border-white/5' : 'bg-white border-gray-200 shadow-sm'}`}>
                      <p className={`text-[9px] mb-1.5 font-black tracking-widest uppercase ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>TỔNG KL</p>
                      <p className="font-black text-sm leading-none whitespace-nowrap">{marketData.stockInfo.totalVolume}</p>
                    </div>
                    <div className={`p-2.5 px-3 rounded-xl border flex flex-col justify-center gap-1.5 ${isDark ? 'bg-black/30 border-white/5' : 'bg-white border-gray-200 shadow-sm'}`}>
                      <div className="flex justify-between items-center text-[11px] font-black text-emerald-500 leading-none">
                        <span className={`text-[6px] uppercase tracking-wider ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Mua</span>
                        <span className="whitespace-nowrap">{marketData.stockInfo.buyVolume}</span>
                      </div>
                      <div className="w-full h-1.5 flex rounded-full overflow-hidden bg-gray-800/20">
                        <div className="h-full bg-emerald-500" style={{ width: '60%' }} />
                        <div className="h-full bg-red-500" style={{ width: '40%' }} />
                      </div>
                      <div className="flex justify-between items-center text-[11px] font-black text-red-500 leading-none">
                        <span className={`text-[6px] uppercase tracking-wider ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Bán</span>
                        <span className="whitespace-nowrap">{marketData.stockInfo.sellVolume}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-center mb-3">
                    <button onClick={() => setShowExtraStats(!showExtraStats)} className={`flex items-center gap-1 text-[9px] font-black tracking-widest uppercase px-3 py-1 rounded-full border transition-all ${isDark ? 'text-slate-400 border-white/6 hover:bg-white/5 hover:border-white/12' : 'text-gray-500 border-gray-300 hover:bg-yellow-50'}`}>
                      {showExtraStats ? <><ChevronUp size={12} /> THU GỌN</> : <><ChevronDown size={12} /> XEM THÊM CHỈ SỐ</>}
                    </button>
                  </div>

                  {showExtraStats && (
                    <div className={`grid grid-cols-3 gap-3 text-center mb-4 p-3 rounded-2xl border animate-in slide-in-from-top-2 fade-in duration-200 ${isDark ? 'bg-[#0f1520] border-white/6' : 'bg-white border-gray-200 shadow-sm'}`}>
                      <div>
                        <p className={`text-[9px] mb-1 font-black tracking-widest uppercase ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>EPS (Nghìn)</p>
                        <p className="font-black text-sm">{marketData.stockInfo.eps}</p>
                      </div>
                      <div>
                        <p className={`text-[9px] mb-1 font-black tracking-widest uppercase ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>P/B</p>
                        <p className="font-black text-sm">{marketData.stockInfo.pb}</p>
                      </div>
                      <div>
                        <p className={`text-[9px] mb-1 font-black tracking-widest uppercase ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>GT Sổ sách</p>
                        <p className="font-black text-sm">{marketData.stockInfo.bvps}</p>
                      </div>
                    </div>
                  )}

                  <div className="-mb-5">
                    <CompanyOverview profile={marketData.companyProfile} isDark={isDark} UI={UI} />
                  </div>
                </div>
              </details>

              {/* MODULE 2: AI CONFIG & EXPORT */}
              <details className={`group shrink-0 border-b ${isDark ? 'border-white/6' : 'border-slate-200'}`}>
                <summary className={`relative flex items-center justify-between p-4 cursor-pointer select-none transition-all sticky top-0 z-10 border-l-4 overflow-hidden ${
                  isDark
                    ? 'bg-yellow-500 border-yellow-200 shadow-[0_0_25px_rgba(234,179,8,0.4)] hover:bg-yellow-400'
                    : 'bg-yellow-400 border-yellow-600 shadow-[0_0_20px_rgba(250,204,21,0.5)] hover:bg-yellow-300'
                }`}>
                  <div className="absolute inset-0 bg-white/30 animate-[pulse_2s_ease-in-out_infinite] pointer-events-none" />
                  <div className="flex items-center gap-2 relative z-10">
                    <BrainCircuit size={16} className="text-black" />
                    <span className="text-[11px] font-black uppercase tracking-widest text-black drop-shadow-sm">PHÂN TÍCH AI & CẤU HÌNH</span>
                  </div>
                  <ChevronDown size={16} className="transition-transform duration-300 group-open:rotate-180 relative z-10 text-black" />
                </summary>
                
                <div className="px-4 pb-4 animate-in fade-in slide-in-from-top-2 duration-300">

                  {/* ─── KHỐI 1: CHẾ ĐỘ ĐỌC PDF  ──────────────────── */}
                  {setPdfMode && (
                    <div className={`rounded-2xl p-3 mb-3 border ${isDark ? 'bg-black/30 border-white/6' : 'bg-white border-slate-200 shadow-sm mt-4'}`}>
                      <button 
                        onClick={() => setIsPdfConfigOpen(!isPdfConfigOpen)}
                        className="w-full flex items-center justify-between focus:outline-none mb-1.5"
                      >
                        <p className={`text-[9px] font-black tracking-widest uppercase ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                          ⚡ CHẾ ĐỘ PHÂN TÍCH BÁO CÁO PDF
                        </p>
                        {isPdfConfigOpen ? <ChevronUp size={12} className={isDark ? 'text-slate-400' : 'text-slate-500'} /> : <ChevronDown size={12} className={isDark ? 'text-slate-400' : 'text-slate-500'} />}
                      </button>

                      {isPdfConfigOpen && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 animate-in fade-in duration-200">
                          {[
                            { key: 'turbo',    label: 'TURBO',    icon: '⚡', desc: '3 - 8s (Siêu tốc)',       pros: 'Trả kết quả tức thì',        cons: 'Dễ bỏ sót bảng biểu, lỗi chữ' },
                            { key: 'fast',     label: 'FAST',     icon: '🚀', desc: '20 - 40s (Nhanh)',         pros: 'Cân bằng thời gian tốt',     cons: 'Bảng phức tạp có thể lệch'    },
                            { key: 'balanced', label: 'BALANCED', icon: '⚖️', desc: '60 - 90s (Tiêu chuẩn)',   pros: 'Đọc dữ liệu tài chính tốt',  cons: 'Thời gian chờ hơi lâu'        },
                            { key: 'full',     label: 'FULL',     icon: '🔬', desc: '150 - 200s (Chuyên sâu)', pros: 'Chính xác tối đa (OCR)',      cons: 'Rất chậm, ngốn tài nguyên'    },
                          ].map(({ key, label, icon, desc, pros, cons }) => {
                            const isActive = pdfMode === key;
                            return (
                              <button key={key} onClick={() => setPdfMode(key)} className={`rounded-xl border p-2.5 text-left transition-all active:scale-95 flex flex-col gap-1.5 ${isActive ? (isDark ? 'bg-yellow-400/20 border-yellow-400 text-yellow-400' : 'bg-yellow-100 border-yellow-500 text-yellow-700') : (isDark ? 'bg-black/30 border-white/6 text-slate-400 hover:border-white/12 hover:bg-black/40' : 'bg-slate-50 border-slate-300 text-slate-500 hover:border-slate-400 hover:bg-slate-100')}`}>
                                <div className="flex items-center justify-between w-full">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-sm">{icon}</span>
                                    <span className="text-[10px] font-black tracking-wider">{label}</span>
                                  </div>
                                  {isActive && <span className="text-[10px] font-black">✓</span>}
                                </div>
                                <p className={`text-[10px] font-bold ${isActive ? (isDark ? 'text-yellow-200' : 'text-yellow-900') : (isDark ? 'text-slate-300' : 'text-slate-700')}`}>⏱ {desc}</p>
                                <div className="flex flex-col gap-1 mt-0.5">
                                  <span className={`text-[8px] font-medium leading-tight ${isActive ? (isDark ? 'text-emerald-300' : 'text-emerald-700') : (isDark ? 'text-emerald-400/80' : 'text-emerald-600')}`}><span className="font-bold">✓</span> {pros}</span>
                                  <span className={`text-[8px] font-medium leading-tight ${isActive ? (isDark ? 'text-red-300' : 'text-red-700') : (isDark ? 'text-red-400/80' : 'text-red-500')}`}><span className="font-bold">⚠️</span> {cons}</span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                  {/* ─── KHỐI 2: CHẾ ĐỘ TÌM KIẾM TIN TỨC (COLLAPSE & AUTO-REFRESH UX) ─── */}
                  {setNewsMode && (
                    <div className={`rounded-2xl p-3 mb-3 border ${isDark ? 'bg-black/30 border-white/6' : 'bg-white border-slate-200 shadow-sm'}`}>
                      <button 
                        onClick={() => setIsNewsConfigOpen(!isNewsConfigOpen)}
                        className="w-full flex items-center justify-between focus:outline-none mb-1.5"
                      >
                        <p className={`text-[9px] font-black tracking-widest uppercase ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                          📡 CHẾ ĐỘ TÌM KIẾM TIN TỨC
                        </p>
                        {isNewsConfigOpen ? <ChevronUp size={12} className={isDark ? 'text-slate-400' : 'text-slate-500'} /> : <ChevronDown size={12} className={isDark ? 'text-slate-400' : 'text-slate-500'} />}
                      </button>

                      {isNewsConfigOpen && (
                        <div className="animate-in fade-in duration-200">
                          {/* Hàng trên: 2 mode chính */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                            {[
                              {
                                key: 'fast',
                                label: 'NHANH',
                                icon: '⚡',
                                desc: 'Ít nguồn, cache ưu tiên',
                                pros: 'Tốc độ cao, tải tức thì',
                                cons: 'Ít tin hơn, bỏ qua mạng nhỏ',
                                color: 'sky',
                                searchNote: 'Google RSS + RSS trực tiếp',
                              },
                              {
                                key: 'balanced',
                                label: 'CÂN BẰNG',
                                icon: '⚖️',
                                desc: 'Đa nguồn, lọc thông minh',
                                pros: 'Phân bổ đều sentiment',
                                cons: 'Chậm hơn một chút',
                                color: 'yellow',
                                searchNote: 'Google + RSS + Search sites',
                              },
                            ].map(({ key, label, icon, desc, pros, cons, color, searchNote }) => {
                              const isActive = newsMode === key;
                              const activeStyle = color === 'sky'
                                ? (isDark ? 'bg-sky-400/15 border-sky-400 text-sky-300' : 'bg-sky-50 border-sky-500 text-sky-700')
                                : (isDark ? 'bg-yellow-400/15 border-yellow-400 text-yellow-300' : 'bg-yellow-50 border-yellow-500 text-yellow-700');
                              const inactiveStyle = isDark
                                ? 'bg-black/30 border-white/6 text-slate-400 hover:border-white/12 hover:bg-black/40'
                                : 'bg-slate-50 border-slate-300 text-slate-500 hover:border-slate-400 hover:bg-slate-100';
                              return (
                                <button
                                  key={key}
                                  onClick={() => {
                                    setNewsMode(key);
                                    if (marketData?.stockInfo?.symbol) {
                                      fetchMarketData(marketData.stockInfo.symbol, key);
                                    }
                                  }}
                                  className={`rounded-xl border p-2.5 text-left transition-all active:scale-95 flex flex-col gap-1.5 ${isActive ? activeStyle : inactiveStyle}`}
                                >
                                  <div className="flex items-center justify-between w-full">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-sm">{icon}</span>
                                      <span className="text-[10px] font-black tracking-wider">{label}</span>
                                    </div>
                                    {isActive && <span className="text-[10px] font-black">✓</span>}
                                  </div>
                                  <p className={`text-[10px] font-bold ${isActive ? (isDark ? 'text-slate-200' : 'text-slate-700') : (isDark ? 'text-slate-300' : 'text-slate-700')}`}>
                                    🔎 {desc}
                                  </p>
                                  <div className="flex flex-col gap-1 mt-0.5">
                                    <span className={`text-[8px] font-medium leading-tight ${isActive ? (isDark ? 'text-emerald-300' : 'text-emerald-700') : (isDark ? 'text-emerald-400/80' : 'text-emerald-600')}`}>
                                      <span className="font-bold">✓</span> {pros}
                                    </span>
                                    <span className={`text-[8px] font-medium leading-tight ${isActive ? (isDark ? 'text-red-300' : 'text-red-700') : (isDark ? 'text-red-400/80' : 'text-red-500')}`}>
                                      <span className="font-bold">⚠️</span> {cons}
                                    </span>
                                  </div>
                                  <span className={`text-[7px] font-mono font-bold mt-0.5 truncate ${isActive ? (isDark ? 'text-slate-400' : 'text-slate-500') : (isDark ? 'text-slate-600' : 'text-slate-400')}`}>
                                    📡 {searchNote}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                          {/* Hàng dưới: 2 advanced modes*/}
                           <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {[
                              {
                                key: 'deep',
                                label: 'CHUYÊN SÂU',
                                icon: '🔬',
                                desc: 'Lọc nguồn chính thức',
                                pros: 'Chỉ tin báo chí uy tín',
                                cons: 'Có thể ít tin hơn mong đợi',
                                color: 'emerald',
                                searchNote: 'cafef, vietstock, baodautu...',
                              },
                              {
                                key: 'ultra',
                                label: 'ULTRA',
                                icon: '🛰️',
                                desc: 'Toàn bộ mạng lưới + rumor',
                                pros: 'Tối đa nguồn & tin đồn',
                                cons: 'Chậm, nhiều nhiễu tiêu cực',
                                color: 'purple',
                                searchNote: 'Tất cả nguồn + network scrape',
                              },
                            ].map(({ key, label, icon, desc, pros, cons, color, searchNote }) => {
                              const isActive = newsMode === key;
                              const colorMap = {
                                emerald: isActive
                                  ? (isDark ? 'bg-emerald-500/15 border-emerald-400 text-emerald-300' : 'bg-emerald-50 border-emerald-500 text-emerald-700')
                                  : (isDark ? 'bg-black/30 border-white/6 text-slate-400 hover:border-white/12 hover:bg-black/40' : 'bg-slate-50 border-slate-300 text-slate-500 hover:border-slate-400'),
                                purple: isActive
                                  ? (isDark ? 'bg-purple-500/15 border-purple-400 text-purple-300' : 'bg-purple-50 border-purple-500 text-purple-700')
                                  : (isDark ? 'bg-black/30 border-white/6 text-slate-400 hover:border-white/12 hover:bg-black/40' : 'bg-slate-50 border-slate-300 text-slate-500 hover:border-slate-400'),
                              };
                              return (
                                <button
                                  key={key}
                                  onClick={() => {
                                    setNewsMode(key);
                                     if (marketData?.stockInfo?.symbol) {
                                      fetchMarketData(marketData.stockInfo.symbol);
                                    }
                                  }}
                                  className={`rounded-xl border p-2.5 text-left transition-all active:scale-95 flex flex-col gap-1.5 ${colorMap[color]}`}
                                >
                                  <div className="flex items-center justify-between w-full">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-sm">{icon}</span>
                                      <span className="text-[10px] font-black tracking-wider">{label}</span>
                                    </div>
                                    {isActive && <span className="text-[10px] font-black">✓</span>}
                                  </div>
                                  <p className={`text-[10px] font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                                    🔎 {desc}
                                  </p>
                                  <div className="flex flex-col gap-1 mt-0.5">
                                    <span className={`text-[8px] font-medium leading-tight ${isDark ? 'text-emerald-400/80' : 'text-emerald-600'}`}>
                                      <span className="font-bold">✓</span> {pros}
                                    </span>
                                    <span className={`text-[8px] font-medium leading-tight ${isDark ? 'text-red-400/80' : 'text-red-500'}`}>
                                      <span className="font-bold">⚠️</span> {cons}
                                    </span>
                                  </div>
                                  <span className={`text-[7px] font-mono font-bold mt-0.5 truncate ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
                                    📡 {searchNote}
                                  </span>
                                </button>
                              );
                            })}
                          </div>

                          {/* Active mode badge */}
                          <div className={`mt-2 px-3 py-1.5 rounded-lg flex items-center justify-between ${isDark ? 'bg-white/3 border border-white/5' : 'bg-slate-50 border border-slate-200'}`}>
                            <span className={`text-[8px] font-black uppercase tracking-widest ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                              Chế độ đang dùng
                            </span>
                            <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${
                              newsMode === 'fast'     ? (isDark ? 'text-sky-400 border-sky-500/30 bg-sky-500/10' : 'text-sky-600 border-sky-300 bg-sky-50') :
                              newsMode === 'balanced' ? (isDark ? 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10' : 'text-yellow-600 border-yellow-300 bg-yellow-50') :
                              newsMode === 'deep'     ? (isDark ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' : 'text-emerald-600 border-emerald-300 bg-emerald-50') :
                                                        (isDark ? 'text-purple-400 border-purple-500/30 bg-purple-500/10' : 'text-purple-600 border-purple-300 bg-purple-50')
                            }`}>
                              {{
                                fast: '⚡ NHANH',
                                balanced: '⚖️ CÂN BẰNG',
                                deep: '🔬 CHUYÊN SÂU',
                                ultra: '🛰️ ULTRA',
                              }[newsMode]}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {/* EXPORT BUTTON */}
                  <button onClick={handleExportData} disabled={isExporting} className={`w-full h-9 mb-3 rounded-xl font-black transition-all active:scale-95 flex items-center justify-center gap-2 border text-[10px] uppercase tracking-widest ${isExporting ? 'opacity-50 cursor-not-allowed' : exportStatus === 'success' ? (isDark ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40' : 'bg-emerald-50 text-emerald-600 border-emerald-300') : exportStatus === 'error' ? (isDark ? 'bg-red-500/10 text-red-400 border-red-500/30' : 'bg-red-50 text-red-500 border-red-200') : (isDark ? 'bg-white/5 text-slate-400 border-white/10 hover:text-emerald-400 hover:border-emerald-500/30' : 'bg-white text-slate-500 border-slate-200 hover:text-emerald-600 hover:border-emerald-300')}`}>
                    {isExporting ? <><Loader2 size={12} className="animate-spin" /> Đang bóc PDF & tổng hợp...</> : exportStatus === 'success' ? <><CheckCircle2 size={12} /> Xuất thành công!</> : exportStatus === 'error' ? <><XCircle size={12} /> Xuất thất bại</> : <><FileJson size={12} /> Xuất Server Data (JSON)</>}
                  </button>

                  {/* AI BUTTONS */}
                  {(() => {
                    const elapsed = lastAiVnTime ? Date.now() - lastAiVnTime : Infinity;
                    const canCall = elapsed >= AI_REPORT_COOLDOWN_MS;
                    const remainSec = Math.max(0, Math.floor((AI_REPORT_COOLDOWN_MS - elapsed) / 1000));
                    const remainMin = Math.floor(remainSec / 60);
                    const remainSecStr = String(remainSec % 60).padStart(2, '0');

                    return (
                      <div className={`flex flex-col gap-3 mt-4 pt-4 border-t ${isDark ? 'border-white/6' : 'border-slate-200'}`}>
                        <button onClick={async () => { 
                            setIsRightColOpen(false);
                            setMobileTab('ai');
                            const result = await handleAiAnalysis(false);
                            if (result === 'cached') {
                              setAnalysisNotice('Mã vừa được phân tích gần đây. Phân tích lại quá gần sẽ không có thay đổi đáng kể — dùng "Quét lại ngay" nếu bạn vẫn muốn chạy lại.');
                            }
                        }} disabled={analyzing} className={`w-full h-12 rounded-xl font-black text-[12px] tracking-widest uppercase transition-all duration-300 flex items-center justify-center gap-2.5 active:scale-95 ${analyzing ? 'bg-black/40 text-slate-500 cursor-not-allowed border border-white/6 hidden' : isDark ? 'bg-gradient-to-r from-yellow-500 to-yellow-400 text-black shadow-[0_0_15px_rgba(250,204,21,0.2)] hover:shadow-[0_0_25px_rgba(250,204,21,0.4)] hover:-translate-y-0.5' : 'bg-gradient-to-r from-slate-900 to-slate-800 text-white shadow-lg hover:shadow-xl hover:-translate-y-0.5'}`}>
                          <BrainCircuit size={18} className={analyzing ? 'animate-pulse' : ''} />
                          {analyzing ? 'OMNI DUCK ĐANG TƯ DUY...' : 'PHÂN TÍCH VỚI OMNI DUCK'}
                        </button>
                        {analyzing && (
                          <button onClick={cancelAnalysis} className={`w-full h-10 rounded-xl font-black text-[11px] tracking-widest uppercase transition-all flex items-center justify-center gap-2 border border-dashed active:scale-95 ${isDark ? 'border-red-500/50 text-red-400 hover:bg-red-500/10 hover:border-red-500' : 'border-red-400 text-red-600 hover:bg-red-50 hover:border-red-500'}`}>
                            <X size={16} /> HỦY PHÂN TÍCH (LƯU BẢN NHÁP)
                          </button>
                        )}
                        {marketData && !analyzing && (
                          <button onClick={() => { 
                              setIsChatOpen(true); 
                              setMobileTab('ai'); // Tự động chuyển sang AI nếu mở Chat từ tab Dữ liệu
                          }} className={`w-full h-10 rounded-xl font-black text-[11px] tracking-widest uppercase transition-all duration-300 flex items-center justify-center gap-2 border active:scale-95 ${isDark ? 'bg-yellow-400/10 text-yellow-400 border-yellow-500/30 hover:bg-yellow-400/20' : 'bg-yellow-50 text-yellow-700 border-yellow-300 hover:bg-yellow-100'}`}>
                            <MessageSquare size={16} /> {aiReport ? 'CHAT VỀ BÁO CÁO NÀY' : 'HỎI ĐÁP VỚI AI'}
                          </button>
                        )}
                        <div className="flex items-center justify-between px-1 mt-1">
                          <span className={`text-[10px] font-medium tracking-wide flex items-center gap-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                            {canCall
                              ? <span className="text-emerald-400 flex items-center gap-1 font-bold"><CheckCircle2 size={12} /> AI Sẵn sàng</span>
                              : <span className="text-amber-500 flex items-center gap-1 font-bold"><Clock size={12} /> Tối ưu lại sau: {remainMin}:{remainSecStr}</span>
                            }
                          </span>
                          {(lastAiVnTime || aiReport) && (
                            <button onClick={() => setShowForceConfirm(true)} disabled={analyzing} className={`text-[9px] font-bold uppercase tracking-widest px-2 py-1 rounded transition-all opacity-30 hover:opacity-100 ${isDark ? 'text-slate-400 hover:text-white hover:bg-white/10' : 'text-slate-500 hover:text-black hover:bg-black/10'}`} title="Bỏ qua thời gian làm mát và ép AI quét lại">
                              ↻ Quét lại ngay
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </details>

              {/* MODULE 3: LIVE NEWS STREAM */}
              <details
                className={`group flex flex-col border-b ${isDark ? 'border-white/6' : 'border-slate-200'} ${isNewsOpen ? 'flex-1 min-h-0' : 'shrink-0'}`}
                onToggle={(e) => setIsNewsOpen(e.target.open)}
              >
                <summary className={`flex items-center justify-between p-4 cursor-pointer select-none transition-colors sticky top-0 z-10 backdrop-blur-md ${isDark ? 'bg-[#0a0f18]/90 hover:bg-white/3' : 'bg-slate-50/90 hover:bg-slate-100'}`}>
                  <div className="flex items-center gap-2">
                    <Newspaper size={16} className="text-purple-400" />
                    <span className={`text-[11px] font-black uppercase tracking-widest ${UI.textBold}`}>Live News Stream</span>
                    {(loadingMarket || loadingAiNews) && (
                      <Loader2 size={12} className="text-red-500 animate-spin ml-1" />
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {marketData.deepNewsData?.length > 0 && (
                      <span className="text-[9px] font-black uppercase tracking-widest text-emerald-500 border border-emerald-500/20 px-2 py-0.5 rounded-full bg-emerald-500/10 shadow-[0_0_8px_rgba(16,185,129,0.3)]">
                        {marketData.deepNewsData.length} TIN
                      </span>
                    )}
                    <ChevronDown size={16} className={`transition-transform duration-300 group-open:rotate-180 ${UI.textMuted}`} />
                  </div>
                </summary>

                <div className="p-4 pt-2 animate-in fade-in slide-in-from-top-2 duration-300 overflow-y-auto custom-scrollbar">
                  <div className="flex items-center justify-between mb-4">
                    <button onClick={fetchAiNews} disabled={loadingAiNews} className={`h-9 flex-1 rounded-xl font-black text-[9px] tracking-widest uppercase transition-all flex items-center justify-center gap-2 border border-dashed ${loadingAiNews ? 'opacity-50 border-slate-500 text-slate-500 cursor-not-allowed' : (isDark ? 'border-purple-500/50 text-purple-400 hover:bg-purple-500/10 hover:border-purple-500' : 'border-purple-400 text-purple-600 hover:bg-purple-50 hover:border-purple-500')}`}>
                      <BrainCircuit size={14} className={loadingAiNews ? 'animate-pulse' : ''} />
                      {loadingAiNews ? 'ĐANG QUÉT MẠNG DEEP WEB...' : 'SĂN THÊM TIN BẰNG AI'}
                    </button>
                    {loadingMarket && (
                      <button onClick={stopNewsStream} className="flex items-center gap-1.5 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white h-9 px-3 ml-2 rounded-xl transition-all border border-red-500/30">
                        <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                        <span className="text-[9px] font-black uppercase tracking-widest">Dừng</span>
                      </button>
                    )}
                  </div>

                  <div className="space-y-3">
                    {(marketData.deepNewsData || []).map((news, index) => {
                      // Badge logic
                      let badge;
                      if (news.isMacro)       badge = { label: 'Vĩ mô',     icon: <Activity size={9}/>,     cls: isDark ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40' : 'bg-sky-50 text-sky-700 border border-sky-300' };
                      else if (news.isAiGenerated) badge = { label: 'AI',   icon: <Bot size={9}/>,          cls: 'bg-purple-500 text-white shadow-[0_0_8px_rgba(168,85,247,0.5)]' };
                      else { const s = news.sentiment; const m = news.mode;
                        if (s === 'positive')  badge = { label: 'Tích cực',   icon: <TrendingUp size={9}/>,   cls: isDark ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-emerald-50 text-emerald-700 border border-emerald-300' };
                        else if (s === 'negative') badge = { label: 'Tiêu cực', icon: <TrendingDown size={9}/>, cls: isDark ? 'bg-red-500/20 text-red-400 border border-red-500/40' : 'bg-red-50 text-red-700 border border-red-300' };
                        else if (m === 'official') badge = { label: 'Chính thức', icon: <Newspaper size={9}/>, cls: isDark ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40' : 'bg-blue-50 text-blue-700 border border-blue-300' };
                        else if (m === 'rumor')   badge = { label: 'Tin đồn',  icon: <Radio size={9}/>,       cls: isDark ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' : 'bg-amber-50 text-amber-700 border border-amber-300' };
                        else if (m === 'negative') badge = { label: 'Rủi ro',  icon: <ShieldAlert size={9}/>, cls: isDark ? 'bg-orange-500/20 text-orange-400 border border-orange-500/40' : 'bg-orange-50 text-orange-700 border border-orange-300' };
                        else badge = { label: 'Tổng hợp', icon: <Minus size={9}/>, cls: isDark ? 'bg-white/5 text-slate-400 border border-white/10' : 'bg-slate-100 text-slate-500 border border-slate-200' };
                      }
                      // Card style
                      let cardStyle;
                      if (news.isMacro) cardStyle = isDark ? 'bg-[#080e18] border-sky-500/30' : 'bg-sky-50/60 border-sky-200';
                      else if (news.isAiGenerated) cardStyle = isDark ? 'bg-[#1a1025] border-purple-500/50 shadow-[0_0_15px_rgba(168,85,247,0.15)]' : 'bg-purple-50 border-purple-400';
                      else if (news.sentiment === 'negative') cardStyle = isDark ? 'bg-[#130c0c] border-red-900/40' : 'bg-red-50/50 border-red-200';
                      else if (news.sentiment === 'positive') cardStyle = isDark ? 'bg-[#071a10] border-emerald-500/50 shadow-[0_0_12px_rgba(16,185,129,0.12)]' : 'bg-emerald-50 border-emerald-400';
                      else cardStyle = isDark ? 'bg-[#131922] border-white/6' : 'bg-white border-slate-200 shadow-sm';

                      const titleColor = news.isAiGenerated ? 'text-purple-400 group-hover:text-purple-300' : news.sentiment === 'negative' ? `text-red-400 group-hover:text-red-300 ${isDark ? '' : 'text-red-600 group-hover:text-red-700'}` : news.sentiment === 'positive' ? `text-emerald-400 group-hover:text-emerald-300 ${isDark ? '' : 'text-emerald-700 group-hover:text-emerald-600'}` : `group-hover:text-yellow-500 ${UI.textNormal}`;
                      const dateColor = news.isAiGenerated ? 'text-purple-300' : news.sentiment === 'positive' ? 'text-emerald-400' : 'text-yellow-500';
                      return (
                        <a key={index} href={news.link} target="_blank" rel="noopener noreferrer" className={`block rounded-2xl p-4 transition-all cursor-pointer group border ${UI.cardHover} ${cardStyle}`}>
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <span className={`inline-flex items-center gap-1 shrink-0 text-[9px] px-2 py-[3px] rounded-full font-black uppercase tracking-widest ${badge.cls}`}>{badge.icon}{badge.label}</span>
                              <span className={`text-[9px] font-bold tabular-nums whitespace-nowrap ${dateColor}`}>{news.date || 'Tin tức mới'}</span>
                            </div>
                            <h3 className={`font-bold text-sm leading-snug transition-colors ${titleColor}`}>{news.title}</h3>
                            <div className={`mt-3 pt-2 flex justify-between items-center gap-3 border-t ${isDark ? 'border-white/5' : 'border-slate-200'}`}>
                              <span className={`text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 truncate ${news.isAiGenerated ? 'text-purple-400' : UI.textBold}`}>
                                {news.source ? <><Globe size={10} className="shrink-0" /><span className="truncate">{news.source}</span></> : <><Globe size={10} className="shrink-0" /><span className="truncate">Internet</span></>}
                              </span>
                              <div className="flex items-center gap-0 shrink-0">
                                <span className={`text-[10px] flex items-center gap-1 font-mono font-bold ${UI.textMuted}`}><Clock size={10} /> {news.fetchedAt || 'Đang đồng bộ'}</span>
                                <ExternalLink size={12} className={`shrink-0 opacity-0 group-hover:opacity-100 transition-opacity ml-1 ${news.sentiment === 'positive' ? 'text-emerald-400' : news.isAiGenerated ? 'text-purple-400' : 'text-yellow-500'}`} />
                              </div>
                            </div>
                          </a>
                        );
                      })}
                  </div>
                </div>
              </details>

              {/* Terminal when news closed */}
              {!isNewsOpen && marketData && (
                <TerminalNewsStream
                  newsList={marketData.deepNewsData}
                  loading={loadingMarket || loadingAiNews}
                  isDark={isDark}
                />
              )}
            </div>

            {/* Scroll to top button - news panel */}
            {showNewsScroll && (
              <button onClick={() => newsScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })} className={`absolute bottom-6 right-6 z-50 p-3 rounded-full backdrop-blur-md transition-all duration-300 opacity-50 hover:opacity-100 hover:-translate-y-1 border shadow-lg ${isDark ? 'bg-[#0a0f18]/80 text-yellow-400 border-yellow-500/30 hover:bg-[#0a0f18]' : 'bg-white/80 text-yellow-600 border-yellow-300 hover:bg-white'}`} title="Cuộn lên đầu tin tức">
                <ChevronUp size={22} strokeWidth={3} />
                {loadingMarket && (<><span className="absolute top-0 right-0 w-2.5 h-2.5 bg-red-500 rounded-full animate-ping opacity-75" /><span className="absolute top-0 right-0 w-2.5 h-2.5 bg-red-500 rounded-full" /></>)}
              </button>
            )}
          </div>
        )}

        {/* MarketOverview pinned bottom */}
        <div className={`shrink-0 border-t z-20 ${isDark ? 'bg-[#080C11] border-white/8' : 'bg-[#F1F5F9] border-slate-300'}`}>
          <MarketOverview isDark={isDark} UI={UI} marketIntel={marketIntel} vnIndexData={vnIndexData} />
        </div>

        {/* Resize handle (desktop only) */}
        {isLeftColOpen && (
          <div
            onPointerDown={handleLeftColDragStart}
            className={`hidden lg:flex absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize z-30 touch-none select-none items-center justify-center group ${isDraggingLeftCol ? 'bg-yellow-400/40' : 'hover:bg-yellow-400/25'}`}
            title="Kéo để điều chỉnh độ rộng"
          >
            <div className={`w-0.5 h-12 rounded-full transition-colors ${isDark ? 'bg-white/20 group-hover:bg-yellow-400/60' : 'bg-slate-300 group-hover:bg-yellow-500/60'}`} />
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* GRID COLUMN 2: CHART + AI ANALYSIS */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <div className={`${mobileTab === 'ai' ? 'flex' : 'hidden'} lg:flex flex-1 h-full min-h-0 flex-col overflow-hidden relative transition-all duration-300 ${isDark ? 'bg-[#0a0f18]' : 'bg-white'} ${isLeftColOpen ? `border-l ${isDark ? 'border-white/8' : 'border-slate-200'}` : ''} ${isRightColOpen ? `border-r ${isDark ? 'border-white/8' : 'border-slate-200'}` : ''}`}>

        {analysisNotice && (
          <div className={`shrink-0 mx-3 mt-2 px-4 py-3 rounded-xl border flex items-start gap-2 text-[11px] z-30 animate-in fade-in slide-in-from-top-2 duration-300 ${isDark ? 'bg-amber-500/10 border-amber-500/30 text-amber-200' : 'bg-amber-50 border-amber-300 text-amber-900'}`}>
            <Info size={14} className="shrink-0 mt-0.5 text-amber-400" />
            <span className="leading-relaxed flex-1">{analysisNotice}</span>
            <button onClick={() => setAnalysisNotice(null)} className={`shrink-0 p-1 rounded-md transition-colors ${isDark ? 'hover:bg-white/10 text-amber-300' : 'hover:bg-amber-100 text-amber-700'}`}>
              <X size={12} />
            </button>
          </div>
        )}

        {/* ── CHART (PINNED) — ẩn trên desktop khi đọc báo cáo ── */}
        {marketData && renderChartBlock({ wrapperClass: isReportReadingMode ? 'lg:hidden' : '' })}
        {/* CUỘN TỰ ĐỘNG */}
        {!isAutoScroll && analyzing && aiReport && (
          <button
            onClick={() => {
              if (scrollContainerRef.current) {
                scrollContainerRef.current.scrollTo({ top: scrollContainerRef.current.scrollHeight, behavior: 'smooth' });
                setIsAutoScroll(true);
              }
            if (mobileScrollRef.current) {
              mobileScrollRef.current.scrollTo({ top: mobileScrollRef.current.scrollHeight, behavior: 'smooth' });
              setIsAutoScroll(true);
            }
            }}
            className="absolute bottom-10 right-8 z-[100] p-3 bg-yellow-500 text-black rounded-full shadow-[0_0_20px_rgba(234,179,8,0.5)] hover:bg-yellow-400 transition-all animate-bounce opacity-50 hover:opacity-100"
            title="Trở lại cuộn tự động"
          >
            <ChevronDown size={24} />
          </button>
        )}

        {/* ── SCROLLABLE MAIN CONTENT ── */}
        <div
          ref={scrollContainerRef}
          onScroll={handleReportScroll}
           className="flex-1 min-h-0 overflow-y-auto overscroll-contain custom-scrollbar relative"
        >
           <div className={`px-3 sm:px-5 pb-24 lg:pb-16 pt-1 ${isReportReadingMode && isFocusLayout ? 'lg:px-14' : 'lg:px-8'}`}>
          {/* Chart trong scroll — desktop + đọc báo cáo */}
          {isReportReadingMode && aiReport && (
            <>
            <ReportReadingStickyShell
              stickyStackRef={stickyStackRef}
              chartSlotRef={chartSlotRef}
              chartClipRef={chartClipRef}
              pinnedDockRef={pinnedDockRef}
              savedChartHeight={savedChartHeight}
              chartHandleH={chartHandleH}
              reportShellBg={reportShellBg}
              isDark={isDark}
              chartCard={renderChartCard(true)}
              dock={isScrollDrivenLayout ? reportReadingDock : null}
              scrollLayoutLocked={chartScrollLayoutLocked}
            />
            {isScrollDrivenLayout && (
            <div className="hidden lg:flex items-center gap-3 px-2 py-3 mt-1 mb-0">
              <div className={`flex-1 h-px ${isDark ? 'bg-gradient-to-r from-transparent via-yellow-400/70 to-yellow-400/25' : 'bg-gradient-to-r from-transparent via-yellow-500/60 to-yellow-400/20'}`} />
              <span className={`text-[9px] font-black uppercase tracking-[0.22em] shrink-0 px-2 py-1 rounded-full border ${isDark ? 'text-yellow-400/90 border-yellow-400/35 bg-yellow-400/5' : 'text-yellow-700 border-yellow-400/40 bg-yellow-50'}`}>
                Nội dung báo cáo
              </span>
              <div className={`flex-1 h-px ${isDark ? 'bg-gradient-to-r from-yellow-400/25 via-yellow-400/70 to-transparent' : 'bg-gradient-to-r from-yellow-400/20 via-yellow-500/60 to-transparent'}`} />
            </div>
            )}
            </>
          )}
          {/* ── HOME SCREEN: History + Heatmap ── */}
          {!analyzing && !aiReport && (
            <div className="flex flex-col gap-5 lg:gap-6 animate-in fade-in duration-700 pt-4 lg:pt-5">
              {/* AI Market Intelligence moved to the left column (idle state) */}
              <div>
                <h2 className={`text-2xl font-black tracking-tight ${UI.textBold}`}>CÁC MÃ GẦN ĐÂY</h2>
                <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-yellow-500 mt-1">Personal Intelligence Feed</p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={historySortMode}
                  onChange={(e) => setHistorySortMode(e.target.value)}
                  className={`text-[9px] font-bold uppercase tracking-widest px-2 py-1.5 rounded-xl cursor-pointer outline-none border transition-colors ${isDark ? 'bg-black/30 text-slate-300 border-white/6' : 'bg-white text-slate-600 border-slate-300'}`}
                >
                  <option value="time_desc">⏱ Mới nhất</option>
                  <option value="time_asc">⏳ Cũ nhất</option>
                  <option value="action">⚡ Ưu tiên Mua/Bán</option>
                </select>
                <button onClick={fetchUserHistory} title="Làm mới lịch sử" className={`p-2 rounded-lg border ${UI.btnLog}`}><RefreshCw size={14} /></button>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {sortedHistory.map((item, idx) => {
                    const changePercent = parseFloat(item.changePercent) || 0;
                    const isUp = changePercent > 0;
                    const isDown = changePercent < 0;
                    const formattedPercent = Math.abs(changePercent).toFixed(2);
                    return (
                      <div key={idx}
                        onClick={() => { setInput(item.symbol); fetchMarketData(item.symbol); }}
                        className={`group relative flex flex-row items-center justify-between p-4 rounded-2xl border transition-all cursor-pointer w-full min-h-[75px]
                          ${isDark ? 'bg-[#131922] border-white/6 hover:bg-white/3' : 'bg-white border-slate-200 hover:bg-gray-50'}`}
                      >
                        <div className={`absolute left-0 top-1/4 bottom-1/4 w-1 rounded-r-full ${
                          item.lastAction?.includes('MUA') ? 'bg-emerald-500 shadow-[0_0_10px_#10b981]' :
                          item.lastAction?.includes('BÁN') ? 'bg-red-500 shadow-[0_0_10px_#ef4444]' : 'bg-yellow-500'
                        }`} />
                        <div className="flex flex-row items-center gap-3 lg:gap-6 min-w-0 flex-1 ml-2">
                          <div className="flex-1 flex flex-col items-start gap-y-0.5 min-w-0 pr-4">
                            <div className="flex items-center gap-1.5">
                              <h3 className={`text-xl font-black tracking-tighter text-yellow-400 ${UI.textBold}`}>{item.symbol}</h3>
                              <span className="text-[10px] font-bold text-slate-600 uppercase">/ {item.exchange}</span>
                            </div>
                            <p className="text-[10px] font-bold text-slate-500 uppercase whitespace-normal leading-tight">{item.companyName || 'N/A'}</p>
                          </div>
                          <div className="flex flex-col items-end gap-y-0.5 whitespace-nowrap">
                            <p className={`text-lg font-black flex items-center gap-1.5 justify-end ${isUp ? 'text-emerald-500' : isDown ? 'text-red-500' : 'text-slate-400'}`}>
                              {(item.price || 0).toLocaleString('vi-VN').replace(/,/g, '.')}
                              <span className="text-[11px] font-bold flex items-center ml-0.5">
                                {isUp && <ChevronUp size={14} className="mr-0.5" />}
                                {isDown && <ChevronDown size={14} className="mr-0.5" />}
                                ({formattedPercent}%)
                              </span>
                            </p>
                            <p className="text-[9px] font-bold text-slate-500 italic">Cập nhật: {new Date(item.timestamp).toLocaleString('vi-VN')}</p>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-y-1.5 min-w-[110px] shrink-0 pl-4">
                          <span className={`px-4 py-1.5 rounded-full font-black text-[10px] uppercase border tracking-tight ${
                            item.lastAction?.includes('MUA') ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                            item.lastAction?.includes('BÁN') ? 'bg-red-500/20 text-red-400 border-red-500/30' :
                            'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                          }`}>{item.lastAction || 'QUAN SÁT'}</span>
                        </div>
                      </div>
                    );
                  })
                }
              </div>

              {userHistory.length > historyLimit && (
                <button onClick={() => setHistoryLimit(prev => prev + 3)} className={`w-full py-4 rounded-2xl border-2 border-dashed font-black text-[10px] tracking-[0.3em] uppercase transition-all ${UI.btnLog}`}>
                  Tải thêm (+3)
                </button>
              )}

              {/* Heatmap */}
              {(loadingHeatmap || heatmapData.length > 0) && (() => {
                const getWeight = (stock) => {
                  try {
                    if (hmMetric === 'value') {
                      const v = (stock.price || 0) * (stock.volume || 0);
                      return isFinite(v) && v > 0 ? v : 1;
                    }
                    if (hmMetric === 'marketcap') {
                      const stockInfo = allStocks.find(s => s.symbol === stock.sym || s.symbol === stock.id);
                      if (stockInfo?.marketCap) {
                        const raw = String(stockInfo.marketCap).replace(/[^\d]/g, '');
                        const capNumber = parseFloat(raw);
                        return isFinite(capNumber) && capNumber > 0 ? capNumber : stock.volume || 1;
                      }
                      return stock.volume || 1;
                    }
                    const vol = stock.volume || 1;
                    return isFinite(vol) && vol > 0 ? vol : 1;
                  } catch { return 1; }
                };

                let hmData = [];
                let hmTotal = 0;

                if (heatmapView === 'sectors') {
                  hmData = heatmapData.map(sec => {
                    const weight = sec.stocks.reduce((sum, s) => sum + getWeight(s), 0);
                    return { id: sec.name, name: sec.name, changePct: sec.avgChange, weight };
                  });
                  hmTotal = hmData.reduce((sum, d) => sum + d.weight, 0);
                } else if (heatmapView === 'stocks' && heatmapSector) {
                  const sec = heatmapData.find(s => s.name === heatmapSector);
                  if (sec) {
                    hmData = sec.stocks.map(s => {
                      const info = allStocks.find(as => as.symbol === s.sym) || {};
                      return {
                        id: s.sym, name: s.sym, fullName: info.companyName || 'Đang cập nhật',
                        exchange: info.exchange || 'VNX', price: s.price,
                        changePct: s.changePct, weight: getWeight(s)
                      };
                    });
                    hmTotal = hmData.reduce((sum, d) => sum + d.weight, 0);
                  }
                }
                hmData.sort((a, b) => b.weight - a.weight);

                return (
                  <>
                    <div className="mt-8 border-t pt-6 border-white/8">
                      <div className="flex flex-col 2xl:flex-row 2xl:items-center justify-between mb-4 gap-3">
                        <div className="flex items-center gap-3">
                          {heatmapView === 'stocks' && (
                            <button
                              onClick={() => { setHeatmapView('sectors'); setHeatmapSector(null); }}
                              className={`flex items-center gap-1 text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-xl border transition-all ${isDark ? 'bg-black/30 border-white/6 hover:bg-white/5' : 'bg-slate-100 border-slate-200 hover:bg-slate-200'}`}
                            >
                              <ArrowLeft size={14} /> QUAY LẠI
                            </button>
                          )}
                          <h2 className={`text-sm font-black tracking-widest uppercase ${UI.textBold}`}>
                            {heatmapView === 'sectors' ? 'Bản đồ Nhiệt Ngành' : `NGÀNH: ${heatmapSector}`}
                          </h2>
                          {heatmapView === 'stocks' && (
                            <span className={`text-[9px] font-bold px-2 py-1 rounded border border-dashed animate-pulse ${isDark ? 'text-yellow-400 border-yellow-400/30' : 'text-yellow-600 border-yellow-400'}`}>
                              ✦ Double-click mã để phân tích
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-1">
                          <select value={hmMetric} onChange={e => setHmMetric(e.target.value)} className={`text-[9px] font-bold uppercase tracking-widest px-2 py-1.5 rounded-xl cursor-pointer outline-none border transition-colors ${isDark ? 'bg-black/30 text-slate-300 border-white/6' : 'bg-white text-slate-600 border-slate-300'}`}>
                            <option value="volume">📊 Tỷ lệ: Khối lượng GD</option>
                            <option value="value">💰 Tỷ lệ: Giá trị GD</option>
                            <option value="marketcap">🏢 Tỷ lệ: Vốn hóa</option>
                          </select>
                          <select value={hmShape} onChange={e => setHmShape(e.target.value)} className={`text-[9px] font-bold uppercase tracking-widest px-2 py-1.5 rounded-xl cursor-pointer outline-none border transition-colors ${isDark ? 'bg-black/30 text-slate-300 border-white/6' : 'bg-white text-slate-600 border-slate-300'}`}>
                            <option value="rectangle">🟩 Dạng: Chữ nhật</option>
                            <option value="polygon">⬟ Dạng: Đa giác</option>
                            <option value="circle">⏺ Dạng: Hình tròn</option>
                          </select>
                          <select value={hmColor} onChange={e => setHmColor(e.target.value)} className={`text-[9px] font-bold uppercase tracking-widest px-2 py-1.5 rounded-xl cursor-pointer outline-none border transition-colors ${isDark ? 'bg-black/30 text-slate-300 border-white/6' : 'bg-white text-slate-600 border-slate-300'}`}>
                            <option value="redGreen">🔴 Màu Cơ bản (+/-)</option>
                            <option value="monochrome">🔵 Đơn sắc (Vol)</option>
                          </select>
                        </div>
                      </div>

                      {loadingHeatmap ? (
                        <div className="grid grid-cols-5 gap-1.5 mb-6">
                          {Array(10).fill(0).map((_, i) => <div key={i} className={`rounded-lg h-[80px] animate-pulse ${isDark ? 'bg-white/5' : 'bg-slate-200'}`} />)}
                        </div>
                      ) : (() => {
                        const getBg = (changePct, rawPct) => {
                          if (hmColor === 'redGreen') {
                            if (changePct > 3)   return '#00c851';
                            if (changePct > 1.5) return '#00a040';
                            if (changePct > 0)   return '#28a745';
                            if (changePct > -1.5) return '#e53935';
                            if (changePct > -3)  return '#c62828';
                            return '#8b0000';
                          }
                          return rawPct > 15 ? '#2563eb' : rawPct > 5 ? '#1d4ed8' : '#1e3a8a';
                        };

                        const minW = hmData.length > 0 ? Math.min(...hmData.map(d => d.weight)) : 0;
                        const maxW = hmData.length > 0 ? Math.max(...hmData.map(d => d.weight)) : 0;
                        const minSz = 54, maxSz = 160;

                        const getSizePx = (weight) =>
                          maxW === minW ? 100 : minSz + (maxSz - minSz) * ((weight - minW) / (maxW - minW));

                        // ─── RECTANGLE: giữ nguyên flex-wrap cũ ───────────────────────────
                        if (hmShape === 'rectangle') {
                          return (
                            <div className="flex flex-wrap gap-1.5 mb-8 content-start" style={{ minHeight: '220px' }}>
                              {hmData.map(item => {
                                const rawPct = hmTotal > 0 ? (item.weight / hmTotal) * 100 : 0;
                                const pctWidth = Math.max(rawPct, 4);
                                const color = getBg(item.changePct, rawPct);
                                const heightPx = getSizePx(item.weight);
                                return (
                                  <div
                                    key={item.id}
                                    onMouseEnter={(e) => {
                                      setHmHovered({ id: item.id, name: item.name, fullName: item.fullName || item.name });
                                      setTimeout(() => {
                                        if (tooltipRef.current) {
                                          tooltipRef.current.style.left = `${e.clientX + 14}px`;
                                          tooltipRef.current.style.top = `${e.clientY - 10}px`;
                                        }
                                      }, 0);
                                    }}
                                    onMouseLeave={() => setHmHovered(null)}
                                    onMouseMove={handleHeatmapMouseMove}
                                    onClick={() => { if (heatmapView === 'sectors') { setHeatmapSector(item.name); setHeatmapView('stocks'); } }}
                                    onDoubleClick={() => { if (heatmapView === 'stocks') { setInput(item.name); fetchMarketData(item.name); } }}
                                    style={{ width: `calc(${pctWidth}% - 4px)`, minHeight: heightPx, background: color, flexGrow: 1 }}
                                    className="text-white p-2 rounded-md flex flex-col justify-between border border-black/10 shadow-sm cursor-pointer hover:brightness-125 transition-[filter] group overflow-hidden active:scale-95"
                                  >
                                    <div className="flex flex-col relative z-10">
                                      <span className="text-[11px] md:text-sm font-black uppercase leading-tight truncate drop-shadow-md">{item.name}</span>
                                      {heatmapView === 'stocks' && <span className="text-[8px] font-medium opacity-80 truncate hidden md:block leading-tight mt-0.5 max-w-full drop-shadow-md">{item.fullName}</span>}
                                    </div>
                                    <div className="flex flex-col mt-1 relative z-10">
                                      <span className="text-sm md:text-base font-black drop-shadow-md">{item.changePct >= 0 ? '+' : ''}{item.changePct}%</span>
                                      {heatmapView === 'stocks' && <span className="text-[9px] font-bold opacity-80 drop-shadow-md">{(item.price || 0).toLocaleString('vi-VN')}</span>}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        }

                        // ─── CIRCLE / POLYGON: layout đồng tâm động ─────────────────────
                        // Kích thước hex/circle: tâm lớn nhất, thu dần ra ngoài theo vòng
                        // Bán kính vòng = (r_tâm + gap + r_vòng_trước_avg)  → hình sát nhau
                        const sorted = [...hmData].sort((a, b) => b.weight - a.weight);
                        const n = sorted.length;

                        // Gán kích thước riêng cho từng item theo rank
                        // Ring 0 = max, ring 1 = 80%, ring 2+ = 60-50%
                        const getSzByRank = (rankRatio) => {
                          // rankRatio 0..1 (0 = lớn nhất)
                          const factor = 1 - rankRatio * 0.55; // 1.0 → 0.45
                          return Math.round(maxSz * Math.max(factor, 0.35));
                        };

                        // Nhóm thành các vòng; tính bán kính ĐỘNG dựa trên kích thước thực tế
                        // ring 0: 1 item ở tâm
                        // ring k: đủ để fit theo chu vi, tối đa 8 item/vòng
                        const rings = [];
                        let rem = sorted.map((item, i) => ({ item, rank: i / Math.max(n - 1, 1) }));

                        // Vòng 0: 1 item to nhất
                        rings.push(rem.splice(0, 1));
                        // Các vòng tiếp theo: tối đa 6 rồi 8 rồi 10
                        const maxPerRing = [6, 8, 10, 12];
                        let ri = 0;
                        while (rem.length > 0) {
                          const cap = maxPerRing[Math.min(ri, maxPerRing.length - 1)];
                          rings.push(rem.splice(0, cap));
                          ri++;
                        }

                        // Tính bán kính từng ring dựa theo kích thước hình thực tế (sát nhau hơn)
                        const GAP = 6; // khoảng hở tối thiểu giữa các hình (px trong SVG coord)
                        const ringRadiiDyn = [0];
                        let prevOuterR = getSzByRank(0) / 2; // bán kính hình tâm

                        for (let rIdx = 1; rIdx < rings.length; rIdx++) {
                          const ring = rings[rIdx];
                          // Kích thước trung bình các item trong vòng này
                          const avgSz = ring.reduce((s, { rank }) => s + getSzByRank(rank), 0) / ring.length;
                          const itemR = avgSz / 2;
                          // Khoảng cách tâm-tâm đủ để không chồng nhau
                          // d = prevOuterR + gap + itemR (tính theo hướng bán kính)
                          // Nhưng nếu nhiều hình trên vòng, giới hạn bởi chu vi:
                          // 2π * R / count ≥ 2*itemR + gap  →  R ≥ count*(2*itemR+gap)/(2π)
                          const rFromSpacing = (ring.length * (2 * itemR + GAP)) / (2 * Math.PI);
                          const rFromStack   = prevOuterR + GAP + itemR;
                          const R = Math.max(rFromSpacing, rFromStack);
                          ringRadiiDyn.push(R);
                          prevOuterR = R + itemR;
                        }

                        // Canvas: bao quanh vòng ngoài cùng + margin
                        const outermost = ringRadiiDyn[ringRadiiDyn.length - 1];
                        const lastRingItems = rings[rings.length - 1];
                        const lastAvgSz = lastRingItems.reduce((s, { rank }) => s + getSzByRank(rank), 0) / lastRingItems.length;
                        const MARGIN = lastAvgSz / 2 + 18;
                        const canvasR = outermost + MARGIN;
                        const canvasW = canvasR * 2;
                        const canvasH = canvasR * 2;
                        const cx = canvasR;
                        const cy = canvasR;

                        // Tính vị trí (x,y) cho từng item
                        const positions = [];
                        rings.forEach((ring, rIdx) => {
                          const R = ringRadiiDyn[rIdx];
                          if (rIdx === 0) {
                            positions.push({ ...ring[0], x: cx, y: cy, isCenter: true });
                          } else {
                            // Xoay lệch mỗi vòng 30° để tránh thẳng hàng
                            const angleOffset = (Math.PI / rings[rIdx].length) * (rIdx % 2) + (rIdx * Math.PI) / 7;
                            ring.forEach(({ item, rank }, i) => {
                              const angle = angleOffset + (2 * Math.PI * i) / ring.length;
                              positions.push({
                                item, rank,
                                x: cx + R * Math.cos(angle),
                                y: cy + R * Math.sin(angle),
                                isCenter: false,
                              });
                            });
                          }
                        });

                        return (
                          <div className="mb-8 w-full flex justify-center" style={{ minHeight: Math.min(canvasH, 600) }}>
                            <svg
                              viewBox={`0 0 ${canvasW} ${canvasH}`}
                              width="100%"
                              style={{ maxWidth: Math.min(canvasW, 660), overflow: 'visible' }}
                            >
                              {/* Vòng tròn tham chiếu mờ */}
                              {ringRadiiDyn.slice(1).map((R, i) => (
                                <circle key={`ring-ref-${i}`} cx={cx} cy={cy} r={R}
                                  fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="1" strokeDasharray="4 6" />
                              ))}

                              {/* Đường nối từ tâm */}
                              {positions.slice(1).map(({ x, y }, i) => (
                                <line key={`conn-${i}`}
                                  x1={cx} y1={cy} x2={x} y2={y}
                                  stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                              ))}

                              {positions.map(({ item, rank, x, y, isCenter }, pi) => {
                                const rawPct = hmTotal > 0 ? (item.weight / hmTotal) * 100 : 0;
                                const color = getBg(item.changePct, rawPct);
                                const sz = getSzByRank(rank);
                                const half = sz / 2;
                                const nameFontSz = isCenter ? 13 : sz < 72 ? 8 : sz < 90 ? 9 : 11;
                                const pctFontSz  = isCenter ? 12 : sz < 72 ? 7 : sz < 90 ? 8 : 10;
                                const nameY = sz < 72 ? -5 : -8;
                                const pctY  = sz < 72 ?  6 :  8;

                                const commonEvents = {
                                  onMouseEnter: (e) => {
                                    setHmHovered({ id: item.id, name: item.name, fullName: item.fullName || item.name });
                                    setTimeout(() => {
                                      if (tooltipRef.current) {
                                        tooltipRef.current.style.left = `${e.clientX + 14}px`;
                                        tooltipRef.current.style.top = `${e.clientY - 10}px`;
                                      }
                                    }, 0);
                                  },
                                  onMouseLeave: () => setHmHovered(null),
                                  onMouseMove: handleHeatmapMouseMove,
                                  onClick: () => { if (heatmapView === 'sectors') { setHeatmapSector(item.name); setHeatmapView('stocks'); } },
                                  onDoubleClick: () => { if (heatmapView === 'stocks') { setInput(item.name); fetchMarketData(item.name); } },
                                  style: { cursor: 'pointer' },
                                };

                                const label = (
                                  <>
                                    <text x={0} y={nameY} textAnchor="middle" dominantBaseline="middle"
                                      fill="white" fontSize={nameFontSz} fontWeight="900"
                                      style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8)', pointerEvents: 'none', userSelect: 'none' }}>
                                      {item.name}
                                    </text>
                                    <text x={0} y={pctY} textAnchor="middle" dominantBaseline="middle"
                                      fill="white" fontSize={pctFontSz} fontWeight="700" opacity="0.93"
                                      style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8)', pointerEvents: 'none', userSelect: 'none' }}>
                                      {item.changePct >= 0 ? '+' : ''}{item.changePct}%
                                    </text>
                                  </>
                                );

                                if (hmShape === 'circle') {
                                  return (
                                    <g key={item.id} transform={`translate(${x},${y})`} {...commonEvents}>
                                      <circle cx={0} cy={0} r={half} fill={color}
                                        stroke={isCenter ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.2)'}
                                        strokeWidth={isCenter ? 2.5 : 1}
                                        className="transition-[filter] hover:brightness-125" />
                                      {isCenter && <circle cx={0} cy={0} r={half + 7} fill="none" stroke={color} strokeWidth="2" opacity="0.25" />}
                                      {label}
                                    </g>
                                  );
                                }

                                // Polygon (hexagon) — flat-top orientation
                                const hex = (r) => Array.from({ length: 6 }, (_, k) => {
                                  const a = (Math.PI / 3) * k - Math.PI / 6;
                                  return `${r * Math.cos(a)},${r * Math.sin(a)}`;
                                }).join(' ');

                                return (
                                  <g key={item.id} transform={`translate(${x},${y})`} {...commonEvents}>
                                    <polygon points={hex(half)} fill={color}
                                      stroke={isCenter ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.18)'}
                                      strokeWidth={isCenter ? 2.5 : 1}
                                      className="transition-[filter] hover:brightness-125" />
                                    {isCenter && <polygon points={hex(half + 7)} fill="none" stroke={color} strokeWidth="2" opacity="0.25" />}
                                    {label}
                                  </g>
                                );
                              })}
                            </svg>
                          </div>
                        );
                      })()}

                      {heatmapView === 'sectors' && heatmapData.some(s => s.watchlist?.length > 0) && (
                        <>
                          <h2 className={`text-sm font-black tracking-widest uppercase mb-3 ${UI.textBold}`}>
                            Mã Tiềm Năng (Dòng Tiền Đột Biến) <span className="text-yellow-500">⚡</span>
                          </h2>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">
                            {heatmapWatchlist.map((s, i) => (
                                <div key={i}
                                  onClick={() => { setInput(s.sym); fetchMarketData(s.sym); }}
                                  className={`flex items-center justify-between p-3 rounded-2xl border cursor-pointer transition-all hover:scale-[1.02]
                                    ${isDark ? 'bg-[#131922] border-white/6 hover:bg-white/3' : 'bg-white border-slate-200 hover:bg-gray-50'}`}
                                >
                                  <div className="flex items-center gap-3">
                                    <span className="text-yellow-400 font-black text-lg w-10">{s.sym}</span>
                                    <div className="flex flex-col">
                                      <span className={`text-[10px] font-bold truncate max-w-[140px] lg:max-w-[180px] ${UI.textNormal}`}>{allStocks.find(stock => stock.symbol === s.sym)?.companyName || 'Đang cập nhật...'}</span>
                                      <span className={`text-[8px] font-bold mt-0.5 ${UI.textMuted}`}>Ngành: {s.sector}</span>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-emerald-400 font-black text-sm">+{s.changePct}%</p>
                                    <p className={`text-[10px] font-bold ${UI.textMuted}`}>{s.price != null ? Number(s.price).toLocaleString('vi-VN') : '---'}</p>
                                  </div>
                                </div>
                              ))
                            }
                          </div>
                        </>
                      )}

                      {heatmapView === 'sectors' && heatmapData.some(s => s.droplist?.length > 0) && (
                        <>
                          <h2 className={`text-sm font-black tracking-widest uppercase mb-3 mt-6 ${UI.textBold}`}>
                            Mã Giảm Sâu (Cảnh Báo Dòng Tiền) <span className="text-red-500">⚠️</span>
                          </h2>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">
                            {heatmapDroplist.map((s, i) => (
                                <div key={i}
                                  onClick={() => { setInput(s.sym); fetchMarketData(s.sym); }}
                                  className={`flex items-center justify-between p-3 rounded-2xl border cursor-pointer transition-all hover:scale-[1.02]
                                    ${isDark ? 'bg-[#131922] border-red-500/10 hover:bg-red-500/5' : 'bg-white border-red-200 hover:bg-red-50'}`}
                                >
                                  <div className="flex items-center gap-3">
                                    <span className="text-red-400 font-black text-lg w-10">{s.sym}</span>
                                    <div className="flex flex-col">
                                      <span className={`text-[10px] font-bold truncate max-w-[140px] lg:max-w-[180px] ${UI.textNormal}`}>{allStocks.find(stock => stock.symbol === s.sym)?.companyName || 'Đang cập nhật...'}</span>
                                      <span className={`text-[8px] font-bold mt-0.5 ${UI.textMuted}`}>Ngành: {s.sector}</span>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-red-400 font-black text-sm">{s.changePct}%</p>
                                    <p className={`text-[10px] font-bold ${UI.textMuted}`}>{s.price != null ? Number(s.price).toLocaleString('vi-VN') : '---'}</p>
                                  </div>
                                </div>
                              ))
                            }
                          </div>
                        </>
                      )}
                      
                      {/* HOME NEWS STREAM */}
                      {!marketData && homeNews && homeNews.length > 0 && (
                        <div className="mt-8 mb-4">
                            <h2 className={`text-sm font-black tracking-widest uppercase mb-4 mt-6 ${UI.textBold}`}>
                                Tin tức Vĩ mô & Thị Trường <span className="text-yellow-500">📰</span>
                            </h2>
                            {loadingHomeNews ? (
                                <div className="flex justify-center p-8"><Loader2 className="animate-spin text-yellow-500" /></div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {homeNews.map((news, index) => {
                                        let badge;
                                        if (news.isMacro)       badge = { label: 'Vĩ mô',     icon: <Activity size={9}/>,     cls: isDark ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40' : 'bg-sky-50 text-sky-700 border border-sky-300' };
                                        else if (news.isAiGenerated) badge = { label: 'AI',   icon: <Bot size={9}/>,          cls: 'bg-purple-500 text-white shadow-[0_0_8px_rgba(168,85,247,0.5)]' };
                                        else { const s = news.sentiment; const m = news.mode;
                                            if (s === 'positive')  badge = { label: 'Tích cực',   icon: <TrendingUp size={9}/>,   cls: isDark ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-emerald-50 text-emerald-700 border border-emerald-300' };
                                            else if (s === 'negative') badge = { label: 'Tiêu cực', icon: <TrendingDown size={9}/>, cls: isDark ? 'bg-red-500/20 text-red-400 border border-red-500/40' : 'bg-red-50 text-red-700 border border-red-300' };
                                            else if (m === 'official') badge = { label: 'Chính thức', icon: <Newspaper size={9}/>, cls: isDark ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40' : 'bg-blue-50 text-blue-700 border border-blue-300' };
                                            else if (m === 'rumor')   badge = { label: 'Tin đồn',  icon: <Radio size={9}/>,       cls: isDark ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' : 'bg-amber-50 text-amber-700 border border-amber-300' };
                                            else if (m === 'negative') badge = { label: 'Rủi ro',  icon: <ShieldAlert size={9}/>, cls: isDark ? 'bg-orange-500/20 text-orange-400 border border-orange-500/40' : 'bg-orange-50 text-orange-700 border border-orange-300' };
                                            else badge = { label: 'Tổng hợp', icon: <Minus size={9}/>, cls: isDark ? 'bg-white/5 text-slate-400 border border-white/10' : 'bg-slate-100 text-slate-500 border border-slate-200' };
                                        }

                                        let cardStyle;
                                        if (news.isMacro) cardStyle = isDark ? 'bg-[#080e18] border-sky-500/30' : 'bg-sky-50/60 border-sky-200';
                                        else if (news.isAiGenerated) cardStyle = isDark ? 'bg-[#1a1025] border-purple-500/50 shadow-[0_0_15px_rgba(168,85,247,0.15)]' : 'bg-purple-50 border-purple-400';
                                        else if (news.sentiment === 'negative') cardStyle = isDark ? 'bg-[#130c0c] border-red-900/40' : 'bg-red-50/50 border-red-200';
                                        else if (news.sentiment === 'positive') cardStyle = isDark ? 'bg-[#071a10] border-emerald-500/50 shadow-[0_0_12px_rgba(16,185,129,0.12)]' : 'bg-emerald-50 border-emerald-400';
                                        else cardStyle = isDark ? 'bg-[#131922] border-white/6' : 'bg-white border-slate-200 shadow-sm';

                                        const titleColor = news.isAiGenerated ? 'text-purple-400 group-hover:text-purple-300' : news.sentiment === 'negative' ? `text-red-400 group-hover:text-red-300 ${isDark ? '' : 'text-red-600 group-hover:text-red-700'}` : news.sentiment === 'positive' ? `text-emerald-400 group-hover:text-emerald-300 ${isDark ? '' : 'text-emerald-700 group-hover:text-emerald-600'}` : `group-hover:text-yellow-500 ${UI.textNormal}`;
                                        const dateColor = news.isAiGenerated ? 'text-purple-300' : news.sentiment === 'positive' ? 'text-emerald-400' : 'text-yellow-500';

                                        let displayTitle = news.title;
                                        let symbolTag = null;
                                        const match = displayTitle?.match(/^\[([A-Z0-9]{3,})\]\s(.*)/);
                                        if (match && !news.isMacro) {
                                            symbolTag = match[1];
                                            displayTitle = match[2];
                                        }

                                        return (
                                            <a key={index} href={news.link} target="_blank" rel="noopener noreferrer" className={`flex flex-col justify-between rounded-2xl p-4 transition-all cursor-pointer group border ${UI.cardHover} ${cardStyle}`}>
                                                <div>
                                                    <div className="flex items-center justify-between gap-2 mb-2">
                                                        <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                                                            <span className={`inline-flex items-center gap-1 shrink-0 text-[9px] px-2 py-[3px] rounded-full font-black uppercase tracking-widest ${badge.cls}`}>{badge.icon}{badge.label}</span>
                                                            {symbolTag && <span className={`inline-flex items-center gap-1 shrink-0 text-[10px] px-2.5 py-[3px] rounded-full font-black uppercase tracking-widest ${isDark ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' : 'bg-yellow-100 text-yellow-800 border border-yellow-300'}`}>{symbolTag}</span>}
                                                        </div>
                                                        <span className={`text-[9px] font-bold tabular-nums whitespace-nowrap ${dateColor}`}>{news.date || 'Tin tức mới'}</span>
                                                    </div>
                                                    <h3 className={`font-bold text-sm leading-snug transition-colors line-clamp-3 ${titleColor}`}>{displayTitle}</h3>
                                                </div>
                                                <div className={`mt-4 pt-3 flex justify-between items-center gap-3 border-t ${isDark ? 'border-white/5' : 'border-slate-200'}`}>
                                                    <span className={`text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 truncate ${news.isAiGenerated ? 'text-purple-400' : UI.textBold}`}>
                                                        <Globe size={10} className="shrink-0" />
                                                        <span className="truncate">{news.source || 'Internet'}</span>
                                                    </span>
                                                    <div className="flex items-center gap-0 shrink-0">
                                                        <span className={`text-[10px] flex items-center gap-1 font-mono font-bold ${UI.textMuted}`}><Clock size={10} /> {news.fetchedAt || 'Đang đồng bộ'}</span>
                                                        <ExternalLink size={12} className={`shrink-0 opacity-0 group-hover:opacity-100 transition-opacity ml-1 ${news.sentiment === 'positive' ? 'text-emerald-400' : news.isAiGenerated ? 'text-purple-400' : 'text-yellow-500'}`} />
                                                    </div>
                                                </div>
                                            </a>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                      )}
                    </div>

                    {/* Heatmap tooltip */}
                    {hmHovered && (
                      <div
                        ref={tooltipRef}
                        style={{
                          position: 'fixed', zIndex: 9999, pointerEvents: 'none',
                          background: isDark ? '#0f1520' : '#fff',
                          border: '1px solid rgba(250,204,21,0.4)',
                          borderRadius: 10, padding: '8px 14px',
                          boxShadow: '0 8px 32px rgba(0,0,0,0.35)', maxWidth: 240,
                        }}
                      >
                        <p style={{ fontWeight: 900, fontSize: 13, color: '#facc15', marginBottom: 2 }}>{hmHovered.name}</p>
                        <p style={{ fontSize: 11, color: isDark ? '#94a3b8' : '#475569', lineHeight: 1.4 }}>{hmHovered.fullName}</p>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}

          {/* ── AI ANALYSIS LOADING ── */}
          <AiAnalysisLoader
            analyzing={analyzing}
            aiReport={aiReport}
            setShowFullReportModal={setShowFullReportModal}
            liveDebate={liveDebate}
            analysisStep={analysisStep}
            analysisProgress={analysisProgress}
            aiAnalysisEta={aiAnalysisEta}
            elapsedTime={elapsedTime}
            isDark={isDark}
            UI={UI}
            loadingCard={loadingCard}
            cardFlip={cardFlip}
            quizSelected={quizSelected}
            setQuizSelected={setQuizSelected}
            advanceCard={advanceCard}
            pickUnseen={pickUnseen}
            VN_QUIZ_ONLY={VN_QUIZ_ONLY}
            shownQuizIndicesRef={shownQuizIndicesRef}
            isAutoScroll={isAutoScroll}
            setIsAutoScroll={setIsAutoScroll}
          />

          {/* ── AI REPORT ── */}
          {aiReport && (
                <div className={`w-full flex flex-col gap-0 relative ${isReportReadingMode ? 'mt-0' : 'mt-4'}`}>

                  {/* Meta panels — mobile only in report reading mode */}
                  <div className={`${
                    isReportReadingMode
                      ? (chartScrollLayoutLocked ? 'hidden lg:block' : 'lg:hidden')
                      : ''
                  } pt-2 pb-2 ${isDark ? 'bg-[#0a0f18]' : 'bg-slate-50'}`}>
                    {renderReportMetaPanels()}
                  </div>

                  {/* Main Report Content */}
                  <div className={`w-full border rounded-2xl lg:rounded-[32px] p-4 sm:p-6 lg:p-10 shadow-2xl transition-all duration-300 overflow-hidden mb-6 ${isReportReadingMode ? 'mt-0 lg:mt-2' : 'mt-4'} relative z-0 [overflow-anchor:auto] ${
                    isDark ? 'bg-[#0a0e14] border-yellow-400/15' : 'bg-white border-yellow-400/20'
                  } ${isReportReadingMode ? 'lg:border-2 lg:border-sky-400/35 lg:shadow-[0_0_28px_rgba(56,189,248,0.1)] lg:ring-1 lg:ring-sky-400/15' : ''}`}>
                {/* Subtle top border glow */}
                <div className="absolute top-0 left-10 right-10 h-px bg-gradient-to-r from-transparent via-yellow-400/30 to-transparent" />

                {/* Report label */}
                <div className="relative mb-8 pb-4 border-b border-white/6 mt-2">
                  <div className="absolute -inset-1 bg-gradient-to-r from-yellow-500/20 to-orange-500/10 blur-xl opacity-50"></div>
                  <h2 className="relative flex items-center gap-3 text-xl sm:text-2xl font-black uppercase tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500 drop-shadow-[0_0_10px_rgba(250,204,21,0.3)]">
                    <Sparkles className="text-yellow-400" size={24} />
                    Báo cáo phân tích toàn diện
                  </h2>
                </div>

                <div className={`prose max-w-none break-words
                  prose-headings:scroll-mt-4
                  ${isDark
                    ? 'prose-invert text-slate-200 prose-headings:text-yellow-400 prose-strong:text-white prose-li:text-slate-300 prose-p:text-slate-200 prose-code:text-yellow-300 prose-code:bg-yellow-400/10 prose-blockquote:border-yellow-400/30 prose-blockquote:text-slate-400'
                    : 'text-slate-800 prose-headings:text-slate-900 prose-strong:text-slate-900 prose-code:text-slate-800 prose-blockquote:border-yellow-400 prose-blockquote:text-slate-600'
                  }
                  prose-table:text-sm
                  prose-th:font-black prose-th:uppercase prose-th:tracking-widest prose-th:text-[10px]
                  prose-td:text-[12px]
                `}>
                  <ReactMarkdown 
                    remarkPlugins={[remarkGfm]} 
                    rehypePlugins={[rehypeRaw]}
                    components={{
                      h1: ({node, ...props}) => <h1 className={`text-xl font-black mt-8 mb-4 inline-block px-3 py-1.5 rounded-lg border-l-4 shadow-sm ${isDark ? 'text-yellow-400 bg-yellow-400/10 border-yellow-400' : 'text-yellow-800 bg-yellow-100 border-yellow-500'}`} {...props} />,
                      h2: ({node, ...props}) => <h2 className={`text-lg font-black mt-6 mb-3 inline-block px-2.5 py-1 rounded border-l-2 ${isDark ? 'text-yellow-400 bg-yellow-400/10 border-yellow-400' : 'text-yellow-800 bg-yellow-100 border-yellow-500'}`} {...props} />,
                      h3: ({node, ...props}) => <h3 className={`text-base font-bold mt-5 mb-2 uppercase tracking-wide ${isDark ? 'text-yellow-500' : 'text-yellow-700'}`} {...props} />,
                      a: ({node, ...props}) => <a className="text-blue-400 hover:text-blue-300 no-underline border-b border-blue-400/30 hover:border-blue-400 transition-colors" {...props} />,
                      pre: ({node, ...props}) => (
                        <pre className={`rounded-xl border p-4 font-mono text-xs leading-relaxed overflow-x-auto whitespace-pre my-4 ${
                          isDark
                            ? 'bg-[#0a0e14] text-slate-300 border-white/6'
                            : 'bg-slate-50 text-slate-800 border-slate-200'
                        }`} {...props} />
                      ),
                      code: ({node, inline, className, ...props}) => inline
                        ? <code className={`px-1.5 py-0.5 rounded text-xs font-mono ${isDark ? 'bg-yellow-400/10 text-yellow-300' : 'bg-slate-100 text-slate-700'}`} {...props} />
                        : <code className="block" {...props} />,
                    }}
                  >
                    {aiReport}
                  </ReactMarkdown>
                </div>
                {vnReportTimestamp && (
                  <div className={`mt-6 pt-4 border-t flex items-center justify-between text-[10px] font-mono ${isDark ? 'border-slate-800 text-slate-500' : 'border-slate-200 text-slate-400'}`}>
                    <span>REPORT GENERATED: {formatReportTime(vnReportTimestamp)}</span>
                    <span className="opacity-50 tracking-widest uppercase">
                      ID: {(vnReportTimestamp || 'SYS').toString().replace(/[^0-9a-zA-Z]/g, '').slice(-8)}
                    </span>
                  </div>
                )}     
                {/* Bottom fade */}
                {analyzing && (
                  <div className={`absolute bottom-0 left-0 right-0 h-16 pointer-events-none ${
                    isDark
                      ? 'bg-gradient-to-t from-[#0d1219] to-transparent'
                      : 'bg-gradient-to-t from-white to-transparent'
                  }`} />
                )}
              </div>
            </div>
          )}

        </div>
        </div>
        {/* ── END SCROLL CONTENT ── */}

        {/* ── FLOATING: SCROLL TO TOP ── */}
        {aiReport && (
          <button
            type="button"
            onClick={() => {
              if (isReportReadingMode) handleReportScrollToTop();
              else scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
              mobileScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            aria-label="Lên đầu báo cáo"
            className={`absolute bottom-5 right-5 z-[120] w-12 h-12 rounded-2xl flex items-center justify-center border-2 shadow-lg transition-all duration-200 hover:scale-105 hover:-translate-y-0.5 active:scale-95 ${
              isDark
                ? 'bg-[#0a0f18]/95 text-yellow-400 border-yellow-400/50 shadow-yellow-400/15 hover:bg-yellow-400/10 backdrop-blur-sm'
                : 'bg-white/95 text-yellow-700 border-yellow-400/60 shadow-yellow-400/20 hover:bg-yellow-50 backdrop-blur-sm'
            }`}
            title="Lên đầu báo cáo"
          >
            <ChevronUp size={22} strokeWidth={2.5} />
          </button>
        )}

      </div>
      {/* ── END COL 2 ── */}

      {/* ========================================================= */}
      {/* GRID COLUMN 3: INDEX RADAR & TCBS PDF         */}
      {/* ========================================================= */}
      <div className={`
        ${mobileTab === 'radar' ? 'flex' : 'hidden'}
        ${isRightColVisible ? 'lg:flex' : 'lg:hidden'}
        flex-col border-l
        w-full lg:w-[350px] xl:w-[450px]
        ${isDark ? 'bg-[#080C11] border-white/8' : 'bg-slate-50 border-slate-200'}
        pb-10 lg:pb-0 overflow-y-auto lg:overflow-hidden custom-scrollbar
      `}
        style={{
          transition: 'opacity 280ms ease, transform 280ms cubic-bezier(0.4,0,0.2,1)',
          opacity: isRightColOpen ? 1 : 0,
          transform: isRightColOpen ? 'translateX(0)' : 'translateX(24px)',
          pointerEvents: isRightColOpen ? 'auto' : 'none',
        }}
      >
        <div className="h-auto lg:h-1/2 flex flex-col border-b border-white/8 shrink-0">
          <div className="h-auto lg:h-2/5 flex flex-col sm:flex-row border-b border-white/8">
            <div className="flex-1 border-b sm:border-b-0 sm:border-r border-white/8 p-3 flex flex-col min-h-[180px] lg:min-h-0">
              <span className="text-[9px] font-black text-yellow-500 mb-1">VN-INDEX</span>
              <div className="flex-1 min-h-[150px] lg:min-h-0"><MarketRadar data={vnIndexData} theme={isDark ? 'dark' : 'light'} color="#facc15" /></div>
            </div>
            <div className="flex-1 p-3 flex flex-col min-h-[180px] lg:min-h-0">
              <span className="text-[9px] font-black text-sky-400 mb-1">HNX-INDEX</span>
              <div className="flex-1 min-h-[150px] lg:min-h-0"><MarketRadar data={hnxIndexData} theme={isDark ? 'dark' : 'light'} color="#38bdf8" /></div>
            </div>
          </div>
          <div className="h-auto lg:h-3/5 p-4 flex flex-col min-h-[220px] lg:min-h-0">
            <div className="flex justify-between items-center mb-2">
              <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">VN30 Premium</span>
              <Activity size={14} className="text-emerald-500" />
            </div>
            <div className="flex-1 min-h-[180px] lg:min-h-0 rounded-2xl bg-black/20 border border-white/6 overflow-hidden">
              <MarketRadar data={vn30Data} theme={isDark ? 'dark' : 'light'} color="#10b981" />
            </div>
          </div>
        </div>

        <div className="h-[400px] lg:h-1/2 flex flex-col overflow-hidden shrink-0">
          <div className={`h-10 border-b flex items-center justify-between px-4 shrink-0 ${isDark ? 'bg-black/30 border-white/8' : 'bg-white border-slate-200'}`}>
            <div className="flex items-center gap-2">
              <FileText size={14} className="text-yellow-500" />
              <span className={`text-[10px] font-black uppercase tracking-widest ${UI.textBold}`}>TCBS Analysis</span>
            </div>
            {marketData?.reportPdf && (
              <button
                onClick={() => setShowPdfModal(true)}
                className="text-[10px] font-black tracking-widest bg-yellow-400 text-black px-4 py-1.5 rounded-full hover:bg-yellow-300 shadow-lg transition-all active:scale-95"
              >
                OPEN PDF
              </button>
            )}
          </div>
          <div className={`flex-1 relative ${isDark ? 'bg-[#242424]' : 'bg-slate-100'}`}>
            {marketData?.reportPdf ? (
              <iframe
                key={marketData.stockInfo?.symbol || 'tcbs-pdf'}
                src={tcbsPdfEmbedUrl(marketData.reportPdf)}
                className="absolute inset-0 w-full h-full border-none bg-white"
                title="TCBS Report Preview"
              />
            ) : (
              <div className="h-full flex flex-col items-center justify-center opacity-20">
                <FileText size={32} className="mb-2" />
                <p className="text-[9px] font-black uppercase">Waiting for Data</p>
              </div>
            )}
          </div>
        </div>
      </div>
      {/* FULL REPORT MODAL */}
      {showFullReportModal && (
         <div className="fixed inset-0 flex items-center justify-center p-6 lg:p-12 pt-24" style={{ zIndex: 999999 }}>
           <div className="absolute inset-0 bg-black/80 backdrop-blur-md animate-in fade-in duration-300" onClick={() => setShowFullReportModal(false)} />
           <div className={`relative w-full max-w-5xl h-full flex flex-col rounded-3xl overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.8)] border ${isDark ? 'bg-[#0a0e14] border-white/8' : 'bg-white border-slate-300'} animate-in zoom-in-95 duration-200`}>
             <div className={`h-14 flex items-center justify-between px-6 border-b shrink-0 ${isDark ? 'bg-black/30 border-white/8' : 'bg-slate-50 border-slate-200'}`}>
                <div className="flex items-center gap-3">
                    <Sparkles size={18} className="text-yellow-400" />
                    <h3 className={`font-black tracking-widest uppercase text-sm ${UI.textBold}`}>
                        Full báo cáo AI: {marketData?.stockInfo?.symbol}
                    </h3>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={handleDownloadReport} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide transition-all active:scale-95 border ${isDark ? 'bg-sky-500/15 text-sky-400 border-sky-500/30 hover:bg-sky-500/25' : 'bg-sky-50 text-sky-600 border-sky-300 hover:bg-sky-100'}`}>
                        <Download size={14} /> Tải file MD
                    </button>
                    <button onClick={() => setShowFullReportModal(false)} className={`p-2 rounded-lg transition-colors ${isDark ? 'hover:bg-red-500/20 text-red-400' : 'hover:bg-red-100 text-red-500'}`}>
                        <X size={20} strokeWidth={3} />
                    </button>
                </div>
             </div>
             <div className="flex-1 w-full relative overflow-y-auto custom-scrollbar p-6 lg:p-10">
                <div className={`prose max-w-none break-words
                  prose-headings:scroll-mt-4
                  ${isDark
                    ? 'prose-invert text-slate-200 prose-headings:text-yellow-400 prose-strong:text-white prose-li:text-slate-300 prose-p:text-slate-200 prose-code:text-yellow-300 prose-code:bg-yellow-400/10 prose-blockquote:border-yellow-400/30 prose-blockquote:text-slate-400'
                    : 'text-slate-800 prose-headings:text-slate-900 prose-strong:text-slate-900 prose-code:text-slate-800 prose-blockquote:border-yellow-400 prose-blockquote:text-slate-600'
                  }
                  prose-table:text-sm
                  prose-th:font-black prose-th:uppercase prose-th:tracking-widest prose-th:text-[10px]
                  prose-td:text-[12px]
                `}>
                  <ReactMarkdown 
                    remarkPlugins={[remarkGfm]} 
                    rehypePlugins={[rehypeRaw]}
                    components={{
                      h1: ({node, ...props}) => <h1 className={`text-xl font-black mt-8 mb-4 inline-block px-3 py-1.5 rounded-lg border-l-4 shadow-sm ${isDark ? 'text-yellow-400 bg-yellow-400/10 border-yellow-400' : 'text-yellow-800 bg-yellow-100 border-yellow-500'}`} {...props} />,
                      h2: ({node, ...props}) => <h2 className={`text-lg font-black mt-6 mb-3 inline-block px-2.5 py-1 rounded border-l-2 ${isDark ? 'text-yellow-400 bg-yellow-400/10 border-yellow-400' : 'text-yellow-800 bg-yellow-100 border-yellow-500'}`} {...props} />,
                      h3: ({node, ...props}) => <h3 className={`text-base font-bold mt-5 mb-2 uppercase tracking-wide ${isDark ? 'text-yellow-500' : 'text-yellow-700'}`} {...props} />,
                      a: ({node, ...props}) => <a className="text-blue-400 hover:text-blue-300 no-underline border-b border-blue-400/30 hover:border-blue-400 transition-colors" {...props} />,
                      pre: ({node, ...props}) => (
                        <pre className={`rounded-xl border p-4 font-mono text-xs leading-relaxed overflow-x-auto whitespace-pre my-4 ${
                          isDark
                            ? 'bg-[#0a0e14] text-slate-300 border-white/6'
                            : 'bg-slate-50 text-slate-800 border-slate-200'
                        }`} {...props} />
                      ),
                      code: ({node, inline, className, ...props}) => inline
                        ? <code className={`px-1.5 py-0.5 rounded text-xs font-mono ${isDark ? 'bg-yellow-400/10 text-yellow-300' : 'bg-slate-100 text-slate-700'}`} {...props} />
                        : <code className="block" {...props} />,
                    }}
                  >
                    {aiReport}
                  </ReactMarkdown>
                </div>
             </div>
           </div>
         </div>
      )}
      {showForceConfirm && (
        <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 999998 }}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowForceConfirm(false)} />
          <div className={`relative w-full max-w-md rounded-2xl border p-6 shadow-2xl animate-in zoom-in-95 duration-200 ${isDark ? 'bg-[#0f1520] border-yellow-500/25' : 'bg-white border-slate-200'}`}>
            <div className="flex items-start gap-3 mb-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isDark ? 'bg-amber-500/15 text-amber-400' : 'bg-amber-50 text-amber-600'}`}>
                <AlertTriangle size={18} />
              </div>
              <div>
                <h3 className={`text-sm font-black uppercase tracking-widest ${UI.textBold}`}>Ép phân tích lại?</h3>
                <p className={`text-[12px] mt-2 leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                  Mã <strong>{marketData?.stockInfo?.symbol}</strong> vừa được phân tích gần đây. Phân tích lại quá gần thường <strong>không có thay đổi đáng kể</strong> và tốn thêm tài nguyên AI.
                </p>
                <p className={`text-[11px] mt-2 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                  Bạn vẫn muốn chạy lại phân tích ngay bây giờ?
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setShowForceConfirm(false)}
                className={`px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all active:scale-95 ${isDark ? 'bg-white/5 text-slate-300 hover:bg-white/10' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                Hủy
              </button>
              <button
                onClick={async () => {
                  setShowForceConfirm(false);
                  setIsRightColOpen(false);
                  setMobileTab('ai');
                  await handleAiAnalysis(true);
                }}
                className="px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest bg-yellow-400 text-black hover:bg-yellow-300 transition-all active:scale-95 shadow-lg shadow-yellow-400/20"
              >
                Phân tích lại
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
      {/* AI Chat Panel */}
      <StockAiChat
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        ticker={marketData?.stockInfo?.symbol || ''}
        companyName={
          marketData?.companyProfile?.companyName ||
          marketData?.stockInfo?.companyName || ''
        }
        aiReport={aiReport}
        isDark={isDark}
        currentUser={currentUser}
      />
    </div>
  );
}