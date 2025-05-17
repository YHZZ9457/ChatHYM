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
  const emptyChatPlaceholder = document.getElementById('empty-chat-placeholder');
  if (emptyChatPlaceholder && emptyChatPlaceholder.style.display !== 'none') {
    emptyChatPlaceholder.style.display = 'none'; 
    console.log("[AppendMessage] 添加消息，隐藏占位符。");
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
    // saveConversations(); // 可选：立即保存，如果需要的话
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

  // 1. 清空所有旧消息 (这会移除所有动态添加的 .message-wrapper)
  //    但不会移除在 HTML 中预先定义的 emptyChatPlaceholder (如果它是 messagesContainer 的直接子元素)
  //    或者，如果 emptyChatPlaceholder 不是 messagesContainer 的直接子元素，
  //    或者你希望更彻底的清空，可以先移除所有非 placeholder 的子元素。
  
  // 先移除所有非 placeholder 的消息元素
  Array.from(messagesContainer.children).forEach(child => {
    if (child !== emptyChatPlaceholder) {
      messagesContainer.removeChild(child);
    }
  });
  // 如果 placeholder 不在 messagesContainer 中，或者你想确保它总是在正确的位置：
  if (emptyChatPlaceholder && emptyChatPlaceholder.parentNode !== messagesContainer) {
      messagesContainer.innerHTML = ''; // 清空一切，然后重新添加 placeholder
      messagesContainer.appendChild(emptyChatPlaceholder);
  } else if (!emptyChatPlaceholder) {
      console.error("ID为 'empty-chat-placeholder' 的元素未在HTML中找到！");
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
      console.log("[LoadConv] 对话为空，显示占位符。");
    }
  } else {
    if (emptyChatPlaceholder) {
      emptyChatPlaceholder.style.display = 'none'; // 隐藏提示
      console.log("[LoadConv] 对话有消息，隐藏占位符。");
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
  const conversationAtRequestTime = getCurrentConversation();
  if (!conversationAtRequestTime) {
    alert("请先选择或创建一个对话。");
    return;
  }
  const conversationIdAtRequestTime = conversationAtRequestTime.id;
  const modelValueFromOption = conversationAtRequestTime.model; // 例如 "anthropic::claude-3-opus-20240229"

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
        console.error(`[发送] 未知的模型前缀: "${prefix}" 在模型值 "${modelValueFromOption}" 中。无法确定代理函数。`);
        alert(`模型 "${modelValueFromOption}" 配置错误：无法识别的提供商前缀 "${prefix}"。请检查 HTML 中的 <option> value 是否正确使用了 'provider::model_id' 格式。`);
        return; 
    }
  } else {
    console.error(`[发送] 模型值 "${modelValueFromOption}" 格式不正确，缺少提供商前缀 (例如 'openai::gpt-4o')。`);
    alert(`模型 "${modelValueFromOption}" 配置错误：缺少提供商前缀。请检查 HTML 中的 <option> value。`);
    return; 
  }
  console.log(`[发送] 原始选择: "${modelValueFromOption}", 推断的提供商: ${actualProvider}, API模型ID: ${modelNameForAPI}`);

  const providerToUse = actualProvider;

  const promptInput = document.getElementById('prompt');
  const promptText = promptInput.value.replace(/\n$/, '');
  if (!promptText.trim()) return;

  // 用户消息的UI更新和数据保存
  if (currentConversationId === conversationIdAtRequestTime) {
      appendMessage('user', promptText, null, null); // 用户消息不显示模型注释或思考过程
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

  let apiUrl = `/.netlify/functions/${providerToUse}-proxy`; // 统一的代理 URL 格式
  const headers = { 'Content-Type': 'application/json' }; // 发送给所有代理的统一 Header
  let bodyPayload;
  let finalAssistantReply = '（无回复）'; // 用于最终显示和保存的回复或错误
  let finalThinkingProcess = null;   // 用于最终显示和保存的思考过程
  let requestWasSuccessful = false;   // 标记API调用或流式处理是否最终成功
  let responseContentType = null;     // 存储实际的响应 Content-Type (主要用于区分流和非流)
  let isStreamingResponse = false;    // 标记响应是否是预期的流式类型

  // --- 消息映射函数 ---
  const mapMessagesForStandardOrClaude = (messagesHistory, currentProviderInternal) => {
    const cleanedMessages = messagesHistory
      .map(m => {
        let role = m.role;
        let content = String(m.content || '').trim();
        if (role === 'bot' || (role === 'model' && currentProviderInternal !== 'gemini')) {
          role = 'assistant';
        } else if (role !== 'user' && role !== 'assistant' && role !== 'system') {
          console.warn(`[消息映射-${currentProviderInternal}] 无效角色: '${m.role}' -> 'user'`);
          role = 'user';
        }
        return { role, content };
      })
      .filter(m => m.content !== '');

    if (cleanedMessages.length === 0) return [];

    const processedMessages = [];
    let lastRoleAppended = null;
    cleanedMessages.forEach(msg => {
      if (msg.role === 'system') {
        if (currentProviderInternal !== 'anthropic') processedMessages.push(msg);
        lastRoleAppended = msg.role; // system 不参与 user/assistant 交替的严格检查
        return;
      }
      if (msg.role === lastRoleAppended && (msg.role === 'user' || msg.role === 'assistant') && processedMessages.length > 0) {
        processedMessages[processedMessages.length - 1].content += "\n" + msg.content;
      } else if ( (msg.role === 'assistant' && lastRoleAppended !== 'user' && processedMessages.length > 0 && processedMessages[processedMessages.length-1].role !== 'system') || // assistant 前必须是 user 或 system
                  (msg.role === 'user' && lastRoleAppended === 'user' && processedMessages.length > 0) // 不允许连续 user (除非是合并)
      ) {
        console.warn(`[消息映射-${currentProviderInternal}] 跳过不符合交替规则的消息: ${msg.role} after ${lastRoleAppended}`);
      }
      else {
        processedMessages.push(msg);
        if (msg.role === 'user' || msg.role === 'assistant') lastRoleAppended = msg.role;
      }
    });

    if (currentProviderInternal === 'anthropic') {
      if (processedMessages.length > 0 && processedMessages[0].role !== 'user') {
        while(processedMessages.length > 0 && processedMessages[0].role !== 'user') processedMessages.shift();
        if (processedMessages.length > 0 && processedMessages[0].role !== 'user') return [];
      }
    }
    // 确保消息列表不为空（至少包含用户的当前输入，如果它有效）
    if (processedMessages.length === 0 && messagesHistory.length > 0) {
      const latestUserMessageFromHistory = messagesHistory.filter(m => m.role === 'user').pop();
      if (latestUserMessageFromHistory && String(latestUserMessageFromHistory.content || '').trim()) {
          return [{ role: 'user', content: String(latestUserMessageFromHistory.content).trim() }];
      }
    }
    return processedMessages;
  };

  const mapMessagesForGemini = (messages) => {
    return messages
      .filter(m => typeof m.content === 'string' && m.content.trim() !== '')
      .map(m => {
        let roleForGemini;
        if (m.role === 'user') roleForGemini = 'user';
        else if (m.role === 'assistant' || m.role === 'bot' || m.role === 'model') roleForGemini = 'model';
        else { console.warn(`[Gemini映射] 无效角色: '${m.role}' -> 'user'`); roleForGemini = 'user';}
        return { role: roleForGemini, parts: [{ text: m.content }] };
      });
  };
  // --- 结束消息映射函数 ---
  
  try {
    let currentTemperature = parseFloat(localStorage.getItem('model-temperature'));
    if (isNaN(currentTemperature) || currentTemperature < 0 || currentTemperature > 2) {
        currentTemperature = 0.7;
    }

    const shouldUseStreaming = ['openai', 'anthropic', 'deepseek', 'siliconflow'].includes(providerToUse);

       bodyPayload = {
      model: modelNameForAPI,
      temperature: currentTemperature,
      // stream 参数：如果不是Gemini且shouldUseStreaming为true，则设为true，否则为false
      stream: (providerToUse !== 'gemini' && shouldUseStreaming), 
    };

     if (providerToUse === 'gemini') {
      let geminiTemperature = currentTemperature;
      // ... (Gemini temperature 范围限制) ...
      
      bodyPayload.contents = mapMessagesForGemini(conversationAtRequestTime.messages);
      bodyPayload.generationConfig = { temperature: geminiTemperature };
      // 明确删除或不设置 stream 字段给 Gemini 代理，或者代理内部会忽略它
      delete bodyPayload.stream; // 或者在初始化 bodyPayload 时就基于 provider 条件设置
      console.log("[发送] Gemini 请求将作为非流式处理。");
    } else {
      bodyPayload.messages = mapMessagesForStandardOrClaude(conversationAtRequestTime.messages, providerToUse);
      if (providerToUse === 'anthropic') { bodyPayload.max_tokens = 1024; }
    }

    // 再次检查，如果最终要发送的 messages 或 contents (对于Gemini) 为空，则不发送
    if ((providerToUse === 'gemini' && (!bodyPayload.contents || bodyPayload.contents.length === 0)) ||
        (providerToUse !== 'gemini' && (!bodyPayload.messages || bodyPayload.messages.length === 0))) {
        if (loadingDiv) loadingDiv.remove();
        alert("没有有效的历史消息或当前输入来构建请求。");
        return; // 提前退出
    }

    const body = JSON.stringify(bodyPayload);
    console.log(`[发送] 请求体发往代理 ${apiUrl}:`, body);

    const response = await fetch(apiUrl, { method: 'POST', headers, body });
    responseContentType = response.headers.get('content-type'); 
    isStreamingResponse = shouldUseStreaming && response.body && responseContentType?.includes('text/event-stream');

    if (!response.ok) {
      const errorText = await response.text();
      let detail = errorText; 
      try {
        const errJson = JSON.parse(errorText);
        detail = errJson.error?.message || errJson.error || JSON.stringify(errJson);
      } catch (e) { /* */ }
      let rawError = `接口返回 ${response.status}：${detail}`;
      if (response.status >= 400 && apiUrl.includes('/.netlify/functions/')) { 
          rawError = `代理函数 (${decodeURIComponent(apiUrl.split('/').pop())}) 调用失败 (${response.status})：${detail}。`;
      }
      throw new Error(rawError);
    }

    // --- 响应处理 ---
     let isActuallyStreaming = shouldUseStreaming && providerToUse !== 'gemini' && response.body && responseContentType?.includes('text/event-stream');

    if (isActuallyStreaming) {
      console.log(`[接收流] 开始处理来自 ${providerToUse} 的流式响应...`);

      let accumulatedAssistantReply = "";
      let accumulatedThinkingProcess = "";
      const assistantRoleForDisplay = (providerToUse === 'gemini') ? 'model' : 'assistant';
      
      let tempMsgElementWrapper = null;
      let messageDiv = null;
      let assistantTextElement = null;
      let reasoningBlockDiv = null;
      let reasoningContentElement = null;

      if (currentConversationId === conversationIdAtRequestTime) {
        tempMsgElementWrapper = appendMessage(assistantRoleForDisplay, "", modelValueFromOption, null); 
        if (tempMsgElementWrapper) {
            messageDiv = tempMsgElementWrapper.querySelector('.message.assistant');
            assistantTextElement = messageDiv ? messageDiv.querySelector('.text') : null;
        }
      }

      if (currentConversationId === conversationIdAtRequestTime && (!messageDiv || !assistantTextElement)) {
          console.error("无法创建或找到用于流式输出的助手消息文本元素！");
          throw new Error("流式输出错误：无法更新UI。");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) { console.log("[接收流] 流结束。"); break; }
            buffer += decoder.decode(value, { stream: true });
            let lines = buffer.split('\n\n');
            buffer = lines.pop(); 
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const jsonData = line.substring(6);
                if (jsonData.trim() === '[DONE]') continue;
                try {
                  const chunk = JSON.parse(jsonData);
                  let chunkText = '';
                  let chunkReasoning = '';

                  if (providerToUse === 'openai' || providerToUse === 'siliconflow') {
                    chunkText = chunk.choices?.[0]?.delta?.content || '';
                  } else if (providerToUse === 'deepseek') {
                    if (chunk.choices?.[0]?.delta?.reasoning_content) chunkReasoning = chunk.choices[0].delta.reasoning_content;
                    if (chunk.choices?.[0]?.delta?.content) chunkText = chunk.choices[0].delta.content;
                  } else if (providerToUse === 'anthropic') {
                    if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') chunkText = chunk.delta.text || '';
                    else if (chunk.type === 'message_delta' && chunk.delta?.stop_reason) console.log("[接收流][Claude] Stop Reason:", chunk.delta.stop_reason);
                  } else if (providerToUse === 'gemini') {
                    // 假设 gemini-proxy.mjs 将 Gemini 的流转换为 SSE data: {"text": "..."} 或类似
                    // 或者直接是 Gemini 的流式块 { candidates: [{ content: { parts: [{text: "..."}]}}]}
                    chunkText = chunk.candidates?.[0]?.content?.parts?.[0]?.text || chunk.text || chunk.delta?.content || ''; 
                  }

                  if (currentConversationId === conversationIdAtRequestTime) { // 只在当前对话更新UI
                    if (chunkReasoning && messageDiv) {
                      accumulatedThinkingProcess += chunkReasoning;
                      if (!reasoningBlockDiv) {
                          reasoningBlockDiv = document.createElement('div');
                          reasoningBlockDiv.className = 'reasoning-block';
                          const label = document.createElement('div');
                          label.className = 'reasoning-label';
                          label.textContent = '思考过程:';
                          reasoningBlockDiv.appendChild(label);
                          reasoningContentElement = document.createElement('pre');
                          reasoningContentElement.className = 'reasoning-content';
                          reasoningBlockDiv.appendChild(reasoningContentElement);
                          messageDiv.insertBefore(reasoningBlockDiv, assistantTextElement || messageDiv.firstChild);
                      }
                      if (reasoningContentElement) reasoningContentElement.textContent = accumulatedThinkingProcess;
                    }
                    if (chunkText && assistantTextElement) {
                      accumulatedAssistantReply += chunkText;
                      assistantTextElement.innerHTML = marked.parse(accumulatedAssistantReply);
                    }
                    if (chunkText || chunkReasoning) document.getElementById('messages').scrollTop = document.getElementById('messages').scrollHeight;
                  } else { 
                      if (chunkReasoning) accumulatedThinkingProcess += chunkReasoning;
                      if (chunkText) accumulatedAssistantReply += chunkText;
                  }
                } catch (e) { console.warn('[接收流] 解析数据块失败:', jsonData, e); }
              }
            }
          }
          finalAssistantReply = accumulatedAssistantReply;
          finalThinkingProcess = accumulatedThinkingProcess || null;
          requestWasSuccessful = true;
      } catch (streamError) {
          console.error("[接收流] 处理流数据时发生错误:", streamError);
          finalAssistantReply = accumulatedAssistantReply + `\n[流处理中断：${streamError.message}]`;
          finalThinkingProcess = accumulatedThinkingProcess || null;
          requestWasSuccessful = false; 
          throw streamError; // 重新抛出，让外层catch处理
      }
    } else { // 非流式处理路径 (Gemini 会进入这里)
      const data = await response.json(); 
      console.log(`----------- API 响应数据 (${providerToUse} - 非流式) -----------`, data);
      
      if (providerToUse === 'gemini') {
        if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
          finalAssistantReply = data.candidates[0].content.parts[0].text;
        } else if (data.promptFeedback?.blockReason) {
          finalAssistantReply = `请求被阻止：${data.promptFeedback.blockReason}`;
          if (data.promptFeedback.safetyRatings) finalAssistantReply += ` (Safety Ratings: ${JSON.stringify(data.promptFeedback.safetyRatings)})`;
        }
        finalThinkingProcess = null; 
      } else if (providerToUse === 'anthropic' && !isActuallyStreaming) { // Anthropic 非流式 (如果代理返回了非流式)
        if (data.content?.[0]?.text) finalAssistantReply = data.content[0].text;
        // ... (Anthropic 非流式 thinkingProcess 提取) ...
      } else if (!isActuallyStreaming) { // OpenAI, Deepseek, SiliconFlow 非流式
        if (data.choices?.[0]?.message) {
            finalAssistantReply = data.choices[0].message.content || '（无回复）';
            if (data.choices[0].message.reasoning_content) finalThinkingProcess = data.choices[0].message.reasoning_content;
        }
      }
      requestWasSuccessful = true;
    }

  } catch (error) {
    console.error(`[发送错误 Catch] 对话ID ${conversationIdAtRequestTime}:`, error);
    finalAssistantReply = error.message.startsWith('错误：') ? error.message : `错误：${error.message}`;
    finalThinkingProcess = null;
    requestWasSuccessful = false;
  } finally {
    if (loadingDiv && loadingDiv.parentNode === document.getElementById('messages')) { // 更安全的移除检查
        loadingDiv.remove();
    }

    const assistantRoleToDisplay = (providerToUse === 'gemini') ? 'model' : 'assistant';

    // 如果不是成功的流式响应，或者发生了错误，则调用 appendMessage 来显示最终结果或错误
    if (!requestWasSuccessful || !isStreamingResponse) {
      if (currentConversationId === conversationIdAtRequestTime) {
        console.log(`[Finally] 调用 appendMessage (原因: ${!requestWasSuccessful ? '错误' : '非流式或流式类型不符'})`);
        // 清理之前可能创建的空流式气泡 (如果存在且是最后的孩子)
        const messagesNode = document.getElementById('messages');
        const lastMessageWrapper = messagesNode.lastElementChild;
        if (requestWasSuccessful && isStreamingResponse && lastMessageWrapper && lastMessageWrapper.querySelector('.message .text')?.innerHTML === "") {
            console.log("[Finally] 移除非流式错误路径下，之前流式append的空消息体。");
             // 这个逻辑可能需要调整，目标是避免重复的空消息或不完整的流消息
        }
        appendMessage(assistantRoleToDisplay, finalAssistantReply, modelValueFromOption, finalThinkingProcess);
      }
    } else if (requestWasSuccessful && isStreamingResponse) {
      // 成功的流式输出，主要内容已更新。这里补充模型注释。
      console.log("[Finally] 流式处理成功。补充模型注释。");
      if (currentConversationId === conversationIdAtRequestTime) {
        const messagesContainer = document.getElementById('messages');
        const allAssistantWrappers = messagesContainer.querySelectorAll('.assistant-message-wrapper');
        const existingMsgWrapper = allAssistantWrappers.length > 0 ? allAssistantWrappers[allAssistantWrappers.length - 1] : null;
        
        if (existingMsgWrapper) {
            const msgDiv = existingMsgWrapper.querySelector('.message.assistant');
            if (msgDiv && modelValueFromOption && !msgDiv.querySelector('.model-note')) {
                const note = document.createElement('div');
                note.className = 'model-note';
                let displayModelName = modelValueFromOption;
                const modelSelect = document.getElementById('model');
                if(modelSelect) {
                    const opt = modelSelect.querySelector(`option[value="${modelValueFromOption}"]`);
                    if(opt) displayModelName = opt.textContent;
                    else { // 尝试去掉前缀
                        const parts = String(modelValueFromOption).split('::');
                        if (parts.length === 2) displayModelName = parts[1];
                    }
                }
                note.textContent = `模型：${displayModelName}`;
                msgDiv.appendChild(note);
            }
        }
      }
    }
    
    if (currentConversationId !== conversationIdAtRequestTime && (finalAssistantReply !== '（无回复）' || finalThinkingProcess)) {
      console.log(`[发送完成] 用户已切换。回复/错误将保存到对话 ${conversationIdAtRequestTime}。`);
    }

    const targetConversationForStorage = conversations.find(c => c.id === conversationIdAtRequestTime);
    if (targetConversationForStorage) {
        const assistantRoleForStorage = 'assistant';
        if (finalAssistantReply !== '（无回复）' || finalThinkingProcess || finalAssistantReply.startsWith('错误：')) { 
            targetConversationForStorage.messages.push({
                role: assistantRoleForStorage,
                content: finalAssistantReply,
                model: modelValueFromOption,
                reasoning_content: finalThinkingProcess
            });
            saveConversations();
            if (currentConversationId !== conversationIdAtRequestTime && requestWasSuccessful && !finalAssistantReply.startsWith('错误：') ) {
                renderConversationList();
            }
        }
    } else {
        console.error(`[保存错误] 无法找到原始对话 ${conversationIdAtRequestTime} 来保存回复。`);
    }
  }
}
window.send = send;

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
  // 1. 主题初始化
  const storedTheme = localStorage.getItem('theme') || 'dark'; // 默认暗色主题
  applyTheme(storedTheme);
  const toggleThemeBtn = document.getElementById('toggle-theme-btn');
  if (toggleThemeBtn) {
    toggleThemeBtn.addEventListener('click', toggleTheme);
  } else {
    console.warn("切换主题按钮 'toggle-theme-btn' 未找到。");
  }

  // 2. UI 缩放初始化
  const uiScaleOptions = document.getElementById('ui-scale-options');
  if (uiScaleOptions) {
    const savedScale = parseFloat(localStorage.getItem('ui-scale')) || 1.0; // 默认缩放 1.0
    applyUiScale(savedScale, uiScaleOptions); // 应用保存的或默认的缩放
    uiScaleOptions.addEventListener('click', e => {
      const btn = e.target.closest('button[data-scale]');
      if (btn) {
        applyUiScale(parseFloat(btn.dataset.scale), uiScaleOptions);
      }
    });
  } else {
    console.warn("UI 缩放选项容器 'ui-scale-options' 未找到。");
  }

  // --- 3. API Key 管理 (已移除，因为Key由后端代理管理) ---
  // 前端不再需要管理和显示各个 Provider 的 API Key 输入。
  // 如果 HTML 中还保留了 api-provider, api-key-input, save-api-btn 等元素，
  // 它们的功能将不再由这里的 JavaScript 控制。
  // 你可以考虑从 HTML 中也移除它们，或者保留它们仅作显示（如果需要的话）。
  console.info("前端 API Key 管理逻辑已移除。API Keys 应通过后端代理和环境变量进行管理。");
  // 如果 HTML 中还有这些元素，可以确保它们不会引起错误
  const providerSelect = document.getElementById('api-provider');
  if(providerSelect){
      // 可以选择禁用它或只是不再为其绑定功能性事件
      // providerSelect.disabled = true; // 例如
  }


  // --- 4. Temperature 设置初始化和事件处理 ---
  const temperatureSlider = document.getElementById('temperature-slider');
  const temperatureValueDisplay = document.getElementById('temperature-value');
  const defaultTemperature = 0.7; 

  if (temperatureSlider && temperatureValueDisplay) {
    let currentTemp = parseFloat(localStorage.getItem('model-temperature'));
    if (isNaN(currentTemp) || currentTemp < 0 || currentTemp > 2) { 
      currentTemp = defaultTemperature;
    }
    temperatureSlider.value = currentTemp;
    temperatureValueDisplay.textContent = currentTemp.toFixed(1);

    temperatureSlider.addEventListener('input', () => {
      const newTemp = parseFloat(temperatureSlider.value);
      temperatureValueDisplay.textContent = newTemp.toFixed(1);
      localStorage.setItem('model-temperature', newTemp.toString());
      console.log(`[Temperature] 设置已更新为: ${newTemp}`);
    });
  } else {
    console.warn("Temperature 控制元素 ('temperature-slider' 或 'temperature-value') 未找到。");
  }

  // --- 5. Textarea 自动调整高度 ---
  const promptTextarea = document.getElementById('prompt');
  if (promptTextarea) {
    const initialMinHeight = parseInt(window.getComputedStyle(promptTextarea).minHeight, 10) || 42; // 从CSS获取或默认42
    const maxHeight = parseInt(window.getComputedStyle(promptTextarea).maxHeight, 10) || 200;
    
    // 设置一个初始高度，基于 min-height
    promptTextarea.style.height = `${initialMinHeight}px`;
    promptTextarea.style.overflowY = 'hidden'; // 初始隐藏滚动条

    const autoResizeTextarea = () => {
      promptTextarea.style.height = `${initialMinHeight}px`; // 先收缩以获取准确的 scrollHeight
      let scrollHeight = promptTextarea.scrollHeight;
      let newHeight = scrollHeight;

      if (newHeight < initialMinHeight) {
        newHeight = initialMinHeight;
      }

      if (newHeight > maxHeight) {
        newHeight = maxHeight;
        promptTextarea.style.overflowY = 'auto';
      } else {
        promptTextarea.style.overflowY = 'hidden';
      }
      promptTextarea.style.height = `${newHeight}px`;
    };

    promptTextarea.addEventListener('input', autoResizeTextarea);
    promptTextarea.addEventListener('paste', () => { 
        // 使用 setTimeout 确保粘贴操作完成后再调整大小
        setTimeout(autoResizeTextarea, 0); 
    });
    // autoResizeTextarea(); // 页面加载时调用一次，如果 textarea 可能有默认值
  } else {
    console.warn("输入框 'prompt' 未找到。");
  }

  // --- 6. 对话和聊天区域初始化 ---
  loadConversations();    // 加载历史对话
  renderConversationList(); // 渲染对话列表 (renderConversationList 内部应调用 enableConversationDrag)
  
  // 加载第一个对话或创建新对话
  if (conversations.filter(c => !c.archived).length > 0) {
    loadConversation(conversations.filter(c => !c.archived)[0].id);
  } else if (conversations.length > 0) { // 只有归档的对话
    loadConversation(conversations[0].id);
  } else { // 没有任何对话
    createNewConversation();
  }
  enableInlineTitleEdit(); // 为初始加载的对话标题启用编辑

  // --- 7. 主要按钮和控件的事件监听器 ---
  const sendBtn = document.getElementById('send-btn');
  if (sendBtn) {
    sendBtn.addEventListener('click', e => {
      e.preventDefault();
      send();
    });
  } else {
    console.warn("发送按钮 'send-btn' 未找到。");
  }

  // promptInput 的 keydown 监听器在上面 textarea 初始化时已处理 (如果 promptTextarea 存在)
  // 如果上面没有找到 promptTextarea，这里再尝试绑定一次 (虽然通常应该在同一个地方)
  if (promptTextarea && !promptTextarea.dataset.keydownBound) { // 防止重复绑定
    promptTextarea.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    });
    promptTextarea.dataset.keydownBound = 'true';
  }


  const newConvBtn = document.getElementById('new-conv-btn');
  if (newConvBtn) {
    newConvBtn.addEventListener('click', createNewConversation);
  } else {
    console.warn("新建对话按钮 'new-conv-btn' 未找到。");
  }

  const archiveCurrentBtn = document.getElementById('archive-current-btn');
  if (archiveCurrentBtn) {
    archiveCurrentBtn.addEventListener('click', () => {
      if (currentConversationId) toggleArchive(currentConversationId);
    });
  } else {
    console.warn("归档当前对话按钮 'archive-current-btn' 未找到。");
  }

  const deleteCurrentBtn = document.getElementById('delete-current-btn');
  if (deleteCurrentBtn) {
    deleteCurrentBtn.addEventListener('click', () => {
      if (!currentConversationId) return;
      const conv = getCurrentConversation();
      if (conv && confirm(`确定要删除当前会话「${conv.title}」吗？此操作无法恢复。`)) {
        deleteConversation(currentConversationId);
      }
    });
  } else {
    console.warn("删除当前对话按钮 'delete-current-btn' 未找到。");
  }

  const modelSelect = document.getElementById('model');
  if (modelSelect) {
    modelSelect.addEventListener('change', (e) => {
      const conv = getCurrentConversation();
      if (conv) {
        conv.model = e.target.value;
        // activeModel = conv.model; // activeModel 似乎没有在其他地方被大量使用，可以考虑是否必要
        saveConversations();
      }
    });
  } else {
    console.warn("模型选择下拉框 'model' 未找到。");
  }

  const showSettingsBtn = document.getElementById('show-settings-btn');
  if (showSettingsBtn) {
    showSettingsBtn.addEventListener('click', showSettings);
  } else {
    console.warn("显示设置按钮 'show-settings-btn' 未找到。");
  }
  
  const backToChatBtn = document.getElementById('back-to-chat-btn');
  if (backToChatBtn) {
    backToChatBtn.addEventListener('click', showChatArea);
  } else {
    console.warn("返回聊天按钮 'back-to-chat-btn' 未找到。");
  }

  const exportHistoryBtn = document.getElementById('export-history-btn');
  if (exportHistoryBtn) {
    exportHistoryBtn.addEventListener('click', exportAllHistory);
  } else {
    console.warn("导出历史按钮 'export-history-btn' 未找到。");
  }

  const clearAllHistoryBtn = document.getElementById('clear-all-history-btn');
  if (clearAllHistoryBtn) {
    clearAllHistoryBtn.addEventListener('click', clearAllHistory);
  } else {
    console.warn("清除所有历史按钮 'clear-all-history-btn' 未找到。");
  }
  
  // --- 文件导入 (保持不变) ---
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
          // ... (你的导入和去重逻辑) ...
          if (importedConv && typeof importedConv === 'object' && 'id' in importedConv && 'title' in importedConv && 'messages' in importedConv) {
            if (!conversations.find(c => c.id === importedConv.id)) {
              importedConv.messages = (Array.isArray(importedConv.messages) ? importedConv.messages : [])
                .filter(m => m && m.role && typeof m.content === 'string');
              importedConv.archived = typeof importedConv.archived === 'boolean' ? importedConv.archived : false;
              importedConv.isNew = false; // 导入的对话不标记为新
              // 确保导入的对话也有 reasoning_content 字段（如果适用），或者设为 null
              importedConv.reasoning_content = importedConv.reasoning_content || null; 
              
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
          if (currentConversationId == null && conversations.length > 0) { // 修正：双等号改为三等号
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
  } else {
    console.warn("文件导入输入框 'import-file' 未找到。");
  }
}); // DOMContentLoaded 结束

// --- END OF FILE script.js ---