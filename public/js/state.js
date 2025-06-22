// ========================================================================
// 1. 应用核心状态 (Pure Data)
//    这些是应用运行的核心数据，不包含任何DOM元素引用。
// ========================================================================

// --- 对话数据 ---
export let conversations = [];
export let currentConversationId = null;

// --- 请求与响应状态 ---
export let isGeneratingResponse = false;
export let currentAbortController = null;

// --- 文件上传数据 ---
export let uploadedFilesData = [];

// --- 从JSON文件加载的配置 ---
export let modelConfigData = null;       // 原始模型配置
export let editableModelConfig = null;   // 可编辑的模型配置
export let loadedPresetPrompts = [];     // 预设模板

// --- 用户设置 (会被保存到LocalStorage) ---
export let isStreamingEnabled = true;
export let isManualThinkModeEnabled = false;
export let isAutoThinkModeEnabled = false;
export let currentMaxTokens = null;


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


// ========================================================================
// 3. 状态操作函数 (State-Modifying Functions & Getters)
//    提供安全、统一的方式来读取和修改状态。
// ========================================================================

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
