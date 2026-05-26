import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Send, Loader2, ChevronDown, RotateCcw, Bot, User, Minimize2, History } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import axios from 'axios';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const MAX_HISTORY_MESSAGES = 40;    
const MAX_TICKERS_STORED   = 15;   
const STORAGE_PREFIX       = 'omni_chat_';

// ─── QUICK SUGGESTION CHIPS ───────────────────────────────────────────────────
const QUICK_PROMPTS = [
  'Tóm tắt điểm mạnh và điểm yếu chính của doanh nghiệp?',
  'Khuyến nghị nên MUA / BÁN / HOLD?',
  'Rủi ro lớn nhất cần chú ý?',
  'Mức giá hợp lý (fair value)?',
  'So sánh với trung bình ngành?',
  'Triển vọng ngắn hạn 1-3 tháng?',
];

// ─── STORAGE HELPERS ──────────────────────────────────────────────────────────
function getChatKey(ticker) {
  return `${STORAGE_PREFIX}${ticker}`;
}

function loadChatHistory(ticker) {
  try {
    const raw = localStorage.getItem(getChatKey(ticker));
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data.messages) ? data.messages : [];
  } catch {
    return [];
  }
}

function saveChatHistory(ticker, messages) {
  if (!ticker || messages.length === 0) return;
  try {
     const toSave = messages.slice(-MAX_HISTORY_MESSAGES);
    localStorage.setItem(getChatKey(ticker), JSON.stringify({
      messages: toSave,
      savedAt: Date.now(),
    }));
    pruneOldTickers(ticker);
  } catch {
   }
}

function pruneOldTickers(currentTicker) {
   try {
    const keys = Object.keys(localStorage)
      .filter(k => k.startsWith(STORAGE_PREFIX))
      .map(k => ({
        key: k,
        ticker: k.replace(STORAGE_PREFIX, ''),
        savedAt: (() => {
          try { return JSON.parse(localStorage.getItem(k))?.savedAt || 0; } catch { return 0; }
        })(),
      }))
      .sort((a, b) => a.savedAt - b.savedAt);  

    if (keys.length > MAX_TICKERS_STORED) {
       const toDelete = keys
        .filter(k => k.ticker !== currentTicker)
        .slice(0, keys.length - MAX_TICKERS_STORED);
      toDelete.forEach(k => localStorage.removeItem(k.key));
    }
  } catch {
     
  }
}

function clearChatHistory(ticker) {
  try { localStorage.removeItem(getChatKey(ticker)); } catch { /* pass */ }
}

// ─── ANIMATED CHAT ICON ───────────────────────────────────────────────────────
function ChatIcon({ size = 36 }) {
  return (
    <img
      src="/chaticon.svg"
      alt="AI"
      width={size}
      height={size}
      style={{ display: 'block', objectFit: 'contain' }}
      draggable={false}
    />
  );
}

// ─── TYPING INDICATOR ─────────────────────────────────────────────────────────
function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-4 py-3">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="w-2 h-2 rounded-full bg-yellow-400 animate-bounce"
          style={{ animationDelay: `${i * 0.15}s`, animationDuration: '0.8s' }}
        />
      ))}
    </div>
  );
}

// ─── SINGLE MESSAGE BUBBLE ────────────────────────────────────────────────────
function MessageBubble({ msg, isDark }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : 'flex-row'} mb-4 group animate-in fade-in slide-in-from-bottom-1 duration-200`}>
      {/* Avatar */}
      <div className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-[11px] font-black mt-0.5
        ${isUser
          ? 'bg-yellow-400 text-black'
          : isDark ? 'bg-[#1e2a3a] border border-yellow-500/30 text-yellow-400' : 'bg-slate-100 border border-slate-300 text-slate-600'
        }`}>
        {isUser ? <User size={14} /> : <Bot size={14} />}
      </div>

      {/* Bubble */}
      <div className={`max-w-[82%] rounded-2xl px-4 py-3 text-[13px] leading-relaxed
        ${isUser
          ? 'bg-yellow-400 text-black font-medium rounded-tr-sm'
          : isDark
            ? 'bg-[#151d28] border border-white/8 text-slate-200 rounded-tl-sm'
            : 'bg-white border border-slate-300 text-slate-800 rounded-tl-sm shadow-sm'
        }`}
      >
        {isUser ? (
          <p>{msg.content}</p>
        ) : (
          <div className={`prose prose-sm max-w-none
            ${isDark
              ? 'prose-invert prose-p:text-slate-300 prose-headings:text-yellow-400 prose-strong:text-emerald-400 prose-code:text-yellow-300 prose-code:bg-black/30'
              : 'prose-p:text-slate-700 prose-headings:text-slate-800 prose-strong:text-emerald-600'
            }
            prose-headings:font-black prose-headings:text-sm prose-p:leading-relaxed prose-p:my-1
            prose-ul:my-1 prose-li:my-0.5 prose-headings:my-2`}
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
          </div>
        )}
        <p className={`text-[10px] mt-2 ${isUser ? 'text-black/50 text-right' : isDark ? 'text-slate-500' : 'text-slate-400'}`}>
          {msg.time}
        </p>
      </div>
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function StockAiChat({
  isOpen,
  onClose,
  ticker,
  companyName,
  aiReport,
  isDark,
  currentUser,
}) {
  const [messages, setMessages]             = useState([]);
  const [input, setInput]                   = useState('');
  const [loading, setLoading]               = useState(false);
  const [isMinimized, setIsMinimized]       = useState(false);
  const [showQuickPrompts, setShowQuickPrompts] = useState(true);
  const [showWarning, setShowWarning]       = useState(true);
  const [hasRestoredHistory, setHasRestoredHistory] = useState(false);

  // ── RESIZE STATE ─────────────────────────────────────────
  const [size, setSize] = useState({ w: 420, h: 600 });
  const isResizing = useRef(false);
  const resizeStart = useRef({ mouseX: 0, mouseY: 0, w: 420, h: 600 });

  const messagesEndRef = useRef(null);
  const inputRef       = useRef(null);

  // ── DRAG STATE ───────────────────────────────────────────
  const dragRef    = useRef(null);
  const isDragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const [pos, setPos] = useState({ x: null, y: null });

  // ── DRAG  ────────────────────
  useEffect(() => {
    const onMouseMove = (e) => {
      if (isDragging.current) {
        setPos({
          x: e.clientX - dragOffset.current.x,
          y: e.clientY - dragOffset.current.y,
        });
      }
      if (isResizing.current) {
        const dx = e.clientX - resizeStart.current.mouseX;
        const dy = e.clientY - resizeStart.current.mouseY;
        setSize({
          w: Math.max(340, Math.min(700, resizeStart.current.w + dx)),
          h: Math.max(420, Math.min(900, resizeStart.current.h + dy)),
        });
      }
    };
    const onMouseUp = () => {
      isDragging.current = false;
      isResizing.current = false;
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup',   onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup',   onMouseUp);
    };
  }, []);

  // ── DRAG: handler ────────────────────────────────────────
  const startDrag = (e) => {
    if (e.target.closest('button')) return;
    isDragging.current = true;
    const rect = dragRef.current.getBoundingClientRect();
    dragOffset.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    e.preventDefault();
  };

  // ── RESIZE: handler ──────────────────────────────────────
  const startResize = (e) => {
    e.stopPropagation();
    e.preventDefault();
    isResizing.current = true;
    resizeStart.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      w: size.w,
      h: size.h,
    };
  };

  // ── AUTO SCROLL ──────────────────────────────────────────
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);
  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  // ── FOCUS ──────────────────────────────────
  useEffect(() => {
    if (isOpen && !isMinimized) setTimeout(() => inputRef.current?.focus(), 150);
  }, [isOpen, isMinimized]);

  // ── SAVE  ──────────────────
  useEffect(() => {
    if (ticker && messages.length > 1) {
       saveChatHistory(ticker, messages);
    }
  }, [messages, ticker]);

  // ── ───
  useEffect(() => {
    if (isOpen && ticker) {
      const savedMsgs = loadChatHistory(ticker);
      const greetingMsg = {
        role: 'assistant',
        content: aiReport
          ? `Xin chào! Tôi đã đọc xong báo cáo phân tích **${ticker}**${companyName ? ` — ${companyName}` : ''}.\n\nHỏi tôi bất cứ điều gì về mã này: điểm mạnh, rủi ro, chiến lược vào lệnh, hay so sánh với ngành. Tôi sẽ trả lời dựa trên dữ liệu thực tế đã phân tích. 🎯`
          : `Xin chào! Tôi là **OMNI DUCK AI**.\n\nChưa có báo cáo mới cho **${ticker}**, nhưng tôi sẽ tìm lại báo cáo cũ đã lưu (nếu có) và trả lời dựa trên kiến thức chung về mã này.\n\nBạn muốn hỏi gì?`,
        time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      };

      if (savedMsgs.length > 1) {
         const separator = {
          role: 'system-separator',
          content: `— Lịch sử trò chuyện cũ về ${ticker} (${savedMsgs.length - 1} tin nhắn) —`,
          time: '',
        };
         const resumeMsg = {
          role: 'assistant',
          content: aiReport
            ? `✅ Đã khôi phục lịch sử chat **${ticker}**. Báo cáo mới đã được nạp — tôi sẵn sàng tiếp tục tư vấn!`
            : `✅ Đã khôi phục lịch sử chat **${ticker}**. Hãy hỏi tôi nhé!`,
          time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages([separator, ...savedMsgs.slice(1), resumeMsg]);
        setHasRestoredHistory(true);
        setShowQuickPrompts(false);
      } else {
         setMessages([greetingMsg]);
        setHasRestoredHistory(false);
        setShowQuickPrompts(true);
      }

      setShowWarning(true);
      setInput('');
    }
  }, [isOpen, ticker]);  

  // ── SEND MESSAGE ─────────────────────────────────────────
  const handleSend = useCallback(async (textOverride) => {
    const text = (textOverride ?? input).trim();
    if (!text || loading) return;

    setInput('');
    setShowQuickPrompts(false);

    const userMsg = {
      role: 'user',
      content: text,
      time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
       const history = messages
        .filter(m => m.role !== 'system-separator')
        .slice(1)
        .map(m => ({ role: m.role, content: m.content }));

      const res = await axios.post(`/api/stock-chat/${ticker}`, {
        question: text,
        history,
        aiReport,
        user: currentUser,
      });
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: res.data.answer || 'Xin lỗi, tôi không thể trả lời lúc này.',
        time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `[LỖI] kết nối: ${err.response?.data?.message || err.message}. Vui lòng thử lại.`,
        time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [input, loading, messages, ticker, aiReport, currentUser]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleClearChat = () => {
    clearChatHistory(ticker);
    setMessages(prev => [prev.find(m => m.role === 'assistant') || prev[0]]);
    setHasRestoredHistory(false);
    setShowQuickPrompts(true);
    setShowWarning(true);
    inputRef.current?.focus();
  };

  // ── POSITION STYLE ──────────────────────────────────────
  const posStyle = pos.x !== null
    ? { left: pos.x, top: pos.y }
    : { bottom: '24px', right: '24px' };

  if (!isOpen) return null;

  // ════════════════════════════════════════════════════════
  // MINIMIZED STATE
  // ════════════════════════════════════════════════════════
  if (isMinimized) {
  return (
    <div
      ref={dragRef}
      onMouseDown={startDrag}
      className={`fixed z-[9999] flex items-center gap-3 px-4 py-3 rounded-2xl shadow-2xl cursor-move border-2 transition-shadow select-none
        ${isDark
          ? 'bg-[#0f1520] border-yellow-500/40 shadow-black/50'
          : 'bg-white border-yellow-400 shadow-yellow-100/80 shadow-lg'
        }`}
      style={{
        ...posStyle,
        boxShadow: isDark
          ? '0 0 18px 2px rgba(234,179,8,0.18), 0 8px 32px rgba(0,0,0,0.5)'
          : '0 0 16px 2px rgba(234,179,8,0.22), 0 4px 16px rgba(0,0,0,0.10)',
      }}
      onClick={(e) => {
        if (!isDragging.current) setIsMinimized(false);
      }}
    >
        <div className="w-9 h-9 rounded-xl overflow-hidden shrink-0 flex items-center justify-center bg-[#f5f0e8]">
          <ChatIcon size={34} />
        </div>
        <div className="select-none">
          <p className={`text-[11px] font-black uppercase tracking-widest leading-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
            AI Chat — {ticker}
          </p>
          {messages.filter(m => m.role !== 'system-separator').length > 1 && (
            <p className={`text-[10px] mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              {messages.filter(m => m.role !== 'system-separator').length - 1} tin nhắn
            </p>
          )}
        </div>
        <ChevronDown size={14} className={isDark ? 'text-slate-400' : 'text-slate-500'} />
      </div>
    );
  }

  // ════════════════════════════════════════════════════════
  // FULL CHAT WINDOW
  // ════════════════════════════════════════════════════════
  return (
    <div
      ref={dragRef}
      style={{
        ...posStyle,
        width: size.w,
        height: size.h,
        animation: 'chatSlideIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)',
        boxShadow: isDark
          ? '0 0 24px 3px rgba(234,179,8,0.18), 0 0 0 1.5px rgba(234,179,8,0.10), 0 16px 48px rgba(0,0,0,0.65)'
          : '0 0 20px 3px rgba(234,179,8,0.20), 0 0 0 1.5px rgba(234,179,8,0.12), 0 8px 32px rgba(0,0,0,0.12)',
      }}
      className={`fixed z-[9999] flex flex-col rounded-3xl border-2 overflow-hidden
        ${isDark
          ? 'bg-[#080d14] border-yellow-500/30'
          : 'bg-[#f8fafc] border-yellow-400/60'
        }`}
    >
      <style>{`
        @keyframes chatSlideIn {
          from { opacity: 0; transform: translateY(20px) scale(0.95); }
          to   { opacity: 1; transform: translateY(0)   scale(1);    }
        }
      `}</style>

      {/* ── HEADER  ── */}
      <div
        onMouseDown={startDrag}
        className={`shrink-0 px-4 py-3 border-b-2 flex items-center gap-3 cursor-move select-none
          ${isDark
            ? 'bg-[#0b1018] border-yellow-500/15'
            : 'bg-white border-yellow-300/60'
          }`}
      >
        {/* Animated icon */}
        <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 flex items-center justify-center bg-[#f5f0e8] shadow-md">
          <ChatIcon size={38} />
        </div>

        <div className="flex-1 min-w-0">
          <p className={`text-sm font-black uppercase tracking-widest leading-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
            AI Chat — {ticker}
          </p>
          <p className={`text-[10px] truncate mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            {aiReport ? '✦ Đã nạp báo cáo phân tích' : '⚠ Chưa có báo cáo — dùng kiến thức chung'}
            {companyName ? ` · ${companyName}` : ''}
            {hasRestoredHistory ? ' · 🕓 Đã khôi phục lịch sử' : ''}
          </p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {messages.filter(m => m.role !== 'system-separator').length > 1 && (
            <button
              onClick={handleClearChat}
              title="Xóa lịch sử chat"
              className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all hover:scale-110 active:scale-95
                ${isDark ? 'text-slate-500 hover:text-yellow-400 hover:bg-yellow-400/10' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'}`}
            >
              <RotateCcw size={14} />
            </button>
          )}
          <button
            onClick={() => setIsMinimized(true)}
            className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all hover:scale-110 active:scale-95
              ${isDark ? 'text-slate-500 hover:text-yellow-400 hover:bg-yellow-400/10' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'}`}
          >
            <Minimize2 size={14} />
          </button>
          <button
            onClick={onClose}
            className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all hover:scale-110 active:scale-95
              ${isDark ? 'text-slate-500 hover:text-red-400 hover:bg-red-400/10' : 'text-slate-400 hover:text-red-500 hover:bg-red-50'}`}
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* ── WARNING  ── */}
      {!aiReport && showWarning && (
        <div className={`shrink-0 mx-4 mt-3 px-4 py-3 rounded-xl border flex items-start gap-2 text-[11px] relative
          ${isDark ? 'bg-yellow-500/5 border-yellow-500/20 text-yellow-300' : 'bg-yellow-50 border-yellow-400 text-yellow-800'}`}
        >
          <span className="text-base leading-none shrink-0">⚠️</span>
          <span className="leading-relaxed pr-5">
            Bạn chưa chạy phân tích AI mới nhất cho <strong>{ticker}</strong>. Chat vẫn hoạt động nhưng AI sẽ dùng kiến thức chung và báo cáo cũ (nếu có).
          </span>
          <button
            onClick={() => setShowWarning(false)}
            className={`absolute top-2 right-2 w-5 h-5 rounded-md flex items-center justify-center transition-all hover:scale-110 active:scale-95
              ${isDark ? 'text-yellow-500/60 hover:text-yellow-400 hover:bg-yellow-400/10' : 'text-yellow-600/60 hover:text-yellow-800 hover:bg-yellow-200/60'}`}
            title="Đóng cảnh báo"
          >
            <X size={11} />
          </button>
        </div>
      )}

      {/* ── MESSAGES AREA ── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 min-h-0 custom-scrollbar">
        {messages.map((msg, i) => {
           if (msg.role === 'system-separator') {
            return (
              <div key={i} className={`flex items-center gap-2 my-3 select-none`}>
                <div className={`flex-1 h-px ${isDark ? 'bg-white/10' : 'bg-slate-200'}`} />
                <span className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border
                  ${isDark ? 'text-slate-500 border-white/10 bg-white/3' : 'text-slate-400 border-slate-200 bg-slate-50'}`}>
                  <History size={10} />
                  {msg.content}
                </span>
                <div className={`flex-1 h-px ${isDark ? 'bg-white/10' : 'bg-slate-200'}`} />
              </div>
            );
          }
          return <MessageBubble key={i} msg={msg} isDark={isDark} />;
        })}
        {loading && (
          <div className="flex gap-2.5 mb-4">
            <div className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center mt-0.5
              ${isDark ? 'bg-[#1e2a3a] border border-yellow-500/30 text-yellow-400' : 'bg-slate-100 border border-slate-300 text-slate-600'}`}>
              <Bot size={14} />
            </div>
            <div className={`rounded-2xl rounded-tl-sm border
              ${isDark ? 'bg-[#151d28] border-white/8' : 'bg-white border-slate-300 shadow-sm'}`}>
              <TypingDots />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* ── QUICK PROMPTS   ── */}
      {showQuickPrompts && messages.filter(m => m.role !== 'system-separator').length <= 1 && (
        <div className={`shrink-0 px-4 pb-3 border-t pt-3 ${isDark ? 'border-white/5' : 'border-slate-300'}`}>
          <div className="flex items-center justify-between mb-2.5">
            <p className={`text-[10px] font-black uppercase tracking-widest ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              Gợi ý câu hỏi
            </p>
            <button
              onClick={() => setShowQuickPrompts(false)}
              title="Ẩn gợi ý"
              className={`w-5 h-5 rounded-md flex items-center justify-center transition-all hover:scale-110 active:scale-95
                ${isDark ? 'text-slate-600 hover:text-slate-400 hover:bg-white/8' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}
            >
              <X size={11} />
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_PROMPTS.map((prompt, i) => (
              <button
                key={i}
                onClick={() => handleSend(prompt)}
                disabled={loading}
                className={`text-[11px] font-medium px-3 py-1.5 rounded-xl border transition-all hover:scale-105 active:scale-95 disabled:opacity-40
                  ${isDark
                    ? 'bg-white/5 border-white/8 text-slate-300 hover:bg-yellow-400/10 hover:border-yellow-500/30 hover:text-yellow-300'
                    : 'bg-white border-slate-300 text-slate-600 hover:bg-yellow-50 hover:border-yellow-400 hover:text-yellow-700 shadow-sm'
                  }`}
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── INPUT BAR ── */}
      <div className={`shrink-0 px-4 pb-4 pt-3 border-t ${isDark ? 'border-white/5' : 'border-slate-300'}`}>
        <div className={`flex items-end gap-2 rounded-2xl border-2 px-4 py-3 transition-all
          focus-within:ring-2 focus-within:ring-yellow-400/30
          ${isDark
            ? 'bg-[#0f1520] border-white/8 focus-within:border-yellow-500/50'
            : 'bg-white border-slate-300 focus-within:border-yellow-400 shadow-sm'
          }`}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Hỏi về ${ticker}...`}
            rows={1}
            disabled={loading}
            className={`flex-1 bg-transparent outline-none resize-none text-[13px] leading-relaxed max-h-[100px] disabled:opacity-50 placeholder:font-normal
              ${isDark ? 'text-white placeholder:text-slate-600' : 'text-slate-900 placeholder:text-slate-400'}`}
            style={{ minHeight: '20px' }}
            onInput={e => {
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px';
            }}
          />
          <button
            onClick={() => handleSend()}
            disabled={loading || !input.trim()}
            className={`shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-all active:scale-95 mb-0.5
              ${loading || !input.trim()
                ? isDark ? 'bg-white/5 text-slate-600' : 'bg-slate-100 text-slate-400'
                : 'bg-yellow-400 text-black shadow-lg shadow-yellow-400/30 hover:bg-yellow-300 hover:scale-110'
              }`}
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Send size={14} />}
          </button>
        </div>
        <p className={`text-[10px] mt-2 text-center ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
          Enter để gửi · Shift+Enter xuống dòng
        </p>
      </div>

      {/* ── RESIZE HANDLE (bottom-right corner) ── */}
      <div
        onMouseDown={startResize}
        title="Kéo để thay đổi kích thước"
        className={`absolute bottom-1 right-1 w-6 h-6 flex items-center justify-center cursor-se-resize opacity-30 hover:opacity-70 transition-opacity select-none z-10`}
        style={{ touchAction: 'none' }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M11 1L1 11M11 6L6 11M11 11" stroke={isDark ? '#eab308' : '#92400e'} strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </div>
    </div>
  );
}