import React, { useEffect, useRef, useState, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { localizeIntervalLabel } from '../i18n/vnMarketLabels';
import { init, dispose, registerIndicator, registerOverlay } from 'klinecharts';
import {
  Pencil, MoveHorizontal, Baseline, Trash2,
  Settings2, ChevronDown, Check, BarChart2, Clock, RefreshCw,
  ChevronLeft, ChevronRight, Minus, Plus,
  SlidersHorizontal, TrendingUp, MousePointer, Activity,
  Maximize2, Maximize, Minimize2, X
} from 'lucide-react';
import {
  MIN_FORECAST_CANDLES,
  calculateForecast,
  toHeikinAshi,
} from '../lib/chartForecast';

const EXTENDED_MAX_BAR_SPACE = 96;

function patchKlineExtendedZoom(chart, maxBarSpace = EXTENDED_MAX_BAR_SPACE) {
  let timeScaleStore;
  try {
    timeScaleStore = chart?.getChartStore?.().getTimeScaleStore?.();
  } catch {
    return;
  }
  if (!timeScaleStore || timeScaleStore.__omniExtendedZoomPatched) return;

  const originalSetBarSpace = timeScaleStore.setBarSpace.bind(timeScaleStore);
  timeScaleStore.__omniExtendedZoomPatched = true;
  timeScaleStore.setBarSpace = function (requestedBarSpace, adjustBeforeFunc) {
    if (!Number.isFinite(requestedBarSpace) || requestedBarSpace < 1) return;
    const nextBarSpace = Math.min(requestedBarSpace, maxBarSpace);
    if (nextBarSpace <= 50) {
      originalSetBarSpace(nextBarSpace, adjustBeforeFunc);
      return;
    }
    if (this._barSpace === nextBarSpace) return;

    this._barSpace = nextBarSpace;
    this._gapBarSpace = this._calcGapBarSpace();
    adjustBeforeFunc?.();
    this.adjustVisibleRange();
    this._chartStore.getTooltipStore().recalculateCrosshair(true);
    this._chartStore.getChart().adjustPaneViewport(false, true, true, true);
  };
}


function patchKlineDragCapture(chart) {
  const ev = chart?._chartEvent;
  if (!ev || ev.__omniDragCapturePatched) return;
  ev.__omniDragCapturePatched = true;

  const getOverlayStore = () => {
    try {
      return chart.getChartStore().getOverlayStore();
    } catch {
      return null;
    }
  };

  const resolveOverlayCaptureWidget = () => {
    try {
      const store = getOverlayStore();
      if (!store) return null;
      let paneId = null;
      if (store.isDrawing()) {
        paneId = store.getProgressInstanceInfo()?.paneId;
      } else {
        const pressed = store.getPressedInstanceInfo?.();
        if (pressed?.instance) paneId = pressed.paneId;
      }
      if (!paneId) return null;
      const pane = chart.getDrawPaneById(paneId);
      const widget = pane?.getMainWidget?.();
      if (pane && widget) return { pane, widget };
    } catch { /* ignore */ }
    return null;
  };

  const origFind = ev._findWidgetByEvent.bind(ev);
  // Sticky widget while pressed (klinecharts drops hit when pointer leaves pane)
  ev._findWidgetByEvent = function (e) {
    const down = this._mouseDownWidget;
    if (down) {
      try {
        const pane = down.getPane?.();
        if (pane) return { pane, widget: down };
      } catch { /* ignore */ }
    }
    const hit = origFind(e);
    // Real axis/main hit wins so axes stay draggable while a draw tool is active
    if (hit?.widget) return hit;
    return resolveOverlayCaptureWidget() || hit;
  };

  // Axis drag: X = barSpace (anchor right), Y = price range only
  const AXIS_DRAG_X_PX = 55;
  const AXIS_DRAG_Y_PX = 90;

  const performXAxisDrag = (evInstance, downWidget, pageX) => {
    const pane = downWidget.getPane?.();
    const xAxis = pane?.getAxisComponent?.();
    if (xAxis?.getScrollZoomEnabled?.() !== false) {
      if (evInstance.__omniXLastPageX == null) evInstance.__omniXLastPageX = pageX;
      const dx = pageX - evInstance.__omniXLastPageX;
      evInstance.__omniXLastPageX = pageX;
      evInstance.__omniPendingXAxisDx = (evInstance.__omniPendingXAxisDx || 0) + dx;
      if (evInstance.__omniXAxisRaf == null && evInstance.__omniPendingXAxisDx !== 0) {
        evInstance.__omniXAxisRaf = requestAnimationFrame(() => {
          evInstance.__omniXAxisRaf = null;
          const pendingDx = evInstance.__omniPendingXAxisDx || 0;
          evInstance.__omniPendingXAxisDx = 0;
          const zoomScale = -pendingDx / AXIS_DRAG_X_PX;
          if (zoomScale !== 0) {
            const ts = chart.getChartStore().getTimeScaleStore();
            const rightX = ts._totalBarSpace || downWidget.getBounding?.()?.width || 0;
            ts.zoom(zoomScale, { x: rightX });
          }
        });
      }
    }
  };

  const performYAxisDrag = (evInstance, downWidget, pageY) => {
    const pane = downWidget.getPane?.();
    const yAxis = pane?.getAxisComponent?.();
    if (yAxis?.getScrollZoomEnabled?.() !== false) {
      if (evInstance.__omniYLastPageY == null) evInstance.__omniYLastPageY = pageY;
      const dy = pageY - evInstance.__omniYLastPageY;
      evInstance.__omniYLastPageY = pageY;
      evInstance.__omniPendingYAxisDy = (evInstance.__omniPendingYAxisDy || 0) + dy;
      if (evInstance.__omniYAxisRaf == null && evInstance.__omniPendingYAxisDy !== 0) {
        evInstance.__omniYAxisRaf = requestAnimationFrame(() => {
          evInstance.__omniYAxisRaf = null;
          const pendingDy = evInstance.__omniPendingYAxisDy || 0;
          evInstance.__omniPendingYAxisDy = 0;
          const cur = yAxis.getRange?.();
          if (cur && pendingDy !== 0) {
            const scale = 1 + pendingDy / AXIS_DRAG_Y_PX;
            const newRange = cur.range * Math.max(scale, 0.05);
            const difRange = (newRange - cur.range) / 2;
            const newFrom = cur.from - difRange;
            const newTo = cur.to + difRange;
            const newRealFrom = yAxis.convertToRealValue(newFrom);
            const newRealTo = yAxis.convertToRealValue(newTo);
            yAxis.setAutoCalcTickFlag?.(false);
            yAxis.setRange({
              from: newFrom,
              to: newTo,
              range: newRange,
              realFrom: newRealFrom,
              realTo: newRealTo,
              realRange: newRealTo - newRealFrom,
            });
            chart.adjustPaneViewport(false, true, true, true);
          }
        });
      }
    }
  };

  const performMainPaneVerticalPan = (evInstance, downWidget, pageY) => {
    try {
      const pane = downWidget.getPane?.();
      const yAxis = pane?.getAxisComponent?.();
      if (!yAxis) return;

      if (evInstance.__omniYLastPanePageY == null) {
        evInstance.__omniYLastPanePageY = pageY;
        return;
      }

      const dy = pageY - evInstance.__omniYLastPanePageY;
      evInstance.__omniYLastPanePageY = pageY;
      evInstance.__omniPendingPaneDy = (evInstance.__omniPendingPaneDy || 0) + dy;
      if (evInstance.__omniPaneRaf == null && evInstance.__omniPendingPaneDy !== 0) {
        evInstance.__omniPaneRaf = requestAnimationFrame(() => {
          evInstance.__omniPaneRaf = null;
          const pendingDy = evInstance.__omniPendingPaneDy || 0;
          evInstance.__omniPendingPaneDy = 0;
          const cur = yAxis.getRange?.();
          const paneHeight = pane?.getBounding?.()?.height || 300;
          if (cur && pendingDy !== 0 && paneHeight > 0) {
            const deltaPrice = (pendingDy / paneHeight) * cur.range;
            const newFrom = cur.from + deltaPrice;
            const newTo = cur.to + deltaPrice;
            const newRealFrom = yAxis.convertToRealValue(newFrom);
            const newRealTo = yAxis.convertToRealValue(newTo);
            yAxis.setAutoCalcTickFlag?.(false);
            yAxis.setRange({
              from: newFrom,
              to: newTo,
              range: cur.range,
              realFrom: newRealFrom,
              realTo: newRealTo,
              realRange: newRealTo - newRealFrom,
            });
            chart.adjustPaneViewport(false, true, true, true);
          }
        });
      }
    } catch {}
  };

  const origPressedMove = ev.pressedMouseMoveEvent?.bind(ev);
  const origMouseUp = ev.mouseUpEvent?.bind(ev);
  if (origMouseUp) {
    ev.mouseUpEvent = function (e) {
      this.__omniXLastPageX = null;
      this.__omniYLastPageY = null;
      this.__omniYLastPanePageY = null;
      return origMouseUp(e);
    };
  }
  if (origPressedMove) {
    ev.pressedMouseMoveEvent = function (e) {
      const down = this._mouseDownWidget;
      const name = down?.getName?.();
      if (name === 'xAxis') {
        const consumed = down.dispatchEvent('pressedMouseMoveEvent', this._makeWidgetEvent(e, down));
        if (!consumed) {
          const event = this._makeWidgetEvent(e, down);
          performXAxisDrag(this, down, event.pageX);
        } else {
          this._chart.updatePane(1);
        }
        return true;
      }
      if (name === 'yAxis') {
        const event = this._makeWidgetEvent(e, down);
        const consumed = down.dispatchEvent('pressedMouseMoveEvent', event);
        if (!consumed) {
          performYAxisDrag(this, down, event.pageY);
        } else {
          this._chart.updatePane(1);
        }
        return true;
      }
      if (down) {
        const event = this._makeWidgetEvent(e, down);
        if (event?.pageY != null) {
          performMainPaneVerticalPan(this, down, event.pageY);
        }
      }
      return origPressedMove(e);
    };
  }

  const handleTouchMovePane = function (e) {
    const down = this._mouseDownWidget;
    const name = down?.getName?.();
    if (name === 'xAxis' || name === 'yAxis') {
      const touch = e.touches?.[0] || e.targetTouches?.[0] || e;
      const pageX = touch.pageX ?? touch.clientX;
      const pageY = touch.pageY ?? touch.clientY;
      if (pageX != null && pageY != null) {
        if (name === 'xAxis') performXAxisDrag(this, down, pageX);
        if (name === 'yAxis') performYAxisDrag(this, down, pageY);
        return true;
      }
    } else if (down) {
      const touch = e.touches?.[0] || e.targetTouches?.[0] || e;
      const pageY = touch.pageY ?? touch.clientY;
      if (pageY != null) {
        performMainPaneVerticalPan(this, down, pageY);
      }
    }
    return false;
  };

  const origPressedTouchMove = ev.pressedTouchMoveEvent?.bind(ev);
  ev.pressedTouchMoveEvent = function (e) {
    if (handleTouchMovePane.call(this, e)) return true;
    return origPressedTouchMove ? origPressedTouchMove(e) : false;
  };

  const origTouchMove = ev.touchMoveEvent?.bind(ev);
  ev.touchMoveEvent = function (e) {
    if (handleTouchMovePane.call(this, e)) return true;
    return origTouchMove ? origTouchMove(e) : false;
  };

  const origTouchStart = ev.touchStartEvent?.bind(ev);
  ev.touchStartEvent = function (e) {
    const hit = origFind(e);
    this._mouseDownWidget = hit?.widget ?? null;
    const touch = e.touches?.[0] || e.targetTouches?.[0] || e;
    if (touch) {
      this.__omniXLastPageX = touch.pageX ?? touch.clientX;
      this.__omniYLastPageY = touch.pageY ?? touch.clientY;
      this.__omniYLastPanePageY = touch.pageY ?? touch.clientY;
    }
    return origTouchStart ? origTouchStart(e) : false;
  };

  const origTouchEnd = ev.touchEndEvent?.bind(ev);
  ev.touchEndEvent = function (e) {
    this.__omniXLastPageX = null;
    this.__omniYLastPageY = null;
    this.__omniYLastPanePageY = null;
    const result = origTouchEnd ? origTouchEnd(e) : false;
    this._mouseDownWidget = null;
    return result;
  };

  // Document mousemove while drawing so preview continues outside the chart
  const syn = ev._event;
  if (!syn?._target) return;

  const docEl = syn._target.ownerDocument.documentElement;
  let docMoveHandler = null;

  const stopDrawingDocMove = () => {
    if (!docMoveHandler) return;
    docEl.removeEventListener('mousemove', docMoveHandler, true);
    docMoveHandler = null;
  };

  const startDrawingDocMove = () => {
    if (docMoveHandler) return;
    docMoveHandler = (moveEvent) => {
      const store = getOverlayStore();
      if (!store?.isDrawing()) {
        stopDrawingDocMove();
        return;
      }
      if (syn._target.contains(moveEvent.target)) return;
      if (syn._mousePressed) return;
      syn._mouseMoveHandler(moveEvent);
    };
    docEl.addEventListener('mousemove', docMoveHandler, true);
  };

  if (typeof chart.createOverlay === 'function') {
    const origCreateOverlay = chart.createOverlay.bind(chart);
    chart.createOverlay = (...args) => {
      const result = origCreateOverlay(...args);
      queueMicrotask(() => {
        if (getOverlayStore()?.isDrawing()) startDrawingDocMove();
      });
      return result;
    };
  }

  const origMouseMoveEvent = ev.mouseMoveEvent?.bind(ev);
  if (origMouseMoveEvent) {
    ev.mouseMoveEvent = function (e) {
      if (getOverlayStore()?.isDrawing()) startDrawingDocMove();
      return origMouseMoveEvent(e);
    };
  }

  const origMouseClickEvent = ev.mouseClickEvent?.bind(ev);
  if (origMouseClickEvent) {
    ev.mouseClickEvent = function (e) {
      const result = origMouseClickEvent(e);
      if (getOverlayStore()?.isDrawing()) startDrawingDocMove();
      else stopDrawingDocMove();
      return result;
    };
  }
}

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

function softenDrawColor(color, alpha = 0.42) {
  if (!color) return `rgba(234,179,8,${alpha})`;
  const raw = String(color).trim();
  const rgb = raw.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  if (rgb) return `rgba(${rgb[1]},${rgb[2]},${rgb[3]},${alpha})`;
  const h = raw.replace('#', '');
  if (h.length < 6) return raw;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return raw;
  return `rgba(${r},${g},${b},${alpha})`;
}

function axisProjectionFigures(coordinates, bounding, overlay, { skipHorizontal = false, skipVertical = false } = {}) {
  if (!coordinates?.length || !bounding) return [];
  const color = softenDrawColor(overlay?.styles?.line?.color || '#EAB308', 0.45);
  const dashStyle = { style: 'dashed', color, size: 1, dashedValue: [5, 4] };
  const figs = [];
  coordinates.forEach((c) => {
    if (c?.x == null || c?.y == null) return;
    if (!skipHorizontal) {
      figs.push({
        type: 'line',
        ignoreEvent: true,
        styles: dashStyle,
        attrs: { coordinates: [{ x: c.x, y: c.y }, { x: bounding.width, y: c.y }] },
      });
    }
    if (!skipVertical) {
      figs.push({
        type: 'line',
        ignoreEvent: true,
        styles: dashStyle,
        attrs: { coordinates: [{ x: c.x, y: c.y }, { x: c.x, y: bounding.height }] },
      });
    }
  });
  return figs;
}

function linearYFromCoordinates(c0, c1, targetX) {
  if (c1.x === c0.x) return c0.y;
  return c0.y + ((c1.y - c0.y) / (c1.x - c0.x)) * (targetX - c0.x);
}

let _drawOverlaysRegistered = false;
if (!_drawOverlaysRegistered) {
  _drawOverlaysRegistered = true;
  try {
    registerOverlay({
      name: 'segment',
      totalStep: 3,
      needDefaultPointFigure: true,
      needDefaultXAxisFigure: true,
      needDefaultYAxisFigure: true,
      createPointFigures: ({ coordinates, bounding, overlay }) => {
        const figs = [];
        if (coordinates.length === 2) {
          figs.push({ type: 'line', attrs: { coordinates } });
        }
        figs.push(...axisProjectionFigures(coordinates, bounding, overlay));
        return figs;
      },
    });
    registerOverlay({
      name: 'straightLine',
      totalStep: 3,
      needDefaultPointFigure: true,
      needDefaultXAxisFigure: true,
      needDefaultYAxisFigure: true,
      createPointFigures: ({ coordinates, bounding, overlay }) => {
        const figs = [];
        if (coordinates.length === 2) {
          if (coordinates[0].x === coordinates[1].x) {
            figs.push({
              type: 'line',
              attrs: {
                coordinates: [
                  { x: coordinates[0].x, y: 0 },
                  { x: coordinates[0].x, y: bounding.height },
                ],
              },
            });
          } else {
            figs.push({
              type: 'line',
              attrs: {
                coordinates: [
                  { x: 0, y: linearYFromCoordinates(coordinates[0], coordinates[1], 0) },
                  { x: bounding.width, y: linearYFromCoordinates(coordinates[0], coordinates[1], bounding.width) },
                ],
              },
            });
          }
        }
        figs.push(...axisProjectionFigures(coordinates, bounding, overlay));
        return figs;
      },
    });
    registerOverlay({
      name: 'horizontalStraightLine',
      totalStep: 2,
      needDefaultPointFigure: true,
      needDefaultXAxisFigure: true,
      needDefaultYAxisFigure: true,
      createPointFigures: ({ coordinates, bounding, overlay }) => {
        const figs = [];
        if (coordinates.length > 0) {
          figs.push({
            type: 'line',
            attrs: {
              coordinates: [
                { x: 0, y: coordinates[0].y },
                { x: bounding.width, y: coordinates[0].y },
              ],
            },
          });
          figs.push(...axisProjectionFigures(coordinates, bounding, overlay, { skipHorizontal: true }));
        }
        return figs;
      },
    });
  } catch (e) { /* already registered / hot reload */ }
}

try {
    registerOverlay({
      name: 'omniForecastCandle',
      totalStep: 2,
      lock: true,
      needDefaultPointFigure: false,
      needDefaultXAxisFigure: false,
      needDefaultYAxisFigure: false,
      createPointFigures: ({ coordinates, bounding, barSpace, overlay }) => {
        if (coordinates.length < 3) return [];
        const [anchorPoint, highPoint, lowPoint] = coordinates;
        const meta = overlay.extendData || {};
        // Match KLineCharts' real candle body width at every zoom level.
        const width = Math.max(3, barSpace.gapBar - 1);
        const x = anchorPoint.x - width / 2;
        const top = Math.min(highPoint.y, anchorPoint.y);
        const bottom = Math.max(lowPoint.y, anchorPoint.y);
        const upHeight = Math.max(anchorPoint.y - top, 1);
        const downHeight = Math.max(bottom - anchorPoint.y, 1);
        const compact = bounding.width < 620;
        const probabilityFontSize = compact ? 11 : 12;
        const probabilityLabelWidth = compact ? 42 : 46;
        const probabilityLabelHeight = probabilityFontSize + 8;
        const canPlaceUpInside = width >= probabilityLabelWidth && upHeight >= probabilityLabelHeight;
        const canPlaceDownInside = width >= probabilityLabelWidth && downHeight >= probabilityLabelHeight;
        const hasProbabilityRoomRight = bounding.width - (x + width) >= probabilityLabelWidth + 8;
        const outsideProbabilityX = hasProbabilityRoomRight
          ? x + width + 5
          : anchorPoint.x;
        const outsideProbabilityAlign = hasProbabilityRoomRight ? 'left' : 'center';
        const upLabelPosition = canPlaceUpInside
          ? { x: anchorPoint.x, y: top + upHeight / 2, align: 'center', baseline: 'middle' }
          : { x: outsideProbabilityX, y: top, align: outsideProbabilityAlign, baseline: 'bottom' };
        const downLabelPosition = canPlaceDownInside
          ? { x: anchorPoint.x, y: anchorPoint.y + downHeight / 2, align: 'center', baseline: 'middle' }
          : { x: outsideProbabilityX, y: bottom, align: outsideProbabilityAlign, baseline: 'top' };
        const roomOnRight = bounding.width - anchorPoint.x > (compact ? 105 : 220);
        const labelX = roomOnRight ? anchorPoint.x + width / 2 + 7 : anchorPoint.x - width / 2 - 7;
        const labelAlign = roomOnRight ? 'left' : 'right';
        const summary = compact ? meta.compactLabel : meta.fullLabel;
        const labelY = compact
          ? Math.min(Math.max(22, top + 16), bounding.height - 18)
          : Math.max(18, top - 25);
        const probabilityLabelBackground = meta.isDark
          ? 'rgba(15,23,42,0.92)'
          : 'rgba(255,255,255,0.96)';
        const probabilityUpColor = meta.isDark ? '#34D399' : '#047857';
        const probabilityDownColor = meta.isDark ? '#FB7185' : '#DC2626';
        const forecastBorderColor = meta.isDark ? '#FACC15' : '#CA8A04';
        return [
          {
            key: 'forecast-up',
            type: 'rect',
            attrs: { x, y: top, width, height: upHeight },
            styles: { style: 'fill', color: 'rgba(8,153,129,0.42)', borderRadius: 1 },
            ignoreEvent: true,
          },
          {
            key: 'forecast-down',
            type: 'rect',
            attrs: { x, y: anchorPoint.y, width, height: downHeight },
            styles: { style: 'fill', color: 'rgba(242,54,69,0.42)', borderRadius: 1 },
            ignoreEvent: true,
          },
          {
            key: 'forecast-border',
            type: 'rect',
            attrs: { x, y: top, width, height: Math.max(bottom - top, 2) },
            styles: {
              style: 'stroke',
              borderColor: forecastBorderColor,
              borderSize: meta.isDark ? 1.5 : 2,
              borderStyle: 'dashed',
              borderDashedValue: meta.isDark ? [5, 3] : [6, 3],
              borderRadius: 1,
            },
            ignoreEvent: true,
          },
          {
            key: 'forecast-anchor',
            type: 'line',
            attrs: {
              coordinates: [
                { x: anchorPoint.x - width / 2 - 2, y: anchorPoint.y },
                { x: anchorPoint.x + width / 2 + 2, y: anchorPoint.y },
              ],
            },
            styles: {
              style: 'dashed',
              color: forecastBorderColor,
              size: meta.isDark ? 1 : 1.5,
              dashedValue: [3, 2],
            },
            ignoreEvent: true,
          },
          {
            key: 'forecast-up-label',
            type: 'text',
            attrs: { ...upLabelPosition, text: `↑${meta.upProbability}%` },
            styles: {
              style: 'fill',
              color: probabilityUpColor,
              size: probabilityFontSize,
              family: 'Segoe UI, Arial, sans-serif',
              weight: '700',
              backgroundColor: probabilityLabelBackground,
              borderColor: meta.isDark ? 'rgba(52,211,153,0.55)' : 'rgba(4,120,87,0.35)',
              borderSize: 1,
              borderRadius: 3,
              paddingLeft: 5,
              paddingRight: 5,
              paddingTop: 3,
              paddingBottom: 3,
            },
            ignoreEvent: true,
          },
          {
            key: 'forecast-down-label',
            type: 'text',
            attrs: { ...downLabelPosition, text: `↓${meta.downProbability}%` },
            styles: {
              style: 'fill',
              color: probabilityDownColor,
              size: probabilityFontSize,
              family: 'Segoe UI, Arial, sans-serif',
              weight: '700',
              backgroundColor: probabilityLabelBackground,
              borderColor: meta.isDark ? 'rgba(251,113,133,0.55)' : 'rgba(220,38,38,0.35)',
              borderSize: 1,
              borderRadius: 3,
              paddingLeft: 5,
              paddingRight: 5,
              paddingTop: 3,
              paddingBottom: 3,
            },
            ignoreEvent: true,
          },
          {
            key: 'forecast-summary',
            type: 'text',
            attrs: { x: labelX, y: labelY, text: summary || '', align: labelAlign, baseline: 'bottom' },
            styles: {
              style: 'stroke_fill',
              color: meta.isDark ? '#F8FAFC' : '#0F172A',
              size: compact ? 11 : 12,
              family: 'Segoe UI, Arial, sans-serif',
              weight: '700',
              backgroundColor: meta.isDark ? 'rgba(15,23,42,0.92)' : 'rgba(255,255,255,0.94)',
              borderColor: forecastBorderColor,
              borderStyle: 'dashed',
              borderDashedValue: [5, 3],
              borderSize: meta.isDark ? 1 : 1.5,
              borderRadius: 3,
              paddingLeft: 7,
              paddingRight: 7,
              paddingTop: 4,
              paddingBottom: 4,
            },
            ignoreEvent: true,
          },
        ];
      },
    });
} catch { void 0; }

const MAIN_INDICATORS = [
  { key:'MA',          labelKey:'ma' },
  { key:'EMA',         labelKey:'ema' },
  { key:'BOLL_CUSTOM', labelKey:'boll' },
  { key:'CUSTOM_SAR',  labelKey:'sar' },
];
const SUB_INDICATORS = [
  { key:'VOL',  labelKey:'volume' },
  { key:'MACD', labelKey:'macd' },
  { key:'RSI',  labelKey:'rsi' },
  { key:'KDJ',  labelKey:'kdj' },
  { key:'CCI',  labelKey:'cci' },
  { key:'ATR',  labelKey:'atr' },
  { key:'OBV',  labelKey:'obv' },
  { key:'WR',   labelKey:'williamsR' },
];

const DRAW_TOOLS = [
  { name:'select',                 Icon:MousePointer,   titleKey:'toolSelect' },
  { name:'segment',                Icon:Pencil,         titleKey:'toolTrendline' },
  { name:'straightLine',           Icon:MoveHorizontal, titleKey:'toolInfiniteLine' },
  { name:'horizontalStraightLine', Icon:Minus,          titleKey:'toolHorizontal' },
  { name:'fibonacciLine',          Icon:Baseline,       titleKey:'toolFibonacci' },
  { name:'parallelStraightLine',   Icon:TrendingUp,     titleKey:'toolParallelChannel' },
];

 const STROKE_STYLES = [
  { val:'solid',  labelKey:'strokeSolid' },
  { val:'dashed', labelKey:'strokeDashed' },
  { val:'dotted', labelKey:'strokeDotted' },
];

const INTERVALS_MINUTE = ['1 phút','3 phút','5 phút','15 phút','30 phút'];
const INTERVALS_DAY    = ['1 giờ','2 giờ','4 giờ','1 ngày','1 tuần','1 tháng','1 năm'];
const CHART_TYPES = [
  {id:'candle_solid',     labelKey:'candleSolid'},
  {id:'candle_up_stroke', labelKey:'candleHollow'},
  {id:'candle_stroke',    labelKey:'candleStroke'},
  {id:'ohlc',             labelKey:'barChart'},
  {id:'area',             labelKey:'areaChart'},
  {id:'heikin_ashi',      labelKey:'heikinAshi'},
];
const OVERLAY_COLOR_PALETTE = [
  '#EAB308', '#FACC15', '#FF9600', '#F97316', '#EF4444', '#F23645',
  '#EC4899', '#A855F7', '#8B5CF6', '#6366F1', '#2196F3', '#06B6D4',
  '#14B8A6', '#089981', '#22C55E', '#84CC16', '#64748B', '#FFFFFF',
];
const accentPalette = (first) => [first, ...OVERLAY_COLOR_PALETTE.filter(color => color !== first)];
const MA_PRESETS = Object.freeze({
  short: [5, 10, 20],
  long: [50, 100, 200],
  all: [5, 10, 20, 50, 100, 200],
});
const FORECAST_STORAGE_KEY = 'omni_chart_forecast_enabled';
const FORECAST_SYNC_EVENT = 'omniduck_chart_forecast_setting';
const MA_PRESET_STORAGE_KEY = 'omni_chart_ma_preset';
const clampVisibleColorCount = (count, total) => Math.max(1, Math.min(count || 1, total));
const STROKE_SIZES   = [1,2,3,4];

/** Accent: crypto=violet, vnstock/derivatives=yellow, international=teal */
const ACCENT = {
  violet: {
    solid: 'bg-violet-600',
    solidText: 'text-white',
    solidBorder: 'border-violet-600',
    idleBorder: 'border-violet-500/30',
    idleText: 'text-violet-400',
    idleTextLight: 'text-violet-600',
    hoverSolid: 'hover:bg-violet-600 hover:text-white hover:border-violet-600',
    rowHover: 'hover:bg-violet-600/80 hover:text-white',
    toolIdleDark: 'text-slate-500 hover:bg-white/8 hover:text-violet-400',
    toolIdleLight: 'text-slate-500 hover:bg-violet-500/20 hover:text-violet-700',
    toolShadow: 'shadow-md shadow-violet-600/30',
    strokeIdleDark: 'text-slate-400 hover:text-violet-400',
    strokeIdleLight: 'text-slate-500 hover:text-violet-600',
    selectedTextDark: 'text-violet-400',
    selectedTextLight: 'text-violet-600',
    defaultOverlay: '#8B5CF6',
    overlayColors: accentPalette('#8B5CF6'),
  },
  yellow: {
    solid: 'bg-yellow-500',
    solidText: 'text-black',
    solidBorder: 'border-yellow-500',
    idleBorder: 'border-yellow-500/35',
    idleText: 'text-yellow-400',
    idleTextLight: 'text-yellow-600',
    hoverSolid: 'hover:bg-yellow-500 hover:text-black hover:border-yellow-500',
    rowHover: 'hover:bg-yellow-500/90 hover:text-black',
    toolIdleDark: 'text-slate-500 hover:bg-white/8 hover:text-yellow-400',
    toolIdleLight: 'text-slate-500 hover:bg-yellow-500/20 hover:text-yellow-700',
    toolShadow: 'shadow-md shadow-yellow-500/30',
    strokeIdleDark: 'text-slate-400 hover:text-yellow-400',
    strokeIdleLight: 'text-slate-500 hover:text-yellow-600',
    selectedTextDark: 'text-yellow-400',
    selectedTextLight: 'text-yellow-600',
    defaultOverlay: '#EAB308',
    overlayColors: accentPalette('#EAB308'),
  },
  teal: {
    solid: 'bg-teal-600',
    solidText: 'text-white',
    solidBorder: 'border-teal-600',
    idleBorder: 'border-teal-500/30',
    idleText: 'text-teal-400',
    idleTextLight: 'text-teal-600',
    hoverSolid: 'hover:bg-teal-600 hover:text-white hover:border-teal-600',
    rowHover: 'hover:bg-teal-600/80 hover:text-white',
    toolIdleDark: 'text-slate-500 hover:bg-white/8 hover:text-teal-400',
    toolIdleLight: 'text-slate-500 hover:bg-teal-500/20 hover:text-teal-700',
    toolShadow: 'shadow-md shadow-teal-600/30',
    strokeIdleDark: 'text-slate-400 hover:text-teal-400',
    strokeIdleLight: 'text-slate-500 hover:text-teal-600',
    selectedTextDark: 'text-teal-400',
    selectedTextLight: 'text-teal-600',
    defaultOverlay: '#14B8A6',
    overlayColors: accentPalette('#14B8A6'),
  },
};

export default React.memo(function TradingChart({
  data,
  theme,
  onIntervalChange,
  currentInterval,
  isMini = false,
  suppressResizeRef = null,
  accent = 'violet',
  /** Ultra mode: cho phép cuộn trang khi hover chart (tắt zoom bánh xe) */
  allowPageScroll = false,
}) {
  const { t, i18n } = useTranslation('chart');
  const lang = i18n.language === 'en' ? 'en' : 'vi';
  const A = ACCENT[accent] || ACCENT.violet;
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
  const overlayColorRef     = useRef(A.defaultOverlay);
  const paletteContainerRef = useRef(null);
  const forecastOverlayIdRef = useRef(null);
  const forecastPreviousOffsetRef = useRef(null);
  const forecastAppliedOffsetRef = useRef(null);
  const forecastResultRef = useRef(null);
  const chartInteractionActiveRef = useRef(false);
  const chartPointerActiveRef = useRef(false);
  const chartInteractionTimerRef = useRef(null);
  const pendingChartDataRef = useRef(false);
  const rawDataRef = useRef([]);
  const displayDataRef = useRef([]);
  const appliedSeriesRef = useRef({ chartType: null, interval: null, data: [] });

  const outerWrapperRef = useRef(null);
  const nativeFullscreenRef = useRef(false);
  const landscapeFullscreenRef = useRef(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);

  const exitFullscreen = useCallback(async () => {
    const wrapper = outerWrapperRef.current;
    if (document.fullscreenElement === wrapper && document.exitFullscreen) {
      try { await document.exitFullscreen(); } catch {}
    }
    nativeFullscreenRef.current = false;
    landscapeFullscreenRef.current = false;
    setIsFullscreen(false);
    setIsLandscape(false);
    try { window.screen.orientation?.unlock?.(); } catch {}
  }, []);

  const requestNativeFullscreen = useCallback(async () => {
    const wrapper = outerWrapperRef.current;
    if (!wrapper?.requestFullscreen) return false;
    try {
      await wrapper.requestFullscreen();
      nativeFullscreenRef.current = document.fullscreenElement === wrapper;
      return nativeFullscreenRef.current;
    } catch {
      return false;
    }
  }, []);

  // Android can use native fullscreen (needed for orientation lock). iOS and
  // embedded WebViews fall back to the same CSS fullscreen layout instead.
  const toggleFullscreen = useCallback(async () => {
    if (isFullscreen && !isLandscape) {
      await exitFullscreen();
    } else {
      if (isLandscape) {
        try { window.screen.orientation?.unlock?.(); } catch {}
      }
      flushSync(() => {
        setIsFullscreen(true);
        setIsLandscape(false);
      });
      landscapeFullscreenRef.current = false;
      await requestNativeFullscreen();
    }
  }, [exitFullscreen, isFullscreen, isLandscape, requestNativeFullscreen]);

  const toggleLandscapeFullscreen = useCallback(async () => {
    if (isFullscreen && isLandscape) {
      await exitFullscreen();
      return;
    }
    // Commit the chart-only overlay before requesting fullscreen/orientation.
    // This prevents Android from showing the underlying app during rotation.
    flushSync(() => {
      setIsFullscreen(true);
      setIsLandscape(true);
    });
    landscapeFullscreenRef.current = true;
    const isNativeFullscreen = await requestNativeFullscreen();
    // Orientation lock requires native fullscreen in Chromium. iOS safely
    // remains in the expanded CSS layout when this API is unavailable.
    if (isNativeFullscreen) {
      try { await window.screen.orientation?.lock?.('landscape'); } catch {}
    }
  }, [exitFullscreen, isFullscreen, isLandscape, requestNativeFullscreen]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const isNativeFullscreen = document.fullscreenElement === outerWrapperRef.current;
      if (nativeFullscreenRef.current && !isNativeFullscreen) {
        nativeFullscreenRef.current = false;
        // Some Android browsers release native fullscreen while applying the
        // orientation lock. Keep the chart-only CSS fullscreen in that case
        // instead of falling back to the rotated full application.
        if (!landscapeFullscreenRef.current) {
          setIsFullscreen(false);
          setIsLandscape(false);
          try { window.screen.orientation?.unlock?.(); } catch {}
        }
      } else {
        nativeFullscreenRef.current = isNativeFullscreen;
      }
      requestAnimationFrame(() => chartInstance.current?.resize?.());
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const [interval,          setInterval]          = useState(currentInterval || '1 ngày');
  const [showIntervalMenu,  setShowIntervalMenu]   = useState(false);
  const [showTypeMenu,      setShowTypeMenu]       = useState(false);
  const [showIndicatorMenu, setShowIndicatorMenu]  = useState(false);
  const [showStrokePanel,   setShowStrokePanel]    = useState(false);
  const [chartType,         setChartType]          = useState('candle_solid');
  const [activeMain,        setActiveMain]         = useState([]);
  const [activeSub,         setActiveSub]          = useState(['VOL']);
  const [activeOverlay,     setActiveOverlay]      = useState(null);
  const [overlayColor,      setOverlayColor]       = useState(A.defaultOverlay);
  const [strokeSize,        setStrokeSize]         = useState(2);
  const [strokeStyle,       setStrokeStyle]        = useState('solid');
  const [activeTool,        setActiveTool]         = useState('select');
  const [forecastEnabled, setForecastEnabled] = useState(() => {
    try {
      const saved = localStorage.getItem(FORECAST_STORAGE_KEY);
      return saved == null ? true : saved === 'true';
    } catch {
      return true;
    }
  });
  const [forecastResult, setForecastResult] = useState(null);
  const [pendingDataRevision, setPendingDataRevision] = useState(0);
  const [maPreset, setMaPreset] = useState(() => {
    try {
      const saved = localStorage.getItem(MA_PRESET_STORAGE_KEY);
      return MA_PRESETS[saved] ? saved : 'short';
    } catch {
      return 'short';
    }
  });
  const [visibleColorCount, setVisibleColorCount] = useState(A.overlayColors.length);

  const isDark = theme === 'dark';
  const anyMenuOpen = showIntervalMenu || showTypeMenu || showIndicatorMenu || showStrokePanel;

  useEffect(() => {
    const next = (ACCENT[accent] || ACCENT.violet).defaultOverlay;
    setOverlayColor(next);
    overlayColorRef.current = next;
    setVisibleColorCount((ACCENT[accent] || ACCENT.violet).overlayColors.length);
  }, [accent]);

  useEffect(() => {
    const onForecastSync = (event) => setForecastEnabled(Boolean(event.detail?.enabled));
    const onStorage = (event) => {
      if (event.key === FORECAST_STORAGE_KEY) setForecastEnabled(event.newValue !== 'false');
    };
    window.addEventListener(FORECAST_SYNC_EVENT, onForecastSync);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(FORECAST_SYNC_EVENT, onForecastSync);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  useEffect(() => {
    const element = paletteContainerRef.current;
    if (!element) return undefined;
    const updateCount = () => {
      const swatchSlot = window.innerWidth < 640 ? 23 : 27;
      const next = clampVisibleColorCount(Math.floor(element.clientWidth / swatchSlot), A.overlayColors.length);
      setVisibleColorCount(next);
    };
    const observer = new ResizeObserver(updateCount);
    observer.observe(element);
    updateCount();
    return () => observer.disconnect();
  }, [A.overlayColors]);

   useEffect(() => { overlayColorRef.current = overlayColor; }, [overlayColor]);
  useEffect(() => { strokeSizeRef.current   = strokeSize;   }, [strokeSize]);
  useEffect(() => { strokeStyleRef.current  = strokeStyle;  }, [strokeStyle]);

  useEffect(() => {
    if (currentInterval && currentInterval !== interval) setInterval(currentInterval);
  }, [currentInterval]);

  useEffect(() => {
    document.body.style.overflow = isFullscreen ? 'hidden' : '';
    const resizeChart = () => {
      requestAnimationFrame(() => chartInstance.current?.resize?.());
    };

    // A second frame lets mobile browsers finish updating the visual viewport
    // before KLineChart measures its canvas.
    resizeChart();
    const timer = window.setTimeout(resizeChart, 180);
    window.addEventListener('orientationchange', resizeChart);
    window.visualViewport?.addEventListener('resize', resizeChart);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('orientationchange', resizeChart);
      window.visualViewport?.removeEventListener('resize', resizeChart);
      document.body.style.overflow = '';
    };
  }, [isFullscreen, isLandscape]);

  const closeAllMenus = useCallback(() => {
    setShowIntervalMenu(false); setShowTypeMenu(false);
    setShowIndicatorMenu(false); setShowStrokePanel(false);
  }, []);
  const handleForecastToggle = useCallback(() => {
    const next = !forecastEnabled;
    setForecastEnabled(next);
    try { localStorage.setItem(FORECAST_STORAGE_KEY, String(next)); } catch { /* storage unavailable */ }
    window.dispatchEvent(new CustomEvent(FORECAST_SYNC_EVENT, { detail: { enabled: next } }));
  }, [forecastEnabled]);
  const handleScrollLeft  = useCallback(() => chartInstance.current?.scrollByDistance(chartInstance.current.getBarSpace()), []);
  const handleScrollRight = useCallback(() => chartInstance.current?.scrollByDistance(-chartInstance.current.getBarSpace()), []);
  const handleResetChart  = useCallback(() => { chartInstance.current?.setBarSpace(6); chartInstance.current?.scrollToRealTime(); }, []);
  const handleZoomIn  = useCallback(() => chartInstance.current?.zoomAtCoordinate?.(1), []);
  const handleZoomOut = useCallback(() => chartInstance.current?.zoomAtCoordinate?.(-1), []);
  const interactivePaneOptions = useCallback((id, height) => ({
    id,
    ...(height ? { height } : {}),
    minHeight: 80,
    dragEnabled: true,
    axisOptions: { scrollZoomEnabled: true }
  }), []);
  const buildOverlayStyles = useCallback((color, size, style) => {
    const hex = String(color || '#EAB308').replace('#', '');
    let textColor = '#FFFFFF';
    if (hex.length >= 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      textColor = lum > 0.62 ? '#0F172A' : '#FFFFFF';
    }
    const label = {
      color: textColor,
      backgroundColor: color,
      borderColor: color,
      borderSize: 1,
      borderRadius: 3,
      size: 11,
      family: 'Inter, sans-serif',
      weight: '600',
      paddingLeft: 6,
      paddingRight: 6,
      paddingTop: 3,
      paddingBottom: 3,
    };
    return {
      line: { color, size, style },
      polygon: { style: 'stroke_fill', color, borderColor: color, fill: { color: `${color}18` } },
      arc: { style: 'stroke_fill', color, size },
      point: {
        color,
        borderColor: `${color}80`,
        activeColor: color,
        activeBorderColor: `${color}cc`,
      },
      text: label,
      rectText: label,
    };
  }, []);

  // removeOverlay() with no id clears ALL drawings — cancel progress by id only
  const cancelProgressOverlay = useCallback(() => {
    const chart = chartInstance.current;
    if (!chart) return;
    try {
      const id = chart.getChartStore?.().getOverlayStore?.().getProgressInstanceInfo?.()?.instance?.id;
      if (id) chart.removeOverlay({ id });
    } catch { /* ignore */ }
  }, []);

  const applyStylesToProgressOverlay = useCallback((color, size, style) => {
    const chart = chartInstance.current;
    if (!chart) return;
    const styles = buildOverlayStyles(color, size, style);
    try {
      const store = chart.getChartStore?.().getOverlayStore?.();
      const progressId = store?.getProgressInstanceInfo?.()?.instance?.id;
      if (progressId) {
        chart.overrideOverlay({ id: progressId, styles });
      }
    } catch { /* ignore */ }
  }, [buildOverlayStyles]);

  const spawnOverlay = useCallback((toolName) => {
    if (!chartInstance.current) return;
    const color = overlayColorRef.current;
    const size  = strokeSizeRef.current;
    const style = strokeStyleRef.current;

    chartInstance.current.createOverlay({
      name: toolName,
      lock: false,
      styles: buildOverlayStyles(color, size, style),
      onDrawEnd: () => {
        setTimeout(() => {
          if (activeToolRef.current === toolName) spawnOverlay(toolName);
        }, 80);
        return true;
      },
      onSelected:   (info) => { if (info) setActiveOverlay({ id: info.overlay?.id || info.id }); },
      onDeselected: () => setActiveOverlay(null)
    });
  }, [buildOverlayStyles]);

  const handleActivateTool = useCallback((toolName) => {
    cancelProgressOverlay();
    activeToolRef.current = toolName;
    setActiveTool(toolName);
    setActiveOverlay(null);
    if (toolName === 'select') return;
    spawnOverlay(toolName);
  }, [cancelProgressOverlay, spawnOverlay]);

  const handleOverlayColorChange = useCallback((hex) => {
    setOverlayColor(hex);
    overlayColorRef.current = hex;
    applyStylesToProgressOverlay(hex, strokeSizeRef.current, strokeStyleRef.current);
  }, [applyStylesToProgressOverlay]);

  const handleStrokeSizeChange = useCallback((s) => {
    setStrokeSize(s);
    strokeSizeRef.current = s;
    applyStylesToProgressOverlay(overlayColorRef.current, s, strokeStyleRef.current);
  }, [applyStylesToProgressOverlay]);

  const handleStrokeStyleChange = useCallback((val) => {
    setStrokeStyle(val);
    strokeStyleRef.current = val;
    applyStylesToProgressOverlay(overlayColorRef.current, strokeSizeRef.current, val);
  }, [applyStylesToProgressOverlay]);

  const toggleIndicator = useCallback((name, isMain) => {
    if (!chartInstance.current) return;
    if (isMain) {
      if (activeMain.includes(name)) {
        chartInstance.current.removeIndicator('candle_pane', name);
        setActiveMain(p => p.filter(n => n !== name));
      } else {
        const indicator = name === 'MA' ? { name: 'MA', calcParams: MA_PRESETS[maPreset] } : name;
        chartInstance.current.createIndicator(indicator, true, interactivePaneOptions('candle_pane'));
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
  }, [activeMain, activeSub, interactivePaneOptions, maPreset]);

  const handleMaPresetChange = useCallback((preset) => {
    if (!MA_PRESETS[preset]) return;
    setMaPreset(preset);
    try { localStorage.setItem(MA_PRESET_STORAGE_KEY, preset); } catch { /* storage unavailable */ }
    if (activeMain.includes('MA')) {
      chartInstance.current?.overrideIndicator(
        { name: 'MA', calcParams: MA_PRESETS[preset] },
        'candle_pane',
      );
    }
  }, [activeMain]);

  useEffect(() => {
    if (!chartContainerRef.current) return;
    if (!chartInstance.current) {
      chartInstance.current = init(chartContainerRef.current);
      patchKlineDragCapture(chartInstance.current);
      chartInstance.current.setScrollEnabled(true);
      chartInstance.current.setZoomEnabled(true);
      chartInstance.current.setPaneOptions(interactivePaneOptions('candle_pane'));
      chartInstance.current.createIndicator({ name:'TV_VOL_OVERLAY', calcParams:[true] }, true, interactivePaneOptions('candle_pane'));
      activeSub.forEach(ind => {
        if (ind !== 'VOL') chartInstance.current.createIndicator(ind, false, interactivePaneOptions(`pane_${ind}`, 120));
      });
    }
    patchKlineExtendedZoom(chartInstance.current);
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
        const monthLabel = lang === 'en'
          ? d.toLocaleString('en-US', { month: 'short' })
          : `Tháng ${mm}`;
        if (type===2 || type==='xAxis') {
          switch(format) {
            case 'YYYY':        return `${yyyy}`;
            case 'YYYY-MM':     return lang === 'en' ? `${monthLabel} ${yyyy}` : `Tháng ${mm}, ${yyyy}`;
            case 'MM-DD':       return `${dd}/${mms}`;
            case 'YYYY-MM-DD':  return `${dd}/${mms}/${yy}`;
            case 'HH:mm':       return `${hh}:${min}`;
            case 'MM-DD HH:mm': return `${dd}/${mms} ${hh}:${min}`;
            default:            return `${dd}/${mms}`;
          }
        }
        const isDaily = (hh==='07'&&min==='00')||(hh==='00'&&min==='00');
        if (lang === 'en') {
          return isDaily
            ? `${monthLabel} ${dd}, ${yyyy}`
            : `${monthLabel} ${dd}, ${yyyy} ${hh}:${min}`;
        }
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
        margin: { top:0.2, bottom:forecastEnabled ? 0.15 : 0.05 },
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
          { style:'solid', size:1.5, color:'#01C5C4' },
          { style:'solid', size:1.5, color:'#22C55E' }
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
        polygon: { style:'stroke_fill', color:'#FF9600', fill:{ color:'rgba(255,150,0,0.08)' } },
        text: {
          color: '#F8FAFC',
          size: 11,
          family: 'Inter, sans-serif',
          weight: '600',
          backgroundColor: isDark ? 'rgba(15,23,42,0.92)' : 'rgba(15,23,42,0.88)',
          borderColor: '#FF9600',
          borderSize: 1,
          borderRadius: 3,
          paddingLeft: 6, paddingRight: 6, paddingTop: 3, paddingBottom: 3,
        },
        rectText: {
          color: '#F8FAFC',
          size: 11,
          family: 'Inter, sans-serif',
          weight: '600',
          backgroundColor: isDark ? 'rgba(15,23,42,0.92)' : 'rgba(15,23,42,0.88)',
          borderColor: '#FF9600',
          borderSize: 1,
          borderRadius: 3,
          paddingLeft: 6, paddingRight: 6, paddingTop: 3, paddingBottom: 3,
        },
      }
    });

  }, [theme, isDark, chartType, interactivePaneOptions, lang, forecastEnabled]);

  useEffect(() => {
    const chart = chartInstance.current;
    const container = chartContainerRef.current;
    if (!chart || !container) return undefined;

    const clearSettleTimer = () => {
      if (chartInteractionTimerRef.current != null) {
        window.clearTimeout(chartInteractionTimerRef.current);
        chartInteractionTimerRef.current = null;
      }
    };
    const finishInteraction = () => {
      if (chartPointerActiveRef.current) return;
      chartInteractionActiveRef.current = false;
      chartInteractionTimerRef.current = null;
      if (pendingChartDataRef.current) {
        pendingChartDataRef.current = false;
        setPendingDataRevision(revision => revision + 1);
      }
    };
    const scheduleInteractionFinish = () => {
      clearSettleTimer();
      chartInteractionTimerRef.current = window.setTimeout(finishInteraction, 140);
    };
    const handlePointerDown = () => {
      clearSettleTimer();
      chartPointerActiveRef.current = true;
      chartInteractionActiveRef.current = true;
    };
    const handlePointerEnd = () => {
      if (!chartPointerActiveRef.current) return;
      chartPointerActiveRef.current = false;
      scheduleInteractionFinish();
    };
    const handleNavigation = () => {
      chartInteractionActiveRef.current = true;
      setActiveOverlay(current => current == null ? current : null);
      if (!chartPointerActiveRef.current) scheduleInteractionFinish();
    };

    container.addEventListener('pointerdown', handlePointerDown, { passive: true });
    window.addEventListener('pointerup', handlePointerEnd, { passive: true });
    window.addEventListener('pointercancel', handlePointerEnd, { passive: true });
    chart.subscribeAction('onScroll', handleNavigation);
    chart.subscribeAction('onZoom', handleNavigation);

    return () => {
      clearSettleTimer();
      container.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointerup', handlePointerEnd);
      window.removeEventListener('pointercancel', handlePointerEnd);
      chart.unsubscribeAction('onScroll', handleNavigation);
      chart.unsubscribeAction('onZoom', handleNavigation);
      chartPointerActiveRef.current = false;
      chartInteractionActiveRef.current = false;
    };
  }, []);

  useEffect(() => {
    let rafId = null;
    const ro = new ResizeObserver(() => {
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


  useEffect(() => {
    if (!chartInstance.current) return;
    if (!data?.length) {
      rawDataRef.current = [];
      displayDataRef.current = [];
      appliedSeriesRef.current = { chartType, interval, data: [] };
      const emptyForecast = forecastEnabled ? {
        status: 'insufficient_data',
        required: MIN_FORECAST_CANDLES,
        available: 0,
      } : null;
      forecastResultRef.current = emptyForecast;
      setForecastResult(emptyForecast);
      return;
    }
    const appliedSeries = appliedSeriesRef.current;
    if (chartInteractionActiveRef.current && appliedSeries.data.length > 0 &&
      appliedSeries.chartType === chartType && appliedSeries.interval === interval) {
      pendingChartDataRef.current = true;
      return;
    }
    pendingChartDataRef.current = false;
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

    const display = chartType === 'heikin_ashi' ? toHeikinAshi(formatted) : formatted;
    rawDataRef.current = formatted;
    displayDataRef.current = display;

    const previous = appliedSeriesRef.current;
    const sameCandle = (before, after) => Boolean(before && after &&
      before.timestamp === after.timestamp && before.open === after.open &&
      before.high === after.high && before.low === after.low &&
      before.close === after.close && before.volume === after.volume);
    const sameSeriesContext = previous.chartType === chartType && previous.interval === interval;
    const previousLength = previous.data.length;
    const nextLength = display.length;
    const sharedHistoryLength = Math.max(0, Math.min(previousLength, nextLength) - 1);
    let sharedHistoryUnchanged = sameSeriesContext;
    if (sharedHistoryUnchanged) {
      for (let index = 0; index < sharedHistoryLength; index += 1) {
        const before = previous.data[index];
        const after = display[index];
        if (!sameCandle(before, after)) {
          sharedHistoryUnchanged = false;
          break;
        }
      }
    }
    const previousLast = previous.data[previous.data.length - 1];
    const nextLast = display[display.length - 1];
    const chart = chartInstance.current;
    const chartData = chart.getDataList();
    const chartMatchesPrevious = chartData.length === previousLength &&
      chartData[0]?.timestamp === previous.data[0]?.timestamp &&
      chartData[chartData.length - 1]?.timestamp === previousLast?.timestamp;
    const canUpdateLast = chartMatchesPrevious && sharedHistoryUnchanged &&
      previousLength === nextLength &&
      previousLast?.timestamp === nextLast?.timestamp;
    const canAppendLast = chartMatchesPrevious && sharedHistoryUnchanged &&
      nextLength === previousLength + 1 &&
      display[nextLength - 2]?.timestamp === previousLast?.timestamp &&
      nextLast?.timestamp > previousLast?.timestamp;

    let seriesDataChanged = true;
    if (canUpdateLast) {
      seriesDataChanged = !sameCandle(previousLast, nextLast);
      if (seriesDataChanged) chart.updateData(nextLast);
    } else if (canAppendLast) {
      const finalizedPrevious = display[nextLength - 2];
      if (!sameCandle(previousLast, finalizedPrevious)) chart.updateData(finalizedPrevious);
      chart.updateData(nextLast);
    } else {
      const visibleRange = chart.getVisibleRange();
      const wasViewingHistory = chartData.length > 0 && visibleRange?.to < chartData.length;
      const centerIndex = wasViewingHistory
        ? Math.max(0, Math.min(
          chartData.length - 1,
          Math.floor((Math.max(0, visibleRange.from) + Math.min(chartData.length - 1, visibleRange.to - 1)) / 2),
        ))
        : -1;
      const viewportAnchorTimestamp = centerIndex >= 0 ? chartData[centerIndex]?.timestamp : null;
      chart.applyNewData(display, undefined, () => {
        if (viewportAnchorTimestamp != null && chartInstance.current === chart) {
          chart.scrollToTimestamp(viewportAnchorTimestamp, 0);
        }
      });
    }
    appliedSeriesRef.current = { chartType, interval, data: display };

    if (forecastEnabled && (seriesDataChanged || forecastResultRef.current == null)) {
      const calculated = calculateForecast(formatted);
      let nextForecast = calculated;
      if (calculated.status === 'ready' && chartType === 'heikin_ashi') {
        const displayedAnchor = display[display.length - 1].close;
        const scale = calculated.anchor !== 0 ? Math.abs(displayedAnchor / calculated.anchor) : 1;
        nextForecast = {
          ...calculated,
          anchor: displayedAnchor,
          forecastHigh: displayedAnchor + (calculated.forecastHigh - calculated.anchor) * scale,
          forecastLow: displayedAnchor - (calculated.anchor - calculated.forecastLow) * scale,
        };
      }
      forecastResultRef.current = nextForecast;
      setForecastResult(nextForecast);
    } else {
      if (!forecastEnabled && forecastResultRef.current != null) {
        forecastResultRef.current = null;
        setForecastResult(null);
      }
    }
    requestAnimationFrame(() => {
      window.dispatchEvent(new Event('omniduck_update_dual_tags'));
    });
  }, [data, chartType, forecastEnabled, interval, pendingDataRevision]);

  useEffect(() => {
    const chart = chartInstance.current;
    if (!chart) return;

    const removeForecast = () => {
      if (forecastOverlayIdRef.current) {
        chart.removeOverlay({ id: forecastOverlayIdRef.current });
        forecastOverlayIdRef.current = null;
      }
      if (forecastPreviousOffsetRef.current != null) {
        const chartData = chart.getDataList();
        const visibleRange = chart.getVisibleRange();
        const wasViewingHistory = chartData.length > 0 && visibleRange?.to < chartData.length;
        const centerIndex = wasViewingHistory
          ? Math.max(0, Math.min(
            chartData.length - 1,
            Math.floor((Math.max(0, visibleRange.from) + Math.min(chartData.length - 1, visibleRange.to - 1)) / 2),
          ))
          : -1;
        const viewportAnchorTimestamp = centerIndex >= 0 ? chartData[centerIndex]?.timestamp : null;
        chart.setOffsetRightDistance(forecastPreviousOffsetRef.current);
        if (viewportAnchorTimestamp != null) chart.scrollToTimestamp(viewportAnchorTimestamp, 0);
        forecastPreviousOffsetRef.current = null;
      }
      forecastAppliedOffsetRef.current = null;
    };

    if (!forecastEnabled || forecastResult?.status !== 'ready' || !displayDataRef.current.length) {
      removeForecast();
      return;
    }

    if (forecastPreviousOffsetRef.current == null) {
      forecastPreviousOffsetRef.current = chart.getOffsetRightDistance();
    }
    const containerWidth = chartContainerRef.current?.clientWidth || 640;
    const requiredOffset = Math.min(104, Math.max(56, containerWidth * 0.12));
    const targetOffset = Math.max(forecastPreviousOffsetRef.current, requiredOffset);
    const chartDataLength = chart.getDataList().length;
    const visibleRange = chart.getVisibleRange();
    const isViewingHistory = chartDataLength > 0 && visibleRange?.to < chartDataLength;
    if (!isViewingHistory && forecastAppliedOffsetRef.current !== targetOffset) {
      chart.setOffsetRightDistance(targetOffset);
      forecastAppliedOffsetRef.current = targetOffset;
    }

    const accuracyText = forecastResult.historicalAccuracy == null
      ? '--'
      : `${forecastResult.historicalAccuracy}%`;
    const fullLabel = `${t('forecastConfidence')} ${forecastResult.confidence}% | ${t('forecastAccuracy')} ${accuracyText} | ${t('forecastSamples')} ${forecastResult.sampleSize}`;
    const compactLabel = `${forecastResult.confidence}% / ${accuracyText}`;
    const dataIndex = displayDataRef.current.length;
    const override = {
      id: forecastOverlayIdRef.current,
      points: [
        { dataIndex, value: forecastResult.anchor },
        { dataIndex, value: forecastResult.forecastHigh },
        { dataIndex, value: forecastResult.forecastLow },
      ],
      extendData: {
        upProbability: forecastResult.upProbability,
        downProbability: forecastResult.downProbability,
        fullLabel,
        compactLabel,
        isDark,
      },
    };

    const existing = forecastOverlayIdRef.current
      ? chart.getOverlayById(forecastOverlayIdRef.current)
      : null;
    if (existing) {
      chart.overrideOverlay(override);
    } else {
      forecastOverlayIdRef.current = chart.createOverlay({
        name: 'omniForecastCandle',
        groupId: 'omni_forecast',
        lock: true,
        zLevel: 20,
        points: override.points,
        extendData: override.extendData,
      }, 'candle_pane');
    }
  }, [forecastEnabled, forecastResult, isDark, isFullscreen, isLandscape, t]);

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
      const timeStr = lang === 'en'
        ? (isDaily
          ? dt.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          : dt.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }))
        : (isDaily
          ? `${String(dt.getDate()).padStart(2,'0')} Tháng ${dt.getMonth()+1}, ${dt.getFullYear()}`
          : `${String(dt.getDate()).padStart(2,'0')} Tháng ${dt.getMonth()+1}, ${dt.getFullYear()} ${hh}:${mn}`);
      topBarRef.current.innerHTML = `
        <div style="display:flex;flex-wrap:wrap;gap:12px;font-family:Inter,sans-serif;background:${bg};padding:5px 12px;border-radius:6px;backdrop-filter:blur(4px);box-shadow:0 1px 4px rgba(0,0,0,0.15);">
          <span style="color:${lblColor}">${t('tooltipTime')}: <span style="color:${valColor}">${timeStr}</span></span>
          <span style="color:${lblColor}">${t('tooltipOpen')}: <span style="color:${color}">${d.open.toFixed(2)}</span></span>
          <span style="color:${lblColor}">${t('tooltipHigh')}: <span style="color:${color}">${d.high.toFixed(2)}</span></span>
          <span style="color:${lblColor}">${t('tooltipLow')}: <span style="color:${color}">${d.low.toFixed(2)}</span></span>
          <span style="color:${lblColor}">${t('tooltipClose')}: <span style="color:${color}">${d.close.toFixed(2)}</span></span>
          <span style="color:${lblColor}">${t('tooltipVol')}: <span style="color:${color}">${fmtVol(d.volume)}</span></span>
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
  }, [isDark, t, lang]);

  useEffect(() => {
    const fmt  = (v) => v>=1e6?(v/1e6).toFixed(2)+'M':v>=1e3?(v/1e3).toFixed(1)+'K':String(v);
    const fmtP = (p) => Number.isInteger(p)?p.toString():p.toFixed(2);
    const hideTag = (element) => {
      if (element && element.style.display !== 'none') element.style.display = 'none';
    };
    const updateTag = (element, { y, text, background, color, border = 'none', filled = true }) => {
      if (!element || !Number.isFinite(y)) return;
      const styleKey = `${background}|${color}|${border}|${filled}`;
      if (element.dataset.omniStyleKey !== styleKey) {
        element.dataset.omniStyleKey = styleKey;
        element.style.cssText = `display:block;top:0;background:${background};color:${color};border:${border};position:absolute;right:3px;width:44px;height:22px;line-height:${filled ? 22 : 20}px;text-align:center;font-size:11px;font-family:Inter,sans-serif;font-weight:700;border-radius:2px;z-index:${filled ? 49 : 50};pointer-events:none;box-sizing:border-box;will-change:transform;contain:layout style paint`;
      } else if (element.style.display !== 'block') {
        element.style.display = 'block';
      }
      element.style.transform = `translate3d(0,${Math.round(y) - 11}px,0)`;
      if (element.textContent !== text) element.textContent = text;
    };
    const update = () => {
      const info = window.__omniduck_dual_tags;
      if (!info||!priceLabelLatestRef.current) return;
      const { latest, edge, showVol } = info;
      const cL = latest.isUp?'#089981':'#F23645';
      updateTag(priceLabelLatestRef.current, {
        y: latest.priceY,
        text: fmtP(latest.price),
        background: cL,
        color: '#fff',
      });
      if (showVol) {
        updateTag(volLabelLatestRef.current, {
          y: latest.volY,
          text: fmt(latest.vol),
          background: cL,
          color: '#fff',
        });
      } else {
        hideTag(volLabelLatestRef.current);
      }
      if (priceLabelEdgeRef.current) {
        if (edge.isLatest) {
          hideTag(priceLabelEdgeRef.current);
          hideTag(volLabelEdgeRef.current);
        } else {
          const cE=edge.isUp?'#089981':'#F23645';
          const bgE=isDark?'#0B0F14':'#fff';
          updateTag(priceLabelEdgeRef.current, {
            y: edge.priceY,
            text: fmtP(edge.price),
            background: bgE,
            color: cE,
            border: `1px solid ${cE}`,
            filled: false,
          });
          if (showVol) {
            updateTag(volLabelEdgeRef.current, {
              y: edge.volY,
              text: fmt(edge.vol),
              background: bgE,
              color: cE,
              border: `1px solid ${cE}`,
              filled: false,
            });
          } else {
            hideTag(volLabelEdgeRef.current);
          }
        }
      }
    };
    window.addEventListener('omniduck_update_dual_tags', update);
    return () => window.removeEventListener('omniduck_update_dual_tags', update);
  }, [isDark]);

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
        try {
          const id = chartInstance.current?.getChartStore?.().getOverlayStore?.().getProgressInstanceInfo?.()?.instance?.id;
          if (id) chartInstance.current.removeOverlay({ id });
        } catch { /* ignore */ }
        activeToolRef.current='select';
        setActiveTool('select');
        setActiveOverlay(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeOverlay]);

  // Dropdown z-index above OHLCV overlays
  const menuBase = React.useMemo(() =>
  `absolute top-[calc(100%+8px)] left-0 rounded-2xl border shadow-2xl py-2 overflow-y-auto max-h-[280px] z-[9999] ${isDark?'bg-[#0D1117] border-white/10':'bg-white border-slate-200'}`,
  [isDark]);

  const fullscreenStyle = isFullscreen ? {
    position: 'fixed',
    inset: 0,
    width: '100vw',
    minWidth: '100vw',
    maxWidth: 'none',
    height: '100dvh',
    minHeight: '100dvh',
    maxHeight: 'none',
    zIndex: 2147483647,
    isolation: 'isolate',
    '--chart-fullscreen-bg': isDark ? '#080C11' : '#F8FAFC',
  } : undefined;
  
const rowBtn = React.useCallback((active) =>
  `w-full flex items-center justify-between px-4 py-2 text-xs font-bold transition-all ${active?`${A.solid} ${A.solidText}`:(isDark?`text-slate-300 ${A.rowHover}`:`text-slate-700 ${A.rowHover}`)}`,
  [isDark, A]);

  const tbBtn = (open) => open
    ? `${A.solid} ${A.solidText} ${A.solidBorder}`
    : (isDark
      ? `bg-[#10151C] ${A.idleBorder} ${A.idleText} ${A.hoverSolid}`
      : `bg-white border-slate-300 text-slate-700 ${A.hoverSolid}`);

  const visibleOverlayColors = React.useMemo(() => {
    const count = clampVisibleColorCount(visibleColorCount, A.overlayColors.length);
    const colors = A.overlayColors.slice(0, count);
    if (!colors.includes(overlayColor)) colors[colors.length - 1] = overlayColor;
    return colors;
  }, [A.overlayColors, overlayColor, visibleColorCount]);

  return (
    <div
      ref={outerWrapperRef}
      data-chart-root
      style={fullscreenStyle}
      className={`w-full h-full relative flex flex-col ${anyMenuOpen ? 'z-30' : ''} ${
        isFullscreen
          ? `fixed inset-0 z-[99999] w-screen h-[100dvh] p-2 sm:p-4 ${isDark ? 'bg-[#080C11]' : 'bg-slate-50'}`
          : ''
      }`}
      onClick={closeAllMenus}
    >
      {isFullscreen && (
        <button
          type="button"
          onClick={async (e) => {
            e.stopPropagation();
            await exitFullscreen();
          }}
          className={`absolute top-3 right-3 z-[100] flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[11px] font-black uppercase shadow-lg transition-colors ${
            isDark
              ? 'bg-[#0B0F14]/95 text-white border-white/20 hover:bg-white/10'
              : 'bg-white/95 text-slate-800 border-slate-300 hover:bg-slate-100'
          }`}
          title="Thoát toàn màn hình"
          aria-label="Thoát toàn màn hình"
        >
          <X size={16} />
          <span>Thoát</span>
        </button>
      )}

      {!isMini && (
        <div
          className={`flex flex-col gap-1.5 p-2 sm:p-3 mb-2 border-b shrink-0 relative z-40 overflow-visible ${
            isDark ? 'border-white/10' : 'border-slate-200'
          }`}
          onClick={e => e.stopPropagation()}
        >
          {/* HÀNG 1: 5 NÚT CÔNG CỤ DÀN ĐỀU 100% CHIỀU RỘNG */}
          <div className="w-full flex items-center justify-between gap-1 sm:gap-2">
            {/* 1. KHUNG THỜI GIAN */}
            <div className="relative z-[210] flex-1">
              <button
                onClick={() => { setShowIntervalMenu(v=>!v); setShowTypeMenu(false); setShowIndicatorMenu(false); setShowStrokePanel(false); }}
                className={`w-full flex items-center justify-center gap-1 px-1.5 sm:px-3 py-1 sm:py-1.5 rounded-xl border text-[10px] sm:text-[11px] font-black uppercase shadow-sm transition-all ${tbBtn(showIntervalMenu)}`}
              >
                <Clock size={12} className="shrink-0" />
                <span className="truncate">{localizeIntervalLabel(interval, lang)}</span>
                <ChevronDown size={11} className={`shrink-0 max-[520px]:hidden ${showIntervalMenu ? 'rotate-180' : ''}`} />
              </button>
              {showIntervalMenu && (
                <div className={`${menuBase} w-40`}>
                  <p className="px-4 pt-2 pb-1 text-[9px] font-black text-slate-500 uppercase">{t('minutes')}</p>
                  {INTERVALS_MINUTE.map(iv => (
                    <button key={iv} onClick={() => { setInterval(iv); setShowIntervalMenu(false); onIntervalChange?.(iv); }} className={rowBtn(interval === iv)}>
                      {localizeIntervalLabel(iv, lang)}{interval === iv && <Check size={12} />}
                    </button>
                  ))}
                  <div className="h-px bg-white/10 my-1" />
                  <p className="px-4 pt-2 pb-1 text-[9px] font-black text-slate-500 uppercase">{t('hoursAndDays')}</p>
                  {INTERVALS_DAY.map(iv => (
                    <button key={iv} onClick={() => { setInterval(iv); setShowIntervalMenu(false); onIntervalChange?.(iv); }} className={rowBtn(interval === iv)}>
                      {localizeIntervalLabel(iv, lang)}{interval === iv && <Check size={12} />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 2. CHẾ ĐỘ NẾN */}
            <div className="relative z-[210] flex-1">
              <button
                onClick={() => { setShowTypeMenu(v=>!v); setShowIndicatorMenu(false); setShowIntervalMenu(false); setShowStrokePanel(false); }}
                className={`w-full flex items-center justify-center gap-1 px-1.5 sm:px-3 py-1 sm:py-1.5 rounded-xl border text-[10px] sm:text-[11px] font-black uppercase shadow-sm transition-all ${tbBtn(showTypeMenu)}`}
              >
                <BarChart2 size={12} className="shrink-0" />
                <span className="truncate">
                  {{ candle_solid: t('typeSolidShort'), candle_up_stroke: t('typeHollowShort'), candle_stroke: t('typeStrokeShort'), ohlc: t('typeBarShort'), area: t('typeAreaShort'), heikin_ashi: t('heikinAshi') }[chartType] || t('typeCandleFallback')}
                </span>
                <ChevronDown size={11} className={`shrink-0 max-[520px]:hidden ${showTypeMenu ? 'rotate-180' : ''}`} />
              </button>
              {showTypeMenu && (
                <div className={`${menuBase} w-48`}>
                  {CHART_TYPES.map(tp => (
                    <button key={tp.id} onClick={() => { setChartType(tp.id); setShowTypeMenu(false); }} className={rowBtn(chartType === tp.id)}>
                      {t(tp.labelKey)}{chartType === tp.id && <Check size={12} />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 3. CHỈ BÁO */}
            <div className="relative z-[210] flex-1">
              <button
                onClick={() => { setShowIndicatorMenu(v=>!v); setShowTypeMenu(false); setShowIntervalMenu(false); setShowStrokePanel(false); }}
                className={`w-full flex items-center justify-center gap-1 px-1.5 sm:px-3 py-1 sm:py-1.5 rounded-xl border text-[10px] sm:text-[11px] font-black uppercase shadow-sm transition-all ${tbBtn(showIndicatorMenu)}`}
              >
                <Settings2 size={12} className="shrink-0" />
                <span className="truncate">{t('indicators')}</span>
                <ChevronDown size={11} className={`shrink-0 max-[520px]:hidden ${showIndicatorMenu ? 'rotate-180' : ''}`} />
              </button>
              {showIndicatorMenu && (
                <div className={`${menuBase} w-64`}>
                  <p className="px-4 pt-2 pb-1 text-[9px] font-black text-slate-500 uppercase">{t('overlayIndicators')}</p>
                  {MAIN_INDICATORS.map(ind => (
                    <React.Fragment key={ind.key}>
                      <button onClick={() => toggleIndicator(ind.key, true)} className={rowBtn(activeMain.includes(ind.key))}>
                        {t(ind.labelKey)}{activeMain.includes(ind.key) && <Check size={12} />}
                      </button>
                      {ind.key === 'MA' && activeMain.includes('MA') && (
                        <div className={`mx-2 mb-2 rounded-lg p-2 ${isDark ? 'bg-white/5' : 'bg-slate-100'}`}>
                          <div className="grid grid-cols-3 gap-1">
                            {Object.keys(MA_PRESETS).map(preset => (
                              <button
                                key={preset}
                                type="button"
                                aria-pressed={maPreset === preset}
                                onClick={(event) => { event.stopPropagation(); handleMaPresetChange(preset); }}
                                className={`rounded-md px-1.5 py-1.5 text-[9px] font-black uppercase transition-colors ${
                                  maPreset === preset
                                    ? `${A.solid} ${A.solidText}`
                                    : (isDark ? 'text-slate-300 hover:bg-white/10' : 'text-slate-600 hover:bg-slate-200')
                                }`}
                              >
                                {t(`maPreset${preset[0].toUpperCase()}${preset.slice(1)}`)}
                              </button>
                            ))}
                          </div>
                          {(maPreset === 'long' || maPreset === 'all') && rawDataRef.current.length < 200 && (
                            <p className="mt-1.5 px-1 text-[9px] leading-snug text-slate-500">
                              {t('maLongDataHint')}
                            </p>
                          )}
                        </div>
                      )}
                    </React.Fragment>
                  ))}
                  <div className="h-px bg-white/10 my-2" />
                  <p className="px-4 pb-1 text-[9px] font-black text-slate-500 uppercase">{t('subIndicators')}</p>
                  {SUB_INDICATORS.map(ind => (
                    <button key={ind.key} onClick={() => toggleIndicator(ind.key, false)} className={rowBtn(activeSub.includes(ind.key))}>
                      {t(ind.labelKey)}{activeSub.includes(ind.key) && <Check size={12} />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 4 & 5. NÚT PHÓNG TO TOÀN MÀN HÌNH (MOBILE ONLY: lg:hidden) */}
            <div className="relative z-[210] flex-1">
              <button
                type="button"
                onClick={handleForecastToggle}
                aria-pressed={forecastEnabled}
                title={forecastResult?.status === 'insufficient_data'
                  ? t('forecastNeedsCandles', { count: MIN_FORECAST_CANDLES })
                  : t('forecastToggleTitle')}
                className={`w-full flex items-center justify-center gap-1 px-1.5 sm:px-3 py-1 sm:py-1.5 rounded-xl border text-[10px] sm:text-[11px] font-black uppercase shadow-sm transition-all ${tbBtn(forecastEnabled)}`}
              >
                <Activity size={12} className="shrink-0" />
                <span className="truncate">{t('forecast')}</span>
                {forecastEnabled && <Check size={11} className="shrink-0 max-[520px]:hidden" />}
              </button>
            </div>

            <div className="flex lg:hidden items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={toggleFullscreen}
                title={isFullscreen && !isLandscape ? "Thoát toàn màn hình" : "Toàn màn hình (Mũi tên chéo)"}
                className={`p-1.5 sm:p-2 rounded-xl border text-[10px] font-black uppercase transition-all ${
                  isFullscreen && !isLandscape
                    ? `${A.solid} ${A.solidText}`
                    : (isDark ? A.strokeIdleDark : A.strokeIdleLight)
                }`}
              >
                {isFullscreen && !isLandscape ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              </button>

              <button
                type="button"
                onClick={toggleLandscapeFullscreen}
                title={isLandscape ? "Thoát toàn màn hình xoay ngang" : "Toàn màn hình Xoay ngang (4 góc ô vuông)"}
                className={`p-1.5 sm:p-2 rounded-xl border text-[10px] font-black uppercase transition-all ${
                  isLandscape
                    ? `${A.solid} ${A.solidText}`
                    : (isDark ? A.strokeIdleDark : A.strokeIdleLight)
                }`}
              >
                <Maximize size={14} />
              </button>
            </div>
          </div>

          {/* HÀNG 2: DẢI MÀU & SẢN PHẨM NÉT VẼ DÀN TRẢI 100% CHIỀU RỘNG CHART */}
          <div className={`w-full flex items-center justify-between px-2.5 py-1 rounded-xl border shadow-sm ${
            isDark ? 'bg-[#10151C]/90 border-white/10' : 'bg-white border-slate-200'
          }`}>
            <div className="flex items-center gap-2 flex-1 min-w-0 py-0.5">
              <span className={`text-[9px] font-black uppercase tracking-wider shrink-0 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                {t('color')}:
              </span>
              <div ref={paletteContainerRef} className="flex-1 min-w-0 overflow-hidden">
                <div className="flex w-full items-center justify-between">
                {visibleOverlayColors.map(hex => (
                  <button
                    key={hex}
                    onClick={() => handleOverlayColorChange(hex)}
                    title={hex}
                    aria-label={`${t('color')} ${hex}`}
                    className={`w-4 h-4 sm:w-5 sm:h-5 rounded-full border-2 transition-all hover:scale-110 shrink-0 ${
                      overlayColor === hex ? 'ring-1 ring-offset-1' : ''
                    }`}
                    style={{ backgroundColor: hex, borderColor: overlayColor === hex ? (isDark ? '#fff' : '#1f2937') : 'transparent' }}
                  />
                ))}
                </div>
              </div>
            </div>

            <div className="relative ml-2 z-[210] shrink-0">
              <button
                onClick={e => { e.stopPropagation(); setShowStrokePanel(v => !v); }}
                title={t('customizeStroke')}
                className={`p-1 rounded-lg transition-all ${showStrokePanel ? `${A.solid} ${A.solidText}` : (isDark ? A.strokeIdleDark : A.strokeIdleLight)}`}
              >
                <SlidersHorizontal size={14} />
              </button>
              {showStrokePanel && (
                <div
                  className={`absolute top-[calc(100%+8px)] right-0 w-52 p-3 rounded-2xl border z-[9999] ${isDark ? 'bg-[#0D1117] border-white/15' : 'bg-white border-slate-200'}`}
                  style={{ boxShadow: isDark ? '0 8px 32px rgba(0,0,0,0.8)' : '0 8px 32px rgba(0,0,0,0.15)' }}
                  onClick={e => e.stopPropagation()}
                >
                  <p className={`text-[9px] font-black uppercase mb-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{t('strokeWidth')}</p>
                  <div className="flex gap-2 mb-3">
                    {STROKE_SIZES.map(s => (
                      <button key={s} onClick={() => handleStrokeSizeChange(s)}
                        className={`flex-1 flex flex-col items-center gap-1.5 py-2 rounded-lg text-[10px] font-black transition-all ${strokeSize === s ? `${A.solid} ${A.solidText}` : (isDark ? 'bg-white/5 text-slate-400 hover:bg-white/10' : 'bg-slate-100 text-slate-500 hover:bg-slate-200')}`}>
                        <div style={{ height: `${s + 1}px`, width: '24px', background: 'currentColor', borderRadius: 1 }} />
                        {s}px
                      </button>
                    ))}
                  </div>
                  <p className={`text-[9px] font-black uppercase mb-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{t('strokeStyle')}</p>
                  {STROKE_STYLES.map(s => (
                    <button key={s.val} onClick={() => handleStrokeStyleChange(s.val)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-bold text-left mb-1 transition-all ${strokeStyle === s.val ? `${A.solid} ${A.solidText}` : (isDark ? 'bg-white/5 text-slate-400 hover:bg-white/10' : 'bg-slate-50 text-slate-600 hover:bg-slate-100')}`}>
                      <svg width="32" height="8" viewBox="0 0 32 8">
                        {s.val === 'solid' && <line x1="0" y1="4" x2="32" y2="4" stroke="currentColor" strokeWidth="2" />}
                        {s.val === 'dashed' && <line x1="0" y1="4" x2="32" y2="4" stroke="currentColor" strokeWidth="2" strokeDasharray="6 3" />}
                        {s.val === 'dotted' && <line x1="0" y1="4" x2="32" y2="4" stroke="currentColor" strokeWidth="2" strokeDasharray="2 3" />}
                      </svg>
                      {t(s.labelKey)}
                      {strokeStyle === s.val && <Check size={12} className="ml-auto" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-row relative min-h-0 rounded-2xl overflow-hidden border border-white/5 z-0">

        {!isMini && (
          <div className={`${isFullscreen ? 'w-8 py-1' : 'w-9 sm:w-12 py-3'} shrink-0 border-r flex flex-col items-center gap-1 z-[20] relative ${isDark ? 'bg-[#0B0F14] border-white/5' : 'bg-slate-50 border-slate-200'}`}>
            {DRAW_TOOLS.map(({ name, Icon, titleKey }) => {
              const isActive = activeTool === name;
              return (
                <button key={name} title={t(titleKey)}
                  onClick={e => { e.stopPropagation(); handleActivateTool(name); }}
                  className={`${isFullscreen ? 'w-6 h-6 rounded-lg' : 'w-7 h-7 sm:w-9 sm:h-9 rounded-xl'} flex items-center justify-center transition-all
                  ${isActive ? `${A.solid} ${A.solidText} ${A.toolShadow}`
                      : (isDark ? A.toolIdleDark : A.toolIdleLight)}`}
                >
                  <Icon size={isFullscreen ? 12 : 14} />
                </button>
              );
            })}
            <div className={`w-5 h-px my-1 ${isDark ? 'bg-white/8' : 'bg-slate-200'}`} />
            <button
              title={activeOverlay?.id ? 'Xóa nét đang chọn' : 'Xóa tất cả nét vẽ'}
              onClick={() => {
                if (activeOverlay?.id) {
                  chartInstance.current?.removeOverlay(activeOverlay.id);
                  setActiveOverlay(null);
                } else {
                  chartInstance.current?.removeAllOverlay();
                  forecastOverlayIdRef.current = null;
                  if (forecastResult?.status === 'ready') {
                    setForecastResult({ ...forecastResult });
                  }
                  setActiveOverlay(null);
                }
              }}
              className={`${isFullscreen ? 'w-6 h-6 rounded-lg' : 'w-7 h-7 sm:w-9 sm:h-9 rounded-xl'} flex items-center justify-center transition-all ${
                activeOverlay?.id
                  ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                  : (isDark ? A.toolIdleDark : A.toolIdleLight)
              }`}
            >
              <Trash2 size={isFullscreen ? 12 : 14} />
            </button>
          </div>
        )}
        <div className="flex-1 relative w-full h-full overflow-hidden touch-none overscroll-contain">
          <div ref={chartContainerRef} style={{position:'absolute',top:0,left:0,right:0,bottom:0, backgroundColor: isDark ? '#080C11' : '#FFFFFF', userSelect: 'none', WebkitUserSelect: 'none', touchAction: 'none', overscrollBehavior: 'contain', willChange: 'transform'}}/>

          {activeOverlay && (
            <div className={`absolute top-3 left-1/2 -translate-x-1/2 z-[30] flex items-center gap-3 backdrop-blur-md px-4 py-1.5 rounded-xl shadow-2xl border ${isDark ? 'bg-[#0D1117]/90 border-white/10' : 'bg-white border-slate-300'}`}>
              <div className={`flex items-center gap-2 ${isDark ? A.selectedTextDark : A.selectedTextLight}`}>
                <Pencil size={12}/>
                <span className={`text-[9px] font-black uppercase tracking-widest ${isDark?A.selectedTextDark:A.selectedTextLight}`}>{t('selectedDrawing')}</span>
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

          {!isMini && <div ref={topBarRef} style={{position:'absolute',top:'8px',left:'12px',zIndex:10,pointerEvents:'none',fontSize:'11px',fontWeight:'600'}}/>} 
          {!isMini && <div ref={indicatorBarRef} style={{display:'none',position:'absolute',top:'36px',left:'12px',zIndex:10,pointerEvents:'none'}}/>}
          <div ref={priceLabelLatestRef}/>
          <div ref={volLabelLatestRef}/>
          <div ref={priceLabelEdgeRef}/>
          <div ref={volLabelEdgeRef}/>

          <div className="group/chartnav absolute bottom-8 left-1/2 -translate-x-1/2 z-[20] flex flex-col items-center pt-8 pb-1 px-3">
            <div
              className="flex items-center gap-1.5 opacity-0 translate-y-1
                group-hover/chartnav:opacity-100 group-hover/chartnav:translate-y-0
                transition-all duration-200"
            >
              {[
                { title: 'Thu nhỏ', onClick: handleZoomOut, Icon: Minus },
                { title: 'Phóng to', onClick: handleZoomIn, Icon: Plus },
                { title: 'Lùi', onClick: handleScrollLeft, Icon: ChevronLeft },
                { title: 'Tiến', onClick: handleScrollRight, Icon: ChevronRight },
                { title: 'Reset', onClick: handleResetChart, Icon: RefreshCw },
              ].map(({ title, onClick, Icon }) => (
                <button
                  key={title}
                  type="button"
                  title={title}
                  onClick={(e) => { e.stopPropagation(); onClick(); }}
                  className={`w-8 h-8 flex items-center justify-center rounded-lg border backdrop-blur-md shadow-lg transition-all
                    ${isDark
                      ? 'bg-[#10151C]/90 border-white/10 text-slate-300 hover:text-white hover:bg-slate-800'
                      : 'bg-white/90 border-slate-300 text-slate-600 hover:text-black hover:bg-slate-100'}`}
                >
                  <Icon size={15} />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
