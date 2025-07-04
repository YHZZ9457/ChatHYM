// --- START OF FILE js/message_mappers.js ---
// 此模块包含将内部对话历史格式映射到不同 AI 提供商 API
// 所需特定格式的函数。

/**
 * 将内部对话历史映射为 Gemini API 所需的、严格交替角色的 `contents` 格式。
 * (重构版：统一处理逻辑，正确处理文件，逻辑更健壮)
 * @param {Array} messagesHistory - 内部对话历史数组
 * @returns {Array} - 符合 Gemini API 规范的 contents 数组
 */
export function mapMessagesForGemini(messagesHistory) {
    const mappedContents = [];
    let currentUserParts = []; // 用于累积当前连续的用户消息部分

    // 1. 遍历历史记录来构建交替的 contents
    for (const msg of messagesHistory) {
        if (msg.role === 'user') {
            // 如果是用户消息，持续累积内容到 currentUserParts
            
            // a. 累积文本内容
            let textContent = "";
            if (typeof msg.content === 'string') {
                textContent = msg.content;
            } else if (msg.content && typeof msg.content.text === 'string') {
                textContent = msg.content.text;
            }
            if (textContent.trim()) {
                currentUserParts.push({ text: textContent.trim() });
            }

            // b. 累积文件内容 (图片、文本等)
            const files = msg.content?.files || [];
            if (files.length > 0) {
                files.forEach(fileData => {
                    if (fileData.type?.startsWith('image/')) {
                        currentUserParts.push({
                            inline_data: {
                                mime_type: fileData.type,
                                data: fileData.base64.split(',')[1] // 纯 Base64 数据
                            }
                        });
                    } else if (fileData.base64) { // 对其他带 base64 的文件，文本化处理
                        try {
                            const decodedContent = atob(fileData.base64.split(',')[1]);
                             currentUserParts.push({ 
                                text: `\n\n--- 附件内容 (${fileData.name}): ---\n${decodedContent}\n--- 附件内容结束 ---` 
                            });
                        } catch (e) {
                            console.warn(`Failed to decode file content for ${fileData.name}`, e);
                        }
                    }
                });
            }

        } else if (msg.role === 'assistant' || msg.role === 'model') {
            // 遇到助手消息时
            // a. 首先，如果 currentUserParts 中有累积的用户消息，将它们作为一个完整的用户回合提交
            if (currentUserParts.length > 0) {
                mappedContents.push({ role: 'user', parts: currentUserParts });
                currentUserParts = []; // 清空累加器
            }

            // b. 然后，提交当前的助手消息
            // Gemini API 要求 model 消息不能为空
            const assistantContent = (typeof msg.content === 'string' && msg.content.trim()) 
                ? msg.content.trim() 
                : (msg.content?.text?.trim() || ' '); // 提供一个空格作为回退

            mappedContents.push({
                role: 'model',
                parts: [{ text: assistantContent }]
            });
        }
    }

    // 2. 循环结束后，处理最后一轮可能存在、但尚未提交的用户消息
    if (currentUserParts.length > 0) {
        // 在添加最终的用户消息前，检查是否需要插入一个虚拟的 model 回复以维持交替
        // 这通常发生在回溯到用户消息后，又发送新用户消息的场景
        if (mappedContents.length > 0 && mappedContents[mappedContents.length - 1].role === 'user') {
            mappedContents.push({ role: 'model', parts: [{ text: "..." }] }); // 插入一个简短的、无意义的回复
        }
        mappedContents.push({ role: 'user', parts: currentUserParts });
    }

    // 3. 最终检查：确保第一条消息是 'user' 角色
    if (mappedContents.length > 0 && mappedContents[0].role !== 'user') {
        // 如果第一条是 model，这违反了 Gemini 规则，在前面插入一条空的用户消息
        mappedContents.unshift({ role: 'user', parts: [{ text: "..." }] });
    }
    
     // ★★★ 终极核心修复：确保函数绝不返回空数组 ★★★
    // 无论之前的逻辑如何，如果最终 mappedContents 是空的，
    // 我们必须提供一个最小化的有效内容，以防止 API 错误。
    if (mappedContents.length === 0) {
        console.warn("[Gemini Mapper] The mapping result was empty. This can happen with an empty or system-only history. Providing a default valid payload to prevent an API error.");
        
        // 尝试从原始历史中找到一些文本，如果找不到，就用一个默认问候语
        const firstUserMsg = messagesHistory.find(m => m.role === 'user');
        const defaultText = firstUserMsg?.content?.text || (typeof firstUserMsg?.content === 'string' ? firstUserMsg.content : null) || "你好";
        
        return [{ role: 'user', parts: [{ text: defaultText }] }];
    }

    return mappedContents;
}

/**
 * 将内部对话历史映射为 OpenAI, Anthropic, Ollama 等 API 所需的 `messages` 格式。
 * (重构版：统一处理逻辑，正确处理历史文件，移除冗余参数)
 * @param {Array} messagesHistory - 内部对话历史数组
 * @param {string} provider - API 提供商 ('openai', 'anthropic', 'ollama', etc.)
 * @returns {Array} - 符合 API规范的 messages 数组
 */
export function mapMessagesForStandardOrClaude(messagesHistory, provider) {
    // 1. 直接遍历历史记录，一次性、完整地构建 API 所需的 messages 数组
    const mappedApiMessages = messagesHistory.map(msg => {
        // --- 1a. 处理 System 消息 ---
        // Anthropic 和 Ollama 的 system prompt 在顶层单独处理，这里返回 null 会被过滤掉
        if (msg.role === 'system') {
            if (provider === 'anthropic' || provider === 'ollama') {
                return null;
            }
            return { role: 'system', content: msg.content };
        }

        // --- 1b. 处理 Assistant 消息 ---
        if (msg.role === 'assistant' || msg.role === 'model') {
            // 确保内容是字符串
            const assistantContent = (typeof msg.content === 'string') ? msg.content : (msg.content?.text || JSON.stringify(msg.content));
            return { role: 'assistant', content: assistantContent };
        }

        // --- 1c. 处理 User 消息 (核心重构部分) ---
        if (msg.role === 'user') {
            const contentParts = [];
            let mainText = '';

            // 提取文本内容
            if (typeof msg.content === 'string') {
                mainText = msg.content;
            } else if (msg.content && typeof msg.content.text === 'string') {
                mainText = msg.content.text;
            }

            // 对于支持多模态的 provider，将文本作为第一个 part
            if (provider !== 'ollama') {
                // 即使文本为空，也添加一个，以满足某些模型的格式要求
                contentParts.push({ type: 'text', text: mainText.trim() || ' ' });
            }
            
            // 提取并处理所有文件（无论是历史文件还是新上传的文件）
            const files = msg.content?.files || [];
            if (files.length > 0) {
                files.forEach(fileData => {
                    // 对于 Ollama，将文件信息文本化
                    if (provider === 'ollama') {
                        if (fileData.type?.startsWith('image/')) {
                            mainText += `\n(附带图片: ${fileData.name})`;
                        } else if (fileData.base64) { // 假设非图片文件有 base64 内容
                            try {
                                const decodedContent = atob(fileData.base64.split(',')[1]);
                                mainText += `\n\n--- 附件内容 (${fileData.name}): ---\n${decodedContent}\n--- 附件内容结束 ---`;
                            } catch (e) {
                                mainText += `\n(无法解析附件: ${fileData.name})`;
                            }
                        }
                    } else { // 对于其他多模态 provider
                        if (fileData.type?.startsWith('image/')) {
                            if (['openai', 'deepseek', 'openrouter', 'together', 'perplexity', 'volcengine', 'dashscope'].includes(provider)) {
                                contentParts.push({
                                    type: "image_url",
                                    image_url: { url: fileData.base64 } // 发送 base64 Data URL
                                });
                            } else if (provider === 'anthropic') {
                                contentParts.push({
                                    type: "image",
                                    source: {
                                        type: "base64",
                                        media_type: fileData.type,
                                        data: fileData.base64.split(',')[1]
                                    }
                                });
                            }
                        } else if (fileData.base64) { // 将非图片文件内容作为文本 part 添加
                             try {
                                const decodedContent = atob(fileData.base64.split(',')[1]);
                                contentParts.push({ 
                                    type: 'text', 
                                    text: `\n\n--- 附件内容 (${fileData.name}): ---\n${decodedContent}\n--- 附件内容结束 ---` 
                                });
                            } catch (e) {
                                 contentParts.push({ 
                                    type: 'text', 
                                    text: `\n\n--- 附件 (无法解析): ${fileData.name} ---` 
                                });
                            }
                        }
                    }
                });
            }

            // 返回最终构件好的消息对象
            if (provider === 'ollama') {
                return { role: 'user', content: mainText.trim() || ' ' };
            } else {
                 // 如果 contentParts 为空（例如只发了一个不支持的文件），确保至少有一个文本 part
                if (contentParts.length === 0) {
                    contentParts.push({ type: 'text', text: ' ' });
                }
                // 如果第一个文本 part 为空，但后面有其他内容，将其填充一下
                if (contentParts[0].type === 'text' && !contentParts[0].text.trim() && contentParts.length > 1) {
                    contentParts[0].text = ' ';
                }
                return { role: 'user', content: contentParts };
            }
        }
        return null;
    }).filter(Boolean); // 过滤掉返回 null 的消息 (例如 Anthropic 的 system 消息)

    // 2. Anthropic 的特殊规则：不允许连续的用户消息
    // 如果是 Anthropic，并且出现连续的用户消息，需要合并它们
    if (provider === 'anthropic' && mappedApiMessages.length > 1) {
        const mergedMessages = [mappedApiMessages[0]];
        for (let i = 1; i < mappedApiMessages.length; i++) {
            const prevMessage = mergedMessages[mergedMessages.length - 1];
            const currentMessage = mappedApiMessages[i];

            if (currentMessage.role === 'user' && prevMessage.role === 'user') {
                // 合并内容
                prevMessage.content.push(...currentMessage.content);
            } else {
                mergedMessages.push(currentMessage);
            }
        }
        return mergedMessages;
    }

    return mappedApiMessages;
}


// --- END OF FILE js/message_mappers.js ---