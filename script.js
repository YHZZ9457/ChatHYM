// --- START OF FILE script.js ---

// ——— 顶部：针对 marked & MathJax 的配置 ———
// 1. 关闭 marked 的 sanitize（保留所有反斜杠），启用 GitHub 风格
// (假设 marked.js 已经在外部配置好了，或者这只是一个占位注释)

// 全局变量
let activeModel = ''; // 存储当前加载对话的模型
let conversations = [];
let currentConversationId = null;

// --- 辅助函数 ---

function storageKeyFor(provider) {
  // 根据提供者返回本地存储的键名
  return {
    openai: 'openai-api-key',
    deepseek: 'deepseek-api-key',
    siliconflow: 'siliconflow-api-key',
    gemini: 'gemini-api-key',
    anthropic: 'anthropic-api-key', 
  }[provider];
}

function escapeHtml(str) {
  // 转义 HTML 特殊字符
  return str
    .replace(/&/g, '&') // 已修正
    .replace(/</g, '<')
    .replace(/>/g, '>');
}

function getCurrentModel() {
  const modelInput = document.getElementById('model');
  return modelInput ? modelInput.value : 'gpt-3.5-turbo';
}

function getCurrentConversation() {
  return conversations.find(c => c.id === currentConversationId);
}

// --- Local Storage 管理 ---

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

  conversations = raw
    .filter(c => c && typeof c === 'object' && 'id' in c)
    .map(c => ({
      id: c.id,
      title: c.title,
      model: c.model,
      messages: Array.isArray(c.messages) ? c.messages : [],
      archived: typeof c.archived === 'boolean' ? c.archived : false,
      isNew: typeof c.isNew === 'boolean' ? c.isNew : false,
    }));
}

function saveConversations() {
  localStorage.setItem('conversations', JSON.stringify(conversations));
}

// --- DOM 操作与渲染 ---

function pruneEmptyNodes(container) {
  Array.from(container.childNodes).forEach(node => {
    if (node.nodeType === Node.TEXT_NODE && !node.textContent.trim()) {
      node.remove();
    }
  });
  container.querySelectorAll('p').forEach(p => {
    const txt = p.textContent.replace(/\u00A0/g, '').trim();
    if (!txt || (p.children.length === 1 && p.children[0].tagName === 'BR')) {
      p.remove();
    }
  });
}

function appendMessage(role, text, modelForNote, reasoningText) {
  // --- 在函数的开头，隐藏空聊天提示 ---
  const emptyChatPlaceholder = document.getElementById('empty-chat-placeholder');
  if (emptyChatPlaceholder && emptyChatPlaceholder.style.display !== 'none') {
    // emptyChatPlaceholder.parentNode?.removeChild(emptyChatPlaceholder); // 从 DOM 移除
    emptyChatPlaceholder.style.display = 'none'; // 或者只是隐藏
  }
  // --- 结束隐藏提示 ---

  const container = document.getElementById('messages');
  const messageWrapperDiv = document.createElement('div');
  messageWrapperDiv.className = 'message-wrapper';

  if (role === 'user') {
    messageWrapperDiv.classList.add('user-message-wrapper');
  } else {
    messageWrapperDiv.classList.add('assistant-message-wrapper');
  }

  const messageDiv = document.createElement('div');
  messageDiv.className = 'message ' + (role === 'assistant' || role === 'model' ? 'assistant' : 'user');

  let reasoningContentElementForMathJax = null;

  // --- 1. 处理并添加思考过程 (如果存在) ---
  if (reasoningText && (role === 'assistant' || role === 'model')) {
    const reasoningBlockDiv = document.createElement('div');
    reasoningBlockDiv.className = 'reasoning-block';

    const label = document.createElement('div');
    label.className = 'reasoning-label';
    label.textContent = '思考过程:';
    reasoningBlockDiv.appendChild(label);

    reasoningContentElementForMathJax = document.createElement('pre');
    reasoningContentElementForMathJax.className = 'reasoning-content';
    reasoningContentElementForMathJax.textContent = reasoningText;
    reasoningBlockDiv.appendChild(reasoningContentElementForMathJax);

    messageDiv.appendChild(reasoningBlockDiv);
  }

  // --- 2. 处理并添加主要回复内容 ---
  const safeText = typeof text === 'string' ? text : String(text || '');
  let contentHtml = '';
  if (safeText.trim() !== '' || ((role === 'assistant' || role === 'model') && !reasoningText) ) { 
    // 只有当文本不为空，或者角色是助手且没有思考过程时（避免只有思考过程时出现重复的空内容块）才处理 markdown
    contentHtml = (typeof marked !== 'undefined')
      ? marked.parse(safeText)
      : escapeHtml(safeText);
  }

  const contentDiv = document.createElement('div');
  contentDiv.className = 'text';
  if (contentHtml.trim() !== '') {
    contentDiv.innerHTML = contentHtml;
  }

  contentDiv.querySelectorAll('pre').forEach(pre => {
    pre.style.position = 'relative';
    const btn = document.createElement('button');
    btn.className = 'copy-btn';
    btn.textContent = '复制';
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const codeElem = pre.querySelector('code');
      let textToCopy = codeElem ? codeElem.innerText : (() => {
        const clone = pre.cloneNode(true);
        clone.querySelector('.copy-btn')?.remove();
        return clone.innerText;
      })();
      navigator.clipboard.writeText(textToCopy).then(() => {
        btn.textContent = '已复制';
        setTimeout(() => btn.textContent = '复制', 2000);
      });
    });
    pre.appendChild(btn);
  });

  pruneEmptyNodes(contentDiv);
  // 只有当 contentDiv 确实有内容（即使是空的Markdown结果也可能有空的<p>），
  // 或者它是助手消息且有模型注释时，才添加它。
  // 避免在只有思考过程的情况下添加一个空的 .text div。
  if (contentDiv.innerHTML.trim() !== '' || ((role === 'assistant' || role === 'model') && modelForNote && !reasoningText) ) {
      messageDiv.appendChild(contentDiv);
  }


// --- 3. 添加模型注释 (如果需要) ---
if ((role === 'assistant' || role === 'model') && modelForNote) {
  const note = document.createElement('div');
  note.className = 'model-note';
  
  let displayModelName = modelForNote; // 默认使用传入的原始模型值
  const modelSelectElement = document.getElementById('model'); // 获取 select 元素

  if (modelSelectElement) {
    // 尝试找到 value 属性与 modelForNote 完全匹配的 option
    const selectedOption = modelSelectElement.querySelector(`option[value="${modelForNote}"]`);
    if (selectedOption) {
      displayModelName = selectedOption.textContent; // 如果找到，使用该 option 的显示文本
    } else {
      // 后备逻辑：如果找不到完全匹配的，尝试去掉前缀 (如 "sf::", "openai::" 等)
      // 这假设你的 modelForNote 总是 "prefix::ActualModelID" 的格式
      const parts = String(modelForNote).split('::'); // 确保 modelForNote 是字符串
      if (parts.length === 2) {
        displayModelName = parts[1]; // 使用 "::" 后面的部分
        console.log(`[模型注释] 未在下拉列表中找到值 "${modelForNote}"，将显示解析后的名称: "${displayModelName}"`);
      } else {
        // 如果连 "::" 都没有，就直接显示原始的 modelForNote，但这种情况应该较少
        console.warn(`[模型注释] 无法从 "${modelForNote}" 解析出更友好的名称，将显示原始值。`);
      }
    }
  } else {
    console.warn("[模型注释] 未找到 ID 为 'model' 的 select 元素。");
  }
  
  note.textContent = `模型：${displayModelName}`; // 使用获取到的或处理后的显示名称
  messageDiv.appendChild(note);
}

  // --- 4. 创建并配置删除单条消息的按钮 ---
  const deleteMsgBtn = document.createElement('button');
  deleteMsgBtn.className = 'delete-message-btn';
  deleteMsgBtn.textContent = '✕';
  deleteMsgBtn.title = '删除此条消息';

  deleteMsgBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const convId = messageWrapperDiv.dataset.conversationId;
    const msgIndex = parseInt(messageWrapperDiv.dataset.messageIndex, 10);

    if (convId && !isNaN(msgIndex)) {
      deleteSingleMessage(messageWrapperDiv, convId, msgIndex);
    } else {
      console.error('无法删除消息：缺少对话ID或消息索引。', messageWrapperDiv.dataset);
    }
  });

  // --- 5. 根据角色决定按钮和气泡在包裹层中的顺序 ---
  if (role === 'user') {
    messageWrapperDiv.appendChild(deleteMsgBtn);
    messageWrapperDiv.appendChild(messageDiv);
  } else { 
    messageWrapperDiv.appendChild(messageDiv);
    messageWrapperDiv.appendChild(deleteMsgBtn);
  }
  
  // --- 6. 将整个消息包裹层添加到消息容器中 ---
  // 只有当 messageDiv 内部确实有内容（主要内容、思考过程或模型注释）时才添加整个 wrapper
  // 或者它是用户消息（用户消息即使为空也应该有个气泡和删除按钮）
  if (messageDiv.hasChildNodes() || role === 'user') {
    container.appendChild(messageWrapperDiv);
  }
  
  container.scrollTop = container.scrollHeight;

  // --- 7. MathJax 渲染逻辑 ---
  if (window.MathJax && MathJax.typesetPromise) {
    const elementsToTypeset = [];
    // 确保只对实际添加到 DOM 并且有内容的元素进行 typeset
    if (messageDiv.contains(contentDiv) && contentDiv.innerHTML.trim() !== '') {
        elementsToTypeset.push(contentDiv);
    }
    if (reasoningContentElementForMathJax && messageDiv.contains(reasoningContentElementForMathJax)) {
        elementsToTypeset.push(reasoningContentElementForMathJax);
    }
    if (elementsToTypeset.length > 0) {
        MathJax.typesetPromise(elementsToTypeset).catch(console.error);
    }
  }

  // 只返回被实际添加到DOM的wrapper，否则可能返回一个未被添加的元素
  if (messageDiv.hasChildNodes() || role === 'user') {
    return messageWrapperDiv;
  }
  return null; // 如果因为是空助手消息且无思考过程而未添加，则返回null
}

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

function renderConversationList() {
  const list = document.getElementById('conversation-list');
  
  let isArchivePreviouslyExpanded = false;
  const oldArchiveToggle = list.querySelector('.archive-toggle');
  if (oldArchiveToggle && oldArchiveToggle.classList.contains('expanded')) {
    isArchivePreviouslyExpanded = true;
  }

  list.innerHTML = '';

  conversations
    .filter(c => !c.archived)
    .forEach(c => {
      const li = document.createElement('li');
      li.className = 'conversation-item';
      li.dataset.id = c.id;

      const titleSpan = document.createElement('span');
      titleSpan.className = 'title';
      titleSpan.textContent = c.title;
      li.appendChild(titleSpan);

      if (c.isNew) {
        li.classList.add('new-conv');
      }
      if (c.id === currentConversationId) {
        li.classList.add('active');
      }

      li.addEventListener('click', () => {
        if (c.isNew) {
            c.isNew = false;
        }
        loadConversation(c.id); 
      });
      li.addEventListener('dblclick', () => renameConversation(c.id));

      const delBtn = document.createElement('button');
      delBtn.textContent = 'Del';
      delBtn.className = 'del';
      delBtn.addEventListener('click', e => {
        e.stopPropagation();
        if (confirm(`确定要删除「${c.title}」吗？此操作无法恢复。`)) {
          deleteConversation(c.id);
        }
      });
      li.appendChild(delBtn);
      list.appendChild(li);
    });

  const archivedConversations = conversations.filter(c => c.archived);
  if (archivedConversations.length) {
    const toggle = document.createElement('li');
    toggle.className = 'archive-toggle';
    toggle.textContent = `已归档 (${archivedConversations.length})`;
    
    if (isArchivePreviouslyExpanded) {
      toggle.classList.add('expanded');
    }

    toggle.addEventListener('click', () => {
        toggle.classList.toggle('expanded');
        const subListElement = toggle.nextElementSibling;
        if (subListElement && subListElement.classList.contains('archived-list')) {
            subListElement.style.display = toggle.classList.contains('expanded') ? 'block' : 'none';
        }
    });
    list.appendChild(toggle);

    const subList = document.createElement('ul');
    subList.className = 'archived-list';
    
    if (isArchivePreviouslyExpanded) {
      subList.style.display = 'block';
    } else {
      subList.style.display = 'none'; 
    }

    archivedConversations.forEach(c => {
      const li = document.createElement('li');
      li.className = 'conversation-item archived'; 
      li.dataset.id = c.id;
      
      const titleSpan = document.createElement('span');
      titleSpan.className = 'title';
      titleSpan.textContent = c.title;
      li.appendChild(titleSpan);

      if (c.id === currentConversationId) {
        li.classList.add('active');
      }
      li.addEventListener('click', () => loadConversation(c.id));
      li.addEventListener('dblclick', () => renameConversation(c.id));
      subList.appendChild(li);
    });
    list.appendChild(subList);
  }
  
  enableConversationDrag(); 
}

function enableConversationDrag() {
  const list = document.getElementById('conversation-list');
  if (!list || typeof Sortable === 'undefined') return;

  if (list.sortableInstance) {
    list.sortableInstance.destroy();
  }

  list.sortableInstance = Sortable.create(list, {
    animation: 150,
    ghostClass: 'sortable-ghost',
    chosenClass: 'sortable-chosen',
    filter: '.archive-toggle, .archived-list, .archived-item',
    preventOnFilter: true,
    onEnd: evt => {
      if (evt.oldIndex === undefined || evt.newIndex === undefined) return;
      const nonArchived = conversations.filter(c => !c.archived);
      const [movedItem] = nonArchived.splice(evt.oldIndex, 1);
      nonArchived.splice(evt.newIndex, 0, movedItem);
      conversations = [...nonArchived, ...conversations.filter(c => c.archived)];
      saveConversations();
      renderConversationList();
    }
  });
}

// --- 对话逻辑 ---

function createNewConversation() {
  const id = Date.now().toString();
  const newConv = {
    id,
    title: '新对话',
    model: getCurrentModel(),
    messages: [],
    archived: false,
    isNew: true,
  };
  conversations.unshift(newConv);
  saveConversations();
  loadConversation(id);
}
window.createNewConversation = createNewConversation;


function loadConversation(id) {
  const conv = conversations.find(c => c.id === id);
  if (!conv) {
    if (conversations.length > 0) {
        loadConversation(conversations.filter(c => !c.archived)[0]?.id || conversations[0].id);
    } else {
        createNewConversation();
    }
    return;
  }

  if (conv.isNew) {
    conv.isNew = false;
  }

  currentConversationId = id;
  activeModel = conv.model;

  document.getElementById('chat-title').textContent = conv.title;
  const archiveBtn = document.getElementById('archive-current-btn');
  if (archiveBtn) {
    archiveBtn.textContent = conv.archived ? '取消归档' : '归档';
  }
  document.getElementById('model').value = conv.model;

  document.getElementById('settings-area').style.display = 'none';
  document.getElementById('chat-area').style.display = 'flex';

  const messagesContainer = document.getElementById('messages');
  const emptyChatPlaceholder = document.getElementById('empty-chat-placeholder');

  // 1. 清空 messagesContainer 中除了 placeholder 之外的所有内容
  //    并且确保 placeholder 是 messagesContainer 的子元素（如果它还不是）
  let placeholderInPlace = false;
  const childrenToRemove = [];
  for (let i = 0; i < messagesContainer.children.length; i++) {
    const child = messagesContainer.children[i];
    if (child === emptyChatPlaceholder) {
      placeholderInPlace = true;
    } else {
      childrenToRemove.push(child);
    }
  }
  childrenToRemove.forEach(child => messagesContainer.removeChild(child));
  
  if (!placeholderInPlace && emptyChatPlaceholder) { // 如果 placeholder 不在，加到最前面
    messagesContainer.insertBefore(emptyChatPlaceholder, messagesContainer.firstChild);
  }


  // 2. 过滤有效消息
  const messagesToRender = conv.messages.filter(m => {
    const hasContent = typeof m.content === 'string' && m.content.trim() !== '';
    const hasReasoning = typeof m.reasoning_content === 'string' && m.reasoning_content.trim() !== '';
    return hasContent || hasReasoning || (m.role === 'user');
  });

  // 3. 根据是否有消息来显示/隐藏占位符或渲染消息
  if (messagesToRender.length === 0) {
    if (emptyChatPlaceholder) {
      emptyChatPlaceholder.style.display = 'flex'; // 显示提示
    }
  } else {
    if (emptyChatPlaceholder) {
      emptyChatPlaceholder.style.display = 'none'; // 隐藏提示
    }
    
    let messageIndex = 0;
    messagesToRender.forEach(m => {
      const messageElement = appendMessage(
        m.role,
        m.content,
        m.model || conv.model,
        m.reasoning_content || null
      );
      if (messageElement) {
          messageElement.dataset.conversationId = conv.id;
          messageElement.dataset.messageIndex = messageIndex;
          messageIndex++;
      }
    });
  }
  
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
  renderConversationList();
  enableInlineTitleEdit();
}

function deleteSingleMessage(messageElement, conversationId, messageIndex) {
  const conv = conversations.find(c => c.id === conversationId);
  if (!conv || messageIndex < 0 || messageIndex >= conv.messages.length) {
    console.error('无法删除消息：无效的对话或消息索引。');
    if (confirm('数据可能不一致。确实要从界面移除此条消息吗？')) {
      messageElement.remove(); // 即使数据有问题，也尝试从界面移除
    }
    return;
  }

  const messageToConfirm = conv.messages[messageIndex];
  let confirmTextPreview = "";
  if (messageToConfirm && messageToConfirm.content) { // 确保 messageToConfirm 和 content 存在
    confirmTextPreview = String(messageToConfirm.content).substring(0, 50);
    if (String(messageToConfirm.content).length > 50) {
      confirmTextPreview += "...";
    }
  } else {
    confirmTextPreview = "(无法预览内容)";
  }


  if (confirm(`确实要删除这条消息吗？\n\n"${confirmTextPreview}"`)) {
    // 1. 从数据模型中删除
    const deletedMessage = conv.messages.splice(messageIndex, 1); // splice 会返回被删除的元素数组
    saveConversations();

    console.log(`消息已从数据中删除 (对话ID: ${conversationId}, 原索引: ${messageIndex})`, deletedMessage);

    // 2. 如果删除的是当前对话的消息，则重新加载整个对话以更新 DOM 和索引
    // 这样比手动更新所有后续 DOM 元素的 data-message-index 更可靠
    if (conversationId === currentConversationId) {
      loadConversation(currentConversationId);
    } else {
      // 如果删除的不是当前对话的消息（例如从一个全局列表或其他界面触发，目前你的设计不会）
      // 那么只从 DOM 中移除该元素，并可能需要更新其他相关的列表视图
      messageElement.remove();
      renderConversationList(); // 例如，如果对话列表也显示消息摘要或计数
    }
  }
}

function renameConversation(id) {
  const conv = conversations.find(c => c.id === id);
  if (!conv) return;
  const newTitle = prompt('输入新的对话标题：', conv.title);
  if (newTitle && newTitle.trim()) {
    conv.title = newTitle.trim();
    saveConversations();
    renderConversationList();
    if (id === currentConversationId) {
      document.getElementById('chat-title').textContent = conv.title;
    }
  }
}

function deleteConversation(id) {
  const idx = conversations.findIndex(c => c.id === id);
  if (idx === -1) return;

  const wasCurrent = conversations[idx].id === currentConversationId;
  conversations.splice(idx, 1);
  saveConversations();

  if (wasCurrent) {
    if (conversations.length > 0) {
      const nextNonArchived = conversations.filter(c => !c.archived);
      const newIdToLoad = (nextNonArchived.length > 0) ? nextNonArchived[0].id : conversations[0].id;
      loadConversation(newIdToLoad);
    } else {
      createNewConversation();
    }
  } else {
    renderConversationList();
  }
}

function toggleArchive(id) {
  const conv = conversations.find(c => c.id === id);
  if (!conv) return;
  conv.archived = !conv.archived;
  conv.isNew = false;
  saveConversations();

  if (conv.archived && currentConversationId === id) {
    const nextNonArchived = conversations.find(c => !c.archived);
    if (nextNonArchived) {
      loadConversation(nextNonArchived.id);
    } else {
      createNewConversation();
    }
  } else if (!conv.archived) {
    loadConversation(conv.id);
  } else {
    renderConversationList();
  }
}


async function send() {
  // --- 步骤1: 捕获发起请求时的对话信息 ---
  const conversationAtRequestTime = getCurrentConversation(); // 获取发起请求时的对话对象
  if (!conversationAtRequestTime) {
    alert("请先选择或创建一个对话。");
    return;
  }
  const conversationIdAtRequestTime = conversationAtRequestTime.id; // 捕获当时的对话ID
  const modelValueFromOption = conversationAtRequestTime.model;       // 捕获当时对话选择的原始模型值(含前缀)

  let actualProvider;
  let modelNameForAPI; // 这是真正发送给API的model ID，不含前缀

  // --- 根据模型值的前缀推断 Provider 和提取真实模型名 ---
  const parts = String(modelValueFromOption).split('::');
  if (parts.length === 2) {
    const prefix = parts[0].toLowerCase();
    modelNameForAPI = parts[1]; 
    
    switch (prefix) {
      case 'sf': actualProvider = 'siliconflow'; break;
      case 'openai': actualProvider = 'openai'; break;
      case 'deepseek': actualProvider = 'deepseek'; break;
      case 'gemini': actualProvider = 'gemini'; break;
      case 'anthropic': actualProvider = 'anthropic'; break;
      default:
        console.warn(`未知的模型前缀: "${prefix}"，将使用设置页面的 Provider。`);
        const providerSelFallbackDefault = document.getElementById('api-provider');
        actualProvider = providerSelFallbackDefault.value;
        modelNameForAPI = modelValueFromOption; 
    }
  } else {
    modelNameForAPI = modelValueFromOption;
    console.warn(`模型值 "${modelValueFromOption}" 不包含提供商前缀，将使用设置页面的 Provider。`);
    const providerSelFallbackElse = document.getElementById('api-provider');
    actualProvider = providerSelFallbackElse.value;
  }
  console.log(`[发送] 原始选择: "${modelValueFromOption}", 提供商: ${actualProvider}, API模型ID: ${modelNameForAPI}`);

  const providerToUse = actualProvider;
  const apiKeyStorageKey = storageKeyFor(providerToUse);
  const apiKey = localStorage.getItem(apiKeyStorageKey) || '';

  if (!apiKey) {
    const providerSelectElement = document.getElementById('api-provider');
    let providerDisplayName = providerToUse;
    for (let i = 0; i < providerSelectElement.options.length; i++) {
      if (providerSelectElement.options[i].value === providerToUse) {
        providerDisplayName = providerSelectElement.options[i].text;
        break;
      }
    }
    alert(`请先在“设置”中为 ${providerDisplayName} 保存 API Key`);
    showSettings();
    return;
  }

  const promptInput = document.getElementById('prompt');
  const promptText = promptInput.value.replace(/\n$/, '');
  if (!promptText.trim()) return;

  if (currentConversationId === conversationIdAtRequestTime) {
      appendMessage('user', promptText, null, null);
  }
  const userRoleForStorage = 'user';
  conversationAtRequestTime.messages.push({ role: userRoleForStorage, content: promptText, model: modelValueFromOption });
  
  promptInput.value = '';
  if (promptInput) {
    const initialTextareaHeight = '42px'; 
    promptInput.style.height = initialTextareaHeight;
    promptInput.style.overflowY = 'hidden';
  }
  saveConversations();

  const loadingDiv = appendLoading();

  let apiUrl;
  let headers = { 'Content-Type': 'application/json' };
  let bodyPayload;
  let assistantReply = '（无回复）';
  let thinkingProcess = null;

  // --- 封装一个通用的消息映射函数 (除了 Gemini) ---
  const mapMessagesForStandardProviders = (messages) => {
    return messages
      .filter(m => typeof m.content === 'string' && m.content.trim() !== '')
      .map(m => {
        let finalRole;
        if (m.role === 'user') {
          finalRole = 'user';
        } else if (m.role === 'assistant' || m.role === 'bot' || m.role === 'model') {
          finalRole = 'assistant'; // 标准 API 通常用 'assistant'
        } else if (m.role === 'system') {
          finalRole = 'system';
        } else {
          console.warn(`[发送消息映射] 发现无效角色: '${m.role}'，内容: "${String(m.content || '').substring(0,30)}..."。将默认为 'user'。`);
          finalRole = 'user';
        }
        return { role: finalRole, content: m.content };
      });
  };
  // --- 结束消息映射函数 ---
  
  const ANTHROPIC_API_VERSION = "2023-06-01"; // Anthropic API 版本

  try {
    let currentTemperature = parseFloat(localStorage.getItem('model-temperature'));
    if (isNaN(currentTemperature) || currentTemperature < 0 || currentTemperature > 2) { // 基本范围检查
        currentTemperature = 0.7; // 默认值
    }

    switch (providerToUse) {
      case 'openai':
      case 'deepseek':
      case 'siliconflow':
        apiUrl = providerToUse === 'openai' ? 'https://api.openai.com/v1/chat/completions' :
                 providerToUse === 'deepseek' ? 'https://api.deepseek.com/chat/completions' :
                 'https://api.siliconflow.cn/v1/chat/completions';
        headers['Authorization'] = `Bearer ${apiKey}`;
        bodyPayload = {
          model: modelNameForAPI,
          messages: mapMessagesForStandardProviders(conversationAtRequestTime.messages),
          temperature: currentTemperature,
          // max_tokens: 1024, // 可选，如果API支持且你需要控制
        };
        break;
      case 'anthropic':
        apiUrl = 'https://api.anthropic.com/v1/messages';
        headers['x-api-key'] = apiKey;
        headers['anthropic-version'] = ANTHROPIC_API_VERSION;

        const claudeMessages = [];
        let lastClaudeRole = null;
        conversationAtRequestTime.messages.forEach(msg => {
            let roleForClaude = null;
            if (msg.role === 'user') {
                roleForClaude = 'user';
            } else if (msg.role === 'assistant' || msg.role === 'bot' || msg.role === 'model') {
                roleForClaude = 'assistant';
            }

            if (roleForClaude) {
                if (claudeMessages.length === 0 && roleForClaude !== 'user') {
                    console.warn("[Claude] 历史消息第一条不是 'user'，已跳过:", msg);
                    return; 
                }
                if (roleForClaude === lastClaudeRole && claudeMessages.length > 0) {
                    claudeMessages[claudeMessages.length - 1].content += "\n" + msg.content;
                } else {
                    claudeMessages.push({ role: roleForClaude, content: msg.content });
                    lastClaudeRole = roleForClaude;
                }
            }
        });
        if (claudeMessages.length > 0 && claudeMessages[claudeMessages.length -1].role === 'assistant') {
            console.warn("[Claude] 准备发送的消息历史最后一条是 assistant，API 可能会报错。");
        }

        bodyPayload = {
          model: modelNameForAPI,
          messages: claudeMessages,
          max_tokens: 1024, 
          temperature: currentTemperature
          // "system": "Your system prompt here...", // 如果需要系统提示
        };
        break;
      case 'gemini':
        apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelNameForAPI}:generateContent?key=${apiKey}`;
        let geminiTemperature = currentTemperature;
        if (geminiTemperature > 1.0) geminiTemperature = 1.0;
        if (geminiTemperature < 0.0) geminiTemperature = 0.0;
        bodyPayload = {
          contents: conversationAtRequestTime.messages
            .filter(m => typeof m.content === 'string' && m.content.trim() !== '')
            .map(m => {
              let roleForGemini;
              if (m.role === 'user') {
                roleForGemini = 'user';
              } else if (m.role === 'assistant' || m.role === 'bot' || m.role === 'model') {
                roleForGemini = 'model';
              } else {
                console.warn(`[Gemini映射] 发现无效角色: '${m.role}'，默认为 'user'`);
                roleForGemini = 'user';
              }
              return { role: roleForGemini, parts: [{ text: m.content }] };
            }),
          generationConfig: { temperature: geminiTemperature }
        };
        break;
      default:
        throw new Error('未知的或无法推断的 API Provider: ' + providerToUse);
    }

    const body = JSON.stringify(bodyPayload);
    console.log(`[发送] 请求体发往 ${providerToUse} (${apiUrl}):`, body);

    const response = await fetch(apiUrl, { method: 'POST', headers, body });
    if (!response.ok) {
      const errorText = await response.text();
      let detail = "";
      try {
        const errJson = JSON.parse(errorText);
        detail = errJson.error?.message || JSON.stringify(errJson);
      } catch (e) {
        detail = errorText;
      }
      throw new Error(`接口返回 ${response.status}：${detail}`);
    }
    const data = await response.json();

    console.log("----------- API 响应数据 -----------");
    console.log(JSON.stringify(data, null, 2));
    console.log("------------------------------------");

    if (providerToUse === 'gemini') {
        if (data.candidates && data.candidates.length > 0 &&
            data.candidates[0].content && data.candidates[0].content.parts &&
            data.candidates[0].content.parts.length > 0) {
            assistantReply = data.candidates[0].content.parts[0].text;
        } else if (data.promptFeedback && data.promptFeedback.blockReason) {
            assistantReply = `请求被阻止：${data.promptFeedback.blockReason}`;
            if (data.promptFeedback.safetyRatings) {
            assistantReply += ` (Safety Ratings: ${JSON.stringify(data.promptFeedback.safetyRatings)})`;
            }
        }
    } else if (providerToUse === 'anthropic') {
      if (data.content && Array.isArray(data.content) && data.content.length > 0) {
        const textBlock = data.content.find(block => block.type === 'text');
        if (textBlock && typeof textBlock.text === 'string') {
          assistantReply = textBlock.text;
        }
        const toolUseBlock = data.content.find(block => block.type === 'tool_use');
        if (toolUseBlock && toolUseBlock.name) {
          thinkingProcess = `模型请求使用工具: ${toolUseBlock.name}\nID: ${toolUseBlock.id}\n输入: ${JSON.stringify(toolUseBlock.input, null, 2)}`;
        }
      }
      if (data.stop_reason && !['end_turn', 'max_tokens', 'tool_use'].includes(data.stop_reason) && !thinkingProcess && assistantReply !== '（无回复）') {
          assistantReply += ` (停止原因: ${data.stop_reason})`;
      }
    } else { 
      if (data.choices && data.choices.length > 0 && data.choices[0].message) {
        assistantReply = data.choices[0].message.content || '（无回复）';
        if (data.choices[0].message.reasoning_content) { 
          thinkingProcess = data.choices[0].message.reasoning_content;
        }
      }
    }
  } catch (error) {
    console.error(`[发送错误] 对话ID ${conversationIdAtRequestTime}:`, error);
    assistantReply = `错误：${error.message}`;
    thinkingProcess = null;
  } finally {
    if (loadingDiv && document.getElementById('messages').contains(loadingDiv)) {
        loadingDiv.remove();
    }

    const assistantRoleToDisplay = (providerToUse === 'gemini') ? 'model' : 'assistant';

    if (currentConversationId === conversationIdAtRequestTime) {
      appendMessage(assistantRoleToDisplay, assistantReply, modelValueFromOption, thinkingProcess);
    } else {
      console.log(`[发送完成] 用户已切换对话。回复将保存到对话 ${conversationIdAtRequestTime}，但不会显示。`);
      const originalConvLi = document.querySelector(`.conversation-item[data-id="${conversationIdAtRequestTime}"]`);
      if (originalConvLi && !assistantReply.startsWith('错误：')) {
         // originalConvLi.classList.add('has-unread-response'); 
      }
    }

    const targetConversationForStorage = conversations.find(c => c.id === conversationIdAtRequestTime);
    if (targetConversationForStorage) {
        const assistantRoleForStorage = 'assistant';
        if (assistantReply !== '（无回复）' || thinkingProcess) { 
            targetConversationForStorage.messages.push({
                role: assistantRoleForStorage,
                content: assistantReply,
                model: modelValueFromOption,
                reasoning_content: thinkingProcess
            });
            saveConversations();
            if (currentConversationId !== conversationIdAtRequestTime && !assistantReply.startsWith('错误：')) {
                renderConversationList();
            }
        }
    } else {
        console.error(`[保存错误] 无法找到原始对话 ${conversationIdAtRequestTime} 来保存回复。`);
    }
  }
}
window.send = send;

// --- 设置与 UI 操作 ---

function showSettings() {
  document.getElementById('settings-area').style.display = 'flex';
  document.getElementById('chat-area').style.display = 'none';
  const providerSelect = document.getElementById('api-provider');
  providerSelect.dispatchEvent(new Event('change'));
}
window.showSettings = showSettings;

function showChatArea() {
    document.getElementById('settings-area').style.display = 'none';
    document.getElementById('chat-area').style.display = 'flex';
    if (!currentConversationId && conversations.length > 0) {
        loadConversation(conversations.filter(c=>!c.archived)[0]?.id || conversations[0].id);
    } else if (!currentConversationId) {
        createNewConversation();
    }
}


function clearAllHistory() {
  if (confirm('确认清除所有历史吗？此操作无法恢复。')) {
    conversations = [];
    currentConversationId = null;
    activeModel = '';
    saveConversations();
    document.getElementById('messages').innerHTML = '';
    document.getElementById('chat-title').textContent = '对话';
    renderConversationList();
    createNewConversation();
  }
}
window.clearAllHistory = clearAllHistory;

function exportAllHistory() {
  const data = JSON.stringify(conversations, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `chat_history_${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
window.exportAllHistory = exportAllHistory;


function applyTheme(theme) {
  if (theme === 'dark') {
    document.body.classList.add('dark-theme');
    document.body.classList.remove('light-theme');
  } else {
    document.body.classList.add('light-theme');
    document.body.classList.remove('dark-theme');
  }
  localStorage.setItem('theme', theme);
}

function toggleTheme() {
  const newTheme = document.body.classList.contains('dark-theme') ? 'light' : 'dark';
  applyTheme(newTheme);
}

function applyUiScale(scale, optionsContainer) {
    document.documentElement.style.setProperty('--ui-scale', scale);
    localStorage.setItem('ui-scale', String(scale));
    if (optionsContainer) {
        optionsContainer.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        const activeButton = optionsContainer.querySelector(`button[data-scale="${scale}"]`);
        if (activeButton) activeButton.classList.add('active');
    }
}

function enableInlineTitleEdit() {
  const chatHeader = document.querySelector('.chat-header');
  const titleElement = document.getElementById('chat-title');
  if (!chatHeader || !titleElement) return;

  titleElement.removeEventListener('click', handleTitleClick);
  titleElement.style.cursor = 'pointer';
  titleElement.addEventListener('click', handleTitleClick);
}

function handleTitleClick() {
    const chatHeader = this.parentElement;
    const oldH1 = this;
    const oldName = oldH1.textContent;

    const input = document.createElement('input');
    input.id = 'chat-title-input';
    input.type = 'text';
    input.value = oldName;

    chatHeader.replaceChild(input, oldH1);
    input.focus();
    input.setSelectionRange(oldName.length, oldName.length);

    function commitEdit() {
      const newName = input.value.trim() || oldName;
      const conv = getCurrentConversation();
      if (conv && conv.title !== newName) {
        conv.title = newName;
        saveConversations();
        renderConversationList();
      }
      
      const newH1 = document.createElement('h1');
      newH1.id = 'chat-title';
      newH1.textContent = newName;
      chatHeader.replaceChild(newH1, input);
      enableInlineTitleEdit();
    }

    input.addEventListener('blur', commitEdit);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitEdit();
      } else if (e.key === 'Escape') {
        const restoredH1 = document.createElement('h1');
        restoredH1.id = 'chat-title';
        restoredH1.textContent = oldName;
        chatHeader.replaceChild(restoredH1, input);
        enableInlineTitleEdit();
      }
    });
}


// --- DOMContentLoaded: 主要设置 ---
document.addEventListener('DOMContentLoaded', () => {
  const storedTheme = localStorage.getItem('theme') || 'dark';
  applyTheme(storedTheme);
  document.getElementById('toggle-theme-btn')?.addEventListener('click', toggleTheme);

  const uiScaleOptions = document.getElementById('ui-scale-options');
  if (uiScaleOptions) {
    const savedScale = parseFloat(localStorage.getItem('ui-scale')) || 1.0;
    applyUiScale(savedScale, uiScaleOptions);
    uiScaleOptions.addEventListener('click', e => {
      const btn = e.target.closest('button[data-scale]');
      if (btn) {
        applyUiScale(parseFloat(btn.dataset.scale), uiScaleOptions);
      }
    });
  }

  const providerSelect = document.getElementById('api-provider');
  const apiKeyInput = document.getElementById('api-key-input');
  const saveApiKeyBtn = document.getElementById('save-api-btn');

  if (providerSelect && apiKeyInput && saveApiKeyBtn) {
    const loadAndDisplayApiKey = () => {
      const selectedProvider = providerSelect.value;
      const sk = storageKeyFor(selectedProvider);
      const storedKey = localStorage.getItem(sk) || '';
      console.log(`[API Key Load] Provider: ${selectedProvider}, StorageKey: ${sk}, Key from localStorage: '${storedKey}'`);
      apiKeyInput.value = storedKey;
      apiKeyInput.placeholder = `输入 ${providerSelect.options[providerSelect.selectedIndex].text} API Key`;
    };

    providerSelect.addEventListener('change', loadAndDisplayApiKey);

    saveApiKeyBtn.addEventListener('click', () => {
      const selectedProvider = providerSelect.value;
      const sk = storageKeyFor(selectedProvider);
      const keyValue = apiKeyInput.value.trim();

      if (!keyValue) {
        alert('请输入有效的 API Key。');
        return;
      }
      localStorage.setItem(sk, keyValue);
      console.log(`[API Key Save] Provider: ${selectedProvider}, StorageKey: ${sk}, Saved Key: '${keyValue}'`);
      alert(`${providerSelect.options[providerSelect.selectedIndex].text} API Key 已保存！`);
    });

    console.log("[API Key Load] Dispatching initial load for api-provider");
    loadAndDisplayApiKey();

  } else {
    console.error("API Key management elements not found in the DOM.");
  }

  loadConversations();
  renderConversationList();
  
  if (conversations.filter(c=>!c.archived).length > 0) {
    loadConversation(conversations.filter(c=>!c.archived)[0].id);
  } else if (conversations.length > 0) {
    loadConversation(conversations[0].id);
  }
  else {
    createNewConversation();
  }
  enableInlineTitleEdit();


  document.getElementById('send-btn')?.addEventListener('click', e => {
    e.preventDefault();
    send();
  });

  const promptInput = document.getElementById('prompt');
  if (promptInput) {
    promptInput.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    });
  }

  document.getElementById('new-conv-btn')?.addEventListener('click', createNewConversation);

  document.getElementById('archive-current-btn')?.addEventListener('click', () => {
    if (currentConversationId) toggleArchive(currentConversationId);
  });

  document.getElementById('delete-current-btn')?.addEventListener('click', () => {
    if (!currentConversationId) return;
    const conv = getCurrentConversation();
    if (conv && confirm(`确定要删除当前会话「${conv.title}」吗？此操作无法恢复。`)) {
      deleteConversation(currentConversationId);
    }
  });

  document.getElementById('model')?.addEventListener('change', (e) => {
    const conv = getCurrentConversation();
    if (conv) {
      conv.model = e.target.value;
      activeModel = conv.model;
      saveConversations();
    }
  });

  document.getElementById('show-settings-btn')?.addEventListener('click', showSettings);
  document.getElementById('back-to-chat-btn')?.addEventListener('click', showChatArea);

  document.getElementById('export-history-btn')?.addEventListener('click', exportAllHistory);
  document.getElementById('clear-all-history-btn')?.addEventListener('click', clearAllHistory);
  
  const importFileInput = document.getElementById('import-file');
  if (importFileInput) {
    importFileInput.addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const importedConvs = JSON.parse(text);
        if (!Array.isArray(importedConvs)) throw new Error('导入的 JSON 顶层必须是数组');
        
        let importedCount = 0;
        importedConvs.forEach(importedConv => {
          if (importedConv && typeof importedConv === 'object' && 'id' in importedConv && 'title' in importedConv && 'messages' in importedConv) {
            if (!conversations.find(c => c.id === importedConv.id)) {
              importedConv.messages = (Array.isArray(importedConv.messages) ? importedConv.messages : [])
                .filter(m => m && m.role && typeof m.content === 'string');
              importedConv.archived = typeof importedConv.archived === 'boolean' ? importedConv.archived : false;
              importedConv.isNew = false;
              
              conversations.push(importedConv);
              importedCount++;
            }
          } else {
            console.warn('导入过程中跳过无效的对话对象:', importedConv);
          }
        });

        if (importedCount > 0) {
          saveConversations();
          renderConversationList();
          if (importedCount > 0 && currentConversationId == null && conversations.length > 0) {
             loadConversation(conversations.filter(c=>!c.archived)[0]?.id || conversations[0].id);
          }
          alert(`成功导入 ${importedCount} 条新对话。`);
        } else {
          alert('没有导入新的对话（可能ID已存在或格式无效）。');
        }
      } catch (err) {
        console.error('导入失败:', err);
        alert('导入失败：' + err.message);
      } finally {
        importFileInput.value = '';
      }
    });

    const promptTextarea = document.getElementById('prompt');
  if (promptTextarea) {
    const initialMinHeight = 60; // 和 CSS 中的 min-height 匹配或设一个初始值
    const maxHeight = 200;      // 和 CSS 中的 max-height 匹配

    // 设置一个初始高度，可以是 min-height 的值
    promptTextarea.style.height = `${initialMinHeight}px`;

    const autoResizeTextarea = () => {
      // 1. 先将高度重置为最小值或 'auto'，以便获取准确的 scrollHeight
      //    如果 textarea 内容为空，scrollHeight 可能是基于 padding 的一个很小的值。
      //    如果直接设为 'auto'，并且内容为空，它可能会收缩到几乎看不见。
      //    所以，先设为 minHeight，如果内容多，scrollHeight 会大于它。
      promptTextarea.style.height = `${initialMinHeight}px`; 

      let scrollHeight = promptTextarea.scrollHeight;
      let newHeight = scrollHeight;

      if (newHeight < initialMinHeight) {
        newHeight = initialMinHeight; // 确保高度不小于初始最小高度
      }

      if (newHeight > maxHeight) {
        newHeight = maxHeight;
        promptTextarea.style.overflowY = 'auto'; // 内容超出最大高度，显示滚动条
      } else {
        promptTextarea.style.overflowY = 'hidden';// 内容未超出，隐藏滚动条
      }
      promptTextarea.style.height = `${newHeight}px`;
    };

    promptTextarea.addEventListener('input', autoResizeTextarea);

    // (可选) 在粘贴时也触发调整
    promptTextarea.addEventListener('paste', () => {
        paste 
        setTimeout(autoResizeTextarea, 0);
    });
    // --- Temperature 设置初始化和事件处理 ---
  const temperatureSlider = document.getElementById('temperature-slider');
  const temperatureValueDisplay = document.getElementById('temperature-value');
  const defaultTemperature = 0.7; // 设置一个默认的 temperature 值

  if (temperatureSlider && temperatureValueDisplay) {
    // 加载已保存的 temperature 值，或使用默认值
    let currentTemp = parseFloat(localStorage.getItem('model-temperature'));
    if (isNaN(currentTemp) || currentTemp < 0 || currentTemp > 2) { // 基本的范围检查
      currentTemp = defaultTemperature;
    }
    
    temperatureSlider.value = currentTemp;
    temperatureValueDisplay.textContent = currentTemp.toFixed(1); // 保留一位小数显示

    // 当滑块值变化时，更新显示并保存到 localStorage
    temperatureSlider.addEventListener('input', () => {
      const newTemp = parseFloat(temperatureSlider.value);
      temperatureValueDisplay.textContent = newTemp.toFixed(1);
      localStorage.setItem('model-temperature', newTemp.toString());
      console.log(`[Temperature] 设置已更新为: ${newTemp}`);
    });
  } else {
    console.error("Temperature 控制元素未找到！");
  }
  // --- 结束 Temperature 设置 ---

    
    
    autoResizeTextarea();
  }
    
  }
});
// --- END OF FILE script.js ---