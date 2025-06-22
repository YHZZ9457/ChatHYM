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

/**
 * 核心协调函数：处理发送/停止按钮的点击事件。
 */
async function handleSubmitActionClick(isRegenerating = false) {
    if (state.isGeneratingResponse) {
        if (state.currentAbortController) state.currentAbortController.abort();
        return;
    }
    // ★ 修复：使用正确的双重路径 'ui.ui' 访问DOM元素
    if (!isRegenerating && !ui.ui.promptInput.value.trim() && state.uploadedFilesData.length === 0) {
        utils.showToast("请输入问题或上传文件。", 'warning');
        return;
    }
    const conv = state.getCurrentConversation();
    if (!conv || !conv.model || conv.model.startsWith("error::")) {
        utils.showToast("错误：请选择一个有效的对话和模型。", 'error');
        return;
    }

    state.setGeneratingResponse(true);
    // ★ 修复：使用 'ui.ui' 访问DOM元素
    utils.updateSubmitButtonState(true, ui.ui.submitActionBtn);

    if (!isRegenerating) {
        // ★ 修复：使用 'ui.ui' 访问DOM元素
        const userMessageContent = { text: ui.ui.promptInput.value.trim(), files: [...state.uploadedFilesData] };
        conv.messages.push({ role: 'user', content: userMessageContent, model: conv.model });
        ui.appendMessage('user', userMessageContent, null, null, conv.id, conv.messages.length - 1);
        ui.ui.promptInput.value = ''; // ★ 修复
        ui.autoResizePromptInput();
        state.setUploadedFiles([]);
        ui.renderFilePreview();
    }

    const loadingDiv = ui.appendLoading();
    let tempMsgElement = null;
    const handleStreamChunk = (result) => {
        if (loadingDiv?.parentNode) loadingDiv.remove();
        if (!tempMsgElement) {
            const role = state.getCurrentConversation().model.startsWith('gemini::') ? 'model' : 'assistant';
            tempMsgElement = ui.appendMessage(role, { text: '' }, null, null, conv.id, -1, null);
        }
        ui.processStreamChunk(tempMsgElement, result.reply, result.reasoning, result.usage);
    };

    try {
        const finalResult = await api.send(handleStreamChunk);
        if (loadingDiv?.parentNode) loadingDiv.remove();
        if (tempMsgElement) tempMsgElement.remove();
        if (finalResult.success) {
            ui.appendMessage(finalResult.role, { text: finalResult.reply }, conv.model, finalResult.reasoning, conv.id, conv.messages.length, finalResult.usage);
            conv.messages.push({
                role: finalResult.role,
                content: finalResult.reply,
                model: conv.model,
                reasoning_content: finalResult.reasoning,
                usage: finalResult.usage
            });
            if (!finalResult.aborted && conv.title === '新对话') {
                const newTitle = utils.stripMarkdown(finalResult.reply).substring(0, 20).trim();
                if (newTitle) {
                    conv.title = newTitle;
                    ui.updateChatTitle(newTitle);
                }
            }
        } else {
            ui.appendMessage('assistant', { text: finalResult.reply }, conv.model, null, conv.id, -1, null);
        }
    } catch (error) {
        console.error("handleSubmitActionClick caught an unexpected error:", error);
        if (loadingDiv?.parentNode) loadingDiv.remove();
        if (tempMsgElement) tempMsgElement.remove();
        ui.appendMessage('assistant', { text: `发生致命错误: ${error.message}` }, conv.model, null, conv.id, -1, null);
    } finally {
        state.setGeneratingResponse(false);
        // ★ 修复：使用 'ui.ui' 访问DOM元素
        utils.updateSubmitButtonState(false, ui.ui.submitActionBtn);
        conversation.saveConversations();
        ui.renderConversationList();
    }
}

/**
 * 协调文件选择流程
 */
async function handleFileSelection(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    const MAX_FILES = 5;
    if (state.uploadedFilesData.length + files.length > MAX_FILES) {
        utils.showToast(`一次最多只能上传 ${MAX_FILES} 个文件。`, 'warning');
        return;
    }
    for (const file of files) {
        if (file.size > 10 * 1024 * 1024) {
            utils.showToast(`文件 "${file.name}" 过大 (超过 10MB)。`, 'warning');
            continue;
        }
        try {
            const base64String = await utils.readFileAsBase64(file);
            state.uploadedFilesData.push({ name: file.name, type: file.type, base64: base64String, fileObject: file });
        } catch (error) {
            utils.showToast(`无法读取文件 "${file.name}"。`, 'error');
        }
    }
    ui.renderFilePreview(); // ★ 调用函数使用 'ui.'
    event.target.value = null;
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
        ui.loadAndRenderConversationUI(convToLoad); // ★ 调用函数使用 'ui.'
    } else {
        console.warn(`Attempted to load a non-existent conversation: ${conversationId}`);
    }
}

// ========================================================================
// 3. 应用主逻辑函数
// ========================================================================

/**
 * 绑定所有事件监听器。此函数应在UI初始化后调用。
 */
function bindEventListeners() {
    const bindEvent = (element, event, handler) => {
        if (element) element.addEventListener(event, handler);
    };

    // --- 核心交互 (★ 全部修复) ---
    bindEvent(ui.ui.submitActionBtn, 'click', () => handleSubmitActionClick(false));
    bindEvent(ui.ui.promptInput, 'keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmitActionClick(false); } });
    bindEvent(ui.ui.promptInput, 'input', ui.autoResizePromptInput);
    bindEvent(ui.ui.promptInput, 'paste', () => setTimeout(ui.autoResizePromptInput, 0));
    bindEvent(ui.ui.uploadFileBtnInline, 'click', () => ui.ui.fileInputInline.click());
    bindEvent(ui.ui.fileInputInline, 'change', handleFileSelection);
    bindEvent(document.getElementById('clear-prompt-btn'), 'click', () => {
        if (ui.ui.promptInput) {
            ui.ui.promptInput.value = '';
            ui.ui.promptInput.focus();
            ui.autoResizePromptInput();
        }
    });

    // --- 对话管理 (★ 全部修复) ---
    bindEvent(ui.ui.conversationList, 'click', e => {
        const listItem = e.target.closest('.conversation-item');
        if (listItem) loadConversationFlow(listItem.dataset.id);
    });
    bindEvent(ui.ui.newConvBtn, 'click', () => loadConversationFlow(conversation.createNewConversation().id));
    bindEvent(ui.ui.messagesContainer, 'scroll', ui.updateScrollToBottomButtonVisibility);
    bindEvent(ui.ui.scrollToBottomBtn, 'click', ui.handleScrollToBottomClick);
    bindEvent(ui.ui.archiveCurrentBtn, 'click', () => {
        if (!state.currentConversationId) return;
        const result = conversation.toggleArchive(state.currentConversationId);
        if (result.nextIdToLoad) loadConversationFlow(result.nextIdToLoad);
        ui.renderConversationList();
    });
    bindEvent(ui.ui.deleteCurrentBtn, 'click', () => {
        const conv = state.getCurrentConversation();
        if (conv && confirm(`确定要删除当前会话「${conv.title}」吗？`)) {
            const result = conversation.deleteConversation(state.currentConversationId);
            const idToLoad = result.nextIdToLoad === 'new' ? conversation.createNewConversation().id : result.nextIdToLoad;
            if (idToLoad) loadConversationFlow(idToLoad);
            else ui.renderConversationList();
        }
    });
    bindEvent(ui.ui.clearCurrentBtn, 'click', () => {
        const conv = state.getCurrentConversation();
        if (conv && confirm(`确定要清空「${conv.title}」的所有消息吗？`)) {
            const clearedConvId = conversation.clearCurrentConversation();
            if (clearedConvId) loadConversationFlow(clearedConvId);
        }
    });
    bindEvent(ui.ui.exportCurrentBtn, 'click', () => {
        if (state.currentConversationId) conversation.exportSingleConversation(state.currentConversationId, 'md');
        else utils.showToast('没有活动的对话可导出', 'warning');
    });

    // --- 模型与参数 (★ 全部修复) ---
    bindEvent(ui.ui.modelSelect, 'change', e => {
        const conv = state.getCurrentConversation();
        if (conv) { conv.model = e.target.value; conversation.saveConversations(); }
    });
    bindEvent(ui.ui.streamingToggle, 'change', function() {
        state.setIsStreamingEnabled(this.checked);
        localStorage.setItem(state.STREAMING_ENABLED_STORAGE_KEY, state.isStreamingEnabled.toString());
    });
    bindEvent(ui.ui.autoThinkModeToggle, 'change', function() {
        state.setIsAutoThinkModeEnabled(this.checked);
        localStorage.setItem(state.AUTO_THINK_MODE_STORAGE_KEY, state.isAutoThinkModeEnabled.toString());
        ui.updateManualThinkModeState();
    });
    bindEvent(ui.ui.thinkModeToggle, 'change', function() {
        state.setIsManualThinkModeEnabled(this.checked);
        localStorage.setItem(state.THINK_MODE_STORAGE_KEY, state.isManualThinkModeEnabled.toString());
    });

    // --- 聊天设置与面板 (★ 全部修复) ---
    bindEvent(ui.ui.chatSettingsBtnInline, 'click', e => { e.stopPropagation(); ui.toggleInlineSettingsPanel(); });
    bindEvent(ui.ui.showPresetPromptsBtn, 'click', e => { e.stopPropagation(); ui.togglePresetPromptsPanel(); });
    bindEvent(document, 'click', () => {
        ui.closeInlineSettingsPanel();
        ui.closePresetPromptsPanel();
    });
    bindEvent(ui.ui.inlineChatSettingsPanel, 'click', e => e.stopPropagation());
    bindEvent(ui.ui.presetPromptsListPanel, 'click', e => e.stopPropagation());

    // --- 页面导航与设置 (★ 全部修复) ---
    bindEvent(ui.ui.showSettingsBtn, 'click', ui.showSettings);
    bindEvent(ui.ui.backToChatBtn, 'click', ui.showChatArea);
    bindEvent(ui.ui.toggleThemeBtn, 'click', () => utils.applyTheme(document.body.classList.contains('dark-theme') ? 'light' : 'dark'));
    bindEvent(ui.ui.uiScaleOptions, 'click', e => {
        const btn = e.target.closest('button[data-scale]');
        if (btn) utils.applyUiScale(parseFloat(btn.dataset.scale), ui.ui.uiScaleOptions);
    });

    // --- 导入导出与历史 (★ 全部修复) ---
    bindEvent(ui.ui.exportHistoryBtn, 'click', conversation.exportAllHistory);
    bindEvent(document.getElementById('import-records-btn'), 'click', () => ui.ui.importFileInput.click());
    bindEvent(ui.ui.clearAllHistoryBtn, 'click', () => {
        if (confirm("确认清除所有历史吗？此操作无法恢复。")) {
            loadConversationFlow(conversation.clearAllHistory().id);
        }
    });
    bindEvent(ui.ui.importFileInput, 'change', async e => {
        const file = e.target.files[0]; if (!file) return;
        try {
            const text = await file.text();
            const importedConvs = JSON.parse(text);
            const count = conversation.importConversations(importedConvs);
            utils.showToast(count > 0 ? `成功导入 ${count} 条新对话。` : '没有导入新的对话。', count > 0 ? 'success' : 'warning');
            if (count > 0) ui.renderConversationList();
        } catch (err) {
            utils.showToast('导入失败：' + err.message, 'error');
        } finally {
            ui.ui.importFileInput.value = '';
        }
    });

    // --- 模型/预设管理 (★ 全部修复) ---
    bindEvent(ui.ui.showModelManagementBtn, 'click', ui.showModelManagement);
    bindEvent(ui.ui.backToChatFromModelBtn, 'click', ui.showChatArea);
    bindEvent(ui.ui.addNewModelBtn, 'click', () => ui.openModelFormForEdit());
    bindEvent(ui.ui.saveModelsToFileBtn, 'click', async () => {
        const updatedModels = await api.saveModelsToFile();
        if (updatedModels) {
            const action = ui.populateModelDropdown(updatedModels);
            if (action?.action === 'update_conversation_model') {
                const conv = state.getCurrentConversation();
                if (conv) { conv.model = action.newModel; conversation.saveConversations(); }
            }
        }
    });
    bindEvent(ui.ui.modelForm, 'submit', ui.handleModelFormSubmit);
    bindEvent(ui.ui.showPresetManagementBtn, 'click', ui.showPresetManagement);
    bindEvent(ui.ui.backToChatFromPresetBtn, 'click', ui.showChatArea);
    bindEvent(ui.ui.addNewPresetBtn, 'click', () => ui.openPresetFormForEdit());
    bindEvent(ui.ui.savePresetsToFileBtn, 'click', () => api.savePresetsToFile(true).then(ui.populatePresetPromptsList));
    bindEvent(ui.ui.presetForm, 'submit', ui.handlePresetFormSubmit);
    
    // ★★★ 核心修复：使用 'ui.ui' 访问模态框元素 ★★★
    bindEvent(ui.ui.modelFormModal.querySelector('.close-modal-btn'), 'click', ui.closeModelForm);
    bindEvent(document.getElementById('cancel-model-detail-btn'), 'click', ui.closeModelForm);
    bindEvent(ui.ui.presetFormModal.querySelector('.close-modal-btn'), 'click', ui.closePresetForm);
    bindEvent(document.getElementById('cancel-preset-detail-btn'), 'click', ui.closePresetForm);

    // --- 侧边栏搜索 (★ 全部修复) ---
    bindEvent(ui.ui.logoDisplay, 'click', e => { e.stopPropagation(); ui.showSearchView(); });
    bindEvent(ui.ui.searchInput, 'input', () => ui.renderConversationList(ui.ui.searchInput.value));
    bindEvent(ui.ui.searchInput, 'blur', ui.showLogoView);
    bindEvent(ui.ui.searchInput, 'keydown', e => { if (e.key === 'Escape') ui.showLogoView(); });
    bindEvent(document, 'click', e => {
        if (ui.ui.searchWrapper && !ui.ui.searchWrapper.contains(e.target) && e.target !== ui.ui.logoDisplay) {
            ui.showLogoView();
        }
    });

    // --- 消息操作按钮 (事件委托) ---
    bindEvent(ui.ui.messagesContainer, 'click', e => {
        const button = e.target.closest('.message-action-btn');
        if (!button) return;
        const messageWrapper = button.closest('.message-wrapper');
        if (!messageWrapper) return;
        const action = button.dataset.action;
        const index = parseInt(messageWrapper.dataset.messageIndex, 10);
        const conv = state.getCurrentConversation();
        if (!conv || isNaN(index)) return;
        switch (action) {
            case 'edit':
                const textToEdit = conv.messages[index]?.content?.text || '';
                conversation.truncateConversation(index - 1);
                ui.loadAndRenderConversationUI(conv);
                ui.ui.promptInput.value = textToEdit; // ★ 修复
                ui.ui.promptInput.focus(); // ★ 修复
                ui.autoResizePromptInput();
                break;
            case 'regenerate':
                conversation.truncateConversation(index - 1);
                ui.loadAndRenderConversationUI(conv);
                handleSubmitActionClick(true);
                break;
            case 'delete':
                if (confirm('确定要删除这条消息及其之后的所有消息吗？')) {
                    conversation.truncateConversation(index - 1);
                    ui.loadAndRenderConversationUI(conv);
                }
                break;
        }
    });
}

/**
 * 应用程序的异步初始化流程。
 */
async function initializeApp() {
    // 应用保存的设置
    utils.applyTheme(localStorage.getItem('theme') || 'dark');
    // ★ 修复：使用 'ui.ui' 访问DOM元素
    utils.applyUiScale(parseFloat(localStorage.getItem('ui-scale')) || 1.0, ui.ui.uiScaleOptions);
    state.setIsStreamingEnabled(localStorage.getItem(state.STREAMING_ENABLED_STORAGE_KEY) !== 'false');
    if (ui.ui.streamingToggle) ui.ui.streamingToggle.checked = state.isStreamingEnabled; // ★ 修复
    state.setIsAutoThinkModeEnabled(localStorage.getItem(state.AUTO_THINK_MODE_STORAGE_KEY) === 'true');
    if (ui.ui.autoThinkModeToggle) ui.ui.autoThinkModeToggle.checked = state.isAutoThinkModeEnabled; // ★ 修复
    state.setIsManualThinkModeEnabled(localStorage.getItem(state.THINK_MODE_STORAGE_KEY) === 'true');
    if (ui.ui.thinkModeToggle) ui.ui.thinkModeToggle.checked = state.isManualThinkModeEnabled; // ★ 修复
    ui.updateManualThinkModeState();

    // 加载外部配置
    await Promise.all([
        api.loadModelsFromConfig(),
        api.loadPresetsFromConfig()
    ]);
    
    // 填充UI
    ui.populateModelDropdown(state.modelConfigData.models);
    ui.populatePresetPromptsList();

    // 加载和渲染对话
    conversation.loadConversations();
    const initialConvId = conversation.getInitialConversationId();
    const idToLoad = initialConvId === 'new' ? conversation.createNewConversation().id : initialConvId;
    loadConversationFlow(idToLoad);

    // 最后的UI更新
    ui.renderConversationList();
    ui.enableInlineTitleEdit();
    ui.autoResizePromptInput();
}

// ========================================================================
// 4. 应用启动入口
// ========================================================================
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM fully loaded and parsed. Starting app initialization...");
    
    // 步骤 1: 初始化UI元素获取
    if (!ui.initializeUI()) { // ★ 调用函数使用 'ui.'
        // 如果关键元素找不到，这是一个致命错误
        alert("Application failed to start: Critical UI elements could not be found. Please check the console and try refreshing the page.");
        return;
    }

    // 步骤 2: 绑定所有事件监听器
    bindEventListeners();

    // 步骤 3: 执行所有异步加载和应用逻辑
    initializeApp().catch(error => {
        console.error("Fatal error during application initialization:", error);
        utils.showToast("应用启动失败，请查看控制台！", "error");
    });
});