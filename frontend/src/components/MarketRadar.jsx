import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createChart } from 'lightweight-charts';

export default React.memo(function MiniRadarChart({ data, theme, color = '#facc15' }) {
  const chartContainerRef = useRef();
  const chartInstance = useRef(null);
  const seriesRef = useRef(null);
  const [errorMessage, setErrorMessage] = useState(null);

  // Effect 1: Khởi tạo chart 1 lần khi mount / khi theme thay đổi
  useEffect(() => {
    if (!chartContainerRef.current) return;
    // Cleanup chart cũ nếu theme thay đổi
    if (chartInstance.current) {
      chartInstance.current.remove();
      chartInstance.current = null;
      seriesRef.current = null;
    }

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth || 300,
      height: chartContainerRef.current.clientHeight || 150,
      layout: {
        background: { type: 'solid', color: theme === 'dark' ? '#0B0F14' : '#ffffff' },
        textColor: theme === 'dark' ? '#94A3B8' : '#334155',
        attributionLogo: false,
      },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      timeScale: { visible: true, borderVisible: false },
      rightPriceScale: { visible: true, borderVisible: false }
    });

    chartInstance.current = chart;
    seriesRef.current = chart.addCandlestickSeries({
      upColor: '#10b981', downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#10b981', wickDownColor: '#ef4444',
    });

    const resizeObserver = new ResizeObserver(entries => {
      if (chartInstance.current && chartContainerRef.current) {
        const { width, height } = entries[0].contentRect;
        if (width > 0 && height > 0) {
          chartInstance.current.applyOptions({ width, height });
          chartInstance.current.timeScale().fitContent();
        }
      }
    });
    resizeObserver.observe(chartContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      if (chartInstance.current) {
        chartInstance.current.remove();
        chartInstance.current = null;
        seriesRef.current = null;
      }
    };
  }, [theme]);

   useEffect(() => {
    setErrorMessage(null);

    if (!data || data.length === 0) {
      setErrorMessage("DỮ LIỆU TRỐNG (API KHÔNG CÓ DATA)");
      return;
    }
    const first = data[0];
    if (!first.time || first.open === undefined || first.close === undefined) {
      setErrorMessage("SAI ĐỊNH DẠNG NẾN (THIẾU OHLC)");
      return;
    }
    if (!seriesRef.current) return;

    try {
      const seenTimes = new Set();
      const uniqueData = data
        .filter(d => {
          if (seenTimes.has(d.time)) return false;
          seenTimes.add(d.time);
          return true;
        })
        .sort((a, b) => new Date(a.time) - new Date(b.time));

      seriesRef.current.setData(uniqueData);
      chartInstance.current?.timeScale().fitContent();
    } catch (err) {
      setErrorMessage(`LỖI VẼ: ${err.message}`);
    }
  }, [data]);

  return (
    <div className="w-full h-full relative min-h-[150px] bg-black/20 rounded-lg overflow-hidden border border-white/5">
      <div ref={chartContainerRef} className="w-full h-full" />
      
      {/* LỚP PHỦ THÔNG BÁO LỖI NẾU CÓ */}
      {errorMessage && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm z-50 p-4 text-center">
          <div className="text-red-500 font-black text-[10px] mb-2 animate-pulse">SYSTEM ERROR</div>
          <div className="text-white font-mono text-[11px] uppercase tracking-tighter border border-red-500/50 px-2 py-1 bg-red-500/10">
            {errorMessage}
          </div>
        </div>
      )}
    </div>
  );
});