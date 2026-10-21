'use strict';
/**
 * ММ — Маяк-мониторинг: данные для страницы (только чтение).
 *
 * Берёт готовый снимок site-data.json из приватного репозитория MAYAK-monitoring (ветка site-data) токеном
 * MM_GITHUB_READ_TOKEN (fine-grained, только Contents: Read-only) и переименовывает поля под разметку страницы.
 * Финансовых расчётов здесь нет: доход, капитал, APR, сводки, доли и доход по дням посчитаны ММ.
 * Сайт должен быть закрыт Vercel Deployment Protection, как старый Маяк.
 */
const OWNER = 'MAYAK-monitoring', REPO = 'MAYAK-monitoring', FILE = 'site-data.json', BRANCH = 'site-data';
const MAX_BYTES = 5_000_000;
const iso = t => (t == null ? null : new Date(t * 1000).toISOString());
const VERSION = p => /Slipstream/.test(p) ? 'CL' : /Meteora/.test(p) ? 'DLMM' : /Orca/.test(p) ? 'CLMM' : 'V3';
const HISTORY = {
  'from-open': ['с открытия', 'Учёт с момента открытия позиции в блокчейне: всё заработанное, включая собранное до обнаружения.'],
  'from-start': ['с начала учёта', 'Позиция открыта до T0 (20.10.2026): учёт со старта ММ, заработанное раньше — в «Не собрано».'],
  incomplete: ['⚠ история неполная', 'Позиция найдена позже старта ММ или до обнаружения были операции, которые ещё не разобраны.'],
  pending: ['момент открытия уточняется', 'ММ ищет момент открытия позиции в блокчейне; учёт пока с первого снимка.'],
};

async function snapshot(token) {
  const r = await fetch('https://api.github.com/repos/' + OWNER + '/' + REPO + '/contents/' + FILE + '?ref=' + BRANCH, {
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'MM-site-readonly' },
    signal: AbortSignal.timeout(12000),
  });
  if (!r.ok) throw Error('чтение данных ММ: HTTP ' + r.status);
  const obj = await r.json();
  const buf = Buffer.from(String(obj.content || '').replace(/\s/g, ''), 'base64');
  if (!buf.length || buf.length > MAX_BYTES) throw Error('снимок ММ пустой или слишком большой');
  const text = buf.toString('utf8');
  if (/0x[0-9a-fA-F]{40}|"[1-9A-HJ-NP-Za-km-z]{43,44}"/.test(text)) throw Error('в снимке адрес — не показываю');
  return JSON.parse(text);
}

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
  { status: 'NONE', protocol: 'Fragmetric, выводы в ожидании', chain: 'Solana', note: 'В ММ появятся позже.' },
  { status: 'PARTIAL', protocol: 'История диапазона, журнал операций, BTC', chain: '—', note: 'В ММ появятся позже.' },
];

function bucket(v, key, rows) {
  const g = v.groups[key] || {}, n = rows.length, live = rows.filter(p => p.status !== 'CLOSED');
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
      unrecognized: { count: 0 }, suspicious: 0,
    },
    byCoin: g.freeByCoin || [], byChain: g.freeByChain || {}, pendingWithdrawals: [],
    freeAssets: (g.freeAssets || []).map(a => ({ symbol: a.symbol, chain: a.chain, amount: a.amount, priceUsd: a.priceUsd, valueUsd: a.valueUsd, priceSource: 'defillama', stale: !!a.stale, cls: a.cls }))
      .filter(a => a.cls === 'A'),
    capitalBreakdown: { byChain: g.byChain || [], byProtocol: g.byProtocol || [], byCoin: g.byCoin || [] },
    strategyAllocation: { actualUsd: g.byBucket || {}, targets: { quality: 40, medium: 20, high: 40 }, note: 'По утверждённым правилам стратегии' },
    // график «Средний доход в день» — готовый ряд ММ (история до перехода + дни ММ) и его среднее
    dailyIncome: g.dailyDisplay ? { days: g.dailyDisplay.days, averageUsd: g.dailyDisplay.averageUsd } : { days: (g.dailyIncome || []).slice().reverse(), averageUsd: null },
    coverage: GAPS, sourceErrors: ((v.health || {}).errors || []).map(text => ({ source: 'ММ', text })), warnings: [],
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

module.exports = async function (req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  if (req.method !== 'GET') return res.status(405).send('{"error":"METHOD_NOT_ALLOWED"}');
  // доступ к цифрам — только по ключу сайта (MM_SITE_KEY в окружении Vercel); без ключа в окружении сайт закрыт
  const key = process.env.MM_SITE_KEY;
  if (!key) return res.status(503).send(JSON.stringify({ error: 'не задан MM_SITE_KEY — данные закрыты' }));
  const given = Buffer.from(String(req.headers['x-mm-key'] || '')), want = Buffer.from(key);
  if (given.length !== want.length || !require('node:crypto').timingSafeEqual(given, want)) return res.status(401).send(JSON.stringify({ error: 'нужен ключ' }));
  const token = process.env.MM_GITHUB_READ_TOKEN;
  if (!token) return res.status(500).send(JSON.stringify({ error: 'не задан MM_GITHUB_READ_TOKEN' }));
  try { return res.status(200).send(JSON.stringify(adapt(await snapshot(token)))); }
  catch (e) { return res.status(502).send(JSON.stringify({ error: String(e && e.message || e).slice(0, 200) })); }
};
module.exports.adapt = adapt;
