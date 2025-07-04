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


// ========================================================================
// 2. API 交互函数
// ========================================================================

/**
 * 发送消息到后端 API。
 * @param {Array} messagesHistory - 经过过滤的、要发送给API的线性消息历史（不包含兄弟分支）。
 * @param {function} onStreamChunk - 处理流式数据块的回调函数。
 * @param {AbortSignal} signal - AbortSignal 对象，用于中止请求。
 * @returns {Promise<object>} 一个 Promise，解析为一个包含最终结果的对象。
 */
export async function send(messagesHistory, onStreamChunk, signal) { 
    let apiUrl;
    const headers = { 'Content-Type': 'application/json' };
    let bodyPayload = {};
    let response;
    let accumulatedAssistantReply = "";     // 累积所有回复内容（包括嵌入式思考标签）
    let accumulatedThinkingForDisplay = ""; // 累积来自独立 reasoning 字段的思考过程
    let usageData = null;

    const conversation = state.getCurrentConversation(); // 用于获取模型信息等
    let effectiveModelString = conversation?.model; // 尝试获取 model 属性
    if (!effectiveModelString || typeof effectiveModelString !== 'string' || effectiveModelString.trim() === '') {
        // 如果 model 不存在、不是字符串或为空，则使用一个明确的默认值
        effectiveModelString = 'default::default-model'; 
        console.warn(`[API Send] Conversation model is invalid or missing. Using default: ${effectiveModelString}`);
    }

    // 确保 model 字符串有 '::'，如果没有则添加一个默认提供商
    const fullModelString = effectiveModelString.includes('::') ? effectiveModelString : `unknown::${effectiveModelString}`;
    
    // 从 fullModelString 中解析出 provider 和 modelNameForAPI
    // 例如 "openai::gpt-4o" -> providerToUse = "openai", modelNameForAPI = "gpt-4o"
    const [providerToUse, modelNameForAPI] = fullModelString.split('::');
    const providerLower = providerToUse.toLowerCase();
    
    if (!conversation) {
        return { success: false, reply: "致命错误：找不到当前对话。", aborted: false };
    }
    
    // ★★★ 核心修改：动态获取提供商配置 ★★★
    const providerConfig = state.getProviderConfig(providerLower);

    if (!providerConfig) {
        const errorMessage = `服务器配置错误：找不到提供商 '${providerToUse}' 的配置。请检查 public/configs/providers.json 文件。`;
        console.error(`[API Send] ${errorMessage}`);
        return { success: false, reply: errorMessage, aborted: false };
    }

    try {
        // --- 1. 构建请求体 (Payload) ---
        // 判断是否支持流式输出
        const shouldUseStreaming = providerConfig.streamSupport && state.isStreamingEnabled;

        // bodyPayload 的 model 字段始终发送完整的 fullModelString
        // 这样后端代理可以根据 provider::name 解析出正确的提供商和模型
        bodyPayload = {
            model: fullModelString, 
            stream: shouldUseStreaming,
        };
        
        // --- 动态添加参数 ---
        const modelNameLower = modelNameForAPI.toLowerCase();
        
        // Temperature
        // 排除某些模型，如 o4-Mini，它们通常有固定的温度
        if (!modelNameLower.includes('o4-mini','o3')) { // 确保是小写匹配
            bodyPayload.temperature = parseFloat(localStorage.getItem('model-temperature')) || 0.7;
        }

         // Max Tokens (★ 核心修复：根据模型名称动态选择参数)
        if (state.currentMaxTokens) {
            if (modelNameLower.includes('o4-mini') || modelNameLower.includes('o3')) {
                // 对于这些特殊模型，使用 'max_completion_tokens'
                bodyPayload.max_completion_tokens = state.currentMaxTokens;
            } else {
                // 对于所有其他模型，使用标准的 'max_tokens'
                bodyPayload.max_tokens = state.currentMaxTokens;
            }
        }
    
     
        // --- 2. 准备 Messages/Contents 并根据提供商路由到不同的代理 ---
        const lastUserMessage = messagesHistory[messagesHistory.length - 1]; 
        const filesToSend = lastUserMessage?.content?.files || []; 

        // ★★★ 核心修改：根据 providerConfig.mapperType 动态选择消息映射函数 ★★★
        switch (providerConfig.mapperType) {
            case 'gemini':
                // Gemini 使用 'contents' 字段
            // 新的映射器不再需要第二个参数
            bodyPayload.contents = mapMessagesForGemini(messagesHistory);
            // 确保没有多余的 messages 字段
            delete bodyPayload.messages; 
            break;

            case 'anthropic':
                // Anthropic 使用 'messages' 字段，并可能需要顶层的 'system' 字段
                bodyPayload.messages = mapMessagesForStandardOrClaude(messagesHistory, providerLower); // <--- 移除 filesToSend
                const sysMsgAnthropic = messagesHistory.find(m => m.role === 'system');
                if (sysMsgAnthropic?.content) { bodyPayload.system = sysMsgAnthropic.content; }
                if (!bodyPayload.max_tokens) { bodyPayload.max_tokens = 4096; }
                break;

            case 'ollama':
                 // Ollama 使用 'messages' 字段，并可能需要顶层的 'system' 字段
                bodyPayload.messages = mapMessagesForStandardOrClaude(messagesHistory, providerLower); // <--- 移除 filesToSend
                const ollamaSysMsg = messagesHistory.find(m => m.role === 'system');
                if (ollamaSysMsg?.content) { bodyPayload.system = ollamaSysMsg.content; }
                break;
                
            case 'standard': // 用于 OpenAI、DeepSeek、SiliconFlow、OpenRouter、Volcengine、DashScope 等所有兼容代理
            default: // 将 'standard' 作为默认和回退选项
                // 所有标准 OpenAI 兼容的 API (包括您的 Xai) 都使用 'messages' 字段
                bodyPayload.messages = mapMessagesForStandardOrClaude(messagesHistory, providerLower); // <--- 移除 filesToSend
                // 确保没有多余的 contents 字段
                delete bodyPayload.contents;
                break;
        }
        
        // ★★★ 核心修改：apiUrl 直接从 providerConfig 中获取 ★★★
        apiUrl = providerConfig.proxyPath;

        console.log(`[API Send] Sending request to ${apiUrl} for model ${fullModelString}. Stream: ${shouldUseStreaming}`); // ★ 新增调试日志
        console.log("[API Send] Payload:", JSON.stringify(bodyPayload, null, 2)); // ★ 新增调试日志

        // --- 3. 发送请求 ---
        // signal 参数由调用者（processApiRequest）传入并在此处使用
        response = await fetch(apiUrl, { method: 'POST', headers, body: JSON.stringify(bodyPayload), signal });

        // ★★★ 核心修复：这里处理所有非 OK 的响应 ★★★
        if (!response.ok) {
            const errorBody = await response.text();
            console.error(`[API Send] API Error (${response.status} - ${providerLower}):`, errorBody); // ★ 改进错误日志
            try {
                const errorJson = JSON.parse(errorBody);
                // 抛出更具体的错误消息
                throw new Error(errorJson.error?.message || JSON.stringify(errorJson));
            } catch (e) {
                // 如果解析 JSON 失败，则返回原始文本错误
                throw new Error(`API Error (${response.status}): ${errorBody}`);
            }
        }
        
        const responseContentType = response.headers.get('content-type') || '';
        // 包含 application/json for Gemini stream，因为它实际返回的是 application/json 类型的 JSON 流
        const isActuallyStreaming = shouldUseStreaming && response.body && (responseContentType.includes('text/event-stream') || responseContentType.includes('application/x-ndjson') || responseContentType.includes('application/json')); // ★★★ 核心修复 1: 包含 application/json for Gemini stream ★★★

        // --- 4. 处理响应 ---
        if (isActuallyStreaming) {
            console.log("[API Stream] Backend confirmed streaming response. Starting parsing.");
            const stream = response.body.pipeThrough(new TextDecoderStream());
            let buffer = '';

            // ★★★ 核心修复：为 Gemini 和其他提供商提供不同的解析策略 ★★★
            if (providerLower === 'gemini') {
                // --- 解析策略 1: 针对 Gemini 的鲁棒 JSON 对象解析器 ---
                for await (const chunk of stream) {
                    buffer += chunk;
                    let processedLength = 0;

                    while (true) {
                        let jsonStart = -1, jsonEnd = -1, curlyBracketCount = 0, inString = false, escaped = false;
                        
                        // 从已处理的位置开始扫描，寻找一个完整的 JSON 对象
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
                                    // ... (usageData 累积和 onStreamChunk 调用逻辑与下面共享) ...
                                    if (replyDelta) accumulatedAssistantReply += replyDelta;
                                    if (usageForUnit) {
                                        if (!usageData) usageData = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
                                        usageData.prompt_tokens = Math.max(usageData.prompt_tokens, usageForUnit.prompt_tokens || 0);
                                        usageData.completion_tokens = usageForUnit.completion_tokens; // Gemini's is cumulative
                                        usageData.total_tokens = usageData.prompt_tokens + usageData.completion_tokens;
                                    }
                                    onStreamChunk({ reply: replyDelta, reasoning: '', usage: usageData });
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
                // --- 解析策略 2: 针对 SSE 和纯 JSON 行的按行解析器 (Anthropic, Ollama, OpenAI) ---
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
                            // 忽略 SSE 的 event: 行或注释行
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
                                        replyDelta = delta.content || '';
                                        reasoningDelta = delta.reasoning || delta.reasoning_content || '';
                                    }
                                    if (chunkObj.usage) {
                                        usageForUnit = chunkObj.usage;
                                    }
                                    break;
                            }

                            if (replyDelta || reasoningDelta || usageForUnit) {
                                // ... (usageData 累积和 onStreamChunk 调用逻辑与上面共享) ...
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
                                    reply: replyDelta,
                                    reasoning: reasoningDelta,
                                    usage: usageData
                                });
                            }
                        } catch (e) {
                            console.warn('[API Stream Error - SSE/Line] Failed to parse JSON chunk:', e, `Raw: "${jsonDataString}"`);
                        }
                    }
                }
            }
        } else {
            console.log("[API Send] Response is NOT streaming (or not detected as such). Processing as full JSON response."); // ★ 改进日志
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

            if (finalReasoning) {
                accumulatedThinkingForDisplay = finalReasoning;
                accumulatedAssistantReply = finalReply;
            }
            else if (finalReply.includes('<think>') && finalReply.includes('</think>')) {
                const extraction = utils.extractThinkingAndReply(finalReply, '<think>', '</think>');
                accumulatedAssistantReply = extraction.replyText.trim();
                accumulatedThinkingForDisplay = extraction.thinkingText.trim();
            } else {
                accumulatedAssistantReply = finalReply;
            }
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

// --- END OF FILE js/api.js (send Function - COMPLETE & FINAL Streaming Fixes) ---
// --- END OF FILE js/api.js (send Function - Final Fixes) ---


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

// --- END OF FILE js/api.js (Corrected) ---