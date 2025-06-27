// --- START OF FILE netlify/functions/gemini-proxy.mjs (最终、最安全、最协同的修复版) ---

/**
 * 将内部对话历史映射为 Gemini API 所需的、严格交替角色的 `contents` 格式。
 * 注意：这个函数是后端代理内部使用的，它期望接收前端传来的原始 `messages` 数组。
 * @param {Array} messagesHistory - 从前端传来的原始对话历史数组 (可能包含 text/files 混合内容)
 * @returns {Array} - 符合 Gemini API 规范的 contents 数组 (role: 'user'/'model', parts: [{text: ...}, {inline_data: ...}])
 */
function mapMessagesForGemini(messagesHistory) {
    const mappedContents = [];
    let lastRole = '';
    let currentUserParts = []; // 用于累积当前连续的用户消息部分

    // 遍历历史记录来构建交替的 contents
    for (const msg of messagesHistory) {
        if (!msg || !msg.role || !msg.content) continue; // 跳过无效消息

        // 系统消息在后端代理中通常需要特殊处理，例如合并到下一条用户消息中
        // 或者直接忽略，因为Gemini API通常不支持顶层System Prompt，而是通过Instruction Tuning
        // 但为了兼容性，如果前端将System Prompt放在messagesHistory中，这里可以尝试处理
        if (msg.role === 'system') {
            // 策略：将系统消息合并到第一个用户消息的开头
            // 如果没有用户消息，则忽略此系统消息（Gemini API不支持单独的系统消息）
            const nextUserMsg = messagesHistory.find(m => m.role === 'user' && m.id !== msg.id); // 找一个不同的用户消息
            if (nextUserMsg && typeof nextUserMsg.content === 'object' && nextUserMsg.content.text) {
                nextUserMsg.content.text = `${msg.content}\n\n${nextUserMsg.content.text}`;
            } else if (nextUserMsg && typeof nextUserMsg.content === 'string') {
                 nextUserMsg.content = `${msg.content}\n\n${nextUserMsg.content}`;
            }
            continue; // 系统消息不直接映射为 contents 中的 role
        }

        const currentRole = (msg.role === 'assistant' || msg.role === 'model') ? 'model' : 'user';
        
        // 处理消息内容：可能是纯字符串，也可能是 { text: "...", files: [...] } 对象
        let parts = [];
        if (typeof msg.content === 'string') {
            if (msg.content.trim()) parts.push({ text: msg.content.trim() });
        } else if (msg.content && typeof msg.content === 'object') {
            if (msg.content.text && msg.content.text.trim()) {
                parts.push({ text: msg.content.text.trim() });
            }
            // 处理文件数据 (Base64)
            if (Array.isArray(msg.content.files) && msg.content.files.length > 0) {
                msg.content.files.forEach(fileData => {
                    if (fileData.type && fileData.type.startsWith('image/') && fileData.base64) {
                        parts.push({
                            inline_data: {
                                mime_type: fileData.type,
                                data: fileData.base64.split(',')[1] // 确保只取纯 Base64 数据
                            }
                        });
                    }
                });
            }
        }

        // 如果没有内容部分（例如，只有空字符串或空文件数组），则跳过此消息
        if (parts.length === 0) {
            // 如果是用户消息但没有内容，为了保持交替，可以添加一个空文本部分
            if (currentRole === 'user') {
                currentUserParts.push({ text: " " });
            }
            continue;
        }

        // 核心逻辑：合并连续的相同角色的消息
        if (currentRole === 'user') {
            currentUserParts.push(...parts); // 累积用户消息的所有部分
        } else { // 'model' 角色
            // 如果有累积的用户消息，先将它们添加为上一轮的用户回合
            if (currentUserParts.length > 0) {
                mappedContents.push({ role: 'user', parts: currentUserParts });
                currentUserParts = []; // 清空累加器
            }
            
            // 如果当前 'model' 消息与前一条 'model' 消息连续，则合并
            if (lastRole === 'model') {
                mappedContents[mappedContents.length - 1].parts.push(...parts);
            } else {
                mappedContents.push({ role: 'model', parts: parts });
            }
            lastRole = 'model';
        }
    }

    // 循环结束后，处理最后一轮可能存在的用户消息
    if (currentUserParts.length > 0) {
        mappedContents.push({ role: 'user', parts: currentUserParts });
    }

    // 最后，确保 Gemini API 的内容以 'user' 角色开头（如果不是）
    // Gemini API 要求对话必须以用户消息开始，即使内容为空。
    if (mappedContents.length === 0 || mappedContents[0].role !== 'user') {
        mappedContents.unshift({ role: 'user', parts: [{ text: " " }] });
    }

    return mappedContents;
}


export default async (request, context) => {
  const API_KEY = process.env.GEMINI_API_KEY_SECRET;
  const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models/';

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
  }

  if (!API_KEY) {
    return Response.json({ error: { message: 'Server Configuration Error: Gemini API Key not set.' } }, { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } });
  }

  try {
    const requestBody = await request.json();
    // ★★★ 核心修复：确保从前端接收的是 'messages' 字段 ★★★
    const { model, messages, stream, temperature, max_tokens, isManualThinkModeEnabled } = requestBody;

    // 防御性检查
    if (!Array.isArray(messages)) {
        console.error('[Gemini Proxy] "messages" field is missing or not an array in the request body.');
        return Response.json({ error: { message: 'Bad Request: "messages" field is required and must be an array.' } }, {
            status: 400,
            headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }
        });
    }

    // ★★★ 核心修复：将接收到的 'messages' 传递给后端代理自己的 mapMessagesForGemini ★★★
    const geminiContents = mapMessagesForGemini(messages);

    // ★★★ 核心修复：最终发送给 Gemini API 的 payload 必须使用 'contents' 字段 ★★★
    const geminiPayload = {
      contents: geminiContents, // 这里是关键，把映射后的结果放到 contents
      generationConfig: {
        ...(temperature !== undefined && { temperature }),
        ...(max_tokens !== undefined && { maxOutputTokens: max_tokens }),
        thinkingConfig: {}, // 初始化 thinkingConfig
      },
      // safetySettings 也可以在这里添加，如果需要的话
    };

    // Thinking Mode Logic
    if (isManualThinkModeEnabled) {
      // For manual thinking, set budget to -1 (unlimited)
      geminiPayload.generationConfig.thinkingConfig.thinkingBudget = -1;
      console.log(`[Gemini Proxy] Thinking ENABLED for ${model} via thinkingBudget: -1.`);
    } else {
      // For auto-thinking or no thinking, default behavior
      // Gemini 1.5 Flash 默认启用思考，可以通过 thinkingBudget: 0 禁用
      if (model && model.includes('flash')) {
        geminiPayload.generationConfig.thinkingConfig.thinkingBudget = 0; // Disable thinking for Flash
        console.log(`[Gemini Proxy] Thinking DISABLED for Flash model via thinkingBudget: 0.`);
      } else {
        // For other models (e.g., Gemini 1.0 Pro), remove thinkingConfig entirely to rely on model defaults
        delete geminiPayload.generationConfig.thinkingConfig;
        console.log(`[Gemini Proxy] Thinking config omitted for Pro model: ${model}.`);
      }
    }
    
    if (stream) {
        const geminiEndpoint = `${GEMINI_API_BASE_URL}${model}:streamGenerateContent?key=${API_KEY}&alt=sse`;
        console.log(`[Gemini Proxy] Requesting to STREAMING endpoint: ${model}`);
        console.log('[Gemini Proxy] Final Payload:', JSON.stringify(geminiPayload, null, 2));
        
        const apiResponse = await fetch(geminiEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(geminiPayload) });

        if (!apiResponse.ok) {
            const errorData = await apiResponse.json();
            return Response.json(errorData, { status: apiResponse.status, headers: { 'Access-Control-Allow-Origin': '*' } });
        }

        const { readable, writable } = new TransformStream();
        const writer = writable.getWriter();
        const encoder = new TextEncoder();
        const decoder = new TextDecoder();
        (async () => {
            let buffer = '';
            const reader = apiResponse.body.getReader();
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    buffer += decoder.decode(value, { stream: true });
                    let boundaryIndex;
                    while ((boundaryIndex = buffer.indexOf('\n')) !== -1) {
                        const line = buffer.substring(0, boundaryIndex).trim();
                        buffer = buffer.substring(boundaryIndex + 1);
                        if (line.startsWith('data:')) {
                            await writer.write(encoder.encode(line + '\n\n')); // Keep data: prefix for SSE
                        }
                    }
                }
                if (buffer.trim().startsWith('data:')) { // Handle any leftover buffer
                    await writer.write(encoder.encode(buffer.trim() + '\n\n'));
                }
            } catch (error) { 
                console.error('[Gemini Proxy] Stream processing error:', error); 
                await writer.abort(error); // Abort the writable stream on error
            } finally { 
                await writer.close(); // Close the writable stream when done
            }
        })();
        return new Response(readable, { status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' } });

    } else {
        const geminiEndpoint = `${GEMINI_API_BASE_URL}${model}:generateContent?key=${API_KEY}`;
        console.log(`[Gemini Proxy] Requesting to NON-STREAMING endpoint: ${model}`);
        console.log('[Gemini Proxy] Final Payload:', JSON.stringify(geminiPayload, null, 2));

        const apiResponse = await fetch(geminiEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(geminiPayload) });

        const responseText = await apiResponse.text();
        const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

        if (!apiResponse.ok) {
            try {
                JSON.parse(responseText); // Attempt to parse error as JSON
                return new Response(responseText, { status: apiResponse.status, headers });
            } catch (e) {
                // If not JSON, return a generic error
                const errorPayload = JSON.stringify({ error: { message: responseText || "Unknown API error" } });
                return new Response(errorPayload, { status: apiResponse.status, headers });
            }
        }

        try {
            JSON.parse(responseText); // Ensure success response is valid JSON
            return new Response(responseText, { status: 200, headers });
        } catch (e) {
            const errorPayload = JSON.stringify({ error: { message: "API returned a success status but the response was not valid JSON." } });
            return new Response(errorPayload, { status: 502, headers }); // Bad Gateway if JSON is invalid
        }
    }

  } catch (error) {
    console.error('[Gemini Proxy] Proxy internal error:', error);
    return Response.json({ error: { message: 'Proxy internal error', details: error.message } }, { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } });
  }
};