'use strict';

/**
 * tools/smoke.js â€” Kiá»ƒm tra khá»Ÿi Ä‘á»™ng khÃ´ng cáº§n nhÃ¬n mÃ n hÃ¬nh.
 *
 * Cháº¡y:  node_modules\electron\dist\electron.exe tools\smoke.js
 *
 * DÃ¹ng thÆ° má»¥c dá»¯ liá»‡u táº¡m nÃªn KHÃ”NG Ä‘á»¥ng vÃ o sá»• tháº­t. Náº¡p renderer tháº­t,
 * cháº¡y 2 lÆ°á»£t: (1) gá»i tháº³ng cÃ¡c kÃªnh IPC, (2) náº¡p láº¡i cá»­a sá»• rá»“i thao tÃ¡c
 * y nhÆ° ngÆ°á»i dÃ¹ng (báº¥m nÃºt, Ä‘iá»n form). In bÃ¡o cÃ¡o text ra stdout.
 */

const path = require('path');
const os = require('os');
const fs = require('fs');
const http = require('http');
const { app, BrowserWindow, clipboard } = require('electron');

const tmp = path.join(os.tmpdir(), 'notebook-smoke-' + Date.now());
fs.mkdirSync(tmp, { recursive: true });
app.setPath('userData', tmp);

const logs = [];
const SECRET = 'sk-smoke-1234567890';

/* ÄÃºng vÃ­ dá»¥ ngÆ°á»i dÃ¹ng Ä‘Æ°a: chá»‰ cÃ³ endpoint + key + tÃªn model. */
const CURL =
  'curl https://api.justwoker.icu/v1/chat/completions \\\n' +
  '  -H "Content-Type: application/json" \\\n' +
  '  -H "Authorization: Bearer sk-demo-EXAMPLEKEY1234567890abcdefghijklmnop" \\\n' +
  '  -d \'{"model":"claude-opus-4-8","messages":[{"role":"user","content":"Say hello in one sentence."}]}\'';
const CURL_SECRET = 'sk-demo-EXAMPLEKEY1234567890abcdefghijklmnop';

/* Cac kieu dan khac nhau nguoi dung gui: chi key + host, key + /v1 + danh sach
   model, va key + /v1 khong co model. Key trong day la key GIA. */
const PASTE_BARE =
  'sk-EXAMPLEAGENTROUTERKEY0000000000000000000000\n' + 'https://agentrouter.org';
const PASTE_LIST =
  'sk-EXAMPLEVYCEAIKEY0000000000000000000000000000000000\n' +
  'https://vyceai.com/v1\n' +
  'claude-sonnet-4-6, gpt-astra, deepseek-v4-flash, auto';
const PASTE_NOMODEL =
  'sk-EXAMPLEAPINEXKEY00000000000000000000000000000000\n' + 'https://api.apinex.bond/v1';
/* Tat ca cung MOT hang: nhieu key + endpoint + nhieu model. Cong 9 la cong khong
   duoc phep nen moi lan tai trang deu that bai ngay, khong lam cham bai do. */
const PASTE_ONELINE =
  'sk-EXAMPLEONE000000000000000000000000000001 sk-EXAMPLEONE000000000000000000000000000002 http://127.0.0.1:9/one-line/v1 gpt-6-luna,claude-sonnet-4-6 deepseek-v4-flash';

app.on('browser-window-created', (_e, win) => {
  const wc = win.webContents;
  wc.on('console-message', (...args) => {
    const d = args[0];
    if (d && typeof d === 'object' && 'message' in d) {
      logs.push('[console:' + (d.level || '?') + '] ' + d.message + ' (' + (d.sourceId || '') + ':' + (d.lineNumber || 0) + ')');
    } else {
      logs.push('[console:' + args[1] + '] ' + args[2] + ' (' + (args[4] || '') + ':' + (args[3] || 0) + ')');
    }
  });
  wc.on('preload-error', (_ev, p, err) => logs.push('[preload-error] ' + p + ' :: ' + err.message));
  wc.on('did-fail-load', (_ev, code, desc, url) => logs.push('[did-fail-load] ' + code + ' ' + desc + ' ' + url));
  wc.on('render-process-gone', (_ev, details) => logs.push('[render-gone] ' + JSON.stringify(details)));
});

require('../src/main/main.js');

const HELPERS = `
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const KIND = /(^|[^\\w.])(app|nav|action|search|dashboard|providers|models|playground|gateway|export|journal|settings|grade|bucket|quota|state|err|kpi|misc|c|q|pr|d|pg|gw|ex|jr|st|field)\\.[a-z][A-Za-z0-9]*(\\.[a-zA-Z][A-Za-z0-9]*)*/;
  const VIEWS = ['dashboard', 'providers', 'models', 'playground', 'gateway', 'export', 'journal', 'settings'];
  const rawOf = (el) => {
    if (!el) return 'MISSING';
    const m = KIND.exec(el.textContent || '');
    return (el.innerHTML || '').length + (m ? ' RAW_KEY:' + m[0].trim() : '');
  };
  const scanViews = async (out, bag) => {
    bag = bag || 'views';
    out[bag] = {};
    for (const v of VIEWS) {
      const nav = document.querySelector('.nav-item[data-view="' + v + '"]');
      if (!nav) { out[bag][v] = 'NO_NAV'; continue; }
      nav.click();
      await wait(90);
      out[bag][v] = rawOf(document.querySelector('#view'));
    }
  };
`;

/* ------------------------------------------------------------------ */
/* LÆ°á»£t 1 â€” gá»i tháº³ng kÃªnh IPC                                         */
/* ------------------------------------------------------------------ */

const SCRIPT_IPC = `(async () => {
${HELPERS}
  const out = { ok: true };
  for (let i = 0; i < 100 && !window.LOADED; i++) await wait(100);
  out.loaded = !!window.LOADED;
  const le = document.querySelector('#loadError');
  out.loadError = le && !le.hidden ? le.textContent : null;
  out.hasApi = !!window.notebook;
  out.hasV = typeof window.V === 'object';
  out.totalsEmpty = window.S.snap.totals;
  await scanViews(out, 'viewsEmpty');

  var err = [];
  try {
    const created = await window.notebook.providers.create({
      name: 'Smoke Test', kind: 'api', baseUrl: 'http://127.0.0.1:9/v1', authStyle: 'bearer',
    });
    if (!created.ok) err.push('create: ' + created.error);
    const pid = created.provider.id;
    out.createReturns = { provider: !!created.provider, snapshot: !!created.snapshot };

    const presets = await window.notebook.providers.addPresets(['groq', 'openrouter', 'ollama', 'chatgpt']);
    out.presetCreated = presets.created;
    const presets2 = await window.notebook.providers.addPresets(['groq']);
    out.presetSkipped = presets2.skipped;

    const k = await window.notebook.keys.create({ providerId: pid, label: 'smoke', secret: '${SECRET}' });
    if (!k.ok) err.push('keyCreate: ' + k.error);
    const dup = await window.notebook.keys.create({ providerId: pid, label: 'smoke2', secret: '${SECRET}' });
    out.dupBlocked = dup.ok === false;
    const rev = await window.notebook.keys.reveal(k.keyId);
    out.revealRoundTrip = rev.ok && rev.secret === '${SECRET}';
    const bulk = await window.notebook.keys.bulkCreate({ providerId: pid, text: 'aaa-bbb\\nccc-ddd\\naaa-bbb', labelPrefix: 'B' });
    out.bulkAdded = bulk.added; out.bulkDup = bulk.dup;
    const mdl = await window.notebook.models.bulkAdd({ providerId: pid, text: 'llama-3.1-8b\\nmixtral-8x7b\\n' });
    out.modelsAdded = mdl.added;

    const snap = await window.notebook.snapshot();
    const sc = snap.scores[pid];
    out.score = sc ? { score: sc.score, grade: sc.grade, buckets: sc.buckets, keys: sc.counts.enabledKeys, models: sc.counts.models } : null;
    out.secretLeaksToSnapshot = JSON.stringify(snap).indexOf('${SECRET}') >= 0;
    out.keyPrefixField = (snap.keys.filter((x) => x.providerId === pid)[0] || {}).prefix;

    for (const kind of ['env','json','litellm','markdown','csv','curl','python','node','gateway','vault']) {
      const r = await window.notebook.exporter.preview(kind, { includeSecrets: true });
      if (!r.ok || !r.content || r.content.length < 10) err.push('export ' + kind + ': ' + (r.error || 'empty'));
    }
    const noSec = await window.notebook.exporter.preview('env', { includeSecrets: false });
    out.exportHidesSecret = !new RegExp('${SECRET}').test(noSec.content);
    const withSec = await window.notebook.exporter.preview('env', { includeSecrets: true });
    out.exportShowsSecret = new RegExp('${SECRET}').test(withSec.content);
    out.exportBytes = withSec.bytes;

    const upd = await window.notebook.providers.update(pid, { quota: { type: 'daily-tokens', amount: 1000000 }, qualityManual: 4, tags: ['x', 'y'] });
    if (!upd.ok) err.push('providerUpdate: ' + upd.error);
    const q = upd.snapshot.scores[pid] ? upd.snapshot.scores[pid].quota : null;
    out.quota = q ? { type: q.type, limit: q.limit, headroom: q.headroom } : null;
    const updNoSec = await window.notebook.providers.update(pid, { baseUrl: 'https://example.invalid/v1' });
    out.updateKeepsSecret = updNoSec.ok && (await window.notebook.snapshot()).keys.filter((x) => x.providerId === pid).length > 0;
    await window.notebook.providers.update(pid, { baseUrl: 'http://127.0.0.1:9/v1' });

    const jr = await window.notebook.journal.add({ providerId: pid, text: 'smoke note' });
    if (!jr.ok) err.push('journal: ' + jr.error);
    out.journalCount = jr.snapshot.journal.length;
    const al = await window.notebook.alerts.markSeen();
    if (!al.ok) err.push('alerts: ' + al.error);

    const gwRun = await window.notebook.gateway.start();
    out.gatewayStart = gwRun.ok ? gwRun.gateway.port : gwRun.error;
    if (gwRun.ok) {
      const st = await window.notebook.gateway.status();
      const root = st.url.replace(/\\/v1\\/?$/, '');
      const h = await fetch(root + '/health').then((r) => r.json()).catch((e) => ({ error: String(e) }));
      out.healthOk = !!h && !h.error;
      out.healthHasTop = !!(h && (h.providers || h.top));
      const ml = await fetch(st.url + '/models').then((r) => r.json()).catch((e) => ({ error: String(e) }));
      out.gatewayModels = ml && ml.data ? ml.data.length : String(ml && ml.error);
      out.gatewayHasAuto = !!(ml && ml.data && ml.data.some((m) => m.id === 'auto'));
      const chat = await fetch(st.url + '/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'auto', messages: [{ role: 'user', content: 'hi' }] }),
      }).then((r) => r.json()).catch((e) => ({ error: String(e) }));
      out.gatewayFailoverWorks = !!(chat && chat.error);
      const st2 = await window.notebook.gateway.status();
      out.gatewayFailoverStopped = st2.stats.requests >= 1;
      await window.notebook.gateway.stop();
      out.gatewayStopped = (await window.notebook.gateway.status()).running === false;
    }

    const dupProv = await window.notebook.providers.duplicate(pid);
    out.duplicated = dupProv.ok === true;
    const delDup = await window.notebook.providers.remove(dupProv.provider.id);
    out.deleted = delDup.ok === true;
    const finalSnap = await window.notebook.snapshot();
    out.finalProviders = finalSnap.totals.providers;
    out.finalKeys = finalSnap.totals.keys;
    out.dataPathIsTemp = String(finalSnap.dataPath).indexOf('.tmp') > 0 || String(finalSnap.dataPath).indexOf('notebook-smoke-') > 0;
  } catch (e) { out.fatal = String((e && e.message) || e); }
  out.errors = err || [];
  out.ok = (err || []).length === 0 && !out.fatal;
  return JSON.stringify(out);
})()`;

/* ------------------------------------------------------------------ */
/* LÆ°á»£t 2 â€” thao tÃ¡c qua giao diá»‡n tháº­t                                */
/* ------------------------------------------------------------------ */

const SCRIPT_UI = `(async () => {
${HELPERS}
  const out = { ok: true };
  for (let i = 0; i < 100 && !window.LOADED; i++) await wait(100);
  var err = [];
  const click = async (sel, ms) => { const el = document.querySelector(sel); if (!el) { err.push('missing ' + sel); return null; } el.click(); await wait(ms || 150); return el; };
  const change = async (sel, value, ms) => {
    const el = document.querySelector(sel);
    if (!el) { err.push('missing ' + sel); return null; }
    el.value = value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    await wait(ms || 300);
    return el;
  };
  try {
    out.startProviders = window.S.snap.totals.providers;
    out.overlayAtBoot = {
      drawer: getComputedStyle(document.querySelector('#drawer')).display,
      drawerHasHtml: document.querySelector('#drawer').innerHTML.length,
      probeBar: getComputedStyle(document.querySelector('#probeBar')).display,
      loadError: getComputedStyle(document.querySelector('#loadError')).display,
      alertBadge: document.querySelector('#alertCount') ? 'con' : 'da bo',
      modalRoot: document.querySelector('#modalRoot').children.length,
    };
    await scanViews(out, 'viewsData');

    /* táº¡o nhÃ  cung cáº¥p báº±ng form tháº­t */
    document.querySelector('.nav-item[data-view="providers"]').click();
    await wait(120);
    out.providersViewHasRows = document.querySelectorAll('#view [data-act="provider-open"]').length;
    await click('[data-act="new-provider"]', 250);
    await click('#modalRoot [data-manual]', 300);
    const m = document.querySelector('#modalRoot');
    out.formFields = m.querySelectorAll('[data-f]').length;
    const mAdv = m.querySelector('details.adv');
    out.formAdvancedClosed = mAdv ? mAdv.open === false : null;
    out.formBasicVisible = [...m.querySelectorAll('[data-f]')].filter((el) => (mAdv ? !mAdv.contains(el) : true)).length;
    m.querySelector('[data-f="name"]').value = 'UI Test';
    m.querySelector('[data-f="baseUrl"]').value = 'http://127.0.0.1:9/v1';
    m.querySelector('[data-f="kind"]').value = 'api';
    await click('#modalRoot [data-save]', 500);
    out.modalClosedAfterSave = document.querySelector('#modalRoot').innerHTML.length === 0;
    out.afterUiCreate = window.S.snap.totals.providers;
    out.rowsAfterCreate = document.querySelectorAll('#view [data-act="provider-open"]').length;
    const pid = (window.S.snap.providers.filter((p) => p.name === 'UI Test')[0] || {}).id;
    out.uiPidFound = !!pid;

    /* drawer + thÃªm key + Ä‘á»•i quota */
    await click('#view [data-act="provider-open"][data-id="' + pid + '"]', 250);
    out.drawer = rawOf(document.querySelector('#drawer'));
    const dtext = (document.querySelector('#drawer') || {}).textContent || '';
    const dmi = dtext.search(KIND);
    out.drawerCtx = dmi >= 0 ? dtext.slice(Math.max(0, dmi - 60), dmi + 60) : null;
    out.drawerHasQuotaForm = !!document.querySelector('#drawer [data-act="quota-set"]');
    await click('#drawer [data-act="key-add"]', 200);
    document.querySelector('#modalRoot [data-f="label"]').value = 'ui-key';
    document.querySelector('#modalRoot [data-f="secret"]').value = 'sk-ui-9876543210';
    await click('#modalRoot [data-save]', 500);
    out.keysAfterAdd = window.S.snap.keys.length;
    out.drawerStillOpen = rawOf(document.querySelector('#drawer')).length > 0;

    /* sao chÃ©p: key (khÃ´ng hiá»‡n secret) vÃ  endpoint */
    out.copyBtns = {
      key: document.querySelectorAll('#drawer [data-act="key-copy"]').length,
      text: document.querySelectorAll('#drawer [data-act="copy-text"]').length,
      models: document.querySelectorAll('#drawer [data-act="copy-models"]').length
    };
    await click('#drawer [data-act="key-copy"]', 400);
    out.copyKeyToast = (document.querySelector('#toastRoot') || {}).textContent;

    out.quotaSelectValue = (document.querySelector('#drawer [data-act="quota-set"][data-key="type"]') || {}).value;
    out.quotaAmountShown = (document.querySelector('#drawer [data-act="quota-set"][data-key="amount"]') || {}).value;
    out.quotaBefore = JSON.stringify((window.S.snap.providers.filter((p) => p.id === pid)[0] || {}).quota);
    await change('#drawer [data-act="quota-set"][data-key="type"]', 'daily-requests', 600);
    out.quotaAfter = JSON.stringify((window.S.snap.providers.filter((p) => p.id === pid)[0] || {}).quota);
    out.toastAfterQuota = (document.querySelector('#toastRoot') || {}).textContent;
    await change('#drawer [data-act="quota-set"][data-key="amount"]', '200', 600);
    out.quotaAmount = (window.S.snap.providers.filter((p) => p.id === pid)[0] || {}).quota.amount;

    /* báº­t/táº¯t provider, ghim, Ä‘á»•i cháº¥t lÆ°á»£ng */
    out.toggleDataOn = (document.querySelector('#drawer [data-act="provider-toggle"]') || {}).dataset.on;
    await click('#drawer [data-act="provider-toggle"]', 600);
    out.toastAfterToggle = (document.querySelector('#toastRoot') || {}).textContent;
    out.enabledAfterToggle = (window.S.snap.providers.filter((p) => p.id === pid)[0] || {}).enabled;
    out.toggledOff = (window.S.snap.providers.filter((p) => p.id === pid)[0] || {}).enabled === false;
    await click('#drawer [data-act="provider-toggle"]', 600);
    out.toggledOn = (window.S.snap.providers.filter((p) => p.id === pid)[0] || {}).enabled !== false;
    await click('#drawer [data-act="provider-pin"]', 600);
    out.pinned = (window.S.snap.providers.filter((p) => p.id === pid)[0] || {}).pinned === true;
    await click('#drawer [data-act="drawer-close"]', 200);

    /* model: báº­t/táº¯t */
    await click('.nav-item[data-view="models"]', 150);
    out.modelToggles = document.querySelectorAll('#view [data-act="model-toggle"]').length;
    if (out.modelToggles) {
      const before = window.S.snap.models.filter((x) => x.enabled !== false).length;
      await click('#view [data-act="model-toggle"]', 400);
      out.modelToggleChanged = window.S.snap.models.filter((x) => x.enabled !== false).length !== before;
    }

    /* sá»• preset */
    document.querySelector('.nav-item[data-view="providers"]').click();
    await wait(120);
    await click('#view [data-act="open-presets"]', 250);
    out.presetModalOpen = document.querySelector('#modalRoot').innerHTML.length > 500;
    const before = window.S.snap.totals.providers;
    out.presetCandidates = document.querySelectorAll('#modalRoot [data-act="preset-pick"]').length;
    out.presetFirstDisabled = (document.querySelector('#modalRoot [data-act="preset-pick"]') || {}).disabled;
    await click('#modalRoot [data-act="preset-pick"]:not([disabled])', 800);
    out.presetToast = (document.querySelector('#toastRoot') || {}).textContent;
    out.presetPickAdded = window.S.snap.totals.providers > before;
    await click('#modalRoot [data-close]', 200);

    /* Ä‘o thá»­ má»™t nhÃ  cung cáº¥p (endpoint cháº¿t -> pháº£i bÃ¡o lá»—i, khÃ´ng Ä‘Æ°á»£c vá»¡) */
    document.querySelector('.nav-item[data-view="providers"]').click();
    await wait(120);
    await click('#view [data-act="probe-one"]', 3000);
    out.probeSamplesAfter = window.S.snap.totals.samples;
    out.probeAlertShown = window.S.snap.alerts.length > 0;
    out.alertsBadge = document.querySelector('#alertCount') ? 'con' : 'da bo';

    /* cá»•ng ná»™i bá»™ báº­t/táº¯t báº±ng nÃºt */
    await click('.nav-item[data-view="gateway"]', 150);
    await click('#view [data-act="gw-start"]', 1500);
    out.gwPillOn = document.querySelector('#gwDot').classList.contains('on');
    out.gwStartedByUi = (window.S.snap.gateway || {}).running === true;

    /* playground: cháº¡y tháº­t qua cá»•ng ná»™i bá»™ (upstream cháº¿t -> pháº£i bÃ¡o lá»—i gá»n) */
    await click('.nav-item[data-view="playground"]', 250);
    out.playSelected = (window.S.playground.selected || []).length;
    const pta = document.querySelector('#pgPrompt');
    if (pta) pta.value = 'xin chÃ o';
    await click('#view [data-act="play-run"]', 6000);
    out.playResults = (window.S.playground.results || []).length;
    out.playFirstError = (((window.S.playground.results || [])[0] || {}).error || null);
    out.playRendered = document.querySelectorAll('#view .out-card').length;

    await click('.nav-item[data-view="gateway"]', 250);
    await click('#view [data-act="gw-stop"]', 1000);
    out.gwStoppedByUi = (window.S.snap.gateway || {}).running === false;

    /* xuáº¥t: xem trÆ°á»›c báº±ng nÃºt */
    await click('.nav-item[data-view="export"]', 150);
    await click('#view [data-act="export-preview"]', 600);
    out.exportPreviewLen = ((document.querySelector('#exportPreview') || {}).textContent || '').length;
    await change('#view [data-act="export-kind"]', 'litellm', 600);
    out.litellmPreviewLen = ((document.querySelector('#exportPreview') || {}).textContent || '').length;
    await click('#view [data-act="export-opt"][data-key="includeSecrets"]', 300);
    out.exportOptToggled = window.S.exportOpts.includeSecrets === false;

    /* nháº­t kÃ½ */
    await click('.nav-item[data-view="journal"]', 150);
    document.querySelector('#jrText').value = 'ghi chÃº tá»« smoke';
    await click('#view [data-act="journal-add"]', 500);
    out.journalCount = window.S.snap.journal.length;
    out.journalRendered = document.querySelectorAll('#view [data-act="journal-delete"]').length;

    /* cÃ i Ä‘áº·t: Ä‘á»•i ngÃ´n ngá»¯ sang EN rá»“i quÃ©t láº¡i toÃ n bá»™ mÃ n hÃ¬nh */
    await click('.nav-item[data-view="settings"]', 150);
    await change('#view [data-set="language"]', 'en', 600);
    out.lang = window.I18N.get();
    await scanViews(out, 'viewsEn');
    await click('.nav-item[data-view="settings"]', 150);
    await change('#view [data-set="language"]', 'vi', 600);
    out.langBack = window.I18N.get();

    /* tÃ¬m kiáº¿m */
    const s = document.querySelector('#search');
    s.value = 'UI';
    s.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(400);
    out.searchQuery = window.S.query;

    /* xoÃ¡ nhÃ  cung cáº¥p vá»«a táº¡o qua drawer */
    document.querySelector('.nav-item[data-view="providers"]').click();
    await wait(150);
    await click('#view [data-act="provider-open"][data-id="' + pid + '"]', 250);
    await click('#drawer [data-act="provider-delete"]', 400);
    out.confirmShown = !!document.querySelector('#modalRoot [data-confirm]');
    await click('#modalRoot [data-confirm]', 900);
    out.deletedViaUi = !window.S.snap.providers.some((p) => p.id === pid);

    /* thÃªm nhanh: chá»‰ dÃ¡n curl, app tá»± tÃ¡ch endpoint + key + model */
    out.parseCurl = window.V.parseCurl(${JSON.stringify(CURL)});
    document.querySelector('.nav-item[data-view="providers"]').click();
    await wait(150);
    await click('[data-act="new-provider"]', 250);
    const qm = document.querySelector('#modalRoot');
    out.qaFormFields = qm.querySelectorAll('[data-f]').length;
    const qta = qm.querySelector('[data-f="paste"]');
    qta.value = ${JSON.stringify(CURL)};
    qta.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(80);
    out.qaDetectText = (qm.querySelector('#qaDetect') || {}).textContent || '';
    out.qaNamePlaceholder = qm.querySelector('[data-f="name"]').placeholder;
    qm.querySelector('[data-f="autoProbe"]').checked = false;
    await click('#modalRoot [data-save]', 900);
    let qp = {};
    for (let i = 0; i < 40 && !qp.id; i++) {
      await wait(250);
      qp = window.S.snap.providers.filter((x) => x.name === 'Justwoker')[0] || {};
    }
    out.qaProvider = { name: qp.name, baseUrl: qp.baseUrl, authStyle: qp.authStyle, compat: qp.compat, kind: qp.kind };
    out.qaKeys = window.S.snap.keys.filter((k) => k.providerId === qp.id).length;
    out.qaModels = window.S.snap.models.filter((x) => x.providerId === qp.id).map((x) => x.modelId);
    out.qaSecretNeverInSnapshot = JSON.stringify(await window.notebook.snapshot()).indexOf(${JSON.stringify(CURL_SECRET)}) === -1;
    out.qaToast = (document.querySelector('#toastRoot') || {}).textContent;

    /* Cac kieu dan khac: key + host tran, key + /v1 + danh sach model, key + /v1 */
    out.parseBare = window.V.parseCurl(${JSON.stringify(PASTE_BARE)});
    out.parseList = window.V.parseCurl(${JSON.stringify(PASTE_LIST)});
    out.parseNoModel = window.V.parseCurl(${JSON.stringify(PASTE_NOMODEL)});
    out.parseOneLine = window.V.parseCurl(${JSON.stringify(PASTE_ONELINE)});
    if (!out.parseOneLine.secrets || out.parseOneLine.secrets.length !== 2) {
      err.push('mot hang: phai nhan ra 2 key khi dan cung mot hang');
    }
    if (out.parseOneLine.models.length !== 3) {
      err.push('mot hang: phai nhan ra 3 model khi dan cung mot hang (nhan duoc ' + out.parseOneLine.models.join('|') + ')');
    }
    document.querySelector('.nav-item[data-view="providers"]').click();
    await wait(150);
    await click('[data-act="new-provider"]', 250);
    const qm2 = document.querySelector('#modalRoot');
    const qta2 = qm2.querySelector('[data-f="paste"]');
    qta2.value = ${JSON.stringify(PASTE_LIST)};
    qta2.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(80);
    out.qa2Endpoint = qm2.querySelector('[data-f="baseUrl"]').value;
    out.qa2NamePlaceholder = qm2.querySelector('[data-f="name"]').placeholder;
    out.qa2Detect = (qm2.querySelector('#qaDetect') || {}).textContent || '';
    qm2.querySelector('[data-f="autoProbe"]').checked = false;
    await click('#modalRoot [data-save]', 900);
    /* Cho nha cung cap xuat hien trong snapshot (viec them chay sau khi luu). */
    let qp2 = {};
    for (let i = 0; i < 40 && !qp2.id; i++) {
      await wait(250);
      qp2 = window.S.snap.providers.filter((x) => x.baseUrl === 'https://vyceai.com/v1')[0] || {};
    }
    out.qa2Provider = { id: qp2.id, name: qp2.name, baseUrl: qp2.baseUrl };
    out.qa2Keys = window.S.snap.keys.filter((k) => k.providerId === qp2.id).length;
    out.qa2Models = window.S.snap.models.filter((x) => x.providerId === qp2.id).map((x) => x.modelId);
    out.qa2Toast = (document.querySelector('#toastRoot') || {}).textContent;

    /* Dan nhieu key + nhieu model cung MOT hang qua “Them nhanh”. */
    document.querySelector('.nav-item[data-view="providers"]').click();
    await wait(150);
    await click('[data-act="new-provider"]', 250);
    const qm3 = document.querySelector('#modalRoot');
    const qta3 = qm3.querySelector('[data-f="paste"]');
    qta3.value = ${JSON.stringify(PASTE_ONELINE)};
    qta3.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(80);
    out.qa3Detect = (qm3.querySelector('#qaDetect') || {}).textContent || '';
    qm3.querySelector('[data-f="autoProbe"]').checked = false;
    await click('#modalRoot [data-save]', 300);
    /* Viec them phai xong nhanh: doc gia tu web chay TU DONG khong duoc giu nguoi
       dung cho hang chuc giay. Cho toi da 9 giay roi bao ro da cho bao lau. */
    const oneUrl = 'http://127.0.0.1:9/one-line/v1';
    let qp3 = {};
    let waited = 0;
    while (waited < 9000 && !qp3.id) {
      await wait(250);
      waited += 250;
      qp3 = window.S.snap.providers.filter((x) => x.baseUrl === oneUrl)[0] || {};
    }
    out.qa3Ms = waited;
    let keysN = 0;
    let modelsN = [];
    while (waited < 12000) {
      keysN = window.S.snap.keys.filter((k) => k.providerId === qp3.id).length;
      modelsN = window.S.snap.models.filter((x) => x.providerId === qp3.id).map((x) => x.modelId);
      if (keysN >= 2 && modelsN.length >= 3) break;
      await wait(250);
      waited += 250;
    }
    out.qa3Provider = { id: qp3.id, name: qp3.name, baseUrl: qp3.baseUrl };
    out.qa3Keys = keysN;
    out.qa3Models = modelsN;
    out.qa3Toast = (document.querySelector('#toastRoot') || {}).textContent;
    if (out.qa3Keys !== 2) err.push('them nhanh mot hang: phai tao du 2 key (co ' + out.qa3Keys + ')');
    if (out.qa3Models.length !== 3) err.push('them nhanh mot hang: phai tao du 3 model (co ' + out.qa3Models.length + ')');
    if (!qp3.id || out.qa3Ms > 6000) err.push('them nhanh: them nha cung cap bi treo (cho ' + out.qa3Ms + 'ms)');

    /* Logo: phai la anh that cua ung dung, khong con chu "NB". */
    const bm = document.querySelector('.brand-mark');
    out.brandMark = {
      tag: bm ? bm.tagName : 'MISSING',
      src: bm ? bm.getAttribute('src') : '',
      loaded: !!(bm && bm.naturalWidth > 0),
      text: bm ? (bm.textContent || '').trim() : '',
      hasNB: /NB/.test((document.querySelector('.brand') || {}).textContent || ''),
    };

    /* Bam sao trong ngan keo khong duoc keo danh sach ve vi tri cu. */
    const pid2 = qp2.id || (window.S.snap.providers[0] || {}).id;
    const sEl = document.querySelector('#search');
    sEl.value = '';
    sEl.dispatchEvent(new Event('input', { bubbles: true }));
    await wait(400);
    document.querySelector('.nav-item[data-view="providers"]').click();
    await wait(150);
    await click('[data-act="provider-open"][data-id="' + pid2 + '"]', 400);
    const dBody = document.querySelector('#drawer .drawer-body');
    const star = document.querySelector('#drawer [data-act="model-fav"]');
    out.scrollKeep = { hasBody: !!dBody, hasStar: !!star };
    if (dBody && star) {
      dBody.scrollTop = 220;
      const before = dBody.scrollTop;
      star.click();
      await wait(800);
      const after = (document.querySelector('#drawer .drawer-body') || {}).scrollTop;
      out.scrollKeep.before = before;
      out.scrollKeep.after = after;
      out.scrollKeep.kept = before > 0 && after === before;
    }

    /* Nut bat/tat model va nut xoa khong duoc de len nhau. */
    const swEl = document.querySelector('#drawer [data-act="model-toggle"]');
    const delEl = document.querySelector('#drawer [data-act="model-delete"]');
    const swR = swEl && swEl.getBoundingClientRect();
    const delR = delEl && delEl.getBoundingClientRect();
    const tbl = document.querySelector('#drawer table.table');
    out.actionCells =
      swR && delR
        ? {
            swW: Math.round(swR.width),
            swH: Math.round(swR.height),
            swRight: Math.round(swR.right),
            delLeft: Math.round(delR.left),
            overlap: Math.round(swR.right - delR.left),
            tableOverflow: tbl ? Math.round(tbl.scrollWidth - tbl.clientWidth) : null,
          }
        : { missing: true };

    /* Sua o han muc khong duoc keo ngan keo len dau. */
    const dLive = document.querySelector('#drawer .drawer-body');
    const qSel = document.querySelector('#drawer [data-act="quota-set"][data-key="type"]');
    out.quotaScroll = { hasSel: !!qSel };
    if (dLive && qSel) {
      dLive.scrollTop = 150;
      const qBefore = dLive.scrollTop;
      qSel.value = qSel.value === 'daily-tokens' ? 'daily-requests' : 'daily-tokens';
      qSel.dispatchEvent(new Event('change', { bubbles: true }));
      await wait(900);
      const after = (document.querySelector('#drawer .drawer-body') || {}).scrollTop;
      out.quotaScroll = { before: qBefore, after, kept: qBefore > 0 && after === qBefore };
      if (!out.quotaScroll.kept) err.push('quota: sua o han muc lam ngan keo nhay ve dau');
    }

    /* Bam “Do ngay” phai cap nhat bang “Lan do gan day” ngay, khong phai dong/mo lai. */
    const logA = document.querySelector('#drawer [data-probe-log]');
    const txtBefore = logA ? logA.textContent : '(khong co bang)';
    const pBtn = document.querySelector('#drawer [data-act="probe-one"]');
    let txtAfter = txtBefore;
    let pWaited = 0;
    if (pBtn) {
      pBtn.click();
      while (pWaited < 8000 && txtAfter === txtBefore) {
        await wait(250);
        pWaited += 250;
        txtAfter = (document.querySelector('#drawer [data-probe-log]') || {}).textContent || txtBefore;
      }
    }
    out.probeRefresh = {
      hadBtn: !!pBtn,
      ms: pWaited,
      changed: txtAfter !== txtBefore,
      drawerOpen: !document.querySelector('#drawer').hidden,
      lines: ((document.querySelector('#drawer [data-probe-log]') || {}).children || []).length,
    };
    if (!out.probeRefresh.hadBtn || !out.probeRefresh.changed) err.push('probe: bang “Lan do gan day” khong tu cap nhat');

    /* Boi den chu trong o dan roi keo chuot ra ngoai KHONG duoc dong hop thoai. */
    await click('#drawer [data-act="model-bulk"]', 400);
    const bulkBack = document.querySelector('#modalRoot .modal-back');
    const bulkTa = bulkBack && bulkBack.querySelector('textarea[data-f="text"]');
    if (bulkTa) {
      bulkTa.value = 'a-model b-model,c-model';
      bulkTa.dispatchEvent(new Event('input', { bubbles: true }));
      bulkTa.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      bulkBack.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await wait(200);
    }
    out.dragSelect = {
      hadTextarea: !!bulkTa,
      stillOpen: !!document.querySelector('#modalRoot .modal-back'),
    };
    if (!out.dragSelect.stillOpen) err.push('modal: boi den roi keo chuot ra ngoai lam dong hop thoai');

    /* Dan nhieu model cung mot hang van tach du. */
    const bulkSave = document.querySelector('#modalRoot [data-save]');
    if (bulkSave) bulkSave.click();
    await wait(1200);
    const oneLine = await window.notebook.models.bulkAdd({ providerId: pid2, text: 'một-hai ba-bốn' });
    const keysOneLine = await window.notebook.keys.bulkCreate({ providerId: pid2, text: 'sk-aaaaaaaaaaaaaaaaaaaaaaaa1,sk-bbbbbbbbbbbbbbbbbbbbbbbb2', labelPrefix: 'K' });
    const p2 = (((keysOneLine || {}).snapshot || {}).providers || []).filter((x) => x.id === pid2)[0] || {};
    out.oneLine = {
      bulkAdded: oneLine ? oneLine.added : null,
      keyAdded: keysOneLine ? keysOneLine.added : null,
      keyCount: p2.keyCount === undefined ? null : p2.keyCount,
    };
    if (out.oneLine.bulkAdded !== 2) err.push('mot hang: dan 2 model cung hang phai tao du 2');
    if (out.oneLine.keyAdded !== 2) err.push('mot hang: dan 2 key cung hang phai tao du 2');

    /* Bam sao trong danh sach Model cung khong duoc nhay ve dau trang. */
    document.querySelector('.nav-item[data-view="models"]').click();
    await wait(200);
    const vEl = document.querySelector('#view');
    const vStar = document.querySelector('#view [data-act="model-fav"]');
    out.scrollKeepView = { hasStar: !!vStar };
    if (vStar) {
      vEl.scrollTop = 160;
      const b2 = vEl.scrollTop;
      vStar.click();
      await wait(800);
      out.scrollKeepView = { before: b2, after: vEl.scrollTop, kept: b2 > 0 && vEl.scrollTop === b2 };
    }

    /* O bang Model: cong tac bat/tat phai du rong va khong de len nut Sua. */
    const vSw = document.querySelector('#view [data-act="model-toggle"]');
    const vRow = vSw ? vSw.closest('tr') : null;
    const vEdit = vRow ? vRow.querySelector('[data-act="model-edit"]') : null;
    const vSwR = vSw && vSw.getBoundingClientRect();
    const vEdR = vEdit && vEdit.getBoundingClientRect();
    out.viewCells =
      vSwR && vEdR
        ? { swW: Math.round(vSwR.width), overlap: Math.round(vSwR.right - vEdR.left) }
        : { missing: true };
  } catch (e) { out.fatal = String((e && e.message) || e); }
  out.errors = err || [];
  out.ok = (err || []).length === 0 && !out.fatal;
  return JSON.stringify(out);
})()`;

/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */

/* Mau /v1/models gia: mot model co bang gia 0 (mien phi that), mot model co
   bang gia tra phi, mot model KHONG co bang gia. Nhan "mien phi" chi duoc dat
   cho model dau tien; hai model sau phai de trong (null). */
function startModelServer() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      /* Loi 401 kem nguyen trang HTML kieu Cloudflare — dung de kiem tra viec
         rut gon loi truoc khi hien cho nguoi dung. */
      if (/html401/.test(req.url)) {
        res.writeHead(401, { 'content-type': 'text/html; charset=UTF-8' });
        res.end(
          '<!DOCTYPE html><!--[if lt IE 7]> <html class="no-js ie6 oldie" lang="en-US"> <![endif]-->' +
            '<html class="no-js" lang="en-US"><head><title>Attention Required! | Cloudflare</title></head>' +
            '<body><h1>Please enable cookies.</h1><p>Error code: 1020</p><p>Ray ID: 8f21c0</p></body></html>'
        );
        return;
      }
      /* Trang kieu SPA: HTML tho chi la khung rong, bang gia do JavaScript dung ra.
         Dung de kiem tra duong "mo trang trong cua so an". */
      if (/\/spa/.test(req.url)) {
        res.writeHead(200, { 'content-type': 'text/html; charset=UTF-8' });
        res.end(
          '<!DOCTYPE html><html><head><title>SPA pricing</title></head><body><div id="app"></div>' +
            '<script>setTimeout(function(){document.getElementById("app").innerHTML=' +
            '\'<table><tr><th>Model</th><th>Input</th><th>Output</th></tr>' +
            '<tr><td>smoke-spa-model</td><td>$2.00</td><td>$8.00</td></tr></table>' +
            '<p>All prices per 1M tokens.</p>\';},400);</script></body></html>'
        );
        return;
      }
      /* Trang gia kieu HTML that: bang co ten model, gia vao/ra, mot dong "Free",
         mot dong khong co gia. Don vi ghi mot lan o cuoi trang. */
      if (/pricing/.test(req.url)) {
        res.writeHead(200, { 'content-type': 'text/html; charset=UTF-8' });
        res.end(
          '<!DOCTYPE html><html><head><title>Pricing</title></head><body>' +
            '<table><thead><tr><th>Model</th><th>Input</th><th>Output</th></tr></thead><tbody>' +
            '<tr><td>smoke-free-priced</td><td>Free</td><td>Free</td></tr>' +
            '<tr><td>smoke-paid-priced</td><td>$3.00</td><td>$15.00</td></tr>' +
            '<tr><td>smoke-auto-model</td><td>Free</td><td>Free</td></tr>' +
            '<tr><td>smoke-no-price</td><td>—</td><td>—</td></tr>' +
            '</tbody></table><p>All prices per 1M tokens.</p></body></html>'
        );
        return;
      }
      if (/models/.test(req.url)) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            data: [
              { id: 'smoke-free-priced', pricing: { prompt: '0', completion: '0' } },
              { id: 'smoke-paid-priced', pricing: { prompt: '0.000003', completion: '0.000015' } },
              { id: 'smoke-no-price' },
            ],
          })
        );
        return;
      }
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end('{}');
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port }));
  });
}

/* May chu thu hai: chi tra bang gia JSON kieu New API/one-api o /api/pricing. */
function startPriceJsonServer() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      if (/api\/pricing/.test(req.url)) {
        if (String(req.headers.authorization || '') !== 'Bearer ' + SECRET) {
          res.writeHead(401, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ success: false, code: 'AUTH_UNAUTHORIZED', message: 'Unauthorized, invalid access token' }));
          return;
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            success: true,
            data: [
              { model_name: 'smoke-ratio-model', quota_type: 0, model_ratio: 4, completion_ratio: 5, model_price: 0 },
              { model_name: 'smoke-percall-model', quota_type: 1, model_ratio: 0, completion_ratio: 0, model_price: 0.04 },
            ],
          })
        );
        return;
      }
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end('{}');
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port }));
  });
}

const SCRIPT_DISCOVER = (port, jsonPort) => `(async () => {${HELPERS}
  const out = { ok: true };
  var err = [];
  try {
    const c = await window.notebook.providers.create({
      name: 'Discover Test', kind: 'api', baseUrl: 'http://127.0.0.1:${port}/v1', authStyle: 'bearer',
    });
    if (!c.ok) err.push('create: ' + c.error);
    const pid = c.provider.id;
    const k = await window.notebook.keys.create({ providerId: pid, label: 'disc', secret: '${SECRET}' });
    if (!k.ok) err.push('key: ' + k.error);

    const d = await window.notebook.models.discover(pid);
    out.discover = { ok: d.ok, added: d.added, priced: d.priced, freeCount: d.freeCount, error: d.error || null };
    const mine = (d.snapshot ? d.snapshot.models : []).filter((m) => m.providerId === pid);
    out.discovered = mine.map((m) => ({ id: m.modelId, free: m.free, favorite: m.favorite, src: m.source }));
    out.labels = {
      free: mine.filter((m) => m.free === true).map((m) => m.modelId),
      paid: mine.filter((m) => m.free === false).map((m) => m.modelId),
      unknown: mine.filter((m) => m.free === null).map((m) => m.modelId),
    };
    out.unknownStaysUnknown = mine.filter((m) => m.modelId === 'smoke-no-price').every((m) => m.free === null);

    /* Danh dau model ngon: favorite phai luu duoc. */
    const target = mine.filter((m) => m.modelId === 'smoke-no-price')[0];
    const up = await window.notebook.models.update(target.id, { favorite: true });
    out.favSaved = up.ok && (up.snapshot.models.filter((m) => m.id === target.id)[0] || {}).favorite === true;

    /* Chay lai: khong duoc them trung. */
    const again = await window.notebook.models.discover(pid);
    out.secondRun = { ok: again.ok, added: again.added, existing: again.existing };

    /* Model nguoi dung tu them phai mac dinh free = null, favorite = false. */
    const manual = await window.notebook.models.bulkAdd({ providerId: pid, text: 'smoke-manual-one' });
    const mm = manual.ok ? (manual.snapshot.models.filter((m) => m.modelId === 'smoke-manual-one')[0] || {}) : {};
    out.manualDefault = { free: mm.free, favorite: mm.favorite };

    /* Loi 401 kem trang HTML: phai duoc rut lai thanh mot cau ngan, khong nhét
       ca trang vao so. */
    const hp = await window.notebook.providers.create({
      name: 'Html Error Test', kind: 'api', baseUrl: 'http://127.0.0.1:${port}/html401', authStyle: 'bearer',
    });
    const hpid = hp.provider.id;
    await window.notebook.keys.create({ providerId: hpid, label: 'h', secret: '${SECRET}' });
    const pr = await window.notebook.probe.provider({ providerId: hpid, chatProbe: false });
    const hrow = (((pr || {}).snapshot || {}).providers || []).filter((x) => x.id === hpid)[0] || {};
    out.htmlError = {
      kind: hrow.lastErrorKind,
      len: (hrow.lastError || '').length,
      hasTag: /[<>]/.test(hrow.lastError || ''),
      keptCode: /1020/.test(hrow.lastError || ''),
      probeKind: ((pr.results || [])[0] || {}).errorKind,
    };
    const snapHtml = await window.notebook.snapshot();
    out.htmlError.storedTitle = JSON.stringify(snapHtml).indexOf('Attention Required') >= 0;

    /* Gia dang hien thi tren trang web: doc gia + nhan free. */
    const upPricing = await window.notebook.providers.update(pid, { pricingUrl: 'http://127.0.0.1:${port}/pricing' });
    if (!upPricing.ok) err.push('pricingUrl: ' + upPricing.error);
    const wp = await window.notebook.models.priceWeb(pid);
    const mine2 = (wp.snapshot ? wp.snapshot.models : []).filter((m) => m.providerId === pid);
    const pick = (mid) => mine2.filter((m) => m.modelId === mid)[0] || {};
    out.webPrice = {
      ok: wp.ok,
      url: wp.url,
      matched: wp.matched,
      priced: wp.priced,
      freeCount: wp.freeCount,
      skipped: wp.skipped,
      error: wp.error || null,
      freeLabel: pick('smoke-free-priced').free,
      paidLabel: pick('smoke-paid-priced').free,
      unknownLabel: pick('smoke-no-price').free,
      paidPricing: pick('smoke-paid-priced').pricing || null,
      source: pick('smoke-paid-priced').priceSource || null,
      note: pick('smoke-paid-priced').priceNote || '',
      unknownPricing: pick('smoke-no-price').pricing || null,
    };
    if (out.webPrice.freeLabel !== true) err.push('web: dong Free phai duoc danh dau mien phi');
    if (out.webPrice.paidLabel !== false) err.push('web: dong co gia phai la tra phi');
    if (out.webPrice.unknownLabel !== null) err.push('web: dong khong co gia phai de trong');
    if (!out.webPrice.paidPricing || Number(out.webPrice.paidPricing.input) !== 0.000003 || Number(out.webPrice.paidPricing.output) !== 0.000015) {
      err.push('web: gia $3/$15 moi 1M phai duoc quy doi dung ve moi token');
    }

    /* Tu chay khi them model thu cong. */
    const autoAdd = await window.notebook.models.bulkAdd({ providerId: pid, text: 'smoke-auto-model' });
    const autoModel = (((autoAdd || {}).snapshot || {}).models || []).filter((m) => m.modelId === 'smoke-auto-model')[0] || {};
    out.autoWebPrice = {
      webOk: autoAdd.web ? !!autoAdd.web.ok : null,
      matched: autoAdd.web ? autoAdd.web.matched : null,
      free: autoModel.free,
      source: autoModel.priceSource || null,
    };
    if (out.autoWebPrice.source !== 'web' || out.autoWebPrice.free !== true) {
      err.push('web: them model phai tu doc gia');
    }

    /* Gia nguoi dung tu dat thi web khong duoc ghi de. */
    const paidModel = pick('smoke-paid-priced');
    await window.notebook.models.update(paidModel.id, { free: false, pricing: null });
    const wp2 = await window.notebook.models.priceWeb(pid);
    const after = (((wp2 || {}).snapshot || {}).models || []).filter((m) => m.id === paidModel.id)[0] || {};
    out.webKeepsManual = { skipped: wp2.skipped, source: after.priceSource || null, pricing: after.pricing || null };
    if (out.webKeepsManual.source !== 'manual') err.push('web: khong duoc ghi de gia nguoi dung tu dat');

    /* Bang gia JSON kieu New API/one-api: <goc>/api/pricing (co gui key kem theo). */
    const jc = await window.notebook.providers.create({
      name: 'Ratio Test', kind: 'api', baseUrl: 'http://127.0.0.1:${jsonPort}/v1', authStyle: 'bearer',
    });
    if (!jc.ok) err.push('json create: ' + jc.error);
    const jpid = jc.provider.id;
    await window.notebook.keys.create({ providerId: jpid, label: 'ratio', secret: '${SECRET}' });
    const ja = await window.notebook.models.bulkAdd({ providerId: jpid, text: 'smoke-ratio-model\\nsmoke-percall-model' });
    const jm = (((ja || {}).snapshot || {}).models || []);
    const ratio = jm.filter((m) => m.modelId === 'smoke-ratio-model')[0] || {};
    const percall = jm.filter((m) => m.modelId === 'smoke-percall-model')[0] || {};
    out.jsonPrice = {
      via: ja.web ? ja.web.via || null : null,
      matched: ja.web ? ja.web.matched : null,
      input: (ratio.pricing || {}).input === undefined ? null : ratio.pricing.input,
      output: (ratio.pricing || {}).output === undefined ? null : ratio.pricing.output,
      free: ratio.free,
      percallPricing: percall.pricing || null,
      percallFree: percall.free,
      percallNote: percall.priceNote || '',
    };
    if (out.jsonPrice.via !== 'json') err.push('json: phai doc duoc /api/pricing');
    if (Number(out.jsonPrice.input) !== 0.000008 || Number(out.jsonPrice.output) !== 0.00004) {
      err.push('json: ti le 4 x 5 phai thanh $8 / $40 moi 1M token');
    }
    if (out.jsonPrice.percallPricing !== null || out.jsonPrice.percallFree !== false) {
      err.push('json: model tra theo luot goi khong duoc bia gia token');
    }

    /* Nha cung cap yeu cau dang nhap: phai noi ro ly do chu khong im lang. */
    const nc = await window.notebook.providers.create({
      name: 'Auth Test', kind: 'api', baseUrl: 'http://127.0.0.1:${jsonPort}/v1', authStyle: 'bearer',
    });
    if (!nc.ok) err.push('auth create: ' + nc.error);
    const na = await window.notebook.models.bulkAdd({ providerId: nc.provider.id, text: 'smoke-ratio-model' });
    out.authNeeded = {
      ok: na.web ? na.web.ok : null,
      needAuth: na.web ? !!na.web.needAuth : null,
      triedJson: na.web && na.web.tried ? na.web.tried[0] : '',
      error: (na.web ? na.web.error : '') || '',
    };
    if (!out.authNeeded.needAuth) err.push('auth: bang gia tra 401 phai duoc bao la can dang nhap');
    if (out.authNeeded.error.indexOf('đăng nhập') < 0) err.push('auth: cau loi phai noi ro can dang nhap');

    /* Trang gia dung bang JavaScript: doc TU DONG phai bo qua (de nhanh), con khi
       nguoi dung bam nut “Lay gia tu web” thi phai mo cua so an ma doc. */
    const sc = await window.notebook.providers.create({
      name: 'SPA Test', kind: 'api', baseUrl: 'http://127.0.0.1:${port}/spa', authStyle: 'bearer',
      pricingUrl: 'http://127.0.0.1:${port}/spa',
    });
    if (!sc.ok) err.push('spa create: ' + sc.error);
    const spid = sc.provider.id;
    const sa = await window.notebook.models.bulkAdd({ providerId: spid, text: 'smoke-spa-model' });
    out.spaAuto = { via: sa.web ? sa.web.via || null : null, ok: sa.web ? !!sa.web.ok : null };
    if (out.spaAuto.ok) err.push('spa: doc gia TU DONG khong duoc mo cua so an (phai tra loi ngay)');
    const sw = await window.notebook.models.priceWeb(spid, 'http://127.0.0.1:${port}/spa');
    const swm = (((sw || {}).snapshot || {}).models || []).filter((m) => m.modelId === 'smoke-spa-model')[0] || {};
    out.spaPrice = {
      via: (sw || {}).via || null,
      input: (swm.pricing || {}).input === undefined ? null : swm.pricing.input,
      output: (swm.pricing || {}).output === undefined ? null : swm.pricing.output,
      note: swm.priceNote || '',
    };
    if (out.spaPrice.via !== 'render') err.push('spa: bam nut phai doc duoc bang gia dung bang JavaScript');
    if (Number(out.spaPrice.input) !== 0.000002 || Number(out.spaPrice.output) !== 0.000008) {
      err.push('spa: gia $2/$8 moi 1M phai duoc quy doi dung');
    }
  } catch (e) { out.fatal = String((e && e.message) || e); }
  out.errors = err;
  out.ok = err.length === 0 && !out.fatal;
  return JSON.stringify(out);
})()`;

/* Cua so o kich thuoc NHO NHAT ma app cho phep (1080x680): bang xep hang o Bang
   dieu khien phai co lai theo be rong the, khong duoc tran ngang; va nut nhat ky
   o goc phai phai la quyen nhat ky, khong con so do. */
const SCRIPT_NARROW = `(async () => {
  const out = {};
  const err = [];
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    document.querySelector('.nav-item[data-view="dashboard"]').click();
    await wait(400);
    const t = document.querySelector('#view .table-rank');
    const card = t && t.closest('.card');
    const doc = document.documentElement;
    out.win = { w: window.innerWidth, h: window.innerHeight };
    out.rank = {
      hasTable: !!t,
      rows: t ? t.querySelectorAll('tbody tr').length : 0,
      tableW: t ? Math.round(t.getBoundingClientRect().width) : null,
      cardW: card ? card.clientWidth : null,
      cardOverflow: card ? card.scrollWidth - card.clientWidth : null,
      layout: t ? getComputedStyle(t).tableLayout : null,
      pageOverflow: doc.scrollWidth - doc.clientWidth,
    };
    if (!t) err.push('bang xep hang: khong tim thay bang');
    if (card && out.rank.cardOverflow > 0) {
      err.push('bang xep hang: bang tran ra ngoai the (' + out.rank.cardOverflow + 'px)');
    }
    if (out.rank.pageOverflow > 0) {
      err.push('cua so nho: giao dien tran ngang (' + out.rank.pageOverflow + 'px)');
    }
    if (t && out.rank.layout !== 'fixed') err.push('bang xep hang: cot phai co theo be rong the');
    const jb = document.querySelector('#journalBtn') || {};
    out.journalBtn = {
      ico: (jb.textContent || '').trim(),
      title: jb.title || '',
      badge: document.querySelector('#alertCount') ? 'con' : 'da bo',
    };
    if (out.journalBtn.ico !== '📓') err.push('nut nhat ky: bieu tuong phai la quyen nhat ky');
    if (out.journalBtn.badge !== 'da bo') err.push('nut nhat ky: so do phai duoc bo');
  } catch (e) { out.fatal = String((e && e.message) || e); }
  out.errors = err;
  out.ok = err.length === 0 && !out.fatal;
  return JSON.stringify(out);
})()`;

async function run(win, script) {
  const raw = await win.webContents.executeJavaScript(script, true);
  return JSON.parse(raw);
}

async function main() {
  await app.whenReady();
  await new Promise((r) => setTimeout(r, 2500));
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) {
    console.log('SMOKE_FAIL no window');
    app.exit(1);
    return;
  }
  const report = {};
  try {
    report.ipc = await run(win, SCRIPT_IPC);
  } catch (err) {
    report.ipc = { ok: false, fatal: String((err && err.message) || err) };
  }
  try {
    win.webContents.reload();
    await new Promise((r) => win.webContents.once('did-finish-load', r));
    await new Promise((r) => setTimeout(r, 2500));
    report.ui = await run(win, SCRIPT_UI);
    /* clipboard cá»§a Electron 44 tráº£ Promise, pháº£i await má»›i Ä‘á»c Ä‘Æ°á»£c chá»¯ */
    report.clip = { key: await clipboard.readText() };
    const cui = report.ui;
    report.ui.err = report.ui.err || [];
    if (!cui.copyBtns || !cui.copyBtns.key || !cui.copyBtns.text || !cui.copyBtns.models) {
      report.ui.err.push('copy: thieu nut sao chep trong ngan keo ' + JSON.stringify(cui.copyBtns || null));
    }
    if (report.clip.key !== 'sk-ui-9876543210') {
      report.ui.err.push('copy: clipboard phai la secret cua key vua bam, dang la ' + JSON.stringify(report.clip.key));
    }
    report.ui.ok = report.ui.err.length === 0 && !report.ui.fatal;
  } catch (err) {
    report.ui = { ok: false, fatal: String((err && err.message) || err) };
  }
  try {
    if (win.isMaximized()) win.unmaximize();
    win.setSize(1080, 680);
    await new Promise((r) => setTimeout(r, 700));
    report.narrow = await run(win, SCRIPT_NARROW);
  } catch (err) {
    report.narrow = { ok: false, fatal: String((err && err.message) || err) };
  }
  let srv = null;
  let jsonSrv = null;
  try {
    const started = await startModelServer();
    srv = started.srv;
    const jsonStarted = await startPriceJsonServer();
    jsonSrv = jsonStarted.srv;
    report.discover = await run(win, SCRIPT_DISCOVER(started.port, jsonStarted.port));
  } catch (err) {
    report.discover = { ok: false, fatal: String((err && err.message) || err) };
  } finally {
    if (srv) srv.close();
    if (jsonSrv) jsonSrv.close();
  }
  report.ok = !!(report.ipc.ok && report.ui.ok && report.discover && report.discover.ok && report.narrow && report.narrow.ok);
  console.log('=== SMOKE REPORT ===');
  console.log(JSON.stringify(report, null, 2));
  console.log('=== RENDERER CONSOLE (' + logs.length + ') ===');
  for (const l of logs) console.log(l);
  console.log('=== END ===');
  app.exit(report.ok ? 0 : 2);
}

main().catch((err) => {
  console.log('SMOKE_FAIL ' + (err && err.stack ? err.stack : String(err)));
  app.exit(1);
});
