/**
 * 听书应用前端脚本
 * 
 * 功能:
 * 1. PDF 上传与预览
 * 2. 调用后端 API 生成说书稿
 * 3. 两种朗读方式:
 *    - 浏览器 speechSynthesis (零成本)
 *    - OpenAI TTS (高质量)
 * 4. 逐段播放与高亮
 */

// ============================================
// 配置
// ============================================
const CONFIG = {
  // API 地址 (同源部署则为空)
  apiBase: '',
  // 最大文件大小 (与后端保持一致)
  maxFileSize: 25 * 1024 * 1024,
};

// ============================================
// 状态管理
// ============================================
const state = {
  file: null,
  scriptData: null,
  // 播放状态
  isPlaying: false,
  currentSegmentIndex: -1,
  segments: [], // 所有可播放的段落
  // TTS 模式 - 默认使用高质量 OpenAI TTS
  useOpenAITTS: true,
  // 音频缓存
  audioCache: new Map(),
};

// ============================================
// DOM 元素
// ============================================
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

const DOM = {
  uploadSection: $('#uploadSection'),
  uploadZone: $('#uploadZone'),
  fileInput: $('#fileInput'),
  pdfPreview: $('#pdfPreview'),
  fileName: $('#fileName'),
  fileSize: $('#fileSize'),
  removeFile: $('#removeFile'),
  pdfCanvas: $('#pdfCanvas'),
  startBtn: $('#startBtn'),
  
  progressSection: $('#progressSection'),
  progressTitle: $('#progressTitle'),
  progressDesc: $('#progressDesc'),
  progressFill: $('#progressFill'),
  
  resultSection: $('#resultSection'),
  scriptContent: $('#scriptContent'),
  nowPlaying: $('#nowPlaying'),
  duration: $('#duration'),
  
  playPauseBtn: $('#playPauseBtn'),
  prevBtn: $('#prevBtn'),
  nextBtn: $('#nextBtn'),
  stopBtn: $('#stopBtn'),
  newBookBtn: $('#newBookBtn'),
  
  audioPlayer: $('#audioPlayer'),
  toast: $('#toast'),
};

// ============================================
// 工具函数
// ============================================

/**
 * 显示 Toast 通知
 */
function showToast(message, type = 'info') {
  DOM.toast.textContent = message;
  DOM.toast.className = `toast ${type} show`;
  
  setTimeout(() => {
    DOM.toast.classList.remove('show');
  }, 3000);
}

/**
 * 格式化文件大小
 */
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/**
 * 更新进度条
 */
function updateProgress(percent, title, desc) {
  DOM.progressFill.style.width = percent + '%';
  if (title) DOM.progressTitle.textContent = title;
  if (desc) DOM.progressDesc.textContent = desc;
}

// ============================================
// PDF 处理
// ============================================

/**
 * 预览 PDF 第一页 (使用 pdf.js)
 */
async function previewPDF(file) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    
    // 设置 pdf.js worker
    pdfjsLib.GlobalWorkerOptions.workerSrc = 
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const page = await pdf.getPage(1);
    
    const scale = 1.5;
    const viewport = page.getViewport({ scale });
    
    const canvas = DOM.pdfCanvas;
    const context = canvas.getContext('2d');
    
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    
    await page.render({
      canvasContext: context,
      viewport: viewport,
    }).promise;
    
  } catch (error) {
    console.warn('PDF 预览失败:', error);
    // 预览失败不影响上传
  }
}

/**
 * 处理文件选择
 */
async function handleFileSelect(file) {
  // 验证文件类型
  if (file.type !== 'application/pdf') {
    showToast('请上传 PDF 文件', 'error');
    return;
  }
  
  // 验证文件大小
  if (file.size > CONFIG.maxFileSize) {
    showToast(`文件过大，最大支持 ${formatFileSize(CONFIG.maxFileSize)}`, 'error');
    return;
  }
  
  state.file = file;
  
  // 更新 UI
  DOM.fileName.textContent = file.name;
  DOM.fileSize.textContent = formatFileSize(file.size);
  DOM.uploadZone.style.display = 'none';
  DOM.pdfPreview.style.display = 'block';
  DOM.startBtn.disabled = false;
  
  // 预览 PDF
  await previewPDF(file);
  
  showToast('文件已就绪', 'success');
}

/**
 * 移除文件
 */
function removeFile() {
  state.file = null;
  DOM.fileInput.value = '';
  DOM.uploadZone.style.display = 'block';
  DOM.pdfPreview.style.display = 'none';
  DOM.startBtn.disabled = true;
  
  // 清空画布
  const ctx = DOM.pdfCanvas.getContext('2d');
  ctx.clearRect(0, 0, DOM.pdfCanvas.width, DOM.pdfCanvas.height);
}

// ============================================
// API 调用
// ============================================

/**
 * 上传 PDF 并生成说书稿
 */
async function summarizeBook() {
  if (!state.file) return;
  
  try {
    // 切换到进度界面
    DOM.uploadSection.style.display = 'none';
    DOM.progressSection.style.display = 'flex';
    
    // 阶段1: 上传
    updateProgress(20, '📤 收到啦', '正在打开这本书...');
    
    const formData = new FormData();
    formData.append('file', state.file);
    
    // 阶段2: 处理
    updateProgress(40, '📖 正在阅读', '爸爸正在仔细读这本书...');
    
    const response = await fetch(`${CONFIG.apiBase}/api/summarize-book`, {
      method: 'POST',
      body: formData,
    });
    
    // 阶段3: 生成
    updateProgress(80, '✨ 正在构思', '把故事变得更有趣...');
    
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || '处理失败');
    }
    
    // 阶段4: 完成
    updateProgress(100, '🌙 准备好了', '故事马上开始...');
    
    state.scriptData = result.data;
    
    // 短暂延迟后显示结果
    await new Promise(resolve => setTimeout(resolve, 500));
    
    renderScript();
    showResultSection();
    
  } catch (error) {
    console.error('处理失败:', error);
    showToast(error.message || '处理失败，请重试', 'error');
    
    // 返回上传界面
    DOM.progressSection.style.display = 'none';
    DOM.uploadSection.style.display = 'block';
  }
}

/**
 * 调用 OpenAI TTS
 */
async function fetchTTS(text) {
  // 检查缓存
  const cacheKey = text.slice(0, 100); // 用前100字符作为key
  if (state.audioCache.has(cacheKey)) {
    return state.audioCache.get(cacheKey);
  }
  
  try {
    const response = await fetch(`${CONFIG.apiBase}/api/tts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        // voice 和 format 使用后端默认值
      }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'TTS 转换失败');
    }
    
    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    
    // 缓存
    state.audioCache.set(cacheKey, audioUrl);
    
    return audioUrl;
    
  } catch (error) {
    console.error('TTS 失败:', error);
    throw error;
  }
}

// ============================================
// 渲染说书稿
// ============================================

function renderScript() {
  const data = state.scriptData;
  if (!data) return;
  
  // 准备所有可播放段落
  state.segments = [];
  
  let html = '';
  
  // 标题
  html += `<h1 class="script-title">${escapeHtml(data.title)}</h1>`;
  
  // 开场白
  if (data.hook) {
    const hookIndex = state.segments.length;
    state.segments.push({ type: 'hook', text: data.hook, index: hookIndex });
    html += `<div class="script-hook" data-segment="${hookIndex}">🌙 ${escapeHtml(data.hook)}</div>`;
  }
  
  // 一句话总结
  if (data.summary) {
    const summaryIndex = state.segments.length;
    state.segments.push({ type: 'summary', text: data.summary, index: summaryIndex });
    html += `
      <div class="script-summary" data-segment="${summaryIndex}">
        <div class="script-summary-label">今天的故事</div>
        <div>${escapeHtml(data.summary)}</div>
      </div>
    `;
  }
  
  // 故事章节
  if (data.story && data.story.length > 0) {
    data.story.forEach((section, i) => {
      const sectionIndex = state.segments.length;
      state.segments.push({
        type: 'story',
        title: section.section,
        text: section.content,
        index: sectionIndex,
      });
      
      html += `
        <div class="story-section" data-segment="${sectionIndex}">
          <div class="section-header">
            <span class="section-number">${i + 1}</span>
            <span class="section-title">${escapeHtml(section.section)}</span>
          </div>
          <div class="section-content">${escapeHtml(section.content)}</div>
        </div>
      `;
    });
  }
  
  // 核心要点 - 改为"爸爸的叮嘱"
  if (data.key_takeaways && data.key_takeaways.length > 0) {
    html += `
      <div class="takeaways-section">
        <div class="section-label">💝 爸爸的叮嘱</div>
    `;
    
    data.key_takeaways.forEach((item, i) => {
      const itemIndex = state.segments.length;
      state.segments.push({ type: 'takeaway', text: item, index: itemIndex });
      
      html += `
        <div class="takeaway-item" data-segment="${itemIndex}">
          <span class="item-icon">💫</span>
          <span class="item-text">${escapeHtml(item)}</span>
        </div>
      `;
    });
    
    html += '</div>';
  }
  
  // 行动建议 - 改为"明天试试看"
  if (data.actionable_steps && data.actionable_steps.length > 0) {
    html += `
      <div class="actions-section">
        <div class="section-label">🌟 明天试试看</div>
    `;
    
    data.actionable_steps.forEach((item, i) => {
      const itemIndex = state.segments.length;
      state.segments.push({ type: 'action', text: item, index: itemIndex });
      
      html += `
        <div class="action-item" data-segment="${itemIndex}">
          <span class="item-icon">✨</span>
          <span class="item-text">${escapeHtml(item)}</span>
        </div>
      `;
    });
    
    html += '</div>';
  }
  
  // 睡前寄语 - 新增
  if (data.bedtime_wisdom) {
    const wisdomIndex = state.segments.length;
    state.segments.push({ type: 'wisdom', text: data.bedtime_wisdom, index: wisdomIndex });
    html += `
      <div class="bedtime-wisdom" data-segment="${wisdomIndex}">
        <div class="wisdom-icon">🌙</div>
        <div class="wisdom-text">${escapeHtml(data.bedtime_wisdom)}</div>
      </div>
    `;
  }
  
  // 术语表（保留但改名）
  if (data.glossary && data.glossary.length > 0) {
    html += `
      <div class="glossary-section">
        <div class="section-label">📖 小知识</div>
    `;
    
    data.glossary.forEach(item => {
      html += `
        <div class="glossary-item">
          <div class="glossary-term">${escapeHtml(item.term)}</div>
          <div class="glossary-explanation">${escapeHtml(item.explanation)}</div>
        </div>
      `;
    });
    
    html += '</div>';
  }
  
  // 预计时长
  if (data.duration_estimate) {
    DOM.duration.textContent = `预计 ${data.duration_estimate}`;
  }
  
  DOM.scriptContent.innerHTML = html;
  
  // 添加段落点击事件
  DOM.scriptContent.querySelectorAll('[data-segment]').forEach(el => {
    el.addEventListener('click', () => {
      const index = parseInt(el.dataset.segment);
      playSegment(index);
    });
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showResultSection() {
  DOM.progressSection.style.display = 'none';
  DOM.resultSection.style.display = 'block';
}

// ============================================
// 播放控制
// ============================================

/**
 * 播放指定段落
 */
async function playSegment(index) {
  if (index < 0 || index >= state.segments.length) {
    stopPlaying();
    return;
  }
  
  // 停止当前播放
  stopCurrentPlayback();
  
  state.currentSegmentIndex = index;
  state.isPlaying = true;
  
  const segment = state.segments[index];
  
  // 更新 UI
  updatePlayingUI();
  highlightSegment(index);
  DOM.nowPlaying.textContent = getSegmentLabel(segment);
  
  // 选择播放方式
  try {
    if (state.useOpenAITTS) {
      await playWithOpenAITTS(segment.text);
    } else {
      await playWithSpeechSynthesis(segment.text);
    }
    
    // 播放完成，等待 1 秒后自动播放下一段
    if (state.isPlaying) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      if (state.isPlaying) {
        playSegment(index + 1);
      }
    }
    
  } catch (error) {
    console.error('播放失败:', error);
    showToast('播放失败: ' + error.message, 'error');
    stopPlaying();
  }
}

/**
 * 使用浏览器 speechSynthesis
 */
function playWithSpeechSynthesis(text) {
  return new Promise((resolve, reject) => {
    if (!('speechSynthesis' in window)) {
      reject(new Error('您的浏览器不支持语音合成'));
      return;
    }
    
    // 取消之前的朗读
    speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    
    // 设置语音参数
    utterance.lang = 'zh-CN';
    utterance.rate = 1.0;  // 语速 0.1-10
    utterance.pitch = 1.0; // 音调 0-2
    utterance.volume = 1.0;
    
    // 尝试选择中文语音
    const voices = speechSynthesis.getVoices();
    const chineseVoice = voices.find(v => v.lang.includes('zh'));
    if (chineseVoice) {
      utterance.voice = chineseVoice;
    }
    
    utterance.onend = () => resolve();
    utterance.onerror = (e) => {
      if (e.error !== 'canceled') {
        reject(new Error(e.error));
      } else {
        resolve();
      }
    };
    
    speechSynthesis.speak(utterance);
  });
}

/**
 * 使用 OpenAI TTS
 */
async function playWithOpenAITTS(text) {
  // 限制文本长度
  const truncatedText = text.slice(0, 4000);
  
  showToast('正在生成高质量音频...', 'info');
  
  const audioUrl = await fetchTTS(truncatedText);
  
  return new Promise((resolve, reject) => {
    DOM.audioPlayer.src = audioUrl;
    DOM.audioPlayer.onended = () => resolve();
    DOM.audioPlayer.onerror = (e) => reject(new Error('音频播放失败'));
    DOM.audioPlayer.play().catch(reject);
  });
}

/**
 * 停止当前播放
 */
function stopCurrentPlayback() {
  // 停止 speechSynthesis
  if ('speechSynthesis' in window) {
    speechSynthesis.cancel();
  }
  
  // 停止音频播放
  DOM.audioPlayer.pause();
  DOM.audioPlayer.currentTime = 0;
}

/**
 * 完全停止播放
 */
function stopPlaying() {
  stopCurrentPlayback();
  state.isPlaying = false;
  state.currentSegmentIndex = -1;
  updatePlayingUI();
  clearHighlight();
  DOM.nowPlaying.textContent = '准备就绪';
}

/**
 * 暂停/继续播放
 */
function togglePlayPause() {
  if (!state.isPlaying) {
    // 开始播放
    if (state.currentSegmentIndex < 0) {
      playSegment(0);
    } else {
      // 继续播放当前段落
      playSegment(state.currentSegmentIndex);
    }
  } else {
    // 暂停
    state.isPlaying = false;
    stopCurrentPlayback();
    updatePlayingUI();
  }
}

/**
 * 上一段
 */
function playPrevious() {
  const prevIndex = Math.max(0, state.currentSegmentIndex - 1);
  playSegment(prevIndex);
}

/**
 * 下一段
 */
function playNext() {
  const nextIndex = state.currentSegmentIndex + 1;
  if (nextIndex < state.segments.length) {
    playSegment(nextIndex);
  } else {
    stopPlaying();
    showToast('🌙 故事讲完啦，晚安～', 'success');
  }
}

/**
 * 更新播放按钮 UI
 */
function updatePlayingUI() {
  const iconPlay = DOM.playPauseBtn.querySelector('.icon-play');
  const iconPause = DOM.playPauseBtn.querySelector('.icon-pause');
  
  if (state.isPlaying) {
    iconPlay.style.display = 'none';
    iconPause.style.display = 'block';
  } else {
    iconPlay.style.display = 'block';
    iconPause.style.display = 'none';
  }
}

/**
 * 高亮当前播放段落
 */
function highlightSegment(index) {
  // 清除之前的高亮
  DOM.scriptContent.querySelectorAll('[data-segment]').forEach(el => {
    el.classList.remove('playing');
  });
  
  // 添加新高亮
  const el = DOM.scriptContent.querySelector(`[data-segment="${index}"]`);
  if (el) {
    el.classList.add('playing');
    // 滚动到可见区域
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

/**
 * 清除高亮
 */
function clearHighlight() {
  DOM.scriptContent.querySelectorAll('[data-segment]').forEach(el => {
    el.classList.remove('playing');
  });
}

/**
 * 获取段落标签
 */
function getSegmentLabel(segment) {
  const labels = {
    hook: '🌙 开场',
    summary: '📖 今天的故事',
    story: segment.title || '故事',
    takeaway: '💝 爸爸的叮嘱',
    action: '🌟 明天试试看',
    wisdom: '🌙 晚安寄语',
  };
  return labels[segment.type] || '正在讲述';
}

// ============================================
// 重新开始
// ============================================

function startNewBook() {
  // 重置状态
  stopPlaying();
  state.file = null;
  state.scriptData = null;
  state.segments = [];
  state.audioCache.clear();
  
  // 重置 UI
  DOM.fileInput.value = '';
  DOM.uploadZone.style.display = 'block';
  DOM.pdfPreview.style.display = 'none';
  DOM.startBtn.disabled = true;
  DOM.scriptContent.innerHTML = '';
  DOM.duration.textContent = '';
  
  // 切换界面
  DOM.resultSection.style.display = 'none';
  DOM.progressSection.style.display = 'none';
  DOM.uploadSection.style.display = 'block';
}

// ============================================
// 事件绑定
// ============================================

function initEventListeners() {
  // 文件拖拽
  DOM.uploadZone.addEventListener('click', () => DOM.fileInput.click());
  
  DOM.uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    DOM.uploadZone.classList.add('drag-over');
  });
  
  DOM.uploadZone.addEventListener('dragleave', () => {
    DOM.uploadZone.classList.remove('drag-over');
  });
  
  DOM.uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    DOM.uploadZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  });
  
  DOM.fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleFileSelect(file);
  });
  
  // 移除文件
  DOM.removeFile.addEventListener('click', removeFile);
  
  // 开始生成
  DOM.startBtn.addEventListener('click', summarizeBook);
  
  // 播放控制
  DOM.playPauseBtn.addEventListener('click', togglePlayPause);
  DOM.prevBtn.addEventListener('click', playPrevious);
  DOM.nextBtn.addEventListener('click', playNext);
  DOM.stopBtn.addEventListener('click', stopPlaying);
  
  // 新书
  DOM.newBookBtn.addEventListener('click', startNewBook);
  
  // 加载中文语音
  if ('speechSynthesis' in window) {
    speechSynthesis.onvoiceschanged = () => {
      speechSynthesis.getVoices();
    };
  }
}

// ============================================
// PWA 安装提示
// ============================================

let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  
  const installHint = $('#installHint');
  if (installHint) {
    installHint.style.cursor = 'pointer';
    installHint.style.textDecoration = 'underline';
    installHint.addEventListener('click', async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          showToast('应用已添加到主屏幕', 'success');
        }
        deferredPrompt = null;
      }
    });
  }
});

// ============================================
// Service Worker 注册 (可选)
// ============================================

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Service Worker 注册失败，不影响主功能
    });
  });
}

// ============================================
// 初始化
// ============================================

document.addEventListener('DOMContentLoaded', initEventListeners);
