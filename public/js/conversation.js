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
    // 现在 state.conversations 中已经不包含 Base64 数据，可以直接保存
    localStorage.setItem('conversations', JSON.stringify(state.conversations));
  } catch (error) {
    console.error("[saveConversations] CRITICAL ERROR while saving conversations:", error);
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
 * @param {object} conv - 对话对象。
 * @returns {Array} - 一个线性的消息数组，按时间顺序排列。
 */
export function getCurrentBranchMessages(conv) {
    // 1. 健壮性检查：如果对话本身或消息列表无效，直接返回空
    if (!conv || !conv.messages || conv.messages.length === 0) {
        return [];
    }

    const messageMap = new Map(conv.messages.map(m => [m.id, m]));
    let branch = []; // 使用 let 允许后续修改

    // 2. 根据 activeMessageId 回溯分支历史
    // 2a. 新逻辑：如果存在 activeMessageId，则按分支历史渲染
    if (conv.activeMessageId) {
        let currentId = conv.activeMessageId;

        while (currentId) {
            const message = messageMap.get(currentId);
            if (message) {
                branch.unshift(message); // 在数组开头插入，以保持正确顺序
                currentId = message.parentId;
            } else {
                // 如果在回溯中找不到父消息，说明分支断裂，停止回溯
                console.log(`[DEBUG] Branch broken: Cannot find message with parentId: ${currentId}. Stopping branch traversal.`); // 替换为 log
                break;
            }
        }
    } else {
        // 2b. 兼容旧数据：如果不存在 activeMessageId，说明是旧的、线性的对话
        //     或者是一个全新的对话（activeMessageId 初始为 null）
        //     直接返回所有消息，并尝试自动设置 activeMessageId。
        
        // ★ 将所有消息视为一个线性分支，并设置 activeMessageId
        branch = [...conv.messages]; // 复制所有消息
        const lastMessage = branch[branch.length - 1];
        if (lastMessage) {
            conv.activeMessageId = lastMessage.id;
        }
    }

    // ★★★ 核心修复：确保系统消息始终是返回数组的第一条 ★★★
    // 无论上述分支回溯逻辑如何，我们都需要确保系统消息（如果存在）被包含。
    // 系统消息的 parentId 通常为 null，可能不会被自动回溯包含，或者只在它是根消息时。
    const systemMessage = conv.messages.find(m => m.role === 'system');
    if (systemMessage) {
        // 检查当前 branch 数组中是否已经包含了这个系统消息
        const isSystemMessageAlreadyInBranch = branch.some(m => m.id === systemMessage.id);
        
        if (!isSystemMessageAlreadyInBranch) {
            // 如果不在，则将其添加到 branch 数组的开头
            branch.unshift(systemMessage);
        }
        else {
             // 找到当前系统消息的索引
             const currentSystemIndex = branch.findIndex(m => m.id === systemMessage.id);
             if (currentSystemIndex > 0) {
                 // 如果它不是第一个元素，把它移动到第一个位置
                 branch.splice(currentSystemIndex, 1); // 移除
                 branch.unshift(systemMessage); // 插入到开头
             }
        }
    }
    
    return branch;
}

/**
 * 向指定对话添加一条新消息，并更新其活动分支。
 * @param {object} targetConv - 消息将要添加到的对话对象。
 * @param {'user' | 'assistant' | 'model'} role - 消息角色。
 * @param {any} content - 消息内容。
 * @param {object} metadata - 其他元数据，如 model, usage 等。
 * @returns {object} 新创建的消息对象。
 */
export function addMessageToConversation(targetConv, role, content, metadata = {}) { 
    if (!targetConv) {
        console.error("Attempted to add message to a null or undefined conversation object.");
        return null;
    }

    if (!Array.isArray(targetConv.messages)) {
        console.warn(`Conversation ${targetConv.id} messages array was not initialized or corrupted. Initializing to empty array.`);
        targetConv.messages = [];
    }

    const newMessage = {
        id: utils.generateSimpleId(),
        parentId: targetConv.activeMessageId, 
        role,
        content, // content 现在应该已经包含了正确的 files 数组（只有ID，没有Base64）
        ...metadata,
    };

    targetConv.messages.push(newMessage);
    targetConv.activeMessageId = newMessage.id; 
    saveConversations(); // 保存到 localStorage (只含ID)
    
    return newMessage; // 返回新创建的消息对象
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
  
  // ★★★ 核心修复：在删除对话之前，先提取并清理 IndexedDB 中关联的文件 ★★★
  const convToDelete = state.conversations[idx]; // 确保在这里，idx 已经被定义和使用
  const fileIdsToDelete = [];
  
  // 遍历对话中的所有消息，收集文件ID
  if (convToDelete?.messages) { // 增加一个安全检查，确保 messages 数组存在
      convToDelete.messages.forEach(msg => {
          if (msg.content?.files && Array.isArray(msg.content.files)) {
              msg.content.files.forEach(file => {
                  if (file.id) { // 确保文件有 ID
                      fileIdsToDelete.push(file.id);
                  }
              });
          }
      });
  }

  // 异步删除 IndexedDB 中的文件，不等待结果，因为即使失败也不影响对话删除
  if (fileIdsToDelete.length > 0) {
      utils.deleteFilesFromDB(fileIdsToDelete)
          .then(() => console.log(`[Conversation] Successfully deleted ${fileIdsToDelete.length} files from IndexedDB.`))
          .catch(error => console.error("[Conversation] Failed to delete files from IndexedDB:", error));
  }
  // ★★★ 文件清理逻辑结束 ★★★


  state.conversations.splice(idx, 1); // 从 conversations 数组中移除对话
  saveConversations(); // 保存更新后的对话列表到 localStorage
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

export function clearCurrentConversation() {
  const conv = state.getCurrentConversation();
  if (!conv) {
    utils.showToast('没有活动的对话可供清空。', 'warning');
    return null;
  }

  // ★★★ 新增：清理关联文件 ★★★
  const fileIdsToDelete = [];
  if (conv.messages) {
      conv.messages.forEach(msg => {
          if (msg.content?.files && Array.isArray(msg.content.files)) {
              msg.content.files.forEach(file => {
                  if (file.id) {
                      fileIdsToDelete.push(file.id);
                  }
              });
          }
      });
  }
  if (fileIdsToDelete.length > 0) {
      utils.deleteFilesFromDB(fileIdsToDelete)
          .then(() => console.log(`[Conversation] Successfully deleted ${fileIdsToDelete.length} files from IndexedDB for cleared conversation.`))
          .catch(error => console.error("[Conversation] Failed to delete files from IndexedDB for cleared conversation:", error));
  }
  // ★★★ 清理文件逻辑结束 ★★★

  const systemPrompt = conv.messages.find(m => m.role === 'system');
  conv.messages = systemPrompt ? [systemPrompt] : []; // 保留系统指令
  conv.activeMessageId = systemPrompt?.id || null; // 清空后，重置 activeMessageId
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
            // 如果系统指令存在，则更新其内容
            conv.messages[systemMessageIndex].content = newContent;
            utils.showToast('系统指令已更新。', 'success');
        } else {
            // 如果系统指令不存在，则添加一个新的系统指令消息
            // ★★★ 核心修复：为系统消息生成一个 ID，并确保 parentId 为 null ★★★
            const newSystemMessage = { 
                id: utils.generateSimpleId(), // 必须有 ID
                parentId: null,              // 系统消息是对话的根，没有父消息
                role: 'system', 
                content: newContent 
            };
            // 将系统消息添加到消息数组的开头
            conv.messages.unshift(newSystemMessage);
            utils.showToast('系统指令已设置。', 'success');
        }
    } else {
        // 如果 promptText 为空，且系统指令存在，则移除它
        if (systemMessageIndex !== -1) {
            // ★ 可选优化：在删除前，如果 activeMessageId 是这个系统消息，需要重置
            // 但因为系统消息通常不会成为 activeMessageId，这里可以忽略
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
 * 删除单条消息或整个分支，并智能处理后续UI状态。
 * @param {string} conversationId - 对话ID。
 * @param {string} messageId - 要删除的消息ID。
 * @param {'single' | 'branch'} mode - 删除模式。
 * @param {boolean} [silent=false] - 是否静默执行，不弹出确认框。
 * @returns {{success: boolean, nextActiveId: string|null}} 返回操作结果和下一个活动ID
 */
export function deleteMessageAndHandleChildren(conversationId, messageId, mode, silent = false) {
    const conv = getConversationById(conversationId);
    if (!conv) return { success: false, nextActiveId: null };

    const messageIndex = conv.messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) return { success: false, nextActiveId: null };

    const messageToDelete = conv.messages[messageIndex];
    const parentId = messageToDelete.parentId;

    // ★ 核心修复：只有在非静默模式下才弹出确认框
    if (!silent) {
        let confirmText = '';
        if (mode === 'single') {
            let contentPreview = String(messageToDelete.content?.text || messageToDelete.content || "").substring(0, 40);
            confirmText = `确定要删除这条消息吗？\n\n"${contentPreview}..."\n\n(它的直接回复将会被保留并连接到上一条消息)`;
        } else {
            confirmText = `确定要删除此消息及其之后的所有分支回复吗？此操作不可恢复。`;
        }
        if (!confirm(confirmText)) {
            return { success: false, nextActiveId: null };
        }
    }
    
    // --- 决定删除后的下一个活动ID ---
    let nextActiveId = null;
    if (parentId) {
        // 找到父消息的所有直接子节点 (兄弟分支)，并按 ID 排序（假设 ID 是时间戳，所以可以作为顺序）
        const siblings = findChildrenOf(conv, parentId).sort((a, b) => a.id.localeCompare(b.id)); // 确保是升序
        
        // 找到要删除的消息在兄弟分支中的索引
        const deletedMessageSiblingIndex = siblings.findIndex(m => m.id === messageId);

        if (deletedMessageSiblingIndex > 0) {
            // 如果不是第一个分支，选择上一个兄弟分支的 ID
            nextActiveId = siblings[deletedMessageSiblingIndex - 1].id;
        } else if (siblings.length > 1) {
            // 如果是第一个分支被删除，但还有其他兄弟分支，选择下一个兄弟分支的 ID
            // (你也可以选择回到父消息，这里为了兼容“回到上一个”的逻辑，如果没有上一个，就回到第一个存在的兄弟)
            nextActiveId = siblings[deletedMessageSiblingIndex + 1].id;
        } else {
            // 如果没有其他兄弟分支（只剩下它自己，或者它是唯一一个被删除的），回到父消息
            nextActiveId = parentId;
        }
    } else {
        // 如果被删除的消息没有父消息 (即它是根消息，如系统指令或对话的第一条用户消息)
        // 这种情况下，我们通常会回到一个新的对话或第一条非归档对话。
        // 或者，如果还有其他根消息，则选择下一个可用的根消息。
        // 对于你“删除分支回到上一个消息”的需求，如果这是根消息，则没有“上一个消息”
        // 最安全的做法是让它回到新的对话或默认对话。
        // 不过，由于这个函数通常只处理实际聊天消息，parentId 为 null 的情况可能很少触发删除分支模式。
        // 如果要处理，需要更复杂的逻辑来寻找下一个根消息。
        // 暂时保持其通过后续的 conv.messages.length > 0 逻辑来处理。
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
    //    如果 nextActiveId 为 null，则 activeMessageId 也为 null
    if (nextActiveId && conv.messages.some(m => m.id === nextActiveId)) {
         conv.activeMessageId = findLeafNodeId(conv, nextActiveId);
    } else if (conv.messages.length > 0) {
         // 如果计算出的 nextActiveId 不存在（例如，上一个兄弟也被删除了，或者没有上一个），
         // 则尝试回到对话的最后一条消息（通常是当前分支的末端）。
         // 这是一个回退方案。
         const lastMessage = conv.messages[conv.messages.length - 1];
         conv.activeMessageId = lastMessage.id;
    } else {
        // 如果对话被清空了
        conv.activeMessageId = null;
    }

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

// --- END OF FILE js/conversation.js ------ START OF FILE state.js ---

// --- START OF FILE js/state.js ---

// ========================================================================
// 1. 应用核心状态 (Pure Data)
//    这些是应用运行的核心数据，不包含任何DOM元素引用。
// ========================================================================

// --- 对话数据 ---
export let conversations = [];
export let currentConversationId = null;

// --- 请求与响应状态 ---
// ★ 核心：不再是全局 isGeneratingResponse，而是按对话ID追踪
export let generatingConversations = new Set(); // 存储正在生成响应的对话ID
export let conversationAbortControllers = new Map(); // 存储每个对话的 AbortController

// --- 文件上传数据 ---
export let uploadedFilesData = [];

// --- 从JSON文件加载的配置 ---
export let modelConfigData = null;       // 原始模型配置
export let editableModelConfig = null;   // 可编辑的模型配置
export let loadedPresetPrompts = [];     // 预设模板
export let providersConfig = [];   

// --- 用户设置 (会被保存到LocalStorage) ---
export let isStreamingEnabled = true;
export let isManualThinkModeEnabled = false;
export let isAutoThinkModeEnabled = false;
export let currentMaxTokens = null;
export let isWebSearchEnabled = false; // 新增：联网搜索状态


// ========================================================================
// 2. 应用常量 (Configuration Constants)
//    这些是不会改变的配置项，比如 LocalStorage 的键名。
// ========================================================================

export const THINK_MODE_STORAGE_KEY = 'chat-think-mode-enabled';
export const AUTO_THINK_MODE_STORAGE_KEY = 'chat-auto-think-mode-enabled';
export const STREAMING_ENABLED_STORAGE_KEY = 'chat-streaming-enabled';
export const MAX_TOKENS_STORAGE_KEY = 'chat-max-tokens';
export const QWEN_THINK_MODE_STORAGE_KEY = 'qwen-think-mode-enabled';
export const DEFAULT_MAX_TOKENS_PLACEHOLDER = 4096;
export const WEB_SEARCH_ENABLED_STORAGE_KEY = 'chat-web-search-enabled'; // 新增：联网搜索开关的 localStorage Key


// ========================================================================
// 3. 状态操作函数 (State-Modifying Functions & Getters)
//    提供安全、统一的方式来读取和修改状态。
// ========================================================================

/*
  新的对话 (Conversation) 对象结构:
  {
    id: string,
    title: string,
    model: string,
    // ★ messages 现在是一个包含所有分支消息的扁平数组
    messages: [
      {
        id: string,       // 每条消息的唯一ID
        parentId: string | null, // 父消息的ID，根消息为 null
        role: 'user' | 'assistant' | 'system',
        content: any,
        // ... 其他元数据
      }
    ],
    // ★ 新增：追踪当前分支的最后一条消息的ID
    activeMessageId: string | null,
    // ... 其他对话属性，如 archived, isPinned
  }
*/

// ★ 新增：按对话ID设置生成状态
export function setConversationGeneratingStatus(convId, status) {
    if (status) {
        generatingConversations.add(convId);
    } else {
        generatingConversations.delete(convId);
    }
    // 强制刷新按钮状态，因为这个状态变化会影响 UI
    // 注意：这里的 ui 模块可能还没加载，所以不能直接调用 ui.updateSubmitButtonState
    // 应该通过事件或者在 script.js 中集中处理
}

// ★ 新增：按对话ID获取生成状态
export function isConversationGenerating(convId) {
    return generatingConversations.has(convId);
}

// ★ 新增：按对话ID设置 AbortController
export function setConversationAbortController(convId, controller) {
    if (controller) {
        conversationAbortControllers.set(convId, controller);
    } else {
        conversationAbortControllers.delete(convId);
    }
}

// ★ 新增：按对话ID获取 AbortController
export function getConversationAbortController(convId) {
    return conversationAbortControllers.get(convId);
}

/**
 * 获取当前活动（被选中）的对话对象。
 * @returns {object|undefined} 当前对话对象，如果未找到则返回 undefined。
 */
export function getCurrentConversation() {
  if (!currentConversationId) return undefined;
  return conversations.find(c => c.id === currentConversationId);
}

/**
 * 更新当前对话的ID。
 * @param {string | null} id 新的对话ID
 */
export function setCurrentConversationId(id) {
    currentConversationId = id;
}

/**
 * 设置应用是否正在生成回复。
 * @param {boolean} status 
 */
export function setGeneratingResponse(status) {
    isGeneratingResponse = status;
}

/**
 * 更新当前激活的 AbortController。
 * @param {AbortController | null} controller
 */
export function setCurrentAbortController(controller) {
    currentAbortController = controller;
}

/**
 * 更新已上传文件的数组。
 * @param {Array} files 
 */
export function setUploadedFiles(files) {
    uploadedFilesData = files;
}

/**
 * 设置可编辑的模型配置。
 * @param {object} config 
 */
export function setEditableModelConfig(config) {
    editableModelConfig = config;
}

/**
 * 设置从文件加载的原始模型配置。
 * @param {object} config 
 */
export function setModelConfigData(config) {
    modelConfigData = config;
}

/**
 * 设置加载的预设模板。
 * @param {Array} prompts 
 */
export function setLoadedPresetPrompts(prompts) {
    loadedPresetPrompts = prompts;
}

/**
* 更新整个对话列表
* @param {Array} newConversations
*/
export function setConversations(newConversations) {
    conversations = newConversations;
}

/**
 * 设置是否启用流式输出。
 * @param {boolean} value
 */
export function setIsStreamingEnabled(value) {
    isStreamingEnabled = value;
}

/**
 * 设置是否启用手动思考模式。
 * @param {boolean} value
 */
export function setIsManualThinkModeEnabled(value) {
    isManualThinkModeEnabled = value;
}

/**
 * 设置是否启用自动思考模式。
 * @param {boolean} value
 */
export function setIsAutoThinkModeEnabled(value) {
    isAutoThinkModeEnabled = value;
}

/**
 * 设置当前的最大 Tokens 数。
 * @param {number | null} value
 */
export function setCurrentMaxTokens(value) {
    currentMaxTokens = value;
}

// ★ 新增：设置提供商配置
export function setProvidersConfig(config) {
    providersConfig = config;
}

// ★ 新增：获取某个提供商的配置
export function getProviderConfig(providerValue) {
    return providersConfig.find(p => p.value === providerValue.toLowerCase());
}