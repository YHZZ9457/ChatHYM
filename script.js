// --- START OF FILE script.js ---

// --- START OF FILE script.js ---

// ——— 顶部：针对 marked & MathJax 的配置 ———
// 1. 关闭 marked 的 sanitize（保留所有反斜杠），启用 GitHub 风格
// (此注释表明 marked.js 库的配置可能在外部进行，或者这是一个预期配置的占位说明。
//  如果 marked.js 的 sanitize 功能被禁用，请确保输入内容是可信的，或者有其他机制来防止 XSS 攻击。)

// 全局变量
let activeModel = ''; // 存储当前加载对话时，该对话所使用的模型ID
let conversations = []; // 存储所有对话对象的数组
let currentConversationId = null; // 当前正在查看或操作的对话的ID

// --- 辅助函数 ---

/* * 根据提供者名称返回其在 Local Storage 中存储 API Key 的键名。
 * @param {string} provider - API 提供者的名称 (例如 'openai', 'deepseek').
 * @returns {string|undefined} 对应的 Local Storage 键名，如果提供者未知则返回 undefined.
 */
function storageKeyFor(provider) {
  return {
    openai: 'openai-api-key',
    deepseek: 'deepseek-api-key',
    siliconflow: 'siliconflow-api-key',
    gemini: 'gemini-api-key',
    anthropic: 'anthropic-api-key',
    ollama: 'ollama-settings' // 新增：用于存储 Ollama 主机/端口等 (可选)
  }[provider];
}

/**
 * 转义 HTML 特殊字符。
 * 注意：当前实现中 .replace(/&/g, '&') 等是无效的转义，
 * 它们分别将 '&', '<', '>' 替换为自身，而不是 '&', '<', '>'。
 * 这意味着此函数目前并不执行有效的 HTML 转义。
 * 如果 marked 库未定义或未正确处理HTML转义，这可能导致潜在的 XSS 风险。
 * @param {string} str - 需要转义的字符串。
 * @returns {string} “转义”后的字符串 (当前实现下，与原字符串相同)。
 */
function escapeHtml(str) {
  // 转义 HTML 特特殊字符 (注意：当前实现是无效的，见函数注释)
  return str
    .replace(/&/g, '&') // 应该替换为 '&'
    .replace(/</g, '<') // 应该替换为 '<'
    .replace(/>/g, '>'); // 应该替换为 '>'
}

/**
 * 获取当前聊天界面模型选择下拉框中选定的模型值。
 * @returns {string} 当前选中的模型值，如果元素不存在则默认为 'gpt-3.5-turbo'。
 */
function getCurrentModel() {
  const modelInput = document.getElementById('model');
  return modelInput ? modelInput.value : 'gpt-3.5-turbo'; // 如果找不到元素，提供一个默认值
}

/**
 * 获取当前活动（被选中）的对话对象。
 * @returns {object|undefined} 当前对话对象，如果未找到或没有当前对话则返回 undefined。
 */
function getCurrentConversation() {
  return conversations.find(c => c.id === currentConversationId);
}

// --- Local Storage 管理 ---

/**
 * 从 Local Storage 加载对话列表。
 * 会进行数据校验和基本的数据结构修复。
 */
function loadConversations() {
  const data = localStorage.getItem('conversations');
  let raw;
  try {
    raw = data ? JSON.parse(data) : [];
  } catch (e) {
    console.error('解析会话列表失败（localStorage中的数据可能已损坏）：', e);
    raw = []; // 解析失败时，初始化为空数组
  }
  if (!Array.isArray(raw)) raw = []; // 确保是数组

  // 过滤并映射对话数据，确保基本字段存在且类型正确
  conversations = raw
    .filter(c => c && typeof c === 'object' && 'id' in c) // 确保是对象且有id
    .map(c => ({
      id: c.id,
      title: c.title || '无标题对话', // 提供默认标题
      model: c.model || getCurrentModel(), // 提供默认模型
      messages: Array.isArray(c.messages) ? c.messages : [],
      archived: typeof c.archived === 'boolean' ? c.archived : false,
      isNew: typeof c.isNew === 'boolean' ? c.isNew : false, // 'isNew' 标记新创建的对话
    }));
}

/**
 * 将当前的 `conversations` 数组保存到 Local Storage。
 */
function saveConversations() {
  localStorage.setItem('conversations', JSON.stringify(conversations));
}

// --- DOM 操作与渲染 ---

/**
 * 从指定的 DOM 容器中移除空的文本节点和空的 <p> 标签。
 * 也移除仅包含 <br> 的 <p> 标签或包含空白字符（包括  ）的 <p> 标签。
 * @param {HTMLElement} container - 要清理的 DOM 容器元素。
 */
function pruneEmptyNodes(container) {
  // 移除仅包含空白的文本节点
  Array.from(container.childNodes).forEach(node => {
    if (node.nodeType === Node.TEXT_NODE && !node.textContent.trim()) {
      node.remove();
    }
  });
  // 移除空的 <p> 标签或仅包含 <br> 或空白字符的 <p> 标签
  container.querySelectorAll('p').forEach(p => {
    // \u00A0 是  
    const txt = p.textContent.replace(/\u00A0/g, '').trim();
    if (!txt || (p.children.length === 1 && p.children[0].tagName === 'BR')) {
      p.remove();
    }
  });
}

/**
 * 向聊天消息区域追加一条新消息。
 * @param {string} role - 消息发送者的角色 ('user', 'assistant', 'model').
 * @param {string} text - 消息的主要内容。
 * @param {string} [modelForNote] - (可选) 用于在助手消息旁显示的模型名称。
 * @param {string} [reasoningText] - (可选) 助手的思考过程文本。
 * @returns {HTMLElement|null} 创建并添加到DOM中的消息包裹元素 (messageWrapperDiv)，如果消息为空且不应显示则返回 null。
 */
function appendMessage(role, text, modelForNote, reasoningText) {
  const emptyChatPlaceholder = document.getElementById('empty-chat-placeholder');
  // 如果占位符当前可见，则隐藏它，因为新消息即将被添加
  if (emptyChatPlaceholder && emptyChatPlaceholder.style.display !== 'none') {
    emptyChatPlaceholder.style.display = 'none';
    console.log("[AppendMessage] 添加消息，隐藏占位符。");
  }
  // --- 结束隐藏提示 ---

  const container = document.getElementById('messages'); // 消息容器
  const messageWrapperDiv = document.createElement('div'); // 包裹单条消息（包括删除按钮）的容器
  messageWrapperDiv.className = 'message-wrapper';

  // 根据角色添加特定的CSS类
  if (role === 'user') {
    messageWrapperDiv.classList.add('user-message-wrapper');
  } else { // 'assistant' or 'model'
    messageWrapperDiv.classList.add('assistant-message-wrapper');
  }

  const messageDiv = document.createElement('div'); // 实际显示消息内容的div
  messageDiv.className = 'message ' + (role === 'assistant' || role === 'model' ? 'assistant' : 'user');

  let reasoningContentElementForMathJax = null; // 用于MathJax渲染思考过程的元素

  // --- 1. 处理并添加思考过程 (如果存在且是助手消息) ---
  if (reasoningText && (role === 'assistant' || role === 'model')) {
    const reasoningBlockDiv = document.createElement('div');
    reasoningBlockDiv.className = 'reasoning-block';

    const label = document.createElement('div');
    label.className = 'reasoning-label';
    label.textContent = '思考过程:';
    reasoningBlockDiv.appendChild(label);

    reasoningContentElementForMathJax = document.createElement('div');
    reasoningContentElementForMathJax.className = 'reasoning-content';
    reasoningContentElementForMathJax.textContent = reasoningText; // 初始设为文本，MathJax稍后处理
    reasoningBlockDiv.appendChild(reasoningContentElementForMathJax);

    messageDiv.appendChild(reasoningBlockDiv);
  }

  // --- 2. 处理并添加主要回复内容 ---
  const safeText = typeof text === 'string' ? text : String(text || ''); // 确保 text 是字符串
  let contentHtml = '';
  // 只有当文本不为空，或者角色是助手且没有思考过程时（避免只有思考过程时出现重复的空内容块）才处理 markdown
  if (safeText.trim() !== '' || ((role === 'assistant' || role === 'model') && !reasoningText) ) {
    contentHtml = (typeof marked !== 'undefined') // 如果 marked 库存在
      ? marked.parse(safeText) // 使用 marked 解析 Markdown
      : escapeHtml(safeText);  // 否则使用 escapeHtml (注意：当前 escapeHtml 实现无效)
  }

  const contentDiv = document.createElement('div'); // 包含主要内容的 div
  contentDiv.className = 'text';
  if (contentHtml.trim() !== '') { // 仅当有实际HTML内容时设置 innerHTML
    contentDiv.innerHTML = contentHtml;
  }

  // 为所有 <pre> 标签（通常包含代码块）添加复制按钮
  contentDiv.querySelectorAll('pre').forEach(pre => {
    pre.style.position = 'relative'; // 为按钮定位
    const btn = document.createElement('button');
    btn.className = 'copy-btn';
    btn.textContent = '复制';
    btn.addEventListener('click', e => {
      e.stopPropagation(); // 防止事件冒泡到父元素
      const codeElem = pre.querySelector('code');
      // 尝试获取 <code> 标签内的文本，否则获取 <pre> 的纯文本
      let textToCopy = codeElem ? codeElem.innerText : (() => {
        const clone = pre.cloneNode(true); // 克隆以移除复制按钮本身
        clone.querySelector('.copy-btn')?.remove();
        return clone.innerText;
      })();
      navigator.clipboard.writeText(textToCopy).then(() => {
        btn.textContent = '已复制';
        setTimeout(() => btn.textContent = '复制', 2000); // 2秒后恢复按钮文本
      });
    });
    pre.appendChild(btn);
  });

  pruneEmptyNodes(contentDiv); // 清理可能由Markdown产生的空节点

  // 只有当 contentDiv 确实有内容（即使是空的Markdown结果也可能有空的<p>），
  // 或者它是助手消息且有模型注释时，才添加它。
  // 避免在只有思考过程的情况下添加一个空的 .text div。
  if (contentDiv.innerHTML.trim() !== '' || ((role === 'assistant' || role === 'model') && modelForNote && !reasoningText) ) {
      messageDiv.appendChild(contentDiv);
  }


  // --- 3. 添加模型注释 (如果需要，通常用于助手消息) ---
  if ((role === 'assistant' || role === 'model') && modelForNote) {
    const note = document.createElement('div');
    note.className = 'model-note';

    let displayModelName = modelForNote; // 默认使用传入的原始模型值
    const modelSelectElement = document.getElementById('model'); // 获取模型选择的 select 元素

    if (modelSelectElement) {
      // 尝试找到 value 属性与 modelForNote 完全匹配的 option
      const selectedOption = modelSelectElement.querySelector(`option[value="${modelForNote}"]`);
      if (selectedOption) {
        displayModelName = selectedOption.textContent; // 如果找到，使用该 option 的显示文本
      } else {
        // 后备逻辑：如果找不到完全匹配的，尝试去掉提供商前缀 (如 "sf::", "openai::" 等)
        const parts = String(modelForNote).split('::'); // 确保 modelForNote 是字符串
        if (parts.length === 2) {
          displayModelName = parts[1]; // 使用 "::" 后面的部分作为显示名称
          console.log(`[模型注释] 未在下拉列表中找到值 "${modelForNote}"，将显示解析后的名称: "${displayModelName}"`);
        } else {
          // 如果连 "::" 都没有，就直接显示原始的 modelForNote
          console.warn(`[模型注释] 无法从 "${modelForNote}" 解析出更友好的名称，将显示原始值。`);
        }
      }
    } else {
      console.warn("[模型注释] 未找到 ID 为 'model' 的 select 元素。模型注释将使用原始模型值。");
    }

    note.textContent = `模型：${displayModelName}`; // 使用获取到的或处理后的显示名称
    messageDiv.appendChild(note);
  }

  // --- 4. 创建并配置删除单条消息的按钮 ---
  const deleteMsgBtn = document.createElement('button');
  deleteMsgBtn.className = 'delete-message-btn';
  deleteMsgBtn.textContent = '✕'; // "X" 符号
  deleteMsgBtn.title = '删除此条消息';

  deleteMsgBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // 防止触发父元素（如消息气泡）的点击事件
    // 从 messageWrapperDiv 的 dataset 获取对话ID和消息索引
    const convId = messageWrapperDiv.dataset.conversationId;
    const msgIndex = parseInt(messageWrapperDiv.dataset.messageIndex, 10);

    if (convId && !isNaN(msgIndex)) {
      deleteSingleMessage(messageWrapperDiv, convId, msgIndex); // 调用删除函数
    } else {
      console.error('无法删除消息：缺少对话ID或消息索引。Dataset:', messageWrapperDiv.dataset);
    }
  });

  // --- 5. 根据角色决定按钮和气泡在包裹层中的顺序 (影响视觉布局) ---
  if (role === 'user') {
    messageWrapperDiv.appendChild(deleteMsgBtn); // 用户消息：删除按钮在左，消息气泡在右
    messageWrapperDiv.appendChild(messageDiv);
  } else { // 'assistant' or 'model'
    messageWrapperDiv.appendChild(messageDiv); // 助手消息：消息气泡在左，删除按钮在右
    messageWrapperDiv.appendChild(deleteMsgBtn);
  }

  // --- 6. 将整个消息包裹层添加到消息容器中 ---
  // 只有当 messageDiv 内部确实有内容（主要内容、思考过程或模型注释）时才添加整个 wrapper
  // 或者它是用户消息（用户消息即使为空也应该有个气泡和删除按钮，尽管通常用户不会发送空消息）
  if (messageDiv.hasChildNodes() || role === 'user') {
    container.appendChild(messageWrapperDiv);
  }

  container.scrollTop = container.scrollHeight; // 滚动到底部以显示最新消息

  // --- 7. MathJax 渲染逻辑 (如果 MathJax 可用) ---
  if (window.MathJax && MathJax.typesetPromise) {
    const elementsToTypeset = [];
    // 确保只对实际添加到 DOM 并且有内容的元素进行 typeset
    if (messageDiv.contains(contentDiv) && contentDiv.innerHTML.trim() !== '') {
        elementsToTypeset.push(contentDiv); // 主要内容
    }
    if (reasoningContentElementForMathJax && messageDiv.contains(reasoningContentElementForMathJax)) {
        elementsToTypeset.push(reasoningContentElementForMathJax); // 思考过程内容
    }
    if (elementsToTypeset.length > 0) {
        MathJax.typesetPromise(elementsToTypeset).catch(err => console.error("MathJax typesetting failed:", err));
    }
  }

  // 只返回被实际添加到DOM的wrapper，否则可能返回一个未被添加的元素
  if (messageDiv.hasChildNodes() || role === 'user') {
    return messageWrapperDiv;
  }
  return null; // 如果因为是空助手消息且无思考过程而未添加，则返回null
}

/**
 * 在消息容器中追加一个“加载中”的提示（例如“对方正在输入…”）。
 * @returns {HTMLElement} 创建的加载提示元素。
 */
function appendLoading() {
  const container = document.getElementById('messages');
  const div = document.createElement('div');
  div.className = 'message assistant loading'; // 使用助手样式并添加 'loading' 类
  const span = document.createElement('div');
  span.className = 'text';
  span.textContent = '对方正在输入…';
  div.appendChild(span);
  container.appendChild(div);
  container.scrollTop = container.scrollHeight; // 滚动到底部
  return div;
}

/**
 * 渲染左侧的对话列表，包括未归档和已归档的对话。
 * 会保留已归档列表的展开/折叠状态。
 */
function renderConversationList() {
  const list = document.getElementById('conversation-list'); // 对话列表的UL元素

  // 检查归档区域之前是否是展开状态
  let isArchivePreviouslyExpanded = false;
  const oldArchiveToggle = list.querySelector('.archive-toggle');
  if (oldArchiveToggle && oldArchiveToggle.classList.contains('expanded')) {
    isArchivePreviouslyExpanded = true;
  }

  list.innerHTML = ''; // 清空现有列表项

  // 渲染未归档的对话
  conversations
    .filter(c => !c.archived)
    .forEach(c => {
      const li = document.createElement('li');
      li.className = 'conversation-item';
      li.dataset.id = c.id; // 存储对话ID

      const titleSpan = document.createElement('span');
      titleSpan.className = 'title';
      titleSpan.textContent = c.title;
      li.appendChild(titleSpan);

      if (c.isNew) { // 如果是新创建的对话，添加 'new-conv' 样式
        li.classList.add('new-conv');
      }
      if (c.id === currentConversationId) { // 如果是当前活动对话，添加 'active' 样式
        li.classList.add('active');
      }

      // 点击加载对话
      li.addEventListener('click', () => {
        if (c.isNew) { // 如果点击的是新对话，清除 'isNew' 标记
            c.isNew = false;
            // saveConversations(); // 可选：立即保存状态，或在其他操作后统一保存
        }
        loadConversation(c.id);
      });
      // 双击重命名对话
      li.addEventListener('dblclick', () => renameConversation(c.id));

      const delBtn = document.createElement('button'); // 删除按钮
      delBtn.textContent = 'Del';
      delBtn.className = 'del';
      delBtn.addEventListener('click', e => {
        e.stopPropagation(); // 防止触发li的点击事件
        if (confirm(`确定要删除「${c.title}」吗？此操作无法恢复。`)) {
          deleteConversation(c.id);
        }
      });
      li.appendChild(delBtn);
      list.appendChild(li);
    });

  // 渲染已归档的对话（如果存在）
  const archivedConversations = conversations.filter(c => c.archived);
  if (archivedConversations.length) {
    const toggle = document.createElement('li'); // "已归档" 分组的切换条目
    toggle.className = 'archive-toggle';
    toggle.textContent = `已归档 (${archivedConversations.length})`;

    if (isArchivePreviouslyExpanded) { // 恢复之前的展开状态
      toggle.classList.add('expanded');
    }

    // 点击切换已归档列表的显示/隐藏
    toggle.addEventListener('click', () => {
        toggle.classList.toggle('expanded');
        const subListElement = toggle.nextElementSibling; // 已归档对话的 <ul>
        if (subListElement && subListElement.classList.contains('archived-list')) {
            subListElement.style.display = toggle.classList.contains('expanded') ? 'block' : 'none';
        }
    });
    list.appendChild(toggle);

    const subList = document.createElement('ul'); // 存储已归档对话的子列表
    subList.className = 'archived-list';

    // 根据之前的状态设置初始显示
    if (isArchivePreviouslyExpanded) {
      subList.style.display = 'block';
    } else {
      subList.style.display = 'none';
    }

    archivedConversations.forEach(c => {
      const li = document.createElement('li');
      li.className = 'conversation-item archived'; // 添加 'archived' 样式
      li.dataset.id = c.id;

      const titleSpan = document.createElement('span');
      titleSpan.className = 'title';
      titleSpan.textContent = c.title;
      li.appendChild(titleSpan);

      if (c.id === currentConversationId) { // 标记活动对话（即使它已归档）
        li.classList.add('active');
      }
      li.addEventListener('click', () => loadConversation(c.id));
      li.addEventListener('dblclick', () => renameConversation(c.id));
      subList.appendChild(li);
    });
    list.appendChild(subList);
  }

  enableConversationDrag(); // 启用/重新启用对话列表的拖拽排序
}

/**
 * 启用对话列表的拖拽排序功能。
 * 使用 SortableJS 库。只对未归档的对话有效。
 */
function enableConversationDrag() {
  const list = document.getElementById('conversation-list');
  if (!list || typeof Sortable === 'undefined') { // 检查列表元素和 SortableJS 是否存在
    if (typeof Sortable === 'undefined') console.warn("SortableJS 未加载，无法启用拖拽排序。");
    return;
  }

  // 如果已存在 Sortable 实例，先销毁它，以防止重复初始化或配置冲突
  if (list.sortableInstance) {
    list.sortableInstance.destroy();
  }

  // 创建 SortableJS 实例
  list.sortableInstance = Sortable.create(list, {
    animation: 150, // 拖拽动画时间
    ghostClass: 'sortable-ghost',  // 拖拽时占位元素的类名
    chosenClass: 'sortable-chosen', //被选中项的类名
    filter: '.archive-toggle, .archived-list, .archived-item', // 不允许拖拽的元素 (归档切换条、归档列表本身、归档项)
    preventOnFilter: true, // 阻止在 filter 匹配的元素上开始拖拽
    onEnd: evt => { // 拖拽结束后的回调
      if (evt.oldIndex === undefined || evt.newIndex === undefined) return; // 无效拖拽事件

      // 更新 `conversations` 数组中未归档项目的顺序
      const nonArchived = conversations.filter(c => !c.archived);
      const [movedItem] = nonArchived.splice(evt.oldIndex, 1); // 从旧位置移除
      nonArchived.splice(evt.newIndex, 0, movedItem);         // 插入到新位置

      // 重组 `conversations` 数组：排序后的未归档项 + 原有的归档项
      conversations = [...nonArchived, ...conversations.filter(c => c.archived)];
      saveConversations();      // 保存更改
      renderConversationList(); // 重新渲染列表以反映新顺序（并重新应用Sortable）
    }
  });
}

// --- 对话逻辑 ---

/**
 * 创建一个新的对话。
 * 新对话会被添加到对话列表的顶部，并自动加载。
 */
function createNewConversation() {
  const id = Date.now().toString(); // 使用时间戳作为唯一ID
  const newConv = {
    id,
    title: '新对话', // 默认标题
    model: getCurrentModel(), // 使用当前选中的模型
    messages: [],
    archived: false,
    isNew: true, // 标记为新对话，用于特殊显示（例如高亮）
  };
  conversations.unshift(newConv); // 添加到数组开头
  saveConversations();
  loadConversation(id); // 加载新创建的对话
}
window.createNewConversation = createNewConversation; // 暴露到全局，可能由HTML中的onclick调用


/**
 * 加载指定ID的对话到主聊天界面。
 * @param {string} id - 要加载的对话的ID。
 */
function loadConversation(id) {
  const conv = conversations.find(c => c.id === id);

  // 如果找不到指定ID的对话
  if (!conv) {
    if (conversations.length > 0) {
      // 尝试加载第一个未归档对话，如果不存在，则加载第一个（可能是已归档的）对话
      const firstNonArchived = conversations.filter(c => !c.archived)[0];
      const targetId = firstNonArchived ? firstNonArchived.id : conversations[0].id;
      loadConversation(targetId);
    } else {
      // 如果没有任何对话，则创建一个新对话
      createNewConversation();
    }
    return;
  }

  // 如果加载的是新对话，清除 'isNew' 标记
  if (conv.isNew) {
    conv.isNew = false;
    // saveConversations(); // 可选：立即保存，或在其他地方统一保存
  }

  currentConversationId = id;    // 更新当前活动对话ID
  activeModel = conv.model;      // 更新当前活动模型

  // 更新UI元素以反映加载的对话
  document.getElementById('chat-title').textContent = conv.title; // 设置聊天区域标题
  const archiveBtn = document.getElementById('archive-current-btn');
  if (archiveBtn) { // 更新归档按钮的文本
    archiveBtn.textContent = conv.archived ? '取消归档' : '归档';
  }
  document.getElementById('model').value = conv.model; // 设置模型选择下拉框的值

  // 显示聊天区域，隐藏设置区域
  document.getElementById('settings-area').style.display = 'none';
  document.getElementById('chat-area').style.display = 'flex';

  const messagesContainer = document.getElementById('messages');
  const emptyChatPlaceholder = document.getElementById('empty-chat-placeholder');

  // 1. 清空聊天区域的旧消息
  // 移除所有非占位符的子元素
  Array.from(messagesContainer.children).forEach(child => {
    if (child !== emptyChatPlaceholder) { // 不要移除占位符本身
      messagesContainer.removeChild(child);
    }
  });
  // 确保占位符存在且在正确的位置（如果它之前被意外移除了）
  if (emptyChatPlaceholder && emptyChatPlaceholder.parentNode !== messagesContainer) {
      messagesContainer.innerHTML = ''; // 清空所有内容
      messagesContainer.appendChild(emptyChatPlaceholder); // 重新添加占位符
  } else if (!emptyChatPlaceholder) {
      console.error("ID为 'empty-chat-placeholder' 的元素未在HTML中找到！无法管理空聊天提示。");
  }


  // 2. 过滤有效消息进行渲染
  // 有效消息：内容非空字符串，或有思考过程，或者是用户消息（用户可以发送空消息，虽然不常见）
  const messagesToRender = conv.messages.filter(m => {
    const hasContent = typeof m.content === 'string' && m.content.trim() !== '';
    const hasReasoning = typeof m.reasoning_content === 'string' && m.reasoning_content.trim() !== '';
    return hasContent || hasReasoning || (m.role === 'user');
  });

  // 3. 根据是否有消息来显示/隐藏占位符或渲染消息
  if (messagesToRender.length === 0) {
    if (emptyChatPlaceholder) {
      emptyChatPlaceholder.style.display = 'flex'; // 对话为空，显示占位符
      console.log("[LoadConv] 对话为空，显示占位符。");
    }
  } else {
    if (emptyChatPlaceholder) {
      emptyChatPlaceholder.style.display = 'none'; // 对话有消息，隐藏占位符
      console.log("[LoadConv] 对话有消息，隐藏占位符。");
    }

    let messageIndex = 0; // 用于为每条消息设置 data-message-index，方便后续删除操作
    messagesToRender.forEach(m => {
      const messageElement = appendMessage(
        m.role,
        m.content,
        m.model || conv.model, // 如果消息本身没有记录模型，使用对话的模型
        m.reasoning_content || null // 思考过程
      );
      // 为成功添加的DOM元素设置对话ID和消息索引，用于删除
      if (messageElement) {
          messageElement.dataset.conversationId = conv.id;
          messageElement.dataset.messageIndex = messageIndex;
          messageIndex++;
      }
    });
  }

  messagesContainer.scrollTop = messagesContainer.scrollHeight; // 滚动到消息底部
  renderConversationList();    // 更新左侧对话列表（例如，标记当前对话为 'active'）
  enableInlineTitleEdit();   // 为当前对话的标题启用行内编辑功能
}

/**
 * 删除单条消息。
 * @param {HTMLElement} messageElement - 要删除消息的DOM元素 (messageWrapperDiv)。
 * @param {string} conversationId - 消息所属对话的ID。
 * @param {number} messageIndex - 消息在对话 messages 数组中的索引。
 */
function deleteSingleMessage(messageElement, conversationId, messageIndex) {
  const conv = conversations.find(c => c.id === conversationId);
  if (!conv || messageIndex < 0 || messageIndex >= conv.messages.length) {
    console.error('无法删除消息：无效的对话ID或消息索引。');
    // 提供一个选项，即使数据不一致也从界面移除，避免UI卡死
    if (confirm('数据可能不一致。确实要从界面移除此条消息吗？（这可能不会从存储中删除）')) {
      messageElement.remove();
    }
    return;
  }

  // 准备消息内容预览，用于确认对话框
  const messageToConfirm = conv.messages[messageIndex];
  let confirmTextPreview = "";
  if (messageToConfirm && messageToConfirm.content) {
    confirmTextPreview = String(messageToConfirm.content).substring(0, 50); // 取前50个字符
    if (String(messageToConfirm.content).length > 50) {
      confirmTextPreview += "..."; // 内容过长则加省略号
    }
  } else {
    confirmTextPreview = "(无法预览内容)";
  }

  if (confirm(`确实要删除这条消息吗？\n\n"${confirmTextPreview}"`)) {
    // 1. 从数据模型中删除
    const deletedMessage = conv.messages.splice(messageIndex, 1); // splice返回被删除元素的数组
    saveConversations(); // 保存更改

    console.log(`消息已从数据中删除 (对话ID: ${conversationId}, 原索引: ${messageIndex})`, deletedMessage[0]);

    // 2. 更新DOM
    // 如果删除的是当前对话的消息，则重新加载整个对话以正确更新DOM和后续消息的索引。
    // 这比手动调整所有后续消息的 data-message-index 更简单可靠。
    if (conversationId === currentConversationId) {
      loadConversation(currentConversationId);
    } else {
      // 如果删除的不是当前对话的消息（这种情况在此UI设计中不常见，除非有其他入口点）
      // 则仅从DOM中移除该元素，并可能需要更新相关列表视图（如对话列表的摘要）
      messageElement.remove();
      renderConversationList(); // 例如，如果对话列表显示消息摘要或计数
    }
  }
}

/**
 * 重命名指定ID的对话。
 * @param {string} id - 要重命名的对话的ID。
 */
function renameConversation(id) {
  const conv = conversations.find(c => c.id === id);
  if (!conv) return; // 对话不存在

  const newTitle = prompt('输入新的对话标题：', conv.title); // 弹出输入框
  if (newTitle && newTitle.trim()) { // 如果用户输入了有效的新标题
    conv.title = newTitle.trim();
    saveConversations();
    renderConversationList(); // 更新对话列表显示
    if (id === currentConversationId) { // 如果是当前对话，也更新聊天区域的标题
      document.getElementById('chat-title').textContent = conv.title;
    }
  }
}

/**
 * 删除指定ID的整个对话。
 * @param {string} id - 要删除的对话的ID。
 */
function deleteConversation(id) {
  const idx = conversations.findIndex(c => c.id === id);
  if (idx === -1) return; // 对话不存在

  const wasCurrent = conversations[idx].id === currentConversationId; // 检查是否是当前对话
  conversations.splice(idx, 1); // 从数组中移除
  saveConversations();

  if (wasCurrent) { // 如果删除的是当前对话
    if (conversations.length > 0) {
      // 加载下一个可用对话（优先未归档，否则第一个）
      const nextNonArchived = conversations.filter(c => !c.archived);
      const newIdToLoad = (nextNonArchived.length > 0) ? nextNonArchived[0].id : conversations[0].id;
      loadConversation(newIdToLoad);
    } else {
      // 如果没有其他对话了，创建一个新对话
      createNewConversation();
    }
  } else {
    // 如果删除的不是当前对话，只需更新列表
    renderConversationList();
  }
}

/**
 * 切换指定ID对话的归档状态。
 * @param {string} id - 要操作的对话的ID。
 */
function toggleArchive(id) {
  const conv = conversations.find(c => c.id === id);
  if (!conv) return;

  conv.archived = !conv.archived; // 切换归档状态
  conv.isNew = false; // 归档操作会清除 'isNew' 状态
  saveConversations();

  if (conv.archived && currentConversationId === id) { // 如果归档了当前对话
    // 尝试加载下一个未归档的对话
    const nextNonArchived = conversations.find(c => !c.archived);
    if (nextNonArchived) {
      loadConversation(nextNonArchived.id);
    } else {
      // 如果没有其他未归档对话，则创建一个新对话
      createNewConversation();
    }
  } else if (!conv.archived) { // 如果是取消归档
    loadConversation(conv.id); // 重新加载此对话（它现在是未归档的）
  } else { // 如果归档的不是当前对话，或者取消归档的不是当前对话（且未加载它）
    renderConversationList(); // 只更新列表
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
  const modelValueFromOption = conversationAtRequestTime.model;

  let actualProvider;
  let modelNameForAPI;

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
      case 'ollama': actualProvider = 'ollama'; break; // OLLAMA PROVIDER
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
  const headers = { 'Content-Type': 'application/json' };
  let bodyPayload;
  let finalAssistantReply = '（无回复）';
  let finalThinkingProcess = null; // 用于存储最终的思考过程文本
  let requestWasSuccessful = false;
  let responseContentType = null;
  let isStreamingResponse = false; // 指的是 *预期* 和 *Content-Type* 头部

  // --- 消息映射函数定义 (如你之前提供的结构，定义在 send 内部) ---
  const mapMessagesForStandardOrClaude = (messagesHistory, currentProviderInternal) => {
    const cleanedMessages = messagesHistory
      .map(m => {
        let role = m.role;
        let content = String(m.content || '').trim();
        if (role === 'bot' || (role === 'model' && currentProviderInternal !== 'gemini')) {
          role = 'assistant';
        } else if (role !== 'user' && role !== 'assistant' && role !== 'system') {
          console.warn(`[消息映射-${currentProviderInternal}] 无效角色: '${m.role}' -> 'user' (默认回退)`);
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
        // Anthropic 和 Ollama 通常不直接在 messages 数组中使用 system 角色。
        // Anthropic 的 system prompt 在顶层参数。
        // Ollama 的 system prompt 通常在 Modelfile 中设置，或作为第一条 user message 的一部分。
        // 或者，Ollama API 也接受一个顶层的 'system' 字段。
        if (currentProviderInternal !== 'anthropic' && currentProviderInternal !== 'ollama') {
            processedMessages.push(msg);
        }
        lastRoleAppended = msg.role;
        return;
      }
      if (msg.role === lastRoleAppended && (msg.role === 'user' || msg.role === 'assistant') && processedMessages.length > 0) {
        processedMessages[processedMessages.length - 1].content += "\n" + msg.content;
      }
      else if ( (msg.role === 'assistant' && lastRoleAppended !== 'user' && processedMessages.length > 0 && processedMessages[processedMessages.length-1].role !== 'system') ||
                  (msg.role === 'user' && lastRoleAppended === 'user' && processedMessages.length > 0)
      ) {
        console.warn(`[消息映射-${currentProviderInternal}] 跳过不符合交替规则的消息: ${msg.role} after ${lastRoleAppended}. Content: "${msg.content.substring(0,50)}..."`);
      }
      else {
        processedMessages.push(msg);
        if (msg.role === 'user' || msg.role === 'assistant') lastRoleAppended = msg.role;
      }
    });

    if (currentProviderInternal === 'anthropic') { // Anthropic 特定: 第一条必须是 user
      if (processedMessages.length > 0 && processedMessages[0].role !== 'user') {
        while(processedMessages.length > 0 && processedMessages[0].role !== 'user') processedMessages.shift();
        if (processedMessages.length > 0 && processedMessages[0].role !== 'user') return [];
      }
    }
    // 对于Ollama，如果 messages 数组以 system 消息开头，我们通常会移除它，
    // 因为系统指令更适合放在 Modelfile 或 API 的顶层 `system` 字段，或嵌入到用户消息中。
    if (currentProviderInternal === 'ollama' && processedMessages.length > 0 && processedMessages[0].role === 'system') {
        console.warn("[消息映射-Ollama] 移除了开头的 system 消息。建议通过 Modelfile、API的'system'字段或在用户消息中包含系统指令。");
        // 如果有需要，可以在这里将 system 消息的内容提取出来，用于后续放入 bodyPayload.system
        processedMessages.shift();
    }


    if (processedMessages.length === 0 && messagesHistory.length > 0) {
      const latestUserMessageFromHistory = messagesHistory.filter(m => m.role === 'user').pop();
      if (latestUserMessageFromHistory && String(latestUserMessageFromHistory.content || '').trim()) {
          console.warn(`[消息映射-${currentProviderInternal}] 过滤后消息列表为空，回退到仅使用最新的用户输入。`);
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
        else {
            console.warn(`[Gemini映射] 无效角色: '${m.role}' -> 'user' (默认回退)`);
            roleForGemini = 'user';
        }
        return { role: roleForGemini, parts: [{ text: m.content }] };
      });
  };
  // --- 结束消息映射函数定义 ---

  try {
    let currentTemperature = parseFloat(localStorage.getItem('model-temperature'));
    if (isNaN(currentTemperature) || currentTemperature < 0 || currentTemperature > 2) {
      currentTemperature = 0.7;
    }

    const shouldUseStreaming = ['openai', 'anthropic', 'deepseek', 'siliconflow', 'ollama'].includes(providerToUse);

    if (providerToUse === 'ollama') {
      apiUrl = 'http://localhost:11434/api/chat'; // 默认 Ollama API 地址
      // 尝试从 localStorage 获取 Ollama 的自定义 API 地址 (如果用户在设置中配置了)
      const ollamaSettings = JSON.parse(localStorage.getItem('ollama-settings') || '{}');
      if (ollamaSettings && ollamaSettings.apiUrl && ollamaSettings.apiUrl.trim() !== '') {
          apiUrl = ollamaSettings.apiUrl.trim();
          console.log(`[发送][Ollama] 使用自定义 API 地址: ${apiUrl}`);
      }

      bodyPayload = {
        model: modelNameForAPI,
        messages: mapMessagesForStandardOrClaude(conversationAtRequestTime.messages, 'ollama'),
        stream: shouldUseStreaming,
        options: {
          temperature: currentTemperature
          // 可以添加其他 Ollama 支持的参数，如 top_p, top_k, num_ctx, seed 等
        }
      };
      // 可选：如果想从对话历史中提取 system prompt 并用于 Ollama API 的顶层 `system` 字段
      const systemMessageObj = conversationAtRequestTime.messages.find(m => m.role === 'system');
      if (systemMessageObj && systemMessageObj.content) {
         bodyPayload.system = systemMessageObj.content;
         console.log(`[发送][Ollama] 使用从对话历史中提取的 system prompt: "${systemMessageObj.content.substring(0,50)}..."`);
      }

    } else if (providerToUse === 'gemini') {
      apiUrl = `/.netlify/functions/gemini-proxy`; // 假设 Gemini 仍通过代理
      bodyPayload = {
        model: modelNameForAPI,
        // stream: false, // Gemini 在此代码中被设为非流式，由代理或API默认行为决定
      };
      bodyPayload.contents = mapMessagesForGemini(conversationAtRequestTime.messages);
      bodyPayload.generationConfig = { temperature: currentTemperature };
    } else { // 其他通过 Netlify 代理的提供商
      apiUrl = `/.netlify/functions/${providerToUse}-proxy`;
      bodyPayload = {
        model: modelNameForAPI,
        temperature: currentTemperature,
        stream: shouldUseStreaming,
      };
      bodyPayload.messages = mapMessagesForStandardOrClaude(conversationAtRequestTime.messages, providerToUse);
      if (providerToUse === 'anthropic') { bodyPayload.max_tokens = 1024; }
    }

    if ((providerToUse === 'gemini' && (!bodyPayload.contents || bodyPayload.contents.length === 0)) ||
        ((providerToUse !== 'gemini') && (!bodyPayload.messages || bodyPayload.messages.length === 0))) {
      if (loadingDiv) loadingDiv.remove();
      alert("没有有效的历史消息或当前输入来构建请求。请检查消息是否因过滤规则被移除。");
      return;
    }

    const body = JSON.stringify(bodyPayload);
    console.log(`[发送] 请求 (${providerToUse}) 发往 ${apiUrl}:`, bodyPayload); // 打印对象而非字符串，更易读

    const response = await fetch(apiUrl, { method: 'POST', headers, body });
    responseContentType = response.headers.get('content-type');

    isStreamingResponse = shouldUseStreaming && response.body &&
                         (  responseContentType?.includes('text/event-stream') ||
                            (providerToUse === 'ollama' && responseContentType?.includes('application/x-ndjson'))
                         );

    if (!response.ok) {
      const errorText = await response.text();
      let detail = errorText;
      try {
        const errJson = JSON.parse(errorText);
        detail = errJson.error?.message || errJson.error || JSON.stringify(errJson);
        if (providerToUse === 'ollama' && errJson.error && typeof errJson.error === 'string') {
             detail = `Ollama Error: ${errJson.error}`;
        }
      } catch (e) { /* 解析失败则使用原始错误文本 */ }

      let rawError = `API 接口返回 ${response.status}：${detail}`;
      if (response.status >= 400 && apiUrl.includes('/.netlify/functions/')) {
        rawError = `代理函数 (${decodeURIComponent(apiUrl.split('/').pop())}) 调用失败 (${response.status})：${detail}。`;
      } else if (providerToUse === 'ollama' && response.status !== 200) { // Ollama 非200即错误
        rawError = `Ollama API 调用失败 (${response.status})：${detail}。请确保 Ollama 服务正在运行于 ${apiUrl}，模型 '${modelNameForAPI}' 已下载 (ollama pull ${modelNameForAPI})，并且浏览器的 CORS 策略允许此请求 (检查 Ollama 服务的 OLLAMA_ORIGINS 配置)。`;
      }
      throw new Error(rawError);
    }

    // --- 响应处理 ---
    let isActuallyStreaming = shouldUseStreaming && response.body &&
                             (  (providerToUse !== 'ollama' && responseContentType?.includes('text/event-stream')) ||
                                (providerToUse === 'ollama' && responseContentType?.includes('application/x-ndjson'))
                             );

    if (isActuallyStreaming) {
      console.log(`[接收流] 开始处理来自 ${providerToUse} 的流式响应 (Content-Type: ${responseContentType})...`);
      let accumulatedAssistantReply = "";
      let accumulatedThinkingForDisplay = ""; // 用于在UI上显示的思考过程 (特别是Ollama)
      let isCurrentlyInThinkingBlock = false; // Ollama思考块状态

      const assistantRoleForDisplay = (providerToUse === 'gemini') ? 'model' : 'assistant';

      let tempMsgElementWrapper = null;
      let messageDiv = null;
      let assistantTextElement = null;
      let reasoningBlockDiv = null;     // DeepSeek 和 Ollama 思考过程的块级元素
      let reasoningContentElement = null; // DeepSeek 和 Ollama 显示思考过程内容的元素

      if (currentConversationId === conversationIdAtRequestTime) {
        // 初始调用 appendMessage 时，为 Ollama 和 DeepSeek 预留思考过程区域
        // 如果是 Ollama，传入空字符串 "" 以便 appendMessage 创建DOM结构
        // 如果是 DeepSeek，也传入 "" 或 null，因为它的思考过程是单独的字段
        const initialReasoningText = (providerToUse === 'ollama' || providerToUse === 'deepseek') ? "" : null;
        tempMsgElementWrapper = appendMessage(assistantRoleForDisplay, "", modelValueFromOption, initialReasoningText);

        if (tempMsgElementWrapper) {
          messageDiv = tempMsgElementWrapper.querySelector('.message.assistant');
          assistantTextElement = messageDiv ? messageDiv.querySelector('.text') : null;
          if (providerToUse === 'ollama' || providerToUse === 'deepseek') {
              reasoningBlockDiv = messageDiv ? messageDiv.querySelector('.reasoning-block') : null;
              if (reasoningBlockDiv) {
                  reasoningContentElement = reasoningBlockDiv.querySelector('.reasoning-content');
              }
          }
        }
      }

      if (currentConversationId === conversationIdAtRequestTime && (!messageDiv || !assistantTextElement)) {
        console.error("无法创建或找到用于流式输出的助手消息文本元素！");
        throw new Error("流式输出错误：无法更新UI。");
      }
      // 如果是Ollama/Deepseek，且应有思考过程区域但未找到，也应视为问题
      if (currentConversationId === conversationIdAtRequestTime &&
          (providerToUse === 'ollama' || providerToUse === 'deepseek') &&
          (!reasoningBlockDiv || !reasoningContentElement) && messageDiv /* 确保messageDiv存在才继续判断 */
      ) {
          console.warn(`[接收流][${providerToUse}] 未能正确初始化思考过程的DOM元素。appendMessage行为可能需要检查。`);
          // 可以在这里尝试动态创建，如果 appendMessage 确实没创建成功
      }


      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            console.log("[接收流] 流结束。");
            // 对于 Ollama NDJSON，最后一个 buffer 中可能还有数据
            if (providerToUse === 'ollama' && buffer.trim() !== '') {
                try {
                    const chunkJson = JSON.parse(buffer.trim());
                    let lastRawChunkText = chunkJson.message?.content || '';
                    if (lastRawChunkText) {
                        // 使用 extractThinkingAndReply 处理最后一块
                        let { replyTextPortion, thinkingTextPortion, newThinkingBlockState } = extractThinkingAndReply(
                            lastRawChunkText, "<think>", "</think>", isCurrentlyInThinkingBlock
                        );
                        isCurrentlyInThinkingBlock = newThinkingBlockState; // 更新状态

                        if (currentConversationId === conversationIdAtRequestTime) {
                            if (thinkingTextPortion && reasoningContentElement) {
                                accumulatedThinkingForDisplay += thinkingTextPortion;
                                reasoningContentElement.textContent = accumulatedThinkingForDisplay;
                            }
                            if (replyTextPortion && assistantTextElement) {
                                accumulatedAssistantReply += replyTextPortion;
                                assistantTextElement.innerHTML = marked.parse(accumulatedAssistantReply);
                            }
                            if (thinkingTextPortion || replyTextPortion) document.getElementById('messages').scrollTop = document.getElementById('messages').scrollHeight;
                        } else {
                            if (thinkingTextPortion) accumulatedThinkingForDisplay += thinkingTextPortion;
                            if (replyTextPortion) accumulatedAssistantReply += replyTextPortion;
                        }
                    }
                } catch(e) {
                    console.warn('[接收流][Ollama] 解析流末尾残余数据失败:', buffer.trim(), e);
                }
            }
            break; // 退出循环
          }

          buffer += decoder.decode(value, { stream: true });

          if (providerToUse === 'ollama') {
            let parts = buffer.split('\n');
            buffer = parts.pop(); // 最后一个片段可能不完整，放回缓冲区

            for (const part of parts) {
              if (part.trim() === '') continue;
              try {
                const chunkJson = JSON.parse(part);
                let rawChunkText = chunkJson.message?.content || '';

                if (rawChunkText) {
                  // 使用辅助函数 extractThinkingAndReply (你需要确保这个函数已定义在你的JS文件中)
                  let { replyTextPortion, thinkingTextPortion, newThinkingBlockState } = extractThinkingAndReply(
                      rawChunkText,
                      "<think>", // Ollama思考开始标签
                      "</think>", // Ollama思考结束标签
                      isCurrentlyInThinkingBlock // 传入当前状态
                  );
                  isCurrentlyInThinkingBlock = newThinkingBlockState; // 更新状态

                  if (currentConversationId === conversationIdAtRequestTime) { // 只在当前对话更新UI
                    // 更新UI上的思考过程
                    if (thinkingTextPortion && messageDiv) { // 确保 messageDiv 存在
                        accumulatedThinkingForDisplay += thinkingTextPortion;
                        // 再次检查并确保 reasoningContentElement 存在
                        if (!reasoningContentElement) {
                            reasoningBlockDiv = messageDiv.querySelector('.reasoning-block');
                            if (!reasoningBlockDiv) { // 如果 appendMessage 未创建，则手动创建
                                console.warn("[接收流][Ollama] reasoningBlockDiv 未找到，尝试动态创建。");
                                reasoningBlockDiv = document.createElement('div');
                                reasoningBlockDiv.className = 'reasoning-block';
                                const label = document.createElement('div');
                                label.className = 'reasoning-label';
                                label.textContent = '思考过程:';
                                reasoningBlockDiv.appendChild(label);
                                reasoningContentElement = document.createElement('div');
                                reasoningContentElement.className = 'reasoning-content';
                                reasoningBlockDiv.appendChild(reasoningContentElement);
                                messageDiv.insertBefore(reasoningBlockDiv, assistantTextElement || messageDiv.firstChild);
                            } else {
                                reasoningContentElement = reasoningBlockDiv.querySelector('.reasoning-content');
                            }
                        }
                        if (reasoningContentElement) { // 确保元素获取成功
                            reasoningContentElement.textContent = accumulatedThinkingForDisplay;
                        } else {
                            console.error("[接收流][Ollama] reasoningContentElement 仍然无法获取！");
                        }
                    }

                    // 更新UI上的主要回复
                    if (replyTextPortion && assistantTextElement) {
                        accumulatedAssistantReply += replyTextPortion;
                        assistantTextElement.innerHTML = marked.parse(accumulatedAssistantReply);
                    }

                    // 滚动
                    if (thinkingTextPortion || replyTextPortion) {
                        document.getElementById('messages').scrollTop = document.getElementById('messages').scrollHeight;
                    }
                  } else { // 用户已切换对话，仅累积数据
                    if (thinkingTextPortion) accumulatedThinkingForDisplay += thinkingTextPortion;
                    if (replyTextPortion) accumulatedAssistantReply += replyTextPortion;
                  }
                }

                if (chunkJson.done) {
                    console.log("[接收流][Ollama] Ollama chunk.done === true. Eval count:", chunkJson.eval_count, "Duration:", chunkJson.eval_duration);
                    isCurrentlyInThinkingBlock = false; // 模型说完了，强制退出思考状态
                }
              } catch (e) {
                console.warn('[接收流][Ollama] 解析NDJSON数据块失败:', part, e);
              }
            }
          } else { // SSE Stream for other providers (OpenAI, DeepSeek, Anthropic)
            let lines = buffer.split('\n\n');
            buffer = lines.pop();

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const jsonData = line.substring(6);
                if (jsonData.trim() === '[DONE]') {
                    console.log("[接收流] 收到 [DONE] 标记。");
                    continue;
                }
                try {
                  const chunk = JSON.parse(jsonData);
                  let chunkText = '';
                  let chunkReasoning = ''; // 仅 DeepSeek 使用此字段

                  if (providerToUse === 'openai' || providerToUse === 'siliconflow') {
                    chunkText = chunk.choices?.[0]?.delta?.content || '';
                  } else if (providerToUse === 'deepseek') {
                    if (chunk.choices?.[0]?.delta?.reasoning_content) chunkReasoning = chunk.choices[0].delta.reasoning_content;
                    if (chunk.choices?.[0]?.delta?.content) chunkText = chunk.choices[0].delta.content;
                  } else if (providerToUse === 'anthropic') {
                    if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
                        chunkText = chunk.delta.text || '';
                    } else if (chunk.type === 'message_delta' && chunk.delta?.stop_reason) {
                        console.log("[接收流][Claude] Stop Reason:", chunk.delta.stop_reason);
                    }
                  }
                  // Gemini 不会走这个流式分支

                  if (currentConversationId === conversationIdAtRequestTime) {
                    if (chunkReasoning && messageDiv) { // 更新思考过程 (主要为DeepSeek)
                      // 使用 accumulatedThinkingForDisplay (之前是 messageDiv.dataset.thinking)
                      accumulatedThinkingForDisplay += chunkReasoning;

                      // 确保 DeepSeek 的思考过程 DOM 元素存在 (与Ollama类似逻辑)
                      if (!reasoningContentElement) {
                          reasoningBlockDiv = messageDiv.querySelector('.reasoning-block');
                          if (!reasoningBlockDiv) {
                              console.warn("[接收流][DeepSeek] reasoningBlockDiv 未找到，尝试动态创建。");
                              reasoningBlockDiv = document.createElement('div');
                              reasoningBlockDiv.className = 'reasoning-block';
                              const label = document.createElement('div');
                              label.className = 'reasoning-label';
                              label.textContent = '思考过程:';
                              reasoningBlockDiv.appendChild(label);
                              reasoningContentElement = document.createElement('div');
                              reasoningContentElement.className = 'reasoning-content';
                              reasoningBlockDiv.appendChild(reasoningContentElement);
                              messageDiv.insertBefore(reasoningBlockDiv, assistantTextElement || messageDiv.firstChild);
                          } else {
                              reasoningContentElement = reasoningBlockDiv.querySelector('.reasoning-content');
                          }
                      }
                      if (reasoningContentElement) {
                          reasoningContentElement.textContent = accumulatedThinkingForDisplay;
                      } else {
                          console.error("[接收流][DeepSeek] reasoningContentElement 仍然无法获取！");
                      }
                    }
                    if (chunkText && assistantTextElement) { // 更新主要回复内容
                      accumulatedAssistantReply += chunkText;
                      assistantTextElement.innerHTML = marked.parse(accumulatedAssistantReply);
                    }
                    if (chunkText || chunkReasoning) {
                        document.getElementById('messages').scrollTop = document.getElementById('messages').scrollHeight;
                    }
                  } else { // 用户已切换对话
                      if (chunkReasoning) accumulatedThinkingForDisplay += chunkReasoning; // 后台累积
                      if (chunkText) accumulatedAssistantReply += chunkText;
                  }
                } catch (e) { console.warn('[接收流] 解析SSE数据块失败:', jsonData, e); }
              }
            }
          }
        } // end while(true)

        // 流处理完成
        finalAssistantReply = accumulatedAssistantReply;
        // finalThinkingProcess 现在统一使用 accumulatedThinkingForDisplay
        finalThinkingProcess = accumulatedThinkingForDisplay.trim() ? accumulatedThinkingForDisplay.trim() : null;
        requestWasSuccessful = true;

      } catch (streamError) {
        console.error("[接收流] 处理流数据时发生错误:", streamError);
        finalAssistantReply = accumulatedAssistantReply + `\n[错误：流处理中断 - ${streamError.message}]`;
        finalThinkingProcess = accumulatedThinkingForDisplay.trim() ? accumulatedThinkingForDisplay.trim() : null; // 保存已累积的
        requestWasSuccessful = false;
        throw streamError;
      }
    } else { // Non-streaming response
      const data = await response.json();
      console.log(`----------- API 响应数据 (${providerToUse} - 非流式) -----------`, data);

      if (providerToUse === 'ollama') {
        if (data.message?.content) {
          finalAssistantReply = data.message.content;
          // 非流式Ollama，尝试从完整回复中提取思考过程 (如果标签存在)
          if (finalAssistantReply.includes("<think>") && finalAssistantReply.includes("</think>")) {
              // 这是一个简化的提取，可能不完美，但可以尝试
              const thinkStartIndex = finalAssistantReply.indexOf("<think>");
              const thinkEndIndex = finalAssistantReply.indexOf("</think>");
              if (thinkStartIndex < thinkEndIndex) {
                  finalThinkingProcess = finalAssistantReply.substring(thinkStartIndex + "<think>".length, thinkEndIndex).trim();
                  // 从 finalAssistantReply 中移除思考部分 (可选，看你是否希望它也出现在主回复区)
                  // finalAssistantReply = finalAssistantReply.substring(0, thinkStartIndex) + finalAssistantReply.substring(thinkEndIndex + "</think>".length);
                  // 为了简化，我们暂时让它保留在 finalAssistantReply 中，同时 finalThinkingProcess 也有值
                  console.log("[非流式][Ollama] 从完整回复中提取到思考过程。");
              }
          } else {
              finalThinkingProcess = null;
          }
        } else if (data.error && typeof data.error === 'string') {
          finalAssistantReply = `Ollama 错误: ${data.error}`;
          finalThinkingProcess = null;
        } else if (typeof data === 'string') {
            finalAssistantReply = `Ollama 错误: ${data}`;
            finalThinkingProcess = null;
        } else {
          finalAssistantReply = 'Ollama 返回了未知格式的非流式响应。';
          finalThinkingProcess = null;
        }
      } else if (providerToUse === 'gemini') {
        // ... (Gemini 非流式逻辑不变) ...
        if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
          finalAssistantReply = data.candidates[0].content.parts[0].text;
        } else if (data.promptFeedback?.blockReason) {
          finalAssistantReply = `请求被阻止：${data.promptFeedback.blockReason}`;
          if (data.promptFeedback.safetyRatings) finalAssistantReply += ` (Safety Ratings: ${JSON.stringify(data.promptFeedback.safetyRatings)})`;
        }
        finalThinkingProcess = null;
      } else if (providerToUse === 'anthropic' && !isActuallyStreaming) { // 确保是真正的非流式
        // ... (Anthropic 非流式逻辑不变) ...
        if (data.content?.[0]?.text) finalAssistantReply = data.content[0].text;
        finalThinkingProcess = null; // Anthropic Messages API 非流式不直接提供思考过程
      } else if (!isActuallyStreaming) { // OpenAI, Deepseek, SiliconFlow etc. non-streaming
        // ... (这些提供商的非流式逻辑不变) ...
        if (data.choices?.[0]?.message) {
            finalAssistantReply = data.choices[0].message.content || '（无回复）';
            if (data.choices[0].message.reasoning_content) { // DeepSeek
                finalThinkingProcess = data.choices[0].message.reasoning_content;
            } else {
                finalThinkingProcess = null;
            }
        } else {
            finalThinkingProcess = null;
        }
      }
      requestWasSuccessful = true;
    }

  } catch (error) { // 最外层 try...catch
    console.error(`[发送错误 Catch] 对话ID ${conversationIdAtRequestTime}:`, error);
    finalAssistantReply = error.message.startsWith('错误：') ? error.message : `错误：${error.message}`;
    finalThinkingProcess = finalThinkingProcess || null; // 保留可能已从流错误中累积的思考
    requestWasSuccessful = false;
  } finally { // --- 无论成功或失败，最终都会执行的清理和收尾工作 ---
    if (loadingDiv && loadingDiv.parentNode === document.getElementById('messages')) {
      loadingDiv.remove();
    }

    const assistantRoleToDisplay = (providerToUse === 'gemini') ? 'model' : 'assistant';

    // 如果请求未成功，或者响应不是预期的流式响应（或流式处理失败）
    if (!requestWasSuccessful || !isStreamingResponse) { // isStreamingResponse 是最初的判断
      if (currentConversationId === conversationIdAtRequestTime) {
        console.log(`[Finally] 调用 appendMessage (原因: ${!requestWasSuccessful ? '请求失败/错误' : '非流式响应或流式未按预期进行'})`);

        const messagesNode = document.getElementById('messages');
        if (messagesNode) {
            const lastMessageWrapper = messagesNode.lastElementChild;
            if (lastMessageWrapper &&
                lastMessageWrapper.classList.contains('assistant-message-wrapper') &&
                lastMessageWrapper.querySelector('.message.assistant')
            ) {
                const textElement = lastMessageWrapper.querySelector('.message.assistant .text');
                let isEmptyMessage = false;
                if (textElement) { // 检查 .text 是否真的没有内容 (包括空的 <p> 等)
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = textElement.innerHTML;
                    if (typeof pruneEmptyNodes === 'function') { // 确保 pruneEmptyNodes 可用
                        pruneEmptyNodes(tempDiv);
                    }
                    if (tempDiv.innerHTML.trim() === "") {
                        isEmptyMessage = true;
                    }
                } else { // 如果连 .text 元素都没有，那肯定是空的
                    isEmptyMessage = true;
                }

                // 只有当主要内容为空，且没有思考过程和模型注释时，才移除这个预先创建的空消息体
                const hasReasoningInDOM = lastMessageWrapper.querySelector('.reasoning-block .reasoning-content')?.textContent.trim() !== '';
                const hasModelNoteInDOM = lastMessageWrapper.querySelector('.model-note') !== null;

                if (isEmptyMessage && !hasReasoningInDOM && !hasModelNoteInDOM ) {
                    console.log("[Finally] 移除非流式/错误路径下，之前为流式append的完全空消息体。");
                    lastMessageWrapper.remove();
                }
            }
        }
        // 这里的 finalThinkingProcess 对于Ollama流错误，是已累积的部分
        appendMessage(assistantRoleToDisplay, finalAssistantReply, modelValueFromOption, finalThinkingProcess);
      }
    } else if (requestWasSuccessful && isStreamingResponse) { // 成功的流式输出
      console.log("[Finally] 流式处理成功完成。");
      if (currentConversationId === conversationIdAtRequestTime) {
        const messagesContainer = document.getElementById('messages');
        const allAssistantWrappers = messagesContainer.querySelectorAll('.assistant-message-wrapper');
        const existingMsgWrapper = allAssistantWrappers.length > 0 ? allAssistantWrappers[allAssistantWrappers.length - 1] : null;

        if (existingMsgWrapper) {
            const msgDiv = existingMsgWrapper.querySelector('.message.assistant');
            // 添加模型注释 (如果尚未添加)
            if (msgDiv && modelValueFromOption && !msgDiv.querySelector('.model-note')) {
                const note = document.createElement('div');
                note.className = 'model-note';
                let displayModelName = modelValueFromOption;
                const modelSelect = document.getElementById('model');
                if(modelSelect) {
                    const opt = modelSelect.querySelector(`option[value="${modelValueFromOption}"]`);
                    if(opt) displayModelName = opt.textContent;
                    else {
                        const parts = String(modelValueFromOption).split('::');
                        if (parts.length === 2) displayModelName = parts[1];
                    }
                }
                note.textContent = `模型：${displayModelName}`;
                msgDiv.appendChild(note);
            }
            // 对最终的流式内容（包括主回复和思考过程）进行 MathJax 渲染
            if (window.MathJax && MathJax.typesetPromise && msgDiv) {
                const elementsToTypeset = [];
                const textElementForMathJax = msgDiv.querySelector('.text');
                const reasoningElementForMathJax = msgDiv.querySelector('.reasoning-block .reasoning-content');

                if (textElementForMathJax && textElementForMathJax.textContent.trim() !== '') elementsToTypeset.push(textElementForMathJax);
                if (reasoningElementForMathJax && reasoningElementForMathJax.textContent.trim() !== '') elementsToTypeset.push(reasoningElementForMathJax);

                if (elementsToTypeset.length > 0) {
                    console.log("[Finally] 对流式生成的内容进行 MathJax 渲染。", elementsToTypeset);
                    MathJax.typesetPromise(elementsToTypeset).catch(err => console.error("MathJax final typeset failed:", err));
                }
            }
        }
      }
    }

    // 如果用户在请求期间切换了对话，而原始请求的回复现在才回来
    if (currentConversationId !== conversationIdAtRequestTime && (finalAssistantReply !== '（无回复）' || (finalThinkingProcess && finalThinkingProcess.trim() !== ''))) {
      console.log(`[发送完成] 用户已切换对话。回复/思考将保存到原始对话 ${conversationIdAtRequestTime}。`);
    }

    // 将助手回复（或错误）和思考过程保存到发起请求时的对话历史中
    const targetConversationForStorage = conversations.find(c => c.id === conversationIdAtRequestTime);
    if (targetConversationForStorage) {
        const assistantRoleForStorage = 'assistant';
        // 只有当有实际回复、思考过程或明确的错误信息时才保存
        if (finalAssistantReply !== '（无回复）' || (finalThinkingProcess && finalThinkingProcess.trim() !== '') || finalAssistantReply.startsWith('错误：')) {
            targetConversationForStorage.messages.push({
                role: assistantRoleForStorage,
                content: finalAssistantReply,
                model: modelValueFromOption,
                reasoning_content: finalThinkingProcess // 保存提取或获取的思考过程
            });
            saveConversations();
            // 如果回复成功且不是错误，并且用户已切换对话，可能需要更新对话列表
            if (currentConversationId !== conversationIdAtRequestTime && requestWasSuccessful && !finalAssistantReply.startsWith('错误：') ) {
                renderConversationList();
            }
        }
    } else {
        console.error(`[保存错误] 无法找到原始对话 ${conversationIdAtRequestTime} 来保存助手回复。`);
    }
  }
}
// 你可能在其他地方暴露它，例如: window.send = send;

window.send = send; // 暴露到全局，供HTML调用

/**
 * 显示设置区域，隐藏聊天区域。
 */
function showSettings() {
  document.getElementById('settings-area').style.display = 'flex';
  document.getElementById('chat-area').style.display = 'none';
  // 触发API提供商下拉列表的change事件，以确保API Key输入框状态正确 (如果相关逻辑保留)
  const providerSelect = document.getElementById('api-provider');
  if (providerSelect) { // 确保元素存在
    providerSelect.dispatchEvent(new Event('change'));
  }
}
window.showSettings = showSettings; // 暴露到全局

/**
 * 显示聊天区域，隐藏设置区域。
 * 如果当前没有活动对话，则加载一个或创建一个新对话。
 */
function showChatArea() {
    document.getElementById('settings-area').style.display = 'none';
    document.getElementById('chat-area').style.display = 'flex';
    // 如果没有当前对话ID
    if (!currentConversationId) {
        if (conversations.length > 0) {
            // 加载第一个未归档对话，或第一个对话（如果都是归档的）
            const firstNonArchived = conversations.filter(c => !c.archived)[0];
            loadConversation(firstNonArchived ? firstNonArchived.id : conversations[0].id);
        } else {
            // 没有对话存在，创建一个新的
            createNewConversation();
        }
    }
    // 如果有当前对话ID，则聊天区域已正确显示，无需额外操作
}


/**
 * 清除所有聊天历史记录。
 * 此操作会清空对话列表和 Local Storage 中的数据。
 */
function clearAllHistory() {
  if (confirm('确认清除所有历史吗？此操作无法恢复。')) {
    conversations = [];           // 清空内存中的对话数组
    currentConversationId = null; // 重置当前对话ID
    activeModel = '';             // 重置活动模型
    saveConversations();          // 从 Local Storage 中清除对话

    // 清理UI
    document.getElementById('messages').innerHTML = ''; // 清空消息显示区域
    document.getElementById('chat-title').textContent = '对话'; // 重置聊天标题
    renderConversationList();     // 渲染空的对话列表
    createNewConversation();      // 创建一个新的空对话并加载
  }
}
window.clearAllHistory = clearAllHistory; // 暴露到全局

/**
 * 将所有对话历史导出为 JSON 文件。
 */
function exportAllHistory() {
  const data = JSON.stringify(conversations, null, 2); // 格式化JSON以便阅读
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); // 创建一个隐藏的下载链接
  a.href = url;
  a.download = `chat_history_${new Date().toISOString().slice(0,10)}.json`; // 文件名格式：chat_history_YYYY-MM-DD.json
  document.body.appendChild(a);
  a.click(); // 触发下载
  document.body.removeChild(a); // 清理
  URL.revokeObjectURL(url);     // 释放对象URL
}
window.exportAllHistory = exportAllHistory; // 暴露到全局


/**
 * 应用指定的主题（亮色或暗色）到整个页面。
 * @param {string} theme - 'light' 或 'dark'。
 */
function applyTheme(theme) {
  if (theme === 'dark') {
    document.body.classList.add('dark-theme');
    document.body.classList.remove('light-theme');
  } else { // 默认为 light 主题
    document.body.classList.add('light-theme');
    document.body.classList.remove('dark-theme');
  }
  localStorage.setItem('theme', theme); // 保存主题偏好到 Local Storage
}

/**
 * 切换当前页面的主题（亮色/暗色）。
 */
function toggleTheme() {
  const newTheme = document.body.classList.contains('dark-theme') ? 'light' : 'dark';
  applyTheme(newTheme);
}

/**
 * 应用指定的 UI 缩放比例。
 * @param {number} scale - 缩放比例 (例如 1.0, 0.9)。
 * @param {HTMLElement} [optionsContainer] - (可选) 包含缩放选项按钮的容器，用于更新按钮的 'active' 状态。
 */
function applyUiScale(scale, optionsContainer) {
    document.documentElement.style.setProperty('--ui-scale', scale); // 通过CSS变量应用缩放
    localStorage.setItem('ui-scale', String(scale)); // 保存缩放偏好

    // 如果提供了选项容器，更新按钮的激活状态
    if (optionsContainer) {
        optionsContainer.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        const activeButton = optionsContainer.querySelector(`button[data-scale="${scale}"]`);
        if (activeButton) activeButton.classList.add('active');
    }
}

/**
 * 为当前聊天窗口的标题（通常是 H1 元素）启用行内编辑功能。
 * 点击标题时，会将其替换为一个输入框。
 */
function enableInlineTitleEdit() {
  const chatHeader = document.querySelector('.chat-header'); // 聊天头部的容器
  const titleElement = document.getElementById('chat-title');  // 标题 H1 元素
  if (!chatHeader || !titleElement) {
    console.warn("无法启用标题行内编辑：未找到 .chat-header 或 #chat-title 元素。");
    return;
  }

  // 移除旧的监听器以防重复绑定，然后设置鼠标指针并添加新的点击监听器
  titleElement.removeEventListener('click', handleTitleClick); // 先移除，避免重复绑定
  titleElement.style.cursor = 'pointer'; // 提示用户可点击
  titleElement.addEventListener('click', handleTitleClick); // 添加点击事件处理
}

/**
 * 处理聊天标题的点击事件，将其转换为一个输入框以供编辑。
 * `this` 指向被点击的标题元素 (H1)。
 */
function handleTitleClick() {
    const chatHeader = this.parentElement; // 标题元素的父容器 (.chat-header)
    const oldH1 = this;                    // 当前的 H1 标题元素
    const oldName = oldH1.textContent;     // 旧标题文本

    const input = document.createElement('input'); // 创建新的输入框
    input.id = 'chat-title-input'; // 与原 H1 的 ID 类似，但用于输入框
    input.type = 'text';
    input.value = oldName; // 预填旧标题

    chatHeader.replaceChild(input, oldH1); // 用输入框替换 H1 元素
    input.focus(); // 自动聚焦到输入框
    input.setSelectionRange(oldName.length, oldName.length); // 将光标置于文本末尾

    // 提交编辑的函数
    function commitEdit() {
      const newName = input.value.trim() || oldName; // 获取新标题，如果为空则恢复旧标题
      const conv = getCurrentConversation(); // 获取当前对话对象
      if (conv && conv.title !== newName) { // 如果标题有变化
        conv.title = newName;
        saveConversations();      // 保存更改
        renderConversationList(); // 更新左侧对话列表
      }

      // 将输入框替换回 H1 元素
      const newH1 = document.createElement('h1');
      newH1.id = 'chat-title'; // 恢复原 ID
      newH1.textContent = newName;
      // 确保替换的是正确的 input 元素，以防 commitEdit 被多次调用或异步问题
      if (input.parentElement === chatHeader) {
        chatHeader.replaceChild(newH1, input);
      } else if (document.getElementById('chat-title-input')) {
         // 如果 input 还在文档中但父元素不对，尝试找到并替换
         const currentInput = document.getElementById('chat-title-input');
         if(currentInput && currentInput.parentElement) {
            currentInput.parentElement.replaceChild(newH1, currentInput);
         }
      }
      enableInlineTitleEdit(); // 为新的 H1 元素重新启用编辑功能
    }

    // 当输入框失去焦点时，提交编辑
    input.addEventListener('blur', commitEdit);
    // 处理键盘事件：Enter 提交，Escape 取消
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault(); // 防止表单提交（如果输入框在表单内）
        commitEdit();
      } else if (e.key === 'Escape') {
        // 取消编辑，恢复旧的 H1 元素
        const restoredH1 = document.createElement('h1');
        restoredH1.id = 'chat-title';
        restoredH1.textContent = oldName;
        if (input.parentElement === chatHeader) {
            chatHeader.replaceChild(restoredH1, input);
        }
        enableInlineTitleEdit(); // 重新启用编辑功能
      }
    });
}

/**
 * 从给定的文本块中提取被特定标签包裹的“思考”部分和其余的“回复”部分。
 * @param {string} textChunk - 当前收到的文本块。
 * @param {string} startTag - 思考过程的开始标签 (例如 "<think>")。
 * @param {string} endTag - 思考过程的结束标签 (例如 "</think>")。
 * @param {boolean} currentlyInThinkingBlock - 一个状态变量，指示上一个块是否以未闭合的 startTag 结束。
 * @returns {{replyTextPortion: string, thinkingTextPortion: string, newThinkingBlockState: boolean}}
 */
function extractThinkingAndReply(textChunk, startTag, endTag, currentlyInThinkingBlock) {
    let replyTextPortion = "";
    let thinkingTextPortion = "";
    let newThinkingBlockState = currentlyInThinkingBlock;
    let remainingText = textChunk;

    while (remainingText.length > 0) {
        if (newThinkingBlockState) { // 当前在思考块内部
            const endTagIndex = remainingText.indexOf(endTag);
            if (endTagIndex !== -1) { // 找到了结束标签
                thinkingTextPortion += remainingText.substring(0, endTagIndex);
                remainingText = remainingText.substring(endTagIndex + endTag.length);
                newThinkingBlockState = false; // 退出思考块
            } else { // 未找到结束标签，整个剩余部分都是思考内容
                thinkingTextPortion += remainingText;
                remainingText = "";
                // newThinkingBlockState 保持 true
            }
        } else { // 当前不在思考块内部
            const startTagIndex = remainingText.indexOf(startTag);
            if (startTagIndex !== -1) { // 找到了开始标签
                replyTextPortion += remainingText.substring(0, startTagIndex);
                remainingText = remainingText.substring(startTagIndex + startTag.length);
                newThinkingBlockState = true; // 进入思考块

                // 检查是否是空思考块或标签紧挨着
                if (remainingText.startsWith(endTag)) {
                    // thinkingTextPortion 不变 (为空)
                    remainingText = remainingText.substring(endTag.length);
                    newThinkingBlockState = false; // 立刻退出
                }
            } else { // 未找到开始标签，整个剩余部分都是回复内容
                replyTextPortion += remainingText;
                remainingText = "";
                // newThinkingBlockState 保持 false
            }
        }
    }
    return { replyTextPortion, thinkingTextPortion, newThinkingBlockState };
}


// --- DOMContentLoaded: 页面加载完成后的主要设置和初始化 ---
document.addEventListener('DOMContentLoaded', () => {
  // 1. 主题初始化
  // 从 Local Storage 读取保存的主题偏好，默认为 'dark'
  const storedTheme = localStorage.getItem('theme') || 'dark';
  applyTheme(storedTheme);
  const toggleThemeBtn = document.getElementById('toggle-theme-btn');
  if (toggleThemeBtn) {
    toggleThemeBtn.addEventListener('click', toggleTheme);
  } else {
    console.warn("切换主题按钮 'toggle-theme-btn' 未在HTML中找到。");
  }

  // 2. UI 缩放初始化
  const uiScaleOptions = document.getElementById('ui-scale-options');
  if (uiScaleOptions) {
    // 从 Local Storage 读取保存的缩放偏好，默认为 1.0
    const savedScale = parseFloat(localStorage.getItem('ui-scale')) || 1.0;
    applyUiScale(savedScale, uiScaleOptions); // 应用保存的或默认的缩放，并更新按钮状态
    // 为缩放选项按钮容器添加事件委托
    uiScaleOptions.addEventListener('click', e => {
      const btn = e.target.closest('button[data-scale]'); // 查找被点击的缩放按钮
      if (btn) {
        applyUiScale(parseFloat(btn.dataset.scale), uiScaleOptions);
      }
    });
  } else {
    console.warn("UI 缩放选项容器 'ui-scale-options' 未在HTML中找到。");
  }

  // --- 3. API Key 管理 ---
  // 此部分前端逻辑已移除。API Keys 现在应通过后端代理（如Netlify Functions）和环境变量进行管理。
  // HTML中相关的输入框和按钮（如 'api-provider', 'api-key-input', 'save-api-key-btn'）
  // 如果仍然存在，其功能不再由此脚本控制。
  console.info("前端 API Key 管理逻辑已移除。API Keys 应通过后端代理和环境变量进行管理。");
  const providerSelect = document.getElementById('api-provider');
  if(providerSelect){
      // 可以选择禁用此下拉列表，或仅移除其功能性事件监听器
      // providerSelect.disabled = true; // 例如，如果不再需要用户选择
      // (当前代码没有主动绑定事件到 providerSelect 来加载 key，所以仅作记录)
  }


  // --- 4. Temperature (模型温度) 设置初始化和事件处理 ---
  const temperatureSlider = document.getElementById('temperature-slider');
  const temperatureValueDisplay = document.getElementById('temperature-value');
  const defaultTemperature = 0.7; // 默认温度值

  if (temperatureSlider && temperatureValueDisplay) {
    // 从 Local Storage 读取保存的温度值
    let currentTemp = parseFloat(localStorage.getItem('model-temperature'));
    // 校验读取的值，如果无效或超出范围，则使用默认值
    if (isNaN(currentTemp) || currentTemp < 0 || currentTemp > 2) { // 假设温度范围是 0 到 2
      currentTemp = defaultTemperature;
    }
    temperatureSlider.value = currentTemp; // 设置滑块的初始位置
    temperatureValueDisplay.textContent = currentTemp.toFixed(1); // 显示初始温度值 (保留一位小数)

    // 当滑块值改变时，更新显示和 Local Storage
    temperatureSlider.addEventListener('input', () => {
      const newTemp = parseFloat(temperatureSlider.value);
      temperatureValueDisplay.textContent = newTemp.toFixed(1);
      localStorage.setItem('model-temperature', newTemp.toString());
      console.log(`[Temperature] 模型温度设置已更新为: ${newTemp}`);
    });
  } else {
    console.warn("Temperature 控制元素 ('temperature-slider' 或 'temperature-value') 未在HTML中找到。");
  }

  // --- 5. Textarea (用户输入框) 自动调整高度 ---
  const promptTextarea = document.getElementById('prompt');
  if (promptTextarea) {
    // 获取CSS中定义的min-height和max-height，或使用默认值
    const initialMinHeight = parseInt(window.getComputedStyle(promptTextarea).minHeight, 10) || 42; // 默认42px
    const maxHeight = parseInt(window.getComputedStyle(promptTextarea).maxHeight, 10) || 200; // 默认200px

    // 设置初始高度为min-height，并隐藏滚动条（除非内容超出max-height）
    promptTextarea.style.height = `${initialMinHeight}px`;
    promptTextarea.style.overflowY = 'hidden';

    // 定义自动调整高度的函数
    const autoResizeTextarea = () => {
      // 先将高度重置为最小高度，这样 scrollHeight 才能正确计算实际内容所需高度
      promptTextarea.style.height = `${initialMinHeight}px`;
      let scrollHeight = promptTextarea.scrollHeight; // 获取内容所需的完整高度
      let newHeight = scrollHeight;

      // 确保新高度不小于最小高度
      if (newHeight < initialMinHeight) {
        newHeight = initialMinHeight;
      }

      // 如果新高度超过最大高度，则限制为最大高度并显示滚动条
      if (newHeight > maxHeight) {
        newHeight = maxHeight;
        promptTextarea.style.overflowY = 'auto'; // 显示垂直滚动条
      } else {
        promptTextarea.style.overflowY = 'hidden'; // 隐藏滚动条
      }
      promptTextarea.style.height = `${newHeight}px`; // 应用计算出的新高度
    };

    promptTextarea.addEventListener('input', autoResizeTextarea); // 每次输入时调整
    promptTextarea.addEventListener('paste', () => { // 粘贴内容后也需要调整
        // 使用 setTimeout 确保粘贴操作完成后 DOM 更新完毕再执行调整
        setTimeout(autoResizeTextarea, 0);
    });
    // 如果 textarea 可能有默认值或从 localStorage 加载内容，可以在页面加载时调用一次
    // autoResizeTextarea();
  } else {
    console.warn("用户输入框 'prompt' 未在HTML中找到。自动调整高度功能将不可用。");
  }

  // --- 6. 对话和聊天区域初始化 ---
  loadConversations();    // 从 Local Storage 加载历史对话
  renderConversationList(); // 渲染左侧对话列表 (此函数内部会调用 enableConversationDrag)

  // 初始化聊天界面：加载第一个对话或创建新对话
  const nonArchivedConversations = conversations.filter(c => !c.archived);
  if (nonArchivedConversations.length > 0) {
    loadConversation(nonArchivedConversations[0].id); // 加载第一个未归档的对话
  } else if (conversations.length > 0) { // 如果只有归档的对话
    loadConversation(conversations[0].id); // 加载第一个（已归档的）对话
  } else { // 如果没有任何对话
    createNewConversation(); // 创建一个新对话
  }
  enableInlineTitleEdit(); // 为初始加载的对话标题启用行内编辑

  // --- 7. 主要按钮和控件的事件监听器 ---
  const sendBtn = document.getElementById('send-btn');
  if (sendBtn) {
    sendBtn.addEventListener('click', e => {
      e.preventDefault(); // 如果发送按钮是 <button type="submit">，则阻止表单默认提交行为
      send(); // 调用发送函数
    });
  } else {
    console.warn("发送按钮 'send-btn' 未在HTML中找到。");
  }

  // 用户输入框 'prompt' 的 Enter键 发送消息的监听器
  // (如果 promptTextarea 在上面已找到并初始化)
  if (promptTextarea && !promptTextarea.dataset.keydownBound) { // 使用 dataset 属性防止重复绑定
    promptTextarea.addEventListener('keydown', e => {
      // Shift + Enter 用于换行，单独 Enter 用于发送
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault(); // 阻止 Enter 键的默认行为（如换行）
        send(); // 调用发送函数
      }
    });
    promptTextarea.dataset.keydownBound = 'true'; // 标记已绑定
  }


  const newConvBtn = document.getElementById('new-conv-btn');
  if (newConvBtn) {
    newConvBtn.addEventListener('click', createNewConversation);
  } else {
    console.warn("新建对话按钮 'new-conv-btn' 未在HTML中找到。");
  }

  const archiveCurrentBtn = document.getElementById('archive-current-btn');
  if (archiveCurrentBtn) {
    archiveCurrentBtn.addEventListener('click', () => {
      if (currentConversationId) { // 确保有当前对话
        toggleArchive(currentConversationId); // 切换当前对话的归档状态
      }
    });
  } else {
    console.warn("归档当前对话按钮 'archive-current-btn' 未在HTML中找到。");
  }

  const deleteCurrentBtn = document.getElementById('delete-current-btn');
  if (deleteCurrentBtn) {
    deleteCurrentBtn.addEventListener('click', () => {
      if (!currentConversationId) return; // 没有当前对话，不执行操作
      const conv = getCurrentConversation();
      if (conv && confirm(`确定要删除当前会话「${conv.title}」吗？此操作无法恢复。`)) {
        deleteConversation(currentConversationId); // 删除当前对话
      }
    });
  } else {
    console.warn("删除当前对话按钮 'delete-current-btn' 未在HTML中找到。");
  }

  const modelSelect = document.getElementById('model');
  if (modelSelect) {
    // 当模型选择变化时，更新当前对话的 model 属性并保存
    modelSelect.addEventListener('change', (e) => {
      const conv = getCurrentConversation();
      if (conv) {
        conv.model = e.target.value; // 更新对话数据中的模型
        // activeModel 变量似乎主要在加载对话时设置，此处更改对话模型后，
        // activeModel 会在下次加载此对话时同步。如果需要立即同步，可以取消下一行注释。
        // activeModel = conv.model;
        saveConversations(); // 保存更改
      }
    });
  } else {
    console.warn("模型选择下拉框 'model' 未在HTML中找到。");
  }

  const showSettingsBtn = document.getElementById('show-settings-btn');
  if (showSettingsBtn) {
    showSettingsBtn.addEventListener('click', showSettings);
  } else {
    console.warn("显示设置按钮 'show-settings-btn' 未在HTML中找到。");
  }

  const backToChatBtn = document.getElementById('back-to-chat-btn');
  if (backToChatBtn) {
    backToChatBtn.addEventListener('click', showChatArea);
  } else {
    console.warn("返回聊天按钮 'back-to-chat-btn' 未在HTML中找到。");
  }

  const exportHistoryBtn = document.getElementById('export-history-btn');
  if (exportHistoryBtn) {
    exportHistoryBtn.addEventListener('click', exportAllHistory);
  } else {
    console.warn("导出历史按钮 'export-history-btn' 未在HTML中找到。");
  }

  const clearAllHistoryBtn = document.getElementById('clear-all-history-btn');
  if (clearAllHistoryBtn) {
    clearAllHistoryBtn.addEventListener('click', clearAllHistory);
  } else {
    console.warn("清除所有历史按钮 'clear-all-history-btn' 未在HTML中找到。");
  }

  // --- 文件导入功能 ---
  const importFileInput = document.getElementById('import-file');
  if (importFileInput) {
    importFileInput.addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) return; // 没有选择文件

      try {
        const text = await file.text(); // 读取文件内容为文本
        const importedConvs = JSON.parse(text); // 解析JSON
        if (!Array.isArray(importedConvs)) { // 校验顶层是否为数组
          throw new Error('导入的 JSON 顶层必须是一个对话数组');
        }

        let importedCount = 0; // 记录成功导入的新对话数量
        importedConvs.forEach(importedConv => {
          // 对每个导入的对话进行校验和处理
          if (importedConv && typeof importedConv === 'object' && 'id' in importedConv && 'title' in importedConv && 'messages' in importedConv) {
            // 检查ID是否已存在，避免重复导入
            if (!conversations.find(c => c.id === importedConv.id)) {
              // 规范化导入对话的 messages 数组
              importedConv.messages = (Array.isArray(importedConv.messages) ? importedConv.messages : [])
                .filter(m => m && m.role && typeof m.content === 'string'); // 过滤无效消息

              // 设置默认值或规范化其他字段
              importedConv.archived = typeof importedConv.archived === 'boolean' ? importedConv.archived : false;
              importedConv.isNew = false; // 导入的对话不标记为新创建
              // 确保导入的对话有 model 字段，或设为默认值
              importedConv.model = importedConv.model || getCurrentModel();
              // 确保导入的对话也有 reasoning_content 字段（如果适用），或者设为 null/undefined
              // (如果 messages 里的对象需要此字段，也应在此处或filter中处理)

              conversations.push(importedConv); // 添加到当前对话列表
              importedCount++;
            } else {
              console.log(`跳过导入已存在的对话ID: ${importedConv.id}`);
            }
          } else {
            console.warn('导入过程中跳过无效的对话对象:', importedConv);
          }
        });

        if (importedCount > 0) {
          saveConversations();      // 保存合并后的对话列表
          renderConversationList(); // 重新渲染对话列表
          // 如果导入前没有当前对话，则加载一个（通常是第一个未归档的）
          if (currentConversationId === null && conversations.length > 0) {
             const firstNonArchived = conversations.filter(c=>!c.archived)[0];
             loadConversation(firstNonArchived ? firstNonArchived.id : conversations[0].id);
          }
          alert(`成功导入 ${importedCount} 条新对话。`);
        } else {
          alert('没有导入新的对话（可能所有对话ID已存在或文件格式无效）。');
        }
      } catch (err) {
        console.error('导入历史文件失败:', err);
        alert('导入失败：' + err.message);
      } finally {
        importFileInput.value = ''; // 清空文件输入框，以便可以再次选择同一个文件
      }
    });
  } else {
    console.warn("文件导入输入框 'import-file' 未在HTML中找到。");
  }
}); // DOMContentLoaded 事件监听器结束

// --- END OF FILE script.js ---