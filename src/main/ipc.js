'use strict';

/**
 * ipc.js — Toàn bộ cầu nối giữa renderer và lõi.
 * Nguyên tắc: renderer KHÔNG bao giờ nhận secret trừ khi gọi đúng kênh reveal.
 */

const fs = require('fs');
const path = require('path');
const { clipboard } = require('electron');
const vault = require('./vault');
const probe = require('./probe');
const render = require('./render');
const scoring = require('./scoring');
const exporter = require('./exporter');
const { uid, nowIso, dayKey } = require('./store');
const { PRESETS, QUOTA_TEMPLATES } = require('./presets');

const CHEAP_HINTS = [
  'flash',
  'mini',
  'small',
  'nano',
  'tiny',
  'lite',
  'instant',
  'turbo',
  'haiku',
  '8b',
  '7b',
  '4b',
  '3b',
  '1b',
  'fast',
  'air',
];

const NON_CHAT = /embed|rerank|vision-only|audio|tts|whisper|image|guard|moderation|dall|stable-diffusion|sdxl|flux/i;

function pickCheapModel(models) {
  const list = (models || []).map((m) => (typeof m === 'string' ? m : m)).filter(Boolean);
  if (!list.length) return null;
  const scored = list.map((m) => {
    const id = typeof m === 'string' ? m : m.modelId;
    const low = String(id).toLowerCase();
    let s = 0;
    CHEAP_HINTS.forEach((h, i) => {
      if (low.includes(h)) s += 12 - Math.min(i, 11);
    });
    if (NON_CHAT.test(low)) s -= 200;
    if (typeof m !== 'string' && m.favorite) s += 40;
    if (low.includes(':free') || low.includes('/free') || low.endsWith('free')) s += 6;
    return { id, s, len: low.length };
  });
  scored.sort((a, b) => b.s - a.s || a.len - b.len || a.id.localeCompare(b.id));
  return scored[0].id;
}

function normalizeProvider(payload, existing) {
  const base = existing || {};
  const p = payload || {};
  const pick = (k, d) => (p[k] !== undefined ? p[k] : base[k] !== undefined ? base[k] : d);
  const quotaIn = Object.assign({}, base.quota || {}, p.quota || {});
  return {
    id: base.id || uid('prv'),
    name: String(pick('name', 'Nhà cung cấp mới')),
    homepage: String(pick('homepage', '')),
    docsUrl: String(pick('docsUrl', '')),
    /* Trang giá / bảng giá để đọc giá đang hiển thị trên web. */
    pricingUrl: String(pick('pricingUrl', '')),
    kind: pick('kind', 'api'),
    category: pick('category', 'aggregator'),
    compat: pick('compat', 'openai'),
    baseUrl: String(pick('baseUrl', '')),
    authStyle: pick('authStyle', 'bearer'),
    authParam: String(pick('authParam', '')),
    extraHeaders: pick('extraHeaders', {}) || {},
    modelsPath: String(pick('modelsPath', '/models')),
    chatPath: String(pick('chatPath', '/chat/completions')),
    quota: {
      type: quotaIn.type || 'unknown',
      amount: Number(quotaIn.amount) || 0,
      unit: quotaIn.unit || 'tokens',
      windowDays: Number(quotaIn.windowDays) || 0,
      resetNote: String(quotaIn.resetNote || ''),
      expiresAt: quotaIn.expiresAt || null,
      manualUsed: Number(quotaIn.manualUsed) || 0,
    },
    qualityManual: Number(pick('qualityManual', 3)) || 0,
    priorityBoost: Number(pick('priorityBoost', 0)) || 0,
    tags: Array.isArray(pick('tags', [])) ? pick('tags', []) : [],
    notes: String(pick('notes', '')),
    color: pick('color', '#7c5cff'),
    enabled: pick('enabled', true) !== false,
    pinned: pick('pinned', false) === true,
    createdAt: base.createdAt || nowIso(),
    updatedAt: nowIso(),
    lastProbeAt: base.lastProbeAt || null,
    lastOkAt: base.lastOkAt || null,
    lastErrorAt: base.lastErrorAt || null,
    lastErrorKind: base.lastErrorKind || '',
    lastError: base.lastError || '',
  };
}

async function runWithConcurrency(items, limit, worker) {
  const list = items.slice();
  const out = new Array(list.length);
  let cursor = 0;
  const n = Math.max(1, Math.min(limit || 4, list.length || 1));
  const runners = [];
  for (let i = 0; i < n; i++) {
    runners.push(
      (async () => {
        for (;;) {
          const idx = cursor++;
          if (idx >= list.length) return;
          out[idx] = await worker(list[idx], idx);
        }
      })()
    );
  }
  await Promise.all(runners);
  return out;
}

function registerIpc(ctx) {
  const { ipcMain, dialog, shell, store, gateway, getWindow } = ctx;

  const send = (channel, payload) => {
    const win = getWindow && getWindow();
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  };

  const scoresNow = () => scoring.computeScores(store);

  function snapshot() {
    const snap = store.publicSnapshot();
    snap.scores = scoresNow();
    snap.gateway = gateway.status();
    snap.vault = { available: vault.isAvailable(), backend: vault.backendName() };
    snap.dataPath = store.filePath;
    snap.presets = PRESETS;
    snap.quotaTemplates = QUOTA_TEMPLATES;
    snap.cheapModelSuggestion = null;
    return snap;
  }

  /* ------------------------------------------------------------------ */
  /* Cơ bản                                                              */
  /* ------------------------------------------------------------------ */

  ipcMain.handle('app:snapshot', () => snapshot());

  ipcMain.handle('app:recompute', () => {
    const scores = scoresNow();
    const alerts = scoring.computeAlerts(store, scores);
    store.save(false);
    return { scores, alerts: alerts.map((a) => a.id) };
  });

  ipcMain.handle('app:openDataFolder', async () => {
    const err = await shell.openPath(path.dirname(store.filePath));
    return { ok: !err, error: err || null };
  });

  ipcMain.handle('app:openExternal', async (_e, url) => {
    if (!/^https?:\/\//i.test(String(url || ''))) return { ok: false, error: 'URL không hợp lệ' };
    await shell.openExternal(url);
    return { ok: true };
  });

  ipcMain.handle('presets:list', () => ({ presets: PRESETS, quotaTemplates: QUOTA_TEMPLATES }));

  /* ------------------------------------------------------------------ */
  /* Settings                                                            */
  /* ------------------------------------------------------------------ */

  ipcMain.handle('settings:set', async (_e, patch) => {
    const beforePort = store.settings.gateway.port;
    const beforeEnabled = store.settings.gateway.enabled;
    store.mutate((d) => {
      d.settings = require('./store').deepMerge(d.settings, patch || {});
    });
    store.save(true);
    const after = store.settings.gateway;
    if (gateway.status().running && (after.port !== beforePort || after.enabled !== beforeEnabled)) {
      await gateway.stop();
      if (after.enabled) await gateway.start();
    } else if (!gateway.status().running && after.enabled) {
      await gateway.start();
    } else if (gateway.status().running && !after.enabled) {
      await gateway.stop();
    }
    return snapshot();
  });

  /* ------------------------------------------------------------------ */
  /* Nhà cung cấp                                                        */
  /* ------------------------------------------------------------------ */

  ipcMain.handle('provider:create', (_e, payload) => {
    const provider = normalizeProvider(payload, null);
    store.mutate((d) => {
      d.providers.push(provider);
    });
    return { ok: true, provider, snapshot: snapshot() };
  });

  ipcMain.handle('provider:addPresets', (_e, keys) => {
    const wanted = Array.isArray(keys) ? keys : [];
    const created = [];
    const skipped = [];
    store.mutate((d) => {
      for (const key of wanted) {
        const preset = PRESETS.find((p) => p.key === key);
        if (!preset) continue;
        if (d.providers.some((p) => p.name === preset.name)) {
          skipped.push(preset.name);
          continue;
        }
        const provider = normalizeProvider(
          {
            name: preset.name,
            homepage: preset.homepage,
            docsUrl: preset.docsUrl,
            kind: preset.kind,
            category: preset.category,
            compat: preset.compat,
            baseUrl: preset.baseUrl,
            authStyle: preset.authStyle,
            tags: preset.tags,
            notes: preset.notes,
          },
          null
        );
        d.providers.push(provider);
        created.push(provider);
      }
    });
    store.save(true);
    return { ok: true, created: created.length, skipped, snapshot: snapshot() };
  });

  ipcMain.handle('provider:update', (_e, args) => {
    const { id, patch } = args || {};
    const existing = store.findProvider(id);
    if (!existing) return { ok: false, error: 'Không tìm thấy nhà cung cấp' };
    const updated = normalizeProvider(patch, existing);
    updated.id = existing.id;
    updated.createdAt = existing.createdAt;
    store.mutate((d) => {
      const i = d.providers.findIndex((p) => p.id === id);
      if (i >= 0) d.providers[i] = updated;
    });
    return { ok: true, provider: updated, snapshot: snapshot() };
  });

  ipcMain.handle('provider:delete', (_e, id) => {
    store.mutate((d) => {
      d.providers = d.providers.filter((p) => p.id !== id);
      d.keys = d.keys.filter((k) => k.providerId !== id);
      d.models = d.models.filter((m) => m.providerId !== id);
      d.samples = d.samples.filter((s) => s.providerId !== id);
      delete d.usage[id];
      d.journal = d.journal.filter((j) => j.providerId !== id);
      d.alerts = d.alerts.filter((a) => a.providerId !== id);
    });
    store.save(true);
    return { ok: true, snapshot: snapshot() };
  });

  ipcMain.handle('provider:duplicate', (_e, id) => {
    const src = store.findProvider(id);
    if (!src) return { ok: false, error: 'Không tìm thấy nhà cung cấp' };
    const copy = normalizeProvider(Object.assign({}, src, { name: src.name + ' (bản sao)' }), null);
    store.mutate((d) => {
      d.providers.push(copy);
    });
    return { ok: true, provider: copy, snapshot: snapshot() };
  });

  /* ------------------------------------------------------------------ */
  /* Key                                                                 */
  /* ------------------------------------------------------------------ */

  function makeKey(providerId, label, secret) {
    const fp = vault.fingerprint(secret);
    return {
      id: uid('key'),
      providerId,
      label: String(label || 'Key mới'),
      secret: vault.encryptSecret(secret, store.settings.privacy.encryptKeys !== false),
      last4: fp.last4,
      prefix: fp.prefix,
      sha256: fp.sha256,
      enabled: true,
      status: 'unknown',
      statusMessage: '',
      cooldownUntil: null,
      lastCheckedAt: null,
      lastUsedAt: null,
      weight: 1,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
  }

  ipcMain.handle('key:create', (_e, args) => {
    const { providerId, label, secret } = args || {};
    if (!store.findProvider(providerId)) return { ok: false, error: 'Không tìm thấy nhà cung cấp' };
    const text = String(secret || '').trim();
    if (!text) return { ok: false, error: 'Chưa nhập API key' };
    const dup = store.keysOf(providerId).find((k) => k.sha256 && k.sha256 === vault.fingerprint(text).sha256);
    if (dup) return { ok: false, error: 'Key này đã có trong sổ (' + (dup.label || dup.id) + ')' };
    const k = makeKey(providerId, label, text);
    store.mutate((d) => {
      d.keys.push(k);
    });
    return { ok: true, keyId: k.id, snapshot: snapshot() };
  });

  ipcMain.handle('key:bulkCreate', (_e, args) => {
    const { providerId, text, labelPrefix } = args || {};
    if (!store.findProvider(providerId)) return { ok: false, error: 'Không tìm thấy nhà cung cấp' };
    /* Dán cùng một hàng vẫn phải tách ra: xuống dòng, dấu phẩy, dấu cách, dấu chấm phẩy. */
    const lines = String(text || '')
      .split(/[\r\n,;]+|\s+/)
      .map((l) => l.trim().replace(/^["'`]+|["'`,;]+$/g, ''))
      .filter(Boolean);
    let added = 0;
    let dup = 0;
    store.mutate((d) => {
      for (const line of lines) {
        const fp = vault.fingerprint(line);
        if (d.keys.some((k) => k.providerId === providerId && k.sha256 === fp.sha256)) {
          dup++;
          continue;
        }
        const k = makeKey(providerId, (labelPrefix || 'Key') + ' ' + (added + 1), line);
        d.keys.push(k);
        added++;
      }
    });
    return { ok: true, added, dup, snapshot: snapshot() };
  });

  ipcMain.handle('key:update', (_e, args) => {
    const { id, patch } = args || {};
    const k = store.findKey(id);
    if (!k) return { ok: false, error: 'Không tìm thấy key' };
    store.mutate(() => {
      if (patch && patch.label !== undefined) k.label = String(patch.label);
      if (patch && patch.enabled !== undefined) k.enabled = patch.enabled !== false;
      if (patch && patch.weight !== undefined) k.weight = Number(patch.weight) || 1;
      if (patch && patch.secret) {
        const fp = vault.fingerprint(patch.secret);
        k.secret = vault.encryptSecret(patch.secret, store.settings.privacy.encryptKeys !== false);
        k.last4 = fp.last4;
        k.prefix = fp.prefix;
        k.sha256 = fp.sha256;
        k.status = 'unknown';
        k.statusMessage = '';
      }
      if (patch && patch.resetStatus) {
        k.status = 'unknown';
        k.statusMessage = '';
        k.cooldownUntil = null;
      }
      k.updatedAt = nowIso();
    });
    return { ok: true, snapshot: snapshot() };
  });

  ipcMain.handle('key:delete', (_e, id) => {
    store.mutate((d) => {
      d.keys = d.keys.filter((k) => k.id !== id);
    });
    store.save(true);
    return { ok: true, snapshot: snapshot() };
  });

  ipcMain.handle('key:reveal', (_e, id) => {
    const k = store.findKey(id);
    if (!k) return { ok: false, error: 'Không tìm thấy key' };
    const secret = vault.decryptSecret(k.secret);
    store.addJournal({ providerId: k.providerId, text: 'Đã xem secret của key "' + (k.label || k.id) + '"', tags: ['security'] });
    store.save(false);
    return { ok: true, secret };
  });

  /* Sao chép key KHÔNG đưa secret sang renderer: tiến trình chính giải mã rồi ghi
     thẳng vào clipboard. Cũng là đường duy nhất ghi clipboard được, vì preload
     chạy trong sandbox nên không có module clipboard của Electron. */
  ipcMain.handle('key:copy', async (_e, id) => {
    const k = store.findKey(id);
    if (!k) return { ok: false, error: 'Không tìm thấy key' };
    let secret = '';
    try {
      secret = vault.decryptSecret(k.secret);
    } catch (err) {
      return { ok: false, error: 'Không giải mã được key: ' + ((err && err.message) || 'lỗi không rõ') };
    }
    if (!secret) return { ok: false, error: 'Key này không có nội dung để sao chép' };
    await clipboard.writeText(secret);
    store.addJournal({ providerId: k.providerId, text: 'Đã sao chép API key "' + (k.label || k.id) + '"', tags: ['security'] });
    store.save(false);
    return { ok: true, label: k.label || '' };
  });

  ipcMain.handle('key:resetCooldown', (_e, id) => {
    store.mutate(() => {
      const k = store.findKey(id);
      if (k) {
        k.cooldownUntil = null;
        k.status = 'unknown';
        k.statusMessage = '';
      }
    });
    return { ok: true, snapshot: snapshot() };
  });

  /* ------------------------------------------------------------------ */
  /* Model                                                               */
  /* ------------------------------------------------------------------ */

  ipcMain.handle('model:upsert', async (_e, args) => {
    const { providerId, modelId, patch } = args || {};
    if (!store.findProvider(providerId)) return { ok: false, error: 'Không tìm thấy nhà cung cấp' };
    const mid = String(modelId || '').trim();
    if (!mid) return { ok: false, error: 'Thiếu model id' };
    store.mutate((d) => {
      const found = d.models.find((m) => m.providerId === providerId && m.modelId === mid);
      if (found) {
        Object.assign(found, patch || {}, { updatedAt: nowIso() });
        return;
      }
      d.models.push(
        Object.assign(
          {
            id: uid('mdl'),
            providerId,
            modelId: mid,
            displayName: mid,
            contextWindow: null,
            capabilities: {},
            free: null,
            favorite: false,
            enabled: true,
            qualityManual: null,
            notes: '',
            source: 'manual',
            discoveredAt: nowIso(),
            updatedAt: nowIso(),
          },
          patch || {}
        )
      );
    });
    return autoWebPrice(providerId, { ok: true, snapshot: snapshot() });
  });

  ipcMain.handle('model:bulkAdd', async (_e, args) => {
    const { providerId, text } = args || {};
    if (!store.findProvider(providerId)) return { ok: false, error: 'Không tìm thấy nhà cung cấp' };
    /* Một hàng có nhiều model vẫn tách đúng: xuống dòng, dấu phẩy, dấu cách, dấu chấm phẩy. */
    const lines = String(text || '')
      .split(/[\r\n,;]+|\s+/)
      .map((l) => l.trim().replace(/^["'`]+|["'`,;]+$/g, ''))
      .filter(Boolean);
    let added = 0;
    store.mutate((d) => {
      for (const line of lines) {
        if (d.models.some((m) => m.providerId === providerId && m.modelId === line)) continue;
        d.models.push({
          id: uid('mdl'),
          providerId,
          modelId: line,
          displayName: line,
          contextWindow: null,
          capabilities: {},
          free: null,
          favorite: false,
          enabled: true,
          qualityManual: null,
          notes: '',
          source: 'manual',
          discoveredAt: nowIso(),
          updatedAt: nowIso(),
        });
        added++;
      }
    });
    return autoWebPrice(providerId, { ok: true, added, snapshot: snapshot() });
  });

  ipcMain.handle('model:update', (_e, args) => {
    const { id, patch } = args || {};
    store.mutate((d) => {
      const m = d.models.find((x) => x.id === id);
      if (!m) return;
      Object.assign(m, patch || {}, { updatedAt: nowIso() });
      /* Người dùng tự đặt giá/trạng thái miễn phí thì web không được ghi đè nữa. */
      const p = patch || {};
      if (p.free !== undefined || p.pricing !== undefined) m.priceSource = 'manual';
    });
    return { ok: true, snapshot: snapshot() };
  });

  ipcMain.handle('model:delete', (_e, id) => {
    store.mutate((d) => {
      d.models = d.models.filter((m) => m.id !== id);
    });
    return { ok: true, snapshot: snapshot() };
  });

  ipcMain.handle('model:setAllEnabled', (_e, args) => {
    const { providerId, enabled } = args || {};
    store.mutate((d) => {
      for (const m of d.models) if (m.providerId === providerId) m.enabled = enabled !== false;
    });
    return { ok: true, snapshot: snapshot() };
  });

  /* Dò danh sách model từ endpoint — CHỈ khi người dùng bấm, không tự chạy khi đo.
     Nhãn miễn phí chỉ đặt khi endpoint trả về bảng giá và giá bằng 0; không có
     bảng giá thì để trống (null) chứ không suy đoán là miễn phí. */
  ipcMain.handle('model:discover', async (_e, args) => {
    const { providerId } = args || {};
    const provider = store.findProvider(providerId);
    if (!provider) return { ok: false, error: 'Không tìm thấy nhà cung cấp' };
    if (provider.kind === 'web-only') return { ok: false, error: 'Nhà cung cấp web-only: không có API để dò.' };

    const key = scoring.pickKey(store, providerId) || store.keysOf(providerId)[0];
    const secret = provider.authStyle === 'none' ? '' : vault.decryptSecret(key && key.secret);
    if (provider.authStyle !== 'none' && !secret) {
      return { ok: false, error: 'Chưa có API key dùng được để dò model.' };
    }

    const timeoutMs = store.settings.probe.timeoutMs;
    let res = await probe.probeModels(provider, secret, { timeoutMs });
    if (!res.ok && res.errorKind === 'not_found') {
      const alt = altBaseUrl(provider.baseUrl);
      if (alt) {
        const retry = await probe.probeModels(Object.assign({}, provider, { baseUrl: alt }), secret, { timeoutMs });
        if (retry.ok) {
          res = retry;
          store.mutate((d) => {
            const p = d.providers.find((x) => x.id === providerId);
            if (p) p.baseUrl = alt;
          });
        }
      }
    }
    if (!res.ok) {
      return { ok: false, error: (res.message || res.errorKind || 'Không đọc được danh sách model'), snapshot: snapshot() };
    }

    let added = 0;
    let existing = 0;
    let priced = 0;
    let freeCount = 0;
    store.mutate((d) => {
      for (const m of res.models || []) {
        const found = d.models.find((x) => x.providerId === providerId && x.modelId === m.modelId);
        if (found) {
          existing++;
          found.lastSeenAt = nowIso();
          if (m.pricing) {
            found.pricing = m.pricing;
            priced++;
          }
          continue;
        }
        const free = m.pricing ? probe.isFreePricing(m.pricing) : null;
        if (m.pricing) priced++;
        if (free === true) freeCount++;
        d.models.push({
          id: uid('mdl'),
          providerId,
          modelId: m.modelId,
          displayName: m.displayName || m.modelId,
          contextWindow: null,
          capabilities: {},
          free,
          pricing: m.pricing || null,
          favorite: false,
          enabled: true,
          qualityManual: null,
          notes: '',
          source: 'endpoint',
          discoveredAt: nowIso(),
          lastSeenAt: nowIso(),
          updatedAt: nowIso(),
        });
        added++;
      }
    });
    return autoWebPrice(providerId, {
      ok: true,
      providerId,
      total: (res.models || []).length,
      added,
      existing,
      priced,
      freeCount,
      snapshot: snapshot(),
    });
  });

  /* ------------------------------------------------------------------ */
  /* Giá đang hiển thị trên web                                          */
  /* ------------------------------------------------------------------ */

  /* Gốc địa chỉ (scheme + host) — nơi các bản New API/one-api đặt /api/pricing. */
  function originOf(provider, fallbackUrl) {
    for (const candidate of [provider.baseUrl, fallbackUrl]) {
      try {
        return new URL(candidate).origin;
      } catch (_) {}
    }
    return '';
  }

  /* Các địa chỉ cần thử để tìm bảng giá, theo thứ tự ưu tiên. Không có gì thì bỏ
     qua, không tự bịa địa chỉ. */
  function priceUrls(provider, override) {
    const out = [];
    const add = (u) => {
      const s = String(u || '').trim();
      if (!s) return;
      const full = /^https?:\/\//i.test(s) ? s : 'https://' + s;
      if (out.indexOf(full) < 0) out.push(full);
    };
    add(override);
    add(provider.pricingUrl);
    add(provider.homepage);
    const origin = originOf(provider, '');
    if (origin) {
      add(origin + '/pricing');
      add(origin);
    }
    return out;
  }

  /* Đọc giá trên trang web và ghi vào model. Ba nguồn, theo thứ tự:
     1. Bảng giá JSON công khai của các bản New API/one-api (<gốc>/api/pricing).
     2. HTML thô của trang (trang tĩnh).
     3. Chính trang đó mở trong cửa sổ ẩn cho JavaScript chạy xong (SPA) — đa số
        router hiện nay dựng bảng giá bằng JavaScript nên HTML thô chỉ là khung rỗng.
     - Chỉ ghi cho model chưa có giá, hoặc giá cũ cũng do web cung cấp.
     - Giá người dùng tự nhập/sửa (priceSource = 'manual') thì KHÔNG ghi đè.
     - Trang không ghi rõ đơn vị thì vẫn lưu nguyên văn vào priceNote để tự đọc. */
  async function priceFromWeb(providerId, urlOverride, opts) {
    /* fast = đọc giá tự động sau khi thêm model: phải nhanh và không được giữ
       người dùng chờ, nên bỏ bước mở cửa sổ ẩn và chỉ thử địa chỉ đầu tiên. */
    const fast = !!(opts && opts.fast);
    const provider = store.findProvider(providerId);
    if (!provider) return { ok: false, error: 'Không tìm thấy nhà cung cấp' };
    const models = store.modelsOf(providerId);
    if (!models.length) return { ok: false, error: 'Nhà cung cấp chưa có model nào để đối chiếu.' };
    const ids = models.map((m) => m.modelId);
    const timeoutMs = fast
      ? Math.min(Number(store.settings.probe.timeoutMs) || 20000, 4000)
      : Math.min(Number(store.settings.probe.timeoutMs) || 20000, 15000);
    const allUrls = priceUrls(provider, urlOverride);
    const urls = fast ? allUrls.slice(0, 1) : allUrls;
    if (!urls.length) {
      return { ok: false, error: 'Chưa có trang giá để đọc — điền ô “Trang giá” hoặc địa chỉ API.' };
    }
    const tried = [];
    let hit = null;
    let needAuth = false;
    /* Ghi rõ lý do từng lần thử để người dùng biết vì sao không đọc được. */
    const why = (res, n) => {
      if (res.httpStatus === 401 || res.httpStatus === 403) {
        needAuth = true;
        return 'HTTP ' + res.httpStatus + ' — cần đăng nhập';
      }
      if (!res.ok) return res.errorKind ? 'lỗi ' + res.errorKind : 'không tải được';
      if (n === 0 && res.text && res.text.length < 12000 && /<div id="(root|app)"/i.test(res.text)) {
        return 'trang chỉ có khung rỗng (web dựng bằng JavaScript)';
      }
      return n + ' model';
    };

    const origin = originOf(provider, urls[0]);
    if (origin) {
      const jsonUrl = origin + '/api/pricing';
      const key = scoring.pickKey(store, providerId) || store.keysOf(providerId)[0];
      const secret = key && provider.authStyle !== 'none' ? vault.decryptSecret(key.secret) : '';
      const res = await probe.fetchPage(jsonUrl, {
        timeoutMs,
        headers: secret ? { Authorization: 'Bearer ' + secret } : {},
      });
      const found = res.ok ? probe.parseNewApiPricing(res.text, ids) : {};
      tried.push(jsonUrl + ' → ' + why(res, Object.keys(found).length));
      if (Object.keys(found).length) hit = { found, url: jsonUrl, via: 'json' };
    }

    for (const u of urls) {
      if (hit) break;
      const res = await probe.fetchPage(u, { timeoutMs });
      const found = res.ok ? probe.parsePriceHtml(res.text, ids) : {};
      tried.push(u + ' → ' + why(res, Object.keys(found).length));
      if (Object.keys(found).length) hit = { found, url: u, via: 'html' };
    }

    if (!hit && !fast) {
      for (const u of urls.slice(0, 2)) {
        const html = await render.renderHtml(u, { timeoutMs });
        if (!html) {
          tried.push('dựng ' + u + ' → không mở được');
          continue;
        }
        const found = probe.parsePriceHtml(html, ids);
        const signIn = /sign\s?in|đăng nhập|log\s?in|password/i.test(html);
        tried.push('dựng ' + u + ' → ' + Object.keys(found).length + ' model' + (signIn && !Object.keys(found).length ? ' (trang yêu cầu đăng nhập)' : ''));
        if (signIn && !Object.keys(found).length) needAuth = true;
        if (Object.keys(found).length) {
          hit = { found, url: u, via: 'render' };
          break;
        }
      }
    }

    if (!hit) {
      return {
        ok: false,
        url: urls[0],
        tried,
        needAuth,
        error: needAuth
          ? 'Bảng giá của nhà cung cấp này yêu cầu đăng nhập (hoặc chặn truy cập tự động), nên app không đọc được. Bạn nhập giá bằng tay, hoặc dán địa chỉ một trang bảng giá công khai vào ô “Trang giá”.'
          : 'Không đọc được giá. Điền ô “Trang giá” đúng trang bảng giá của nhà cung cấp rồi thử lại.',
      };
    }

    const found = hit.found;
    const url = hit.url;
    const ts = nowIso();
    let matched = 0;
    let priced = 0;
    let freeCount = 0;
    let skipped = 0;
    store.mutate((d) => {
      for (const m of d.models) {
        if (m.providerId !== providerId) continue;
        const h = found[m.modelId];
        if (!h) continue;
        matched++;
        if (m.priceSource === 'manual') {
          skipped++;
          continue;
        }
        m.priceSource = 'web';
        m.priceUrl = url;
        m.priceCheckedAt = ts;
        m.priceNote = h.note || '';
        m.priceAssumed = !!h.assumed;
        if (h.pricing && (h.unitKnown || m.pricing == null)) m.pricing = h.pricing;
        if (h.free === true || h.free === false) m.free = h.free;
        if (h.free === true) freeCount++;
        if (m.pricing) priced++;
        m.updatedAt = ts;
      }
    });
    return { ok: true, url, via: hit.via, tried, matched, priced, freeCount, skipped, snapshot: snapshot() };
  }

  /* Sau khi thêm model, tự đọc giá từ web nếu Cài đặt cho phép. Lỗi đọc giá không
     được làm hỏng việc thêm model. */
  async function autoWebPrice(providerId, result) {
    if (store.settings.probe.autoWebPrice === false) return result;
    try {
      const web = await priceFromWeb(providerId, null, { fast: true });
      result.web = web;
      if (web.ok && web.snapshot) result.snapshot = web.snapshot;
    } catch (err) {
      result.web = { ok: false, error: (err && err.message) || 'Lỗi đọc giá từ web' };
    }
    return result;
  }

  ipcMain.handle('price:web', async (_e, args) => {
    const { providerId, url } = args || {};
    return priceFromWeb(providerId, url);
  });

  /* ------------------------------------------------------------------ */
  /* Probe                                                               */
  /* ------------------------------------------------------------------ */

  /* Đổi qua lại giữa "https://host" và "https://host/v1" (gồm /v1beta, /v2…).
     Nhà cung cấp chỉ đưa host trần, hoặc đưa kèm /v1 — thử phương án còn lại. */
  function altBaseUrl(baseUrl) {
    const base = String(baseUrl || '')
      .trim()
      .replace(/\/+$/, '');
    if (!base) return null;
    if (/\/v\d+[a-z]*$/i.test(base)) return base.replace(/\/v\d+[a-z]*$/i, '');
    return base + '/v1';
  }

  async function probeOneKey(provider, key, options) {
    const opts = options || {};
    const secret = provider.authStyle === 'none' ? '' : vault.decryptSecret(key.secret);
    if (provider.authStyle !== 'none' && !secret) {
      store.mutate(() => {
        const k = store.findKey(key.id);
        if (k) {
          k.status = 'error';
          k.statusMessage = 'Không giải mã được secret';
          k.lastCheckedAt = nowIso();
        }
      });
      return { keyId: key.id, ok: false, error: 'Không giải mã được secret' };
    }

    let res = await probe.probeModels(provider, secret, { timeoutMs: opts.timeoutMs });

    let fixedBase = null;
    if (!res.ok && res.errorKind === 'not_found') {
      const alt = altBaseUrl(provider.baseUrl);
      if (alt) {
        const retry = await probe.probeModels(Object.assign({}, provider, { baseUrl: alt }), secret, {
          timeoutMs: opts.timeoutMs,
        });
        if (retry.ok) {
          res = retry;
          fixedBase = alt;
        }
      }
    }

    store.mutate((d) => {
      const k = d.keys.find((x) => x.id === key.id);
      const p = d.providers.find((x) => x.id === provider.id);
      if (k) {
        k.lastCheckedAt = nowIso();
        k.updatedAt = nowIso();
        if (res.ok) {
          k.status = 'ok';
          k.statusMessage = '';
          k.cooldownUntil = null;
        } else if (res.errorKind === 'unauthorized') {
          k.status = 'invalid';
          k.statusMessage = res.message || 'Key bị từ chối';
        } else if (res.errorKind === 'quota') {
          k.status = 'quota-exhausted';
          k.statusMessage = res.message || 'Hết quota';
          k.cooldownUntil = new Date(Date.now() + 30 * 60000).toISOString();
        } else if (res.errorKind === 'rate_limited') {
          k.status = 'rate-limited';
          k.statusMessage = res.message || 'Bị giới hạn tốc độ';
          const ra = res.rateLimits && res.rateLimits.retryAfter;
          k.cooldownUntil = new Date(Date.now() + (ra ? ra * 1000 : 60000)).toISOString();
        } else if (res.errorKind === 'not_found') {
          k.status = 'ok';
          k.statusMessage = 'Không có endpoint /models — vẫn kiểm tra bằng chat probe';
        } else {
          k.status = 'error';
          k.statusMessage = res.message || res.errorKind;
        }
      }
      if (p) {
        p.lastProbeAt = nowIso();
        if (fixedBase) p.baseUrl = fixedBase;
        if (res.ok) {
          p.lastOkAt = nowIso();
          p.lastError = '';
        } else if (res.errorKind !== 'not_found') {
          p.lastErrorAt = nowIso();
          p.lastErrorKind = res.errorKind || '';
          p.lastError = res.message || '';
        }
      }
    });

    const sample = {
      providerId: provider.id,
      keyId: key.id,
      kind: 'models',
      ts: nowIso(),
      ok: !!res.ok,
      httpStatus: res.httpStatus || 0,
      latencyMs: res.latencyMs || 0,
      errorKind: res.ok ? null : res.errorKind,
      message: res.ok ? '' : String(res.message || '').slice(0, 300),
      discovered: res.models ? res.models.length : 0,
      rateLimits: res.rateLimits || null,
    };
    store.mutate(() => store.addSample(sample));

    return {
      keyId: key.id,
      label: key.label,
      ok: !!res.ok,
      latencyMs: res.latencyMs,
      errorKind: res.errorKind,
      message: res.message,
      models: res.models || [],
      rateLimits: res.rateLimits || null,
    };
  }

  async function probeProvider(providerId, options) {
    const opts = options || {};
    const provider = store.findProvider(providerId);
    if (!provider) return { ok: false, error: 'Không tìm thấy nhà cung cấp' };
    if (provider.kind === 'web-only') {
      return { ok: false, error: 'Nhà cung cấp web-only: không có API để đo.' };
    }

    const keys = store.keysOf(providerId).filter((k) => k.enabled !== false);
    const results = [];
    const targets = keys.length
      ? keys
      : provider.authStyle === 'none'
      ? [{ id: null, label: 'không cần key', secret: null }]
      : [];

    if (!targets.length) {
      store.mutate(() => {
        const p = store.findProvider(providerId);
        if (p) {
          p.lastProbeAt = nowIso();
          p.lastErrorAt = nowIso();
          p.lastError = 'Chưa có API key nào để đo';
        }
      });
      return { ok: false, error: 'Chưa có API key nào. Thêm key trước rồi hãy đo.' };
    }

    for (const key of targets) {
      const r = await probeOneKey(provider, key, opts);
      results.push(r);
      send('probe:progress', { providerId, keyId: key.id, step: 'models', result: r });
    }

    // Chat probe: chỉ chạy trên 1 key tốt nhất để tiết kiệm quota.
    let chatResult = null;
    const anyOk = results.find((r) => r.ok);
    const modelsNow = store.modelsOf(providerId).filter((m) => m.enabled !== false);
    if (opts.chatProbe !== false && anyOk && modelsNow.length) {
      const bestKeyObj = scoring.pickKey(store, providerId) || targets[0];
      const bestKey = bestKeyObj && bestKeyObj.id ? store.findKey(bestKeyObj.id) : targets[0];
      const secret = provider.authStyle === 'none' ? '' : vault.decryptSecret(bestKey && bestKey.secret);
      const modelId = pickCheapModel(modelsNow);
      const providerNow = store.findProvider(providerId) || provider;
      const chatOpts = {
        timeoutMs: Math.max(opts.timeoutMs || 20000, 30000),
        maxTokens: store.settings.probe.chatMaxTokens || 8,
      };
      let res = await probe.probeChat(providerNow, secret, modelId, chatOpts);
      if (!res.ok && res.errorKind === 'not_found') {
        const alt = altBaseUrl(providerNow.baseUrl);
        if (alt) {
          const retry = await probe.probeChat(
            Object.assign({}, providerNow, { baseUrl: alt }),
            secret,
            modelId,
            chatOpts
          );
          if (retry.ok) {
            res = retry;
            store.mutate((d) => {
              const p = d.providers.find((x) => x.id === providerId);
              if (p) p.baseUrl = alt;
            });
          }
        }
      }
      chatResult = { modelId, ok: res.ok, latencyMs: res.latencyMs, errorKind: res.errorKind, message: res.message, usage: res.usage };

      store.mutate((d) => {
        store.addSample({
          providerId,
          keyId: bestKey ? bestKey.id : null,
          kind: 'chat',
          ts: nowIso(),
          ok: !!res.ok,
          httpStatus: res.httpStatus || 0,
          latencyMs: res.latencyMs || 0,
          errorKind: res.ok ? null : res.errorKind,
          message: res.ok ? '' : String(res.message || '').slice(0, 300),
          model: modelId,
          promptTokens: res.usage ? res.usage.promptTokens : 0,
          completionTokens: res.usage ? res.usage.completionTokens : 0,
          rateLimits: res.rateLimits || null,
        });
        if (res.ok && res.usage) {
          store.recordUsage(providerId, bestKey ? bestKey.id : null, {
            requests: 1,
            promptTokens: res.usage.promptTokens,
            completionTokens: res.usage.completionTokens,
          });
        } else if (!res.ok) {
          store.recordUsage(providerId, bestKey ? bestKey.id : null, { requests: 1, failures: 1 });
        }
        const p = d.providers.find((x) => x.id === providerId);
        if (p) {
          p.lastProbeAt = nowIso();
          if (res.ok) {
            p.lastOkAt = nowIso();
            p.lastError = '';
          } else {
            p.lastErrorAt = nowIso();
            p.lastErrorKind = res.errorKind || '';
            p.lastError = res.message || '';
          }
        }
        const k = bestKey ? d.keys.find((x) => x.id === bestKey.id) : null;
        if (k && !res.ok && (res.errorKind === 'unauthorized' || res.errorKind === 'quota')) {
          k.status = res.errorKind === 'unauthorized' ? 'invalid' : 'quota-exhausted';
          k.statusMessage = res.message || res.errorKind;
        }
      });
      send('probe:progress', { providerId, step: 'chat', result: chatResult });
    }

    store.save(false);
    const scores = scoresNow();
    scoring.computeAlerts(store, scores);
    return { ok: true, providerId, results, chat: chatResult, snapshot: snapshot() };
  }

  ipcMain.handle('probe:provider', (_e, args) => {
    const { providerId, chatProbe } = args || {};
    return probeProvider(providerId, {
      chatProbe: chatProbe !== false && store.settings.probe.chatProbe !== false,
      timeoutMs: store.settings.probe.timeoutMs,
    });
  });

  ipcMain.handle('probe:all', async (_e, args) => {
    const opts = args || {};
    const targets = store.data.providers.filter((p) => p.enabled !== false && p.kind !== 'web-only');
    const total = targets.length;
    send('probe:progress', { scope: 'all', done: 0, total, current: null });
    let done = 0;
    const results = await runWithConcurrency(targets, store.settings.probe.concurrency || 3, async (p) => {
      const r = await probeProvider(p.id, {
        chatProbe: opts.chatProbe !== false && store.settings.probe.chatProbe !== false,
        timeoutMs: store.settings.probe.timeoutMs,
      });
      done++;
      send('probe:progress', { scope: 'all', done, total, current: p.name });
      return { providerId: p.id, name: p.name, ok: r.ok, error: r.error || null };
    });
    store.mutate((d) => {
      d.meta.lastProbeAt = nowIso();
    });
    store.save(true);
    const scores = scoresNow();
    scoring.computeAlerts(store, scores);
    return { ok: true, results, snapshot: snapshot() };
  });

  ipcMain.handle('probe:suggestModel', (_e, providerId) => {
    const models = store.modelsOf(providerId);
    return { modelId: pickCheapModel(models) };
  });

  /* ------------------------------------------------------------------ */
  /* Nhật ký & cảnh báo                                                  */
  /* ------------------------------------------------------------------ */

  ipcMain.handle('journal:add', (_e, args) => {
    const { providerId, text, tags } = args || {};
    if (!String(text || '').trim()) return { ok: false, error: 'Nội dung trống' };
    store.mutate(() => {
      store.addJournal({ providerId: providerId || null, text: String(text).trim(), tags: tags || [] });
    });
    return { ok: true, snapshot: snapshot() };
  });

  ipcMain.handle('journal:delete', (_e, id) => {
    store.mutate((d) => {
      d.journal = d.journal.filter((j) => j.id !== id);
    });
    return { ok: true, snapshot: snapshot() };
  });

  ipcMain.handle('alerts:markSeen', () => {
    store.mutate((d) => {
      for (const a of d.alerts) a.seen = true;
    });
    return { ok: true, snapshot: snapshot() };
  });

  ipcMain.handle('alerts:clear', () => {
    store.mutate((d) => {
      d.alerts = [];
    });
    return { ok: true, snapshot: snapshot() };
  });

  /* Ghi clipboard chung (endpoint, model, URL cổng…). Preload chạy trong sandbox
     nên không có module clipboard — mọi thao tác sao chép phải đi qua đây. */
  ipcMain.handle('clipboard:write', async (_e, args) => {
    const text = String((args && args.text) == null ? '' : args.text);
    if (!text) return { ok: false, error: 'Không có gì để sao chép' };
    await clipboard.writeText(text);
    return { ok: true, length: text.length };
  });

  /* ------------------------------------------------------------------ */
  /* Cổng nội bộ                                                         */
  /* ------------------------------------------------------------------ */

  ipcMain.handle('gateway:start', async () => {
    try {
      const st = await gateway.start();
      store.mutate((d) => {
        d.settings.gateway.enabled = true;
      });
      return { ok: true, gateway: st, snapshot: snapshot() };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('gateway:stop', async () => {
    const st = await gateway.stop();
    store.mutate((d) => {
      d.settings.gateway.enabled = false;
    });
    return { ok: true, gateway: st, snapshot: snapshot() };
  });

  ipcMain.handle('gateway:status', () => gateway.status());

  /* ------------------------------------------------------------------ */
  /* Xuất / nhập                                                          */
  /* ------------------------------------------------------------------ */

  function buildExport(kind, options) {
    const scores = scoresNow();
    const opts = options || {};
    const entries = exporter.collectEntries(store, scores, {
      includeSecrets: opts.includeSecrets !== false,
      onlyUsable: !!opts.onlyUsable,
      requireModels: !!opts.requireModels,
    });
    switch (kind) {
      case 'env':
        return { content: exporter.envFile(entries), ext: 'env', name: 'notebook-providers.env' };
      case 'json':
        return { content: exporter.jsonConfig(entries), ext: 'json', name: 'notebook-providers.json' };
      case 'litellm':
        return { content: exporter.litellmYaml(entries), ext: 'yaml', name: 'litellm-config.yaml' };
      case 'markdown':
        return { content: exporter.markdownReport(store, scores, opts), ext: 'md', name: 'bao-cao-nha-cung-cap.md' };
      case 'csv':
        return { content: '\ufeff' + exporter.csvReport(store, scores), ext: 'csv', name: 'nha-cung-cap.csv' };
      case 'curl': {
        const e = entries[0];
        return {
          content: entries
            .slice(0, 12)
            .map((x) => '# ' + x.name + '\n' + exporter.curlSnippet(x, x.models[0]))
            .join('\n\n'),
          ext: 'sh',
          name: 'curl-mau.sh',
        };
      }
      case 'python': {
        const e = entries[0];
        return {
          content: entries
            .slice(0, 12)
            .map((x) => '# ' + x.name + '\n' + exporter.pythonSnippet(x, x.models[0]))
            .join('\n\n'),
          ext: 'py',
          name: 'vi-du-python.py',
        };
      }
      case 'node': {
        const e = entries[0];
        return {
          content: entries
            .slice(0, 12)
            .map((x) => '// ' + x.name + '\n' + exporter.nodeSnippet(x, x.models[0]))
            .join('\n\n'),
          ext: 'js',
          name: 'vi-du-node.js',
        };
      }
      case 'gateway':
        return { content: exporter.gatewaySnippet(store.settings.gateway), ext: 'sh', name: 'dung-cong-noi-bo.sh' };
      case 'vault': {
        const payload = {
          kind: 'notebook-vault-backup',
          version: 1,
          exportedAt: nowIso(),
          note: 'Bản sao này CHỨA secret đã mã hoá bằng DPAPI của máy hiện tại. Chỉ giải mã được trên đúng máy + đúng user.',
          data: {
            settings: store.settings,
            providers: store.data.providers,
            keys: store.data.keys,
            models: store.data.models,
            journal: store.data.journal,
          },
        };
        return { content: JSON.stringify(payload, null, 2), ext: 'json', name: 'notebook-backup.json' };
      }
      default:
        return { content: '', ext: 'txt', name: 'export.txt' };
    }
  }

  ipcMain.handle('export:preview', (_e, args) => {
    const { kind, options } = args || {};
    const built = buildExport(kind, options);
    return {
      ok: true,
      kind,
      name: built.name,
      ext: built.ext,
      content: String(built.content || ''),
      bytes: Buffer.byteLength(String(built.content || ''), 'utf8'),
    };
  });

  ipcMain.handle('export:save', async (_e, args) => {
    const { kind, options, suggestedName } = args || {};
    const built = buildExport(kind, options);
    const win = getWindow && getWindow();
    const res = await dialog.showSaveDialog(win, {
      title: 'Lưu ' + built.name,
      defaultPath: suggestedName || built.name,
      filters: [{ name: built.ext.toUpperCase(), extensions: [built.ext] }, { name: 'Tất cả', extensions: ['*'] }],
    });
    if (res.canceled || !res.filePath) return { ok: false, canceled: true };
    fs.writeFileSync(res.filePath, String(built.content || ''), 'utf8');
    return { ok: true, filePath: res.filePath, bytes: Buffer.byteLength(String(built.content || ''), 'utf8') };
  });

  ipcMain.handle('vault:restore', async () => {
    const win = getWindow && getWindow();
    const res = await dialog.showOpenDialog(win, {
      title: 'Chọn file backup để khôi phục',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (res.canceled || !res.filePaths.length) return { ok: false, canceled: true };
    let payload;
    try {
      payload = JSON.parse(fs.readFileSync(res.filePaths[0], 'utf8'));
    } catch (err) {
      return { ok: false, error: 'File không đọc được: ' + err.message };
    }
    if (!payload || payload.kind !== 'notebook-vault-backup') {
      return { ok: false, error: 'Đây không phải file backup của Notebook.' };
    }
    const merge = false; // khôi phục = thay thế, giữ settings hiện tại
    store.mutate((d) => {
      const keepSettings = d.settings;
      d.providers = payload.data.providers || [];
      d.keys = payload.data.keys || [];
      d.models = payload.data.models || [];
      d.journal = payload.data.journal || [];
      d.settings = keepSettings;
    });
    store.save(true);
    return { ok: true, snapshot: snapshot() };
  });

  return { probeProvider, snapshot, buildExport };
}

module.exports = { registerIpc, pickCheapModel };
