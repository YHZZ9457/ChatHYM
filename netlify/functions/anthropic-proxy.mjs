// netlify/functions/anthropic-proxy.mjs

console.log("Anthropic Proxy Function Loaded. Reading ANTHROPIC_API_KEY_SECRET from env.");

// 只读一次环境变量
const API_KEY = process.env.ANTHROPIC_API_KEY_SECRET;
const API_URL = 'https://api.anthropic.com/v1/messages';

export default async function handler(request, context) {
  // ---- 1. CORS ----
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, anthropic-version'
      }
    });
  }

  // ---- 2. 只允许 POST ----
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed', code: 405 }), {
      status: 405, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  // ---- 3. 检查 API Key ----
  if (!API_KEY) {
    return new Response(JSON.stringify({ error: 'Server Configuration Error: Anthropic API Key not set.', code: 500 }), {
      status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  // ---- 4. 解析请求体 ----
  let requestBody;
  try {
    if (!request.body) throw new Error("Request body is missing.");
    requestBody = await request.json();
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Bad Request: Invalid or missing JSON body', code: 400 }), {
      status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  // ---- 5. 参数校验（允许更多字段: tools, system等）----
  const { model, messages, temperature, max_tokens, stream, tools, system } = requestBody;
  if (!model || !messages || !Array.isArray(messages)) {
    return new Response(JSON.stringify({ error: 'Bad Request: "model" and "messages" (as array) are required.', code: 400 }), {
      status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  // 检查 content 结构（字符串 or content-block）
  for (const m of messages) {
    if (Array.isArray(m.content)) {
      // content-block 校验
      if (
        !m.content.length ||
        !m.content.every(
          item =>
            item.type === 'text' &&
            typeof item.text === 'string' &&
            item.text.length > 0
        )
      ) {
        return new Response(
          JSON.stringify({ error: 'Bad Request: Invalid content block array in message.', code: 400 }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
          }
        );
      }
    } else if (typeof m.content !== 'string' || !m.content.trim()) {
      return new Response(
        JSON.stringify({ error: 'Bad Request: Each message content must be non-empty string or valid content block.', code: 400 }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        }
      );
    }
  }

  // 固定 API 版本号为 "2023-06-01"
  const API_VERSION = "2023-06-01";

  // ---- 6. 构建 payload ----
  const anthropicPayload = {
    model,
    messages,
    max_tokens: max_tokens || 4096,
    temperature: temperature !== undefined ? parseFloat(temperature) : 0.7,
    stream: !!stream,
  };

  // 透传 tools 字段
  if (tools) anthropicPayload.tools = tools;

  // 顶层 system 兼容
  if (system) {
    anthropicPayload.system = system;
  } else {
    const systemPromptMsg = messages.find(m => m.role === 'system');
    if (systemPromptMsg && systemPromptMsg.content) {
      anthropicPayload.system = Array.isArray(systemPromptMsg.content)
        ? systemPromptMsg.content.map(c => c.text || '').join('\n')
        : systemPromptMsg.content;
      anthropicPayload.messages = messages.filter(m => m.role !== 'system');
    }
  }

  console.log(`[Anthropic Proxy] API_VERSION: ${API_VERSION}`);
  console.log("[Anthropic Proxy] Payload:", JSON.stringify(anthropicPayload).substring(0, 800));

  // ---- 7. 请求 Claude API ----
  try {
    const apiResponse = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': API_VERSION,
        'Accept': anthropicPayload.stream ? 'text/event-stream' : 'application/json',
      },
      body: JSON.stringify(anthropicPayload),
    });

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      let errorDetail = errorText;
      try {
        const errJson = JSON.parse(errorText);
        errorDetail = errJson.error?.message || errJson.error?.type || JSON.stringify(errJson);
      } catch(e) { /* ignore */ }
      return new Response(
        JSON.stringify({ error: `Anthropic API Error (${apiResponse.status})`, code: apiResponse.status, details: errorDetail }),
        {
          status: apiResponse.status,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        }
      );
    }

    const responseContentTypeHeader = apiResponse.headers.get('content-type') || '';
    if (anthropicPayload.stream && responseContentTypeHeader.includes('text/event-stream') && apiResponse.body) {
      return new Response(apiResponse.body, {
        status: apiResponse.status,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
        }
      });
    } else if (apiResponse.body) {
      const responseDataText = await apiResponse.text();
      let finalContentType = responseContentTypeHeader || 'text/plain';
      try {
        JSON.parse(responseDataText);
        if (responseContentTypeHeader.includes('application/json')) {
          finalContentType = 'application/json';
        }
      } catch(e) { }
      return new Response(responseDataText, {
        status: apiResponse.status,
        headers: { 'Content-Type': finalContentType, 'Access-Control-Allow-Origin': '*' }
      });
    } else {
      return new Response(
        JSON.stringify({ error: "Empty response body from Anthropic API despite success status.", code: 204 }),
        {
          status: 204,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        }
      );
    }
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Proxy failed to fetch from Anthropic API', code: 502, details: error.message }),
      {
        status: 502,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      }
    );
  }
}
