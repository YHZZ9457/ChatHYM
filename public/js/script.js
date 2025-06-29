// --- START OF FILE script.js (最终修正版 - 保持 ui.ui.xxx 访问方式) ---

// ========================================================================
// 1. 模块导入
// ========================================================================
import * as state from './state.js';
import * as utils from './utils.js';
import * as api from './api.js';
import * as conversation from './conversation.js';
import * as ui from './ui.js'; // ★ 统一使用 'ui' 作为模块别名

// ========================================================================
// 2. 协调性函数 (Controller/Glue Code)
// ========================================================================


// script.js

/**
 * 通用的API请求与处理函数
 * @param {Array} historyForApi - 发送给API的、干净的消息历史。
 * @param {HTMLElement} [targetElement=null] - (可选) 如果是重新生成，这是被替换的旧消息元素。
 *                                             注意：此参数现在仅用于在 `addOrUpdateFinalMessageInState` 中
 *                                             设置 `activeMessageId` 为父消息，而非直接进行DOM替换。
 */
async function processApiRequest(targetConv) { // ★ 核心：接收目标对话对象
    const convId = targetConv.id; // 获取本次请求的对话ID

    // 1. 设置状态：这个对话正在生成响应
    state.setConversationGeneratingStatus(convId, true);
    // 更新当前显示对话的按钮状态 (如果它就是当前活跃对话)
    if (state.currentConversationId === convId) {
        utils.updateSubmitButtonState(true, ui.ui.submitActionBtn);
    }

    let tempMessageWrapper = null; // 本次请求专用的临时 DOM 元素
    let globalLoadingDiv = null;   // 本次请求专用的加载指示器

    // 在 UI 中添加加载指示器 (只对当前活跃的对话显示)
    if (state.currentConversationId === convId && ui.ui.messagesContainer) {
        globalLoadingDiv = document.createElement('div');
        globalLoadingDiv.className = 'loading-indicator-wrapper global-loading-indicator';
        globalLoadingDiv.innerHTML = `<div class="loading-indicator-bubble"><span>正在加载…</span></div>`;
        ui.ui.messagesContainer.appendChild(globalLoadingDiv);
        ui.ui.messagesContainer.scrollTop = ui.ui.messagesContainer.scrollHeight;
    } else if (state.currentConversationId !== convId) {
        console.log(`[Stream] Initiating background request for conv ${convId}.`);
    }

    // 这些累积变量现在是 processApiRequest 实例的局部变量
    let accumulatedReply = '';                             
    let accumulatedReasoningForStream = '';                
    let usageData = null; // usageData 从 api.send 的 onStreamChunk 传来并累积

    const responseRole = targetConv.model.startsWith('gemini::') ? 'model' : 'assistant';

    // handleStreamChunk 仅操作属于它这个请求实例的变量
    const handleStreamChunk = (result) => {
        // ★ 核心：如果用户已经切换到其他对话，则停止更新这个流的 UI 元素 ★
        if (state.currentConversationId !== convId) { 
            console.warn(`[Stream] Ignoring UI update for conversation ${convId}, active conversation is ${state.currentConversationId}.`);
            return; // 忽略 UI 更新
        }

        // 移除本次请求的加载指示器
        if (globalLoadingDiv && globalLoadingDiv.parentNode) {
            globalLoadingDiv.remove();
            globalLoadingDiv = null;
        }

        // 创建本次请求的临时消息包装器
        if (!tempMessageWrapper) {
            tempMessageWrapper = ui.createTemporaryMessageElement(responseRole); 
            // 确保只添加到当前显示的对话容器
            if (ui.ui.messagesContainer) {
                ui.ui.messagesContainer.appendChild(tempMessageWrapper); 
                ui.ui.messagesContainer.scrollTop = ui.ui.messagesContainer.scrollHeight; 
            }
        }
        
        const inlineLoader = tempMessageWrapper.querySelector('.inline-loading-indicator');
        if (inlineLoader) {
            inlineLoader.remove();
        }

        if (result.reply) accumulatedReply += result.reply;
        if (result.reasoning) accumulatedReasoningForStream += result.reasoning; 
        if (result.usage) usageData = { ...usageData, ...result.usage }; // 累积 usage

        let currentThinkingText = ''; 
        let currentReplyText = '';    

        if (accumulatedReasoningForStream.trim().length > 0) {
            currentThinkingText = accumulatedReasoningForStream;
            currentReplyText = accumulatedReply; 
        } else {
            const extraction = utils.extractThinkingAndReply(accumulatedReply, '<think>', '</think>');
            currentThinkingText = extraction.thinkingText;
            currentReplyText = extraction.replyText; 
        }
        
        if (tempMessageWrapper.contentSpan) {
            tempMessageWrapper.contentSpan.dataset.fullRawContent = accumulatedReply; 
            tempMessageWrapper.contentSpan.innerHTML = marked.parse(currentReplyText); 
            ui.processPreBlocksForCopyButtons(tempMessageWrapper.contentSpan); 
            utils.pruneEmptyNodes(tempMessageWrapper.contentSpan); 
        }
        
        if (tempMessageWrapper.reasoningContentEl) {
            tempMessageWrapper.reasoningContentEl.textContent = currentThinkingText; 
            if (tempMessageWrapper.reasoningBlockEl) {
                tempMessageWrapper.reasoningBlockEl.style.display = currentThinkingText.trim().length > 0 ? 'block' : 'none';
            }
        }
        
        if (ui.ui.messagesContainer) { 
            const dist = ui.ui.messagesContainer.scrollHeight - ui.ui.messagesContainer.clientHeight - ui.ui.messagesContainer.scrollTop; 
            if (dist < 200) {
                requestAnimationFrame(() => { 
                    ui.ui.messagesContainer.scrollTop = ui.ui.messagesContainer.scrollHeight; 
                });
            }
        }
    };

    let finalResultFromApi = null; // Store final result from api.send
    try {
        const historyForApi = conversation.getCurrentBranchMessages(targetConv); // 获取目标对话的历史
        const abortController = new AbortController();
        state.setConversationAbortController(convId, abortController); // 存储 AbortController

        finalResultFromApi = await api.send(historyForApi, handleStreamChunk, abortController.signal);
        
        let finalAssistantReply = finalResultFromApi.reply;
        let finalAssistantReasoning = finalResultFromApi.reasoning; 

        if (!finalResultFromApi.aborted && targetConv.title === '新对话') { // 使用 targetConv
            const newTitle = utils.stripMarkdown(finalAssistantReply).substring(0, 20).trim();
            if (newTitle) targetConv.title = newTitle; // 更新 targetConv 的标题
        }

        // 保存最终消息到状态中。addMessageToConversation 接收 targetConv
        conversation.addMessageToConversation(targetConv, responseRole, finalAssistantReply, {
            model: targetConv.model, // 使用 targetConv 的模型
            reasoning_content: finalAssistantReasoning, 
            usage: finalResultFromApi.usage, 
        });

    } catch (error) {
        if (error.name === 'AbortError') {
            let abortedReply = finalResultFromApi?.reply || (accumulatedReply.trim() || "");
            let abortedReasoning = finalResultFromApi?.reasoning || (accumulatedReasoningForStream.trim() || null); 

            conversation.addMessageToConversation(targetConv, responseRole, abortedReply + "\n（用户已中止）", {
                model: targetConv.model,
                reasoning_content: abortedReasoning,
                usage: finalResultFromApi?.usage || usageData, 
            });
        } else {
            console.error(`[API Send] 请求失败:`, error);
            conversation.addMessageToConversation(targetConv, responseRole, `错误: ${error.message || "请求失败"}`, { model: targetConv.model });
        }
    } finally {
        // 无论成功、失败或中止，都清除这个对话的生成状态和 AbortController
        state.setConversationGeneratingStatus(convId, false);
        state.setConversationAbortController(convId, null);

        // 如果这个请求所属的对话仍然是当前激活的对话，才更新 UI
        if (state.currentConversationId === convId) { 
            utils.updateSubmitButtonState(false, ui.ui.submitActionBtn); // 更新按钮为“发送”
            
            if (tempMessageWrapper && tempMessageWrapper.parentNode) {
                tempMessageWrapper.remove();
            }
            if (globalLoadingDiv && globalLoadingDiv.parentNode) {
                globalLoadingDiv.remove();
            }
            // 重新渲染当前对话的 UI，确保显示最终结果
            ui.loadAndRenderConversationUI(targetConv); // 使用 targetConv 刷新 UI
            ui.renderConversationList(); // 刷新侧边栏列表 (可能更新标题)
        } else {
            // 如果用户已经切换了对话，则只做内部状态清理，不更新 UI
            console.log(`[Stream] Request for conversation ${convId} finished, but active conversation is ${state.currentConversationId}. Skipping final UI render.`);
        }
    }
}



// handleSubmitActionClick 函数
async function handleSubmitActionClick() {
    const currentConv = state.getCurrentConversation(); // 获取当前对话对象

    // 1. 前置检查（无内容时阻止发送，如果正在生成则中止）
    const originalPromptText = ui.ui.promptInput.value.trim(); 
    const hasInputContent = originalPromptText.length > 0 || state.uploadedFilesData.length > 0;

    // 如果当前对话正在生成，则点击按钮是“停止”
    if (state.isConversationGenerating(currentConv.id)) { // ★ 核心：检查当前对话是否正在生成
        const abortController = state.getConversationAbortController(currentConv.id);
        if (abortController) {
            abortController.abort(); // 中止当前对话的请求
            utils.showToast("请求已中止。", "info");
        }
        return; 
    }
    
    // 如果没有内容，显示 Toast 并阻止发送
    if (!currentConv || !hasInputContent) {
        utils.showToast("请输入问题或上传文件。", 'warning');
        return; 
    }

    // 2. 准备用户消息
    const filesToProcess = [...state.uploadedFilesData];
    const finalFilesForNewMessage = filesToProcess.map(fileData => {
        if (fileData.previewUrl) URL.revokeObjectURL(fileData.previewUrl);
        return { name: fileData.name, type: fileData.type, base64: fileData.base64 };
    });

    const userMessageContent = { text: originalPromptText, files: finalFilesForNewMessage };
    
    // 3. 添加用户消息并更新UI
    conversation.addMessageToConversation(currentConv, 'user', userMessageContent, { model: currentConv.model });
    ui.ui.promptInput.value = ''; 
    ui.autoResizePromptInput(); 
    state.setUploadedFiles([]); 
    ui.renderFilePreview(); 

    // UI 刷新，显示用户消息
    ui.loadAndRenderConversationUI(currentConv); 

    // 4. 调用通用的API处理函数
    await processApiRequest(currentConv); // ★ 核心：传入 currentConv 对象
}



/**
 * 协调文件选择流程 (最终正确版本)
 */
async function handleFileSelection(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    // --- 检查文件数量 ---
    const MAX_FILES = 5;
    // 在追加前，检查总数是否会超限
    if (state.uploadedFilesData.length + files.length > MAX_FILES) {
        utils.showToast(`一次最多只能上传 ${MAX_FILES} 个文件。`, 'warning');
        return;
    }

    // --- 遍历并处理新选择的文件 ---
    for (const file of files) {
        // 检查单个文件大小
        if (file.size > 10 * 1024 * 1024) { // 10MB
            utils.showToast(`文件 "${file.name}" 过大 (超过 10MB)。`, 'warning');
            continue; // 跳过这个文件，继续处理下一个
        }
        
        // ★ 核心逻辑：只执行一次 push，只存储预览所需的信息 ★
        const objectURL = URL.createObjectURL(file);
        state.uploadedFilesData.push({ 
            name: file.name, 
            type: file.type, 
            fileObject: file,      // 存储原始文件对象，用于未来发送
            previewUrl: objectURL  // 存储临时URL，用于UI预览
        });
    }

    // --- 更新UI并清空input ---
    ui.renderFilePreview(); // ★ 访问 ui.renderFilePreview
    event.target.value = null; // 清空<input>的值，以便可以再次选择同一个文件
}

/**
 * 协调加载特定对话的流程
 */
function loadConversationFlow(conversationId) {
    if (!conversationId) return;
    const convToLoad = conversation.getConversationById(conversationId);
    if (convToLoad) {
        state.setCurrentConversationId(conversationId);
        if (convToLoad.isNew) {
            convToLoad.isNew = false;
            conversation.saveConversations();
        }
        
        ui.loadAndRenderConversationUI(convToLoad); 

        // ★★★ 核心修复：加载新对话时，根据新对话的实际生成状态更新按钮 ★★★
        // 按钮的可用性始终为 true (因为无内容时靠 toast 阻止)
        const isGeneratingForThisConv = state.isConversationGenerating(conversationId);
        utils.updateSubmitButtonState(isGeneratingForThisConv, ui.ui.submitActionBtn); 
        
    } else {
        console.warn(`Attempted to load a non-existent conversation: ${conversationId}`);
    }
}

// ========================================================================
// 3. 应用主逻辑函数
// ========================================================================

// 在函数外部定义一个标志位
let eventListenersBound = false;
/**
 * 绑定所有事件监听器。此函数应在UI初始化后调用。
 */
function bindEventListeners() {
    // 如果已经绑定过了，就直接返回
    if (eventListenersBound) {
        console.warn("bindEventListeners called more than once. Aborting to prevent duplicates.");
        return;
    }

    const bindEvent = (element, event, handler, options) => {
        if (element) element.addEventListener(event, handler, options);
    };

    // --- 侧边栏交互 (最终简化、稳固版) ---
    // 1. 展开/收起按钮的单击事件
    bindEvent(ui.ui.sidebarToggleBtn, 'click', (e) => { // ★ 访问 ui.ui.sidebarToggleBtn
        e.stopPropagation(); // 阻止事件冒泡到侧边栏
        ui.toggleSidebar(); // ★ 访问 ui.toggleSidebar
    });



    // --- 核心交互 (★ 全部修复) ---
    bindEvent(ui.ui.submitActionBtn, 'click', () => handleSubmitActionClick(false)); // ★ 访问 ui.ui.submitActionBtn
    bindEvent(ui.ui.promptInput, 'keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmitActionClick(false); } }); // ★ 访问 ui.ui.promptInput
    bindEvent(ui.ui.promptInput, 'input', () => {
        ui.autoResizePromptInput(); // 自动调整大小
        // 只有当当前对话不在生成响应时，才根据输入内容更新按钮状态
        const currentConv = state.getCurrentConversation();
        if (currentConv && !state.isConversationGenerating(currentConv.id)) {
            utils.updateSubmitButtonState(false, ui.ui.submitActionBtn); // 按钮始终启用
        }
    });    bindEvent(ui.ui.promptInput, 'paste', () => setTimeout(ui.autoResizePromptInput, 0)); // ★ 访问 ui.ui.promptInput, ui.autoResizePromptInput
    bindEvent(ui.ui.uploadFileBtnInline, 'click', () => ui.ui.fileInputInline.click()); // ★ 访问 ui.ui.uploadFileBtnInline, ui.ui.fileInputInline
    bindEvent(ui.ui.fileInputInline, 'change', async (e) => {
        await handleFileSelection(e); 
    });    
     bindEvent(document.getElementById('clear-prompt-btn'), 'click', () => {
        if (ui.ui.promptInput) {
            ui.ui.promptInput.value = '';
            ui.ui.promptInput.focus();
            ui.autoResizePromptInput();
            // 清空后，如果当前对话不在生成响应，更新按钮状态
            const currentConv = state.getCurrentConversation();
            if (currentConv && !state.isConversationGenerating(currentConv.id)) {
                utils.updateSubmitButtonState(false, ui.ui.submitActionBtn); // 按钮始终启用
            }
        }
    });


    document.addEventListener('loadConversationRequest', (e) => {
        if (e.detail && e.detail.conversationId) {
            console.log("接收到 loadConversationRequest 事件，准备加载:", e.detail.conversationId);
            loadConversationFlow(e.detail.conversationId);
        }
    });

    // --- 对话管理 (★ 全部修复) ---
    bindEvent(ui.ui.conversationList, 'click', e => { // ★ 访问 ui.ui.conversationList
        const listItem = e.target.closest('.conversation-item');
        if (listItem) loadConversationFlow(listItem.dataset.id);
    });
    bindEvent(ui.ui.newConvBtn, 'click', () => loadConversationFlow(conversation.createNewConversation().id)); // ★ 访问 ui.ui.newConvBtn
    bindEvent(ui.ui.messagesContainer, 'scroll', ui.updateScrollToBottomButtonVisibility); // ★ 访问 ui.ui.messagesContainer, ui.updateScrollToBottomButtonVisibility
    bindEvent(ui.ui.scrollToBottomBtn, 'click', ui.handleScrollToBottomClick); // ★ 访问 ui.ui.scrollToBottomBtn, ui.handleScrollToBottomClick
    bindEvent(ui.ui.archiveCurrentBtn, 'click', () => { // ★ 访问 ui.ui.archiveCurrentBtn
        if (!state.currentConversationId) return;
        const result = conversation.toggleArchive(state.currentConversationId);
        if (result.nextIdToLoad) loadConversationFlow(result.nextIdToLoad);
        ui.renderConversationList(); // ★ 访问 ui.renderConversationList
    });
    bindEvent(ui.ui.deleteCurrentBtn, 'click', () => { // ★ 访问 ui.ui.deleteCurrentBtn
        const conv = state.getCurrentConversation();
        if (!conv) return;

        if (confirm(`确定要删除当前会话「${conv.title}」吗？`)) {
            const result = conversation.deleteConversation(state.currentConversationId);
            let idToLoad;
            if (result.nextIdToLoad === 'new') {
                const newConv = conversation.createNewConversation();
                idToLoad = newConv.id;
            } else {
                idToLoad = result.nextIdToLoad;
            }

            if (idToLoad) {
                loadConversationFlow(idToLoad);
            } else {
                ui.renderConversationList(); // ★ 访问 ui.renderConversationList
                ui.updateChatTitle("对话"); // ★ 访问 ui.updateChatTitle
                if (ui.ui.messagesContainer) ui.ui.messagesContainer.innerHTML = ''; // ★ 访问 ui.ui.messagesContainer
                if (ui.ui.emptyChatPlaceholder) ui.ui.emptyChatPlaceholder.style.display = 'flex'; // ★ 访问 ui.ui.emptyChatPlaceholder
            }
        }
    });


    bindEvent(ui.ui.clearCurrentBtn, 'click', () => { // ★ 访问 ui.ui.clearCurrentBtn
        const conv = state.getCurrentConversation();
        if (conv && confirm(`确定要清空「${conv.title}」的所有消息吗？`)) {
            const clearedConvId = conversation.clearCurrentConversation();
            if (clearedConvId) loadConversationFlow(clearedConvId);
        }
    });
    const exportDefaultBtn = document.getElementById('export-default-btn');
    const exportOptionsBtn = document.getElementById('export-options-btn');

    // 绑定默认操作（导出 Markdown）
    bindEvent(exportDefaultBtn, 'click', () => {
        if (state.currentConversationId) {
            conversation.exportSingleConversation(state.currentConversationId, 'md');
        } else {
            utils.showToast('没有活动的对话可导出', 'warning');
        }
    });

    // 绑定下拉菜单触发器
    bindEvent(exportOptionsBtn, 'click', (e) => {
        e.stopPropagation(); // 阻止事件冒泡
        ui.showExportOptionsMenu(e.currentTarget.parentElement); // ★ 访问 ui.showExportOptionsMenu
    });

    // --- 模型与参数 (★ 全部修复) ---
    bindEvent(ui.ui.modelSelect, 'change', e => { // ★ 访问 ui.ui.modelSelect
        const conv = state.getCurrentConversation();
        if (conv) { conv.model = e.target.value; conversation.saveConversations(); }
    });
    bindEvent(ui.ui.streamingToggle, 'change', function() { // ★ 访问 ui.ui.streamingToggle
        state.setIsStreamingEnabled(this.checked);
        localStorage.setItem(state.STREAMING_ENABLED_STORAGE_KEY, state.isStreamingEnabled.toString());
    });
    bindEvent(ui.ui.autoThinkModeToggle, 'change', function() { // ★ 访问 ui.ui.autoThinkModeToggle
        state.setIsAutoThinkModeEnabled(this.checked);
        localStorage.setItem(state.AUTO_THINK_MODE_STORAGE_KEY, state.isAutoThinkModeEnabled.toString());
        ui.updateManualThinkModeState(); // ★ 访问 ui.updateManualThinkModeState
    });
    bindEvent(ui.ui.thinkModeToggle, 'change', function() { // ★ 访问 ui.ui.thinkModeToggle
        state.setIsManualThinkModeEnabled(this.checked);
        localStorage.setItem(state.THINK_MODE_STORAGE_KEY, state.isManualThinkModeEnabled.toString());
    });

    

    bindEvent(ui.ui.chatSettingsBtnInline, 'click', e => { e.stopPropagation(); ui.toggleInlineSettingsPanel(); }); // ★ 访问 ui.ui.chatSettingsBtnInline, ui.toggleInlineSettingsPanel

// ★ 核心修复：修改这个按钮的点击事件 ★
bindEvent(ui.ui.showPresetPromptsBtn, 'click', e => { // ★ 访问 ui.ui.showPresetPromptsBtn
    e.stopPropagation(); 
    
    // 在切换面板显示之前，先调用函数来填充和绑定列表
    ui.populatePresetPromptsList(); // ★ 访问 ui.populatePresetPromptsList
    
    // 然后再切换面板的可见性
    ui.togglePresetPromptsPanel(); // ★ 访问 ui.togglePresetPromptsPanel
});

bindEvent(document, 'click', () => {
    ui.closeInlineSettingsPanel(); // ★ 访问 ui.closeInlineSettingsPanel
    ui.closePresetPromptsPanel(); // ★ 访问 ui.closePresetPromptsPanel
});
bindEvent(ui.ui.inlineChatSettingsPanel, 'click', e => e.stopPropagation()); // ★ 访问 ui.ui.inlineChatSettingsPanel
bindEvent(ui.ui.presetPromptsListPanel, 'click', e => e.stopPropagation()); // ★ 访问 ui.ui.presetPromptsListPanel

bindEvent(ui.ui.maxTokensInputInline, 'change', (e) => { // ★ 访问 ui.ui.maxTokensInputInline
        const value = parseInt(e.target.value, 10);
        if (!isNaN(value) && value > 0) {
            // 如果输入了有效正整数，则保存
            state.setCurrentMaxTokens(value);
            localStorage.setItem(state.MAX_TOKENS_STORAGE_KEY, value);
        } else {
            // 如果输入无效或为空，则清除设置
            state.setCurrentMaxTokens(null);
            localStorage.removeItem(state.MAX_TOKENS_STORAGE_KEY);
            e.target.value = ''; // 清空输入框
        }
    });


    // --- 页面导航与设置 (★ 全部修复) ---
    bindEvent(ui.ui.showSettingsBtn, 'click', ui.showSettings); // ★ 访问 ui.ui.showSettingsBtn, ui.showSettings
    bindEvent(ui.ui.backToChatBtn, 'click', ui.showChatArea); // ★ 访问 ui.ui.backToChatBtn, ui.showChatArea
    bindEvent(ui.ui.toggleThemeBtn, 'click', () => utils.applyTheme(document.body.classList.contains('dark-theme') ? 'light' : 'dark')); // ★ 访问 ui.ui.toggleThemeBtn
    bindEvent(ui.ui.uiScaleOptions, 'click', e => { // ★ 访问 ui.ui.uiScaleOptions
        const btn = e.target.closest('button[data-scale]');
        if (btn) utils.applyUiScale(parseFloat(btn.dataset.scale), ui.ui.uiScaleOptions); // ★ 访问 ui.ui.uiScaleOptions
    });

    // --- 导入导出与历史 (★ 全部修复) ---
    bindEvent(ui.ui.exportHistoryBtn, 'click', conversation.exportAllHistory); // ★ 访问 ui.ui.exportHistoryBtn
    bindEvent(document.getElementById('import-records-btn'), 'click', () => ui.ui.importFileInput.click()); // ★ 访问 ui.ui.importFileInput
    bindEvent(ui.ui.clearAllHistoryBtn, 'click', () => { // ★ 访问 ui.ui.clearAllHistoryBtn
        if (confirm("确认清除所有历史吗？此操作无法恢复。")) {
            loadConversationFlow(conversation.clearAllHistory().id);
        }
    });

    // ★★★ 在这里添加 API Key 保存按钮的事件绑定 ★★★
    bindEvent(ui.ui.saveApiKeyBtn, 'click', async () => { // ★ 访问 ui.ui.saveApiKeyBtn
        const provider = ui.ui.apiProviderSelect.value; // ★ 访问 ui.ui.apiProviderSelect
        const apiKey = ui.ui.apiKeyInput.value.trim(); // ★ 访问 ui.ui.apiKeyInput

        if (!provider) {
            utils.showToast('请选择一个 API 提供商。', 'warning');
            return;
        }
        if (!apiKey) {
            utils.showToast('API Key 不能为空。', 'warning');
            return;
        }

        const success = await api.saveApiKey(provider, apiKey);
        if (success) {
            // 保存成功后，立即刷新状态
            const configuredProviders = await api.getKeysStatus();
            ui.updateApiKeyStatusUI(configuredProviders); // ★ 访问 ui.updateApiKeyStatusUI
            // 清空输入框，以显示占位符
            ui.ui.apiKeyInput.value = ''; // ★ 访问 ui.ui.apiKeyInput
        }
    });
    bindEvent(ui.ui.importFileInput, 'change', async e => { // ★ 访问 ui.ui.importFileInput
        const file = e.target.files[0]; if (!file) return;
        try {
            const text = await file.text();
            const importedConvs = JSON.parse(text);
            const count = conversation.importConversations(importedConvs);
            utils.showToast(count > 0 ? `成功导入 ${count} 条新对话。` : '没有导入新的对话。', count > 0 ? 'success' : 'warning');
            if (count > 0) ui.renderConversationList(); // ★ 访问 ui.renderConversationList
        } catch (err) {
            utils.showToast('导入失败：' + err.message, 'error');
        } finally {
            ui.ui.importFileInput.value = ''; // ★ 访问 ui.ui.importFileInput
        }
    });

    // --- 模型/预设管理 (★ 全部修复) ---
    bindEvent(ui.ui.showModelManagementBtn, 'click', ui.showModelManagement); // ★ 访问 ui.ui.showModelManagementBtn, ui.showModelManagement
    bindEvent(ui.ui.backToChatFromModelBtn, 'click', ui.showChatArea); // ★ 访问 ui.ui.backToChatFromModelBtn, ui.showChatArea
    bindEvent(ui.ui.addNewModelBtn, 'click', () => ui.openModelFormForEdit()); // ★ 访问 ui.ui.addNewModelBtn, ui.openModelFormForEdit
    bindEvent(ui.ui.saveModelsToFileBtn, 'click', async () => { // ★ 访问 ui.ui.saveModelsToFileBtn
        const updatedModels = await api.saveModelsToFile();
        if (updatedModels) {
            const action = ui.populateModelDropdown(updatedModels); // ★ 访问 ui.populateModelDropdown
            if (action?.action === 'update_conversation_model') {
                const conv = state.getCurrentConversation();
                if (conv) { conv.model = action.newModel; conversation.saveConversations(); }
            }
        }
    });
    bindEvent(ui.ui.modelForm, 'submit', ui.handleModelFormSubmit); // ★ 访问 ui.ui.modelForm, ui.handleModelFormSubmit
    bindEvent(ui.ui.showPresetManagementBtn, 'click', ui.showPresetManagement); // ★ 访问 ui.ui.showPresetManagementBtn, ui.showPresetManagement
    bindEvent(ui.ui.backToChatFromPresetBtn, 'click', ui.showChatArea); // ★ 访问 ui.ui.backToChatFromPresetBtn, ui.showChatArea
    bindEvent(ui.ui.addNewPresetBtn, 'click', () => ui.openPresetFormForEdit()); // ★ 访问 ui.ui.addNewPresetBtn, ui.openPresetFormForEdit
    bindEvent(ui.ui.savePresetsToFileBtn, 'click', () => api.savePresetsToFile(true).then(ui.populatePresetPromptsList)); // ★ 访问 ui.ui.savePresetsToFileBtn, ui.populatePresetPromptsList
    bindEvent(ui.ui.presetForm, 'submit', ui.handlePresetFormSubmit); // ★ 访问 ui.ui.presetForm, ui.handlePresetFormSubmit
    
    // ★★★ 核心修复：使用 'ui.ui' 访问模态框元素 ★★★
    bindEvent(ui.ui.modelFormModal.querySelector('.close-modal-btn'), 'click', ui.closeModelForm); // ★ 访问 ui.ui.modelFormModal, ui.closeModelForm
    bindEvent(document.getElementById('cancel-model-detail-btn'), 'click', ui.closeModelForm); // ★ 访问 ui.closeModelForm
    bindEvent(ui.ui.presetFormModal.querySelector('.close-modal-btn'), 'click', ui.closePresetForm); // ★ 访问 ui.ui.presetFormModal, ui.closePresetForm
    bindEvent(document.getElementById('cancel-preset-detail-btn'), 'click', ui.closePresetForm); // ★ 访问 ui.closePresetForm
    
    bindEvent(ui.ui.systemPromptBtn, 'click', ui.toggleSystemPromptEditor); // ★ 访问 ui.ui.systemPromptBtn, ui.toggleSystemPromptEditor
    // --- 侧边栏搜索 (★ 全部修复) ---
    bindEvent(ui.ui.logoDisplay, 'click', e => { e.stopPropagation(); ui.showSearchView(); }); // ★ 访问 ui.ui.logoDisplay, ui.showSearchView
    bindEvent(ui.ui.searchInput, 'input', () => ui.renderConversationList(ui.ui.searchInput.value)); // ★ 访问 ui.ui.searchInput, ui.renderConversationList
    bindEvent(ui.ui.searchInput, 'blur', ui.showLogoView); // ★ 访问 ui.ui.searchInput, ui.showLogoView
    bindEvent(ui.ui.searchInput, 'keydown', e => { if (e.key === 'Escape') ui.showLogoView(); }); // ★ 访问 ui.ui.searchInput, ui.showLogoView
    bindEvent(document, 'click', e => {
        if (ui.ui.searchWrapper && !ui.ui.searchWrapper.contains(e.target) && e.target !== ui.ui.logoDisplay) { // ★ 访问 ui.ui.searchWrapper, ui.ui.logoDisplay
            ui.showLogoView(); // ★ 访问 ui.showLogoView
        }
    });

     const settingsArea = ui.ui.settingsArea; // ★ 访问 ui.ui.settingsArea

     // ★★★ 新增：监听分支切换请求事件 ★★★
    document.addEventListener('switchBranchRequest', (e) => {
        if (e.detail && e.detail.messageId) {
            const messageId = e.detail.messageId;
            
            // 1. 调用 conversation 模块的函数，更新活动分支的指针
            conversation.setActiveBranch(messageId);
            
            // 2. 使用当前对话的最新状态，重新渲染整个UI
            const currentConv = state.getCurrentConversation();
            if (currentConv) {
                ui.loadAndRenderConversationUI(currentConv); // ★ 访问 ui.loadAndRenderConversationUI
            }
        }
    });
    if (settingsArea) {
        bindEvent(settingsArea, 'click', (e) => {
            const trigger = e.target.closest('.collapsible-trigger');
            if (!trigger) return;

            // 切换 active 类，CSS 会处理动画
            trigger.classList.toggle('active');
            
            // 下面的内容是可选的，用于实现“手风琴”效果（一次只展开一个）
            // 如果您想允许多个同时展开，可以删除这个 if 块
            if (trigger.classList.contains('active')) {
                const allTriggers = settingsArea.querySelectorAll('.collapsible-trigger');
                allTriggers.forEach(otherTrigger => {
                    if (otherTrigger !== trigger) {
                        otherTrigger.classList.remove('active');
                    }
                });
            }
        });
    }

         // --- 消息操作按钮 (事件委托) ---
    bindEvent(ui.ui.messagesContainer, 'click', async e => { 
        const button = e.target.closest('.message-action-btn');
        if (!button) return;
        
        const messageWrapper = button.closest('.message-wrapper');
        if (!messageWrapper) return;

        const convId = messageWrapper.dataset.conversationId;
        const messageIndex = parseInt(messageWrapper.dataset.messageIndex, 10);
        
        // ★ 统一使用 conv
        const conv = state.getCurrentConversation(); 

        if (!conv || conv.id !== convId || isNaN(messageIndex) || messageIndex < 0 || messageIndex >= conv.messages.length) {
            return;
        }

        const messageId = conv.messages[messageIndex].id;
        const action = button.dataset.action;
        // let wasHandled = false; // 这行现在是多余的，可以删除

        switch (action) {
            case 'edit':
                const textToEdit = conv.messages[messageIndex]?.content?.text || '';
                ui.ui.promptInput.value = textToEdit; // ★ 访问 ui.ui.promptInput
                ui.ui.promptInput.focus(); // ★ 访问 ui.ui.promptInput
                ui.autoResizePromptInput(); // ★ 访问 ui.autoResizePromptInput
                break;

                case 'regenerate':
            const assistantMsgToRegen = conv.messages[messageIndex];
            if (assistantMsgToRegen && assistantMsgToRegen.parentId) {
                // 1. 设置当前对话的 activeMessageId 为被重新生成消息的父ID。
                //    这会将对话分支“回溯”到用户最后一次提问。
                conv.activeMessageId = assistantMsgToRegen.parentId;
                
                // ★★★ 核心修复：在这里立即调用 ui.loadAndRenderConversationUI(conv); ★★★
                // 这会清空整个 messagesContainer，并只渲染到新的 activeMessageId 所在的消息（即用户消息）。
                // 这样，当 processApiRequest 函数被调用时，messagesContainer 就是干净的了。
                ui.loadAndRenderConversationUI(conv); 
                
                // 2. 获取基于新活跃分支的API历史记录。
                const historyForApi = conversation.getCurrentBranchMessages(conv); 

                // 3. 调用通用的API处理函数。
                //    processApiRequest 现在会负责在一个干净的 UI 上显示它的加载和流式输出。
                await processApiRequest(historyForApi); 
            }
            break;
            case 'delete_single':
            case 'delete_branch':
                const mode = action === 'delete_single' ? 'single' : 'branch';
                
                // 1. 调用重构后的删除函数，它会返回结果
                const result = conversation.deleteMessageAndHandleChildren(convId, messageId, mode);
                
                // 2. 如果删除成功，则使用返回的 nextActiveId 来更新UI
                if (result.success) {
                    // a. 确保内部状态的 activeMessageId 是最新的
                    if (result.nextActiveId) {
                        conv.activeMessageId = result.nextActiveId; // 使用 conv
                    }
                    
                    // b. 使用最新的对话状态重新渲染整个UI
                    //    loadAndRenderConversationUI 会自动处理分支显示
                    ui.loadAndRenderConversationUI(conv); // ★ 访问 ui.loadAndRenderConversationUI
                }
                break;
        }
    });

    eventListenersBound = true;
    console.log("Event listeners have been bound successfully.");
}


/**
 * 应用程序的异步初始化流程。
 */
async function initializeApp() {

     const savedMaxTokens = localStorage.getItem(state.MAX_TOKENS_STORAGE_KEY);
    if (savedMaxTokens) {
        const value = parseInt(savedMaxTokens, 10);
        if (!isNaN(value) && value > 0) {
            state.setCurrentMaxTokens(value);
            if (ui.ui.maxTokensInputInline) { // ★ 访问 ui.ui.maxTokensInputInline
                ui.ui.maxTokensInputInline.value = value; // ★ 访问 ui.ui.maxTokensInputInline
            }
        }
    }

    const sidebarCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
    ui.applyInitialSidebarState(sidebarCollapsed); // ★ 访问 ui.applyInitialSidebarState
    
    // 应用保存的设置
    utils.applyTheme(localStorage.getItem('theme') || 'dark');
    // ★ 修复：使用 'ui.ui' 访问DOM元素
    utils.applyUiScale(parseFloat(localStorage.getItem('ui-scale')) || 1.0, ui.ui.uiScaleOptions); // ★ 访问 ui.ui.uiScaleOptions
    state.setIsStreamingEnabled(localStorage.getItem(state.STREAMING_ENABLED_STORAGE_KEY) !== 'false');
    if (ui.ui.streamingToggle) ui.ui.streamingToggle.checked = state.isStreamingEnabled; // ★ 访问 ui.ui.streamingToggle
    state.setIsAutoThinkModeEnabled(localStorage.getItem(state.AUTO_THINK_MODE_STORAGE_KEY) === 'true');
    if (ui.ui.autoThinkModeToggle) ui.ui.autoThinkModeToggle.checked = state.isAutoThinkModeEnabled; // ★ 访问 ui.ui.autoThinkModeToggle
    state.setIsManualThinkModeEnabled(localStorage.getItem(state.THINK_MODE_STORAGE_KEY) === 'true');
    if (ui.ui.thinkModeToggle) ui.ui.thinkModeToggle.checked = state.isManualThinkModeEnabled; // ★ 访问 ui.ui.thinkModeToggle
    ui.updateManualThinkModeState(); // ★ 访问 ui.updateManualThinkModeState
    


    // 加载外部配置
    await Promise.all([
        api.loadModelsFromConfig(),
        api.loadPresetsFromConfig()
    ]);

     try {
        const configuredProviders = await api.getKeysStatus();
        ui.updateApiKeyStatusUI(configuredProviders); // ★ 访问 ui.updateApiKeyStatusUI
    } catch (error) {
        console.error("获取 API Key 状态失败:", error);
    }
    
    // 填充UI
    ui.populateModelDropdown(state.modelConfigData.models); // ★ 访问 ui.populateModelDropdown
    ui.populatePresetPromptsList(); // ★ 访问 ui.populatePresetPromptsList

    // 加载和渲染对话
    conversation.loadConversations();
    const initialConvId = conversation.getInitialConversationId();
    const idToLoad = initialConvId === 'new' ? conversation.createNewConversation().id : initialConvId;
    loadConversationFlow(idToLoad);

    // 最后的UI更新
    ui.renderConversationList(); // ★ 访问 ui.renderConversationList
    ui.enableInlineTitleEdit(); // ★ 访问 ui.enableInlineTitleEdit
    ui.enableConversationDrag(ui.ui.conversationList.querySelector('#draggable-conversation-list')); // ★ 访问 ui.ui.conversationList, ui.enableConversationDrag
    ui.autoResizePromptInput(); // ★ 访问 ui.autoResizePromptInput
}

// ========================================================================
// 4. 应用启动入口
// ========================================================================

document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM fully loaded and parsed. Starting app initialization...");
    
    // 步骤 1: 初始化UI元素获取
    if (!ui.initializeUI()) { // ★ 访问 ui.initializeUI
        alert("Application failed to start: Critical UI elements could not be found. Please check the console and try refreshing the page.");
        return;
    }

    // 步骤 2: 执行所有异步加载和渲染
    initializeApp().then(() => {
        // 步骤 3: 在所有内容都渲染完毕后，再绑定事件监听器
        bindEventListeners();
        console.log("Application fully initialized and interactive.");
    }).catch(error => {
        console.error("Fatal error during application initialization:", error);
        utils.showToast("应用启动失败，请查看控制台！", "error");
    });
});