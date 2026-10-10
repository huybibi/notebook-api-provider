# Notebook API Provider

Sổ tay quản lý API key cho nhiều nhà cung cấp model miễn phí — tự đo, tự chấm điểm, tự xếp hạng.

Ứng dụng desktop Windows (Electron), không cần Internet để mở sổ, không gửi key đi đâu ngoài chính endpoint bạn khai báo.

---

## Tính năng

### Sổ tay nhà cung cấp
- **Thêm nhanh bằng một lần dán**: dán đoạn `curl` nhà cung cấp đưa (hoặc chỉ URL endpoint) — app tự tách ra base URL, API key, tên model, tự đặt tên theo tên miền, rồi tạo luôn nhà cung cấp + key + model. Không cần điền form.
- **38 preset** dựng sẵn: OpenRouter, Requesty, Groq, Google Gemini, Cerebras, Mistral, Together, DeepSeek, xAI, GitHub Models, Cloudflare Workers AI, Fireworks, SambaNova, Hyperbolic, Novita, SiliconFlow, Zhipu GLM, Moonshot, DashScope Qwen, Cohere, HuggingFace, NVIDIA NIM, Perplexity, DeepInfra, Chutes, Nebius, Kluster, OpenAI, Anthropic, 4 endpoint local (Ollama / LM Studio / llama.cpp / vLLM) và 5 mục chỉ-dùng-web (ChatGPT, Claude, Gemini, DuckDuckGo, Copilot — đánh dấu để bạn không quên chúng không có API).
- Nhiều key cho một nhà cung cấp, mỗi key có nhãn, trạng thái, cooldown, trọng số.
- **Mã hoá key bằng DPAPI** (`safeStorage` của Windows). File dữ liệu không bao giờ chứa key dạng thô; renderer chỉ nhận `last4` / `prefix`. Muốn xem key phải bấm *Hiện* — thao tác này được ghi vào nhật ký.
- Nhập key hàng loạt (mỗi dòng một key), tự phát hiện trùng bằng SHA-256.

### Tự đo và tự xếp hạng
- Quét model qua `GET /models` cho **mọi key đang bật** (rẻ, không tốn token), rồi chỉ chat-probe **một key tốt nhất** để tiết kiệm quota.
- Phân loại lỗi: `unauthorized`, `quota` (hết credit), `rate_limited` (429 tạm thời), `timeout`, `server_error`, `bad_request`, `not_found` — phân biệt quota với rate-limit bằng nội dung thông báo.
- Điểm 0–100 từ 5 thành phần có trọng số chỉnh được:
  | Thành phần | Mặc định | Ý nghĩa |
  |---|---|---|
  | reliability | 30 | tỉ lệ thành công, phạt nặng khi lỗi liên tiếp |
  | speed | 20 | p50 ánh xạ 700 ms → 100 điểm, 8000 ms → 0 |
  | quality | 20 | điểm chất lượng bạn tự chấm (1–5) |
  | quota | 20 | headroom còn lại của hạn mức |
  | stability | 10 | độ dao động latency + tỉ lệ bị rate-limit |
- Xếp hạng **S / A / B / C / D / F** và gắn nhãn tự động: `workhorse`, `lightning`, `premium`, `backup`, `unstable`, `dead`, `exhausted`, `rate_limited`, `local_free`, `web_only`, `no_key`, `fresh`.
- Đo định kỳ (mặc định 60 phút) và đo khi khởi động. Cảnh báo chống trùng lặp trong 6 giờ.

### Giá và nhãn miễn phí lấy từ trang web nhà cung cấp
- Ô **Trang giá** (phần Nâng cao) hoặc nút **Lấy giá từ web** cạnh *Dò model*: app đọc bảng giá rồi điền `input`/`output` cho từng model.
- Ba nguồn đọc theo thứ tự: bảng giá JSON công khai của bản New API/one-api (`<gốc>/api/pricing`), HTML thô, và **cửa sổ ẩn render JavaScript** cho trang dựng bằng SPA.
- Quy đổi đơn vị tự động: bảng ghi `$3 / 1M tokens` được lưu thành `0.000003` mỗi token. Nhãn `free` chỉ đặt khi có bằng chứng ($0 hoặc chữ "free").
- Chip xanh **từ web** cho biết giá đến từ đâu — rê chuột xem địa chỉ trang, nguyên văn dòng giá và thời điểm đọc.
- Giá bạn tự sửa tay (`priceSource: manual`) **không** bị ghi đè. Trang cần đăng nhập thì app báo rõ "yêu cầu đăng nhập (hoặc chặn truy cập tự động)" thay vì im lặng.
- Đọc giá tự động khi thêm model chạy ở chế độ nhanh (không mở cửa sổ ẩn, tối đa 4 s) để không treo thao tác.

### Sao chép nhanh
- 📋 cạnh API key trong ngăn kéo: giải mã trong tiến trình chính rồi ghi thẳng vào clipboard — secret **không** đi qua renderer và không hiện lên màn hình.
- 📋 cạnh endpoint (thẻ nhà cung cấp, đầu ngăn kéo) và cạnh từng model (ngăn kéo, màn hình Model).
- **📋 Tất cả** ở mục Model: chép danh sách model đang bật, mỗi dòng một tên — dán thẳng vào ô `model` của Litellm, Cline, Roo… là chạy.

### Hạn mức
Hỗ trợ 8 kiểu: token/ngày, request/ngày, token/tháng, tổng credit, cửa sổ dùng thử, chỉ giới hạn tốc độ, không giới hạn, và chưa rõ. Có thể khai báo thủ công hoặc để app tự suy ra từ header `x-ratelimit-*` và lịch sử gọi.

### Cổng nội bộ (gateway) — dùng mọi key như một endpoint duy nhất
Bật một HTTP server tại `http://127.0.0.1:8788/v1`:

| Route | Chức năng |
|---|---|
| `GET /health` | trạng thái + top 5 nhà cung cấp |
| `GET /stats` | số request, tỉ lệ lỗi, số lần failover |
| `GET /v1/models` | mọi model dạng `providerId/modelId`, kèm alias `auto` |
| `POST /v1/chat/completions` | chat có **failover tự động** và **stream SSE** |

- `model: "auto"` → tự chọn nhà cung cấp điểm cao nhất còn dùng được.
- `model: "<providerId>/<modelId>"` → chỉ định chính xác.
- Key lỗi bị đưa vào cooldown theo `retry-after` (mặc định 60 s, hết quota thì ≥ 10 phút) và bị loại khỏi các lần định tuyến sau.
- Tuỳ chọn khoá cổng bằng token.

### Playground so sánh
Gửi cùng một prompt tới nhiều nhà cung cấp song song qua cổng nội bộ, xem câu trả lời cạnh nhau kèm latency và usage.

### Xuất cấu hình
`env`, `json`, `litellm`, `markdown`, `csv`, `curl`, `python`, `node`, `gateway` — có tuỳ chọn kèm/lược key, chỉ xuất mục dùng được, chỉ xuất nhà cung cấp đã có model.

### Sao lưu / phục hồi
File backup chứa key **đã mã hoá DPAPI** nên chỉ đọc được trên cùng máy/tài khoản Windows. Phục hồi sẽ thay thế dữ liệu nhà cung cấp/key nhưng giữ nguyên cài đặt hiện tại.

### Nhật ký
Ghi lại thao tác bảo mật (xem secret), sự kiện probe và ghi chú tự do theo từng nhà cung cấp.

### Giao diện
Song ngữ **Việt / Anh** (đổi ngay trên thanh tiêu đề hoặc trong Cài đặt), theme tối, mật độ thoáng/gọn, tìm kiếm nhanh, sắp xếp theo điểm / quota / số key / số model / latency.

---

## Cài đặt và chạy

```powershell
npm install
npm start          # chạy bình thường
npm run dev        # kèm DevTools
```

Đóng gói:

```powershell
npm run dist       # electron-builder, tạo bản portable + NSIS trong dist/
```

Yêu cầu: Windows 10/11, Node.js 20 trở lên. Bản đóng gói không cần Node.

---

## Dữ liệu lưu ở đâu

```
%APPDATA%\notebook-api-provider\notebook.json
```

Ghi kiểu atomic (file tạm + rename), luôn giữ một bản `.backup.json`. Menu **Notebook → Mở thư mục dữ liệu** để mở nhanh.

---

## Dùng cổng nội bộ từ ứng dụng khác

```powershell
curl http://127.0.0.1:8788/v1/chat/completions `
  -H "Content-Type: application/json" `
  -d '{\"model\":\"auto\",\"messages\":[{\"role\":\"user\",\"content\":\"xin chào\"}]}'
```

Ví dụ Python:

```python
from openai import OpenAI
client = OpenAI(base_url="http://127.0.0.1:8788/v1", api_key="not-needed")
print(client.chat.completions.create(
    model="auto",
    messages=[{"role": "user", "content": "xin chào"}],
).choices[0].message.content)
```

---

## Cấu trúc mã nguồn

```
src/
  main/
    main.js       tiến trình chính, cửa sổ, menu, lịch đo định kỳ
    store.js      lưu trữ JSON, usage, sample, cảnh báo, nhật ký
    vault.js      mã hoá DPAPI, fingerprint, che key
    presets.js    38 preset nhà cung cấp + mẫu hạn mức
    probe.js      gọi /models và /chat/completions, phân loại lỗi, đọc rate-limit, đọc bảng giá trên trang web
    render.js     cửa sổ ẩn nạp trang giá dựng bằng JavaScript
    scoring.js    thống kê, hạn mức, chấm điểm, xếp hạng, chọn key
    gateway.js    HTTP server nội bộ, failover, stream SSE
    ipc.js        toàn bộ kênh IPC
    exporter.js   sinh env/json/litellm/markdown/csv/curl/python/node
  preload/preload.js   contextBridge (contextIsolation + sandbox)
  renderer/
    index.html, styles.css
    i18n.js   từ điển vi/en
    util.js   định dạng, toast, modal, drawer
    views.js  nội dung 8 màn hình
    app.js    trạng thái, định tuyến, xử lý sự kiện
tools/
  smoke.js    harness kiểm tra tự động (không cần nhìn màn hình)
```

Renderer chạy với `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false` và CSP `script-src 'self'` — không có inline script, mọi tương tác đi qua uỷ nhiệm sự kiện `data-act`.

---

## Phát triển

```powershell
npm install
node node_modules\electron\install.js      # chỉ cần nếu node_modules\electron\dist trống
npm start                                   # hoặc: node_modules\electron\dist\electron.exe .
```

Kiểm tra tự động: harness nạp cửa sổ thật, chạy hai lượt (gọi thẳng kênh IPC, rồi nạp lại và bấm nút như người dùng — tạo nhà cung cấp, thêm key, sửa quota, bật/tắt, ghim, đo, cổng nội bộ, playground, xuất, nhật ký, đổi ngôn ngữ, tìm kiếm, xoá) và in báo cáo JSON. Nó dùng thư mục dữ liệu tạm nên không đụng sổ thật; thoát 0 khi mọi thứ đạt.

```powershell
node_modules\electron\dist\electron.exe tools\smoke.js
```

---

## Ghi chú

- Nhà cung cấp "chỉ web" không có API vẫn được lưu để bạn nhớ mà dùng thủ công; app không cố gọi chúng.
- Hạn mức miễn phí thay đổi liên tục nên app **không** seed sẵn quota hay danh sách model — nó để trống cho bạn điền hoặc tự đo.
- Endpoint nào còn `{placeholder}` (ví dụ `{account_id}` của Cloudflare) sẽ bị từ chối khi đo kèm thông báo cấu hình.
