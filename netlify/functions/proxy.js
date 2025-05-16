// netlify/functions/proxy.js (适用于 Edge Functions)

// 全局 fetch 在 Edge Functions 环境中通常是可用的

export default async function handler(request, context) { // Edge Functions 通常接收 Request 对象
  // 1. 从环境变量获取 Anthropic API Key
  const API_KEY = Deno.env.get("ANTHROPIC_API_KEY_SECRET"); // Edge Functions (Deno) 中读取环境变量的方式
  const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
  const ANTHROPIC_API_VERSION = "2023-06-01";

  // 2. 校验请求方法和 API Key 是否配置
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  if (!API_KEY) {
    console.error("Anthropic API Key 未在环境变量中配置!");
    return new Response(JSON.stringify({ error: 'Server Configuration Error: API Key not set.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 3. 解析前端发送过来的请求体
  let requestBodyFromFrontend;
  try {
    requestBodyFromFrontend = await request.json(); // Edge Functions 的 request 对象有 .json() 方法
  } catch (error) {
    console.error("无法解析前端请求体:", error);
    return new Response(JSON.stringify({ error: 'Bad Request: Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const { model, messages, temperature, max_tokens /*, system_prompt */ } = requestBodyFromFrontend;

  if (!model || !messages) {
    return new Response(JSON.stringify({ error: 'Bad Request: "model" and "messages" are required.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // 4. 构建发送给 Anthropic API 的请求体
  const anthropicPayload = {
    model: model,
    messages: messages,
    max_tokens: max_tokens || 1024,
    temperature: temperature !== undefined ? temperature : 0.7,
    // system: system_prompt,
  };

  console.log("[Claude Proxy] 发送给 Anthropic 的请求体:", JSON.stringify(anthropicPayload, null, 2));

  // 5. 调用 Anthropic API
  try {
    const anthropicResponse = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': ANTHROPIC_API_VERSION,
      },
      body: JSON.stringify(anthropicPayload),
    });

    const responseDataText = await anthropicResponse.text();
    console.log("[Claude Proxy] 从 Anthropic API 收到的状态码:", anthropicResponse.status);

    let parsedData;
    let contentType = anthropicResponse.headers.get('content-type') || 'text/plain'; // 获取原始 Content-Type
    let finalBody = responseDataText;

    try {
        parsedData = JSON.parse(responseDataText);
        finalBody = JSON.stringify(parsedData); // 如果成功解析，确保返回的是字符串化的JSON
        contentType = 'application/json'; // 确认 Content-Type 是 JSON
    } catch(e) {
        console.error("[Claude Proxy] Anthropic API 响应不是有效的 JSON:", responseDataText);
        // finalBody 已经是 responseDataText (原始文本)
        // contentType 已经是原始的 contentType 或 text/plain
    }
    
    // 将 Anthropic API 的响应返回给前端
    return new Response(finalBody, {
      status: anthropicResponse.status,
      headers: { 'Content-Type': contentType }
    });

  } catch (error) {
    console.error('[Claude Proxy] 调用 Anthropic API 时出错:', error);
    return new Response(JSON.stringify({ error: 'Proxy failed to fetch from Anthropic API', details: error.message }), {
      status: 502, // Bad Gateway
      headers: { 'Content-Type': 'application/json' }
    });
  }
}