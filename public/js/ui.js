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

let modelGroupSortable = null;
const modelOptionSortables = [];
let presetSortable = null;

// ========================================================================
// 3. UI 初始化
// ========================================================================

// --- START OF FILE ui.js (Complete and Corrected initializeUI function) ---

/**
 * 在 DOM 加载后，获取所有需要的 DOM 元素引用并填充 ui 对象。
 * @returns {boolean} 如果关键元素获取成功，则返回 true，否则返回 false。
 */
export function initializeUI() {
    // ★ 核心修复：恢复所有原始元素的获取
    Object.assign(ui, {
        sidebar: document.querySelector('.sidebar'),
        sidebarToggleBtn: document.getElementById('sidebar-toggle-btn'),
        sidebarHeader: document.getElementById('sidebar-header'),
        logoDisplay: document.getElementById('logo-display'),
        searchWrapper: document.getElementById('search-wrapper'),
        searchInput: document.getElementById('search-conversations'),
        newConvBtn: document.getElementById('new-conv-btn'),
        conversationList: document.getElementById('conversation-list'),
        showSettingsBtn: document.getElementById('show-settings-btn'),
        sidebarResizer: document.getElementById('sidebar-resizer'),
        chatArea: document.getElementById('chat-area'),
        systemPromptBtn: document.getElementById('system-prompt-btn'),
        settingsArea: document.getElementById('settings-area'),
        apiProviderSelect: document.getElementById('api-provider-select'),
        apiKeyInput: document.getElementById('api-key-input'),
        modelManagementArea: document.getElementById('model-management-area'),
        presetManagementArea: document.getElementById('preset-management-area'),
        chatTitle: document.getElementById('chat-title'),
        saveApiKeyBtn: document.getElementById('save-api-key-btn'),
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
        promptInput: document.getElementById('prompt'), // 关键元素
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

    // ★ 并且包含我们新增的 messageActionsMenu 逻辑
    let menuElement = document.getElementById('message-actions-menu');
    if (!menuElement) {
        menuElement = document.createElement('div');
        menuElement.id = 'message-actions-menu';
        menuElement.className = 'global-actions-menu';
        document.body.appendChild(menuElement);
    }
    ui.messageActionsMenu = menuElement;

    // ★ 现在这个检查将能通过
    if (!ui.promptInput) {
        console.error("initializeUI FAILED: Could not find element with ID 'prompt'.");
        return false;
    }
    console.log("initializeUI SUCCESS: All UI elements captured.");
    return true;
}





/**
 * ★ 新增函数：显示单个消息的操作菜单
 * @param {HTMLElement} targetButton - 触发菜单的按钮
 * @param {string} conversationId - 对话ID
 * @param {string} messageId - 消息ID
 */
export function showMessageActionsMenu(targetButton, conversationId, messageId) {
    // ★★★ 核心修复：从 ui 对象读取菜单元素 ★★★
    const menu = ui.messageActionsMenu;
    if (!menu) {
        console.error("Message actions menu not found in ui object!");
        return;
    }

    menu.innerHTML = ''; // 清空

    const createMenuItem = (text, action, isDanger = false) => {
        const button = document.createElement('button');
        button.className = 'dropdown-item';
        if (isDanger) button.classList.add('danger');
        button.textContent = text;
        button.onclick = (e) => {
            e.stopPropagation();
            document.dispatchEvent(new CustomEvent('messageActionRequest', {
                detail: { conversationId, messageId, action }
            }));
            menu.classList.remove('show');
        };
        menu.appendChild(button);
    };

    createMenuItem('删除此条消息', 'delete_single', true);
    createMenuItem('删除此分支', 'delete_branch', true);

    // 定位并显示菜单
    const rect = targetButton.getBoundingClientRect();
    menu.style.top = `${rect.bottom + window.scrollY + 2}px`;
    menu.style.left = `${rect.right + window.scrollX - menu.offsetWidth}px`;
    menu.classList.add('show');

    // 点击外部关闭菜单
    const closeMenu = (e) => {
        if (!menu.contains(e.target)) {
            menu.classList.remove('show');
            document.removeEventListener('click', closeMenu, true);
        }
    };
    setTimeout(() => document.addEventListener('click', closeMenu, true), 0);
}

// ========================================================================
// 4. UI 渲染与交互函数
// ========================================================================

export function renderModelManagementUI() {
    if (!ui.modelListEditor || !state.editableModelConfig || !Array.isArray(state.editableModelConfig.models)) {
        ui.modelListEditor.innerHTML = '<p>模型配置为空或格式不正确。</p>';
        return;
    }

    // --- 1. 清理旧的拖拽实例，防止内存泄漏 ---
    if (modelGroupSortable) modelGroupSortable.destroy();
    modelOptionSortables.forEach(instance => instance.destroy());
    modelOptionSortables.length = 0;

    // --- 2. 渲染列表 (在您的基础上增加了拖拽手柄和data-index) ---
    ui.modelListEditor.innerHTML = '';
    state.editableModelConfig.models.forEach((group, groupIndex) => {
        const groupDiv = document.createElement('div');
        groupDiv.className = 'model-group-editor';
        groupDiv.dataset.groupIndex = groupIndex; // ★ 新增：为拖拽提供索引
        if (group.isGroupHidden) groupDiv.classList.add('model-group-content-hidden');
        
        const groupHeader = document.createElement('div');
        groupHeader.className = 'model-group-header';
        
        // ★ 新增：添加拖拽手柄
        groupHeader.innerHTML = `<span class="drag-handle" title="拖动排序">⠿</span>`;

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
        optionsUl.dataset.groupIndex = groupIndex; // ★ 新增：为拖拽提供索引
        (group.options || []).forEach((option, optionIndex) => {
            const optionLi = document.createElement('li');
            optionLi.className = 'model-option-editor';
            optionLi.classList.toggle('model-option-hidden', !!option.isHidden);
            // ★ 新增：添加拖拽手柄
            optionLi.innerHTML = `
                <span class="drag-handle" title="拖动排序">⠿</span>
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

    // --- 3. 初始化 SortableJS 实例 ---
    if (typeof Sortable !== 'undefined') {
        // 让模型组可以排序
        modelGroupSortable = Sortable.create(ui.modelListEditor, {
            animation: 150,
            handle: '.drag-handle',
            onEnd: (evt) => {
                const [movedItem] = state.editableModelConfig.models.splice(evt.oldIndex, 1);
                state.editableModelConfig.models.splice(evt.newIndex, 0, movedItem);
                renderModelManagementUI();
            }
        });

        // 让每个组内的模型可以排序，并支持跨组拖拽
        ui.modelListEditor.querySelectorAll('.model-group-options').forEach(ul => {
            const sortable = Sortable.create(ul, {
                group: 'models',
                animation: 150,
                handle: '.drag-handle',
                onEnd: (evt) => {
                    const fromGroupIndex = parseInt(evt.from.dataset.groupIndex, 10);
                    const toGroupIndex = parseInt(evt.to.dataset.groupIndex, 10);
                    const [movedOption] = state.editableModelConfig.models[fromGroupIndex].options.splice(evt.oldIndex, 1);
                    state.editableModelConfig.models[toGroupIndex].options.splice(evt.newIndex, 0, movedOption);
                    renderModelManagementUI();
                }
            });
            modelOptionSortables.push(sortable);
        });
    }
}


export function renderPresetManagementUI() {
    if (!ui.presetListEditor) return;

    // --- 1. 清理旧的拖拽实例 ---
    if (presetSortable) presetSortable.destroy();

    // --- 2. 渲染列表 (在您的基础上增加了拖拽手柄) ---
    ui.presetListEditor.innerHTML = '';
    state.loadedPresetPrompts.forEach((preset, index) => {
        const presetItemDiv = document.createElement('div');
        presetItemDiv.className = 'model-option-editor'; // 复用样式
        presetItemDiv.classList.toggle('model-option-hidden', !!preset.isHidden);
        // ★ 新增：添加拖拽手柄
        presetItemDiv.innerHTML = `
            <span class="drag-handle" title="拖动排序">⠿</span>
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

    // --- 3. 初始化 SortableJS 实例 ---
    if (typeof Sortable !== 'undefined') {
        presetSortable = Sortable.create(ui.presetListEditor, {
            animation: 150,
            handle: '.drag-handle',
            onEnd: (evt) => {
                const [movedItem] = state.loadedPresetPrompts.splice(evt.oldIndex, 1);
                state.loadedPresetPrompts.splice(evt.newIndex, 0, movedItem);
                renderPresetManagementUI(); // 重新渲染以固化顺序
            }
        });
    }
}


/**
 * 切换侧边栏的展开/收起状态。
 */

export function toggleSidebar() {
    const container = document.querySelector('.container');
    if (!container) return;

    // ★ 核心修改：现在它唯一的任务就是切换 class 和保存状态
    const isNowCollapsed = container.classList.toggle('sidebar-collapsed');
    localStorage.setItem('sidebarCollapsed', isNowCollapsed);
}

/**
 * 根据保存的状态，在页面加载时应用侧边栏样式。
 * @param {boolean} isCollapsed - 是否应该收起。
 */
export function applyInitialSidebarState(isCollapsed) {
    const container = document.querySelector('.container');
    if (container && isCollapsed) {
        container.classList.add('sidebar-collapsed');
    }
}

export function processPreBlocksForCopyButtons(containerElement) {
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


export function enableConversationDrag(listElement) { // ★ 接收一个元素作为参数
    if (!listElement || typeof Sortable === 'undefined') return;
    
    // 如果这个元素上已经有实例，先销毁
    if (listElement.sortableInstance) {
        listElement.sortableInstance.destroy();
    }

    // ★★★ 终极简化版 onEnd 逻辑 ★★★
    listElement.sortableInstance = Sortable.create(listElement, {
        animation: 150,
        ghostClass: 'sortable-ghost',
        chosenClass: 'sortable-chosen',
        
        onEnd: evt => {
            const { oldIndex, newIndex } = evt;
            if (oldIndex === undefined || newIndex === undefined || oldIndex === newIndex) {
                return;
            }

            // 1. 获取所有数据
            const pinned = state.conversations.filter(c => !c.archived && c.isPinned);
            const normal = state.conversations.filter(c => !c.archived && !c.isPinned);
            const archived = state.conversations.filter(c => c.archived);

            // 2. ★ 直接在 normal 数组上操作，索引是完全对应的！★
            const [movedItem] = normal.splice(oldIndex, 1);
            normal.splice(newIndex, 0, movedItem);

            // 3. 重新合并
            const newConversations = [...pinned, ...normal, ...archived];

            // 4. 更新状态并保存
            state.setConversations(newConversations);
            conversation.saveConversations();
            
            // 5. ★ 不再调用 renderConversationList()，避免重绘！★
            // SortableJS 已经帮我们更新了 DOM，我们只需要更新数据即可。
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
            // 将 moreBtn 这个按钮元素作为第一个参数传递进去
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
    document.body.classList.add('management-view-active');
    if (ui.chatArea) ui.chatArea.style.display = 'none';
    if (ui.settingsArea) ui.settingsArea.style.display = 'none';
    if (ui.presetManagementArea) ui.presetManagementArea.style.display = 'none';
    if (ui.sidebar) ui.sidebar.style.display = 'none';
    if (ui.modelManagementArea) ui.modelManagementArea.style.display = 'flex';
    renderModelManagementUI();
}

export function showPresetManagement() {
    document.body.classList.add('management-view-active');
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


// 在 ui.js 中

export function renderFilePreview() {
    // 确保 ui.filePreviewArea 存在
    if (!ui.filePreviewArea) return;

    // 清空现有的所有预览
    ui.filePreviewArea.innerHTML = '';

    // 如果有待上传的文件，则开始渲染
    if (state.uploadedFilesData?.length > 0) {
        ui.filePreviewArea.style.display = 'flex';

        // ★ 核心修改在这里的循环逻辑 ★
        state.uploadedFilesData.forEach((fileData, index) => {
            // 为每一个文件创建一个预览项的容器
            const previewItem = document.createElement('div');
            previewItem.className = 'file-preview-item-sleek';
            previewItem.title = fileData.name;

            // 根据文件类型，决定预览项的内容 (innerContent)
            let innerContent = '';
            if (fileData.type.startsWith('image/') && fileData.previewUrl) {
                // 如果是图片，内容就是 <img> 标签
                innerContent = `<img src="${fileData.previewUrl}" alt="${utils.escapeHtml(fileData.name)}" class="file-preview-image">`;
            } else {
                // 如果是其他文件，内容就是包含文件名的 <div>
                innerContent = `<div class="file-name-sleek">${utils.escapeHtml(fileData.name)}</div>`;
            }

            // 将内容和统一的删除按钮组合起来，一次性赋给 previewItem
            previewItem.innerHTML = `
                ${innerContent}
                <button type="button" class="remove-file-btn-sleek" title="移除 ${utils.escapeHtml(fileData.name)}">×</button>
            `;

            // 为删除按钮绑定事件
            previewItem.querySelector('.remove-file-btn-sleek').addEventListener('click', (e) => {
                e.stopPropagation();
                // 如果存在临时的预览URL，就释放它
                if (fileData.previewUrl) {
                    URL.revokeObjectURL(fileData.previewUrl);
                }
                // 从 state 数组中移除这个文件的数据
                state.uploadedFilesData.splice(index, 1);
                // 重新渲染整个预览区
                renderFilePreview();
            });

            // 将这个创建好的预览项添加到预览区
            ui.filePreviewArea.appendChild(previewItem);
        });
    } else {
        // 如果没有待上传的文件，则隐藏预览区
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

/**
 * 根据已配置的提供商列表，更新 API Key 设置UI。
 * @param {string[]} configuredProviders - 已配置密钥的提供商名称数组。
 */
export function updateApiKeyStatusUI(configuredProviders) {
    if (!ui.apiProviderSelect || !ui.apiKeyInput) {
        console.error("updateApiKeyStatusUI: 关键 UI 元素未找到。");
        return;
    }

    const configuredSet = new Set(
        (configuredProviders || []).map(p => p.trim().toLowerCase())
    );

    // 更新下拉菜单选项的显示
    for (const option of ui.apiProviderSelect.options) {
        const originalText = option.dataset.originalText || option.text.replace(' ✅', '');
        option.dataset.originalText = originalText;
        const optionValueLower = option.value.trim().toLowerCase();
        
        if (configuredSet.has(optionValueLower)) {
            option.textContent = `${originalText} ✅`;
        } else {
            option.textContent = originalText;
        }
    }

    // 定义一个函数，用于根据当前选中的提供商更新输入框
    const updateInputState = () => {
        const selectedProviderLower = ui.apiProviderSelect.value.trim().toLowerCase();
        if (configuredSet.has(selectedProviderLower)) {
            // 如果已配置，清空输入框并显示占位符
            ui.apiKeyInput.value = '';
            ui.apiKeyInput.placeholder = '•••••••••••••••• (已配置，留空以保留)';
        } else {
            // 如果未配置，显示正常提示
            ui.apiKeyInput.placeholder = '粘贴您的 API Key';
        }
    };
    
    // 立即更新一次
    updateInputState();

    // 绑定 change 事件，以便在用户切换选项时也更新
    ui.apiProviderSelect.removeEventListener('change', updateInputState); // 防止重复绑定
    ui.apiProviderSelect.addEventListener('change', updateInputState);
}


/**
 * 切换系统指令编辑区的显示和隐藏。
 * 如果指令存在，则显示它；如果不存在，则进入编辑模式。
 * 如果已在编辑模式，则保存或取消。
 */
export function toggleSystemPromptEditor() {
    if (!ui.messagesContainer) return;

    let systemDiv = ui.messagesContainer.querySelector('.system-prompt-display');
    const conv = state.getCurrentConversation();
    if (!conv) return;

    const systemMessage = conv.messages.find(m => m.role === 'system');
    const currentPrompt = systemMessage?.content || '';

    // 如果编辑区已存在，则不做任何事 (或可以考虑让它获取焦点)
    if (systemDiv && systemDiv.classList.contains('is-editing')) {
        const textarea = systemDiv.querySelector('textarea');
        if (textarea) textarea.focus();
        return;
    }

    // 如果显示区已存在，则进入编辑模式
    if (systemDiv) {
        enterEditMode(systemDiv, currentPrompt);
        return;
    }

    // 如果什么都没有，则创建一个新的编辑区
    const newSystemDiv = createSystemPromptElement(currentPrompt, true); // 直接进入编辑模式
    ui.messagesContainer.insertBefore(newSystemDiv, ui.messagesContainer.firstChild);
    const textarea = newSystemDiv.querySelector('textarea');
    if(textarea) textarea.focus();
}

/**
 * 创建系统指令的 DOM 元素 (可以是显示模式或编辑模式)
 * @param {string} content - 指令内容
 * @param {boolean} startInEditMode - 是否直接进入编辑模式
 * @returns {HTMLElement} 创建好的 div 元素
 */
function createSystemPromptElement(content, startInEditMode = false) {
    const systemDiv = document.createElement('div');
    systemDiv.className = 'system-prompt-display';

    if (startInEditMode) {
        enterEditMode(systemDiv, content);
    } else if (content) {
        systemDiv.innerHTML = `
            <div class="system-prompt-content-wrapper">
                <strong>系统指令:</strong>
                <div class="system-prompt-content">${utils.escapeHtml(content).replace(/\n/g, '<br>')}</div>
            </div>`;
    }

    // 始终为整个 div 添加点击事件，以便从显示模式进入编辑模式
    systemDiv.addEventListener('click', (e) => {
        if (!systemDiv.classList.contains('is-editing')) {
            e.stopPropagation();
            enterEditMode(systemDiv, content);
        }
    });

    return systemDiv;
}

/**
 * 将一个 system-prompt-display 元素转换为编辑模式
 * @param {HTMLElement} systemDiv - 目标 div
 * @param {string} currentContent - 当前的指令内容
 */
function enterEditMode(systemDiv, currentContent) {
    systemDiv.classList.add('is-editing');
    systemDiv.innerHTML = `
        <div class="system-prompt-editor">
            <textarea rows="4" placeholder="在此输入系统指令...">${currentContent}</textarea>
            <div class="editor-actions">
                <button type="button" class="action-btn secondary cancel-btn">取消</button>
                <button type="button" class="action-btn save-btn">保存</button>
            </div>
        </div>`;

    const textarea = systemDiv.querySelector('textarea');
    const saveBtn = systemDiv.querySelector('.save-btn');
    const cancelBtn = systemDiv.querySelector('.cancel-btn');

    const exitEditMode = (shouldSave) => {
        if (shouldSave) {
            const newPrompt = textarea.value.trim();
            conversation.setSystemPrompt(newPrompt); // 调用 conversation 模块更新数据
        }
        // 无论保存还是取消，都重新渲染整个对话UI以反映最新状态
        const currentConv = state.getCurrentConversation();
        if (currentConv) {
            loadAndRenderConversationUI(currentConv);
        }
    };

    saveBtn.onclick = (e) => { e.stopPropagation(); exitEditMode(true); };
    cancelBtn.onclick = (e) => { e.stopPropagation(); exitEditMode(false); };
    textarea.onclick = (e) => e.stopPropagation(); // 防止点击文本框时触发父元素的点击事件
    if (textarea) textarea.focus();
}

/**
 * 在加载对话时，渲染系统指令（如果存在）
 */
export function renderSystemPromptDisplay(content) {
    if (!ui.messagesContainer) return;
    
    const oldDiv = ui.messagesContainer.querySelector('.system-prompt-display');
    if (oldDiv) oldDiv.remove();

    if (content) {
        const systemDiv = createSystemPromptElement(content, false);
        ui.messagesContainer.insertBefore(systemDiv, ui.messagesContainer.firstChild);
    }
}


/**
 * 创建并向聊天区域追加一条新消息的 DOM 元素。
 * (最终整合版，支持附件、思考过程、分支指示器和元信息)
 * @param {'user' | 'assistant' | 'model'} role - 消息的角色。
 * @param {object|string} messageContent - 消息内容，可以是字符串或包含 text 和 files 的对象。
 * @param {string} modelForNote - 用于显示在元信息中的模型名称。
 * @param {string} reasoningText - AI 的思考过程文本。
 * @param {string} conversationId - 消息所属的对话ID。
 * @param {number} messageIndex - 消息在对话 messages 数组中的索引 (-1 表示临时消息)。
 * @param {object} usage - Token 使用情况对象。
 * @returns {HTMLElement|null} 创建的消息包装器元素，或在失败时返回 null。
 */
export function appendMessage(role, messageContent, modelForNote, reasoningText, conversationId, messageIndex, usage) {
    if (!ui.messagesContainer) return null;
    if (ui.emptyChatPlaceholder) ui.emptyChatPlaceholder.style.display = 'none';

    // 1. 创建最外层的包装器
    const messageWrapperDiv = document.createElement('div');
    messageWrapperDiv.className = `message-wrapper ${role === 'user' ? 'user-message-wrapper' : 'assistant-message-wrapper'}`;
    messageWrapperDiv.dataset.conversationId = conversationId;
    messageWrapperDiv.dataset.messageIndex = messageIndex;

    // 2. 创建消息气泡本身
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role === 'assistant' || role === 'model' ? 'assistant' : 'user'}`;
    let reasoningDivElement = null;

    // 3. 处理用户消息的附件 (如果存在)
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

    // 4. 处理 AI 思考过程 (如果存在)
    if ((role === 'assistant' || role === 'model') && reasoningText?.trim()) {
        const reasoningBlockDiv = document.createElement('div');
        reasoningBlockDiv.className = 'reasoning-block';
        reasoningBlockDiv.style.display = reasoningText?.trim() ? 'block' : 'none'; 
        reasoningBlockDiv.innerHTML = `<div class="reasoning-label"><span>思考过程:</span><button type="button" class="copy-reasoning-btn">复制</button></div><div class="reasoning-content"></div>`;
        const reasoningContentElement = reasoningBlockDiv.querySelector('.reasoning-content');
        reasoningContentElement.textContent = reasoningText;
        reasoningBlockDiv.querySelector('.copy-reasoning-btn').addEventListener('click', e => {
            e.stopPropagation();
            navigator.clipboard.writeText(reasoningText).then(() => {
                e.target.textContent = '已复制!';
                setTimeout(() => { e.target.textContent = '复制'; }, 2000);
            });
        });
        messageDiv.appendChild(reasoningBlockDiv);
    }
    
    // 5. 处理核心消息内容 (Markdown)
    const contentDiv = document.createElement('div');
    contentDiv.className = 'text';
    const markdownContainer = document.createElement('span');
    markdownContainer.className = 'markdown-content';
    
    let finalMarkdown = "";
    if (typeof messageContent === 'string') {
        finalMarkdown = messageContent;
    } else if (messageContent?.text !== undefined) {
        finalMarkdown = messageContent.text || "";
    }
    
    if (finalMarkdown.trim()) {
        markdownContainer.innerHTML = marked.parse(finalMarkdown);
        utils.pruneEmptyNodes(markdownContainer);
        contentDiv.appendChild(markdownContainer);
        messageDiv.appendChild(contentDiv);
        processPreBlocksForCopyButtons(contentDiv);
    }
    messageWrapperDiv.contentSpan = markdownContainer; // 暴露给流式更新

    // 6. ★★★ 统一处理所有元信息 (Meta Info) ★★★
    if (role === 'assistant' || role === 'model') {
        const metaInfoDiv = document.createElement('div');
        metaInfoDiv.className = 'message-meta-info';
        let hasMetaContent = false;

        // 6a. 分支指示器
        if (messageIndex !== -1) {
            const currentConv = state.getCurrentConversation();
            const message = currentConv?.messages[messageIndex];
            if (message && message.parentId) {
                const children = conversation.findChildrenOf(currentConv, message.parentId);
                 if (children.length > 1) {
            const currentIndex = children.findIndex(child => child.id === message.id);
            const branchIndicator = document.createElement('div');
            branchIndicator.className = 'branch-indicator';
            
            // 创建按钮
            const prevBtn = document.createElement('button');
            prevBtn.className = 'branch-nav-btn prev-branch';
            prevBtn.title = '上一个回复';
            prevBtn.innerHTML = '<';
            prevBtn.disabled = (currentIndex === 0);

            const nextBtn = document.createElement('button');
            nextBtn.className = 'branch-nav-btn next-branch';
            nextBtn.title = '下一个回复';
            nextBtn.innerHTML = '>';
            nextBtn.disabled = (currentIndex >= children.length - 1);

            const countSpan = document.createElement('span');
            countSpan.textContent = `${currentIndex + 1} / ${children.length}`;

            // ★★★ 核心：为按钮绑定点击事件 ★★★
            prevBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                // 找到上一个兄弟消息并切换
                const prevMessage = children[currentIndex - 1];
                if (prevMessage) {
                    document.dispatchEvent(new CustomEvent('switchBranchRequest', { detail: { messageId: prevMessage.id } }));
                }
            });

            nextBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                // 找到下一个兄弟消息并切换
                const nextMessage = children[currentIndex + 1];
                if (nextMessage) {
                    document.dispatchEvent(new CustomEvent('switchBranchRequest', { detail: { messageId: nextMessage.id } }));
                }
            });

            // 组装指示器
            branchIndicator.appendChild(prevBtn);
            branchIndicator.appendChild(countSpan);
            branchIndicator.appendChild(nextBtn);
            
            metaInfoDiv.appendChild(branchIndicator);
            hasMetaContent = true;
        }
            }
        }

        // 6b. 模型名称
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
            hasMetaContent = true;
        }

        // 6c. Token 计数
        const tokenNote = document.createElement('span');
        tokenNote.className = 'token-count-note';
        messageWrapperDiv.usageElement = tokenNote; // 暴露给流式更新
        if (usage) {
            const p = usage.prompt_tokens ?? usage.input_tokens ?? 'N/A';
            const c = usage.completion_tokens ?? usage.output_tokens ?? 'N/A';
            tokenNote.textContent = `提示: ${p} tokens, 回复: ${c} tokens`;
            metaInfoDiv.appendChild(tokenNote); // ★ 只有在有 usage 时才添加
            hasMetaContent = true;
        }

        // 只有在 meta-info 容器里有实际内容时，才把它添加到 DOM
        if (hasMetaContent) {
            messageDiv.appendChild(metaInfoDiv);
        }
    }

    // 7. 创建并添加操作按钮容器
    const actionsContainer = document.createElement('div');
    actionsContainer.className = 'message-actions-container';
    
    // 7a. 复制按钮 (所有消息都有)
    const copyMessageBtn = document.createElement('button');
    copyMessageBtn.className = 'message-action-btn copy-message-btn';
    copyMessageBtn.title = '复制消息内容';
    copyMessageBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-copy" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M4 2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zm2-1a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1zM2 5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1h1v1a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1v1z"/></svg>`;
    copyMessageBtn.addEventListener('click', () => { navigator.clipboard.writeText(finalMarkdown.trim()).then(() => utils.showToast('消息内容已复制', 'success')); });
    actionsContainer.appendChild(copyMessageBtn);

     // 7b. ★ 核心修改：根据角色渲染不同的按钮 ★
    if (role === 'user') {
        // --- 用户的按钮 (简洁版：复制、编辑、删除) ---
        // (复制按钮已在最上面统一添加)
        
        const editBtn = document.createElement('button');
        editBtn.className = 'message-action-btn edit-message-btn';
        editBtn.title = '以此为基础编辑';
        editBtn.dataset.action = 'edit';
        editBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-pencil-square" viewBox="0 0 16 16"><path d="M15.502 1.94a.5.5 0 0 1 0 .706L14.459 3.69l-2-2L13.502.646a.5.5 0 0 1 .707 0l1.293 1.293zm-1.75 2.456-2-2L4.939 9.21a.5.5 0 0 0-.121.196l-.805 2.414a.25.25 0 0 0 .316.316l2.414-.805a.5.5 0 0 0 .196-.12l6.813-6.814z"/><path fill-rule="evenodd" d="M1 13.5A1.5 1.5 0 0 0 2.5 15h11a1.5 1.5 0 0 0 1.5-1.5v-6a.5.5 0 0 0-1 0v6a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5v-11a.5.5 0 0 1 .5-.5h6a.5.5 0 0 0 0-1h-6A1.5 1.5 0 0 0 1 2.5z"/></svg>`;
        actionsContainer.appendChild(editBtn);
        
        const deleteMsgBtn = document.createElement('button');
        deleteMsgBtn.className = 'message-action-btn delete-message-btn';
        deleteMsgBtn.title = '删除此消息及后续';
        deleteMsgBtn.dataset.action = 'delete_branch'; 
        deleteMsgBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-trash3" viewBox="0 0 16 16"><path d="M6.5 1h3a.5.5 0 0 1 .5.5v1H6v-1a.5.5 0 0 1 .5-.5M11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3A1.5 1.5 0 0 0 5 1.5v1H1.5a.5.5 0 0 0 0 1h.538l.853 10.66A2 2 0 0 0 4.885 16h6.23a2 2 0 0 0 1.994-1.84l.853-10.66h.538a.5.5 0 0 0 0-1zm-9.955 1H14.5a.5.5 0 0 1 0 1H1.455a.5.5 0 0 1 0-1Z"/></svg>`;
        actionsContainer.appendChild(deleteMsgBtn);

    } else if (role === 'assistant' || role === 'model') {
        const regenerateBtn = document.createElement('button');
        regenerateBtn.className = 'message-action-btn regenerate-btn';
        regenerateBtn.title = '从这里重新生成';
        regenerateBtn.dataset.action = 'regenerate';
        regenerateBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-arrow-repeat" viewBox="0 0 16 16"><path d="M11.534 7h3.932a.25.25 0 0 1 .192.41l-1.966 2.36a.25.25 0 0 1-.384 0l-1.966-2.36a.25.25 0 0 1 .192-.41zm-11 2h3.932a.25.25 0 0 0 .192-.41L2.692 6.23a.25.25 0 0 0-.384 0L.342 8.59A.25.25 0 0 0 .534 9z"/><path fill-rule="evenodd" d="M8 3c-1.552 0-2.94.707-3.857 1.818a.5.5 0 1 1-.771-.636A6.002 6.002 0 0 1 13.917 7H12.5A5.002 5.002 0 0 0 8 3M3.5 13A5.002 5.002 0 0 0 8 15c1.552 0 2.94-.707 3.857-1.818a.5.5 0 1 1 .771.636A6.002 6.002 0 0 1 2.083 9H3.5A5.002 5.002 0 0 0 8 15"/></svg>`;
        actionsContainer.appendChild(regenerateBtn);

        const deleteSingleBtn = document.createElement('button');
        deleteSingleBtn.className = 'message-action-btn delete-message-btn';
        deleteSingleBtn.title = '删除此消息';
        deleteSingleBtn.dataset.action = 'delete_single';
        deleteSingleBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-trash3" viewBox="0 0 16 16"><path d="M6.5 1h3a.5.5 0 0 1 .5.5v1H6v-1a.5.5 0 0 1 .5-.5M11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3A1.5 1.5 0 0 0 5 1.5v1H1.5a.5.5 0 0 0 0 1h.538l.853 10.66A2 2 0 0 0 4.885 16h6.23a2 2 0 0 0 1.994-1.84l.853-10.66h.538a.5.5 0 0 0 0-1zm-9.955 1H14.5a.5.5 0 0 1 0 1H1.455a.5.5 0 0 1 0-1Z"/></svg>`;
        actionsContainer.appendChild(deleteSingleBtn);

        const deleteBranchBtn = document.createElement('button');
        deleteBranchBtn.className = 'message-action-btn delete-branch-btn';
        deleteBranchBtn.title = '删除此分支';
        deleteBranchBtn.dataset.action = 'delete_branch';
        deleteBranchBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-scissors" viewBox="0 0 16 16"><path d="M3.5 3.5c-.614-.884-.074-1.962.858-2.5L8 7.226 11.642 1c.932.538 1.472 1.616.858 2.5L8.81 8.61l1.556 2.661a2.5 2.5 0 1 1-.794.637L8 9.73l-1.572 2.177a2.5 2.5 0 1 1-.794-.637L7.19 8.61zM2 4.5A1.5 1.5 0 0 1 3.5 3h1A1.5 1.5 0 0 1 6 4.5v1A1.5 1.5 0 0 1 4.5 7h-1A1.5 1.5 0 0 1 2 5.5zm12 0A1.5 1.5 0 0 1 15.5 3h1A1.5 1.5 0 0 1 18 4.5v1A1.5 1.5 0 0 1 16.5 7h-1A1.5 1.5 0 0 1 14 5.5z"/></svg>`;
        actionsContainer.appendChild(deleteBranchBtn);
    }

    // 8. 最终组装并添加到页面
    messageWrapperDiv.appendChild(messageDiv);
    messageWrapperDiv.appendChild(actionsContainer);
    ui.messagesContainer.appendChild(messageWrapperDiv);
    
    // 9. 后续处理
    ui.messagesContainer.scrollTop = ui.messagesContainer.scrollHeight;
    if (window.MathJax?.typesetPromise) {
        const elementsToTypeset = [contentDiv];
        if (reasoningDivElement?.textContent.trim()) elementsToTypeset.push(reasoningDivElement);
        if (elementsToTypeset.length > 0) window.MathJax.typesetPromise(elementsToTypeset).catch(err => console.error("MathJax typesetting failed:", err));
    }
    return messageWrapperDiv;
}




export function processStreamChunk(tempMsgElement, replyDelta, reasoningDelta, usageData) {
    if (!tempMsgElement) return;
    
    // --- 处理回复文本 ---
    const markdownContentSpan = tempMsgElement.contentSpan;
    if (replyDelta && markdownContentSpan) {
        let accumulatedRawMarkdown = markdownContentSpan.dataset.rawMarkdown || "";
        accumulatedRawMarkdown += replyDelta;
        markdownContentSpan.dataset.rawMarkdown = accumulatedRawMarkdown;
        markdownContentSpan.innerHTML = marked.parse(accumulatedRawMarkdown);
        processPreBlocksForCopyButtons(markdownContentSpan);
    }
    
    // --- ★ 核心修复：处理思考过程文本 ---
    const reasoningContentEl = tempMsgElement.querySelector('.reasoning-content');
    if (reasoningDelta && reasoningContentEl) {
        // 直接将增量字符追加到 textContent
        reasoningContentEl.textContent += reasoningDelta;
        
        // 如果思考块之前是隐藏的，现在让它显示出来
        const reasoningBlockEl = tempMsgElement.querySelector('.reasoning-block');
        if (reasoningBlockEl && reasoningBlockEl.style.display === 'none') {
            reasoningBlockEl.style.display = 'block';
        }
    }

    // --- 处理 Token 使用情况 ---
    if (tempMsgElement.usageElement && usageData) {
        const p = usageData.prompt_tokens ?? usageData.input_tokens ?? '...';
        const c = usageData.completion_tokens ?? usageData.output_tokens ?? '...';
        tempMsgElement.usageElement.textContent = `提示: ${p} tokens, 回复: ${c} tokens`;
    }
    
    // 自动滚动
    if (ui.messagesContainer) {
        const dist = ui.messagesContainer.scrollHeight - ui.messagesContainer.clientHeight - ui.messagesContainer.scrollTop;
        if (dist < 200) {
            requestAnimationFrame(() => { ui.messagesContainer.scrollTop = ui.messagesContainer.scrollHeight; });
        }
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

/**
 * 渲染侧边栏的对话列表。
 * (最终重构版，支持置顶和拖拽排序)
 * @param {string} [searchTerm=''] - 用于过滤对话的搜索词。
 */
export function renderConversationList(searchTerm = '') {
    if (!ui.conversationList) return;

    // 1. 保存归档列表的展开状态
    const isArchivePreviouslyExpanded = ui.conversationList.querySelector('.archive-toggle.expanded') !== null;
    
    // 2. 清空整个列表容器
    ui.conversationList.innerHTML = '';

    // 3. 获取并过滤数据
    let conversationsToProcess = [...state.conversations];
    if (searchTerm.trim()) {
        const lowerCaseSearchTerm = searchTerm.toLowerCase().trim();
        conversationsToProcess = conversationsToProcess.filter(c => 
            c.title.toLowerCase().includes(lowerCaseSearchTerm)
        );
    }

    // 4. 将数据清晰地分为三组：置顶、普通、已归档
    const pinned = conversationsToProcess.filter(c => !c.archived && c.isPinned);
    const normal = conversationsToProcess.filter(c => !c.archived && !c.isPinned);
    const archived = conversationsToProcess.filter(c => c.archived);

    // 5. 渲染不可拖拽的“置顶”部分
    pinned.forEach(conv => {
        const listItem = createConversationListItem(conv);
        // 明确给置顶项添加 'pinned' 类，以便 CSS 和 SortableJS 的 filter 生效
        listItem.classList.add('pinned'); 
        ui.conversationList.appendChild(listItem);
    });

    // 6. ★ 核心：为可拖拽的“普通”对话创建一个专门的容器 ★
    const draggableList = document.createElement('ul');
    draggableList.id = 'draggable-conversation-list'; // 给它一个唯一的ID
    draggableList.className = 'conv-nav';             // 复用现有的 ul 样式
    normal.forEach(conv => {
        const listItem = createConversationListItem(conv);
        draggableList.appendChild(listItem);
    });
    // 将这个只包含可拖拽项的列表容器添加到主列表中
    ui.conversationList.appendChild(draggableList);

    // 7. ★ 核心：只对这个专门的容器激活拖拽功能 ★
    enableConversationDrag(draggableList);

    // 8. 渲染不可拖拽的“已归档”部分
    if (archived.length > 0) {
        const toggle = document.createElement('li');
        toggle.className = 'archive-toggle';
        toggle.textContent = `已归档 (${archived.length})`;
        if (isArchivePreviouslyExpanded) {
            toggle.classList.add('expanded');
        }
        toggle.addEventListener('click', () => {
            toggle.classList.toggle('expanded');
            const subListElement = toggle.nextElementSibling;
            if (subListElement) {
                subListElement.style.display = toggle.classList.contains('expanded') ? 'block' : 'none';
            }
        });
        ui.conversationList.appendChild(toggle);

        const subList = document.createElement('ul');
        subList.className = 'archived-list';
        subList.style.display = isArchivePreviouslyExpanded ? 'block' : 'none';
        archived.forEach(conv => {
            const listItem = createConversationListItem(conv, true);
            subList.appendChild(listItem);
        });
        ui.conversationList.appendChild(subList);
    }
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

    // ★ 核心修复 1：为“置顶”操作添加 UI 刷新
    createMenuItem(pinSVG, isPinned ? '取消置顶' : '置顶对话', () => {
        conversation.togglePin(convId);
        renderConversationList(); // <-- 立即刷新列表！
    });

    // ★ 核心修复 2：为“重命名”操作添加 UI 刷新
    createMenuItem(renameSVG, '重命名', () => {
        const newTitle = prompt('输入新的对话标题：', convTitle);
        if (newTitle && newTitle.trim()) {
            const trimmedTitle = newTitle.trim();
            conversation.renameConversationTitle(convId, trimmedTitle);
            renderConversationList(); // <-- 立即刷新列表！
            if (convId === state.currentConversationId) {
                updateChatTitle(trimmedTitle);
            }
        }
    });

    const divider = document.createElement('div');
    divider.className = 'dropdown-divider';
    ui.globalActionsMenu.appendChild(divider);

    // “删除”操作已经会通过事件触发 loadConversationFlow，它内部会刷新UI，所以无需改动
    createMenuItem(deleteSVG, '删除对话', () => {
        if (confirm(`确定要删除对话「${convTitle}」吗？此操作无法恢复。`)) {
            const result = conversation.deleteConversation(convId);
            if (result.nextIdToLoad) {
                const id = (result.nextIdToLoad === 'new') ? conversation.createNewConversation().id : result.nextIdToLoad;
                document.dispatchEvent(new CustomEvent('loadConversationRequest', { detail: { conversationId: id } }));
            } else {
                renderConversationList(); // 如果删除的不是当前对话，也需要刷新列表
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


// js/ui.js

export function loadAndRenderConversationUI(convToLoad) {
    if (!convToLoad) return;
    
    // --- 1. 更新头部 UI (不变) ---
    updateChatTitle(convToLoad.title);
    if (ui.archiveCurrentBtn) ui.archiveCurrentBtn.textContent = convToLoad.archived ? '取消归档' : '归档';
    if (ui.modelSelect) ui.modelSelect.value = convToLoad.model;
    showChatArea();

    if (!ui.messagesContainer) return;

    // --- 2. 清空并准备渲染 ---
    ui.messagesContainer.innerHTML = '';
    
    // ★★★ 核心修复：不再直接使用 convToLoad.messages ★★★
    // 而是调用函数获取当前活动分支的线性历史记录
    const messagesToRender = conversation.getCurrentBranchMessages(convToLoad);

    // 3. 渲染系统指令 (如果分支历史中包含它)
    const systemMessage = messagesToRender.find(m => m.role === 'system');
    if (systemMessage) {
        renderSystemPromptDisplay(systemMessage.content);
    }

    // 4. 渲染用户和助手消息
    let renderedMessageCount = 0;
    if (messagesToRender.length > 0) {
        messagesToRender.forEach((msg, index) => {
            // 跳过 system 角色，因为它已被单独处理
            if (msg.role === 'system') return; 
            
            // ★ 关键：我们需要原始消息在“大数组”中的索引来正确处理分支
            const originalIndex = convToLoad.messages.findIndex(m => m.id === msg.id);

            const messageElement = appendMessage(
                msg.role, 
                msg.content, 
                msg.model || convToLoad.model, 
                msg.reasoning_content, 
                convToLoad.id, 
                originalIndex, // ★ 使用原始索引
                msg.usage
            );
            if (messageElement) renderedMessageCount++;
        });
    }

    // 5. 根据渲染结果更新占位符
    if (ui.emptyChatPlaceholder) {
        const hasVisibleContent = renderedMessageCount > 0 || (systemMessage && systemMessage.content);
        ui.emptyChatPlaceholder.style.display = hasVisibleContent ? 'none' : 'flex';
    }

    // 6. 更新其他 UI 状态
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
    if (!ui.presetPromptsUl) {
        console.error("populatePresetPromptsList: ui.presetPromptsUl is not found.");
        return;
    }
    
    const visiblePresets = state.loadedPresetPrompts.filter(p => !p.isHidden);
    
    ui.presetPromptsUl.innerHTML = ''; // 清空旧列表

    if (visiblePresets.length === 0) {
        ui.presetPromptsUl.innerHTML = '<li>没有可用的预设。</li>';
        return;
    }

    visiblePresets.forEach(preset => {
        const li = document.createElement('li');
        li.className = 'preset-prompt-item';
        li.textContent = preset.name;
        if (preset.description) {
            li.title = preset.description;
        }

        // ★★★ 核心修复：在这里根据模板类型执行不同操作 ★★★
        li.addEventListener('click', (event) => { // ★ 添加 event 参数
            if (preset.type === 'user_input') {
                if (ui.promptInput) {
                    ui.promptInput.value = preset.prompt;
                    autoResizePromptInput();
                    ui.promptInput.focus();
                    utils.showToast(`模板 "${preset.name}" 已填充到输入框`, 'success');
                }
            } else if (preset.type === 'system_prompt') {
                // ★★★ 核心修复：阻止事件进一步传播 ★★★
                event.stopPropagation(); 

                const result = conversation.applyPresetPrompt(preset);
                if (result?.needsUiUpdate) {
                    const currentConv = state.getCurrentConversation();
                    if (currentConv) {
                        loadAndRenderConversationUI(currentConv);
                    }
                }
            }
            
            // 无论哪种情况，点击后都关闭面板
            closePresetPromptsPanel();
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
/**
 * 将指定消息元素替换为加载指示器。
 * @param {HTMLElement} messageWrapperElement - 目标消息的 .message-wrapper 元素。
 * @returns {void}
 */
export function replaceMessageWithLoading(messageWrapperElement) {
    if (!messageWrapperElement) return;

    // 清空包装器的所有内容
    messageWrapperElement.innerHTML = '';
    
    // 创建并添加加载器
    const loader = document.createElement('div');
    loader.className = 'loading-indicator-bubble inline-loading-indicator';
    loader.innerHTML = '<span>正在重新生成…</span>';
    
    // 将加载器添加到（现在是空的）包装器中
    messageWrapperElement.appendChild(loader);
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

/**
 * 显示导出选项的下拉菜单。
 * @param {HTMLElement} targetButton - 触发菜单的按钮元素。
 */
export function showExportOptionsMenu(targetButton) {
    // 复用已有的全局操作菜单
    const menu = ui.globalActionsMenu;
    if (!menu) return;

    menu.innerHTML = ''; // 清空旧菜单项

    const createMenuItem = (text, format) => {
        const button = document.createElement('button');
        button.className = 'dropdown-item';
        button.textContent = text;
        button.onclick = (e) => {
            e.stopPropagation();
            if (state.currentConversationId) {
                conversation.exportSingleConversation(state.currentConversationId, format);
            } else {
                utils.showToast('没有活动的对话可导出', 'warning');
            }
            menu.classList.remove('show');
        };
        menu.appendChild(button);
    };

    // 创建菜单项
    createMenuItem('导出为 Markdown (.md)', 'md');
    createMenuItem('导出为 JSON (.json)', 'json');

    // 定位并显示菜单
    const rect = targetButton.getBoundingClientRect();
    menu.style.top = `${rect.bottom + window.scrollY + 6}px`;
    // 让菜单左对齐
    menu.style.left = `${rect.left + window.scrollX}px`; 
    menu.classList.add('show');

    // 点击菜单外部时关闭菜单
    const closeMenu = (e) => {
        if (!menu.contains(e.target)) {
            menu.classList.remove('show');
            document.removeEventListener('click', closeMenu, true);
        }
    };
    // 使用捕获阶段的事件监听，确保能先于其他点击事件执行
    setTimeout(() => { document.addEventListener('click', closeMenu, true); }, 0);
}


