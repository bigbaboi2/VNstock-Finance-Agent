import { createChart } from "lightweight-charts";
import { useEffect, useRef } from "react";

export default function StockChart({ data }) {
  const chartContainerRef = useRef();

  useEffect(() => {
    if (!data || data.length === 0) return;

    const chart = createChart(chartContainerRef.current, {
      width: 900,
      height: 400,
      layout: {
        background: { color: "#111827" },
        textColor: "#D1D5DB",
      },
      grid: {
        vertLines: { color: "#1F2937" },
        horzLines: { color: "#1F2937" },
      },
    });

    const candlestickSeries = chart.addCandlestickSeries();

    candlestickSeries.setData(data);

    chart.timeScale().fitContent();

    return () => {
      chart.remove();
    };
  }, [data]);

  return (
    <div
      ref={chartContainerRef}
      className="w-full rounded-xl overflow-hidden"
    />
  );
}