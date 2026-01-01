const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  // 设置 CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: '只支持 POST 请求' });
  }

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

    const response = await openai.audio.speech.create({
      model: process.env.TTS_MODEL || 'tts-1-hd',
      input: text,
      voice: voice || process.env.TTS_VOICE || 'onyx',
      response_format: format || process.env.TTS_FORMAT || 'mp3',
      speed: speed || 1.0,
    });

    const buffer = Buffer.from(await response.arrayBuffer());

    const mimeTypes = {
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      opus: 'audio/opus',
      aac: 'audio/aac',
      flac: 'audio/flac',
    };

    const outputFormat = format || process.env.TTS_FORMAT || 'mp3';
    
    res.setHeader('Content-Type', mimeTypes[outputFormat] || 'audio/mpeg');
    res.setHeader('Content-Length', buffer.length);
    
    return res.send(buffer);

  } catch (error) {
    console.error('TTS 转换失败:', error);

    return res.status(500).json({
      success: false,
      error: error.message || 'TTS 转换失败',
    });
  }
}
