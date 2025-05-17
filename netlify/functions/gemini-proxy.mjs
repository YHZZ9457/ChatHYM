// netlify/functions/gemini-proxy.mjs

console.log("Gemini Proxy Function Loaded (Non-Streaming). Reading GEMINI_API_KEY_SECRET from env.");

export default async function handler(request, context) {
  const API_KEY = process.env.GEMINI_API_KEY_SECRET;
  const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models/';

  console.log("[Gemini Proxy] 被调用，方法:", request.method);

  // 1. CORS 预检处理 (OPTIONS 请求)
  if (request.method === 'OPTIONS') {
    return new Response(null, { // 对于 OPTIONS，body 可以是 null
      status: 204, // No Content
      headers: {
        'Access-Control-Allow-Origin': '*', // 允许所有源 (或更严格地指定你的前端源)
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type', // 前端只发送 Content-Type
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
    console.error("Gemini API Key 未在环境变量中配置 (GEMINI_API_KEY_SECRET)!");
    return new Response(JSON.stringify({ error: 'Server Configuration Error: Gemini API Key not set.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  // 4. 解析前端发送过来的请求体
  let requestBodyFromFrontend;
  try {
    requestBodyFromFrontend = await request.json();
  } catch (error) {
    console.error("无法解析前端请求体:", error, "原始 body:", await request.text().catch(() => '无法读取body'));
    return new Response(JSON.stringify({ error: 'Bad Request: Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  // 从前端请求体中获取参数。我们强制非流式，所以忽略前端可能发送的 stream 参数。
  const { model, contents, generationConfig /*, stream (被忽略) */ } = requestBodyFromFrontend;

  if (!model || !contents) {
    return new Response(JSON.stringify({ error: 'Bad Request: "model" and "contents" are required for Gemini.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  // 5. 构建发送给 Gemini API 的端点和请求体 (强制非流式)
  const geminiEndpoint = `${GEMINI_API_BASE_URL}${model}:generateContent?key=${API_KEY}`;      

  const geminiPayload = {
    contents: contents, 
    generationConfig: generationConfig || { temperature: 0.7 }, // 使用前端的或默认的
    // tools: [] // 如果需要支持工具调用
  };

  console.log(`[Gemini Proxy] 发送给 Gemini API (${geminiEndpoint}) 的请求体:`, JSON.stringify(geminiPayload, null, 2));

  // 6. 调用 Gemini API
  try {
    const apiResponse = await fetch(geminiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Gemini API Key 在 URL 中，不需要 Authorization 头部
      },
      body: JSON.stringify(geminiPayload),
    });

    const responseDataText = await apiResponse.text(); // 先获取文本以处理各种情况
    console.log("[Gemini Proxy] 从 Gemini API 收到的状态码:", apiResponse.status);
    // console.log("[Gemini Proxy] 从 Gemini API 收到的原始响应:", responseDataText);


    // 构建返回给前端的 Headers，确保包含 CORS
    const responseHeaders = {
      'Content-Type': apiResponse.headers.get('content-type') || 'application/json', // 默认为json
      'Access-Control-Allow-Origin': '*'
    };
    
    if (!apiResponse.ok) {
      console.error("[Gemini Proxy] Gemini API 错误响应:", responseDataText);
      // 尝试将错误响应也作为 JSON 返回（如果它是JSON的话）
      try {
        const errorJson = JSON.parse(responseDataText);
        return new Response(JSON.stringify(errorJson), {
          status: apiResponse.status,
          headers: responseHeaders
        });
      } catch (e) {
        // 如果错误响应不是 JSON，则作为文本返回
        responseHeaders['Content-Type'] = 'text/plain';
        return new Response(responseDataText, {
          status: apiResponse.status,
          headers: responseHeaders
        });
      }
    }

    // 成功响应，尝试解析为 JSON 并返回
    try {
        const parsedData = JSON.parse(responseDataText);
        return new Response(JSON.stringify(parsedData), { // 确保 body 是字符串
          status: apiResponse.status,
          headers: responseHeaders // Content-Type 应该是 application/json
        });
    } catch(e) {
        console.error("[Gemini Proxy] Gemini API 成功响应但无法解析为 JSON:", responseDataText);
        // 这种情况比较少见，如果 API 说成功但返回的不是 JSON
        responseHeaders['Content-Type'] = 'text/plain';
        return new Response(responseDataText, { // 返回原始文本
          status: apiResponse.status, // 可能是 200，但内容有问题
          headers: responseHeaders
        });
    }

  } catch (error) { // 捕获 fetch 本身的网络错误等
    console.error('[Gemini Proxy] 调用 Gemini API 时发生网络或其他错误:', error);
    return new Response(JSON.stringify({ error: 'Proxy failed to fetch from Gemini API', details: error.message }), {
      status: 502, // Bad Gateway
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}