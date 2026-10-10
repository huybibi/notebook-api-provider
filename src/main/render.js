/* Mở một trang trong cửa sổ ẨN rồi lấy HTML sau khi JavaScript đã chạy.
   Nhiều trang giá của các router là ứng dụng một trang (SPA): HTML thô chỉ là
   khung rỗng, đọc thẳng sẽ không thấy giá nào. Cửa sổ dùng phiên riêng nên không
   dính cookie/đăng nhập của ứng dụng. */
const { BrowserWindow } = require('electron');

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

/* Chỉ mở một cửa sổ tại một thời điểm: app có thể gọi đọc giá cho nhiều nhà cung
   cấp cùng lúc (ví dụ khi bật "tự đọc giá" cho từng nhà cung cấp). */
let chain = Promise.resolve();

async function captureHtml(url, options) {
  const opts = options || {};
  const budgetMs = Math.max(4000, Number(opts.timeoutMs) || 20000);
  const started = Date.now();
  let win = null;
  try {
    win = new BrowserWindow({
      show: false,
      width: 1280,
      height: 900,
      webPreferences: {
        javascript: true,
        images: false,
        sandbox: true,
        contextIsolation: true,
        partition: 'persist:notebook-price',
      },
    });
    win.loadURL(url).catch(() => {});
    let html = '';
    let prev = '';
    let stable = 0;
    while (Date.now() - started < budgetMs) {
      await delay(700);
      html = await win.webContents.executeJavaScript('document.documentElement.outerHTML').catch(() => '');
      if (!html) continue;
      if (html === prev) {
        stable++;
        if (stable >= 2) break;
      } else {
        stable = 0;
        prev = html;
      }
    }
    return html;
  } catch (_) {
    return '';
  } finally {
    if (win) {
      try {
        win.destroy();
      } catch (_) {}
    }
  }
}

function renderHtml(url, options) {
  const run = () => captureHtml(url, options);
  const next = chain.then(run, run);
  chain = next.catch(() => {});
  return next;
}

module.exports = { renderHtml };
