/**
 * ============================================================
 * OMNI DUCK — MARKET INSIGHT PANEL
 * ============================================================
 * Hiển thị nhận định AI về thị trường trên trang chủ VnStocksTab
 * (khi chưa tìm kiếm mã nào).
 *
 * Tính năng:
 *  - Tự động fetch report khi mount
 *  - Hiển thị top picks (MUA / TRÁNH / THEO DÕI)
 *  - Phân tích ngắn hạn / dài hạn
 *  - Lazy load nội dung đầy đủ (toggle expand)
 *  - Badge sentiment thị trường
 *  - Click vào mã → setInput + fetchMarketData
 * ============================================================
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { API_BASE_URL, API_FETCH_HEADERS } from '../lib/apiBase';
import {
  BrainCircuit, TrendingUp, TrendingDown, Minus,
  RefreshCw, ChevronDown, ChevronUp, Clock, Zap,
  Target, AlertTriangle, Eye, Sparkles, BarChart3,
  BookOpen, Calendar, Bot, CheckCircle2, Loader2,
} from 'lucide-react';

// ── Helpers ──────────────────────────────────────────────────────────────────

const SENTIMENT_CONFIG = {
  'TÍCH CỰC': {
    label: 'TÍCH CỰC',
    icon: '🟢',
    color: 'text-emerald-400',
    border: 'border-emerald-500/40',
    bg: 'bg-emerald-500/10',
    glow: 'shadow-[0_0_20px_rgba(16,185,129,0.15)]',
    bgLight: 'bg-emerald-50',
    borderLight: 'border-emerald-300',
    colorLight: 'text-emerald-700',
  },
  'TRUNG TÍNH': {
    label: 'TRUNG TÍNH',
    icon: '🟡',
    color: 'text-yellow-400',
    border: 'border-yellow-500/40',
    bg: 'bg-yellow-500/10',
    glow: 'shadow-[0_0_20px_rgba(234,179,8,0.12)]',
    bgLight: 'bg-yellow-50',
    borderLight: 'border-yellow-300',
    colorLight: 'text-yellow-700',
  },
  'TIÊU CỰC': {
    label: 'TIÊU CỰC',
    icon: '🔴',
    color: 'text-red-400',
    border: 'border-red-500/40',
    bg: 'bg-red-500/10',
    glow: 'shadow-[0_0_20px_rgba(239,68,68,0.12)]',
    bgLight: 'bg-red-50',
    borderLight: 'border-red-300',
    colorLight: 'text-red-700',
  },
};

const ACTION_CONFIG = {
  'MUA': {
    icon: <TrendingUp size={11} />,
    cls: (isDark) => isDark
      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40'
      : 'bg-emerald-50 text-emerald-700 border-emerald-300',
  },
  'TRÁNH': {
    icon: <TrendingDown size={11} />,
    cls: (isDark) => isDark
      ? 'bg-red-500/15 text-red-400 border-red-500/40'
      : 'bg-red-50 text-red-700 border-red-300',
  },
  'THEO DÕI': {
    icon: <Eye size={11} />,
    cls: (isDark) => isDark
      ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30'
      : 'bg-yellow-50 text-yellow-700 border-yellow-300',
  },
};

const HORIZON_CONFIG = {
  'NGẮN HẠN': { icon: <Zap size={9} />, label: 'Ngắn hạn' },
  'DÀI HẠN':  { icon: <Target size={9} />, label: 'Dài hạn' },
  'CẢ HAI':   { icon: <BarChart3 size={9} />, label: 'Cả hai' },
};

function formatDate(str) {
  if (!str) return '';
  // str dạng 'YYYY-MM-DD'
  const [y, m, d] = str.split('-');
  return `${d}/${m}/${y}`;
}

function timeAgo(dateObj) {
  if (!dateObj) return '';
  const diff = Date.now() - new Date(dateObj).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'vừa xong';
  if (mins < 60) return `${mins} phút trước`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} giờ trước`;
  return `${Math.floor(hrs / 24)} ngày trước`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

/** Card mã cổ phiếu tiềm năng */
const PickCard = React.memo(({ pick, isDark, onSelect }) => {
  const action = ACTION_CONFIG[pick.action] || ACTION_CONFIG['THEO DÕI'];
  const horizon = HORIZON_CONFIG[pick.horizon] || HORIZON_CONFIG['NGẮN HẠN'];
  const score = Number(pick.score) || 0;

  const scoreColor = score >= 80
    ? (isDark ? 'text-emerald-400' : 'text-emerald-600')
    : score >= 60
    ? (isDark ? 'text-yellow-400' : 'text-yellow-600')
    : (isDark ? 'text-red-400' : 'text-red-600');

  return (
    <div
      onClick={() => onSelect?.(pick.symbol)}
      className={`group relative flex flex-col gap-2 p-3 rounded-xl border cursor-pointer transition-all duration-200 active:scale-[0.98] ${
        isDark
          ? 'bg-white/4 border-white/8 hover:bg-white/8 hover:border-yellow-400/25'
          : 'bg-white border-slate-200 hover:bg-yellow-50/60 hover:border-yellow-300 shadow-sm hover:shadow'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className={`text-base font-black tracking-tight ${isDark ? 'text-yellow-400' : 'text-yellow-600'} group-hover:underline`}>
          {pick.symbol}
        </span>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          {/* Horizon badge */}
          <span className={`flex items-center gap-1 text-[8px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded border ${
            isDark ? 'text-slate-400 border-white/10' : 'text-slate-500 border-slate-200'
          }`}>
            {horizon.icon} {horizon.label}
          </span>
          {/* Action badge */}
          <span className={`flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-full border ${action.cls(isDark)}`}>
            {action.icon} {pick.action}
          </span>
        </div>
      </div>

      {/* Score bar */}
      {score > 0 && (
        <div className="flex items-center gap-2">
          <div className={`flex-1 h-1 rounded-full overflow-hidden ${isDark ? 'bg-white/10' : 'bg-slate-200'}`}>
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                score >= 80 ? 'bg-emerald-500' : score >= 60 ? 'bg-yellow-400' : 'bg-red-500'
              }`}
              style={{ width: `${score}%` }}
            />
          </div>
          <span className={`text-[10px] font-black tabular-nums shrink-0 ${scoreColor}`}>{score}</span>
        </div>
      )}

      {/* Reason */}
      {pick.reason && (
        <p className={`text-[10px] leading-snug line-clamp-2 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
          {pick.reason}
        </p>
      )}
    </div>
  );
});

/** Skeleton loader */
const InsightSkeleton = ({ isDark }) => (
  <div className="space-y-3 animate-pulse">
    <div className={`h-6 w-40 rounded-lg ${isDark ? 'bg-white/8' : 'bg-slate-200'}`} />
    <div className={`h-4 w-64 rounded ${isDark ? 'bg-white/5' : 'bg-slate-100'}`} />
    <div className="grid grid-cols-2 gap-2 mt-4">
      {[1,2,3,4].map(i => (
        <div key={i} className={`h-20 rounded-xl ${isDark ? 'bg-white/5' : 'bg-slate-100'}`} />
      ))}
    </div>
    <div className={`h-32 rounded-xl ${isDark ? 'bg-white/5' : 'bg-slate-100'}`} />
  </div>
);

// ── Module-level cache: giữ data khi unmount/remount (nav đi rồi về) ─────────
let _cachedInsight = null;   // data cuối cùng fetch thành công
let _cacheTime = 0;          // timestamp lần fetch cuối
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 phút

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────

export default function MarketInsightPanel({ isDark, UI, setInput, fetchMarketData }) {
  // Khởi tạo từ cache nếu còn hạn — tránh loading flicker khi navigate đi về
  const hasFreshCache = _cachedInsight && (Date.now() - _cacheTime) < CACHE_TTL_MS;
  const [insight, setInsight]           = useState(hasFreshCache ? _cachedInsight : null);
  const [loading, setLoading]           = useState(!hasFreshCache);
  const [error, setError]               = useState(null);
  const [cooldownSec, setCooldownSec]   = useState(0); // cooldown riêng, không block UI
  const [isExpanded, setIsExpanded]     = useState(false);
  const [isScanning, setIsScanning]     = useState(false);
  const [filterAction, setFilterAction] = useState('ALL'); // ALL | MUA | TRÁNH | THEO DÕI
  const [activeTab, setActiveTab]       = useState('picks'); // picks | report
  const reportRef = useRef(null);

  // ── Fetch report ────────────────────────────────────────────────────────────

  const fetchInsight = useCallback(async (forceRescan = false) => {
    // Nếu có cache hợp lệ và không phải force → dùng cache, không fetch lại
    if (!forceRescan && _cachedInsight && (Date.now() - _cacheTime) < CACHE_TTL_MS) {
      setInsight(_cachedInsight);
      setLoading(false);
      return;
    }

    try {
      if (forceRescan) setIsScanning(true);
      else setLoading(true);
      setError(null);

      const url = forceRescan
        ? '/api/market-insight/today?force=true'
        : '/api/market-insight/today';

      const res = await fetch(API_BASE_URL + url, {
        credentials: 'include',
        headers: API_FETCH_HEADERS,
      });

      if (res.status === 429) {
        // Cooldown từ force-scan — KHÔNG show error đỏ, chỉ show timer
        const json = await res.json().catch(() => ({}));
        const secs = json.remainSec || 60;
        setCooldownSec(secs);
        // Vẫn hiển thị data cũ nếu có (cache hoặc state)
        return;
      }

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || `Lỗi ${res.status}`);
      }

      const data = await res.json();
      // Lưu vào module-level cache
      _cachedInsight = data;
      _cacheTime = Date.now();
      setInsight(data);
      setCooldownSec(0);
    } catch (err) {
      setError(err.message || 'Không thể tải nhận định thị trường');
    } finally {
      setLoading(false);
      setIsScanning(false);
    }
  }, []);

  // Cooldown countdown timer
  useEffect(() => {
    if (cooldownSec <= 0) return;
    const t = setInterval(() => setCooldownSec(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldownSec]);

  useEffect(() => {
    fetchInsight(false);
  }, [fetchInsight]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleSelectStock = useCallback((symbol) => {
    if (!symbol) return;
    setInput?.(symbol);
    fetchMarketData?.(symbol);
  }, [setInput, fetchMarketData]);

  // ── Derived data ─────────────────────────────────────────────────────────────

  const sentimentCfg = SENTIMENT_CONFIG[insight?.marketSentiment] || SENTIMENT_CONFIG['TRUNG TÍNH'];

  const filteredPicks = (insight?.topPicks || []).filter(p =>
    filterAction === 'ALL' || p.action === filterAction
  );

  const buyCount    = (insight?.topPicks || []).filter(p => p.action === 'MUA').length;
  const avoidCount  = (insight?.topPicks || []).filter(p => p.action === 'TRÁNH').length;
  const watchCount  = (insight?.topPicks || []).filter(p => p.action === 'THEO DÕI').length;

  // ── Render ───────────────────────────────────────────────────────────────────

  // Loading state
  if (loading) {
    return (
      <div className={`w-full rounded-2xl border p-5 mb-4 ${isDark ? 'bg-[#080c14] border-white/8' : 'bg-white border-slate-200 shadow-sm'}`}>
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${isDark ? 'bg-yellow-400/15' : 'bg-yellow-50'}`}>
            <BrainCircuit size={16} className="text-yellow-400 animate-pulse" />
          </div>
          <div>
            <p className={`text-[11px] font-black uppercase tracking-widest ${isDark ? 'text-yellow-400' : 'text-yellow-600'}`}>
              AI Market Intelligence
            </p>
            <p className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              Đang tải nhận định thị trường...
            </p>
          </div>
        </div>
        <InsightSkeleton isDark={isDark} />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={`w-full rounded-2xl border p-5 mb-4 ${isDark ? 'bg-[#0d0a0a] border-red-500/20' : 'bg-red-50 border-red-200'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="text-red-400 shrink-0" />
            <div>
              <p className={`text-[11px] font-black uppercase tracking-widest text-red-400`}>
                Không thể tải nhận định
              </p>
              <p className={`text-[10px] mt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>{error}</p>
            </div>
          </div>
          <button
            onClick={() => fetchInsight(false)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide transition-all border ${
              isDark ? 'bg-white/5 border-white/10 text-slate-400 hover:text-white hover:bg-white/10' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <RefreshCw size={12} /> Thử lại
          </button>
        </div>
      </div>
    );
  }

  // No data
  if (!insight) {
    return (
      <div className={`w-full rounded-2xl border p-5 mb-4 text-center ${isDark ? 'bg-[#080c14] border-white/8' : 'bg-white border-slate-200 shadow-sm'}`}>
        <BrainCircuit size={28} className={`mx-auto mb-2 ${isDark ? 'text-slate-600' : 'text-slate-300'}`} />
        <p className={`text-[11px] font-black uppercase tracking-widest ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
          Chưa có báo cáo hôm nay
        </p>
        <p className={`text-[10px] mt-1 mb-3 ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
          Báo cáo tự động chạy lúc 7:00 SA mỗi ngày làm việc
        </p>
        <button
          onClick={() => fetchInsight(true)}
          disabled={isScanning}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${
            isScanning
              ? 'opacity-60 cursor-not-allowed'
              : isDark
              ? 'bg-yellow-400/15 border-yellow-400/30 text-yellow-400 hover:bg-yellow-400/25'
              : 'bg-yellow-50 border-yellow-300 text-yellow-700 hover:bg-yellow-100'
          }`}
        >
          {isScanning
            ? <><Loader2 size={13} className="animate-spin" /> Đang quét...</>
            : <><Zap size={13} /> Quét ngay</>
          }
        </button>
      </div>
    );
  }

  // ── Main render ──────────────────────────────────────────────────────────────

  return (
    <div className={`w-full rounded-2xl border overflow-hidden mb-4 transition-all duration-300 ${
      isDark
        ? `bg-[#080c14] border-white/8 ${sentimentCfg.glow}`
        : `bg-white border-slate-200 shadow-sm`
    }`}>

      {/* ═══ HEADER ═══ */}
      <div className={`px-4 py-3 border-b flex items-center justify-between gap-3 ${
        isDark ? 'border-white/5' : 'border-slate-100'
      }`}>
        <div className="flex items-center gap-3 min-w-0">
          {/* Icon */}
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border ${
            isDark ? `${sentimentCfg.bg} ${sentimentCfg.border}` : `${sentimentCfg.bgLight} ${sentimentCfg.borderLight}`
          }`}>
            <Sparkles size={15} className={isDark ? sentimentCfg.color : sentimentCfg.colorLight} />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className={`text-[11px] font-black uppercase tracking-widest ${isDark ? 'text-yellow-400' : 'text-yellow-600'}`}>
                AI Market Intelligence
              </p>
              {/* Sentiment badge */}
              <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${
                isDark
                  ? `${sentimentCfg.bg} ${sentimentCfg.border} ${sentimentCfg.color}`
                  : `${sentimentCfg.bgLight} ${sentimentCfg.borderLight} ${sentimentCfg.colorLight}`
              }`}>
                {sentimentCfg.icon} {sentimentCfg.label}
              </span>
              {insight.isWeekend && (
                <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border ${
                  isDark ? 'text-slate-500 border-white/10' : 'text-slate-400 border-slate-200'
                }`}>Cuối tuần</span>
              )}
            </div>
            {/* Meta info */}
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`flex items-center gap-1 text-[9px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                <Calendar size={9} /> {formatDate(insight.date)}
              </span>
              <span className={`flex items-center gap-1 text-[9px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                <Clock size={9} /> {timeAgo(insight.scannedAt)}
              </span>
              {insight.model && (
                <span className={`flex items-center gap-1 text-[8px] font-mono ${isDark ? 'text-slate-600' : 'text-slate-300'}`}>
                  <Bot size={8} /> {insight.model.replace('deepseek-', 'DS-')}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Nút refresh + cooldown countdown */}
          {cooldownSec > 0 ? (
            <div className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[9px] font-black ${
              isDark ? 'bg-white/5 border-white/10 text-slate-500' : 'bg-slate-50 border-slate-200 text-slate-400'
            }`}>
              <RefreshCw size={10} className="opacity-40" />
              {cooldownSec}s
            </div>
          ) : (
            <button
              onClick={() => fetchInsight(true)}
              disabled={isScanning}
              title="Quét lại ngay"
              className={`p-2 rounded-lg border transition-all ${
                isScanning
                  ? 'opacity-40 cursor-not-allowed'
                  : isDark
                  ? 'bg-white/5 border-white/10 text-slate-400 hover:text-yellow-400 hover:border-yellow-400/30'
                  : 'bg-slate-50 border-slate-200 text-slate-500 hover:text-yellow-600 hover:border-yellow-300'
              }`}
            >
              <RefreshCw size={13} className={isScanning ? 'animate-spin' : ''} />
            </button>
          )}
        </div>
      </div>

      {/* ═══ SUMMARY ═══ */}
      {insight.summary && (
        <div className={`px-4 py-2.5 border-b text-[11px] font-medium leading-relaxed ${
          isDark ? 'border-white/5 text-slate-300' : 'border-slate-100 text-slate-700'
        }`}>
          <span className={`font-black mr-1.5 ${isDark ? 'text-yellow-400' : 'text-yellow-600'}`}>▶</span>
          {insight.summary}
        </div>
      )}

      {/* ═══ TABS ═══ */}
      <div className={`flex border-b px-4 ${isDark ? 'border-white/5' : 'border-slate-100'}`}>
        {[
          { id: 'picks', label: 'Top Picks', icon: <Target size={11} /> },
          { id: 'report', label: 'Báo cáo đầy đủ', icon: <BookOpen size={11} /> },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all ${
              activeTab === tab.id
                ? isDark
                  ? 'border-yellow-400 text-yellow-400'
                  : 'border-yellow-500 text-yellow-600'
                : isDark
                ? 'border-transparent text-slate-500 hover:text-slate-300'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* ═══ TAB: TOP PICKS ═══ */}
      {activeTab === 'picks' && (
        <div className="p-4 space-y-4">

          {/* Filter row */}
          {(insight.topPicks?.length || 0) > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {[
                { key: 'ALL', label: 'Tất cả', count: insight.topPicks?.length || 0 },
                { key: 'MUA', label: '🟢 Mua', count: buyCount },
                { key: 'TRÁNH', label: '🔴 Tránh', count: avoidCount },
                { key: 'THEO DÕI', label: '👁 Theo dõi', count: watchCount },
              ].filter(f => f.key === 'ALL' || f.count > 0).map(f => (
                <button
                  key={f.key}
                  onClick={() => setFilterAction(f.key)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wide border transition-all ${
                    filterAction === f.key
                      ? isDark
                        ? 'bg-yellow-400/15 border-yellow-400/40 text-yellow-400'
                        : 'bg-yellow-50 border-yellow-400 text-yellow-700'
                      : isDark
                      ? 'bg-white/4 border-white/10 text-slate-500 hover:text-slate-300'
                      : 'bg-slate-50 border-slate-200 text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {f.label}
                  <span className={`ml-1 text-[8px] px-1 rounded-full ${
                    filterAction === f.key
                      ? isDark ? 'bg-yellow-400/20 text-yellow-300' : 'bg-yellow-200 text-yellow-700'
                      : isDark ? 'bg-white/10 text-slate-400' : 'bg-slate-200 text-slate-500'
                  }`}>{f.count}</span>
                </button>
              ))}
            </div>
          )}

          {/* Pick cards grid */}
          {filteredPicks.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {filteredPicks.map((pick, i) => (
                <PickCard
                  key={`${pick.symbol}-${i}`}
                  pick={pick}
                  isDark={isDark}
                  onSelect={handleSelectStock}
                />
              ))}
            </div>
          ) : (
            <div className={`text-center py-6 ${isDark ? 'text-slate-600' : 'text-slate-300'}`}>
              <Minus size={24} className="mx-auto mb-2" />
              <p className="text-[10px] font-black uppercase tracking-widest">Không có mã nào trong nhóm này</p>
            </div>
          )}

          {/* Click to analyze hint */}
          {filteredPicks.length > 0 && (
            <p className={`text-[9px] text-center ${isDark ? 'text-slate-600' : 'text-slate-300'}`}>
              ✦ Click vào mã để phân tích chi tiết
            </p>
          )}
        </div>
      )}

      {/* ═══ TAB: FULL REPORT ═══ */}
      {activeTab === 'report' && (
        <div className="p-4">
          {/* Toggle expand */}
          <div
            ref={reportRef}
            className={`relative overflow-hidden transition-all duration-500 ${
              isExpanded ? '' : 'max-h-[360px]'
            }`}
          >
            <div className={`prose prose-sm max-w-none leading-relaxed break-words
              ${isDark
                ? `prose-invert
                   prose-p:text-slate-300
                   prose-headings:text-yellow-400
                   prose-headings:font-black
                   prose-headings:uppercase
                   prose-headings:tracking-wide
                   prose-strong:text-white
                   prose-li:text-slate-300
                   prose-code:text-yellow-300
                   prose-code:bg-yellow-400/10
                   prose-blockquote:border-yellow-400/30
                   prose-blockquote:text-slate-400`
                : `prose-headings:text-slate-800
                   prose-headings:font-black
                   prose-p:text-slate-700
                   prose-li:text-slate-600
                   prose-strong:text-slate-900`
              }
              prose-table:text-xs
              prose-th:font-black prose-th:uppercase prose-th:tracking-widest prose-th:text-[10px]
              prose-td:text-[11px]
              prose-h1:text-base prose-h2:text-sm prose-h3:text-xs
            `}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {/* Bỏ block JSON ở cuối khi render Markdown */}
                {(insight.report || '').replace(/```json[\s\S]*?```/g, '').trim()}
              </ReactMarkdown>
            </div>

            {/* Fade overlay khi collapsed */}
            {!isExpanded && (
              <div className={`absolute bottom-0 left-0 right-0 h-20 pointer-events-none ${
                isDark
                  ? 'bg-gradient-to-t from-[#080c14] to-transparent'
                  : 'bg-gradient-to-t from-white to-transparent'
              }`} />
            )}
          </div>

          {/* Expand / Collapse button */}
          <button
            onClick={() => setIsExpanded(v => !v)}
            className={`mt-3 w-full flex items-center justify-center gap-2 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all active:scale-[0.99] ${
              isDark
                ? 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10 hover:text-slate-200'
                : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
            }`}
          >
            {isExpanded
              ? <><ChevronUp size={13} /> Thu gọn</>
              : <><ChevronDown size={13} /> Xem toàn bộ báo cáo</>
            }
          </button>

          {/* Scanning overlay */}
          {isScanning && (
            <div className={`absolute inset-0 flex flex-col items-center justify-center rounded-2xl backdrop-blur-sm z-10 ${
              isDark ? 'bg-black/60' : 'bg-white/70'
            }`}>
              <Loader2 size={28} className="text-yellow-400 animate-spin mb-3" />
              <p className={`text-[11px] font-black uppercase tracking-widest ${isDark ? 'text-yellow-400' : 'text-yellow-600'}`}>
                Đang quét thị trường...
              </p>
              <p className={`text-[10px] mt-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
               AI đang phân tích · ~30 giây
              </p>
            </div>
          )}
        </div>
      )}

      {/* ═══ FOOTER: Quick stats ═══ */}
      <div className={`px-4 py-2.5 border-t flex items-center gap-4 flex-wrap ${
        isDark ? 'border-white/5' : 'border-slate-100'
      }`}>
        <div className="flex items-center gap-1.5">
          <CheckCircle2 size={11} className="text-emerald-400" />
          <span className={`text-[9px] font-black uppercase tracking-widest ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
            {buyCount} nên mua
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <AlertTriangle size={11} className="text-red-400" />
          <span className={`text-[9px] font-black uppercase tracking-widest ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
            {avoidCount} nên tránh
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Eye size={11} className="text-yellow-400" />
          <span className={`text-[9px] font-black uppercase tracking-widest ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
            {watchCount} theo dõi
          </span>
        </div>
        <div className="ml-auto">
          <span className={`text-[8px] font-mono ${isDark ? 'text-slate-700' : 'text-slate-300'}`}>
            Cập nhật 7:00 SA / ngày làm việc
          </span>
        </div>
      </div>
    </div>
  );
}
