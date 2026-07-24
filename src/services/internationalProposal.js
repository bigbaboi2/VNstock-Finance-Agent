/**
 * Deterministic proposal for international tab: Tech 70% + News 30%.
 * No LLM / Insight Home / AI-DB.
 */

/**
 * @param {{ technicals?: object|null, news?: { score?: number, bias?: string }|null }} input
 */
export function buildInternationalProposal({ technicals, news }) {
    const score = Number(technicals?.score) || 0;
    const trend = String(technicals?.trend || '').toUpperCase();
    const actionTech = String(technicals?.action || '').toUpperCase();
    const newsBias = news?.bias || 'neutral';
    const newsScore = Number(news?.score) || 0;
    const reasons = [];
    const weights = [];

    let techW = 0;
    const techBull =
        trend.includes('BULL') || actionTech.includes('LONG') || actionTech.includes('MUA');
    const techBear =
        trend.includes('BEAR') || actionTech.includes('SHORT') || actionTech.includes('BÁN');

    if (techBull) {
        techW = score >= 70 ? 1 : score >= 58 ? 0.6 : 0.25;
        reasons.push(`Kỹ thuật ${technicals?.trend || 'bullish'} · score ${score}`);
    } else if (techBear) {
        if (score <= 32) techW = -1;
        else if (score <= 42) techW = -0.6;
        else techW = -0.25;
        reasons.push(`Kỹ thuật ${technicals?.trend || 'bearish'} · score ${score}`);
    } else {
        techW = score >= 55 ? 0.15 : score <= 45 ? -0.15 : 0;
        reasons.push(score ? `Kỹ thuật trung lập (score ${score})` : 'Chưa đủ nến cho chỉ báo');
    }
    weights.push({ label: 'Tech', points: Math.round(techW * 70), max: 70 });

    let newsW = 0;
    if (newsBias === 'positive') newsW = Math.min(1, 0.35 + Math.abs(newsScore) * 0.2);
    else if (newsBias === 'negative') newsW = -Math.min(1, 0.35 + Math.abs(newsScore) * 0.2);
    if (newsW !== 0) {
        reasons.push(`Tin ${newsBias} (${newsScore >= 0 ? '+' : ''}${newsScore})`);
    } else {
        reasons.push('Tin trung lập / chưa có dữ liệu');
    }
    weights.push({ label: 'Tin', points: Math.round(newsW * 30), max: 30 });

    const composite = techW * 0.7 + newsW * 0.3;

    let action = 'ĐỨNG NGOÀI';
    if (composite >= 0.35) action = 'MUA';
    else if (composite <= -0.35) action = 'BÁN / GIẢM TỶ TRỌNG';
    else if (composite >= 0.15) action = 'THEO DÕI (thiên mua)';
    else if (composite <= -0.15) action = 'THEO DÕI (thiên bán)';

    // Conflict: strong tech vs strong news opposite → soften
    if (techW >= 0.6 && newsW <= -0.5) {
        action = 'THEO DÕI (thiên mua)';
        reasons.push('Tech mạnh nhưng tin tiêu cực — hạ khuyến nghị');
    }
    if (techW <= -0.6 && newsW >= 0.5) {
        action = 'THEO DÕI (thiên bán)';
        reasons.push('Tech yếu nhưng tin tích cực — hạ khuyến nghị');
    }

    const rsi = technicals?.rsi;
    let rsiLabel = 'Trung lập';
    if (Number.isFinite(rsi)) {
        if (rsi >= 70) rsiLabel = 'Quá mua';
        else if (rsi <= 30) rsiLabel = 'Quá bán';
    }

    return {
        action,
        composite: Number(composite.toFixed(3)),
        confidence: Math.min(100, Math.round(Math.abs(composite) * 100)),
        weights,
        reasons,
        techScore: score,
        newsScore,
        newsBias,
        plain: {
            rsi: Number.isFinite(rsi) ? rsi : null,
            rsiLabel,
            macd: technicals?.macdLine ?? null,
            trend: technicals?.trend || null,
            ema20: technicals?.ema20 ?? null,
            ema50: technicals?.ema50 ?? null,
        },
        disclaimer: 'Đề xuất thô từ phân tích kỹ thuật + sentiment tin (Google/Reddit/X). Không phải khuyến nghị AI / tư vấn đầu tư.',
    };
}
