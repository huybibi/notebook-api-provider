'use strict';

/**
 * probe.js — Đo nhà cung cấp thật bằng HTTP.
 *
 * Hai kiểu đo:
 *  - probeModels: GET {baseUrl}{modelsPath}  → xác thực key + liệt kê model (rẻ nhất)
 *  - probeChat  : POST {baseUrl}{chatPath}   → đo độ trễ thật + kiểm tra sinh chữ
 *
 * Mọi lỗi được quy về một errorKind ổn định để scoring đếm được.
 */

const DEFAULT_TIMEOUT = 20000;

function buildHeaders(provider, secret) {
  const h = Object.assign(
    { Accept: 'application/json', 'Content-Type': 'application/json' },
    provider.extraHeaders && typeof provider.extraHeaders === 'object' ? provider.extraHeaders : {}
  );
  const style = provider.authStyle || 'bearer';
  if (secret) {
    if (style === 'bearer') h.Authorization = 'Bearer ' + secret;
    else if (style === 'x-api-key') h['x-api-key'] = secret;
    else if (style === 'both') {
      h.Authorization = 'Bearer ' + secret;
      h['x-api-key'] = secret;
    }
  }
  if (provider.compat === 'anthropic') {
    if (!h['anthropic-version']) h['anthropic-version'] = '2023-06-01';
  }
  return h;
}

function joinUrl(baseUrl, p) {
  const base = String(baseUrl || '').trim().replace(/\/+$/, '');
  const suffix = String(p || '').startsWith('/') ? p : '/' + p;
  return base + suffix;
}

function buildUrl(provider, path, secret) {
  const base = String(provider.baseUrl || '').trim();
  if (!base) throw Object.assign(new Error('Nhà cung cấp chưa có baseUrl'), { kind: 'config' });
  if (/\{[a-z_]+\}/i.test(base)) {
    throw Object.assign(new Error('baseUrl còn placeholder {…}, cần thay bằng giá trị thật'), { kind: 'config' });
  }
  const url = new URL(joinUrl(base, path));
  if ((provider.authStyle || '') === 'query' && provider.authParam) {
    if (secret) url.searchParams.set(provider.authParam, secret);
  }
  return url.toString();
}

async function timedFetch(url, opts, timeoutMs) {
  const ac = new AbortController();
  const ms = Number(timeoutMs) > 0 ? Number(timeoutMs) : DEFAULT_TIMEOUT;
  const timer = setTimeout(() => ac.abort(), ms);
  const started = Date.now();
  try {
    const res = await fetch(url, Object.assign({}, opts, { signal: ac.signal }));
    return { res, latencyMs: Date.now() - started };
  } catch (err) {
    const elapsed = Date.now() - started;
    if (err && (err.name === 'AbortError' || err.code === 'ABORT_ERR')) {
      throw Object.assign(new Error('Hết thời gian chờ sau ' + elapsed + 'ms'), {
        kind: 'timeout',
        latencyMs: elapsed,
      });
    }
    throw Object.assign(new Error((err && err.message) || 'Lỗi mạng'), {
      kind: 'network',
      latencyMs: elapsed,
    });
  } finally {
    clearTimeout(timer);
  }
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

function extractMessage(text) {
  const j = safeJson(text);
  if (j) {
    if (typeof j.error === 'string') return j.error;
    if (j.error && typeof j.error.message === 'string') return j.error.message;
    if (typeof j.message === 'string') return j.message;
    if (typeof j.detail === 'string') return j.detail;
    if (Array.isArray(j.detail) && j.detail[0] && j.detail[0].msg) return String(j.detail[0].msg);
  }
  const raw = String(text || '');
  /* Nhiều endpoint trả nguyên một trang HTML (Cloudflare, trang lỗi của proxy).
     Hiển thị cả trang đó trong sổ là vô nghĩa với người dùng, nên bỏ hết thẻ và
     chỉ giữ câu chữ đọc được. */
  if (/<!doctype|<html|<\/[a-z]+>/i.test(raw)) {
    const plain = raw
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/\s+/g, ' ')
      .trim();
    const code = (raw.match(/error code:?\s*(\d+)/i) || [])[1];
    let out = plain.replace(/^sk?ip to content/i, '').trim().slice(0, 160);
    if (code) out = (out ? out + ' ' : '') + '(mã lỗi ' + code + ')';
    return out || 'Nhà cung cấp trả về một trang HTML thay vì dữ liệu API';
  }
  const one = raw.replace(/\s+/g, ' ').trim();
  return one.length > 300 ? one.slice(0, 300) + '…' : one;
}

const QUOTA_HINTS = [
  'quota',
  'insufficient',
  'credit',
  'billing',
  'exceeded your current',
  'out of tokens',
  'no balance',
  'payment required',
  'budget',
];

function classifyStatus(status, text) {
  const body = String(text || '').toLowerCase();
  if (status === 401 || status === 403) return 'unauthorized';
  if (status === 402) return 'quota';
  if (status === 429) {
    if (QUOTA_HINTS.some((k) => body.includes(k))) return 'quota';
    return 'rate_limited';
  }
  if (status === 404) return 'not_found';
  if (status === 408) return 'timeout';
  if (status === 400 || status === 422) {
    if (QUOTA_HINTS.some((k) => body.includes(k))) return 'quota';
    return 'bad_request';
  }
  if (status >= 500) return 'server_error';
  return 'unknown';
}

function num(v) {
  if (v == null) return null;
  const m = String(v).match(/-?\d+/);
  return m ? Number(m[0]) : null;
}

function readRateLimits(headers) {
  if (!headers || !headers.get) return null;
  const names = {
    remainingRequests: 'x-ratelimit-remaining-requests',
    remainingTokens: 'x-ratelimit-remaining-tokens',
    limitRequests: 'x-ratelimit-limit-requests',
    limitTokens: 'x-ratelimit-limit-tokens',
    resetRequests: 'x-ratelimit-reset-requests',
    resetTokens: 'x-ratelimit-reset-tokens',
    retryAfter: 'retry-after',
    requestId: 'x-request-id',
  };
  const out = { seen: false };
  for (const key of Object.keys(names)) {
    const raw = headers.get(names[key]);
    if (raw == null || raw === '') continue;
    out.seen = true;
    if (key === 'resetRequests' || key === 'resetTokens' || key === 'requestId') out[key] = String(raw);
    else out[key] = num(raw);
  }
  return out.seen ? out : null;
}

/* Bảng giá chỉ có ở một số endpoint (OpenRouter và vài router tương tự). Không có
   bảng giá thì trả null — TUYỆT ĐỐI không suy đoán là miễn phí. */
function priceOf(d) {
  const p = d && (d.pricing || d.price || d.prices);
  if (!p || typeof p !== 'object') return null;
  const num = (v) => (v === undefined || v === null || v === '' ? null : Number(v));
  const input = num(p.prompt !== undefined ? p.prompt : p.input !== undefined ? p.input : p.input_price);
  const output = num(
    p.completion !== undefined ? p.completion : p.output !== undefined ? p.output : p.output_price
  );
  if (input === null && output === null) return null;
  return { input: input === null ? 0 : input, output: output === null ? 0 : output };
}

function isFreePricing(pricing) {
  return !!pricing && Number(pricing.input || 0) === 0 && Number(pricing.output || 0) === 0;
}

/* Giá trong toàn bộ ứng dụng tính theo MỘT token (khớp `priceOf` và cách
   `priceChip` nhân lại 1e6 để hiển thị "$x / 1M"). Làm tròn 6 chữ số có nghĩa. */
function roundUnit(v) {
  return Number(Number(v).toPrecision(6));
}

/* ------------------------------------------------------------------ */
/* Giá lấy từ trang web của nhà cung cấp                               */
/* ------------------------------------------------------------------ */

/* Tải một trang bất kỳ (trang giá, trang chủ) để đọc giá đang hiển thị. */
async function fetchPage(url, options) {
  const opts = options || {};
  const started = Date.now();
  try {
    const { res, latencyMs } = await timedFetch(
      url,
      {
        method: 'GET',
        headers: Object.assign(
          {
            Accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
            'User-Agent': 'NotebookAPIProvider/1.0 (+desktop)',
          },
          opts.headers || {}
        ),
      },
      opts.timeoutMs
    );
    const text = await res.text();
    if (!res.ok) {
      return {
        ok: false,
        httpStatus: res.status,
        latencyMs,
        errorKind: classifyStatus(res.status, text),
        message: extractMessage(text) || 'HTTP ' + res.status,
        text: '',
      };
    }
    return { ok: true, httpStatus: res.status, latencyMs, errorKind: null, message: '', text };
  } catch (err) {
    return {
      ok: false,
      httpStatus: 0,
      latencyMs: err.latencyMs || Date.now() - started,
      errorKind: err.kind || 'network',
      message: err.message,
      text: '',
    };
  }
}

function htmlToText(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/* Đơn vị giá mà trang đang dùng → hệ số quy về "mỗi 1 triệu token". */
function priceUnitFactor(pageText) {
  const t = String(pageText || '');
  if (/(?:per|for|\/)\s*1\s*m(?:illion)?\.?\s*tokens?|1\s*million tokens|triệu token/i.test(t)) return 1;
  if (/(?:per|for|\/)\s*1\s*k\.?\s*tokens?|per\s*1,?000\s*tokens|1,?000 tokens|nghìn token/i.test(t)) return 1000;
  if (/per\s*token|1\s*token|\/\s*token/i.test(t)) return 1000000;
  return null;
}

const FREE_RE = /\bfree\b|miễn phí|mien phi|no cost|free tier|tặng/i;

function cellTexts(rowHtml) {
  const cells = String(rowHtml)
    .replace(/<\/t[dh]>/gi, '\u0000')
    .split('\u0000')
    .map((c) => htmlToText(c));
  return cells.filter((c) => c !== '');
}

/* Rút tiền từ một đoạn chữ: trả [{value, unit}] với unit là 'M' nếu số đi kèm chữ
   M/K (ví dụ "$3/M"), ngược lại null (số trần). */
function moneyIn(text) {
  const out = [];
  const re = /\$\s*([0-9]+(?:[.,][0-9]+)?)\s*([kKmM])?\b/g;
  let m;
  while ((m = re.exec(String(text)))) {
    const value = Number(String(m[1]).replace(',', '.'));
    if (!Number.isFinite(value)) continue;
    out.push({ value, unit: m[2] ? m[2].toUpperCase() : null });
  }
  return out;
}

/* Đọc giá đang hiển thị trên trang web.
   - Chỉ nhận model nào khớp đúng id (hoặc tên không có tiền tố nhà cung cấp).
   - `pricing` chỉ được điền khi suy ra được đơn vị (trang ghi rõ, hoặc mọi số đều
     rất nhỏ kiểu giá mỗi token). Không suy ra được thì vẫn giữ `priceNote` là chữ
     nguyên văn trên trang để người dùng tự đọc.
   - `free === true` chỉ khi trang ghi "free"/"miễn phí"/$0 và không có giá dương. */
function parsePriceHtml(html, modelIds) {
  const ids = (modelIds || []).map((x) => String(x || '').trim()).filter(Boolean);
  const found = {};
  if (!ids.length) return found;

  /* Trang có thể trả JSON (kiểu OpenRouter) — đọc thẳng bảng giá. */
  const parsed = safeJson(html);
  if (parsed) {
    const list = extractModels(parsed);
    for (const m of list) {
      if (!m.pricing || !ids.includes(m.modelId)) continue;
      found[m.modelId] = { pricing: m.pricing, free: isFreePricing(m.pricing), note: 'JSON endpoint', source: 'json' };
    }
    if (Object.keys(found).length) return found;
  }

  const pageText = htmlToText(html);
  const factor = priceUnitFactor(pageText);
  /* Bỏ <script>/<style>/ghi chú trước khi tìm dòng giá: mã JavaScript của trang
     thường nhúng sẵn chuỗi HTML của bảng giá, đọc vào là nhầm giá của bản nháp. */
  const clean = String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  const rows = clean.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  const blocks = rows.length ? rows : clean.split(/<\/(?:li|p|div)>/i);

  for (const id of ids) {
    const short = id.indexOf('/') >= 0 ? id.split('/').pop() : id;
    const lowerId = id.toLowerCase();
    const lowerShort = short.toLowerCase();
    let hit = null;
    for (const row of blocks) {
      const rowText = htmlToText(row);
      const low = rowText.toLowerCase();
      if (!low.includes(lowerId) && !(lowerShort.length >= 4 && low.includes(lowerShort))) continue;
      hit = row;
      break;
    }
    if (!hit) continue;

    const cells = cellTexts(hit);
    const rowText = htmlToText(hit);
    /* Bỏ chính tên model khỏi phần đọc giá để không nhầm số trong tên. */
    const priceText = cells.filter((c) => !c.toLowerCase().includes(lowerId)).join(' | ') || rowText;

    const amounts = moneyIn(priceText);
    const inLabel = /input|prompt|đầu vào|vào\b/i.test(priceText);
    const outLabel = /output|completion|đầu ra|ra\b/i.test(priceText);
    let input = null;
    let output = null;
    const scale = (a) => {
      const f = a.unit === 'M' ? 1 : a.unit === 'K' ? 1000 : factor;
      return f == null ? null : a.value * f;
    };
    if (amounts.length >= 2) {
      input = scale(amounts[0]);
      output = scale(amounts[1]);
    } else if (amounts.length === 1) {
      if (outLabel && !inLabel) output = scale(amounts[0]);
      else input = scale(amounts[0]);
    }

    const positive = amounts.some((a) => a.value > 0);
    const zero = amounts.length > 0 && !positive;
    const saysFree = FREE_RE.test(rowText);
    let free = null;
    if (positive) free = false;
    else if (saysFree || zero) free = true;

    const pricing = input !== null || output !== null ? { input: roundUnit((input || 0) / 1e6), output: roundUnit((output || 0) / 1e6) } : null;
    const note = rowText.length > 160 ? rowText.slice(0, 160) + '…' : rowText;
    found[id] = {
      pricing,
      free,
      note,
      assumed: amounts.length >= 2 && !inLabel && !outLabel,
      unitKnown: pricing ? factor !== null || amounts.some((a) => a.unit) : false,
    };
  }
  return found;
}

function extractModels(parsed) {
  const out = [];
  const push = (id, name, pricing) => {
    if (!id) return;
    const sid = String(id).trim();
    if (!sid) return;
    if (out.some((m) => m.modelId === sid)) return;
    out.push({ modelId: sid, displayName: String(name || sid), pricing: pricing || null });
  };
  if (!parsed) return out;
  if (Array.isArray(parsed.data)) {
    for (const d of parsed.data) push(d && (d.id || d.name), d && (d.display_name || d.name || d.id), priceOf(d));
  }
  if (Array.isArray(parsed.models)) {
    for (const d of parsed.models)
      push(d && (d.id || d.name || d.model), d && (d.display_name || d.name || d.id), priceOf(d));
  }
  if (Array.isArray(parsed)) {
    for (const d of parsed) {
      if (typeof d === 'string') push(d, d, null);
      else if (d) push(d.id || d.name || d.model, d.display_name || d.name || d.id, priceOf(d));
    }
  }
  return out;
}

/* Bảng giá JSON của các bản "New API" / one-api: <gốc>/api/pricing.
   Đơn vị gốc là "tỉ lệ" chứ không phải tiền, quy đổi theo đúng cách các bản này
   hiển thị trên web: 1 đơn vị tỉ lệ = 2 USD mỗi 1M token (tỉ lệ 0,75 của
   gpt-3.5-turbo ứng với $1,50 mỗi 1M token vào). Giá ra = tỉ lệ × tỉ lệ hoàn thành.
   Model tính tiền theo lượt gọi (quota_type 1 / model_price > 0) thì không suy ra
   được giá token nên để trống, chỉ ghi lại nguyên văn. */
function parseNewApiPricing(text, modelIds) {
  const out = {};
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch (_) {
    return out;
  }
  const rows = Array.isArray(parsed && parsed.data)
    ? parsed.data
    : parsed && parsed.data && Array.isArray(parsed.data.models)
      ? parsed.data.models
      : Array.isArray(parsed)
        ? parsed
        : [];
  if (!rows.length) return out;
  const ids = (modelIds || []).map((s) => String(s));
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    const name = String(r.model_name || r.model || r.name || '');
    if (!name) continue;
    const sid = ids.filter((id) => id.toLowerCase() === name.toLowerCase())[0];
    if (!sid) continue;
    const ratio = Number(r.model_ratio);
    const comp = Number(r.completion_ratio);
    const perCall = Number(r.model_price);
    const fixed = Number(r.quota_type) === 1 || (perCall > 0 && !(ratio > 0));
    if (fixed && perCall > 0) {
      out[sid] = {
        pricing: null,
        free: false,
        note: 'New API: $' + roundUnit(perCall) + ' mỗi lượt gọi',
        assumed: false,
        unitKnown: false,
      };
      continue;
    }
    if (!(ratio > 0)) continue;
    const inUsd = ratio * 2;
    const outUsd = ratio * (comp > 0 ? comp : 1) * 2;
    out[sid] = {
      pricing: { input: roundUnit(inUsd / 1e6), output: roundUnit(outUsd / 1e6) },
      free: inUsd === 0 && outUsd === 0,
      note: 'New API: tỉ lệ ' + ratio + (comp > 0 ? ' × ' + comp : '') + ' → $' + roundUnit(inUsd) + ' / $' + roundUnit(outUsd) + ' mỗi 1M token',
      assumed: false,
      unitKnown: true,
    };
  }
  return out;
}

function extractUsage(parsed) {
  const u = parsed && parsed.usage;
  if (!u || typeof u !== 'object') return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  return {
    promptTokens: Number(u.prompt_tokens || u.input_tokens || 0) || 0,
    completionTokens: Number(u.completion_tokens || u.output_tokens || 0) || 0,
    totalTokens: Number(u.total_tokens || 0) || 0,
  };
}

function extractContent(parsed) {
  try {
    const ch = parsed && parsed.choices && parsed.choices[0];
    if (!ch) return '';
    if (ch.message && typeof ch.message.content === 'string') return ch.message.content;
    if (typeof ch.text === 'string') return ch.text;
    if (Array.isArray(ch.message && ch.message.content)) {
      return ch.message.content.map((c) => (typeof c === 'string' ? c : c && c.text) || '').join('');
    }
  } catch (_) {
    /* ignore */
  }
  return '';
}

/* -------------------------------------------------------------------- */
/* Hai kiểu probe                                                        */
/* -------------------------------------------------------------------- */

async function probeModels(provider, secret, options) {
  const opts = options || {};
  const path = provider.modelsPath || '/models';
  let url;
  try {
    url = buildUrl(provider, path, secret);
  } catch (err) {
    return { ok: false, httpStatus: 0, latencyMs: 0, errorKind: err.kind || 'config', message: err.message, rateLimits: null, models: [] };
  }
  const started = Date.now();
  try {
    const { res, latencyMs } = await timedFetch(
      url,
      { method: 'GET', headers: buildHeaders(provider, secret) },
      opts.timeoutMs
    );
    const text = await res.text();
    const rateLimits = readRateLimits(res.headers);
    if (!res.ok) {
      return {
        ok: false,
        httpStatus: res.status,
        latencyMs,
        errorKind: classifyStatus(res.status, text),
        message: extractMessage(text) || 'HTTP ' + res.status,
        rateLimits,
        models: [],
      };
    }
    const models = extractModels(safeJson(text));
    return {
      ok: true,
      httpStatus: res.status,
      latencyMs,
      errorKind: null,
      message: '',
      rateLimits,
      models,
      discoveredCount: models.length,
    };
  } catch (err) {
    return {
      ok: false,
      httpStatus: 0,
      latencyMs: err.latencyMs || Date.now() - started,
      errorKind: err.kind || 'network',
      message: err.message,
      rateLimits: null,
      models: [],
    };
  }
}

async function probeChat(provider, secret, modelId, options) {
  const opts = options || {};
  const path = provider.chatPath || '/chat/completions';
  let url;
  try {
    url = buildUrl(provider, path, secret);
  } catch (err) {
    return { ok: false, httpStatus: 0, latencyMs: 0, errorKind: err.kind || 'config', message: err.message, rateLimits: null, usage: null };
  }
  const maxTokens = Number(opts.maxTokens) > 0 ? Number(opts.maxTokens) : 8;

  let payload;
  let headers = buildHeaders(provider, secret);
  if (provider.compat === 'anthropic') {
    headers = Object.assign({}, headers, { 'anthropic-version': headers['anthropic-version'] || '2023-06-01' });
    delete headers.Authorization;
    if (secret) headers['x-api-key'] = secret;
    payload = { model: modelId, max_tokens: maxTokens, messages: [{ role: 'user', content: 'ping' }] };
  } else {
    payload = {
      model: modelId,
      messages: [{ role: 'user', content: opts.prompt || 'ping' }],
      max_tokens: maxTokens,
      temperature: 0,
      stream: false,
    };
  }

  const started = Date.now();
  try {
    const { res, latencyMs } = await timedFetch(
      url,
      { method: 'POST', headers, body: JSON.stringify(payload) },
      opts.timeoutMs
    );
    const text = await res.text();
    const rateLimits = readRateLimits(res.headers);
    const parsed = safeJson(text);
    if (!res.ok) {
      return {
        ok: false,
        httpStatus: res.status,
        latencyMs,
        errorKind: classifyStatus(res.status, text),
        message: extractMessage(text) || 'HTTP ' + res.status,
        rateLimits,
        usage: null,
        model: modelId,
      };
    }
    const usage = extractUsage(parsed);
    const content = extractContent(parsed);
    return {
      ok: true,
      httpStatus: res.status,
      latencyMs,
      errorKind: null,
      message: '',
      rateLimits,
      usage,
      model: modelId,
      preview: String(content || '').slice(0, 120),
      finishReason: (parsed && parsed.choices && parsed.choices[0] && parsed.choices[0].finish_reason) || null,
    };
  } catch (err) {
    return {
      ok: false,
      httpStatus: 0,
      latencyMs: err.latencyMs || Date.now() - started,
      errorKind: err.kind || 'network',
      message: err.message,
      rateLimits: null,
      usage: null,
      model: modelId,
    };
  }
}

module.exports = {
  probeModels,
  probeChat,
  buildHeaders,
  buildUrl,
  classifyStatus,
  readRateLimits,
  extractMessage,
  extractModels,
  isFreePricing,
  extractUsage,
  fetchPage,
  parsePriceHtml,
  parseNewApiPricing,
  redactable: true,
};
