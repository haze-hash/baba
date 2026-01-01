/**
 * 听书应用后端服务
 * 
 * API Endpoints:
 * - POST /api/summarize-book: 上传 PDF，返回说书稿 JSON
 * - POST /api/tts: 文本转语音（OpenAI TTS）
 * 
 * OpenAI API 使用说明:
 * 1. Chat Completions API: https://platform.openai.com/docs/api-reference/chat
 *    - Endpoint: POST https://api.openai.com/v1/chat/completions
 *    - 用于生成说书稿
 * 
 * 2. Audio TTS API: https://platform.openai.com/docs/api-reference/audio/createSpeech
 *    - Endpoint: POST https://api.openai.com/v1/audio/speech
 *    - 用于高质量语音合成
 */

require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const OpenAI = require('openai');
const path = require('path');
const fs = require('fs');

const app = express();

// ============================================
// 配置项 (可在 .env 中调整)
// ============================================
const CONFIG = {
  port: process.env.PORT || 3000,
  host: process.env.HOST || 'localhost',
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 25 * 1024 * 1024, // 25MB
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX) || 10,
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
  // 【可替换模型】推荐 gpt-5.2 (最新最强) 或 gpt-4o (稳定)
  openaiModel: process.env.OPENAI_MODEL || 'gpt-5.2',
  // 【可调参数】TTS 配置
  ttsVoice: process.env.TTS_VOICE || 'onyx',
  ttsModel: process.env.TTS_MODEL || 'tts-1-hd',
  ttsFormat: process.env.TTS_FORMAT || 'mp3',
};

// ============================================
// OpenAI 客户端初始化
// ============================================
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ============================================
// 中间件配置
// ============================================

// CORS 配置 - 允许前端跨域访问
app.use(cors({
  origin: true, // 开发环境允许所有源，生产环境应限制
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
}));

// JSON 解析
app.use(express.json({ limit: '10mb' }));

// 静态文件服务 - 提供前端 H5
app.use(express.static(path.join(__dirname, 'public')));

// 速率限制 - 简单内存计数
const limiter = rateLimit({
  windowMs: CONFIG.rateLimitWindowMs,
  max: CONFIG.rateLimitMax,
  message: {
    error: '请求过于频繁，请稍后再试',
    retryAfter: Math.ceil(CONFIG.rateLimitWindowMs / 1000),
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', limiter);

// Multer 配置 - 文件上传
const upload = multer({
  storage: multer.memoryStorage(), // 使用内存存储，避免写入磁盘
  limits: {
    fileSize: CONFIG.maxFileSize,
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('只支持 PDF 文件'), false);
    }
  },
});

// ============================================
// 说书人 Prompt (核心提示词)
// ============================================
const STORYTELLER_SYSTEM_PROMPT = `你是"爸爸说书"——一位温暖、智慧、幽默的父亲，正在给孩子讲睡前故事。

【你的身份】
你不是在"读书"或"总结书"，你是在讲一个精彩的故事。就像小时候爸爸坐在床边，把一本厚厚的书变成一个个生动有趣的冒险故事，让孩子听得入迷，不知不觉就学到了道理。

【说书风格】
1. 温暖亲切的语气：
   - 像爸爸跟孩子聊天："来，今天爸爸给你讲个特别有意思的故事..."
   - 适时加入口语化表达："你猜怎么着？"、"说到这儿，有意思的来了..."、"诶，你发现没有..."
   - 偶尔用反问引起思考："你说，换作是你，会怎么做呢？"
   
2. 故事化叙述：
   - 把知识点变成故事情节，有人物、有场景、有冲突、有转折
   - 用生活中的例子类比抽象概念："这就好比你玩乐高的时候..."
   - 加入画面感描写，让听众"看到"故事
   - 制造小悬念和惊喜："但是！事情并没有这么简单..."

3. 娓娓道来的节奏：
   - 不急不躁，像讲睡前故事一样从容
   - 重要的地方放慢，用"记住哦"、"这个很关键"来强调
   - 段落之间有自然过渡："好，故事讲到这里，我们来看看接下来发生了什么..."

4. 寓教于乐：
   - 道理要藏在故事里，不是生硬地说教
   - 用幽默化解枯燥："听起来很高大上对吧？其实说白了就是..."
   - 复杂的东西用大白话解释，五岁小孩也能懂

【绝对不要】
- ❌ 不要复述原文、不要学术腔
- ❌ 不要说"本书讲述了..."、"作者认为..."这种总结式语言
- ❌ 不要罗列要点，要把要点编进故事里
- ❌ 不要枯燥乏味，要让人听得津津有味

【输出格式】
你必须输出严格的 JSON 格式：

{
  "title": "给这个故事起个吸引人的名字（不是书名）",
  "hook": "开场白（像爸爸开始讲故事：'今天给你讲个特别棒的故事...' 1-2句话，制造期待感）",
  "summary": "用一句话告诉听众这个故事讲的是什么（口语化）",
  "story": [
    {
      "section": "这一段故事的小标题（有趣的）",
      "content": "故事内容（400-600字）。要像爸爸讲故事一样，有场景、有人物、有情节、有转折。把书里的道理融入故事中，让人听完故事就自然明白了道理。语气温暖，节奏舒缓，适合睡前听。"
    }
  ],
  "key_takeaways": [
    "用故事化的方式总结：'记住哦，这个故事告诉我们...'",
    "像爸爸叮嘱孩子一样：'以后遇到这种情况，你可以...'",
    "..."
  ],
  "actionable_steps": [
    "明天就能做的小事（口语化：'明天试试看...'）",
    "..."
  ],
  "bedtime_wisdom": "结尾寄语（像爸爸说的睡前叮嘱：'好啦，故事讲完了。记住今天的故事哦，晚安...'）",
  "duration_estimate": "预计收听时长"
}

【重要提醒】
- story 数组控制在 3-6 个章节，每章节像一个小故事
- key_takeaways 控制在 3-5 条，要口语化
- actionable_steps 控制在 2-4 条，简单可执行
- bedtime_wisdom 是必须的，要温暖治愈
- 全程用"爸爸讲故事"的语气，温暖、有趣、不说教
- 只输出 JSON，不要有任何其他文字`;

// ============================================
// API: 上传 PDF 并生成说书稿
// ============================================
/**
 * POST /api/summarize-book
 * 
 * 请求: multipart/form-data
 * - file: PDF 文件
 * 
 * 响应: JSON
 * - success: boolean
 * - data: 说书稿 JSON 对象
 * - progress: 处理阶段信息
 * 
 * OpenAI API 调用说明:
 * 
 * 方案选择: 使用 base64 直接输入
 * 
 * 【方案对比】
 * 1. Files API 上传 (推荐用于大文件/多次使用)
 *    - 优点: 可复用，适合大文件
 *    - 缺点: 需要额外的 API 调用，有存储成本
 *    - Endpoint: POST https://api.openai.com/v1/files
 * 
 * 2. Base64 直接输入 (本项目采用)
 *    - 优点: 简单直接，一次调用完成
 *    - 缺点: 文件大小受限（约 20MB），不可复用
 *    - 适用: 单次处理的中小型 PDF
 * 
 * 本项目选择 base64 方案，因为:
 * - 用户通常只处理一次
 * - 避免文件存储管理
 * - 简化代码逻辑
 */
app.post('/api/summarize-book', upload.single('file'), async (req, res) => {
  const progressStages = {
    upload: '📤 文件上传完成',
    processing: '🔄 正在分析 PDF 内容...',
    generating: '✨ 说书人正在创作...',
    complete: '✅ 说书稿生成完成',
  };

  try {
    // 检查文件
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: '请上传 PDF 文件',
      });
    }

    console.log(`[${new Date().toISOString()}] 收到文件: ${req.file.originalname}, 大小: ${req.file.size} bytes`);

    // 阶段1: 文件上传完成
    // 将 PDF 转为 base64
    const pdfBase64 = req.file.buffer.toString('base64');
    
    console.log(progressStages.processing);

    // 阶段2: 调用 OpenAI API 生成说书稿
    /**
     * OpenAI Chat Completions API
     * 
     * Endpoint: POST https://api.openai.com/v1/chat/completions
     * 
     * 关键字段说明:
     * - model: 使用的模型 (gpt-4o, gpt-4o-mini 等) 【可替换模型】
     * - messages: 消息数组
     *   - role: "system" | "user" | "assistant"
     *   - content: 文本或多模态内容数组
     * - response_format: 指定输出格式
     *   - type: "json_object" 强制输出 JSON
     * - max_tokens: 最大输出 token 数 【可调参数】
     * - temperature: 创造性程度 0-2 【可调参数】
     */
    console.log(progressStages.generating);
    
    const completion = await openai.chat.completions.create({
      // 【可替换模型】推荐: gpt-4o (最佳), gpt-4o-mini (性价比)
      model: CONFIG.openaiModel,
      messages: [
        {
          role: 'system',
          content: STORYTELLER_SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: [
            {
              type: 'file',
              file: {
                // 使用 base64 直接输入 PDF
                filename: req.file.originalname || 'document.pdf',
                file_data: `data:application/pdf;base64,${pdfBase64}`,
              },
            },
            {
              type: 'text',
              text: '请仔细阅读这本书的 PDF 内容，然后用说书人的风格，将其精华内容转化为一份引人入胜的说书稿。记住要输出纯 JSON 格式。',
            },
          ],
        },
      ],
      // 【可调参数】强制 JSON 输出
      response_format: { type: 'json_object' },
      // 【可调参数】最大输出 token (GPT 5.2 使用 max_completion_tokens)
      max_completion_tokens: 8000,
      // 【可调参数】创造性程度 (0-2，越高越有创意)
      temperature: 0.8,
    });

    // 解析响应
    const responseText = completion.choices[0]?.message?.content;
    
    if (!responseText) {
      throw new Error('OpenAI 返回内容为空');
    }

    // 解析 JSON
    let storytellerScript;
    try {
      storytellerScript = JSON.parse(responseText);
    } catch (parseError) {
      console.error('JSON 解析失败:', responseText);
      throw new Error('生成的内容格式不正确');
    }

    // 阶段3: 返回结果
    console.log(progressStages.complete);

    res.json({
      success: true,
      data: storytellerScript,
      meta: {
        model: CONFIG.openaiModel,
        filename: req.file.originalname,
        fileSize: req.file.size,
        tokensUsed: completion.usage?.total_tokens,
      },
    });

  } catch (error) {
    console.error('处理 PDF 失败:', error);
    
    // 错误分类处理
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        success: false,
        error: `文件过大，最大支持 ${CONFIG.maxFileSize / 1024 / 1024}MB`,
      });
    }

    if (error.status === 429) {
      return res.status(429).json({
        success: false,
        error: 'OpenAI API 请求过于频繁，请稍后再试',
      });
    }

    res.status(500).json({
      success: false,
      error: error.message || '处理失败，请重试',
    });
  }
});

// ============================================
// API: 文本转语音 (OpenAI TTS)
// ============================================
/**
 * POST /api/tts
 * 
 * 请求: JSON
 * {
 *   "text": "要转换的文本",
 *   "voice": "onyx",  // 可选，默认使用配置
 *   "format": "mp3"   // 可选，默认使用配置
 * }
 * 
 * 响应: audio/mpeg 或 audio/wav (二进制音频流)
 * 
 * OpenAI TTS API:
 * Endpoint: POST https://api.openai.com/v1/audio/speech
 * 
 * 关键字段:
 * - model: "tts-1" (快速) 或 "tts-1-hd" (高质量) 【可替换模型】
 * - input: 要转换的文本 (最大 4096 字符)
 * - voice: 声音选择 【可调参数】
 *   - alloy: 中性
 *   - echo: 男性
 *   - fable: 男性，适合叙事
 *   - onyx: 深沉男性 (推荐说书)
 *   - nova: 女性
 *   - shimmer: 女性
 * - response_format: 输出格式 (mp3, opus, aac, flac, wav, pcm) 【可调参数】
 * - speed: 语速 0.25-4.0 【可调参数】
 */
app.post('/api/tts', async (req, res) => {
  try {
    const { text, voice, format, speed } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({
        success: false,
        error: '请提供要转换的文本',
      });
    }

    // 文本长度检查 (OpenAI TTS 限制 4096 字符)
    if (text.length > 4096) {
      return res.status(400).json({
        success: false,
        error: '文本过长，单次请求最多 4096 字符',
      });
    }

    console.log(`[TTS] 转换文本长度: ${text.length} 字符`);

    /**
     * OpenAI Audio Speech API
     * https://platform.openai.com/docs/api-reference/audio/createSpeech
     */
    const response = await openai.audio.speech.create({
      // 【可替换模型】tts-1 (快速) 或 tts-1-hd (高质量)
      model: CONFIG.ttsModel,
      // 要转换的文本
      input: text,
      // 【可调参数】声音选择: alloy, echo, fable, onyx, nova, shimmer
      voice: voice || CONFIG.ttsVoice,
      // 【可调参数】输出格式: mp3, opus, aac, flac, wav, pcm
      response_format: format || CONFIG.ttsFormat,
      // 【可调参数】语速: 0.25 到 4.0
      speed: speed || 1.0,
    });

    // 获取音频数据
    const buffer = Buffer.from(await response.arrayBuffer());

    // 设置响应头
    const mimeTypes = {
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      opus: 'audio/opus',
      aac: 'audio/aac',
      flac: 'audio/flac',
      pcm: 'audio/pcm',
    };

    const outputFormat = format || CONFIG.ttsFormat;
    res.set({
      'Content-Type': mimeTypes[outputFormat] || 'audio/mpeg',
      'Content-Length': buffer.length,
      'Cache-Control': 'no-cache',
    });

    res.send(buffer);

  } catch (error) {
    console.error('TTS 转换失败:', error);

    if (error.status === 429) {
      return res.status(429).json({
        success: false,
        error: 'OpenAI API 请求过于频繁，请稍后再试',
      });
    }

    res.status(500).json({
      success: false,
      error: error.message || 'TTS 转换失败',
    });
  }
});

// ============================================
// 健康检查
// ============================================
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    config: {
      maxFileSize: `${CONFIG.maxFileSize / 1024 / 1024}MB`,
      model: CONFIG.openaiModel,
      ttsModel: CONFIG.ttsModel,
      ttsVoice: CONFIG.ttsVoice,
    },
  });
});

// ============================================
// 错误处理
// ============================================
app.use((error, req, res, next) => {
  console.error('服务器错误:', error);

  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        success: false,
        error: `文件过大，最大支持 ${CONFIG.maxFileSize / 1024 / 1024}MB`,
      });
    }
  }

  res.status(500).json({
    success: false,
    error: '服务器内部错误',
  });
});

// ============================================
// 启动服务器
// ============================================
app.listen(CONFIG.port, CONFIG.host, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║                  🌙 爸爸说书 · 服务启动                     ║
╠════════════════════════════════════════════════════════════╣
║  地址: http://${CONFIG.host}:${CONFIG.port}                              ║
║  模型: ${CONFIG.openaiModel.padEnd(20)}                       ║
║  TTS:  ${CONFIG.ttsModel} / ${CONFIG.ttsVoice}                            ║
║  限制: ${(CONFIG.maxFileSize / 1024 / 1024)}MB / ${CONFIG.rateLimitMax}次每分钟                          ║
╠════════════════════════════════════════════════════════════╣
║  🌙 晚安，准备好讲故事了～                                  ║
╚════════════════════════════════════════════════════════════╝
  `);
});

module.exports = app;
