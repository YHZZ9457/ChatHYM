// netlify/functions/deepseek-proxy.mjs
// (假设运行在期望返回标准 Response 对象的 Node.js 环境，例如 Netlify Edge Functions 或较新的 Lambda)

// Node.js 18+ 全局有 fetch。如果遇到 fetch is not defined，
// 你可能需要在函数的 package.json (如果为该函数单独配置) 或项目根目录的 package.json
// 中添加 "node-fetch" 作为依赖，并在顶部 import fetch from 'node-fetch';
// 但 Netlify 通常会使用较新的 Node.js 版本。

console.log("DeepSeek Proxy Function Loaded. Reading DEEPSEEK_API_KEY_SECRET from env.");

export default async function handler(request, context) { // 使用 request, context 签名，更符合 Edge/Web API
  const API_KEY = process.env.DEEPSEEK_API_KEY_SECRET;
  const API_URL = 'https://api.deepseek.com/v1/chat/completions';

  console.log("[DeepSeek Proxy] 被调用，方法:", request.method);

  // 1. CORS 预检处理 (OPTIONS 请求)
  if (request.method === 'OPTIONS') {
    return new Response(null, { // 对于 OPTIONS，body 可以是 null
      status: 204, // No Content
      headers: {
        'Access-Control-Allow-Origin': '*', // 允许所有源 (或更严格地指定你的前端源)
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization', // Authorization 是你实际发给Deepseek的，前端发给代理的通常只有Content-Type
        'Access-Control-Max-Age': '86400', // 预检结果缓存时间
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
    console.error("DeepSeek API Key 未在环境变量中配置 (DEEPSEEK_API_KEY_SECRET)!");
    return new Response(JSON.stringify({ error: 'Server Configuration Error: DeepSeek API Key not set.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  // 4. 解析前端发送过来的请求体
  let requestBodyFromFrontend;
  try {
    requestBodyFromFrontend = await request.json(); // 使用 request.json()
  } catch (error) {
    console.error("无法解析前端请求体:", error, "原始 body (可能不是字符串，取决于运行时):", await request.text().catch(() => '无法读取body'));
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

  // 5. 构建发送给 DeepSeek API 的请求体
  const deepseekPayload = {
    model: model,
    messages: messages, // 假设前端已按 Deepseek 要求格式化 (user/assistant)
    max_tokens: max_tokens || 1024,
    temperature: temperature !== undefined ? temperature : 0.7,
    stream: stream || false, // 将前端传递的 stream 参数或默认 false 传递给 DeepSeek
  };

  console.log("[DeepSeek Proxy] 发送给 DeepSeek API 的请求体 (stream:", deepseekPayload.stream, "):", JSON.stringify(deepseekPayload, null, 2));

  // 6. 调用 DeepSeek API
  try {
    const apiResponse = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        'Accept': deepseekPayload.stream ? 'text/event-stream' : 'application/json', // 根据是否流式设置 Accept
      },
      body: JSON.stringify(deepseekPayload),
      // 对于 Node.js 的 fetch (如 node-fetch)，流式响应体 (response.body) 本身就是 ReadableStream
      // 对于标准 Web Fetch API，response.body 也是 ReadableStream
    });

    console.log("[DeepSeek Proxy] 从 DeepSeek API 收到的状态码:", apiResponse.status);

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      console.error("[DeepSeek Proxy] DeepSeek API 错误响应:", errorText);
      // 尝试解析错误信息，如果Deepseek返回JSON错误
      let errorDetail = errorText;
      try {
          const errJson = JSON.parse(errorText);
          errorDetail = errJson.error?.message || JSON.stringify(errJson);
      } catch(e) { /* 保持原始文本错误 */ }

      return new Response(JSON.stringify({ error: `DeepSeek API Error (${apiResponse.status})`, details: errorDetail }), {
        status: apiResponse.status, // 使用原始错误状态码
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // 如果是流式响应，直接将 ReadableStream 透传给前端
    if (deepseekPayload.stream && apiResponse.body) {
      console.log("[DeepSeek Proxy] 正在流式传输 DeepSeek 响应...");
      return new Response(apiResponse.body, {
        status: apiResponse.status,
        headers: {
          'Content-Type': 'text/event-stream', // 关键：设置正确的 Content-Type for SSE
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*', // 确保CORS头部也设置在流式响应上
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
          console.error("[DeepSeek Proxy] DeepSeek API 非流式响应不是有效的 JSON:", responseDataText);
      }
      return new Response(finalBody, {
        status: apiResponse.status,
        headers: { 'Content-Type': contentType, 'Access-Control-Allow-Origin': '*' }
      });
    } else {
        // 应该不会到这里，如果 apiResponse.ok 为 true
        return new Response(JSON.stringify({error: "Empty response body from DeepSeek"}), {status: 500, headers: {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'}});
    }

  } catch (error) {
    console.error('[DeepSeek Proxy] 调用 DeepSeek API 时发生网络或其他错误:', error);
    return new Response(JSON.stringify({ error: 'Proxy failed to fetch from DeepSeek API', details: error.message }), {
      status: 502, // Bad Gateway
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}