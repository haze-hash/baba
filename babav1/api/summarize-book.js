const OpenAI = require('openai');
const formidable = require('formidable');
const fs = require('fs');

// 禁用 body parser，因为我们用 formidable 处理 multipart
export const config = {
  api: {
    bodyParser: false,
  },
};

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
    // 解析 multipart form data
    const form = formidable({
      maxFileSize: 25 * 1024 * 1024, // 25MB
    });

    const [fields, files] = await form.parse(req);
    
    const file = files.file?.[0];
    if (!file) {
      return res.status(400).json({ success: false, error: '请上传 PDF 文件' });
    }

    // 读取文件并转为 base64
    const fileBuffer = fs.readFileSync(file.filepath);
    const pdfBase64 = fileBuffer.toString('base64');

    console.log(`处理文件: ${file.originalFilename}, 大小: ${file.size} bytes`);

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
                filename: file.originalFilename || 'document.pdf',
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
      response_format: { type: 'json_object' },
      max_completion_tokens: 8000,
      temperature: 0.8,
    });

    const responseText = completion.choices[0]?.message?.content;
    
    if (!responseText) {
      throw new Error('OpenAI 返回内容为空');
    }

    const storytellerScript = JSON.parse(responseText);

    // 清理临时文件
    fs.unlinkSync(file.filepath);

    return res.status(200).json({
      success: true,
      data: storytellerScript,
      meta: {
        model: process.env.OPENAI_MODEL || 'gpt-4o',
        filename: file.originalFilename,
        fileSize: file.size,
      },
    });

  } catch (error) {
    console.error('处理失败:', error);
    
    return res.status(500).json({
      success: false,
      error: error.message || '处理失败，请重试',
    });
  }
}
