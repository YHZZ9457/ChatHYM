// ——— 顶部：针对 marked & MathJax 的配置 ———
// 1. 关闭 marked 的 sanitize（保留所有反斜杠），启用 GitHub 风格

// 全局变量
let currentApiKey = localStorage.getItem('openai-api-key') || '';
let conversations = []
let currentConversationId = null


function appendMessage(role, text) {
  const container = document.getElementById('messages');
  const div = document.createElement('div');
  div.className = 'message ' + (role === 'assistant' ? 'assistant' : 'user');

  // —— 核心改动：只有在 marked 存在时才用 marked.parse —— 
  const contentHtml = (typeof marked !== 'undefined')
    ? marked.parse(text)
    : escapeHtml(text);
    

  const contentDiv = document.createElement('div');
  contentDiv.className = 'text';
  contentDiv.innerHTML = contentHtml;

  container.appendChild(div).appendChild(contentDiv);
  container.scrollTop = container.scrollHeight;

  // MathJax 渲染
  if (window.MathJax && MathJax.typesetPromise) {
    MathJax.typesetPromise([contentDiv]).catch(console.error);
  }
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}


// 1. Del会话函数，必须最先定义
function deleteConversation(id) {
  const idx = conversations.findIndex(c => c.id === id);
  if (idx === -1) return;
  const wasCurrent = conversations[idx].id === currentConversationId;
  conversations.splice(idx, 1);
  saveConversations();
  renderConversationList();
if (wasCurrent) {
  if (conversations.length) {
    // 先尝试选中“同一索引”（原来是下一行），否则选中上一行
    const newIdx = idx < conversations.length ? idx : conversations.length - 1;
    loadConversation(conversations[newIdx].id);
  } else {
    // 全都删完
    currentConversationId = null;
    document.getElementById('messages').innerHTML = '';
    document.getElementById('chat-title').textContent = '对话';
  }
}
}




function saveApiKey() {
  const key = document.getElementById('api-key').value.trim();
  if (!key) {
    alert('请输入有效的 API Key');
    return;
  }
  localStorage.setItem('openai-api-key', key);
  console.log('[DEBUG] 已保存到 localStorage 的 API Key:', localStorage.getItem('openai-api-key'));
  alert('API Key 已保存');
}



window.saveApiKey = saveApiKey;



function loadApiKeyToInput() {
  const saved = localStorage.getItem('openai-api-key');
  if (saved) {
    document.getElementById('api-key').value = saved;
    currentApiKey = saved;     // ← 确保也赋值给 currentApiKey
  }
}


// —— 第二部分：DOMContentLoaded 初始化 ——
document.addEventListener('DOMContentLoaded', () => {
  // 加载并填充 API Key
  loadApiKeyToInput();

  // 加载会话列表
  loadConversations();
  renderConversationList();

  // 切换到第一个已有对话，或新建对话
  if (conversations.length) {
    loadConversation(conversations[0].id);
  } else {
    createNewConversation();
  }

  // 绑定“+ 新对话”按钮
  const newConvBtn = document.getElementById('new-conv-btn');
  if (newConvBtn) newConvBtn.addEventListener('click', createNewConversation);

  // 绑定“删除当前对话”按钮
  const deleteBtn = document.getElementById('delete-current-btn');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => {
      if (!currentConversationId) return;
      const conv = conversations.find(c => c.id === currentConversationId);
      if (conv && confirm(`确认删除「${conv.title}」吗？`)) {
        deleteConversation(currentConversationId);
      }
    });
  }

  // 绑定“切换主题”按钮
  const themeBtn = document.getElementById('toggle-theme-btn');
  if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

  // 其它需要在页面加载后执行的初始化…
});



  // 主题初始化
  const saved = localStorage.getItem('theme') || 'dark';
  document.body.classList.add(saved + '-theme');

  // 主题切换按钮
  const btn = document.getElementById('toggle-theme-btn');
  if (btn) {
    btn.addEventListener('click', () => {
      document.body.classList.toggle('dark-theme');
      document.body.classList.toggle('light-theme');
      localStorage.setItem(
        'theme',
        document.body.classList.contains('dark-theme') ? 'dark' : 'light'
      );
    });
  }

  // 渲染完页面再加载对话列表
  // … 原来 renderConversationList 之前 …



// —— 在 DOMContentLoaded 初始化部分，添加下面主题按钮绑定 ——

// 主题切换按钮
const themeBtn = document.getElementById('toggle-theme-btn');
if (themeBtn) {
  themeBtn.addEventListener('click', () => {
    document.body.classList.toggle('dark-theme');
    document.body.classList.toggle('light-theme');
    localStorage.setItem(
      'theme',
      document.body.classList.contains('dark-theme') ? 'dark' : 'light'
    );
  });
}

// 界面缩放
const uiSlider = document.getElementById('ui-scale-slider');
const uiValue  = document.getElementById('ui-scale-value');
// 读取已存值或默认 1
const savedScale = parseFloat(localStorage.getItem('ui-scale') || '1');
document.documentElement.style.setProperty('--ui-scale', savedScale);
if (uiSlider && uiValue) {
  uiSlider.value = savedScale;
  uiValue.textContent = Math.round(savedScale * 100) + '%';

  uiSlider.addEventListener('input', () => {
    const scale = parseFloat(uiSlider.value);
    document.documentElement.style.setProperty('--ui-scale', scale);
    uiValue.textContent = Math.round(scale * 100) + '%';
    localStorage.setItem('ui-scale', scale);
  });
}


// 渲染对话列表，带Del按钮（鼠标移入显示）
function renderConversationList() {
  const list = document.getElementById('conversation-list');
  list.innerHTML = '';

  conversations.forEach(conv => {
    const li = document.createElement('li');
    li.className = conv.id === currentConversationId ? 'active' : '';
    li.style.display = 'flex';
    li.style.justifyContent = 'space-between';
    li.style.alignItems = 'center';
    li.style.padding = '8px 16px';

    const titleSpan = document.createElement('span');
    titleSpan.textContent = conv.title;
    titleSpan.style.flex = '1';
    titleSpan.style.cursor = 'pointer';
    titleSpan.addEventListener('click', () => loadConversation(conv.id));
    titleSpan.addEventListener('dblclick', () => renameConversation(conv.id));
    li.appendChild(titleSpan);

    const del = document.createElement('button');
    del.textContent = 'Del';
    del.style.background = 'transparent';
    del.style.border = 'none';
    del.style.color = 'red';
    del.style.cursor = 'pointer';
    del.style.opacity = '0';
    del.style.transition = 'opacity 0.2s';
    del.addEventListener('click', e => {
      e.stopPropagation();
      if (confirm(`确认删除「${conv.title}」吗？`)) deleteConversation(conv.id);
    });
    li.appendChild(del);

    li.addEventListener('mouseenter', () => del.style.opacity = '1');
    li.addEventListener('mouseleave', () => del.style.opacity = '0');

    list.appendChild(li);
  });
}


// Enter 发送
const promptElem = document.getElementById('prompt');
promptElem.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    send();
  }
});



// Initialize on load
  loadConversations();
  renderConversationList();
  if (conversations.length > 0) {
    loadConversation(conversations[0].id);
  } else {
    createNewConversation();
  }

  // Model change handler
  document.getElementById('model').addEventListener('change', function() {
    const conv = getCurrentConversation();
    if (conv) {
      conv.model = this.value;
      saveConversations();
    }
  });

  // Auto-save before window unload
  window.addEventListener('beforeunload', saveConversations);
;

function getCurrentModel() {
    const modelInput = document.getElementById('model');
    return modelInput ? modelInput.value : 'gpt-3.5-turbo'; // 默认 fallback
}
window.getCurrentModel = getCurrentModel;


function saveConversations() {
  localStorage.setItem('conversations', JSON.stringify(conversations));
}
function loadConversations() {
  currentApiKey = localStorage.getItem('openai-api-key') || '';
  const data = localStorage.getItem('conversations');
  conversations = data ? JSON.parse(data) : [];
}



// Prompt user to rename a conversation
function renameConversation(id) {
  const conv = conversations.find(c => c.id === id);
  if (!conv) return;
  const newTitle = prompt('输入新的对话标题：', conv.title);
  if (newTitle && newTitle.trim()) {
    conv.title = newTitle.trim();
    saveConversations();
    renderConversationList();
    // If renaming current, update header
    if (id === currentConversationId) {
      document.getElementById('chat-title').textContent = conv.title;
    }
  }
}


function createNewConversation() {
    // 创建新对话逻辑
    const id = Date.now().toString();
    const newConv = {
        id,
        title: '新对话',
        model: getCurrentModel(), // 下面问题会补
        messages: [],
    };
    conversations.push(newConv);
    saveConversations();
    renderConversationList();
    loadConversation(id);
}
window.createNewConversation = createNewConversation; // VERY IMPORTANT




function loadConversation(id) {
  currentConversationId = id;
  const conv = conversations.find(c => c.id === id);
  if (!conv) return;
  // 切换界面显示
  document.getElementById('settings-area').style.display = 'none';
  document.getElementById('chat-area').style.display = 'flex';
  document.getElementById('chat-title').textContent = conv.title;
  document.getElementById('model').value = conv.model;
  document.getElementById('new-conv-btn').addEventListener('click', createNewConversation);

  const msgsElem = document.getElementById('messages');
  msgsElem.innerHTML = '';
  conv.messages.forEach(m => appendMessage(m.role, m.content, false));
  renderConversationList();
}


function showSettings() {
    const settingsArea = document.getElementById('settings-area');
    const chatArea = document.getElementById('chat-area');
    if (settingsArea && chatArea) {
        settingsArea.style.display = 'flex';
        chatArea.style.display = 'none';
    }
}
window.showSettings = showSettings;




function clearAllHistory() {
  if (confirm('确认清除所有历史吗？')) {
    localStorage.removeItem('conversations');
    conversations = [];
    currentConversationId = null;
    renderConversationList();
    document.getElementById('messages').innerHTML = '';
    document.getElementById('chat-title').textContent = '对话';
  }
}

window.clearAllHistory = clearAllHistory;

async function send() {
  const apiKey = localStorage.getItem('openai-api-key') || '';
  if (!apiKey) {
    alert('请先在设置里保存你的 API Key');
    return;
  }

  const input = document.getElementById('prompt');
  const prompt = input.value.trim();
  if (!prompt) return;

  // 1. 渲染到界面
  appendMessage('user', prompt);

  // 2. 同步到对话数据里
  const conv = conversations.find(c => c.id === currentConversationId);
  if (!conv) return;
  conv.messages.push({ role: 'user', content: prompt });

  input.value = '';

  // 3. 调用 OpenAI
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey
    },
    body: JSON.stringify({
      model: conv.model,
      messages: conv.messages.map(m => ({
        role:    m.role === 'bot' ? 'assistant' : m.role,
        content: m.content
      }))
    })
  });

  // 4. 处理响应
  if (!res.ok) {
    const err = await res.text();
    alert(`接口返回 ${res.status}：${err}`);
    return;
  }
const data  = await res.json();
// ← 一定要先把它取出来并存到一个变量
const reply = data.choices[0].message.content;

appendMessage('assistant', reply);
// ← 然后把 reply 推入数组
conv.messages.push({ role: 'assistant', content: reply });
// ← 最后写回 localStorage
saveConversations();

}

window.send = send;




// 关键！将 send 函数暴露给 HTML
window.send = send;

function bindPromptOnce() {

  promptElem.dataset.bound = 'true';  // 防止多次绑定
}


let promptBound = false;


// 确保可以从 HTML onclick 里调用到
window.showSettings = showSettings;

bindPromptOnce();

// === 主题切换逻辑 ===

function applyStoredTheme() {
  // 把 'light' 改成 'dark'，这样 localStorage 里没值时就走暗色
  const theme = localStorage.getItem('theme') || 'dark';
  if (theme === 'dark') {
    document.body.classList.add('dark-theme');
  } else {
    document.body.classList.remove('dark-theme');
  }
}

// 切换主题并存储（从暗→亮或从亮→暗）
function toggleTheme() {
  // toggle 会反转 dark-theme 类
  const isDark = document.body.classList.toggle('dark-theme');
  // 然后把反转后的状态存起来：true＝暗色，false＝亮色
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
}

// 绑定按钮
document.addEventListener('DOMContentLoaded', () => {
  applyStoredTheme();  // 加载时应用“默认暗色”或用户上次选的
  document
    .getElementById('toggle-theme-btn')
    .addEventListener('click', toggleTheme);
});



