// --- START OF FILE js/conversation.js ---

import * as state from './state.js';
import * as utils from './utils.js';

// ========================================================================
// 1. Local Storage 管理
// ========================================================================

/**
 * 从 Local Storage 加载对话列表到 state。
 */
export function loadConversations() {
  try {
    const data = localStorage.getItem('conversations');
    const parsedData = data ? JSON.parse(data) : [];
    if (Array.isArray(parsedData)) {
      state.setConversations(parsedData);
    } else {
      state.setConversations([]);
      console.warn("[loadConversations] Data from localStorage was not an array. Resetting.");
    }
  } catch (error) {
    console.error("[loadConversations] CRITICAL ERROR while loading/parsing:", error);
    utils.showToast("加载历史对话失败！数据可能已损坏。", "error");
    state.setConversations([]);
  }
}

/**
 * 将 state 中的对话列表保存到 Local Storage。
 */
export function saveConversations() {
  try {
    const conversationsForStorage = state.conversations.map(conv => {
        const convCopy = { ...conv };
        convCopy.messages = conv.messages.map(msg => {
            if (msg.role === 'user' && msg.content && typeof msg.content === 'object' && msg.content.files) {
                const msgCopy = { ...msg };
                const safeContent = { ...msgCopy.content };
                // 只保存文件的元信息，不保存base64数据
                safeContent.files = safeContent.files.map(file => ({ name: file.name, type: file.type }));
                msgCopy.content = safeContent;
                return msgCopy;
            }
            return msg;
        });
        return convCopy;
    });
    localStorage.setItem('conversations', JSON.stringify(conversationsForStorage));
  } catch (error) {
    console.error("[saveConversations] CRITICAL ERROR while preparing or saving conversations:", error);
    utils.showToast("保存对话失败！请检查控制台获取详细信息。", "error");
  }
}

// ========================================================================
// 2. 对话数据操作 (只返回数据或状态，不调用UI函数)
// ========================================================================

/**
 * 创建一个新的对话对象，添加到 state，并返回这个新对象。
 * @returns {object} 新创建的对话对象。
 */
export function createNewConversation() {
  const id = Date.now().toString();
  // 从 state 获取当前模型，而不是直接操作DOM
  const currentConv = state.getCurrentConversation();
  const model = currentConv ? currentConv.model : (document.getElementById('model')?.value || 'default-model');

  const newConv = {
    id,
    title: '新对话',
    model: model,
    messages: [],
    archived: false,
    isNew: true,
  };
  state.conversations.unshift(newConv);
  saveConversations();
  return newConv;
}

/**
 * 根据 ID 获取对话对象。
 * @param {string} id - 对话 ID。
 * @returns {object|undefined} 对话对象。
 */
export function getConversationById(id) {
    return state.conversations.find(c => c.id === id);
}

/**
 * 获取应用启动时应该加载的初始对话ID。
 * @returns {string | null} 应该被初始加载的对话ID，如果是新对话则返回 'new'。
 */
export function getInitialConversationId() {
    if (state.conversations.length === 0) {
        return 'new';
    }
    const firstNonArchived = state.conversations.find(c => !c.archived);
    return firstNonArchived ? firstNonArchived.id : state.conversations[0].id;
}


/**
 * 删除指定 ID 的对话，并返回下一个应该被加载的对话ID。
 * @param {string} id - 要删除的对话的 ID。
 * @returns {{nextIdToLoad: string|null}} 返回一个包含下一个要加载的ID的对象。
 */
export function deleteConversation(id) {
  const idx = state.conversations.findIndex(c => c.id === id);
  if (idx === -1) {
    utils.showToast('无法删除：对话未找到。', 'error');
    return { nextIdToLoad: null };
  }
  const deletedTitle = state.conversations[idx].title; 
  const wasCurrent = state.conversations[idx].id === state.currentConversationId;
  state.conversations.splice(idx, 1);
  saveConversations();
  utils.showToast(`对话「${deletedTitle}」已删除。`, 'success');

  if (wasCurrent) {
    return { nextIdToLoad: getInitialConversationId() };
  }
  return { nextIdToLoad: null }; // 表示UI不需要切换对话
}

/**
 * 重命名指定 ID 的对话。
 * @param {string} id - 要重命名的对话的 ID。
 */
export function renameConversationTitle(id, newTitle) {
  const conv = getConversationById(id);
  if (conv && newTitle) {
    conv.title = newTitle;
    saveConversations();
  }
}

/**
 * 清空当前活动对话的所有消息。
 * @returns {string|null} 返回当前对话的ID，如果操作失败则返回null。
 */
export function clearCurrentConversation() {
  const conv = state.getCurrentConversation();
  if (!conv) {
    utils.showToast('没有活动的对话可供清空。', 'warning');
    return null;
  }
  const systemPrompt = conv.messages.find(m => m.role === 'system');
  conv.messages = systemPrompt ? [systemPrompt] : [];
  saveConversations();
  utils.showToast(`对话「${conv.title}」已清空。`, 'success');
  return conv.id;
}

/**
 * 准备编辑用户最后一次的提问。
 * @returns {string|null} 返回用户最后一次提问的文本，如果无法编辑则返回 null。
 */
export function setupForEditLastUserMessage() {
    const conv = state.getCurrentConversation();
    if (!conv || conv.messages.length === 0) return null;

    // 从后往前找，找到最后一条 user 消息的索引
    let lastUserIndex = -1;
    for (let i = conv.messages.length - 1; i >= 0; i--) {
        if (conv.messages[i].role === 'user') {
            lastUserIndex = i;
            break;
        }
    }

    if (lastUserIndex === -1) return null; // 对话中没有用户消息

    // 获取该用户消息的内容
    const userMessageToEdit = conv.messages[lastUserIndex];
    const textToEdit = userMessageToEdit.content.text || ''; // 确保拿到文本

    // 从该用户消息开始，删除之后的所有消息（包括它自己）
    conv.messages.splice(lastUserIndex);
    saveConversations();
    
    return textToEdit;
}

export function applyPresetPrompt(preset) {
  if (!preset) return;

  const conv = state.getCurrentConversation();
  if (!conv) {
    utils.showToast("没有活动的对话，无法应用模板。", 'warning');
    return;
  }

  // 只处理 'system_prompt' 类型，因为这会修改对话数据
  if (preset.type === 'system_prompt') {
    let systemMessage = conv.messages.find(m => m.role === 'system');
    if (systemMessage) {
      systemMessage.content = preset.prompt;
    } else {
      conv.messages.unshift({ role: 'system', content: preset.prompt });
    }
    saveConversations();
    utils.showToast(`系统角色已设置为: "${preset.name}"`, 'success');
    
    // 返回一个信号，告诉调用者UI需要更新
    return { needsUiUpdate: true }; 
  }

  // 对于其他类型 (如 'user_input')，此函数不再做任何事
  // 因为这是 UI 的职责，将由 ui.js 自己处理
  return { needsUiUpdate: false };
}



/**
 * 从指定索引处截断对话历史。
 * @param {number} index - 要保留的最后一条消息的索引。之后的所有消息都将被删除。
 */
export function truncateConversation(index) {
    const conv = state.getCurrentConversation();
    if (conv && index >= 0 && index < conv.messages.length) {
        conv.messages.length = index + 1; // 直接修改数组长度
        saveConversations();
    }
}

/**
 * 删除单条消息。
 * @param {HTMLElement} messageElement - 消息的DOM元素 (用于从UI上临时移除)。
 * @param {string} conversationId - 消息所属对话的ID。
 * @param {number} messageIndex - 消息在数组中的索引。
 */
export function deleteSingleMessage(messageElement, conversationId, messageIndex) {
  const conv = getConversationById(conversationId);
  const messageExistsInData = conv && messageIndex >= 0 && messageIndex < conv.messages.length;

  if (messageExistsInData) {
    const messageToConfirm = conv.messages[messageIndex];
    let confirmTextPreview = String(messageToConfirm.content?.text || messageToConfirm.content || "").substring(0, 50) + "...";
    if (confirm(`确实要删除这条消息吗？\n\n"${confirmTextPreview}"`)) {
      conv.messages.splice(messageIndex, 1);
      saveConversations();
    }
  } else {
    console.warn(`[Delete] Message at index ${messageIndex} not found in data model for conv ${conversationId}. Likely a streaming message. Removing from UI only.`);
    if (confirm('这条消息仍在生成中或数据异常。确实要从界面上移除它吗？（此操作不会保存）')) {
      messageElement.remove();
      if (state.isGeneratingResponse && state.currentAbortController) {
          state.currentAbortController.abort();
      }
    }
  }
}

/**
 * 切换指定对话的归档状态。
 * @param {string} id - 对话 ID。
 * @returns {{status: 'archived'|'unarchived', nextIdToLoad: string|null}}
 */
export function toggleArchive(id) {
  const conv = getConversationById(id);
  if (!conv) return { status: 'error', nextIdToLoad: null };
  
  conv.archived = !conv.archived;
  conv.isNew = false;
  saveConversations();

  if (conv.archived && state.currentConversationId === id) {
    return { status: 'archived', nextIdToLoad: getInitialConversationId() };
  }
  
  return { status: conv.archived ? 'archived' : 'unarchived', nextIdToLoad: conv.archived ? null : conv.id };
}

/**
 * 切换指定对话的置顶状态。
 * @param {string} id - 对话 ID。
 */
export function togglePin(id) {
    const conv = getConversationById(id);
    if (conv) {
        conv.isPinned = !conv.isPinned; 
        saveConversations();
    }
}

// js/conversation.js

/**
 * 为当前对话设置、更新或移除系统角色提示。
 * @param {string} promptText - 系统指令的内容。
 * @returns {object|null} 返回被修改后的对话对象，如果失败则返回 null。
 */
export function setSystemPrompt(promptText) {
    const conv = state.getCurrentConversation();
    if (!conv) {
        utils.showToast('没有活动的对话。', 'warning');
        return null;
    }

    // 查找对话中是否已存在 system 消息的索引
    const systemMessageIndex = conv.messages.findIndex(m => m.role === 'system');

    // 判断用户是想设置/更新，还是想移除
    if (promptText && promptText.trim()) {
        const newContent = promptText.trim();
        if (systemMessageIndex !== -1) {
            // 如果已存在，则更新内容
            conv.messages[systemMessageIndex].content = newContent;
            utils.showToast('系统指令已更新。', 'success');
        } else {
            // 如果不存在，则在消息列表的最前面添加一个新的 system 消息
            conv.messages.unshift({ role: 'system', content: newContent });
            utils.showToast('系统指令已设置。', 'success');
        }
    } else {
        // 如果用户输入为空，我们理解为要移除系统指令
        if (systemMessageIndex !== -1) {
            conv.messages.splice(systemMessageIndex, 1); // 从数组中移除该项
            utils.showToast('系统指令已移除。', 'info');
        }
        // 如果本来就没有，那就什么都不做
    }

    saveConversations();
    return conv;
}

// ========================================================================
// 4. 导入/导出功能
// ========================================================================

/**
 * 将所有对话历史导出为 JSON 文件。
 */
export function exportAllHistory() {
  const data = JSON.stringify(state.conversations, null, 2);
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

/**
 * 导出单个对话为指定格式的文件。
 * @param {string} conversationId - 要导出的对话 ID。
 * @param {string} [format='md'] - 导出格式 ('md' 或 'json')。
 */
export function exportSingleConversation(conversationId, format = 'md') {
  const conv = getConversationById(conversationId);
  if (!conv) {
    utils.showToast('找不到要导出的对话', 'error');
    return;
  }
  let fileContent = '';
  const fileExtension = format;
  if (format === 'md') {
    fileContent = `# ${conv.title}\n\n**模型:** ${conv.model || '未知'}\n\n---\n\n`;
    conv.messages.forEach(msg => {
      let content = (typeof msg.content === 'object' && msg.content.text) 
                    ? msg.content.text 
                    : String(msg.content);
      if (msg.role === 'user') fileContent += `**👤 You:**\n${content}\n\n`;
      else if (msg.role === 'assistant' || msg.role === 'model') {
        fileContent += `**🤖 Assistant:**\n${content}\n\n`;
        if (msg.reasoning_content) fileContent += `> **思考过程:**\n> ${msg.reasoning_content.replace(/\n/g, '\n> ')}\n\n`;
      }
    });
  } else { 
    fileContent = JSON.stringify(conv, null, 2);
  }
  const blob = new Blob([fileContent], { type: format === 'md' ? 'text/markdown;charset=utf-8' : 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safeTitle = (conv.title || 'untitled').replace(/[\/\\?%*:|"<>]/g, '-');
  a.download = `${safeTitle}.${fileExtension}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 清除所有聊天历史记录，并返回一个新的对话对象。
 * @returns {object} 新创建的对话对象。
 */
export function clearAllHistory() {
    state.setConversations([]);
    state.setCurrentConversationId(null);
    saveConversations();
    return createNewConversation();
}

/**
 * 导入对话记录。
 * @param {Array} importedConvs - 从JSON文件解析出的对话数组。
 * @returns {number} 成功导入的新对话数量。
 */
export function importConversations(importedConvs) {
    if (!Array.isArray(importedConvs)) throw new Error('导入的 JSON 顶层必须是一个对话数组');
    let importedCount = 0;
    importedConvs.forEach(importedConv => {
        if (importedConv?.id && importedConv?.title && importedConv?.messages) {
            if (!getConversationById(importedConv.id)) {
                state.conversations.push(importedConv);
                importedCount++;
            }
        }
    });
    if (importedCount > 0) saveConversations();
    return importedCount;
}

// --- END OF FILE js/conversation.js ---