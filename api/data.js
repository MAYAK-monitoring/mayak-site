'use strict';
/**
 * ММ — Маяк-мониторинг: данные для страницы (только чтение).
 *
 * Готовый снимок site-data.json ММ (чтение и ключ сайта — api/_mm.js) переименовывается под разметку страницы.
 * Финансовых расчётов здесь нет: доход, капитал, APR, сводки, доли и доход по дням посчитаны ММ.
 * Сайт должен быть закрыт Vercel Deployment Protection, как старый Маяк.
 */
const { serve } = require('./_mm.js');
const iso = t => (t == null ? null : new Date(t * 1000).toISOString());
const VERSION = p => /Slipstream/.test(p) ? 'CL' : /Meteora/.test(p) ? 'DLMM' : /Orca/.test(p) ? 'CLMM' : 'V3';
const HISTORY = {
  'from-open': ['с открытия', 'Учёт с момента открытия позиции в блокчейне: всё заработанное, включая собранное до обнаружения.'],
  'from-start': ['с начала учёта', 'Позиция открыта до T0 (21.10.2026, 08:29 МСК): учёт со старта ММ, заработанное раньше — в «Не собрано».'],
  incomplete: ['⚠ история неполная', 'Позиция найдена позже старта ММ или до обнаружения были операции, которые ещё не разобраны.'],
  pending: ['момент открытия уточняется', 'ММ ищет момент открытия позиции в блокчейне; учёт пока с первого снимка.'],
};

function position(p) {
  const h = HISTORY[p.history] || HISTORY.pending, a = p.apr || {};
  return {
    id: p.id, portfolio: p.portfolio, kind: 'LP', strategyBucket: p.bucket, pair: p.pair, protocol: p.protocol, chain: p.chain,
    staked: p.staked, status: p.status === 'UNKNOWN' ? null : p.status, version: VERSION(p.protocol), feePct: p.feePct, positionNo: p.positionNo,
    dataState: p.fresh === false ? 'LAST_GOOD' : 'FRESH', quality: 'OK',
    range: p.range ? { lower: p.range.lower, upper: p.range.upper, current: p.range.price, direction: p.range.direction } : null,
    currentValueUsd: p.valueUsd, unclaimedUsd: p.uncollectedUsd, unclaimedFeesUsd: p.uncollectedUsd,
    unclaimedNote: 'Не собрано — текущая стоимость всех несобранных комиссий и наград, включая заработанное до начала учёта.',
    claimable: { asOf: iso(p.lastObservation) },
    incomeSinceMonitoringUsd: p.earnedUsd, monitorSince: iso(p.accountingFrom), mmHistoryLabel: h[0], incomeEvidenceNote: h[1],
    income24hUsd: p.income24hUsd,
    apr24hPct: a.h24 ? a.h24.aprPct : null, apr24hHours: a.h24 ? a.h24.hours : null,
    apr24hNote: 'APR = доход / средний капитал × год за последние 24 ч' + (a.h24 && a.h24.hours < 24 ? ' (позиция моложе суток — за её фактический период)' : '') + '. Без газа и IL.',
    indicativeAprPct: a.all ? a.all.aprPct : null, indicativeAprHours: a.all ? a.all.hours : null,
    indicativeAprNote: 'APR за весь период учёта: доход / средний капитал × год. Интервалы без доказанного капитала не входят ни в доход, ни в капитал.',
    mmAll: a.all || null, mmH24: a.h24 || null,
    inRangePct: null, outOfRangeHours: null, trackedDays: p.ageDays,
  };
}

const GAPS = [
  { status: 'PARTIAL', protocol: 'Журнал операций, BTC', chain: '—', note: 'В ММ появятся позже.' },
];

function bucket(v, key, rows) {
  const g = v.groups[key] || {}, n = rows.length, live = rows.filter(p => p.status !== 'CLOSED');
  // заявки на вывод портфеля (наблюдения владельца, ориентир по текущей цене; не в капитале)
  const pend = (v.pendingWithdrawals || []).filter(w => key === 'all' || w.portfolio === key).map(w => ({ portfolio: w.portfolio, protocol: w.protocol, chain: w.chain,
    status: 'UNVERIFIED_' + (w.status || 'OBSERVED'), quality: 'UNVERIFIED', estimateSol: w.estimateAmount, valueUsd: null, observedAt: w.observedAt,
    note: 'Ориентир ' + (w.estimateUsd == null ? '—' : '$' + Math.round(w.estimateUsd).toLocaleString('en-US')) + ' по текущей цене; в капитал не входит, пока не подтверждено в блокчейне' + (w.receiptTokenAmount ? ' · ' + w.receiptTokenAmount + ' ' + (w.receiptToken || '') : '') }));
  const pendUsd = (v.pendingWithdrawals || []).filter(w => key === 'all' || w.portfolio === key).reduce((s, w) => w.estimateUsd == null ? s : s + w.estimateUsd, 0);
  const a = g.apr || {}, cov = w => (w && w.coverage != null ? w.coverage * 100 : null);
  return {
    snapshotTime: iso(g.observedAt),
    positions: live.map(position),
    historicalEarnings: rows.filter(p => p.status === 'CLOSED').map(p => ({ id: p.id, chain: p.chain, pair: p.pair, positionNo: p.positionNo, observedEarnedUsd: p.earnedUsd, status: 'CLOSED', portfolio: p.portfolio })),
    totals: {
      capitalUsd: g.capitalUsd == null ? null : g.capitalUsd, positionsUsd: g.valueUsd, freeAssetsUsd: g.freeAssetsUsd == null ? null : g.freeAssetsUsd,
      completeness: g.freeAssetsUsd == null || g.walletsStale ? 'PARTIAL' : 'FULL', capitalStatus: g.freeAssetsUsd == null || g.walletsStale ? 'PARTIAL' : 'CONFIRMED',
      capitalLabel: g.freeAssetsUsd == null ? 'Свободные активы кошельков ещё не получены ММ — общий капитал выше показанного.'
        : g.walletsStale ? 'Часть сетей кошельков не ответила в последнем прогоне: для них показан прошлый снимок.'
        : 'Капитал = LP (тело и несобранное) + свободные активы кошельков в 8 сетях. Fragmetric (вывод в ожидании) в капитал не входит.',
      earnedSinceMonitoring: { usd: g.earnedUsd, coverage: n + '/' + n }, earned24h: { usd: g.income24hUsd, coverage: live.length + '/' + live.length },
      weightedIndicativeAprPct: a.all ? a.all.aprPct : null, weightedIndicativeAprCoverage: live.length + '/' + live.length, weightedIndicativeAprCapitalCoveragePct: cov(a.all),
      weightedApr24hPct: a.h24 ? a.h24.aprPct : null, weightedApr24hCoverage: live.length + '/' + live.length, weightedApr24hCapitalCoveragePct: cov(a.h24),
      unrecognized: { count: 0 }, suspicious: 0, pendingWithdrawalsCoverage: '0/' + pend.length, pendingWithdrawalsIndicativeUsd: pend.length ? pendUsd : null,
    },
    byCoin: g.freeByCoin || [], byChain: g.freeByChain || {}, pendingWithdrawals: pend,
    freeAssets: (g.freeAssets || []).map(a => ({ symbol: a.symbol, chain: a.chain, amount: a.amount, priceUsd: a.priceUsd, valueUsd: a.valueUsd, priceSource: 'defillama', stale: !!a.stale, cls: a.cls }))
      .filter(a => a.cls === 'A'),
    capitalBreakdown: { byChain: g.byChain || [], byProtocol: g.byProtocol || [], byCoin: g.byCoin || [] },
    strategyAllocation: { actualUsd: g.byBucket || {}, targets: { quality: 40, medium: 20, high: 40 }, note: 'По утверждённым правилам стратегии' },
    // график «Средний доход в день» — готовый ряд ММ (история до перехода + дни ММ) и его среднее
    dailyIncome: g.dailyDisplay ? { days: g.dailyDisplay.days, averageUsd: g.dailyDisplay.averageUsd } : { days: (g.dailyIncome || []).slice().reverse(), averageUsd: null },
    coverage: GAPS, sourceErrors: ((v.health || {}).errors || []).filter(t => !/поиск токенов Blockscout/.test(t)).map(text => ({ source: 'ММ', text })), warnings: [],
  };
}

function adapt(v) {
  if (!v || v.schema !== 'mayak-monitoring/1') throw Error('неизвестная схема данных ММ');
  const of = pf => v.positions.filter(p => p.portfolio === pf);
  return {
    schema: 2, readOnly: true, source: 'ММ', generatedAt: v.generatedAt, observedAt: v.observedAt, health: v.health,
    portfolios: { defi1: bucket(v, 'defi1', of('defi1')), defi2: bucket(v, 'defi2', of('defi2')) },
    combined: bucket(v, 'all', v.positions),
  };
}

module.exports = serve('site-data.json', adapt);
module.exports.adapt = adapt;
