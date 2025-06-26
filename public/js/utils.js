// --- START OF FILE js/utils.js ---

/**
 * 生成一个简单的、基于时间的、伪唯一的ID。
 * 对于客户端应用足够用，比引入整个 uuid 库更轻量。
 * @returns {string}
 */
export function generateSimpleId() {
  return `msg_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`;
}

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
 * Extracts the current thinking and reply portions from a *full accumulated text*.
 * This function processes the entire string to determine the current state and content.
 *
 * @param {string} fullText - 截至目前为止，累积的完整文本。
 * @param {string} startTag - 思考过程的开始标签 (例如 "<think>")。
 * @param {string} endTag - 思考过程的结束标签 (例如 "</think>")。
 * @returns {{replyText: string, thinkingText: string, inThinkingBlock: boolean}}
 *   - replyText: 截至目前为止，纯粹的回复文本（不含思考标签和内容）。
 *   - thinkingText: 截至目前为止，纯粹的思考文本（不含思考标签和内容）。
 *   - inThinkingBlock: 在处理完 fullText 后，是否处于未闭合的思考块内部。
 */
export function extractThinkingAndReply(fullText, startTag, endTag) {
    let replyText = "";
    let thinkingText = "";
    let inThinkingBlock = false;
    let currentPos = 0;

    while (currentPos < fullText.length) {
        if (inThinkingBlock) {
            const endTagIndex = fullText.indexOf(endTag, currentPos);
            if (endTagIndex !== -1) {
                thinkingText += fullText.substring(currentPos, endTagIndex);
                currentPos = endTagIndex + endTag.length;
                inThinkingBlock = false;
            } else {
                thinkingText += fullText.substring(currentPos);
                currentPos = fullText.length;
            }
        } else {
            const startTagIndex = fullText.indexOf(startTag, currentPos);
            if (startTagIndex !== -1) {
                replyText += fullText.substring(currentPos, startTagIndex);
                currentPos = startTagIndex + startTag.length;
                inThinkingBlock = true;
                // 立即检查是否是空思考块
                if (fullText.indexOf(endTag, currentPos) === currentPos) {
                    currentPos += endTag.length;
                    inThinkingBlock = false;
                }
            } else {
                replyText += fullText.substring(currentPos);
                currentPos = fullText.length;
            }
        }
    }
    
    // 确保返回的文本不包含标签本身
    replyText = replyText.replace(new RegExp(startTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '')
                         .replace(new RegExp(endTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '');
    thinkingText = thinkingText.replace(new RegExp(startTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '')
                               .replace(new RegExp(endTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '');

    return { replyText, thinkingText, inThinkingBlock };
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

