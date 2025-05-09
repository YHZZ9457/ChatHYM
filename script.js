// —— 第一部分：全局函数定义 ——

// 全局变量
let currentApiKey = localStorage.getItem('openai-api-key') || ''
let conversations = []
let currentConversationId = null


function appendMessage(role, text, save = true) {
  const msgsElem = document.getElementById('messages');
  const div = document.createElement('div');
  div.className = 'message ' + (role === 'assistant' ? 'assistant' : 'user');
  const isMarkdownExample = text.includes('# ') || text.includes('```');
  const parsed = (role === 'assistant' && typeof marked !== 'undefined')
    ? marked.parse(text).trim().replace(/<p>(\s|&nbsp;)*<\/p>$/g, '')
    : text;
    const promptElem = document.getElementById('prompt');

  div.innerHTML = `<div class="text">${parsed}</div>`;
  msgsElem.appendChild(div);
  msgsElem.scrollTop = msgsElem.scrollHeight;

  if (save) {
    const conv = conversations.find(c => c.id === currentConversationId);
    if (conv) {
      conv.messages.push({ role, content: text });
      saveConversations();
    }
  }
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
  if (key) {
    localStorage.setItem('openai-api-key', key);
    alert('API Key 已保存');
  } else {
    alert('请输入有效的 API Key');
  }
}

window.saveApiKey = saveApiKey;



function loadApiKeyToInput() {
  const saved = localStorage.getItem('openai-api-key');
  if (saved) {
    document.getElementById('api-key').value = saved;
    currentApiKey = saved;
  }
}



// 2. 其他全局函数

// —— 第二部分：DOMContentLoaded 初始化 —— 
document.addEventListener('DOMContentLoaded', () => {
  loadApiKeyToInput();
  loadConversations();
  renderConversationList();
  if (conversations.length) {
    loadConversation(conversations[0].id);
  } else {
    createNewConversation();
  }

  // 模型下拉改变
  const modelSel = document.getElementById('model');
  if (modelSel) {
    modelSel.addEventListener('change', () => {
      const conv = getCurrentConversation();
      if (conv) {
        conv.model = modelSel.value;
        saveConversations();
      }
    });
  }

  // 绑定Del按钮（此时 deleteConversation 已经是全局可用的）
  const deleteBtn = document.getElementById('delete-current-btn');
  console.log('[DEBUG] deleteBtn:', deleteBtn);
  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => {
      console.log('[DEBUG] delete button clicked');
      if (!currentConversationId) return;
      const conv = conversations.find(c => c.id === currentConversationId);
      console.log('[DEBUG] deleting:', conv);
      if (conv && confirm(`确认删除「${conv.title}」吗？`)) {
        deleteConversation(currentConversationId);
      }
    });
  }

  // …此处继续你的其它初始化：快捷键、渲染列表、加载会话等…
});


  // 主题初始化
  const saved = localStorage.getItem('chat-theme') || 'dark';
  document.body.classList.add(saved + '-theme');

  // 主题切换按钮
  const btn = document.getElementById('toggle-theme-btn');
  if (btn) {
    btn.addEventListener('click', () => {
      document.body.classList.toggle('dark-theme');
      document.body.classList.toggle('light-theme');
      localStorage.setItem(
        'chat-theme',
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
      'chat-theme',
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
  const input = document.getElementById('prompt');
  const prompt = input.value.trim();
  if (!prompt) return;

  appendMessage('user', prompt); // 会 save user 消息
  input.value = '';

  const conv = conversations.find(c => c.id === currentConversationId);
  if (!conv) return;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + currentApiKey
    },
    body: JSON.stringify({
      model: conv.model,
      messages: conv.messages.map(m => ({
        role: m.role === 'bot' ? 'assistant' : m.role,
        content: m.content
      }))
    })
  });

  const data = await res.json();
  const reply = data.choices[0].message.content;

  // ✅ 只渲染，不保存，由 appendMessage 自动 save
  appendMessage('assistant', reply); // save=true by default

  // ❌ 不要再 push 或 save 第二次！
  // conv.messages.push(...)
  // saveConversations()
}



// 关键！将 send 函数暴露给 HTML
window.send = send;

function bindPromptOnce() {

  promptElem.dataset.bound = 'true';  // 防止多次绑定
}


let promptBound = false;


// 确保可以从 HTML onclick 里调用到
window.showSettings = showSettings;

bindPromptOnce();




