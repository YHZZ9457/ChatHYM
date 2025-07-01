// --- START OF FILE js/message_mappers.js ---
// 此模块包含将内部对话历史格式映射到不同 AI 提供商 API
// 所需特定格式的函数。

/**
 * 将内部对话历史映射为 Gemini API 所需的、严格交替角色的 `contents` 格式。
 * 这个版本会正确地合并连续的用户消息，并处理非严格交替序列以满足 Gemini API 规则。
 * @param {Array} messagesHistory - 内部对话历史数组
 * @param {Array} currentFilesData - 当前要发送的文件数据 (包含 base64, type, name)
 * @returns {Array} - 符合 Gemini API 规范的 contents 数组
 */
export function mapMessagesForGemini(messagesHistory, currentFilesData) {
    const mappedContents = [];
    let currentUserParts = []; // 用于累积当前连续的用户消息部分
    let lastRoleAdded = null; // 追踪最后一个添加到 mappedContents 的角色

    // 遍历历史记录来构建交替的 contents
    for (const msg of messagesHistory) {
        if (msg.role === 'user') {
            // 如果上一个角色是 'user'，说明是连续的用户消息，直接累积
            // 如果上一个角色是 'model'，那么新的用户消息意味着一个新的交替回合开始
            // 但在添加到 mappedContents 之前，我们需要检查是否需要插入一个空的 model 消息
            if (lastRoleAdded === 'user' && currentUserParts.length > 0) {
                // 如果前一条也是用户消息，则继续累积
                let textContent = "";
                if (typeof msg.content === 'string') {
                    textContent = msg.content;
                } else if (msg.content && typeof msg.content.text === 'string') {
                    textContent = msg.content.text;
                } else if (Array.isArray(msg.content)) {
                    const textPart = msg.content.find(p => p.type === 'text');
                    textContent = textPart ? textPart.text : '';
                    const fileParts = msg.content.filter(p => p.type === 'file_content');
                    if (fileParts.length > 0) {
                        fileParts.forEach(fp => {
                            textContent += `\n\n--- 文件内容 (${fp.file_name}): ---\n${fp.content}\n--- 文件内容结束 ---`;
                        });
                    }
                }
                if (textContent.trim()) {
                    currentUserParts.push({ text: textContent.trim() });
                }
                continue; // 处理下一条消息，不改变 lastRoleAdded
            } else if (lastRoleAdded === 'model' || lastRoleAdded === null) {
                // 如果上一个角色是 'model' 或这是第一条消息，且当前累积的用户消息不为空
                // 那么需要先提交之前累积的用户消息，再处理当前的用户消息
                if (currentUserParts.length > 0) {
                    mappedContents.push({ role: 'user', parts: currentUserParts });
                    lastRoleAdded = 'user'; // 更新角色
                    currentUserParts = []; // 清空累加器
                }
            }

            // 检查：如果上一个角色是 'user'，但我们又到了这里，说明是一个新的用户消息块开始
            // 在添加新的用户消息之前，如果上一个是用户消息但没有模型回复，必须插入一个空的模型回复
            if (lastRoleAdded === 'user') {
                 // 这意味着前一条是用户消息，但没有模型回复。为了严格交替，必须插入一个空模型回复。
                 // 但这应该已经在遇到下一个model消息时处理了，这里可能不需要。
                 // 核心逻辑是在遇到 user 之前，如果上一个不是 model，就补 model。
            }


            // 现在开始累积当前用户消息
            let textContent = "";
            if (typeof msg.content === 'string') {
                textContent = msg.content;
            } else if (msg.content && typeof msg.content.text === 'string') {
                textContent = msg.content.text;
            } else if (Array.isArray(msg.content)) { // 如果是多模态数组
                const textPart = msg.content.find(p => p.type === 'text');
                textContent = textPart ? textPart.text : '';
                
                // 处理历史消息中可能包含的非图片文件内容，将其文本化
                const fileParts = msg.content.filter(p => p.type === 'file_content');
                if (fileParts.length > 0) {
                    fileParts.forEach(fp => {
                        textContent += `\n\n--- 文件内容 (${fp.file_name}): ---\n${fp.content}\n--- 文件内容结束 ---`;
                    });
                }
            }
            if (textContent.trim()) {
                currentUserParts.push({ text: textContent.trim() });
            }

        } else if (msg.role === 'assistant' || msg.role === 'model') {
            // 遇到助手消息时
            // 1. 如果 currentUserParts 中有累积的用户消息，将它们作为一个完整的用户回合添加到 mappedContents
            if (currentUserParts.length > 0) {
                mappedContents.push({ role: 'user', parts: currentUserParts });
                lastRoleAdded = 'user'; // 更新角色
                currentUserParts = []; // 清空累加器
            }

            // 2. 检查是否需要插入空的 user 消息来保持交替（不应该发生，因为 model 总是回答 user）
            if (lastRoleAdded === 'model') {
                // 如果上一个也是 model，这是 API 不允许的。
                // 这种情况应该通过回溯分支来避免，而不是在这里插入空 user。
                // 如果真的发生，说明历史记录逻辑有问题。
                console.warn("[Gemini Mapper] Encountered continuous 'model' messages. This violates Gemini's strict alternation. Skipping this message.", msg);
                continue; // 跳过此消息，因为它无法被正确映射
            }

            // 3. 处理当前的助手消息
            let assistantContent = "";
            if (typeof msg.content === 'string') {
                assistantContent = msg.content;
            } else if (Array.isArray(msg.content) && msg.content[0]?.type === 'text') {
                assistantContent = msg.content[0].text;
            }
            
            // 如果上一个是 'user' 且当前是 'model'，这就是完美的交替，直接添加
            mappedContents.push({
                role: 'model',
                parts: [{ text: assistantContent || " " }] // 助手消息也需要内容
            });
            lastRoleAdded = 'model'; // 更新角色
        }
        // 系统消息被忽略，因为它们在顶层单独处理（或被合并到第一条用户消息）
    }

    // 循环结束后，处理最后一轮的用户消息和当前要发送的文件
    // 这包括了历史记录中最后的连续用户消息，以及当前输入框中的文本
    if (currentUserParts.length > 0) {
        // 将当前要发送的文件添加到最后这个用户回合的 parts 中
        if (currentFilesData && currentFilesData.length > 0) {
            currentFilesData.forEach(fileData => {
                if (fileData.type && fileData.type.startsWith('image/')) {
                    currentUserParts.push({
                        inline_data: {
                            mime_type: fileData.type,
                            data: fileData.base64.split(',')[1] // 纯 Base64 数据
                        }
                    });
                } else if (fileData.type === 'text/plain' || fileData.name.toLowerCase().endsWith('.txt')) {
                    const decodedContent = atob(fileData.base64.split(',')[1]);
                    currentUserParts.push({ 
                        type: 'text', 
                        text: `\n\n--- 附件内容 (${fileData.name}): ---\n${decodedContent}\n--- 附件内容结束 ---` 
                    });
                } else {
                    currentUserParts.push({ 
                        type: 'text', 
                        text: `\n\n--- 附件: ${fileData.name} (类型 ${fileData.type} 不支持直接发送，内容可能被忽略) ---` 
                    });
                }
            });
        }
        

        if (mappedContents.length > 0 && mappedContents[mappedContents.length - 1].role === 'user') {
            // 如果最后一条是用户消息，但我们要添加新的用户消息，那么中间必须有一个模型消息。
            // 这通常发生在分支回溯到用户消息，然后又添加新的用户消息作为新的 API 请求时。
            // 解决办法是插入一个空的模型消息。
            mappedContents.push({ role: 'model', parts: [{ text: " " }] }); // 插入一个空回复
        }

        mappedContents.push({
            role: 'user',
            parts: currentUserParts
        });
    }

    return mappedContents;
}

/**
 * 将内部对话历史映射为 OpenAI, Anthropic, Ollama 等 API 所需的 `messages` 格式。
 * @param {Array} messagesHistory - 内部对话历史数组
 * @param {string} provider - API 提供商 ('openai', 'anthropic', 'ollama', etc.)
 * @param {Array} currentFilesData - 当前要发送的文件数据 (包含 base64, type, name)
 * @returns {Array} - 符合 API规范的 messages 数组
 */
export function mapMessagesForStandardOrClaude(messagesHistory, provider, currentFilesData) {
    // 1. 映射历史消息
    const mappedApiMessages = messagesHistory.map(msg => {
        // --- 处理 System 消息 ---
        // Anthropic 和 Ollama 的 system prompt 在顶层单独处理，这里不加入 messages 数组
        // 对于所有 OpenAI 兼容的提供商 (包括 OpenAI 官方、DeepSeek、Siliconflow、OpenRouter 等)，
        // system 消息是作为 role: 'system' 加入 messages 数组的。
        if (msg.role === 'system') {
            if (provider === 'anthropic' || provider === 'ollama') {
                return null;
            }
            return { role: 'system', content: msg.content };
        }

        // --- 处理 Assistant 消息 ---
        if (msg.role === 'assistant' || msg.role === 'model') {
            let assistantContent = (typeof msg.content === 'string') ? msg.content : JSON.stringify(msg.content);
            return { role: 'assistant', content: assistantContent };
        }

        // --- 处理 User 消息 ---
        if (msg.role === 'user') {
            let historicTextContent = "";
            if (typeof msg.content === 'string') {
                historicTextContent = msg.content;
            } else if (msg.content && typeof msg.content.text === 'string') {
                historicTextContent = msg.content.text;
            } else if (Array.isArray(msg.content)) {
                const textPart = msg.content.find(p => p.type === 'text');
                historicTextContent = textPart ? textPart.text : '';
                
                const fileParts = msg.content.filter(p => p.type === 'file_content');
                if (fileParts.length > 0) {
                    fileParts.forEach(fp => {
                        historicTextContent += `\n\n--- 文件内容 (${fp.file_name}): ---\n${fp.content}\n--- 文件内容结束 ---`;
                    });
                }
            }
            
            // Ollama 需要纯字符串内容
            if (provider === 'ollama') {
                 return { role: 'user', content: historicTextContent.trim() || " " };
            }
            // 对于所有 OpenAI 兼容的提供商 (包括 OpenRouter), 以及 Anthropic
            // 返回多模态数组格式（即使只有文本），这符合 Vision 模型的输入要求
            return { role: 'user', content: [{ type: 'text', text: historicTextContent.trim() || " " }] };
        }

        return null;
    }).filter(Boolean);

    // 2. 特殊处理最后一轮的用户输入 (包含当前要上传的文件)
    const lastMessageIndex = mappedApiMessages.length - 1;
    if (lastMessageIndex >= 0 && mappedApiMessages[lastMessageIndex].role === 'user') {
        
        let currentPromptText = "";
        const lastMessageContent = mappedApiMessages[lastMessageIndex].content;
        if (Array.isArray(lastMessageContent) && lastMessageContent[0]?.type === 'text') {
            currentPromptText = lastMessageContent[0].text;
        } else if (typeof lastMessageContent === 'string') { // 兼容 Ollama 的历史
            currentPromptText = lastMessageContent;
        }

        // --- 根据 provider 构建最后一轮的用户消息 content ---
        if (provider === 'ollama') {
            let ollamaContentString = currentPromptText;
            if (currentFilesData && currentFilesData.length > 0) {
                 currentFilesData.forEach(fileData => {
                     if (fileData.type?.startsWith('image/')) {
                         ollamaContentString += `\n(附带图片: ${fileData.name})`;
                     } else if (fileData.type === 'text/plain' || fileData.name.toLowerCase().endsWith('.txt')) {
                         const decodedContent = atob(fileData.base64.split(',')[1]);
                         ollamaContentString += `\n\n--- 附件内容 (${fileData.name}): ---\n${decodedContent}\n--- 附件内容结束 ---`;
                     } else {
                         ollamaContentString += `\n(附带文件: ${fileData.name} - 类型 ${fileData.type} 不支持直接发送，内容可能被忽略)`;
                     }
                 });
            }
            mappedApiMessages[lastMessageIndex].content = ollamaContentString.trim() || " ";

        } else {
            // 对于所有其他支持多模态的 provider (OpenAI 兼容的通用代理, OpenRouter, Anthropic, etc.)
            let currentUserContentParts = [];
            
            // 添加文本部分
            if (currentPromptText.trim()) {
                currentUserContentParts.push({ type: 'text', text: currentPromptText.trim() });
            }

            // 添加文件部分
            if (currentFilesData && currentFilesData.length > 0) {
                currentFilesData.forEach(fileData => {
                    if (fileData.type?.startsWith('image/')) {
                        // 所有 OpenAI 兼容的 API (包括 OpenRouter) 和 Anthropic 都支持 Base64 图片
                        // 它们使用的格式略有不同
                        if (['openai', 'deepseek', 'siliconflow', 'volcengine', 'dashscope', 'together', 'perplexity', 'openrouter'].includes(provider)) { // 通用兼容代理和 OpenRouter 代理支持的提供商
                            currentUserContentParts.push({
                                type: "image_url",
                                image_url: { url: fileData.base64 } // 发送 base64 Data URL
                            });
                        } else if (provider === 'anthropic') {
                            currentUserContentParts.push({
                                type: "image",
                                source: {
                                    type: "base64",
                                    media_type: fileData.type,
                                    data: fileData.base64.split(',')[1] 
                                }
                            });
                        }
                    } else if (fileData.type === 'text/plain' || fileData.name.toLowerCase().endsWith('.txt')) {
                        const decodedContent = atob(fileData.base64.split(',')[1]);
                        currentUserContentParts.push({ 
                            type: 'text', 
                            text: `\n\n--- 附件内容 (${fileData.name}): ---\n${decodedContent}\n--- 附件内容结束 ---` 
                        });
                    } else {
                        currentUserContentParts.push({ 
                            type: 'text', 
                            text: `\n\n--- 附件: ${fileData.name} (类型 ${fileData.type} 不支持直接发送，内容可能被忽略) ---` 
                        });
                    }
                });
            }

            // 如果没有任何内容，添加一个空文本部分以避免 API 错误
            if (currentUserContentParts.length === 0) {
                currentUserContentParts.push({ type: "text", text: " " });
            }
            
            mappedApiMessages[lastMessageIndex].content = currentUserContentParts;
        }
    }

    return mappedApiMessages;
}

// --- END OF FILE js/message_mappers.js ---