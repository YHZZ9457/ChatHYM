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

  let reasoningContentElementForMathJax = null; // 用于 MathJax 引用

  // --- 1. 处理并添加思考过程 (如果存在) ---
  if (reasoningText && (role === 'assistant' || role === 'model')) {
    const reasoningBlockDiv = document.createElement('div');
    reasoningBlockDiv.className = 'reasoning-block';

    const label = document.createElement('div');
    label.className = 'reasoning-label';
    label.textContent = '思考过程:';
    reasoningBlockDiv.appendChild(label);

    reasoningContentElementForMathJax = document.createElement('pre'); // 使用新变量名以区分
    reasoningContentElementForMathJax.className = 'reasoning-content';
    reasoningContentElementForMathJax.textContent = reasoningText;
    reasoningBlockDiv.appendChild(reasoningContentElementForMathJax);

    messageDiv.appendChild(reasoningBlockDiv);
  }

  // --- 2. 处理并添加主要回复内容 ---
  const safeText = typeof text === 'string' ? text : String(text || '');
  let contentHtml = '';
  // 即使主要内容为空，但如果是助手消息且有思考过程，也应该创建空的 contentDiv 以保持结构
  if (safeText.trim() !== '' || ( (role === 'assistant' || role === 'model') && reasoningText ) ) {
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
  // 只有当 contentDiv 确实有内容，或者它是助手消息（为了模型注释和思考过程的容器）时才添加
  if (contentDiv.innerHTML.trim() !== '' || (role === 'assistant' || role === 'model')) {
      messageDiv.appendChild(contentDiv);
  }


  // --- 3. 添加模型注释 (如果需要) ---
  if ((role === 'assistant' || role === 'model') && modelForNote) {
    const note = document.createElement('div');
    note.className = 'model-note';
    note.textContent = `模型：${modelForNote}`;
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
  } else { // assistant or model
    messageWrapperDiv.appendChild(messageDiv);
    messageWrapperDiv.appendChild(deleteMsgBtn);
  }
  
  // --- 6. 将整个消息包裹层添加到消息容器中 ---
  container.appendChild(messageWrapperDiv);
  container.scrollTop = container.scrollHeight;

  // --- 7. MathJax 渲染逻辑 ---
  if (window.MathJax && MathJax.typesetPromise) {
    const elementsToTypeset = [];
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

  return messageWrapperDiv;
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
        // 尝试加载第一个未归档的，如果全归档了则加载第一个归档的
        loadConversation(conversations.filter(c=>!c.archived)[0]?.id || conversations[0].id);
    } else {
        createNewConversation(); // 如果列表为空，则创建一个新对话
    }
    return;
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
  messagesContainer.innerHTML = '';
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
  renderConversationList();
  enableInlineTitleEdit();

  let messageIndex = 0;
  conv.messages
    .filter(m => {
      // 同时确保消息有主要内容或者有思考过程才显示
      // (或者如果角色是助手，即使都为空也显示一个空壳？目前逻辑是至少有其一)
      const hasContent = typeof m.content === 'string' && m.content.trim() !== '';
      const hasReasoning = typeof m.reasoning_content === 'string' && m.reasoning_content.trim() !== '';
      return hasContent || hasReasoning || (m.role === 'user'); // 用户消息即使为空也显示(虽然不太可能)
    })
    .forEach(m => {
      const messageElement = appendMessage(
        m.role,
        m.content, // content 可能为空字符串，appendMessage 内部会处理
        m.model || conv.model,
        m.reasoning_content || null // 传递保存的思考过程
      );
      // 确保 messageElement 真的被创建了 (appendMessage 应该总是返回它)
      if (messageElement) {
          messageElement.dataset.conversationId = conv.id;
          messageElement.dataset.messageIndex = messageIndex;
          messageIndex++;
      }
    });
  

  
}

function deleteSingleMessage(messageElement, conversationId, messageIndex) {
  const conv = conversations.find(c => c.id === conversationId);
  if (!conv || messageIndex < 0 || messageIndex >= conv.messages.length) {
    console.error('无法删除消息：无效的对话或消息索引。');
    if (confirm('数据可能不一致。确实要从界面移除此条消息吗？')) {
      messageElement.remove();
    }
    return;
  }

  const messageToConfirm = conv.messages[messageIndex];
  let confirmTextPreview = messageToConfirm.content.substring(0, 50);
  if (messageToConfirm.content.length > 50) {
    confirmTextPreview += "...";
  }

  if (confirm(`确实要删除这条消息吗？\n\n"${confirmTextPreview}"`)) {
    conv.messages.splice(messageIndex, 1);
    saveConversations();
    messageElement.remove();

    // 更新后续消息的 messageIndex data-* 属性
    const messagesContainer = document.getElementById('messages');
    const remainingMessageElements = messagesContainer.querySelectorAll('.message-wrapper');
    remainingMessageElements.forEach((el, newIndex) => {
      el.dataset.messageIndex = newIndex;
    });

    console.log(`消息已删除 (对话ID: ${conversationId}, 原索引: ${messageIndex})`);
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
  const conv = getCurrentConversation();
  if (!conv) {
    alert("请先选择或创建一个对话。");
    return;
  }

  let actualProvider;
  const currentSelectedModel = conv.model;

  // 根据当前选择的模型推断 API 提供商
  if (currentSelectedModel.toLowerCase().includes('deepseek')) {
    actualProvider = 'deepseek';
  } else if (currentSelectedModel.toLowerCase().includes('gemini')) {
    actualProvider = 'gemini';
  } else if (currentSelectedModel.toLowerCase().startsWith('qwen/')) {
    actualProvider = 'siliconflow';
  } else if (
    currentSelectedModel.toLowerCase().includes('gpt') ||
    currentSelectedModel.toLowerCase().includes('o3') ||
    currentSelectedModel.toLowerCase().includes('o4-mini')
  ) {
    actualProvider = 'openai';
  } else {
    const providerSel = document.getElementById('api-provider');
    actualProvider = providerSel.value;
    console.warn(`无法从模型 "${currentSelectedModel}" 自动推断提供商，将使用设置页面的选择: ${actualProvider}`);
  }
  console.log(`[发送] 模型: ${currentSelectedModel}, 推断的提供商: ${actualProvider}`);

  const providerToUse = actualProvider;
  const apiKeyStorageKey = storageKeyFor(providerToUse);
  const apiKey = localStorage.getItem(apiKeyStorageKey) || '';

  if (!apiKey) {
    // ... (API Key 检查和提示，保持不变) ...
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

  // 1. 显示并保存用户消息 (只执行一次)
  appendMessage('user', promptText, null, null);
  const userRoleForStorage = 'user';
  conv.messages.push({ role: userRoleForStorage, content: promptText, model: conv.model });
  promptInput.value = '';
  saveConversations(); // 保存包含用户消息的对话

  const loadingDiv = appendLoading();

  let apiUrl;
  let headers = { 'Content-Type': 'application/json' };
  let bodyPayload;
  let assistantReply = '（无回复）'; // 初始化，如果API调用失败或无内容，会用这个
  let thinkingProcess = null;

  const mapMessagesForStandardProviders = (messages) => {
    // ... (这个辅助函数保持不变) ...
    return messages
      .filter(m => typeof m.content === 'string' && m.content.trim() !== '')
      .map(m => {
        let finalRole;
        if (m.role === 'user') {
          finalRole = 'user';
        } else if (m.role === 'assistant' || m.role === 'bot' || m.role === 'model') {
          finalRole = 'assistant';
        } else if (m.role === 'system') {
          finalRole = 'system';
        } else {
          console.warn(`[发送消息映射] 发现无效角色: '${m.role}'，内容: "${String(m.content || '').substring(0,30)}..."。将默认为 'user'。`);
          finalRole = 'user';
        }
        return { role: finalRole, content: m.content };
      });
  };

  try {
    // ... (switch 语句构建 apiUrl, headers, bodyPayload，保持不变) ...
    switch (providerToUse) {
      case 'openai':
        apiUrl = 'https://api.openai.com/v1/chat/completions';
        headers['Authorization'] = `Bearer ${apiKey}`;
        bodyPayload = {
          model: conv.model,
          messages: mapMessagesForStandardProviders(conv.messages)
        };
        break;
      case 'deepseek':
        apiUrl = 'https://api.deepseek.com/chat/completions';
        headers['Authorization'] = `Bearer ${apiKey}`;
        bodyPayload = {
          model: conv.model,
          messages: mapMessagesForStandardProviders(conv.messages)
        };
        break;
      case 'siliconflow':
        apiUrl = 'https://api.siliconflow.cn/v1/chat/completions';
        headers['Authorization'] = `Bearer ${apiKey}`;
        bodyPayload = {
          model: conv.model,
          messages: mapMessagesForStandardProviders(conv.messages)
        };
        break;
      case 'gemini':
        apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${conv.model}:generateContent?key=${apiKey}`;
        bodyPayload = {
          contents: conv.messages
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
              return {
                role: roleForGemini,
                parts: [{ text: m.content }]
              };
            })
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
      // ... (Gemini 回复提取) ...
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
    } else {
      if (data.choices && data.choices.length > 0 && data.choices[0].message) {
        assistantReply = data.choices[0].message.content || '（无回复）';
        if (data.choices[0].message.reasoning_content) {
          thinkingProcess = data.choices[0].message.reasoning_content;
        }
      }
    }
    // 在 try 块的末尾，如果成功，assistantReply 和 thinkingProcess 已经被赋值

  } catch (error) {
    console.error('发送错误:', error);
    assistantReply = `错误：${error.message}`; // 将错误信息赋给 assistantReply
    thinkingProcess = null; // 错误情况下，不显示思考过程
  } finally {
    if (loadingDiv) {
        loadingDiv.remove();
    }

    // --- 确保只在这里（finally块）执行一次助手消息的显示和保存 ---
    const assistantRoleToDisplay = (providerToUse === 'gemini') ? 'model' : 'assistant';
    appendMessage(assistantRoleToDisplay, assistantReply, conv.model, thinkingProcess);

    const assistantRoleToStore = 'assistant'; // 内部存储统一用 'assistant'
    // 只有当回复不是初始的“（无回复）”（意味着API调用至少返回了一些东西，或错误被捕获）
    // 才将这条“助手回合”的消息保存到历史记录
    if (assistantReply !== '（无回复）' || thinkingProcess) {
        conv.messages.push({
            role: assistantRoleToStore,
            content: assistantReply,
            model: conv.model,
            reasoning_content: thinkingProcess
        });
        saveConversations(); // 保存包含助手回复/错误或思考过程的对话
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
  }
});
// --- END OF FILE script.js ---