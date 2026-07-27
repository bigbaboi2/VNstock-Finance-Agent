import React, { useEffect, useState, useRef, useCallback } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { X, Download, ZoomIn, ZoomOut, RotateCw, FileText, Loader2, ExternalLink } from 'lucide-react';
import * as pdfjs from 'pdfjs-dist/build/pdf.mjs';
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

export default function PdfViewerModal({ isOpen, onClose, pdfUrl, symbol, isDark, UI }) {
  const { t } = useTranslation('common');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.2);
  const [rawBlobUrl, setRawBlobUrl] = useState(null);
  const pagesContainerRef = useRef(null);
  const renderTasksRef = useRef([]);

  const cleanUpRenderTasks = () => {
    renderTasksRef.current.forEach(task => {
      try { task?.cancel?.(); } catch {}
    });
    renderTasksRef.current = [];
  };

  useEffect(() => {
    if (!isOpen || !pdfUrl) return;

    let isMounted = true;
    setLoading(true);
    setError(null);
    setPdfDoc(null);
    setNumPages(0);

    const loadPdf = async () => {
      try {
        // Fetch via axios to pass ngrok header
        const res = await axios.get(pdfUrl, {
          responseType: 'arraybuffer',
          headers: { 'ngrok-skip-browser-warning': 'true' }
        });

        if (!isMounted) return;

        const blob = new Blob([res.data], { type: 'application/pdf' });
        const blobUrl = URL.createObjectURL(blob);
        setRawBlobUrl(blobUrl);

        const loadingTask = pdfjs.getDocument({ data: res.data });
        const doc = await loadingTask.promise;

        if (!isMounted) return;
        setPdfDoc(doc);
        setNumPages(doc.numPages);
        setLoading(false);
      } catch (err) {
        console.error('Lỗi tải PDF:', err);
        if (isMounted) {
          setError('Không thể tải trực tiếp file PDF. Vui lòng mở bằng liên kết ngoài.');
          setLoading(false);
        }
      }
    };

    loadPdf();

    return () => {
      isMounted = false;
      cleanUpRenderTasks();
      if (rawBlobUrl) {
        URL.revokeObjectURL(rawBlobUrl);
      }
    };
  }, [isOpen, pdfUrl]);

  // Render pages onto canvases
  const renderPages = useCallback(async () => {
    if (!pdfDoc || !pagesContainerRef.current) return;
    cleanUpRenderTasks();
    const container = pagesContainerRef.current;
    container.innerHTML = '';

    for (let i = 1; i <= pdfDoc.numPages; i++) {
      try {
        const page = await pdfDoc.getPage(i);
        const viewport = page.getViewport({ scale });

        const pageWrapper = document.createElement('div');
        pageWrapper.className = 'relative flex flex-col items-center my-3 shadow-lg rounded-xl overflow-hidden bg-white';
        
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        canvas.style.width = '100%';
        canvas.style.height = 'auto';
        canvas.style.maxWidth = `${viewport.width}px`;

        pageWrapper.appendChild(canvas);
        container.appendChild(pageWrapper);

        const renderContext = {
          canvasContext: context,
          viewport: viewport
        };
        const renderTask = page.render(renderContext);
        renderTasksRef.current.push(renderTask);
        await renderTask.promise;
      } catch (e) {
        if (e?.name !== 'RenderingCancelledException') {
          console.error(`Lỗi render trang ${i}:`, e);
        }
      }
    }
  }, [pdfDoc, scale]);

  useEffect(() => {
    if (pdfDoc) {
      renderPages();
    }
  }, [pdfDoc, scale, renderPages]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center p-2 sm:p-6 lg:p-10 pt-16 sm:pt-20 z-[999999]">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-md animate-in fade-in duration-200" 
        onClick={onClose} 
      />

      {/* Modal Container */}
      <div className={`relative w-full max-w-5xl h-[90vh] flex flex-col rounded-2xl sm:rounded-3xl overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.8)] border ${
        isDark ? 'bg-[#0a0e14] border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
      } animate-in zoom-in-95 duration-200 z-10`}>
        
        {/* Header */}
        <div className={`h-14 flex items-center justify-between px-4 sm:px-6 border-b shrink-0 z-20 ${
          isDark ? 'bg-black/40 border-white/8' : 'bg-white border-slate-200 shadow-sm'
        }`}>
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <FileText size={18} className="text-yellow-400 shrink-0" />
            <h3 className="font-black tracking-wider uppercase text-xs sm:text-sm truncate">
              Báo cáo TCBS: <span className="text-yellow-400">{symbol || 'PDF'}</span>
            </h3>
            {numPages > 0 && (
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                isDark ? 'bg-white/10 text-slate-300' : 'bg-slate-200 text-slate-700'
              }`}>
                {numPages} trang
              </span>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              onClick={() => setScale(s => Math.min(2.5, s + 0.2))}
              title="Phóng to"
              className={`p-2 rounded-xl border transition-all ${
                isDark ? 'border-white/10 hover:bg-white/10 text-slate-200' : 'border-slate-300 hover:bg-slate-100 text-slate-700'
              }`}
            >
              <ZoomIn size={16} />
            </button>
            <button
              onClick={() => setScale(s => Math.max(0.6, s - 0.2))}
              title="Thu nhỏ"
              className={`p-2 rounded-xl border transition-all ${
                isDark ? 'border-white/10 hover:bg-white/10 text-slate-200' : 'border-slate-300 hover:bg-slate-100 text-slate-700'
              }`}
            >
              <ZoomOut size={16} />
            </button>
            {rawBlobUrl && (
              <a
                href={rawBlobUrl}
                download={`${symbol}_TCBS_Report.pdf`}
                title="Tải xuống PDF"
                className="p-2 rounded-xl bg-yellow-400 text-black font-bold hover:bg-yellow-300 transition-all flex items-center gap-1 text-xs"
              >
                <Download size={16} />
                <span className="hidden sm:inline">Tải về</span>
              </a>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-red-400 hover:bg-red-500/20 transition-colors ml-1"
            >
              <X size={20} strokeWidth={2.5} />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 relative overflow-y-auto custom-scrollbar p-2 sm:p-6 bg-slate-900/50 flex flex-col items-center">
          {loading && (
            <div className="h-full flex flex-col items-center justify-center gap-3 py-20 text-yellow-400">
              <Loader2 size={36} className="animate-spin" />
              <p className="text-xs font-black uppercase tracking-widest text-slate-300">Đang render báo cáo PDF...</p>
            </div>
          )}

          {error && (
            <div className="h-full flex flex-col items-center justify-center gap-4 py-20 text-center px-4">
              <p className="text-sm font-bold text-red-400">{error}</p>
              {pdfUrl && (
                <a
                  href={pdfUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-2 bg-yellow-400 text-black font-black text-xs uppercase tracking-widest rounded-xl hover:bg-yellow-300 transition-all flex items-center gap-2"
                >
                  <ExternalLink size={14} /> Mở file gốc
                </a>
              )}
            </div>
          )}

          <div 
            ref={pagesContainerRef} 
            className="w-full flex flex-col items-center max-w-full"
          />
        </div>
      </div>
    </div>
  );
}
