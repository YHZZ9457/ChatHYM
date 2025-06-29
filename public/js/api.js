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
 * @param {AbortSignal} signal - ★★★ 核心修复：现在直接从调用者接收 AbortSignal ★★★
 * @returns {Promise<object>} 一个 Promise，解析为一个包含最终结果的对象。
 */
export async function send(messagesHistory, onStreamChunk, signal) { // ★ 核心：接收 signal 参数
    let apiUrl;
    const headers = { 'Content-Type': 'application/json' };
    let bodyPayload = {};
    let response;
    let accumulatedAssistantReply = "";     // 累积所有回复内容（包括嵌入式思考标签）
    let accumulatedThinkingForDisplay = ""; // 累积来自独立 reasoning 字段的思考过程
    let usageData = null;

    const conversation = state.getCurrentConversation(); // 用于获取模型信息等，这是可以的
    if (!conversation) {
        return { success: false, reply: "致命错误：找不到当前对话。", aborted: false };
    }
    const [providerToUse, modelNameForAPI] = String(conversation.model).split('::');
    const providerLower = providerToUse.toLowerCase();
    
    // ★★★ 核心修复：不再在这里创建和设置 AbortController ★★★
    // state.setCurrentAbortController(new AbortController()); // <-- 移除这行！
    // const signal = state.currentAbortController.signal;     // <-- 移除这行！
    // signal 参数现在直接从函数签名中获取，由调用者传入。

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

        // --- 2. 准备 Messages/Contents ---
        const lastUserMessage = messagesHistory[messagesHistory.length - 1]; 
        const filesToSend = lastUserMessage?.content?.files || []; 

        if (providerLower === 'gemini') {
            bodyPayload.messages = mapMessagesForGemini(messagesHistory, filesToSend); 
            delete bodyPayload.contents; 
        } else {
            bodyPayload.messages = mapMessagesForStandardOrClaude(messagesHistory, providerLower, filesToSend);
            delete bodyPayload.contents; 
        }

        // ★★★ 核心修复：在这里统一设置 API URL 和特定于提供商的顶层参数 ★★★
        apiUrl = `/api/${providerLower}-proxy`; 
        const isClaudeModel = providerLower === 'anthropic';
            
        if (isClaudeModel) {
            const sysMsg = messagesHistory.find(m => m.role === 'system');
            if (sysMsg?.content) {
                bodyPayload.system = sysMsg.content;
            }
            
            if (!bodyPayload.max_tokens) {
                bodyPayload.max_tokens = 4096; 
            }
        }
        
        // --- 3. 发送请求 ---
        // signal 参数由调用者（processApiRequest）传入并在此处使用
        response = await fetch(apiUrl, { method: 'POST', headers, body: JSON.stringify(bodyPayload), signal });

        // ★★★ 核心修复：在这里处理所有非 OK 的响应 ★★★
        if (!response.ok) {
            const rawErrorText = await response.text();
            let errorMessage = rawErrorText;
            try {
                const errorJson = JSON.parse(rawErrorText);
                errorMessage = errorJson.error?.message || JSON.stringify(errorJson);
            } catch (e) {}
            throw new Error(`API Error (${response.status}): ${errorMessage}`);
        }
        
        const responseContentType = response.headers.get('content-type') || '';
        const isActuallyStreaming = shouldUseStreaming && response.body && (responseContentType.includes('text/event-stream') || responseContentType.includes('application/x-ndjson'));

        // --- 4. 处理响应 ---
        if (isActuallyStreaming) {
            if (!response.ok) throw new Error(`API流式请求失败 (${response.status}): ${await response.text()}`);
            
            const stream = response.body.pipeThrough(new TextDecoderStream());
            let buffer = '';
            
            for await (const chunk of stream) {
                buffer += chunk;
                const separator = (providerLower === 'ollama') ? '\n' : '\n\n';
                
                let boundaryIndex;
                while ((boundaryIndex = buffer.indexOf(separator)) !== -1) {
                    const rawUnit = buffer.substring(0, boundaryIndex);
                    buffer = buffer.substring(boundaryIndex + separator.length);
                    if (!rawUnit.trim()) continue;

                    let jsonDataString = null;
                    if (providerLower === 'ollama') {
                        jsonDataString = rawUnit.trim();
                    } else {
                        const lines = rawUnit.split('\n');
                        for (const line of lines) {
                            if (line.startsWith('data:')) {
                                jsonDataString = line.substring(5).trim();
                                break; 
                            }
                        }
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
                                if (chunkObj.done === true && chunkObj.total_duration) {
                                    usageForUnit = { 
                                        prompt_tokens: chunkObj.prompt_eval_count || 0, 
                                        completion_tokens: chunkObj.eval_count || 0 
                                    };
                                }
                                break;
                            case 'anthropic':
                                if (chunkObj.type === 'message_start' && chunkObj.message?.usage?.input_tokens) {
                                    usageData = { input_tokens: chunkObj.message.usage.input_tokens, output_tokens: 0 };
                                }
                                if (chunkObj.type === 'content_block_delta' && chunkObj.delta?.type === 'text_delta') {
                                    replyDelta = chunkObj.delta.text || '';
                                }
                                if (chunkObj.type === 'message_delta' && chunkObj.usage?.output_tokens) {
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
                            default: 
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

                        if (replyDelta) accumulatedAssistantReply += replyDelta;
                        if (reasoningDelta) accumulatedThinkingForDisplay += reasoningDelta; 
                        if (usageForUnit) usageData = { ...usageData, ...usageForUnit }; 

                        onStreamChunk({
                            reply: replyDelta, 
                            reasoning: reasoningDelta, 
                            usage: usageData 
                        });

                    } catch (e) {
                        console.warn('处理流式数据块时发生错误:', e, `原始数据块: "${jsonDataString}"`);
                        continue; 
                    }
                }
            }

        } else { // 非流式响应
            const responseData = await response.json();
            if (!response.ok) throw new Error(responseData.error?.message || JSON.stringify(responseData));
            
            let finalReply = '', finalReasoning = null;
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

        // ★★★ 核心修复：最终返回前统一处理 accumulatedAssistantReply 和 accumulatedThinkingForDisplay ★★★
        // 确保 accumulatedAssistantReply 是纯粹的回复文本，accumulatedThinkingForDisplay 是纯粹的思考文本。
        // 如果在流式过程中没有收到独立的 reasoningDelta，但 accumulatedAssistantReply 包含了嵌入式思考标签，
        // 则在这里进行最终的提取和清理。
        if (!(accumulatedThinkingForDisplay?.trim()) && accumulatedAssistantReply.includes('<think>') && accumulatedAssistantReply.includes('</think>')) {
            const extraction = utils.extractThinkingAndReply(accumulatedAssistantReply, '<think>', '</think>');
            accumulatedAssistantReply = extraction.replyText.trim(); // 移除 <think> 标签
            accumulatedThinkingForDisplay = extraction.thinkingText.trim(); // 提取嵌入式思考
        } else {
            // 否则，只是简单地修剪空白字符
            accumulatedAssistantReply = accumulatedAssistantReply.trim();
            accumulatedThinkingForDisplay = accumulatedThinkingForDisplay?.trim() || null;
        }

        // 最终成功返回结果对象
        return {
            success: true,
            reply: accumulatedAssistantReply, // 保证是纯净的回复
            reasoning: accumulatedThinkingForDisplay, // 保证是纯净的思考过程
            usage: usageData,
            role: providerLower === 'gemini' ? 'model' : 'assistant', 
            aborted: false
        };

    } catch (error) {
        // 处理用户中止请求 (AbortError)
        if (error.name === 'AbortError') {
            // 对于中止，也需要确保返回的 reply 和 reasoning 是纯净的
            // 重新应用最终处理逻辑
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
                reply: (accumulatedAssistantReply || "") + "\n（用户已中止）", 
                reasoning: accumulatedThinkingForDisplay, 
                usage: usageData,
                role: providerLower === 'gemini' ? 'model' : 'assistant',
                aborted: true
            };
        }
        // 处理其他类型错误
        console.error(`[API Send] 请求失败:`, error);
        return { success: false, reply: `错误: ${error.message}`, aborted: false };
    } finally {
        // state.setCurrentAbortController(null); // <-- 移除这行！
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
        const response = await fetch('/api/save-keys', {
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