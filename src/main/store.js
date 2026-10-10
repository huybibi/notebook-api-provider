'use strict';

/**
 * store.js — Lưu trữ bền vững cho Notebook API Provider.
 * Dữ liệu nằm trong 1 file JSON, ghi kiểu atomic (tmp + rename) và luôn giữ 1 bản backup.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SCHEMA_VERSION = 1;

function uid(prefix) {
  return String(prefix || 'id') + '_' + crypto.randomBytes(6).toString('hex');
}

function nowIso() {
  return new Date().toISOString();
}

function dayKey(d) {
  const x = d instanceof Date ? d : new Date();
  return (
    x.getFullYear() +
    '-' +
    String(x.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(x.getDate()).padStart(2, '0')
  );
}

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function deepMerge(base, patch) {
  if (!isPlainObject(patch)) return clone(base);
  const out = isPlainObject(base) ? clone(base) : {};
  for (const k of Object.keys(patch)) {
    const pv = patch[k];
    if (isPlainObject(pv) && isPlainObject(out[k])) out[k] = deepMerge(out[k], pv);
    else if (pv !== undefined) out[k] = isPlainObject(pv) ? clone(pv) : pv;
  }
  return out;
}

const DEFAULT_SETTINGS = {
  language: 'vi',
  theme: 'dark',
  accent: 'violet',
  probe: {
    autoEnabled: true,
    probeOnStartup: true,
    intervalMinutes: 60,
    chatProbe: true,
    /* Tự đọc giá đang hiển thị trên trang web của nhà cung cấp khi thêm model. */
    autoWebPrice: true,
    timeoutMs: 20000,
    chatMaxTokens: 8,
    maxSamplesPerProvider: 400,
    windowDays: 7,
    concurrency: 4,
  },
  score: {
    weights: { reliability: 30, speed: 20, quality: 20, quota: 20, stability: 10 },
    speed: { bestMs: 700, worstMs: 8000 },
  },
  gateway: {
    enabled: false,
    port: 8788,
    token: '',
    requireToken: false,
    failoverAttempts: 3,
    exposeModels: true,
    autoModelAlias: 'auto',
    recordUsage: true,
  },
  privacy: {
    encryptKeys: true,
    maskByDefault: true,
    clipboardClearSeconds: 0,
  },
  ui: {
    density: 'comfortable',
    showScores: true,
    defaultView: 'dashboard',
  },
};

function defaultData() {
  return {
    version: SCHEMA_VERSION,
    createdAt: nowIso(),
    settings: clone(DEFAULT_SETTINGS),
    providers: [],
    keys: [],
    models: [],
    samples: [],
    usage: {},
    journal: [],
    alerts: [],
    meta: {
      lastProbeAt: null,
      lastGatewayStartAt: null,
      lastSaveAt: null,
      loadError: null,
    },
  };
}

class Store {
  constructor(filePath) {
    this.filePath = filePath;
    this.tmpPath = filePath + '.tmp';
    this.bakPath = filePath.replace(/\.json$/i, '') + '.backup.json';
    this.data = defaultData();
    this._timer = null;
    this._listeners = new Set();
    this._saveError = null;
  }

  load() {
    try {
      if (fs.existsSync(this.filePath)) {
        this.data = this._normalize(JSON.parse(fs.readFileSync(this.filePath, 'utf8')));
      }
    } catch (err) {
      let recovered = null;
      try {
        if (fs.existsSync(this.bakPath)) {
          recovered = this._normalize(JSON.parse(fs.readFileSync(this.bakPath, 'utf8')));
        }
      } catch (_) {
        recovered = null;
      }
      if (recovered) {
        this.data = recovered;
        this.data.meta.loadError = 'File chính hỏng, đã khôi phục từ backup: ' + err.message;
      } else {
        this.data = defaultData();
        this.data.meta.loadError = 'Không đọc được dữ liệu, đã tạo mới: ' + err.message;
      }
    }
    return this.data;
  }

  _normalize(parsed) {
    const out = defaultData();
    if (!isPlainObject(parsed)) return out;
    out.createdAt = parsed.createdAt || out.createdAt;
    out.settings = deepMerge(DEFAULT_SETTINGS, parsed.settings || {});
    out.providers = Array.isArray(parsed.providers) ? parsed.providers : [];
    out.keys = Array.isArray(parsed.keys) ? parsed.keys : [];
    out.models = Array.isArray(parsed.models) ? parsed.models : [];
    out.samples = Array.isArray(parsed.samples) ? parsed.samples : [];
    out.usage = isPlainObject(parsed.usage) ? parsed.usage : {};
    out.journal = Array.isArray(parsed.journal) ? parsed.journal : [];
    out.alerts = Array.isArray(parsed.alerts) ? parsed.alerts : [];
    out.meta = deepMerge(out.meta, parsed.meta || {});

    /* Sổ cũ từng gắn nhãn "free" cho mọi model (kể cả model tự dò từ endpoint),
       trong khi hầu hết endpoint không trả về bảng giá. Bỏ nhãn đó đúng một lần:
       nhãn miễn phí chỉ còn khi người dùng tự xác nhận hoặc endpoint trả giá 0. */
    if (!out.meta.freeLabelsReset) {
      for (const m of out.models) {
        if (m && m.free === true) m.free = null;
      }
      out.meta.freeLabelsReset = true;
    }
    for (const m of out.models) {
      if (m && m.favorite === undefined) m.favorite = false;
    }
    return out;
  }

  save(immediate) {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    const write = () => {
      this._timer = null;
      try {
        fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
        this.data.meta.lastSaveAt = nowIso();
        const json = JSON.stringify(this.data, null, 2);
        if (fs.existsSync(this.filePath)) {
          try {
            fs.copyFileSync(this.filePath, this.bakPath);
          } catch (_) {
            /* backup là best-effort */
          }
        }
        fs.writeFileSync(this.tmpPath, json, 'utf8');
        fs.renameSync(this.tmpPath, this.filePath);
        this._saveError = null;
      } catch (err) {
        this._saveError = err.message;
      }
    };
    if (immediate) write();
    else if (!this._timer) this._timer = setTimeout(write, 400);
  }

  mutate(fn) {
    const result = fn(this.data);
    this.save(false);
    this.emit();
    return result;
  }

  onChange(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  emit() {
    for (const fn of this._listeners) {
      try {
        fn();
      } catch (_) {
        /* listener lỗi không được làm chết app */
      }
    }
  }

  get settings() {
    return this.data.settings;
  }

  findProvider(id) {
    return this.data.providers.find((p) => p.id === id) || null;
  }

  findKey(id) {
    return this.data.keys.find((k) => k.id === id) || null;
  }

  keysOf(providerId) {
    return this.data.keys.filter((k) => k.providerId === providerId);
  }

  modelsOf(providerId) {
    return this.data.models.filter((m) => m.providerId === providerId);
  }

  /* ------------------------------------------------------------------ */
  /* Ghi nhận số liệu                                                    */
  /* ------------------------------------------------------------------ */

  addSample(sample) {
    const max = this.settings.probe.maxSamplesPerProvider || 400;
    const s = Object.assign({ id: uid('smp'), ts: nowIso() }, sample);
    this.data.samples.push(s);
    // Cắt tỉa theo từng provider để không phình file.
    const byProvider = {};
    for (const it of this.data.samples) {
      (byProvider[it.providerId] = byProvider[it.providerId] || []).push(it);
    }
    const keep = [];
    for (const pid of Object.keys(byProvider)) {
      const list = byProvider[pid];
      keep.push.apply(keep, list.slice(Math.max(0, list.length - max)));
    }
    keep.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
    this.data.samples = keep;
    return s;
  }

  recordUsage(providerId, keyId, delta) {
    const day = dayKey();
    const u = this.data.usage;
    u[providerId] = u[providerId] || {};
    u[providerId][day] = u[providerId][day] || {
      requests: 0,
      promptTokens: 0,
      completionTokens: 0,
      failures: 0,
    };
    const row = u[providerId][day];
    row.requests += delta.requests || 0;
    row.promptTokens += delta.promptTokens || 0;
    row.completionTokens += delta.completionTokens || 0;
    row.failures += delta.failures || 0;
    if (keyId) {
      row.byKey = row.byKey || {};
      row.byKey[keyId] = row.byKey[keyId] || { requests: 0, promptTokens: 0, completionTokens: 0 };
      row.byKey[keyId].requests += delta.requests || 0;
      row.byKey[keyId].promptTokens += delta.promptTokens || 0;
      row.byKey[keyId].completionTokens += delta.completionTokens || 0;
    }
    // Giữ 90 ngày gần nhất.
    const cutoff = new Date(Date.now() - 90 * 86400000);
    for (const pid of Object.keys(u)) {
      for (const d of Object.keys(u[pid])) {
        if (new Date(d + 'T00:00:00') < cutoff) delete u[pid][d];
      }
    }
  }

  usageToday(providerId) {
    const row = (this.data.usage[providerId] || {})[dayKey()];
    return row || { requests: 0, promptTokens: 0, completionTokens: 0, failures: 0 };
  }

  addAlert(alert) {
    const a = Object.assign(
      { id: uid('alt'), ts: nowIso(), level: 'info', seen: false },
      alert
    );
    const dup = this.data.alerts.find(
      (x) =>
        x.code === a.code &&
        x.providerId === a.providerId &&
        x.keyId === a.keyId &&
        Date.now() - new Date(x.ts).getTime() < 6 * 3600000
    );
    if (dup) {
      dup.ts = a.ts;
      dup.message = a.message;
      dup.seen = false;
      return dup;
    }
    this.data.alerts.unshift(a);
    if (this.data.alerts.length > 300) this.data.alerts.length = 300;
    return a;
  }

  addJournal(entry) {
    const e = Object.assign({ id: uid('jrn'), ts: nowIso(), tags: [] }, entry);
    this.data.journal.unshift(e);
    if (this.data.journal.length > 500) this.data.journal.length = 500;
    return e;
  }

  /* ------------------------------------------------------------------ */
  /* Bản dữ liệu an toàn để gửi ra renderer (KHÔNG có secret)            */
  /* ------------------------------------------------------------------ */

  publicSnapshot() {
    const d = this.data;
    return {
      version: d.version,
      createdAt: d.createdAt,
      settings: d.settings,
      providers: d.providers,
      keys: d.keys.map((k) => ({
        id: k.id,
        providerId: k.providerId,
        label: k.label,
        last4: k.last4,
        prefix: k.prefix,
        hasSecret: !!(k.secret && k.secret.data),
        encrypted: !!(k.secret && k.secret.enc),
        enabled: k.enabled !== false,
        status: k.status || 'unknown',
        statusMessage: k.statusMessage || '',
        cooldownUntil: k.cooldownUntil || null,
        lastCheckedAt: k.lastCheckedAt || null,
        lastUsedAt: k.lastUsedAt || null,
        weight: typeof k.weight === 'number' ? k.weight : 1,
        createdAt: k.createdAt,
        updatedAt: k.updatedAt,
      })),
      models: d.models,
      usage: d.usage,
      samples: d.samples.length > 3000 ? d.samples.slice(-3000) : d.samples,
      journal: d.journal,
      alerts: d.alerts,
      meta: d.meta,
      totals: {
        providers: d.providers.length,
        enabledProviders: d.providers.filter((p) => p.enabled !== false).length,
        keys: d.keys.length,
        models: d.models.length,
        samples: d.samples.length,
      },
    };
  }
}

module.exports = { Store, uid, nowIso, dayKey, DEFAULT_SETTINGS, deepMerge, clone };
