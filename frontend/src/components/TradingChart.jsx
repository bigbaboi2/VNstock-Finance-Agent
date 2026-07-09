import React, { useEffect, useRef, useState, useCallback } from 'react';
import { init, dispose, registerIndicator, registerOverlay } from 'klinecharts';
import {
  Pencil, MoveHorizontal, Baseline, Trash2,
  Settings2, ChevronDown, Check, BarChart2, Clock, RefreshCw,
  ChevronLeft, ChevronRight, Minus,
  SlidersHorizontal, TrendingUp, MousePointer
} from 'lucide-react';
/* ════════════════════════════════════════════════════════════════════
   REGISTER INDICATOR: TV_VOL_OVERLAY
════════════════════════════════════════════════════════════════════ */
let _vol_registered = false;
if (!_vol_registered) {
  _vol_registered = true;
  try {
    registerIndicator({
      name: 'TV_VOL_OVERLAY',
      shortName: 'VOL',
      calcParams: [true],
      calc: (dl) => dl.map(k => ({ volume: k.volume||0, open: k.open||0, close: k.close||0 })),
      draw: ({ ctx, bounding, visibleRange, indicator, xAxis, yAxis }) => {
        const { height } = bounding;
        const dl = indicator.result;
        if (!dl.length) return true;
        const showVol = indicator.calcParams[0];
        const p0 = xAxis.convertToPixel(0), p1 = xAxis.convertToPixel(1);
        const barWidth = Math.max(Math.abs(p1 - p0) * 0.8, 1);
        let maxVol = 0;
        for (let i = visibleRange.from; i < visibleRange.to; i++) {
          if (dl[i]?.volume > maxVol) maxVol = dl[i].volume;
        }
        const latest = dl[dl.length - 1];
        const ei = Math.min(visibleRange.to - 1, dl.length - 1);
        const edge = dl[ei];
        if (latest && edge && yAxis) {
          window.__omniduck_dual_tags = {
            showVol,
            latest: {
              price: latest.close, priceY: yAxis.convertToPixel(latest.close),
              vol: latest.volume||0,
              volY: height - (maxVol>0 ? ((latest.volume||0)/maxVol)*(height*0.25) : 0),
              isUp: latest.close >= latest.open
            },
            edge: {
              isLatest: ei === dl.length - 1,
              price: edge.close, priceY: yAxis.convertToPixel(edge.close),
              vol: edge.volume||0,
              volY: height - (maxVol>0 ? ((edge.volume||0)/maxVol)*(height*0.25) : 0),
              isUp: edge.close >= edge.open
            }
          };
          // RAF-throttle: only dispatch once per animation frame to avoid flooding
          if (!window.__omniduck_raf_pending) {
            window.__omniduck_raf_pending = true;
            requestAnimationFrame(() => {
              window.__omniduck_raf_pending = false;
              window.dispatchEvent(new Event('omniduck_update_dual_tags'));
            });
          }
        }
        if (showVol && maxVol > 0) {
          for (let i = visibleRange.from; i < visibleRange.to; i++) {
            const d = dl[i]; if (!d?.volume) continue;
            const x = xAxis.convertToPixel(i);
            const bh = (d.volume / maxVol) * (height * 0.25);
            ctx.fillStyle = d.close >= d.open ? 'rgba(8,153,129,0.35)' : 'rgba(242,54,69,0.35)';
            ctx.fillRect(x - barWidth/2, height - Math.max(bh,1), barWidth, Math.max(bh,1));
          }
        }
        return true;
      },
      createTooltipDataSource: () => ({ name: '', calcParamsText: '', values: [] })
    });
  } catch(e) {}
}

/* ════════════════════════════════════════════════════════════════════
   REGISTER INDICATOR: CUSTOM_SAR  
════════════════════════════════════════════════════════════════════ */
let _sar_registered = false;
if (!_sar_registered) {
  _sar_registered = true;
  try {
    registerIndicator({
      name: 'CUSTOM_SAR',
      shortName: 'SAR',
      calcParams: [0.02, 0.2],
      calc: (dl, ind) => {
        const [step, maxAf] = ind.calcParams;
        let af = step, ep = 0, sar = 0, bull = true;
        return dl.map((d, i) => {
          if (i === 0) { sar = d.low; ep = d.high; return { sar: undefined, bull: true }; }
          const ps = sar;
          if (bull) {
            sar = ps + af*(ep-ps);
            sar = Math.min(sar, dl[i-1].low, i>1?dl[i-2].low:sar);
            if (d.low < sar) { bull=false; sar=ep; ep=d.low; af=step; }
            else if (d.high > ep) { ep=d.high; af=Math.min(af+step,maxAf); }
          } else {
            sar = ps + af*(ep-ps);
            sar = Math.max(sar, dl[i-1].high, i>1?dl[i-2].high:sar);
            if (d.high > sar) { bull=true; sar=ep; ep=d.high; af=step; }
            else if (d.low < ep) { ep=d.low; af=Math.min(af+step,maxAf); }
          }
          return { sar, bull };
        });
      },
      draw: ({ ctx, visibleRange, indicator, xAxis, yAxis }) => {
        const data = indicator.result;
        for (let i = visibleRange.from; i < visibleRange.to; i++) {
          const d = data[i];
          if (!d || d.sar == null) continue;
          ctx.beginPath();
          ctx.arc(xAxis.convertToPixel(i), yAxis.convertToPixel(d.sar), 2.5, 0, Math.PI*2);
          ctx.fillStyle = d.bull ? '#00D4E8' : '#FF6B6B';
          ctx.fill();
        }
        return true;
      },
      createTooltipDataSource: ({ indicator, dataIndex }) => {
        const idx = dataIndex ?? indicator.result.length - 1;
        const d = indicator.result[idx];
        return { name:'SAR', calcParamsText:'', values: d?.sar!=null ? [{ title:'SAR', value:d.sar.toFixed(2) }] : [] };
      }
    });
  } catch(e) {}
}

/* ════════════════════════════════════════════════════════════════════
   REGISTER INDICATOR: BOLL_CUSTOM 
════════════════════════════════════════════════════════════════════ */
let _boll_registered = false;
if (!_boll_registered) {
  _boll_registered = true;
  try {
    registerIndicator({
      name: 'BOLL_CUSTOM',
      shortName: 'BOLL',
      calcParams: [20, 2],
      calc: (dl, ind) => {
        const [period, mult] = ind.calcParams;
        return dl.map((_,i) => {
          if (i < period-1) return { upper:undefined, mid:undefined, lower:undefined };
          const slice = dl.slice(i-period+1, i+1).map(d=>d.close);
          const mid = slice.reduce((a,b)=>a+b,0)/period;
          const std = Math.sqrt(slice.reduce((a,b)=>a+(b-mid)**2,0)/period);
          return { upper: mid+mult*std, mid, lower: mid-mult*std };
        });
      },
      draw: ({ ctx, visibleRange, indicator, xAxis, yAxis }) => {
        const data = indicator.result;
        const pts = [];
        for (let i = visibleRange.from; i < visibleRange.to; i++) {
          const d = data[i];
          if (!d?.upper) continue;
          pts.push({ x:xAxis.convertToPixel(i), u:yAxis.convertToPixel(d.upper), m:yAxis.convertToPixel(d.mid), l:yAxis.convertToPixel(d.lower) });
        }
        if (pts.length < 2) return true;
 
        ctx.beginPath();
        pts.forEach((p,i)=> i===0?ctx.moveTo(p.x,p.u):ctx.lineTo(p.x,p.u));
        [...pts].reverse().forEach(p=>ctx.lineTo(p.x,p.l));
        ctx.closePath(); ctx.fillStyle='rgba(33,150,243,0.07)'; ctx.fill();
  
        for (const [ky, col] of [['u','#80b6e3'],['l','#70aee1']]) {
          ctx.beginPath(); ctx.setLineDash([]);
          pts.forEach((p,i)=> i===0?ctx.moveTo(p.x,p[ky]):ctx.lineTo(p.x,p[ky]));
          ctx.strokeStyle=col; ctx.lineWidth=1.2; ctx.stroke();
        }
 
        ctx.beginPath(); ctx.setLineDash([5,4]);
        pts.forEach((p,i)=> i===0?ctx.moveTo(p.x,p.m):ctx.lineTo(p.x,p.m));
        ctx.strokeStyle='#FF9600'; ctx.lineWidth=1; ctx.stroke(); ctx.setLineDash([]);
        return true;
      },
      createTooltipDataSource: ({ indicator, dataIndex }) => {
        const idx = dataIndex ?? indicator.result.length - 1;
        const d = indicator.result[idx];
        return {
          name:'BOLL', calcParamsText:'20,2',
          values: d?.upper!=null ? [
            { title:'UP',  value:d.upper.toFixed(2),  color:'#2196F3' },
            { title:'MID', value:d.mid.toFixed(2),    color:'#FF9600' },
            { title:'DN',  value:d.lower.toFixed(2),  color:'#2196F3' }
          ] : []
        };
      }
    });
  } catch(e) {}
}

/* ════════════════════════════════════════════════════════════════════
   STATIC DATA
════════════════════════════════════════════════════════════════════ */
const MAIN_INDICATORS = [
  { key:'MA',          label:'MA — Đường trung bình' },
  { key:'EMA',         label:'EMA — Trung bình mũ' },
  { key:'BOLL_CUSTOM', label:'BOLL — Bollinger Bands' },
  { key:'CUSTOM_SAR',  label:'SAR — Parabolic SAR' },
];
const SUB_INDICATORS = [
  { key:'VOL',  label:'Volume'       },
  { key:'MACD', label:'MACD'         },
  { key:'RSI',  label:'RSI'          },
  { key:'KDJ',  label:'KDJ/Stoch'   },
  { key:'CCI',  label:'CCI'          },
  { key:'ATR',  label:'ATR'          },
  { key:'OBV',  label:'OBV'          },
  { key:'WR',   label:'Williams %R'  },
];

const DRAW_TOOLS = [
  { name:'select',                 Icon:MousePointer,   title:'Chọn / Di chuyển' },
  { name:'segment',                Icon:Pencil,         title:'Trendline (đoạn thẳng)' },
  { name:'straightLine',           Icon:MoveHorizontal, title:'Đường thẳng vô hạn' },
  { name:'horizontalStraightLine', Icon:Minus,          title:'Đường ngang' },
  { name:'fibonacciLine',          Icon:Baseline,       title:'Fibonacci Retracement' },
  { name:'parallelStraightLine',   Icon:TrendingUp,     title:'Kênh song song' },
];

 const STROKE_STYLES = [
  { val:'solid',  label:'Liền' },
  { val:'dashed', label:'Đứt khúc' },
  { val:'dotted', label:'Chấm' },
];

const INTERVALS_MINUTE = ['1 phút','3 phút','5 phút','15 phút','30 phút'];
const INTERVALS_DAY    = ['1 giờ','2 giờ','4 giờ','1 ngày','1 tuần','1 tháng','1 năm'];
const CHART_TYPES = [
  {id:'candle_solid',     label:'Nến Đặc (Solid)'},
  {id:'candle_up_stroke', label:'Nến Rỗng (Hollow)'},
  {id:'candle_stroke',    label:'Nến Viền (Stroke)'},
  {id:'ohlc',             label:'Hình Thanh (Bar)'},
  {id:'area',             label:'Biểu đồ Vùng'},
  {id:'heikin_ashi',      label:'Heikin Ashi'},
];
const OVERLAY_COLORS = ['#8B5CF6','#A855F7','#FF9600','#089981','#F23645','#2196F3','#FFFFFF'];
const STROKE_SIZES   = [1,2,3,4];

/* ════════════════════════════════════════════════════════════════════
   COMPONENT
════════════════════════════════════════════════════════════════════ */
export default React.memo(function TradingChart({ data, theme, onIntervalChange, currentInterval, isMini = false, suppressResizeRef = null }) {
  const chartContainerRef   = useRef(null);
  const chartInstance       = useRef(null);
  const topBarRef           = useRef(null);
  const indicatorBarRef     = useRef(null);
  const priceLabelLatestRef = useRef(null);
  const volLabelLatestRef   = useRef(null);
  const priceLabelEdgeRef   = useRef(null);
  const volLabelEdgeRef     = useRef(null);
  const activeToolRef       = useRef('select');
  const strokeSizeRef       = useRef(2);
  const strokeStyleRef      = useRef('solid');
  const overlayColorRef     = useRef('#8B5CF6');

  const [interval,          setInterval]          = useState(currentInterval || '1 ngày');
  const [showIntervalMenu,  setShowIntervalMenu]   = useState(false);
  const [showTypeMenu,      setShowTypeMenu]       = useState(false);
  const [showIndicatorMenu, setShowIndicatorMenu]  = useState(false);
  const [showStrokePanel,   setShowStrokePanel]    = useState(false);
  const [chartType,         setChartType]          = useState('candle_solid');
  const [activeMain,        setActiveMain]         = useState([]);
  const [activeSub,         setActiveSub]          = useState(['VOL']);
  const [activeOverlay,     setActiveOverlay]      = useState(null);
  const [overlayColor,      setOverlayColor]       = useState('#8B5CF6');
  const [strokeSize,        setStrokeSize]         = useState(2);
  const [strokeStyle,       setStrokeStyle]        = useState('solid');
  const [activeTool,        setActiveTool]         = useState('select');

  const isDark = theme === 'dark';

   useEffect(() => { overlayColorRef.current = overlayColor; }, [overlayColor]);
  useEffect(() => { strokeSizeRef.current   = strokeSize;   }, [strokeSize]);
  useEffect(() => { strokeStyleRef.current  = strokeStyle;  }, [strokeStyle]);

  // Đồng bộ khung thời gian hiển thị trên toolbar với khung do tab cha chọn
  useEffect(() => {
    if (currentInterval && currentInterval !== interval) setInterval(currentInterval);
  }, [currentInterval]);

  const closeAllMenus = useCallback(() => {
    setShowIntervalMenu(false); setShowTypeMenu(false);
    setShowIndicatorMenu(false); setShowStrokePanel(false);
  }, []);
  const handleScrollLeft  = useCallback(() => chartInstance.current?.scrollByDistance(chartInstance.current.getBarSpace()), []);
  const handleScrollRight = useCallback(() => chartInstance.current?.scrollByDistance(-chartInstance.current.getBarSpace()), []);
  const handleResetChart  = useCallback(() => { chartInstance.current?.setBarSpace(6); chartInstance.current?.scrollToRealTime(); }, []);
  const interactivePaneOptions = useCallback((id, height) => ({
    id,
    ...(height ? { height } : {}),
    minHeight: 80,
    dragEnabled: true,
    axisOptions: { scrollZoomEnabled: true }
  }), []);
  /* ── activate a drawing tool ─────────────────────── */
 
  const spawnOverlay = useCallback((toolName) => {
    if (!chartInstance.current) return;
    const color = overlayColorRef.current;
    const size  = strokeSizeRef.current;
    const style = strokeStyleRef.current;

    chartInstance.current.createOverlay({
      name: toolName,
      lock: false,
      styles: {
         line:    { color, size, style },
        polygon: { style: 'stroke_fill', color, fill: { color: `${color}18` } },
        arc:     { style: 'stroke_fill', color, fill: { color: `${color}18` } },
        point:   { color, borderColor: `${color}50`, activeColor: color, activeBorderColor: `${color}99` },
        text:    { color, size: size + 12, family: 'Inter, sans-serif', weight: 'bold' }
      },
      onDrawEnd: (event) => {
        setTimeout(() => {
          if (activeToolRef.current === toolName) spawnOverlay(toolName);
        }, 80);
        return true;
      },
      onSelected:   (info) => { if (info) setActiveOverlay({ id: info.overlay?.id || info.id }); },
      onDeselected: () => setActiveOverlay(null)
    });
  }, []);

  const handleActivateTool = useCallback((toolName) => {
    activeToolRef.current = toolName;
    setActiveTool(toolName);
    if (toolName === 'select') return;
    spawnOverlay(toolName);
  }, [spawnOverlay]);

  /* ── toggle indicator ─────────────────────────────── */
  const toggleIndicator = useCallback((name, isMain) => {
    if (!chartInstance.current) return;
    if (isMain) {
      if (activeMain.includes(name)) {
        chartInstance.current.removeIndicator('candle_pane', name);
        setActiveMain(p => p.filter(n => n !== name));
      } else {
        chartInstance.current.createIndicator(name, true, interactivePaneOptions('candle_pane'));
        setActiveMain(p => [...p, name]);
      }
    } else {
      if (activeSub.includes(name)) {
        if (name === 'VOL') chartInstance.current.overrideIndicator({ name:'TV_VOL_OVERLAY', calcParams:[false] }, 'candle_pane');
        else                chartInstance.current.removeIndicator(`pane_${name}`);
        setActiveSub(p => p.filter(n => n !== name));
      } else {
        if (name === 'VOL') chartInstance.current.overrideIndicator({ name:'TV_VOL_OVERLAY', calcParams:[true] }, 'candle_pane');
        else                chartInstance.current.createIndicator(name, false, interactivePaneOptions(`pane_${name}`, 120));
        setActiveSub(p => [...p, name]);
      }
    }
  }, [activeMain, activeSub, interactivePaneOptions]);

  /* ══════════════════════════════════════════════════════
     EFFECT 
  ══════════════════════════════════════════════════════ */
  useEffect(() => {
    if (!chartContainerRef.current) return;
    if (!chartInstance.current) {
      chartInstance.current = init(chartContainerRef.current);
      chartInstance.current.setScrollEnabled(true);
      chartInstance.current.setZoomEnabled(true);
      chartInstance.current.setPaneOptions(interactivePaneOptions('candle_pane'));
      chartInstance.current.createIndicator({ name:'TV_VOL_OVERLAY', calcParams:[true] }, true, interactivePaneOptions('candle_pane'));
      activeSub.forEach(ind => {
        if (ind !== 'VOL') chartInstance.current.createIndicator(ind, false, interactivePaneOptions(`pane_${ind}`, 120));
      });
    }
    const chart = chartInstance.current;
    const upColor='#089981', downColor='#F23645', noChangeColor='#089981';
    const gridColor = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.09)';

    chart.setCustomApi({
      formatDate: (_, ts, format, type) => {
        const d   = new Date(ts);
        const dd  = String(d.getDate()).padStart(2,'0');
        const mm  = d.getMonth()+1;
        const mms = String(mm).padStart(2,'0');
        const yy  = String(d.getFullYear()).slice(2);
        const yyyy= d.getFullYear();
        const hh  = String(d.getHours()).padStart(2,'0');
        const min = String(d.getMinutes()).padStart(2,'0');
        if (type===2 || type==='xAxis') {
          switch(format) {
            case 'YYYY':        return `${yyyy}`;
            case 'YYYY-MM':     return `Tháng ${mm}, ${yyyy}`;
            case 'MM-DD':       return `${dd}/${mms}`;
            case 'YYYY-MM-DD':  return `${dd}/${mms}/${yy}`;
            case 'HH:mm':       return `${hh}:${min}`;
            case 'MM-DD HH:mm': return `${dd}/${mms} ${hh}:${min}`;
            default:            return `${dd}/${mms}`;
          }
        }
        const isDaily = (hh==='07'&&min==='00')||(hh==='00'&&min==='00');
        return isDaily ? `${dd} Tháng ${mm}, ${yyyy}` : `${dd}/${mms}/${yyyy} ${hh}:${min}`;
      }
    });

    chart.setStyles({
      grid: {
        show: true,
        horizontal: { show:true, color:gridColor, style:'solid', size:1 },
        vertical:   { show:true, color:gridColor, style:'solid', size:1 }
      },
      separator: { size:1, color:gridColor, fill:false, activeBackgroundColor:'transparent' },
      candle: {
        type: chartType==='heikin_ashi' ? 'candle_solid' : chartType,
        bar: {
          upColor, downColor, noChangeColor,
          upBorderColor:upColor, downBorderColor:downColor, noChangeBorderColor:noChangeColor,
          upWickColor:upColor,   downWickColor:downColor,   noChangeWickColor:noChangeColor
        },
        margin: { top:0.2, bottom:0.05 },
        priceMark: { show:false },
        tooltip:   { showRule:'none' }
      },
      indicator: {
        ohlc: { upColor, downColor },
        bars: [{ upColor, downColor, noChangeColor }],
        lines: [
          { style:'solid', size:1.5, color:'#FF9600' },
          { style:'solid', size:1.5, color:'#9D65C9' },
          { style:'solid', size:1.5, color:'#2196F3' },
          { style:'solid', size:1.5, color:'#E11D74' },
          { style:'solid', size:1.5, color:'#01C5C4' }
        ],
        tooltip: {
          showRule: 'always',
          text: { family:'Inter,sans-serif', size:12, color: isDark?'#9CA3AF':'#4B5563', weight:'600' }
        }
      },
      xAxis: {
        show:true, height:32,
        axisLine: { color: isDark?'#374151':'#D1D5DB' },
        tickText: { color: isDark?'#9CA3AF':'#6B7280', family:'Inter,sans-serif', size:11, weight:'500' }
      },
      yAxis: {
        show:true, width:60,
        axisLine: { color: isDark?'#374151':'#D1D5DB' },
        tickText: { color: isDark?'#9CA3AF':'#6B7280', family:'Inter,sans-serif', size:11, weight:'500' }
      },
      crosshair: {
        show: true,
        horizontal: {
          line: { show:true, style:'dashed', color: isDark?'#4B5563':'#9CA3AF' },
           text: {
            show: true,
            color: '#FF9600',
            size: 11, family: 'Inter,sans-serif',
            paddingLeft:5, paddingRight:5, paddingTop:3, paddingBottom:3,
            backgroundColor: isDark ? 'rgba(20,24,32,0.88)' : 'rgba(255,248,235,0.95)',
            borderColor: '#FF9600',
            borderSize: 1,
            borderRadius: 3
          }
        },
        vertical: {
          line: { show:true, style:'dashed', color: isDark?'#4B5563':'#9CA3AF' },
          text: {
            show: true,
            color: isDark?'#E5E7EB':'#374151',
            size: 11, family: 'Inter,sans-serif',
            paddingLeft:6, paddingRight:6, paddingTop:3, paddingBottom:3,
            backgroundColor: isDark?'#1E2530':'#F1F5F9',
            borderColor: isDark?'#4B5563':'#94A3B8',
            borderSize: 1,
            borderRadius: 4
          }
        }
      },
      overlay: {
        point: {
          color:'#df8d1a', borderColor:'rgba(255,150,0,0.3)', borderSize:3, radius:3,
          activeColor:'#FF9600', activeBorderColor:'rgba(255,150,0,0.5)', activeBorderSize:3, activeRadius:5
        },
        line:    { color:'#FF9600', size:2 },
        polygon: { style:'stroke_fill', color:'#FF9600', fill:{ color:'rgba(255,150,0,0.08)' } }
      }
    });

    chart.subscribeAction('onScroll', () => setActiveOverlay(null));
    chart.subscribeAction('onZoom',   () => setActiveOverlay(null));
  }, [theme, isDark, chartType, interactivePaneOptions]);

  /* ══════════════════════════════════════════════════════
     EFFECT: resize + cleanup (debounced để tránh lag)
  ══════════════════════════════════════════════════════ */
  useEffect(() => {
    let rafId = null;
    const ro = new ResizeObserver(() => {
      // Dùng requestAnimationFrame để batch resize, tránh gọi liên tục gây lag
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        if (suppressResizeRef?.current) return;
        if (chartInstance.current) chartInstance.current.resize();
      });
    });
    if (chartContainerRef.current) ro.observe(chartContainerRef.current);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
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
      let ts=0, tv=d.time||d.date;
      if (tv!=null) {
        if (typeof tv==='string'&&!isNaN(tv)&&tv.trim()) tv=Number(tv);
        if (typeof tv==='number') {
          ts = tv>9999999999 ? tv : tv*1000;
        } else if (typeof tv==='string') {
          if (tv.includes('/')) {
            const parts=tv.split(' ')[0].split('/');
            if (parts.length===3)
              ts = parts[0].length===4
                ? new Date(parts[0],parseInt(parts[1])-1,parts[2]).getTime()
                : new Date(parts[2],parseInt(parts[1])-1,parts[0]).getTime();
          } else {
            ts = new Date(tv.includes(' ')&&!tv.includes('T')?tv.replace(' ','T'):tv).getTime();
          }
        }
      }
      return { timestamp:ts, open:Number(d.open)||0, high:Number(d.high)||0, low:Number(d.low)||0, close:Number(d.close)||0, volume:Number(d.value)||Number(d.volume)||0 };
    }).filter(d=>!isNaN(d.timestamp)&&d.timestamp>0).sort((a,b)=>a.timestamp-b.timestamp);

    let display = formatted;
    if (chartType==='heikin_ashi') {
      display=[];
      for (let i=0;i<formatted.length;i++) {
        const c=formatted[i];
        if (i===0){display.push({...c});continue;}
        const p=display[i-1];
        const hc=(c.open+c.high+c.low+c.close)/4, ho=(p.open+p.close)/2;
        display.push({...c, open:ho, high:Math.max(c.high,ho,hc), low:Math.min(c.low,ho,hc), close:hc});
      }
    }
    const cur=chartInstance.current.getDataList();
    const isNew=!cur.length||(cur[0]&&display[0]&&cur[0].timestamp!==display[0].timestamp)||Math.abs(cur.length-display.length)>5;
    if (isNew) chartInstance.current.applyNewData(display);
    else       chartInstance.current.updateData(display[display.length-1]);
    // Use RAF so the chart has time to render before we ask for pixel positions
    requestAnimationFrame(() => {
      window.dispatchEvent(new Event('omniduck_update_dual_tags'));
    });
  }, [data, chartType]);

  /* ══════════════════════════════════════════════════════
     EFFECT: top bar OHLCV + indicator tooltip bar
  ══════════════════════════════════════════════════════ */
  useEffect(() => {
    const fmtVol = (v) => v>=1e6?(v/1e6).toFixed(2)+'M':v>=1e3?(v/1e3).toFixed(1)+'K':String(v);

    const updateTopBar = (target) => {
      if (!topBarRef.current) return;
      let d = target;
      if (!d) { const list=chartInstance.current?.getDataList(); if(list?.length) d=list[list.length-1]; else return; }
      const color    = d.close>=d.open?'#089981':'#F23645';
      const lblColor = isDark?'#9CA3AF':'#6B7280';
      const valColor = isDark?'#F1F5F9':'#111827';
      const bg       = isDark?'rgba(13,17,23,0.80)':'rgba(255,255,255,0.90)';
      const dt=new Date(d.timestamp);
      const hh=String(dt.getHours()).padStart(2,'0'), mn=String(dt.getMinutes()).padStart(2,'0');
      const isDaily=(hh==='07'&&mn==='00')||(hh==='00'&&mn==='00');
      const timeStr = isDaily
        ? `${String(dt.getDate()).padStart(2,'0')} Tháng ${dt.getMonth()+1}, ${dt.getFullYear()}`
        : `${String(dt.getDate()).padStart(2,'0')} Tháng ${dt.getMonth()+1}, ${dt.getFullYear()} ${hh}:${mn}`;
      topBarRef.current.innerHTML = `
        <div style="display:flex;flex-wrap:wrap;gap:12px;font-family:Inter,sans-serif;background:${bg};padding:5px 12px;border-radius:6px;backdrop-filter:blur(4px);box-shadow:0 1px 4px rgba(0,0,0,0.15);">
          <span style="color:${lblColor}">Time: <span style="color:${valColor}">${timeStr}</span></span>
          <span style="color:${lblColor}">O: <span style="color:${color}">${d.open.toFixed(2)}</span></span>
          <span style="color:${lblColor}">H: <span style="color:${color}">${d.high.toFixed(2)}</span></span>
          <span style="color:${lblColor}">L: <span style="color:${color}">${d.low.toFixed(2)}</span></span>
          <span style="color:${lblColor}">C: <span style="color:${color}">${d.close.toFixed(2)}</span></span>
          <span style="color:${lblColor}">Vol: <span style="color:${color}">${fmtVol(d.volume)}</span></span>
        </div>`;
    };

     const updateIndicatorBar = (params) => {
      if (!indicatorBarRef.current) return;
      const infos = params?.indicatorTooltipDatas || [];
       const relevant = infos.filter(info => info.values?.length && info.name !== 'VOL');
      if (!relevant.length) { indicatorBarRef.current.style.display='none'; return; }
      const bg = isDark?'rgba(13,17,23,0.80)':'rgba(255,255,255,0.90)';
      const parts = relevant.map(info => {
        const vals = info.values.map(v =>
          `<span style="color:${v.color||'#9CA3AF'};font-weight:700;margin-left:4px">${v.title}: <span style="color:${v.color||'#E5E7EB'}">${v.value}</span></span>`
        ).join('');
        return `<span style="color:${isDark?'#CBD5E1':'#475569'};font-weight:800;margin-right:2px">${info.name}</span>${vals}`;
      }).join('<span style="color:#4B5563;margin:0 8px">|</span>');
      indicatorBarRef.current.style.display = 'block';
      indicatorBarRef.current.innerHTML = `<div style="display:flex;flex-wrap:wrap;align-items:center;gap:4px;font-family:Inter,sans-serif;background:${bg};padding:4px 12px;border-radius:6px;backdrop-filter:blur(4px);font-size:11px;">${parts}</div>`;
    };

    const onCross = (() => {
      let rafId = null;
      return (params) => {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
          rafId = null;
          if (params?.dataIndex != null) {
            const list = chartInstance.current?.getDataList();
            if (list) updateTopBar(list[params.dataIndex]);
            updateIndicatorBar(params);
          } else {
            updateTopBar();
            if (indicatorBarRef.current) indicatorBarRef.current.style.display='none';
          }
        });
      };
    })();

    if (chartInstance.current) chartInstance.current.subscribeAction('onCrosshairChange', onCross);
    updateTopBar();
    return () => { if (chartInstance.current) chartInstance.current.unsubscribeAction('onCrosshairChange', onCross); };
  }, [isDark, data]);

  /* ══════════════════════════════════════════════════════
     EFFECT: dual price/vol edge labels
  ══════════════════════════════════════════════════════ */
  useEffect(() => {
    const fmt  = (v) => v>=1e6?(v/1e6).toFixed(2)+'M':v>=1e3?(v/1e3).toFixed(1)+'K':String(v);
    const fmtP = (p) => Number.isInteger(p)?p.toString():p.toFixed(2);
    const update = () => {
      const info = window.__omniduck_dual_tags;
      if (!info||!priceLabelLatestRef.current) return;
      const { latest, edge, showVol } = info;
      const cL = latest.isUp?'#089981':'#F23645';
      priceLabelLatestRef.current.style.cssText = `display:block;top:${latest.priceY-11}px;background:${cL};color:#fff;position:absolute;right:3px;width:44px;height:22px;line-height:22px;text-align:center;font-size:11px;font-family:Inter,sans-serif;font-weight:700;border-radius:2px;z-index:49;pointer-events:none;transition:top .05s linear`;
      priceLabelLatestRef.current.innerText = fmtP(latest.price);
      if (showVol) {
        volLabelLatestRef.current.style.cssText = `display:block;top:${latest.volY-11}px;background:${cL};color:#fff;position:absolute;right:3px;width:44px;height:22px;line-height:22px;text-align:center;font-size:11px;font-family:Inter,sans-serif;font-weight:700;border-radius:2px;z-index:49;pointer-events:none;transition:top .05s linear`;
        volLabelLatestRef.current.innerText = fmt(latest.vol);
      } else { volLabelLatestRef.current.style.display='none'; }
      if (priceLabelEdgeRef.current) {
        if (edge.isLatest) {
          priceLabelEdgeRef.current.style.display='none';
          volLabelEdgeRef.current.style.display='none';
        } else {
          const cE=edge.isUp?'#089981':'#F23645';
          const bgE=isDark?'#0B0F14':'#fff';
          priceLabelEdgeRef.current.style.cssText = `display:block;top:${edge.priceY-11}px;background:${bgE};color:${cE};border:1px solid ${cE};position:absolute;right:3px;width:44px;height:22px;line-height:20px;text-align:center;font-size:11px;font-family:Inter,sans-serif;font-weight:700;border-radius:2px;z-index:50;pointer-events:none;box-sizing:border-box;transition:top .05s linear`;
          priceLabelEdgeRef.current.innerText = fmtP(edge.price);
          if (showVol) {
            volLabelEdgeRef.current.style.cssText = `display:block;top:${edge.volY-11}px;background:${bgE};color:${cE};border:1px solid ${cE};position:absolute;right:3px;width:44px;height:22px;line-height:20px;text-align:center;font-size:11px;font-family:Inter,sans-serif;font-weight:700;border-radius:2px;z-index:50;pointer-events:none;box-sizing:border-box;transition:top .05s linear`;
            volLabelEdgeRef.current.innerText = fmt(edge.vol);
          } else { volLabelEdgeRef.current.style.display='none'; }
        }
      }
    };
    window.addEventListener('omniduck_update_dual_tags', update);
    return () => window.removeEventListener('omniduck_update_dual_tags', update);
  }, [isDark]);

  /* ══════════════════════════════════════════════════════
     EFFECT: keyboard
  ══════════════════════════════════════════════════════ */
  useEffect(() => {
    const onKey = (e) => {
      if (document.activeElement?.tagName==='INPUT') return;
      if ((e.key==='Delete'||e.key==='Backspace')&&activeOverlay) {
        chartInstance.current?.removeOverlay(activeOverlay.id);
        setActiveOverlay(null);
      }
      if (e.key==='Escape') {
        setShowIntervalMenu(false); setShowTypeMenu(false);
        setShowIndicatorMenu(false); setShowStrokePanel(false);
        activeToolRef.current='select';
        setActiveTool('select');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeOverlay]);

  /* ════════════════════════════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════════════════════════════ */
/*FIX 5: bg solid does not penetrate — use bg-[#0D1117] instead of opacity */  
const menuBase = React.useMemo(() =>
  `absolute top-[calc(100%+8px)] left-0 rounded-2xl border shadow-2xl py-2 overflow-y-auto max-h-[280px] z-[9999] ${isDark?'bg-[#0D1117] border-white/10':'bg-white border-slate-200'}`,
  [isDark]);
  
const rowBtn = React.useCallback((active) =>
  `w-full flex items-center justify-between px-4 py-2 text-xs font-bold transition-all ${active?'bg-violet-600 text-white':(isDark?'text-slate-300 hover:bg-violet-600/80 hover:text-white':'text-slate-700 hover:bg-violet-600/80 hover:text-white')}`,
  [isDark]);

  return (
    <div className="w-full h-full relative flex flex-col" onClick={closeAllMenus}>

      {/* ── TOP TOOLBAR ──────────────────────────────────────── */}
      {!isMini && (
        <div
          className={`flex items-center gap-3 px-4 pt-3 pb-4 mb-2 border-b shrink-0 relative z-[9999] flex-wrap ${isDark?'border-white/10':'border-slate-200'}`}
          onClick={e => e.stopPropagation()}
        >
        {/* INTERVAL */}
        <div className="relative z-[99]">
          <button
            onClick={() => { setShowIntervalMenu(v=>!v); setShowTypeMenu(false); setShowIndicatorMenu(false); setShowStrokePanel(false); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-black uppercase shadow-sm transition-all
              ${showIntervalMenu?'bg-violet-600 text-white border-violet-600':(isDark?'bg-[#10151C] border-violet-500/30 text-violet-400 hover:bg-violet-600 hover:text-white':'bg-white border-slate-300 text-slate-700 hover:bg-violet-600 hover:text-white hover:border-violet-600')}`}
          >
            <Clock size={13}/> {interval} <ChevronDown size={12} className={showIntervalMenu?'rotate-180':''}/>
          </button>
          {showIntervalMenu && (
            <div className={`${menuBase} w-40`}>
              <p className="px-4 pt-2 pb-1 text-[9px] font-black text-slate-500 uppercase">Phút</p>
              {INTERVALS_MINUTE.map(t=>(
                <button key={t} onClick={()=>{setInterval(t);setShowIntervalMenu(false);onIntervalChange?.(t);}} className={rowBtn(interval===t)}>
                  {t}{interval===t&&<Check size={12}/>}
                </button>
              ))}
              <div className="h-px bg-white/10 my-1"/>
              <p className="px-4 pt-2 pb-1 text-[9px] font-black text-slate-500 uppercase">Giờ &amp; Ngày</p>
              {INTERVALS_DAY.map(t=>(
                <button key={t} onClick={()=>{setInterval(t);setShowIntervalMenu(false);onIntervalChange?.(t);}} className={rowBtn(interval===t)}>
                  {t}{interval===t&&<Check size={12}/>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* CHART TYPE */}
        <div className="relative z-[100]">
          <button
            onClick={()=>{setShowTypeMenu(v=>!v);setShowIndicatorMenu(false);setShowIntervalMenu(false);setShowStrokePanel(false);}}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-black uppercase shadow-sm transition-all
              ${showTypeMenu?'bg-violet-600 text-white border-violet-600':(isDark?'bg-[#10151C] border-violet-500/30 text-violet-400 hover:bg-violet-600 hover:text-white':'bg-white border-slate-300 text-slate-700 hover:bg-violet-600 hover:text-white hover:border-violet-600')}`}
          >
            <BarChart2 size={13}/>
            {{candle_solid:'Nến Đặc',candle_up_stroke:'Nến Rỗng',candle_stroke:'Nến Viền',ohlc:'Thanh',area:'Vùng',heikin_ashi:'Heikin Ashi'}[chartType]||'Nến'}
            <ChevronDown size={12} className={showTypeMenu?'rotate-180':''}/>
          </button>
          {showTypeMenu && (
            <div className={`${menuBase} w-48`}>
              {CHART_TYPES.map(tp=>(
                <button key={tp.id} onClick={()=>{setChartType(tp.id);setShowTypeMenu(false);}}
                  className={`w-full flex items-center justify-between px-4 py-2 text-xs font-bold transition-all ${chartType===tp.id?'bg-violet-600 text-white':(isDark?'text-slate-300 hover:bg-violet-600/80 hover:text-white':'text-slate-700 hover:bg-violet-600/80 hover:text-white')}`}>
                  {tp.label}{chartType===tp.id&&<Check size={12}/>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* INDICATORS */}
        <div className="relative z-[100]">
          <button
            onClick={()=>{setShowIndicatorMenu(v=>!v);setShowTypeMenu(false);setShowIntervalMenu(false);setShowStrokePanel(false);}}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-black uppercase shadow-sm transition-all
              ${showIndicatorMenu?'bg-violet-600 text-white border-violet-600':(isDark?'bg-[#10151C] border-violet-500/30 text-violet-400 hover:bg-violet-600 hover:text-white':'bg-white border-slate-300 text-slate-700 hover:bg-violet-600 hover:text-white hover:border-violet-600')}`}
          >
            <Settings2 size={13}/> Chỉ Báo <ChevronDown size={12} className={showIndicatorMenu?'rotate-180':''}/>
          </button>
          {showIndicatorMenu && (
            <div className={`${menuBase} w-64`}>
              <p className="px-4 pt-2 pb-1 text-[9px] font-black text-slate-500 uppercase">Chỉ báo chồng nến</p>
              {MAIN_INDICATORS.map(ind=>(
                <button key={ind.key} onClick={()=>toggleIndicator(ind.key,true)} className={rowBtn(activeMain.includes(ind.key))}>
                  {ind.label}{activeMain.includes(ind.key)&&<Check size={12}/>}
                </button>
              ))}
              <div className="h-px bg-white/10 my-2"/>
              <p className="px-4 pb-1 text-[9px] font-black text-slate-500 uppercase">Chỉ báo phụ</p>
              {SUB_INDICATORS.map(ind=>(
                <button key={ind.key} onClick={()=>toggleIndicator(ind.key,false)} className={rowBtn(activeSub.includes(ind.key))}>
                  {ind.label}{activeSub.includes(ind.key)&&<Check size={12}/>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* COLOR + STROKE */}
        <div className={`ml-auto flex items-center gap-2 px-3 py-1.5 rounded-xl border shadow-sm ${isDark?'bg-[#10151C] border-white/10':'bg-white border-slate-200'}`}>
          <span className={`text-[9px] font-black uppercase tracking-wider ${isDark?'text-slate-400':'text-slate-500'}`}>Màu:</span>
          {OVERLAY_COLORS.map(hex=>(
            <button key={hex} onClick={()=>setOverlayColor(hex)}
              className={`w-5 h-5 rounded-full border-2 transition-all hover:scale-110 ${overlayColor===hex?'ring-1 ring-offset-1':''}`}
              style={{ backgroundColor:hex, borderColor:overlayColor===hex?(isDark?'#fff':'#1f2937'):'transparent' }}
            />
          ))}
          <div className="relative ml-1">
            <button
              onClick={e=>{e.stopPropagation();setShowStrokePanel(v=>!v);}}
              title="Tùy chỉnh nét vẽ"
              className={`p-1 rounded-lg transition-all ${showStrokePanel?'bg-violet-600 text-white':(isDark?'text-slate-400 hover:text-violet-400':'text-slate-500 hover:text-violet-600')}`}
            >
              <SlidersHorizontal size={14}/>
            </button>
            {/* FIX 5: bg solid without piercing chart — bg-[#0D1117] absolute */}
            {showStrokePanel && (
              <div
                className={`absolute top-[calc(100%+8px)] right-0 w-52 p-3 rounded-2xl border z-[9999] ${isDark?'bg-[#0D1117] border-white/15':'bg-white border-slate-200'}`}
                style={{ boxShadow: isDark?'0 8px 32px rgba(0,0,0,0.8)':'0 8px 32px rgba(0,0,0,0.15)' }}
                onClick={e=>e.stopPropagation()}
              >
                <p className={`text-[9px] font-black uppercase mb-2 ${isDark?'text-slate-400':'text-slate-500'}`}>Độ dày nét</p>
                <div className="flex gap-2 mb-3">
                  {STROKE_SIZES.map(s=>(
                    <button key={s} onClick={()=>setStrokeSize(s)}
                      className={`flex-1 flex flex-col items-center gap-1.5 py-2 rounded-lg text-[10px] font-black transition-all ${strokeSize===s?'bg-violet-600 text-white':(isDark?'bg-white/5 text-slate-400 hover:bg-white/10':'bg-slate-100 text-slate-500 hover:bg-slate-200')}`}>
                      <div style={{height:`${s+1}px`,width:'24px',background:'currentColor',borderRadius:1}}/>
                      {s}px
                    </button>
                  ))}
                </div>
                <p className={`text-[9px] font-black uppercase mb-2 ${isDark?'text-slate-400':'text-slate-500'}`}>Kiểu nét</p>
                {/* FIX 4: SVG preview chính xác */}
                {STROKE_STYLES.map(s=>(
                  <button key={s.val} onClick={()=>setStrokeStyle(s.val)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-bold text-left mb-1 transition-all ${strokeStyle===s.val?'bg-violet-600 text-white':(isDark?'bg-white/5 text-slate-400 hover:bg-white/10':'bg-slate-50 text-slate-600 hover:bg-slate-100')}`}>
                    <svg width="32" height="8" viewBox="0 0 32 8">
                      {s.val==='solid'  && <line x1="0" y1="4" x2="32" y2="4" stroke="currentColor" strokeWidth="2"/>}
                      {s.val==='dashed' && <line x1="0" y1="4" x2="32" y2="4" stroke="currentColor" strokeWidth="2" strokeDasharray="6 3"/>}
                      {s.val==='dotted' && <line x1="0" y1="4" x2="32" y2="4" stroke="currentColor" strokeWidth="2" strokeDasharray="2 3"/>}
                    </svg>
                    {s.label}
                    {strokeStyle===s.val&&<Check size={12} className="ml-auto"/>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      )}

      {/* ── CHART AREA + SIDEBAR ─────────────────────────── */}
      <div className="flex-1 flex flex-row relative min-h-0 rounded-2xl overflow-hidden border border-white/5">

        {/* SIDEBAR TOOLS */}
        {!isMini && (
          <div className={`w-12 shrink-0 border-r flex flex-col items-center py-3 gap-1 z-[50] relative ${isDark?'bg-[#0B0F14] border-white/5':'bg-slate-50 border-slate-200'}`}>
            {DRAW_TOOLS.map(({ name, Icon, title }) => {
            const isActive = activeTool===name;
            return (
              <button key={name} title={title}
                onClick={e=>{e.stopPropagation();handleActivateTool(name);}}
                className={`w-9 h-9 flex items-center justify-center rounded-xl transition-all
                  ${isActive?'bg-violet-600 text-white shadow-md shadow-violet-600/30'
                    :(isDark?'text-slate-500 hover:bg-white/8 hover:text-violet-400':'text-slate-500 hover:bg-violet-500/20 hover:text-violet-700')}`}
              >
                <Icon size={15}/>
              </button>
            );
          })}
          <div className={`w-7 h-px my-1 ${isDark?'bg-white/8':'bg-slate-200'}`}/>
          <button title="Xóa đường đang chọn"
            onClick={()=>{chartInstance.current?.removeOverlay();setActiveOverlay(null);}}
            className="w-9 h-9 flex items-center justify-center rounded-xl transition-all text-red-500 hover:bg-red-500 hover:text-white">
            <Trash2 size={15}/>
          </button>
        </div>
        )}
        {/* KLINECHARTS CONTAINER */}
        <div className="flex-1 relative w-full h-full overflow-hidden touch-none overscroll-contain">
          <div ref={chartContainerRef} style={{position:'absolute',top:0,left:0,right:0,bottom:0, userSelect: 'none', WebkitUserSelect: 'none', touchAction: 'none', overscrollBehavior: 'contain', willChange: 'transform'}}/>

          {/* SELECTED OVERLAY BAR */}
          {activeOverlay && (
            <div className={`absolute top-3 left-1/2 -translate-x-1/2 z-[99] flex items-center gap-3 backdrop-blur-md px-4 py-1.5 rounded-xl shadow-2xl border ${isDark ? 'bg-[#0D1117]/90 border-white/10' : 'bg-white border-slate-300'}`}>
              <div className={`flex items-center gap-2 ${isDark ? 'text-violet-400' : 'text-violet-600'}`}>
                <Pencil size={12}/>
                <span className={`text-[9px] font-black uppercase tracking-widest ${isDark?'text-violet-400':'text-violet-600'}`}>Đã chọn đường vẽ</span>
              </div>
              <div className={`w-px h-4 ${isDark?'bg-white/10':'bg-slate-200'}`}/>
              <button
                className="flex items-center gap-1.5 bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white px-3 py-1 rounded-lg font-black text-[10px] uppercase transition-all border border-red-500/20 hover:border-red-500"
                onClick={e=>{e.stopPropagation();chartInstance.current?.removeOverlay(activeOverlay.id);setActiveOverlay(null);}}
              >
                <Trash2 size={12}/> Xóa
              </button>
            </div>
          )}

          {/* TOP BAR OHLCV */}
          {!isMini && <div ref={topBarRef} style={{position:'absolute',top:'8px',left:'12px',zIndex:50,pointerEvents:'none',fontSize:'11px',fontWeight:'600'}}/>} 
          {/* INDICATOR VALUES BAR */}
          {!isMini && <div ref={indicatorBarRef} style={{display:'none',position:'absolute',top:'36px',left:'12px',zIndex:50,pointerEvents:'none'}}/>}
          {/* PRICE/VOL LABELS */}
          <div ref={priceLabelLatestRef}/>
          <div ref={volLabelLatestRef}/>
          <div ref={priceLabelEdgeRef}/>
          <div ref={volLabelEdgeRef}/>

          {/* SCROLL NAV */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 z-[99]">
            <button onClick={handleScrollLeft}  title="Lùi"   className={`p-1.5 rounded-xl border backdrop-blur-md shadow-lg transition-all ${isDark?'bg-[#10151C]/80 border-white/10 text-slate-300 hover:text-white hover:bg-slate-800':'bg-white/80 border-slate-300 text-slate-600 hover:text-black hover:bg-slate-100'}`}><ChevronLeft size={15}/></button>
            <button onClick={handleResetChart}  title="Reset" className={`p-1.5 rounded-xl border backdrop-blur-md shadow-lg transition-all ${isDark?'bg-[#10151C]/80 border-white/10 text-slate-300 hover:text-white hover:bg-slate-800':'bg-white/80 border-slate-300 text-slate-600 hover:text-black hover:bg-slate-100'}`}><RefreshCw size={15}/></button>
            <button onClick={handleScrollRight} title="Tiến"  className={`p-1.5 rounded-xl border backdrop-blur-md shadow-lg transition-all ${isDark?'bg-[#10151C]/80 border-white/10 text-slate-300 hover:text-white hover:bg-slate-800':'bg-white/80 border-slate-300 text-slate-600 hover:text-black hover:bg-slate-100'}`}><ChevronRight size={15}/></button>
          </div>
        </div>
      </div>
    </div>
  );
});
