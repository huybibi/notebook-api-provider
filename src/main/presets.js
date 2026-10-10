'use strict';

/**
 * presets.js — Danh mục nhà cung cấp gợi ý sẵn.
 *
 * QUAN TRỌNG: đây là template, KHÔNG phải hợp đồng.
 * - baseUrl/authStyle lấy theo tài liệu OpenAI-compatible phổ biến.
 * - Hạn mức (quota) KHÔNG được seed cứng vì thay đổi liên tục: tất cả để 'unknown'
 *   và người dùng tự điền, hoặc app tự đo qua header rate-limit / thống kê sử dụng.
 *
 * Mọi trường đều sửa được trong app.
 */

// [key, name, baseUrl, authStyle, kind, category, homepage, docsUrl, compat, tags, notes]
const RAW = [
  ['openrouter', 'OpenRouter', 'https://openrouter.ai/api/v1', 'bearer', 'api', 'aggregator', 'https://openrouter.ai', 'https://openrouter.ai/docs', 'openai', ['aggregator', 'free-models'], 'Model miễn phí có hậu tố ":free". Có header rate-limit để app đọc.'],
  ['requesty', 'Requesty', 'https://router.requesty.ai/v1', 'bearer', 'api', 'aggregator', 'https://requesty.ai', 'https://docs.requesty.ai', 'openai', ['aggregator'], 'Tính theo SỐ LƯỢT GỌI, không theo token.'],
  ['groq', 'Groq', 'https://api.groq.com/openai/v1', 'bearer', 'api', 'first-party', 'https://groq.com', 'https://console.groq.com/docs', 'openai', ['fast', 'free-tier'], 'Rất nhanh, có free tier theo ngày.'],
  ['google-gemini', 'Google AI Studio (Gemini)', 'https://generativelanguage.googleapis.com/v1beta/openai', 'bearer', 'api', 'first-party', 'https://aistudio.google.com', 'https://ai.google.dev/gemini-api/docs/openai', 'openai', ['free-tier', 'vision'], 'Free tier theo ngày cho từng model.'],
  ['cerebras', 'Cerebras', 'https://api.cerebras.ai/v1', 'bearer', 'api', 'first-party', 'https://cerebras.ai', 'https://inference-docs.cerebras.ai', 'openai', ['fast', 'free-tier'], 'Inference cực nhanh.'],
  ['mistral', 'Mistral AI', 'https://api.mistral.ai/v1', 'bearer', 'api', 'first-party', 'https://mistral.ai', 'https://docs.mistral.ai', 'openai', ['free-tier'], 'Có tier miễn phí "Experiment".'],
  ['together', 'Together AI', 'https://api.together.xyz/v1', 'bearer', 'api', 'aggregator', 'https://together.ai', 'https://docs.together.ai', 'openai', ['free-models'], 'Một số model nhỏ miễn phí.'],
  ['deepseek', 'DeepSeek', 'https://api.deepseek.com/v1', 'bearer', 'api', 'first-party', 'https://deepseek.com', 'https://api-docs.deepseek.com', 'openai', ['cheap', 'reasoning'], 'Rẻ, không phải free tier.'],
  ['xai', 'xAI (Grok)', 'https://api.x.ai/v1', 'bearer', 'api', 'first-party', 'https://x.ai', 'https://docs.x.ai', 'openai', ['credits'], 'Thường tặng credit ban đầu.'],
  ['github-models', 'GitHub Models', 'https://models.github.ai/inference', 'bearer', 'api', 'aggregator', 'https://github.com/marketplace/models', 'https://docs.github.com/en/github-models', 'openai', ['free-tier', 'rate-limited'], 'Miễn phí theo rate-limit của GitHub account.'],
  ['cloudflare-workers-ai', 'Cloudflare Workers AI', 'https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1', 'bearer', 'api', 'first-party', 'https://developers.cloudflare.com/workers-ai/', 'https://developers.cloudflare.com/workers-ai/', 'openai', ['free-tier'], 'Thay {account_id} bằng account ID của bạn.'],
  ['fireworks', 'Fireworks AI', 'https://api.fireworks.ai/inference/v1', 'bearer', 'api', 'aggregator', 'https://fireworks.ai', 'https://docs.fireworks.ai', 'openai', ['credits'], ''],
  ['sambanova', 'SambaNova', 'https://api.sambanova.ai/v1', 'bearer', 'api', 'first-party', 'https://sambanova.ai', 'https://docs.sambanova.ai', 'openai', ['fast', 'free-tier'], 'Free tier cho developer.'],
  ['hyperbolic', 'Hyperbolic', 'https://api.hyperbolic.xyz/v1', 'bearer', 'api', 'aggregator', 'https://hyperbolic.xyz', 'https://docs.hyperbolic.xyz', 'openai', ['credits'], ''],
  ['novita', 'Novita AI', 'https://api.novita.ai/v3/openai', 'bearer', 'api', 'aggregator', 'https://novita.ai', 'https://novita.ai/docs', 'openai', ['credits'], ''],
  ['siliconflow', 'SiliconFlow', 'https://api.siliconflow.cn/v1', 'bearer', 'api', 'aggregator', 'https://siliconflow.cn', 'https://docs.siliconflow.cn', 'openai', ['free-models'], 'Nhiều model nhỏ miễn phí.'],
  ['zhipu-glm', 'Zhipu GLM', 'https://open.bigmodel.cn/api/paas/v4', 'bearer', 'api', 'first-party', 'https://zhipuai.cn', 'https://docs.bigmodel.cn', 'openai', ['free-models'], 'Có model flash miễn phí.'],
  ['moonshot', 'Moonshot (Kimi)', 'https://api.moonshot.cn/v1', 'bearer', 'api', 'first-party', 'https://moonshot.cn', 'https://platform.moonshot.cn/docs', 'openai', ['long-context'], ''],
  ['dashscope-qwen', 'Alibaba DashScope (Qwen)', 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', 'bearer', 'api', 'first-party', 'https://dashscope.aliyun.com', 'https://help.aliyun.com/zh/dashscope/', 'openai', ['free-quota'], 'Bản quốc tế dùng dashscope-intl.'],
  ['cohere', 'Cohere', 'https://api.cohere.ai/compatibility/v1', 'bearer', 'api', 'first-party', 'https://cohere.com', 'https://docs.cohere.com', 'openai', ['trial-key'], 'Trial key có hạn theo tháng.'],
  ['huggingface', 'Hugging Face Router', 'https://router.huggingface.co/v1', 'bearer', 'api', 'aggregator', 'https://huggingface.co', 'https://huggingface.co/docs/inference-providers', 'openai', ['free-tier', 'credits'], 'Free credit theo tháng cho account.'],
  ['nvidia-nim', 'NVIDIA NIM', 'https://integrate.api.nvidia.com/v1', 'bearer', 'api', 'first-party', 'https://build.nvidia.com', 'https://docs.nvidia.com/nim/', 'openai', ['free-credits'], 'build.nvidia.com tặng credit.'],
  ['perplexity', 'Perplexity', 'https://api.perplexity.ai', 'bearer', 'api', 'first-party', 'https://perplexity.ai', 'https://docs.perplexity.ai', 'openai', ['search'], 'Có search online trong model.'],
  ['deepinfra', 'DeepInfra', 'https://api.deepinfra.com/v1/openai', 'bearer', 'api', 'aggregator', 'https://deepinfra.com', 'https://deepinfra.com/docs', 'openai', ['credits'], ''],
  ['chutes', 'Chutes', 'https://llm.chutes.ai/v1', 'bearer', 'api', 'aggregator', 'https://chutes.ai', 'https://docs.chutes.ai', 'openai', ['free-models'], 'Nhiều model open-weight miễn phí.'],
  ['nebius', 'Nebius AI Studio', 'https://api.studio.nebius.ai/v1', 'bearer', 'api', 'aggregator', 'https://nebius.com', 'https://docs.nebius.com', 'openai', ['free-credits'], ''],
  ['kluster', 'Kluster.ai', 'https://api.kluster.ai/v1', 'bearer', 'api', 'aggregator', 'https://kluster.ai', 'https://docs.kluster.ai', 'openai', ['credits'], ''],
  ['openai', 'OpenAI', 'https://api.openai.com/v1', 'bearer', 'api', 'first-party', 'https://openai.com', 'https://platform.openai.com/docs', 'openai', ['paid'], 'Không có free tier, dùng để so sánh.'],
  ['anthropic', 'Anthropic Claude', 'https://api.anthropic.com/v1', 'x-api-key', 'api', 'first-party', 'https://anthropic.com', 'https://docs.anthropic.com', 'anthropic', ['paid'], 'API KHÔNG tương thích OpenAI. App chỉ test bằng /v1/models.'],
  ['ollama-local', 'Ollama (máy local)', 'http://localhost:11434/v1', 'none', 'local', 'local', 'https://ollama.com', 'https://github.com/ollama/ollama/blob/main/docs/openai.md', 'openai', ['local', 'unlimited'], 'Miễn phí vô hạn, chạy trên máy bạn.'],
  ['lmstudio-local', 'LM Studio (máy local)', 'http://localhost:1234/v1', 'none', 'local', 'local', 'https://lmstudio.ai', 'https://lmstudio.ai/docs/local-server', 'openai', ['local', 'unlimited'], 'Bật Local Server trong LM Studio.'],
  ['llamacpp-local', 'llama.cpp server (local)', 'http://localhost:8080/v1', 'none', 'local', 'local', 'https://github.com/ggml-org/llama.cpp', 'https://github.com/ggml-org/llama.cpp/tree/master/tools/server', 'openai', ['local', 'unlimited'], ''],
  ['vllm-local', 'vLLM (local)', 'http://localhost:8000/v1', 'none', 'local', 'local', 'https://docs.vllm.ai', 'https://docs.vllm.ai', 'openai', ['local', 'unlimited'], ''],
  ['web-chatgpt', 'ChatGPT (web, không API)', '', 'none', 'web-only', 'web', 'https://chatgpt.com', '', 'none', ['web-only'], 'Chỉ dùng được trên web — không có endpoint API cho key cá nhân.'],
  ['web-claude', 'Claude.ai (web, không API)', '', 'none', 'web-only', 'web', 'https://claude.ai', '', 'none', ['web-only'], 'Gói subscription không kèm API key.'],
  ['web-gemini', 'Gemini (web, không API)', '', 'none', 'web-only', 'web', 'https://gemini.google.com', '', 'none', ['web-only'], 'Dùng AI Studio để lấy API key thay thế.'],
  ['web-duckduckgo', 'DuckDuckGo AI Chat (web)', 'https://duckduckgo.com/?q=DuckDuckGo+AI+Chat', 'none', 'web-only', 'web', 'https://duckduckgo.com/aichat', '', 'none', ['web-only', 'anonymous'], 'Miễn phí ẩn danh nhưng không có API chính thức.'],
  ['web-copilot', 'Microsoft Copilot (web)', 'https://copilot.microsoft.com', 'none', 'web-only', 'web', 'https://copilot.microsoft.com', '', 'none', ['web-only'], ''],
];

function buildPreset(row) {
  const [key, name, baseUrl, authStyle, kind, category, homepage, docsUrl, compat, tags, notes] = row;
  return {
    key,
    name,
    baseUrl,
    authStyle,
    kind,
    category,
    homepage,
    docsUrl,
    compat,
    tags: tags || [],
    notes: notes || '',
  };
}

const PRESETS = RAW.map(buildPreset);

/** Mẫu hạn mức để UI đổ nhanh vào form. */
const QUOTA_TEMPLATES = [
  { key: 'daily-tokens', type: 'daily-tokens', unit: 'tokens', windowDays: 1, label: 'Token miễn phí mỗi ngày' },
  { key: 'daily-requests', type: 'daily-requests', unit: 'requests', windowDays: 1, label: 'Số request mỗi ngày' },
  { key: 'monthly-tokens', type: 'monthly-tokens', unit: 'tokens', windowDays: 30, label: 'Token mỗi tháng' },
  { key: 'total-credit', type: 'total-credit', unit: 'tokens', windowDays: 0, label: 'Credit dùng 1 lần, không hết hạn' },
  { key: 'trial-window', type: 'trial-window', unit: 'tokens', windowDays: 14, label: 'Miễn phí có thời hạn' },
  { key: 'rate-only', type: 'rate-only', unit: 'requests', windowDays: 1, label: 'Chỉ giới hạn tốc độ (RPM/RPD)' },
  { key: 'unlimited', type: 'unlimited', unit: 'none', windowDays: 0, label: 'Không giới hạn (local / đã trả tiền)' },
  { key: 'unknown', type: 'unknown', unit: 'none', windowDays: 0, label: 'Chưa rõ / cần tự đo' },
];

module.exports = { PRESETS, QUOTA_TEMPLATES };
