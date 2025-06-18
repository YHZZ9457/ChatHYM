// --- START OF FILE netlify/functions/gemini-proxy.mjs (最终、最安全、只增不减的修复版) ---

/**
 * 将内部对话历史映射为 Gemini API 所需的、严格交替角色的 `contents` 格式。
 * @param {Array} messagesHistory - 从前端传来的原始对话历史数组
 * @returns {Array} - 符合 Gemini API 规范的 contents 数组
 */
function mapMessagesForGemini(messagesHistory) {
    const mappedContents = [];
    let lastRole = '';

    messagesHistory.forEach(msg => {
        if (!msg || !msg.role || !msg.content) return;
        if (msg.role === 'system') {
            const nextUserMsg = messagesHistory.find(m => m.role === 'user');
            if (nextUserMsg) {
                let textContent = (typeof nextUserMsg.content === 'string') ? nextUserMsg.content : (nextUserMsg.content?.text || "");
                nextUserMsg.content = `${msg.content}\n\n${textContent}`;
            }
            return;
        }
        const currentRole = (msg.role === 'assistant' || msg.role === 'model') ? 'model' : 'user';
        let textContent = (typeof msg.content === 'string') ? msg.content : (msg.content?.text || "");
        if (!textContent.trim()) return;
        if (mappedContents.length > 0 && lastRole === currentRole) {
            mappedContents[mappedContents.length - 1].parts.push({ text: textContent });
        } else {
            mappedContents.push({ role: currentRole, parts: [{ text: textContent }] });
            lastRole = currentRole;
        }
    });

    if (mappedContents.length > 0 && mappedContents[0].role !== 'user') {
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
    const { model, messages, stream, temperature, max_tokens, isManualThinkModeEnabled } = requestBody;

    // ★★★ 核心修复：在这里增加一个防御性检查 ★★★
    if (!Array.isArray(messages)) {
        console.error('[Gemini Proxy] "messages" field is missing or not an array in the request body.');
        return Response.json({ error: { message: 'Bad Request: "messages" field is required and must be an array.' } }, {
            status: 400,
            headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }
        });
    }
    // ★★★ 增加结束 ★★★

    const geminiContents = mapMessagesForGemini(messages);

    const geminiPayload = {
      contents: geminiContents,
      generationConfig: {
        ...(temperature !== undefined && { temperature }),
        ...(max_tokens !== undefined && { maxOutputTokens: max_tokens }),
        thinkingConfig: {},
      },
    };

    if (isManualThinkModeEnabled) {
      geminiPayload.generationConfig.thinkingConfig.thinkingBudget = -1;
      console.log(`[Gemini Proxy] Thinking ENABLED for ${model} via thinkingBudget: -1.`);
    } else {
      if (model && model.includes('flash')) {
        geminiPayload.generationConfig.thinkingConfig.thinkingBudget = 0;
        console.log(`[Gemini Proxy] Thinking DISABLED for Flash model via thinkingBudget: 0.`);
      } else {
        delete geminiPayload.generationConfig.thinkingConfig;
        console.log(`[Gemini Proxy] Thinking config omitted for Pro model: ${model}.`);
      }
    }
    
    if (stream) {
        // --- 流式处理 (您的完整代码，保持不变) ---
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
                            await writer.write(encoder.encode(line + '\n\n'));
                        }
                    }
                }
                if (buffer.trim().startsWith('data:')) {
                    await writer.write(encoder.encode(buffer.trim() + '\n\n'));
                }
            } catch (error) { console.error('[Gemini Proxy] Stream processing error:', error); await writer.abort(error); } 
            finally { await writer.close(); }
        })();
        return new Response(readable, { status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' } });

    } else {
        // --- 非流式处理 (您的完整代码，保持不变) ---
        const geminiEndpoint = `${GEMINI_API_BASE_URL}${model}:generateContent?key=${API_KEY}`;
        console.log(`[Gemini Proxy] Requesting to NON-STREAMING endpoint: ${model}`);
        console.log('[Gemini Proxy] Final Payload:', JSON.stringify(geminiPayload, null, 2));

        const apiResponse = await fetch(geminiEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(geminiPayload) });

        const responseText = await apiResponse.text();
        const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

        if (!apiResponse.ok) {
            try {
                JSON.parse(responseText);
                return new Response(responseText, { status: apiResponse.status, headers });
            } catch (e) {
                const errorPayload = JSON.stringify({ error: { message: responseText || "Unknown API error" } });
                return new Response(errorPayload, { status: apiResponse.status, headers });
            }
        }

        try {
            JSON.parse(responseText);
            return new Response(responseText, { status: 200, headers });
        } catch (e) {
            const errorPayload = JSON.stringify({ error: { message: "API returned a success status but the response was not valid JSON." } });
            return new Response(errorPayload, { status: 502, headers });
        }
    }

  } catch (error) {
    console.error('[Gemini Proxy] Proxy internal error:', error);
    return Response.json({ error: { message: 'Proxy internal error', details: error.message } }, { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } });
  }
};