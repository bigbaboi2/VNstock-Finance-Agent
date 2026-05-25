import React, { useEffect, useRef, useState } from 'react';
import { init, dispose, registerIndicator, registerOverlay } from 'klinecharts';
import {
  Pencil, MoveHorizontal, Baseline, Type, Trash2,
  Settings2, ChevronDown, Check, BarChart2, Clock, RefreshCw,
  ChevronLeft, ChevronRight, Minus, ArrowRight, Square, Circle,
  SlidersHorizontal, TrendingUp, MousePointer
} from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════════
   REGISTER OVERLAY: 
═══════════════════════════════════════════════════════════════════ */
registerOverlay({
  name: 'omni_text',
  totalStep: 2,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  createFigures: ({ overlay, coordinates }) => {
    const textStr = overlay.extendData;
    if (!textStr || !coordinates?.length || coordinates[0]?.x === undefined) return [];
    return [{
      type: 'text',
      attrs: { x: coordinates[0].x, y: coordinates[0].y, text: textStr, align: 'left', baseline: 'top' },
      styles: {
        color: overlay.styles?.text?.color || '#FF9600',
        size: overlay.styles?.text?.size || 14,
        family: 'Inter, sans-serif',
        weight: 'bold'
      }
    }];
  }
});

/* ═══════════════════════════════════════════════════════════════════
   REGISTER INDICATOR: TV_VOL_OVERLAY  
═══════════════════════════════════════════════════════════════════ */
registerIndicator({
  name: 'TV_VOL_OVERLAY',
  shortName: 'VOL',
  calcParams: [true],
  calc: (dataList) => dataList.map(k => ({ volume: k.volume || 0, open: k.open || 0, close: k.close || 0 })),
  draw: ({ ctx, bounding, visibleRange, indicator, xAxis, yAxis }) => {
    const { height } = bounding;
    const dataList = indicator.result;
    const dataLen = dataList.length;
    if (dataLen === 0) return true;
    const showVol = indicator.calcParams[0];
    const p0 = xAxis.convertToPixel(0);
    const p1 = xAxis.convertToPixel(1);
    const barWidth = Math.max(Math.abs(p1 - p0) * 0.8, 1);
    let maxVol = 0;
    for (let i = visibleRange.from; i < visibleRange.to; i++) {
      if (dataList[i]?.volume > maxVol) maxVol = dataList[i].volume;
    }
    const latestData = dataList[dataLen - 1];
    let edgeIndex = Math.min(visibleRange.to - 1, dataLen - 1);
    const edgeData = dataList[edgeIndex];
    if (latestData && edgeData && yAxis) {
      window.__omniduck_dual_tags = {
        showVol,
        latest: {
          price: latestData.close,
          priceY: yAxis.convertToPixel(latestData.close),
          vol: latestData.volume || 0,
          volY: height - (maxVol > 0 ? ((latestData.volume || 0) / maxVol) * (height * 0.25) : 0),
          isUp: latestData.close >= latestData.open
        },
        edge: {
          isLatest: edgeIndex === dataLen - 1,
          price: edgeData.close,
          priceY: yAxis.convertToPixel(edgeData.close),
          vol: edgeData.volume || 0,
          volY: height - (maxVol > 0 ? ((edgeData.volume || 0) / maxVol) * (height * 0.25) : 0),
          isUp: edgeData.close >= edgeData.open
        }
      };
      window.dispatchEvent(new Event('omniduck_update_dual_tags'));
    }
    if (showVol && maxVol > 0) {
      for (let i = visibleRange.from; i < visibleRange.to; i++) {
        const data = dataList[i];
        if (!data?.volume) continue;
        const isUp = data.close >= data.open;
        const x = xAxis.convertToPixel(i);
        const barHeight = (data.volume / maxVol) * (height * 0.25);
        const y = height - Math.max(barHeight, 1);
        ctx.fillStyle = isUp ? 'rgba(8, 153, 129, 0.35)' : 'rgba(242, 54, 69, 0.35)';
        ctx.fillRect(x - barWidth / 2, y, barWidth, Math.max(barHeight, 1));
      }
    }
    return true;
  },
  createTooltipDataSource: () => ({ name: '', calcParamsText: '', values: [] })
});

/* ═══════════════════════════════════════════════════════════════════
   REGISTER INDICATOR:  
═══════════════════════════════════════════════════════════════════ */
registerIndicator({
  name: 'CUSTOM_SAR',
  shortName: 'SAR',
  calcParams: [0.02, 0.2],
  calc: (dataList, indicator) => {
    const [step, maxAf] = indicator.calcParams;
    let af = step, ep = 0, sar = 0, bull = true;
    return dataList.map((d, i) => {
      if (i === 0) { sar = d.low; ep = d.high; return { sar: undefined, bull: true }; }
      const prevSar = sar;
      if (bull) {
        sar = prevSar + af * (ep - prevSar);
        sar = Math.min(sar, dataList[i - 1].low, i > 1 ? dataList[i - 2].low : sar);
        if (d.low < sar) { bull = false; sar = ep; ep = d.low; af = step; }
        else if (d.high > ep) { ep = d.high; af = Math.min(af + step, maxAf); }
      } else {
        sar = prevSar + af * (ep - prevSar);
        sar = Math.max(sar, dataList[i - 1].high, i > 1 ? dataList[i - 2].high : sar);
        if (d.high > sar) { bull = true; sar = ep; ep = d.high; af = step; }
        else if (d.low < ep) { ep = d.low; af = Math.min(af + step, maxAf); }
      }
      return { sar, bull };
    });
  },
  draw: ({ ctx, bounding, visibleRange, indicator, xAxis, yAxis }) => {
    const data = indicator.result;
    for (let i = visibleRange.from; i < visibleRange.to; i++) {
      const d = data[i];
      if (!d || d.sar === undefined) continue;
      const x = xAxis.convertToPixel(i);
      const y = yAxis.convertToPixel(d.sar);
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);  
      ctx.fillStyle = d.bull ? '#00D4E8' : '#FF6B6B';
      ctx.fill();
    }
    return true;
  },
  createTooltipDataSource: ({ indicator }) => ({
    name: 'SAR',
    calcParamsText: '',
    values: indicator.result.length ? [{ title: 'SAR', value: indicator.result[indicator.result.length - 1]?.sar?.toFixed(2) ?? '-' }] : []
  })
});

/* ═══════════════════════════════════════════════════════════════════
   REGISTER INDICATOR:  
═══════════════════════════════════════════════════════════════════ */
registerIndicator({
  name: 'BOLL_CUSTOM',
  shortName: 'BOLL',
  calcParams: [20, 2],
  calc: (dataList, indicator) => {
    const [period, multiplier] = indicator.calcParams;
    return dataList.map((_, i) => {
      if (i < period - 1) return { upper: undefined, mid: undefined, lower: undefined };
      const slice = dataList.slice(i - period + 1, i + 1).map(d => d.close);
      const mid = slice.reduce((a, b) => a + b, 0) / period;
      const std = Math.sqrt(slice.reduce((a, b) => a + (b - mid) ** 2, 0) / period);
      return { upper: mid + multiplier * std, mid, lower: mid - multiplier * std };
    });
  },
  draw: ({ ctx, bounding, visibleRange, indicator, xAxis, yAxis }) => {
    const data = indicator.result;
    const pts = [];
    for (let i = visibleRange.from; i < visibleRange.to; i++) {
      const d = data[i];
      if (!d?.upper) continue;
      pts.push({
        x: xAxis.convertToPixel(i),
        upper: yAxis.convertToPixel(d.upper),
        mid: yAxis.convertToPixel(d.mid),
        lower: yAxis.convertToPixel(d.lower)
      });
    }
    if (pts.length < 2) return true;

    // Vùng sương giữa 2 dải
    ctx.beginPath();
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.upper) : ctx.lineTo(p.x, p.upper));
    [...pts].reverse().forEach(p => ctx.lineTo(p.x, p.lower));
    ctx.closePath();
    ctx.fillStyle = 'rgba(33, 150, 243, 0.07)';
    ctx.fill();

     ctx.beginPath();
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.upper) : ctx.lineTo(p.x, p.upper));
    ctx.strokeStyle = '#2196F3'; ctx.lineWidth = 1.2; ctx.setLineDash([]); ctx.stroke();

     ctx.beginPath();
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.lower) : ctx.lineTo(p.x, p.lower));
    ctx.strokeStyle = '#2196F3'; ctx.lineWidth = 1.2; ctx.stroke();

     ctx.beginPath();
    ctx.setLineDash([5, 4]);
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.mid) : ctx.lineTo(p.x, p.mid));
    ctx.strokeStyle = '#FF9600'; ctx.lineWidth = 1; ctx.stroke();
    ctx.setLineDash([]);

    return true;
  },
  createTooltipDataSource: ({ indicator }) => {
    const last = indicator.result[indicator.result.length - 1];
    return {
      name: 'BOLL', calcParamsText: '',
      values: last?.upper != null ? [
        { title: 'UP', value: last.upper.toFixed(2) },
        { title: 'MID', value: last.mid.toFixed(2) },
        { title: 'DN', value: last.lower.toFixed(2) }
      ] : []
    };
  }
});

/* ═══════════════════════════════════════════════════════════════════
   LABELS + INDICATOR META
═══════════════════════════════════════════════════════════════════ */
const MAIN_INDICATORS = [
  { key: 'MA',         label: 'MA — Đường trung bình' },
  { key: 'EMA',        label: 'EMA — EMA mũ' },
  { key: 'BOLL_CUSTOM',label: 'BOLL — Bollinger Bands' },
  { key: 'CUSTOM_SAR', label: 'SAR — Parabolic SAR' },
];
const SUB_INDICATORS = [
  { key: 'VOL',  label: 'Volume' },
  { key: 'MACD', label: 'MACD' },
  { key: 'RSI',  label: 'RSI' },
  { key: 'KDJ',  label: 'KDJ / Stochastic' },
  { key: 'CCI',  label: 'CCI' },
  { key: 'ATR',  label: 'ATR' },
  { key: 'OBV',  label: 'OBV' },
  { key: 'WR',   label: 'Williams %R' },
];

const DRAW_TOOLS = [
  { name: 'select',              icon: MousePointer, title: 'Chọn / Di chuyển' },
  { name: 'segment',             icon: Pencil,       title: 'Trendline (Đoạn thẳng)' },
  { name: 'straightLine',        icon: MoveHorizontal, title: 'Đường thẳng vô hạn' },
  { name: 'ray',                 icon: ArrowRight,   title: 'Ray (Nửa đường thẳng)' },
  { name: 'horizontalStraightLine', icon: Minus,     title: 'Đường ngang' },
  { name: 'fibonacciLine',       icon: Baseline,     title: 'Fibonacci Retracement' },
  { name: 'rect',                icon: Square,       title: 'Hình chữ nhật' },
  { name: 'circle',              icon: Circle,       title: 'Hình tròn / Ellipse' },
  { name: 'parallelStraightLine',icon: TrendingUp,   title: 'Kênh song song' },
  { name: 'omni_text',           icon: Type,         title: 'Chèn chữ lên chart' },
];

/* ═══════════════════════════════════════════════════════════════════
   COMPONENT
═══════════════════════════════════════════════════════════════════ */
export default function TradingChart({ data, theme, onIntervalChange, currentInterval }) {
  const chartContainerRef = useRef(null);
  const chartInstance     = useRef(null);
  const topBarRef         = useRef(null);
  const priceLabelLatestRef = useRef(null);
  const volLabelLatestRef   = useRef(null);
  const priceLabelEdgeRef   = useRef(null);
  const volLabelEdgeRef     = useRef(null);
  const isFinishingRef      = useRef(false);

  const [interval, setInterval]                 = useState(currentInterval || '1 ngày');
  const [showIntervalMenu, setShowIntervalMenu]   = useState(false);
  const [showTypeMenu, setShowTypeMenu]           = useState(false);
  const [showIndicatorMenu, setShowIndicatorMenu] = useState(false);
  const [showStrokePanel, setShowStrokePanel]     = useState(false);
  const [chartType, setChartType]                 = useState('candle_solid');
  const [activeMain, setActiveMain]               = useState([]);
  const [activeSub, setActiveSub]                 = useState(['VOL']);
  const [activeOverlay, setActiveOverlay]         = useState(null);
  const [inlineInput, setInlineInput]             = useState(null);
  const [textValue, setTextValue]                 = useState('');
  const [overlayColor, setOverlayColor]           = useState('#FF9600');
  const [strokeSize, setStrokeSize]               = useState(2);
  const [strokeStyle, setStrokeStyle]             = useState('solid');
  const [activeTool, setActiveTool]               = useState('select');

  const isDark = theme === 'dark';

  /* ── helpers ─────────────────────────────────────────── */
  const closeAllMenus = () => { setShowIntervalMenu(false); setShowTypeMenu(false); setShowIndicatorMenu(false); setShowStrokePanel(false); };

  const handleScrollLeft  = () => chartInstance.current?.scrollByDistance(chartInstance.current.getBarSpace());
  const handleScrollRight = () => chartInstance.current?.scrollByDistance(-chartInstance.current.getBarSpace());
  const handleResetChart  = () => { chartInstance.current?.setBarSpace(6); chartInstance.current?.scrollToRealTime(); };

  const handleFinishText = (rawText) => {
    if (isFinishingRef.current || !inlineInput?.id) return;
    isFinishingRef.current = true;
    const finalText = rawText?.trim();
    if (finalText) {
      chartInstance.current?.overrideOverlay({
        id: inlineInput.id,
        extendData: finalText,
        styles: { text: { color: overlayColor, size: strokeSize + 12, family: 'Inter, sans-serif', weight: 'bold' } }
      });
      setActiveOverlay({ id: inlineInput.id });
    } else {
      chartInstance.current?.removeOverlay(inlineInput.id);
    }
    requestAnimationFrame(() => { setInlineInput(null); setTextValue(''); isFinishingRef.current = false; });
  };

  /* ── activate a drawing tool ─────────────────────────── */
  const activateDrawTool = (toolName) => {
    setActiveTool(toolName);
    if (toolName === 'select') return; 

    chartInstance.current?.createOverlay({
      name: toolName,
      lock: false,
      styles: {
        line:    { color: overlayColor, size: strokeSize, style: strokeStyle },
        polygon: { style: 'stroke_fill', color: overlayColor, fill: { color: `${overlayColor}18` } },
        point:   { color: overlayColor, borderColor: `${overlayColor}50`, activeColor: overlayColor, activeBorderColor: `${overlayColor}99` },
        text:    { color: overlayColor, size: 14, family: 'Inter, sans-serif', weight: 'bold' }
      },
      onDrawEnd: (event) => {
        // reset to select mode after draw
        setActiveTool('select');
        if (toolName !== 'omni_text') return true;
        if (!event?.overlay) return true;
        const overlay = event.overlay;
        chartInstance.current?.overrideOverlay({ id: overlay.id, extendData: ' ' });
        const px = chartInstance.current?.convertToPixel(overlay.points, { paneId: 'candle_pane' });
        if (!px?.length) return true;
        setInlineInput({ id: overlay.id, x: px[0].x, y: px[0].y });
        setTextValue('');
        isFinishingRef.current = false;
        return true;
      },
      onSelected: (info) => { if (info) setActiveOverlay({ id: info.overlay?.id || info.id }); },
      onDeselected: () => setActiveOverlay(null)
    });
  };

  /* ── toggle indicator ────────────────────────────────── */
  const toggleIndicator = (name, isMain) => {
    if (!chartInstance.current) return;
    if (isMain) {
      if (activeMain.includes(name)) {
        chartInstance.current.removeIndicator('candle_pane', name);
        setActiveMain(prev => prev.filter(n => n !== name));
      } else {
        chartInstance.current.createIndicator(name, true, { id: 'candle_pane' });
        setActiveMain(prev => [...prev, name]);
      }
    } else {
      if (activeSub.includes(name)) {
        if (name === 'VOL') {
          chartInstance.current.overrideIndicator({ name: 'TV_VOL_OVERLAY', calcParams: [false] }, 'candle_pane');
        } else {
          chartInstance.current.removeIndicator(`pane_${name}`);
        }
        setActiveSub(prev => prev.filter(n => n !== name));
      } else {
        if (name === 'VOL') {
          chartInstance.current.overrideIndicator({ name: 'TV_VOL_OVERLAY', calcParams: [true] }, 'candle_pane');
        } else {
          chartInstance.current.createIndicator(name, false, { id: `pane_${name}`, height: 120 });
        }
        setActiveSub(prev => [...prev, name]);
      }
    }
  };

  /* ══════════════════════════════════════════════════════
     EFFECT: init + setStyles (re-run on theme / chartType)
  ══════════════════════════════════════════════════════ */
  useEffect(() => {
    if (!chartContainerRef.current) return;
    if (!chartInstance.current) {
      chartInstance.current = init(chartContainerRef.current);
      chartInstance.current.createIndicator({ name: 'TV_VOL_OVERLAY', calcParams: [true] }, true, { id: 'candle_pane' });
      activeSub.forEach(ind => {
        if (ind !== 'VOL') chartInstance.current.createIndicator(ind, false, { id: `pane_${ind}`, height: 120 });
      });
    }
    const chart = chartInstance.current;
    const upColor   = '#089981';
    const downColor = '#F23645';
    const noChangeColor = upColor;
    const gridColor = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.10)';

    chart.setCustomApi({
      formatDate: (_, timestamp, format, type) => {
        const d   = new Date(timestamp);
        const dd  = String(d.getDate()).padStart(2, '0');
        const mm  = d.getMonth() + 1;
        const mms = String(mm).padStart(2, '0');
        const yy  = String(d.getFullYear()).slice(2);
        const yyyy = d.getFullYear();
        const hh  = String(d.getHours()).padStart(2, '0');
        const min = String(d.getMinutes()).padStart(2, '0');

        if (type === 2 || type === 'xAxis') {
          
          switch (format) {
            case 'YYYY':        return `${yyyy}`;
            case 'YYYY-MM':     return `T${mm}/${yy}`;
            case 'MM-DD':       return `${dd}/${mms}`;
            case 'YYYY-MM-DD':  return `${dd}/${mms}/${yy}`;
            case 'HH:mm':       return `${hh}:${min}`;
            case 'MM-DD HH:mm': return `${dd}/${mms} ${hh}:${min}`;
            default:            return `${dd}/${mms}`;
          }
        }
        // crosshair / tooltip
        const isDaily = (hh === '07' && min === '00') || (hh === '00' && min === '00');
        return isDaily
          ? `${dd} Tháng ${mm}, ${yyyy}`
          : `${dd}/${mms}/${yyyy} ${hh}:${min}`;
      }
    });

    chart.setStyles({
      grid: {
        show: true,
        horizontal: { show: true, color: gridColor, style: 'solid', size: 1 },
        vertical:   { show: true, color: gridColor, style: 'solid', size: 1 }
      },
      separator: { size: 1, color: gridColor, fill: false, activeBackgroundColor: 'transparent' },
      candle: {
        type: chartType === 'heikin_ashi' ? 'candle_solid' : chartType,
        bar: {
          upColor, downColor, noChangeColor,
          upBorderColor: upColor, downBorderColor: downColor, noChangeBorderColor: noChangeColor,
          upWickColor:   upColor, downWickColor:   downColor, noChangeWickColor:   noChangeColor
        },
        margin:    { top: 0.2, bottom: 0.05 },
        priceMark: { show: false },
        tooltip:   { showRule: 'none' }
      },
      indicator: {
        ohlc: { upColor, downColor },
        bars: [{ upColor, downColor, noChangeColor }],
        lines: [
          { style: 'solid', size: 1.5, color: '#FF9600' },
          { style: 'solid', size: 1.5, color: '#9D65C9' },
          { style: 'solid', size: 1.5, color: '#2196F3' },
          { style: 'solid', size: 1.5, color: '#E11D74' },
          { style: 'solid', size: 1.5, color: '#01C5C4' }
        ],
        tooltip: {
          showRule: 'always',
          text: { family: 'Inter, sans-serif', size: 12, color: isDark ? '#9CA3AF' : '#4B5563', weight: '600' }
        }
      },
      xAxis: {
        show: true, height: 32,
        axisLine: { color: isDark ? '#374151' : '#D1D5DB' },
        tickText: { color: isDark ? '#9CA3AF' : '#6B7280', family: 'Inter, sans-serif', size: 11, weight: '500' }
      },
      yAxis: {
        show: true, width: 60,
        axisLine: { color: isDark ? '#374151' : '#D1D5DB' },
        tickText: { color: isDark ? '#9CA3AF' : '#6B7280', family: 'Inter, sans-serif', size: 11, weight: '500' }
      },
      crosshair: {
        show: true,
        horizontal: {
          line: { show: true, style: 'dashed', color: isDark ? '#4B5563' : '#9CA3AF' },
          text: { show: true, color: '#fff', size: 11, family: 'Inter, sans-serif', paddingLeft: 4, paddingRight: 4, paddingTop: 3, paddingBottom: 3, backgroundColor: isDark ? '#374151' : '#6B7280' }
        },
        vertical: {
          line: { show: true, style: 'dashed', color: isDark ? '#4B5563' : '#9CA3AF' },
          text: { show: true, color: '#fff', size: 11, family: 'Inter, sans-serif', paddingLeft: 4, paddingRight: 4, paddingTop: 3, paddingBottom: 3, backgroundColor: isDark ? '#374151' : '#6B7280' }
        }
      },
      overlay: {
        point: {
          color: '#df8d1a', borderColor: 'rgba(255,150,0,0.3)', borderSize: 3, radius: 3,
          activeColor: '#FF9600', activeBorderColor: 'rgba(255,150,0,0.5)', activeBorderSize: 3, activeRadius: 5
        },
        line:    { color: '#FF9600', size: 2 },
        polygon: { style: 'stroke_fill', color: '#FF9600', fill: { color: 'rgba(255,150,0,0.08)' } }
      }
    });

    chart.subscribeAction('onScroll', () => setActiveOverlay(null));
    chart.subscribeAction('onZoom',   () => setActiveOverlay(null));
  }, [theme, isDark, chartType]);

  /* ══════════════════════════════════════════════════════
     EFFECT: resize observer + cleanup
  ══════════════════════════════════════════════════════ */
  useEffect(() => {
    const ro = new ResizeObserver(() => { if (chartInstance.current) chartInstance.current.resize(); });
    if (chartContainerRef.current) ro.observe(chartContainerRef.current);
    return () => {
      ro.disconnect();
      if (chartInstance.current && chartContainerRef.current) {
        dispose(chartContainerRef.current);
        chartInstance.current = null;
      }
    };
  }, []);

  /* ══════════════════════════════════════════════════════
     EFFECT: load data
  ══════════════════════════════════════════════════════ */
  useEffect(() => {
    if (!chartInstance.current || !data?.length) return;

    const formatted = data.map(d => {
      let ts = 0;
      let tv = d.time || d.date;
      if (tv != null) {
        if (typeof tv === 'string' && !isNaN(tv) && tv.trim()) tv = Number(tv);
        if (typeof tv === 'number') {
          ts = tv > 9999999999 ? tv : tv * 1000;
        } else if (typeof tv === 'string') {
          if (tv.includes('/')) {
            const parts = tv.split(' ')[0].split('/');
            if (parts.length === 3) {
              ts = parts[0].length === 4
                ? new Date(parts[0], parseInt(parts[1]) - 1, parts[2]).getTime()
                : new Date(parts[2], parseInt(parts[1]) - 1, parts[0]).getTime();
            }
          } else {
            ts = new Date(tv.includes(' ') && !tv.includes('T') ? tv.replace(' ', 'T') : tv).getTime();
          }
        }
      }
      return {
        timestamp: ts,
        open: Number(d.open) || 0, high: Number(d.high) || 0,
        low:  Number(d.low)  || 0, close: Number(d.close) || 0,
        volume: Number(d.value) || Number(d.volume) || 0
      };
    }).filter(d => !isNaN(d.timestamp) && d.timestamp > 0).sort((a, b) => a.timestamp - b.timestamp);

    let display = formatted;
    if (chartType === 'heikin_ashi') {
      display = [];
      for (let i = 0; i < formatted.length; i++) {
        const c = formatted[i];
        if (i === 0) { display.push({ ...c }); continue; }
        const p = display[i - 1];
        const haClose = (c.open + c.high + c.low + c.close) / 4;
        const haOpen  = (p.open + p.close) / 2;
        display.push({ ...c, open: haOpen, high: Math.max(c.high, haOpen, haClose), low: Math.min(c.low, haOpen, haClose), close: haClose });
      }
    }

    const cur = chartInstance.current.getDataList();
    const isNew = !cur.length
      || (cur[0] && display[0] && cur[0].timestamp !== display[0].timestamp)
      || Math.abs(cur.length - display.length) > 5;

    if (isNew) chartInstance.current.applyNewData(display);
    else chartInstance.current.updateData(display[display.length - 1]);

    window.dispatchEvent(new Event('omniduck_update_dual_tags'));
  }, [data, chartType]);

  /* ══════════════════════════════════════════════════════
     EFFECT: top bar OHLCV 
  ══════════════════════════════════════════════════════ */
  useEffect(() => {
    const updateTopBar = (target) => {
      if (!topBarRef.current) return;
      let d = target;
      if (!d) {
        const list = chartInstance.current?.getDataList();
        if (list?.length) d = list[list.length - 1]; else return;
      }
      const color    = d.close >= d.open ? '#089981' : '#F23645';
      const lblColor = isDark ? '#9CA3AF' : '#6B7280';
      const valColor = isDark ? '#F1F5F9' : '#111827';
      const bg       = isDark ? 'rgba(11,15,20,0.7)' : 'rgba(255,255,255,0.85)';
      const dt = new Date(d.timestamp);
      const hh = String(dt.getHours()).padStart(2,'0');
      const mn = String(dt.getMinutes()).padStart(2,'0');
      const isDaily = (hh === '07' && mn === '00') || (hh === '00' && mn === '00');
      const timeStr = isDaily
        ? `${String(dt.getDate()).padStart(2,'0')} Tháng ${dt.getMonth()+1}, ${dt.getFullYear()}`
        : `${String(dt.getDate()).padStart(2,'0')} Tháng ${dt.getMonth()+1}, ${dt.getFullYear()} ${hh}:${mn}`;
      let vol = d.volume;
      const volStr = vol >= 1e6 ? (vol/1e6).toFixed(2)+'M' : vol >= 1e3 ? (vol/1e3).toFixed(1)+'K' : String(vol);
      topBarRef.current.innerHTML = `
        <div style="display:flex;gap:14px;font-family:Inter,sans-serif;background:${bg};padding:5px 12px;border-radius:6px;backdrop-filter:blur(4px);box-shadow:0 1px 3px rgba(0,0,0,0.12);">
          <div><span style="color:${lblColor}">Time: </span><span style="color:${valColor}">${timeStr}</span></div>
          <div><span style="color:${lblColor}">O: </span><span style="color:${color}">${d.open.toFixed(2)}</span></div>
          <div><span style="color:${lblColor}">H: </span><span style="color:${color}">${d.high.toFixed(2)}</span></div>
          <div><span style="color:${lblColor}">L: </span><span style="color:${color}">${d.low.toFixed(2)}</span></div>
          <div><span style="color:${lblColor}">C: </span><span style="color:${color}">${d.close.toFixed(2)}</span></div>
          <div><span style="color:${lblColor}">Vol: </span><span style="color:${color}">${volStr}</span></div>
        </div>`;
    };
    const onCross = (p) => {
      if (p?.dataIndex != null) {
        const list = chartInstance.current?.getDataList();
        if (list) updateTopBar(list[p.dataIndex]);
      } else updateTopBar();
    };
    if (chartInstance.current) chartInstance.current.subscribeAction('onCrosshairChange', onCross);
    updateTopBar();
    return () => { if (chartInstance.current) chartInstance.current.unsubscribeAction('onCrosshairChange', onCross); };
  }, [isDark, data]);

  /* ══════════════════════════════════════════════════════
     EFFECT: dual price/vol edge labels
  ══════════════════════════════════════════════════════ */
  useEffect(() => {
    const fmt  = (v) => v >= 1e6 ? (v/1e6).toFixed(2)+'M' : v >= 1e3 ? (v/1e3).toFixed(1)+'K' : String(v);
    const fmtP = (p) => Number.isInteger(p) ? p.toString() : p.toFixed(2);
    const update = () => {
      const info = window.__omniduck_dual_tags;
      if (!info || !priceLabelLatestRef.current) return;
      const { latest, edge, showVol } = info;
      const cL = latest.isUp ? '#089981' : '#F23645';
      priceLabelLatestRef.current.style.cssText += `;display:block;top:${latest.priceY-11}px;background:${cL};color:#fff`;
      priceLabelLatestRef.current.innerText = fmtP(latest.price);
      if (showVol) {
        volLabelLatestRef.current.style.cssText += `;display:block;top:${latest.volY-11}px;background:${cL};color:#fff`;
        volLabelLatestRef.current.innerText = fmt(latest.vol);
      } else { volLabelLatestRef.current.style.display = 'none'; }
      if (priceLabelEdgeRef.current) {
        if (edge.isLatest) {
          priceLabelEdgeRef.current.style.display = 'none';
          volLabelEdgeRef.current.style.display   = 'none';
        } else {
          const cE = edge.isUp ? '#089981' : '#F23645';
          const bg = isDark ? '#0B0F14' : '#fff';
          priceLabelEdgeRef.current.style.cssText += `;display:block;top:${edge.priceY-11}px;background:${bg};color:${cE};border:1px solid ${cE}`;
          priceLabelEdgeRef.current.innerText = fmtP(edge.price);
          if (showVol) {
            volLabelEdgeRef.current.style.cssText += `;display:block;top:${edge.volY-11}px;background:${bg};color:${cE};border:1px solid ${cE}`;
            volLabelEdgeRef.current.innerText = fmt(edge.vol);
          } else { volLabelEdgeRef.current.style.display = 'none'; }
        }
      }
    };
    window.addEventListener('omniduck_update_dual_tags', update);
    return () => window.removeEventListener('omniduck_update_dual_tags', update);
  }, [isDark]);

  /* ══════════════════════════════════════════════════════
     EFFECT: keyboard delete selected overlay
  ══════════════════════════════════════════════════════ */
  useEffect(() => {
    const onKey = (e) => {
      if (document.activeElement?.tagName === 'INPUT') return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && activeOverlay) {
        chartInstance.current?.removeOverlay(activeOverlay.id);
        setActiveOverlay(null);
      }
      if (e.key === 'Escape') closeAllMenus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeOverlay]);

  /* ══════════════════════════════════════════════════════
     RENDER HELPERS
  ══════════════════════════════════════════════════════ */
  const menuBase = `absolute top-[calc(100%+8px)] left-0 rounded-2xl border shadow-2xl py-2 backdrop-blur-xl overflow-y-auto max-h-[400px] ${isDark ? 'bg-[#0B0F14]/97 border-white/10' : 'bg-white border-slate-200'}`;
  const btnBase  = (active) => `w-full flex items-center justify-between px-4 py-2 text-xs font-bold transition-all ${active ? 'bg-yellow-500 text-black' : (isDark ? 'text-slate-300 hover:bg-yellow-500/80 hover:text-black' : 'text-slate-700 hover:bg-yellow-500/80 hover:text-black')}`;

  /* ══════════════════════════════════════════════════════
     JSX
  ══════════════════════════════════════════════════════ */
  return (
    <div className="w-full h-full relative flex flex-col" onClick={() => closeAllMenus()}>

      {/* ── TOP TOOLBAR ─────────────────────────────────── */}
      <div
        className={`flex items-center gap-2 pb-3 mb-3 border-b shrink-0 relative z-[99] flex-wrap ${isDark ? 'border-white/10' : 'border-slate-200'}`}
        style={{ isolation: 'isolate' }}
        onClick={e => e.stopPropagation()}
      >

        {/* INTERVAL */}
        <div className="relative z-[99]">
          <button
            onClick={() => { setShowIntervalMenu(v => !v); setShowTypeMenu(false); setShowIndicatorMenu(false); setShowStrokePanel(false); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-black uppercase shadow-sm transition-all
              ${showIntervalMenu ? 'bg-blue-500 text-white border-blue-500' : (isDark ? 'bg-[#10151C] border-blue-500/30 text-blue-500 hover:bg-blue-500 hover:text-white' : 'bg-white border-slate-300 text-slate-700 hover:bg-blue-500 hover:text-white hover:border-blue-500')}`}
          >
            <Clock size={13} /> {interval} <ChevronDown size={12} className={showIntervalMenu ? 'rotate-180' : ''} />
          </button>
          {showIntervalMenu && (
            <div className={`${menuBase} w-40 z-[99]`}>
              <p className="px-4 pt-2 pb-1 text-[9px] font-black text-slate-500 uppercase">Phút</p>
              {['1 phút','3 phút','5 phút','15 phút','30 phút'].map(t => (
                <button key={t} onClick={() => { setInterval(t); setShowIntervalMenu(false); onIntervalChange?.(t); }}
                  className={btnBase(interval===t)}>{t}{interval===t&&<Check size={12}/>}</button>
              ))}
              <div className="h-px bg-white/5 my-1"/>
              <p className="px-4 pt-2 pb-1 text-[9px] font-black text-slate-500 uppercase">Giờ & Ngày</p>
              {['1 giờ','2 giờ','4 giờ','1 ngày','1 tuần','1 tháng','1 năm'].map(t => (
                <button key={t} onClick={() => { setInterval(t); setShowIntervalMenu(false); onIntervalChange?.(t); }}
                  className={btnBase(interval===t)}>{t}{interval===t&&<Check size={12}/>}</button>
              ))}
            </div>
          )}
        </div>

        {/* CHART TYPE */}
        <div className="relative z-[100]">
          <button
            onClick={() => { setShowTypeMenu(v => !v); setShowIndicatorMenu(false); setShowIntervalMenu(false); setShowStrokePanel(false); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-black uppercase shadow-sm transition-all
              ${showTypeMenu ? 'bg-emerald-500 text-white border-emerald-500' : (isDark ? 'bg-[#10151C] border-emerald-500/30 text-emerald-500 hover:bg-emerald-500 hover:text-white' : 'bg-white border-slate-300 text-slate-700 hover:bg-emerald-500 hover:text-white hover:border-emerald-500')}`}
          >
            <BarChart2 size={13} />
            {{ candle_solid:'Nến Đặc', candle_up_stroke:'Nến Rỗng', candle_stroke:'Nến Viền', ohlc:'Hình Thanh', area:'Vùng', heikin_ashi:'Heikin Ashi' }[chartType] || 'Nến'}
            <ChevronDown size={12} className={showTypeMenu ? 'rotate-180' : ''} />
          </button>
          {showTypeMenu && (
            <div className={`${menuBase} w-48 z-[100]`}>
              {[
                { id:'candle_solid',    label:'Nến Đặc (Solid)' },
                { id:'candle_up_stroke',label:'Nến Rỗng (Hollow)' },
                { id:'candle_stroke',   label:'Nến Viền (Stroke)' },
                { id:'ohlc',            label:'Hình Thanh (Bar)' },
                { id:'area',            label:'Biểu đồ Vùng' },
                { id:'heikin_ashi',     label:'Heikin Ashi' },
              ].map(tp => (
                <button key={tp.id} onClick={() => { setChartType(tp.id); setShowTypeMenu(false); }}
                  className={`w-full flex items-center justify-between px-4 py-2 text-xs font-bold transition-all ${chartType===tp.id ? 'bg-emerald-500 text-white' : (isDark ? 'text-slate-300 hover:bg-emerald-500/80 hover:text-white' : 'text-slate-700 hover:bg-emerald-500/80 hover:text-white')}`}>
                  {tp.label}{chartType===tp.id&&<Check size={12}/>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* INDICATORS */}
        <div className="relative z-[100]">
          <button
            onClick={() => { setShowIndicatorMenu(v => !v); setShowTypeMenu(false); setShowIntervalMenu(false); setShowStrokePanel(false); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-black uppercase shadow-sm transition-all
              ${showIndicatorMenu ? 'bg-yellow-500 text-black border-yellow-500' : (isDark ? 'bg-[#10151C] border-yellow-500/30 text-yellow-500 hover:bg-yellow-500 hover:text-black' : 'bg-white border-slate-300 text-slate-700 hover:bg-yellow-500 hover:text-black hover:border-yellow-500')}`}
          >
            <Settings2 size={13} /> Chỉ Báo <ChevronDown size={12} className={showIndicatorMenu ? 'rotate-180' : ''} />
          </button>
          {showIndicatorMenu && (
            <div className={`${menuBase} w-64 z-[100]`}>
              <p className="px-4 pt-2 pb-1 text-[9px] font-black text-slate-500 uppercase">Chỉ báo chồng nến</p>
              {MAIN_INDICATORS.map(ind => (
                <button key={ind.key} onClick={() => toggleIndicator(ind.key, true)} className={btnBase(activeMain.includes(ind.key))}>
                  {ind.label}{activeMain.includes(ind.key)&&<Check size={12}/>}
                </button>
              ))}
              <div className="h-px bg-white/5 my-2"/>
              <p className="px-4 pb-1 text-[9px] font-black text-slate-500 uppercase">Chỉ báo phụ</p>
              {SUB_INDICATORS.map(ind => (
                <button key={ind.key} onClick={() => toggleIndicator(ind.key, false)} className={btnBase(activeSub.includes(ind.key))}>
                  {ind.label}{activeSub.includes(ind.key)&&<Check size={12}/>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* COLOR + STROKE PANEL */}
        <div className={`ml-auto flex items-center gap-2 px-3 py-1.5 rounded-xl border backdrop-blur-md shadow-sm ${isDark ? 'bg-[#10151C]/95 border-white/10' : 'bg-white border-slate-200'}`}>
          <span className={`text-[9px] font-black uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Màu:</span>
          {[
            '#FF9600','#089981','#F23645','#2196F3','#EAB308','#E11D74','#FFFFFF'
          ].map(hex => (
            <button key={hex} onClick={() => setOverlayColor(hex)}
              className={`w-5 h-5 rounded-full border-2 transition-all hover:scale-110 ${overlayColor===hex ? 'ring-1 ring-offset-1' : ''}`}
              style={{ backgroundColor: hex, borderColor: overlayColor===hex ? (isDark?'#fff':'#1f2937') : 'transparent' }}
            />
          ))}
          {/* Stroke settings toggle */}
          <div className="relative ml-1">
            <button
              onClick={(e) => { e.stopPropagation(); setShowStrokePanel(v => !v); }}
              title="Tùy chỉnh nét vẽ"
              className={`p-1 rounded-lg transition-all ${showStrokePanel ? 'bg-yellow-500 text-black' : (isDark ? 'text-slate-400 hover:text-yellow-400' : 'text-slate-500 hover:text-yellow-600')}`}
            >
              <SlidersHorizontal size={14} />
            </button>
            {showStrokePanel && (
              <div
                className={`absolute top-[calc(100%+8px)] right-0 w-52 p-3 rounded-2xl shadow-2xl border z-[200] ${isDark ? 'bg-[#0B0F14]/97 border-white/10' : 'bg-white border-slate-200'}`}
                onClick={e => e.stopPropagation()}
              >
                <p className={`text-[9px] font-black uppercase mb-2 ${isDark?'text-slate-500':'text-slate-400'}`}>Độ dày nét</p>
                <div className="flex gap-2 mb-3">
                  {[1,2,3,4].map(s => (
                    <button key={s} onClick={() => setStrokeSize(s)}
                      className={`flex-1 flex flex-col items-center gap-1 py-1.5 rounded-lg text-[10px] font-black transition-all ${strokeSize===s ? 'bg-yellow-500 text-black' : (isDark?'text-slate-400 hover:bg-white/5':'text-slate-500 hover:bg-slate-100')}`}>
                      <div style={{ height:`${s+1}px`, width:'28px', background:'currentColor', borderRadius:1 }}/>
                      {s}px
                    </button>
                  ))}
                </div>
                <p className={`text-[9px] font-black uppercase mb-2 ${isDark?'text-slate-500':'text-slate-400'}`}>Kiểu nét</p>
                {[
                  { val:'solid',  label:'━━━ Liền' },
                  { val:'dashed', label:'╌╌╌ Đứt khúc' },
                  { val:'dotted', label:'···  Chấm' },
                ].map(s => (
                  <button key={s.val} onClick={() => setStrokeStyle(s.val)}
                    className={`w-full px-3 py-1.5 rounded-lg text-xs font-bold text-left mb-1 transition-all ${strokeStyle===s.val ? 'bg-yellow-500 text-black' : (isDark?'text-slate-400 hover:bg-white/5':'text-slate-600 hover:bg-slate-100')}`}>
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── CHART + SIDEBAR ─────────────────────────────── */}
      <div className="flex-1 flex flex-row relative min-h-0 rounded-2xl overflow-hidden border border-white/5">

        {/* SIDEBAR DRAWING TOOLS */}
        <div className={`w-12 shrink-0 border-r flex flex-col items-center py-3 gap-1 z-[50] relative overflow-y-auto ${isDark ? 'bg-black/25 border-white/5' : 'bg-slate-50 border-slate-200'}`}>
          {DRAW_TOOLS.map(tool => {
            const Icon = tool.icon;
            const isActive = activeTool === tool.name;
            return (
              <button
                key={tool.name}
                title={tool.title}
                onClick={(e) => { e.stopPropagation(); activateDrawTool(tool.name); }}
                className={`w-9 h-9 flex items-center justify-center rounded-xl transition-all
                  ${isActive
                    ? 'bg-yellow-500 text-black shadow-md shadow-yellow-500/30'
                    : (isDark ? 'text-slate-500 hover:bg-white/8 hover:text-yellow-400' : 'text-slate-500 hover:bg-yellow-400/20 hover:text-yellow-700')
                  }`}
              >
                <Icon size={15} />
              </button>
            );
          })}

          <div className={`w-7 h-px my-1 ${isDark?'bg-white/8':'bg-slate-200'}`}/>

          {/* Delete selected overlay */}
          <button
            title="Xóa đường đang chọn (hoặc bấm Delete)"
            onClick={() => { chartInstance.current?.removeOverlay(); setActiveOverlay(null); }}
            className={`w-9 h-9 flex items-center justify-center rounded-xl transition-all text-red-500 hover:bg-red-500 hover:text-white`}
          >
            <Trash2 size={15} />
          </button>
        </div>

        {/* KLINECHARTS CONTAINER */}
        <div className="flex-1 relative w-full h-full overflow-hidden">
          <div ref={chartContainerRef} style={{ position:'absolute', top:0, left:0, right:0, bottom:0 }} />

          {/* INLINE TEXT INPUT */}
          {inlineInput && (
            <input
              autoFocus
              type="text"
              placeholder="NHẬP CHỮ → Enter"
              value={textValue}
              onChange={e => setTextValue(e.target.value)}
              className="absolute font-black px-3 py-1.5 rounded-lg border-2 shadow-xl outline-none pointer-events-auto"
              style={{
                zIndex: 999999,
                left: inlineInput.x, top: inlineInput.y,
                transform: 'translate(-50%, -50%)',
                minWidth: '160px',
                background: isDark ? 'rgba(11,15,20,0.95)' : 'rgba(255,255,255,0.97)',
                color: overlayColor,
                borderColor: overlayColor,
                caretColor: overlayColor,
                fontSize: `${strokeSize + 12}px`,
              }}
              onBlur={() => { if (!isFinishingRef.current) handleFinishText(textValue); }}
              onKeyDown={e => {
                e.stopPropagation();
                if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
                if (e.key === 'Escape') {
                  isFinishingRef.current = true;
                  chartInstance.current?.removeOverlay(inlineInput.id);
                  setInlineInput(null); setTextValue('');
                  requestAnimationFrame(() => { isFinishingRef.current = false; });
                }
              }}
            />
          )}

          {/* SELECTED OVERLAY BAR */}
          {activeOverlay && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[99] flex items-center gap-3 bg-[#10151C]/90 backdrop-blur-md px-4 py-1.5 rounded-xl border border-white/10 shadow-2xl">
              <div className="flex items-center gap-2 text-yellow-400">
                <Pencil size={12} />
                <span className="text-[9px] font-black uppercase tracking-widest">Đã chọn đường vẽ</span>
              </div>
              <div className="w-px h-4 bg-white/10"/>
              <button
                className="flex items-center gap-1.5 bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white px-3 py-1 rounded-lg font-black text-[10px] uppercase transition-all border border-red-500/20 hover:border-red-500"
                onClick={e => { e.stopPropagation(); chartInstance.current?.removeOverlay(activeOverlay.id); setActiveOverlay(null); }}
              >
                <Trash2 size={12} /> Xóa
              </button>
            </div>
          )}

          {/* TOP BAR (OHLCV) */}
          <div ref={topBarRef} style={{ position:'absolute', top:'8px', left:'12px', zIndex:50, pointerEvents:'none', fontSize:'11px', fontWeight:'600' }} />

          {/* PRICE / VOL LABELS */}
          <div ref={priceLabelLatestRef} style={{ display:'none', position:'absolute', right:'3px', width:'42px', height:'22px', lineHeight:'22px', textAlign:'center', fontSize:'11px', fontFamily:'Inter,sans-serif', fontWeight:'700', borderRadius:'2px', zIndex:49, pointerEvents:'none', transition:'top .05s linear' }} />
          <div ref={volLabelLatestRef}   style={{ display:'none', position:'absolute', right:'3px', width:'42px', height:'22px', lineHeight:'22px', textAlign:'center', fontSize:'11px', fontFamily:'Inter,sans-serif', fontWeight:'700', borderRadius:'2px', zIndex:49, pointerEvents:'none', transition:'top .05s linear' }} />
          <div ref={priceLabelEdgeRef}   style={{ display:'none', position:'absolute', right:'3px', width:'42px', height:'22px', lineHeight:'20px', textAlign:'center', fontSize:'11px', fontFamily:'Inter,sans-serif', fontWeight:'700', borderRadius:'2px', zIndex:50, pointerEvents:'none', boxSizing:'border-box', transition:'top .05s linear' }} />
          <div ref={volLabelEdgeRef}     style={{ display:'none', position:'absolute', right:'3px', width:'42px', height:'22px', lineHeight:'20px', textAlign:'center', fontSize:'11px', fontFamily:'Inter,sans-serif', fontWeight:'700', borderRadius:'2px', zIndex:50, pointerEvents:'none', boxSizing:'border-box', transition:'top .05s linear' }} />

          {/* SCROLL NAV */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 z-[99]">
            <button onClick={handleScrollLeft}  title="Lùi" className={`p-1.5 rounded-xl border backdrop-blur-md shadow-lg transition-all ${isDark?'bg-[#10151C]/80 border-white/10 text-slate-300 hover:text-white hover:bg-slate-800':'bg-white/80 border-slate-300 text-slate-600 hover:text-black hover:bg-slate-100'}`}><ChevronLeft size={15}/></button>
            <button onClick={handleResetChart}  title="Reset" className={`p-1.5 rounded-xl border backdrop-blur-md shadow-lg transition-all ${isDark?'bg-[#10151C]/80 border-white/10 text-slate-300 hover:text-white hover:bg-slate-800':'bg-white/80 border-slate-300 text-slate-600 hover:text-black hover:bg-slate-100'}`}><RefreshCw size={15}/></button>
            <button onClick={handleScrollRight} title="Tiến" className={`p-1.5 rounded-xl border backdrop-blur-md shadow-lg transition-all ${isDark?'bg-[#10151C]/80 border-white/10 text-slate-300 hover:text-white hover:bg-slate-800':'bg-white/80 border-slate-300 text-slate-600 hover:text-black hover:bg-slate-100'}`}><ChevronRight size={15}/></button>
          </div>
        </div>
      </div>
    </div>
  );
}