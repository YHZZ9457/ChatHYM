// ——— 顶部：针对 marked & MathJax 的配置 ———
// 1. 关闭 marked 的 sanitize（保留所有反斜杠），启用 GitHub 风格



// 全局变量
let conversations = []
let currentConversationId = null
let currentApiKey = '';

/**
 * 从 localStorage 读取所有会话，并做好安全检查
 */
function loadConversations() {
  const data = localStorage.getItem('conversations');
  let raw;

  try {
    raw = data ? JSON.parse(data) : [];
  } catch (e) {
    console.error('解析会话列表失败：', e);
    raw = [];
  }

  if (!Array.isArray(raw)) raw = [];

  // 丢弃 null/非对象/没 id 的条目，然后映射 archived 字段
  conversations = raw
    .filter(c => c && typeof c === 'object' && 'id' in c)
    .map(c => ({
      id:       c.id,
      title:    c.title,
      model:    c.model,
      messages: Array.isArray(c.messages) ? c.messages : [],
      archived: typeof c.archived === 'boolean' ? c.archived : false
    }));
}



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

// —— 好版本 ——（整行替换掉上面那段）
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
  enableConversationDrag();
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



// —— 好版本，一体化初始化 —— 
document.addEventListener('DOMContentLoaded', () => {

  // 发送框回车发送
  const promptElem = document.getElementById('prompt');
  promptElem.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });

  // ========== 读取并应用上次界面缩放 ===========
  const savedScale = parseFloat(localStorage.getItem('ui-scale'));
  const opts = document.getElementById('ui-scale-options');
  if (opts && !isNaN(savedScale)) {
    document.documentElement.style.setProperty('--ui-scale', savedScale);
    opts.querySelectorAll('button').forEach(b => b.classList.remove('active'));
    const btn = opts.querySelector(`button[data-scale="${savedScale}"]`);
    if (btn) btn.classList.add('active');
  }

  // ========== 绑定档位按钮点击事件 ===========
  if (opts) {
    opts.addEventListener('click', e => {
      const btn = e.target.closest('button[data-scale]');
      if (!btn) return;
      const scale = parseFloat(btn.dataset.scale);
      document.documentElement.style.setProperty('--ui-scale', scale);
      localStorage.setItem('ui-scale', scale);
      opts.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  }

}); // ← 这里是回调的闭合




function getCurrentModel() {
    const modelInput = document.getElementById('model');
    return modelInput ? modelInput.value : 'gpt-3.5-turbo'; // 默认 fallback
}
window.getCurrentModel = getCurrentModel;


function saveConversations() {
  localStorage.setItem('conversations', JSON.stringify(conversations));
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


// —— 拖拽重排会话列表 —— 
function enableConversationDrag() {
  const list = document.getElementById('conversation-list');
  if (!list || typeof Sortable === 'undefined') return;

  Sortable.create(list, {
    animation: 150,
    ghostClass: 'sortable-ghost',
     chosenClass: 'sortable-chosen',
    onEnd: evt => {
      // 从数组中移动元素
      const [moved] = conversations.splice(evt.oldIndex, 1);
      conversations.splice(evt.newIndex, 0, moved);
      saveConversations();
      // 重新渲染列表并重新绑定拖拽
      renderConversationList();
      enableConversationDrag();
    }
  });
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

    document.getElementById('chat-title').textContent = conv.title;
  // 把“归档”按钮文案也更新
  const arcBtn = document.getElementById('archive-current-btn');
  if (arcBtn) {
    arcBtn.textContent = conv.archived ? '取消归档' : '归档';
  }
  // 切换界面显示
  document.getElementById('settings-area').style.display = 'none';
  document.getElementById('chat-area').style.display = 'flex';
  document.getElementById('chat-title').textContent = conv.title;
  document.getElementById('model').value = conv.model;
  document.getElementById('new-conv-btn').addEventListener('click', createNewConversation);

  const msgsElem = document.getElementById('messages');
  msgsElem.innerHTML = '';
  conv.messages.forEach(m => appendMessage(m.role, m.content));
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
  const promptElem = document.getElementById('prompt');
  if (!promptElem || promptElem.dataset.bound === 'true') return;
  promptElem.dataset.bound = 'true';
  // 如果后续需要给 prompt 绑定事件，例如快捷键，可以写在这里
}

// 在页面 DOM 完全加载后调用一次
document.addEventListener('DOMContentLoaded', bindPromptOnce);


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


/**
 * 启用行内编辑会话标题（单击即可）
 */
function enableInlineTitleEdit() {
  const header = document.querySelector('.chat-header');
  if (!header) return;

  // 编辑函数：每次都可重复绑定
  function editTitle() {
    const oldH1 = document.getElementById('chat-title');
    const oldName = oldH1.textContent;

    // 创建 <input>
    const input = document.createElement('input');
    input.id = 'chat-title-input';
    input.type = 'text';
    input.value = oldName;

    // 用于替换
    header.replaceChild(input, oldH1);
    input.focus();
    input.setSelectionRange(oldName.length, oldName.length);

    // 提交逻辑
    function commit() {
      const newName = input.value.trim() || oldName;
      // 更新数据模型并持久化
      const conv = conversations.find(c => c.id === currentConversationId);
      if (conv) {
        conv.title = newName;
        saveConversations();
      }
      // 恢复 <h1>
      const newH1 = document.createElement('h1');
      newH1.id = 'chat-title';
      newH1.textContent = newName;
      newH1.style.cursor = 'pointer';
      header.replaceChild(newH1, input);
      // 重新绑定
      newH1.addEventListener('click', editTitle);
      // 同步侧栏
      const li = document.querySelector(
        `.conversation-item[data-id="${currentConversationId}"] .title`
      );
      if (li) li.textContent = newName;
    }

    // 取消逻辑
    function cancel() {
      header.replaceChild(oldH1, input);
      oldH1.addEventListener('click', editTitle);
    }

    // 按键与失焦事件
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') commit();
      if (e.key === 'Escape') cancel();
    });
    input.addEventListener('blur', commit);
  }

  // 初次绑定在现有标题上
  const titleElem = document.getElementById('chat-title');
  if (titleElem) {
    titleElem.style.cursor = 'pointer';
    titleElem.addEventListener('click', editTitle);
  }
}

// 页面加载完成后启用
window.addEventListener('DOMContentLoaded', enableInlineTitleEdit);

/**
 * 导出所有对话为 JSON 文件
 */
function exportAllHistory() {
  // 从 localStorage 或内存读取所有会话
  const data = JSON.stringify(conversations, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'chat_history.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// 把按钮和函数绑定
document.addEventListener('DOMContentLoaded', () => {
  const exportBtn = document.getElementById('export-history-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', exportAllHistory);
  }
})


/**
 * 渲染对话列表，分“未归档”与“已归档”两个区块，并带 Del 按钮和双击重命名
 */

function getCurrentConversation() {
  return conversations.find(c => c.id === currentConversationId);
}




function toggleArchive(id) {
  const conv = conversations.find(c => c.id === id);
  if (!conv) return;
  conv.archived = !conv.archived;
  saveConversations();
  renderConversationList();
  if (currentConversationId === id) createNewConversation();
}

function renderConversationList() {
  const list = document.getElementById('conversation-list');
  list.innerHTML = '';
// 未归档
conversations
  .filter(c => !c.archived)
  .forEach(c => {
    const li = document.createElement('li');
    li.dataset.id = c.id;
    li.textContent = c.title;
    if (c.id === currentConversationId) {
      li.classList.add('active');
    }
    li.addEventListener('click', () => loadConversation(c.id));
    li.addEventListener('dblclick', () => renameConversation(c.id));

    // Del 按钮
    const del = document.createElement('button');
    del.textContent = 'Del';
    del.className = 'del';
    del.addEventListener('click', e => {
      e.stopPropagation();
      // 二次确认
      if (confirm(`确定要删除「${c.title}」吗？此操作无法恢复。`)) {
        deleteConversation(c.id);
      }
    });

    li.appendChild(del);
    list.appendChild(li);
  });
  // 已归档
  const archived = conversations.filter(c => c.archived);
 if (archived.length) {
   // 可折叠标题
   const toggle = document.createElement('li');
   toggle.className = 'archive-toggle';
   toggle.textContent = `已归档 (${archived.length})`;
   // 点击展开/收起
   toggle.addEventListener('click', () => {
     toggle.classList.toggle('expanded');
   });
   list.appendChild(toggle);

   // 二级列表
   const sub = document.createElement('ul');
   sub.className = 'archived-list';
   archived.forEach(c => {
     const li = document.createElement('li');
     li.dataset.id = c.id;
     li.textContent = c.title;
     li.classList.add('archived');
     if (c.id === currentConversationId) li.classList.add('active');
     li.addEventListener('click', () => loadConversation(c.id));
     li.addEventListener('dblclick', () => renameConversation(c.id));
     sub.appendChild(li);
   });
   list.appendChild(sub);
  }
    }


// Bindings
document.addEventListener('DOMContentLoaded', () => {
  loadApiKeyToInput();
  loadConversations();
  renderConversationList();
  enableConversationDrag();
  if (conversations.length) loadConversation(conversations[0].id);
  else createNewConversation();
  document.getElementById('new-conv-btn').addEventListener('click', createNewConversation);
  document.getElementById('archive-current-btn').addEventListener('click', () => toggleArchive(currentConversationId));
  document.getElementById('delete-current-btn').addEventListener('click', () => {
  if (!currentConversationId) return;
  const conv = conversations.find(c => c.id === currentConversationId);
  if (!conv) return;
  // 二次确认
  if (confirm(`确定要删除当前会话「${conv.title}」吗？此操作无法恢复。`)) {
    deleteConversation(currentConversationId);
  }
});

  document.getElementById('send-btn').addEventListener('click', send);
  document.getElementById('prompt').addEventListener('keydown', e => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); send(); }});
  document.getElementById('model').addEventListener('change', () => { getCurrentConversation().model = document.getElementById('model').value; saveConversations(); });
  // —— 放到 DOMContentLoaded 回调里 ——

// 先拿到隐藏的 <input type="file">
const importInput = document.getElementById('import-file');
if (importInput) {
  importInput.addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const imported = JSON.parse(text);
      if (!Array.isArray(imported)) throw new Error('JSON 顶层应为数组');

      // 合并到现有 conversations，去重
      imported.forEach(conv => {
        if (!conversations.find(c => c.id === conv.id)) {
          conversations.push(conv);
        }
      });

      // 存储并刷新 UI
      saveConversations();
      renderConversationList();
      if (imported.length) loadConversation(imported[0].id);

      alert(`成功导入 ${imported.length} 条对话`);
    } catch (err) {
      console.error(err);
      alert('导入失败：' + err.message);
    } finally {
      // 重置 input，以便下次能重新选同一个文件
      importInput.value = '';
    }
  });
}
});
