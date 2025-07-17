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
 * (V3 版：支持 forceSimpleContent 标志，并优化了代码结构)
 *
 * @param {Array} messagesHistory - 内部对话历史数组。
 * @param {string} provider - API 提供商的小写标识符 ('openai', 'anthropic', 'ollama', etc.)。
 * @param {boolean} [forceSimpleContent=false] - 如果为 true，则强制用户消息的 content 字段为纯字符串，忽略所有文件和富文本结构。
 * @returns {Array} - 符合目标 API 规范的 messages 数组。
 */
export function mapMessagesForStandardOrClaude(messagesHistory, provider, forceSimpleContent = false) {
    const mappedApiMessages = messagesHistory.map(msg => {
        // 1. 处理 System 消息
        // Anthropic 和 Ollama 的 system 消息在 API 调用顶层单独处理，这里返回 null 以便过滤掉。
        if (msg.role === 'system') {
            if (provider === 'anthropic' || provider === 'ollama') return null;
            return { role: 'system', content: msg.content };
        }

        // 2. 处理 Assistant 消息
        if (msg.role === 'assistant' || msg.role === 'model') {
            // 确保 content 是字符串
            const assistantContent = (typeof msg.content === 'string') 
                ? msg.content 
                : (msg.content?.text || ''); // 如果是对象，则取 text，否则为空字符串
            return { role: 'assistant', content: assistantContent };
        }

        // 3. 处理 User 消息 (核心逻辑)
        if (msg.role === 'user') {
            // 提取核心文本，无论 content 是字符串还是对象
            let mainText = '';
            if (typeof msg.content === 'string') {
                mainText = msg.content;
            } else if (msg.content && typeof msg.content.text === 'string') {
                mainText = msg.content.text;
            }

            // ★ 如果设置了 forceSimpleContent，则直接返回纯文本格式的消息 ★
            if (forceSimpleContent) {
                return { role: 'user', content: mainText.trim() || ' ' };
            }

            // --- 以下是处理富文本和多模态内容的逻辑 ---
            
            const contentParts = [];
            const ollamaImages = []; // Ollama 的图片是特殊字段
            const files = msg.content?.files || [];

            // 总是先添加文本部分 (除非是 Ollama 且没有文本)
            // ★ 核心修复：仅当 mainText 实际包含非空白内容时，才添加文本部分。
            // 这可以防止在仅上传文件时，自动添加一个空的或只含空格的文本块，从而导致 Anthropic API 报错。
            if (mainText.trim()) {
                contentParts.push({ type: 'text', text: mainText.trim() });
            }

            // 遍历文件并根据 provider 规则进行处理
            if (files.length > 0) {
                for (const fileData of files) {
                    const isImage = fileData.type?.startsWith('image/');
                    
                    if (!fileData.base64) continue; // 跳过没有 Base64 数据的文件

                    // 特例 1: Ollama
                    if (provider === 'ollama') {
                        if (isImage) {
                            ollamaImages.push(fileData.base64.split(',')[1]);
                        } else {
                            try {
                                const decodedContent = atob(fileData.base64.split(',')[1]);
                                mainText += `\n\n--- 附件内容 (${fileData.name}): ---\n${decodedContent}\n--- 附件内容结束 ---`;
                            } catch (e) {
                                console.warn(`Failed to decode attachment for Ollama: ${fileData.name}`, e);
                            }
                        }
                    } 
                    // 特例 2: Anthropic 图片
                    else if (provider === 'anthropic' && isImage) {
                        contentParts.push({
                            type: "image",
                            source: {
                                type: "base64",
                                media_type: fileData.type,
                                data: fileData.base64.split(',')[1]
                            }
                        });
                    } 
                    // 默认行为 (OpenAI 兼容)
                    else {
                        if (isImage) {
                            contentParts.push({
                                type: "image_url",
                                image_url: { url: fileData.base64 }
                            });
                        } else {
                            try {
                                const decodedContent = atob(fileData.base64.split(',')[1]);
                                contentParts.push({
                                    type: 'text',
                                    text: `\n\n--- 附件内容 (${fileData.name}): ---\n${decodedContent}\n--- 附件内容结束 ---`
                                });
                            } catch (e) {
                                console.warn(`Failed to decode attachment for standard provider: ${fileData.name}`, e);
                            }
                        }
                    }
                }
            }

            // 根据 provider 返回最终格式
            if (provider === 'ollama') {
                const ollamaMessage = { role: 'user', content: mainText.trim() || ' ' };
                if (ollamaImages.length > 0) {
                    ollamaMessage.images = ollamaImages;
                }
                return ollamaMessage;
            } else {
                // 对于标准 provider，如果没有任何内容 parts，确保至少有一个空的文本 part
                if (contentParts.length === 0) {
                    contentParts.push({ type: 'text', text: ' ' });
                }
                // 如果第一个是空文本但后面有图片，确保它不是完全空的字符串
                if (contentParts[0].type === 'text' && !contentParts[0].text.trim() && contentParts.length > 1) {
                    contentParts[0].text = ' ';
                }
                return { role: 'user', content: contentParts };
            }
        }
        
        return null; // 对于未处理的角色，返回 null
    }).filter(Boolean); // 过滤掉所有返回 null 的条目

    // 4. 后处理：合并 Anthropic 的连续用户消息
    if (provider === 'anthropic' && mappedApiMessages.length > 1) {
        const mergedMessages = [mappedApiMessages[0]];
        for (let i = 1; i < mappedApiMessages.length; i++) {
            const prevMessage = mergedMessages[mergedMessages.length - 1];
            const currentMessage = mappedApiMessages[i];

            if (currentMessage.role === 'user' && prevMessage.role === 'user') {
                // 合并内容数组
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