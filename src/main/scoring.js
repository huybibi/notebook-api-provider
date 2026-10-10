'use strict';

/**
 * scoring.js — Chấm điểm, xếp hạng và phân loại nhà cung cấp.
 *
 * 5 thành phần (trọng số chỉnh được trong Settings):
 *   reliability  — tỉ lệ thành công trong cửa sổ thời gian
 *   speed        — p50 độ trễ, ánh xạ tuyến tính bestMs..worstMs
 *   quality      — điểm chất lượng do người dùng chấm (1..5)
 *   quota        — đầu quota còn lại hôm nay
 *   stability    — độ dao động độ trễ + mức phạt rate-limit
 *
 * Thành phần nào chưa có dữ liệu thì bị loại khỏi phép chia, không tính là 0.
 */

const { dayKey } = require('./store');

const GRADE_BANDS = [
  { min: 85, grade: 'S' },
  { min: 70, grade: 'A' },
  { min: 55, grade: 'B' },
  { min: 40, grade: 'C' },
  { min: 25, grade: 'D' },
  { min: -1, grade: 'F' },
];

const BUCKETS = {
  web_only: 'web_only',
  no_key: 'no_key',
  dead: 'dead',
  exhausted: 'exhausted',
  rate_limited: 'rate_limited',
  unstable: 'unstable',
  workhorse: 'workhorse',
  lightning: 'lightning',
  premium: 'premium',
  backup: 'backup',
  fresh: 'fresh',
  local_free: 'local_free',
};

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function band(score) {
  for (const b of GRADE_BANDS) if (score >= b.min) return b.grade;
  return 'F';
}

function computeStats(samples, windowDays) {
  const since = Date.now() - Math.max(1, windowDays || 7) * 86400000;
  const list = (samples || []).filter((s) => new Date(s.ts).getTime() >= since);
  const total = list.length;
  const okList = list.filter((s) => s.ok);
  const ok = okList.length;
  const successRate = total ? ok / total : null;

  let consecutiveFailures = 0;
  for (let i = list.length - 1; i >= 0; i--) {
    if (!list[i].ok) consecutiveFailures++;
    else break;
  }

  const lat = okList
    .map((s) => Number(s.latencyMs))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);
  const pct = (p) => (lat.length ? lat[Math.min(lat.length - 1, Math.floor((lat.length - 1) * p))] : null);
  const mean = lat.length ? lat.reduce((a, b) => a + b, 0) / lat.length : null;
  const variance =
    lat.length > 1 && mean ? lat.reduce((a, b) => a + (b - mean) * (b - mean), 0) / lat.length : 0;
  const jitter = mean && mean > 0 ? Math.sqrt(variance) / mean : 0;

  const errorKinds = {};
  const hourly = {};
  let rateLimited = 0;
  for (const s of list) {
    if (!s.ok) {
      const k = s.errorKind || 'unknown';
      errorKinds[k] = (errorKinds[k] || 0) + 1;
      if (k === 'rate_limited' || k === 'quota') rateLimited++;
    }
    const h = Math.floor((Date.now() - new Date(s.ts).getTime()) / 3600000);
    if (h >= 0 && h < 48) hourly[h] = (hourly[h] || 0) + (s.ok ? 1 : 0);
  }

  return {
    total,
    ok,
    fail: total - ok,
    successRate,
    consecutiveFailures,
    p50: pct(0.5),
    p90: pct(0.9),
    minLatency: lat.length ? lat[0] : null,
    maxLatency: lat.length ? lat[lat.length - 1] : null,
    mean,
    jitter,
    errorKinds,
    rateLimited,
    lastOkAt: okList.length ? okList[okList.length - 1].ts : null,
    lastSampleAt: list.length ? list[list.length - 1].ts : null,
    hourly,
  };
}

function sumUsage(store, providerId, sinceDayKey, untilDayKey) {
  const rows = (store.data.usage || {})[providerId] || {};
  const out = { requests: 0, promptTokens: 0, completionTokens: 0, failures: 0, days: 0 };
  for (const d of Object.keys(rows)) {
    if (sinceDayKey && d < sinceDayKey) continue;
    if (untilDayKey && d > untilDayKey) continue;
    const r = rows[d];
    out.requests += r.requests || 0;
    out.promptTokens += r.promptTokens || 0;
    out.completionTokens += r.completionTokens || 0;
    out.failures += r.failures || 0;
    out.days++;
  }
  out.tokens = out.promptTokens + out.completionTokens;
  return out;
}

function dayKeyOffset(days) {
  return dayKey(new Date(Date.now() - days * 86400000));
}

function computeQuota(store, provider) {
  const q = (provider && provider.quota) || {};
  const type = q.type || 'unknown';
  const amount = Number(q.amount) || 0;
  const manualUsed = Number(q.manualUsed) || 0;
  const today = store.usageToday(provider.id);
  const todayTokens = today.promptTokens + today.completionTokens;

  let used = 0;
  let limit = amount;
  let known = true;
  let periodDays = q.windowDays || 0;

  if (type === 'unlimited') {
    return { type, known: true, unlimited: true, used: todayTokens, limit: null, headroom: 1, unit: q.unit || 'none', periodDays: 0, expiresAt: q.expiresAt || null, todayTokens, todayRequests: today.requests };
  }
  if (type === 'rate-only') {
    return { type, known: true, unlimited: true, used: today.requests, limit: null, headroom: 1, unit: 'requests', periodDays: 1, todayTokens, todayRequests: today.requests };
  }
  if (type === 'daily-tokens') {
    used = todayTokens + manualUsed;
    periodDays = 1;
  } else if (type === 'daily-requests') {
    used = today.requests + manualUsed;
    periodDays = 1;
  } else if (type === 'monthly-tokens') {
    used = sumUsage(store, provider.id, dayKeyOffset(30)).tokens + manualUsed;
    periodDays = 30;
  } else if (type === 'total-credit' || type === 'trial-window') {
    used = sumUsage(store, provider.id).tokens + manualUsed;
    periodDays = type === 'trial-window' ? q.windowDays || 14 : 0;
  } else {
    known = false;
  }

  if (!known || limit <= 0) {
    return {
      type,
      known: false,
      used,
      limit: limit > 0 ? limit : null,
      headroom: null,
      unit: q.unit || 'tokens',
      periodDays,
      expiresAt: q.expiresAt || null,
      todayTokens,
      todayRequests: today.requests,
    };
  }

  let headroom = clamp(1 - used / limit, 0, 1);
  if (type === 'trial-window' && q.expiresAt) {
    const msLeft = new Date(q.expiresAt).getTime() - Date.now();
    if (msLeft <= 0) headroom = 0;
  }
  return {
    type,
    known: true,
    used,
    limit,
    headroom,
    unit: q.unit || (type.includes('requests') ? 'requests' : 'tokens'),
    periodDays,
    expiresAt: q.expiresAt || null,
    resetNote: q.resetNote || '',
    todayTokens,
    todayRequests: today.requests,
  };
}

function computeScores(store) {
  const settings = store.settings;
  const windowDays = settings.probe.windowDays || 7;
  const W = settings.score.weights || { reliability: 30, speed: 20, quality: 20, quota: 20, stability: 10 };
  const bestMs = (settings.score.speed && settings.score.speed.bestMs) || 700;
  const worstMs = (settings.score.speed && settings.score.speed.worstMs) || 8000;

  const byProviderSamples = {};
  for (const s of store.data.samples) {
    (byProviderSamples[s.providerId] = byProviderSamples[s.providerId] || []).push(s);
  }

  const result = {};

  for (const provider of store.data.providers) {
    const stats = computeStats(byProviderSamples[provider.id] || [], windowDays);
    const quota = computeQuota(store, provider);
    const keys = store.keysOf(provider.id);
    const enabledKeys = keys.filter((k) => k.enabled !== false);
    const models = store.modelsOf(provider.id).filter((m) => m.enabled !== false);
    const now = Date.now();
    const coolingKeys = enabledKeys.filter((k) => k.cooldownUntil && new Date(k.cooldownUntil).getTime() > now);
    const usableKeys = enabledKeys.filter((k) => !k.cooldownUntil || new Date(k.cooldownUntil).getTime() <= now);
    const badKeys = enabledKeys.filter((k) => k.status === 'invalid');
    const coolingUntil = coolingKeys.length
      ? coolingKeys.map((k) => k.cooldownUntil).sort()[coolingKeys.length - 1]
      : null;

    /* --- 5 thành phần --- */
    let reliability = stats.successRate == null ? null : stats.successRate * 100;
    if (reliability != null && stats.consecutiveFailures >= 3) reliability = Math.min(reliability, 20);
    if (reliability != null && stats.consecutiveFailures >= 5) reliability = Math.min(reliability, 5);

    let speed = null;
    if (stats.p50 != null) {
      if (stats.p50 <= bestMs) speed = 100;
      else if (stats.p50 >= worstMs) speed = 0;
      else speed = 100 * (1 - (stats.p50 - bestMs) / (worstMs - bestMs));
    }

    const qualityManual = Number(provider.qualityManual) || 0;
    const quality = qualityManual > 0 ? (qualityManual / 5) * 100 : 60; // chưa chấm = trung tính

    let quotaScore = null;
    if (quota.unlimited) quotaScore = 100;
    else if (quota.headroom != null) quotaScore = quota.headroom * 100;

    let stability = null;
    if (stats.successRate != null) {
      const jitterPenalty = clamp(stats.jitter, 0, 1.5) * 60;
      const rlPenalty = stats.total ? (stats.rateLimited / stats.total) * 40 : 0;
      stability = clamp(100 - jitterPenalty - rlPenalty, 0, 100);
    }

    const components = { reliability, speed, quality, quota: quotaScore, stability };
    let sumW = 0;
    let sumWV = 0;
    const breakdown = {};
    for (const k of Object.keys(components)) {
      const v = components[k];
      const w = Number(W[k]) || 0;
      breakdown[k] = { value: v == null ? null : Math.round(v * 10) / 10, weight: w };
      if (v != null && w > 0) {
        sumW += w;
        sumWV += w * v;
      }
    }
    let score = sumW > 0 ? sumWV / sumW : 0;
    score += Number(provider.priorityBoost) || 0;
    score = clamp(score, 0, 100);

    /* --- Phân loại --- */
    const buckets = [];
    if (provider.kind === 'web-only') buckets.push(BUCKETS.web_only);
    if (provider.kind === 'local') buckets.push(BUCKETS.local_free);
    if (!enabledKeys.length) buckets.push(BUCKETS.no_key);
    if (quota.known && quota.headroom === 0) buckets.push(BUCKETS.exhausted);
    if (coolingKeys.length) buckets.push(BUCKETS.rate_limited);

    const deadish =
      provider.enabled !== false &&
      enabledKeys.length > 0 &&
      stats.total >= 3 &&
      (stats.consecutiveFailures >= 3 || (stats.successRate != null && stats.successRate < 0.4));
    if (deadish) buckets.push(BUCKETS.dead);
    else if (stats.successRate != null && stats.successRate < 0.85) buckets.push(BUCKETS.unstable);

    if (stats.total === 0) buckets.push(BUCKETS.fresh);
    else if (score >= 70 && (quota.headroom == null || quota.headroom >= 0.5)) buckets.push(BUCKETS.workhorse);
    if (stats.p50 != null && stats.p50 <= 1000 && score >= 50) buckets.push(BUCKETS.lightning);
    if (qualityManual >= 5 && quota.headroom != null && quota.headroom <= 0.35) buckets.push(BUCKETS.premium);
    if (score >= 40 && score < 70) buckets.push(BUCKETS.backup);

    result[provider.id] = {
      providerId: provider.id,
      name: provider.name,
      score: Math.round(score * 10) / 10,
      grade: band(score),
      buckets,
      breakdown,
      stats,
      quota,
      counts: {
        keys: keys.length,
        enabledKeys: enabledKeys.length,
        usableKeys: usableKeys.length,
        coolingKeys: coolingKeys.length,
        badKeys: badKeys.length,
        models: models.length,
      },
      coolingUntil,
      usable: provider.enabled !== false && provider.kind !== 'web-only' && !deadish && usableKeys.length > 0 && models.length > 0,
    };
  }

  /* --- Xếp hạng --- */
  const ranked = Object.values(result).sort((a, b) => b.score - a.score);
  ranked.forEach((r, i) => {
    result[r.providerId].rank = i + 1;
  });

  return result;
}

/** Chọn key tốt nhất của 1 provider: ưu tiên key khỏe, ít dùng nhất. */
function pickKey(store, providerId, excludeIds) {
  const exclude = new Set(excludeIds || []);
  const now = Date.now();
  const candidates = store
    .keysOf(providerId)
    .filter((k) => k.enabled !== false && !exclude.has(k.id))
    .filter((k) => k.status !== 'invalid')
    .filter((k) => !k.cooldownUntil || new Date(k.cooldownUntil).getTime() <= now)
    .map((k) => {
      const row = (store.data.usage[providerId] || {})[dayKey()] || {};
      const byKey = (row.byKey || {})[k.id] || { requests: 0, promptTokens: 0, completionTokens: 0 };
      return { key: k, used: (byKey.promptTokens || 0) + (byKey.completionTokens || 0) + (byKey.requests || 0) };
    });
  // Key chưa có status (unknown) được ưu tiên thử trước để phát hiện sớm.
  candidates.sort((a, b) => {
    const sa = a.key.status === 'ok' ? 0 : a.key.status === 'unknown' ? 1 : 2;
    const sb = b.key.status === 'ok' ? 0 : b.key.status === 'unknown' ? 1 : 2;
    if (sa !== sb) return sa - sb;
    return a.used - b.used;
  });
  return candidates.length ? candidates[0].key : null;
}

/** Danh sách provider dùng được cho gateway, đã xếp theo điểm. */
function rankCandidates(store, scores) {
  return store.data.providers
    .filter((p) => p.enabled !== false && p.kind !== 'web-only')
    .map((p) => ({ provider: p, score: scores[p.id] }))
    .filter((x) => x.score)
    .sort((a, b) => {
      if (!!b.provider.pinned !== !!a.provider.pinned) return b.provider.pinned ? 1 : -1;
      return b.score.score - a.score.score;
    });
}

function computeAlerts(store, scores) {
  const now = Date.now();
  const added = [];
  for (const provider of store.data.providers) {
    const s = scores[provider.id];
    if (!s) continue;
    if (provider.enabled === false) continue;

    for (const k of store.keysOf(provider.id)) {
      if (k.status === 'invalid' && k.enabled !== false) {
        added.push(
          store.addAlert({
            level: 'error',
            code: 'key_invalid',
            providerId: provider.id,
            keyId: k.id,
            message: 'Key "' + (k.label || k.id) + '" của ' + provider.name + ' bị từ chối (401/403).',
          })
        );
      }
      if (k.status === 'quota-exhausted') {
        added.push(
          store.addAlert({
            level: 'warn',
            code: 'key_quota',
            providerId: provider.id,
            keyId: k.id,
            message: 'Key "' + (k.label || k.id) + '" của ' + provider.name + ' đã hết quota.',
          })
        );
      }
      if (k.cooldownUntil && new Date(k.cooldownUntil).getTime() > now) {
        added.push(
          store.addAlert({
            level: 'info',
            code: 'key_cooldown',
            providerId: provider.id,
            keyId: k.id,
            message:
              'Key "' + (k.label || k.id) + '" của ' + provider.name + ' đang chờ hạ nhiệt tới ' +
              new Date(k.cooldownUntil).toLocaleTimeString(),
          })
        );
      }
    }

    if (s.buckets.includes(BUCKETS.dead)) {
      added.push(
        store.addAlert({
          level: 'error',
          code: 'provider_dead',
          providerId: provider.id,
          message: provider.name + ' liên tục lỗi (' + s.stats.consecutiveFailures + ' lần gần nhất). Cân nhắc tắt.',
        })
      );
    }
    if (s.quota.known && s.quota.headroom != null && s.quota.headroom <= 0.1 && s.quota.headroom > 0) {
      added.push(
        store.addAlert({
          level: 'warn',
          code: 'quota_low',
          providerId: provider.id,
          message:
            provider.name + ' sắp hết hạn mức hôm nay (còn ' + Math.round(s.quota.headroom * 100) + '%).',
        })
      );
    }
    if (s.quota.known && s.quota.headroom === 0) {
      added.push(
        store.addAlert({
          level: 'warn',
          code: 'quota_out',
          providerId: provider.id,
          message: provider.name + ' đã dùng hết hạn mức của kỳ hiện tại.',
        })
      );
    }
    if (!store.keysOf(provider.id).length && provider.kind === 'api') {
      added.push(
        store.addAlert({
          level: 'info',
          code: 'no_key',
          providerId: provider.id,
          message: provider.name + ' chưa có API key nào.',
        })
      );
    }
  }
  return added;
}

module.exports = {
  computeScores,
  computeStats,
  computeQuota,
  sumUsage,
  computeAlerts,
  rankCandidates,
  pickKey,
  band,
  BUCKETS,
};
