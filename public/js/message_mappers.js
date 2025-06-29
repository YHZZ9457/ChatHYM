// --- START OF FILE js/message_mappers.js ---
// 此模块包含将内部对话历史格式映射到不同 AI 提供商 API
// 所需特定格式的函数。

/**
 * 将内部对话历史映射为 Gemini API 所需的、严格交替角色的 `contents` 格式。
 * 这个版本会正确地合并连续的用户消息。
 * @param {Array} messagesHistory - 内部对话历史数组
 * @param {Array} currentFilesData - 当前要发送的文件数据 (包含 base64, type, name)
 * @returns {Array} - 符合 Gemini API 规范的 contents 数组
 */
export function mapMessagesForGemini(messagesHistory, currentFilesData) {
    const mappedContents = [];
    let currentUserParts = []; // 用于累积当前连续的用户消息部分

    // 遍历历史记录来构建交替的 contents
    for (const msg of messagesHistory) {
        if (msg.role === 'user') {
            // 如果是用户消息，将其内容添加到 currentUserParts 累加器中
            let textContent = "";
            if (typeof msg.content === 'string') {
                textContent = msg.content;
            } else if (msg.content && typeof msg.content.text === 'string') {
                textContent = msg.content.text;
            } else if (Array.isArray(msg.content)) { // 如果是多模态数组
                const textPart = msg.content.find(p => p.type === 'text');
                textContent = textPart ? textPart.text : '';
                
                // ★ 核心修复：处理历史消息中可能包含的非图片文件内容，将其文本化
                // 假设历史中可能保存了 { type: 'file_content', file_name: '...', content: '...' }
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
            // 遇到助手消息时，意味着之前的用户消息回合结束了
            // 1. 首先，如果 currentUserParts 中有累积的用户消息，将它们作为一个完整的用户回合添加到 mappedContents
            if (currentUserParts.length > 0) {
                mappedContents.push({
                    role: 'user',
                    parts: currentUserParts
                });
                currentUserParts = []; // 清空累加器，为下一个用户回合做准备
            }

            // 2. 然后，处理当前的助手消息
            let assistantContent = "";
            if (typeof msg.content === 'string') {
                assistantContent = msg.content;
            } else if (Array.isArray(msg.content) && msg.content[0]?.type === 'text') {
                assistantContent = msg.content[0].text;
            }
            
            mappedContents.push({
                role: 'model',
                parts: [{ text: assistantContent || " " }] // 助手消息也需要内容
            });
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
                    // ★ 核心修复：对于文本文件，将其内容读取并作为文本部分追加到 Prompt
                    const decodedContent = atob(fileData.base64.split(',')[1]); // Base64 解码纯文本内容
                    currentUserParts.push({ 
                        type: 'text', 
                        text: `\n\n--- 附件内容 (${fileData.name}): ---\n${decodedContent}\n--- 附件内容结束 ---` 
                    });
                } else {
                    // 对于其他不支持的文件类型，添加提示文本
                    currentUserParts.push({ 
                        type: 'text', 
                        text: `\n\n--- 附件: ${fileData.name} (类型 ${fileData.type} 不支持直接发送，内容可能被忽略) ---` 
                    });
                }
            });
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
        if (msg.role === 'system') {
            if (provider === 'anthropic' || provider === 'ollama') {
                return null; // 返回 null，稍后过滤掉
            }
            return { role: 'system', content: msg.content };
        }

        // --- 处理 Assistant 消息 ---
        if (msg.role === 'assistant' || msg.role === 'model') {
            // 假设历史助手的 content 已经是 string 或兼容的格式
            let assistantContent = (typeof msg.content === 'string') ? msg.content : JSON.stringify(msg.content);
            return { role: 'assistant', content: assistantContent };
        }

        // --- 处理 User 消息 ---
        if (msg.role === 'user') {
            // 对于历史消息，我们简化处理：
            // - 不处理历史文件，只处理文本
            // - 将 content 统一转换为字符串格式，以适应所有 provider 的历史记录
            let historicTextContent = "";
            if (typeof msg.content === 'string') {
                historicTextContent = msg.content;
            } else if (msg.content && typeof msg.content.text === 'string') {
                historicTextContent = msg.content.text;
            } else if (Array.isArray(msg.content)) { // 如果是多模态数组
                const textPart = msg.content.find(p => p.type === 'text');
                historicTextContent = textPart ? textPart.text : '';
                
                // ★ 修复：处理历史消息中可能包含的非图片文件内容，将其文本化
                // 如果历史中保存了 { type: 'file_content', file_name: '...', content: '...' }
                const fileParts = msg.content.filter(p => p.type === 'file_content');
                if (fileParts.length > 0) {
                    fileParts.forEach(fp => {
                        historicTextContent += `\n\n--- 文件内容 (${fp.file_name}): ---\n${fp.content}\n--- 文件内容结束 ---`;
                    });
                }
            }
            
            // 为 Ollama 返回纯字符串内容
            if (provider === 'ollama') {
                 return { role: 'user', content: historicTextContent.trim() || " " };
            }
            // 为其他 provider 返回多模态数组格式（即使只有文本）
            return { role: 'user', content: [{ type: 'text', text: historicTextContent.trim() || " " }] };
        }

        return null; // 对于未知的 role，返回 null
    }).filter(Boolean); // 过滤掉所有被返回为 null 的消息

    // 2. 特殊处理最后一轮的用户输入 (包含当前要上传的文件)
    const lastMessageIndex = mappedApiMessages.length - 1;
    if (lastMessageIndex >= 0 && mappedApiMessages[lastMessageIndex].role === 'user') {
        
        // 获取最后一条用户消息的文本
        let currentPromptText = "";
        const lastMessageContent = mappedApiMessages[lastMessageIndex].content;
        if (Array.isArray(lastMessageContent) && lastMessageContent[0]?.type === 'text') {
            currentPromptText = lastMessageContent[0].text;
        } else if (typeof lastMessageContent === 'string') { // 兼容 Ollama 的历史
            currentPromptText = lastMessageContent;
        }

        // --- 根据 provider 构建最后一轮的用户消息 content ---
        if (provider === 'ollama') {
            // Ollama 需要纯字符串，并将图片信息作为文本描述
            let ollamaContentString = currentPromptText;
            if (currentFilesData && currentFilesData.length > 0) {
                 currentFilesData.forEach(fileData => { // 遍历所有文件
                     if (fileData.type?.startsWith('image/')) {
                         // Ollama 可以直接处理 Base64 图像，但通常图片是作为单独的 'images' 字段
                         // 如果你的 Ollama Proxy 期望图片 Base64 在 content 中，那保留此逻辑
                         // 否则，更常见的 Ollama 图像处理是通过 bodyPayload.images 数组
                         ollamaContentString += `\n(附带图片: ${fileData.name})`; // 简单描述图片
                     } else if (fileData.type === 'text/plain' || fileData.name.toLowerCase().endsWith('.txt')) {
                         // ★ 核心修复：对于文本文件，将其内容直接追加到 Prompt
                         const decodedContent = atob(fileData.base64.split(',')[1]); // Base64 解码纯文本内容
                         ollamaContentString += `\n\n--- 附件内容 (${fileData.name}): ---\n${decodedContent}\n--- 附件内容结束 ---`;
                     } else {
                         // 对于其他不支持的文件类型，提示用户或忽略
                         ollamaContentString += `\n(附带文件: ${fileData.name} - 类型 ${fileData.type} 不支持直接发送，内容可能被忽略)`;
                     }
                 });
            }
            mappedApiMessages[lastMessageIndex].content = ollamaContentString.trim() || " ";

        } else {
            // 对于所有其他支持多模态的 provider (OpenAI, Anthropic, Volcengine, etc.)
            let currentUserContentParts = [];
            
            // 添加文本部分
            if (currentPromptText.trim()) {
                currentUserContentParts.push({ type: 'text', text: currentPromptText.trim() });
            }

            // 添加文件部分
            if (currentFilesData && currentFilesData.length > 0) {
                currentFilesData.forEach(fileData => {
                    if (fileData.type?.startsWith('image/')) {
                        // OpenAI, Deepseek, Siliconflow, Volcengine, OpenRouter 使用相同的 image_url 格式
                        if (['openai', 'deepseek', 'siliconflow', 'volcengine', 'openrouter'].includes(provider)) {
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
                        // ★ 核心修复：对于文本文件，将其内容读取并作为文本部分追加到 Prompt
                        const decodedContent = atob(fileData.base64.split(',')[1]); // Base64 解码纯文本内容
                        currentUserContentParts.push({ 
                            type: 'text', 
                            text: `\n\n--- 附件内容 (${fileData.name}): ---\n${decodedContent}\n--- 附件内容结束 ---` 
                        });
                    } else {
                        // 对于其他不支持的文件类型，添加提示文本
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