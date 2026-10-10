'use strict';

/* views.js — Dựng HTML cho toàn bộ màn hình, drawer và form.
   Quy ước: hàm trả về CHUỖI HTML; mọi tương tác đi qua thuộc tính data-act. */

(function () {
  const t = (k, f) => window.I18N.t(k, f);
  const U = window.U;
  const E = U.esc;

  /* ------------------------------------------------------------------ */
  /* Từ vựng bổ sung (gộp vào từ điển của i18n.js)                       */
  /* ------------------------------------------------------------------ */

  const EXTRA = {
    vi: {
      'c.name': 'Tên',
      'c.endpoint': 'Endpoint',
      'c.kind': 'Loại',
      'c.category': 'Nhóm',
      'c.compat': 'Kiểu API',
      'c.auth': 'Kiểu xác thực',
      'c.baseUrl': 'Base URL',
      'c.modelsPath': 'Đường dẫn danh sách model',
      'c.chatPath': 'Đường dẫn chat',
      'c.homepage': 'Trang chủ',
      'c.docsUrl': 'Tài liệu',
      'c.notes': 'Ghi chú',
      'c.tags': 'Nhãn (cách nhau bằng dấu phẩy)',
      'c.quality': 'Chất lượng bạn tự chấm (1–5)',
      'c.priority': 'Cộng thêm ưu tiên',
      'c.enabled': 'Đang bật',
      'c.pinned': 'Ghim lên đầu',
      'c.actions': 'Thao tác',
      'c.status': 'Trạng thái',
      'c.label': 'Nhãn',
      'c.secret': 'API key',
      'c.weight': 'Trọng số',
      'c.modelId': 'Model id',
      'c.displayName': 'Tên hiển thị',
      'c.contextWindow': 'Context window',
      'c.source': 'Nguồn',
      'c.lastChecked': 'Kiểm tra lúc',
      'c.cooldown': 'Hạ nhiệt tới',
      'c.extraHeaders': 'Header thêm (JSON)',
      'c.authParam': 'Tên tham số auth',
      'c.bulkKeys': 'Dán nhiều key (cách nhau bằng dấu cách, dấu phẩy hoặc xuống dòng)',
      'c.bulkModels': 'Dán nhiều model (cách nhau bằng dấu cách, dấu phẩy hoặc xuống dòng)',
      'c.all': 'Tất cả',
      'c.rerun': 'Đo lại',

      'q.type': 'Kiểu hạn mức',
      'q.amount': 'Số lượng mỗi kỳ',
      'q.unit': 'Đơn vị',
      'q.windowDays': 'Số ngày của kỳ',
      'q.manualUsed': 'Đã dùng (nhập tay)',
      'q.expiresAt': 'Hết hạn lúc',
      'q.resetNote': 'Ghi chú về việc reset',
      'q.unitTokens': 'token',
      'q.unitRequests': 'request',
      'q.savedHint': 'App tự cộng dồn số đã dùng; ô nhập tay để bù phần bạn đã tiêu trước khi dùng app.',

      'pr.title': 'Danh mục nhà cung cấp có sẵn',
      'pr.search': 'Tìm theo tên hoặc nhãn…',
      'pr.addSelected': 'Thêm mục đã chọn',
      'pr.webonly': 'Chỉ web',
      'qa.title': 'Thêm nhanh nhà cung cấp',
      'qa.paste': 'Dán đoạn curl hoặc địa chỉ endpoint',
      'qa.pastePh':
        'curl https://api.nha-cung-cap.com/v1/chat/completions -H "Authorization: Bearer sk-..." -d \'{"model":"ten-model"}\'',
      'qa.hint': 'Chỉ cần dán. App tự tách ra endpoint, key và tên model.',
      'qa.name': 'Tên hiển thị',
      'qa.namePh': 'để trống = tự đặt theo tên miền',
      'qa.endpoint': 'Endpoint',
      'qa.endpointPh': 'https://…  (có hoặc không có /v1 đều được)',
      'qa.autoProbe': 'Đo thử ngay sau khi thêm',
      'qa.manual': 'Nhập thủ công (nhiều tuỳ chọn)',
      'qa.needUrl': 'Chưa nhận ra endpoint nào trong nội dung đã dán.',
      'qa.detected': 'Nhận ra',
      'qa.key': 'key',
      'qa.none': 'không có',
      'qa.added': 'Đã thêm',
      'pr.advanced': 'Nâng cao — chỉ mở khi kết nối không theo chuẩn',
      'pr.basicHint': 'Hầu hết nhà cung cấp chỉ cần 2 ô dưới đây. Các ô khác đã có mặc định đúng.',
      'pr.selected': 'đã chọn',
      'pr.hint': 'Mỗi mục chỉ tạo một lần. Endpoint và kiểu xác thực đã điền sẵn, bạn chỉ cần dán key.',

      'd.stats': 'Số liệu đo được',
      'd.keys': 'API key',
      'd.models': 'Model',
      'd.quota': 'Hạn mức miễn phí',
      'd.notes': 'Ghi chú & nhãn',
      'd.breakdown': 'Điểm thành phần',
      'd.snippet': 'Dùng nhanh',
      'd.addKey': 'Thêm key',
      'd.addKeyBulk': 'Dán nhiều key',
      'd.addModel': 'Thêm model',
      'd.probeNow': 'Đo ngay',
      'd.lastError': 'Lỗi gần nhất',
      'd.noKeys': 'Chưa có key nào.',
      'd.noModels': 'Chưa có model nào.',
      'd.total': 'Tổng lần đo',
      'd.okFail': 'Thành công / lỗi',
      'd.reliability': 'Độ tin cậy',
      'd.speed': 'Tốc độ',
      'd.quality': 'Chất lượng',
      'd.quotaScore': 'Hạn mức',
      'd.stability': 'Ổn định',
      'd.p50': 'p50',
      'd.p90': 'p90',
      'd.jitter': 'Dao động',
      'd.lastOk': 'Lần cuối thành công',
      'd.errors': 'Lỗi theo loại',
      'd.recent': 'Lần đo gần đây',
      'd.discoverModels': 'Dò model',
      'd.discoverHint': 'Đọc danh sách model từ endpoint. Chỉ thêm model chưa có, không xoá model hiện tại.',
      'models.freeTag': 'miễn phí',
      'models.paidTag': 'trả phí',
      'models.pricePerM': 'Giá mỗi 1 triệu token (vào / ra) theo endpoint',
      'models.favoriteHint': 'Đánh dấu model ngon để ưu tiên dùng',
      'models.onHint': 'Model đang bật — bấm để tắt (tắt thì app không dùng model này nữa)',
      'models.offHint': 'Model đang tắt — bấm để bật lại',
      'models.webTag': 'từ web',
      'models.priceFromWeb': 'Giá đọc từ trang web',
      'models.viaJson': 'Bảng giá JSON của nhà cung cấp',
      'models.viaRender': 'Trang giá (đọc sau khi trang chạy xong)',
      'models.viaHtml': 'Trang giá',
      'models.priceAssumed': 'Trang không ghi rõ nhãn vào/ra — app tạm hiểu số thứ nhất là vào, số thứ hai là ra.',
      'd.priceWeb': 'Lấy giá từ web',
      'd.priceWebHint': 'Đọc giá và nhãn free đang hiển thị trên trang giá của nhà cung cấp',
      'c.pricingUrl': 'Trang giá',
      'c.pricingUrlPh': 'https://…/pricing (để trống sẽ dùng trang chủ)',
      'settings.autoWebPrice': 'Tự đọc giá từ trang web khi thêm model',
      'models.favorite': 'Model ngon, ưu tiên dùng',
      'models.price': 'Giá',
      'models.priceUnknown': 'Chưa rõ',
      'models.alreadyHave': 'đã có',
      'models.withPrice': 'có bảng giá',
      'errHint.unauthorized': 'Key bị từ chối (lỗi 401/403). Kiểm tra key còn đúng, còn hạn và thuộc đúng nhà cung cấp này.',
      'errHint.rate_limited': 'Bị giới hạn tốc độ (lỗi 429). Chờ một lát rồi đo lại.',
      'errHint.quota': 'Đã hết hạn mức miễn phí. Chờ kỳ mới hoặc dùng nhà cung cấp khác.',
      'errHint.not_found': 'Sai đường dẫn API (lỗi 404). Kiểm tra lại endpoint, thử thêm hoặc bỏ "/v1".',
      'errHint.bad_request': 'Yêu cầu sai (lỗi 400). Thường là do tên model không đúng.',
      'errHint.server_error': 'Nhà cung cấp đang lỗi (lỗi 5xx). Không phải lỗi của bạn.',
      'errHint.timeout': 'Quá thời gian chờ. Mạng chậm hoặc nhà cung cấp đang treo.',
      'errHint.network': 'Không kết nối được. Kiểm tra mạng, VPN hoặc tên miền.',
      'errHint.config': 'Thiếu cấu hình: chưa có key hoặc chưa có model để gọi.',
      'errHint.unknown': 'Lỗi chưa rõ nguyên nhân.',

      'pg.promptPh': 'Nhập câu hỏi để gửi tới các nhà cung cấp đã chọn…',
      'pg.select': 'Chọn nhà cung cấp',
      'pg.selectAll': 'Chọn tất cả',
      'pg.clear': 'Bỏ chọn',
      'pg.run': 'Chạy so sánh',
      'pg.running': 'Đang chạy…',
      'pg.latency': 'Độ trễ',
      'pg.answer': 'Trả lời',
      'pg.model': 'Model',
      'pg.noProvider': 'Chưa có nhà cung cấp nào dùng được (cần key + model).',
      'pg.hint': 'Chạy qua Cổng nội bộ nên mọi request đều được ghi sổ và tính vào hạn mức.',

      'gw.snippet': 'Đoạn mã mẫu',
      'gw.copyUrl': 'Sao chép địa chỉ',
      'gw.hint': 'Giữ cổng chạy nền rồi trỏ công cụ của bạn vào địa chỉ trên. Model "auto" để app tự chọn nhà cung cấp tốt nhất còn quota.',
      'gw.test': 'Tự kiểm tra',
      'gw.saved': 'Đã lưu cấu hình cổng',

      'ex.saveOk': 'Đã lưu file',
      'ex.vaultHint': 'File sao lưu chứa key đã mã hoá bằng DPAPI của chính máy này — chép sang máy khác sẽ không giải mã được.',

      'jr.placeholder2': 'Ghi lại điều đáng nhớ…',
      'jr.add': 'Thêm ghi chép',
      'jr.emptyHint': 'Ví dụ: hôm nay C chậm bất thường, D trả lời ngắn nhưng nhanh, F hết hạn free vào 30/6…',

      'st.autoSaved': 'Mọi thay đổi được lưu ngay khi bạn sửa.',
      'st.theme': 'Chủ đề',
      'st.exportNow': 'Xuất ngay',
      'st.vaultOk': 'đang bật mã hoá',
      'st.vaultPlain': 'đang lưu dạng thô',
    },
    en: {
      'c.name': 'Name',
      'c.endpoint': 'Endpoint',
      'c.kind': 'Kind',
      'c.category': 'Category',
      'c.compat': 'API flavour',
      'c.auth': 'Auth style',
      'c.baseUrl': 'Base URL',
      'c.modelsPath': 'Models path',
      'c.chatPath': 'Chat path',
      'c.homepage': 'Homepage',
      'c.docsUrl': 'Docs',
      'c.notes': 'Notes',
      'c.tags': 'Tags (comma separated)',
      'c.quality': 'Your quality rating (1–5)',
      'c.priority': 'Priority boost',
      'c.enabled': 'Enabled',
      'c.pinned': 'Pinned to top',
      'c.actions': 'Actions',
      'c.status': 'Status',
      'c.label': 'Label',
      'c.secret': 'API key',
      'c.weight': 'Weight',
      'c.modelId': 'Model id',
      'c.displayName': 'Display name',
      'c.contextWindow': 'Context window',
      'c.source': 'Source',
      'c.lastChecked': 'Checked at',
      'c.cooldown': 'Cooling until',
      'c.extraHeaders': 'Extra headers (JSON)',
      'c.authParam': 'Auth param name',
      'c.bulkKeys': 'Paste many keys (separated by space, comma or new line)',
      'c.bulkModels': 'Paste many models (separated by space, comma or new line)',
      'c.all': 'All',
      'c.rerun': 'Re-probe',

      'q.type': 'Quota type',
      'q.amount': 'Amount per period',
      'q.unit': 'Unit',
      'q.windowDays': 'Period length (days)',
      'q.manualUsed': 'Already used (manual)',
      'q.expiresAt': 'Expires at',
      'q.resetNote': 'Reset note',
      'q.unitTokens': 'tokens',
      'q.unitRequests': 'requests',
      'q.savedHint': 'The app accumulates usage itself; use the manual field to account for spend before you started using it.',

      'pr.title': 'Provider catalog',
      'pr.search': 'Search by name or tag…',
      'pr.addSelected': 'Add selected',
      'pr.webonly': 'Web only',
      'qa.title': 'Quick add provider',
      'qa.paste': 'Paste a curl command or an endpoint URL',
      'qa.pastePh':
        'curl https://api.provider.com/v1/chat/completions -H "Authorization: Bearer sk-..." -d \'{"model":"model-name"}\'',
      'qa.hint': 'Just paste. The app extracts the endpoint, key and model name for you.',
      'qa.name': 'Display name',
      'qa.namePh': 'leave empty to name it after the domain',
      'qa.endpoint': 'Endpoint',
      'qa.endpointPh': 'https://…  (with or without /v1)',
      'qa.autoProbe': 'Probe right after adding',
      'qa.manual': 'Enter manually (more options)',
      'qa.needUrl': 'No endpoint recognised in what you pasted.',
      'qa.detected': 'Detected',
      'qa.key': 'key',
      'qa.none': 'none',
      'qa.added': 'Added',
      'pr.advanced': 'Advanced — open only if the connection is non-standard',
      'pr.basicHint': 'Most providers need only these two fields. Everything else already has a sane default.',
      'pr.selected': 'selected',
      'pr.hint': 'Each entry is created once. Endpoint and auth style are prefilled — you only paste the key.',

      'd.stats': 'Measured stats',
      'd.keys': 'API keys',
      'd.models': 'Models',
      'd.quota': 'Free quota',
      'd.notes': 'Notes & tags',
      'd.breakdown': 'Score breakdown',
      'd.snippet': 'Quick use',
      'd.addKey': 'Add key',
      'd.addKeyBulk': 'Paste many keys',
      'd.addModel': 'Add model',
      'd.probeNow': 'Probe now',
      'd.lastError': 'Last error',
      'd.noKeys': 'No keys yet.',
      'd.noModels': 'No models yet.',
      'd.total': 'Probes',
      'd.okFail': 'OK / failed',
      'd.reliability': 'Reliability',
      'd.speed': 'Speed',
      'd.quality': 'Quality',
      'd.quotaScore': 'Quota',
      'd.stability': 'Stability',
      'd.p50': 'p50',
      'd.p90': 'p90',
      'd.jitter': 'Jitter',
      'd.lastOk': 'Last success',
      'd.errors': 'Errors by kind',
      'd.recent': 'Recent probes',
      'd.discoverModels': 'Fetch models',
      'd.discoverHint': 'Read the model list from the endpoint. Only adds models you do not already have.',
      'models.freeTag': 'free',
      'models.paidTag': 'paid',
      'models.pricePerM': 'Price per 1M tokens (in / out) as reported by the endpoint',
      'models.favoriteHint': 'Mark a good model to prefer it',
      'models.onHint': 'Model is on — click to turn it off (the app will stop using it)',
      'models.offHint': 'Model is off — click to turn it back on',
      'models.webTag': 'from web',
      'models.priceFromWeb': 'Price read from the website',
      'models.viaJson': 'Provider price JSON',
      'models.viaRender': 'Pricing page (read after the page finished loading)',
      'models.viaHtml': 'Pricing page',
      'models.priceAssumed': 'The page has no in/out labels — the app reads the first number as input and the second as output.',
      'd.priceWeb': 'Read prices from web',
      'd.priceWebHint': 'Read the price and free tag shown on the provider pricing page',
      'c.pricingUrl': 'Pricing page',
      'c.pricingUrlPh': 'https://…/pricing (empty = use the homepage)',
      'settings.autoWebPrice': 'Read prices from the website automatically when adding models',
      'models.favorite': 'Good model, prefer it',
      'models.price': 'Price',
      'models.priceUnknown': 'Unknown',
      'models.alreadyHave': 'already there',
      'models.withPrice': 'with pricing',
      'errHint.unauthorized': 'Key was rejected (401/403). Check that it is correct, still valid, and belongs to this provider.',
      'errHint.rate_limited': 'Rate limited (429). Wait a moment and probe again.',
      'errHint.quota': 'Free quota used up. Wait for the next period or use another provider.',
      'errHint.not_found': 'Wrong API path (404). Check the endpoint; try adding or removing "/v1".',
      'errHint.bad_request': 'Bad request (400). Usually a wrong model name.',
      'errHint.server_error': 'The provider is failing (5xx). Not your fault.',
      'errHint.timeout': 'Timed out. Slow network or the provider is hanging.',
      'errHint.network': 'Cannot connect. Check network, VPN or the domain name.',
      'errHint.config': 'Missing setup: no key or no model to call.',
      'errHint.unknown': 'Unclear error.',

      'pg.promptPh': 'Type a prompt to send to the selected providers…',
      'pg.select': 'Pick providers',
      'pg.selectAll': 'Select all',
      'pg.clear': 'Clear',
      'pg.run': 'Run comparison',
      'pg.running': 'Running…',
      'pg.latency': 'Latency',
      'pg.answer': 'Answer',
      'pg.model': 'Model',
      'pg.noProvider': 'No usable provider yet (needs a key and a model).',
      'pg.hint': 'Runs through the local gateway, so every request is logged and counted against quota.',

      'gw.snippet': 'Sample code',
      'gw.copyUrl': 'Copy URL',
      'gw.hint': 'Keep the gateway running and point your tools at the URL above. Use model "auto" and the app picks the best provider that still has quota.',
      'gw.test': 'Self test',
      'gw.saved': 'Gateway config saved',

      'ex.saveOk': 'File saved',
      'ex.vaultHint': 'The backup holds keys encrypted with this machine\'s DPAPI — copying it elsewhere will not decrypt.',

      'jr.placeholder2': 'Write down what matters…',
      'jr.add': 'Add note',
      'jr.emptyHint': 'e.g. C was unusually slow today, D answers short but fast, F free window ends Jun 30…',

      'st.autoSaved': 'Every change is saved as you edit.',
      'st.theme': 'Theme',
      'st.exportNow': 'Export now',
      'st.vaultOk': 'encryption on',
      'st.vaultPlain': 'stored in plain text',
    },
  };

  Object.assign(window.I18N.DICT.vi, EXTRA.vi);
  Object.assign(window.I18N.DICT.en, EXTRA.en);

  const KIND_LABEL = { api: 'API', local: 'Local', 'web-only': 'Web' };
  const AUTH_LABELS = {
    bearer: 'Authorization: Bearer',
    'x-api-key': 'x-api-key',
    both: 'Bearer + x-api-key',
    query: 'query param',
    none: 'none',
  };

  /* ------------------------------------------------------------------ */
  /* Truy cập dữ liệu                                                    */
  /* ------------------------------------------------------------------ */

  const snap = () => window.S.snap;
  const providers = () => snap().providers || [];
  const allKeys = () => snap().keys || [];
  const allModels = () => snap().models || [];
  const keysOf = (pid) => allKeys().filter((k) => k.providerId === pid);
  const modelsOf = (pid) => allModels().filter((m) => m.providerId === pid);
  const scoreOf = (pid) => (snap().scores || {})[pid] || null;
  const providerById = (id) => providers().find((p) => p.id === id) || null;
  const keyById = (id) => allKeys().find((k) => k.id === id) || null;
  const modelById = (id) => allModels().find((m) => m.id === id) || null;

  function dayKey(d) {
    const x = d || new Date();
    return new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }

  function usageToday() {
    const out = { requests: 0, tokens: 0, failures: 0 };
    const u = snap().usage || {};
    const k = dayKey();
    for (const pid of Object.keys(u)) {
      const row = (u[pid] || {})[k];
      if (!row) continue;
      out.requests += row.requests || 0;
      out.tokens += (row.promptTokens || 0) + (row.completionTokens || 0);
      out.failures += row.failures || 0;
    }
    return out;
  }

  function freeQuotaLeft() {
    let tokens = 0;
    let reqs = 0;
    let unlimited = 0;
    let declared = 0;
    for (const p of providers()) {
      if (p.kind === 'web-only') continue;
      const s = scoreOf(p.id);
      const q = s && s.quota;
      if (!q || q.type === 'unknown') continue;
      declared++;
      if (q.unlimited) {
        unlimited++;
        continue;
      }
      if (!q.known || q.limit == null) continue;
      const left = Math.max(0, (q.limit || 0) - (q.used || 0));
      if (q.unit === 'requests') reqs += left;
      else tokens += left;
    }
    return { tokens, reqs, unlimited, declared };
  }

  function gradeBadge(score, extraClass) {
    const g = score && score.grade ? score.grade : null;
    return (
      '<span class="grade ' +
      U.gradeClass(g) +
      (extraClass ? ' ' + extraClass : '') +
      '" title="' +
      E(score ? String(score.score) + ' · ' + U.gradeText(g) : t('state.unknown')) +
      '">' +
      E(g || '—') +
      '</span>'
    );
  }

  function kindChip(kind) {
    const cls = kind === 'local' ? 'chip chip-info' : kind === 'web-only' ? 'chip' : 'chip chip-accent';
    return '<span class="' + cls + '">' + E(KIND_LABEL[kind] || kind || 'api') + '</span>';
  }

  /* Nhãn giá của model: chỉ hiện khi biết chắc, không suy đoán. */
  function priceText(m) {
    if (m && m.free === true) return '<span class="chip chip-ok">' + E(t('models.freeTag')) + '</span>';
    if (m && m.free === false) return '<span class="chip chip-warn">' + E(t('models.paidTag')) + '</span>';
    return '';
  }

  /* Giá đọc từ trang web: ghi rõ nguồn để người dùng biết mà kiểm tra lại. */
  function priceSourceChip(m) {
    if (!m || m.priceSource !== 'web') return '';
    const lines = [t('models.priceFromWeb') + ': ' + (m.priceUrl || '')];
    if (m.priceNote) lines.push(m.priceNote);
    if (m.priceAssumed) lines.push(t('models.priceAssumed'));
    if (m.priceCheckedAt) lines.push(U.timeAgo(m.priceCheckedAt));
    return (
      '<span class="chip tiny chip-web" title="' +
      E(lines.join('\n')) +
      '">' +
      E(t('models.webTag')) +
      '</span>'
    );
  }

  function priceChip(m) {
    const p = m && m.pricing;
    const src = priceSourceChip(m);
    if (!p) return src;
    const per = (v) => {
      const n = Number(v || 0) * 1e6;
      if (!n) return '0';
      return String(n >= 1 ? Math.round(n * 100) / 100 : Math.round(n * 10000) / 10000);
    };
    return (
      '<span class="chip tiny" title="' +
      E(m.priceNote || t('models.pricePerM')) +
      '">$' +
      per(p.input) +
      ' / $' +
      per(p.output) +
      '</span> ' +
      src
    );
  }

  function favStar(m) {
    return (
      '<button class="btn btn-xs ' +
      (m.favorite ? 'btn-star-on' : 'btn-ghost') +
      '" data-act="model-fav" data-id="' +
      E(m.id) +
      '" data-on="' +
      (m.favorite ? '1' : '0') +
      '" title="' +
      E(t('models.favoriteHint')) +
      '">★</button>'
    );
  }

  /* Model do endpoint trả về (cả tên cũ 'discovered' lẫn tên mới 'endpoint'). */
  function isEndpointSource(m) {
    return !!m && (m.source === 'endpoint' || m.source === 'discovered');
  }

  function providerTitle(p, s) {
    return (
      '<div class="cell-name">' +
      gradeBadge(s) +
      '<div class="name-stack"><strong>' +
      E(p.name) +
      (p.pinned ? ' 📌' : '') +
      (p.enabled === false ? ' <span class="chip">' + E(t('c.disable', 'tắt')) + '</span>' : '') +
      '</strong><span>' +
      E(p.baseUrl || '—') +
      '</span></div></div>'
    );
  }

  function sortedProviders() {
    const list = providers().slice();
    const { key, dir } = window.S.sort;
    const val = (p) => {
      const s = scoreOf(p.id);
      switch (key) {
        case 'name':
          return p.name.toLowerCase();
        case 'quota':
          return s && s.quota && s.quota.headroom != null ? s.quota.headroom : -1;
        case 'latency':
          return s && s.stats && s.stats.p50 != null ? -s.stats.p50 : 1e9;
        case 'keys':
          return s ? s.counts.keys : 0;
        case 'models':
          return s ? s.counts.models : 0;
        default:
          return s ? s.score : -1;
      }
    };
    list.sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      if (va === vb) return a.name.localeCompare(b.name);
      return va < vb ? dir : -dir;
    });
    return list;
  }

  function applyFilters(list) {
    const f = window.S.filters;
    const q = (window.S.query || '').trim().toLowerCase();
    return list.filter((p) => {
      if (f.kind !== 'all' && p.kind !== f.kind) return false;
      if (f.bucket !== 'all') {
        const s = scoreOf(p.id);
        if (!s || !s.buckets.includes(f.bucket)) return false;
      }
      if (f.tag !== 'all' && !(p.tags || []).includes(f.tag)) return false;
      if (q) {
        const hay = [p.name, p.baseUrl, p.category, (p.tags || []).join(' '), p.notes]
          .join(' ')
          .toLowerCase();
        const ms = modelsOf(p.id).some((m) => m.modelId.toLowerCase().includes(q));
        const ks = keysOf(p.id).some((k) => (k.label || '').toLowerCase().includes(q));
        if (!hay.includes(q) && !ms && !ks) return false;
      }
      return true;
    });
  }

  /* ------------------------------------------------------------------ */
  /* 1. Bảng điều khiển                                                  */
  /* ------------------------------------------------------------------ */

  function dashboard() {
    const list = providers();
    const totals = snap().totals || {};
    const free = freeQuotaLeft();
    const use = usageToday();
    const scores = Object.values(snap().scores || {});

    if (!list.length) {
      return (
        '<div class="empty"><strong>' +
        E(t('providers.empty')) +
        '</strong><p>' +
        E(t('providers.emptyBody')) +
        '</p>' +
        '<div class="row" style="justify-content:center;gap:8px">' +
        '<button class="btn btn-primary" data-act="new-provider">' +
        E(t('action.newProvider')) +
        '</button>' +
        '<button class="btn" data-act="open-presets">' +
        E(t('providers.addFromCatalog')) +
        '</button>' +
        '</div></div>'
      );
    }

    const gradeMix = {};
    for (const s of scores) gradeMix[s.grade] = (gradeMix[s.grade] || 0) + 1;
    const order = ['S', 'A', 'B', 'C', 'D', 'F'];
    const mixHtml = order
      .filter((g) => gradeMix[g])
      .map(
        (g) =>
          '<span class="row" style="gap:6px">' +
          '<span class="grade ' +
          U.gradeClass(g) +
          '" style="width:24px;height:24px;font-size:12px">' +
          g +
          '</span><strong>' +
          gradeMix[g] +
          '</strong><span class="muted-2 tiny">' +
          E(U.gradeText(g)) +
          '</span></span>'
      )
      .join('');

    const ranked = scores.slice().sort((a, b) => b.score - a.score).slice(0, 8);
    const topRows = ranked
      .map((s) => {
        const p = providerById(s.providerId) || {};
        return (
          '<tr data-act="provider-open" data-id="' +
          E(s.providerId) +
          '"><td class="c-rank">' +
          (s.rank || '—') +
          '</td><td class="c-name">' +
          providerTitle(p, s) +
          '</td><td class="c-buckets">' +
          s.buckets.map(U.bucketChip).join(' ') +
          '</td><td class="c-quota">' +
          U.quotaBar(s.quota) +
          '</td><td class="c-p50 nowrap">' +
          E(U.fmtMs(s.stats.p50)) +
          '</td><td class="c-score nowrap"><strong>' +
          E(String(s.score)) +
          '</strong></td></tr>'
        );
      })
      .join('');

    const alerts = (snap().alerts || []).slice(0, 8);
    const alertsHtml = alerts.length
      ? alerts
          .map(
            (a) =>
              '<div class="alert-item ' +
              E(a.level) +
              '"><span class="ico">' +
              (a.level === 'error' ? '⛔' : a.level === 'warn' ? '⚠' : 'ℹ') +
              '</span><div>' +
              E(a.message) +
              (a.seen ? '' : ' <span class="chip chip-accent">' + E(t('al.new', 'mới')) + '</span>') +
              '</div><span class="alert-time">' +
              E(U.timeAgo(a.ts)) +
              '</span></div>'
          )
          .join('')
      : '<p class="muted-2 small">' + E(t('dashboard.noAlerts')) + '</p>';

    const freeBits = [];
    if (free.tokens) freeBits.push(U.fmtNum(free.tokens) + ' token');
    if (free.reqs) freeBits.push(U.fmtNum(free.reqs) + ' request');
    if (free.unlimited) freeBits.push(free.unlimited + ' × ' + t('quota.unlimited'));

    return (
      '<div class="grid grid-4">' +
      '<div class="kpi"><div class="kpi-label">' +
      E(t('dashboard.freeToday')) +
      '</div><div class="kpi-value">' +
      E(freeBits.length ? freeBits.join(' + ') : '—') +
      '</div><div class="kpi-foot">' +
      E(free.declared + ' ' + t('kpi.providers').toLowerCase() + ' · ' + t('dashboard.freeTodayFoot')) +
      '</div></div>' +
      '<div class="kpi"><div class="kpi-label">' +
      E(t('dashboard.requestsToday')) +
      '</div><div class="kpi-value">' +
      E(U.fmtInt(use.requests)) +
      '</div><div class="kpi-foot">' +
      E(use.failures + ' lỗi') +
      '</div></div>' +
      '<div class="kpi"><div class="kpi-label">' +
      E(t('dashboard.tokensToday')) +
      '</div><div class="kpi-value">' +
      E(U.fmtNum(use.tokens)) +
      '</div><div class="kpi-foot">' +
      E(t('kpi.samples') + ': ' + U.fmtInt(totals.samples || 0)) +
      '</div></div>' +
      '<div class="kpi"><div class="kpi-label">' +
      E(t('kpi.usable')) +
      '</div><div class="kpi-value">' +
      E(String(scores.filter((s) => s.usable).length)) +
      '<span class="muted-2" style="font-size:14px"> / ' +
      E(String(list.length)) +
      '</span></div><div class="kpi-foot">' +
      E(t('kpi.keys') + ': ' + (totals.keys || 0) + ' · ' + t('kpi.models') + ': ' + (totals.models || 0)) +
      '</div></div>' +
      '</div>' +

      '<div class="grid grid-2 mt">' +
      '<div class="card"><h3>' +
      E(t('dashboard.top')) +
      '</h3><table class="table table-rank"><thead><tr>' +
      '<th class="no-sort c-rank">#</th><th class="no-sort c-name">' +
      E(t('c.name')) +
      '</th><th class="no-sort c-buckets">' +
      E(t('providers.filterBucket')) +
      '</th><th class="no-sort c-quota">' +
      E(t('d.quota')) +
      '</th><th class="no-sort c-p50">' +
      E(t('d.p50')) +
      '</th><th class="no-sort c-score">' +
      E(t('dm.score', 'Điểm')) +
      '</th></tr></thead><tbody>' +
      topRows +
      '</tbody></table></div>' +

      '<div style="display:flex;flex-direction:column;gap:14px">' +
      '<div class="card"><h3>' +
      E(t('dashboard.alerts')) +
      '</h3>' +
      alertsHtml +
      '<div class="row mt"><button class="btn btn-xs" data-act="alerts-seen">' +
      E(t('al.seen')) +
      '</button><button class="btn btn-xs btn-ghost" data-act="alerts-clear">' +
      E(t('al.clear')) +
      '</button></div></div>' +
      '<div class="card"><h3>' +
      E(t('dashboard.gradeMix')) +
      '</h3><div class="row row-wrap" style="gap:16px">' +
      (mixHtml || '<span class="muted-2 small">' + E(t('misc.none')) + '</span>') +
      '</div></div>' +
      '<div class="card"><h3>' +
      E(t('dashboard.quickStart')) +
      '</h3><p class="small muted" style="margin:0">' +
      E(t('dashboard.quickStartBody')) +
      '</p></div>' +
      '</div></div>'
    );
  }

  /* ------------------------------------------------------------------ */
  /* 2. Nhà cung cấp                                                     */
  /* ------------------------------------------------------------------ */

  function providerCard(p) {
    const s = scoreOf(p.id);
    const counts = (s && s.counts) || { keys: 0, models: 0 };
    return (
      '<div class="pcard" data-act="provider-open" data-id="' +
      E(p.id) +
      '">' +
      '<div class="pcard-head">' +
      gradeBadge(s) +
      '<div class="pcard-title"><strong>' +
      E(p.name) +
      (p.pinned ? ' 📌' : '') +
      '</strong><span>' +
      E(p.baseUrl || '—') +
      (p.baseUrl
        ? ' <button class="btn btn-xs btn-ghost copy-mini" data-act="copy-text" data-text="' +
          E(p.baseUrl) +
          '" data-msg="copy.endpoint" title="' +
          E(t('copy.endpointHint')) +
          '">📋</button>'
        : '') +
      '</span></div>' +
      '<strong style="font-size:18px">' +
      E(s ? String(s.score) : '—') +
      '</strong></div>' +
      '<div class="row row-wrap" style="gap:6px">' +
      kindChip(p.kind) +
      (s ? s.buckets.map(U.bucketChip).join('') : '') +
      '</div>' +
      U.quotaBar(s && s.quota) +
      '<div class="pcard-foot tiny muted-2">' +
      '<span>' +
      E(U.fmtInt(counts.keys) + ' key') +
      '</span><span>·</span><span>' +
      E(U.fmtInt(counts.models) + ' model') +
      '</span><span>·</span><span>' +
      E(U.fmtMs(s && s.stats ? s.stats.p50 : null)) +
      '</span><span>·</span><span>' +
      E(U.timeAgo(p.lastProbeAt)) +
      '</span></div></div>'
    );
  }

  function providersView() {
    const all = sortedProviders();
    const list = applyFilters(all);

    if (!providers().length) {
      return (
        '<div class="empty"><strong>' +
        E(t('providers.empty')) +
        '</strong><p>' +
        E(t('providers.emptyBody')) +
        '</p>' +
        '<div class="row" style="justify-content:center;gap:8px">' +
        '<button class="btn btn-primary" data-act="new-provider">' +
        E(t('action.newProvider')) +
        '</button>' +
        '<button class="btn" data-act="open-presets">' +
        E(t('providers.addFromCatalog')) +
        '</button></div></div>'
      );
    }

    const kinds = ['all'].concat(Array.from(new Set(providers().map((p) => p.kind))));
    const buckets = [
      'all',
      'workhorse',
      'lightning',
      'premium',
      'backup',
      'fresh',
      'local_free',
      'unstable',
      'rate_limited',
      'exhausted',
      'dead',
      'no_key',
      'web_only',
    ];
    const tags = Array.from(new Set(providers().flatMap((p) => p.tags || [])));

    const opt = (v, cur, label) =>
      '<option value="' + E(v) + '"' + (v === cur ? ' selected' : '') + '>' + E(label) + '</option>';

    const bar =
      '<div class="filter-row">' +
      '<select class="mini" data-act="filter" data-key="kind">' +
      kinds.map((k) => opt(k, window.S.filters.kind, k === 'all' ? t('providers.filterAll') : KIND_LABEL[k] || k)).join('') +
      '</select>' +
      '<select class="mini" data-act="filter" data-key="bucket">' +
      buckets
        .map((b) => opt(b, window.S.filters.bucket, b === 'all' ? t('providers.filterBucket') + ': ' + t('c.all') : t('bucket.' + b, b)))
        .join('') +
      '</select>' +
      (tags.length
        ? '<select class="mini" data-act="filter" data-key="tag">' +
          opt('all', window.S.filters.tag, t('providers.filterTag') + ': ' + t('c.all')) +
          tags.map((x) => opt(x, window.S.filters.tag, x)).join('') +
          '</select>'
        : '') +
      '<span class="spacer"></span>' +
      '<label class="check small"><input type="checkbox" data-act="group-toggle"' +
      (window.S.groupByBucket ? ' checked' : '') +
      '>' +
      E(t('providers.groupByBucket')) +
      '</label>' +
      '<button class="btn btn-ghost btn-xs" data-act="open-presets">' +
      E(t('providers.addFromCatalog')) +
      '</button>' +
      '</div>';

    if (!list.length) {
      return bar + '<div class="empty">' + E(t('misc.none')) + '</div>';
    }

    if (window.S.groupByBucket) {
      const groups = {};
      for (const p of list) {
        const s = scoreOf(p.id);
        const key = s && s.buckets.length ? s.buckets[0] : 'fresh';
        (groups[key] = groups[key] || []).push(p);
      }
      const order = ['workhorse', 'lightning', 'premium', 'local_free', 'backup', 'fresh', 'unstable', 'rate_limited', 'exhausted', 'dead', 'no_key', 'web_only'];
      return (
        bar +
        order
          .filter((g) => groups[g])
          .map(
            (g) =>
              '<div class="section-title">' +
              E(t('bucket.' + g, g)) +
              '<span class="chip">' +
              groups[g].length +
              '</span></div><div class="grid grid-3">' +
              groups[g].map(providerCard).join('') +
              '</div>'
          )
          .join('')
      );
    }

    const sortArrow = (k) => (window.S.sort.key === k ? (window.S.sort.dir === 1 ? ' ▲' : ' ▼') : '');
    const th = (k, label, extra) =>
      '<th data-act="sort" data-key="' +
      k +
      '"' +
      (extra || '') +
      '>' +
      E(label) +
      sortArrow(k) +
      '</th>';

    return (
      bar +
      '<table class="table"><thead><tr>' +
      '<th class="no-sort" style="width:36px">#</th>' +
      th('name', t('c.name')) +
      '<th class="no-sort">' +
      E(t('providers.filterBucket')) +
      '</th>' +
      th('quota', t('d.quota')) +
      th('keys', t('kpi.keys')) +
      th('models', t('kpi.models')) +
      th('latency', t('d.p50')) +
      th('score', t('dm.score', 'Điểm')) +
      '<th class="no-sort" style="width:150px">' +
      E(t('c.actions')) +
      '</th></tr></thead><tbody>' +
      list
        .map((p, i) => {
          const s = scoreOf(p.id);
          const c = (s && s.counts) || {};
          return (
            '<tr data-act="provider-open" data-id="' +
            E(p.id) +
            '">' +
            '<td class="muted-2">' +
            (i + 1) +
            '</td>' +
            '<td>' +
            providerTitle(p, s) +
            '</td>' +
            '<td>' +
            kindChip(p.kind) +
            ' ' +
            (s ? s.buckets.slice(0, 2).map(U.bucketChip).join(' ') : '') +
            '</td>' +
            '<td style="min-width:130px">' +
            U.quotaBar(s && s.quota) +
            '</td>' +
            '<td>' +
            E(String(c.keys || 0)) +
            (c.badKeys ? ' <span class="chip chip-err">' + c.badKeys + '</span>' : '') +
            '</td>' +
            '<td>' +
            E(String(c.models || 0)) +
            '</td>' +
            '<td class="nowrap">' +
            E(U.fmtMs(s && s.stats ? s.stats.p50 : null)) +
            '</td>' +
            '<td><span class="row" style="gap:6px"><strong>' +
            E(s ? String(s.score) : '—') +
            '</strong>' +
            gradeBadge(s) +
            '</span></td>' +
            '<td><span class="row" style="gap:4px">' +
            '<button class="btn btn-xs" data-act="probe-one" data-id="' +
            E(p.id) +
            '">' +
            E(t('action.probe')) +
            '</button>' +
            '<button class="btn btn-xs btn-ghost" data-act="provider-edit" data-id="' +
            E(p.id) +
            '">' +
            E(t('action.edit')) +
            '</button>' +
            '<button class="btn btn-xs btn-ghost" data-act="provider-more" data-id="' +
            E(p.id) +
            '">⋯</button>' +
            '</span></td></tr>'
          );
        })
        .join('') +
      '</tbody></table>'
    );
  }

  /* ------------------------------------------------------------------ */
  /* 3. Model                                                            */
  /* ------------------------------------------------------------------ */

  function modelsView() {
    const list = providers();
    if (!list.length) return '<div class="empty"><strong>' + E(t('models.empty')) + '</strong></div>';
    const q = (window.S.query || '').trim().toLowerCase();

    const cards = list
      .map((p) => {
        const models = modelsOf(p.id)
          .filter((m) => !q || m.modelId.toLowerCase().includes(q))
          .sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0));
        if (!models.length && q) return '';
        const s = scoreOf(p.id);
        return (
          '<div class="card"><div class="row"><h3 style="margin:0">' +
          E(p.name) +
          '</h3>' +
          kindChip(p.kind) +
          '<span class="spacer"></span>' +
          '<span class="chip">' +
          models.length +
          '</span>' +
          '<button class="btn btn-xs" data-act="model-add" data-pid="' +
          E(p.id) +
          '">+ ' +
          E(t('d.addModel')) +
          '</button>' +
          '<button class="btn btn-xs btn-ghost" data-act="model-discover" data-pid="' +
          E(p.id) +
          '" title="' +
          E(t('d.discoverHint')) +
          '">' +
          E(t('d.discoverModels')) +
          '</button>' +
          '<button class="btn btn-xs btn-ghost" data-act="price-web" data-pid="' +
          E(p.id) +
          '" title="' +
          E(t('d.priceWebHint')) +
          '">' +
          E(t('d.priceWeb')) +
          '</button>' +
          '<button class="btn btn-xs btn-ghost" data-act="models-enable" data-pid="' +
          E(p.id) +
          '" data-on="1">' +
          E(t('models.enableAll')) +
          '</button>' +
          '<button class="btn btn-xs btn-ghost" data-act="copy-models" data-id="' +
          E(p.id) +
          '" title="' +
          E(t('copy.modelsHint')) +
          '">📋 ' +
          E(t('copy.all')) +
          '</button>' +
          '<button class="btn btn-xs btn-ghost" data-act="models-enable" data-pid="' +
          E(p.id) +
          '" data-on="0">' +
          E(t('models.disableAll')) +
          '</button></div>' +
          (models.length
            ? '<table class="table mt"><thead><tr><th class="no-sort">' +
              E(t('c.modelId')) +
              '</th><th class="no-sort">' +
              E(t('c.source')) +
              '</th><th class="no-sort">' +
              E(t('c.contextWindow')) +
              '</th><th class="no-sort">' +
              E(t('c.quality')) +
              '</th><th class="no-sort" style="width:52px" title="' +
              E(t('models.favoriteHint')) +
              '">★</th><th class="no-sort" style="width:72px">' +
              E(t('c.enabled')) +
              '</th><th class="no-sort" style="width:96px"></th></tr></thead><tbody>' +
              models
                .map(
                  (m) =>
                    '<tr><td class="mono">' +
                    E(m.modelId) +
                    ' ' +
                    priceText(m) +
                    ' ' +
                    priceChip(m) +
                    '</td><td class="tiny muted-2">' +
                    E(isEndpointSource(m) ? t('models.discovered') : t('models.manual')) +
                    '</td><td class="tiny">' +
                    E(m.contextWindow ? U.fmtNum(m.contextWindow) : '—') +
                    '</td><td class="tiny">' +
                    E(m.qualityManual ? '★'.repeat(m.qualityManual) : '—') +
                    '</td><td>' +
                    favStar(m) +
                    '</td><td><span class="switch' +
                    (m.enabled !== false ? ' on' : '') +
                    '" data-act="model-toggle" data-id="' +
                    E(m.id) +
                    '" title="' +
                    E(m.enabled !== false ? t('models.onHint') : t('models.offHint')) +
                    '"><i></i></span></td>' +
                    '<td class="nowrap"><button class="btn btn-xs btn-ghost" data-act="copy-text" data-text="' +
                    E(m.modelId) +
                    '" data-msg="copy.model" title="' +
                    E(t('copy.modelHint')) +
                    '">📋</button><button class="btn btn-xs btn-ghost" data-act="model-edit" data-id="' +
                    E(m.id) +
                    '">' +
                    E(t('action.edit')) +
                    '</button></td></tr>'
                )
                .join('') +
              '</tbody></table>'
            : '<p class="muted-2 small mt">' +
              E(t('models.empty')) +
              (s && s.counts && s.counts.models ? '' : '') +
              '</p>') +
          '</div>'
        );
      })
      .join('');

    return '<div class="grid" style="gap:14px">' + cards + '</div>';
  }

  /* ------------------------------------------------------------------ */
  /* 4. So sánh (playground)                                             */
  /* ------------------------------------------------------------------ */

  function usableProviders() {
    return providers().filter((p) => {
      const s = scoreOf(p.id);
      return s && s.usable;
    });
  }

  function playgroundView() {
    const runnable = usableProviders();
    const gw = snap().gateway || {};
    const S = window.S;
    const picked = S.playground.selected;

    const chips = runnable
      .map((p) => {
        const s = scoreOf(p.id);
        const on = picked.includes(p.id);
        return (
          '<button class="btn btn-xs ' +
          (on ? 'btn-primary' : 'btn-ghost') +
          '" data-act="play-toggle" data-id="' +
          E(p.id) +
          '">' +
          E(p.name) +
          ' <span class="muted-2">' +
          E(s ? String(s.score) : '') +
          '</span></button>'
        );
      })
      .join(' ');

    const results = S.playground.results
      .map(
        (r) =>
          '<div class="out-card"><div class="row">' +
          gradeBadge(scoreOf(r.providerId)) +
          '<strong>' +
          E(r.name) +
          '</strong><span class="spacer"></span>' +
          (r.ok
            ? '<span class="chip chip-ok">' + E(U.fmtMs(r.latencyMs)) + '</span>'
            : '<span class="chip chip-err">' + E(t('err.' + (r.errorKind || 'network'), r.errorKind || 'error')) + '</span>') +
          '</div><div class="tiny muted-2 mono">' +
          E(r.model || '') +
          (r.usage ? ' · ' + E(U.fmtNum((r.usage.promptTokens || 0) + (r.usage.completionTokens || 0)) + ' token') : '') +
          '</div><div class="out-body">' +
          E(r.ok ? r.text || '(rỗng)' : r.message || '') +
          '</div></div>'
      )
      .join('');

    return (
      '<div class="card"><h3>' +
      E(t('playground.title')) +
      '</h3><p class="card-sub">' +
      E(t('playground.sub')) +
      '</p>' +
      (gw.running
        ? '<div class="row"><span class="chip chip-ok">' +
          E(t('gateway.on')) +
          '</span><span class="mono tiny">' +
          E(gw.url || '') +
          '</span><span class="spacer"></span>' +
          '<span class="tiny muted-2">' +
          E(t('pg.hint')) +
          '</span></div>'
        : '<div class="row"><span class="chip chip-warn">' +
          E(t('playground.needGateway')) +
          '</span><span class="spacer"></span>' +
          '<button class="btn btn-primary btn-xs" data-act="gw-start">' +
          E(t('playground.startGateway')) +
          '</button></div>') +
      '<div class="field mt"><label>' +
      E(t('playground.pickProviders')) +
      '</label><div class="row row-wrap" style="gap:6px">' +
      (chips || '<span class="muted-2 small">' + E(t('pg.noProvider')) + '</span>') +
      '</div><div class="row mt"><button class="btn btn-xs btn-ghost" data-act="play-all">' +
      E(t('pg.selectAll')) +
      '</button><button class="btn btn-xs btn-ghost" data-act="play-none">' +
      E(t('pg.clear')) +
      '</button></div></div>' +
      '<div class="field"><label>' +
      E(t('playground.prompt')) +
      '</label><textarea id="pgPrompt" data-i18n-ph="pg.promptPh" placeholder="' +
      E(t('pg.promptPh')) +
      '">' +
      E(S.playground.prompt) +
      '</textarea></div>' +
      '<div class="row"><button class="btn btn-primary" data-act="play-run"' +
      (S.playground.running ? ' disabled' : '') +
      '>' +
      (S.playground.running ? '<span class="spinner"></span>' : '▶') +
      ' ' +
      E(S.playground.running ? t('pg.running') : t('pg.run')) +
      '</button><span class="muted-2 small">' +
      E(picked.length + ' / ' + runnable.length) +
      '</span></div></div>' +
      (results ? '<div class="section-title">' + E(t('pg.answer')) + '</div><div class="matrix">' + results + '</div>' : '')
    );
  }

  /* ------------------------------------------------------------------ */
  /* 5. Cổng nội bộ                                                      */
  /* ------------------------------------------------------------------ */

  function gatewayView() {
    const gw = snap().gateway || {};
    const cfg = snap().settings.gateway;
    const stats = gw.stats || { requests: 0, ok: 0, fail: 0, routed: {}, failovers: 0 };
    const routed = Object.entries(stats.routed || {})
      .sort((a, b) => b[1] - a[1])
      .map(
        ([id, n]) =>
          '<span class="chip chip-accent">' +
          E((providerById(id) || {}).name || id) +
          ' · ' +
          n +
          '</span>'
      )
      .join(' ');

    const logHtml = (gw.log || [])
      .slice()
      .reverse()
      .map(
        (l) =>
          '<div class="log-line ' +
          E(l.level || 'info') +
          '">' +
          E(new Date(l.ts).toLocaleTimeString() + '  ' + (l.message || JSON.stringify(l))) +
          '</div>'
      )
      .join('');

    const num = (path, label, val) =>
      '<div class="field"><label>' +
      E(label) +
      '</label><input type="number" data-set="' +
      path +
      '" data-set-type="number" value="' +
      E(String(val)) +
      '"></div>';

    return (
      '<div class="grid grid-2">' +
      '<div class="card"><h3>' +
      E(t('gateway.title')) +
      '</h3><p class="card-sub">' +
      E(t('gateway.sub')) +
      '</p>' +
      '<div class="row mb"><span class="chip ' +
      (gw.running ? 'chip-ok' : '') +
      '">' +
      E(gw.running ? t('gateway.on') : t('gateway.off')) +
      '</span>' +
      (gw.running
        ? '<span class="mono small">' +
          E(gw.url || '') +
          '</span><button class="btn btn-xs btn-ghost" data-act="gw-copy-url">' +
          E(t('gw.copyUrl')) +
          '</button><span class="spacer"></span><button class="btn btn-danger btn-xs" data-act="gw-stop">' +
          E(t('gateway.stop')) +
          '</button>'
        : '<span class="spacer"></span><button class="btn btn-primary btn-xs" data-act="gw-start">' +
          E(t('gateway.start')) +
          '</button>') +
      '</div>' +
      '<div class="form-grid">' +
      num('gateway.port', t('gateway.port'), cfg.port) +
      num('gateway.failoverAttempts', t('gateway.failover'), cfg.failoverAttempts) +
      '</div>' +
      '<div class="field"><label>' +
      E(t('gateway.token')) +
      '</label><input type="text" data-set="gateway.token" value="' +
      E(cfg.token || '') +
      '" placeholder="' +
      E(t('misc.none')) +
      '"></div>' +
      '<label class="check mb"><input type="checkbox" data-set="gateway.requireToken" data-set-type="bool"' +
      (cfg.requireToken ? ' checked' : '') +
      '>' +
      E(t('gateway.requireToken')) +
      '</label>' +
      '<label class="check mb"><input type="checkbox" data-set="gateway.recordUsage" data-set-type="bool"' +
      (cfg.recordUsage !== false ? ' checked' : '') +
      '>' +
      E(t('settings.probe') + ' · usage') +
      '</label>' +
      '<p class="tiny muted-2">' +
      E(t('gw.hint')) +
      '</p></div>' +

      '<div style="display:flex;flex-direction:column;gap:14px">' +
      '<div class="card"><h3>' +
      E(t('gateway.stats')) +
      '</h3><div class="grid grid-4">' +
      '<div class="kpi"><div class="kpi-label">' +
      E(t('dashboard.requestsToday')) +
      '</div><div class="kpi-value">' +
      E(U.fmtInt(stats.requests)) +
      '</div></div>' +
      '<div class="kpi"><div class="kpi-label">OK</div><div class="kpi-value">' +
      E(U.fmtInt(stats.ok)) +
      '</div></div>' +
      '<div class="kpi"><div class="kpi-label">Fail</div><div class="kpi-value">' +
      E(U.fmtInt(stats.fail)) +
      '</div></div>' +
      '<div class="kpi"><div class="kpi-label">Failover</div><div class="kpi-value">' +
      E(U.fmtInt(stats.failovers)) +
      '</div></div>' +
      '</div>' +
      (routed ? '<div class="row row-wrap mt" style="gap:6px">' + routed + '</div>' : '') +
      '</div>' +
      '<div class="card"><h3>' +
      E(t('gateway.log')) +
      '</h3><div class="log">' +
      (logHtml || '<div class="log-line">—</div>') +
      '</div></div>' +
      '</div></div>'
    );
  }

  /* ------------------------------------------------------------------ */
  /* 6. Xuất cấu hình                                                    */
  /* ------------------------------------------------------------------ */

  const EXPORT_KINDS = [
    ['env', '.env (OpenAI-compatible)'],
    ['json', 'JSON'],
    ['litellm', 'LiteLLM YAML'],
    ['markdown', 'Markdown'],
    ['csv', 'CSV'],
    ['curl', 'cURL'],
    ['python', 'Python'],
    ['node', 'Node.js'],
    ['gateway', 'Script dùng cổng nội bộ'],
  ];

  function exportView() {
    const S = window.S;
    const o = S.exportOpts;
    const opt = (k, label, hint) =>
      '<label class="check mb"><input type="checkbox" data-act="export-opt" data-key="' +
      k +
      '"' +
      (o[k] ? ' checked' : '') +
      '><span>' +
      E(label) +
      (hint ? ' <span class="tiny muted-2">' + E(hint) + '</span>' : '') +
      '</span></label>';

    return (
      '<div class="grid grid-2">' +
      '<div class="card"><h3>' +
      E(t('export.title')) +
      '</h3><p class="card-sub">' +
      E(t('export.sub')) +
      '</p>' +
      '<div class="field"><label>' +
      E(t('export.kind')) +
      '</label><select data-act="export-kind">' +
      EXPORT_KINDS.map(
        ([k, label]) =>
          '<option value="' + k + '"' + (o.kind === k ? ' selected' : '') + '>' + E(label) + '</option>'
      ).join('') +
      '</select></div>' +
      opt('includeSecrets', t('export.includeSecrets'), t('export.includeSecretsHint')) +
      opt('onlyUsable', t('export.onlyUsable')) +
      opt('requireModels', t('export.requireModels')) +
      '<div class="row mt"><button class="btn btn-primary" data-act="export-preview">' +
      E(t('export.preview')) +
      '</button><button class="btn" data-act="export-save">' +
      E(t('export.save')) +
      '</button></div>' +
      '<div class="section-title">' +
      E(t('export.backup')) +
      '</div>' +
      '<p class="tiny muted-2">' +
      E(t('ex.vaultHint')) +
      '</p>' +
      '<div class="row"><button class="btn btn-xs" data-act="backup">' +
      E(t('export.backup')) +
      '</button><button class="btn btn-xs btn-ghost" data-act="restore">' +
      E(t('export.restore')) +
      '</button></div></div>' +
      '<div class="card"><div class="row"><h3 style="margin:0">' +
      E(t('export.preview')) +
      '</h3><span class="spacer"></span><span class="tiny muted-2" id="exportMeta"></span></div>' +
      '<pre class="code mt" id="exportPreview">' +
      E(window.S.exportPreview || t('misc.loading')) +
      '</pre></div></div>'
    );
  }

  /* ------------------------------------------------------------------ */
  /* 7. Nhật ký                                                          */
  /* ------------------------------------------------------------------ */

  function journalView() {
    const items = (snap().journal || []).slice();
    return (
      '<div class="grid grid-2">' +
      '<div class="card"><h3>' +
      E(t('journal.title')) +
      '</h3><p class="card-sub">' +
      E(t('journal.sub')) +
      '</p>' +
      '<div class="field"><label>' +
      E(t('journal.provider')) +
      '</label><select id="jrProvider"><option value="">' +
      E(t('misc.none')) +
      '</option>' +
      providers()
        .map((p) => '<option value="' + E(p.id) + '">' + E(p.name) + '</option>')
        .join('') +
      '</select></div>' +
      '<div class="field"><label>' +
      E(t('c.notes')) +
      '</label><textarea id="jrText" data-i18n-ph="jr.placeholder2" placeholder="' +
      E(t('jr.placeholder2')) +
      '"></textarea></div>' +
      '<button class="btn btn-primary" data-act="journal-add">' +
      E(t('jr.add')) +
      '</button></div>' +
      '<div class="card"><h3>' +
      E(t('journal.title')) +
      '</h3>' +
      (items.length
        ? items
            .map(
              (j) =>
                '<div class="journal-item"><span class="journal-dot"></span><div style="flex:1"><div class="small">' +
                E(j.text) +
                '</div><div class="tiny muted-2">' +
                E(
                  U.fmtDateTime(j.ts) +
                    (j.providerId && providerById(j.providerId) ? ' · ' + providerById(j.providerId).name : '')
                ) +
                '</div></div><button class="btn btn-xs btn-ghost" data-act="journal-delete" data-id="' +
                E(j.id) +
                '">✕</button></div>'
            )
            .join('')
        : '<p class="muted-2 small">' +
          E(t('journal.empty')) +
          '<br>' +
          E(t('jr.emptyHint')) +
          '</p>') +
      '</div></div>'
    );
  }

  /* ------------------------------------------------------------------ */
  /* 8. Cài đặt                                                          */
  /* ------------------------------------------------------------------ */

  function settingsView() {
    const s = snap().settings;
    const vault = snap().vault || {};
    const num = (path, label, val, step) =>
      '<div class="field"><label>' +
      E(label) +
      '</label><input type="number" data-set="' +
      path +
      '" data-set-type="number"' +
      (step ? ' step="' + step + '"' : '') +
      ' value="' +
      E(String(val)) +
      '"></div>';
    const sw = (path, label, val) =>
      '<label class="check mb"><input type="checkbox" data-set="' +
      path +
      '" data-set-type="bool"' +
      (val ? ' checked' : '') +
      '>' +
      E(label) +
      '</label>';

    const weights = s.score.weights;
    const weightRows = Object.keys(weights)
      .map(
        (k) =>
          '<div class="weight-row"><span class="small">' +
          E(t('d.' + (k === 'quota' ? 'quotaScore' : k), k)) +
          '</span><input type="range" min="0" max="50" data-set="score.weights.' +
          k +
          '" data-set-type="number" value="' +
          weights[k] +
          '"><span class="wval tiny mono">' +
          weights[k] +
          '</span></div>'
      )
      .join('');

    return (
      '<div class="grid grid-2">' +
      '<div class="card"><h3>' +
      E(t('settings.appearance')) +
      '</h3>' +
      '<div class="field"><label>' +
      E(t('settings.language')) +
      '</label><select data-set="language">' +
      '<option value="vi"' +
      (s.language === 'vi' ? ' selected' : '') +
      '>Tiếng Việt</option><option value="en"' +
      (s.language === 'en' ? ' selected' : '') +
      '>English</option></select></div>' +
      '<p class="tiny muted-2">' +
      E(t('st.autoSaved')) +
      '</p>' +

      '<div class="section-title">' +
      E(t('settings.probe')) +
      '</div>' +
      sw('probe.autoEnabled', t('settings.probeAuto'), s.probe.autoEnabled) +
      sw('probe.probeOnStartup', t('settings.probeStartup'), s.probe.probeOnStartup) +
      sw('probe.chatProbe', t('settings.chatProbe'), s.probe.chatProbe) +
      sw('probe.autoWebPrice', t('settings.autoWebPrice'), s.probe.autoWebPrice) +
      '<div class="form-grid">' +
      num('probe.intervalMinutes', t('settings.interval'), s.probe.intervalMinutes) +
      num('probe.timeoutMs', t('settings.timeout'), s.probe.timeoutMs) +
      num('probe.chatMaxTokens', t('settings.chatMaxTokens'), s.probe.chatMaxTokens) +
      num('probe.concurrency', t('settings.concurrency'), s.probe.concurrency) +
      num('probe.windowDays', t('settings.windowDays'), s.probe.windowDays) +
      '</div>' +

      '<div class="section-title">' +
      E(t('settings.privacy')) +
      '</div>' +
      sw('privacy.encryptKeys', t('settings.encryptKeys'), s.privacy.encryptKeys) +
      sw('privacy.maskByDefault', t('settings.maskByDefault'), s.privacy.maskByDefault) +
      '<p class="tiny muted-2">' +
      E(t('settings.vaultState') + ': ' + (vault.backend || '—') + ' · ' + (vault.available ? t('st.vaultOk') : t('st.vaultPlain'))) +
      '</p></div>' +

      '<div style="display:flex;flex-direction:column;gap:14px">' +
      '<div class="card"><h3>' +
      E(t('settings.weights')) +
      '</h3>' +
      weightRows +
      '<div class="section-title">' +
      E(t('settings.speed')) +
      '</div><div class="form-grid">' +
      num('score.speed.bestMs', t('settings.speedBest'), s.score.speed.bestMs) +
      num('score.speed.worstMs', t('settings.speedWorst'), s.score.speed.worstMs) +
      '</div></div>' +

      '<div class="card"><h3>' +
      E(t('settings.data')) +
      '</h3><div class="field"><label>' +
      E(t('settings.dataPath')) +
      '</label><input type="text" value="' +
      E(snap().dataPath || '') +
      '" readonly></div>' +
      '<div class="row"><button class="btn btn-xs" data-act="open-data-folder">' +
      E(t('settings.openFolder')) +
      '</button><button class="btn btn-xs" data-act="probe-all">' +
      E(t('action.probeAll')) +
      '</button><button class="btn btn-xs btn-ghost" data-act="nav" data-view="export">' +
      E(t('st.exportNow')) +
      '</button></div>' +

      '<div class="section-title">' +
      E(t('settings.danger')) +
      '</div><p class="tiny muted-2">' +
      E(t('settings.resetAllHint')) +
      '</p>' +
      '<button class="btn btn-danger btn-xs" data-act="reset-all">' +
      E(t('settings.resetAll')) +
      '</button></div></div></div>'
    );
  }

  /* ------------------------------------------------------------------ */
  /* Drawer chi tiết nhà cung cấp                                        */
  /* ------------------------------------------------------------------ */

  function breakdownBars(s) {
    return Object.keys(s.breakdown)
      .map((k) => {
        const b = s.breakdown[k];
        const label = t('d.' + (k === 'quota' ? 'quotaScore' : k), k);
        if (b.value == null)
          return (
            '<div class="weight-row"><span class="small">' +
            E(label) +
            '</span><span class="tiny muted-2">—</span><span class="tiny mono">w' +
            b.weight +
            '</span></div>'
          );
        return (
          '<div class="weight-row"><span class="small">' +
          E(label) +
          '</span><div class="bar"><i style="width:' +
          Math.round(b.value) +
          '%"></i></div><span class="tiny mono">' +
          Math.round(b.value) +
          '</span></div>'
        );
      })
      .join('');
  }

  /* Sổ cũ lưu nguyên trang HTML của nhà cung cấp trong trường lỗi — bỏ thẻ đi. */
  function cleanDetail(text) {
    const raw = String(text || '');
    if (!/<!doctype|<html|<\/[a-z]+>/i.test(raw)) return raw;
    const plain = raw
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/\s+/g, ' ')
      .trim();
    const code = (raw.match(/error code:?\s*(\d+)/i) || [])[1];
    let out = plain.slice(0, 200);
    if (code) out = (out ? out + ' ' : '') + '(mã lỗi ' + code + ')';
    return out;
  }

  /* Lỗi hiển thị cho người đọc: một câu dễ hiểu, phần kỹ thuật để nhỏ bên dưới.
     Sổ cũ lưu lỗi dạng "kind: nội dung" nên tách lại nếu chưa có trường kind. */
  function lastErrorOf(p) {
    let kind = p.lastErrorKind || '';
    let detail = p.lastError || '';
    if (!kind && detail) {
      const m = /^([a-z_]+):\s*([\s\S]*)$/.exec(detail);
      if (m) {
        kind = m[1];
        detail = m[2];
      }
    }
    if (!kind && !detail) return null;
    return {
      label: kind ? t('err.' + kind, kind) : t('d.lastError'),
      hint: kind ? t('errHint.' + kind, '') : '',
      detail: cleanDetail(detail),
    };
  }

  function providerDrawer(id) {
    const p = providerById(id);
    if (!p) return '<div class="drawer-body">—</div>';
    const s = scoreOf(p.id) || { stats: {}, quota: {}, counts: {}, buckets: [], breakdown: {} };
    const keys = keysOf(p.id);
    const models = modelsOf(p.id);
    const q = p.quota || {};
    const recent = (snap().samples || [])
      .filter((x) => x.providerId === p.id)
      .slice(-6)
      .reverse();

    const lastErr = lastErrorOf(p);
    const keyRows = keys.length
      ? keys
          .map(
            (k) =>
              '<tr><td><div class="small">' +
              E(k.label || k.id) +
              '</div><div class="tiny mono muted-2">' +
              E((k.prefix || '') + '••••' + (k.last4 || '')) +
              (k.encrypted ? ' 🔒' : '') +
              '</div></td><td>' +
              U.stateChip(k.status) +
              '</td><td class="tiny">' +
              E(U.timeAgo(k.lastCheckedAt)) +
              (k.cooldownUntil && new Date(k.cooldownUntil) > new Date()
                ? '<div class="tiny warn">' + E(t('c.cooldown') + ' ' + new Date(k.cooldownUntil).toLocaleTimeString()) + '</div>'
                : '') +
              '</td><td><span class="row" style="gap:3px">' +
              '<button class="btn btn-xs btn-ghost" data-act="key-copy" data-id="' +
              E(k.id) +
              '" title="' +
              E(t('copy.keyHint')) +
              '">📋</button>' +
              '<button class="btn btn-xs btn-ghost" data-act="key-reveal" data-id="' +
              E(k.id) +
              '">👁</button>' +
              '<button class="btn btn-xs btn-ghost" data-act="key-edit" data-id="' +
              E(k.id) +
              '">' +
              E(t('action.edit')) +
              '</button>' +
              '<button class="btn btn-xs btn-ghost" data-act="key-toggle" data-id="' +
              E(k.id) +
              '" data-on="' +
              (k.enabled ? '0' : '1') +
              '">' +
              E(k.enabled ? t('c.disable', 'tắt') : t('c.enable', 'bật')) +
              '</button>' +
              (k.cooldownUntil ? '<button class="btn btn-xs btn-ghost" data-act="key-cool" data-id="' + E(k.id) + '">↺</button>' : '') +
              '<button class="btn btn-xs btn-ghost" data-act="key-delete" data-id="' +
              E(k.id) +
              '">✕</button>' +
              '</span></td></tr>'
          )
          .join('')
      : '<tr><td colspan="4" class="muted-2 small">' + E(t('d.noKeys')) + '</td></tr>';

    const modelRows = models.length
      ? models
          .slice()
          .sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0))
          .map(
            (m) =>
              '<tr><td class="mono tiny">' +
              E(m.modelId) +
              ' ' +
              priceText(m) +
              ' ' +
              priceChip(m) +
              '</td><td class="tiny muted-2">' +
              E(isEndpointSource(m) ? t('models.discovered') : t('models.manual')) +
              '</td><td>' +
              favStar(m) +
              '</td><td class="nowrap" style="width:56px"><span class="switch' +
              (m.enabled !== false ? ' on' : '') +
              '" data-act="model-toggle" data-id="' +
              E(m.id) +
              '" title="' +
              E(m.enabled !== false ? t('models.onHint') : t('models.offHint')) +
              '"><i></i></span></td><td class="nowrap" style="width:78px"><button class="btn btn-xs btn-ghost" data-act="copy-text" data-text="' +
              E(m.modelId) +
              '" data-msg="copy.model" title="' +
              E(t('copy.modelHint')) +
              '">📋</button><button class="btn btn-xs btn-ghost" data-act="model-delete" data-id="' +
              E(m.id) +
              '" title="' +
              E(t('action.delete')) +
              '">✕</button></td></tr>'
          )
          .join('')
      : '<tr><td colspan="5" class="muted-2 small">' + E(t('d.noModels')) + '</td></tr>';

    const errorRows = Object.entries(s.stats.errorKinds || {})
      .map(
        ([k, n]) =>
          '<span class="chip chip-err">' + E(t('err.' + k, k)) + ' · ' + n + '</span>'
      )
      .join(' ');

    const recentRows = recent
      .map(
        (x) =>
          '<div class="log-line ' +
          (x.ok ? 'info' : 'error') +
          '">' +
          E(
            new Date(x.ts).toLocaleTimeString() +
              '  ' +
              x.kind +
              '  ' +
              (x.ok ? 'OK' : x.errorKind || 'fail') +
              '  ' +
              (x.latencyMs ? Math.round(x.latencyMs) + 'ms' : '') +
              (x.message ? '  ' + String(x.message).slice(0, 120) : '')
          ) +
          '</div>'
      )
      .join('');

    const quotaOpts = [
      'unknown',
      'daily-tokens',
      'daily-requests',
      'monthly-tokens',
      'total-credit',
      'trial-window',
      'rate-only',
      'unlimited',
    ]
      .map(
        (x) =>
          '<option value="' + x + '"' + (q.type === x ? ' selected' : '') + '>' + E(t('quota.' + x, x)) + '</option>'
      )
      .join('');

    return (
      '<div class="drawer-head">' +
      gradeBadge(s) +
      '<div style="min-width:0;flex:1"><strong style="font-size:16px">' +
      E(p.name) +
      '</strong><div class="tiny muted-2 mono">' +
      E(p.baseUrl || '—') +
      (p.baseUrl
        ? ' <button class="btn btn-xs btn-ghost copy-mini" data-act="copy-text" data-text="' +
          E(p.baseUrl) +
          '" data-msg="copy.endpoint" title="' +
          E(t('copy.endpointHint')) +
          '">📋</button>'
        : '') +
      '</div><div class="row row-wrap" style="gap:5px;margin-top:6px">' +
      kindChip(p.kind) +
      s.buckets.map(U.bucketChip).join('') +
      '<span class="chip">' +
      E(t('c.auth') + ': ' + (AUTH_LABELS[p.authStyle] || p.authStyle)) +
      '</span></div></div>' +
      '<button class="drawer-close" data-act="drawer-close">✕</button></div>' +

      '<div class="drawer-body">' +
      '<div class="row row-wrap mb">' +
      '<button class="btn btn-primary btn-xs" data-act="probe-one" data-id="' +
      E(p.id) +
      '">' +
      E(t('d.probeNow')) +
      '</button>' +
      '<button class="btn btn-xs" data-act="provider-edit" data-id="' +
      E(p.id) +
      '">' +
      E(t('action.edit')) +
      '</button>' +
      '<button class="btn btn-xs" data-act="provider-duplicate" data-id="' +
      E(p.id) +
      '">' +
      E(t('action.duplicate')) +
      '</button>' +
      '<button class="btn btn-xs" data-act="provider-pin" data-id="' +
      E(p.id) +
      '" data-on="' +
      (p.pinned ? '0' : '1') +
      '">' +
      E(p.pinned ? '📌 ' + t('c.disable', 'bỏ ghim') : '📌 ' + t('c.pinned')) +
      '</button>' +
      '<button class="btn btn-xs" data-act="provider-toggle" data-id="' +
      E(p.id) +
      '" data-on="' +
      (p.enabled === false ? '1' : '0') +
      '">' +
      E(p.enabled === false ? t('c.enable', 'bật') : t('c.disable', 'tắt')) +
      '</button>' +
      '<span class="spacer"></span>' +
      (p.homepage
        ? '<button class="btn btn-xs btn-ghost" data-act="open-link" data-url="' + E(p.homepage) + '">' + E(t('c.homepage')) + '</button>'
        : '') +
      (p.docsUrl
        ? '<button class="btn btn-xs btn-ghost" data-act="open-link" data-url="' + E(p.docsUrl) + '">' + E(t('c.docsUrl')) + '</button>'
        : '') +
      '<button class="btn btn-xs btn-danger" data-act="provider-delete" data-id="' +
      E(p.id) +
      '">✕</button>' +
      '</div>' +

      (lastErr
        ? '<div class="card mb" style="border-color:rgba(248,113,113,.4)"><div class="tiny muted-2">' +
          E(t('d.lastError')) +
          '</div><div class="small"><b>' +
          E(lastErr.label) +
          '</b>' +
          (lastErr.hint ? ' — ' + E(lastErr.hint) : '') +
          '</div>' +
          (lastErr.detail
            ? '<div class="tiny muted-2 mono err-detail" title="' +
              E(lastErr.detail) +
              '">' +
              E(lastErr.detail) +
              '</div>'
            : '') +
          '</div>'
        : '') +

      '<div class="section-title">' +
      E(t('d.stats')) +
      '</div>' +
      '<div class="grid grid-4">' +
      '<div class="kpi"><div class="kpi-label">' +
      E(t('dm.score', 'Điểm')) +
      '</div><div class="kpi-value">' +
      E(String(s.score)) +
      '</div><div class="kpi-foot">' +
      E(U.gradeText(s.grade)) +
      '</div></div>' +
      '<div class="kpi"><div class="kpi-label">' +
      E(t('d.total')) +
      '</div><div class="kpi-value">' +
      E(String(s.stats.total || 0)) +
      '</div><div class="kpi-foot">' +
      E((s.stats.ok || 0) + ' / ' + (s.stats.fail || 0)) +
      '</div></div>' +
      '<div class="kpi"><div class="kpi-label">' +
      E(t('d.p50')) +
      '</div><div class="kpi-value">' +
      E(U.fmtMs(s.stats.p50)) +
      '</div><div class="kpi-foot">' +
      E(t('d.p90') + ' ' + U.fmtMs(s.stats.p90)) +
      '</div></div>' +
      '<div class="kpi"><div class="kpi-label">' +
      E(t('dm.success', 'Thành công')) +
      '</div><div class="kpi-value">' +
      E(s.stats.successRate == null ? '—' : Math.round(s.stats.successRate * 100) + '%') +
      '</div><div class="kpi-foot">' +
      E(t('d.lastOk') + ': ' + U.timeAgo(s.stats.lastOkAt)) +
      '</div></div>' +
      '</div>' +
      (errorRows ? '<div class="row row-wrap mt" style="gap:6px">' + errorRows + '</div>' : '') +
      '<div class="section-title">' +
      E(t('d.breakdown')) +
      '</div>' +
      breakdownBars(s) +

      '<div class="section-title">' +
      E(t('d.quota')) +
      '</div>' +
      '<div class="form-grid">' +
      '<div class="field"><label>' +
      E(t('q.type')) +
      '</label><select data-act="quota-set" data-pid="' +
      E(p.id) +
      '" data-key="type">' +
      quotaOpts +
      '</select></div>' +
      '<div class="field"><label>' +
      E(t('q.amount')) +
      '</label><input type="number" data-act="quota-set" data-pid="' +
      E(p.id) +
      '" data-key="amount" value="' +
      E(String(q.amount || 0)) +
      '"></div>' +
      '<div class="field"><label>' +
      E(t('q.unit')) +
      '</label><select data-act="quota-set" data-pid="' +
      E(p.id) +
      '" data-key="unit"><option value="tokens"' +
      (q.unit !== 'requests' ? ' selected' : '') +
      '>' +
      E(t('q.unitTokens')) +
      '</option><option value="requests"' +
      (q.unit === 'requests' ? ' selected' : '') +
      '>' +
      E(t('q.unitRequests')) +
      '</option></select></div>' +
      '<div class="field"><label>' +
      E(t('q.windowDays')) +
      '</label><input type="number" data-act="quota-set" data-pid="' +
      E(p.id) +
      '" data-key="windowDays" value="' +
      E(String(q.windowDays || 0)) +
      '"></div>' +
      '<div class="field"><label>' +
      E(t('q.manualUsed')) +
      '</label><input type="number" data-act="quota-set" data-pid="' +
      E(p.id) +
      '" data-key="manualUsed" value="' +
      E(String(q.manualUsed || 0)) +
      '"></div>' +
      '<div class="field"><label>' +
      E(t('q.expiresAt')) +
      '</label><input type="date" data-act="quota-set" data-pid="' +
      E(p.id) +
      '" data-key="expiresAt" value="' +
      E(q.expiresAt ? String(q.expiresAt).slice(0, 10) : '') +
      '"></div>' +
      '</div>' +
      '<p class="tiny muted-2">' +
      E(t('q.savedHint')) +
      '</p>' +
      U.quotaText(s.quota) +
      ' ' +
      U.quotaBar(s.quota) +

      '<div class="section-title">' +
      E(t('d.keys')) +
      '<span class="chip">' +
      keys.length +
      '</span><span class="spacer"></span>' +
      '<button class="btn btn-xs" data-act="key-add" data-pid="' +
      E(p.id) +
      '">+ ' +
      E(t('d.addKey')) +
      '</button>' +
      '<button class="btn btn-xs btn-ghost" data-act="key-bulk" data-pid="' +
      E(p.id) +
      '">' +
      E(t('d.addKeyBulk')) +
      '</button>' +
      '</div>' +
      '<table class="table"><tbody>' +
      keyRows +
      '</tbody></table>' +

      '<div class="section-title">' +
      E(t('d.models')) +
      '<span class="chip">' +
      models.length +
      '</span><span class="spacer"></span>' +
      '<button class="btn btn-xs" data-act="model-add" data-pid="' +
      E(p.id) +
      '">+ ' +
      E(t('d.addModel')) +
      '</button>' +
      '<button class="btn btn-xs btn-ghost" data-act="model-bulk" data-pid="' +
      E(p.id) +
      '">' +
      E(t('c.bulkModels')) +
      '</button>' +
      '<button class="btn btn-xs btn-ghost" data-act="model-discover" data-pid="' +
      E(p.id) +
      '" title="' +
      E(t('d.discoverHint')) +
      '">' +
      E(t('d.discoverModels')) +
      '</button>' +
      '<button class="btn btn-xs btn-ghost" data-act="price-web" data-pid="' +
      E(p.id) +
      '" title="' +
      E(t('d.priceWebHint')) +
      '">' +
      E(t('d.priceWeb')) +
      '</button>' +
      '<button class="btn btn-xs btn-ghost" data-act="copy-models" data-id="' +
      E(p.id) +
      '" title="' +
      E(t('copy.modelsHint')) +
      '">📋 ' +
      E(t('copy.all')) +
      '</button>' +
      '</div>' +
      '<table class="table"><tbody>' +
      modelRows +
      '</tbody></table>' +

      '<div class="section-title">' +
      E(t('d.notes')) +
      '</div>' +
      '<div class="field"><label>' +
      E(t('c.quality')) +
      '</label><select data-act="provider-field" data-id="' +
      E(p.id) +
      '" data-key="qualityManual">' +
      [1, 2, 3, 4, 5]
        .map((n) => '<option value="' + n + '"' + (Number(p.qualityManual) === n ? ' selected' : '') + '>' + '★'.repeat(n) + '</option>')
        .join('') +
      '</select></div>' +
      '<div class="field"><label>' +
      E(t('c.priority')) +
      '</label><input type="number" data-act="provider-field" data-id="' +
      E(p.id) +
      '" data-key="priorityBoost" value="' +
      E(String(p.priorityBoost || 0)) +
      '"></div>' +
      '<div class="field"><label>' +
      E(t('c.tags')) +
      '</label><input type="text" data-act="provider-field" data-id="' +
      E(p.id) +
      '" data-key="tags" value="' +
      E((p.tags || []).join(', ')) +
      '"></div>' +
      '<div class="field"><label>' +
      E(t('c.notes')) +
      '</label><textarea data-act="provider-field" data-id="' +
      E(p.id) +
      '" data-key="notes">' +
      E(p.notes || '') +
      '</textarea></div>' +

      '<div class="section-title">' +
      E(t('d.recent')) +
      '</div><div class="log" data-probe-log="1">' +
      (recentRows || '<div class="log-line">—</div>') +
      '</div></div>'
    );
  }

  /* ------------------------------------------------------------------ */
  /* Form                                                                */
  /* ------------------------------------------------------------------ */

  function providerForm(p) {
    const x = p || {
      name: '',
      baseUrl: '',
      kind: 'api',
      category: 'aggregator',
      compat: 'openai',
      authStyle: 'bearer',
      modelsPath: '/models',
      chatPath: '/chat/completions',
      homepage: '',
      docsUrl: '',
      tags: [],
      notes: '',
      quota: { type: 'unknown', amount: 0, unit: 'tokens', windowDays: 0, manualUsed: 0, expiresAt: null },
      qualityManual: 3,
      priorityBoost: 0,
      enabled: true,
      pinned: false,
    };
    const f = (key, label, type, ph) =>
      '<div class="field"><label>' +
      E(label) +
      '</label><input type="' +
      (type || 'text') +
      '" data-f="' +
      key +
      '" value="' +
      E(x[key] == null ? '' : String(x[key])) +
      '"' +
      (ph ? ' placeholder="' + E(ph) + '"' : '') +
      '></div>';
    const sel = (key, label, opts) =>
      '<div class="field"><label>' +
      E(label) +
      '</label><select data-f="' +
      key +
      '">' +
      opts
        .map(([v, l]) => '<option value="' + E(v) + '"' + (x[key] === v ? ' selected' : '') + '>' + E(l) + '</option>')
        .join('') +
      '</select></div>';

    return (
      '<p class="form-hint">' +
      E(t('pr.basicHint')) +
      '</p>' +
      '<div class="form-grid">' +
      f('name', t('c.name')) +
      f('baseUrl', t('c.endpoint'), 'text', 'https://…/v1') +
      '</div>' +
      '<details class="adv"><summary>' +
      E(t('pr.advanced')) +
      '</summary>' +
      '<div class="form-grid">' +
      sel('kind', t('c.kind'), [
        ['api', 'API'],
        ['local', 'Local (Ollama…)'],
        ['web-only', 'Chỉ web / Web only'],
      ]) +
      sel('compat', t('c.compat'), [
        ['openai', 'OpenAI-compatible'],
        ['anthropic', 'Anthropic Messages'],
      ]) +
      sel('authStyle', t('c.auth'), [
        ['bearer', 'Authorization: Bearer'],
        ['x-api-key', 'x-api-key'],
        ['both', 'Bearer + x-api-key'],
        ['query', 'Query param'],
        ['none', 'Không cần key'],
      ]) +
      f('authParam', t('c.authParam'), 'text', 'api_key') +
      f('modelsPath', t('c.modelsPath'), 'text', '/models') +
      f('chatPath', t('c.chatPath'), 'text', '/chat/completions') +
      f('homepage', t('c.homepage')) +
      f('docsUrl', t('c.docsUrl')) +
      f('pricingUrl', t('c.pricingUrl'), 'text', t('c.pricingUrlPh')) +
      f('category', t('c.category')) +
      '<div class="field"><label>' +
      E(t('c.quality')) +
      '</label><select data-f="qualityManual">' +
      [1, 2, 3, 4, 5]
        .map((n) => '<option value="' + n + '"' + (Number(x.qualityManual) === n ? ' selected' : '') + '>' + '★'.repeat(n) + '</option>')
        .join('') +
      '</select></div>' +
      '<div class="field"><label>' +
      E(t('c.priority')) +
      '</label><input type="number" data-f="priorityBoost" value="' +
      E(String(x.priorityBoost || 0)) +
      '"></div>' +
      '</div>' +
      '<div class="field"><label>' +
      E(t('c.extraHeaders')) +
      '</label><textarea data-f="extraHeaders" placeholder="{}">' +
      E(Object.keys(x.extraHeaders || {}).length ? JSON.stringify(x.extraHeaders, null, 2) : '') +
      '</textarea></div>' +
      '<div class="field"><label>' +
      E(t('c.tags')) +
      '</label><input type="text" data-f="tags" value="' +
      E((x.tags || []).join(', ')) +
      '"></div>' +
      '<div class="field"><label>' +
      E(t('c.notes')) +
      '</label><textarea data-f="notes">' +
      E(x.notes || '') +
      '</textarea></div>' +
      '<div class="row">' +
      '<label class="check"><input type="checkbox" data-f="enabled"' +
      (x.enabled !== false ? ' checked' : '') +
      '>' +
      E(t('c.enabled')) +
      '</label>' +
      '<label class="check"><input type="checkbox" data-f="pinned"' +
      (x.pinned ? ' checked' : '') +
      '>' +
      E(t('c.pinned')) +
      '</label></div>' +
      '</details>'
    );
  }

  /* ------------------------------------------------------------------ */
  /* Tách endpoint / key / model từ đoạn curl hoặc URL người dùng dán vào */
  /* ------------------------------------------------------------------ */

  const CHAT_SUFFIX = /\/(chat\/completions|completions|messages|responses|embeddings|models|generatecontent)$/i;

  function normalizeBase(input) {
    let s = String(input || '')
      .trim()
      .replace(/^["'`<]+/, '')
      .replace(/[>"'`,;]+$/, '');
    s = s.replace(/[?#].*$/, '').replace(/\/+$/, '');
    s = s.replace(CHAT_SUFFIX, '').replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(s) && /^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(s)) s = 'https://' + s;
    return s;
  }

  function deriveName(baseUrl) {
    try {
      const host = new URL(baseUrl).hostname.replace(/^(api|www|router|gateway|inference)\./i, '');
      const label = host.split('.')[0] || host;
      return label.charAt(0).toUpperCase() + label.slice(1);
    } catch (e) {
      return '';
    }
  }

  /* Token trần trên một dòng riêng: dài, không dấu chấm, không dấu cách. */
  const SECRET_BARE = /^[A-Za-z0-9_\-+/=]{24,}$/;
  const MODEL_LIKE = /^[A-Za-z0-9][A-Za-z0-9._:\/\-]*$/;
  /* Từ hay gặp trong curl/JSON, không phải tên model. */
  const NOT_MODEL = /^(curl|https?|http|bearer|authorization|content|type|accept|application|json|model|models|messages|message|role|user|system|assistant|text|input|prompt|stream|temperature|top_?p|max_?tokens|max_?completion_?tokens|true|false|null|data|api|key|keys|token|secret|version|anthropic|post|get|put|v1|h|d|m|x)$/i;

  function cleanToken(piece) {
    return String(piece || '')
      .replace(/^["'`(\[{]+/, '')
      .replace(/["'`)\]}.,;]+$/, '')
      .trim();
  }

  function isModelToken(t) {
    if (!t || t.length < 2 || t.length > 64) return false;
    if (/["'{}]/.test(t) || t.indexOf('=') >= 0 || t.indexOf(':') >= 0) return false;
    if (!MODEL_LIKE.test(t) || !/[A-Za-z]/.test(t)) return false;
    /* application/json, text/event-stream… là kiểu dữ liệu, không phải model. */
    if (/^(application|text|multipart|image|audio|video|font)\//i.test(t)) return false;
    return !NOT_MODEL.test(t);
  }

  function parseCurl(text) {
    const out = {
      baseUrl: '',
      name: '',
      secret: '',
      secrets: [],
      model: '',
      models: [],
      authStyle: 'bearer',
      compat: 'openai',
      kind: 'api',
    };
    const rawAll = String(text || '');
    const raw = rawAll.replace(/\\\r?\n/g, ' ').replace(/\r?\n/g, ' ');
    if (!raw.trim()) return out;

    /* --- key: gom TẤT CẢ key tìm thấy, vì một dòng có thể có nhiều key --- */
    const secrets = [];
    const addSecret = (s) => {
      const v = String(s || '').trim();
      if (v && secrets.indexOf(v) < 0) secrets.push(v);
    };
    let m =
      raw.match(/authorization\s*:\s*bearer\s+([A-Za-z0-9._\-]{6,})/i) || raw.match(/bearer\s+([A-Za-z0-9._\-]{6,})/i);
    if (m) {
      addSecret(m[1]);
      out.authStyle = 'bearer';
    } else if ((m = raw.match(/x-api-key\s*["']?\s*[:=]\s*["']?([A-Za-z0-9._\-]{6,})/i))) {
      addSecret(m[1]);
      out.authStyle = 'x-api-key';
    } else if ((m = raw.match(/\b(?:api[_-]?key|apikey|token|secret)\s*["']?\s*[:=]\s*["']?([A-Za-z0-9._\-]{10,})/i))) {
      addSecret(m[1]);
    }
    for (const sk of rawAll.match(/\bsk-[A-Za-z0-9._\-]{8,}/g) || []) addSecret(sk);
    /* Token trần: dài, có chữ số, không dấu chấm — dán cùng hàng vẫn nhận ra. */
    for (const piece of rawAll.split(/[\s,;|]+/)) {
      const t = cleanToken(piece);
      if (!t || t.indexOf('.') >= 0) continue;
      if (SECRET_BARE.test(t) && /[0-9]/.test(t)) addSecret(t);
    }
    out.secrets = secrets;
    out.secret = secrets[0] || '';
    const secretish = (t) => secrets.indexOf(t) >= 0 || /^sk-/i.test(t) || SECRET_BARE.test(t);

    /* --- model: quét từng token nên dán liền một dòng vẫn hiểu đúng --- */
    /* Bỏ thân JSON của curl ({"model":…,"messages":[…]}) trước khi quét token, nếu
       không thì chữ trong đó ("hello", "one sentence"…) bị nhận thành tên model. */
    let cleaned = rawAll.replace(/https?:\/\/\S+/gi, ' ').replace(/\\\r?\n/g, ' ');
    for (let i = 0; i < 2; i++) {
      cleaned = cleaned.replace(/\{[^{}]*\}/g, ' ').replace(/\[[^\[\]]*\]/g, ' ');
    }
    for (const piece of cleaned.split(/[\s,;|]+/)) {
      const t = cleanToken(piece);
      if (!isModelToken(t) || secretish(t)) continue;
      if (out.models.indexOf(t) < 0) out.models.push(t);
    }
    m = raw.match(/"model"\s*:\s*"([^"]+)"/i) || raw.match(/--model[\s=]+["']?([^\s"']+)/i) || raw.match(/\s-m\s+["']?([^\s"']+)/);
    if (m && m[1]) {
      const at = out.models.indexOf(m[1]);
      if (at >= 0) out.models.splice(at, 1);
      out.models.unshift(m[1]);
    }
    out.model = out.models[0] || '';
    if (/anthropic-version/i.test(raw) || /\/v1\/messages/i.test(raw)) {
      out.compat = 'anthropic';
      if (out.authStyle === 'bearer') out.authStyle = 'x-api-key';
    }
    m = raw.match(/https?:\/\/[^\s"'\\)]+/i);
    if (m) out.baseUrl = normalizeBase(m[0]);
    if (!out.baseUrl) {
      m = raw.match(/\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s"']*)?/i);
      if (m) out.baseUrl = normalizeBase(m[0]);
    }
    out.name = deriveName(out.baseUrl);
    return out;
  }

  function quickAddForm() {
    return (
      '<p class="form-hint">' +
      E(t('qa.hint')) +
      '</p>' +
      '<div class="field"><label>' +
      E(t('qa.paste')) +
      '</label><textarea data-f="paste" class="mono" style="min-height:120px" placeholder="' +
      E(t('qa.pastePh')) +
      '"></textarea></div>' +
      '<div id="qaDetect" class="qa-detect"></div>' +
      '<div class="field"><label>' +
      E(t('qa.endpoint')) +
      '</label><input type="text" data-f="baseUrl" class="mono" placeholder="' +
      E(t('qa.endpointPh')) +
      '"></div>' +
      '<div class="field"><label>' +
      E(t('qa.name')) +
      '</label><input type="text" data-f="name" placeholder="' +
      E(t('qa.namePh')) +
      '"></div>' +
      '<label class="check mb"><input type="checkbox" data-f="autoProbe" checked>' +
      E(t('qa.autoProbe')) +
      '</label>'
    );
  }

  function keyForm(providerId, key) {
    return (
      '<div class="field"><label>' +
      E(t('c.label')) +
      '</label><input type="text" data-f="label" value="' +
      E(key ? key.label : '') +
      '" placeholder="Key 1"></div>' +
      '<div class="field"><label>' +
      E(t('c.secret')) +
      (key ? ' <span class="tiny muted-2">(' + E(t('misc.none')) + ' = ' + E(t('action.edit') === 'Sửa' ? 'giữ nguyên' : 'keep current') + ')</span>' : '') +
      '</label><input type="text" data-f="secret" placeholder="sk-…"></div>' +
      (key
        ? '<label class="check"><input type="checkbox" data-f="enabled"' +
          (key.enabled ? ' checked' : '') +
          '>' +
          E(t('c.enabled')) +
          '</label>'
        : '')
    );
  }

  function presetPicker(filter) {
    const presets = snap().presets || [];
    const q = (filter || '').toLowerCase();
    const groups = {};
    for (const p of presets) {
      if (q && !(p.name + ' ' + (p.tags || []).join(' ') + ' ' + p.key).toLowerCase().includes(q)) continue;
      const g = p.kind === 'local' ? 'Local' : p.kind === 'web-only' ? t('pr.webonly') : p.category || 'api';
      (groups[g] = groups[g] || []).push(p);
    }
    return Object.keys(groups)
      .map(
        (g) =>
          '<div class="section-title">' +
          E(g) +
          '</div><div class="row row-wrap" style="gap:6px">' +
          groups[g]
            .map((p) => {
              const exists = providers().some((x) => x.name === p.name);
              return (
                '<button class="btn btn-xs " data-act="preset-pick" data-key="' +
                E(p.key) +
                '"' +
                (exists ? ' disabled' : '') +
                ' title="' +
                E(p.baseUrl || p.homepage || '') +
                '">' +
                E(p.name) +
                (exists ? ' ✓' : '') +
                '</button>'
              );
            })
            .join('') +
          '</div>'
      )
      .join('');
  }

  window.V = {
    dashboard,
    providers: providersView,
    models: modelsView,
    playground: playgroundView,
    gateway: gatewayView,
    exportView,
    journal: journalView,
    settings: settingsView,
    providerDrawer,
    providerForm,
    quickAddForm,
    parseCurl,
    deriveName,
    normalizeBase,
    keyForm,
    presetPicker,
    // truy cập dùng chung
    keysOf,
    modelsOf,
    scoreOf,
    providerById,
    keyById,
    modelById,
    providerList: providers,
    allModels,
    allKeys,
    kindChip,
    gradeBadge,
  };
})();
