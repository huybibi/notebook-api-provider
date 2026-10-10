'use strict';

/**
 * gateway.js — Cổng OpenAI-compatible chạy tại 127.0.0.1.
 *
 * Đây là tính năng biến cuốn sổ thành thứ dùng được: trỏ bất kỳ công cụ nào
 * (Cursor, Continue, OpenWebUI, script Python…) vào http://127.0.0.1:PORT/v1
 * rồi để nó tự chọn nhà cung cấp miễn phí tốt nhất còn quota, tự chuyển khi lỗi.
 *
 * Định tuyến theo trường "model":
 *   "auto"                        → nhà cung cấp điểm cao nhất còn dùng được
 *   "<providerId>/<model>"        → đúng nhà cung cấp đó
 *   "<Tên nhà cung cấp>/<model>"  → khớp theo tên (không phân biệt hoa thường)
 *   "<model>"                     → mọi nhà cung cấp có model đó, xếp theo điểm
 */

const http = require('http');
const vault = require('./vault');
const probe = require('./probe');

function stripSlash(s) {
  return String(s || '').replace(/\/+$/, '');
}

function modelListOf(store, providerId) {
  return store
    .modelsOf(providerId)
    .filter((m) => m.enabled !== false)
    .sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0))
    .map((m) => m.modelId);
}

class Gateway {
  constructor(store, deps) {
    this.store = store;
    this.computeScores = deps.computeScores;
    this.rankCandidates = deps.rankCandidates;
    this.pickKey = deps.pickKey;
    this.server = null;
    this.port = null;
    this.startedAt = null;
    this.stats = { requests: 0, ok: 0, fail: 0, routed: {}, failovers: 0 };
    this.log = [];
  }

  status() {
    return {
      running: !!this.server,
      port: this.port,
      startedAt: this.startedAt,
      url: this.server ? 'http://127.0.0.1:' + this.port + '/v1' : null,
      stats: this.stats,
      log: this.log.slice(-60),
    };
  }

  pushLog(entry) {
    this.log.push(Object.assign({ ts: new Date().toISOString() }, entry));
    if (this.log.length > 300) this.log.splice(0, this.log.length - 300);
  }

  async start() {
    if (this.server) return this.status();
    const cfg = this.store.settings.gateway;
    const port = Number(cfg.port) || 8788;
    this.server = http.createServer((req, res) => {
      this.handle(req, res).catch((err) => {
        this.pushLog({ level: 'error', message: 'Lỗi xử lý: ' + err.message });
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
        }
        try {
          res.end(JSON.stringify({ error: { message: err.message, type: 'notebook_gateway_error' } }));
        } catch (_) {
          /* ignore */
        }
      });
    });
    await new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(port, '127.0.0.1', () => resolve());
    });
    this.port = port;
    this.startedAt = new Date().toISOString();
    this.store.data.meta.lastGatewayStartAt = this.startedAt;
    this.store.save(false);
    this.pushLog({ level: 'info', message: 'Cổng đang chạy tại http://127.0.0.1:' + port + '/v1' });
    return this.status();
  }

  async stop() {
    if (!this.server) return this.status();
    const srv = this.server;
    this.server = null;
    this.port = null;
    await new Promise((resolve) => srv.close(() => resolve()));
    this.pushLog({ level: 'info', message: 'Cổng đã dừng.' });
    return this.status();
  }

  cors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  }

  authorized(req) {
    const cfg = this.store.settings.gateway;
    if (!cfg.requireToken) return true;
    if (!cfg.token) return true;
    const auth = req.headers['authorization'] || '';
    const bearer = auth.replace(/^Bearer\s+/i, '').trim();
    const alt = String(req.headers['x-api-key'] || '').trim();
    return bearer === cfg.token || alt === cfg.token;
  }

  async handle(req, res) {
    this.cors(res);
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }

    const url = new URL(req.url, 'http://127.0.0.1');
    const path = url.pathname;

    if (path === '/health' || path === '/') {
      const scores = this.computeScores(this.store);
      const ranked = this.rankCandidates(this.store, scores);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(
        JSON.stringify(
          {
            ok: true,
            service: 'notebook-api-provider',
            uptimeSince: this.startedAt,
            providers: ranked.length,
            stats: this.stats,
            top: ranked.slice(0, 5).map((r) => ({
              name: r.provider.name,
              grade: r.score.grade,
              score: r.score.score,
              quotaHeadroom: r.score.quota.headroom,
            })),
          },
          null,
          2
        )
      );
    }

    if (path === '/stats') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify(this.status(), null, 2));
    }

    if (!this.authorized(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: { message: 'Token cổng không đúng', type: 'unauthorized' } }));
    }

    if (path === '/v1/models' && req.method === 'GET') {
      return this.handleModels(res);
    }

    if ((path === '/v1/chat/completions' || path === '/chat/completions') && req.method === 'POST') {
      const body = await this.readBody(req);
      return this.handleChat(req, res, body);
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        error: {
          message: 'Không có route ' + path + '. Hỗ trợ: GET /v1/models, POST /v1/chat/completions, GET /health',
          type: 'not_found',
        },
      })
    );
  }

  readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      req.on('data', (c) => {
        size += c.length;
        if (size > 20 * 1024 * 1024) {
          reject(new Error('Body quá lớn (>20MB)'));
          req.destroy();
          return;
        }
        chunks.push(c);
      });
      req.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        if (!raw) return resolve({});
        try {
          resolve(JSON.parse(raw));
        } catch (err) {
          reject(new Error('JSON không hợp lệ: ' + err.message));
        }
      });
      req.on('error', reject);
    });
  }

  handleModels(res) {
    const scores = this.computeScores(this.store);
    const data = [];
    const alias = this.store.settings.gateway.autoModelAlias || 'auto';
    data.push({ id: alias, object: 'model', owned_by: 'notebook', description: 'Tự chọn nhà cung cấp tốt nhất' });
    for (const p of this.store.data.providers) {
      if (p.enabled === false || p.kind === 'web-only') continue;
      const s = scores[p.id];
      for (const m of modelListOf(this.store, p.id)) {
        data.push({
          id: p.id + '/' + m,
          object: 'model',
          owned_by: p.name,
          short_id: m,
          grade: s ? s.grade : null,
          score: s ? s.score : null,
        });
        // Cho phép gọi thẳng tên model gốc nếu chưa bị provider khác chiếm.
        if (!data.some((d) => d.id === m)) {
          data.push({ id: m, object: 'model', owned_by: p.name, grade: s ? s.grade : null, score: s ? s.score : null });
        }
      }
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ object: 'list', data }));
  }

  /** Xây danh sách ứng viên theo thứ tự ưu tiên. */
  buildCandidates(wantModel) {
    const store = this.store;
    const scores = this.computeScores(store);
    const ranked = this.rankCandidates(store, scores);
    const alias = store.settings.gateway.autoModelAlias || 'auto';
    const wanted = String(wantModel || '').trim();
    const out = [];

    if (!wanted || wanted === alias) {
      for (const r of ranked) {
        const models = modelListOf(store, r.provider.id);
        if (!models.length) continue;
        out.push({ provider: r.provider, model: models[0], score: r.score });
      }
      return out;
    }

    const slash = wanted.indexOf('/');
    if (slash > 0) {
      const head = wanted.slice(0, slash);
      const tail = wanted.slice(slash + 1);
      const target =
        store.findProvider(head) ||
        store.data.providers.find((p) => p.name.toLowerCase() === head.toLowerCase()) ||
        store.data.providers.find((p) => p.id.toLowerCase() === head.toLowerCase());
      if (target) {
        const models = modelListOf(store, target.id);
        const model = models.find((m) => m === tail) || tail;
        out.push({ provider: target, model, score: scores[target.id] });
        return out;
      }
    }

    for (const r of ranked) {
      const models = modelListOf(store, r.provider.id);
      if (models.includes(wanted)) out.push({ provider: r.provider, model: wanted, score: r.score });
    }
    return out;
  }

  async handleChat(req, res, body) {
    const cfg = this.store.settings.gateway;
    const candidates = this.buildCandidates(body && body.model);
    if (!candidates.length) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(
        JSON.stringify({
          error: {
            message:
              'Không có nhà cung cấp nào phục vụ model "' +
              ((body && body.model) || 'auto') +
              '". Kiểm tra tab Nhà cung cấp / Model, hoặc chạy quét model.',
            type: 'no_candidate',
          },
        })
      );
    }

    const attempts = Math.max(1, Number(cfg.failoverAttempts) || 3);
    const tried = [];
    const usedKeyIds = [];
    let lastError = null;

    for (let i = 0; i < Math.min(attempts, candidates.length); i++) {
      const cand = candidates[i];
      const provider = cand.provider;
      const key = this.pickKey(this.store, provider.id, usedKeyIds);
      if (!key) {
        tried.push({ provider: provider.name, error: 'không có key dùng được' });
        continue;
      }
      usedKeyIds.push(key.id);
      const secret = provider.authStyle === 'none' ? '' : vault.decryptSecret(key.secret);
      if (provider.authStyle !== 'none' && !secret) {
        tried.push({ provider: provider.name, error: 'không giải mã được key' });
        continue;
      }

      const url = stripSlash(provider.baseUrl) + (provider.chatPath || '/chat/completions');
      const headers = probe.buildHeaders(provider, secret);
      const payload = Object.assign({}, body, { model: cand.model });
      const timeoutMs = Math.max(15000, (this.store.settings.probe.timeoutMs || 20000) * 4);

      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), timeoutMs);
      const started = Date.now();
      let upstream;
      try {
        upstream = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
          signal: ac.signal,
        });
      } catch (err) {
        clearTimeout(timer);
        const isTimeout = err && err.name === 'AbortError';
        lastError = { provider: provider.name, message: isTimeout ? 'Hết thời gian chờ' : err.message };
        tried.push({ provider: provider.name, model: cand.model, error: lastError.message });
        this.recordFailure(provider, key, isTimeout ? 'timeout' : 'network', started);
        this.stats.failovers++;
        continue;
      }

      if (!upstream.ok) {
        const text = await upstream.text().catch(() => '');
        clearTimeout(timer);
        const kind = probe.classifyStatus(upstream.status, text);
        /* Dùng chung cách rút gọn lỗi với lúc đo: trang HTML dài bị lược thành
           một câu đọc được thay vì nhét cả trang vào nhật ký. */
        const message = probe.extractMessage(text) || 'HTTP ' + upstream.status;
        lastError = { provider: provider.name, status: upstream.status, message };
        tried.push({ provider: provider.name, model: cand.model, status: upstream.status, error: kind });
        this.recordFailure(provider, key, kind, started, upstream.status);
        this.applyCooldown(key, provider, kind, upstream.headers);
        this.stats.failovers++;
        continue;
      }

      // Thành công
      const stream = !!(body && body.stream);
      this.stats.requests++;
      this.stats.ok++;
      this.stats.routed[provider.name] = (this.stats.routed[provider.name] || 0) + 1;

      if (stream) {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        });
        let usage = null;
        try {
          const reader = upstream.body.getReader();
          const decoder = new TextDecoder();
          let buf = '';
          for (;;) {
            const chunk = await reader.read();
            if (chunk.done) break;
            const text = decoder.decode(chunk.value, { stream: true });
            buf += text;
            res.write(text);
            let idx;
            while ((idx = buf.indexOf('\n')) >= 0) {
              const line = buf.slice(0, idx).trim();
              buf = buf.slice(idx + 1);
              if (!line.startsWith('data:')) continue;
              const json = line.slice(5).trim();
              if (json === '[DONE]') continue;
              const parsed = (() => {
                try {
                  return JSON.parse(json);
                } catch (_) {
                  return null;
                }
              })();
              if (parsed && parsed.usage) usage = parsed.usage;
            }
          }
        } catch (err) {
          this.pushLog({ level: 'warn', message: 'Stream đứt giữa chừng: ' + err.message });
        } finally {
          clearTimeout(timer);
          res.end();
        }
        this.recordSuccess(provider, key, started, usage, true);
        return;
      }

      const text = await upstream.text();
      clearTimeout(timer);
      let parsed = null;
      try {
        parsed = JSON.parse(text);
      } catch (_) {
        /* upstream trả không phải JSON */
      }
      res.writeHead(upstream.status, {
        'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
      });
      res.end(text);
      this.recordSuccess(provider, key, started, parsed && parsed.usage, false);
      return;
    }

    this.stats.requests++;
    this.stats.fail++;
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        error: {
          message: 'Tất cả ứng viên đều lỗi. Chi tiết: ' + JSON.stringify(tried),
          type: 'all_candidates_failed',
          attempts: tried,
          last: lastError,
        },
      })
    );
  }

  applyCooldown(key, provider, kind, headers) {
    const now = Date.now();
    let ms = 60000;
    if (kind === 'rate_limited' || kind === 'quota') {
      const retry = headers && headers.get ? Number(String(headers.get('retry-after') || '').match(/\d+/)?.[0]) : NaN;
      ms = Number.isFinite(retry) && retry > 0 ? retry * 1000 : 60000;
      if (kind === 'quota') ms = Math.max(ms, 10 * 60 * 1000);
    } else if (kind === 'server_error') {
      ms = 30000;
    } else {
      ms = 15000;
    }
    this.store.mutate(() => {
      const k = this.store.findKey(key.id);
      if (!k) return;
      k.cooldownUntil = new Date(now + ms).toISOString();
      if (kind === 'quota') k.status = 'quota-exhausted';
      else if (kind === 'unauthorized') k.status = 'invalid';
      else if (kind === 'rate_limited') k.status = 'rate-limited';
      else if (k.status === 'unknown') k.status = 'error';
      k.statusMessage = kind;
      k.updatedAt = new Date().toISOString();
    });
    this.store.addAlert({
      level: kind === 'unauthorized' ? 'error' : 'warn',
      code: 'gateway_' + kind,
      providerId: provider.id,
      keyId: key.id,
      message: provider.name + ': ' + kind + ' — key "' + (key.label || key.id) + '" tạm nghỉ ' + Math.round(ms / 1000) + 's',
    });
    this.store.save(false);
  }

  recordSuccess(provider, key, started, usage, streamed) {
    const latencyMs = Date.now() - started;
    const u = usage || {};
    const promptTokens = Number(u.prompt_tokens || u.input_tokens || 0) || 0;
    const completionTokens = Number(u.completion_tokens || u.output_tokens || 0) || 0;
    const settings = this.store.settings;
    this.store.mutate(() => {
      if (settings.gateway.recordUsage !== false) {
        this.store.recordUsage(provider.id, key.id, { requests: 1, promptTokens, completionTokens });
      }
      if (settings.probe.autoEnabled !== false) {
        this.store.addSample({
          providerId: provider.id,
          keyId: key.id,
          kind: 'gateway',
          ts: new Date().toISOString(),
          ok: true,
          httpStatus: 200,
          latencyMs,
          errorKind: null,
          message: '',
          model: null,
        });
      }
      const k = this.store.findKey(key.id);
      if (k) {
        if (k.status !== 'ok') k.status = 'ok';
        k.statusMessage = '';
        k.lastUsedAt = new Date().toISOString();
        k.lastCheckedAt = new Date().toISOString();
      }
      const p = this.store.findProvider(provider.id);
      if (p) p.lastOkAt = new Date().toISOString();
    });
    this.store.save(false);
    this.pushLog({
      level: 'info',
      message: provider.name + ' ← 200 · ' + latencyMs + 'ms' + (streamed ? ' · stream' : '') +
        (promptTokens + completionTokens ? ' · ' + (promptTokens + completionTokens) + ' token' : ''),
    });
  }

  recordFailure(provider, key, kind, started, httpStatus) {
    const latencyMs = Date.now() - started;
    this.store.mutate(() => {
      this.store.addSample({
        providerId: provider.id,
        keyId: key.id,
        kind: 'gateway',
        ts: new Date().toISOString(),
        ok: false,
        httpStatus: httpStatus || 0,
        latencyMs,
        errorKind: kind,
        message: '',
      });
      this.store.recordUsage(provider.id, key.id, { requests: 1, failures: 1 });
      const k = this.store.findKey(key.id);
      if (k) k.lastUsedAt = new Date().toISOString();
    });
    this.store.save(false);
    this.pushLog({ level: 'warn', message: provider.name + ' ← lỗi ' + kind + ' (' + latencyMs + 'ms)' });
  }
}

module.exports = { Gateway };
