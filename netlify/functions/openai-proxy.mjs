// netlify/functions/openai-proxy.mjs


console.log("OpenAI Proxy Function Loaded. Reading OPENAI_API_KEY_SECRET from env.");

export default async function handler(request, context) {
  const API_KEY = process.env.OPENAI_API_KEY_SECRET;
  const API_URL = 'https://api.openai.com/v1/chat/completions';

  console.log("[OpenAI Proxy] 被调用，方法:", request.method);

  // 1. CORS 预检处理 (OPTIONS 请求)
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204, // No Content
      headers: {
        'Access-Control-Allow-Origin': '*', 
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization', // 允许前端在预检中询问 Authorization
      }
    });
  }

  // 2. 只允许 POST 方法
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  // 3. 检查 API Key 是否已配置
  if (!API_KEY) {
    console.error("OpenAI API Key 未在环境变量中配置 (OPENAI_API_KEY_SECRET)!");
    return new Response(JSON.stringify({ error: 'Server Configuration Error: OpenAI API Key not set.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  // 4. 解析前端发送过来的请求体
  let requestBodyFromFrontend;
  try {
    requestBodyFromFrontend = await request.json();
  } catch (error) {
    console.error("无法解析前端请求体:", error);
    return new Response(JSON.stringify({ error: 'Bad Request: Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  const { model, messages, temperature, max_tokens, stream } = requestBodyFromFrontend; // 接收 stream 参数

  if (!model || !messages) {
    return new Response(JSON.stringify({ error: 'Bad Request: "model" and "messages" are required.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  // 5. 构建发送给 OpenAI API 的请求体
  const openaiPayload = {
    model: model,
    messages: messages, // 假设前端已按 OpenAI 要求格式化 (user/assistant/system)
    temperature: temperature !== undefined ? temperature : 0.7,
    // max_tokens: max_tokens || 1024, // 对于流式，OpenAI 通常会自行处理结束，或者你可以设置
    stream: stream || false, // 将前端传递的 stream 参数或默认 false 传递给 OpenAI
  };
  if (max_tokens) { // 只有在前端明确传递了 max_tokens 时才加入，因为流式时它不是必需的
      openaiPayload.max_tokens = max_tokens;
  }


  console.log("[OpenAI Proxy] 发送给 OpenAI API 的请求体 (stream:", openaiPayload.stream, "):", JSON.stringify(openaiPayload, null, 2));

  // 6. 调用 OpenAI API
  try {
    const apiResponse = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        'Accept': openaiPayload.stream ? 'text/event-stream' : 'application/json', // 根据是否流式设置 Accept
      },
      body: JSON.stringify(openaiPayload),
      // 对于 Node.js 环境的 fetch (如 node-fetch)，当处理流时，有时需要确保响应不被完全缓冲
      // 但通常直接传递 apiResponse.body 即可
    });

    console.log("[OpenAI Proxy] 从 OpenAI API 收到的状态码:", apiResponse.status);

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      console.error("[OpenAI Proxy] OpenAI API 错误响应:", errorText);
      let errorDetail = errorText;
      try {
          const errJson = JSON.parse(errorText);
          errorDetail = errJson.error?.message || JSON.stringify(errJson);
      } catch(e) { /* 保持原始文本错误 */ }
      return new Response(JSON.stringify({ error: `OpenAI API Error (${apiResponse.status})`, details: errorDetail }), {
        status: apiResponse.status,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // --- 修改：处理流式和非流式响应 ---
    if (openaiPayload.stream && apiResponse.body) {
      console.log("[OpenAI Proxy] 正在流式传输 OpenAI 响应...");
      // 直接将 OpenAI API 返回的 ReadableStream 作为响应体透传给前端
      // Netlify Edge Functions (Deno/Node.js 兼容运行时) 和现代 Node.js Lambda 应该能处理这个
      return new Response(apiResponse.body, {
        status: apiResponse.status,
        headers: {
          'Content-Type': 'text/event-stream', // 关键：设置正确的 Content-Type for SSE
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*', // 确保CORS头部也设置在流式响应上
          // 'X-Accel-Buffering': 'no', // 有时用于Nginx等反向代理，确保不缓冲流
        }
      });
    } else if (apiResponse.body) { // 非流式，一次性读取
      const responseDataText = await apiResponse.text();
      let parsedData;
      let contentType = apiResponse.headers.get('content-type') || 'application/json';
      let finalBody = responseDataText;
      try {
          parsedData = JSON.parse(responseDataText);
          finalBody = JSON.stringify(parsedData);
          contentType = 'application/json';
      } catch(e) {
          console.error("[OpenAI Proxy] OpenAI API 非流式响应不是有效的 JSON:", responseDataText);
      }
      return new Response(finalBody, {
        status: apiResponse.status,
        headers: { 'Content-Type': contentType, 'Access-Control-Allow-Origin': '*' }
      });
    } else {
      // 通常如果 apiResponse.ok 为 true，apiResponse.body 应该存在
      console.error("[OpenAI Proxy] OpenAI API 响应体为空，即使状态码为成功。");
      return new Response(JSON.stringify({error: "Empty response body from OpenAI"}), {
          status: 500, 
          headers: {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'}
      });
    }
    // --- 结束修改 ---

  } catch (error) {
    console.error('[OpenAI Proxy] 调用 OpenAI API 时发生网络或其他错误:', error);
    return new Response(JSON.stringify({ error: 'Proxy failed to fetch from OpenAI API', details: error.message }), {
      status: 502, // Bad Gateway
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}