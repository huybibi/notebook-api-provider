'use strict';

/* app.js — Trạng thái, định tuyến màn hình, xử lý sự kiện. */

(function () {
  const N = window.notebook;
  const U = window.U;
  const V = window.V;
  const T = (k, f) => window.I18N.t(k, f);

  const S = (window.S = {
    snap: null,
    view: 'dashboard',
    query: '',
    sort: { key: 'score', dir: -1 },
    filters: { kind: 'all', bucket: 'all', tag: 'all' },
    groupByBucket: false,
    probe: null,
    playground: { prompt: '', selected: [], results: [], running: false },
    exportOpts: { kind: 'env', includeSecrets: true, onlyUsable: false, requireModels: false },
    exportPreview: '',
  });

  const VIEWS = {
    dashboard: () => V.dashboard(),
    providers: () => V.providers(),
    models: () => V.models(),
    playground: () => V.playground(),
    gateway: () => V.gateway(),
    export: () => V.exportView(),
    journal: () => V.journal(),
    settings: () => V.settings(),
  };

  const TITLES = {
    dashboard: 'dashboard.title',
    providers: 'providers.title',
    models: 'models.title',
    playground: 'playground.title',
    gateway: 'gateway.title',
    export: 'export.title',
    journal: 'journal.title',
    settings: 'settings.title',
  };

  /* ------------------------------------------------------------------ */
  /* Tiện ích                                                            */
  /* ------------------------------------------------------------------ */

  const $ = (sel) => document.querySelector(sel);

  function applySnapshot(snap) {
    if (snap && snap.settings) S.snap = snap;
  }

  function toast(msg, kind, ms) {
    U.toast(msg, kind, ms);
  }

  async function guard(promise, ctx) {
    try {
      return await promise;
    } catch (err) {
      toast((ctx ? ctx + ': ' : '') + (err && err.message ? err.message : String(err)), 'err');
      return null;
    }
  }

  function setPath(obj, path, val) {
    const parts = String(path).split('.');
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      if (typeof cur[parts[i]] !== 'object' || cur[parts[i]] === null) cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = val;
  }

  function render() {
    const snap = S.snap;
    if (!snap) return;

    const viewEl = $('#view');
    /* Vẽ lại view làm mất vị trí cuộn: bấm sao / bật tắt model mà danh sách dài
       thì bị nhảy về đầu. Giữ nguyên chỗ đang xem. */
    const keepScroll = viewEl.scrollTop;
    viewEl.innerHTML = (VIEWS[S.view] || VIEWS.dashboard)();
    viewEl.scrollTop = keepScroll;

    $('#viewTitle').textContent = T(TITLES[S.view] || 'dashboard.title');
    const totals = snap.totals || {};
    const scores = Object.values(snap.scores || {});
    $('#viewSub').textContent =
      S.view === 'dashboard' || S.view === 'providers'
        ? totals.providers +
          ' ' +
          T('kpi.providers').toLowerCase() +
          ' · ' +
          scores.filter((s) => s.usable).length +
          ' ' +
          T('kpi.usable').toLowerCase() +
          ' · ' +
          (totals.keys || 0) +
          ' key · ' +
          (totals.models || 0) +
          ' model'
        : '';

    document.querySelectorAll('.nav-item').forEach((el) => {
      el.classList.toggle('active', el.dataset.view === S.view);
    });
    $('#navCountProviders').textContent = totals.providers || '';
    $('#navCountModels').textContent = totals.models || '';

    const gw = snap.gateway || {};
    $('#gwDot').classList.toggle('on', !!gw.running);
    $('#gatewayDot').classList.toggle('on', !!gw.running);
    $('#gwText').textContent = gw.running ? T('gateway.on') + ' · :' + gw.port : T('gateway.off');
    $('#gwPill').title = gw.url || '';

    $('#langBtn').textContent = window.I18N.get() === 'vi' ? 'VI' : 'EN';
    $('#journalBtn').title = T('nav.journal');
  }

  async function refresh(snap) {
    if (snap) applySnapshot(snap);
    else {
      const s = await guard(N.snapshot(), 'snapshot');
      if (s) applySnapshot(s);
    }
    render();
    if (U.isDrawerOpen() && S.drawerProviderId) {
      U.openDrawer(V.providerDrawer(S.drawerProviderId), true);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Hành động                                                           */
  /* ------------------------------------------------------------------ */

  function qaDetectHtml(d) {
    if (!d.baseUrl) return '<span class="muted-2">' + U.esc(T('qa.needUrl')) + '</span>';
    const bits = ['<b>' + U.esc(d.baseUrl) + '</b>'];
    const nSecret = (d.secrets || (d.secret ? [d.secret] : [])).length;
    bits.push(
      T('qa.key') +
        ': ' +
        (nSecret
          ? '<code>' + U.esc(d.secret.slice(0, 6) + '…' + d.secret.slice(-4)) + '</code>' +
            (nSecret > 1 ? ' <b>+' + (nSecret - 1) + '</b>' : '')
          : '<i>' + T('qa.none') + '</i>')
    );
    bits.push(
      'model: ' +
        (d.models && d.models.length
          ? '<code>' +
            U.esc(d.models.slice(0, 3).join(', ')) +
            (d.models.length > 3 ? ' +' + (d.models.length - 3) : '') +
            '</code>'
          : '<i>' + T('qa.none') + '</i>')
    );
    return T('qa.detected') + ': ' + bits.join(' · ');
  }

  /* Thêm nhà cung cấp chỉ bằng một lần dán: curl hoặc URL endpoint. */
  function openQuickAdd() {
    const back = U.openModal({
      title: T('qa.title'),
      body: V.quickAddForm(),
      wide: true,
      footer:
        '<button class="btn btn-ghost" data-manual="1">' + U.esc(T('qa.manual')) + '</button>' +
        '<button class="btn" data-close="1">' + U.esc(T('action.cancel')) + '</button>' +
        '<button class="btn btn-primary" data-save="1">' + U.esc(T('action.add')) + '</button>',
    });
    const ta = back.querySelector('[data-f="paste"]');
    const nameEl = back.querySelector('[data-f="name"]');
    const epEl = back.querySelector('[data-f="baseUrl"]');
    const box = back.querySelector('#qaDetect');
    let det = V.parseCurl('');
    let epTouched = false;
    const sync = () => {
      det = V.parseCurl(ta.value);
      box.innerHTML = qaDetectHtml(det);
      nameEl.placeholder = det.name || T('qa.namePh');
      if (!epTouched && det.baseUrl) epEl.value = det.baseUrl;
    };
    ta.addEventListener('input', sync);
    ta.addEventListener('paste', () => setTimeout(sync, 0));
    epEl.addEventListener('input', () => {
      epTouched = true;
    });
    sync();
    back.addEventListener('click', async (e) => {
      if (e.target.closest('[data-manual]')) {
        U.closeModal();
        openProviderModal(null);
        return;
      }
      if (!e.target.closest('[data-save]')) return;
      det = V.parseCurl(ta.value);
      const name = nameEl.value.trim() || det.name;
      const baseUrl = V.normalizeBase(epEl.value) || det.baseUrl;
      if (!baseUrl) {
        toast(T('qa.needUrl'), 'err');
        return;
      }
      if (!name) {
        toast(T('c.name') + ' ?', 'err');
        return;
      }
      const res = await guard(
        N.providers.create({ name, baseUrl, kind: det.kind, compat: det.compat, authStyle: det.authStyle }),
        'provider'
      );
      if (!res || res.ok === false) {
        if (res) toast(res.error || 'error', 'err');
        return;
      }
      const pid = (res.provider || {}).id;
      let snap = res.snapshot;
      let nKey = 0;
      let nModel = 0;
      let nPrice = 0;
      if (pid && det.secrets && det.secrets.length) {
        const kr = await guard(
          N.keys.bulkCreate({ providerId: pid, text: det.secrets.join('\n'), labelPrefix: 'Key' }),
          'key'
        );
        if (kr && kr.ok !== false) {
          nKey = typeof kr.added === 'number' ? kr.added : det.secrets.length;
          if (kr.snapshot) snap = kr.snapshot;
        }
      }
      if (pid && det.models.length) {
        const mr = await guard(N.models.bulkAdd({ providerId: pid, text: det.models.join('\n') }), 'model');
        if (mr && mr.ok !== false) {
          nModel = typeof mr.added === 'number' ? mr.added : det.models.length;
          if (mr.snapshot) snap = mr.snapshot;
          if (mr.web && mr.web.ok && mr.web.matched) nPrice = mr.web.matched;
        }
      }
      const auto = back.querySelector('[data-f="autoProbe"]');
      const doProbe = !!(auto && auto.checked);
      U.closeModal();
      toast(
        T('qa.added') + ' ' + name + (nKey ? ' · ' + nKey + ' key' : '') + (nModel ? ' · ' + nModel + ' model' : '') +
          (nPrice ? ' · ' + T('models.priceFromWeb') + ': ' + nPrice : ''),
        'ok'
      );
      await refresh(snap);
      if (pid && doProbe) await probeOne(pid);
    });
  }

  function openProviderModal(id) {
    const p = id ? V.providerById(id) : null;
    const back = U.openModal({
      title: (p ? T('action.edit') + ': ' : T('action.newProvider') + ': ') + (p ? p.name : ''),
      body: V.providerForm(p),
      wide: true,
      footer:
        '<button class="btn" data-close="1">' + U.esc(T('action.cancel')) + '</button>' +
        '<button class="btn btn-primary" data-save="1">' + U.esc(T('action.save')) + '</button>',
    });
    back.addEventListener('click', async (e) => {
      if (!e.target.closest('[data-save]')) return;
      const payload = {};
      back.querySelectorAll('[data-f]').forEach((el) => {
        const k = el.dataset.f;
        if (el.type === 'checkbox') payload[k] = el.checked;
        else if (k === 'priorityBoost' || k === 'qualityManual') payload[k] = Number(el.value) || 0;
        else if (k === 'tags') payload[k] = U.parseTags(el.value);
        else if (k === 'extraHeaders') {
          const txt = el.value.trim();
          if (txt) {
            try {
              payload[k] = JSON.parse(txt);
            } catch (err) {
              toast('extraHeaders: JSON không hợp lệ', 'err');
              return;
            }
          } else payload[k] = {};
        } else payload[k] = el.value;
      });
      if (!payload.name) payload.name = V.deriveName(payload.baseUrl) || '';
      if (!payload.name) {
        toast(T('c.name') + ' ?', 'err');
        return;
      }
      const res = p
        ? await guard(N.providers.update(p.id, payload), 'provider')
        : await guard(N.providers.create(payload), 'provider');
      if (!res || res.ok === false) {
        if (res) toast(res.error || 'error', 'err');
        return;
      }
      U.closeModal();
      toast(T('misc.saved'), 'ok');
      await refresh(res.snapshot);
    });
  }

  function openKeyModal(providerId, key) {
    const back = U.openModal({
      title: (key ? T('action.edit') : T('d.addKey')) + ' · ' + (V.providerById(providerId) || {}).name,
      body: V.keyForm(providerId, key),
      footer:
        '<button class="btn" data-close="1">' + U.esc(T('action.cancel')) + '</button>' +
        '<button class="btn btn-primary" data-save="1">' + U.esc(T('action.save')) + '</button>',
    });
    back.addEventListener('click', async (e) => {
      if (!e.target.closest('[data-save]')) return;
      const label = back.querySelector('[data-f="label"]').value;
      const secret = back.querySelector('[data-f="secret"]').value.trim();
      const enabledEl = back.querySelector('[data-f="enabled"]');
      let res;
      if (key) {
        const patch = { label, enabled: enabledEl ? enabledEl.checked : key.enabled };
        if (secret) patch.secret = secret;
        res = await guard(N.keys.update(key.id, patch), 'key');
      } else {
        res = await guard(N.keys.create({ providerId, label, secret }), 'key');
      }
      if (!res || res.ok === false) {
        if (res) toast(res.error || 'error', 'err');
        return;
      }
      U.closeModal();
      toast(T('misc.saved'), 'ok');
      await refresh(res.snapshot);
    });
  }

  function openBulkModal(providerId, kind) {
    const isKey = kind === 'key';
    const back = U.openModal({
      title: isKey ? T('d.addKeyBulk') : T('c.bulkModels'),
      body:
        '<div class="field"><label>' +
        U.esc(isKey ? T('c.bulkKeys') : T('c.bulkModels')) +
        '</label><textarea data-f="text" style="min-height:180px"></textarea></div>' +
        (isKey
          ? '<div class="field"><label>' + U.esc(T('c.label')) + '</label><input type="text" data-f="labelPrefix" value="Key"></div>'
          : ''),
      footer:
        '<button class="btn" data-close="1">' + U.esc(T('action.cancel')) + '</button>' +
        '<button class="btn btn-primary" data-save="1">' + U.esc(T('action.add')) + '</button>',
    });
    back.addEventListener('click', async (e) => {
      if (!e.target.closest('[data-save]')) return;
      const text = back.querySelector('[data-f="text"]').value;
      const labelPrefix = isKey ? back.querySelector('[data-f="labelPrefix"]').value : '';
      const res = isKey
        ? await guard(N.keys.bulkCreate({ providerId, text, labelPrefix }), 'keys')
        : await guard(N.models.bulkAdd({ providerId, text }), 'models');
      if (!res || res.ok === false) {
        if (res) toast(res.error || 'error', 'err');
        return;
      }
      U.closeModal();
      toast(isKey ? '+' + res.added + ' key (' + res.dup + ' trùng)' : '+' + res.added + ' model', 'ok');
      await refresh(res.snapshot);
      if (!isKey && res.web && res.web.ok && res.web.matched) {
        toast(T('models.priceFromWeb') + ': ' + res.web.matched, 'ok');
      }
    });
  }

  function openPresetModal() {
    const back = U.openModal({
      title: T('pr.title'),
      wide: true,
      body:
        '<div class="field"><input type="text" id="presetSearch" placeholder="' +
        U.esc(T('pr.search')) +
        '"></div><p class="tiny muted-2">' +
        U.esc(T('pr.hint')) +
        '</p><div id="presetBox">' +
        V.presetPicker('') +
        '</div>',
      footer: '<button class="btn" data-close="1">' + U.esc(T('action.close')) + '</button>',
    });
    const box = back.querySelector('#presetBox');
    const search = back.querySelector('#presetSearch');
    search.addEventListener(
      'input',
      U.debounce(() => {
        box.innerHTML = V.presetPicker(search.value);
      }, 150)
    );
    box.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-act="preset-pick"]');
      if (!btn) return;
      const res = await guard(N.providers.addPresets([btn.dataset.key]), 'preset');
      if (!res || res.ok === false) {
        if (res) toast(res.error || 'error', 'err');
        return;
      }
      applySnapshot(res.snapshot);
      const n = Array.isArray(res.created) ? res.created.length : Number(res.created) || 0;
      box.innerHTML = V.presetPicker(search.value);
      toast('+' + n, 'ok');
      render();
    });
  }

  async function probeOne(providerId) {
    const p = V.providerById(providerId);
    showProbeBar(T('action.probe') + ' ' + (p ? p.name : '') + '…');
    const res = await guard(N.probe.provider({ providerId }), 'probe');
    hideProbeBar();
    if (!res) return;
    /* refresh() vẽ lại cả ngăn kéo, nếu không bảng “Lần đo gần đây” vẫn là bản cũ. */
    await refresh(res.snapshot);
    const ok = (res.results || []).filter((r) => r.ok).length;
    toast(
      (p ? p.name : '') +
        ': ' +
        ok +
        '/' +
        (res.results || []).length +
        ' key OK' +
        (res.chat ? ' · chat ' + (res.chat.ok ? U.fmtMs(res.chat.latencyMs) : T('err.' + (res.chat.errorKind || 'error'))) : ''),
      ok ? 'ok' : 'warn'
    );
  }

  async function probeAll() {
    showProbeBar(T('action.probeAll') + '…');
    S.probe = { done: 0, total: 0 };
    const res = await guard(N.probe.all({}), 'probe all');
    hideProbeBar();
    S.probe = null;
    if (!res) return;
    await refresh(res.snapshot);
    toast(T('action.probeAll') + ': ' + (res.results || []).length + ' ' + T('kpi.providers').toLowerCase(), 'ok');
  }

  function showProbeBar(text) {
    $('#probeBar').hidden = false;
    $('#probeText').textContent = text;
    $('#probeProgress').style.width = '5%';
  }
  function hideProbeBar() {
    $('#probeBar').hidden = true;
    $('#probeProgress').style.width = '0';
  }

  const ACTS = {
    nav: (el) => {
      S.view = el.dataset.view;
      closeDrawerIfOther();
      render();
      $('#view').scrollTop = 0;
    },
    'new-provider': () => openQuickAdd(),
    'open-presets': () => openPresetModal(),
    'probe-all': () => probeAll(),
    'probe-one': (el) => probeOne(el.dataset.id),
    'toggle-lang': async () => {
      const next = window.I18N.get() === 'vi' ? 'en' : 'vi';
      const res = await guard(N.settings.set({ language: next }), 'language');
      window.I18N.set(next);
      if (res) applySnapshot(res);
      render();
    },
    'provider-open': (el) => {
      S.drawerProviderId = el.dataset.id;
      U.openDrawer(V.providerDrawer(el.dataset.id));
    },
    'drawer-close': () => {
      S.drawerProviderId = null;
      U.closeDrawer();
    },
    'provider-edit': (el) => openProviderModal(el.dataset.id),
    'provider-duplicate': async (el) => {
      const res = await guard(N.providers.duplicate(el.dataset.id), 'duplicate');
      if (res && res.ok) {
        toast(T('misc.saved'), 'ok');
        await refresh(res.snapshot);
      } else if (res) toast(res.error || 'error', 'err');
    },
    'provider-toggle': async (el) => {
      const res = await guard(N.providers.update(el.dataset.id, { enabled: el.dataset.on === '1' }), 'provider');
      if (res && res.ok) await refresh(res.snapshot);
    },
    'provider-pin': async (el) => {
      const res = await guard(N.providers.update(el.dataset.id, { pinned: el.dataset.on === '1' }), 'provider');
      if (res && res.ok) await refresh(res.snapshot);
    },
    'provider-delete': async (el) => {
      const p = V.providerById(el.dataset.id);
      if (!(await U.confirmDialog((p ? p.name + ' — ' : '') + T('misc.confirmDelete'), true))) return;
      const res = await guard(N.providers.remove(el.dataset.id), 'delete');
      if (res && res.ok) {
        S.drawerProviderId = null;
        U.closeDrawer();
        toast(T('action.delete') + ' OK', 'ok');
        await refresh(res.snapshot);
      }
    },
    'provider-more': (el) => {
      S.drawerProviderId = el.dataset.id;
      U.openDrawer(V.providerDrawer(el.dataset.id));
    },
    'key-add': (el) => openKeyModal(el.dataset.pid, null),
    'key-bulk': (el) => openBulkModal(el.dataset.pid, 'key'),
    'key-edit': (el) => {
      const k = V.keyById(el.dataset.id);
      if (k) openKeyModal(k.providerId, k);
    },
    'key-toggle': async (el) => {
      const res = await guard(N.keys.update(el.dataset.id, { enabled: el.dataset.on === '1' }), 'key');
      if (res && res.ok) await refresh(res.snapshot);
    },
    'key-delete': async (el) => {
      if (!(await U.confirmDialog(T('misc.confirmDelete'), true))) return;
      const res = await guard(N.keys.remove(el.dataset.id), 'key');
      if (res && res.ok) await refresh(res.snapshot);
    },
    'key-cool': async (el) => {
      const res = await guard(N.keys.resetCooldown(el.dataset.id), 'cooldown');
      if (res && res.ok) await refresh(res.snapshot);
    },
    'key-reveal': async (el) => {
      const res = await guard(N.keys.reveal(el.dataset.id), 'reveal');
      if (!res || res.ok === false) {
        if (res) toast(res.error || 'error', 'err');
        return;
      }
      U.openModal({
        title: T('c.secret'),
        body:
          '<pre class="code">' + U.esc(res.secret) + '</pre>' +
          '<div class="row mt"><button class="btn btn-primary" data-copy="1">' +
          U.esc(T('action.copy')) +
          '</button></div>',
      }).addEventListener('click', (e) => {
        if (e.target.closest('[data-copy]')) U.copy(res.secret);
      });
    },
    /* Sao chép key không cần mở hộp thoại hiện secret: tiến trình chính giải mã
       rồi ghi thẳng vào clipboard. */
    'key-copy': async (el) => {
      const res = await guard(N.keys.copy(el.dataset.id), 'copy');
      if (!res || res.ok === false) {
        if (res) toast(res.error || 'error', 'err');
        return;
      }
      toast(T('copy.key') + (res.label ? ' · ' + res.label : ''), 'ok');
    },
    /* Sao chép mọi thứ dạng chữ: endpoint, model id… */
    'copy-text': (el) => U.copy(el.dataset.text, el.dataset.msg ? T(el.dataset.msg) : undefined),
    'copy-models': (el) => {
      const all = V.allModels().filter((m) => m.providerId === el.dataset.id);
      const on = all.filter((m) => m.enabled !== false);
      const use = on.length ? on : all;
      if (!use.length) {
        toast(T('d.noModels'), 'err');
        return null;
      }
      return U.copy(use.map((m) => m.modelId).join('\n'), T('copy.models') + ' · ' + use.length);
    },
    'model-add': (el) => openBulkModal(el.dataset.pid, 'model'),
    'model-bulk': (el) => openBulkModal(el.dataset.pid, 'model'),
    'model-toggle': async (el) => {
      const m = V.modelById(el.dataset.id);
      if (!m) return;
      const res = await guard(N.models.update(m.id, { enabled: m.enabled === false }), 'model');
      if (res && res.ok) await refresh(res.snapshot);
    },
    'model-delete': async (el) => {
      const res = await guard(N.models.remove(el.dataset.id), 'model');
      if (res && res.ok) await refresh(res.snapshot);
    },
    'model-edit': (el) => {
      const m = V.modelById(el.dataset.id);
      if (!m) return;
      const freeVal = m.free === true ? 'true' : m.free === false ? 'false' : 'null';
      const opt = (v, label) => '<option value="' + v + '"' + (freeVal === v ? ' selected' : '') + '>' + U.esc(label) + '</option>';
      const back = U.openModal({
        title: T('c.modelId') + ': ' + m.modelId,
        body:
          '<div class="field"><label>' + U.esc(T('c.displayName')) + '</label><input type="text" data-f="displayName" value="' +
          U.esc(m.displayName || m.modelId) + '"></div>' +
          '<div class="field"><label>' + U.esc(T('c.contextWindow')) + '</label><input type="number" data-f="contextWindow" value="' +
          U.esc(String(m.contextWindow || '')) + '"></div>' +
          '<div class="field"><label>' + U.esc(T('models.price')) + '</label><select data-f="free">' +
          opt('null', T('models.priceUnknown')) + opt('true', T('models.freeTag')) + opt('false', T('models.paidTag')) +
          '</select></div>' +
          '<label class="check mb"><input type="checkbox" data-f="favorite"' + (m.favorite ? ' checked' : '') + '>' + U.esc(T('models.favorite')) + '</label>' +
          '<label class="check"><input type="checkbox" data-f="enabled"' + (m.enabled !== false ? ' checked' : '') + '>' + U.esc(T('c.enabled')) + '</label>',
        footer:
          '<button class="btn" data-close="1">' + U.esc(T('action.cancel')) + '</button>' +
          '<button class="btn btn-primary" data-save="1">' + U.esc(T('action.save')) + '</button>',
      });
      back.addEventListener('click', async (e) => {
        if (!e.target.closest('[data-save]')) return;
        const fv = back.querySelector('[data-f="free"]').value;
        const patch = {
          displayName: back.querySelector('[data-f="displayName"]').value,
          contextWindow: Number(back.querySelector('[data-f="contextWindow"]').value) || null,
          free: fv === 'true' ? true : fv === 'false' ? false : null,
          favorite: back.querySelector('[data-f="favorite"]').checked,
          enabled: back.querySelector('[data-f="enabled"]').checked,
        };
        const res = await guard(N.models.update(m.id, patch), 'model');
        if (res && res.ok) {
          U.closeModal();
          await refresh(res.snapshot);
        }
      });
    },
    'model-fav': async (el) => {
      const on = el.dataset.on !== '1';
      const res = await guard(N.models.update(el.dataset.id, { favorite: on }), 'model');
      if (res && res.ok) await refresh(res.snapshot);
    },
    'model-discover': async (el) => {
      const res = await guard(N.models.discover(el.dataset.pid), 'model');
      if (!res) return;
      if (!res.ok) {
        U.toast(res.error || '…', 'err');
        return;
      }
      if (res.snapshot) await refresh(res.snapshot);
      const bits = ['+' + res.added];
      if (res.existing) bits.push(res.existing + ' ' + T('models.alreadyHave'));
      if (res.priced) bits.push(res.priced + ' ' + T('models.withPrice'));
      U.toast(bits.join(' · '), 'ok');
    },
    'price-web': async (el) => {
      const res = await guard(N.models.priceWeb(el.dataset.pid), 'model');
      if (!res) return;
      if (!res.ok) {
        U.toast(res.error || '…', 'err');
        return;
      }
      if (res.snapshot) await refresh(res.snapshot);
      const via = res.via === 'json' ? T('models.viaJson') : res.via === 'render' ? T('models.viaRender') : T('models.viaHtml');
      U.toast(via + ' · ' + res.matched + '/' + (res.priced || 0) + (res.freeCount ? ' · ' + res.freeCount + ' ' + T('models.freeTag') : ''), 'ok');
    },
    'models-enable': async (el) => {
      const res = await guard(N.models.setAllEnabled(el.dataset.pid, el.dataset.on === '1'), 'models');
      if (res && res.ok) await refresh(res.snapshot);
    },
    sort: (el) => {
      if (S.sort.key === el.dataset.key) S.sort.dir = -S.sort.dir;
      else S.sort = { key: el.dataset.key, dir: -1 };
      render();
    },
    'group-toggle': (el) => {
      S.groupByBucket = el.checked;
      render();
    },
    'play-toggle': (el) => {
      const id = el.dataset.id;
      const i = S.playground.selected.indexOf(id);
      if (i >= 0) S.playground.selected.splice(i, 1);
      else S.playground.selected.push(id);
      render();
    },
    'play-all': () => {
      S.playground.selected = V.providerList()
        .filter((p) => (V.scoreOf(p.id) || {}).usable)
        .map((p) => p.id);
      render();
    },
    'play-none': () => {
      S.playground.selected = [];
      render();
    },
    'play-run': () => playRun(),
    'gw-start': async () => {
      const res = await guard(N.gateway.start(), 'gateway');
      if (res) {
        toast(T('gateway.on'), 'ok');
        await refresh();
      }
    },
    'gw-stop': async () => {
      await guard(N.gateway.stop(), 'gateway');
      toast(T('gateway.off'), 'warn');
      await refresh();
    },
    'gw-copy-url': () => {
      const gw = S.snap.gateway || {};
      if (gw.url) U.copy(gw.url);
    },
    'open-data-folder': () => guard(N.openDataFolder(), 'folder'),
    'open-link': (el) => guard(N.openExternal(el.dataset.url), 'link'),
    'alerts-seen': async () => {
      const res = await guard(N.alerts.markSeen(), 'alerts');
      if (res && res.snapshot) await refresh(res.snapshot);
      else await refresh();
    },
    'alerts-clear': async () => {
      const res = await guard(N.alerts.clear(), 'alerts');
      if (res && res.snapshot) await refresh(res.snapshot);
      else await refresh();
    },
    'export-preview': () => exportPreview(),
    'export-save': async () => {
      const res = await guard(N.exporter.save(S.exportOpts.kind, S.exportOpts), 'export');
      if (res && res.ok) toast(T('ex.saveOk') + ': ' + res.filePath, 'ok');
      else if (res && res.canceled) toast(T('action.cancel'), 'warn');
    },
    backup: async () => {
      const res = await guard(N.exporter.save('vault', {}), 'backup');
      if (res && res.ok) toast(T('ex.saveOk') + ': ' + res.filePath, 'ok');
    },
    restore: async () => {
      if (!(await U.confirmDialog(T('export.restore') + ' — ' + T('misc.confirmDelete'), true))) return;
      const res = await guard(N.exporter.restore(), 'restore');
      if (res && res.ok) {
        toast(T('misc.saved'), 'ok');
        await refresh(res.snapshot);
      } else if (res && res.error) toast(res.error, 'err');
    },
    'journal-add': async () => {
      const text = ($('#jrText') || {}).value || '';
      if (!text.trim()) return;
      const providerId = ($('#jrProvider') || {}).value || null;
      const res = await guard(N.journal.add({ text, providerId }), 'journal');
      if (res && res.ok !== false) await refresh(res.snapshot || res);
    },
    'journal-delete': async (el) => {
      const res = await guard(N.journal.remove(el.dataset.id), 'journal');
      if (res && res.ok !== false) await refresh(res.snapshot || res);
    },
    'reset-all': async () => {
      if (!(await U.confirmDialog(T('settings.resetAllHint') + ' ' + T('misc.confirmDelete'), true))) return;
      const ids = (S.snap.providers || []).map((p) => p.id);
      if (!ids.length) return;
      let last = null;
      for (const id of ids) {
        const res = await guard(N.providers.remove(id), 'reset');
        if (res && res.ok) last = res.snapshot;
      }
      S.drawerProviderId = null;
      U.closeDrawer();
      toast(T('action.delete') + ': ' + ids.length, 'ok');
      await refresh(last);
    },
  };

  function closeDrawerIfOther() {
    /* giữ drawer khi điều hướng trong cùng ngữ cảnh provider */
    if (S.view !== 'providers' && S.view !== 'models') {
      S.drawerProviderId = null;
      U.closeDrawer();
    }
  }

  async function exportPreview() {
    const res = await guard(N.exporter.preview(S.exportOpts.kind, S.exportOpts), 'export');
    if (!res || res.ok === false) return;
    S.exportPreview = res.content;
    const pre = $('#exportPreview');
    if (pre) pre.textContent = res.content || '(rỗng)';
    const meta = $('#exportMeta');
    if (meta) meta.textContent = res.name + ' · ' + U.fmtNum(res.bytes) + 'B';
  }

  /* ------------------------------------------------------------------ */
  /* So sánh qua cổng nội bộ                                             */
  /* ------------------------------------------------------------------ */

  async function playRun() {
    const gw = S.snap.gateway || {};
    if (!gw.running) {
      toast(T('playground.needGateway'), 'warn');
      return;
    }
    const promptEl = $('#pgPrompt');
    const prompt = promptEl ? promptEl.value.trim() : '';
    if (!prompt) {
      toast(T('playground.prompt') + ' ?', 'warn');
      return;
    }
    const picked = S.playground.selected.slice();
    if (!picked.length) {
      toast(T('pg.noProvider'), 'warn');
      return;
    }
    S.playground.prompt = prompt;
    S.playground.running = true;
    S.playground.results = [];
    render();

    const base = String(gw.url || '').replace(/\/v1\/?$/, '');
    const results = await Promise.all(
      picked.map(async (pid) => {
        const p = V.providerById(pid);
        const model =
          V.modelsOf(pid).find((m) => m.enabled !== false && m.favorite) ||
          V.modelsOf(pid).find((m) => m.enabled !== false);
        const out = {
          providerId: pid,
          name: p ? p.name : pid,
          model: model ? model.modelId : '',
          ok: false,
          latencyMs: 0,
          text: '',
          message: '',
          errorKind: null,
          usage: null,
        };
        if (!model) {
          out.message = T('d.noModels');
          out.errorKind = 'config';
          return out;
        }
        const started = Date.now();
        try {
          const res = await fetch(base + '/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: pid + '/' + model.modelId,
              messages: [{ role: 'user', content: prompt }],
              max_tokens: 512,
              stream: false,
            }),
          });
          out.latencyMs = Date.now() - started;
          const text = await res.text();
          let json = null;
          try {
            json = JSON.parse(text);
          } catch (err) {
            /* giữ text thô */
          }
          if (res.ok && json) {
            const choice = (json.choices || [])[0] || {};
            out.text = (choice.message && choice.message.content) || choice.text || '';
            out.usage = json.usage || null;
            out.ok = !!out.text;
            if (!out.ok) out.message = JSON.stringify(json).slice(0, 400);
          } else {
            out.message = (json && (json.error ? json.error.message || JSON.stringify(json.error) : JSON.stringify(json))) || text.slice(0, 400);
            out.errorKind = json && json.error && json.error.type ? String(json.error.type) : 'server_error';
          }
        } catch (err) {
          out.latencyMs = Date.now() - started;
          out.message = err && err.message ? err.message : String(err);
          out.errorKind = 'network';
        }
        return out;
      })
    );

    S.playground.results = results;
    S.playground.running = false;
    render();
    const fresh = await guard(N.snapshot(), 'snapshot');
    if (fresh) applySnapshot(fresh);
    render();
  }

  /* ------------------------------------------------------------------ */
  /* Sự kiện                                                             */
  /* ------------------------------------------------------------------ */

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    if (el.tagName === 'SELECT' || el.tagName === 'INPUT') return;
    const fn = ACTS[act];
    if (!fn) return;
    e.preventDefault();
    if (el.disabled) return;
    Promise.resolve(fn(el)).catch((err) => toast(String(err && err.message ? err.message : err), 'err'));
  });

  document.addEventListener('change', async (e) => {
    const el = e.target;

    /* --- cài đặt (data-set) --- */
    if (el.dataset && el.dataset.set) {
      const path = el.dataset.set;
      const type = el.dataset.setType;
      let val = el.type === 'checkbox' ? el.checked : el.value;
      if (type === 'number') val = Number(el.value) || 0;
      if (el.type === 'range') {
        const span = el.closest('.weight-row');
        if (span) {
          const w = span.querySelector('.wval');
          if (w) w.textContent = el.value;
        }
      }
      const patch = {};
      setPath(patch, path, val);
      const res = await guard(N.settings.set(patch), 'settings');
      if (res) {
        applySnapshot(res);
        if (path === 'language') {
          window.I18N.set(val);
          render();
        } else if (S.view === 'gateway' || path.indexOf('gateway') === 0) {
          render();
        }
      }
      return;
    }

    /* --- trường nhà cung cấp trong drawer --- */
    if (el.dataset && el.dataset.act === 'provider-field') {
      const key = el.dataset.key;
      let val = el.value;
      if (key === 'tags') val = U.parseTags(val);
      if (key === 'qualityManual' || key === 'priorityBoost') val = Number(val) || 0;
      const res = await guard(N.providers.update(el.dataset.id, { [key]: val }), 'provider');
      if (res && res.ok) await refresh(res.snapshot);
      return;
    }

    if (el.dataset && el.dataset.act === 'quota-set') {
      const key = el.dataset.key;
      let val = el.value;
      if (key === 'amount' || key === 'windowDays' || key === 'manualUsed') val = Number(val) || 0;
      if (key === 'expiresAt') val = val || null;
      const res = await guard(
        N.providers.update(el.dataset.pid, { quota: { [key]: val } }),
        'quota'
      );
      if (res && res.ok) await refresh(res.snapshot);
      return;
    }

    if (el.dataset && el.dataset.act === 'filter') {
      S.filters[el.dataset.key] = el.value;
      render();
      return;
    }

    if (el.dataset && el.dataset.act === 'group-toggle') return;

    if (el.dataset && el.dataset.act === 'export-kind') {
      S.exportOpts.kind = el.value;
      await exportPreview();
      return;
    }

    if (el.dataset && el.dataset.act === 'export-opt') {
      S.exportOpts[el.dataset.key] = el.checked;
      return;
    }
  });

  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el.type === 'range' && el.dataset && el.dataset.set) {
      const row = el.closest('.weight-row');
      if (row) {
        const w = row.querySelector('.wval');
        if (w) w.textContent = el.value;
      }
    }
    if (el.id === 'search') {
      S.query = el.value;
      render();
    }
  });

  /* ------------------------------------------------------------------ */
  /* Khởi động                                                           */
  /* ------------------------------------------------------------------ */

  async function boot() {
    if (!N) {
      const box = $('#loadError');
      box.hidden = false;
      box.textContent = 'Không kết nối được preload (window.notebook thiếu).';
      return;
    }
    const snap = await guard(N.snapshot(), 'snapshot');
    if (!snap) return;
    applySnapshot(snap);
    window.I18N.set(snap.settings.language || 'vi');
    S.view = snap.settings.ui && snap.settings.ui.defaultView ? snap.settings.ui.defaultView : 'dashboard';
    S.playground.selected = V.providerList()
      .filter((p) => (V.scoreOf(p.id) || {}).usable)
      .slice(0, 3)
      .map((p) => p.id);
    render();

    const search = $('#search');
    search.addEventListener(
      'input',
      U.debounce(() => {
        S.query = search.value;
        render();
      }, 160)
    );

    N.onProbeProgress((p) => {
      if (p && p.scope === 'all') {
        showProbeBar(T('action.probeAll') + ' ' + p.done + '/' + p.total);
        $('#probeProgress').style.width = (p.total ? Math.round((p.done / p.total) * 100) : 0) + '%';
      } else if (p) {
        const prov = V.providerById(p.providerId);
        showProbeBar((prov ? prov.name : '') + ' · ' + (p.step || ''));
      }
    });

    N.onMenuProbeAll(() => probeAll());

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (U.isDrawerOpen()) {
          S.drawerProviderId = null;
          U.closeDrawer();
        } else U.closeModal();
      }
      if (e.key === 'F5' || (e.ctrlKey && e.key.toLowerCase() === 'r')) {
        e.preventDefault();
        refresh();
      }
    });

    window.LOADED = true;
  }

  boot().catch((err) => {
    const box = $('#loadError');
    box.hidden = false;
    box.textContent = 'Lỗi khởi động: ' + (err && err.message ? err.message : String(err));
  });
})();
