// --- START OF FILE script.js ---

// ——— 顶部：针对 marked & MathJax 的配置 ———
// 1. 关闭 marked 的 sanitize（保留所有反斜杠），启用 GitHub 风格
// (此注释表明 marked.js 库的配置可能在外部进行，或者这是一个预期配置的占位说明。
//  如果 marked.js 的 sanitize 功能被禁用，请确保输入内容是可信的，或者有其他机制来防止 XSS 攻击。)

// 全局变量
let activeModel = ''; // 存储当前加载对话时，该对话所使用的模型ID
let conversations = []; // 存储所有对话对象的数组
let currentConversationId = null; // 当前正在查看或操作的对话的ID
let modelConfigData = null; // 用于存储从 models.json 加载的原始模型配置
let editableModelConfig = null; // 用于在管理界面编辑的模型配置的深拷贝
let isModelManagementActive = false
let uploadedFilesData = []; // 用于存储已选择文件的相关数据 (例如 base64, name, type)
let filePreviewArea = null;
let modelManagementArea = null;
let modelListEditor = null;
let modelFormModal = null;
let modelForm = null;
let sidebarElement = null; // 如果您在 show...Area 函数中用到它
let modelFormTitle = null;
let temperatureSliderInline = null;
let temperatureInputInline = null;
let inlineChatSettingsPanel = null;
let chatSettingsBtnInlineElement = null; // 用于 document click 事件

let _internalUploadedFilesData = []; // 使用带下划线的内部变量
Object.defineProperty(window, 'uploadedFilesData', {
  configurable: true,
  enumerable: true,
  get: function() {
    console.log('DEBUG_WATCH: GETTING window.uploadedFilesData. Length:', _internalUploadedFilesData.length);
    return _internalUploadedFilesData;
  },
  set: function(newValue) {
    console.groupCollapsed(`DEBUG_WATCH: SETTING window.uploadedFilesData`);
    console.log('Old internal value (length):', _internalUploadedFilesData ? _internalUploadedFilesData.length : 'undefined');
    console.log('New value being set (is array, length):', Array.isArray(newValue), newValue ? newValue.length : 'undefined');
    try { throw new Error("Call stack for setter"); } catch (e) { console.log("Set from:\n" + e.stack.split('\n').slice(2, 7).join('\n')); } // 打印更长的调用栈
    console.groupEnd();

    if (Array.isArray(newValue) && newValue.length === 0 && _internalUploadedFilesData && _internalUploadedFilesData.length > 0) {
        console.error('CRITICAL_WATCH: window.uploadedFilesData is being set to an EMPTY ARRAY [] when it previously had data!');
        debugger; // 可以在这里打断点
    }
    _internalUploadedFilesData = newValue;
  }
});

window.uploadedFilesData = []; // 通过 setter 初始化，触发第一次 WATCH log


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
    ollama: 'ollama-settings' 
  }[provider];
}

async function handleFileSelection(event) {
  console.log("DEBUG: handleFileSelection function initiated."); // 日志文本已更正
  console.log("DEBUG handleFileSelection START: Raw window.uploadedFilesData is:", JSON.parse(JSON.stringify(window.uploadedFilesData))); // 日志文本已更正

  const files = event.target.files;
  const fileInputSource = event.target; // 保存对触发事件的 input 的引用

  if (!files || files.length === 0) {
    console.log("DEBUG: handleFileSelection - No files selected or files list is empty.");
    return;
  }
  console.log(`DEBUG: handleFileSelection - ${files.length} file(s) selected initially.`);

  const MAX_FILES = 5;
  // 使用 window.uploadedFilesData 保证通过 getter/setter
  if (window.uploadedFilesData.length + files.length > MAX_FILES) {
    alert(`一次最多只能上传 ${MAX_FILES} 个文件。`);
    // 即使超出数量，也清空一下 input，以便用户可以重新选择
    if (fileInputSource) {
        const inputToClear = fileInputSource;
        setTimeout(() => {
            console.log("Delayed clear (MAX_FILES): Setting input value to null for:", inputToClear);
            inputToClear.value = null;
        }, 0);
    }
    return;
  }

  let filesProcessedCount = 0; // 初始化计数器
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    console.log(`DEBUG: handleFileSelection - Processing file ${i + 1}: ${file.name}, Size: ${file.size}, Type: ${file.type}`);
    const MAX_SIZE_MB = 10;
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      alert(`文件 "${file.name}" 过大 (超过 ${MAX_SIZE_MB}MB)。`);
      continue; // 跳过此文件，继续处理下一个
    }

    try {
      console.log(`DEBUG: handleFileSelection - Attempting to read file: ${file.name}`);
      const base64String = await readFileAsBase64(file); // 调用全局 readFileAsBase64

      // 使用 window.uploadedFilesData.push 以确保通过 getter/setter
      window.uploadedFilesData.push({
        name: file.name,
        type: file.type,
        base64: base64String,
        fileObject: file
      });
      filesProcessedCount++; // <--- 正确增加计数器

      console.log(`DEBUG: handleFileSelection - File ADDED to uploadedFilesData: ${file.name}. Current count: ${window.uploadedFilesData.length}`);
    } catch (error) {
      console.error(`读取文件 "${file.name}" 失败:`, error);
      alert(`无法读取文件 "${file.name}"。`);
      // 即使读取失败，也应该 continue 到下一个文件
    }
  }
  // filesProcessedCount 现在会正确显示处理（尝试推送）的文件数量
  console.log(`DEBUG: handleFileSelection - Finished processing loop. ${filesProcessedCount} of ${files.length} files were attempted to be pushed.`);

  console.log("DEBUG: handleFileSelection - Calling renderFilePreview(). Current uploadedFilesData length:", window.uploadedFilesData.length);
  renderFilePreview(); // 调用全局 renderFilePreview

  // 在函数末尾打印数据状态 (在异步清空 input.value 之前)
  console.log("DEBUG handleFileSelection END (before async input clear): _internalUploadedFilesData is:", JSON.parse(JSON.stringify(_internalUploadedFilesData)));
  console.log("DEBUG handleFileSelection END (before async input clear): window.uploadedFilesData (via getter) is:", JSON.parse(JSON.stringify(window.uploadedFilesData)));

  // 方案1：使用 setTimeout 将清空操作推迟到下一个事件循环
  if (fileInputSource) {
    const inputToClear = fileInputSource; // 在闭包中捕获当前的 input 引用
    setTimeout(() => {
      console.log("Delayed clear: Setting input value to null for:", inputToClear.id || "input without id");
      inputToClear.value = null;
    }, 0); // 0ms 的 timeout 会将其放入宏任务队列
  }
}

function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = (error) => reject(error);
        reader.readAsDataURL(file);
    });
}

function renderFilePreview() {
    // 打印内部数据状态，确认数据在函数开始时是存在的
    console.log("DEBUG renderFilePreview START: _internalUploadedFilesData at start:", JSON.parse(JSON.stringify(_internalUploadedFilesData)));
    console.log("DEBUG renderFilePreview START: window.uploadedFilesData (getter) at start, length:", window.uploadedFilesData ? window.uploadedFilesData.length : 'undefined');

    // 1. 确认 filePreviewArea DOM 元素是否正确获取
    if (!filePreviewArea) {
        console.warn("renderFilePreview: CRITICAL - filePreviewArea DOM element is NULL or UNDEFINED. Cannot render previews.");
        return;
    }
    filePreviewArea.innerHTML = '';

    if (window.uploadedFilesData && window.uploadedFilesData.length > 0) {
        filePreviewArea.style.display = 'flex';

        window.uploadedFilesData.forEach((fileData, index) => {
            const previewItem = document.createElement('div');
            previewItem.className = 'file-preview-item-sleek'; // 使用这个类名
            previewItem.title = fileData.name;

            const fileNameDiv = document.createElement('div');
            fileNameDiv.className = 'file-name-sleek'; // 使用这个类名
            fileNameDiv.textContent = fileData.name; // CSS 处理溢出
            previewItem.appendChild(fileNameDiv);

            const removeBtn = document.createElement('button');
            removeBtn.className = 'remove-file-btn-sleek'; // 使用这个类名
            removeBtn.innerHTML = '×';
            removeBtn.title = `移除 ${fileData.name}`;
            removeBtn.type = 'button';
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                removeUploadedFile(index);
            });
            previewItem.appendChild(removeBtn);

            filePreviewArea.appendChild(previewItem);
        });
    } else {
        filePreviewArea.style.display = 'none';
    }

    // 打印内部数据状态，确认数据在函数结束时没有被意外修改
    // console.log("DEBUG renderFilePreview END: _internalUploadedFilesData at end:", JSON.parse(JSON.stringify(_internalUploadedFilesData)));
    // console.log("DEBUG renderFilePreview END: window.uploadedFilesData (getter) at end, length:", window.uploadedFilesData ? window.uploadedFilesData.length : 'undefined');
}

function removeUploadedFile(indexToRemove) {
    console.log(`[removeUploadedFile] CALLED. Attempting to remove file at index: ${indexToRemove}`);
    // 始终通过 window.uploadedFilesData 来访问和操作，以确保触发 getter/setter (如果setter有额外逻辑)
    // 或者至少确保操作的是正确的全局代理数组。
    // splice 方法会直接修改 _internalUploadedFilesData 数组，这是可以的，
    // 因为 Object.defineProperty 的 getter 返回的就是对 _internalUploadedFilesData 的引用。
    console.log("[removeUploadedFile] window.uploadedFilesData BEFORE splice:", JSON.parse(JSON.stringify(window.uploadedFilesData)));

    if (indexToRemove >= 0 && indexToRemove < window.uploadedFilesData.length) {
        // 直接对 window.uploadedFilesData (即其背后的 _internalUploadedFilesData) 进行 splice 操作
        const removedFileArray = window.uploadedFilesData.splice(indexToRemove, 1); // splice 会修改原数组并返回被删除的元素数组
        
        if (removedFileArray.length > 0) {
            console.log(`[removeUploadedFile] File "${removedFileArray[0].name}" removed successfully.`);
        } else {
            console.warn("[removeUploadedFile] Splice operation did not seem to remove any element, though index was valid.");
        }
        
        console.log("[removeUploadedFile] window.uploadedFilesData AFTER splice:", JSON.parse(JSON.stringify(window.uploadedFilesData)));

        // ★★★ 关键：在数据修改后，必须调用 renderFilePreview() 来更新UI ★★★
        if (typeof renderFilePreview === 'function') {
            renderFilePreview();
            console.log("[removeUploadedFile] Called renderFilePreview() to update UI.");
        } else {
            console.error("[removeUploadedFile] CRITICAL - renderFilePreview function is not defined!");
        }
    } else {
        console.warn(`[removeUploadedFile] Invalid index or array already empty. Index: ${indexToRemove}, Current Length: ${window.uploadedFilesData.length}`);
    }
}



function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

function appendMessage(role, messageContent, modelForNote, reasoningText) {
    console.log(`[AppendMessage CALLED] Role: "${role}"`, "Content received:", messageContent, "ModelNote:", modelForNote, "Reasoning provided:", typeof reasoningText);

    const emptyChatPlaceholder = document.getElementById('empty-chat-placeholder');
    if (emptyChatPlaceholder && emptyChatPlaceholder.style.display !== 'none') {
        emptyChatPlaceholder.style.display = 'none';
    }

    const container = document.getElementById('messages');
    if (!container) {
        console.error("[AppendMessage] CRITICAL: Message container '#messages' not found.");
        return null;
    }

    const messageWrapperDiv = document.createElement('div');
    messageWrapperDiv.className = 'message-wrapper';
    messageWrapperDiv.classList.add(role === 'user' ? 'user-message-wrapper' : 'assistant-message-wrapper');

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role === 'assistant' || role === 'model' ? 'assistant' : 'user'}`;

    let reasoningContentElementForMathJax = null; // 用于 MathJax

    // --- 1. 处理并添加思考过程的 DOM 结构 ---
    
    // 并且角色是助手或模型时，才创建思考过程的 DOM 结构。
    // 只要 reasoningText 被定义 (即使是空字符串，表示需要占位符)，并且是助手/模型角色
    if (typeof reasoningText === 'string' && (role === 'assistant' || role === 'model')) {
        const reasoningBlockDiv = document.createElement('div');
        reasoningBlockDiv.className = 'reasoning-block';

        if (reasoningText.trim() === '') {
        reasoningBlockDiv.classList.add('reasoning-block-empty');
    }

    const label = document.createElement('div');
    label.className = 'reasoning-label';
    label.textContent = '思考过程:';
    reasoningBlockDiv.appendChild(label);

    reasoningContentElementForMathJax = document.createElement('div');
    reasoningContentElementForMathJax.className = 'reasoning-content';
    reasoningContentElementForMathJax.textContent = reasoningText;
    reasoningBlockDiv.appendChild(reasoningContentElementForMathJax);

    messageDiv.appendChild(reasoningBlockDiv);
}


    // --- 2. 处理主要内容 (文本和文件信息) ---
    let textPart = '';
    let filesInfoPart = '';

    if (typeof messageContent === 'string') {
        textPart = messageContent;
    } else if (messageContent && typeof messageContent === 'object') {
        if (typeof messageContent.text === 'string') {
            textPart = messageContent.text;
        }
        if (role === 'user' && Array.isArray(messageContent.files) && messageContent.files.length > 0) {
            const fileNames = messageContent.files.map(f => f.name).join(', ');
            filesInfoPart = `[已附带文件: ${fileNames}]`;
        } else if (role !== 'user') {
            if (messageContent.toString() === '[object Object]' && Object.keys(messageContent).length > 0) {
                console.warn(`[AppendMessage] Assistant message content is an unexpected object for role '${role}'. Displaying as empty. Content:`, messageContent);
                textPart = "";
            } else {
                textPart = String(messageContent || '');
            }
        }
    } else if (messageContent !== null && messageContent !== undefined) {
        textPart = String(messageContent);
    }

    let markdownInput = textPart.trim();
    if (filesInfoPart) {
        if (markdownInput) {
            markdownInput += "\n" + filesInfoPart;
        } else {
            markdownInput = filesInfoPart;
        }
    }

    // --- 创建并填充 .text div ---
    const contentDiv = document.createElement('div');
    contentDiv.className = 'text';

    // 只有当 markdownInput (trim后) 非空，或者它是助手消息的占位符时，才进行 Markdown 解析
    // 或者如果已经有思考过程块了，也确保 .text div 被添加到 DOM（即使为空）
    if (markdownInput.trim() !== '' || ((role === 'assistant' || role === 'model') && (reasoningContentElementForMathJax || !reasoningText) )) {
        contentDiv.innerHTML = (typeof marked !== 'undefined') ? marked.parse(markdownInput) : escapeHtml(markdownInput);
    }
    messageDiv.appendChild(contentDiv);


    // --- 为 <pre> 标签添加复制按钮 ---
    if (messageDiv.contains(contentDiv)) {
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
    }

    // --- 清理空节点 ---
    if (typeof pruneEmptyNodes === 'function' && messageDiv.contains(contentDiv)) {
        pruneEmptyNodes(contentDiv); // 清理主要内容区域
    }
    if (typeof pruneEmptyNodes === 'function' && reasoningContentElementForMathJax && messageDiv.contains(reasoningContentElementForMathJax)) {
        pruneEmptyNodes(reasoningContentElementForMathJax); // 清理思考过程区域 (如果它是空的)
    }


    // --- 3. 添加模型注释 ---
    if ((role === 'assistant' || role === 'model') && modelForNote) {
        const note = document.createElement('div');
        note.className = 'model-note';
        let displayModelName = modelForNote;
        const modelSelectElement = document.getElementById('model');
        if (modelSelectElement) {
            const selectedOption = modelSelectElement.querySelector(`option[value="${modelForNote}"]`);
            if (selectedOption) {
                displayModelName = selectedOption.textContent;
            } else {
                const parts = String(modelForNote).split('::');
                if (parts.length === 2) displayModelName = parts[1];
            }
        }
        note.textContent = `模型：${displayModelName}`;
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
            console.error('无法删除消息：缺少对话ID或消息索引。Dataset:', messageWrapperDiv.dataset);
        }
    });

    // --- 5. 根据角色决定按钮和气泡在包裹层中的顺序 ---
    if (role === 'user') {
        messageWrapperDiv.appendChild(deleteMsgBtn);
        messageWrapperDiv.appendChild(messageDiv);
    } else { // 'assistant' or 'model'
        messageWrapperDiv.appendChild(messageDiv);
        messageWrapperDiv.appendChild(deleteMsgBtn);
    }

    // --- 6. 将整个消息包裹层添加到消息容器中 ---
    if (messageDiv.hasChildNodes() || role === 'user') {
        container.appendChild(messageWrapperDiv);
    } else {
        console.warn("[AppendMessage] messageDiv has no children and is not user role. Not appending wrapper. This is unexpected.", "Role:", role);
        return null;
    }

    // --- 滚动和 MathJax ---
    if (container.contains(messageWrapperDiv)) {
        container.scrollTop = container.scrollHeight;
    }

    if (window.MathJax && MathJax.typesetPromise) {
        const elementsToTypeset = [];
        const currentContentDivInMsg = messageDiv.querySelector('.text');
        if (currentContentDivInMsg && currentContentDivInMsg.innerHTML.trim() !== '') {
            elementsToTypeset.push(currentContentDivInMsg);
        }
        // 确保 reasoningContentElementForMathJax 是有效的DOM元素再加入渲染列表
        if (reasoningContentElementForMathJax && reasoningContentElementForMathJax instanceof Node && messageDiv.contains(reasoningContentElementForMathJax)) {
            if (reasoningContentElementForMathJax.textContent.trim() !== '') { // 确保有内容才渲染
                elementsToTypeset.push(reasoningContentElementForMathJax);
            }
        }
        if (elementsToTypeset.length > 0) {
            MathJax.typesetPromise(elementsToTypeset).catch(err => console.error("MathJax typesetting failed:", err));
        }
    }

    return messageWrapperDiv;
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
        if (isModelManagementActive) { // 这里的 isModelManagementActive 是全局的
       showChatArea(); // showChatArea 会设置 isModelManagementActive = false;
  }

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
    console.log(`[LoadConv] Attempting to load conversation with ID: ${id}`);
    const convToLoad = conversations.find(c => c.id === id);

    if (!convToLoad) {
        console.warn(`[LoadConv] Conversation with ID "${id}" not found.`);
        if (conversations.length > 0) {
            // 尝试加载第一个未归档的，如果都没有，加载第一个已归档的
            let fallbackConv = conversations.find(c => !c.archived);
            if (!fallbackConv) {
                fallbackConv = conversations[0]; // 如果全是归档的，就加载第一个
            }
            if (fallbackConv) {
                console.log(`[LoadConv] Fallback: Loading first available conversation with ID: ${fallbackConv.id}`);
                // ★★★ 递归调用，但要小心避免无限递归如果所有对话都无效 ★★★
                // 为了避免潜在的无限递归（如果所有对话都因某种原因无法加载），
                // 我们可以考虑在这里直接设置 currentConversationId 并刷新UI，
                // 或者在递归调用后加一道保险。
                // 但通常情况下，如果 conversations[0] 存在，它应该是可加载的。
                return loadConversation(fallbackConv.id); // 返回递归调用的结果
            } else {
                // conversations 数组为空（之前检查 conversations.length > 0 应该阻止到这里，除非有bug）
                console.log("[LoadConv] No conversations exist. Creating a new one.");
                return createNewConversation(); // 返回 createNewConversation 的结果 (它内部会调用 loadConversation)
            }
        } else {
            // 没有任何对话存在
            console.log("[LoadConv] No conversations available. Creating a new one.");
            return createNewConversation(); // 返回 createNewConversation 的结果
        }
    }

    // --- 到这里，convToLoad 应该是有效的 ---
    console.log(`[LoadConv] Successfully found conversation: "${convToLoad.title}" (ID: ${convToLoad.id})`);

    if (convToLoad.isNew) {
        convToLoad.isNew = false;
        // saveConversations(); // 可以在其他地方统一保存，或根据需要立即保存
    }

    // ★★★ 关键：在这里设置全局的 currentConversationId ★★★
    currentConversationId = convToLoad.id;
    activeModel = convToLoad.model;
    console.log(`[LoadConv] currentConversationId SET to: ${currentConversationId}`);


    // 更新UI元素
    const chatTitleEl = document.getElementById('chat-title');
    if (chatTitleEl) chatTitleEl.textContent = convToLoad.title;

    const archiveBtn = document.getElementById('archive-current-btn');
    if (archiveBtn) archiveBtn.textContent = convToLoad.archived ? '取消归档' : '归档';

    const modelSelectEl = document.getElementById('model');
    if (modelSelectEl) modelSelectEl.value = convToLoad.model;

    const settingsAreaEl = document.getElementById('settings-area');
    if (settingsAreaEl) settingsAreaEl.style.display = 'none';
    const chatAreaEl = document.getElementById('chat-area');
    if (chatAreaEl) chatAreaEl.style.display = 'flex';

    const messagesContainer = document.getElementById('messages');
    const emptyChatPlaceholder = document.getElementById('empty-chat-placeholder');

    if (!messagesContainer) {
        console.error("[LoadConv] CRITICAL: Message container '#messages' not found.");
        if (typeof renderConversationList === 'function') renderConversationList(); // 即使消息区有问题，也尝试更新列表
        if (typeof enableInlineTitleEdit === 'function') enableInlineTitleEdit();
        return; // 无法继续渲染消息
    }

    // 1. 清空聊天区域的旧消息
    if (emptyChatPlaceholder) { // 先处理占位符，避免它被意外移除
        messagesContainer.innerHTML = ''; // 清空所有
        messagesContainer.appendChild(emptyChatPlaceholder); // 再把占位符加回去
    } else {
        messagesContainer.innerHTML = ''; // 如果没有占位符，直接清空
        console.error("ID为 'empty-chat-placeholder' 的元素未在HTML中找到！");
    }


    // 2. 渲染消息
    let renderedMessageCount = 0;
    if (convToLoad.messages && Array.isArray(convToLoad.messages)) {
        convToLoad.messages.forEach((msg, indexInConvMessages) => { // indexInConvMessages 是在 convToLoad.messages 中的真实索引
            // 在这里决定是否渲染这条消息 (可以根据你的具体逻辑调整)
            // 例如，你可能不想渲染空的助手消息，除非它们是流式占位符的开始
            let shouldRenderThisMessage = true;
            if ((msg.role === 'assistant' || msg.role === 'model') && !msg.content && !msg.reasoning_content) {
                // 简单的例子：如果助手消息完全没有内容和思考，可能不渲染（除非你有其他判断）
                // shouldRenderThisMessage = false; 
            }
            // 你之前的 filter 逻辑可以移到这里：
            // const hasContent = (typeof msg.content === 'string' && msg.content.trim() !== '') ||
            //                    (msg.content && typeof msg.content.text === 'string' && msg.content.text.trim() !== '');
            // const hasReasoning = typeof msg.reasoning_content === 'string' && msg.reasoning_content.trim() !== '';
            // shouldRenderThisMessage = hasContent || hasReasoning || (msg.role === 'user');


            if (shouldRenderThisMessage) {
                const messageElement = appendMessage(
                    msg.role,
                    msg.content,
                    msg.model || convToLoad.model,
                    msg.reasoning_content || null
                );

                if (messageElement) {
                    messageElement.dataset.conversationId = convToLoad.id;
                    messageElement.dataset.messageIndex = indexInConvMessages.toString(); // dataset 值通常是字符串
                    renderedMessageCount++;
                    // console.log(`[LoadConv] Set dataset for message at actual index ${indexInConvMessages}: convId=${convToLoad.id}, msgIdx=${indexInConvMessages}`);
                } else {
                    // console.warn(`[LoadConv] appendMessage returned null for message at actual index ${indexInConvMessages}. Msg:`, msg);
                }
            }
        });
    }


    // 3. 根据是否有渲染出来的消息来显示/隐藏占位符
    if (emptyChatPlaceholder) {
        if (renderedMessageCount === 0) {
            emptyChatPlaceholder.style.display = 'flex';
            // console.log("[LoadConv] No messages rendered, showing placeholder.");
        } else {
            emptyChatPlaceholder.style.display = 'none';
            // console.log(`[LoadConv] ${renderedMessageCount} messages rendered, hiding placeholder.`);
        }
    }

    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    if (typeof renderConversationList === 'function') renderConversationList();
    if (typeof enableInlineTitleEdit === 'function') enableInlineTitleEdit();
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

function mapMessagesForGemini(messagesHistory, currentFilesData) {
    console.log("[mapMessagesForGemini] Called with Files count:", currentFilesData ? currentFilesData.length : 0);
    if (currentFilesData) console.log("[mapMessagesForGemini] Files data:", JSON.parse(JSON.stringify(currentFilesData)));

    const mappedContents = [];

    messagesHistory.forEach(msg => {
        let roleForGemini = msg.role === 'assistant' ? 'model' : 'user'; // Gemini uses 'model' for assistant

        if (msg.role === 'system') return; // Gemini doesn't use system messages in the contents array directly

        let parts = [];
        // Handle historical user/model messages (simplified: assumes content is string or {text: string})
        let textContent = "";
        if (typeof msg.content === 'string') {
            textContent = msg.content;
        } else if (msg.content && typeof msg.content.text === 'string') {
            textContent = msg.content.text;
        }
        // If it's the last user message, we will append current text and files below
        if (textContent.trim()) {
            parts.push({ text: textContent.trim() });
        }


        // If this is the last message in history AND it's a user message,
        // AND we are processing the current turn (i.e., currentFilesData is passed for this turn)
        // then append current files to its parts.
        // This logic assumes that `send` function calls this mapper with `filesToActuallySend`
        // specifically for the *current* user turn.
        if (msg === messagesHistory[messagesHistory.length - 1] && msg.role === 'user' && currentFilesData && currentFilesData.length > 0) {
            // Current user's turn, add files
            currentFilesData.forEach(fileData => {
                if (fileData.type && fileData.type.startsWith('image/')) {
                    parts.push({
                        inline_data: {
                            mime_type: fileData.type,
                            data: fileData.base64.split(',')[1] // Gemini needs pure Base64
                        }
                    });
                }
                // Handle other file types for Gemini if needed
                else if (fileData.type === 'text/plain' && fileData.base64) {
                     try {
                        const fileText = atob(fileData.base64.split(',')[1]);
                        parts.push({ text: `\n\n--- Content from file: ${fileData.name} ---\n${fileText}\n--- End of file ---` });
                    } catch (e) { console.error("Error decoding base64 text file for Gemini:", e); }
                }
            });
        }
        
        // Ensure parts is not empty if it's a user message that only had files and no text
        if (roleForGemini === 'user' && parts.length === 0) {
            parts.push({ text: " " }); // Gemini requires non-empty parts for user role
        }


        if (parts.length > 0) {
             mappedContents.push({ role: roleForGemini, parts: parts });
        }
    });
    console.log("[mapMessagesForGemini] Mapped contents:", JSON.parse(JSON.stringify(mappedContents)));
    return mappedContents;
}

function mapMessagesForStandardOrClaude(messagesHistory, provider, currentFilesData) {
    console.log("[mapMessagesForStandardOrClaude] Called with provider:", provider, "Files count:", currentFilesData ? currentFilesData.length : 0);
    if (currentFilesData) console.log("[mapMessagesForStandardOrClaude] Files data:", JSON.parse(JSON.stringify(currentFilesData)));

    const mappedApiMessages = [];

    messagesHistory.forEach(msg => {
        if (msg.role === 'system') {
            // Anthropic 和 Ollama 的 system message 通常在顶层单独传递，
            // 所以如果 provider 是这两者之一，我们在这里不添加 system message 到 mappedApiMessages。
            // send 函数中应该有单独的逻辑来处理 bodyPayload.system (对于 Ollama) 或顶层 system (对于 Anthropic)。
            if (provider !== 'anthropic' && provider !== 'ollama') {
                mappedApiMessages.push({ role: 'system', content: msg.content });
            }
        } else if (msg.role === 'assistant' || msg.role === 'model') {
            // 假设助手的历史回复 content 已经是字符串
            // 如果它也可能是对象，你需要添加类似下面用户消息的处理逻辑
            let assistantContent = '';
            if (typeof msg.content === 'string') {
                assistantContent = msg.content;
            } else if (msg.content && typeof msg.content.toString === 'function') {
                assistantContent = msg.content.toString(); // 尝试调用 toString
                if (assistantContent === '[object Object]' && Object.keys(msg.content).length > 0) {
                    console.warn(`[mapMessages] Assistant history content is an object for provider ${provider}. Stringifying.`, msg.content);
                    assistantContent = JSON.stringify(msg.content); // 后备：转为JSON字符串
                }
            } else {
                assistantContent = String(msg.content || ''); // 其他情况转字符串
            }
            mappedApiMessages.push({ role: 'assistant', content: assistantContent });

        } else if (msg.role === 'user') {
            let userApiContent;

            if (provider === 'ollama') {
                // 对于 Ollama，content 必须是字符串
                let ollamaUserText = "";
                if (typeof msg.content === 'string') {
                    ollamaUserText = msg.content;
                } else if (msg.content && typeof msg.content.text === 'string') {
                    ollamaUserText = msg.content.text;
                    // 可选：如果历史用户消息也保存了文件信息，可以在这里作为文本追加
                    if (Array.isArray(msg.content.files) && msg.content.files.length > 0) {
                        const fileNames = msg.content.files.map(f => f.name).join(', ');
                        ollamaUserText += ` (附带历史文件: ${fileNames})`;
                    }
                } else if (Array.isArray(msg.content)) { // 如果历史 content 是数组 (例如来自 OpenAI 格式)
                    const textPart = msg.content.find(part => part.type === 'text');
                    ollamaUserText = textPart ? textPart.text : "";
                    // 可以选择性地提及图片或其他部分
                    const imageParts = msg.content.filter(part => part.type === 'image_url' || part.type === 'image');
                    if (imageParts.length > 0) {
                        ollamaUserText += ` (附带 ${imageParts.length} 个历史图像内容)`;
                    }
                } else if (msg.content) { // 其他对象类型
                    ollamaUserText = JSON.stringify(msg.content); // 作为最后的手段，转为JSON字符串
                    console.warn("[mapMessages] Ollama: Converted complex historical user content to JSON string:", ollamaUserText);
                }
                userApiContent = ollamaUserText.trim() || " "; // 确保非空
            } else {
                // 对于其他 provider (OpenAI, Anthropic等)，content 通常是 parts 数组
                let userContentParts = [];
                if (typeof msg.content === 'string') {
                    userContentParts.push({ type: 'text', text: msg.content });
                } else if (msg.content && typeof msg.content.text === 'string') {
                    userContentParts.push({ type: 'text', text: msg.content.text });
                    // 如果历史用户消息也保存了文件，并且这些 provider 支持历史多模态，
                    // 你需要在这里添加逻辑来转换 msg.content.files 为相应的 image_url 或 image source 对象。
                    // 例如 (简化版，只考虑图片):
                    if (Array.isArray(msg.content.files) && msg.content.files.length > 0) {
                        msg.content.files.forEach(file => {
                            if (file.type && file.type.startsWith('image/')) { // 假设历史文件有 type 和 base64
                                // 注意：历史文件的 base64 可能没有保存，或者保存方式不同
                                // 这里只是一个概念，你需要根据你如何存储历史文件数据来调整
                                if (provider === 'openai' || provider === 'deepseek' || provider === 'siliconflow') {
                                    // 假设历史文件对象有 base64 属性
                                    if(file.base64) userContentParts.push({ type: "image_url", image_url: { url: file.base64 } });
                                    else userContentParts.push({ type: "text", text: `[历史图片: ${file.name}]` });

                                } else if (provider === 'anthropic') {
                                    if(file.base64 && file.type) userContentParts.push({ type: "image", source: { type: "base64", media_type: file.type, data: file.base64.split(',')[1] } });
                                    else userContentParts.push({ type: "text", text: `[历史图片: ${file.name}]` });
                                }
                            }
                        });
                    }
                } else if (Array.isArray(msg.content)) {
                    // 如果历史 content 本身已经是 parts 数组，直接使用（需要确保其内部结构兼容）
                    userContentParts = msg.content;
                } else {
                    console.warn("[mapMessages] Non-Ollama: Encountered complex/unexpected historical user content, defaulting.", msg.content);
                    userContentParts.push({ type: 'text', text: ' ' });
                }
                // 确保 parts 不为空
                if (userContentParts.length === 0) {
                    userContentParts.push({ type: 'text', text: ' ' });
                }
                userApiContent = userContentParts;
            }
            mappedApiMessages.push({ role: 'user', content: userApiContent });
        }
    });

    // 2. 处理当前的用户输入 (文本 + 文件)
    // 我们需要从 messagesHistory 中找到最后一条用户消息，并用当前输入（文本+文件）更新它的 content。
    // 或者，如果 send 函数中 messagesHistory.push(...) 发生在调用此函数之前，
    // 那么 messagesHistory 的最后一条已经是当前用户输入了。

    let lastUserMessageIndex = -1;
    for (let i = mappedApiMessages.length - 1; i >= 0; i--) {
        if (mappedApiMessages[i].role === 'user') {
            lastUserMessageIndex = i;
            break;
        }
    }

    if (lastUserMessageIndex === -1) { // 理论上不应该发生，因为 send 函数会 push 用户消息
        console.error("[mapMessagesForStandardOrClaude] No user message found in history to append files to. Creating a new one.");
        mappedApiMessages.push({ role: 'user', content: [] });
        lastUserMessageIndex = mappedApiMessages.length - 1;
    }
    
    // 获取当前用户输入的文本 (假设它在 history 的最后一条用户消息的 content.text 中，
    // 或者如果 content 是字符串，那就是 content 本身)
    let currentPromptText = "";
    const lastUserMsgFromHistory = mappedApiMessages[lastUserMessageIndex];
    if (typeof lastUserMsgFromHistory.content === 'string') {
        currentPromptText = lastUserMsgFromHistory.content;
    } else if (Array.isArray(lastUserMsgFromHistory.content) && lastUserMsgFromHistory.content.length > 0 && lastUserMsgFromHistory.content[0].type === 'text') {
        currentPromptText = lastUserMsgFromHistory.content[0].text;
    } else if (lastUserMsgFromHistory.content && typeof lastUserMsgFromHistory.content.text === 'string'){ // from userMessageContentForHistory
        currentPromptText = lastUserMsgFromHistory.content.text;
    }


    let currentUserContentParts = [];

    // Add text part
    if (currentPromptText && currentPromptText.trim() !== "") {
        currentUserContentParts.push({ type: "text", text: currentPromptText.trim() });
    }

    // Add file parts
    if (currentFilesData && currentFilesData.length > 0) {
        currentFilesData.forEach(fileData => {
            if (fileData.type && fileData.type.startsWith('image/')) {
                if (provider === 'openai' || provider === 'deepseek' || provider === 'siliconflow') {
                    currentUserContentParts.push({
                        type: "image_url",
                        image_url: {
                            url: fileData.base64 // 确保 base64 是 Data URL: "data:image/jpeg;base64,..."
                        }
                    });
                } else if (provider === 'anthropic') { // Claude 3
                    currentUserContentParts.push({
                        type: "image",
                        source: {
                            type: "base64",
                            media_type: fileData.type,
                            data: fileData.base64.split(',')[1] // Claude 需要纯 Base64，不带 "data:...;base64," 前缀
                        }
                    });
                } else if (provider === 'ollama') {
                    // Ollama (e.g., LLaVA) often takes images differently.
                    // One common way is a top-level "images" array in the message object,
                    // OR some models might support inline base64 within a content part.
                    // For this example, let's assume we're trying an OpenAI-like inline approach first.
                    // If your Ollama model needs a top-level `images` array in the *message object*,
                    // then this function should NOT add image_url here, and the `send` function
                    // needs to handle `bodyPayload.messages[...].images = [...]`
                    //
                    // Let's try an image_url like OpenAI for Ollama if it's a multimodal model that supports it.
                    // Otherwise, Ollama image handling is done OUTSIDE this function in `send` via `bodyPayload.images`.
                    // For now, let's assume if 'ollama' is passed here, it's for a model that might accept inline images.
                    // If not, the `send` function's specific Ollama block handles `bodyPayload.images`.
                    // This function's primary role for Ollama here would be text content.
                    //
                    // Given your `send` function's Ollama block:
                    // bodyPayload.messages = mapMessagesForStandardOrClaude(...)
                    // if (filesToActuallySend.length > 0) { bodyPayload.images = ... }
                    // This implies `mapMessagesForStandardOrClaude` for Ollama should primarily format text history,
                    // and the `images` are added separately to the top-level `bodyPayload` (not per message).
                    // So, for 'ollama', we might not add image parts here within `currentUserContentParts`.
                    // However, if you intend for some Ollama models to take inline images in content, you'd add it.
                    // Let's assume for now, based on your `send` function's Ollama block,
                    // that this function SHOULD NOT add image parts for Ollama to `currentUserContentParts`.
                    // The images are handled by `bodyPayload.images = ...` later.
                    // So, this `else if (provider === 'ollama')` block for images might be empty or not needed here.
                    console.log("[mapMessagesForStandardOrClaude] Ollama provider: Images will be handled by top-level 'bodyPayload.images' if applicable, not adding to content parts here.");
                }
            }
            // Handle other file types if necessary (e.g., text/plain)
            else if (fileData.type === 'text/plain' && fileData.base64) {
                try {
                    const textContent = atob(fileData.base64.split(',')[1]);
                    currentUserContentParts.push({ type: "text", text: `\n\n--- 文件内容: ${fileData.name} ---\n${textContent}\n--- 文件结束 ---` });
                } catch (e) { console.error("Error decoding base64 text file:", e); }
            }
        });
    }
if (provider === 'ollama') {
        let ollamaContentString = currentPromptText; // 从提取的或空的 currentPromptText 开始

        // 图片通过 send 函数中的 bodyPayload.images 处理，这里只在文本中提及
        if (currentFilesData && currentFilesData.length > 0) {
            const imageFiles = currentFilesData.filter(f => f.type && f.type.startsWith('image/'));
            const textFiles = currentFilesData.filter(f => f.type === 'text/plain');

            if (imageFiles.length > 0) {
                const imageFileNames = imageFiles.map(f => f.name).join(', ');
                if (ollamaContentString) {
                    ollamaContentString += `\n(附带图片: ${imageFileNames})`;
                } else {
                    ollamaContentString = `(处理图片: ${imageFileNames})`;
                }
            }
            if (textFiles.length > 0) {
                 textFiles.forEach(fileData => {
                    try {
                        const textContentFromFile = atob(fileData.base64.split(',')[1]);
                        ollamaContentString += `\n\n--- 文件: ${fileData.name} ---\n${textContentFromFile}\n--- 文件结束 ---`;
                    } catch (e) { console.error("Error decoding base64 text file for Ollama content:", e); }
                 });
            }
        }
        if (!ollamaContentString.trim()) {
             ollamaContentString = " "; // Ollama content 不应为空字符串
        }
        mappedApiMessages[lastUserMessageIndex].content = ollamaContentString; // 赋值为字符串
    } else {
        // 对于其他 provider (OpenAI, Anthropic, etc.)，content 是一个 parts 数组
        let currentUserContentParts = [];
        if (currentPromptText) {
            currentUserContentParts.push({ type: "text", text: currentPromptText });
        }

        if (currentFilesData && currentFilesData.length > 0) {
            currentFilesData.forEach(fileData => {
                if (fileData.type && fileData.type.startsWith('image/')) {
                    if (provider === 'openai' || provider === 'deepseek' || provider === 'siliconflow') {
                        currentUserContentParts.push({
                            type: "image_url",
                            image_url: { url: fileData.base64 }
                        });
                    } else if (provider === 'anthropic') {
                        currentUserContentParts.push({
                            type: "image",
                            source: { type: "base64", media_type: fileData.type, data: fileData.base64.split(',')[1] }
                        });
                    }
                } else if (fileData.type === 'text/plain' && fileData.base64) {
                    try {
                        const textContentFromFile = atob(fileData.base64.split(',')[1]);
                        currentUserContentParts.push({ type: "text", text: `\n\n--- 文件: ${fileData.name} ---\n${textContentFromFile}\n--- 文件结束 ---` });
                    } catch (e) { console.error("Error decoding base64 text file for content parts:", e); }
                }
            });
        }

        if (currentUserContentParts.length === 0) {
            currentUserContentParts.push({ type: "text", text: " " }); // 确保 content parts 不为空
        }
        mappedApiMessages[lastUserMessageIndex].content = currentUserContentParts; // 赋值为数组
    }
    
    console.log("[mapMessagesForStandardOrClaude] Mapped API messages:", JSON.parse(JSON.stringify(mappedApiMessages)));
    return mappedApiMessages;
}

async function send() {

  let apiUrl;
    const headers = { 'Content-Type': 'application/json' };
    let bodyPayload = {};    
    let finalAssistantReply = '（无回复）';
    let finalThinkingProcess = null;
    let requestWasSuccessful = false;
    let response = null;
    let responseContentType = null;
    let isStreamingResponse = false; // 预期的流式响应
    let isActuallyStreaming = false;
    let isCurrentlyInThinkingBlock = false;
    let shouldUseStreaming = false; // 初始化

    console.log("DEBUG: send() function initiated.");
    console.log("DEBUG send() START: Raw _internalUploadedFilesData is:", JSON.parse(JSON.stringify(_internalUploadedFilesData)));
    console.log("DEBUG send() START: Raw window.uploadedFilesData (via getter) is:", JSON.parse(JSON.stringify(window.uploadedFilesData)));

    // --- 步骤1: 捕获发起请求时的对话信息 ---
    const conversationAtRequestTime = getCurrentConversation();
    if (!conversationAtRequestTime) {
        alert("错误：无法获取当前对话。请先选择或创建一个对话。");
        console.error("[send] CRITICAL: conversationAtRequestTime is null or undefined.");
        return;
    }
    const conversationIdAtRequestTime = conversationAtRequestTime.id;
    const modelValueFromOption = conversationAtRequestTime.model;

    if (!modelValueFromOption) {
        alert("错误：当前对话没有指定模型。请检查对话数据。");
        console.error("[send] CRITICAL: modelValueFromOption is null or undefined for the current conversation.");
        return;
    }

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
            case 'ollama': actualProvider = 'ollama'; break;
            default:
                console.error(`[send] 未知的模型前缀: "${prefix}" 在模型值 "${modelValueFromOption}" 中。`);
                alert(`模型 "${modelValueFromOption}" 配置错误：无法识别的提供商前缀 "${prefix}"。`);
                return;
        }
    } else {
        console.error(`[send] 模型值 "${modelValueFromOption}" 格式不正确，缺少提供商前缀。`);
        alert(`模型 "${modelValueFromOption}" 配置错误：缺少提供商前缀。`);
        return;
    }
    const providerToUse = actualProvider;

    const promptInput = document.getElementById('prompt');
    if (!promptInput) {
        console.error("[send] CRITICAL: Prompt input element not found.");
        alert("发生内部错误：找不到输入框。");
        return;
    }
    const promptText = promptInput.value.replace(/\n$/, '');

    // 使用 window.uploadedFilesData (通过 getter) 进行判断
    if (!promptText.trim() && (!window.uploadedFilesData || window.uploadedFilesData.length === 0)) {
        alert("请输入问题或上传文件后再发送。");
        console.log("DEBUG send(): Alert triggered. Prompt empty and window.uploadedFilesData empty or undefined.");
        console.log("DEBUG send(): Value of promptText.trim():", `"${promptText.trim()}"`);
        console.log("DEBUG send(): Value of window.uploadedFilesData at alert:", JSON.parse(JSON.stringify(window.uploadedFilesData)));
        return;
    }

    let userMessageContentForHistory;
    let displayMessageForUI = promptText.trim();
    // 关键：在这里拷贝数据，filesToActuallySend 将用于本次API调用
    const filesToActuallySend = window.uploadedFilesData ? [...window.uploadedFilesData] : [];
    console.log("DEBUG send(): filesToActuallySend (AFTER COPY) contains:", JSON.parse(JSON.stringify(filesToActuallySend)));
    console.log("DEBUG send(): window.uploadedFilesData (AFTER COPY, BEFORE POTENTIAL CLEAR in finally) is still:", JSON.parse(JSON.stringify(window.uploadedFilesData)));

    if (filesToActuallySend.length > 0) {
        userMessageContentForHistory = {
            text: promptText.trim(),
            files: filesToActuallySend.map(f => ({ name: f.name, type: f.type })) // 存储文件元数据
        };
        const fileNames = filesToActuallySend.map(f => f.name).join(', ');
        displayMessageForUI = promptText.trim() ? `${promptText.trim()}\n[已附带文件: ${fileNames}]` : `[已发送文件: ${fileNames}]`;
    } else {
        userMessageContentForHistory = promptText.trim();
    }

    if (currentConversationId === conversationIdAtRequestTime) {
      const initialReasoningText = (shouldUseStreaming && (providerToUse === 'ollama' || 
        providerToUse === 'deepseek' || 
        providerToUse === 'openai' || 
        providerToUse === 'siliconflow' /*或其他支持<think>的*/ )) ? "" : undefined;
      
      
        if (typeof appendMessage === 'function') {
            appendMessage('user', displayMessageForUI, null, null);
        } else { console.error("[send] appendMessage function is not defined."); }
    }

    conversationAtRequestTime.messages.push({
        role: 'user',
        content: userMessageContentForHistory, // 存储包含文件元数据或纯文本的内容
        model: modelValueFromOption
    });

    promptInput.value = ''; // 清空输入框
    if (promptInput.style.height !== (promptInput.style.minHeight || '42px')) { // 重置输入框高度
        const initialTextareaHeight = promptInput.style.minHeight || '42px';
        promptInput.style.height = initialTextareaHeight;
        promptInput.style.overflowY = 'hidden';
    }

    if (typeof saveConversations === 'function') saveConversations();
    const loadingDiv = typeof appendLoading === 'function' ? appendLoading() : null;

    

    /**
 * 将对话历史和当前上传的文件映射为标准或Claude API的消息格式。
 * @param {Array<Object>} messagesHistory - 对话历史消息数组。
 * @param {string} provider - 当前的API提供商 ('openai', 'anthropic', 'deepseek', 'siliconflow', 'ollama').
 * @param {Array<Object>} currentFilesData - 当前上传的文件数据数组 (包含 name, type, base64).
 * @returns {Array<Object>} 格式化后的消息数组。
 */


/**
 * 将对话历史和当前上传的文件映射为 Gemini API 的消息格式。
 * @param {Array<Object>} messagesHistory - 对话历史消息数组。
 * @param {Array<Object>} currentFilesData - 当前上传的文件数据数组 (包含 name, type, base64).
 * @returns {Array<Object>} 格式化后的 contents 数组 for Gemini.
 */


    try {
        let currentTemperature = parseFloat(localStorage.getItem('model-temperature'));
        if (isNaN(currentTemperature) || currentTemperature < 0 || currentTemperature > 2) {
            currentTemperature = 0.7;
        }
        shouldUseStreaming = ['openai', 'anthropic', 'deepseek', 'siliconflow', 'ollama'].includes(providerToUse);

        bodyPayload.model = modelNameForAPI;
        if (providerToUse !== 'gemini') bodyPayload.temperature = currentTemperature;
        if (shouldUseStreaming && providerToUse !== 'gemini') bodyPayload.stream = true;

        if (providerToUse === 'ollama') {
            apiUrl = 'http://localhost:11434/api/chat';
            const ollamaSettings = JSON.parse(localStorage.getItem('ollama-settings') || '{}');
            if (ollamaSettings && ollamaSettings.apiUrl && ollamaSettings.apiUrl.trim()) apiUrl = ollamaSettings.apiUrl.trim();
            
            bodyPayload.messages = typeof mapMessagesForStandardOrClaude === 'function' ?
                                   mapMessagesForStandardOrClaude(conversationAtRequestTime.messages, 'ollama', filesToActuallySend) :
                                   [{role: 'user', content: [{type: 'text', text: promptText || ' '}]}]; // filesToActuallySend 用于构建消息
            bodyPayload.options = { temperature: currentTemperature };
            if (filesToActuallySend.length > 0) {
                const imageBase64Array = filesToActuallySend
                    .filter(f => f.type && f.type.startsWith('image/'))
                    .map(f => f.base64 ? f.base64.split(',')[1] : null).filter(Boolean);
                if (imageBase64Array.length > 0) bodyPayload.images = imageBase64Array;
            }
            const systemMessageObj = conversationAtRequestTime.messages.find(m => m.role === 'system');
            if (systemMessageObj && typeof systemMessageObj.content === 'string' && systemMessageObj.content.trim()) {
               bodyPayload.system = systemMessageObj.content.trim();
            } else if (systemMessageObj && systemMessageObj.content && typeof systemMessageObj.content === 'object' && systemMessageObj.content.text) {
               bodyPayload.system = systemMessageObj.content.text.trim();
            }
        } else if (providerToUse === 'gemini') {
            apiUrl = `/.netlify/functions/gemini-proxy`;
            bodyPayload.contents = typeof mapMessagesForGemini === 'function' ?
                                   mapMessagesForGemini(conversationAtRequestTime.messages, filesToActuallySend) : // filesToActuallySend 用于构建消息
                                   [{role: 'user', parts: [{text: promptText || ' '}]}];
            bodyPayload.generationConfig = { temperature: currentTemperature };
        } else {
            apiUrl = `/.netlify/functions/${providerToUse}-proxy`;
            bodyPayload.messages = typeof mapMessagesForStandardOrClaude === 'function' ?
                                   mapMessagesForStandardOrClaude(conversationAtRequestTime.messages, providerToUse, filesToActuallySend) : // filesToActuallySend 用于构建消息
                                   [{role: 'user', content: [{type: 'text', text: promptText || ' '}]}];
            if (providerToUse === 'anthropic') bodyPayload.max_tokens = 4096;
        }

        let noMessagesToSend = false;
        // isActuallyStreaming 判断的是 *实际收到的* 响应是否为流
       
        if (providerToUse === 'gemini') {
            noMessagesToSend = (!bodyPayload.contents || bodyPayload.contents.length === 0 || bodyPayload.contents.every(c => !c.parts || c.parts.length === 0));
        } else {
            noMessagesToSend = (!bodyPayload.messages || bodyPayload.messages.length === 0 || bodyPayload.messages.every(m => !m.content || m.content.length === 0));
        }
        // 如果没有文本消息，并且也没有文件要发送（filesToActuallySend 为空），则不发送
        if (noMessagesToSend && filesToActuallySend.length === 0) {
            if (loadingDiv) loadingDiv.remove();
            alert("无法构建有效的请求内容。请检查输入或文件。");
            return;
        }
        console.log("DEBUG: bodyPayload being sent to Anthropic:", JSON.stringify(bodyPayload, null, 2));
        const response = await fetch(apiUrl, { method: 'POST', headers, body: JSON.stringify(bodyPayload) });
        responseContentType = response.headers.get('content-type');
        // isStreamingResponse 现在是最初的期望
        isStreamingResponse = shouldUseStreaming && response.body &&
                             (responseContentType?.includes('text/event-stream') ||
                             (providerToUse === 'ollama' && responseContentType?.includes('application/x-ndjson')));
       isActuallyStreaming = shouldUseStreaming && response.body &&
                                 ((providerToUse !== 'ollama' && responseContentType?.includes('text/event-stream')) ||
                                 (providerToUse === 'ollama' && responseContentType?.includes('application/x-ndjson')));
        if (!response.ok) {
            const errorText = await response.text(); let detail = errorText;
            try { const errJson = JSON.parse(errorText); detail = errJson.error?.message || errJson.error || JSON.stringify(errJson, null, 2);
                if (providerToUse === 'ollama' && errJson.error && typeof errJson.error === 'string') detail = `Ollama Error: ${errJson.error}`;
            } catch (e) { /* no-op */ }
            let rawError = `API 请求失败 (${response.status})：${detail}`;
            if (response.status >= 400 && apiUrl.includes('/.netlify/functions/')) rawError = `代理函数 (${decodeURIComponent(apiUrl.split('/').pop())}) 调用失败 (${response.status})：${detail}。`;
            else if (providerToUse === 'ollama' && response.status !== 200) rawError = `Ollama API 调用失败 (${response.status})：${detail}。请确保 Ollama 服务运行且模型 '${modelNameForAPI}' 已下载。`;
            throw new Error(rawError);
        }

        // --- 响应处理 ---
        
        
       if (isActuallyStreaming) {
            let accumulatedAssistantReply = "";
            let accumulatedThinkingForDisplay = "";
            let isCurrentlyInThinkingBlock = false; // 用于 extractThinkingAndReply (主要针对非Deepseek的<think>标签)
            const assistantRoleForDisplay = (providerToUse === 'gemini') ? 'model' : 'assistant';
            let tempMsgElementWrapper = null;
            let messageDiv = null;
            let assistantTextElement = null;
            let reasoningBlockDiv = null;
            let reasoningContentElement = null;

            // 初始化UI元素，为流式输出做准备
            if (currentConversationId === conversationIdAtRequestTime) {
                // 假设所有流式提供商如果支持思考，都需要一个占位符
                // 如果某个provider明确不需要或有不同处理，可以在此调整initialReasoningText
                const initialReasoningText = shouldUseStreaming ? "" : undefined; 

                tempMsgElementWrapper = appendMessage(assistantRoleForDisplay, "", modelValueFromOption, initialReasoningText);
                if (tempMsgElementWrapper) {
                    messageDiv = tempMsgElementWrapper.querySelector('.message.assistant');
                    if (messageDiv) {
                        assistantTextElement = messageDiv.querySelector('.text');
                        if (initialReasoningText !== undefined) { // 只有当期望有思考块时才查找
                            reasoningBlockDiv = messageDiv.querySelector('.reasoning-block');
                            if (reasoningBlockDiv) {
                                reasoningContentElement = reasoningBlockDiv.querySelector('.reasoning-content');
                                if (!reasoningContentElement) {
                                    console.warn("[send] Stream: .reasoning-block found, but .reasoning-content is missing in placeholder.");
                                }
                            } else {
                                 console.warn("[send] Stream: .reasoning-block not found in placeholder, though initialReasoningText was provided.");
                            }
                        }
                    }
                }
                // 检查关键UI元素是否获取成功
                if (!messageDiv || (!assistantTextElement && providerToUse !== 'ollama') || (initialReasoningText !== undefined && !reasoningContentElement && (providerToUse === 'deepseek' || providerToUse === 'ollama'))) {
                    console.error("[send] Stream: Critical UI elements for streaming output were not found or created by appendMessage. Provider:", providerToUse, "MessageDiv:", !!messageDiv, "AssistantText:", !!assistantTextElement, "ReasoningContent:", !!reasoningContentElement);
                    // 根据情况，你可能想在这里提前终止流处理，或者尝试继续但有风险
                }
            }
            
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            try { // 内层 try for stream reading loop
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) {
                        // Ollama stream end specific processing (if buffer has content)
                        if (providerToUse === 'ollama' && buffer.trim() !== '') {
                            try {
                                const chunkJson = JSON.parse(buffer.trim());
                                let lastRawChunkText = chunkJson.message?.content || '';
                                if (lastRawChunkText && typeof extractThinkingAndReply === 'function') {
                                    let { replyTextPortion, thinkingTextPortion, newThinkingBlockState } = extractThinkingAndReply(
                                        lastRawChunkText, "<think>", "</think>", isCurrentlyInThinkingBlock
                                    );
                                    isCurrentlyInThinkingBlock = newThinkingBlockState;

                                   if (currentConversationId === conversationIdAtRequestTime) {
    let somethingWasUpdated = false; // 标记是否有内容更新，以便决定是否滚动主消息列表

    // --- 更新思考过程 UI ---
    if (thinkingTextPortion) { // 只要提取到思考片段就尝试更新
        if (reasoningContentElement) { // 确保元素存在
            accumulatedThinkingForDisplay += thinkingTextPortion;
            reasoningContentElement.textContent = accumulatedThinkingForDisplay;

            // ★★★ 为思考过程内容区域自动滚动到底部 ★★★
            reasoningContentElement.scrollTop = reasoningContentElement.scrollHeight;
            // ★★★ -------------------------------- ★★★

            // 如果思考块之前是隐藏的 (因为内容为空)，现在有内容了就显示它
            if (reasoningBlockDiv && reasoningBlockDiv.classList.contains('reasoning-block-empty') && accumulatedThinkingForDisplay.trim() !== '') {
                reasoningBlockDiv.classList.remove('reasoning-block-empty');
            }
            somethingWasUpdated = true;
        } else if (thinkingTextPortion.trim() !== "") {
             console.warn("[send] Stream: Got thinkingTextPortion but reasoningContentElement is not available for update and scroll. Text:", thinkingTextPortion);
        }
    }

    // --- 更新主要回复 UI ---
    if (replyTextPortion) {
        if (assistantTextElement) {
            accumulatedAssistantReply += replyTextPortion;
            assistantTextElement.innerHTML = typeof marked !== 'undefined' ? marked.parse(accumulatedAssistantReply) : accumulatedAssistantReply;
            
            // ★★★ 为主要回复内容区域（如果它本身可滚动）自动滚动到底部 ★★★
            // 注意：assistantTextElement 通常是 .text div，如果它有固定高度和 overflow，这个才有效
            // 大部分情况下，我们是滚动整个 #messages 容器
            // assistantTextElement.scrollTop = assistantTextElement.scrollHeight; 
            // ▲▲▲ ---------------------------------------------------- ▲▲▲

        } else if (messageDiv) { // Ollama 或其他 provider 的动态 .text 创建 (如果需要)
            accumulatedAssistantReply += replyTextPortion;
            let targetTextElement = messageDiv.querySelector('.text');
            if (!targetTextElement) {
                targetTextElement = document.createElement('div');
                targetTextElement.className = 'text';
                // 决定插入位置，例如在 model-note 之前，或直接 append
                const modelNote = messageDiv.querySelector('.model-note');
                if (modelNote) {
                    messageDiv.insertBefore(targetTextElement, modelNote);
                } else {
                    messageDiv.appendChild(targetTextElement);
                }
                assistantTextElement = targetTextElement; // 更新引用
            }
            assistantTextElement.innerHTML = typeof marked !== 'undefined' ? marked.parse(accumulatedAssistantReply) : accumulatedAssistantReply;
            // assistantTextElement.scrollTop = assistantTextElement.scrollHeight; // 同样，如果需要内部滚动
        } else if (replyTextPortion.trim() !== "") {
            console.warn("[send] Stream: Got replyTextPortion but neither assistantTextElement nor messageDiv is available.", replyTextPortion);
        }
        if (replyTextPortion.trim() !== "") { // 只有当 replyTextPortion 真的有内容时才标记更新
             somethingWasUpdated = true;
        }
    }

    // --- 滚动整个消息列表 (#messages) ---
    // 只有当思考或回复部分确实有新内容输出时，才滚动主消息列表
    if (somethingWasUpdated) {
        const messagesContainer = document.getElementById('messages');
        if (messagesContainer) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    }
}
                                }
                            } catch(e) { /* console.warn('[接收流][Ollama] 解析流末尾残余数据失败:', buffer.trim(), e); */ }
                        }
                        break; // Exit while loop
                    } // End if(done)

                    buffer += decoder.decode(value, { stream: true });
                    let processableUnits = [];

                    if (providerToUse === 'ollama') {
                        let ndjson_parts = buffer.split('\n');
                        buffer = ndjson_parts.pop() || "";
                        processableUnits = ndjson_parts;
                    } else { // SSE Stream
                        let sse_lines = buffer.split('\n\n');
                        buffer = sse_lines.pop() || "";
                        processableUnits = sse_lines;
                    }

                    for (const unit of processableUnits) {
                        if (unit.trim() === '') continue;
                        
                        try {
                            if (providerToUse === 'ollama') {
                                const chunkJson = JSON.parse(unit);
                                let rawChunkText = chunkJson.message?.content || '';
                                if (chunkJson.done) isCurrentlyInThinkingBlock = false; 
                                // Ollama 一般不区分 reasoning 和 content，都通过 extractThinkingAndReply 处理
                                if (rawChunkText && typeof extractThinkingAndReply === 'function') {
                                    let { replyTextPortion, thinkingTextPortion, newThinkingBlockState } = extractThinkingAndReply(rawChunkText, "<think>", "</think>", isCurrentlyInThinkingBlock);
                                    isCurrentlyInThinkingBlock = newThinkingBlockState;
                                    // ... (在此处或下方统一处理 thinkingTextPortion 和 replyTextPortion 来更新UI) ...
                                    if (currentConversationId === conversationIdAtRequestTime) {
                                        if (thinkingTextPortion && reasoningContentElement) { accumulatedThinkingForDisplay += thinkingTextPortion; reasoningContentElement.textContent = accumulatedThinkingForDisplay; if (reasoningBlockDiv && reasoningBlockDiv.classList.contains('reasoning-block-empty') && accumulatedThinkingForDisplay.trim() !== '') { reasoningBlockDiv.classList.remove('reasoning-block-empty'); } }
                                        if (replyTextPortion) { if (assistantTextElement) { accumulatedAssistantReply += replyTextPortion; assistantTextElement.innerHTML = typeof marked !== 'undefined' ? marked.parse(accumulatedAssistantReply) : accumulatedAssistantReply; } else if (messageDiv) { accumulatedAssistantReply += replyTextPortion; const existingTextDiv = messageDiv.querySelector('.text'); if (existingTextDiv) { assistantTextElement = existingTextDiv; } else { const newTextDiv = document.createElement('div'); newTextDiv.className = 'text'; messageDiv.appendChild(newTextDiv); assistantTextElement = newTextDiv; } assistantTextElement.innerHTML = typeof marked !== 'undefined' ? marked.parse(accumulatedAssistantReply) : accumulatedAssistantReply; } }
                                        if (thinkingTextPortion || replyTextPortion) document.getElementById('messages').scrollTop = document.getElementById('messages').scrollHeight;
                                    }
                                }
                            } else { // SSE Providers (OpenAI, Deepseek, Anthropic, etc.)
                                if (!unit.startsWith('data: ')) continue; // Skip non-data SSE lines
                                const jsonData = unit.substring(6);
                                if (jsonData.trim() === '[DONE]') continue;
                                const chunk = JSON.parse(jsonData);

                                let sseThinkingText = "";
                                let sseReplyText = "";
                                if (providerToUse === 'anthropic') {
                                    // console.log("[Anthropic Stream Chunk]:", JSON.stringify(chunk, null, 2)); // 调试：打印原始chunk
                                    if (chunk.type === 'message_start') {
                                        console.log("[Anthropic Stream] Message started. ID:", chunk.message?.id);
                                        // 你可以在这里初始化一些与消息相关的状态，如果需要
                                        accumulatedAssistantReply = ""; // 重置累积回复
                                        accumulatedThinkingForDisplay = ""; // Anthropic 通常不显式输出思考，但以防万一
                                    } else if (chunk.type === 'content_block_start') {
                                        // console.log("[Anthropic Stream] Content block started. Index:", chunk.index, "Type:", chunk.content_block?.type);
                                    } else if (chunk.type === 'content_block_delta') {
                                        if (chunk.delta && chunk.delta.type === 'text_delta') {
                                            sseReplyText = chunk.delta.text || ''; // 获取文本片段
                                        }
                                    } else if (chunk.type === 'content_block_stop') {
                                        // console.log("[Anthropic Stream] Content block stopped. Index:", chunk.index);
                                    } else if (chunk.type === 'message_delta') {
                                        // console.log("[Anthropic Stream] Message delta:", chunk.delta);
                                        // 可以检查 chunk.delta.stop_reason 和 chunk.delta.stop_sequence
                                    } else if (chunk.type === 'message_stop') {
                                        console.log("[Anthropic Stream] Message stopped.");
                                        isCurrentlyInThinkingBlock = false; // 确保重置
                                    } else if (chunk.type === 'ping') {
                                        // console.log("[Anthropic Stream] Ping event received.");
                                    } else if (chunk.type === 'error') {
                                        console.error("[Anthropic Stream] Error event received:", chunk.error);
                                        // 你可能需要在这里处理错误，例如停止流并显示错误信息
                                        sseReplyText = `\n[错误：Anthropic API 流错误 - ${chunk.error?.type}: ${chunk.error?.message || '未知错误'}]`;
                                    }
                                    // 对于 Anthropic，思考过程是隐式的，我们只处理 sseReplyText
                                    sseThinkingText = ""; // 明确设置为空，因为它不使用 <think>
                                
                                } else if (providerToUse === 'deepseek') {
                                    sseThinkingText = chunk.choices?.[0]?.delta?.reasoning_content || '';
                                    sseReplyText = chunk.choices?.[0]?.delta?.content || '';
                                } else if (providerToUse === 'openai' || providerToUse === 'siliconflow') {
                                    // These typically put everything in content, <think> tags handled by extractThinkingAndReply
                                    const rawContent = chunk.choices?.[0]?.delta?.content || '';
                                    if (rawContent && typeof extractThinkingAndReply === 'function') {
                                        let { replyTextPortion, thinkingTextPortion, newThinkingBlockState } = extractThinkingAndReply(rawContent, "<think>", "</think>", isCurrentlyInThinkingBlock);
                                        isCurrentlyInThinkingBlock = newThinkingBlockState;
                                        sseThinkingText = thinkingTextPortion;
                                        sseReplyText = replyTextPortion;
                                    } else {
                                        sseReplyText = rawContent; // If no extract function or no content
                                    }
                                } else if (providerToUse === 'anthropic') {
                                    if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
                                        sseReplyText = chunk.delta.text || '';
                                        // Anthropic usually doesn't use <think> tags in this way for CoT via API stream.
                                    }
                                }

                                // --- Update UI based on sseThinkingText and sseReplyText ---
                                if (currentConversationId === conversationIdAtRequestTime) {
                                    if (sseThinkingText) {
                                        if (reasoningContentElement) {
                                            accumulatedThinkingForDisplay += sseThinkingText;
                                            reasoningContentElement.textContent = accumulatedThinkingForDisplay;
                                            reasoningContentElement.scrollTop = reasoningContentElement.scrollHeight;
                                            if (reasoningBlockDiv && reasoningBlockDiv.classList.contains('reasoning-block-empty') && accumulatedThinkingForDisplay.trim() !== '') {
                                                reasoningBlockDiv.classList.remove('reasoning-block-empty');
                                            }
                                        } else if (sseThinkingText.trim() !== "") {
                                            console.warn(`[send] SSE (${providerToUse}): Got thinking text but no reasoningContentElement. Text:`, sseThinkingText);
                                        }
                                    }
                                    if (sseReplyText) {
                                        if (assistantTextElement) {
                                            accumulatedAssistantReply += sseReplyText;
                                            assistantTextElement.innerHTML = typeof marked !== 'undefined' ? marked.parse(accumulatedAssistantReply) : accumulatedAssistantReply;
                                        } else if (messageDiv) { // Fallback for Ollama-like dynamic creation if needed by other SSE
                                            accumulatedAssistantReply += sseReplyText;
                                            const existingTextDiv = messageDiv.querySelector('.text');
                                            if (existingTextDiv) { assistantTextElement = existingTextDiv; }
                                            else { const newTextDiv = document.createElement('div'); newTextDiv.className = 'text'; messageDiv.appendChild(newTextDiv); assistantTextElement = newTextDiv; }
                                            assistantTextElement.innerHTML = typeof marked !== 'undefined' ? marked.parse(accumulatedAssistantReply) : accumulatedAssistantReply;
                                        } else if (sseReplyText.trim() !== "") {
                                             console.warn(`[send] SSE (${providerToUse}): Got reply text but no assistantTextElement or messageDiv. Text:`, sseReplyText);
                                        }
                                    }
                                    if ((sseThinkingText && sseThinkingText.trim() !== "") || (sseReplyText && sseReplyText.trim() !== "")) {
                                        document.getElementById('messages').scrollTop = document.getElementById('messages').scrollHeight;
                                    }
                                }
                            }
                        } catch (e) {
                            console.warn(`[接收流] 解析单元失败 (${providerToUse}):`, unit, e);
                        }
                    } // end for (const unit of processableUnits)
                } // end while

                // 流结束后，再次检查思考块是否应该隐藏
                if (currentConversationId === conversationIdAtRequestTime && reasoningBlockDiv) {
                    if (accumulatedThinkingForDisplay.trim() === '') {
                        if (!reasoningBlockDiv.classList.contains('reasoning-block-empty')) {
                            reasoningBlockDiv.classList.add('reasoning-block-empty');
                        }
                    } else {
                         if (reasoningBlockDiv.classList.contains('reasoning-block-empty')) {
                            reasoningBlockDiv.classList.remove('reasoning-block-empty');
                        }
                    }
                }

                finalAssistantReply = accumulatedAssistantReply;
                finalThinkingProcess = accumulatedThinkingForDisplay.trim() ? accumulatedThinkingForDisplay.trim() : null;
                requestWasSuccessful = true;

            } catch (streamError) {
                console.error("[send] 流处理错误:", streamError);
                let streamErrorMessage = '流处理中断';
                if (streamError && streamError.message) {
                    streamErrorMessage += `: ${streamError.message}`;
                }
                finalAssistantReply = accumulatedAssistantReply + `\n[错误：${streamErrorMessage}]`;
                finalThinkingProcess = accumulatedThinkingForDisplay.trim() ? accumulatedThinkingForDisplay.trim() : null;
                requestWasSuccessful = false;
            }
        } else { // Non-streaming response
            const data = await response.json();
            if (providerToUse === 'ollama') {
                if (data.message?.content) {
                  finalAssistantReply = data.message.content;
                  if (finalAssistantReply.includes("<think>") && finalAssistantReply.includes("</think>")) {
                      const thinkStartIndex = finalAssistantReply.indexOf("<think>");
                      const thinkEndIndex = finalAssistantReply.indexOf("</think>");
                      if (thinkStartIndex < thinkEndIndex) {
                          finalThinkingProcess = finalAssistantReply.substring(thinkStartIndex + "<think>".length, thinkEndIndex).trim();
                      }
                  } else { finalThinkingProcess = null; }
                } else if (data.error && typeof data.error === 'string') { finalAssistantReply = `Ollama 错误: ${data.error}`; finalThinkingProcess = null;
                } else if (typeof data === 'string') { finalAssistantReply = `Ollama 错误: ${data}`; finalThinkingProcess = null;
                } else { finalAssistantReply = 'Ollama 返回了未知格式的非流式响应。'; finalThinkingProcess = null;}
            } else if (providerToUse === 'gemini') {
                if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
                    finalAssistantReply = data.candidates[0].content.parts[0].text;
                } else if (data.promptFeedback?.blockReason) {
                    finalAssistantReply = `请求被阻止：${data.promptFeedback.blockReason}`;
                    if (data.promptFeedback.safetyRatings) finalAssistantReply += ` (Safety Ratings: ${JSON.stringify(data.promptFeedback.safetyRatings)})`;
                }
                finalThinkingProcess = null;
            } else if (providerToUse === 'anthropic' && !isActuallyStreaming) {
                if (data.content?.[0]?.text) finalAssistantReply = data.content[0].text;
                finalThinkingProcess = null;
            } else if (!isActuallyStreaming) { // OpenAI, Deepseek, SiliconFlow etc. non-streaming
                if (data.choices?.[0]?.message) {
                    finalAssistantReply = data.choices[0].message.content || '（无回复）';
                    if (data.choices[0].message.reasoning_content) { // DeepSeek
                        finalThinkingProcess = data.choices[0].message.reasoning_content;
                    } else { finalThinkingProcess = null; }
                } else { finalThinkingProcess = null; }
            }
            requestWasSuccessful = true;
        }

    } catch (error) { // Outermost try...catch for API call and initial processing
        console.error(`[发送错误 Catch] 对话ID ${conversationIdAtRequestTime}:`, error);
        finalAssistantReply = error.message.startsWith('错误：') ? error.message : `错误：${error.message}`;
        // finalThinkingProcess might have been partially accumulated if streamError occurred
        finalThinkingProcess = finalThinkingProcess || null;
        requestWasSuccessful = false;
    } finally {
        if (loadingDiv && loadingDiv.parentNode === document.getElementById('messages')) {
            loadingDiv.remove();
        }

        const assistantRoleToDisplay = (providerToUse === 'gemini') ? 'model' : 'assistant';

        // Handle UI update for non-streamed, failed stream, or errors
        if (!requestWasSuccessful || !isActuallyStreaming) { // isActuallyStreaming reflects *actual* stream
            if (currentConversationId === conversationIdAtRequestTime) {
                console.log(`[Finally] 非流式/错误路径. 调用 appendMessage (原因: ${!requestWasSuccessful ? '请求失败/错误' : '非实际流式响应'})`);
                
                const messagesNode = document.getElementById('messages');
                if (messagesNode) { // Remove pre-emptively added empty assistant message if one exists
                    const lastMessageWrapper = messagesNode.lastElementChild;
                    if (lastMessageWrapper &&
                        lastMessageWrapper.classList.contains('assistant-message-wrapper') &&
                        lastMessageWrapper.querySelector('.message.assistant')) {
                        const textElement = lastMessageWrapper.querySelector('.message.assistant .text');
                        let isEmptyMessage = false;
                        if (textElement) {
                            const tempDiv = document.createElement('div'); tempDiv.innerHTML = textElement.innerHTML;
                            if (typeof pruneEmptyNodes === 'function') pruneEmptyNodes(tempDiv);
                            if (tempDiv.innerHTML.trim() === "") isEmptyMessage = true;
                        } else { isEmptyMessage = true; }

                        const hasReasoningInDOM = lastMessageWrapper.querySelector('.reasoning-block .reasoning-content')?.textContent.trim() !== '';
                        const hasModelNoteInDOM = lastMessageWrapper.querySelector('.model-note') !== null;

                        if (isEmptyMessage && !hasReasoningInDOM && !hasModelNoteInDOM ) {
                            console.log("[Finally] 移除非流式/错误路径下，之前为流式append的完全空消息体。");
                            lastMessageWrapper.remove();
                        }
                    }
                }
                appendMessage(assistantRoleToDisplay, finalAssistantReply, modelValueFromOption, finalThinkingProcess);
            }
        } else if (requestWasSuccessful && isActuallyStreaming) { // Successful actual streaming
            console.log("[Finally] 流式处理成功完成。");
            if (currentConversationId === conversationIdAtRequestTime) {
                const messagesContainer = document.getElementById('messages');
                const allAssistantWrappers = messagesContainer.querySelectorAll('.assistant-message-wrapper');
                const existingMsgWrapper = allAssistantWrappers.length > 0 ? allAssistantWrappers[allAssistantWrappers.length - 1] : null;

                if (existingMsgWrapper) {
                    const msgDiv = existingMsgWrapper.querySelector('.message.assistant');
                    if (msgDiv && modelValueFromOption && !msgDiv.querySelector('.model-note')) {
                        const note = document.createElement('div'); note.className = 'model-note';
                        let displayModelName = modelValueFromOption;
                        const modelSelect = document.getElementById('model');
                        if(modelSelect) {
                            const opt = modelSelect.querySelector(`option[value="${modelValueFromOption}"]`);
                            if(opt) displayModelName = opt.textContent;
                            else { const parts = String(modelValueFromOption).split('::'); if (parts.length === 2) displayModelName = parts[1];}
                        }
                        note.textContent = `模型：${displayModelName}`;
                        msgDiv.appendChild(note);
                    }
                    if (window.MathJax && MathJax.typesetPromise && msgDiv) {
                        const elementsToTypeset = [];
                        const textElementForMathJax = msgDiv.querySelector('.text');
                        const reasoningElementForMathJax = msgDiv.querySelector('.reasoning-block .reasoning-content');
                        if (textElementForMathJax && textElementForMathJax.textContent.trim() !== '') elementsToTypeset.push(textElementForMathJax);
                        if (reasoningElementForMathJax && reasoningElementForMathJax.textContent.trim() !== '') elementsToTypeset.push(reasoningElementForMathJax);
                        if (elementsToTypeset.length > 0) {
                            MathJax.typesetPromise(elementsToTypeset).catch(err => console.error("MathJax final typeset failed:", err));
                        }
                    }
                }
            }
            // Clear uploaded files ONLY if the request was successful, was streaming, AND used files.
            if (filesToActuallySend.length > 0) {
                 console.log("DEBUG send() finally: Clearing uploadedFilesData and re-rendering preview because request was successful, streaming, and files were sent.");
                 window.uploadedFilesData = []; // Clear global state
                 if (typeof renderFilePreview === 'function') renderFilePreview(); // Update UI
            }
        }

        // Save assistant's reply (or error) to conversation history
        const targetConversationForStorage = conversations.find(c => c.id === conversationIdAtRequestTime);
        if (targetConversationForStorage) {
            const assistantRoleForStorage = 'assistant';
            if (finalAssistantReply !== '（无回复）' || (finalThinkingProcess && finalThinkingProcess.trim() !== '') || finalAssistantReply.startsWith('错误：')) {
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
            console.error(`[保存错误] 无法找到原始对话 ${conversationIdAtRequestTime} 来保存助手回复。`);
        }
    }
}


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

function showChatArea() {
    const settingsArea = document.getElementById('settings-area');
    const chatArea = document.getElementById('chat-area');
    const modelMgmtArea = document.getElementById('model-management-area'); // 获取模型管理区域元素
    const sidebar = document.querySelector('.sidebar'); // 获取侧边栏元素

    // 1. 控制主内容区域的显示
    if (settingsArea) settingsArea.style.display = 'none';
    if (modelMgmtArea) modelMgmtArea.style.display = 'none'; // 确保模型管理区域被隐藏
    if (chatArea) chatArea.style.display = 'flex'; // 显示聊天区域

    // 2. 控制侧边栏的显示
    if (sidebar) {
        // 恢复侧边栏的显示。您需要根据侧边栏原始的 display 类型来设置。
        // 如果侧边栏在CSS中是 display: flex; 来布局其内部元素，则用 'flex'
        // 如果是 display: block; 则用 'block'
        // 假设您的侧边栏是 flex 布局
        sidebar.style.display = 'flex';
    }

    // 3. 更新状态变量
    isModelManagementActive = false; // 明确表示已不在模型管理激活状态

    // 4. 处理聊天内容的加载或创建
    if (!currentConversationId || !conversations.find(c => c.id === currentConversationId)) {
        // 如果没有当前对话ID，或者当前对话ID无效（例如从模型管理返回且该对话被删了）
        if (conversations.length > 0) {
            // 加载第一个未归档对话，或第一个对话（如果都是归档的）
            const firstNonArchived = conversations.filter(c => !c.archived)[0];
            const targetIdToLoad = firstNonArchived ? firstNonArchived.id : conversations[0].id;
            loadConversation(targetIdToLoad); // loadConversation 应处理模型列表变化
        } else {
            // 没有对话存在，创建一个新的
            createNewConversation();
        }
    } else {
        // 如果有有效的当前对话ID，重新加载它以确保UI同步
        // (特别是从模型管理界面返回，模型列表或当前对话的模型可能已更改)
        loadConversation(currentConversationId);
    }

    // 5. （可选但推荐）重新渲染对话列表
    // 因为切换回聊天视图时，可能需要更新列表项的 'active' 状态，
    // 或者如果之前因为 isModelManagementActive 而未正确渲染 active 状态。
    renderConversationList();
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


async function loadModelsFromConfig() {
   console.log("[loadModelsFromConfig] Function CALLED"); // ★★★ 日志1 ★★★
  const modelSelect = document.getElementById('model');
  console.log("[loadModelsFromConfig] document.getElementById('model') returned:", modelSelect); // ★★★ 日志2 ★★★
  if (!modelSelect) {
     console.error("模型选择下拉框 'model' 在HTML中未找到。将使用回退配置并提前返回。"); // ★★★ 日志3 ★★★
    modelConfigData = { models: [{ groupLabel: "Error", options: [{value: "error::error", text: "Config Error"}] }] }; // 提供最小回退
    editableModelConfig = JSON.parse(JSON.stringify(modelConfigData)); // 深拷贝
    return false;
  }
  modelSelect.innerHTML = '';
  console.log("[loadModelsFromConfig] About to fetch models.json"); // ★★★ 日志4 ★★★
  try {
    const response = await fetch('models.json' + '?t=' + new Date().getTime()); // 添加时间戳防止缓存
    if (!response.ok) {
      throw new Error(`加载 models.json 失败: ${response.status} ${response.statusText}`);
    }
    const config = await response.json();

    if (config && config.models && Array.isArray(config.models)) {
      modelConfigData = config; // 存储原始加载的数据
      editableModelConfig = JSON.parse(JSON.stringify(modelConfigData)); // 创建可编辑的深拷贝
      populateModelDropdown(editableModelConfig.models); // 使用可编辑的配置填充主下拉列表
      console.log("模型列表已成功从 models.json 加载并初始化编辑副本。");
      return true;
    } else {
      throw new Error("models.json 文件格式无效。期望格式为 { \"models\": [ ... ] }");
    }
  } catch (error) {
    console.error("加载或解析 models.json 时发生错误:", error);
    modelConfigData = { models: [{ groupLabel: "Fallback", options: [{value: "openai::gpt-3.5-turbo", text: "GPT-3.5 Turbo (配置加载失败)"}] }] };
    editableModelConfig = JSON.parse(JSON.stringify(modelConfigData));
    populateModelDropdown(editableModelConfig.models);
    alert("无法从 models.json 加载模型列表，已使用回退模型。请检查控制台获取详细错误信息。");
    return false;
  }
}

/**
 * 根据提供的模型数组填充主聊天界面的模型下拉列表。
 * @param {Array} modelsArray - 模型配置数组，格式同 models.json 中的 models 数组。
 */
function populateModelDropdown(modelsArray) {
  const modelSelect = document.getElementById('model');
  if (!modelSelect) return;
  modelSelect.innerHTML = ''; // 清空

  if (!modelsArray || modelsArray.length === 0) {
      const fallbackOption = document.createElement('option');
      fallbackOption.value = "openai::gpt-3.5-turbo";
      fallbackOption.textContent = "GPT-3.5 Turbo (无配置)";
      modelSelect.appendChild(fallbackOption);
      console.warn("populateModelDropdown 收到空或无效的模型数组，已使用回退选项。");
      return;
  }

  modelsArray.forEach(group => {
    if (group.groupLabel && group.options && Array.isArray(group.options)) {
      const optgroup = document.createElement('optgroup');
      optgroup.label = group.groupLabel;
      group.options.forEach(opt => {
        if (opt.value && opt.text) {
          const option = document.createElement('option');
          option.value = opt.value;
          option.textContent = opt.text;
          optgroup.appendChild(option);
        }
      });
      modelSelect.appendChild(optgroup);
    }
  });
  // 确保在填充后，如果当前对话存在，其模型被选中
  if (currentConversationId) {
    const conv = getCurrentConversation();
    if (conv && conv.model && modelSelect.querySelector(`option[value="${conv.model}"]`)) {
        modelSelect.value = conv.model;
    } else if (modelSelect.options.length > 0) {
        // 如果当前对话的模型不在新列表或无当前对话，默认选第一个
        // 这也可能在createNewConversation之前被调用
        if (conv) conv.model = modelSelect.options[0].value; // 更新对话数据
        // modelSelect.value = modelSelect.options[0].value; // UI 会自动选第一个
    }
  } else if (modelSelect.options.length > 0) {
      // modelSelect.value = modelSelect.options[0].value; // UI 会自动选第一个
  }
}


// 用于跟踪 SortableJS 实例，以便销毁和重建
let groupSortableInstance = null;
const optionSortableInstances = [];

/**
 * 渲染模型管理界面列表
 */
function renderModelManagementUI() {
 

  // ▼▼▼ 修改后的条件判断 ▼▼▼
  if (!editableModelConfig || !modelListEditor) {
    
    if (!editableModelConfig) console.error("  - editableModelConfig is falsy:", editableModelConfig);
    if (!modelListEditor) console.error("  - modelListEditor is falsy:", modelListEditor);
    
    // 可选：如果 modelListEditor 存在，但 editableModelConfig 不存在，可以在 UI 上显示更具体的提示
    if (modelListEditor && !editableModelConfig) {
        modelListEditor.innerHTML = '<p>错误：模型配置数据 (editableModelConfig) 未能正确加载。</p>';
    } else if (!modelListEditor && editableModelConfig) {
        // 这种情况比较少见，通常 modelListEditor 应该在 DOMContentLoaded 中被获取
        console.error("CRITICAL: modelListEditor is missing, cannot render model management UI even if config is ready.");
    } else if (!modelListEditor && !editableModelConfig) {
        // 两者都缺失，控制台已有错误
    }
    return; // 提前退出函数
  }
  // ▲▲▲ 修改结束 ▲▲▲

  // 后续的渲染逻辑只有在 editableModelConfig 和 modelListEditor 都有效时才会执行
  console.log("[renderModelManagementUI] Pre-conditions MET. Proceeding with rendering. Models count:", editableModelConfig.models ? editableModelConfig.models.length : 'N/A');
  
  modelListEditor.innerHTML = '';
  if (optionSortableInstances) { // 确保 optionSortableInstances 已初始化为数组
    optionSortableInstances.forEach(instance => instance.destroy());
    optionSortableInstances.length = 0;
  }


  // 检查 editableModelConfig.models 是否真的是一个数组
  if (!Array.isArray(editableModelConfig.models)) {
    console.error("[renderModelManagementUI] editableModelConfig.models is not an array!", editableModelConfig.models);
    modelListEditor.innerHTML = '<p>错误：模型数据格式不正确 (models 并非数组)。</p>';
    return;
  }
  if (editableModelConfig.models.length === 0) {
    console.warn("[renderModelManagementUI] editableModelConfig.models is empty. No models to render.");
    modelListEditor.innerHTML = '<p>没有可显示的模型。请通过 "添加新模型" 来创建，或检查 models.json 文件。</p>';
    // 即使为空，也尝试初始化组排序，以防 SortableJS 报错
    if (typeof Sortable !== 'undefined') {
        if (groupSortableInstance) groupSortableInstance.destroy();
        // 确保 modelListEditor 确实是一个可以应用 Sortable 的元素
        try {
            groupSortableInstance = Sortable.create(modelListEditor, {
                animation: 150,
                handle: '.model-group-header input.group-label-editor',
                // onEnd: ... (你的 onEnd 逻辑)
            });
        } catch (e) {
            console.error("Error initializing Sortable on empty modelListEditor:", e);
        }
    }
    return;
  }


  // --- editableModelConfig.models.forEach 循环 ---
  editableModelConfig.models.forEach((group, groupIndex) => {
    // ... (你提供的 forEach 内部的 DOM 创建和 SortableJS 初始化逻辑基本正确) ...
    // ... (确保 escapeHtml, deleteModelGroup, openModelFormForEdit, deleteModelOption 这些函数都已正确定义并在全局可用) ...
    const groupDiv = document.createElement('div');
    groupDiv.className = 'model-group-editor';
    groupDiv.dataset.groupIndex = groupIndex;

    const groupHeader = document.createElement('div');
    groupHeader.className = 'model-group-header';
    const groupLabelInput = document.createElement('input');
    groupLabelInput.type = 'text';
    groupLabelInput.className = 'group-label-editor';
    groupLabelInput.value = group.groupLabel || ""; // Fallback for undefined groupLabel
    groupLabelInput.dataset.groupIndex = groupIndex;
    groupLabelInput.addEventListener('change', (e) => {
        if (editableModelConfig.models[groupIndex]) { // Check if group still exists
             editableModelConfig.models[groupIndex].groupLabel = e.target.value;
        }
    });
    groupLabelInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });
    groupHeader.appendChild(groupLabelInput);
    const addOptionToGroupBtn = document.createElement('button');
    addOptionToGroupBtn.textContent = '+ 添加模型'; // 或者用一个加号图标
    addOptionToGroupBtn.className = 'add-option-to-group-btn action-btn'; // 使用你已有的 action-btn 样式
    addOptionToGroupBtn.title = `向组 "${group.groupLabel}" 添加新模型`;
    addOptionToGroupBtn.addEventListener('click', () => {
        // 调用 openModelFormForEdit，但只传递组标签，不传递选项索引 (表示是添加新模型到这个组)
        if (typeof openModelFormForEdit === 'function') {
            openModelFormForEdit(undefined, undefined, group.groupLabel); // 第三个参数是组名
        }
    });
    groupHeader.appendChild(addOptionToGroupBtn);

    const deleteGroupBtn = document.createElement('button');
    deleteGroupBtn.textContent = '删除组';
    deleteGroupBtn.className = 'danger-text';
    deleteGroupBtn.onclick = () => { if (typeof deleteModelGroup === 'function') deleteModelGroup(groupIndex); };
    groupHeader.appendChild(deleteGroupBtn);
    groupDiv.appendChild(groupHeader);

    const optionsUl = document.createElement('ul');
    optionsUl.className = 'model-group-options';
    optionsUl.dataset.groupIndex = groupIndex;

    if (group.options && Array.isArray(group.options)) { // Check if group.options exists and is an array
        group.options.forEach((option, optionIndex) => {
            const optionLi = document.createElement('li');
            optionLi.className = 'model-option-editor';
            optionLi.dataset.groupIndex = groupIndex;
            optionLi.dataset.optionIndex = optionIndex;
            // Ensure escapeHtml is defined and works, or remove it if text is trusted
            const safeText = typeof escapeHtml === 'function' ? escapeHtml(option.text || "") : (option.text || "");
            const safeValue = typeof escapeHtml === 'function' ? escapeHtml(option.value || "") : (option.value || "");

            optionLi.innerHTML = `
                <div class="details">
                <strong>${safeText}</strong>
                <span>Value: ${safeValue}</span>
                </div>
                <div class="actions">
                <button onclick="if(typeof openModelFormForEdit === 'function') openModelFormForEdit(${groupIndex}, ${optionIndex});">编辑</button>
                <button class="danger-text" onclick="if(typeof deleteModelOption === 'function') deleteModelOption(${groupIndex}, ${optionIndex});">删除</button>
                </div>
            `;
            optionsUl.appendChild(optionLi);
        });
    }
    groupDiv.appendChild(optionsUl);
    modelListEditor.appendChild(groupDiv);

    if (typeof Sortable !== 'undefined' && group.options && Array.isArray(group.options)) { // Also check group.options here
        try {
            const osInstance = Sortable.create(optionsUl, {
                animation: 150,
                group: `options-${groupIndex}`,
                handle: '.model-option-editor',
                onEnd: (evt) => {
                    const grpIdx = parseInt(evt.from.dataset.groupIndex);
                    if (editableModelConfig.models[grpIdx] && editableModelConfig.models[grpIdx].options) {
                        const movedOption = editableModelConfig.models[grpIdx].options.splice(evt.oldDraggableIndex, 1)[0];
                        editableModelConfig.models[grpIdx].options.splice(evt.newDraggableIndex, 0, movedOption);
                        renderModelManagementUI();
                    }
                }
            });
            optionSortableInstances.push(osInstance);
        } catch(e) { console.error("Error initializing Sortable for options list:", e); }
    }
  }); // --- editableModelConfig.models.forEach 结束 ---

  // --- 启用模型组排序 ---
  if (typeof Sortable !== 'undefined') {
    if (groupSortableInstance) groupSortableInstance.destroy();
    try {
        groupSortableInstance = Sortable.create(modelListEditor, {
            animation: 150,
            handle: '.model-group-header input.group-label-editor',
            onEnd: (evt) => {
                const movedGroup = editableModelConfig.models.splice(evt.oldDraggableIndex, 1)[0];
                editableModelConfig.models.splice(evt.newDraggableIndex, 0, movedGroup);
                renderModelManagementUI();
            }
        });
    } catch(e) { console.error("Error initializing Sortable for group list:", e); }
  }
}

/**
 * 打开模型表单进行添加或编辑
 * @param {number} [groupIndex] - 编辑时提供，组索引
 * @param {number} [optionIndex] - 编辑时提供，选项索引
 */
window.openModelFormForEdit = function(groupIndex, optionIndex, presetGroupLabel = '') { // 暴露到全局以便 HTML onclick 调用
  
  modelForm.reset();
  document.getElementById('edit-group-index').value = '';
  document.getElementById('edit-option-index').value = '';
   const groupLabelInput = document.getElementById('model-group-label');
  if (groupLabelInput) {
      groupLabelInput.value = presetGroupLabel || ''; // 如果 presetGroupLabel 是 undefined 或 null，则设为空字符串
  } else {
      console.error("Element with ID 'model-group-label' not found in the form.");
  }

  if (typeof groupIndex !== 'undefined' && typeof optionIndex !== 'undefined') {
    // 编辑模式
    const group = editableModelConfig.models[groupIndex];
    const option = group.options[optionIndex];
    modelFormTitle.textContent = '编辑模型';
    document.getElementById('model-group-label').value = group.groupLabel;
    document.getElementById('model-text').value = option.text;
    document.getElementById('model-value').value = option.value;
    document.getElementById('edit-group-index').value = groupIndex;
    document.getElementById('edit-option-index').value = optionIndex;
  } else {
    // 添加模式
    modelFormTitle.textContent = '添加新模型';
  }
  modelFormModal.style.display = 'flex';
}

/**
 * 关闭模型表单模态框
 */
function closeModelForm() {
  modelFormModal.style.display = 'none';
}

/**
 * 处理模型表单提交
 */
modelForm = document.getElementById('model-form'); 
modelForm.addEventListener('submit', function(event) {
  event.preventDefault();
  const groupLabel = document.getElementById('model-group-label').value.trim();
  const modelText = document.getElementById('model-text').value.trim();
  const modelValue = document.getElementById('model-value').value.trim();

  const editGroupIndex = document.getElementById('edit-group-index').value;
  const editOptionIndex = document.getElementById('edit-option-index').value;

  if (!groupLabel || !modelText || !modelValue) {
    alert('所有字段均为必填项！');
    return;
  }

  const newOptionData = { text: modelText, value: modelValue };

  if (editGroupIndex !== '' && editOptionIndex !== '') {
    // 编辑现有模型
    const groupIndex = parseInt(editGroupIndex);
    const optionIndex = parseInt(editOptionIndex);
    const targetGroupLabel = editableModelConfig.models[groupIndex].groupLabel;

    if (targetGroupLabel !== groupLabel) {
        // 用户更改了组标签，需要移动模型到新组或现有同名组
        // 1. 从原组删除
        editableModelConfig.models[groupIndex].options.splice(optionIndex, 1);
        if (editableModelConfig.models[groupIndex].options.length === 0) { // 如果原组空了，删除原组
            editableModelConfig.models.splice(groupIndex, 1);
        }
        // 2. 添加到新组或现有组
        let existingGroup = editableModelConfig.models.find(g => g.groupLabel === groupLabel);
        if (existingGroup) {
            existingGroup.options.push(newOptionData);
        } else {
            editableModelConfig.models.push({ groupLabel: groupLabel, options: [newOptionData] });
        }
    } else {
        // 仍在原组内编辑
        editableModelConfig.models[groupIndex].options[optionIndex] = newOptionData;
    }

  } else {
    // 添加新模型
    let group = editableModelConfig.models.find(g => g.groupLabel === groupLabel);
    if (group) {
      group.options.push(newOptionData);
    } else {
      editableModelConfig.models.push({ groupLabel: groupLabel, options: [newOptionData] });
    }
  }

  renderModelManagementUI();
  closeModelForm();
});

/**
 * 删除指定索引的模型组
 * @param {number} groupIndex 组索引
 */
window.deleteModelGroup = function(groupIndex) {
    if (confirm(`确定要删除模型组 "${editableModelConfig.models[groupIndex].groupLabel}" 及其所有模型吗？`)) {
        editableModelConfig.models.splice(groupIndex, 1);
        renderModelManagementUI();
    }
}


/**
 * 删除指定模型选项
 * @param {number} groupIndex 组索引
 * @param {number} optionIndex 选项索引
 */
window.deleteModelOption = function(groupIndex, optionIndex) { // 暴露到全局
  if (confirm(`确定要删除模型 "${editableModelConfig.models[groupIndex].options[optionIndex].text}" 吗？`)) {
    editableModelConfig.models[groupIndex].options.splice(optionIndex, 1);
    // 如果组变空了，可以选择删除该组
    if (editableModelConfig.models[groupIndex].options.length === 0) {
      if (confirm(`模型组 "${editableModelConfig.models[groupIndex].groupLabel}" 已空，是否删除该组？`)) {
        editableModelConfig.models.splice(groupIndex, 1);
      }
    }
    renderModelManagementUI();
  }
}

/**
 * 保存当前编辑的模型配置到下载文件，并更新主聊天界面的下拉列表
 */
async function saveModelsToFile() {
  if (!editableModelConfig) {
    alert('没有模型配置可供保存。');
    return;
  }

  // 清理空组和空选项
  const cleanedModelConfig = {
    models: editableModelConfig.models
      .filter(group => (group.options && group.options.length > 0) || (group.groupLabel && group.groupLabel.trim() !== ""))
      .map(group => ({
        groupLabel: group.groupLabel || "",
        options: group.options ? group.options.filter(opt => (opt.text && opt.text.trim() !== "") && (opt.value && opt.value.trim() !== "")) : []
      }))
      .filter(group => (group.options && group.options.length > 0) || (group.groupLabel && group.groupLabel.trim() !== ""))
  };

  console.log("[saveModelsToFile] Attempting to save to local server. Data:", JSON.parse(JSON.stringify(cleanedModelConfig)));

  try {
    const response = await fetch('/.netlify/functions/save-models-local', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(cleanedModelConfig),
    });

    const resultText = await response.text();
    let result;
    try {
      result = JSON.parse(resultText);
    } catch (e) {
      console.error("Failed to parse JSON response from save-models-local:", resultText);
      throw new Error(`保存操作的服务器响应无效: ${resultText.substring(0, 100)}`);
    }

    if (response.ok) {
      alert(result.message || '模型配置已成功保存到本地！');
      // 更新主聊天界面的模型下拉列表以立即反映更改
      modelConfigData = JSON.parse(JSON.stringify(editableModelConfig));
      populateModelDropdown(editableModelConfig.models);

      // 确保当前对话的模型在新列表中仍然有效
      if (currentConversationId) {
        const conv = getCurrentConversation();
        if (conv && conv.model) {
          const modelSelect = document.getElementById('model');
          if (modelSelect.querySelector(`option[value="${conv.model}"]`)) {
            modelSelect.value = conv.model;
          } else if (modelSelect.options.length > 0) {
            // 如果旧模型不在新列表，将对话模型更新为列表中的第一个
            conv.model = modelSelect.options[0].value;
            saveConversations(); // 保存对话的更改
            modelSelect.value = conv.model; // UI同步
            alert(`当前对话使用的模型 "${conv.model}" 在新配置中不存在，已自动切换到 "${modelSelect.options[0].text}"。`);
          }
        }
      }
    } else {
      throw new Error(result.message || `保存失败，状态码: ${response.status}`);
    }
  } catch (error) {
    console.error("保存模型配置到本地服务器失败:", error);
    alert(`保存模型配置失败：${error.message}`);
  }
}


// --- DOMContentLoaded: 页面加载完成后的主要设置和初始化 ---
document.addEventListener('DOMContentLoaded', async () => {
    // 初始化全局 DOM 元素引用
    filePreviewArea = document.getElementById('file-preview-area');
    modelManagementArea = document.getElementById('model-management-area');
    modelListEditor = document.getElementById('model-list-editor');
    modelFormModal = document.getElementById('model-form-modal');
    modelForm = document.getElementById('model-form');
    sidebarElement = document.querySelector('.sidebar');
    modelFormTitle = document.getElementById('model-form-title');
    chatSettingsBtnInlineElement = document.getElementById('chat-settings-btn-inline');
    inlineChatSettingsPanel = document.getElementById('inline-chat-settings-panel');
    temperatureInputInline = document.getElementById('temperature-input-inline');
    temperatureValueDisplayInline = document.getElementById('temperature-value-inline');

 // --- 为行内聊天设置按钮添加事件监听器 ---
    if (chatSettingsBtnInlineElement && inlineChatSettingsPanel) {
        chatSettingsBtnInlineElement.addEventListener('click', (event) => {
            event.stopPropagation();
            // 使用 classList.toggle 来切换一个 'active' 或 'visible' 类更佳，
            // 但直接操作 style.display 也可以，确保与 CSS 初始状态一致。
            const isCurrentlyVisible = inlineChatSettingsPanel.style.display === 'block' || inlineChatSettingsPanel.style.display === 'flex'; // 根据你CSS如何显示它
            
            if (isCurrentlyVisible) {
                inlineChatSettingsPanel.style.display = 'none';
                console.log("Inline chat settings panel HIDDEN");
            } else {
                // ★★★ 显示面板时，确保CSS使其可见 ★★★
                // 你在CSS中用的是 .inline-chat-settings-panel { display: flex; } (如果你希望内容flex排列)
                // 或者 .inline-chat-settings-panel { display: block; }
                // 我们这里用 block 来匹配你HTML中的 style="display: none;"
                inlineChatSettingsPanel.style.display = 'block'; 
                console.log("Inline chat settings panel SHOWN (display: block)");
            }
        });

        // 点击页面其他地方关闭行内设置面板
        document.addEventListener('click', (event) => {
            if (inlineChatSettingsPanel && 
                (inlineChatSettingsPanel.style.display === 'block' || inlineChatSettingsPanel.style.display === 'flex') &&
                chatSettingsBtnInlineElement) {
                
                const clickedOnButtonOrPanel = 
                    (chatSettingsBtnInlineElement.contains(event.target) || event.target === chatSettingsBtnInlineElement) ||
                    inlineChatSettingsPanel.contains(event.target);

                if (!clickedOnButtonOrPanel) {
                    inlineChatSettingsPanel.style.display = 'none';
                    console.log("Inline chat settings panel closed due to outside click.");
                }
            }
        });
        // 防止点击面板内部导致关闭
        inlineChatSettingsPanel.addEventListener('click', (event) => {
            event.stopPropagation();
        });

    } else {
        if (!chatSettingsBtnInlineElement) console.warn("DOMContentLoaded: Button 'chat-settings-btn-inline' not found!");
        if (!inlineChatSettingsPanel) console.warn("DOMContentLoaded: Panel 'inline-chat-settings-panel' not found!");
    }

    // --- 初始化行内温度输入框 ---
    const defaultTemperature = 0.70;
    if (temperatureInputInline && temperatureValueDisplayInline) {
        let currentTemp = parseFloat(localStorage.getItem('model-temperature'));
        if (isNaN(currentTemp) || currentTemp < 0 || currentTemp > 2) {
            currentTemp = defaultTemperature;
        }
        currentTemp = Math.round(currentTemp / 0.01) * 0.01;
        const formattedTemp = currentTemp.toFixed(2);

        temperatureInputInline.value = formattedTemp;
        temperatureValueDisplayInline.textContent = formattedTemp;

        temperatureInputInline.addEventListener('change', () => { // 使用 'change' 事件
            let newTemp = parseFloat(temperatureInputInline.value);
            if (isNaN(newTemp)) {
                const storedTemp = parseFloat(localStorage.getItem('model-temperature') || defaultTemperature);
                const resetValue = (Math.round(storedTemp / 0.01) * 0.01).toFixed(2);
                temperatureInputInline.value = resetValue;
                temperatureValueDisplayInline.textContent = resetValue;
                return;
            }
            if (newTemp < 0) newTemp = 0;
            if (newTemp > 2) newTemp = 2;
            newTemp = Math.round(newTemp / 0.01) * 0.01;
            const newFormattedTemp = newTemp.toFixed(2);
            temperatureInputInline.value = newFormattedTemp;
            temperatureValueDisplayInline.textContent = newFormattedTemp;
            localStorage.setItem('model-temperature', newFormattedTemp.toString());
            // ... (可选的同步主设置页面滑块逻辑) ...
        });
        temperatureInputInline.addEventListener('keydown', (event) => { /* ... Enter键处理 ... */ });
    } else {
        if (!temperatureInputInline) console.warn("DOMContentLoaded: Input 'temperature-input-inline' not found!");
        if (!temperatureValueDisplayInline) console.warn("DOMContentLoaded: Span 'temperature-value-inline' not found!");
    }
    

    if (modelFormTitle) {
        console.log("DOMContentLoaded: 'modelFormTitle' was SUCCESSFULLY INITIALIZED to:", modelFormTitle);
    } else {
        console.error("DOMContentLoaded: CRITICAL - 'modelFormTitle' (element with ID 'model-form-title') was NOT FOUND in the DOM during initialization. It is NULL.");
    }
    
    console.log("DEBUG DOMContentLoaded: DOM fully loaded and parsed.");

    // 0. 首先从配置文件加载模型列表
    console.log("DEBUG DOMContentLoaded: Attempting to load models from config...");
    const modelsLoadedSuccessfully = await loadModelsFromConfig();
    console.log(`DEBUG DOMContentLoaded: Models loaded status: ${modelsLoadedSuccessfully ? 'Success' : 'Failure'}`);
    
    console.log("DEBUG DOMContentLoaded: typeof renderModelManagementUI AFTER loadModelsFromConfig:", typeof renderModelManagementUI); // ★★★ 检查这条日志 ★★★
    // 1. 主题初始化
    const storedTheme = localStorage.getItem('theme') || 'dark'; // Default to dark if nothing stored
    applyTheme(storedTheme);
    const toggleThemeBtn = document.getElementById('toggle-theme-btn');
    if (toggleThemeBtn) {
        toggleThemeBtn.addEventListener('click', toggleTheme);
    } else {
        console.warn("DOMContentLoaded: Toggle theme button 'toggle-theme-btn' not found.");
    }

    // 2. UI 缩放初始化
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
    } else {
        console.warn("DOMContentLoaded: UI scale options container 'ui-scale-options' not found.");
    }

    // 3. API Key 管理 (已移除前端逻辑)
    console.info("DOMContentLoaded: Frontend API Key management logic is removed. Keys should be managed via backend/environment variables.");
    // const providerSelect = document.getElementById('api-provider'); // Retain for reference if needed

    

    // 5. Textarea (用户输入框) 自动调整高度 和 Enter 发送
    const promptTextarea = document.getElementById('prompt');
    if (promptTextarea) {
        const initialMinHeight = parseInt(window.getComputedStyle(promptTextarea).minHeight, 10) || 42;
        const maxHeight = parseInt(window.getComputedStyle(promptTextarea).maxHeight, 10) || 200;
        promptTextarea.style.height = `${initialMinHeight}px`;
        promptTextarea.style.overflowY = 'hidden';

        const autoResizeTextarea = () => {
            promptTextarea.style.height = `${initialMinHeight}px`; // Reset height to shrink if needed
            let scrollHeight = promptTextarea.scrollHeight;
            let newHeight = scrollHeight;
            if (newHeight < initialMinHeight) newHeight = initialMinHeight;
            if (newHeight > maxHeight) {
                newHeight = maxHeight;
                promptTextarea.style.overflowY = 'auto';
            } else {
                promptTextarea.style.overflowY = 'hidden';
            }
            promptTextarea.style.height = `${newHeight}px`;
        };
        promptTextarea.addEventListener('input', autoResizeTextarea);
        promptTextarea.addEventListener('paste', () => setTimeout(autoResizeTextarea, 0)); // Handle paste

        // Ensure keydown for Enter is bound only once
        if (!promptTextarea.dataset.keydownBound) {
            promptTextarea.addEventListener('keydown', e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (typeof send === 'function') {
                        send();
                    } else {
                        console.error("DOMContentLoaded: send function is not defined when Enter key was pressed.");
                    }
                }
            });
            promptTextarea.dataset.keydownBound = 'true';
        }
    } else {
        console.warn("DOMContentLoaded: Prompt textarea 'prompt' not found.");
    }

    // 6. 对话和聊天区域初始化
    if (typeof loadConversations === 'function') loadConversations();
    if (typeof renderConversationList === 'function') renderConversationList();

    const modelSelectForInit = document.getElementById('model');
    if (modelSelectForInit && modelSelectForInit.options.length > 0) {
        const nonArchivedConversations = conversations.filter(c => !c.archived);
        if (nonArchivedConversations.length > 0) {
            if (typeof loadConversation === 'function') loadConversation(nonArchivedConversations[0].id);
        } else if (conversations.length > 0) { // Fallback to first archived if no non-archived
            if (typeof loadConversation === 'function') loadConversation(conversations[0].id);
        } else { // No conversations at all
            if (typeof createNewConversation === 'function') createNewConversation();
        }
    } else {
        console.warn("DOMContentLoaded: Model select dropdown is empty or not found during initial chat setup. Attempting to create a new conversation.");
        if (typeof createNewConversation === 'function') createNewConversation();
    }
    if (typeof enableInlineTitleEdit === 'function') enableInlineTitleEdit();


    // --- 7. 主要按钮和控件的事件监听器 (Single binding point for each) ---

    const sendBtn = document.getElementById('send-btn');
    if (sendBtn) {
        sendBtn.addEventListener('click', e => {
            e.preventDefault();
            if (typeof send === 'function') send();
            else console.error("DOMContentLoaded: send function not defined for sendBtn click.");
        });
    } else { console.warn("DOMContentLoaded: Send button 'send-btn' not found."); }

    const newConvBtn = document.getElementById('new-conv-btn');
    if (newConvBtn) {
        newConvBtn.addEventListener('click', () => {
            if (window.isModelManagementActive && typeof showChatArea === 'function') showChatArea();
            if (typeof createNewConversation === 'function') createNewConversation();
            else console.error("DOMContentLoaded: createNewConversation function not defined for newConvBtn click.");
        });
    } else { console.warn("DOMContentLoaded: New conversation button 'new-conv-btn' not found."); }

    const archiveCurrentBtn = document.getElementById('archive-current-btn');
    if (archiveCurrentBtn) {
        archiveCurrentBtn.addEventListener('click', () => {
            if (currentConversationId && typeof toggleArchive === 'function') toggleArchive(currentConversationId);
        });
    } else { console.warn("DOMContentLoaded: Archive button 'archive-current-btn' not found."); }

    const deleteCurrentBtn = document.getElementById('delete-current-btn');
    if (deleteCurrentBtn) {
        deleteCurrentBtn.addEventListener('click', () => {
            if (!currentConversationId) return;
            const conv = typeof getCurrentConversation === 'function' ? getCurrentConversation() : null;
            if (conv && confirm(`确定要删除当前会话「${conv.title}」吗？此操作无法恢复。`)) {
                if (typeof deleteConversation === 'function') deleteConversation(currentConversationId);
            }
        });
    } else { console.warn("DOMContentLoaded: Delete current conversation button 'delete-current-btn' not found."); }

    const modelSelect = document.getElementById('model');
    if (modelSelect) {
        modelSelect.addEventListener('change', (e) => {
            const conv = typeof getCurrentConversation === 'function' ? getCurrentConversation() : null;
            if (conv) {
                conv.model = e.target.value;
                if (typeof saveConversations === 'function') saveConversations();
            }
        });
        // Initial model selection sync (already handled by loadConversation or createNewConversation)
    } else { console.warn("DOMContentLoaded: Model select dropdown 'model' not found."); }

    const showSettingsBtn = document.getElementById('show-settings-btn');
    if (showSettingsBtn) {
        showSettingsBtn.addEventListener('click', () => {
            if (typeof showSettings === 'function') showSettings();
        });
    } else { console.warn("DOMContentLoaded: Show settings button 'show-settings-btn' not found."); }

    const backToChatBtn = document.getElementById('back-to-chat-btn');
    if (backToChatBtn) {
        backToChatBtn.addEventListener('click', () => {
            if (typeof showChatArea === 'function') showChatArea();
        });
    } else { console.warn("DOMContentLoaded: Back to chat button 'back-to-chat-btn' (from settings) not found."); }

    const exportHistoryBtn = document.getElementById('export-history-btn');
    if (exportHistoryBtn) {
        exportHistoryBtn.addEventListener('click', () => {
            if (typeof exportAllHistory === 'function') exportAllHistory();
        });
    } else { console.warn("DOMContentLoaded: Export history button 'export-history-btn' not found."); }

    const clearAllHistoryBtn = document.getElementById('clear-all-history-btn');
    if (clearAllHistoryBtn) {
        clearAllHistoryBtn.addEventListener('click', () => {
            if (typeof clearAllHistory === 'function') clearAllHistory();
        });
    } else { console.warn("DOMContentLoaded: Clear all history button 'clear-all-history-btn' not found."); }

    // --- 文件导入功能 ---
    const importFileInput = document.getElementById('import-file');
    if (importFileInput) {
        importFileInput.addEventListener('change', async e => {
            const file = e.target.files[0];
            if (!file) return;
            try {
                const text = await file.text();
                const importedConvs = JSON.parse(text);
                if (!Array.isArray(importedConvs)) throw new Error('导入的 JSON 顶层必须是一个对话数组');
                let importedCount = 0;
                importedConvs.forEach(importedConv => {
                    if (importedConv && typeof importedConv === 'object' && 'id' in importedConv && 'title' in importedConv && 'messages' in importedConv) {
                        if (!conversations.find(c => c.id === importedConv.id)) {
                            importedConv.messages = (Array.isArray(importedConv.messages) ? importedConv.messages : []).filter(m => m && m.role && typeof m.content === 'string');
                            importedConv.archived = typeof importedConv.archived === 'boolean' ? importedConv.archived : false;
                            importedConv.isNew = false;
                            importedConv.model = importedConv.model || (typeof getCurrentModel === 'function' ? getCurrentModel() : 'default-model');
                            conversations.push(importedConv);
                            importedCount++;
                        }
                    } else { console.warn('DOMContentLoaded: Skipped invalid conversation object during import:', importedConv); }
                });
                if (importedCount > 0) {
                    if (typeof saveConversations === 'function') saveConversations();
                    if (typeof renderConversationList === 'function') renderConversationList();
                    if (currentConversationId === null && conversations.length > 0) {
                        const firstNonArchived = conversations.filter(c => !c.archived)[0];
                        if (typeof loadConversation === 'function') loadConversation(firstNonArchived ? firstNonArchived.id : conversations[0].id);
                    }
                    alert(`成功导入 ${importedCount} 条新对话。`);
                } else { alert('没有导入新的对话。'); }
            } catch (err) {
                console.error('DOMContentLoaded: Error importing history file:', err);
                alert('导入失败：' + err.message);
            } finally {
                importFileInput.value = ''; // Clear the input
            }
        });
    } else { console.warn("DOMContentLoaded: Import file input 'import-file' not found."); }

    // --- 模型管理界面按钮事件监听 ---
    const showModelManagementBtn = document.getElementById('show-model-management-btn');
if (showModelManagementBtn) {
    showModelManagementBtn.addEventListener('click', () => {
        console.log("======================================================");
        console.log("[Click Event] 'Show Model Management' BUTTON CLICKED!");
        console.log("[Click Event] Checking condition: editableModelConfig");
        console.log("  - Value:", editableModelConfig); // 打印原始值
        console.log("  - Is Truthy?:", !!editableModelConfig); // 明确判断是否为真值
        if (editableModelConfig) { // 如果存在，打印其 models 属性
            console.log("  - editableModelConfig.models:", JSON.parse(JSON.stringify(editableModelConfig.models)));
            console.log("  - Is models an array?:", Array.isArray(editableModelConfig.models));
            console.log("  - models length:", editableModelConfig.models ? editableModelConfig.models.length : 'N/A');
        }

        console.log("[Click Event] Checking condition: typeof renderModelManagementUI");
        console.log("  - typeof:", typeof renderModelManagementUI);
        console.log("  - Is function?:", typeof renderModelManagementUI === 'function');
        console.log("======================================================");

        // 原来的切换显示区域的逻辑
        const chatArea = document.getElementById('chat-area');
        const settingsArea = document.getElementById('settings-area');
        if (chatArea) chatArea.style.display = 'none';
        if (settingsArea) settingsArea.style.display = 'none';
        if (modelManagementArea) modelManagementArea.style.display = 'flex';
        if (sidebarElement) sidebarElement.style.display = 'none';
        isModelManagementActive = true;

        // 原来的条件判断
        if (editableModelConfig && typeof renderModelManagementUI === 'function') {
            console.log("[Click Event] Conditions MET. Calling renderModelManagementUI().");
            renderModelManagementUI();
        } else if (modelListEditor) {
            console.log("[Click Event] Conditions NOT MET. Displaying 'not ready' message.");
            if (!editableModelConfig) console.log("  Reason: editableModelConfig is Falsy.");
            if (typeof renderModelManagementUI !== 'function') console.log("  Reason: renderModelManagementUI is NOT a function.");
            modelListEditor.innerHTML = '<p>模型配置数据或渲染函数未准备好。</p>';
        } else {
            console.error("[Click Event] Conditions NOT MET and modelListEditor is also not available!");
        }
    });
    
} else { console.warn("DOMContentLoaded: Show model management button 'show-model-management-btn' not found."); }
    const backToChatFromModelManagementBtn = document.getElementById('back-to-chat-from-model-management-btn');
    if (backToChatFromModelManagementBtn) {
        backToChatFromModelManagementBtn.addEventListener('click', () => {
            if (typeof showChatArea === 'function') showChatArea();
        });
    } else { console.warn("DOMContentLoaded: Back to chat (from model management) button not found."); }

    const addNewModelBtn = document.getElementById('add-new-model-btn');
    if (addNewModelBtn) {
        addNewModelBtn.addEventListener('click', () => {
            if (typeof openModelFormForEdit === 'function') openModelFormForEdit();
        });
    } else { console.warn("DOMContentLoaded: Add new model button 'add-new-model-btn' not found."); }

    const saveModelsToFileBtn = document.getElementById('save-models-to-file-btn');
    if (saveModelsToFileBtn) {
        saveModelsToFileBtn.addEventListener('click', () => {
            if (typeof saveModelsToFile === 'function') saveModelsToFile();
        });
    } else { console.warn("DOMContentLoaded: Save models to file button 'save-models-to-file-btn' not found."); }

    // Model Form Modal listeners
    if (modelFormModal && typeof closeModelForm === 'function') {
        const closeBtn = modelFormModal.querySelector('.close-modal-btn');
        if (closeBtn) closeBtn.addEventListener('click', closeModelForm);
        const cancelDetailBtn = document.getElementById('cancel-model-detail-btn');
        if (cancelDetailBtn) cancelDetailBtn.addEventListener('click', closeModelForm);
        window.addEventListener('click', (event) => { // Click outside to close
            if (event.target == modelFormModal) closeModelForm();
        });
    } else { console.warn("DOMContentLoaded: Model form modal 'model-form-modal' or closeModelForm function not defined."); }

    document.getElementById('add-new-model-btn')?.addEventListener('click', () => {
    if(typeof openModelFormForEdit === 'function') {
        openModelFormForEdit(undefined, undefined, ''); // ★★★ 确保这里传递空字符串作为 presetGroupLabel ★★★
    }
});
    // --- 行内文件上传按钮和聊天设置按钮的事件监听器 (CONSOLIDATED AND SINGLE BINDING) ---
    const uploadFileBtnInline = document.getElementById('upload-file-btn-inline');
    console.log("!!! uploadFileBtnInline CLICKED, triggering fileInputInline.click() !!!");
    const fileInputInline = document.getElementById('file-input-inline');
    const chatSettingsBtnInline = document.getElementById('chat-settings-btn-inline');
    console.log("uploadFileBtnInline element:", uploadFileBtnInline);
    console.log("fileInputInline element:", fileInputInline);

    if (uploadFileBtnInline && fileInputInline) {
        // Click on custom button triggers hidden file input
        uploadFileBtnInline.addEventListener('click', () => {
            fileInputInline.value = null; // Clear previous selection to allow re-selecting same file
            fileInputInline.click();
        });

        // Hidden file input 'change' event
        console.log("DEBUG DOMContentLoaded: Checking typeof handleFileSelection:", typeof handleFileSelection);
        if (typeof handleFileSelection === 'function') {
            fileInputInline.addEventListener('change', handleFileSelection); // SINGLE BINDING
            console.log("DEBUG DOMContentLoaded: 'change' event listener for fileInputInline BOUND SUCCESSFULLY (single binding).");
        } else {
            console.error("CRITICAL DOMContentLoaded: handleFileSelection IS NOT A FUNCTION at the time of binding for fileInputInline!");
        }
    } else {
        let missingInlineUploadElements = [];
        if (!uploadFileBtnInline) missingInlineUploadElements.push("'upload-file-btn-inline'");
        if (!fileInputInline) missingInlineUploadElements.push("'file-input-inline'");
        console.warn(`DOMContentLoaded: Inline file upload elements not fully found. Missing: ${missingInlineUploadElements.join(' and ')}.`);
    }

    
    
    console.log("DEBUG DOMContentLoaded: All initializations and event bindings complete.");
}); // DOMContentLoaded 事件监听器结束

// --- END OF FILE script.js ---