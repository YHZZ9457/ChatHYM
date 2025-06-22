// --- START OF FILE js/utils.js ---

/**
 * HTML-escapes a string.
 * @param {string} str The string to escape.
 * @returns {string} The escaped string.
 */
export function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Strips Markdown formatting from a string.
 * @param {string} markdownText The Markdown text.
 * @returns {string} The plain text.
 */
export function stripMarkdown(markdownText) {
    if (typeof markdownText !== 'string' || !markdownText) {
        return '';
    }
    const tempDiv = document.createElement('div');
    // 假设 marked.parse 已通过 <script> 标签全局加载
    tempDiv.innerHTML = marked.parse(markdownText);
    let plainText = tempDiv.textContent || "";
    plainText = plainText.replace(/\s+/g, ' ').trim();
    return plainText;
}

/**
 * Reads a file as a Base64 string.
 * @param {File} file The file to read.
 * @returns {Promise<string>} A promise that resolves with the Base64 string.
 */
export function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = (error) => reject(error);
        reader.readAsDataURL(file);
    });
}

/**
 * Extracts thinking and reply portions from a text chunk.
 * @param {string} textChunk - 当前收到的文本块。
 * @param {string} startTag - 思考过程的开始标签 (例如 "<think>")。
 * @param {string} endTag - 思考过程的结束标签 (例如 "</think>")。
 * @param {boolean} currentlyInThinkingBlock - 一个状态变量，指示上一个块是否以未闭合的 startTag 结束。
 * @returns {{replyTextPortion: string, thinkingTextPortion: string, newThinkingBlockState: boolean}}
 */
export function extractThinkingAndReply(textChunk, startTag, endTag, currentlyInThinkingBlock) {
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

/**
 * 从指定的 DOM 容器中，移除空的文本节点和空的 <p> 标签。
 * 同时也会移除只包含 <br> 或空白字符（包括  ）的 <p> 标签。
 * @param {HTMLElement} container - 要清理的 DOM 容器元素。
 */
export function pruneEmptyNodes(container) {
  if (!container) return;
  
  // 移除只包含空白的文本节点
  Array.from(container.childNodes).forEach(node => {
    if (node.nodeType === Node.TEXT_NODE && !node.textContent.trim()) {
      node.remove();
    }
  });

  // 移除空的 <p> 标签或只包含 <br> 或空白字符的 <p> 标签
  container.querySelectorAll('p').forEach(p => {
    // \u00A0 是   的 Unicode 编码
    const textContent = p.textContent.replace(/\u00A0/g, '').trim();
    const hasOnlyBr = p.children.length === 1 && p.children[0].tagName === 'BR';
    
    if (!textContent && (p.children.length === 0 || hasOnlyBr)) {
      p.remove();
    }
  });
}

// --- UI 工具 ---

/**
 * Displays a toast notification.
 * @param {string} message The message to display.
 * @param {'info'|'success'|'warning'|'error'} [type='info'] The type of toast.
 */
export function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('show');
    }, 10);

    setTimeout(() => {
        toast.classList.remove('show');
        toast.addEventListener('transitionend', () => toast.remove());
    }, 3000);
}

/**
 * Updates the state of the submit button.
 * @param {boolean} isStopping - True if the button should show "Stop".
 * @param {HTMLElement} buttonElement - The button element to update.
 */
export function updateSubmitButtonState(isStopping, buttonElement) {
    if (!buttonElement) {
        console.error("updateSubmitButtonState: buttonElement is not defined or null!");
        return;
    }
    const textSpan = buttonElement.querySelector('span');
    if (isStopping) {
        buttonElement.classList.add('is-stopping');
        if (textSpan) textSpan.textContent = '停止';
        else buttonElement.textContent = '停止';
        buttonElement.disabled = false;
    } else {
        buttonElement.classList.remove('is-stopping');
        if (textSpan) textSpan.textContent = '发送';
        else buttonElement.textContent = '发送';
    }
}

/**
 * Applies a theme to the document body.
 * @param {string} theme - 'light' or 'dark'.
 */
export function applyTheme(theme) {
  if (theme === 'dark') {
    document.body.classList.add('dark-theme');
    document.body.classList.remove('light-theme');
  } else {
    document.body.classList.add('light-theme');
    document.body.classList.remove('dark-theme');
  }
  localStorage.setItem('theme', theme);
}

/**
 * Applies a UI scale to the document.
 * @param {number} scale - Scale factor (e.g., 1.0, 0.9).
 * @param {HTMLElement} [optionsContainer] - (Optional) Container of scale buttons, for updating 'active' state.
 */
export function applyUiScale(scale, optionsContainer) {
    document.documentElement.style.setProperty('--ui-scale', scale);
    localStorage.setItem('ui-scale', String(scale));

    if (optionsContainer) {
        optionsContainer.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        const activeButton = optionsContainer.querySelector(`button[data-scale="${scale}"]`);
        if (activeButton) activeButton.classList.add('active');
    }
}

