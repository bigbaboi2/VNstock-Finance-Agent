import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18n from 'i18next';
import axios from 'axios';
import { Check, ChevronDown, Download, RotateCcw, Save, Search, Settings, X } from 'lucide-react';
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
        labelKey: 'exportCatalogJsonLabel',
        purposeKey: 'exportCatalogJsonPurpose',
    },
    {
        id: 'md',
        extension: '.md',
        labelKey: 'exportCatalogMdLabel',
        purposeKey: 'exportCatalogMdPurpose',
    },
    {
        id: 'xlsx',
        extension: '.xlsx',
        labelKey: 'exportCatalogXlsxLabel',
        purposeKey: 'exportCatalogXlsxPurpose',
        sheets: [
            { nameKey: 'exportSheetTradesLive', purposeKey: 'exportSheetTradesLivePurpose' },
            { nameKey: 'exportSheetExchangeOrders', purposeKey: 'exportSheetExchangeOrdersPurpose' },
            { nameKey: 'exportSheetPackagesLive', purposeKey: 'exportSheetPackagesLivePurpose' },
            { nameKey: 'exportSheetBySymbol', purposeKey: 'exportSheetBySymbolPurpose' },
            { nameKey: 'exportSheetEquityCurve', purposeKey: 'exportSheetEquityCurvePurpose' },
            { nameKey: 'exportSheetEarlyLate', purposeKey: 'exportSheetEarlyLatePurpose' },
        ],
    },
];

const stripDiacritics = (s) => String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');

const prepareSearchText = (s, { ignoreCase = true, ignoreDiacritics = true } = {}) => {
    let out = String(s ?? '');
    if (ignoreDiacritics) out = stripDiacritics(out);
    if (ignoreCase) out = out.toLowerCase();
    return out;
};

const isWordChar = (ch) => /[0-9A-Za-zÀ-ỹ_]/.test(ch || '');

/** Tìm mọi khoảng khớp trong text gốc theo tùy chọn kiểu Ctrl+F Word. */
const findMatchRanges = (text, query, options = {}) => {
    const original = String(text ?? '');
    const rawNeedle = String(query ?? '').trim();
    if (!rawNeedle || !original) return [];

    const { ignoreCase = true, ignoreDiacritics = true, wholeWord = false } = options;
    const chars = [...original];
    let prepared = '';
    const map = []; // prepared index → original char index
    for (let origIdx = 0; origIdx < chars.length; origIdx += 1) {
        const chunk = prepareSearchText(chars[origIdx], { ignoreCase, ignoreDiacritics });
        for (let i = 0; i < chunk.length; i += 1) {
            map.push(origIdx);
            prepared += chunk[i];
        }
    }

    const needle = prepareSearchText(rawNeedle, { ignoreCase, ignoreDiacritics });
    if (!needle) return [];

    const ranges = [];
    let searchFrom = 0;
    while (searchFrom < prepared.length) {
        const idx = prepared.indexOf(needle, searchFrom);
        if (idx === -1) break;
        const startOrig = map[idx];
        const endOrig = map[idx + needle.length - 1] + 1;

        if (wholeWord) {
            const before = startOrig > 0 ? chars[startOrig - 1] : '';
            const after = endOrig < chars.length ? chars[endOrig] : '';
            const beforeOk = !before || !isWordChar(before);
            const afterOk = !after || !isWordChar(after);
            if (!beforeOk || !afterOk) {
                searchFrom = idx + 1;
                continue;
            }
        }

        ranges.push({ start: startOrig, end: endOrig });
        searchFrom = idx + Math.max(1, needle.length);
    }
    return ranges;
};

const textMatchesSearch = (text, query, options = {}) => findMatchRanges(text, query, options).length > 0;

const splitHighlightParts = (text, query, options = {}) => {
    const original = String(text ?? '');
    const ranges = findMatchRanges(original, query, options);
    if (!ranges.length) return [{ text: original, hit: false }];

    const parts = [];
    let cursor = 0;
    for (const { start, end } of ranges) {
        if (start > cursor) parts.push({ text: original.slice(cursor, start), hit: false });
        parts.push({ text: original.slice(start, end), hit: true });
        cursor = end;
    }
    if (cursor < original.length) parts.push({ text: original.slice(cursor), hit: false });
    return parts;
};

function HighlightText({ text, query, options, isDark, markClassName }) {
    const needle = String(query || '').trim();
    const parts = splitHighlightParts(text, needle, options);
    if (!needle || parts.every((p) => !p.hit)) return text;
    const markCls = markClassName || (
        isDark
            ? 'bg-amber-400/45 text-amber-50 rounded-[3px] px-0.5 shadow-[0_0_0_1px_rgba(251,191,36,0.35)]'
            : 'bg-amber-200 text-amber-950 rounded-[3px] px-0.5 shadow-[0_0_0_1px_rgba(217,119,6,0.35)]'
    );
    return parts.map((part, i) => (
        part.hit
            ? <mark key={i} className={`${markCls} font-semibold not-italic`}>{part.text}</mark>
            : <span key={i}>{part.text}</span>
    ));
}

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
    if (dirty) return i18n.t('unsavedInDb', { ns: 'autoDuck' });
    if (source === 'db') return i18n.t('savedInDb', { ns: 'autoDuck' });
    if (source === 'env') return 'File .env';
    return i18n.t('defaultValue', { ns: 'autoDuck' });
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
    const { t } = useTranslation('autoDuck');
    const [collapsed, setCollapsed] = useState(true);
    const [groups, setGroups] = useState([]);
    const [values, setValues] = useState({});
    const [sources, setSources] = useState({});
    const [draft, setDraft] = useState({});
    const [saving, setSaving] = useState(false);
    const [resettingGroup, setResettingGroup] = useState(null);
    const [loadingConfig, setLoadingConfig] = useState(false);
    const [readiness, setReadiness] = useState({});
    const [openGroups, setOpenGroups] = useState(() => new Set());
    const [configSearch, setConfigSearch] = useState('');
    const [searchIgnoreCase, setSearchIgnoreCase] = useState(true);
    const [searchIgnoreDiacritics, setSearchIgnoreDiacritics] = useState(true);
    const [searchWholeWord, setSearchWholeWord] = useState(false);
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
            const readinessRes = await axios.get('/api/auto-trade/live-readiness').catch(() => null);
            if (readinessRes?.data?.success) setReadiness(readinessRes.data.data || {});
        } catch (err) {
            onMessage?.({ text: err.response?.data?.message || t('errLoadConfig'), isError: true });
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
            setExportBtnMessage(t('errDaysMin'));
            return;
        }
        if (n > 3650) {
            setExportBtnState('error');
            setExportBtnMessage(t('errDaysMax'));
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

    const searchQuery = configSearch.trim();
    const searchOptions = useMemo(() => ({
        ignoreCase: searchIgnoreCase,
        ignoreDiacritics: searchIgnoreDiacritics,
        wholeWord: searchWholeWord,
    }), [searchIgnoreCase, searchIgnoreDiacritics, searchWholeWord]);

    const fieldMatchesSearch = (field) => {
        if (!searchQuery) return true;
        const blobs = [
            field.key,
            field.label,
            field.help,
            field.example,
            field.note,
            field.badge,
        ].filter(Boolean);
        return blobs.some((blob) => textMatchesSearch(blob, searchQuery, searchOptions));
    };

    const filteredGroups = useMemo(() => {
        if (!searchQuery) return groups;
        return groups
            .map((group) => {
                const groupHit = textMatchesSearch(`${group.id} ${group.label}`, searchQuery, searchOptions);
                const matchedKeys = (group.keys || []).filter(fieldMatchesSearch);
                if (!groupHit && matchedKeys.length === 0) return null;
                return {
                    ...group,
                    keys: groupHit && matchedKeys.length === 0 ? (group.keys || []) : matchedKeys,
                };
            })
            .filter(Boolean);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [groups, searchQuery, searchOptions]);

    useEffect(() => {
        if (!searchQuery) return;
        setOpenGroups(new Set(filteredGroups.map((g) => g.id)));
    }, [searchQuery, filteredGroups]);

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
            text: successText || res.data?.message || t('successSaved'),
            isError: false,
        });
        return res;
    };

    const handleSave = async () => {
        if (!isAdmin && !adminCode) {
            onMessage?.({ text: t('errAdminSaveConfig'), isError: true });
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
                onMessage?.({ text: t('errNoChanges'), isError: false });
                return;
            }
            await postValues(payload);
        } catch (err) {
            onMessage?.({ text: err.response?.data?.message || t('errSaveConfig'), isError: true });
        } finally {
            setSaving(false);
        }
    };

    const handleResetGroup = async (group, event) => {
        event?.stopPropagation?.();
        if (!isAdmin && !adminCode) {
            onMessage?.({ text: t('errAdminReset'), isError: true });
            return;
        }
        const keys = group.keys || [];
        if (keys.length === 0) return;
        if (!window.confirm(t('confirmResetGroup', { label: group.label }))) return;

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
                t('successResetGroup')
            );
        } catch (err) {
            onMessage?.({ text: err.response?.data?.message || t('errResetDefaults'), isError: true });
        } finally {
            setResettingGroup(null);
        }
    };

    const handleExportLiveStats = async () => {
        if (!isAdmin && !adminCode) {
            setExportBtnState('error');
            setExportBtnMessage(t('errAdminExport'));
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
                setExportBtnMessage(res.data.message || t('successExported', { count: fileCount }));
            } else {
                setExportBtnState('error');
                setExportBtnMessage(res.data?.message || t('exportFailed'));
            }
        } catch (err) {
            setExportBtnState('error');
            setExportBtnMessage(err.response?.data?.message || t('errExportLive'));
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
            return { fromCompact: 'invalid', toCompact: 'invalid', label: t('invalidDateRange') };
        }
    }, [exportDateFrom, exportDateTo, t]);

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
                        {t('autoTradeConfigTitle')}
                    </h3>
                    <button
                        type="button"
                        onClick={() => setCollapsed((v) => !v)}
                        title={collapsed ? t('expand') : t('collapse')}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors border-2 ${isDark ? 'border-white/50 bg-white/5 hover:bg-white/10 text-cyan-200' : 'border-cyan-300 bg-cyan-50 hover:bg-cyan-100 text-cyan-700'}`}
                    >
                        <ChevronDown size={16} className={`transition-transform duration-300 ${collapsed ? '-rotate-90' : ''}`} />
                        {collapsed ? t('openSettings') : t('collapse')}
                    </button>
                </div>

                <div className="flex items-center gap-4 flex-wrap">
                    {!isAdmin && (
                        <input
                            type="password"
                            placeholder={t('adminCodePlaceholder')}
                            value={adminCode}
                            onChange={(e) => setAdminCode(e.target.value)}
                            className={`w-36 text-[12px] font-medium px-2.5 py-1.5 rounded-lg outline-none border transition-colors ${isDark ? 'bg-[#1a1f2e] text-slate-200 border-white/35 focus:border-cyan-400' : 'bg-white text-slate-600 border-slate-300 focus:border-cyan-500'}`}
                        />
                    )}
                    <div className="flex items-center gap-2.5">
                        <span className={`text-[12px] font-medium ${UI.textMuted}`}>{t('status')}</span>
                        <IosToggle
                            checked={isEngineEnabled === true}
                            loading={isEngineEnabled === null}
                            disabled={loading || isEngineEnabled === null || (!isAdmin && !adminCode)}
                            onChange={() => onToggleEngine?.()}
                        />
                        <span className={`text-[12px] font-semibold ${isEngineEnabled ? 'text-emerald-400' : 'text-slate-400'}`}>
                            {isEngineEnabled === null ? '…' : isEngineEnabled ? t('toggleOn') : t('toggleOff')}
                        </span>
                        {isEngineEnabled === false && (
                            <span
                                className={`text-[11px] font-medium ${UI.textMuted}`}
                                title={t('engineOffHint')}
                            >
                                {t('liveOrdersStillRun')}
                            </span>
                        )}
                    </div>

                    <div className={`w-px h-5 ${isDark ? 'bg-white/40' : 'bg-slate-300'}`} />

                    <div className="flex items-center gap-2">
                        <span className={`text-[12px] font-medium ${UI.textMuted}`}>{t('riskAppetite')}</span>
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
                            <option value={1} className={isDark ? 'bg-[#1a1f2e] text-slate-300' : 'bg-white text-slate-600'}>{t('risk1')}</option>
                            <option value={2} className={isDark ? 'bg-[#1a1f2e] text-slate-300' : 'bg-white text-slate-600'}>{t('risk2')}</option>
                            <option value={3} className={isDark ? 'bg-[#1a1f2e] text-slate-300' : 'bg-white text-slate-600'}>{t('risk3')}</option>
                            <option value={4} className={isDark ? 'bg-[#1a1f2e] text-slate-300' : 'bg-white text-slate-600'}>{t('risk4')}</option>
                        </select>
                    </div>
                </div>
            </div>

            {collapsed && (
                <p className={`text-[13px] mt-2 leading-relaxed ${isDark ? 'text-slate-300' : UI.textMuted}`}>
                    {t('configCollapsedDesc')}
                </p>
            )}

            {!collapsed && (
                <div className={`mt-4 pt-4 border-t-2 ${hairline}`}>
                    <div className={`mb-5 rounded-xl border-2 px-4 py-3 ${isDark ? 'bg-slate-950/60 border-white/25' : 'bg-slate-50 border-slate-200'}`}>
                        <div className="flex items-center justify-between gap-3 mb-2">
                            <p className={`text-[12px] font-black uppercase tracking-wider ${UI.textBold}`}>LIVE readiness theo setup</p>
                            <span className={`text-[10px] ${UI.textMuted}`}>TESTNET/shadow market PnL</span>
                        </div>
                        {Object.keys(readiness).length === 0 ? (
                            <p className={`text-[12px] ${UI.textMuted}`}>Chưa có setup TESTNET đủ điều kiện để đánh giá LIVE.</p>
                        ) : (
                            <div className="flex flex-wrap gap-2">
                                {Object.values(readiness).map((row) => (
                                    <span key={row.setup} className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold ${row.ready
                                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/35'
                                        : (isDark ? 'bg-amber-500/10 text-amber-200 border-amber-400/35' : 'bg-amber-50 text-amber-800 border-amber-300')}`}>
                                        {row.setup}: {row.ready ? 'READY' : 'TESTNET'} · {row.trades}/{row.criteria?.minTrades} · WR {row.winRate}% · PF {row.profitFactor ?? '∞'}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className={`mb-5 rounded-xl border-2 px-4 py-3 space-y-2 ${isDark ? 'bg-cyan-950/35 border-white/35' : 'bg-cyan-50 border-cyan-200'}`}>
                        <p className={`text-[13px] leading-relaxed ${isDark ? 'text-slate-100' : 'text-slate-700'}`}>
                            <span className="font-semibold text-cyan-400">{t('scoringHow')}</span> {t('scoringIntro')}
                        </p>
                        <p className={`text-[12px] leading-relaxed ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                            <span className="font-semibold">{t('qualityScale')}</span>
                            {' '}{t('qualityScaleDetail')}
                        </p>
                        <p className={`text-[13px] leading-relaxed ${isDark ? 'text-slate-200' : 'text-slate-600'}`}>
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md border text-[11px] font-bold tracking-wide mr-1 ${modeBadgeClass('live', isDark)}`}>LIVE</span>
                            {t('modeBadgeLiveExplain')}
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md border text-[11px] font-bold tracking-wide mx-1 ${modeBadgeClass('sim', isDark)}`}>SIM</span>
                            {t('modeBadgeSimExplain')}
                        </p>
                        <p className={`text-[12px] leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                            <span className="font-semibold">{t('labelLegend')}</span>
                            {' '}<span className="text-emerald-400 font-medium">{t('savedInDb')}</span> {t('labelSavedExplain')}
                            {' '}<span className="text-red-400 font-medium">{t('unsavedInDb')}</span> {t('labelUnsavedExplain')}
                            {' '}<span className="font-medium">{t('defaultValue')}</span> {t('labelDefaultExplain')}
                        </p>
                    </div>

                    {loadingConfig ? (
                        <p className={`text-[13px] font-medium ${UI.textMuted}`}>{t('loadingConfig')}</p>
                    ) : (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <div className="relative">
                                    <Search
                                        size={15}
                                        className={`absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none ${isDark ? 'text-slate-400' : 'text-slate-500'}`}
                                    />
                                    <input
                                        type="search"
                                        value={configSearch}
                                        onChange={(e) => setConfigSearch(e.target.value)}
                                        placeholder={t('searchSettings')}
                                        className={`w-full h-10 pl-9 pr-9 rounded-xl text-[13px] font-medium outline-none border-2 transition-colors ${
                                            isDark
                                                ? 'bg-[#0a0f18] text-slate-100 border-white/35 focus:border-cyan-400 placeholder:text-slate-500'
                                                : 'bg-white text-slate-800 border-slate-300 focus:border-cyan-500 placeholder:text-slate-400'
                                        }`}
                                    />
                                    {configSearch && (
                                        <button
                                            type="button"
                                            onClick={() => setConfigSearch('')}
                                            title={t('clearSearch')}
                                            className={`absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md transition-colors ${
                                                isDark ? 'text-slate-400 hover:bg-white/10 hover:text-slate-200' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                                            }`}
                                        >
                                            <X size={14} />
                                        </button>
                                    )}
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5">
                                    {[
                                        {
                                            id: 'ignoreCase',
                                            label: t('matchCaseInsensitive'),
                                            title: t('searchMatchCaseTitle'),
                                            checked: searchIgnoreCase,
                                            onChange: setSearchIgnoreCase,
                                        },
                                        {
                                            id: 'ignoreDiacritics',
                                            label: t('matchNoDiacritics'),
                                            title: t('searchNoDiacriticsTitle'),
                                            checked: searchIgnoreDiacritics,
                                            onChange: setSearchIgnoreDiacritics,
                                        },
                                        {
                                            id: 'wholeWord',
                                            label: t('matchWholeWord'),
                                            title: t('searchWholeWordTitle'),
                                            checked: searchWholeWord,
                                            onChange: setSearchWholeWord,
                                        },
                                    ].map((opt) => (
                                        <button
                                            key={opt.id}
                                            type="button"
                                            title={opt.title}
                                            aria-pressed={opt.checked}
                                            onClick={() => opt.onChange(!opt.checked)}
                                            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors active:scale-[0.97] ${
                                                opt.checked
                                                    ? (isDark
                                                        ? 'bg-cyan-500/25 text-cyan-100 border-cyan-400/60'
                                                        : 'bg-cyan-100 text-cyan-900 border-cyan-400')
                                                    : (isDark
                                                        ? 'bg-white/5 text-slate-400 border-white/25 hover:bg-white/10'
                                                        : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100')
                                            }`}
                                        >
                                            {opt.checked ? '✓ ' : ''}{opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            {searchQuery && (
                                <p className={`text-[12px] font-medium ${UI.textMuted}`}>
                                    {filteredGroups.length === 0
                                        ? t('searchNoResults', { query: searchQuery })
                                        : t('searchResults', {
                                            count: filteredGroups.reduce((n, g) => n + (g.keys || []).length, 0),
                                            groups: filteredGroups.length,
                                        })}
                                </p>
                            )}
                            {filteredGroups.map((group) => {
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
                                                <span className="truncate">
                                                    <HighlightText text={group.label} query={searchQuery} options={searchOptions} isDark={isDark} />
                                                </span>
                                                {dirtyGroup && (
                                                    <span className={`normal-case tracking-normal text-[10px] font-semibold px-1.5 py-0.5 rounded-md border shrink-0 ${
                                                        isDark
                                                            ? 'bg-red-500/25 text-red-200 border-red-400/50'
                                                            : 'bg-red-100 text-red-700 border-red-300'
                                                    }`}>
                                                        {t('unsavedBadge')}
                                                    </span>
                                                )}
                                            </span>
                                            <span className={`text-[12px] font-semibold shrink-0 ${isDark ? 'text-cyan-200' : 'text-cyan-700'}`}>
                                                {t('itemsCount', { count: (group.keys || []).length })}
                                            </span>
                                        </button>

                                        {isOpen && (
                                            <div className={`px-4 pb-4 pt-3 border-t-2 ${hairline}`}>
                                                {group.id === 'audit' && (
                                                    <div className={`mb-4 rounded-xl border-2 p-3.5 space-y-3 ${isDark ? 'border-purple-400/45 bg-purple-950/25' : 'border-purple-200 bg-purple-50/80'}`}>
                                                        <div>
                                                            <p className={`text-[13px] font-semibold mb-1 ${UI.textBold}`}>
                                                                {t('exportLiveDataTitle')}
                                                            </p>
                                                            <p className={`text-[12px] leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                                                                {t('exportLiveDataDesc', { filesSection: t('filesToExport') })}
                                                            </p>
                                                        </div>
                                                        <div>
                                                            <span className={fieldLabelClass}>{t('timeRange')}</span>
                                                            <div className="flex flex-wrap items-center gap-2 mb-2">
                                                                {[
                                                                    { id: 'all', label: t('all') },
                                                                    { id: '7', label: t('range7d') },
                                                                    { id: '30', label: t('range30d') },
                                                                    { id: '90', label: t('range90d') },
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
                                                                        aria-label={t('customDaysAria')}
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
                                                                    <span className={hintInlineClass}>{t('daysEnterHint')}</span>
                                                                </div>
                                                            </div>
                                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                                <label className="block">
                                                                    <span className={`${hintInlineClass} block mb-1`}>{t('fromDate')}</span>
                                                                    <input
                                                                        type="date"
                                                                        value={exportDateFrom}
                                                                        onChange={(e) => handleExportDateFromChange(e.target.value)}
                                                                        className={inputClass}
                                                                    />
                                                                </label>
                                                                <label className="block">
                                                                    <span className={`${hintInlineClass} block mb-1`}>{t('toDate')}</span>
                                                                    <input
                                                                        type="date"
                                                                        value={exportDateTo}
                                                                        onChange={(e) => handleExportDateToChange(e.target.value)}
                                                                        className={inputClass}
                                                                    />
                                                                </label>
                                                            </div>
                                                            <span className={hintClass}>
                                                                {t('exportDateFilterHint', { label: exportDateRangePreview.label })}
                                                                {exportRangeInvalid && (
                                                                    <span className="text-red-400 font-medium">{t('exportDateInvalid')}</span>
                                                                )}
                                                            </span>
                                                        </div>
                                                        <div>
                                                            <span className={fieldLabelClass}>{t('exportFolder')}</span>
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
                                                                            <span>{t('exporting')}</span>
                                                                        </>
                                                                    ) : exportBtnState === 'success' ? (
                                                                        <>
                                                                            <Check size={16} strokeWidth={2.5} />
                                                                            <span className="truncate">{exportBtnMessage || t('exportedSuccess')}</span>
                                                                        </>
                                                                    ) : exportBtnState === 'error' ? (
                                                                        <>
                                                                            <X size={16} strokeWidth={2.5} />
                                                                            <span className="truncate">{exportBtnMessage || t('exportError')}</span>
                                                                        </>
                                                                    ) : (
                                                                        <>
                                                                            <Download size={14} />
                                                                            <span>{t('exportLiveOrders')}</span>
                                                                        </>
                                                                    )}
                                                                </button>
                                                            </div>
                                                            <span className={hintClass}>
                                                                {t('defaultValue')} <code className="text-[11px] not-italic font-mono">exports/</code> — {t('exportPathHint')}
                                                            </span>
                                                        </div>
                                                        <label className="block mt-5 pt-1">
                                                            <span className={fieldLabelClass}>
                                                                {t('exportFileNamePatternLabel')}
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
                                                                    title={t('clearFileNamePatternTitle')}
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
                                                                    {t('clearAll')}
                                                                </button>
                                                            </div>
                                                            <span className={hintClass}>
                                                                {t('exportFileNameHint')}
                                                            </span>
                                                        </label>
                                                        <div className="flex flex-wrap gap-x-4 gap-y-2 mt-2">
                                                            {LIVE_EXPORT_NAME_TAGS.map(({ tag, label, example }) => (
                                                                <div key={tag} className="flex items-center gap-1.5">
                                                                    <button
                                                                        type="button"
                                                                        title={t('insertTagTitle', { tag, example })}
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
                                                                {t('previewFileName')}
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
                                                                    {t('filesToExport')}
                                                                    <span className={`normal-case tracking-normal font-medium ml-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                                                        {t('exportFileCount')}
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
                                                                                <span className={`ml-2 font-semibold ${UI.textBold}`}>{t(item.labelKey)}</span>
                                                                            </p>
                                                                            <p className={`${hintClass} text-[11px] mt-0.5 mb-0 pl-0.5`}>
                                                                                {t(item.purposeKey)}
                                                                            </p>
                                                                            {item.sheets?.length ? (
                                                                                <ul className={`mt-1 ml-3 list-disc space-y-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                                                                    {item.sheets.map((sheet) => (
                                                                                        <li key={sheet.nameKey}>
                                                                                            <span className="font-medium text-[10px]">{t(sheet.nameKey)}</span>
                                                                                            {' — '}
                                                                                            {t(sheet.purposeKey)}
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
                                                                    <span className="font-semibold">{t('lastExport')}</span>{' '}
                                                                    {lastLiveExport.baseName || lastLiveExport.stamp}
                                                                </p>
                                                                {lastLiveExport.fileNamePattern && (
                                                                    <p className="opacity-80 font-mono text-[10px] break-all">
                                                                        {t('lastExportPattern', { pattern: lastLiveExport.fileNamePattern })}
                                                                    </p>
                                                                )}
                                                                {lastLiveExport.dateRange?.label && (
                                                                    <p className="opacity-80">
                                                                        {t('lastExportRange', { label: lastLiveExport.dateRange.label })}
                                                                    </p>
                                                                )}
                                                                <p className="opacity-90">
                                                                    {t('lastExportSummary', {
                                                                        count: lastLiveExport.summary?.autoTradeLive,
                                                                        winRate: lastLiveExport.summary?.winRatePct,
                                                                        pnl: lastLiveExport.summary?.totalPnlVnd?.toLocaleString('vi-VN'),
                                                                    })}
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
                                                        {isResetting ? t('resettingDefaults') : t('resetDefaults')}
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
                                                                    <span>
                                                                        <HighlightText text={field.label} query={searchQuery} options={searchOptions} isDark={isDark} />
                                                                    </span>
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
                                                                <HighlightText text={field.help} query={searchQuery} options={searchOptions} isDark={isDark} />
                                                            </p>
                                                            <p className={`text-[12px] italic leading-relaxed mb-1.5 ${isDark ? 'text-cyan-100/95' : 'text-cyan-800'}`}>
                                                                <HighlightText text={field.example} query={searchQuery} options={searchOptions} isDark={isDark} />
                                                            </p>
                                                            {field.note ? (
                                                                <p className={`text-[12px] italic leading-relaxed mb-3 pl-2 border-l-2 ${isDark ? 'border-sky-400/50 text-sky-100/90' : 'border-sky-400 text-sky-900/80'}`}>
                                                                    <HighlightText text={field.note} query={searchQuery} options={searchOptions} isDark={isDark} />
                                                                </p>
                                                            ) : (
                                                                <div className="mb-3" />
                                                            )}
                                                            {!enabled && (
                                                                <p className={`text-[11px] mb-2 font-medium ${isDark ? 'text-amber-200/90' : 'text-amber-700'}`}>
                                                                    {t('lockedDependentToggle')}
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
                                                                        {draft[field.key] ? t('toggleOn') : t('toggleOff')}
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
                                                            <p className={`block mt-2 text-[11px] font-mono italic leading-relaxed opacity-70 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                                                                <HighlightText text={field.key} query={searchQuery} options={searchOptions} isDark={isDark} />
                                                            </p>
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
                                    {t('collapseAll')}
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
                                    {saving ? t('savingConfig') : t('saveConfig')}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
