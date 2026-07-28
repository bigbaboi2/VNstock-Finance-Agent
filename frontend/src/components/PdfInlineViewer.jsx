import React, { useEffect, useState, useRef, useCallback } from 'react';
import axios from 'axios';
import { FileText, Loader2, ExternalLink } from 'lucide-react';
import * as pdfjs from 'pdfjs-dist/build/pdf.mjs';
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

export default function PdfInlineViewer({ pdfUrl, symbol, isDark }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pdfDoc, setPdfDoc] = useState(null);
  const pagesContainerRef = useRef(null);
  const renderTasksRef = useRef([]);

  const cleanUpRenderTasks = () => {
    renderTasksRef.current.forEach(task => {
      try { task?.cancel?.(); } catch {}
    });
    renderTasksRef.current = [];
  };

  useEffect(() => {
    if (!pdfUrl) return;

    let isMounted = true;
    setLoading(true);
    setError(null);
    setPdfDoc(null);

    const loadPdf = async () => {
      try {
        const res = await axios.get(pdfUrl, {
          responseType: 'arraybuffer',
          headers: { 'ngrok-skip-browser-warning': 'true' }
        });

        if (!isMounted) return;

        const loadingTask = pdfjs.getDocument({ data: res.data });
        const doc = await loadingTask.promise;

        if (!isMounted) return;
        setPdfDoc(doc);
        setLoading(false);
      } catch (err) {
        console.error('Lỗi tải PDF trực tiếp:', err);
        if (isMounted) {
          setError('Không thể render trực tiếp báo cáo.');
          setLoading(false);
        }
      }
    };

    loadPdf();

    return () => {
      isMounted = false;
      cleanUpRenderTasks();
    };
  }, [pdfUrl]);

  const renderPages = useCallback(async () => {
    if (!pdfDoc || !pagesContainerRef.current) return;
    cleanUpRenderTasks();
    const container = pagesContainerRef.current;
    container.innerHTML = '';

    for (let i = 1; i <= pdfDoc.numPages; i++) {
      try {
        const page = await pdfDoc.getPage(i);
        const viewport = page.getViewport({ scale: 1.0 });

        const pageWrapper = document.createElement('div');
        pageWrapper.className = 'relative flex flex-col items-center my-2 shadow-md rounded-xl overflow-hidden bg-white w-full max-w-full';
        
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        canvas.style.width = '100%';
        canvas.style.height = 'auto';

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
  }, [pdfDoc]);

  useEffect(() => {
    if (pdfDoc) {
      renderPages();
    }
  }, [pdfDoc, renderPages]);

  if (!pdfUrl) {
    return (
      <div className="h-full flex flex-col items-center justify-center opacity-40">
        <FileText size={32} className="mb-2 text-yellow-400" />
        <p className="text-[9px] font-black uppercase">Đang chờ dữ liệu báo cáo...</p>
      </div>
    );
  }

  return (
    <div className={`w-full h-full relative overflow-y-auto custom-scrollbar p-2 flex flex-col items-center ${
      isDark ? 'bg-[#0e141d]' : 'bg-slate-100'
    }`}>
      {loading && (
        <div className="h-full w-full flex flex-col items-center justify-center gap-2.5 py-12 text-yellow-400">
          <Loader2 size={28} className="animate-spin" />
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            Đang tải báo cáo PDF {symbol}...
          </p>
        </div>
      )}

      {error && (
        <div className="h-full w-full flex flex-col items-center justify-center gap-3 py-10 text-center px-4">
          <p className="text-xs font-bold text-red-400">{error}</p>
          <a
            href={pdfUrl}
            target="_blank"
            rel="noreferrer"
            className="px-3 py-1.5 bg-yellow-400 text-black font-black text-[10px] uppercase tracking-widest rounded-lg hover:bg-yellow-300 transition-all flex items-center gap-1.5"
          >
            <ExternalLink size={12} /> Mở file gốc
          </a>
        </div>
      )}

      <div
        ref={pagesContainerRef}
        className="w-full flex flex-col items-center max-w-full"
      />
    </div>
  );
}
