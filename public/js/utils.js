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
 * 更新提交按钮的状态（“发送”或“停止”）。
 * @param {boolean} isGenerating - True if the response is currently being generated.
 * @param {HTMLElement} buttonElement - The button element to update.
 */
export function updateSubmitButtonState(isGenerating, buttonElement) { // 再次移除 hasInputContent 参数
    if (!buttonElement) {
        console.error("updateSubmitButtonState: buttonElement is not defined or null!");
        return;
    }
    const textSpan = buttonElement.querySelector('span');

    if (isGenerating) {
        // 处于生成状态：显示“停止”，按钮始终可点击
        buttonElement.classList.add('is-stopping');
        if (textSpan) textSpan.textContent = '停止';
        else buttonElement.textContent = '停止';
        // buttonElement.disabled = false; // 这一行可以保留，但因为默认就是false，所以可以省略
    } else {
        // 不处于生成状态：显示“发送”，按钮始终可点击
        buttonElement.classList.remove('is-stopping');
        if (textSpan) textSpan.textContent = '发送';
        else buttonElement.textContent = '发送';
        // buttonElement.disabled = false; // ★ 核心修复：始终确保按钮是可点击的
    }
    // 明确设置 disabled 属性，确保它是 false，除非有其他外部逻辑设置它
    buttonElement.disabled = false; 
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

/**
 * 将文件（以 Base64 形式）保存到 IndexedDB。
 * @param {string} fileId - 文件的唯一ID。
 * @param {string} base64Content - 文件的完整 Base64 Data URL。
 * @returns {Promise<void>}
 */
export async function saveFileToDB(fileId, base64Content) {
    if (typeof idbKeyval === 'undefined') {
        console.error("idb-keyval library is not loaded.");
        return;
    }
    try {
        await idbKeyval.set(fileId, base64Content);
    } catch (error) {
        console.error(`Failed to save file ${fileId} to IndexedDB:`, error);
    }
}

/**
 * 从 IndexedDB 读取文件。
 * @param {string} fileId - 文件的唯一ID。
 * @returns {Promise<string|undefined>} - 返回文件的 Base64 Data URL，如果找不到则返回 undefined。
 */
export async function getFileFromDB(fileId) {
    if (typeof idbKeyval === 'undefined') {
        console.error("idb-keyval library is not loaded.");
        return undefined;
    }
    try {
        return await idbKeyval.get(fileId);
    } catch (error) {
        console.error(`Failed to get file ${fileId} from IndexedDB:`, error);
        return undefined;
    }
}

/**
 * 从 IndexedDB 中删除一个或多个文件。
 * @param {Array<string>} fileIds - 要删除的文件ID数组。
 */
export async function deleteFilesFromDB(fileIds) {
    if (typeof idbKeyval === 'undefined' || !Array.isArray(fileIds)) {
        return;
    }
    try {
        // idb-keyval 的 delMany 在某些版本可用，但单个删除更可靠
        for (const fileId of fileIds) {
            await idbKeyval.del(fileId);
        }
    } catch (error) {
        console.error(`Failed to delete files from IndexedDB:`, error);
    }
}

/**
 * 在客户端调整图片尺寸。
 * @param {File} file - 原始图片文件对象。
 * @param {number} maxWidthOrHeight - 调整后的最大宽度或高度。
 * @returns {Promise<File>} - 一个 Promise，解析为一个新的、被压缩后的 File 对象。
 */
export function resizeImage(file, maxWidthOrHeight = 1920) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let { width, height } = img;

                // 计算缩放比例，保持宽高比
                if (width > height) {
                    if (width > maxWidthOrHeight) {
                        height *= maxWidthOrHeight / width;
                        width = maxWidthOrHeight;
                    }
                } else {
                    if (height > maxWidthOrHeight) {
                        width *= maxWidthOrHeight / height;
                        height = maxWidthOrHeight;
                    }
                }

                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                // 将 canvas 转换为 Blob 对象，并指定为 JPEG 格式以进行有损压缩
                // 0.8 是一个比较均衡的图片质量设置
                canvas.toBlob(
                    (blob) => {
                        if (blob) {
                            // 创建一个新的 File 对象，保留原始文件名和类型
                            const newFile = new File([blob], file.name, {
                                type: 'image/jpeg',
                                lastModified: Date.now(),
                            });
                            resolve(newFile);
                        } else {
                            reject(new Error('Canvas to Blob conversion failed.'));
                        }
                    },
                    'image/jpeg',
                    0.8 
                );
            };
            img.onerror = reject;
            // 将读取的文件数据（Base64）赋给 Image 对象的 src
            img.src = event.target.result;
        };
        reader.onerror = reject;
        // 以 Data URL (Base64) 形式读取文件，以便在 Image 对象中使用
        reader.readAsDataURL(file);
    });
}