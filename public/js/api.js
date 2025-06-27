

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

/**
 * 发送消息到后端 API。
 * @param {Array} messagesHistory - 经过过滤的、要发送给API的线性消息历史（不包含兄弟分支）。
 * @param {function} onStreamChunk - 处理流式数据块的回调函数。
 * @returns {Promise<object>} 一个 Promise，解析为一个包含最终结果的对象。
 */
export async function send(messagesHistory, onStreamChunk) {
    let apiUrl;
    const headers = { 'Content-Type': 'application/json' };
    let bodyPayload = {};
    let response;
    let accumulatedAssistantReply = "";
    let accumulatedThinkingForDisplay = "";
    let usageData = null;

    const conversation = state.getCurrentConversation();
    if (!conversation) {
        // 理论上不应发生，因为在调用此函数前已检查
        return { success: false, reply: "致命错误：找不到当前对话。", aborted: false };
    }
    const [providerToUse, modelNameForAPI] = String(conversation.model).split('::');
    const providerLower = providerToUse.toLowerCase();
    
    // 创建 AbortController 并保存在 state 中
    state.setCurrentAbortController(new AbortController());
    const signal = state.currentAbortController.signal;

    try {
        // --- 1. 构建请求体 (Payload) ---
        const providerSupportsStreaming = ['openai', 'anthropic', 'deepseek', 'siliconflow', 'ollama', 'suanlema', 'openrouter', 'volcengine', 'gemini'].includes(providerLower);
        const shouldUseStreaming = providerSupportsStreaming && state.isStreamingEnabled;

        bodyPayload = {
            model: modelNameForAPI,
            stream: shouldUseStreaming,
        };
        
        // --- 动态添加参数 ---
        const modelNameLower = modelNameForAPI.toLowerCase();
        
        // Temperature
        if (!modelNameLower.includes('o4-mini')) {
            bodyPayload.temperature = parseFloat(localStorage.getItem('model-temperature')) || 0.7;
        }

        // Max Tokens
        if (state.currentMaxTokens) {
            // OpenAI 的旧模型或特定模型可能使用 max_completion_tokens
            if (providerLower === 'openai' && (modelNameLower.includes('o4-mini') || modelNameLower.includes('o3'))) {
                bodyPayload.max_completion_tokens = state.currentMaxTokens;
            } else {
                bodyPayload.max_tokens = state.currentMaxTokens;
            }
        }

        // Thinking Mode
        if (!state.isAutoThinkModeEnabled) {
            if (providerLower === 'gemini') bodyPayload.isManualThinkModeEnabled = state.isManualThinkModeEnabled;
            else if (providerLower === 'ollama') bodyPayload.think = state.isManualThinkModeEnabled;
            else if (modelNameLower.includes('qwen')) bodyPayload.enable_thinking = state.isManualThinkModeEnabled;
            else if (providerLower === 'volcengine' && modelNameLower.includes('doubao')) bodyPayload.thinking = { "type": state.isManualThinkModeEnabled ? 'thinking' : 'non-thinking' };
        }

        // --- 2. 准备 Messages/Contents (核心修复在此！) ---
        // messagesHistory 参数已经是从 conversation.getCurrentBranchMessages 过滤后的线性历史
        // 因此，这里直接使用 messagesHistory 即可，不再需要从 conversation.messages 中查找。
        const lastUserMessage = messagesHistory[messagesHistory.length - 1]; // 获取最后一条用户消息
        const filesToSend = lastUserMessage?.content?.files || []; // 提取其中包含的文件数据

         if (providerLower === 'gemini') {
            // ★★★ 核心修复：前端始终发送 'messages' 字段给 gemini-proxy ★★★
            // mapMessagesForGemini (前端的这个) 会将数据映射为 Gemini 兼容的格式，
            // 但前端不知道后端代理的具体期望，所以这里统一发送 'messages'。
            // 后端代理会再次处理这个 'messages'。
            bodyPayload.messages = mapMessagesForGemini(messagesHistory, filesToSend); 
            delete bodyPayload.contents; // 确保 contents 字段不存在
        } else {
            // 所有其他模型（OpenAI, Anthropic, Deepseek, Ollama 等）都使用 'messages' 字段
            // mapMessagesForStandardOrClaude 函数将 messagesHistory 映射为标准格式
            bodyPayload.messages = mapMessagesForStandardOrClaude(messagesHistory, providerLower, filesToSend);
            delete bodyPayload.contents; // 确保 contents 字段不存在
        }

        // ★★★ 核心修复：在这里统一设置 API URL 和特定于提供商的顶层参数 ★★★

        apiUrl = `/api/${providerLower}-proxy`; 
        const isClaudeModel = providerLower === 'anthropic';
            
        if (isClaudeModel) {
            // Claude 的 system prompt 在顶层处理，而不是在 messages 数组中
            // 从传入的线性历史 messagesHistory 中查找 system 消息
            const sysMsg = messagesHistory.find(m => m.role === 'system');
            if (sysMsg?.content) {
                bodyPayload.system = sysMsg.content;
            }
            
            // Claude API (即使通过OpenRouter) 都推荐设置一个 max_tokens
            if (!bodyPayload.max_tokens) {
                bodyPayload.max_tokens = 4096; // 默认值，如果未设置
            }
        }
        
        // --- 3. 发送请求 ---
        response = await fetch(apiUrl, { method: 'POST', headers, body: JSON.stringify(bodyPayload), signal });

        // ★★★ 核心修复：在这里处理所有非 OK 的响应 ★★★
        if (!response.ok) {
            // 无论响应是什么格式，都先尝试作为文本读取
            const rawErrorText = await response.text();
            // 尝试将文本解析为JSON，如果失败，就使用原始文本
            let errorMessage = rawErrorText;
            try {
                const errorJson = JSON.parse(rawErrorText);
                errorMessage = errorJson.error?.message || JSON.stringify(errorJson);
            } catch (e) {
                // 解析失败，说明返回的不是JSON，直接使用原始文本
            }
            // 抛出一个包含清晰信息的错误，让下面的 catch 块捕获
            throw new Error(`API Error (${response.status}): ${errorMessage}`);
        }
        
        const responseContentType = response.headers.get('content-type') || '';
        // 判断是否为实际的流式响应（基于 Content-Type）
        const isActuallyStreaming = shouldUseStreaming && response.body && (responseContentType.includes('text/event-stream') || responseContentType.includes('application/x-ndjson'));

        // --- 4. 处理响应 ---
        if (isActuallyStreaming) {
            // 再次检查响应是否成功，以防在流式处理前出现问题
            if (!response.ok) throw new Error(`API流式请求失败 (${response.status}): ${await response.text()}`);
            
            const stream = response.body.pipeThrough(new TextDecoderStream());
            let buffer = '';
            
            for await (const chunk of stream) {
                buffer += chunk;
                // 根据提供商使用不同的分隔符来解析事件流数据
                const separator = (providerLower === 'ollama') ? '\n' : '\n\n';
                
                let boundaryIndex;
                while ((boundaryIndex = buffer.indexOf(separator)) !== -1) {
                    const rawUnit = buffer.substring(0, boundaryIndex);
                    buffer = buffer.substring(boundaryIndex + separator.length);
                    if (!rawUnit.trim()) continue; // 跳过空行或空白数据

                    let jsonDataString = null;
                    if (providerLower === 'ollama') {
                        // Ollama 的每个单元格本身就是 JSON
                        jsonDataString = rawUnit.trim();
                    } else {
                        // 其他提供商（如 OpenAI）使用 'data: ' 前缀
                        const lines = rawUnit.split('\n');
                        for (const line of lines) {
                            if (line.startsWith('data:')) {
                                jsonDataString = line.substring(5).trim();
                                break; 
                            }
                        }
                    }
                    if (!jsonDataString || jsonDataString === '[DONE]') continue; // 跳过无效数据或结束标记
                    
                    try {
                        const chunkObj = JSON.parse(jsonDataString);
                        
                        let replyDelta = '';
                        let reasoningDelta = ''; // 只有当模型原生提供时才会有值
                        let usageForUnit = null;

                        // 根据不同 provider 解析数据块，提取增量内容和使用数据
                        switch(providerLower) {
                            case 'ollama':
                                if (chunkObj?.message?.content) replyDelta = chunkObj.message.content; 
                                if (chunkObj.done === true && chunkObj.total_duration) {
                                    usageForUnit = { 
                                        prompt_tokens: chunkObj.prompt_eval_count || 0, 
                                        completion_tokens: chunkObj.eval_count || 0 
                                    };
                                }
                                break;
                            case 'anthropic':
                                if (chunkObj.type === 'message_start' && chunkObj.message?.usage?.input_tokens) {
                                    // message_start 可能包含初始的 input_tokens
                                    usageData = { input_tokens: chunkObj.message.usage.input_tokens, output_tokens: 0 };
                                }
                                if (chunkObj.type === 'content_block_delta' && chunkObj.delta?.type === 'text_delta') {
                                    replyDelta = chunkObj.delta.text || '';
                                }
                                if (chunkObj.type === 'message_delta' && chunkObj.usage?.output_tokens) {
                                    // message_delta 包含最终的 output_tokens
                                    usageForUnit = { output_tokens: chunkObj.usage.output_tokens };
                                }
                                break;
                            case 'gemini': 
                                if (chunkObj.candidates?.[0]?.content?.parts?.[0]?.text) {
                                    replyDelta = chunkObj.candidates[0].content.parts[0].text;
                                }
                                if (chunkObj.usageMetadata) {
                                    usageForUnit = { 
                                        prompt_tokens: chunkObj.usageMetadata.promptTokenCount, 
                                        completion_tokens: chunkObj.usageMetadata.candidatesTokenCount || 0 
                                    };
                                }
                                break;
                            default: // OpenAI, Deepseek, Siliconflow, OpenRouter, Volcengine (通用 OpenAI 兼容格式)
                                const delta = chunkObj.choices?.[0]?.delta;
                                if (delta) {
                                    replyDelta = delta.content || ''; 
                                    // 尝试获取原生思考过程，如果模型提供
                                    reasoningDelta = delta.reasoning || delta.reasoning_content || ''; 
                                }
                                if (chunkObj.usage) {
                                    usageForUnit = chunkObj.usage;
                                }
                                break;
                        }

                        // 累积增量数据。onStreamChunk 传递的是增量，但 finalResult 需要完整累积。
                        if (replyDelta) accumulatedAssistantReply += replyDelta;
                        if (reasoningDelta) accumulatedThinkingForDisplay += reasoningDelta;
                        if (usageForUnit) usageData = { ...usageData, ...usageForUnit }; // 合并或更新 usage 数据

                        // 调用回调函数，将增量数据传递给 UI 层进行实时更新
                        onStreamChunk({
                            reply: replyDelta, 
                            reasoning: reasoningDelta, 
                            usage: usageData 
                        });

                    } catch (e) {
                        console.warn('处理流式数据块时发生错误:', e, `原始数据块: "${jsonDataString}"`);
                        // 如果 JSON 解析失败，跳过此数据块，不调用 onStreamChunk
                        continue; 
                    }
                }
            }

        } else { // 非流式响应 (适用于 stream: false 或后端不支持流式)
            const responseData = await response.json();
            // 如果非流式响应本身就不是 OK 状态，则抛出错误
            if (!response.ok) throw new Error(responseData.error?.message || JSON.stringify(responseData));
            
            let finalReply = '', finalReasoning = null;
            // 根据提供商解析非流式响应的最终内容和元数据
            switch(providerLower) {
                case 'gemini': 
                    finalReply = responseData.candidates?.[0]?.content?.parts?.[0]?.text || '';
                    if (responseData.usageMetadata) {
                        usageData = { 
                            prompt_tokens: responseData.usageMetadata.promptTokenCount, 
                            completion_tokens: responseData.usageMetadata.candidatesTokenCount 
                        };
                    }
                    break;
                default: // OpenAI, Deepseek, etc.
                    finalReply = responseData.choices?.[0]?.message?.content || '';
                    // 尝试获取原生思考过程
                    finalReasoning = responseData.choices?.[0]?.message?.reasoning || responseData.choices?.[0]?.message?.reasoning_content || null;
                    usageData = responseData.usage || null;
                    break;
            }

            // 如果存在原生思考过程，则直接使用
            if (finalReasoning) {
                accumulatedThinkingForDisplay = finalReasoning;
                accumulatedAssistantReply = finalReply;
            } 
            // 否则，尝试从主回复中提取嵌入式思考过程（例如 <think>...</think>）
            else if (finalReply.includes('<think>') && finalReply.includes('</think>')) {
                const extraction = utils.extractThinkingAndReply(finalReply, '<think>', '</think>'); 
                accumulatedAssistantReply = extraction.replyText.trim();
                accumulatedThinkingForDisplay = extraction.thinkingText.trim();
            } else {
                // 没有任何思考过程，回复就是全部内容
                accumulatedAssistantReply = finalReply;
            }
        }

        // 最终成功返回结果对象
        return {
            success: true,
            reply: accumulatedAssistantReply.trim(),
            reasoning: accumulatedThinkingForDisplay.trim() || null,
            usage: usageData,
            role: providerLower === 'gemini' ? 'model' : 'assistant', // Gemini 的角色是 'model'
            aborted: false
        };

    } catch (error) {
        // 处理用户中止请求 (AbortError)
        if (error.name === 'AbortError') {
            return {
                success: true, // 中止也算一种“成功”的结束流程（流程正常结束，只是用户中断）
                reply: (accumulatedAssistantReply.trim() || "") + "\n（用户已中止）",
                reasoning: accumulatedThinkingForDisplay.trim() || null,
                usage: usageData,
                role: providerLower === 'gemini' ? 'model' : 'assistant',
                aborted: true
            };
        }
        // 处理其他类型错误
        console.error(`[API Send] 请求失败:`, error);
        // 返回包含清晰错误信息的结果
        return { success: false, reply: `错误: ${error.message}`, aborted: false };
    } finally {
        // 无论成功、失败或中止，都清除当前的 AbortController
        state.setCurrentAbortController(null);
    }
}


/**
 * 将 API 密钥保存到后端的 .env 文件。
 * @param {string} provider - API 提供商的名称 (例如 'OpenAI').
 * @param {string} apiKey - 用户输入的 API 密钥.
 * @returns {Promise<boolean>} - 保存是否成功。
 */
export async function saveApiKey(provider, apiKey) {
    try {
        const response = await fetch('/api/save-key', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider, apiKey }),
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
    // ... (此函数的逻辑基本正确，保持不变)
    // 但为了完整性，这里提供最终版本
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

/**
 * 从后端获取已配置的 API 提供商列表。
 * @returns {Promise<string[]>} 一个解析为提供商名称数组的 Promise。
 */
export async function getKeysStatus() {
    try {
        // ★★★ 核心修复：使用 /api/ 路径，与 netlify.toml 规则保持一致 ★★★
        const response = await fetch('/api/get-keys-status'); 
        
        if (!response.ok) {
            // 这里可以添加更详细的错误日志
            console.error(`getKeysStatus fetch failed with status: ${response.status}`);
            throw new Error('Failed to fetch API key status.');
        }
        const data = await response.json();
        console.log('[api.js] Fetched data from backend:', data); 
        return data.configuredProviders || [];
    } catch (error) {
        console.error("Error in getKeysStatus:", error);
        utils.showToast("无法获取 API Key 状态。", "error");
        return [];
    }
}

// --- END OF FILE js/api.js (Corrected) ---