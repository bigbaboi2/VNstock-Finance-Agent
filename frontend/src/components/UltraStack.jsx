import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronsUp, FileText, Loader2 } from 'lucide-react';
import * as pdfjs from 'pdfjs-dist/build/pdf.mjs';
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

/**
 * Ngăn xếp accordion: mỗi section chỉ mount children khi đang mở.
 * Cuộn trên container này; mở thẻ → đưa header thẻ lên đầu khung nhìn.
 */
export default function UltraStack({
  sections = [],
  openId,
  onOpenChange,
  isDark,
  className = '',
}) {
  const scrollRef = useRef(null);
  const sectionRefs = useRef({});
  const headerRefs = useRef({});
  const [scrolledDown, setScrolledDown] = useState(false);

  const toggle = (id, alwaysOpen) => {
    if (alwaysOpen) return;
    onOpenChange?.(openId === id ? null : id);
  };

  const collapseQuick = () => {
    onOpenChange?.(null);
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const onScroll = () => setScrolledDown(el.scrollTop > 72);
    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  // Mở thẻ → luôn đưa header thẻ lên đầu khung cuộn (không nhảy xuống giữa nội dung)
  useEffect(() => {
    if (!openId) return undefined;
    const container = scrollRef.current;
    if (!container) return undefined;

    let cancelled = false;
    const alignToHeader = () => {
      if (cancelled) return;
      const header = headerRefs.current[openId];
      if (!header) return;
      const cRect = container.getBoundingClientRect();
      const hRect = header.getBoundingClientRect();
      const delta = hRect.top - cRect.top;
      if (Math.abs(delta) > 2) {
        container.scrollTop += delta;
      }
    };

    const t0 = requestAnimationFrame(() => {
      alignToHeader();
      requestAnimationFrame(alignToHeader);
    });
    const t1 = window.setTimeout(alignToHeader, 50);
    const t2 = window.setTimeout(alignToHeader, 160);
    return () => {
      cancelled = true;
      cancelAnimationFrame(t0);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [openId]);

  const showFab = scrolledDown && !!openId;

  return (
    <div className={`relative flex flex-col flex-1 min-h-0 ${className}`}>
      <div
        ref={scrollRef}
        className="flex flex-col flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-contain touch-pan-y custom-scrollbar"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {sections.map(({ id, title, icon: Icon, summary, render, alwaysOpen = false, accent }) => {
          const open = alwaysOpen || openId === id;
          const isYellow = accent === 'yellow';
          return (
            <div
              key={id}
              ref={(node) => {
                if (node) sectionRefs.current[id] = node;
                else delete sectionRefs.current[id];
              }}
              className={`shrink-0 border-b relative z-0 ${
                isDark ? 'border-white/10' : 'border-slate-200'
              }`}
            >
              <button
                type="button"
                ref={(node) => {
                  if (node) headerRefs.current[id] = node;
                  else delete headerRefs.current[id];
                }}
                onClick={() => toggle(id, alwaysOpen)}
                disabled={alwaysOpen}
                className={`w-full flex items-center gap-3 px-4 py-3.5 text-left min-h-[48px] transition-colors ${
                  alwaysOpen ? 'cursor-default' : ''
                } ${
                  isYellow
                    ? (isDark
                      ? 'bg-yellow-500 border-l-4 border-yellow-200 text-black'
                      : 'bg-yellow-400 border-l-4 border-yellow-600 text-black')
                    : open
                      ? (isDark ? 'bg-white/5' : 'bg-slate-100')
                      : (isDark ? 'hover:bg-white/3' : 'hover:bg-slate-50')
                }`}
              >
                {Icon && (
                  <Icon
                    size={16}
                    className={`shrink-0 ${isYellow ? 'text-black' : 'text-yellow-500'}`}
                  />
                )}
                <span
                  className={`flex-1 min-w-0 font-black text-sm truncate uppercase tracking-wide ${
                    isYellow ? 'text-black' : isDark ? 'text-white' : 'text-slate-900'
                  }`}
                >
                  {title}
                </span>
                {!open && summary && (
                  <span
                    className={`text-[10px] font-bold truncate max-w-[40%] ${
                      isYellow
                        ? 'text-black/70'
                        : isDark
                          ? 'text-slate-500'
                          : 'text-slate-400'
                    }`}
                  >
                    {summary}
                  </span>
                )}
                {!alwaysOpen && (
                  <ChevronDown
                    size={16}
                    className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''} ${
                      isYellow ? 'text-black' : isDark ? 'text-slate-400' : 'text-slate-500'
                    }`}
                  />
                )}
              </button>
              {open && (
                <div className="relative z-0 px-3 pb-4 pt-1 overflow-hidden">
                  {typeof render === 'function' ? render() : null}
                </div>
              )}
            </div>
          );
        })}
        <div className="shrink-0 h-16" aria-hidden />
      </div>

      {showFab && (
        <button
          type="button"
          onClick={collapseQuick}
          title="Thu gọn nhanh"
          className={`absolute left-2 top-1/2 -translate-y-1/2 z-30 flex flex-col items-center justify-center gap-1 w-10 py-3 rounded-full border shadow-lg ${
            isDark
              ? 'bg-[#0B0F14]/95 border-yellow-500/40 text-yellow-400'
              : 'bg-white/95 border-yellow-500/50 text-yellow-600'
          }`}
        >
          <ChevronsUp size={18} />
          <span
            className="text-[8px] font-black uppercase tracking-wider"
            style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
          >
            Thu gọn
          </span>
        </button>
      )}
    </div>
  );
}

/**
 * Render toàn bộ trang PDF thành canvas xếp dọc — cuộn theo stack ngoài.
 */
export function UltraPdfPages({ src, isDark }) {
  const hostRef = useRef(null);
  const [status, setStatus] = useState('loading');
  const [pageCount, setPageCount] = useState(0);
  const [errorText, setErrorText] = useState('');

  useEffect(() => {
    if (!src) {
      setStatus('error');
      setErrorText('Không có PDF');
      return undefined;
    }

    let cancelled = false;
    let pdfDoc = null;

    const run = async () => {
      setStatus('loading');
      setErrorText('');
      setPageCount(0);
      const host = hostRef.current;
      if (host) host.innerHTML = '';

      try {
        const cleanSrc = String(src).split('#')[0];
        pdfDoc = await pdfjs.getDocument({
          url: cleanSrc,
          withCredentials: false,
        }).promise;

        if (cancelled) {
          pdfDoc.destroy();
          return;
        }

        const total = pdfDoc.numPages;
        setPageCount(total);
        const mount = hostRef.current;
        if (!mount) return;

        const maxWidth = Math.min(mount.clientWidth || 640, 900);

        for (let i = 1; i <= total; i += 1) {
          if (cancelled) break;
          const page = await pdfDoc.getPage(i);
          const unscaled = page.getViewport({ scale: 1 });
          const scale = maxWidth / unscaled.width;
          const viewport = page.getViewport({ scale: Math.min(scale, 2.2) });

          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.className = 'w-full h-auto block bg-white';
          canvas.style.maxWidth = '100%';

          const wrap = document.createElement('div');
          wrap.className = `mb-3 rounded-lg overflow-hidden border ${
            isDark ? 'border-white/10' : 'border-slate-200'
          }`;
          wrap.appendChild(canvas);
          mount.appendChild(wrap);

          await page.render({
            canvas,
            canvasContext: canvas.getContext('2d'),
            viewport,
          }).promise;
        }

        if (!cancelled) setStatus('ready');
      } catch (err) {
        if (!cancelled) {
          setStatus('error');
          setErrorText(err?.message || 'Không tải được PDF');
        }
      }
    };

    run();

    return () => {
      cancelled = true;
      try {
        pdfDoc?.destroy?.();
      } catch {
        /* ignore */
      }
      if (hostRef.current) hostRef.current.innerHTML = '';
    };
  }, [src, isDark]);

  if (!src) {
    return (
      <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Chưa có báo cáo PDF.</p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <FileText size={14} className="text-yellow-500 shrink-0" />
        <span className={`text-[10px] font-black uppercase tracking-widest ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
          Báo cáo TCBS
          {pageCount > 0 ? ` · ${pageCount} trang` : ''}
        </span>
        {status === 'loading' && <Loader2 size={12} className="animate-spin text-yellow-500" data-keep-spin />}
      </div>
      {status === 'error' && (
        <div className={`rounded-xl border p-4 text-sm ${isDark ? 'border-white/10 text-slate-400' : 'border-slate-200 text-slate-500'}`}>
          <p>{errorText}</p>
          <a
            href={String(src).split('#')[0]}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mt-2 text-yellow-500 font-bold text-xs underline"
          >
            Mở PDF tab mới
          </a>
        </div>
      )}
      <div ref={hostRef} className="w-full" />
    </div>
  );
}
