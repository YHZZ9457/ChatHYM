// ——— 顶部：针对 marked & MathJax 的配置 ———
// 1. 关闭 marked 的 sanitize（保留所有反斜杠），启用 GitHub 风格



// 全局变量
let currentApiKey = localStorage.getItem('openai-api-key') || '';
let conversations = []
let currentConversationId = null

// —— 最顶部，保证在 appendMessage 之前 —— 
function pruneEmptyNodes(container) {
  // 先删空文本节点
  Array.from(container.childNodes).forEach(node => {
    if (node.nodeType === Node.TEXT_NODE && !node.textContent.trim()) {
      node.remove();
    }
  });
  // 再删空或只有 <br> 的段落
  container.querySelectorAll('p').forEach(p => {
    const txt = p.textContent.replace(/\u00A0/g, '').trim();
    if (!txt || (p.children.length === 1 && p.children[0].tagName === 'BR')) {
      p.remove();
    }
  });
}




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
  pruneEmptyNodes(contentDiv);

  container.appendChild(div).appendChild(contentDiv);
  container.scrollTop = container.scrollHeight;

  // MathJax 渲染
  if (window.MathJax && MathJax.typesetPromise) {
    MathJax.typesetPromise([contentDiv]).catch(console.error);
  }
}

// —— 在 appendMessage 同级位置（例如它后面）声明 appendLoading —— 
function appendLoading() {
  const container = document.getElementById('messages');
  const div = document.createElement('div');
  div.className = 'message assistant loading';
  const span = document.createElement('div');
  span.className = 'text';
  span.textContent = '对方正在输入…';
  div.appendChild(span);
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return div;
}

// —— 完整的 send() 实现 —— 
async function send() {
  const apiKey = localStorage.getItem('openai-api-key') || '';
  if (!apiKey) {
    alert('请先在设置里保存你的 API Key');
    return;
  }

  const input = document.getElementById('prompt');
  // 1. 去掉末尾多余换行，但保留中间换行
  let prompt = input.value.replace(/\n+$/, '');
  if (!prompt.trim()) {
    return;  // 全空或只有空白，不发送
  }

  // 2. 渲染用户消息
  appendMessage('user', prompt);
  const conv = conversations.find(c => c.id === currentConversationId);
  if (!conv) return;
  conv.messages.push({ role: 'user', content: prompt });
  input.value = '';

  // 3. 渲染 loading 占位，并保留引用
  const loadingDiv = appendLoading();

  try {
    // 4. 真正调用 OpenAI 接口（稳定版本中使用的方式）
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

    // 5. 如果接口跑出错误，抛出到 catch
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`接口返回 ${res.status}：${errText}`);
    }

    const data  = await res.json();
    const reply = data.choices[0].message.content;

    // 6. 接口返回后，先移除 loading，然后渲染真正的助手回复
    loadingDiv.remove();
    appendMessage('assistant', reply);
    conv.messages.push({ role: 'assistant', content: reply });
    saveConversations();

  } catch (e) {
    // 7. 出错也移除 loading，并显示错误信息
    loadingDiv.remove();
    appendMessage('assistant', `错误：${e.message}`);
  }
}
window.send = send;


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

// 页面加载后初始化（DOMContentLoaded）
document.addEventListener('DOMContentLoaded', () => {
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

  // 其它需要在页面加载后执行的初始化…
});



  // 渲染完页面再加载对话列表
  // … 原来 renderConversationList 之前 …


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


function bindPromptOnce() {

  promptElem.dataset.bound = 'true';  // 防止多次绑定
}


let promptBound = false;


// 确保可以从 HTML onclick 里调用到
window.showSettings = showSettings;

bindPromptOnce();

// === 主题切换逻辑 ===

function applyStoredTheme() {
  const theme = localStorage.getItem('theme') || 'dark';
  if (theme === 'dark') {
    document.body.classList.add('dark-theme');
    document.body.classList.remove('light-theme');
  } else {
    document.body.classList.add('light-theme');
    document.body.classList.remove('dark-theme');
  }
}

function toggleTheme() {
  // 如果当前是暗色，就切到亮色；否则切到暗色
  if (document.body.classList.contains('dark-theme')) {
    document.body.classList.remove('dark-theme');
    document.body.classList.add('light-theme');
    localStorage.setItem('theme', 'light');
  } else {
    document.body.classList.remove('light-theme');
    document.body.classList.add('dark-theme');
    localStorage.setItem('theme', 'dark');
  }
}


// 在 DOMContentLoaded 里，只调用一次
document.addEventListener('DOMContentLoaded', () => {
  applyStoredTheme();
  document
    .getElementById('toggle-theme-btn')
    .addEventListener('click', toggleTheme);
});



