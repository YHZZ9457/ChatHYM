// --- START OF FILE js/conversation.js ---

import * as state from './state.js';
import * as utils from './utils.js';

// ========================================================================
// 1. Local Storage 管理
// ========================================================================

/**
 * 将 state 中的对话列表保存到 Local Storage。
 */
export function saveConversations() {
  try {
    const conversationsForStorage = state.conversations.map(conv => {
        const convCopy = { ...conv };
        // 确保 messages 数组存在
        if (convCopy.messages) {
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
        }
        return convCopy;
    });
    localStorage.setItem('conversations', JSON.stringify(conversationsForStorage));
  } catch (error) {
    console.error("[saveConversations] CRITICAL ERROR while preparing or saving conversations:", error);
    utils.showToast("保存对话失败！请检查控制台获取详细信息。", "error");
  }
}

/**
 * 从 Local Storage 加载对话列表到 state。
 */
export function loadConversations() {
  try {
    const data = localStorage.getItem('conversations');
    const parsedData = data ? JSON.parse(data) : [];
    if (Array.isArray(parsedData)) {
      state.setConversations(parsedData);
      // ★ 核心修复：加载后不再自动重排序！我们相信 localStorage 中保存的顺序就是用户想要的最终顺序。
      // 排序只应该在特定操作（如置顶、归档）后触发。
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
 * 对整个对话列表进行标准排序并保存。
 * 顺序：置顶 -> 普通 -> 归档
 * 在每个组内，保持其现有相对顺序。
 */
function reorderConversations() {
    const pinned = state.conversations.filter(c => !c.archived && c.isPinned);
    const normal = state.conversations.filter(c => !c.archived && !c.isPinned);
    const archived = state.conversations.filter(c => c.archived);
    
    // 按标准顺序重组数组
    const newConversations = [...pinned, ...normal, ...archived];
    
    // 更新状态
    state.setConversations(newConversations);
    
    // ★ 注意：这里不需要再调用 saveConversations()，因为调用 reorderConversations 的函数（如 togglePin）最后会调用它。
    // 为了安全起见，加上也无妨，但可能会有一次冗余的保存。
}


// ========================================================================
// 2. 对话数据操作 (分支功能重构版)
// ========================================================================

/**
 * 创建一个新的对话对象。
 * @returns {object} 新创建的对话对象。
 */
export function createNewConversation() {
  const id = Date.now().toString();
  const currentConv = state.getCurrentConversation();
  const model = currentConv ? currentConv.model : (document.getElementById('model')?.value || 'default-model');

  const newConv = {
    id,
    title: '新对话',
    model: model,
    messages: [], // 初始为空
    activeMessageId: null, // 初始没有活动消息
    archived: false,
    isNew: true,
    isPinned: false,
  };
  state.conversations.unshift(newConv);
  saveConversations();
  return newConv;
}

/**
 * 查找指定消息的所有直接子回复。
 * @param {object} conv - 对话对象。
 * @param {string} parentId - 父消息的ID。
 * @returns {Array} - 子消息对象的数组。
 */
export function findChildrenOf(conv, parentId) {
    return conv.messages.filter(m => m.parentId === parentId);
}




/**
 * 根据 activeMessageId，回溯查找并返回当前分支的线性消息历史。
 * (最终修正版，兼容旧数据)
 * @param {object} conv - 对话对象。
 * @returns {Array} - 一个线性的消息数组，按时间顺序排列。
 */
export function getCurrentBranchMessages(conv) {
    // 1. 健壮性检查：如果对话本身或消息列表无效，直接返回空
    if (!conv || !conv.messages || conv.messages.length === 0) {
        return [];
    }

    // 2. ★ 核心修复：处理新旧数据兼容性 ★
    if (conv.activeMessageId) {
        // 2a. 新逻辑：如果存在活动分支指针，则按分支历史渲染
        const messageMap = new Map(conv.messages.map(m => [m.id, m]));
        const branch = [];
        let currentId = conv.activeMessageId;

        while (currentId) {
            const message = messageMap.get(currentId);
            if (message) {
                branch.unshift(message); // 在数组开头插入，以保持正确顺序
                currentId = message.parentId;
            } else {
                // 如果在回溯中找不到父消息，说明分支断裂，停止回溯
                console.warn(`Branch broken: Cannot find message with parentId: ${currentId}`);
                break;
            }
        }
        return branch;

    } else {
        // 2b. 兼容旧数据：如果不存在 activeMessageId，说明是旧的、线性的对话
        //     直接返回所有消息，以确保它们能够显示出来。
        //     这是一个向后兼容的关键步骤。
        
        // (可选但强烈推荐的“自动升级”逻辑)
        // 为了让旧对话在后续操作中能无缝接入分支功能，
        // 我们可以为它自动设置 activeMessageId。
        const lastMessage = conv.messages[conv.messages.length - 1];
        if (lastMessage) {
            conv.activeMessageId = lastMessage.id;
        }
        
        return conv.messages;
    }
}

/**
 * 向当前对话添加一条新消息，并更新活动分支。
 * @param {'user' | 'assistant'} role - 消息角色。
 * @param {any} content - 消息内容。
 * @param {object} metadata - 其他元数据，如 model, usage 等。
 * @returns {object} 新创建的消息对象。
 */
export function addMessageToConversation(role, content, metadata = {}) {
    const conv = state.getCurrentConversation();
    if (!conv) return null;

    const newMessage = {
        id: utils.generateSimpleId(),
        // 新消息的父ID，就是当前活动分支的最后一条消息ID
        parentId: conv.activeMessageId, 
        role,
        content,
        ...metadata,
    };

    // 将新消息添加到对话的 "大数组" 中
    conv.messages.push(newMessage);
    
    // ★ 关键：将活动分支的指针移动到这条新消息上
    conv.activeMessageId = newMessage.id;
    
    saveConversations();
    return newMessage;
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
    // 如果所有对话都归档了，或者没有非归档对话，则返回 'new'
    return firstNonArchived ? firstNonArchived.id : 'new';
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
  conv.messages = systemPrompt ? [systemPrompt] : []; // 保留系统指令
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

/**
 * 应用预设模板到当前对话。
 * @param {object} preset - 预设模板对象。
 * @returns {{needsUiUpdate: boolean}} - 指示是否需要UI刷新。
 */
export function applyPresetPrompt(preset) {
  if (!preset) return;

  const conv = state.getCurrentConversation();
  if (!conv) {
    utils.showToast("没有活动的对话，无法应用模板。", 'warning');
    return { needsUiUpdate: false };
  }

  if (preset.type === 'system_prompt') {
    let systemMessage = conv.messages.find(m => m.role === 'system');
    if (systemMessage) {
      systemMessage.content = preset.prompt;
    } else {
      conv.messages.unshift({ role: 'system', content: preset.prompt });
    }
    saveConversations();
    utils.showToast(`系统角色已设置为: "${preset.name}"`, 'success');
    return { needsUiUpdate: true }; 
  } else {
    // 对于 'user_input' 类型，UI层会直接操作输入框，这里只返回不需要UI更新的信号
    return { needsUiUpdate: false };
  }
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
 * 切换指定对话的归档状态。
 * @param {string} id - 对话 ID。
 * @returns {{status: 'archived'|'unarchived', nextIdToLoad: string|null}}
 */
export function toggleArchive(id) {
  const conv = getConversationById(id);
  if (!conv) return { status: 'error', nextIdToLoad: null };
  
  conv.archived = !conv.archived;
  conv.isNew = false; // 归档或取消归档后，不再是“新”对话
  reorderConversations(); // 归档/取消归档后，总是重新排序
  saveConversations();

  if (conv.archived && state.currentConversationId === id) {
    // 如果当前对话被归档了，需要切换到下一个非归档对话或新对话
    return { status: 'archived', nextIdToLoad: getInitialConversationId() };
  }
  // 如果是取消归档，或者归档的不是当前对话，则不需要切换对话
  return { status: conv.archived ? 'archived' : 'unarchived', nextIdToLoad: null };
}

/**
 * 切换指定对话的置顶状态。
 * @param {string} id - 对话 ID。
 */
export function togglePin(id) {
    const conv = getConversationById(id);
    if (conv) {
        conv.isPinned = !conv.isPinned;
        reorderConversations(); // 置顶/取消置顶后，总是重新排序
        saveConversations();
    }
}



/**
 * 查找以指定消息ID为起点的分支的最终叶子节点ID。
 * (健壮版：能处理一个节点有多个子分支的情况，总是选择最新的分支)
 * @param {object} conv - 对话对象。
 * @param {string} startMessageId - 分支上任意一个消息的ID。
 * @returns {string} - 该分支最新的叶子节点的ID。
 */
function findLeafNodeId(conv, startMessageId) {
    let currentId = startMessageId;
    
    while (true) {
        // 1. 找到当前节点的所有子节点
        const children = conv.messages.filter(m => m.parentId === currentId);

        // 2. 如果没有子节点，说明当前节点就是叶子，探索结束
        if (children.length === 0) {
            return currentId;
        }

        // 3. 如果有子节点，选择最新的那一个继续探索
        //    我们假设 ID 是基于时间生成的，所以 ID 最大的就是最新的。
        children.sort((a, b) => b.id.localeCompare(a.id)); // 按ID字符串降序排序
        currentId = children[0].id; // 移动到最新的子节点
    }
}


/**
 * 将当前对话的活动分支切换到包含指定消息ID的分支，并自动定位到该分支的最新末梢。
 * @param {string} messageId - 要切换到的分支上的任意一个消息ID。
 */
export function setActiveBranch(messageId) {
    const conv = state.getCurrentConversation();
    if (conv) {
        // ★ 核心修复：调用新函数找到真正的叶子节点
        const leafId = findLeafNodeId(conv, messageId);
        conv.activeMessageId = leafId;
        saveConversations();
    }
}
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

    const systemMessageIndex = conv.messages.findIndex(m => m.role === 'system');

    if (promptText && promptText.trim()) {
        const newContent = promptText.trim();
        if (systemMessageIndex !== -1) {
            conv.messages[systemMessageIndex].content = newContent;
            utils.showToast('系统指令已更新。', 'success');
        } else {
            conv.messages.unshift({ role: 'system', content: newContent });
            utils.showToast('系统指令已设置。', 'success');
        }
    } else {
        if (systemMessageIndex !== -1) {
            conv.messages.splice(systemMessageIndex, 1);
            utils.showToast('系统指令已移除。', 'info');
        }
    }

    saveConversations();
    return conv;
}

/**
 * ★★★ 终极核心修复：这个函数现在绝对正确 ★★★
 * 使用一个简单的递归函数来收集一个节点及其所有后代。
 */
function getBranchIds(allMessages, startNodeId) {
    const branchIds = new Set();
    function findDescendants(nodeId) {
        if (!nodeId || branchIds.has(nodeId)) return;
        branchIds.add(nodeId);
        const children = allMessages.filter(msg => msg.parentId === nodeId);
        for (const child of children) {
            findDescendants(child.id);
        }
    }
    findDescendants(startNodeId);
    return branchIds;
}

/**
 * ★★★ 终极重构：删除消息或分支，并返回下一个应该激活的消息ID ★★★
 * @param {string} conversationId - 对话ID。
 * @param {string} messageId - 要删除的消息ID。
 * @param {'single' | 'branch'} mode - 删除模式。
 * @returns {{success: boolean, nextActiveId: string|null}} 返回操作结果和下一个活动ID
 */
export function deleteMessageAndHandleChildren(conversationId, messageId, mode) {
    const conv = getConversationById(conversationId);
    if (!conv) return { success: false, nextActiveId: null };

    const messageIndex = conv.messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) return { success: false, nextActiveId: null };

    const messageToDelete = conv.messages[messageIndex];
    const parentId = messageToDelete.parentId;
    let confirmText = '';

    if (mode === 'single') {
        let contentPreview = String(messageToDelete.content?.text || messageToDelete.content || "").substring(0, 40);
        confirmText = `确定只删除这条消息吗？\n\n"${contentPreview}..."\n\n(它的直接回复将会被保留并连接到上一条消息)`;
    } else {
        confirmText = `确定要删除此消息及其之后的所有分支回复吗？此操作不可恢复。`;
    }

    if (!confirm(confirmText)) {
        return { success: false, nextActiveId: null };
    }
    
    // --- 决定删除后的下一个活动ID ---
    let nextActiveId = null;
    const siblings = findChildrenOf(conv, parentId).filter(m => m.id !== messageId);
    if (siblings.length > 0) {
        // 如果有兄弟节点，则下一个活动ID是第一个兄弟节点的ID
        nextActiveId = siblings[0].id;
    } else {
        // 如果没有兄弟节点，则回退到父节点
        nextActiveId = parentId;
    }

    // --- 执行删除操作 ---
    if (mode === 'single') {
        for (const msg of conv.messages) {
            if (msg.parentId === messageId) {
                msg.parentId = parentId;
            }
        }
        conv.messages.splice(messageIndex, 1);
    } else { // mode === 'branch'
        const idsToDelete = getBranchIds(conv.messages, messageId);
        conv.messages = conv.messages.filter(m => !idsToDelete.has(m.id));
    }

    // ★ 直接将对话的活动指针设置为我们计算好的下一个ID
    conv.activeMessageId = findLeafNodeId(conv, nextActiveId) || null;

    saveConversations();
    // 返回成功状态和下一个应该激活的ID
    return { success: true, nextActiveId: conv.activeMessageId };
}

// ========================================================================
// 3. 导入/导出功能
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
            // 避免重复导入，只导入不存在的对话
            if (!getConversationById(importedConv.id)) {
                state.conversations.push(importedConv);
                importedCount++;
            }
        }
    });
    if (importedCount > 0) {
        reorderConversations(); // 导入后重新排序，确保新导入的对话位置正确
        saveConversations();
    }
    return importedCount;
}

// --- END OF FILE js/conversation.js ---