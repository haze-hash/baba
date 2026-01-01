# 📖 听书 · AI说书人

一款 H5 听书应用，上传 PDF 书籍，AI 帮你把它讲成引人入胜的故事。

## ✨ 功能特点

- **PDF 转说书稿**：上传 PDF，AI 以"说书人"风格生成结构化脚本
- **两种朗读模式**：
  - 浏览器 speechSynthesis（零成本）
  - OpenAI TTS（高质量音频）
- **逐段播放**：支持分段高亮、点击跳转
- **PWA 支持**：可添加到主屏幕，获得 App 体验

## 🏗️ 项目结构

```
audiobook-app/
├── server.js           # Express 后端服务
├── package.json        # 项目依赖
├── .env.example        # 环境变量示例
├── README.md           # 说明文档
└── public/             # 前端静态文件
    ├── index.html      # 主页面
    ├── styles.css      # 样式表
    ├── app.js          # 前端逻辑
    ├── manifest.json   # PWA 配置
    ├── sw.js           # Service Worker
    ├── icon-192.png    # 图标 192x192
    └── icon-512.png    # 图标 512x512
```

## 🚀 快速开始

### 1. 安装依赖

```bash
cd audiobook-app
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env` 文件，填入你的 OpenAI API Key：

```env
OPENAI_API_KEY=sk-your-api-key-here
```

### 3. 启动服务

```bash
npm start
# 或
node server.js
```

### 4. 访问应用

打开浏览器访问：`http://localhost:3000`

## ⚙️ 配置选项

所有配置项都在 `.env` 文件中：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `OPENAI_API_KEY` | OpenAI API 密钥 | 必填 |
| `PORT` | 服务端口 | 3000 |
| `HOST` | 服务地址 | localhost |
| `MAX_FILE_SIZE` | 最大文件大小（字节） | 26214400 (25MB) |
| `RATE_LIMIT_MAX` | 每分钟最大请求数 | 10 |
| `OPENAI_MODEL` | 使用的模型 | gpt-4o |
| `TTS_VOICE` | TTS 声音 | onyx |
| `TTS_MODEL` | TTS 模型 | tts-1-hd |
| `TTS_FORMAT` | 音频格式 | mp3 |

## 📡 API 接口

### POST /api/summarize-book

上传 PDF 并生成说书稿。

**请求**：`multipart/form-data`
- `file`: PDF 文件

**响应**：
```json
{
  "success": true,
  "data": {
    "title": "说书标题",
    "hook": "开场钩子",
    "summary": "一句话总结",
    "story": [
      {
        "section": "章节标题",
        "content": "说书内容"
      }
    ],
    "key_takeaways": ["要点1", "要点2"],
    "actionable_steps": ["行动1", "行动2"],
    "glossary": [{"term": "术语", "explanation": "解释"}],
    "duration_estimate": "预计时长"
  }
}
```

### POST /api/tts

文本转语音（OpenAI TTS）。

**请求**：`application/json`
```json
{
  "text": "要转换的文本",
  "voice": "onyx",    // 可选
  "format": "mp3"     // 可选
}
```

**响应**：二进制音频流

## 🔧 OpenAI API 说明

### 使用的 Endpoints

1. **Chat Completions API**
   - Endpoint: `POST https://api.openai.com/v1/chat/completions`
   - 用途：生成说书稿
   - 文档：https://platform.openai.com/docs/api-reference/chat

2. **Audio Speech API (TTS)**
   - Endpoint: `POST https://api.openai.com/v1/audio/speech`
   - 用途：高质量语音合成
   - 文档：https://platform.openai.com/docs/api-reference/audio/createSpeech

### PDF 处理方案对比

本项目使用 **Base64 直接输入** 方案：

| 方案 | 优点 | 缺点 |
|------|------|------|
| **Files API 上传** | 可复用，适合大文件 | 需要额外 API 调用，有存储成本 |
| **Base64 直接输入** ✓ | 简单直接，一次调用完成 | 文件大小受限（约 20MB） |

选择 Base64 的理由：
- 用户通常只处理一次书籍
- 避免文件存储管理
- 简化代码逻辑

### 可调参数

在 `server.js` 中标记了 `【可替换模型】` 和 `【可调参数】`：

```javascript
// 【可替换模型】推荐: gpt-4o (最佳), gpt-4o-mini (性价比)
model: CONFIG.openaiModel,

// 【可调参数】最大输出 token
max_tokens: 8000,

// 【可调参数】创造性程度 (0-2，越高越有创意)
temperature: 0.8,

// 【可调参数】TTS 声音: alloy, echo, fable, onyx, nova, shimmer
voice: CONFIG.ttsVoice,
```

## 🎨 说书风格

系统 Prompt 定义了"说书人"风格：

- **口吻特点**：像老茶馆里的说书先生
- **转折词**：话说、且说、却不知、这便是
- **结构**：开场钩子 → 概括全书 → 关键故事 → 要点总结

## 📱 PWA 支持

应用支持添加到主屏幕：

1. 在移动端访问应用
2. 点击浏览器"添加到主屏幕"
3. 享受 App 般的体验

## 🔒 安全措施

- ✅ API Key 仅存于服务端 `.env`，不暴露给浏览器
- ✅ 文件大小限制（默认 25MB）
- ✅ 请求速率限制（默认 10次/分钟）
- ✅ 文件类型校验（仅允许 PDF）

## 📝 开发建议

### 本地开发

```bash
# 开发模式（可配合 nodemon）
npm install -g nodemon
nodemon server.js
```

### 部署到服务器

1. 使用 PM2 管理进程：
```bash
npm install -g pm2
pm2 start server.js --name audiobook
```

2. 配置反向代理（Nginx）：
```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
}
```

## 🐛 常见问题

**Q: 文件上传失败**
A: 检查文件大小是否超过 25MB，或调整 `MAX_FILE_SIZE` 环境变量

**Q: TTS 没有声音**
A: 浏览器可能需要用户交互才能播放音频，请点击播放按钮

**Q: 生成速度慢**
A: 这取决于 PDF 大小和 OpenAI API 响应速度，通常需要 30-60 秒

## 📄 License

MIT
