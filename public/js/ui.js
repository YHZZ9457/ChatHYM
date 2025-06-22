// --- START OF FILE js/ui.js (Corrected and Cleaned Version) ---

// ========================================================================
// 1. 模块导入
// ========================================================================
import * as state from './state.js';
import * as utils from './utils.js';
import * as conversation from './conversation.js';
import * as api from './api.js';

// ========================================================================
// 2. UI 元素引用对象
// ========================================================================
export const ui = {};

// 用于 SortableJS 的实例变量
let groupSortableInstance = null;
const optionSortableInstances = [];

// ========================================================================
// 3. UI 初始化
// ========================================================================

/**
 * 在 DOM 加载后，获取所有需要的 DOM 元素引用并填充 ui 对象。
 * @returns {boolean} 如果关键元素获取成功，则返回 true，否则返回 false。
 */
export function initializeUI() {
    Object.assign(ui, {
        sidebar: document.querySelector('.sidebar'),
        sidebarHeader: document.getElementById('sidebar-header'),
        logoDisplay: document.getElementById('logo-display'),
        searchWrapper: document.getElementById('search-wrapper'),
        searchInput: document.getElementById('search-conversations'),
        newConvBtn: document.getElementById('new-conv-btn'),
        conversationList: document.getElementById('conversation-list'),
        showSettingsBtn: document.getElementById('show-settings-btn'),
        sidebarResizer: document.getElementById('sidebar-resizer'),
        chatArea: document.getElementById('chat-area'),
        settingsArea: document.getElementById('settings-area'),
        modelManagementArea: document.getElementById('model-management-area'),
        presetManagementArea: document.getElementById('preset-management-area'),
        chatTitle: document.getElementById('chat-title'),
        modelSelect: document.getElementById('model'),
        exportCurrentBtn: document.getElementById('export-current-btn'),
        archiveCurrentBtn: document.getElementById('archive-current-btn'),
        clearCurrentBtn: document.getElementById('clear-current-btn'),
        deleteCurrentBtn: document.getElementById('delete-current-btn'),
        emptyChatPlaceholder: document.getElementById('empty-chat-placeholder'),
        messagesContainer: document.getElementById('messages'),
        scrollToBottomBtn: document.getElementById('scroll-to-bottom-btn'),
        filePreviewArea: document.getElementById('file-preview-area'),
        uploadFileBtnInline: document.getElementById('upload-file-btn-inline'),
        fileInputInline: document.getElementById('file-input-inline'),
        chatSettingsBtnInline: document.getElementById('chat-settings-btn-inline'),
        inlineChatSettingsPanel: document.getElementById('inline-chat-settings-panel'),
        temperatureInputInline: document.getElementById('temperature-input-inline'),
        temperatureValueDisplay: document.getElementById('temperature-value-inline'),
        maxTokensInputInline: document.getElementById('max-tokens-input-inline'),
        thinkModeToggle: document.getElementById('think-mode-toggle'),
        showPresetPromptsBtn: document.getElementById('show-preset-prompts-btn'),
        presetPromptsListPanel: document.getElementById('preset-prompts-list-panel'),
        presetPromptsUl: document.getElementById('preset-prompts-ul'),
        promptInput: document.getElementById('prompt'),
        submitActionBtn: document.getElementById('submit-action-btn'),
        backToChatBtn: document.getElementById('back-to-chat-btn'),
        clearAllHistoryBtn: document.getElementById('clear-all-history-btn'),
        exportHistoryBtn: document.getElementById('export-history-btn'),
        importFileInput: document.getElementById('import-file'),
        toggleThemeBtn: document.getElementById('toggle-theme-btn'),
        uiScaleOptions: document.getElementById('ui-scale-options'),
        streamingToggle: document.getElementById('streaming-toggle'),
        autoThinkModeToggle: document.getElementById('auto-think-mode-toggle'),
        showModelManagementBtn: document.getElementById('show-model-management-btn'),
        showPresetManagementBtn: document.getElementById('show-preset-management-btn'),
        modelListEditor: document.getElementById('model-list-editor'),
        backToChatFromModelBtn: document.getElementById('back-to-chat-from-model-management-btn'),
        addNewModelBtn: document.getElementById('add-new-model-btn'),
        saveModelsToFileBtn: document.getElementById('save-models-to-file-btn'),
        backToChatFromPresetBtn: document.getElementById('back-to-chat-from-preset-management-btn'),
        addNewPresetBtn: document.getElementById('add-new-preset-btn'),
        savePresetsToFileBtn: document.getElementById('save-presets-to-file-btn'),
        presetListEditor: document.getElementById('preset-list-editor'),
        modelFormModal: document.getElementById('model-form-modal'),
        modelForm: document.getElementById('model-form'),
        modelFormTitle: document.getElementById('model-form-title'),
        presetFormModal: document.getElementById('preset-form-modal'),
        presetForm: document.getElementById('preset-form'),
        presetFormTitle: document.getElementById('preset-form-title'),
        globalActionsMenu: document.getElementById('global-actions-menu'),
        secretMenu: document.getElementById('secret-menu'),
        chatHeader: document.querySelector('.chat-header'),
    });

    if (!ui.promptInput) {
        console.error("initializeUI FAILED: Could not find element with ID 'prompt'.");
        return false;
    }
    console.log("initializeUI SUCCESS: All UI elements captured.");
    return true;
}

// ========================================================================
// 4. UI 渲染与交互函数
// ========================================================================

// --- 内部辅助函数 ---
function renderModelManagementUI() {
    if (!ui.modelListEditor || !state.editableModelConfig || !Array.isArray(state.editableModelConfig.models)) {
        ui.modelListEditor.innerHTML = '<p>模型配置为空或格式不正确。</p>';
        return;
    }
    ui.modelListEditor.innerHTML = '';
    state.editableModelConfig.models.forEach((group, groupIndex) => {
        const groupDiv = document.createElement('div');
        groupDiv.className = 'model-group-editor';
        if (group.isGroupHidden) groupDiv.classList.add('model-group-content-hidden');
        
        const groupHeader = document.createElement('div');
        groupHeader.className = 'model-group-header';
        const groupLabelInput = document.createElement('input');
        groupLabelInput.type = 'text';
        groupLabelInput.className = 'group-label-editor';
        groupLabelInput.value = group.groupLabel || "";
        groupLabelInput.addEventListener('change', (e) => { state.editableModelConfig.models[groupIndex].groupLabel = e.target.value; });
        groupHeader.appendChild(groupLabelInput);

        const groupActions = document.createElement('div');
        groupActions.className = 'model-management-controls';
        const addOptionBtn = document.createElement('button');
        addOptionBtn.textContent = '+ 添加模型';
        addOptionBtn.onclick = () => openModelFormForEdit(undefined, undefined, group.groupLabel);
        groupActions.appendChild(addOptionBtn);
        const toggleGroupBtn = document.createElement('button');
        toggleGroupBtn.textContent = group.isGroupHidden ? '显示组' : '隐藏组';
        toggleGroupBtn.onclick = () => {
            group.isGroupHidden = !group.isGroupHidden;
            renderModelManagementUI();
            populateModelDropdown(state.editableModelConfig.models);
        };
        groupActions.appendChild(toggleGroupBtn);
        const deleteGroupBtn = document.createElement('button');
        deleteGroupBtn.className = 'danger-text';
        deleteGroupBtn.textContent = '删除组';
        deleteGroupBtn.onclick = () => {
            if (confirm(`确定删除组 "${group.groupLabel}"?`)) {
                state.editableModelConfig.models.splice(groupIndex, 1);
                renderModelManagementUI();
            }
        };
        groupActions.appendChild(deleteGroupBtn);
        groupHeader.appendChild(groupActions);
        groupDiv.appendChild(groupHeader);
        
        const optionsUl = document.createElement('ul');
        optionsUl.className = 'model-group-options';
        (group.options || []).forEach((option, optionIndex) => {
            const optionLi = document.createElement('li');
            optionLi.className = 'model-option-editor';
            optionLi.classList.toggle('model-option-hidden', !!option.isHidden);
            optionLi.innerHTML = `
                <div class="details"><strong>${utils.escapeHtml(option.text)}</strong><span>Value: ${utils.escapeHtml(option.value)}</span></div>
                <div class="actions">
                    <button class="toggle-visibility-btn">${option.isHidden ? '显示' : '隐藏'}</button>
                    <button class="edit-btn">编辑</button>
                    <button class="delete-btn danger-text">删除</button>
                </div>`;
            optionLi.querySelector('.toggle-visibility-btn').onclick = () => {
                option.isHidden = !option.isHidden;
                renderModelManagementUI();
                populateModelDropdown(state.editableModelConfig.models);
            };
            optionLi.querySelector('.edit-btn').onclick = () => openModelFormForEdit(groupIndex, optionIndex);
            optionLi.querySelector('.delete-btn').onclick = () => {
                if (confirm(`确定删除模型 "${option.text}"?`)) {
                    group.options.splice(optionIndex, 1);
                    renderModelManagementUI();
                }
            };
            optionsUl.appendChild(optionLi);
        });
        groupDiv.appendChild(optionsUl);
        ui.modelListEditor.appendChild(groupDiv);
    });
}

function renderPresetManagementUI() {
    if (!ui.presetListEditor) return;
    ui.presetListEditor.innerHTML = '';
    state.loadedPresetPrompts.forEach((preset, index) => {
        const presetItemDiv = document.createElement('div');
        presetItemDiv.className = 'model-option-editor';
        presetItemDiv.classList.toggle('model-option-hidden', !!preset.isHidden);
        presetItemDiv.innerHTML = `
            <div class="details"><strong>${utils.escapeHtml(preset.name)}</strong><span>类型: ${preset.type === 'system_prompt' ? '系统角色' : '输入框填充'} | 描述: ${utils.escapeHtml(preset.description || "无")}</span></div>
            <div class="actions">
                <button class="toggle-visibility-btn">${preset.isHidden ? '显示' : '隐藏'}</button>
                <button class="edit-btn">编辑</button>
                <button class="delete-btn danger-text">删除</button>
            </div>`;
        presetItemDiv.querySelector('.toggle-visibility-btn').onclick = () => {
            preset.isHidden = !preset.isHidden;
            renderPresetManagementUI();
            populatePresetPromptsList();
        };
        presetItemDiv.querySelector('.edit-btn').onclick = () => openPresetFormForEdit(index);
        presetItemDiv.querySelector('.delete-btn').onclick = () => {
            if (confirm(`确定删除模板 "${preset.name}"?`)) {
                state.loadedPresetPrompts.splice(index, 1);
                renderPresetManagementUI();
            }
        };
        ui.presetListEditor.appendChild(presetItemDiv);
    });
}

function processPreBlocksForCopyButtons(containerElement) {
    if (!containerElement || typeof marked === 'undefined') return;
    containerElement.querySelectorAll('pre').forEach((pre) => {
        if (pre.querySelector('.copy-btn')) return;
        pre.style.position = 'relative';
        const btn = document.createElement('button');
        btn.className = 'copy-btn';
        btn.textContent = '复制';
        btn.setAttribute('aria-label', '复制此代码块');
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const preClone = pre.cloneNode(true);
            preClone.querySelector('.copy-btn')?.remove();
            let textToCopy = (preClone.querySelector('code') ? preClone.querySelector('code').innerText : preClone.innerText).trim();
            if (textToCopy === "") {
                btn.textContent = '无内容';
                btn.disabled = true;
                setTimeout(() => { btn.textContent = '复制'; btn.disabled = false; }, 2000);
                return;
            }
            navigator.clipboard.writeText(textToCopy).then(() => {
                btn.textContent = '已复制!';
                setTimeout(() => { btn.textContent = '复制'; }, 2000);
            }).catch(() => utils.showToast('自动复制失败。'));
        });
        pre.appendChild(btn);
    });
}

function enableConversationDrag() {
    if (!ui.conversationList || typeof Sortable === 'undefined') return;
    if (ui.conversationList.sortableInstance) ui.conversationList.sortableInstance.destroy();
    ui.conversationList.sortableInstance = Sortable.create(ui.conversationList, {
        animation: 150,
        ghostClass: 'sortable-ghost',
        chosenClass: 'sortable-chosen',
        filter: '.archive-toggle, .archived-list, .archived-item',
        preventOnFilter: true,
        onEnd: evt => {
            if (evt.oldIndex === undefined || evt.newIndex === undefined) return;
            const nonArchived = state.conversations.filter(c => !c.archived);
            const [movedItem] = nonArchived.splice(evt.oldIndex, 1);
            nonArchived.splice(evt.newIndex, 0, movedItem);
            state.setConversations([...nonArchived, ...state.conversations.filter(c => c.archived)]);
            conversation.saveConversations();
            renderConversationList();
        }
    });
}

function createConversationListItem(conv, isArchived = false) {
    const li = document.createElement('li');
    li.className = 'conversation-item';
    if (isArchived) li.classList.add('archived');
    li.dataset.id = conv.id;
    if (conv.isPinned) li.classList.add('pinned');
    const titleSpan = document.createElement('span');
    titleSpan.className = 'title';
    titleSpan.textContent = conv.title;
    li.appendChild(titleSpan);
    if (!isArchived) {
        const actionsWrapper = document.createElement('div');
        actionsWrapper.className = 'conversation-item-actions';
        const moreBtn = document.createElement('button');
        moreBtn.className = 'action-btn more-options-btn';
        moreBtn.title = '更多操作';
        moreBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M9.5 13a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0m0-5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0m0-5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0"/></svg>`;
        moreBtn.onclick = (e) => {
            e.stopPropagation();
            showGlobalActionsMenu(moreBtn, conv.id, conv.title, conv.isPinned);
        };
        actionsWrapper.appendChild(moreBtn);
        li.appendChild(actionsWrapper);
    }
    if (conv.isNew) li.classList.add('new-conv');
    if (conv.id === state.currentConversationId) li.classList.add('active');
    li.addEventListener('dblclick', () => {
        const titleH1 = document.getElementById('chat-title');
        if (titleH1 && state.currentConversationId === conv.id) {
            handleTitleClick.call(titleH1);
        }
    });
    return li;
}

function handleTitleClick() {
    const chatHeader = this.parentElement;
    const oldH1 = this;
    const oldName = oldH1.textContent;
    const input = document.createElement('input');
    input.id = 'chat-title-input';
    input.type = 'text';
    input.value = oldName;
    chatHeader.replaceChild(input, oldH1);
    input.focus();
    input.setSelectionRange(oldName.length, oldName.length);
    const commitEdit = () => {
        const newName = input.value.trim() || oldName;
        const conv = state.getCurrentConversation();
        if (conv && conv.title !== newName) {
            conversation.renameConversationTitle(conv.id, newName);
            renderConversationList();
        }
        const newH1 = document.createElement('h1');
        newH1.id = 'chat-title';
        newH1.textContent = newName;
        ui.chatTitle = newH1;
        if (input.parentElement === chatHeader) chatHeader.replaceChild(newH1, input);
        enableInlineTitleEdit();
    };
    input.addEventListener('blur', commitEdit);
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
        else if (e.key === 'Escape') {
            const restoredH1 = document.createElement('h1');
            restoredH1.id = 'chat-title';
            restoredH1.textContent = oldName;
            ui.chatTitle = restoredH1;
            if (input.parentElement === chatHeader) chatHeader.replaceChild(restoredH1, input);
            enableInlineTitleEdit();
        }
    });
}

function determineDropdownAction() {
    if (!ui.modelSelect) return null;
    const conv = state.getCurrentConversation();
    if (conv && conv.model) {
        const modelExists = Array.from(ui.modelSelect.options).some(opt => opt.value === conv.model);
        if (modelExists) {
            ui.modelSelect.value = conv.model;
            return { action: 'none' };
        } else if (ui.modelSelect.options.length > 0 && !ui.modelSelect.options[0].value.startsWith("error::")) {
            ui.modelSelect.selectedIndex = 0;
            utils.showToast(`当前对话的模型 "${conv.model}" 已不可用，已自动切换。`, 'warning');
            return { action: 'update_conversation_model', newModel: ui.modelSelect.value };
        }
    }
    return null;
}

// --- 公开的 UI 操作函数 ---

export function showModelManagement() {
    if (ui.chatArea) ui.chatArea.style.display = 'none';
    if (ui.settingsArea) ui.settingsArea.style.display = 'none';
    if (ui.presetManagementArea) ui.presetManagementArea.style.display = 'none';
    if (ui.sidebar) ui.sidebar.style.display = 'none';
    if (ui.modelManagementArea) ui.modelManagementArea.style.display = 'flex';
    renderModelManagementUI();
}

export function showPresetManagement() {
    if (ui.chatArea) ui.chatArea.style.display = 'none';
    if (ui.settingsArea) ui.settingsArea.style.display = 'none';
    if (ui.modelManagementArea) ui.modelManagementArea.style.display = 'none';
    if (ui.sidebar) ui.sidebar.style.display = 'none';
    if (ui.presetManagementArea) ui.presetManagementArea.style.display = 'flex';
    renderPresetManagementUI();
}

export function openModelFormForEdit(groupIndex, optionIndex, presetGroupLabel = '') {
    if (!ui.modelForm || !ui.modelFormModal) return;
    ui.modelForm.reset();
    document.getElementById('edit-group-index').value = '';
    document.getElementById('edit-option-index').value = '';
    document.getElementById('model-group-label').value = presetGroupLabel;
    if (typeof groupIndex !== 'undefined' && typeof optionIndex !== 'undefined') {
        const group = state.editableModelConfig.models[groupIndex];
        const option = group.options[optionIndex];
        ui.modelFormTitle.textContent = '编辑模型';
        document.getElementById('model-group-label').value = group.groupLabel;
        document.getElementById('model-text').value = option.text;
        document.getElementById('model-value').value = option.value;
        document.getElementById('edit-group-index').value = groupIndex;
        document.getElementById('edit-option-index').value = optionIndex;
    } else {
        ui.modelFormTitle.textContent = '添加新模型';
    }
    ui.modelFormModal.style.display = 'flex';
}

export function closeModelForm() {
    if (ui.modelFormModal) ui.modelFormModal.style.display = 'none';
}

export function handleModelFormSubmit(event) {
    event.preventDefault();
    const groupLabel = document.getElementById('model-group-label').value.trim();
    const modelText = document.getElementById('model-text').value.trim();
    const modelValue = document.getElementById('model-value').value.trim();
    const editGroupIndex = document.getElementById('edit-group-index').value;
    const editOptionIndex = document.getElementById('edit-option-index').value;
    if (!groupLabel || !modelText || !modelValue) {
        utils.showToast('所有字段均为必填项！', 'warning');
        return;
    }
    const newOptionData = { text: modelText, value: modelValue, isHidden: false };
    if (editGroupIndex !== '' && editOptionIndex !== '') {
        state.editableModelConfig.models[parseInt(editGroupIndex)].options[parseInt(editOptionIndex)] = newOptionData;
    } else {
        let group = state.editableModelConfig.models.find(g => g.groupLabel === groupLabel);
        if (group) group.options.push(newOptionData);
        else state.editableModelConfig.models.push({ groupLabel: groupLabel, isGroupHidden: false, options: [newOptionData] });
    }
    renderModelManagementUI();
    closeModelForm();
}

export function openPresetFormForEdit(index) {
    if (!ui.presetForm || !ui.presetFormModal) return;
    ui.presetForm.reset();
    document.getElementById('edit-preset-index').value = '';
    if (typeof index !== 'undefined' && state.loadedPresetPrompts[index]) {
        const preset = state.loadedPresetPrompts[index];
        ui.presetFormTitle.textContent = '编辑模板';
        document.getElementById('edit-preset-index').value = index;
        document.getElementById('preset-name').value = preset.name;
        document.getElementById('preset-description').value = preset.description || '';
        document.getElementById('preset-type').value = preset.type;
        document.getElementById('preset-prompt').value = preset.prompt;
    } else {
        ui.presetFormTitle.textContent = '添加新模板';
    }
    ui.presetFormModal.style.display = 'flex';
}

export function closePresetForm() {
    if (ui.presetFormModal) ui.presetFormModal.style.display = 'none';
}

export function handlePresetFormSubmit(event) {
    event.preventDefault();
    const name = document.getElementById('preset-name').value.trim();
    const description = document.getElementById('preset-description').value.trim();
    const type = document.getElementById('preset-type').value;
    const prompt = document.getElementById('preset-prompt').value.trim();
    const editIndex = document.getElementById('edit-preset-index').value;
    if (!name || !prompt) {
        utils.showToast('模板名称和内容均为必填项！', 'warning');
        return;
    }
    const newPresetData = { id: `custom_${Date.now()}`, name, description, type, prompt, isHidden: false };
    if (editIndex !== '') {
        state.loadedPresetPrompts[parseInt(editIndex, 10)] = newPresetData;
    } else {
        state.loadedPresetPrompts.push(newPresetData);
    }
    renderPresetManagementUI();
    closePresetForm();
}

export function renderFilePreview() {
    if (!ui.filePreviewArea) return;
    ui.filePreviewArea.innerHTML = '';
    if (state.uploadedFilesData?.length > 0) {
        ui.filePreviewArea.style.display = 'flex';
        state.uploadedFilesData.forEach((fileData, index) => {
            const previewItem = document.createElement('div');
            previewItem.className = 'file-preview-item-sleek';
            previewItem.title = fileData.name;
            previewItem.innerHTML = `<div class="file-name-sleek">${utils.escapeHtml(fileData.name)}</div><button type="button" class="remove-file-btn-sleek" title="移除 ${utils.escapeHtml(fileData.name)}">×</button>`;
            previewItem.querySelector('.remove-file-btn-sleek').addEventListener('click', (e) => {
                e.stopPropagation();
                if (index >= 0 && index < state.uploadedFilesData.length) {
                    state.uploadedFilesData.splice(index, 1);
                    renderFilePreview();
                }
            });
            ui.filePreviewArea.appendChild(previewItem);
        });
    } else {
        ui.filePreviewArea.style.display = 'none';
    }
}

export function updateScrollToBottomButtonVisibility() {
    if (!ui.messagesContainer || !ui.scrollToBottomBtn) return;
    const threshold = 150;
    const distanceFromBottom = ui.messagesContainer.scrollHeight - ui.messagesContainer.clientHeight - ui.messagesContainer.scrollTop;
    ui.scrollToBottomBtn.style.display = (distanceFromBottom > threshold) ? 'flex' : 'none';
}

export function handleScrollToBottomClick() {
    if (ui.messagesContainer) {
        ui.messagesContainer.scrollTo({ top: ui.messagesContainer.scrollHeight, behavior: 'smooth' });
    }
}

export function appendMessage(role, messageContent, modelForNote, reasoningText, conversationId, messageIndex, usage) {
    if (!ui.messagesContainer) return null;
    if (ui.emptyChatPlaceholder) ui.emptyChatPlaceholder.style.display = 'none';
    const messageWrapperDiv = document.createElement('div');
    messageWrapperDiv.className = `message-wrapper ${role === 'user' ? 'user-message-wrapper' : 'assistant-message-wrapper'}`;
    messageWrapperDiv.dataset.conversationId = conversationId;
    messageWrapperDiv.dataset.messageIndex = messageIndex;
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role === 'assistant' || role === 'model' ? 'assistant' : 'user'}`;
    const contentDiv = document.createElement('div');
    contentDiv.className = 'text';
    const markdownContainer = document.createElement('span');
    markdownContainer.className = 'markdown-content';
    contentDiv.appendChild(markdownContainer);
    messageWrapperDiv.contentSpan = markdownContainer;
    if (role === 'system') {
        const systemDiv = document.createElement('div');
        systemDiv.className = 'system-prompt-display';
        systemDiv.innerHTML = `<strong>系统指令:</strong><div class="system-prompt-content">${utils.escapeHtml(String(messageContent))}</div>`;
        ui.messagesContainer.querySelector('.system-prompt-display')?.remove();
        ui.messagesContainer.insertBefore(systemDiv, ui.messagesContainer.firstChild);
        return systemDiv;
    }
    if (role === 'user' && messageContent?.files?.length > 0) {
        const attachmentsContainer = document.createElement('div');
        attachmentsContainer.className = 'user-attachments-container';
        messageContent.files.forEach(file => {
            const attachmentItem = document.createElement('div');
            attachmentItem.className = 'attachment-item';
            attachmentItem.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-paperclip" viewBox="0 0 16 16"><path d="M4.5 3a2.5 2.5 0 0 1 5 0v9a1.5 1.5 0 0 1-3 0V5a.5.5 0 0 1 1 0v8.5a.5.5 0 0 0 1 0V3a1.5 1.5 0 1 0-3 0v9a2.5 2.5 0 0 0 5 0V5a.5.5 0 0 1 1 0v8.5a3.5 3.5 0 1 1-7 0V3z"/></svg><span>${utils.escapeHtml(file.name)}</span>`;
            attachmentsContainer.appendChild(attachmentItem);
        });
        messageDiv.appendChild(attachmentsContainer);
    }
    let finalMarkdown = "";
    if (typeof messageContent === 'string') finalMarkdown = messageContent;
    else if (messageContent?.text !== undefined) finalMarkdown = messageContent.text || "";
    else if (Array.isArray(messageContent) && messageContent[0]?.type === 'text') finalMarkdown = messageContent[0].text;
    else if (messageContent) try { finalMarkdown = JSON.stringify(messageContent, null, 2); } catch (e) { finalMarkdown = "[无法渲染的复杂内容]"; }
    let reasoningDivElement = null;
    if (role === 'assistant' || role === 'model') {
        const reasoningBlockDiv = document.createElement('div');
        reasoningBlockDiv.className = 'reasoning-block';
        reasoningBlockDiv.innerHTML = `<div class="reasoning-label"><span>思考过程:</span><button type="button" class="copy-reasoning-btn">复制</button></div><div class="reasoning-content"></div>`;
        reasoningDivElement = reasoningBlockDiv.querySelector('.reasoning-content');
        if (reasoningText?.trim()) reasoningDivElement.textContent = reasoningText;
        else reasoningBlockDiv.classList.add('reasoning-block-empty');
        reasoningBlockDiv.querySelector('.copy-reasoning-btn').addEventListener('click', e => {
            e.stopPropagation();
            navigator.clipboard.writeText(reasoningDivElement.textContent || "").then(() => {
                e.target.textContent = '已复制!';
                setTimeout(() => { e.target.textContent = '复制'; }, 2000);
            });
        });
        messageDiv.appendChild(reasoningBlockDiv);
    }
    if (finalMarkdown.trim()) markdownContainer.innerHTML = marked.parse(finalMarkdown);
    utils.pruneEmptyNodes(markdownContainer);
    utils.pruneEmptyNodes(markdownContainer);
    messageDiv.appendChild(contentDiv);
    processPreBlocksForCopyButtons(contentDiv);
    if (role === 'assistant' || role === 'model') {
        const metaInfoDiv = document.createElement('div');
        metaInfoDiv.className = 'message-meta-info';
        if (modelForNote) {
            const note = document.createElement('div');
            note.className = 'model-note';
            let displayModelName = modelForNote;
            if (ui.modelSelect) {
                const opt = ui.modelSelect.querySelector(`option[value="${modelForNote}"]`);
                if (opt) displayModelName = opt.textContent;
                else { const p = String(modelForNote).split('::'); if (p.length === 2) displayModelName = p[1]; }
            }
            note.textContent = `模型：${displayModelName}`;
            metaInfoDiv.appendChild(note);
        }
        const tokenNote = document.createElement('span');
        tokenNote.className = 'token-count-note';
        messageWrapperDiv.usageElement = tokenNote;
        if (usage) {
            const p = usage.prompt_tokens ?? usage.input_tokens ?? 'N/A';
            const c = usage.completion_tokens ?? usage.output_tokens ?? 'N/A';
            tokenNote.textContent = `提示: ${p} tokens, 回复: ${c} tokens`;
        }
        metaInfoDiv.appendChild(tokenNote);
        messageDiv.appendChild(metaInfoDiv);
    }
    const actionsContainer = document.createElement('div');
    actionsContainer.className = 'message-actions-container';
    const copyMessageBtn = document.createElement('button');
    copyMessageBtn.className = 'message-action-btn copy-message-btn';
    copyMessageBtn.title = '复制消息内容';
    copyMessageBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-copy" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M4 2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zm2-1a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1zM2 5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1h1v1a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1v1z"/></svg>`;
    copyMessageBtn.addEventListener('click', () => { navigator.clipboard.writeText(finalMarkdown.trim()).then(() => utils.showToast('消息内容已复制', 'success')); });
    actionsContainer.appendChild(copyMessageBtn);
    if (role === 'user') {
        const editBtn = document.createElement('button');
        editBtn.className = 'message-action-btn edit-message-btn';
        editBtn.title = '以此为基础编辑';
        editBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-pencil-square" viewBox="0 0 16 16"><path d="M15.502 1.94a.5.5 0 0 1 0 .706L14.459 3.69l-2-2L13.502.646a.5.5 0 0 1 .707 0l1.293 1.293zm-1.75 2.456-2-2L4.939 9.21a.5.5 0 0 0-.121.196l-.805 2.414a.25.25 0 0 0 .316.316l2.414-.805a.5.5 0 0 0 .196-.12l6.813-6.814z"/><path fill-rule="evenodd" d="M1 13.5A1.5 1.5 0 0 0 2.5 15h11a1.5 1.5 0 0 0 1.5-1.5v-6a.5.5 0 0 0-1 0v6a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5v-11a.5.5 0 0 1 .5-.5h6a.5.5 0 0 0 0-1h-6A1.5 1.5 0 0 0 1 2.5z"/></svg>`;
        editBtn.dataset.action = 'edit';
        actionsContainer.appendChild(editBtn);
    }
    if (role === 'assistant' || role === 'model') {
        const regenerateBtn = document.createElement('button');
        regenerateBtn.className = 'message-action-btn regenerate-btn';
        regenerateBtn.title = '从这里重新生成';
        regenerateBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-arrow-repeat" viewBox="0 0 16 16"><path d="M11.534 7h3.932a.25.25 0 0 1 .192.41l-1.966 2.36a.25.25 0 0 1-.384 0l-1.966-2.36a.25.25 0 0 1 .192-.41zm-11 2h3.932a.25.25 0 0 0 .192-.41L2.692 6.23a.25.25 0 0 0-.384 0L.342 8.59A.25.25 0 0 0 .534 9z"/><path fill-rule="evenodd" d="M8 3c-1.552 0-2.94.707-3.857 1.818a.5.5 0 1 1-.771-.636A6.002 6.002 0 0 1 13.917 7H12.5A5.002 5.002 0 0 0 8 3M3.5 13A5.002 5.002 0 0 0 8 15c1.552 0 2.94-.707 3.857-1.818a.5.5 0 1 1 .771.636A6.002 6.002 0 0 1 2.083 9H3.5A5.002 5.002 0 0 0 8 15"/></svg>`;
        regenerateBtn.dataset.action = 'regenerate';
        actionsContainer.appendChild(regenerateBtn);
    }
    const deleteMsgBtn = document.createElement('button');
    deleteMsgBtn.className = 'message-action-btn delete-message-btn';
    deleteMsgBtn.title = '删除此消息';
    deleteMsgBtn.dataset.action = 'delete';
    deleteMsgBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-trash3" viewBox="0 0 16 16"><path d="M6.5 1h3a.5.5 0 0 1 .5.5v1H6v-1a.5.5 0 0 1 .5-.5M11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3A1.5 1.5 0 0 0 5 1.5v1H1.5a.5.5 0 0 0 0 1h.538l.853 10.66A2 2 0 0 0 4.885 16h6.23a2 2 0 0 0 1.994-1.84l.853-10.66h.538a.5.5 0 0 0 0-1zm-9.955 1H14.5a.5.5 0 0 1 0 1H1.455a.5.5 0 0 1 0-1Z"/></svg>`;
    actionsContainer.appendChild(deleteMsgBtn);
    messageWrapperDiv.appendChild(messageDiv);
    messageWrapperDiv.appendChild(actionsContainer);
    ui.messagesContainer.appendChild(messageWrapperDiv);
    ui.messagesContainer.scrollTop = ui.messagesContainer.scrollHeight;
    if (window.MathJax?.typesetPromise) {
        const elementsToTypeset = [contentDiv];
        if (reasoningDivElement?.textContent.trim()) elementsToTypeset.push(reasoningDivElement);
        if (elementsToTypeset.length > 0) window.MathJax.typesetPromise(elementsToTypeset).catch(err => console.error("MathJax typesetting failed:", err));
    }
    return messageWrapperDiv;
}

export function processStreamChunk(tempMsgElement, replyTextPortion, reasoningTextPortion, usageData) {
    if (!tempMsgElement) return;
    const markdownContentSpan = tempMsgElement.contentSpan;
    const reasoningContentEl = tempMsgElement.querySelector('.reasoning-content');
    const reasoningBlockEl = tempMsgElement.querySelector('.reasoning-block');
    if (replyTextPortion) {
        let accumulatedRawMarkdown = markdownContentSpan.dataset.rawMarkdown || "";
        accumulatedRawMarkdown += replyTextPortion;
        markdownContentSpan.dataset.rawMarkdown = accumulatedRawMarkdown;
        markdownContentSpan.innerHTML = marked.parse(accumulatedRawMarkdown);
        processPreBlocksForCopyButtons(markdownContentSpan);
    }
    if (reasoningContentEl && reasoningTextPortion) {
        reasoningContentEl.textContent += reasoningTextPortion;
        if (reasoningBlockEl) reasoningBlockEl.classList.remove('reasoning-block-empty');
    }
    if (tempMsgElement.usageElement && usageData) {
        const p = usageData.prompt_tokens ?? usageData.input_tokens ?? '...';
        const c = usageData.completion_tokens ?? usageData.output_tokens ?? '...';
        tempMsgElement.usageElement.textContent = `提示: ${p} tokens, 回复: ${c} tokens`;
    }
    if (ui.messagesContainer) {
        const dist = ui.messagesContainer.scrollHeight - ui.messagesContainer.clientHeight - ui.messagesContainer.scrollTop;
        if (dist < 200) requestAnimationFrame(() => { ui.messagesContainer.scrollTop = ui.messagesContainer.scrollHeight; });
    }
}

export function appendLoading() {
    if (!ui.messagesContainer) return null;
    const loadingWrapper = document.createElement('div');
    loadingWrapper.className = 'loading-indicator-wrapper';
    loadingWrapper.innerHTML = `<div class="loading-indicator-bubble"><span>对方正在输入…</span></div>`;
    ui.messagesContainer.appendChild(loadingWrapper);
    ui.messagesContainer.scrollTop = ui.messagesContainer.scrollHeight;
    return loadingWrapper;
}

export function renderConversationList(searchTerm = '') {
    if (!ui.conversationList) return;
    let isArchivePreviouslyExpanded = ui.conversationList.querySelector('.archive-toggle.expanded') !== null;
    ui.conversationList.innerHTML = '';
    let conversationsToProcess = [...state.conversations];
    if (searchTerm.trim()) {
        const lowerCaseSearchTerm = searchTerm.toLowerCase().trim();
        conversationsToProcess = conversationsToProcess.filter(c => c.title.toLowerCase().includes(lowerCaseSearchTerm));
    }
    const unarchivedConversations = conversationsToProcess.filter(c => !c.archived).sort((a, b) => (b.isPinned || 0) - (a.isPinned || 0));
    unarchivedConversations.forEach(c => ui.conversationList.appendChild(createConversationListItem(c)));
    const archivedConversations = conversationsToProcess.filter(c => c.archived);
    if (archivedConversations.length > 0) {
        const toggle = document.createElement('li');
        toggle.className = 'archive-toggle';
        toggle.textContent = `已归档 (${archivedConversations.length})`;
        if (isArchivePreviouslyExpanded) toggle.classList.add('expanded');
        toggle.addEventListener('click', () => {
            toggle.classList.toggle('expanded');
            const subListElement = toggle.nextElementSibling;
            if (subListElement) subListElement.style.display = toggle.classList.contains('expanded') ? 'block' : 'none';
        });
        ui.conversationList.appendChild(toggle);
        const subList = document.createElement('ul');
        subList.className = 'archived-list';
        subList.style.display = isArchivePreviouslyExpanded ? 'block' : 'none';
        archivedConversations.forEach(c => subList.appendChild(createConversationListItem(c, true)));
        ui.conversationList.appendChild(subList);
    }
    enableConversationDrag();
}

export function showGlobalActionsMenu(buttonElement, convId, convTitle, isPinned) {
    if (!ui.globalActionsMenu) return;
    ui.globalActionsMenu.innerHTML = '';
    const createMenuItem = (svgIcon, text, action, isDanger = false) => {
        const button = document.createElement('button');
        button.className = 'dropdown-item';
        if (isDanger) button.classList.add('danger');
        button.innerHTML = `${svgIcon}<span>${text}</span>`;
        button.onclick = (e) => {
            e.stopPropagation();
            action();
            ui.globalActionsMenu.classList.remove('show');
        };
        ui.globalActionsMenu.appendChild(button);
    };
    const pinSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M9.828.722a.5.5 0 0 1 .354.146l4.95 4.95a.5.5 0 0 1 0 .707c-.48.48-1.072.588-1.503.588-.177 0-.335-.018-.46-.039l-3.134 3.134a5.927 5.927 0 0 1 .16 1.013c.046.702-.032 1.687-.72 2.375a.5.5 0 0 1-.707 0l-2.829-2.828-3.182 3.182c-.195.195-1.219.902-1.414.707-.195-.195.512-1.22.707-1.414l3.182-3.182-2.828-2.829a.5.5 0 0 1 0-.707c.688-.688 1.673-.767 2.375-.72a5.922 5.922 0 0 1 1.013.16l3.134-3.133a2.772 2.772 0 0 1-.04-.461c0-.43.108-1.022.589-1.503a.5.5 0 0 1 .353-.146"/></svg>`;
    const renameSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M12.854.146a.5.5 0 0 0-.707 0L10.5 1.793 14.207 5.5l1.647-1.646a.5.5 0 0 0 0-.708zm.646 6.061L9.793 2.5 3.293 9H3.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.207l6.5-6.5zm-7.468 7.468A.5.5 0 0 1 6 13.5V13h-.5a.5.5 0 0 1-.5-.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.5-.5V10h-.5a.499.499 0 0 1-.175-.032l-.179.178a.5.5 0 0 0-.11.168l-2 5a.5.5 0 0 0 .65.65l5-2a.5.5 0 0 0 .168-.11z"/></svg>`;
    const deleteSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M11 1.5v1h3.5a.5.5 0 0 1 0 1h-.538l-.853 10.66A2 2 0 0 1 11.115 16h-6.23a2 2 0 0 1-1.994-1.84L2.038 3.5H1.5a.5.5 0 0 1 0-1H5v-1A1.5 1.5 0 0 1 6.5 0h3A1.5 1.5 0 0 1 11 1.5m-5 0v1h4v-1a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 0-.5.5"/></svg>`;
    createMenuItem(pinSVG, isPinned ? '取消置顶' : '置顶对话', () => {
        conversation.togglePin(convId);
        renderConversationList();
    });
    createMenuItem(renameSVG, '重命名', () => {
        const newTitle = prompt('输入新的对话标题：', convTitle);
        if (newTitle && newTitle.trim()) {
            const trimmedTitle = newTitle.trim();
            conversation.renameConversationTitle(convId, trimmedTitle);
            renderConversationList();
            if (convId === state.currentConversationId) updateChatTitle(trimmedTitle);
        }
    });
    const divider = document.createElement('div');
    divider.className = 'dropdown-divider';
    ui.globalActionsMenu.appendChild(divider);
    createMenuItem(deleteSVG, '删除对话', () => {
        if (confirm(`确定要删除对话「${convTitle}」吗？此操作无法恢复。`)) {
            const result = conversation.deleteConversation(convId);
            if (result.nextIdToLoad) {
                const id = (result.nextIdToLoad === 'new') ? conversation.createNewConversation().id : result.nextIdToLoad;
                document.dispatchEvent(new CustomEvent('loadConversationRequest', { detail: { conversationId: id } }));
            } else {
                renderConversationList();
            }
        }
    }, true);
    const rect = buttonElement.getBoundingClientRect();
    ui.globalActionsMenu.style.top = `${rect.bottom + window.scrollY + 6}px`;
    ui.globalActionsMenu.style.left = `${rect.right + window.scrollX - ui.globalActionsMenu.offsetWidth}px`;
    ui.globalActionsMenu.classList.add('show');
    const closeMenu = (e) => {
        if (!ui.globalActionsMenu.contains(e.target)) {
            ui.globalActionsMenu.classList.remove('show');
            document.removeEventListener('click', closeMenu);
        }
    };
    setTimeout(() => { document.addEventListener('click', closeMenu); }, 0);
}

export function loadAndRenderConversationUI(convToLoad) {
    if (!convToLoad) return;
    updateChatTitle(convToLoad.title);
    if (ui.archiveCurrentBtn) ui.archiveCurrentBtn.textContent = convToLoad.archived ? '取消归档' : '归档';
    if (ui.modelSelect) ui.modelSelect.value = convToLoad.model;
    showChatArea();
    if (!ui.messagesContainer) return;
    if (ui.emptyChatPlaceholder) {
        ui.messagesContainer.innerHTML = '';
        ui.messagesContainer.appendChild(ui.emptyChatPlaceholder);
    } else {
        ui.messagesContainer.innerHTML = '';
    }
    let renderedMessageCount = 0;
    if (convToLoad.messages?.length > 0) {
        convToLoad.messages.forEach((msg, index) => {
            const messageElement = appendMessage(msg.role, msg.content, msg.model || convToLoad.model, msg.reasoning_content, convToLoad.id, index, msg.usage);
            if (messageElement) renderedMessageCount++;
        });
    }
    if (ui.emptyChatPlaceholder) ui.emptyChatPlaceholder.style.display = renderedMessageCount === 0 ? 'flex' : 'none';
    ui.messagesContainer.scrollTop = ui.messagesContainer.scrollHeight;
    updateScrollToBottomButtonVisibility();
    renderConversationList();
    enableInlineTitleEdit();
}

export function showChatArea() {
    if (ui.settingsArea) ui.settingsArea.style.display = 'none';
    if (ui.modelManagementArea) ui.modelManagementArea.style.display = 'none';
    if (ui.presetManagementArea) ui.presetManagementArea.style.display = 'none';
    if (ui.chatArea) ui.chatArea.style.display = 'flex';
    if (ui.sidebar) ui.sidebar.style.display = 'flex';
}

export function showSettings() {
    if (ui.chatArea) ui.chatArea.style.display = 'none';
    if (ui.modelManagementArea) ui.modelManagementArea.style.display = 'none';
    if (ui.presetManagementArea) ui.presetManagementArea.style.display = 'none';
    if (ui.settingsArea) ui.settingsArea.style.display = 'flex';
}

export function updateChatTitle(newTitle) {
    if (ui.chatTitle) ui.chatTitle.textContent = newTitle;
}

export function populateModelDropdown(modelsArray) {
    if (!ui.modelSelect) return null;
    ui.modelSelect.innerHTML = '';
    if (!modelsArray || modelsArray.length === 0) {
        ui.modelSelect.innerHTML = '<option value="error::no-models">无可用模型</option>';
    } else {
        let hasVisibleOptions = false;
        modelsArray.forEach(group => {
            if (!group.isGroupHidden) {
                const visibleOptions = group.options.filter(opt => !opt.isHidden);
                if (visibleOptions.length > 0) {
                    hasVisibleOptions = true;
                    const optgroup = document.createElement('optgroup');
                    optgroup.label = group.groupLabel;
                    visibleOptions.forEach(opt => {
                        const option = document.createElement('option');
                        option.value = opt.value;
                        option.textContent = opt.text;
                        optgroup.appendChild(option);
                    });
                    ui.modelSelect.appendChild(optgroup);
                }
            }
        });
        if (!hasVisibleOptions) ui.modelSelect.innerHTML = '<option value="error::no-visible-models">无可见模型</option>';
    }
    return determineDropdownAction();
}

/**
 * 根据内容自动调整 prompt 输入框的高度，并控制清空按钮的显隐。
 */
export function autoResizePromptInput() {
    const textarea = ui.promptInput; // ★ 注意：在 ui.js 内部，要用 ui.promptInput
    if (!textarea) {
        return;
    }

    // 从CSS获取max-height的值，如果没有则使用一个默认值（例如200px）
    const maxHeight = parseInt(window.getComputedStyle(textarea).maxHeight, 10) || 200;

    // 1. 先将高度重置，以便浏览器能重新计算scrollHeight
    textarea.style.height = 'auto';
    
    // 2. 获取内容所需的实际高度
    const scrollHeight = textarea.scrollHeight;
    
    // 3. 判断是否超过了最大高度
    if (scrollHeight > maxHeight) {
        // 如果超过最大高度，则将高度固定为最大高度，并显示滚动条
        textarea.style.height = `${maxHeight}px`;
        textarea.style.overflowY = 'auto';
    } else {
        // 如果未超过，则将高度设置为内容所需高度，并隐藏滚动条
        textarea.style.height = `${scrollHeight}px`;
        textarea.style.overflowY = 'hidden';
    }

    // 4. 控制清空按钮的显示/隐藏
    const clearBtn = textarea.parentElement.querySelector('#clear-prompt-btn');
    if (clearBtn) {
        clearBtn.style.display = textarea.value.length > 0 ? 'flex' : 'none';
    }
}


export function toggleInlineSettingsPanel() {
    if (!ui.inlineChatSettingsPanel) return;
    const isVisible = ui.inlineChatSettingsPanel.style.display === 'block';
    if (isVisible) closeInlineSettingsPanel();
    else {
        closePresetPromptsPanel();
        ui.inlineChatSettingsPanel.style.display = 'block';
    }
}

export function closeInlineSettingsPanel() {
    if (ui.inlineChatSettingsPanel) ui.inlineChatSettingsPanel.style.display = 'none';
}

export function togglePresetPromptsPanel() {
    if (!ui.presetPromptsListPanel) return;
    const isVisible = ui.presetPromptsListPanel.style.display === 'block';
    if (isVisible) closePresetPromptsPanel();
    else {
        closeInlineSettingsPanel();
        ui.presetPromptsListPanel.style.display = 'block';
    }
}

export function closePresetPromptsPanel() {
    if (ui.presetPromptsListPanel) ui.presetPromptsListPanel.style.display = 'none';
}

export function populatePresetPromptsList() {
    if (!ui.presetPromptsUl) return;
    const visiblePresets = state.loadedPresetPrompts.filter(p => !p.isHidden);
    if (visiblePresets.length === 0) {
        ui.presetPromptsUl.innerHTML = '<li>没有可用的预设。</li>';
        return;
    }
    ui.presetPromptsUl.innerHTML = '';
    visiblePresets.forEach(preset => {
        const li = document.createElement('li');
        li.className = 'preset-prompt-item';
        li.textContent = preset.name;
        if (preset.description) li.title = preset.description;
        li.addEventListener('click', () => {
            if (typeof applyPresetPrompt === 'function') {
                applyPresetPrompt(preset);
                if (ui.presetPromptsListPanel) ui.presetPromptsListPanel.style.display = 'none';
            }
        });
        ui.presetPromptsUl.appendChild(li);
    });
}

export function enableInlineTitleEdit() {
    if (ui.chatTitle) {
        ui.chatTitle.removeEventListener('click', handleTitleClick);
        ui.chatTitle.style.cursor = 'pointer';
        ui.chatTitle.addEventListener('click', handleTitleClick);
    }
}

export function updateManualThinkModeState() {
    if (!ui.thinkModeToggle || !ui.autoThinkModeToggle) return;
    const isDisabled = state.isAutoThinkModeEnabled;
    ui.thinkModeToggle.disabled = isDisabled;
    const manualThinkModeItem = ui.thinkModeToggle.closest('.inline-setting-item');
    if (manualThinkModeItem) {
        manualThinkModeItem.style.opacity = isDisabled ? '0.5' : '1';
        manualThinkModeItem.style.pointerEvents = isDisabled ? 'none' : 'auto';
        manualThinkModeItem.title = isDisabled ? '“自动判断思考模式”已开启，此项被禁用' : '';
    }
}

export function showSearchView() {
    if (!ui.sidebarHeader || !ui.searchWrapper || !ui.searchInput) return;
    ui.sidebarHeader.classList.add('search-mode');
    ui.searchWrapper.style.display = 'flex';
    setTimeout(() => { ui.searchInput.focus(); }, 50);
}

export function showLogoView() {
    if (!ui.sidebarHeader || !ui.searchWrapper || !ui.searchInput) return;
    if (ui.searchInput.value.trim() === '') {
        ui.sidebarHeader.classList.remove('search-mode');
        setTimeout(() => {
            if (!ui.sidebarHeader.classList.contains('search-mode')) ui.searchWrapper.style.display = 'none';
        }, 200);
    }
}