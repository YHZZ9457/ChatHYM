// --- START OF FILE js/api.js (Corrected) ---

// ========================================================================
// 1. 模块导入
//    导入状态管理、通用工具和消息映射器。
// ========================================================================
import * as state from './state.js';
import * as utils from './utils.js';
// 从新文件中导入映射函数
import { mapMessagesForGemini, mapMessagesForStandardOrClaude } from './message_mappers.js'; 


// ========================================================================
// 2. API 交互函数
// ========================================================================

const thinkingParamConfig = {
    // 关键词 -> 参数生成函数
    'qwen3': (isManual, isAuto) => {
        if (isAuto) return {}; // Qwen 在自动模式下由模型自行决定，不加参数
        return {
            extra_body: {
                chat_template_kwargs: {
                    enable_thinking: isManual
                }
            }
        };
    },
    'doubao': (isManual, isAuto) => {
        if (isAuto) return { thinking_mode: 'auto' };
        return { thinking_mode: isManual ? 'enabled' : 'disabled' };
    },
    'gemini-1.': (isManual, isAuto) => { // 匹配 Gemini 1.0 和 1.5
        if (isAuto) return {}; // Gemini 1.x 在自动模式下不特殊处理
        return { includeThoughts: isManual };
    },
    'gemini-2.5': (isManual, isAuto) => { // 匹配 Gemini 2.0 及以上
        if (isAuto) return {}; // 假设自动模式下不开启
        // Gemini 2.5 使用 thinking_budget
        return { thinking_budget: isManual ? 8192 : 0 }; // 开启时给一个预算，关闭时为0
    },
    'claude': (isManual, isAuto) => {
        if (isAuto) return {}; // Claude 没有 auto 模式
        return {
            thinking: {
                type: isManual ? 'enabled' : 'disabled'
            }
        };
    }
};


/**
 * 发送消息到后端 API。
 * @param {Array} messagesHistory - 经过过滤的、要发送给API的线性消息历史（不包含兄弟分支）。
 * @param {function} onStreamChunk - 处理流式数据块的回调函数 (现在它将接收增量的reply和reasoning)。
 * @param {AbortSignal} signal - AbortSignal 对象，用于中止请求。
 * @returns {Promise<object>} 一个 Promise，解析为一个包含最终结果的对象。
 */
export async function send(messagesHistory, onStreamChunk, signal) { 
    let apiUrl;
    const headers = { 'Content-Type': 'application/json' };
    let bodyPayload = {};
    let response;
    let accumulatedAssistantReply = "";     // 累积所有回复内容（包括嵌入式思考标签），用于最终返回
    let accumulatedThinkingForDisplay = ""; // 累积来自独立 reasoning 字段的思考过程，用于最终返回
    let usageData = null;

    const conversation = state.getCurrentConversation(); // 用于获取模型信息等
    let effectiveModelString = conversation?.model;
    if (!effectiveModelString || typeof effectiveModelString !== 'string' || effectiveModelString.trim() === '') {
        effectiveModelString = 'default::default-model'; 
        console.warn(`[API Send] Conversation model is invalid or missing. Using default: ${effectiveModelString}`);
    }

    const fullModelString = effectiveModelString.includes('::') ? effectiveModelString : `unknown::${effectiveModelString}`;
    const [providerToUse, modelNameForAPI] = fullModelString.split('::');
    const providerLower = providerToUse.toLowerCase();
    
    if (!conversation) {
        return { success: false, reply: "致命错误：找不到当前对话。", aborted: false };
    }
    
    const providerConfig = state.getProviderConfig(providerLower);

    if (!providerConfig) {
        const errorMessage = `服务器配置错误：找不到提供商 '${providerToUse}' 的配置。请检查 public/configs/providers.json 文件。`;
        console.error(`[API Send] ${errorMessage}`);
        return { success: false, reply: errorMessage, aborted: false };
    }

    try {
        const shouldUseStreaming = providerConfig.streamSupport && state.isStreamingEnabled;

        bodyPayload = {
            model: fullModelString, 
            stream: shouldUseStreaming,
        };
        
        const modelNameLower = modelNameForAPI.toLowerCase();
        
        if (!modelNameLower.includes('o4-mini') && !modelNameLower.includes('o3')) {
            bodyPayload.temperature = parseFloat(localStorage.getItem('model-temperature')) || 0.7;
        }

        if (state.currentMaxTokens) {
            if (modelNameLower.includes('o4-mini') || modelNameLower.includes('o3')) {
                bodyPayload.max_completion_tokens = state.currentMaxTokens;
            } else {
                bodyPayload.max_tokens = state.currentMaxTokens;
            }
        }

        // ★★★ 核心逻辑：根据模型和开关状态，动态添加思考参数 ★★★
        const isManualThinkEnabled = state.isManualThinkModeEnabled;
        const isAutoThinkEnabled = state.isAutoThinkModeEnabled;

        for (const keyword in thinkingParamConfig) {
            if (modelNameLower.includes(keyword)) {
                const paramGenerator = thinkingParamConfig[keyword];
                const thinkingParams = paramGenerator(isManualThinkEnabled, isAutoThinkEnabled);
                
                // 将生成的参数合并到 bodyPayload 中
                Object.assign(bodyPayload, thinkingParams);
                
                // 匹配成功后即可退出循环，避免重复匹配 (例如 'gemini-1.' 和 'gemini-2.')
                break; 
            }
        }
                let forceSimpleContentForQwen = false;
        if (modelNameLower.includes('qwen')) {
            // 只要是 Qwen 模型，并且我们尝试控制思考（无论开关是true还是false），
            // 都应该使用纯文本格式以确保开关生效。
            forceSimpleContentForQwen = true;
        }
    
        switch (providerConfig.mapperType) {
            case 'gemini':
                bodyPayload.contents = mapMessagesForGemini(messagesHistory);
                delete bodyPayload.messages; 
                break;

            case 'anthropic':
                bodyPayload.messages = mapMessagesForStandardOrClaude(messagesHistory, providerLower);
                const sysMsgAnthropic = messagesHistory.find(m => m.role === 'system');
                if (sysMsgAnthropic?.content) { bodyPayload.system = sysMsgAnthropic.content; }
                if (!bodyPayload.max_tokens) { bodyPayload.max_tokens = 4096; }
                break;

            case 'ollama':
                bodyPayload.messages = mapMessagesForStandardOrClaude(messagesHistory, providerLower);
                const ollamaSysMsg = messagesHistory.find(m => m.role === 'system');
                if (ollamaSysMsg?.content) { bodyPayload.system = ollamaSysMsg.content; }
                break;
                
            case 'standard':
            default:
                bodyPayload.messages = mapMessagesForStandardOrClaude(messagesHistory, providerLower);
                delete bodyPayload.contents;
                break;
        }
        
        apiUrl = providerConfig.proxyPath;

        console.log(`[API Send] Sending request to ${apiUrl} for model ${fullModelString}. Stream: ${shouldUseStreaming}`);
        console.log("[API Send] Payload:", JSON.stringify(bodyPayload, null, 2));

        response = await fetch(apiUrl, { method: 'POST', headers, body: JSON.stringify(bodyPayload), signal });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error(`[API Send] API Error (${response.status} - ${providerLower}):`, errorBody);
            try {
                const errorJson = JSON.parse(errorBody);
                throw new Error(errorJson.error?.message || JSON.stringify(errorJson));
            } catch (e) {
                throw new Error(`API Error (${response.status}): ${errorBody}`);
            }
        }
        
        const responseContentType = response.headers.get('content-type') || '';
        const isActuallyStreaming = shouldUseStreaming && response.body && (responseContentType.includes('text/event-stream') || responseContentType.includes('application/x-ndjson') || responseContentType.includes('application/json'));

        if (isActuallyStreaming) {
            console.log("[API Stream] Backend confirmed streaming response. Starting parsing.");
            const stream = response.body.pipeThrough(new TextDecoderStream());
            let buffer = '';

            if (providerLower === 'gemini') {
                for await (const chunk of stream) {
                    buffer += chunk;
                    let processedLength = 0;

                    while (true) {
                        let jsonStart = -1, jsonEnd = -1, curlyBracketCount = 0, inString = false, escaped = false;
                        
                        for (let i = processedLength; i < buffer.length; i++) {
                            const char = buffer[i];
                            if (inString) {
                                if (escaped) escaped = false;
                                else if (char === '\\') escaped = true;
                                else if (char === '"') inString = false;
                            } else {
                                if (char === '"') inString = true;
                                else if (char === '{') {
                                    if (jsonStart === -1) jsonStart = i;
                                    curlyBracketCount++;
                                } else if (char === '}') {
                                    curlyBracketCount--;
                                    if (curlyBracketCount === 0 && jsonStart !== -1) {
                                        jsonEnd = i;
                                        break;
                                    }
                                }
                            }
                        }

                        if (jsonStart !== -1 && jsonEnd !== -1) {
                            const jsonDataString = buffer.substring(jsonStart, jsonEnd + 1);
                            processedLength = jsonEnd + 1;

                            try {
                                const chunkObj = JSON.parse(jsonDataString);
                                let replyDelta = '';
                                let usageForUnit = null;

                                if (chunkObj.candidates?.[0]?.content?.parts?.[0]?.text) {
                                    replyDelta = chunkObj.candidates[0].content.parts[0].text;
                                }
                                if (chunkObj.usageMetadata) {
                                    usageForUnit = {
                                        prompt_tokens: chunkObj.usageMetadata.promptTokenCount,
                                        completion_tokens: chunkObj.usageMetadata.candidatesTokenCount,
                                        total_tokens: chunkObj.usageMetadata.totalTokenCount
                                    };
                                }

                                if (replyDelta || usageForUnit) {
                                    if (replyDelta) accumulatedAssistantReply += replyDelta;
                                    // Gemini 不提供独立思考过程流
                                    if (usageForUnit) {
                                        if (!usageData) usageData = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
                                        usageData.prompt_tokens = Math.max(usageData.prompt_tokens, usageForUnit.prompt_tokens || 0);
                                        usageData.completion_tokens = usageForUnit.completion_tokens; // Gemini's is cumulative
                                        usageData.total_tokens = usageData.prompt_tokens + usageData.completion_tokens;
                                    }
                                    onStreamChunk({
        reply: accumulatedAssistantReply,     // <-- 修改这里
        reasoning: accumulatedThinkingForDisplay, // <-- 修改这里
        usage: usageForUnit                   // 这个保持不变
    });
                                }
                            } catch (e) {
                                console.warn('[API Stream Error - Gemini] Failed to parse JSON chunk:', e, `Raw: "${jsonDataString}"`);
                            }
                        } else {
                            break; // 没有找到完整的 JSON，等待更多数据
                        }
                    }
                    buffer = buffer.substring(processedLength);
                }
            } else {
                const lineSeparator = '\n';
                for await (const chunk of stream) {
                    buffer += chunk;
                    let lineEndIndex;
                    while ((lineEndIndex = buffer.indexOf(lineSeparator)) !== -1) {
                        const line = buffer.substring(0, lineEndIndex).trim();
                        buffer = buffer.substring(lineEndIndex + lineSeparator.length);

                        if (!line) continue;

                        let jsonDataString = null;

                        if (providerLower === 'ollama') {
                            jsonDataString = line;
                        } else if (line.startsWith('data:')) {
                            jsonDataString = line.substring(5).trim();
                        } else {
                            continue;
                        }

                        if (!jsonDataString || jsonDataString === '[DONE]') continue;

                        try {
                            const chunkObj = JSON.parse(jsonDataString);
                            let replyDelta = '';
                            let reasoningDelta = '';
                            let usageForUnit = null;

                            switch(providerLower) {
                                case 'ollama':
                                    if (chunkObj?.message?.content) replyDelta = chunkObj.message.content;
                                    if (chunkObj.done === true) {
                                        usageForUnit = {
                                            prompt_tokens: chunkObj.prompt_eval_count,
                                            completion_tokens: chunkObj.eval_count,
                                        };
                                    }
                                    break;
                                case 'anthropic':
                                    if (chunkObj.type === 'message_start' && chunkObj.message?.usage?.input_tokens) {
                                        usageForUnit = { input_tokens: chunkObj.message.usage.input_tokens };
                                    }
                                    if (chunkObj.type === 'content_block_delta' && chunkObj.delta?.type === 'text_delta') {
                                        replyDelta = chunkObj.delta.text || '';
                                    }
                                    if (chunkObj.type === 'message_delta' && chunkObj.usage?.output_tokens) {
                                        usageForUnit = { output_tokens: chunkObj.usage.output_tokens };
                                    }
                                    break;
                                default: // Default OpenAI compatible SSE
    const delta = chunkObj.choices?.[0]?.delta;
    if (delta) {
        // highlight-start
        // ★★★ 核心修复：明确提取 content 和 reasoning_content ★★★
        replyDelta = delta.content || '';
        // 兼容 'reasoning_content' 和 'reasoning' 两种可能的字段名
        reasoningDelta = delta.reasoning_content || delta.reasoning || '';
        // highlight-end
    }
    if (chunkObj.usage) {
        usageForUnit = chunkObj.usage;
    }
    break;
                            }

                            if (replyDelta || reasoningDelta || usageForUnit) {
                                if (replyDelta) accumulatedAssistantReply += replyDelta;
                                if (reasoningDelta) accumulatedThinkingForDisplay += reasoningDelta;

                                if (usageForUnit) {
                                    if (!usageData) usageData = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
                                    usageData.prompt_tokens = Math.max(usageData.prompt_tokens, usageForUnit.prompt_tokens || 0, usageForUnit.input_tokens || 0);
                                    
                                    const completionDelta = usageForUnit.completion_tokens || usageForUnit.output_tokens || 0;
                                    if (providerLower === 'anthropic' || providerLower === 'ollama') {
                                        usageData.completion_tokens = completionDelta; // Cumulative
                                    } else {
                                        if (completionDelta > 0) usageData.completion_tokens = completionDelta; // Typically last chunk
                                    }
                                    usageData.total_tokens = usageData.prompt_tokens + usageData.completion_tokens;
                                }

                                onStreamChunk({
        reply: accumulatedAssistantReply, // 正确：传递累积后的完整回复
        reasoning: accumulatedThinkingForDisplay,
        usage: usageForUnit
    });
                            }
                        } catch (e) {
                            console.warn('[API Stream Error - SSE/Line] Failed to parse JSON chunk:', e, `Raw: "${jsonDataString}"`);
                        }
                    }
                }
            }
        } else {
            console.log("[API Send] Response is NOT streaming (or not detected as such). Processing as full JSON response.");
            const responseData = await response.json();
            if (!response.ok) throw new Error(responseData.error?.message || JSON.stringify(responseData));
            
            let finalReply = '', finalReasoning = null;
            switch(providerLower) {
                case 'gemini':
                    finalReply = responseData.candidates?.[0]?.content?.parts?.[0]?.text || '';
                    if (responseData.usageMetadata) {
                        usageData = {
                            prompt_tokens: responseData.usageMetadata.promptTokenCount,
                            completion_tokens: responseData.usageMetadata.candidatesTokenCount,
                            total_tokens: responseData.usageMetadata.totalTokenCount
                        };
                    }
                    break;
                case 'anthropic':
                    finalReply = responseData.content?.[0]?.text || '';
                    if (responseData.usage) {
                        usageData = {
                            input_tokens: responseData.usage.input_tokens,
                            output_tokens: responseData.usage.output_tokens
                        };
                    }
                    break;
                case 'ollama':
                    finalReply = responseData.message?.content || '';
                    usageData = {
                        prompt_tokens: responseData.prompt_eval_count || 0,
                        completion_tokens: responseData.eval_count || 0,
                        total_tokens: (responseData.prompt_eval_count || 0) + (responseData.eval_count || 0)
                    };
                    break;
                default:
                    finalReply = responseData.choices?.[0]?.message?.content || '';
                    finalReasoning = responseData.choices?.[0]?.message?.reasoning || responseData.choices?.[0]?.message?.reasoning_content || null;
                    usageData = responseData.usage || null;
                    break;
            }

            accumulatedAssistantReply = finalReply;
            accumulatedThinkingForDisplay = finalReasoning;
        }

        // 最终返回前统一处理 accumulatedAssistantReply 和 accumulatedThinkingForDisplay
        if (!(accumulatedThinkingForDisplay?.trim()) && accumulatedAssistantReply.includes('<think>') && accumulatedAssistantReply.includes('</think>')) {
            const extraction = utils.extractThinkingAndReply(accumulatedAssistantReply, '<think>', '</think>');
            accumulatedAssistantReply = extraction.replyText.trim();
            accumulatedThinkingForDisplay = extraction.thinkingText.trim();
        } else {
            accumulatedAssistantReply = accumulatedAssistantReply.trim();
            accumulatedThinkingForDisplay = accumulatedThinkingForDisplay?.trim() || null;
        }

        return {
            success: true,
            reply: accumulatedAssistantReply,
            reasoning: accumulatedThinkingForDisplay,
            usage: usageData,
            role: providerLower === 'gemini' ? 'model' : 'assistant',
            aborted: false
        };

    } catch (error) {
        if (error.name === 'AbortError') {
            let abortedReply = accumulatedAssistantReply;
            let abortedReasoning = accumulatedThinkingForDisplay;

            if (!(abortedReasoning?.trim()) && abortedReply.includes('<think>') && abortedReply.includes('</think>')) {
                const extraction = utils.extractThinkingAndReply(abortedReply, '<think>', '</think>');
                abortedReply = extraction.replyText.trim();
                abortedReasoning = extraction.thinkingText.trim();
            } else {
                abortedReply = abortedReply.trim();
                abortedReasoning = abortedReasoning?.trim() || null;
            }

            return {
                success: true,
                reply: (abortedReply || "") + "\n（state用户已中止）",
                reasoning: abortedReasoning,
                usage: usageData,
                role: providerLower === 'gemini' ? 'model' : 'assistant',
                aborted: true
            };
        }
        console.error(`[API Send] Request Failed:`, error);
        return { success: false, reply: `错误: ${error.message}`, aborted: false };
    }
}


// ========================================================================
// 以下是其他 API 交互函数 (保持不变)
// ========================================================================

/**
 * 将 API 密钥保存到后端的 .env 文件。
 * @param {string} provider - API 提供商的名称 (例如 'OpenAI').
 * @param {string} apiKey - 用户输入的 API 密钥.
 * @returns {Promise<boolean>} - 保存是否成功。
 */
export async function saveApiKey(provider, apiKey) { // <--- 移除 apiEndpoint
    try {
        const response = await fetch('/api/save-keys', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider, apiKey }), // <--- 移除 apiEndpoint
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || `保存失败，状态码: ${response.status}`);
        }

        const result = await response.json();
        utils.showToast(result.message, 'success');
        return true;

    } catch (error) {
        console.error("保存 API Key 失败:", error);
        utils.showToast(`保存失败：${error.message}`, 'error');
        return false;
    }
}

/**
 * 从 models.json 文件加载模型配置。
 * @returns {Promise<Array>} - 返回模型数组，失败则返回包含错误信息的回退数组。
 */
export async function loadModelsFromConfig() {
  try {
    const response = await fetch('configs/models.json?t=' + new Date().getTime());
    if (!response.ok) {
      throw new Error(`加载 models.json 失败: ${response.status} ${response.statusText}`);
    }
    const config = await response.json();

    if (config && Array.isArray(config.models)) {
      state.setModelConfigData(config);
      state.setEditableModelConfig(JSON.parse(JSON.stringify(config)));
      return config.models; 
    } else {
      throw new Error("models.json 文件格式无效。期望格式为 { \"models\": [ ... ] }");
    }
  } catch (error) {
    console.error("加载或解析 models.json 时发生错误:", error);
    utils.showToast("无法从 models.json 加载模型列表，将使用回退配置。", 'error');
    
    const fallbackConfig = { 
        models: [{ 
            groupLabel: "Fallback", 
            options: [{
                value: "error::error", 
                text: "配置加载失败"
            }] 
        }] 
    };
    state.setModelConfigData(fallbackConfig);
    state.setEditableModelConfig(JSON.parse(JSON.stringify(fallbackConfig)));
    
    return fallbackConfig.models;
  }
}

/**
 * 将当前编辑的模型配置保存到文件。
 * @returns {Promise<Array|null>} 成功则返回更新后的模型数组，失败则返回 null。
 */
export async function saveModelsToFile() {
    if (!state.editableModelConfig || !state.editableModelConfig.models) {
        utils.showToast('没有模型配置可供保存。','error');
        return null;
    }

    const cleanedModelConfig = {
        models: state.editableModelConfig.models.map(group => ({
            groupLabel: (group.groupLabel || "未命名组").trim(),
            isGroupHidden: !!group.isGroupHidden,
            options: (group.options || [])
                .filter(opt => opt.text?.trim() && opt.value?.trim())
                .map(opt => ({
                    text: opt.text.trim(),
                    value: opt.value.trim(),
                    isHidden: !!opt.isHidden
                }))
        })).filter(group => group.groupLabel !== "未命名组" || group.options.length > 0)
    };
    
    try {
        const response = await fetch('/.netlify/functions/save-models-local', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cleanedModelConfig),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: response.statusText }));
            throw new Error(errorData.message || `保存失败，状态码: ${response.status}`);
        }

        const result = await response.json();
        utils.showToast(result.message || '模型配置已成功保存！', 'success');
        
        // 更新 state
        state.setModelConfigData(JSON.parse(JSON.stringify(cleanedModelConfig)));
        state.setEditableModelConfig(JSON.parse(JSON.stringify(cleanedModelConfig)));
        
        return cleanedModelConfig.models;

    } catch (error) {
        console.error("保存模型配置失败:", error);
        utils.showToast(`保存模型配置失败：${error.message}`, 'error');
        return null;
    }
}

/**
 * 从 prompts.json 文件加载预设模板配置。
 */
export async function loadPresetsFromConfig() {
    try {
        const response = await fetch('configs/prompts.json?t=' + new Date().getTime());
        if (!response.ok) {
            throw new Error(`加载 prompts.json 失败: ${response.status}`);
        }
        const data = await response.json();
        if (data && Array.isArray(data.prompts)) {
            state.setLoadedPresetPrompts(data.prompts);
        } else {
            console.error("prompts.json 文件格式无效，期望 { prompts: [...] }");
            state.setLoadedPresetPrompts([]);
        }
    } catch (error) {
        console.error("加载或解析 prompts.json 时发生错误:", error);
        utils.showToast("加载预设模板失败。", "error");
        state.setLoadedPresetPrompts([]);
    }
}



/**
 * 将当前的预设模板保存到 prompts.json 文件。
 * @param {boolean} [showNotification=true] - 是否在成功后显示 toast 提示。
 */
export async function savePresetsToFile(showNotification = true) {
    try {
        const response = await fetch('/.netlify/functions/save-prompts-local', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompts: state.loadedPresetPrompts }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || '保存失败');
        }
        
        if (showNotification) {
            utils.showToast('预设模板已成功保存！', 'success');
        }

    } catch (error) {
        console.error("保存预设模板失败:", error);
        utils.showToast(`保存失败：${error.message}`, 'error');
    }
}

export async function getKeysStatus() {
    try {
        const response = await fetch('/.netlify/functions/get-keys-status'); 
        
        if (!response.ok) {
            console.error(`getKeysStatus fetch failed with status: ${response.status}`);
            // 抛出错误，让 catch 块处理
            throw new Error('Failed to fetch API key status.');
        }
        
        const data = await response.json();
        console.log('[api.js] Fetched data from backend:', data); 
        
        // ★★★ 核心修复：直接返回从后端获取的 data 对象 ★★★
        // 因为后端返回的就是我们需要的 { openai: {...}, ... } 格式
        return data; 

    } catch (error) {
        console.error("Error in getKeysStatus:", error);
        utils.showToast("无法获取 API Key 状态。", "error");
        // 在出错时返回一个空对象，而不是空数组，这样可以避免后续代码出错
        return {}; 
    }
}

/**
 * 将当前编辑的提供商配置保存到文件。
 * @param {Array} providersArray - 包含所有提供商配置对象的数组。
 * @returns {Promise<Array|null>} 成功则返回更新后的提供商数组，失败则返回 null。
 */
export async function saveProvidersToFile(providersArray) {
    if (!Array.isArray(providersArray)) {
        utils.showToast('没有提供商配置可供保存。','error');
        return null;
    }

    // 在发送前进行数据清理和验证
    const cleanedProvidersConfig = {
        providers: providersArray.map(p => ({
            name: (p.name || "").trim(),
            value: (p.value || "").trim().toLowerCase(),
            apiKeyEnv: (p.apiKeyEnv || "").trim(),
            defaultEndpoint: (p.defaultEndpoint || "").trim(),
            proxyPath: (p.proxyPath || "/api/openai-compatible-proxy").trim(), // 默认使用通用代理
            mapperType: (p.mapperType || "standard").trim().toLowerCase(),
            streamSupport: !!p.streamSupport,
            isSpecialCase: !!p.isSpecialCase,
            isSelfHosted: !!p.isSelfHosted,
        })).filter(p => p.name && p.value && p.apiKeyEnv) // 确保核心字段存在
    };
    
    try {
        const response = await fetch('/.netlify/functions/save-providers-local', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cleanedProvidersConfig),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: response.statusText }));
            throw new Error(errorData.message || `保存失败，状态码: ${response.status}`);
        }

        const result = await response.json();
        utils.showToast(result.message || '提供商配置已成功保存！', 'success');
        
        // 更新 state
        state.setProvidersConfig(cleanedProvidersConfig.providers);
        
        return cleanedProvidersConfig.providers;

    } catch (error) {
        console.error("保存提供商配置失败:", error);
        utils.showToast(`保存提供商配置失败：${error.message}`, 'error');
        return null;
    }
}


/**
 * 从 providers.json 文件加载提供商配置。
 * @returns {Promise<Array>} - 返回提供商数组，失败则返回空数组。
 */
export async function loadProvidersConfig() { // ★★★ 核心修复：确保这里有 'export' 关键字 ★★★
  try {
    const response = await fetch('configs/providers.json?t=' + new Date().getTime());
    if (!response.ok) {
      throw new Error(`加载 providers.json 失败: ${response.status} ${response.statusText}`);
    }
    const config = await response.json();

    if (config && Array.isArray(config.providers)) {
      state.setProvidersConfig(config.providers);
      console.log('[API] Providers config loaded:', config.providers.map(p => p.name));
      return config.providers; 
    } else {
      throw new Error("providers.json 文件格式无效。期望格式为 { \"providers\": [ ... ] }");
    }
  } catch (error) {
    console.error("加载或解析 providers.json 时发生错误:", error);
    utils.showToast("无法从 providers.json 加载提供商列表。", "error");
    state.setProvidersConfig([]);
    return [];
  }
}

/**
 * 将联网搜索配置（API URL 和 Key）保存到后端的 .env 文件。
 * @param {string} apiUrl - 搜索服务的 URL.
 * @param {string} apiKey - 搜索服务的 API 密钥.
 * @returns {Promise<boolean>} - 保存是否成功。
 */
export async function saveWebSearchConfig(apiUrl, apiKey) {
    try {
        const response = await fetch('/.netlify/functions/save-web-search-config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apiUrl, apiKey }),
        });

        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.message || `保存失败，状态码: ${response.status}`);
        }

        utils.showToast(result.message, 'success');
        return true;

    } catch (error) {
        console.error("保存联网搜索配置失败:", error);
        utils.showToast(`保存失败：${error.message}`, 'error');
        return false;
    }
}

/**
 * 从后端获取联网搜索配置的状态。
 * @returns {Promise<object>} - 返回一个包含 { urlConfigured: boolean, keyConfigured: boolean } 的对象。
 */
export async function getWebSearchStatus() {
    try {
        const response = await fetch('/.netlify/functions/get-web-search-status');
        if (!response.ok) {
            throw new Error('无法获取联网搜索配置状态。');
        }
        return await response.json();
    } catch (error) {
        console.error("Error in getWebSearchStatus:", error);
        // 出错时返回默认的未配置状态，避免UI崩溃
        return { urlConfigured: false, keyConfigured: false };
    }
}
// --- END OF FILE js/api.js (Corrected) ---