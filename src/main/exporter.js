'use strict';

/**
 * exporter.js — Biến cuốn sổ thành cấu hình dùng được ngay ở nơi khác.
 * Đây là phần khiến các token miễn phí thực sự được tiêu.
 */

const vault = require('./vault');
const { dayKey } = require('./store');

const TYPE_LABEL = {
  'daily-tokens': 'token/ngày',
  'daily-requests': 'request/ngày',
  'monthly-tokens': 'token/tháng',
  'total-credit': 'credit 1 lần',
  'trial-window': 'có thời hạn',
  'rate-only': 'chỉ giới hạn tốc độ',
  unlimited: 'không giới hạn',
  unknown: 'chưa rõ',
};

function collectEntries(store, scores, options) {
  const opts = options || {};
  const out = [];
  for (const provider of store.data.providers) {
    if (provider.enabled === false) continue;
    if (provider.kind === 'web-only') continue;
    if (opts.onlyUsable) {
      const s = scores && scores[provider.id];
      if (s && !s.usable) continue;
    }
    const models = store
      .modelsOf(provider.id)
      .filter((m) => m.enabled !== false)
      .map((m) => m.modelId);
    if (opts.requireModels && !models.length) continue;
    const keys = store
      .keysOf(provider.id)
      .filter((k) => k.enabled !== false)
      .map((k) => ({
        id: k.id,
        label: k.label,
        secret: opts.includeSecrets === false ? '' : vault.decryptSecret(k.secret),
        status: k.status || 'unknown',
      }))
      .filter((k) => opts.includeSecrets === false || k.secret || provider.authStyle === 'none');
    if (!keys.length && provider.authStyle !== 'none') continue;
    out.push({
      id: provider.id,
      name: provider.name,
      baseUrl: provider.baseUrl,
      authStyle: provider.authStyle,
      compat: provider.compat || 'openai',
      kind: provider.kind,
      models,
      keys,
      score: scores && scores[provider.id] ? scores[provider.id].score : null,
      grade: scores && scores[provider.id] ? scores[provider.id].grade : null,
      quotaType: (provider.quota && provider.quota.type) || 'unknown',
    });
  }
  out.sort((a, b) => (b.score || 0) - (a.score || 0));
  return out;
}

function slug(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function envFile(entries) {
  const lines = [
    '# Sinh bởi Notebook API Provider — ' + new Date().toLocaleString(),
    '# Mỗi nhà cung cấp tương thích OpenAI đều dùng được với openai SDK qua base_url.',
    '',
  ];
  for (const e of entries) {
    const P = slug(e.name).toUpperCase();
    lines.push('# ' + e.name + (e.grade ? '  [' + e.grade + ' · ' + e.score + ']' : ''));
    lines.push(P + '_BASE_URL=' + (e.baseUrl || ''));
    if (e.keys[0]) lines.push(P + '_API_KEY=' + e.keys[0].secret);
    if (e.models[0]) lines.push(P + '_MODEL=' + e.models[0]);
    lines.push('');
  }
  return lines.join('\n');
}

function jsonConfig(entries) {
  return JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      note: 'Mọi entry đều tương thích OpenAI trừ khi compat khác "openai".',
      providers: entries.map((e) => ({
        name: e.name,
        baseUrl: e.baseUrl,
        compat: e.compat,
        models: e.models,
        quotaType: e.quotaType,
        score: e.score,
        grade: e.grade,
        keys: e.keys.map((k) => ({ label: k.label, apiKey: k.secret, status: k.status })),
      })),
    },
    null,
    2
  );
}

function litellmYaml(entries) {
  const lines = [
    '# Cấu hình LiteLLM sinh tự động',
    'model_list:',
  ];
  for (const e of entries) {
    for (const m of e.models.length ? e.models : ['']) {
      const alias = slug(e.name) + (m ? '-' + slug(m.split('/').pop()) : '');
      lines.push('  - model_name: ' + alias);
      lines.push('    litellm_params:');
      lines.push('      model: ' + (e.compat === 'anthropic' ? 'anthropic/' : 'openai/') + (m || 'REPLACE_ME'));
      if (e.baseUrl) lines.push('      api_base: ' + e.baseUrl);
      if (e.keys[0]) lines.push('      api_key: ' + e.keys[0].secret);
      lines.push('    model_info:');
      lines.push('      provider: ' + slug(e.name));
    }
  }
  return lines.join('\n');
}

function curlSnippet(entry, model) {
  const url = String(entry.baseUrl || '').replace(/\/+$/, '') + '/chat/completions';
  const key = entry.keys[0] ? entry.keys[0].secret : 'YOUR_KEY';
  const auth =
    entry.authStyle === 'x-api-key'
      ? '  -H "x-api-key: ' + key + '" \\\n'
      : '  -H "Authorization: Bearer ' + key + '" \\\n';
  return (
    'curl ' + url + ' \\\n' +
    auth +
    '  -H "Content-Type: application/json" \\\n' +
    '  -d \'{"model":"' + (model || 'MODEL_ID') + '","messages":[{"role":"user","content":"Xin chào"}]}\''
  );
}

function pythonSnippet(entry, model) {
  return [
    'from openai import OpenAI',
    '',
    'client = OpenAI(',
    "    base_url='" + String(entry.baseUrl || '') + "',",
    "    api_key='" + (entry.keys[0] ? entry.keys[0].secret : 'YOUR_KEY') + "',",
    ')',
    '',
    'resp = client.chat.completions.create(',
    "    model='" + (model || 'MODEL_ID') + "',",
    "    messages=[{'role': 'user', 'content': 'Xin chào'}],",
    ')',
    'print(resp.choices[0].message.content)',
  ].join('\n');
}

function nodeSnippet(entry, model) {
  return [
    "const OpenAI = require('openai');",
    '',
    'const client = new OpenAI({',
    "  baseURL: '" + String(entry.baseUrl || '') + "',",
    "  apiKey: '" + (entry.keys[0] ? entry.keys[0].secret : 'YOUR_KEY') + "',",
    '});',
    '',
    'const resp = await client.chat.completions.create({',
    "  model: '" + (model || 'MODEL_ID') + "',",
    "  messages: [{ role: 'user', content: 'Xin chào' }],",
    '});',
    'console.log(resp.choices[0].message.content);',
  ].join('\n');
}

function gatewaySnippet(gateway) {
  const token = gateway && gateway.token ? gateway.token : 'YOUR_LOCAL_TOKEN';
  const port = (gateway && gateway.port) || 8788;
  return [
    '# Cổng nội bộ của Notebook — trỏ bất kỳ app nào vào đây:',
    'export OPENAI_BASE_URL=http://127.0.0.1:' + port + '/v1',
    'export OPENAI_API_KEY=' + token,
    '',
    '# Model "auto" sẽ tự chọn nhà cung cấp điểm cao nhất còn quota.',
    'curl http://127.0.0.1:' + port + '/v1/chat/completions \\',
    '  -H "Authorization: Bearer ' + token + '" \\',
    '  -H "Content-Type: application/json" \\',
    '  -d \'{"model":"auto","messages":[{"role":"user","content":"Xin chào"}]}\'',
  ].join('\n');
}

function markdownReport(store, scores, options) {
  const opts = options || {};
  const rows = store.data.providers
    .map((p) => ({ p, s: scores[p.id] }))
    .filter((x) => x.s)
    .sort((a, b) => b.s.score - a.s.score);

  const lines = [
    '# Báo cáo nhà cung cấp — ' + new Date().toLocaleString(),
    '',
    '| # | Nhà cung cấp | Hạng | Điểm | Tin cậy | p50 | Quota | Key | Model | Phân loại |',
    '|---|---|---|---|---|---|---|---|---|---|',
  ];
  for (const { p, s } of rows) {
    const q = s.quota;
    const qText = q.unlimited
      ? TYPE_LABEL[q.type] || q.type
      : q.headroom != null
      ? Math.round((1 - q.headroom) * 100) + '% đã dùng'
      : TYPE_LABEL[q.type] || '—';
    lines.push(
      '| ' + s.rank + ' | ' + p.name + ' | ' + s.grade + ' | ' + s.score + ' | ' +
        (s.stats.successRate == null ? '—' : Math.round(s.stats.successRate * 100) + '%') + ' | ' +
        (s.stats.p50 == null ? '—' : s.stats.p50 + 'ms') + ' | ' + qText + ' | ' +
        s.counts.enabledKeys + ' | ' + s.counts.models + ' | ' + s.buckets.join(', ') + ' |'
    );
  }

  if (opts.includeJournal !== false) {
    lines.push('', '## Nhật ký gần đây', '');
    for (const j of store.data.journal.slice(0, 30)) {
      const p = store.findProvider(j.providerId);
      lines.push('- `' + new Date(j.ts).toLocaleString() + '`' + (p ? ' **' + p.name + '**' : '') + ' — ' + j.text);
    }
  }

  const usageToday = [];
  for (const p of store.data.providers) {
    const row = (store.data.usage[p.id] || {})[dayKey()];
    if (!row) continue;
    usageToday.push(
      '- ' + p.name + ': ' + row.requests + ' request, ' + (row.promptTokens + row.completionTokens) + ' token'
    );
  }
  if (usageToday.length) {
    lines.push('', '## Đã dùng hôm nay', '', ...usageToday);
  }
  return lines.join('\n');
}

function csvReport(store, scores) {
  const head = [
    'ten',
    'hang',
    'diem',
    'loai',
    'endpoint',
    'so_key',
    'so_model',
    'quota',
    'tin_cay',
    'p50_ms',
    'phan_loai',
    'ghi_chu',
  ];
  const lines = [head.join(',')];
  const esc = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  for (const p of store.data.providers) {
    const s = scores[p.id];
    lines.push(
      [
        p.name,
        s ? s.grade : '',
        s ? s.score : '',
        (p.quota && p.quota.type) || 'unknown',
        p.baseUrl,
        s ? s.counts.enabledKeys : '',
        s ? s.counts.models : '',
        s && s.quota.limit ? s.quota.used + '/' + s.quota.limit : '',
        s && s.stats.successRate != null ? Math.round(s.stats.successRate * 100) + '%' : '',
        s && s.stats.p50 != null ? s.stats.p50 : '',
        s ? s.buckets.join(' ') : '',
        p.notes || '',
      ]
        .map(esc)
        .join(',')
    );
  }
  return lines.join('\r\n');
}

module.exports = {
  collectEntries,
  envFile,
  jsonConfig,
  litellmYaml,
  curlSnippet,
  pythonSnippet,
  nodeSnippet,
  gatewaySnippet,
  markdownReport,
  csvReport,
  TYPE_LABEL,
};
