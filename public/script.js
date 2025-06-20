// --- START OF FILE script.js ---
console.log("script.js parsing started");



// ... 你所有的其他 script.js 代码从这里开始 ...

// 全局变量
let activeModel = '';
let conversations = [];
let isScrollingProgrammatically = false;
let userHasManuallyScrolledUp = false;

let currentConversationId = null;

// 初始化
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
let temperatureInputInline = null;
let inlineChatSettingsPanel = null;
let chatSettingsBtnInlineElement = null; // 用于 document click 事件
let thinkModeToggle = null;
let isManualThinkModeEnabled = false; // 用于手动思考模式
let showPresetPromptsBtn = null;
let presetPromptsListPanel = null;
let presetPromptsUl = null;
let loadedPresetPrompts = []; // 用于存储从 JSON 加载的预设 (如果用 JSON)
const QWEN_THINK_MODE_STORAGE_KEY = 'qwen-think-mode-enabled';
let maxTokensInputInline = null;
let currentMaxTokens = null; // 存储当前设置的最大Token数，可以是数字或null (表示使用API默认)
const MAX_TOKENS_STORAGE_KEY = 'chat-max-tokens';
const DEFAULT_MAX_TOKENS_PLACEHOLDER = 4096; // 用于 placeholder 或回退  
let submitActionBtn = null;
let isGeneratingResponse = false;
let currentAbortController = null;
const THINK_MODE_STORAGE_KEY = 'chat-think-mode-enabled'; 
let autoThinkModeToggle = null; // <-- 新增
let isAutoThinkModeEnabled = false; // <-- 新增
const AUTO_THINK_MODE_STORAGE_KEY = 'chat-auto-think-mode-enabled'; // <-- 新增
let isStreamingEnabled = true; // 默认开启流式输出
const STREAMING_ENABLED_STORAGE_KEY = 'chat-streaming-enabled';

let lastScrollTop = 0;

 
window.isNearBottomMessages = window.isNearBottomMessages || function() { return true; };



// --- 辅助函数 ---


async function handleFileSelection(event) {
  console.log("DEBUG: handleFileSelection function initiated."); // 日志文本已更正
  console.log("DEBUG handleFileSelection START: Raw uploadedFilesData is:", JSON.parse(JSON.stringify(uploadedFilesData))); // 日志文本已更正

  const files = event.target.files;
  const fileInputSource = event.target; // 保存对触发事件的 input 的引用

  if (!files || files.length === 0) {
    console.log("DEBUG: handleFileSelection - No files selected or files list is empty.");
    return;
  }
  console.log(`DEBUG: handleFileSelection - ${files.length} file(s) selected initially.`);

  const MAX_FILES = 5;
  // 使用 uploadedFilesData 保证通过 getter/setter
  if (uploadedFilesData.length + files.length > MAX_FILES) {
    showToast(`一次最多只能上传 ${MAX_FILES} 个文件。`, 'warning');
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
      showToast(`文件 "${file.name}" 过大 (超过 ${MAX_SIZE_MB}MB)。`, 'warning');
      continue; // 跳过此文件，继续处理下一个
    }

    try {
      console.log(`DEBUG: handleFileSelection - Attempting to read file: ${file.name}`);
      const base64String = await readFileAsBase64(file); // 调用全局 readFileAsBase64

      // 使用 uploadedFilesData.push 以确保通过 getter/setter
      uploadedFilesData.push({
        name: file.name,
        type: file.type,
        base64: base64String,
        fileObject: file
      });
      filesProcessedCount++; // <--- 正确增加计数器

      console.log(`DEBUG: handleFileSelection - File ADDED to uploadedFilesData: ${file.name}. Current count: ${uploadedFilesData.length}`);
    } catch (error) {
      console.error(`读取文件 "${file.name}" 失败:`, error);
      showToast(`无法读取文件 "${file.name}"。`,'error');
      // 即使读取失败，也应该 continue 到下一个文件
    }
  }
  // filesProcessedCount 现在会正确显示处理（尝试推送）的文件数量
  console.log(`DEBUG: handleFileSelection - Finished processing loop. ${filesProcessedCount} of ${files.length} files were attempted to be pushed.`);

  console.log("DEBUG: handleFileSelection - Calling renderFilePreview(). Current uploadedFilesData length:", uploadedFilesData.length);
  renderFilePreview(); // 调用全局 renderFilePreview

  // 在函数末尾打印数据状态 (在异步清空 input.value 之前)
 // console.log("DEBUG handleFileSelection END (before async input clear): _internalUploadedFilesData is:", JSON.parse(JSON.stringify(_internalUploadedFilesData)));
  console.log("DEBUG handleFileSelection END (before async input clear): uploadedFilesData (via getter) is:", JSON.parse(JSON.stringify(uploadedFilesData)));

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
    //console.log("DEBUG renderFilePreview START: _internalUploadedFilesData at start:", JSON.parse(JSON.stringify(_internalUploadedFilesData)));
    console.log("DEBUG renderFilePreview START: uploadedFilesData (getter) at start, length:", uploadedFilesData ? uploadedFilesData.length : 'undefined');

    // 1. 确认 filePreviewArea DOM 元素是否正确获取
    if (!filePreviewArea) {
        console.warn("renderFilePreview: CRITICAL - filePreviewArea DOM element is NULL or UNDEFINED. Cannot render previews.");
        return;
    }
    filePreviewArea.innerHTML = '';

    if (uploadedFilesData && uploadedFilesData.length > 0) {
        filePreviewArea.style.display = 'flex';

        uploadedFilesData.forEach((fileData, index) => {
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
    // console.log("DEBUG renderFilePreview END: uploadedFilesData (getter) at end, length:", uploadedFilesData ? uploadedFilesData.length : 'undefined');
}

function removeUploadedFile(indexToRemove) {
    console.log(`[removeUploadedFile] CALLED. Attempting to remove file at index: ${indexToRemove}`);
    console.log("[removeUploadedFile] uploadedFilesData BEFORE splice:", JSON.parse(JSON.stringify(uploadedFilesData)));

    if (indexToRemove >= 0 && indexToRemove < uploadedFilesData.length) {
        // 直接对 uploadedFilesData (即其背后的 _internalUploadedFilesData) 进行 splice 操作
        const removedFileArray = uploadedFilesData.splice(indexToRemove, 1); // splice 会修改原数组并返回被删除的元素数组
        
        if (removedFileArray.length > 0) {
            console.log(`[removeUploadedFile] File "${removedFileArray[0].name}" removed successfully.`);
        } else {
            console.warn("[removeUploadedFile] Splice operation did not seem to remove any element, though index was valid.");
        }
        
        console.log("[removeUploadedFile] uploadedFilesData AFTER splice:", JSON.parse(JSON.stringify(uploadedFilesData)));

        // ★★★ 关键：在数据修改后，必须调用 renderFilePreview() 来更新UI ★★★
        if (typeof renderFilePreview === 'function') {
            renderFilePreview();
            console.log("[removeUploadedFile] Called renderFilePreview() to update UI.");
        } else {
            console.error("[removeUploadedFile] CRITICAL - renderFilePreview function is not defined!");
        }
    } else {
        console.warn(`[removeUploadedFile] Invalid index or array already empty. Index: ${indexToRemove}, Current Length: ${uploadedFilesData.length}`);
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

// ▼▼▼ 用这个版本完整替换你现有的 loadConversations 函数 ▼▼▼
function loadConversations() {
  try {
    const data = localStorage.getItem('conversations');
    const parsedData = data ? JSON.parse(data) : [];
    if (Array.isArray(parsedData)) {
      conversations = parsedData;
      console.log(`%c[loadConversations] Successfully loaded ${conversations.length} conversations.`, "color: blue;");
    } else {
      conversations = [];
      console.warn("[loadConversations] Data from localStorage was not an array. Resetting.");
    }
  } catch (error) {
    console.error("[loadConversations] CRITICAL ERROR while loading/parsing:", error);
    showToast("加载历史对话失败！数据可能已损坏。", "error");
    conversations = [];
  }
}

/**
 * 将当前的 `conversations` 数组保存到 Local Storage。
 */
function saveConversations() {
    
  try {
        // ★★★ 在这里添加日志 ★★★
    const lastConv = conversations[conversations.length - 1];
    if (lastConv && lastConv.messages.length > 0) {
        const lastMsgInArray = lastConv.messages[lastConv.messages.length - 1];
        if (lastMsgInArray.role === 'assistant' || lastMsgInArray.role === 'model') {
            console.log('%c[SAVE CHECK 2] saveConversations 接收到的最后一条助手消息:', 'color: red; font-weight: bold;', JSON.parse(JSON.stringify(lastMsgInArray)));
        }
    }
    // 在序列化之前，创建一个不包含 File 对象的副本，防止循环引用或序列化错误
    const conversationsForStorage = conversations.map(conv => {
      // 创建一个对话的浅拷贝，以避免修改原始的 conversations 数组
      const convCopy = { ...conv };
      
      // 深度处理 messages 数组
      convCopy.messages = conv.messages.map(msg => {
        // --- 情况 1：处理带文件的用户消息 ---
        if (msg.role === 'user' && msg.content && typeof msg.content === 'object' && msg.content.files) {
          
          const msgCopy = { ...msg };
          const safeContent = { ...msgCopy.content };
          
          safeContent.files = safeContent.files.map(file => ({
            name: file.name,
            type: file.type
          }));
          
          msgCopy.content = safeContent;
          return msgCopy;
        }

        // --- ★★★ 核心修改：专门处理带 usage 数据的助手消息 ★★★ ---
        // 检查是否是助手消息，并且它有关联的 usage 数据
        if ((msg.role === 'assistant' || msg.role === 'model') && msg.usage) {
            // 创建一个消息的副本，以确保我们不会修改原始的 `conversations` 数组
            const msgCopyWithUsage = { ...msg };
            
            // usage 字段本身通常是可序列化的 JSON 对象，所以我们直接保留它。
            // msgCopyWithUsage.usage = msg.usage; // 这行是多余的，因为 ...msg 已经包含了它
            
            // 我们返回这个包含了 usage 数据的副本
            return msgCopyWithUsage;
        }

        // --- 情况 3：对于所有其他消息（不带文件的用户消息，不带 usage 的助手消息等）---
        // 直接返回原样即可，因为它们不包含需要清理的复杂对象
        return msg;
      });
      
      return convCopy;
    });

    // 将清理过的数据保存到 localStorage
    localStorage.setItem('conversations', JSON.stringify(conversationsForStorage));
    console.log("%c[saveConversations] Successfully saved a sanitized version of conversations.", "color: green;");

  } catch (error) {
    console.error("[saveConversations] CRITICAL ERROR while preparing or saving conversations:", error);
    // 在UI上给用户一个明确的提示
    showToast("保存对话失败！请检查控制台获取详细信息。", "error");
  }
}

// --- DOM 操作与渲染 ---

/**
 * 从指定的 DOM 容器中移除空的文本节点和空的 <p> 标签。
 * 也移除仅包含 <br> 的 <p> 标签或包含空白字符（包括  ）的 <p> 标签。
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
if (typeof marked !== 'undefined') {
  marked.setOptions({
    gfm: true, // 确保 GFM (GitHub Flavored Markdown) 是开启的，它能更好地处理表格
    breaks: true, // 自动将换行符转为 <br>
    // ★★★ 核心：如果您在使用 highlighter，确保它不会错误地处理表格 ★★★

  });
}

// --- START OF appendMessage MODIFICATION ---
function appendMessage(role, messageContent, modelForNote, reasoningText, conversationId, messageIndex, usage) {
    console.log(`[AppendMessage CALLED] Role: "${role}"`, { messageContent, reasoningText });

    const container = document.getElementById('messages');
    if (!container) {
        console.error("[AppendMessage] CRITICAL: Message container '#messages' not found.");
        return null;
    }

    const emptyChatPlaceholder = document.getElementById('empty-chat-placeholder');
    if (emptyChatPlaceholder) {
        emptyChatPlaceholder.style.display = 'none';
    }

    const messageWrapperDiv = document.createElement('div');
    messageWrapperDiv.className = `message-wrapper ${role === 'user' ? 'user-message-wrapper' : 'assistant-message-wrapper'}`;
    messageWrapperDiv.dataset.conversationId = conversationId; // 这些应该在loadConversation中被正确设置
    messageWrapperDiv.dataset.messageIndex = messageIndex;     // 或者在调用appendMessage时传递正确的ID和索引

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role === 'assistant' || role === 'model' ? 'assistant' : 'user'}`;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'text';

    const actionsContainer = document.createElement('div');
    actionsContainer.className = 'message-actions-container';

    if (role === 'system') {
        // ... (system message handling remains the same) ...
        const systemDiv = document.createElement('div');
        systemDiv.className = 'system-prompt-display';
        systemDiv.innerHTML = `<strong>系统指令:</strong><div class="system-prompt-content">${escapeHtml(String(messageContent))}</div>`;
        container.querySelector('.system-prompt-display')?.remove();
        container.insertBefore(systemDiv, container.firstChild);
        return systemDiv;
    }

    let finalMarkdown = "";
    if ((role === 'user') && messageContent && typeof messageContent.files !== 'undefined' && Array.isArray(messageContent.files) && messageContent.files.length > 0) {
        // ... (user attachments handling remains the same) ...
        const attachmentsContainer = document.createElement('div');
        attachmentsContainer.className = 'user-attachments-container';

        messageContent.files.forEach(file => {
            const attachmentItem = document.createElement('div');
            attachmentItem.className = 'attachment-item';
            attachmentItem.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-paperclip" viewBox="0 0 16 16">
                    <path d="M4.5 3a2.5 2.5 0 0 1 5 0v9a1.5 1.5 0 0 1-3 0V5a.5.5 0 0 1 1 0v8.5a.5.5 0 0 0 1 0V3a1.5 1.5 0 1 0-3 0v9a2.5 2.5 0 0 0 5 0V5a.5.5 0 0 1 1 0v8.5a3.5 3.5 0 1 1-7 0V3z"/>
                </svg>
                <span>${escapeHtml(file.name)}</span>
            `;
            attachmentsContainer.appendChild(attachmentItem);
        });
        messageDiv.appendChild(attachmentsContainer);
    }
    // ... (finalMarkdown population remains the same) ...
    if (typeof messageContent === 'string') {
        finalMarkdown = messageContent;
    } else if (messageContent && typeof messageContent.text !== 'undefined') {
        finalMarkdown = messageContent.text || "";
    } else if (Array.isArray(messageContent) && messageContent[0]?.type === 'text' && messageContent[0]?.text) {
        finalMarkdown = messageContent[0].text;
    } else if (messageContent) {
        try {
            finalMarkdown = JSON.stringify(messageContent, null, 2);
        } catch (e) {
            finalMarkdown = "[无法渲染的复杂内容]";
        }
    }

    // ▼▼▼ MODIFICATION START ▼▼▼
    let reasoningDivElement = null; // Declare one variable for the reasoning div

    if (role === 'assistant' || role === 'model') {
        const reasoningBlockDiv = document.createElement('div');
        reasoningBlockDiv.className = 'reasoning-block';
        
        const labelContainer = document.createElement('div');
        labelContainer.className = 'reasoning-label';
        
        const labelText = document.createElement('span');
        labelText.textContent = '思考过程:';
        labelContainer.appendChild(labelText);

        const copyBtn = document.createElement('button');
        copyBtn.className = 'copy-reasoning-btn';
        copyBtn.textContent = '复制';
        copyBtn.type = 'button';
        labelContainer.appendChild(copyBtn);

        // Assign to the function-scoped variable
        reasoningDivElement = document.createElement('div'); 
        reasoningDivElement.className = 'reasoning-content';
        
        const hasValidReasoning = typeof reasoningText === 'string' && reasoningText.trim() !== '';
        if (hasValidReasoning) {
            reasoningDivElement.textContent = reasoningText;
        } else {
            reasoningBlockDiv.classList.add('reasoning-block-empty'); 
        }

        copyBtn.addEventListener('click', e => {
            e.stopPropagation();
            // Use reasoningDivElement here
            navigator.clipboard.writeText(reasoningDivElement.textContent || "").then(() => {
                copyBtn.textContent = '已复制!';
                setTimeout(() => { copyBtn.textContent = '复制'; }, 2000);
            }).catch(() => {
                copyBtn.textContent = '复制失败';
                setTimeout(() => { copyBtn.textContent = '复制'; }, 2000);
            });
        });
        
        reasoningBlockDiv.appendChild(labelContainer);
        reasoningBlockDiv.appendChild(reasoningDivElement); // Append the correctly assigned div
        
        messageDiv.appendChild(reasoningBlockDiv);
    }
    // ▲▲▲ MODIFICATION END ▲▲▲
    
    if (finalMarkdown.trim()) {
        let contentToRender = (role === 'user') ? finalMarkdown.trim() : finalMarkdown;
        contentDiv.innerHTML = marked.parse(contentToRender);
    }
    if (contentDiv.lastChild && contentDiv.lastChild.nodeType === Node.TEXT_NODE && !contentDiv.lastChild.textContent.trim()) {
        contentDiv.removeChild(contentDiv.lastChild);
    }
    messageDiv.appendChild(contentDiv);

    contentDiv.querySelectorAll('pre').forEach(pre => {
        // ... (copy button for pre blocks remains the same) ...
        if (pre.querySelector('.copy-btn')) return;
        pre.style.position = 'relative';
        const btn = document.createElement('button');
        btn.className = 'copy-btn';
        btn.textContent = '复制';
        btn.addEventListener('click', e => {
            e.stopPropagation();
            const code = pre.querySelector('code');
            const textToCopy = code ? code.innerText : pre.innerText;
            navigator.clipboard.writeText(textToCopy.trim()).then(() => {
                btn.textContent = '已复制!';
                setTimeout(() => { btn.textContent = '复制'; }, 2000);
            }).catch(err => {
                showToast('复制失败: ' + err.message, 'error');
            });
        });
        pre.appendChild(btn);
    });

    // ★★★ 核心修改：usage 显示逻辑 ★★★
    const hasModelNote = (role === 'assistant' || role === 'model') && modelForNote;
    const hasUsageData = (role === 'assistant' || role === 'model') && usage;

    // 只要是助手消息，就应该创建元信息容器，为 usage 的显示做准备
    if (hasModelNote || hasUsageData || role === 'assistant' || role === 'model') {
        
        const metaInfoDiv = document.createElement('div');
        metaInfoDiv.className = 'message-meta-info';

        // --- 处理模型名称 (您的原始逻辑，保持不变) ---
        if (hasModelNote) {
            const note = document.createElement('div');
            note.className = 'model-note';
            let displayModelName = modelForNote;
            const modelSelect = document.getElementById('model');
            if (modelSelect) {
                const opt = modelSelect.querySelector(`option[value="${modelForNote}"]`);
                if (opt) displayModelName = opt.textContent;
                else { const p = String(modelForNote).split('::'); if (p.length === 2) displayModelName = p[1]; }
            }
            note.textContent = `模型：${displayModelName}`;
            metaInfoDiv.appendChild(note);
        }

        // --- ★★★ 核心修改：usage 元素的创建和更新逻辑分离 ★★★ ---
        
        // 1. 无论 usage 有没有值，只要是助手消息，就创建 tokenNote 元素作为“挂载点”
        const tokenNote = document.createElement('span');
        tokenNote.className = 'token-count-note';
        
        // 2. ★★★ 关键：将 tokenNote 的引用附加到外层包裹上，以便外部代码随时可以访问 ★★★
        messageWrapperDiv.usageElement = tokenNote;

        // 3. 如果调用时传入了 usage 数据（主要用于非流式和历史记录加载），则立即更新其内容
        if (hasUsageData) {
            const promptTokens = usage.prompt_tokens ?? 'N/A';
            const completionTokens = usage.completion_tokens ?? 'N/A';
            tokenNote.textContent = `提示: ${promptTokens} tokens, 回复: ${completionTokens} tokens`;
        }
        
        // 4. 将 tokenNote (可能为空，也可能有内容) 添加到 DOM
        metaInfoDiv.appendChild(tokenNote);
        
        messageDiv.appendChild(metaInfoDiv);
    }
    // ★★★ 核心修改结束 ★★★


    // 1. 创建复制消息按钮
    const copyMessageBtn = document.createElement('button');
    copyMessageBtn.className = 'message-action-btn copy-message-btn'; // 使用通用和特定类
    copyMessageBtn.title = '复制消息内容';
    copyMessageBtn.type = 'button';
    copyMessageBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-copy" viewBox="0 0 16 16">
            <path fill-rule="evenodd" d="M4 2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zm2-1a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1zM2 5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1h1v1a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1v1z"/>
        </svg>
    `;
    copyMessageBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        // 提取纯文本内容进行复制
        let textToCopy = finalMarkdown.trim();
        navigator.clipboard.writeText(textToCopy).then(() => {
            showToast('消息内容已复制', 'success');
        }).catch(err => {
            showToast('复制失败: ' + err, 'error');
        });
    });
    actionsContainer.appendChild(copyMessageBtn); // 先添加复制按钮

    // 2. 创建删除消息按钮
    const deleteMsgBtn = document.createElement('button');
    deleteMsgBtn.className = 'message-action-btn delete-message-btn'; // 使用通用和特定类
    deleteMsgBtn.title = '删除此条消息';
    deleteMsgBtn.type = 'button';
    deleteMsgBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-trash3" viewBox="0 0 16 16">
            <path d="M6.5 1h3a.5.5 0 0 1 .5.5v1H6v-1a.5.5 0 0 1 .5-.5M11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3A1.5 1.5 0 0 0 5 1.5v1H1.5a.5.5 0 0 0 0 1h.538l.853 10.66A2 2 0 0 0 4.885 16h6.23a2 2 0 0 0 1.994-1.84l.853-10.66h.538a.5.5 0 0 0 0-1zm-9.955 1H14.5a.5.5 0 0 1 0 1H1.455a.5.5 0 0 1 0-1Z"/>
        </svg>
    `;
    deleteMsgBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        // 使用 dataset 获取 ID 和索引来调用删除函数
        const convId = messageWrapperDiv.dataset.conversationId;
        const msgIdx = parseInt(messageWrapperDiv.dataset.messageIndex, 10);
        if (convId && !isNaN(msgIdx)) {
            deleteSingleMessage(messageWrapperDiv, convId, msgIdx);
        } else {
            console.error("无法删除：消息的 conversationId 或 messageIndex 未在 DOM 元素上找到。");
            showToast("删除失败，消息数据异常。", "error");
        }
    });
    actionsContainer.appendChild(deleteMsgBtn); // 再添加删除按钮

    // --- 修复结束 ---

    messageWrapperDiv.appendChild(messageDiv);
    messageWrapperDiv.appendChild(actionsContainer); // 将填充好按钮的容器添加到 DOM
    container.appendChild(messageWrapperDiv);


    container.scrollTop = container.scrollHeight;
    
    if (window.MathJax) {
        const elementsToTypeset = [contentDiv];
        // ▼▼▼ MODIFICATION FOR MATHJAX ▼▼▼
        // Use the correctly scoped and assigned reasoningDivElement
        if (reasoningDivElement && reasoningDivElement.textContent.trim()) { 
            elementsToTypeset.push(reasoningDivElement);
        }
        // ▲▲▲ MODIFICATION FOR MATHJAX ▲▲▲
        if (elementsToTypeset.length > 0) {
            MathJax.typesetPromise(elementsToTypeset).catch(err => console.error("MathJax typesetting failed:", err));
        }
    }
    
    return messageWrapperDiv;
}
// --- END OF appendMessage MODIFICATION ---

function processPreBlocksForCopyButtons(containerElement) {
    if (!containerElement || typeof marked === 'undefined') return;

    const preElements = containerElement.querySelectorAll('pre');
    preElements.forEach((pre) => {
        // 检查是否已经有复制按钮，避免重复添加
        if (pre.querySelector('.copy-btn')) {
            return; // 已有按钮，跳过
        }

        pre.style.position = 'relative'; // 确保 pre 是相对定位

        const btn = document.createElement('button');
        btn.className = 'copy-btn';
        btn.textContent = '复制';
        btn.setAttribute('aria-label', '复制此代码块');

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const codeElem = pre.querySelector('code');
            let textToCopy = "";

            if (codeElem) {
                textToCopy = codeElem.innerText;
            } else {
                const clone = pre.cloneNode(true);
                const buttonInClone = clone.querySelector('.copy-btn');
                if (buttonInClone) buttonInClone.remove();
                textToCopy = clone.innerText;
            }
            textToCopy = textToCopy.trim();

            if (textToCopy === "") {
                btn.textContent = '无内容';
                btn.disabled = true;
                setTimeout(() => { btn.textContent = '复制'; btn.disabled = false; }, 2000);
                return;
            }

            if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
                navigator.clipboard.writeText(textToCopy).then(() => {
                    btn.textContent = '已复制!';
                    setTimeout(() => { btn.textContent = '复制'; }, 2000);
                }).catch(err => {
                    console.error('复制失败 (navigator):', err);
                    showToast('自动复制失败。');
                });
            } else {
                try {
                    const textarea = document.createElement('textarea');
                    textarea.value = textToCopy;
                    textarea.style.position = 'fixed';
                    document.body.appendChild(textarea);
                    textarea.focus();
                    textarea.select();
                    const successful = document.execCommand('copy');
                    document.body.removeChild(textarea);
                    if (successful) {
                        btn.textContent = '已复制!';
                        setTimeout(() => { btn.textContent = '复制'; }, 2000);
                    } else {
                        throw new Error('execCommand("copy") failed.');
                    }
                } catch (err) {
                    console.error('复制失败 (execCommand):', err);
                    showToast('浏览器不支持自动复制。请手动复制。');
                }
            }
        });
        pre.appendChild(btn);
    });
}

function appendLoading() {
  const container = document.getElementById('messages');
  if (!container) {
      console.error("appendLoading: Message container '#messages' not found.");
      return null;
  }

  // 1. 创建一个独立的、不带 .message 类的包裹层
  const loadingWrapper = document.createElement('div');
  loadingWrapper.className = 'loading-indicator-wrapper'; // 使用一个全新的、独立的类名

  // 2. 创建真正的加载提示框
  const loadingBubble = document.createElement('div');
  loadingBubble.className = 'loading-indicator-bubble'; // 这是我们的“胶囊”
  
  const textElement = document.createElement('span');
  textElement.textContent = '对方正在输入…';
  
  loadingBubble.appendChild(textElement);
  loadingWrapper.appendChild(loadingBubble);
  
  container.appendChild(loadingWrapper);
  container.scrollTop = container.scrollHeight;
  
  // 返回外层包裹，以便后续移除
  return loadingWrapper; 
}

/**
 * 渲染左侧的对话列表，包括未归档和已归档的对话。
 * 会保留已归档列表的展开/折叠状态。
 */
function renderConversationList(searchTerm = '')  {
  const list = document.getElementById('conversation-list'); // 对话列表的UL元素

  // 检查归档区域之前是否是展开状态
  let isArchivePreviouslyExpanded = false;
  const oldArchiveToggle = list.querySelector('.archive-toggle');
  if (oldArchiveToggle && oldArchiveToggle.classList.contains('expanded')) {
    isArchivePreviouslyExpanded = true;
  }

  list.innerHTML = ''; // 清空现有列表项

    // 2. 根据搜索词过滤对话
  const lowerCaseSearchTerm = searchTerm.toLowerCase().trim();
  let conversationsToRender = conversations;
  if (lowerCaseSearchTerm) {
    conversationsToRender = conversations.filter(c => 
      c.title.toLowerCase().includes(lowerCaseSearchTerm)
    );
  }

  // 渲染未归档的对话
   conversationsToRender
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
        console.log("%c[BEFORE find] 'conversations' state right before finding conv:", "background: #222; color: #ff9900", JSON.parse(JSON.stringify(conversations)));
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
    console.log("[DEBUG 1] Conversation to load:", JSON.parse(JSON.stringify(convToLoad)));
    console.log(`[LoadConv] Successfully found conversation: "${convToLoad.title}" (ID: ${convToLoad.id})`);

    if (convToLoad.isNew) {
        convToLoad.isNew = false;
        
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
        convToLoad.messages.forEach((msg, indexInConvMessages) => {
            let shouldRenderThisMessage = true;
            // (这里可以保留您可能有的、过滤消息的逻辑)

            if (shouldRenderThisMessage) {
                // ★★★ 核心修复：确保所有参数都以正确的顺序传递 ★★★
                const messageElement = appendMessage(
                    msg.role,
                    msg.content,
                    msg.model || convToLoad.model,
                    msg.reasoning_content || null,
                    convToLoad.id,         // 第5个参数：对话ID
                    indexInConvMessages,   // 第6个参数：消息索引
                    msg.usage || null      // 第7个参数：Token用量
                );

                if (messageElement) {
                    // 确保返回的元素（无论是消息 wrapper 还是 system prompt div）
                    // 都有正确的 dataset，以便后续操作（如删除）
                    if (messageElement.classList.contains('message-wrapper')) {
                        messageElement.dataset.conversationId = convToLoad.id;
                        messageElement.dataset.messageIndex = indexInConvMessages.toString();
                    }
                    renderedMessageCount++;
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
    if (typeof updateScrollToBottomButtonVisibility === 'function') {
        updateScrollToBottomButtonVisibility();
    }
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
  
  // 检查数据模型中是否存在该消息
  const messageExistsInData = conv && messageIndex >= 0 && messageIndex < conv.messages.length;

  if (messageExistsInData) {
    // 如果数据存在，正常删除
    const messageToConfirm = conv.messages[messageIndex];
    let confirmTextPreview = String(messageToConfirm.content?.text || messageToConfirm.content || "").substring(0, 50) + "...";

    if (confirm(`确实要删除这条消息吗？\n\n"${confirmTextPreview}"`)) {
      conv.messages.splice(messageIndex, 1);
      saveConversations();
      // 重新加载对话以刷新整个 UI，这是最可靠的方式
      loadConversation(conversationId);
    }
  } else {
    // ★ 如果数据不存在（比如正在生成的流式消息），我们只从 UI 上移除 ★
    console.warn(`[Delete] Message at index ${messageIndex} not found in data model for conv ${conversationId}. Likely a streaming message. Removing from UI only.`);
    if (confirm('这条消息仍在生成中或数据异常。确实要从界面上移除它吗？（此操作不会保存）')) {
      messageElement.remove();
      // 如果这是正在生成的消息，我们还应该中止请求
      if (window.isGeneratingResponse && window.currentAbortController) {
          console.log("[Delete] Aborting current stream request.");
          window.currentAbortController.abort();
      }
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
  if (idx === -1) {
    // 如果尝试删除一个不存在的对话，也给一个提示
    showToast('无法删除：对话未找到。', 'error');
    return;
  }

  // ▼▼▼ 新增：在删除前获取对话标题用于提示 ▼▼▼
  const deletedTitle = conversations[idx].title; 
  
  const wasCurrent = conversations[idx].id === currentConversationId; // 检查是否是当前对话
  
  // 从数组中移除
  conversations.splice(idx, 1);
  
  // 保存更改
  saveConversations();

  // ▼▼▼ 新增：显示成功的 toast 提示 ▼▼▼
  showToast(`对话「${deletedTitle}」已删除。`, 'success');

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
 * 清空当前活动对话的所有消息记录。
 */
function clearCurrentConversation() {
  if (!currentConversationId) {
    showToast('没有活动的对话可供清空。', 'warning');
    return;
  }

  const conv = getCurrentConversation();
  if (!conv) {
    showToast('发生错误：找不到当前对话的数据。', 'error');
    return;
  }

  // 弹出确认框
  if (confirm(`确定要清空「${conv.title}」的所有消息吗？\n此操作无法恢复。`)) {
    
    // 核心：清空 messages 数组，但保留 system prompt (如果有的话)
    const systemPrompt = conv.messages.find(m => m.role === 'system');
    conv.messages = systemPrompt ? [systemPrompt] : [];

    saveConversations();
    
    // 重新加载对话以刷新UI
    loadConversation(currentConversationId);
    
    showToast(`对话「${conv.title}」已清空。`, 'success');
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

/**
 * 将内部对话历史映射为 Gemini API 所需的、严格交替角色的 `contents` 格式。
 * 这个版本会正确地合并连续的用户消息。
 * @param {Array} messagesHistory - 内部对话历史数组
 * @param {Array} currentFilesData - 当前要发送的文件数据
 * @returns {Array} - 符合 Gemini API 规范的 contents 数组
 */
function mapMessagesForGemini(messagesHistory, currentFilesData) {
    console.log("[mapMessagesForGemini v2] Called with History length:", messagesHistory.length, "Files count:", currentFilesData.length);

    const mappedContents = [];
    let currentUserParts = []; // 用于累积当前连续的用户消息部分

    // 遍历历史记录来构建交替的 contents
    for (const msg of messagesHistory) {
        if (msg.role === 'user') {
            // 如果是用户消息，将其内容添加到 currentUserParts 累加器中
            let textContent = "";
            if (typeof msg.content === 'string') {
                textContent = msg.content;
            } else if (msg.content && typeof msg.content.text === 'string') {
                textContent = msg.content.text;
            }
            
            if (textContent.trim()) {
                currentUserParts.push({ text: textContent.trim() });
            }

        } else if (msg.role === 'assistant' || msg.role === 'model') {
            // 遇到助手消息时，意味着之前的用户消息回合结束了
            // 1. 首先，如果 currentUserParts 中有累积的用户消息，将它们作为一个完整的用户回合添加到 mappedContents
            if (currentUserParts.length > 0) {
                mappedContents.push({
                    role: 'user',
                    parts: currentUserParts
                });
                currentUserParts = []; // 清空累加器，为下一个用户回合做准备
            }

            // 2. 然后，处理当前的助手消息
            let assistantContent = "";
            if (typeof msg.content === 'string') {
                assistantContent = msg.content;
            } else if (Array.isArray(msg.content) && msg.content[0]?.type === 'text') {
                assistantContent = msg.content[0].text;
            }
            
            mappedContents.push({
                role: 'model',
                parts: [{ text: assistantContent || " " }] // 助手消息也需要内容
            });
        }
        // 系统消息被忽略，因为它们在顶层单独处理
    }

    // ★ 循环结束后，处理最后一轮的用户消息和当前要发送的文件
    // 这包括了历史记录中最后的连续用户消息，以及当前输入框中的文本
    if (currentUserParts.length > 0) {
        // 将当前要发送的文件添加到最后这个用户回合的 parts 中
        if (currentFilesData && currentFilesData.length > 0) {
            currentFilesData.forEach(fileData => {
                if (fileData.type && fileData.type.startsWith('image/')) {
                    currentUserParts.push({
                        inline_data: {
                            mime_type: fileData.type,
                            data: fileData.base64.split(',')[1] // 纯 Base64 数据
                        }
                    });
                }
            });
        }
        
        mappedContents.push({
            role: 'user',
            parts: currentUserParts
        });
    }

    console.log("[mapMessagesForGemini v2] Final Mapped contents:", JSON.parse(JSON.stringify(mappedContents)));
    return mappedContents;
}

function mapMessagesForStandardOrClaude(messagesHistory, provider, currentFilesData) {
    console.log(`[mapMessages] Called for provider: ${provider}. History length: ${messagesHistory.length}, Current files: ${currentFilesData?.length || 0}`);

    // 1. 映射历史消息
    const mappedApiMessages = messagesHistory.map(msg => {
        // --- 处理 System 消息 ---
        if (msg.role === 'system') {
            // Anthropic 和 Ollama 的 system prompt 在顶层单独处理，这里不加入 messages 数组
            if (provider === 'anthropic' || provider === 'ollama') { // <--- 检查这里是否包含了 'ollama'
                return null; // 返回 null，稍后过滤掉
            }
            return { role: 'system', content: msg.content };
        }

        // --- 处理 Assistant 消息 ---
        if (msg.role === 'assistant' || msg.role === 'model') {
            // 假设历史助手的 content 已经是 string 或兼容的格式
            // 如果是 Anthropic 的历史回复，它可能是数组，这里简化处理
            let assistantContent = (typeof msg.content === 'string') ? msg.content : JSON.stringify(msg.content);
            return { role: 'assistant', content: assistantContent };
        }

        // --- 处理 User 消息 ---
        if (msg.role === 'user') {
            // 对于历史消息，我们简化处理：
            // - 不处理历史文件，只处理文本
            // - 将 content 统一转换为字符串格式，以适应所有 provider 的历史记录
            let historicTextContent = "";
            if (typeof msg.content === 'string') {
                historicTextContent = msg.content;
            } else if (msg.content && typeof msg.content.text === 'string') {
                historicTextContent = msg.content.text;
            } else if (Array.isArray(msg.content)) { // 如果是多模态数组
                const textPart = msg.content.find(p => p.type === 'text');
                historicTextContent = textPart ? textPart.text : '[multimodal content]';
            }
            
            // 为 Ollama 返回纯字符串
            if (provider === 'ollama') {
                 return { role: 'user', content: historicTextContent.trim() || " " };
            }
            // 为其他 provider 返回多模态数组格式（即使只有文本）
            return { role: 'user', content: [{ type: 'text', text: historicTextContent.trim() || " " }] };
        }

        return null; // 对于未知的 role，返回 null
    }).filter(Boolean); // 过滤掉所有被返回为 null 的消息

    // 2. 特殊处理最后一轮的用户输入 (包含当前要上传的文件)
    const lastMessageIndex = mappedApiMessages.length - 1;
    if (lastMessageIndex >= 0 && mappedApiMessages[lastMessageIndex].role === 'user') {
        
        // 获取最后一条用户消息的文本
        let currentPromptText = "";
        const lastMessageContent = mappedApiMessages[lastMessageIndex].content;
        if (Array.isArray(lastMessageContent) && lastMessageContent[0]?.type === 'text') {
            currentPromptText = lastMessageContent[0].text;
        } else if (typeof lastMessageContent === 'string') { // 兼容 Ollama 的历史
            currentPromptText = lastMessageContent;
        }

        // --- 根据 provider 构建最后一轮的用户消息 content ---
        if (provider === 'ollama') {
            // Ollama 需要纯字符串，并将图片信息作为文本描述
            let ollamaContentString = currentPromptText;
            if (currentFilesData && currentFilesData.length > 0) {
                 const imageFiles = currentFilesData.filter(f => f.type?.startsWith('image/'));
                 if (imageFiles.length > 0) {
                     ollamaContentString += `\n(附带图片: ${imageFiles.map(f=>f.name).join(', ')})`;
                 }
                 // 可以添加对文本文件的处理
            }
            mappedApiMessages[lastMessageIndex].content = ollamaContentString.trim() || " ";

        } else {
            // 对于所有其他支持多模态的 provider (OpenAI, Anthropic, Volcengine, etc.)
            let currentUserContentParts = [];
            
            // 添加文本部分
            if (currentPromptText.trim()) {
                currentUserContentParts.push({ type: 'text', text: currentPromptText.trim() });
            }

            // 添加图片文件部分
            if (currentFilesData && currentFilesData.length > 0) {
                currentFilesData.forEach(fileData => {
                    if (fileData.type?.startsWith('image/')) {
                        
                        // ★★★ 核心逻辑：volcengine 和 openai 使用相同的 image_url 格式 ★★★
                        if (provider === 'openai' || provider === 'deepseek' || provider === 'siliconflow' || provider === 'volcengine' || provider === 'openrouter') {
                            currentUserContentParts.push({
                                type: "image_url",
                                image_url: { url: fileData.base64 } // 发送 base64 Data URL
                            });
                        } else if (provider === 'anthropic') {
                            currentUserContentParts.push({
                                type: "image",
                                source: { type: "base64", media_type: fileData.type, data: fileData.base64.split(',')[1] }
                            });
                        }
                    }
                });
            }

            // 如果没有任何内容，添加一个空文本部分以避免 API 错误
            if (currentUserContentParts.length === 0) {
                currentUserContentParts.push({ type: "text", text: " " });
            }
            
            mappedApiMessages[lastMessageIndex].content = currentUserContentParts;
        }
    }

    console.log("[mapMessages] Final mapped messages:", JSON.parse(JSON.stringify(mappedApiMessages)));
    return mappedApiMessages;
}


// ★★★ 核心修改：使用这个完整、重构后的 send 函数 ★★★
async function send() {
    // --- 1. 变量声明 (保持不变) ---
    let apiUrl;
    const headers = { 'Content-Type': 'application/json' };
    let bodyPayload = {};
    let response;
    let accumulatedAssistantReply = "";
    let accumulatedThinkingForDisplay = "";
    let usageData = null; 
    let requestWasSuccessful = false;
    let streamContentReceived = false;
    let isActuallyStreaming = false;
    let shouldUseStreaming = false;
    let loadingDiv = null;
    let tempMsgElementWrapper = null;
    
    console.log("%c--- send() CALLED ---", "color:dodgerblue; font-size:14px; font-weight:bold;");

    // --- 2. 前置检查 (保持不变) ---
    const promptInput = document.getElementById('prompt');
    if (!promptInput) { showToast("发生内部错误：找不到输入框。", 'error'); return; }
    const promptText = promptInput.value.replace(/\n$/, '');
    const filesToActuallySend = uploadedFilesData ? [...uploadedFilesData] : [];
    if (!promptText.trim() && filesToActuallySend.length === 0) { showToast("请输入问题或上传文件。",'warning'); return; }
    if (window.isGeneratingResponse) { showToast("请等待上一个回复生成完毕。",'warning'); return; }
    
    // --- 3. 获取对话和模型信息 (保持不变) ---
    const conversationAtRequestTime = getCurrentConversation();
    if (!conversationAtRequestTime) { showToast("错误：无法获取当前对话。",'error'); return; }
    const modelValueFromOption = conversationAtRequestTime.model;
    if (!modelValueFromOption) { showToast("错误：当前对话没有指定模型。", 'error'); return; }
    const conversationIdAtRequestTime = conversationAtRequestTime.id;
    let [providerToUse, modelNameForAPI] = String(modelValueFromOption).split('::');
    if (!providerToUse || !modelNameForAPI) { showToast(`模型 "${modelValueFromOption}" 配置错误。`,'error'); return; }
    providerToUse = providerToUse.toLowerCase();

    // --- 4. 进入“请求中”状态 (保持不变) ---
    window.isGeneratingResponse = true;
    updateSubmitButtonState(true);
    window.currentAbortController = new AbortController();
    const signal = window.currentAbortController.signal;
    const userMessageContentForHistory = { text: promptText.trim(), files: filesToActuallySend.map(f => ({ name: f.name, type: f.type })) };
    appendMessage('user', userMessageContentForHistory, null, null, conversationIdAtRequestTime, conversationAtRequestTime.messages.length, null);
    conversationAtRequestTime.messages.push({ role: 'user', content: userMessageContentForHistory, model: modelValueFromOption });
    promptInput.value = '';
    promptInput.dispatchEvent(new Event('input', { bubbles: true }));
    loadingDiv = appendLoading();
    
    const assistantRoleForDisplay = (providerToUse === 'gemini') ? 'model' : 'assistant';
    
    try {
        // --- 5. 构建请求体 ---
        const currentTemperature = parseFloat(localStorage.getItem('model-temperature')) || 0.7;
        const maxTokensSetting = parseInt(localStorage.getItem(MAX_TOKENS_STORAGE_KEY), 10) || null;
        const providerSupportsStreaming = ['openai', 'anthropic', 'deepseek', 'siliconflow', 'ollama', 'suanlema', 'openrouter', 'volcengine', 'gemini'].includes(providerToUse);
        shouldUseStreaming = providerSupportsStreaming && isStreamingEnabled;

        // ★★★ 核心修改：这是处理参数的最终版本 ★★★

        // 1. 创建一个不含 max_tokens 的基础请求体
        bodyPayload = {
            model: modelNameForAPI,
            temperature: currentTemperature,
            stream: shouldUseStreaming,
        };
        
        const modelNameLower = modelNameForAPI.toLowerCase();

        // 1. 创建基础请求体
        bodyPayload = {
            model: modelNameForAPI,
            stream: shouldUseStreaming,
        };
        
        // 2. 智能处理 Temperature 参数
        // 检查当前模型是否是不支持自定义 temperature 的 o4-mini
        if (modelNameLower.includes('o4-mini')) {
            // 对于 o4-mini，不向 bodyPayload 添加 temperature 参数，让 API 使用其默认值。
            // 或者如果 API 要求必须传，则设置为 bodyPayload.temperature = 1;
            // 通常不传是更安全的选择。
            console.log(`[Send - Payload] Ignoring custom temperature for model: ${modelNameForAPI}`);
        } else {
            // 对于所有其他模型，正常使用用户设置的 temperature
            bodyPayload.temperature = currentTemperature;
            console.log(`[Send - Payload] Using custom temperature: ${currentTemperature}`);
        }

        // 3. 动态处理 max_tokens 参数 (保留之前的逻辑)
        if (maxTokensSetting) {
            if (providerToUse === 'openai' && (modelNameLower.includes('o4-mini') || modelNameLower.includes('o3'))) {
                bodyPayload.max_completion_tokens = maxTokensSetting;
                console.log(`[Send - Payload] Using 'max_completion_tokens: ${maxTokensSetting}' for model: ${modelNameForAPI}`);
            } else {
                bodyPayload.max_tokens = maxTokensSetting;
                console.log(`[Send - Payload] Using default 'max_tokens: ${maxTokensSetting}' for model: ${modelNameForAPI}`);
            }
        }

        // 3. 处理思考模式参数
        if (!isAutoThinkModeEnabled) {
            console.log("[Send - Payload] Applying manual thinking settings...");
            if (providerToUse === 'gemini') bodyPayload.isManualThinkModeEnabled = isManualThinkModeEnabled;
            else if (providerToUse === 'ollama') bodyPayload.think = isManualThinkModeEnabled;
            else if (modelNameLower.includes('qwen')) bodyPayload.enable_thinking = isManualThinkModeEnabled;
            else if (providerToUse === 'volcengine' && modelNameLower.includes('doubao')) bodyPayload.thinking = { "type": isManualThinkModeEnabled ? 'thinking' : 'non-thinking' };
        } else {
            console.log("[Send - Payload] Auto-Thinking Mode is ON. No thinking parameters will be sent.");
        }

        // 4. 根据 Provider 准备最终的 API URL 和 messages 结构
        if (providerToUse === 'gemini') {
            apiUrl = `/.netlify/functions/gemini-proxy`;
            bodyPayload.messages = conversationAtRequestTime.messages;
        } else if (providerToUse) {
            apiUrl = `/.netlify/functions/${providerToUse}-proxy`;
            bodyPayload.messages = mapMessagesForStandardOrClaude(conversationAtRequestTime.messages, providerToUse, filesToActuallySend);
            if (providerToUse === 'anthropic') {
                const sysMsg = conversationAtRequestTime.messages.find(m => m.role === 'system');
                if (sysMsg?.content) bodyPayload.system = sysMsg.content;
                // Anthropic 如果没有设置 max_tokens，会报错，给一个默认值
                if (!bodyPayload.max_tokens) {
                    bodyPayload.max_tokens = 4096;
                }
            }
        } else {
             throw new Error(`模型 "${modelValueFromOption}" 配置错误，无法确定服务商。`);
        }
        // --- 6. 发送网络请求 (保持不变) ---
        console.log(`[Send] Fetching ${apiUrl} with payload:`, JSON.parse(JSON.stringify(bodyPayload)));
        response = await fetch(apiUrl, { method: 'POST', headers, body: JSON.stringify(bodyPayload), signal });
        
        if (loadingDiv?.parentNode) loadingDiv.remove();
        
        const responseContentType = response.headers.get('content-type') || '';
        isActuallyStreaming = shouldUseStreaming && response.body && (responseContentType.includes('text/event-stream') || responseContentType.includes('application/x-ndjson'));

        // --- 6a. 处理流式响应 ---
        if (isActuallyStreaming) {
            if (!response.ok) throw new Error(`API流式请求失败 (${response.status}): ${await response.text()}`);
            
            tempMsgElementWrapper = appendMessage(assistantRoleForDisplay, { text: '' }, modelValueFromOption, null, conversationIdAtRequestTime, -1, null);
            const assistantTextElement = tempMsgElementWrapper.querySelector('.text');
            const reasoningDivElement = tempMsgElementWrapper.querySelector('.reasoning-content');
            const reasoningBlockDiv = tempMsgElementWrapper.querySelector('.reasoning-block');
            
            const stream = response.body.pipeThrough(new TextDecoderStream());
            let buffer = '';
            let inThinkingBlock = false; 

            for await (const chunk of stream) {
                buffer += chunk;
                // ★★★ 核心修改 1: 根据 provider 选择正确的分隔符 ★★★
                const separator = (providerToUse === 'ollama') ? '\n' : '\n\n';
                
                let boundaryIndex;
                while ((boundaryIndex = buffer.indexOf(separator)) !== -1) {
                    const rawUnit = buffer.substring(0, boundaryIndex);
                    buffer = buffer.substring(boundaryIndex + separator.length);
                    if (!rawUnit.trim()) continue;

                    // ★★★ 核心修改 2: 根据 provider 选择正确的解析方式 ★★★
                    let jsonDataString = null;
                    if (providerToUse === 'ollama') {
                        // Ollama 的每一行（如果非空）就是一个 JSON 对象
                        jsonDataString = rawUnit.trim();
                    } else {
                        // 其他 SSE 标准的 API，从多行中找到 'data:' 行
                        const lines = rawUnit.split('\n');
                        for (const line of lines) {
                            if (line.startsWith('data:')) {
                                jsonDataString = line.substring(5).trim();
                                break; 
                            }
                        }
                    }

                    if (!jsonDataString || jsonDataString === '[DONE]') continue;
                    
                    try {
                        const chunkObj = JSON.parse(jsonDataString);
                        if (!streamContentReceived) streamContentReceived = true;
                        
                        let rawTextFromChunk = '', reasoningForUnit = null;

                        // ★★★ 核心修改 3: 确认 ollama case 的逻辑正确 ★★★
                        switch(providerToUse) {
                            case 'ollama':
                                // Ollama 的内容直接在 message.content 中
                                if (chunkObj?.message?.content) {
                                    rawTextFromChunk = chunkObj.message.content; 
                                }
                                // 在流的最后一条消息中获取 token usage
                                if (chunkObj.done === true && chunkObj.total_duration) { 
                                    usageData = { prompt_tokens: chunkObj.prompt_eval_count || 0, completion_tokens: chunkObj.eval_count || 0 };
                                    if (tempMsgElementWrapper && tempMsgElementWrapper.usageElement) {
                                        tempMsgElementWrapper.usageElement.textContent = `提示: ${usageData.prompt_tokens} tokens, 回复: ${usageData.completion_tokens} tokens`;
                                    }
                                }
                                break;
                            
                            // 其他 provider 的 case 保持不变
                            case 'anthropic':
                                if (chunkObj.type === 'message_start') {
                                    if (chunkObj.message?.usage?.input_tokens) {
                                        usageData = { input_tokens: chunkObj.message.usage.input_tokens, output_tokens: 0 };
                                    }
                                }
                                else if (chunkObj.type === 'content_block_delta' && chunkObj.delta?.type === 'text_delta') {
                                    rawTextFromChunk = chunkObj.delta.text || '';
                                }
                                else if (chunkObj.type === 'message_delta' && chunkObj.usage?.output_tokens) {
                                    usageData = { ...usageData, output_tokens: chunkObj.usage.output_tokens };
                                }
                                if (usageData && tempMsgElementWrapper?.usageElement) {
                                    const promptTokens = usageData.input_tokens ?? '...';
                                    const completionTokens = usageData.output_tokens ?? '...';
                                    tempMsgElementWrapper.usageElement.textContent = `提示: ${promptTokens} tokens, 回复: ${completionTokens} tokens`;
                                }
                                break;
                            case 'gemini': 
                                rawTextFromChunk = chunkObj.candidates?.[0]?.content?.parts?.[0]?.text || '';
                                if (chunkObj.usageMetadata) {
                                    usageData = { prompt_tokens: chunkObj.usageMetadata.promptTokenCount, completion_tokens: chunkObj.usageMetadata.candidatesTokenCount || 0 };
                                }
                                break;
                            default: // OpenAI, Deepseek, Qwen, OpenRouter, Volcengine, etc.
                                const delta = chunkObj.choices?.[0]?.delta;
                                if (delta) { 
                                    rawTextFromChunk = delta.content || ''; 
                                    reasoningForUnit = delta.reasoning || delta.reasoning_content || null; 
                                }
                                if (chunkObj.usage) { 
                                    usageData = chunkObj.usage; 
                                    if (tempMsgElementWrapper && tempMsgElementWrapper.usageElement) {
                                        const promptTokens = usageData.prompt_tokens ?? 'N/A';
                                        const completionTokens = usageData.completion_tokens ?? 'N/A';
                                        tempMsgElementWrapper.usageElement.textContent = `提示: ${promptTokens} tokens, 回复: ${completionTokens} tokens`;
                                    }
                                }
                                break;
                        }

                        // --- 分离思考和回复 (保持不变) ---
                        let replyTextPortion = '', thinkingTextPortion = '';
                        if (reasoningForUnit) {
                            thinkingTextPortion = reasoningForUnit; replyTextPortion = rawTextFromChunk;
                        } else if (rawTextFromChunk) {
                            const extraction = extractThinkingAndReply(rawTextFromChunk, '<think>', '</think>', inThinkingBlock);
                            replyTextPortion = extraction.replyTextPortion; thinkingTextPortion = extraction.thinkingTextPortion; inThinkingBlock = extraction.newThinkingBlockState;
                        }

                        // --- 累积并更新UI (保持不变) ---
                        if (thinkingTextPortion) accumulatedThinkingForDisplay += thinkingTextPortion;
                        if (replyTextPortion) accumulatedAssistantReply += replyTextPortion;

                        if ((replyTextPortion || thinkingTextPortion) && typeof processStreamChunk === 'function') {
                            processStreamChunk(replyTextPortion, providerToUse, conversationIdAtRequestTime, assistantTextElement, reasoningDivElement, reasoningBlockDiv, accumulatedThinkingForDisplay);
                        }
                    } catch (e) {
                        console.error('解析流式JSON失败，忽略此数据块:', e, '原始字符串:', `"${jsonDataString}"`);
                    }
                }
            }
        }
 
        // --- 6b. 处理非流式响应 (保持不变) ---
        else {
            const responseData = await response.json();
            if (!response.ok) throw new Error(responseData.error?.message || JSON.stringify(responseData));
            
            let finalReply = '', finalReasoning = null;
            switch(providerToUse) {
                case 'gemini': 
                    finalReply = responseData.candidates?.[0]?.content?.parts?.[0]?.text || '';
                    finalReasoning = null; 
                    if (responseData.usageMetadata) { usageData = { prompt_tokens: responseData.usageMetadata.promptTokenCount, completion_tokens: responseData.usageMetadata.candidatesTokenCount }; }
                    break;
                default:
                    finalReply = responseData.choices?.[0]?.message?.content || '';
                    finalReasoning = responseData.choices?.[0]?.message?.reasoning || responseData.choices?.[0]?.message?.reasoning_content || null;
                    usageData = responseData.usage || null;
                    break;
            }

            if (finalReasoning) {
                accumulatedThinkingForDisplay = finalReasoning; accumulatedAssistantReply = finalReply;
            } else if (finalReply.includes('<think>')) {
                const extraction = extractThinkingAndReply(finalReply, '<think>', '</think>', false);
                accumulatedAssistantReply = extraction.replyTextPortion.trim(); accumulatedThinkingForDisplay = extraction.thinkingTextPortion.trim();
            } else {
                accumulatedAssistantReply = finalReply; accumulatedThinkingForDisplay = null;
            }
        }
        
        requestWasSuccessful = true;

    } catch (error) {
        if (error.name === 'AbortError') {
            console.log("[Send] Stream aborted by user. Finalization will proceed.");
            requestWasSuccessful = true;
            accumulatedAssistantReply = (accumulatedAssistantReply.trim() || "") + "\n（用户已中止）";
        } else {
            requestWasSuccessful = false;
            console.error(`[Send] Request failed with an unexpected error:`, error);
            accumulatedAssistantReply = `错误: ${error.message}`;
        }
    } finally {
        window.isGeneratingResponse = false;
        updateSubmitButtonState(false);
        window.currentAbortController = null;

        const targetConversation = conversations.find(c => c.id === conversationIdAtRequestTime);
        
        if (requestWasSuccessful && targetConversation) {
            
            const finalContent = accumulatedAssistantReply.trim();
            const finalReasoning = accumulatedThinkingForDisplay ? accumulatedThinkingForDisplay.trim() : null;
            
            // ★★★ 核心修复 4: 统一保存助手消息的逻辑 ★★★
            // 清理已存在的临时消息（如果有的话）
            const existingTempMessageIndex = targetConversation.messages.findIndex(m => m.isTemporary);
            if (existingTempMessageIndex > -1) {
                targetConversation.messages.splice(existingTempMessageIndex, 1);
            }

            // 非流式响应需要移除加载动画并添加新消息
            if (!isActuallyStreaming) {
                 if (loadingDiv?.parentNode) loadingDiv.remove();
                 appendMessage(assistantRoleForDisplay, { text: finalContent }, modelValueFromOption, finalReasoning, conversationIdAtRequestTime, -1, usageData);
            } else if (tempMsgElementWrapper) { // 流式响应，更新UI
                const assistantTextElement = tempMsgElementWrapper.querySelector('.text');
                if (assistantTextElement) {
                    // 1. 最终渲染一次完整内容
                    assistantTextElement.innerHTML = marked.parse(finalContent || " ");
                    
                    // 2. ★★★ 新增：调用 pruneEmptyNodes 函数清理末尾的空 <p> ★★★
                    if (typeof pruneEmptyNodes === 'function') {
                        pruneEmptyNodes(assistantTextElement);
                    }
                    
                    // 3. 为所有代码块（包括新生成的）添加复制按钮
                    processPreBlocksForCopyButtons(assistantTextElement);
                }
                
                // 确保 usage 也被最后更新一次
                if (tempMsgElementWrapper.usageElement && usageData) {
                    // 兼容不同API的字段名
                    const promptTokens = usageData.prompt_tokens ?? usageData.input_tokens ?? 'N/A';
                    const completionTokens = usageData.completion_tokens ?? usageData.output_tokens ?? 'N/A';
                    tempMsgElementWrapper.usageElement.textContent = `提示: ${promptTokens} tokens, 回复: ${completionTokens} tokens`;
                }
            }

            // 将最终的助手消息保存到数据中，包含 usage
            targetConversation.messages.push({ 
                role: assistantRoleForDisplay, 
                content: finalContent,
                model: modelValueFromOption, 
                reasoning_content: finalReasoning,
                // 兼容不同API的字段名
                usage: usageData ? { 
                    prompt_tokens: usageData.prompt_tokens ?? usageData.input_tokens, 
                    completion_tokens: usageData.completion_tokens ?? usageData.output_tokens 
                } : null
            });
            
            if (!signal.aborted && targetConversation.title === '新对话') {
                const newTitle = finalContent.substring(0, 20).replace(/\s+/g, ' ').trim();
                if (newTitle) {
                    targetConversation.title = newTitle;
                    document.getElementById('chat-title').textContent = newTitle;
                }
            }
            
            saveConversations();
            renderConversationList();
        
        } else if (!requestWasSuccessful) {
            if (loadingDiv?.parentNode) loadingDiv.remove();
            appendMessage('assistant', { text: accumulatedAssistantReply }, modelValueFromOption, null, conversationIdAtRequestTime, -1, null);
        }

        if (requestWasSuccessful && !signal.aborted && filesToActuallySend.length > 0) {
            uploadedFilesData.length = 0;
            renderFilePreview();
        }
        
        const messagesContainer = document.getElementById('messages');
        if (messagesContainer) requestAnimationFrame(() => { messagesContainer.scrollTop = messagesContainer.scrollHeight; });
        console.log("%c--- send() FINISHED ---", "color:dodgerblue; font-weight:bold;");
    }
}
window.send = send; // 暴露到全局，供HTML调用

// ★★★ 核心修改：使用这个更健壮的 processStreamChunk 函数 ★★★
function processStreamChunk(replyTextPortion, provider, conversationId, assistantTextEl, reasoningContentEl, reasoningBlockEl, fullReasoningText) {
    // 1. 基本的UI更新检查
    if (currentConversationId !== conversationId || !assistantTextEl) {
        return; 
    }

    // --- 思考过程的更新逻辑 (覆盖式更新) ---
    if (reasoningContentEl && reasoningBlockEl) {
        const hasValidReasoning = typeof fullReasoningText === 'string' && fullReasoningText.trim() !== '';
        if (hasValidReasoning) {
            reasoningContentEl.textContent = fullReasoningText;
            reasoningBlockEl.classList.remove('reasoning-block-empty');
        } else {
            reasoningContentEl.textContent = '';
            reasoningBlockEl.classList.add('reasoning-block-empty');
        }
    }

    // --- 回复内容的渲染方式 (累积并重绘) ---
    if (replyTextPortion) {
        // a. 从 assistantTextEl 中获取已经累积的、未被解析的原始 Markdown 文本。
        // 我们用一个自定义属性 `data-raw-markdown` 来存储它。
        let accumulatedRawMarkdown = assistantTextEl.dataset.rawMarkdown || "";

        // b. 将新的文本块追加到累积的原始文本上。
        accumulatedRawMarkdown += replyTextPortion;
        assistantTextEl.dataset.rawMarkdown = accumulatedRawMarkdown; // 更新存储

        // c. 使用 marked.js 将【完整的、累积后的】Markdown 文本转换为 HTML。
        assistantTextEl.innerHTML = marked.parse(accumulatedRawMarkdown);

        // d. 实时为新生成的 <pre> 块添加复制按钮。
        if (typeof processPreBlocksForCopyButtons === 'function') {
            processPreBlocksForCopyButtons(assistantTextEl);
        }
    }

    // --- 自动滚动 (保持不变) ---
    const messagesContainer = document.getElementById('messages');
    if (messagesContainer) {
        const distanceFromBottom = messagesContainer.scrollHeight - messagesContainer.clientHeight - messagesContainer.scrollTop;
        if (distanceFromBottom < 200) {
            requestAnimationFrame(() => {
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            });
        }
    }
}


function showToast(message, type = 'info') { // type可以是 'info', 'success', 'warning', 'error'
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    document.body.appendChild(toast);

    // 触发进入动画
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);

    // 3秒后自动移除
    setTimeout(() => {
        toast.classList.remove('show');
        toast.addEventListener('transitionend', () => toast.remove());
    }, 3000);
}

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

const messagesContainerForScrollLogic = document.getElementById('messages'); // 在 DOMContentLoaded 后获取
const scrollToBottomBtnForLogic = document.getElementById('scroll-to-bottom-btn'); // 在 DOMContentLoaded 后获取

function updateScrollToBottomButtonVisibility() {
    if (!messagesContainerForScrollLogic || !scrollToBottomBtnForLogic) {
        // console.warn("updateScrollToBottomButtonVisibility: Required elements not found.");
        return;
    }

    const threshold = 50; // 可以设置一个较小的阈值，表示几乎在底部
    // 如果可滚动区域很小（内容不足以产生滚动条），或者已经在底部附近，则隐藏按钮
    if (messagesContainerForScrollLogic.scrollHeight - messagesContainerForScrollLogic.clientHeight <= threshold ||
        messagesContainerForScrollLogic.scrollHeight - messagesContainerForScrollLogic.clientHeight <= messagesContainerForScrollLogic.scrollTop + threshold) {
        scrollToBottomBtnForLogic.style.display = 'none';
    } else {
        scrollToBottomBtnForLogic.style.display = 'flex'; // 或者你用来显示的 display 值
    }
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

function updateSubmitButtonState(isStopping) {
    if (!submitActionBtn) { // ★ 检查 submitActionBtn 是否有效
        console.error("updateSubmitButtonState: submitActionBtn is not defined or null!");
        return;
    }

    const textSpan = submitActionBtn.querySelector('span');

    if (isStopping) {
        submitActionBtn.classList.add('is-stopping'); // ★ 确保这个类被添加
        if (textSpan) textSpan.textContent = '停止';
        else submitActionBtn.textContent = '停止';
        submitActionBtn.disabled = false; // 停止按钮应该总是可用的
        console.log("[UI Update] Button state changed to: STOPPING"); // 添加日志
    } else {
        submitActionBtn.classList.remove('is-stopping'); // ★ 确保这个类被移除
        if (textSpan) textSpan.textContent = '发送';
        else submitActionBtn.textContent = '发送';
        // 根据输入框内容决定发送按钮是否禁用 (如果需要)
        // const promptInput = document.getElementById('prompt');
        // submitActionBtn.disabled = !promptInput || promptInput.value.trim() === '';
        console.log("[UI Update] Button state changed to: SEND"); // 添加日志
    }
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

// ★★★ 核心修改：使用这个最终、最正确的版本，替换整个 handleSubmitActionClick 函数 ★★★
async function handleSubmitActionClick() {
    console.log("[handleSubmitActionClick] CALLED. isGeneratingResponse: " + window.isGeneratingResponse);

    if (window.isGeneratingResponse) {
        if (window.currentAbortController) {
            console.log("[handleSubmitActionClick] Attempting to STOP. Calling currentAbortController.abort()");
            // abort()会触发send()函数中catch (error)块的'AbortError'逻辑
            window.currentAbortController.abort();
        } else {
            console.warn("[handleSubmitActionClick] In stopping state, but currentAbortController is null! Forcing UI reset.");
            // 这是一个保险措施，理论上不应该发生
            window.isGeneratingResponse = false;
            updateSubmitButtonState(false);
        }
    } else {
        console.log("[handleSubmitActionClick] Attempting to SEND.");
        if (typeof send === 'function') {
            try {
                // ★ 核心修改：使用 await 来等待 send() 函数的 Promise 完成（或被拒绝）
                await send();
            } catch (error) {
                // ★ 核心修改：在这里捕获所有从 send() 冒泡出来的、未被处理的严重错误
                // （正常的中止错误 'AbortError' 应该在 send 内部被处理，不会到这里）
                console.error("An unexpected error was caught by handleSubmitActionClick:", error);
                // 可以在这里显示一个通用的错误提示
                showToast(`发生了一个意外的严重错误: ${error.message}`, 'error');
                // 确保UI状态被重置
                window.isGeneratingResponse = false;
                updateSubmitButtonState(false);
            }
        } else {
            console.error("send function is not defined in handleSubmitActionClick!");
        }
    }
}


function handlePostDropdownUpdate(newlySelectedValueInDropdown, previousSelectedValueBeforeUpdate) {
    const modelSelect = document.getElementById('model');
    if (!modelSelect) {
        console.error("[handlePostDropdownUpdate] modelSelect element not found!");
        return;
    }

    let finalModelForConversation = null; // 将用于更新对话记录的模型值

    if (currentConversationId && typeof getCurrentConversation === 'function') {
        const conv = getCurrentConversation();
        if (conv && conv.model) { // 如果当前对话已经有一个模型记录
            let currentConvModelIsStillSelectable = false;
            for (let i = 0; i < modelSelect.options.length; i++) {
                if (modelSelect.options[i].value === conv.model && !modelSelect.options[i].value.startsWith("error::")) {
                    currentConvModelIsStillSelectable = true;
                    break;
                }
            }

            if (currentConvModelIsStillSelectable) {
                modelSelect.value = conv.model; // 恢复当前对话的原始模型选择
                finalModelForConversation = conv.model;
                console.log(`[handlePostDropdownUpdate] Restored selection for current conversation: ${conv.model}`);
            } else {
                // 当前对话的模型已不可选 (被隐藏或删除)
                console.warn(`[handlePostDropdownUpdate] Current conversation's model "${conv.model}" is no longer selectable.`);
                if (modelSelect.options.length > 0 && !modelSelect.options[0].value.startsWith("error::")) {
                    modelSelect.selectedIndex = 0; // 选择下拉框中的第一个有效模型
                    finalModelForConversation = modelSelect.value;
                    conv.model = finalModelForConversation; // 更新对话对象中的模型
                    if (typeof saveConversations === 'function') saveConversations();
                    showToast(`您当前对话使用的模型 ("${previousSelectedValueBeforeUpdate}" 或 "${conv.model}") 已被隐藏/移除，已自动切换到: "${modelSelect.options[0].text}"`);
                } else {
                    // 没有可供选择的有效模型了
                    conv.model = ""; // 或一个表示无效的特殊值
                    if (typeof saveConversations === 'function') saveConversations();
                    showToast(`您当前对话使用的模型已被隐藏/移除，且没有其他可用模型！`, 'error');
                    if(modelSelect.options.length === 0 || modelSelect.options[0].value.startsWith("error::")) { // 如果下拉框是空的或只有错误提示
                       // 可能需要清空 modelSelect 或添加一个“无模型”的占位符选项，
                       // populateModelDropdown 内部应该已经处理了这种情况
                    }
                }
            }
        } else if (modelSelect.options.length > 0 && !modelSelect.options[0].value.startsWith("error::")) {
            // 对话存在但模型值无效，或者没有当前对话模型记录，选择第一个有效模型
            modelSelect.selectedIndex = 0;
            finalModelForConversation = modelSelect.value;
            if (conv) { // 如果对话对象存在，更新其模型
                conv.model = finalModelForConversation;
                if (typeof saveConversations === 'function') saveConversations();
            }
            console.log(`[handlePostDropdownUpdate] No specific conversation model or previous model invalid, selected first available: ${finalModelForConversation}`);
        }
    } else if (modelSelect.options.length > 0 && !modelSelect.options[0].value.startsWith("error::")) {
        // 没有当前对话，仅确保下拉框选中第一个有效模型（如果它还没有值）
        if (!modelSelect.value || modelSelect.value.startsWith("error::")) {
            modelSelect.selectedIndex = 0;
        }
        finalModelForConversation = modelSelect.value; // 记录当前选中的值，但不改变任何对话数据
        console.log(`[handlePostDropdownUpdate] No current conversation, dropdown shows: ${finalModelForConversation}`);
    }

    // 如果在所有逻辑之后，modelSelect 仍然没有一个有效的值（例如，它只包含错误占位符）
    if ((!modelSelect.value || modelSelect.value.startsWith("error::")) && modelSelect.options.length > 0 && !modelSelect.options[0].value.startsWith("error::")) {
        // 这种情况理论上应该在上面的分支中被处理，但作为最后的保险
        modelSelect.selectedIndex = 0;
        console.warn("[handlePostDropdownUpdate] Fallback: Setting dropdown to first valid option as a last resort.");
    } else if (modelSelect.options.length === 0 || (modelSelect.options.length === 1 && modelSelect.options[0].value.startsWith("error::"))) {
         console.error("[handlePostDropdownUpdate] Dropdown is empty or only contains error/fallback options. No model selected.");
         // 此时，如果 currentConversationId 存在，其 conv.model 可能需要被清空或标记为无效
         if (currentConversationId && typeof getCurrentConversation === 'function') {
             const conv = getCurrentConversation();
             if (conv && conv.model !== "") { // 只有当之前有模型时才提示
                 conv.model = "";
                 if (typeof saveConversations === 'function') saveConversations();
                 showToast("所有模型均不可用，当前对话的模型已被清除。请在模型管理中添加或显示模型。", 'error');
                 // 可能还需要更新聊天界面的标题或模型显示区域
                 const chatTitleEl = document.getElementById('chat-title');
                 if (chatTitleEl && conv) chatTitleEl.textContent = conv.title; // 保持标题，但模型没了
             }
         }
    }
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
    const response = await fetch('configs/models.json' + '?t=' + new Date().getTime()); // 添加时间戳防止缓存
    if (!response.ok) {
      throw new Error(`加载 models.json 失败: ${response.status} ${response.statusText}`);
    }
    const config = await response.json();

    if (config && config.models && Array.isArray(config.models)) {
      modelConfigData = config; // 存储原始加载的数据
      editableModelConfig = JSON.parse(JSON.stringify(modelConfigData)); // 创建可编辑的深拷贝
      if (editableModelConfig.models) {
                editableModelConfig.models.forEach(group => {
                    if (typeof group.isGroupHidden === 'undefined') {
                        group.isGroupHidden = false; // 默认为不隐藏
                    }
                    });
            }
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
    showToast("无法从 models.json 加载模型列表，已使用回退模型。请检查控制台获取详细错误信息。",'error');
    return false;
  }
}

/**
 * 根据提供的模型数组填充主聊天界面的模型下拉列表。
 * @param {Array} modelsArray - 模型配置数组，格式同 models.json 中的 models 数组。
 */
function populateModelDropdown(modelsArray) {
    const modelSelect = document.getElementById('model');
    if (!modelSelect) {
        console.error("populateModelDropdown: modelSelect element not found!");
        return;
    }
    const previousSelectedValue = modelSelect.value; // 保存刷新前的选中值，以便后续恢复或判断
    modelSelect.innerHTML = ''; // 清空

    if (!modelsArray || modelsArray.length === 0) {
        const fallbackOption = document.createElement('option');
        fallbackOption.value = "error::no-models"; // 使用更明确的错误值
        fallbackOption.textContent = "无可用模型 (配置为空)";
        modelSelect.appendChild(fallbackOption);
        console.warn("populateModelDropdown: modelsArray is empty or invalid, using fallback.");
        // 如果之前有选中的，现在没了，也需要处理当前对话
        if (typeof handlePostDropdownUpdate === 'function') { // 确保函数存在
            handlePostDropdownUpdate(null, previousSelectedValue);
        }
        return;
    }

    let hasAnyVisibleGroupsOrOptions = false; // 标记是否添加了任何实际内容

    modelsArray.forEach(group => {

        if (!group.isGroupHidden && group.groupLabel && group.options && Array.isArray(group.options)) {
            // ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲

            // 只有当组本身可见时，才处理其下的选项
            const visibleOptions = group.options.filter(opt => !opt.isHidden && opt.value && opt.text && opt.text.trim() !== ""); // 过滤掉隐藏的、无效的选项
            
            if (visibleOptions.length > 0) { // 只有当组内有可见（且有效）模型时才创建 optgroup
                hasAnyVisibleGroupsOrOptions = true; // 标记我们至少添加了一个组
                const optgroup = document.createElement('optgroup');
                optgroup.label = group.groupLabel;
                visibleOptions.forEach(opt => {
                    const option = document.createElement('option');
                    option.value = opt.value;
                    option.textContent = opt.text;
                    optgroup.appendChild(option);
                });
                modelSelect.appendChild(optgroup);
            } else {
                // console.log(`[populateModelDropdown] Group "${group.groupLabel}" has no visible/valid options. Skipping optgroup.`);
            }
        } else {
            // console.log(`[populateModelDropdown] Group "${group.groupLabel}" is hidden or invalid. Skipping.`);
        }
    });

    if (!hasAnyVisibleGroupsOrOptions) { // 如果遍历完所有组，发现没有任何可见的组或选项被添加
        const fallbackOption = document.createElement('option');
        fallbackOption.value = "error::no-visible-models";
        fallbackOption.textContent = "无可见模型";
        modelSelect.appendChild(fallbackOption);
        console.warn("populateModelDropdown: No visible groups or options found after filtering.");
    }

    // 调用辅助函数来处理选中状态和当前对话模型的同步
    if (typeof handlePostDropdownUpdate === 'function') { // 确保函数存在
        handlePostDropdownUpdate(modelSelect.value, previousSelectedValue);
    } else {
        // 如果没有 handlePostDropdownUpdate，这里需要包含一些基本的选中逻辑
        // （但强烈建议将选中逻辑封装到 handlePostDropdownUpdate 中，如之前的回复所示）
        console.warn("handlePostDropdownUpdate function not found. Dropdown selection might not be correctly restored for current conversation.");
        if (currentConversationId) {
            const conv = getCurrentConversation();
            if (conv && conv.model) {
                const currentModelOption = modelSelect.querySelector(`option[value="${conv.model}"]`);
                if (currentModelOption) {
                    modelSelect.value = conv.model;
                } else if (modelSelect.options.length > 0 && !modelSelect.options[0].value.startsWith("error::")) {
                    modelSelect.selectedIndex = 0;
                    conv.model = modelSelect.value;
                    if (typeof saveConversations === 'function') saveConversations();
                }
            } else if (modelSelect.options.length > 0 && !modelSelect.options[0].value.startsWith("error::") && conv) {
                modelSelect.selectedIndex = 0;
                conv.model = modelSelect.value;
                if (typeof saveConversations === 'function') saveConversations();
            }
        } else if (modelSelect.options.length > 0 && !modelSelect.options[0].value.startsWith("error::")) {
             modelSelect.selectedIndex = 0;
        }
    }
}


// 用于跟踪 SortableJS 实例，以便销毁和重建
let groupSortableInstance = null;
const optionSortableInstances = [];

function handleToggleVisibilityClick(event) {
    // console.count("handleToggleVisibilityClick called");
    if (event.target.classList.contains('toggle-visibility-btn')) {
        const groupIndex = parseInt(event.target.dataset.groupIndex, 10);
        const optionIndex = parseInt(event.target.dataset.optionIndex, 10);

        if (!isNaN(groupIndex) && !isNaN(optionIndex) &&
            editableModelConfig?.models?.[groupIndex]?.options?.[optionIndex]) {

            const option = editableModelConfig.models[groupIndex].options[optionIndex];
            // 1. 切换数据模型中的状态
            option.isHidden = !option.isHidden;
            console.log(`Data: Option "${option.text}" in group "${editableModelConfig.models[groupIndex].groupLabel}" toggled to: ${option.isHidden ? 'HIDDEN' : 'VISIBLE'}`);
            
            if (typeof renderModelManagementUI === 'function') {
                console.log("[handleToggleVisibilityClick] Calling renderModelManagementUI.");
                renderModelManagementUI(); // 2. 重绘模型管理列表
            } else {
                console.error("CRITICAL: renderModelManagementUI function is not defined!");
            }
            // 4. 更新主聊天界面的模型下拉框 (这一步仍然重要)
            if (typeof populateModelDropdown === 'function' && editableModelConfig?.models) {
                populateModelDropdown(editableModelConfig.models);
                // ... (处理当前对话模型是否受影响的逻辑，如之前讨论的)
                if (currentConversationId && typeof loadConversation === 'function' && typeof getCurrentConversation === 'function') {
                    const conv = getCurrentConversation();
                    const modelSelect = document.getElementById('model');
                    if (conv && conv.model && modelSelect) {
                        let modelStillSelectable = false;
                        for (let i = 0; i < modelSelect.options.length; i++) {
                            if (modelSelect.options[i].value === conv.model) {
                                modelStillSelectable = true;
                                break;
                            }
                        }
                        if (!modelStillSelectable && modelSelect.options.length > 0 && !modelSelect.options[0].value.startsWith("error::")) {
                            console.log(`[handleToggleVisibilityClick] Current conversation's model (${conv.model}) is no longer visible. Reloading conversation.`);
                            loadConversation(currentConversationId); // 或者只更新模型并保存
                        }
                    }
                }
            }


        } else {
            console.warn("handleToggleVisibilityClick: Invalid group/option index or config not ready.");
        }
    }
}

/**
 * 处理点击模型组头部“切换组可见性”按钮的事件。
 * @param {Event} event - 点击事件对象。
 */

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
    const groupDiv = document.createElement('div');
    groupDiv.className = 'model-group-editor';
    if (group.isGroupHidden) { // ★★★ 如果组被隐藏，给整个 groupDiv 添加一个类 ★★★
            groupDiv.classList.add('model-group-content-hidden');
        }
        groupDiv.dataset.groupIndex = groupIndex;

        const groupHeader = document.createElement('div');
        groupHeader.className = 'model-group-header';
    groupDiv.dataset.groupIndex = groupIndex;

    

    
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

    const toggleGroupVisibilityBtn = document.createElement('button');
        toggleGroupVisibilityBtn.className = 'toggle-group-visibility-btn action-btn'; // 使用现有样式或新建
        toggleGroupVisibilityBtn.textContent = group.isGroupHidden ? '显示分组' : '隐藏分组';
        toggleGroupVisibilityBtn.title = group.isGroupHidden ? `显示 "${group.groupLabel}" 组的模型列表` : `隐藏 "${group.groupLabel}" 组的模型列表`;
        toggleGroupVisibilityBtn.dataset.groupIndex = groupIndex;


    const deleteGroupBtn = document.createElement('button');
    deleteGroupBtn.textContent = '删除组';
    deleteGroupBtn.className = 'danger-text';
    deleteGroupBtn.onclick = () => { if (typeof deleteModelGroup === 'function') deleteModelGroup(groupIndex); };

    groupDiv.appendChild(groupHeader);
    
    groupHeader.appendChild(toggleGroupVisibilityBtn); // 先添加 toggle 按钮
groupHeader.appendChild(deleteGroupBtn);         // 再添加 delete 按钮

    const optionsUl = document.createElement('ul');
    optionsUl.className = 'model-group-options';
    optionsUl.dataset.groupIndex = groupIndex;

    if (group.options && Array.isArray(group.options)) { // Check if group.options exists and is an array
        group.options.forEach((option, optionIndex) => {
            const optionLi = document.createElement('li');
            optionLi.className = 'model-option-editor';
            optionLi.classList.toggle('model-option-hidden', !!option.isHidden); //确保是布尔值
             if (option.isHidden) { // ★★★ 检查 isHidden 属性 ★★★
                    optionLi.classList.add('model-option-hidden');
                }
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
                        <button class="toggle-visibility-btn" data-group-index="${groupIndex}" data-option-index="${optionIndex}">
                            ${option.isHidden ? '显示' : '隐藏'}
                        </button>
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

function handleToggleGroupVisibilityClick(event) {
    // console.count("handleToggleGroupVisibilityClick called"); // 用于调试


    const groupIndex = parseInt(event.target.dataset.groupIndex, 10);

    // 确保 groupIndex 是一个有效的数字，并且对应的模型组存在
    if (!isNaN(groupIndex) && editableModelConfig && editableModelConfig.models && editableModelConfig.models[groupIndex]) {
        const group = editableModelConfig.models[groupIndex];

        // 切换组的 isGroupHidden 状态
        group.isGroupHidden = !group.isGroupHidden;

        console.log(`Group "${group.groupLabel}" (index ${groupIndex}) visibility toggled to: ${group.isGroupHidden ? 'HIDDEN' : 'VISIBLE'}`);

        if (typeof renderModelManagementUI === 'function') {
            renderModelManagementUI();
        } else {
            console.error("CRITICAL: renderModelManagementUI function is not defined! UI will not update.");
        }
    if (typeof populateModelDropdown === 'function' && editableModelConfig?.models) {
            console.log("[handleToggleGroupVisibilityClick] Calling populateModelDropdown to update main select.");
            populateModelDropdown(editableModelConfig.models); // 使用最新的配置更新下拉框

            // 处理当前对话模型是否受影响 (这部分逻辑很重要)
            if (currentConversationId && typeof loadConversation === 'function' && typeof getCurrentConversation === 'function') {
                const conv = getCurrentConversation();
                const modelSelect = document.getElementById('model');
                if (conv && conv.model && modelSelect) {
                    let modelStillSelectable = false;
                    for (let i = 0; i < modelSelect.options.length; i++) {
                        if (modelSelect.options[i].value === conv.model) {
                            modelStillSelectable = true;
                            break;
                        }
                    }
                    if (!modelStillSelectable) {
                        console.log(`[handleToggleGroupVisibilityClick] Current conversation's model (${conv.model}) is no longer visible. Reloading conversation to pick a new model.`);
                        loadConversation(currentConversationId); // loadConversation 内部会处理模型选择
                    } else {
                        // 如果模型仍然可选，确保下拉框选中它 (populateModelDropdown 应该已经做了，但可以再次确认)
                        // modelSelect.value = conv.model;
                        console.log(`[handleToggleGroupVisibilityClick] Current conversation's model (${conv.model}) is still visible.`);
                    }
                }
            }
        } else {
            console.error("[handleToggleGroupVisibilityClick] populateModelDropdown or editableModelConfig.models not available.");
        }


    } else {
        console.warn("handleToggleGroupVisibilityClick: Could not toggle group visibility. Invalid groupIndex or editableModelConfig not ready. groupIndex:", groupIndex);
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
    if (!editableModelConfig || !editableModelConfig.models) { // 增加对 models 数组的检查
        showToast('没有模型配置可供保存，或者模型列表为空。','error');
        return;
    }

    // 构建 cleanedModelConfig，确保所有需要的字段都被保留
    const cleanedModelConfig = {
        models: editableModelConfig.models
            .map(group => { // 遍历每个原始组
                // 1. 处理组内的选项
                const cleanedOptions = group.options
                    ? group.options
                        // 1a. 过滤掉无效的选项 (文本或值为空/仅空白)
                        .filter(opt => opt.text && opt.text.trim() !== "" && opt.value && opt.value.trim() !== "")
                        // 1b. 映射选项，确保包含 text, value, isHidden (并转换为布尔值)
                        .map(opt => ({
                            text: opt.text.trim(), // 同时 trim 一下
                            value: opt.value.trim(),
                            isHidden: !!opt.isHidden // 强制为布尔值
                        }))
                    : []; // 如果原始组没有 options，则为空数组

                // 2. 返回清理和映射后的组对象，包含所有需要的组级别属性
                return {
                    groupLabel: (group.groupLabel || "未命名组").trim(),
                    isGroupHidden: !!group.isGroupHidden, // ★★★ 确保 isGroupHidden 被包含并为布尔值 ★★★
                    options: cleanedOptions
                };
            })
            // 3. 过滤掉那些既没有有效组标签（在 trim 和提供默认值后）也没有任何有效选项的组
            //    一个组如果被标记为 isGroupHidden: true，但它仍然有有效的 groupLabel，它应该被保存。
            //    如果一个组没有标签，也没有选项，则移除。
            .filter(group => {
                const hasValidLabel = group.groupLabel !== "未命名组" && group.groupLabel !== "";
                const hasOptions = group.options && group.options.length > 0;
                return hasValidLabel || hasOptions; // 保留有标签的组，或有选项的组
            })
    };

    // 可选：进一步过滤掉那些虽然有组标签，但所有选项都被隐藏了，并且组本身没有被标记为 isGroupHidden 的情况
    // 但这可能与用户的期望冲突（用户可能希望保留一个空但可见的组以便后续添加模型）。
    // 目前的逻辑是，只要组有标签或有选项（无论是否隐藏），就会被保存。
    // populateModelDropdown 会根据 isGroupHidden 和 isHidden 决定显示什么。

    console.log("[saveModelsToFile] Attempting to save. Cleaned Data:", JSON.parse(JSON.stringify(cleanedModelConfig)));

    if (!cleanedModelConfig.models || cleanedModelConfig.models.length === 0) {
        if (!confirm("模型列表为空或所有模型/组都无效。是否仍要保存一个空的模型配置文件？（这将清空现有配置）")) {
            showToast("保存操作已取消。", 'warning');
            return;
        }
        // 如果用户确认保存空配置，继续执行，但 body 会是 { models: [] }
    }


    try {
        const response = await fetch('/.netlify/functions/save-models-local', { // 或你的本地保存接口
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
            // 即使解析失败，也要检查 response.ok
            if (!response.ok) {
                 throw new Error(`保存操作失败，服务器响应无效: ${resultText.substring(0, 100)} (Status: ${response.status})`);
            }
            // 如果 response.ok 但 JSON 解析失败，可能服务器返回了非 JSON 的成功消息
            showToast('配置已保存，但服务器响应格式非预期：' + resultText.substring(0,100), 'warning');
            // 这种情况也认为是部分成功，可以继续更新前端状态
        }

        if (response.ok) {
            showToast(result?.message || '模型配置已成功保存到本地！', 'success');

            // ★★★ 使用清理和保存后的 cleanedModelConfig 来更新运行时的状态 ★★★
            modelConfigData = JSON.parse(JSON.stringify(cleanedModelConfig)); // 更新全局的原始数据副本
            editableModelConfig = JSON.parse(JSON.stringify(cleanedModelConfig)); // 也更新可编辑副本为清理后的状态

            if (typeof populateModelDropdown === 'function') {
                populateModelDropdown(editableModelConfig.models);
            }

            // 确保当前对话的模型在新列表中仍然有效
            if (currentConversationId && typeof getCurrentConversation === 'function' && typeof saveConversations === 'function') {
                const conv = getCurrentConversation();
                if (conv && conv.model) {
                    const modelSelect = document.getElementById('model');
                    let currentModelStillSelectable = false;
                    if (modelSelect) {
                        for (let i = 0; i < modelSelect.options.length; i++) {
                            if (modelSelect.options[i].value === conv.model) {
                                currentModelStillSelectable = true;
                                break;
                            }
                        }
                        if (currentModelStillSelectable) {
                            modelSelect.value = conv.model;
                        }
                    }

                    if (!currentModelStillSelectable) {
                        // 当前模型不可见，回退
                        if (modelSelect && modelSelect.options.length > 0) {
                            conv.model = modelSelect.options[0].value; // 选中第一个可用的
                            saveConversations(); // 保存对话的更改
                            modelSelect.value = conv.model; // UI同步
                            showToast(`当前对话使用的模型 "${conv.model}" 在新配置中不再可见或有效，已自动切换到 "${modelSelect.options[0].text}"。`);
                        } else {
                            // 没有可用的模型了
                            showToast(`当前对话使用的模型 "${conv.model}" 在新配置中不再可见或有效，且没有其他可用模型！请添加模型。`);
                            // 可能需要清空对话的模型或禁用发送等
                            conv.model = ""; // 或者一个表示无效的特殊值
                            saveConversations();
                            if(modelSelect) modelSelect.innerHTML = '<option value="">无可用模型</option>';
                        }
                    }
                }
            }
        } else {
            // result 可能已经包含了错误信息
            throw new Error(result?.error?.message || result?.message || result?.error || `保存失败，状态码: ${response.status}`);
        }
    } catch (error) {
        console.error("保存模型配置失败:", error);
        showToast(`保存模型配置失败：${error.message}`, 'error');
    }
}


function applyPresetPrompt(preset) {
    if (!preset || !preset.prompt) {
        console.warn("[applyPresetPrompt] Invalid preset or no prompt in preset:", preset);
        return;
    }

    const promptInput = document.getElementById('prompt'); // 获取聊天输入框
    const currentConversation = getCurrentConversation(); // 确保 getCurrentConversation() 能正确工作

    console.log("[applyPresetPrompt] Applying preset:", preset.name, "Type:", preset.type, "Prompt:", preset.prompt);

    if (preset.type === 'user_input') {
        if (promptInput) {
            promptInput.value = preset.prompt; // 将预设的 prompt 填充到输入框
            promptInput.focus();               // 自动聚焦到输入框
            // 可选：如果你的输入框有自动调整高度的逻辑，可能需要手动触发一次
            if (typeof autoResizeTextarea === 'function') { // 假设你有这个函数
                // autoResizeTextarea(); // 或者直接操作 promptInput.dispatchEvent
            }
            promptInput.dispatchEvent(new Event('input', { bubbles: true })); // 触发input事件
            console.log(`[applyPresetPrompt] User input field set with prompt from preset: "${preset.name}"`);
        } else {
            console.error("[applyPresetPrompt] CRITICAL: Prompt input element with ID 'prompt' not found.");
            showToast("错误：找不到聊天输入框。", 'error');
        }
    } else if (preset.type === 'system_prompt') {
        if (currentConversation) {
            let systemMessage = currentConversation.messages.find(m => m.role === 'system');
            if (systemMessage) {
                systemMessage.content = preset.prompt; // 更新现有的系统消息
                console.log("[applyPresetPrompt] Updated existing system message.");
            } else {
                // 在对话消息数组的开头插入新的系统消息
                currentConversation.messages.unshift({ role: 'system', content: preset.prompt });
                console.log("[applyPresetPrompt] Added new system message to the start of the conversation.");
            }

            if (typeof saveConversations === 'function') {
                saveConversations(); // 保存对话更改
            }

            showToast(`系统角色已设置为："${preset.name}"。\n提示内容: "${preset.prompt.substring(0, 100)}${preset.prompt.length > 100 ? '...' : ''}"\n此设置将影响接下来的对话。`);

            // 可选：你可能想在这里做一些UI提示或操作，例如：
            // - 清空当前聊天消息区的助手回复（如果适用）
            // - 在聊天区显示一条系统提示已更改的消息
            // - 自动聚焦到输入框让用户开始基于新角色的提问
            // loadConversation(currentConversation.id); // 重新加载对话会刷新消息区，但也会清空当前输入

            console.log(`[applyPresetPrompt] System prompt set for conversation ID ${currentConversation.id}: "${preset.name}"`);
        } else {
            showToast("错误：没有活动的对话来设置系统角色。\n请先开始或选择一个对话。");
            console.error("[applyPresetPrompt] No active conversation found to set system prompt.");
        }
    } else {
        console.warn("[applyPresetPrompt] Unknown preset type in preset object:", preset.type, preset);
    }
}

function populatePresetPromptsList() {
    if (!presetPromptsUl) { // presetPromptsUl 应该是全局获取的 <ul> 元素
        console.error("[populatePresetPromptsList] presetPromptsUl is not defined or null.");
        return;
    }
     console.log("[populatePresetPromptsList] loadedPresetPrompts at entry:", 
                loadedPresetPrompts ? `Array with ${loadedPresetPrompts.length} items` : loadedPresetPrompts,
                JSON.parse(JSON.stringify(loadedPresetPrompts || [])) );
    if (!loadedPresetPrompts || loadedPresetPrompts.length === 0) { // loadedPresetPrompts 是包含预设数据的数组
        presetPromptsUl.innerHTML = '<li>没有可用的预设。</li>';
        console.warn("[populatePresetPromptsList] No presets loaded or preset list is empty.");
        return;
    }

    presetPromptsUl.innerHTML = ''; // 清空旧列表

    loadedPresetPrompts.forEach(preset => {
        const li = document.createElement('li');
        li.className = 'preset-prompt-item'; // 确保 CSS 中有这个类
        li.textContent = preset.name; // 预设的显示名称
        if (preset.description) {
            li.title = preset.description; // 鼠标悬浮提示
        }

        // 为每个列表项添加点击事件监听器
        li.addEventListener('click', () => {
            if (typeof applyPresetPrompt === 'function') {
                applyPresetPrompt(preset); // 调用应用预设的函数
                if (presetPromptsListPanel) { // presetPromptsListPanel 是预设面板的 DOM 元素
                    presetPromptsListPanel.style.display = 'none'; // 选择后关闭列表
                }
            } else {
                console.error("[populatePresetPromptsList] applyPresetPrompt function is not defined.");
            }
        });
        presetPromptsUl.appendChild(li);
    });
    console.log("[populatePresetPromptsList] Preset prompts list populated.");
}
/**
 * 导出单个对话为指定格式的文件。
 * @param {string} conversationId 要导出的对话ID
 * @param {string} [format='md'] 导出的格式 ('md' 或 'json')
 */
function exportSingleConversation(conversationId, format = 'md') {
  const conv = conversations.find(c => c.id === conversationId);
  if (!conv) {
    showToast('找不到要导出的对话', 'error'); // 假设您有 showToast 函数
    return;
  }

  let fileContent = '';
  const fileExtension = format;
  
  // 生成 Markdown 内容
  if (format === 'md') {
    fileContent = `# ${conv.title}\n\n**模型:** ${conv.model || '未知'}\n\n---\n\n`;
    conv.messages.forEach(msg => {
      // 兼容字符串和对象格式的 content
      let content = (typeof msg.content === 'object' && msg.content.text) 
                    ? msg.content.text 
                    : String(msg.content);
      
      if (msg.role === 'user') {
        fileContent += `**👤 You:**\n${content}\n\n`;
      } else if (msg.role === 'assistant' || msg.role === 'model') {
        fileContent += `**🤖 Assistant:**\n${content}\n\n`;
        if (msg.reasoning_content) {
          fileContent += `> **思考过程:**\n> ${msg.reasoning_content.replace(/\n/g, '\n> ')}\n\n`;
        }
      }
      // 可以选择性地忽略 system 消息
    });
  } else { 
    // 生成 JSON 内容
    fileContent = JSON.stringify(conv, null, 2);
  }

  // 创建 Blob 并触发下载
  const blob = new Blob([fileContent], { type: format === 'md' ? 'text/markdown;charset=utf-8' : 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  
  // 清理文件名中的非法字符
  const safeTitle = (conv.title || 'untitled').replace(/[\/\\?%*:|"<>]/g, '-');
  a.download = `${safeTitle}.${fileExtension}`;
  
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// --- DOMContentLoaded: 页面加载完成后的主要设置和初始化 ---
document.addEventListener('DOMContentLoaded', async () => {
showPresetPromptsBtn = document.getElementById('show-preset-prompts-btn');
presetPromptsListPanel = document.getElementById('preset-prompts-list-panel');
presetPromptsUl = document.getElementById('preset-prompts-ul');
maxTokensInputInline = document.getElementById('max-tokens-input-inline');
modelListEditor = document.getElementById('model-list-editor'); // 确保 modelListEditor 在这里被正确获取
const resizer = document.getElementById('sidebar-resizer');
const body = document.body;
sidebar = document.querySelector('.sidebar');


console.log("%cDOMContentLoaded: Script fully loaded and parsed.", "color: blue;"); // 日志A


    if (modelListEditor) {
        // 只在这里绑定一次事件监听器
            if (modelListEditor) {
               modelListEditor.addEventListener('click', (event) => {
            console.count("modelListEditor click event triggered"); // 确认这个合并监听器被调用的次数

            if (event.target.classList.contains('toggle-visibility-btn')) { // 处理单个模型显隐按钮
                if (typeof handleToggleVisibilityClick === 'function') {
                    console.log("Dispatching to handleToggleVisibilityClick");
                    handleToggleVisibilityClick(event);
                } else {
                    console.error("handleToggleVisibilityClick is not defined when trying to dispatch!");
                }
            } else if (event.target.classList.contains('toggle-group-visibility-btn')) { // 处理整个组显隐按钮
                if (typeof handleToggleGroupVisibilityClick === 'function') {
                    console.log("Dispatching to handleToggleGroupVisibilityClick");
                    handleToggleGroupVisibilityClick(event);
                } else {
                    console.error("handleToggleGroupVisibilityClick is not defined when trying to dispatch!");
                }
            }

        });
        console.log("SINGLE click listener BOUND to modelListEditor in DOMContentLoaded.");
        console.log("Event listeners for visibility toggles BOUND ONCE to modelListEditor.");
    }
    } else {
        console.error("CRITICAL: modelListEditor not found in DOMContentLoaded, cannot bind visibility toggle listener.");
    }

    const streamingToggle = document.getElementById('streaming-toggle');
    if (streamingToggle) {
        // 从 localStorage 读取状态，如果不存在则默认为 true (开启)
        const savedStreamingState = localStorage.getItem(STREAMING_ENABLED_STORAGE_KEY);
        isStreamingEnabled = (savedStreamingState === null) ? true : (savedStreamingState === 'true');
        
        // 更新开关的UI状态
        streamingToggle.checked = isStreamingEnabled;
        console.log("DOMContentLoaded: Streaming mode initialized to:", isStreamingEnabled);

        // 为开关的 change 事件添加监听器
        streamingToggle.addEventListener('change', function() { // <-- 修正！使用 streamingToggle
            // 这里的 isStreamingEnabled 是对全局布尔值变量的更新
            isStreamingEnabled = this.checked;
            localStorage.setItem(STREAMING_ENABLED_STORAGE_KEY, isStreamingEnabled.toString());
            console.log("Streaming mode changed by toggle to:", isStreamingEnabled);
            showToast(`流式输出已${isStreamingEnabled ? '开启' : '关闭'}。`, 'success');
        });
    } else {
        console.warn("DOMContentLoaded: Streaming toggle 'streaming-toggle' not found.");
    }
  // --- 初始化最大 Token 输入框 ---
    if (maxTokensInputInline) {
        // 从 LocalStorage 读取保存的值
        const savedMaxTokens = localStorage.getItem(MAX_TOKENS_STORAGE_KEY);
        if (savedMaxTokens !== null && !isNaN(parseInt(savedMaxTokens, 10))) {
            currentMaxTokens = parseInt(savedMaxTokens, 10);
            maxTokensInputInline.value = currentMaxTokens.toString();
            console.log("DOMContentLoaded: Max Tokens initialized from localStorage to:", currentMaxTokens);
        } else {
            // 如果 LocalStorage 没有值或无效，currentMaxTokens 保持为 null (使用API默认)
            // 输入框可以显示 placeholder，或者你可以设置一个默认值
            maxTokensInputInline.placeholder = 4096;
            console.log("DOMContentLoaded: Max Tokens not in localStorage, will use API default or placeholder.");
        }

        maxTokensInputInline.addEventListener('change', function() { // 使用 'change' 或 'input'
            const value = this.value.trim();
            if (value === "") { // 如果用户清空了输入框，表示使用API默认
                currentMaxTokens = null;
                localStorage.removeItem(MAX_TOKENS_STORAGE_KEY);
                console.log("Max Tokens cleared, will use API default.");
                this.placeholder = 4096
            } else {
                const numValue = parseInt(value, 10);
                if (!isNaN(numValue) && numValue >= 1) {
                    currentMaxTokens = numValue;
                    localStorage.setItem(MAX_TOKENS_STORAGE_KEY, currentMaxTokens.toString());
                    console.log("Max Tokens changed to:", currentMaxTokens);
                } else {
                    // 输入无效，可以恢复到之前的值或清空
                    this.value = currentMaxTokens !== null ? currentMaxTokens.toString() : "";
                    if (this.value === "") this.placeholder = `默认 (如 ${DEFAULT_MAX_TOKENS_PLACEHOLDER})`;
                    showToast("请输入有效的最大Token数 (正整数)。", 'warning');
                }
            }
        });
    } else {
        console.warn("DOMContentLoaded: Max tokens input 'max-tokens-input-inline' not found.");
    }

try {
        const response = await fetch('configs/prompts.json?t=' + new Date().getTime()); // 添加时间戳防止缓存
        if (response.ok) {
            const data = await response.json();
            if (data && Array.isArray(data.prompts)) { // 确保 JSON 结构正确
                loadedPresetPrompts = data.prompts;
                console.log("[DOMContentLoaded] Successfully loaded presets from prompts.json:", loadedPresetPrompts);
            } else {
                console.error("[DOMContentLoaded] Invalid format in prompts.json. Expected { prompts: [...] }");
                loadedPresetPrompts = []; // 加载失败则为空
            }
        } else {
            console.error("Failed to load prompts.json. Status:", response.status);
            loadedPresetPrompts = []; // 加载失败则为空
        }
    } catch (error) {
        console.error("Error fetching or parsing prompts.json:", error);
        loadedPresetPrompts = []; // 出错则为空
    }

if (showPresetPromptsBtn && presetPromptsListPanel && presetPromptsUl) {
    populatePresetPromptsList(); // 填充列表

    showPresetPromptsBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        const isVisible = presetPromptsListPanel.style.display === 'block'; // 或者你用来显示的 display 值
        presetPromptsListPanel.style.display = isVisible ? 'none' : 'block';
    });

    // 点击外部关闭 (与行内聊天设置面板的逻辑类似)
    document.addEventListener('click', (event) => {
        if (presetPromptsListPanel.style.display === 'block') {
            if (!presetPromptsListPanel.contains(event.target) && event.target !== showPresetPromptsBtn && !showPresetPromptsBtn.contains(event.target)) {
                presetPromptsListPanel.style.display = 'none';
            }
        }
    });
    presetPromptsListPanel.addEventListener('click', e => e.stopPropagation()); // 防止点击面板内部关闭
} else {
    // 打印警告，如果关键元素未找到
    if(!showPresetPromptsBtn) console.warn("Button 'show-preset-prompts-btn' not found.");
    if(!presetPromptsListPanel) console.warn("Panel 'preset-prompts-list-panel' not found.");
    if(!presetPromptsUl) console.warn("UL 'preset-prompts-ul' not found.");
}
    
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
    thinkModeToggle = document.getElementById('think-mode-toggle');
    const sidebarHeader = document.getElementById('sidebar-header');
    filePreviewArea = document.getElementById('file-preview-area');
const logoDisplay = document.getElementById('logo-display');
const searchInput = document.getElementById('search-conversations');
const searchWrapper = document.getElementById('search-wrapper');

if (sidebar && resizer && body) {
  
  // 1. 从 localStorage 加载初始状态
  const isSidebarCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
  if (isSidebarCollapsed) {
    body.classList.add('sidebar-collapsed');
  }

  // 2. 为点击区域添加点击事件
  resizer.addEventListener('click', () => {
    // 切换 body 上的 'sidebar-collapsed' 类
    body.classList.toggle('sidebar-collapsed');
    
    // 3. 将新状态保存到 localStorage
    const isNowCollapsed = body.classList.contains('sidebar-collapsed');
    localStorage.setItem('sidebarCollapsed', String(isNowCollapsed));
  });

} else {
    // 如果元素没找到，这里会打印警告，帮助你调试
    console.warn("Sidebar toggle functionality could not be initialized. Required elements not found.");
}
    
if (sidebarHeader && logoDisplay && searchInput && searchWrapper) {

  // 功能 1: 点击 Logo，切换到搜索模式
  logoDisplay.addEventListener('click', () => {
    sidebarHeader.classList.add('search-mode');
    searchWrapper.style.display = 'flex'; // 先显示，才能聚焦

    // 延迟聚焦，确保元素已渲染
    setTimeout(() => {
      searchInput.focus();
    }, 50); 
  });

  // 功能 2: 搜索框失去焦点时，切换回 Logo
  searchInput.addEventListener('blur', () => {
    // 只有当搜索框为空时才变回Logo
    if (searchInput.value.trim() === '') {
      sidebarHeader.classList.remove('search-mode');
      // 动画结束后再彻底隐藏元素，避免闪烁
      setTimeout(() => {
        if (!sidebarHeader.classList.contains('search-mode')) {
          searchWrapper.style.display = 'none';
        }
      }, 200); // 时间应大于等于 CSS transition 时间
    }
  });

  // 功能 3: 在搜索框输入时，实时过滤对话列表
  searchInput.addEventListener('input', () => {
    // 调用我们修改过的 renderConversationList 函数
    renderConversationList(searchInput.value);
  });
}


if (sidebarHeader && logoDisplay && searchInput && searchWrapper) {

  // --- 封装一个函数，用于从搜索状态恢复到Logo状态 ---
  function switchToLogoView() {
    // 1. 如果当前不是Logo状态，才执行恢复操作
    if (sidebarHeader.classList.contains('search-mode')) {
      // 2. 清空搜索框内容
      searchInput.value = '';
      
      // 3. 移除 'search-mode' 类以触发CSS动画
      sidebarHeader.classList.remove('search-mode');
      
      // 4. 重新渲染完整的对话列表 (因为搜索词已清空)
      renderConversationList(''); // 传入空字符串清除过滤
      
      // 5. 动画结束后再隐藏搜索框元素，优化性能
      setTimeout(() => {
        if (!sidebarHeader.classList.contains('search-mode')) {
          searchWrapper.style.display = 'none';
        }
      }, 200); // 时间应大于等于CSS transition时间
    }
  }

  // --- 事件绑定 ---

  // 1. 点击 Logo 时，切换到搜索模式
  logoDisplay.addEventListener('click', (e) => {
    e.stopPropagation(); // 防止事件冒泡到document
    sidebarHeader.classList.add('search-mode');
    searchWrapper.style.display = 'flex';
    
    setTimeout(() => {
      searchInput.focus();
    }, 50); 
  });

  // 2. 搜索框输入时，实时过滤
  searchInput.addEventListener('input', () => {
    renderConversationList(searchInput.value);
  });
  
  // 3. 点击页面任何其他地方，都恢复到 Logo 状态
  document.addEventListener('click', (e) => {
    // 检查点击的是否是搜索框本身
    const isClickInsideSearch = searchWrapper.contains(e.target);
    
    if (!isClickInsideSearch) {
      switchToLogoView();
    }
  });

  // 4. 按下 Escape 键也可以恢复到 Logo 状态
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      switchToLogoView();
    }
  });
}

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
    

    
    console.log("DEBUG DOMContentLoaded: DOM fully loaded and parsed.");
    if (modelForm) { // 添加一个检查，确保 modelForm 元素存在
        modelForm.addEventListener('submit', function(event) {
          event.preventDefault();
          const groupLabel = document.getElementById('model-group-label').value.trim();
          const modelText = document.getElementById('model-text').value.trim();
          const modelValue = document.getElementById('model-value').value.trim();

          const editGroupIndex = document.getElementById('edit-group-index').value;
          const editOptionIndex = document.getElementById('edit-option-index').value;

          if (!groupLabel || !modelText || !modelValue) {
            showToast('所有字段均为必填项！', 'warning');
            return;
          }

          const newOptionData = { text: modelText, value: modelValue };

          if (editGroupIndex !== '' && editOptionIndex !== '') {
            // 编辑现有模型
            const groupIndex = parseInt(editGroupIndex);
            const optionIndex = parseInt(editOptionIndex);
            const targetGroup = editableModelConfig.models[groupIndex]; // 先获取组

            // 检查 targetGroup 和 targetGroup.options 是否存在，防止后续错误
            if (!targetGroup || !targetGroup.options || !targetGroup.options[optionIndex]) {
                console.error("编辑模型时发生错误：找不到目标组或选项。");
                closeModelForm(); // 可能需要关闭表单并提示用户
                return;
            }
            const targetGroupLabel = targetGroup.groupLabel;


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

          renderModelManagementUI(); // 确保 renderModelManagementUI 定义在此作用域可访问
          closeModelForm(); // 确保 closeModelForm 定义在此作用域可访问
        });
    } else {
        console.error("DOMContentLoaded: Model form 'model-form' not found. Submit listener NOT attached.");
    }
    
    const exportCurrentBtn = document.getElementById('export-current-btn');


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
                        handleSubmitActionClick(); // ★★★ 核心修改：调用 handleSubmitActionClick 而不是直接调用 send ★★★
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

    submitActionBtn = document.getElementById('submit-action-btn');
     console.log("%cDOMContentLoaded: Value of submitActionBtn after getElementById:", "color: blue;", submitActionBtn); // 日志B

     if (!submitActionBtn) {
        console.error("CRITICAL: submitActionBtn not found in DOMContentLoaded!");
    } else {
        // 确保事件监听器在这里正确绑定
        submitActionBtn.addEventListener('click', handleSubmitActionClick);
    }
    
    
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

    const clearCurrentBtn = document.getElementById('clear-current-btn');
  if (clearCurrentBtn) {
    clearCurrentBtn.addEventListener('click', clearCurrentConversation);
  }

    

    const modelSelect = document.getElementById('model');
    if (modelSelect) {
    modelSelect.addEventListener('change', (e) => {
        const conv = getCurrentConversation(); // 获取当前对话
        if (conv) {
            conv.model = e.target.value; // 更新对话对象中的模型
            saveConversations(); // 保存更改
        }
    });
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

    if (messagesContainerForScrollLogic && scrollToBottomBtnForLogic) {
    messagesContainerForScrollLogic.addEventListener('scroll', updateScrollToBottomButtonVisibility); // 监听滚动

    scrollToBottomBtnForLogic.addEventListener('click', () => {
        messagesContainerForScrollLogic.scrollTo({
            top: messagesContainerForScrollLogic.scrollHeight,
            behavior: 'smooth'
        });
        // 点击后，因为会滚动到底部，scroll 事件会触发，按钮会自动隐藏
    });
    // 初始加载时也调用一次，确保基于初始内容状态正确
    updateScrollToBottomButtonVisibility();
}

if (exportCurrentBtn) {
  exportCurrentBtn.addEventListener('click', () => {
    if (currentConversationId) {
      // 调用导出函数，默认导出为 Markdown 格式
      exportSingleConversation(currentConversationId, 'md'); 
    } else {
      showToast('没有活动的对话可导出', 'warning');
    }
  });
}

    // 1. 获取两个开关的 DOM 元素
    autoThinkModeToggle = document.getElementById('auto-think-mode-toggle');
    thinkModeToggle = document.getElementById('think-mode-toggle');

    if (autoThinkModeToggle && thinkModeToggle) {
        
        // 2. 封装一个函数，用于根据“自动模式”的状态来更新“手动模式”的禁用状态
        const updateManualThinkModeState = () => {
            // isAutoThinkModeEnabled 是全局变量，代表“自动模式”是否开启
            const isDisabled = isAutoThinkModeEnabled;
            
            // 禁用或启用“手动模式”开关
            thinkModeToggle.disabled = isDisabled;
            
            // (可选) 在禁用时，给“手动模式”的整行添加一个视觉上的禁用样式
            const manualThinkModeItem = thinkModeToggle.closest('.setting-item');
            if (manualThinkModeItem) {
                manualThinkModeItem.style.opacity = isDisabled ? '0.5' : '1';
                manualThinkModeItem.style.pointerEvents = isDisabled ? 'none' : 'auto';
            }
        };

        // 3. 初始化“自动模式”开关
        isAutoThinkModeEnabled = localStorage.getItem(AUTO_THINK_MODE_STORAGE_KEY) === 'true';
        autoThinkModeToggle.checked = isAutoThinkModeEnabled;
        console.log("DOMContentLoaded: Auto Think Mode initialized to:", isAutoThinkModeEnabled);

        // 4. 初始化“手动模式”开关
        const savedThinkMode = localStorage.getItem(THINK_MODE_STORAGE_KEY);
        isManualThinkModeEnabled = (savedThinkMode === 'true');
        thinkModeToggle.checked = isManualThinkModeEnabled;
        console.log("DOMContentLoaded: Manual Think Mode initialized to:", isManualThinkModeEnabled);

        // 5. ★★★ 核心逻辑：页面加载时，立即执行一次联动更新 ★★★
        updateManualThinkModeState();

        // 6. ★★★ 核心逻辑：为“自动模式”开关添加事件监听器 ★★★
        autoThinkModeToggle.addEventListener('change', function() {
            isAutoThinkModeEnabled = this.checked;
            localStorage.setItem(AUTO_THINK_MODE_STORAGE_KEY, isAutoThinkModeEnabled.toString());
            console.log("Auto Think Mode changed by toggle to:", isAutoThinkModeEnabled);
            
            // 当“自动模式”状态改变时，再次调用更新函数
            updateManualThinkModeState();
        });

        // 7. “手动模式”开关的事件监听器保持不变
        thinkModeToggle.addEventListener('change', function() {
            isManualThinkModeEnabled = this.checked;
            localStorage.setItem(THINK_MODE_STORAGE_KEY, isManualThinkModeEnabled.toString());
            console.log("Manual Think Mode changed by toggle to:", isManualThinkModeEnabled);
        });

    } else {
        if (!autoThinkModeToggle) console.warn("Switch 'auto-think-mode-toggle' not found.");
        if (!thinkModeToggle) console.warn("Switch 'think-mode-toggle' not found.");
    }

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
                    showToast(`成功导入 ${importedCount} 条新对话。`, 'success');
                } else { showToast('没有导入新的对话。', 'warning'); }
            } catch (err) {
                console.error('DOMContentLoaded: Error importing history file:', err);
                showToast('导入失败：' + err.message, 'error');
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
    const chatSettingsBtnInline = document.getElementById('chat-settings-btn-inline');


    const fileInputInline = document.getElementById('file-input-inline'); // 确保在这里获取

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

    const messagesContainer = document.getElementById('messages');
    const scrollToBottomBtn = document.getElementById('scroll-to-bottom-btn');
    
    // 优化后的阈值设置
    const BUTTON_VISIBILITY_THRESHOLD = 150;   // 显示"回到底部"按钮的距离（正常值）
    const AUTO_RESUME_THRESHOLD = 0.1;         // 自动恢复滚动到底部的距离
    const SCROLL_PAUSE_THRESHOLD = 1;        // 向上滚动这个距离暂停自动滚动
    
    let userHasManuallyScrolledUp = false;  // 用户手动滚动状态

    if (messagesContainer && scrollToBottomBtn) {
        // 滚轮事件处理 - 只保留一个wheel事件监听器
        messagesContainer.addEventListener('wheel', (event) => {
            const scrollTop = messagesContainer.scrollTop;
            const scrollHeight = messagesContainer.scrollHeight;
            const clientHeight = messagesContainer.clientHeight;
            const distanceFromBottom = scrollHeight - clientHeight - scrollTop;

            // 向上滚动时暂停自动滚动
            if (event.deltaY < 0) {
                // 只有当用户滚动超过暂停阈值时才标记
                if (distanceFromBottom > SCROLL_PAUSE_THRESHOLD) {
                    if (!userHasManuallyScrolledUp) {
                        console.log("[Wheel] 用户向上滚动，暂停自动滚动", distanceFromBottom);
                        userHasManuallyScrolledUp = true;
                    }
                }
            }
            // 向下滚动到底部时恢复自动滚动
            else if (distanceFromBottom <= AUTO_RESUME_THRESHOLD) {
                if (userHasManuallyScrolledUp) {
                    console.log("[Wheel] 用户滚动到底部，恢复自动滚动", distanceFromBottom);
                    userHasManuallyScrolledUp = false;
                }
            }
        }, { passive: true });

        // 增强滚动事件处理
        messagesContainer.addEventListener('scroll', () => {
            const scrollTop = messagesContainer.scrollTop;
            const scrollHeight = messagesContainer.scrollHeight;
            const clientHeight = messagesContainer.clientHeight;
            const distanceFromBottom = scrollHeight - clientHeight - scrollTop;

            // 按钮显隐控制
            if (distanceFromBottom > BUTTON_VISIBILITY_THRESHOLD && scrollHeight > clientHeight) {
                scrollToBottomBtn.style.display = 'flex';
            } else {
                scrollToBottomBtn.style.display = 'none';
            }

            // 用户手动滚动到底部时恢复自动滚动
            if (distanceFromBottom <= AUTO_RESUME_THRESHOLD && userHasManuallyScrolledUp) {
                console.log("[Scroll] 用户到达底部，恢复自动滚动", distanceFromBottom);
                userHasManuallyScrolledUp = false;
            }
        });

        // 点击按钮处理
        scrollToBottomBtn.addEventListener('click', () => {
            console.log("[Button] 点击回到底部按钮");
            userHasManuallyScrolledUp = false;
            messagesContainer.scrollTo({
                top: messagesContainer.scrollHeight,
                behavior: 'auto'
            });
        });

        // 改进初始化逻辑
        const initDistance = messagesContainer.scrollHeight - messagesContainer.clientHeight - messagesContainer.scrollTop;
        
        // 使用统一的阈值判断初始状态
        userHasManuallyScrolledUp = initDistance > SCROLL_PAUSE_THRESHOLD;
        
        // 设置按钮初始状态
        scrollToBottomBtn.style.display = 
            (initDistance > BUTTON_VISIBILITY_THRESHOLD && messagesContainer.scrollHeight > messagesContainer.clientHeight) 
            ? 'flex' : 'none';

        console.log(`[Init] 初始状态: ${userHasManuallyScrolledUp ? '已暂停自动滚动' : '自动滚动中'}, 距离底部: ${initDistance}px`);
    }

    // 暴露消息处理函数到全局作用域
    window.onNewMessageAdded = function() {
        if (messagesContainer && !userHasManuallyScrolledUp) {
            messagesContainer.scrollTo({
                top: messagesContainer.scrollHeight,
                behavior: 'smooth'
            });
        }
    };
});


// --- END OF FILE script.js ---