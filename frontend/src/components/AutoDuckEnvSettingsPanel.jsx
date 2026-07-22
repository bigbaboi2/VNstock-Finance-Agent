import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { Check, ChevronDown, Download, RotateCcw, Save, Settings, X } from 'lucide-react';
import {
    DEFAULT_EXPORT_FILE_NAME_PATTERN,
    LIVE_EXPORT_NAME_TAGS,
    resolveExportBaseName,
    parseExportDateRange,
    toVnDateInputValue,
} from '@shared/utils/liveExportName.js';

const LIVE_EXPORT_FILE_CATALOG = [
    {
        id: 'json',
        extension: '.json',
        label: 'JSON — dump đầy đủ',
        purpose: 'Toàn bộ dữ liệu máy đọc được: summary, breakdowns, từng lệnh LIVE, packages, exchange orders, manual trades. Dùng cho Python/notebook hoặc import lại hệ thống.',
    },
    {
        id: 'md',
        extension: '.md',
        label: 'Markdown — báo cáo tổng hợp',
        purpose: 'Báo cáo đọc nhanh: win rate, PnL, phân tích theo symbol/setup/exit, so sánh early vs late 21 ngày, partial scale-out.',
    },
    {
        id: 'xlsx',
        extension: '.xlsx',
        label: 'Excel — workbook 6 sheet',
        purpose: 'Một file Excel; mỗi sheet là một bảng phân tích riêng (mở bằng Excel/LibreOffice).',
        sheets: [
            { name: 'Trades LIVE', purpose: 'Từng lệnh AutoTrade LIVE: entry/exit, PnL VND, hold time, signal breakdown, exit tag…' },
            { name: 'Exchange Orders', purpose: 'Lệnh gửi sàn (LIVE + testnet): side, purpose, notional, trạng thái fill/fail.' },
            { name: 'Packages LIVE', purpose: 'Gói vốn UserOrder LIVE: capital, allocation, realized PnL, số allocation.' },
            { name: 'Theo Symbol', purpose: 'Thống kê gom theo mã: số lệnh, win rate, tổng/trung bình PnL, thời gian giữ.' },
            { name: 'Equity Curve', purpose: 'Đường NAV theo thời gian: cum PnL, drawdown, % drawdown so với đỉnh NAV.' },
            { name: 'Early vs Late 21d', purpose: 'So sánh hiệu suất trước vs trong 21 ngày gần nhất (win rate, expectancy, max DD).' },
        ],
    },
];

const valuesEqual = (a, b) => {
    if (a === b) return true;
    if (typeof a === 'boolean' || typeof b === 'boolean') return Boolean(a) === Boolean(b);
    if (typeof a === 'number' || typeof b === 'number') {
        if (a === '' || b === '' || a == null || b == null) return false;
        const na = Number(a);
        const nb = Number(b);
        return Number.isFinite(na) && Number.isFinite(nb) && na === nb;
    }
    return String(a ?? '') === String(b ?? '');
};

const sourceBadgeClass = (source, isDark, dirty) => {
    if (dirty) {
        return isDark
            ? 'bg-red-500/25 text-red-200 border-red-400/60'
            : 'bg-red-50 text-red-700 border-red-300';
    }
    if (source === 'db') return isDark ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/50' : 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (source === 'env') return isDark ? 'bg-amber-500/20 text-amber-200 border-amber-400/50' : 'bg-amber-50 text-amber-700 border-amber-200';
    return isDark ? 'bg-white/10 text-slate-300 border-white/25' : 'bg-slate-100 text-slate-500 border-slate-200';
};

const sourceLabel = (source, dirty) => {
    if (dirty) return 'Chưa lưu database';
    if (source === 'db') return 'Đã lưu database';
    if (source === 'env') return 'File .env';
    return 'Mặc định';
};

const modeBadgeClass = (badge, isDark) => {
    if (badge === 'live') {
        return isDark
            ? 'bg-emerald-500/25 text-emerald-200 border-emerald-400/60'
            : 'bg-emerald-100 text-emerald-800 border-emerald-300';
    }
    if (badge === 'sim') {
        return isDark
            ? 'bg-violet-500/25 text-violet-200 border-violet-400/60'
            : 'bg-violet-100 text-violet-800 border-violet-300';
    }
    return '';
};

const fieldCardClass = (badge, enabled, isDark) => {
    if (!enabled) {
        return isDark
            ? 'border-white/20 bg-[#0c1018] opacity-55'
            : 'border-slate-200 bg-slate-100 opacity-60';
    }
    if (badge === 'live') {
        return isDark
            ? 'border-emerald-400/45 bg-emerald-950/40 hover:border-emerald-300/70 hover:bg-emerald-950/55'
            : 'border-emerald-300 bg-emerald-50/90 hover:border-emerald-400 hover:bg-emerald-50';
    }
    if (badge === 'sim') {
        return isDark
            ? 'border-violet-400/45 bg-violet-950/40 hover:border-violet-300/70 hover:bg-violet-950/55'
            : 'border-violet-300 bg-violet-50/90 hover:border-violet-400 hover:bg-violet-50';
    }
    return isDark
        ? 'border-white/40 bg-[#121826] hover:border-sky-400/70 hover:bg-sky-950/45'
        : 'border-slate-300 bg-slate-50 hover:border-sky-400 hover:bg-sky-50';
};

const isDependencyMet = (field, draft) => {
    const dep = field?.dependsOn;
    if (!dep?.key) return true;
    const current = draft[dep.key];
    if (Object.prototype.hasOwnProperty.call(dep, 'equals')) {
        return current === dep.equals;
    }
    return Boolean(current);
};

const groupAccent = (id) => {
    if (id === 'safety') return 'border-amber-400';
    if (id === 'idle') return 'border-violet-400';
    if (id === 'quality') return 'border-cyan-400';
    if (id === 'short_fill') return 'border-emerald-400';
    if (id === 'advanced') return 'border-slate-300';
    return 'border-purple-400';
};

function IosToggle({ checked, onChange, disabled, loading }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked === true}
            disabled={disabled}
            onClick={() => !disabled && onChange?.(!checked)}
            className={`relative inline-flex h-[31px] w-[51px] shrink-0 items-center rounded-full transition-colors duration-200 ease-out outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f141e] ${
                loading ? 'animate-pulse bg-slate-500'
                    : checked ? 'bg-[#34C759]' : 'bg-[#39393D]'
            } ${disabled ? 'opacity-45 cursor-not-allowed' : 'cursor-pointer'}`}
        >
            <span
                className={`pointer-events-none inline-block h-[27px] w-[27px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.35)] transition-transform duration-200 ease-out ${
                    checked ? 'translate-x-[22px]' : 'translate-x-[2px]'
                }`}
            />
        </button>
    );
}

export default function AutoDuckEnvSettingsPanel({
    username,
    isAdmin,
    isDark,
    UI,
    adminCode,
    setAdminCode,
    riskLevel,
    isEngineEnabled,
    loading,
    onToggleEngine,
    onRiskLevelChange,
    onMessage,
}) {
    const [collapsed, setCollapsed] = useState(true);
    const [groups, setGroups] = useState([]);
    const [values, setValues] = useState({});
    const [sources, setSources] = useState({});
    const [draft, setDraft] = useState({});
    const [saving, setSaving] = useState(false);
    const [resettingGroup, setResettingGroup] = useState(null);
    const [loadingConfig, setLoadingConfig] = useState(false);
    const [openGroups, setOpenGroups] = useState(() => new Set());
    const [exportDir, setExportDir] = useState('exports');
    const [exportFileNamePattern, setExportFileNamePattern] = useState(DEFAULT_EXPORT_FILE_NAME_PATTERN);
    const [exportDateFrom, setExportDateFrom] = useState('');
    const [exportDateTo, setExportDateTo] = useState('');
    const [exportRangePreset, setExportRangePreset] = useState('all');
    const [exportCustomDays, setExportCustomDays] = useState('');
    const [exportingLive, setExportingLive] = useState(false);
    const [exportBtnState, setExportBtnState] = useState('idle');
    const [exportBtnMessage, setExportBtnMessage] = useState('');
    const [lastLiveExport, setLastLiveExport] = useState(null);
    const [exportCatalogOpen, setExportCatalogOpen] = useState(false);
    const exportFileNameInputRef = useRef(null);

    const applyConfigPayload = (data) => {
        if (!data) return;
        setValues(data.values || {});
        setSources(data.sources || {});
        setDraft({ ...(data.values || {}) });
        const nextGroups = data.meta?.groups || [];
        setGroups(nextGroups);
        return nextGroups;
    };

    const loadConfig = async () => {
        setLoadingConfig(true);
        try {
            const res = await axios.get('/api/auto-trade/env-config');
            if (res.data?.success && res.data.data) {
                const nextGroups = applyConfigPayload(res.data.data);
                if (nextGroups?.length > 0) {
                    setOpenGroups(new Set([nextGroups[0].id]));
                }
            }
        } catch (err) {
            onMessage?.({ text: err.response?.data?.message || 'Không tải được cấu hình AutoTrade.', isError: true });
        } finally {
            setLoadingConfig(false);
        }
    };

    useEffect(() => {
        if (!collapsed) loadConfig();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [collapsed]);

    useEffect(() => {
        setExportBtnState('idle');
        setExportBtnMessage('');
    }, [exportDir, exportFileNamePattern, exportDateFrom, exportDateTo]);

    const applyExportRangeDays = (days) => {
        const n = Math.floor(Number(days));
        if (!Number.isFinite(n) || n < 1) return false;
        const to = new Date();
        const from = new Date();
        from.setDate(from.getDate() - n + 1);
        setExportDateFrom(toVnDateInputValue(from));
        setExportDateTo(toVnDateInputValue(to));
        setExportRangePreset(String(n));
        setExportCustomDays(String(n));
        return true;
    };

    const applyExportRangePreset = (preset) => {
        if (preset === 'all') {
            setExportRangePreset('all');
            setExportDateFrom('');
            setExportDateTo('');
            setExportCustomDays('');
            return;
        }
        applyExportRangeDays(Number(preset));
    };

    const applyExportCustomDays = () => {
        const raw = exportCustomDays.trim();
        if (!raw) return;
        const n = Math.floor(Number(raw));
        if (!Number.isFinite(n) || n < 1) {
            setExportBtnState('error');
            setExportBtnMessage('Số ngày phải ≥ 1');
            return;
        }
        if (n > 3650) {
            setExportBtnState('error');
            setExportBtnMessage('Tối đa 3650 ngày');
            return;
        }
        applyExportRangeDays(n);
        setExportBtnState('idle');
        setExportBtnMessage('');
    };

    const handleExportDateFromChange = (value) => {
        setExportDateFrom(value);
        setExportRangePreset('custom');
        setExportCustomDays('');
    };

    const handleExportDateToChange = (value) => {
        setExportDateTo(value);
        setExportRangePreset('custom');
        setExportCustomDays('');
    };

    useEffect(() => {
        if (exportBtnState !== 'success') return undefined;
        const t = setTimeout(() => {
            setExportBtnState('idle');
            setExportBtnMessage('');
        }, 8000);
        return () => clearTimeout(t);
    }, [exportBtnState]);

    const isDirty = (key) => !valuesEqual(draft[key], values[key]);

    const groupHasDirty = (group) => (group.keys || []).some((field) => isDirty(field.key));

    const toggleGroup = (id) => {
        setOpenGroups((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const setDraftValue = (key, raw, type) => {
        let next = raw;
        if (type === 'boolean') next = Boolean(raw);
        if (type === 'number') {
            if (raw === '' || raw === null) next = '';
            else next = Number(raw);
        }
        setDraft((prev) => ({ ...prev, [key]: next }));
    };

    const postValues = async (payload, successText) => {
        const res = await axios.post('/api/auto-trade/env-config', {
            values: payload,
            username,
            adminCode,
        });
        if (res.data?.data) applyConfigPayload(res.data.data);
        onMessage?.({
            text: successText || res.data?.message || 'Đã lưu. Áp dụng từ chu kỳ pipeline tiếp theo.',
            isError: false,
        });
        return res;
    };

    const handleSave = async () => {
        if (!isAdmin && !adminCode) {
            onMessage?.({ text: 'Cần mã Admin để lưu cấu hình AutoTrade.', isError: true });
            return;
        }
        setSaving(true);
        try {
            const payload = {};
            for (const [key, val] of Object.entries(draft)) {
                if (val === '' || val === undefined) continue;
                if (valuesEqual(values[key], val)) continue;
                payload[key] = val;
            }
            if (Object.keys(payload).length === 0) {
                onMessage?.({ text: 'Không có thay đổi nào để lưu.', isError: false });
                return;
            }
            await postValues(payload);
        } catch (err) {
            onMessage?.({ text: err.response?.data?.message || 'Lỗi khi lưu cấu hình.', isError: true });
        } finally {
            setSaving(false);
        }
    };

    const handleResetGroup = async (group, event) => {
        event?.stopPropagation?.();
        if (!isAdmin && !adminCode) {
            onMessage?.({ text: 'Cần mã Admin để đặt lại mặc định.', isError: true });
            return;
        }
        const keys = group.keys || [];
        if (keys.length === 0) return;
        if (!window.confirm(`Đặt lại toàn bộ mục trong "${group.label}" về giá trị mặc định của hệ thống?`)) return;

        setResettingGroup(group.id);
        try {
            const payload = {};
            const nextDraft = { ...draft };
            for (const field of keys) {
                payload[field.key] = field.default;
                nextDraft[field.key] = field.default;
            }
            setDraft(nextDraft);
            await postValues(
                payload,
                `Đã đặt lại nhóm về mặc định. Áp dụng từ chu kỳ pipeline tiếp theo.`
            );
        } catch (err) {
            onMessage?.({ text: err.response?.data?.message || 'Lỗi khi đặt lại mặc định.', isError: true });
        } finally {
            setResettingGroup(null);
        }
    };

    const handleExportLiveStats = async () => {
        if (!isAdmin && !adminCode) {
            setExportBtnState('error');
            setExportBtnMessage('Cần mã Admin');
            return;
        }
        setExportingLive(true);
        setExportBtnState('loading');
        setExportBtnMessage('');
        try {
            const res = await axios.post('/api/auto-trade/export-live-stats', {
                username,
                adminCode,
                outputDir: exportDir.trim() || 'exports',
                fileNamePattern: exportFileNamePattern.trim() || DEFAULT_EXPORT_FILE_NAME_PATTERN,
                dateFrom: exportDateFrom.trim() || undefined,
                dateTo: exportDateTo.trim() || undefined,
            });
            if (res.data?.success && res.data.data) {
                setLastLiveExport(res.data.data);
                const fileCount = res.data.data.files?.length ?? 3;
                setExportBtnState('success');
                setExportBtnMessage(res.data.message || `Đã xuất ${fileCount} file`);
            } else {
                setExportBtnState('error');
                setExportBtnMessage(res.data?.message || 'Xuất thất bại');
            }
        } catch (err) {
            setExportBtnState('error');
            setExportBtnMessage(err.response?.data?.message || 'Lỗi khi xuất dữ liệu lệnh LIVE');
        } finally {
            setExportingLive(false);
        }
    };

    const clearExportFileNamePattern = () => {
        setExportFileNamePattern('');
        requestAnimationFrame(() => {
            exportFileNameInputRef.current?.focus();
        });
    };

    const insertExportNameTag = (tag) => {
        const input = exportFileNameInputRef.current;
        if (!input) {
            setExportFileNamePattern((prev) => `${prev}${tag}`);
            return;
        }
        const start = input.selectionStart ?? exportFileNamePattern.length;
        const end = input.selectionEnd ?? start;
        const next = exportFileNamePattern.slice(0, start) + tag + exportFileNamePattern.slice(end);
        setExportFileNamePattern(next);
        requestAnimationFrame(() => {
            input.focus();
            const pos = start + tag.length;
            input.setSelectionRange(pos, pos);
        });
    };

    const exportDateRangePreview = useMemo(() => {
        try {
            return parseExportDateRange({ dateFrom: exportDateFrom, dateTo: exportDateTo });
        } catch {
            return { fromCompact: 'invalid', toCompact: 'invalid', label: 'Khoảng ngày không hợp lệ' };
        }
    }, [exportDateFrom, exportDateTo]);

    const exportNamePreview = useMemo(() => {
        const stats = lastLiveExport?.summary
            ? {
                autoTradeLive: lastLiveExport.summary.autoTradeLive,
                closed: lastLiveExport.summary.closed,
                winRatePct: lastLiveExport.summary.winRatePct,
            }
            : undefined;
        return resolveExportBaseName(exportFileNamePattern, { stats, dateRange: exportDateRangePreview });
    }, [exportFileNamePattern, lastLiveExport, exportDateRangePreview]);

    const exportGateBlocked = !isAdmin && !adminCode;
    const exportBtnBusy = exportingLive || exportBtnState === 'loading';
    const exportRangeInvalid = exportDateRangePreview.fromCompact === 'invalid';
    const exportCustomDaysActive = /^\d+$/.test(exportRangePreset)
        && !['7', '30', '90'].includes(exportRangePreset);
    const exportRangePresetClass = (preset) => {
        const active = exportRangePreset === preset;
        return active
            ? (isDark
                ? 'border-purple-300/70 bg-purple-500/25 text-purple-100'
                : 'border-purple-400 bg-purple-100 text-purple-900')
            : (isDark
                ? 'border-white/25 bg-black/20 text-slate-200 hover:bg-white/10'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50');
    };

    const exportButtonClass = () => {
        if (exportGateBlocked && exportBtnState === 'idle') {
            return 'opacity-50 cursor-not-allowed border-slate-500 text-slate-500';
        }
        if (exportBtnBusy) {
            return isDark
                ? 'border-purple-400/50 bg-purple-500/15 text-purple-100 cursor-wait'
                : 'border-purple-300 bg-purple-50 text-purple-800 cursor-wait';
        }
        if (exportBtnState === 'success') {
            return isDark
                ? 'border-emerald-400/70 bg-emerald-500/25 text-emerald-100 hover:bg-emerald-500/30'
                : 'border-emerald-500 bg-emerald-100 text-emerald-900 hover:bg-emerald-200';
        }
        if (exportBtnState === 'error') {
            return isDark
                ? 'border-red-400/70 bg-red-500/25 text-red-100 hover:bg-red-500/30'
                : 'border-red-400 bg-red-100 text-red-900 hover:bg-red-200';
        }
        return isDark
            ? 'bg-purple-500/20 text-purple-100 border-purple-400/50 hover:bg-purple-500/30'
            : 'bg-purple-100 text-purple-900 border-purple-300 hover:bg-purple-200';
    };

    const panelBorder = isDark
        ? 'bg-[#0f141e] !border-white shadow-[0_0_18px_rgba(255,255,255,0.14)]'
        : 'bg-white border-slate-300';
    const hairline = isDark ? 'border-white/45' : 'border-slate-300';
    const inputClass = `w-full text-[13px] font-sans font-medium px-3 py-2 rounded-xl outline-none border transition-colors ${
        isDark
            ? 'bg-[#0a0f18] text-slate-100 border-white/35 focus:border-cyan-400'
            : 'bg-white text-slate-800 border-slate-300 focus:border-cyan-500'
    }`;
    const fieldLabelClass = `block text-[13px] font-semibold mb-1.5 ${
        isDark ? 'text-slate-50' : 'text-slate-700'
    }`;
    const hintClass = `block mt-1.5 text-[12px] italic leading-relaxed ${
        isDark ? 'text-slate-400' : 'text-slate-500'
    }`;
    const hintInlineClass = `text-[12px] italic ${
        isDark ? 'text-slate-400' : 'text-slate-500'
    }`;

    return (
        <div
            className={`p-4 sm:p-5 rounded-3xl border-2 shadow-lg mb-0 font-sans ${panelBorder}`}
            style={{ fontFamily: 'ui-sans-serif, system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }}
        >
            <div className="flex flex-wrap items-center justify-between gap-4 mb-2">
                <div className="flex items-center gap-3 flex-wrap">
                    <Settings className="text-cyan-400" size={22} />
                    <h3 className={`text-lg font-black uppercase tracking-widest ${UI.textBold}`}>
                        CẤU HÌNH AUTOTRADE
                    </h3>
                    <button
                        type="button"
                        onClick={() => setCollapsed((v) => !v)}
                        title={collapsed ? 'Mở rộng' : 'Thu gọn'}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors border-2 ${isDark ? 'border-white/50 bg-white/5 hover:bg-white/10 text-cyan-200' : 'border-cyan-300 bg-cyan-50 hover:bg-cyan-100 text-cyan-700'}`}
                    >
                        <ChevronDown size={16} className={`transition-transform duration-300 ${collapsed ? '-rotate-90' : ''}`} />
                        {collapsed ? 'Mở cài đặt' : 'Thu gọn'}
                    </button>
                </div>

                <div className="flex items-center gap-4 flex-wrap">
                    {!isAdmin && (
                        <input
                            type="password"
                            placeholder="Mã admin..."
                            value={adminCode}
                            onChange={(e) => setAdminCode(e.target.value)}
                            className={`w-36 text-[12px] font-medium px-2.5 py-1.5 rounded-lg outline-none border transition-colors ${isDark ? 'bg-[#1a1f2e] text-slate-200 border-white/35 focus:border-cyan-400' : 'bg-white text-slate-600 border-slate-300 focus:border-cyan-500'}`}
                        />
                    )}
                    <div className="flex items-center gap-2.5">
                        <span className={`text-[12px] font-medium ${UI.textMuted}`}>Trạng thái</span>
                        <IosToggle
                            checked={isEngineEnabled === true}
                            loading={isEngineEnabled === null}
                            disabled={loading || isEngineEnabled === null || (!isAdmin && !adminCode)}
                            onChange={() => onToggleEngine?.()}
                        />
                        <span className={`text-[12px] font-semibold ${isEngineEnabled ? 'text-emerald-400' : 'text-slate-400'}`}>
                            {isEngineEnabled === null ? '…' : isEngineEnabled ? 'Bật' : 'Tắt'}
                        </span>
                        {isEngineEnabled === false && (
                            <span
                                className={`text-[11px] font-medium ${UI.textMuted}`}
                                title="Tắt = dừng lệnh mô phỏng. Gói lệnh thực vẫn được quét và đóng bình thường."
                            >
                                (Lệnh thực vẫn chạy)
                            </span>
                        )}
                    </div>

                    <div className={`w-px h-5 ${isDark ? 'bg-white/40' : 'bg-slate-300'}`} />

                    <div className="flex items-center gap-2">
                        <span className={`text-[12px] font-medium ${UI.textMuted}`}>Khẩu vị rủi ro</span>
                        <select
                            value={riskLevel}
                            onChange={onRiskLevelChange}
                            disabled={loading || !isAdmin}
                            className={`text-[12px] font-semibold px-3 py-1.5 rounded-lg outline-none border transition-colors cursor-pointer ${
                                riskLevel === 1 ? 'bg-blue-500/10 text-blue-400 border-blue-400/40'
                                    : riskLevel === 3 ? 'bg-amber-500/10 text-amber-400 border-amber-400/40'
                                        : riskLevel === 4 ? 'bg-red-500/10 text-red-400 border-red-400/40'
                                            : 'bg-emerald-500/10 text-emerald-400 border-emerald-400/40'
                            } ${!isAdmin ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            <option value={1} className={isDark ? 'bg-[#1a1f2e] text-slate-300' : 'bg-white text-slate-600'}>1 - Rất thận trọng</option>
                            <option value={2} className={isDark ? 'bg-[#1a1f2e] text-slate-300' : 'bg-white text-slate-600'}>2 - Cân bằng (chuẩn)</option>
                            <option value={3} className={isDark ? 'bg-[#1a1f2e] text-slate-300' : 'bg-white text-slate-600'}>3 - Chuyên gia (ưa rủi ro)</option>
                            <option value={4} className={isDark ? 'bg-[#1a1f2e] text-slate-300' : 'bg-white text-slate-600'}>4 - Degen (lợi nhuận tối đa)</option>
                        </select>
                    </div>
                </div>
            </div>

            {collapsed && (
                <p className={`text-[13px] mt-2 leading-relaxed ${isDark ? 'text-slate-300' : UI.textMuted}`}>
                    Cấu hình chất lượng lệnh, quét khi thiếu lệnh, an toàn lệnh thực… lưu MongoDB (toàn hệ thống). Mở panel để chỉnh chi tiết.
                </p>
            )}

            {!collapsed && (
                <div className={`mt-4 pt-4 border-t-2 ${hairline}`}>
                    <div className={`mb-5 rounded-xl border-2 px-4 py-3 space-y-2 ${isDark ? 'bg-cyan-950/35 border-white/35' : 'bg-cyan-50 border-cyan-200'}`}>
                        <p className={`text-[13px] leading-relaxed ${isDark ? 'text-slate-100' : 'text-slate-700'}`}>
                            <span className="font-semibold text-cyan-400">Cách chấm điểm lệnh:</span> mỗi setup được chấm theo
                            chất lượng kỹ thuật (0–100), mức đồng thuận chỉ báo và lợi thế. Điểm / ngưỡng càng cao thì càng khó vào lệnh (an toàn hơn);
                            hạ ngưỡng thì nhiều lệnh hơn nhưng rủi ro tăng. Đổi cấu hình áp dụng từ chu kỳ pipeline tiếp theo.
                        </p>
                        <p className={`text-[12px] leading-relaxed ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                            <span className="font-semibold">Thang điểm chất lượng (để hình dung):</span>
                            {' '}tối đa <span className="font-semibold text-cyan-400">100</span>;
                            rất cao / hiếm ≥ <span className="font-semibold">90</span>;
                            phổ biến vào lệnh LIVE khoảng <span className="font-semibold text-emerald-400">82–88</span>
                            {' '}(ngưỡng mặc định 82);
                            SIM phổ biến khoảng <span className="font-semibold text-violet-300">72–80</span>
                            {' '}(ngưỡng mặc định 72);
                            điểm thấp / yếu thường &lt; <span className="font-semibold text-amber-300">70</span> (hay bị lọc).
                            Đồng thuận: LIVE ≥3, SIM ≥2 chỉ báo cùng hướng.
                            Lợi thế (edge): LIVE ≥28, SIM ≥22 (mặc định).
                        </p>
                        <p className={`text-[13px] leading-relaxed ${isDark ? 'text-slate-200' : 'text-slate-600'}`}>
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md border text-[11px] font-bold tracking-wide mr-1 ${modeBadgeClass('live', isDark)}`}>LIVE</span>
                            = đặt tiền thật trên sàn qua broker (ô nền xanh lục).
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md border text-[11px] font-bold tracking-wide mx-1 ${modeBadgeClass('sim', isDark)}`}>SIM</span>
                            = lệnh giả chạy nền để AI học (ô nền tím). Setting chung = nền mặc định.
                        </p>
                        <p className={`text-[12px] leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                            <span className="font-semibold">Nhãn:</span>
                            {' '}<span className="text-emerald-400 font-medium">Đã lưu database</span> = giá trị đang dùng trong MongoDB;
                            {' '}<span className="text-red-400 font-medium">Chưa lưu database</span> = bạn vừa chỉnh, chưa bấm Lưu;
                            {' '}<span className="font-medium">Mặc định</span> = giá trị sẵn trong code khi chưa chỉnh.
                        </p>
                    </div>

                    {loadingConfig ? (
                        <p className={`text-[13px] font-medium ${UI.textMuted}`}>Đang tải cấu hình…</p>
                    ) : (
                        <div className="space-y-4">
                            {groups.map((group) => {
                                const isOpen = openGroups.has(group.id);
                                const isResetting = resettingGroup === group.id;
                                const dirtyGroup = groupHasDirty(group);
                                const collapsedDirty = dirtyGroup && !isOpen;
                                return (
                                    <div
                                        key={group.id}
                                        className={`rounded-2xl border-2 overflow-hidden transition-colors ${
                                            collapsedDirty
                                                ? isDark
                                                    ? 'border-red-400/55 bg-red-950/40'
                                                    : 'border-red-300 bg-red-50'
                                                : isDark
                                                    ? 'border-white/40 bg-black/25'
                                                    : 'border-slate-300 bg-white'
                                        }`}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => toggleGroup(group.id)}
                                            className={`w-full flex items-center justify-between gap-3 px-4 py-3 text-left transition-colors ${
                                                collapsedDirty
                                                    ? isDark ? 'hover:bg-red-900/30' : 'hover:bg-red-100/80'
                                                    : isDark ? 'hover:bg-white/5' : 'hover:bg-slate-50'
                                            } border-l-4 ${groupAccent(group.id)}`}
                                        >
                                            <span className={`text-[12px] font-black uppercase tracking-[0.14em] flex items-center gap-2 min-w-0 ${UI.textBold}`}>
                                                <ChevronDown
                                                    size={18}
                                                    className={`shrink-0 transition-transform duration-300 ${isDark ? 'text-cyan-300' : 'text-cyan-600'} ${isOpen ? '' : '-rotate-90'}`}
                                                />
                                                <span className="truncate">{group.label}</span>
                                                {dirtyGroup && (
                                                    <span className={`normal-case tracking-normal text-[10px] font-semibold px-1.5 py-0.5 rounded-md border shrink-0 ${
                                                        isDark
                                                            ? 'bg-red-500/25 text-red-200 border-red-400/50'
                                                            : 'bg-red-100 text-red-700 border-red-300'
                                                    }`}>
                                                        Chưa lưu
                                                    </span>
                                                )}
                                            </span>
                                            <span className={`text-[12px] font-semibold shrink-0 ${isDark ? 'text-cyan-200' : 'text-cyan-700'}`}>
                                                {(group.keys || []).length} mục
                                            </span>
                                        </button>

                                        {isOpen && (
                                            <div className={`px-4 pb-4 pt-3 border-t-2 ${hairline}`}>
                                                {group.id === 'audit' && (
                                                    <div className={`mb-4 rounded-xl border-2 p-3.5 space-y-3 ${isDark ? 'border-purple-400/45 bg-purple-950/25' : 'border-purple-200 bg-purple-50/80'}`}>
                                                        <div>
                                                            <p className={`text-[13px] font-semibold mb-1 ${UI.textBold}`}>
                                                                Xuất dữ liệu lệnh LIVE
                                                            </p>
                                                            <p className={`text-[12px] leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                                                                Tải lịch sử lệnh AutoDuck <strong className="font-semibold">LIVE</strong> (tiền thật)
                                                                kèm lệnh sàn, gói vốn và thống kê hiệu suất — dùng để rà soát, báo cáo hoặc phân tích ngoài app.
                                                                Có thể giới hạn theo <strong className="font-semibold">khoảng ngày</strong> (giờ Việt Nam) hoặc xuất toàn bộ.
                                                                Mỗi lần xuất gồm <strong className="font-semibold">JSON</strong> (dump đầy đủ),
                                                                <strong className="font-semibold"> Markdown</strong> (báo cáo tóm tắt) và
                                                                <strong className="font-semibold"> Excel</strong> (6 sheet: trades, orders, packages, theo symbol, equity, early/late).
                                                                Chi tiết từng file xem ở mục <span className="font-medium">Bộ file sẽ được xuất</span> bên dưới.
                                                            </p>
                                                        </div>
                                                        <div>
                                                            <span className={fieldLabelClass}>Khoảng thời gian</span>
                                                            <div className="flex flex-wrap items-center gap-2 mb-2">
                                                                {[
                                                                    { id: 'all', label: 'Tất cả' },
                                                                    { id: '7', label: '7 ngày' },
                                                                    { id: '30', label: '30 ngày' },
                                                                    { id: '90', label: '90 ngày' },
                                                                ].map(({ id, label }) => (
                                                                    <button
                                                                        key={id}
                                                                        type="button"
                                                                        onClick={() => applyExportRangePreset(id)}
                                                                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors active:scale-[0.97] ${exportRangePresetClass(id)}`}
                                                                    >
                                                                        {label}
                                                                    </button>
                                                                ))}
                                                                <div className="flex items-center gap-1.5">
                                                                    <input
                                                                        type="number"
                                                                        min={1}
                                                                        max={3650}
                                                                        inputMode="numeric"
                                                                        value={exportCustomDays}
                                                                        onChange={(e) => setExportCustomDays(e.target.value)}
                                                                        onKeyDown={(e) => {
                                                                            if (e.key === 'Enter') {
                                                                                e.preventDefault();
                                                                                applyExportCustomDays();
                                                                            }
                                                                        }}
                                                                        placeholder="14"
                                                                        aria-label="Số ngày tùy chỉnh"
                                                                        className={`w-[4.5rem] h-8 px-2 rounded-lg text-[12px] font-semibold border text-center transition-colors ${
                                                                            exportCustomDaysActive
                                                                                ? (isDark
                                                                                    ? 'border-purple-300/70 bg-purple-500/25 text-purple-100'
                                                                                    : 'border-purple-400 bg-purple-100 text-purple-900')
                                                                                : (isDark
                                                                                    ? 'border-white/25 bg-black/20 text-slate-200 placeholder:text-slate-500'
                                                                                    : 'border-slate-200 bg-white text-slate-700 placeholder:text-slate-400')
                                                                        }`}
                                                                    />
                                                                    <span className={hintInlineClass}>ngày · Enter</span>
                                                                </div>
                                                            </div>
                                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                                <label className="block">
                                                                    <span className={`${hintInlineClass} block mb-1`}>Từ ngày</span>
                                                                    <input
                                                                        type="date"
                                                                        value={exportDateFrom}
                                                                        onChange={(e) => handleExportDateFromChange(e.target.value)}
                                                                        className={inputClass}
                                                                    />
                                                                </label>
                                                                <label className="block">
                                                                    <span className={`${hintInlineClass} block mb-1`}>Đến ngày</span>
                                                                    <input
                                                                        type="date"
                                                                        value={exportDateTo}
                                                                        onChange={(e) => handleExportDateToChange(e.target.value)}
                                                                        className={inputClass}
                                                                    />
                                                                </label>
                                                            </div>
                                                            <span className={hintClass}>
                                                                Lọc lệnh có thời gian mở/đóng giao với khoảng đã chọn (00:00–23:59 giờ VN).
                                                                Nhập số ngày tùy ý rồi bấm Enter, hoặc chọn Từ/Đến ngày bên dưới.
                                                                Đang chọn: <span className="font-medium">{exportDateRangePreview.label}</span>
                                                                {exportRangeInvalid && (
                                                                    <span className="text-red-400 font-medium"> — kiểm tra lại ngày bắt đầu/kết thúc</span>
                                                                )}
                                                            </span>
                                                        </div>
                                                        <div>
                                                            <span className={fieldLabelClass}>Thư mục xuất</span>
                                                            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                                                                <input
                                                                    type="text"
                                                                    value={exportDir}
                                                                    onChange={(e) => setExportDir(e.target.value)}
                                                                    placeholder="exports"
                                                                    className={`flex-1 min-w-0 ${inputClass}`}
                                                                />
                                                                <button
                                                                    type="button"
                                                                    onClick={handleExportLiveStats}
                                                                    disabled={exportBtnBusy || saving || exportRangeInvalid || (exportGateBlocked && exportBtnState === 'idle')}
                                                                    title={exportBtnState === 'error' ? exportBtnMessage : undefined}
                                                                    className={`h-10 px-4 rounded-xl text-[13px] font-semibold transition-all duration-300 flex items-center justify-center gap-2 border-2 active:scale-[0.98] shrink-0 w-full sm:w-auto sm:max-w-[min(100%,22rem)] ${exportButtonClass()}`}
                                                                >
                                                                    {exportBtnBusy ? (
                                                                        <>
                                                                            <Download size={14} className="animate-pulse" />
                                                                            <span>Đang xuất…</span>
                                                                        </>
                                                                    ) : exportBtnState === 'success' ? (
                                                                        <>
                                                                            <Check size={16} strokeWidth={2.5} />
                                                                            <span className="truncate">{exportBtnMessage || 'Đã xuất'}</span>
                                                                        </>
                                                                    ) : exportBtnState === 'error' ? (
                                                                        <>
                                                                            <X size={16} strokeWidth={2.5} />
                                                                            <span className="truncate">{exportBtnMessage || 'Lỗi xuất'}</span>
                                                                        </>
                                                                    ) : (
                                                                        <>
                                                                            <Download size={14} />
                                                                            <span>Xuất dữ liệu lệnh Live</span>
                                                                        </>
                                                                    )}
                                                                </button>
                                                            </div>
                                                            <span className={hintClass}>
                                                                Mặc định <code className="text-[11px] not-italic font-mono">exports/</code> — đường dẫn tương đối tính từ gốc backend
                                                            </span>
                                                        </div>
                                                        <label className="block mt-5 pt-1">
                                                            <span className={fieldLabelClass}>
                                                                Mẫu tên file gốc (không gồm phần mở rộng .json / .md / .xlsx)
                                                            </span>
                                                            <div className="flex gap-2 items-center">
                                                                <input
                                                                    ref={exportFileNameInputRef}
                                                                    type="text"
                                                                    value={exportFileNamePattern}
                                                                    onChange={(e) => setExportFileNamePattern(e.target.value)}
                                                                    placeholder={DEFAULT_EXPORT_FILE_NAME_PATTERN}
                                                                    className={`flex-1 min-w-0 ${inputClass}`}
                                                                />
                                                                <button
                                                                    type="button"
                                                                    onClick={clearExportFileNamePattern}
                                                                    disabled={!exportFileNamePattern}
                                                                    title="Xóa toàn bộ mẫu tên file"
                                                                    className={`h-10 px-3 rounded-xl text-[12px] font-semibold border-2 shrink-0 transition-colors active:scale-[0.98] ${
                                                                        !exportFileNamePattern
                                                                            ? (isDark
                                                                                ? 'opacity-40 cursor-not-allowed border-white/15 text-slate-500'
                                                                                : 'opacity-40 cursor-not-allowed border-slate-200 text-slate-400')
                                                                            : (isDark
                                                                                ? 'border-red-400/50 bg-red-500/15 text-red-100 hover:bg-red-500/25'
                                                                                : 'border-red-300 bg-red-50 text-red-800 hover:bg-red-100')
                                                                    }`}
                                                                >
                                                                    Xóa hết
                                                                </button>
                                                            </div>
                                                            <span className={hintClass}>
                                                                Có thể dùng tiếng Việt có dấu; tag thời gian theo múi giờ Việt Nam (VN).
                                                            </span>
                                                        </label>
                                                        <div className="flex flex-wrap gap-x-4 gap-y-2 mt-2">
                                                            {LIVE_EXPORT_NAME_TAGS.map(({ tag, label, example }) => (
                                                                <div key={tag} className="flex items-center gap-1.5">
                                                                    <button
                                                                        type="button"
                                                                        title={`Chèn ${tag} · vd: ${example}`}
                                                                        onClick={() => insertExportNameTag(tag)}
                                                                        className={`px-2 py-1 rounded-lg text-[10px] font-mono border transition-colors active:scale-[0.97] shrink-0 ${
                                                                            isDark
                                                                                ? 'border-purple-400/40 bg-black/30 text-purple-100 hover:bg-purple-500/20'
                                                                                : 'border-purple-200 bg-white text-purple-800 hover:bg-purple-100'
                                                                        }`}
                                                                    >
                                                                        {tag}
                                                                    </button>
                                                                    <span className={hintInlineClass}>
                                                                        {label}
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                        <div className={`rounded-xl border-2 px-4 py-3 shadow-sm ${
                                                            isDark
                                                                ? 'border-cyan-400/70 bg-gradient-to-br from-cyan-950/50 via-purple-950/40 to-[#0a0f18] shadow-cyan-500/10'
                                                                : 'border-cyan-400 bg-gradient-to-br from-cyan-50 via-purple-50/80 to-white shadow-cyan-200/60'
                                                        }`}>
                                                            <p className={`text-[11px] font-bold uppercase tracking-wider mb-2 ${
                                                                isDark ? 'text-cyan-300' : 'text-cyan-700'
                                                            }`}>
                                                                Xem trước tên file
                                                            </p>
                                                            <p className={`text-[15px] sm:text-base font-mono font-bold break-all leading-snug ${
                                                                isDark ? 'text-white' : 'text-slate-900'
                                                            }`}>
                                                                {exportNamePreview}
                                                            </p>
                                                            <p className={`mt-2 text-[11px] font-mono break-all leading-relaxed ${
                                                                isDark ? 'text-cyan-100/85' : 'text-cyan-800'
                                                            }`}>
                                                                {exportNamePreview}.json
                                                                <span className="opacity-50 mx-1.5">·</span>
                                                                {exportNamePreview}.md
                                                                <span className="opacity-50 mx-1.5">·</span>
                                                                {exportNamePreview}.xlsx
                                                            </p>
                                                        </div>
                                                        <div className={`rounded-lg border overflow-hidden ${isDark ? 'border-white/20 bg-black/20' : 'border-slate-200 bg-white/70'}`}>
                                                            <button
                                                                type="button"
                                                                onClick={() => setExportCatalogOpen((v) => !v)}
                                                                className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors ${
                                                                    isDark ? 'hover:bg-white/5' : 'hover:bg-slate-50'
                                                                }`}
                                                            >
                                                                <span className={`text-[11px] font-semibold uppercase tracking-wide ${UI.textMuted}`}>
                                                                    Bộ file sẽ được xuất
                                                                    <span className={`normal-case tracking-normal font-medium ml-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                                                        (3 file)
                                                                    </span>
                                                                </span>
                                                                <ChevronDown
                                                                    size={16}
                                                                    className={`shrink-0 transition-transform duration-300 ${isDark ? 'text-white/70' : 'text-slate-500'} ${exportCatalogOpen ? '' : '-rotate-90'}`}
                                                                />
                                                            </button>
                                                            {exportCatalogOpen && (
                                                                <div className={`px-3 pb-3 pt-1 space-y-2.5 border-t ${isDark ? 'border-white/15' : 'border-slate-200'}`}>
                                                                    {LIVE_EXPORT_FILE_CATALOG.map((item) => (
                                                                        <div key={item.id} className={`text-[11px] leading-relaxed ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                                                                            <p>
                                                                                <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded ${isDark ? 'bg-purple-500/20 text-purple-100' : 'bg-purple-100 text-purple-900'}`}>
                                                                                    {exportNamePreview}{item.extension}
                                                                                </span>
                                                                                <span className={`ml-2 font-semibold ${UI.textBold}`}>{item.label}</span>
                                                                            </p>
                                                                            <p className={`${hintClass} text-[11px] mt-0.5 mb-0 pl-0.5`}>
                                                                                {item.purpose}
                                                                            </p>
                                                                            {item.sheets?.length ? (
                                                                                <ul className={`mt-1 ml-3 list-disc space-y-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                                                                    {item.sheets.map((sheet) => (
                                                                                        <li key={sheet.name}>
                                                                                            <span className="font-medium text-[10px]">{sheet.name}</span>
                                                                                            {' — '}
                                                                                            {sheet.purpose}
                                                                                        </li>
                                                                                    ))}
                                                                                </ul>
                                                                            ) : null}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                        {lastLiveExport && (
                                                            <div className={`text-[11px] leading-relaxed rounded-lg px-3 py-2 ${isDark ? 'bg-black/30 text-slate-200' : 'bg-white/80 text-slate-700'}`}>
                                                                <p>
                                                                    <span className="font-semibold">Lần xuất gần nhất:</span>{' '}
                                                                    {lastLiveExport.baseName || lastLiveExport.stamp}
                                                                </p>
                                                                {lastLiveExport.fileNamePattern && (
                                                                    <p className="opacity-80 font-mono text-[10px] break-all">
                                                                        mẫu: {lastLiveExport.fileNamePattern}
                                                                    </p>
                                                                )}
                                                                {lastLiveExport.dateRange?.label && (
                                                                    <p className="opacity-80">
                                                                        khoảng: {lastLiveExport.dateRange.label}
                                                                    </p>
                                                                )}
                                                                <p className="opacity-90">
                                                                    {lastLiveExport.summary?.autoTradeLive} lệnh LIVE · win {lastLiveExport.summary?.winRatePct}% · PnL {lastLiveExport.summary?.totalPnlVnd?.toLocaleString('vi-VN')} VND
                                                                </p>
                                                                <p className="opacity-75 break-all">{lastLiveExport.outputDir}</p>
                                                                <ul className="mt-2 space-y-2 opacity-90 list-none pl-0">
                                                                    {(lastLiveExport.files || []).map((f) => (
                                                                        <li key={f.name} className={`rounded-md px-2 py-1.5 ${isDark ? 'bg-black/25' : 'bg-white/60'}`}>
                                                                            <p className="font-mono text-[10px] break-all">{f.name}</p>
                                                                            <p className="font-semibold text-[10px] mt-0.5">{f.label || f.kind}</p>
                                                                            {f.purpose && (
                                                                                <p className={`${hintClass} text-[11px] mt-0.5 mb-0`}>{f.purpose}</p>
                                                                            )}
                                                                            {f.sheets?.length ? (
                                                                                <ul className={`mt-1 ml-3 list-disc text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                                                                    {f.sheets.map((s) => (
                                                                                        <li key={s.name}>{s.name}</li>
                                                                                    ))}
                                                                                </ul>
                                                                            ) : null}
                                                                            <p className={`${hintClass} text-[11px] mt-0.5 mb-0`}>
                                                                                {(f.sizeBytes / 1024).toFixed(1)} KB
                                                                            </p>
                                                                        </li>
                                                                    ))}
                                                                </ul>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                                <div className="flex justify-end mb-3">
                                                    <button
                                                        type="button"
                                                        onClick={(e) => handleResetGroup(group, e)}
                                                        disabled={isResetting || saving || (!isAdmin && !adminCode)}
                                                        className={`h-9 px-3 rounded-xl text-[12px] font-semibold transition-all flex items-center gap-1.5 border-2 active:scale-[0.98] ${
                                                            isResetting || (!isAdmin && !adminCode)
                                                                ? 'opacity-50 cursor-not-allowed border-slate-500 text-slate-500'
                                                                : isDark
                                                                    ? 'bg-white/5 text-slate-100 border-white/45 hover:bg-sky-500/15 hover:border-sky-400/60'
                                                                    : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-sky-50 hover:border-sky-300'
                                                        }`}
                                                    >
                                                        <RotateCcw size={13} className={isResetting ? 'animate-spin' : ''} />
                                                        {isResetting ? 'Đang đặt lại…' : 'Đặt lại mặc định'}
                                                    </button>
                                                </div>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    {(group.keys || []).map((field) => {
                                                        const enabled = isDependencyMet(field, draft);
                                                        const dirty = isDirty(field.key);
                                                        return (
                                                        <div
                                                            key={field.key}
                                                            className={`rounded-xl border-2 p-3.5 transition-all duration-200 ease-out origin-center ${
                                                                enabled ? 'hover:scale-[1.015] hover:z-10 hover:shadow-md' : ''
                                                            } ${fieldCardClass(field.badge, enabled, isDark)}`}
                                                        >
                                                            <div className="flex items-start justify-between gap-2 mb-1.5">
                                                                <label className={`text-[13px] font-semibold leading-snug flex flex-wrap items-center gap-1.5 ${UI.textBold}`}>
                                                                    <span>{field.label}</span>
                                                                    {field.badge === 'live' || field.badge === 'sim' ? (
                                                                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md border text-[10px] font-bold tracking-wide ${modeBadgeClass(field.badge, isDark)}`}>
                                                                            {field.badge === 'live' ? 'LIVE' : 'SIM'}
                                                                        </span>
                                                                    ) : null}
                                                                </label>
                                                                <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-md border ${sourceBadgeClass(sources[field.key], isDark, dirty)}`}>
                                                                    {sourceLabel(sources[field.key], dirty)}
                                                                </span>
                                                            </div>
                                                            <p className={`text-[12px] leading-relaxed mb-2 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                                                                {field.help}
                                                            </p>
                                                            <p className={`text-[12px] italic leading-relaxed mb-1.5 ${isDark ? 'text-cyan-100/95' : 'text-cyan-800'}`}>
                                                                {field.example}
                                                            </p>
                                                            {field.note ? (
                                                                <p className={`text-[12px] italic leading-relaxed mb-3 pl-2 border-l-2 ${isDark ? 'border-sky-400/50 text-sky-100/90' : 'border-sky-400 text-sky-900/80'}`}>
                                                                    {field.note}
                                                                </p>
                                                            ) : (
                                                                <div className="mb-3" />
                                                            )}
                                                            {!enabled && (
                                                                <p className={`text-[11px] mb-2 font-medium ${isDark ? 'text-amber-200/90' : 'text-amber-700'}`}>
                                                                    Đang khóa vì phụ thuộc công tắc liên quan đang tắt.
                                                                </p>
                                                            )}
                                                            {field.type === 'boolean' ? (
                                                                <div className="flex items-center gap-3">
                                                                    <IosToggle
                                                                        checked={Boolean(draft[field.key])}
                                                                        disabled={!enabled}
                                                                        onChange={(next) => setDraftValue(field.key, next, 'boolean')}
                                                                    />
                                                                    <span className={`text-[13px] font-medium ${UI.textBold}`}>
                                                                        {draft[field.key] ? 'Bật' : 'Tắt'}
                                                                    </span>
                                                                </div>
                                                            ) : (
                                                                <input
                                                                    type={field.type === 'number' ? 'number' : 'text'}
                                                                    step={field.type === 'number' ? 'any' : undefined}
                                                                    value={draft[field.key] ?? ''}
                                                                    disabled={!enabled}
                                                                    onChange={(e) => setDraftValue(field.key, e.target.value, field.type)}
                                                                    className={`${inputClass} ${!enabled ? 'opacity-60 cursor-not-allowed' : ''}`}
                                                                />
                                                            )}
                                                            <p className={`block mt-2 text-[11px] font-mono italic leading-relaxed opacity-70 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{field.key}</p>
                                                        </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}

                            <div className="flex justify-end pt-2 gap-2 flex-wrap">
                                <button
                                    type="button"
                                    onClick={() => setOpenGroups(new Set())}
                                    className={`h-10 px-4 rounded-xl font-semibold text-[13px] transition-all flex items-center gap-2 border-2 active:scale-[0.98] ${
                                        isDark
                                            ? 'bg-white/5 text-slate-100 border-white/45 hover:bg-white/10'
                                            : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                                    }`}
                                >
                                    <ChevronDown size={14} className="-rotate-90" />
                                    Thu gọn tất cả
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSave}
                                    disabled={saving || resettingGroup || (!isAdmin && !adminCode)}
                                    className={`h-10 px-5 rounded-xl font-semibold text-[13px] transition-all flex items-center gap-2 border-2 active:scale-[0.98] ${
                                        saving || resettingGroup || (!isAdmin && !adminCode)
                                            ? 'opacity-50 cursor-not-allowed border-slate-500 text-slate-500'
                                            : isDark
                                                ? 'bg-cyan-500/20 text-cyan-100 border-white/50 hover:bg-cyan-500/30'
                                                : 'bg-cyan-50 text-cyan-800 border-cyan-300 hover:bg-cyan-100'
                                    }`}
                                >
                                    <Save size={14} />
                                    {saving ? 'Đang lưu…' : 'Lưu cấu hình'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
