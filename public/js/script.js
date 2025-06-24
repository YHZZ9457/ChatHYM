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

    // 在 script.js 的 handleSubmitActionClick 函数中

if (!isRegenerating) {
    // 1. 从 state 中获取待上传文件的信息（现在包含 fileObject 和 previewUrl）
    const filesToProcess = [...state.uploadedFilesData];
    const originalPromptText = ui.ui.promptInput.value.trim();

    // 2. 立即清空UI和临时的state，让界面感觉更流畅
    ui.ui.promptInput.value = '';
    ui.autoResizePromptInput();
    state.setUploadedFiles([]); // 清空全局的待上传文件列表
    ui.renderFilePreview();     // 清空文件预览区

    // 3. 异步处理文件：将 File 对象转换为 Base64
    //    这是发送给模型和存入历史记录的最终数据结构
    const processedFilesForMessage = [];
    for (const fileData of filesToProcess) {
        // 如果文件对象存在，就进行转换
        if (fileData.fileObject) {
            const base64String = await utils.readFileAsBase64(fileData.fileObject);
            processedFilesForMessage.push({
                name: fileData.name,
                type: fileData.type,
                base64: base64String
                // 注意：这里不再包含 fileObject 和 previewUrl
            });
        }
        // 4. 释放临时的内存URL，防止内存泄漏
        if (fileData.previewUrl) {
            URL.revokeObjectURL(fileData.previewUrl);
        }
    }

    // 5. 构建最终要存入历史和显示的消息内容
    const userMessageContent = { text: originalPromptText, files: processedFilesForMessage };
    
    // 6. 将处理好的消息推入对话历史
    conv.messages.push({ role: 'user', content: userMessageContent, model: conv.model });
    
    // 7. 在UI上渲染这条用户消息
    //    ui.appendMessage 需要能正确处理这种新的 userMessageContent 结构
    ui.appendMessage('user', userMessageContent, null, null, conv.id, conv.messages.length - 1);
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

// 在 script.js 中

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
    ui.renderFilePreview();
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
        ui.loadAndRenderConversationUI(convToLoad); // ★ 调用函数使用 'ui.'
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
    bindEvent(ui.ui.sidebarToggleBtn, 'click', (e) => {
        e.stopPropagation(); // 阻止事件冒泡到侧边栏
        ui.toggleSidebar();
    });



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
        ui.showExportOptionsMenu(e.currentTarget.parentElement); // 将整个容器作为定位参考
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

    

    bindEvent(ui.ui.chatSettingsBtnInline, 'click', e => { e.stopPropagation(); ui.toggleInlineSettingsPanel(); });

// ★ 核心修复：修改这个按钮的点击事件 ★
bindEvent(ui.ui.showPresetPromptsBtn, 'click', e => { 
    e.stopPropagation(); 
    
    // 在切换面板显示之前，先调用函数来填充和绑定列表
    ui.populatePresetPromptsList(); 
    
    // 然后再切换面板的可见性
    ui.togglePresetPromptsPanel(); 
});

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

    // ★★★ 在这里添加 API Key 保存按钮的事件绑定 ★★★
    bindEvent(ui.ui.saveApiKeyBtn, 'click', async () => {
        const provider = ui.ui.apiProviderSelect.value;
        const apiKey = ui.ui.apiKeyInput.value.trim();

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
            ui.updateApiKeyStatusUI(configuredProviders);
            // 清空输入框，以显示占位符
            ui.ui.apiKeyInput.value = ''; 
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
    
    bindEvent(ui.ui.systemPromptBtn, 'click', ui.toggleSystemPromptEditor);
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

     const settingsArea = ui.ui.settingsArea;
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
                // 调用新的、只删除单条消息的函数
                const wasDeleted = conversation.deleteSingleMessage(conv.id, index);
                
                // 只有在用户确认并成功删除后，才刷新界面
                if (wasDeleted) {
                    ui.loadAndRenderConversationUI(conv);
                }
                break;
        }
        document.addEventListener('presetPromptApplied', (event) => {
        // 从事件的 detail 中获取被点击的 preset 对象
        const presetToApply = event.detail.preset;
        
        if (presetToApply) {
            console.log("script.js 监听到 presetPromptApplied 事件，正在调用 conversation.applyPresetPrompt...");
            // 调用 conversation 模块的函数来处理逻辑
            conversation.applyPresetPrompt(presetToApply);
        }
    });
    });

    eventListenersBound = true;
    console.log("Event listeners have been bound successfully.");
}


/**
 * 应用程序的异步初始化流程。
 */
async function initializeApp() {

    const sidebarCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
    ui.applyInitialSidebarState(sidebarCollapsed);
    
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

     try {
        const configuredProviders = await api.getKeysStatus();
        ui.updateApiKeyStatusUI(configuredProviders);
    } catch (error) {
        console.error("获取 API Key 状态失败:", error);
    }
    
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
    if (!ui.initializeUI()) {
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
