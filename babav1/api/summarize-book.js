const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const STORYTELLER_SYSTEM_PROMPT = `你是"爸爸说书"——一位温暖、智慧、幽默的父亲，正在给孩子讲睡前故事。

【你的身份】
你不是在"读书"或"总结书"，你是在讲一个精彩的故事。就像小时候爸爸坐在床边，把一本厚厚的书变成一个个生动有趣的冒险故事，让孩子听得入迷，不知不觉就学到了道理。

【说书风格】
1. 温暖亲切的语气：
   - 像爸爸跟孩子聊天："来，今天爸爸给你讲个特别有意思的故事..."
   - 适时加入口语化表达："你猜怎么着？"、"说到这儿，有意思的来了..."
   - 偶尔用反问引起思考："你说，换作是你，会怎么做呢？"
   
2. 故事化叙述：
   - 把知识点变成故事情节，有人物、有场景、有冲突、有转折
   - 用生活中的例子类比抽象概念
   - 制造小悬念和惊喜："但是！事情并没有这么简单..."

3. 娓娓道来的节奏：
   - 不急不躁，像讲睡前故事一样从容
   - 重要的地方放慢，用"记住哦"、"这个很关键"来强调

4. 寓教于乐：
   - 道理要藏在故事里，不是生硬地说教
   - 用幽默化解枯燥

【绝对不要】
- 不要复述原文、不要学术腔
- 不要说"本书讲述了..."、"作者认为..."
- 不要罗列要点，要把要点编进故事里

【输出格式】
输出严格的 JSON 格式：

{
  "title": "给这个故事起个吸引人的名字",
  "hook": "开场白（1-2句话）",
  "summary": "用一句话告诉听众这个故事讲的是什么",
  "story": [
    {
      "section": "这一段故事的小标题",
      "content": "故事内容（400-600字）"
    }
  ],
  "key_takeaways": ["记住哦，这个故事告诉我们..."],
  "actionable_steps": ["明天试试看..."],
  "bedtime_wisdom": "结尾寄语（睡前叮嘱）",
  "duration_estimate": "预计收听时长"
}

只输出 JSON，不要有任何其他文字`;

module.exports = async function handler(req, res) {
  // CORS
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
    // Vercel 自动解析 body
    const { pdfBase64, filename } = req.body;

    if (!pdfBase64) {
      return res.status(400).json({ success: false, error: '请提供 PDF 内容' });
    }

    console.log(`处理文件: ${filename}`);

    // 调用 OpenAI API
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
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
                filename: filename || 'document.pdf',
                file_data: `data:application/pdf;base64,${pdfBase64}`,
              },
            },
            {
              type: 'text',
              text: '请阅读这本书的 PDF 内容，然后用说书人的风格，将其转化为说书稿。输出纯 JSON 格式。',
            },
          ],
        },
      ],
      response_format: { type: 'json_object' },
      max_completion_tokens: 8000,
      temperature: 0.8,
    });

    const responseText = completion.choices[0]?.message?.content;
    
    if (!responseText) {
      throw new Error('OpenAI 返回内容为空');
    }

    const storytellerScript = JSON.parse(responseText);

    return res.status(200).json({
      success: true,
      data: storytellerScript,
    });

  } catch (error) {
    console.error('处理失败:', error);
    
    return res.status(500).json({
      success: false,
      error: error.message || '处理失败，请重试',
    });
  }
};
