'use strict';

/* util.js — Tiện ích DOM, định dạng, modal, toast, drawer. */

(function () {
  const t = (k, f) => window.I18N.t(k, f);

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fmtNum(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return '—';
    if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(v % 1e9 === 0 ? 0 : 2) + 'B';
    if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(v % 1e6 === 0 ? 0 : 2) + 'M';
    if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(v % 1e3 === 0 ? 0 : 1) + 'K';
    return String(v);
  }

  function fmtMs(n) {
    const v = Number(n);
    if (!Number.isFinite(v) || v <= 0) return '—';
    if (v < 1000) return Math.round(v) + 'ms';
    return (v / 1000).toFixed(v < 10000 ? 2 : 1) + 's';
  }

  function fmtInt(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return '—';
    return v.toLocaleString('vi-VN');
  }

  function timeAgo(iso) {
    if (!iso) return t('misc.never');
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 0) return new Date(iso).toLocaleString();
    const s = Math.floor(ms / 1000);
    if (s < 60) return t('misc.justNow');
    const m = Math.floor(s / 60);
    if (m < 60) return m + ' ' + t('misc.minutesAgo');
    const h = Math.floor(m / 60);
    if (h < 24) return h + ' ' + t('misc.hoursAgo');
    const d = Math.floor(h / 24);
    if (d < 30) return d + ' ' + t('misc.daysAgo');
    return new Date(iso).toLocaleDateString();
  }

  function fmtDateTime(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleString();
  }

  function gradeClass(g) {
    return g ? 'grade-' + g : 'grade-na';
  }

  function gradeText(g) {
    return g ? g + ' · ' + t('grade.' + g) : '—';
  }

  function bucketChip(b) {
    const cls =
      b === 'workhorse' || b === 'lightning' || b === 'local_free'
        ? 'chip chip-ok'
        : b === 'dead' || b === 'exhausted'
        ? 'chip chip-err'
        : b === 'unstable' || b === 'rate_limited' || b === 'no_key'
        ? 'chip chip-warn'
        : b === 'premium'
        ? 'chip chip-accent'
        : 'chip';
    return '<span class="' + cls + '">' + esc(t('bucket.' + b, b)) + '</span>';
  }

  function stateChip(status) {
    const map = {
      ok: 'chip chip-ok',
      invalid: 'chip chip-err',
      'rate-limited': 'chip chip-warn',
      'quota-exhausted': 'chip chip-err',
      error: 'chip chip-warn',
      unknown: 'chip',
    };
    const s = status || 'unknown';
    return '<span class="' + (map[s] || 'chip') + '">' + esc(t('state.' + s, s)) + '</span>';
  }

  function quotaText(quota) {
    if (!quota) return '—';
    if (quota.unlimited) return t('quota.' + quota.type, quota.type);
    if (!quota.known || quota.limit == null) return t('quota.' + (quota.type || 'unknown'), 'chưa rõ');
    const used = quota.unit === 'requests' ? quota.used : quota.used;
    return fmtNum(used) + ' / ' + fmtNum(quota.limit) + ' ' + (quota.unit === 'requests' ? 'req' : 'token');
  }

  function quotaBar(quota) {
    if (!quota) return '<span class="muted-2 tiny">—</span>';
    if (quota.unlimited) {
      return (
        '<div class="pbar"><span class="chip chip-ok">' +
        esc(t('quota.' + quota.type, quota.type)) +
        '</span></div>'
      );
    }
    if (!quota.known || quota.headroom == null) {
      return (
        '<div class="pbar"><span class="muted-2">' +
        esc(t('quota.' + (quota.type || 'unknown'), 'chưa rõ')) +
        '</span></div>'
      );
    }
    const left = Math.round(quota.headroom * 100);
    const cls = left <= 10 ? 'bar err' : left <= 35 ? 'bar warn' : 'bar';
    return (
      '<div class="pbar"><div class="' +
      cls +
      '" style="flex:1"><i style="width:' +
      left +
      '%"></i></div><span>' +
      left +
      '%</span></div>'
    );
  }

  function sparkline(hourly) {
    if (!hourly) return '';
    const bars = [];
    for (let h = 23; h >= 0; h--) {
      const v = hourly[h] || 0;
      bars.push('<i style="height:' + Math.max(8, Math.min(100, v * 22)) + '%"></i>');
    }
    return '<div class="spark" title="24 giờ gần nhất">' + bars.join('') + '</div>';
  }

  function toast(message, kind, ms) {
    const root = document.getElementById('toastRoot');
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.textContent = message;
    root.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity .2s, transform .2s';
      el.style.opacity = '0';
      el.style.transform = 'translateY(6px)';
      setTimeout(() => el.remove(), 220);
    }, ms || (kind === 'err' ? 6500 : 3200));
  }

  /* -------------------------------- modal -------------------------------- */

  let modalEl = null;

  function openModal(opts) {
    closeModal();
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML =
      '<div class="modal' +
      (opts.wide ? ' wide' : '') +
      '">' +
      '<div class="modal-head"><h2>' +
      esc(opts.title || '') +
      '</h2><div class="spacer"></div><button class="drawer-close" data-close="1">✕</button></div>' +
      '<div class="modal-body">' +
      (opts.body || '') +
      '</div>' +
      (opts.footer === null
        ? ''
        : '<div class="modal-foot">' +
          (opts.footer ||
            '<button class="btn" data-close="1">' +
              esc(t('action.cancel')) +
              '</button>') +
          '</div>') +
      '</div>';
    /* Chỉ đóng khi bấm và nhả chuột đều ở nền mờ: bôi đen chữ trong ô nhập rồi
       kéo chuột ra ngoài không được làm đóng hộp thoại. */
    back.dataset.backdown = '0';
    back.addEventListener('mousedown', (e) => {
      back.dataset.backdown = e.target === back ? '1' : '0';
    });
    back.addEventListener('click', (e) => {
      if (e.target === back && back.dataset.backdown === '1') closeModal();
      const closer = e.target.closest('[data-close]');
      if (closer) closeModal();
    });
    document.getElementById('modalRoot').appendChild(back);
    modalEl = back;
    const focusable = back.querySelector('input,textarea,select');
    if (focusable) setTimeout(() => focusable.focus(), 30);
    return back;
  }

  function closeModal() {
    const root = document.getElementById('modalRoot');
    if (root) root.innerHTML = '';
    modalEl = null;
  }

  function confirmDialog(message, danger) {
    return new Promise((resolve) => {
      const back = openModal({
        title: t('action.confirm'),
        body: '<p style="margin:0 0 4px">' + esc(message) + '</p>',
        footer:
          '<button class="btn" data-close="1">' +
          esc(t('action.cancel')) +
          '</button>' +
          '<button class="btn ' +
          (danger ? 'btn-danger' : 'btn-primary') +
          '" data-confirm="1">' +
          esc(t('action.confirm')) +
          '</button>',
      });
      back.addEventListener('click', (e) => {
        if (e.target.closest('[data-confirm]')) {
          closeModal();
          resolve(true);
        } else if (e.target.closest('[data-close]') || (e.target === back && back.dataset.backdown === '1')) {
          resolve(false);
        }
      });
    });
  }

  /* -------------------------------- drawer -------------------------------- */

  function openDrawer(html, keepScroll) {
    const d = document.getElementById('drawer');
    /* Phần cuộn được của ngăn kéo là .drawer-body, không phải #drawer. */
    const prevEl = d.querySelector('.drawer-body');
    const prev = keepScroll && prevEl ? prevEl.scrollTop : 0;
    d.innerHTML = html;
    d.hidden = false;
    const nextEl = d.querySelector('.drawer-body');
    if (nextEl) nextEl.scrollTop = prev;
  }

  function closeDrawer() {
    const d = document.getElementById('drawer');
    d.hidden = true;
    d.innerHTML = '';
  }

  function isDrawerOpen() {
    return !document.getElementById('drawer').hidden;
  }

  function debounce(fn, ms) {
    let timer = null;
    return function () {
      const args = arguments;
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(null, args), ms || 180);
    };
  }

  async function copy(text, okMessage) {
    let ok = false;
    try {
      const res = await window.notebook.clipboard.write(text);
      ok = !!(res && res.ok);
    } catch (_) {
      ok = false;
    }
    toast(ok ? okMessage || t('action.copied') : t('copy.failed', 'Không sao chép được'), ok ? 'ok' : 'err');
    return ok;
  }

  function parseTags(str) {
    return String(str || '')
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function statusClass(ok) {
    return ok ? 'chip chip-ok' : 'chip chip-err';
  }

  window.U = {
    esc,
    fmtNum,
    fmtMs,
    fmtInt,
    timeAgo,
    fmtDateTime,
    gradeClass,
    gradeText,
    bucketChip,
    stateChip,
    quotaText,
    quotaBar,
    sparkline,
    toast,
    openModal,
    closeModal,
    confirmDialog,
    openDrawer,
    closeDrawer,
    isDrawerOpen,
    debounce,
    copy,
    parseTags,
    statusClass,
  };
})();
