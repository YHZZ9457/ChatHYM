// netlify/functions/gemini-proxy.mjs
console.log("Gemini Proxy Function Loaded (Streaming Support Enabled). Reading GEMINI_API_KEY_SECRET from env.");

export default async function handler(request, context) {
  const API_KEY = process.env.GEMINI_API_KEY_SECRET;
  const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models/';

  // 1. CORS 预检处理
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    });
  }

  // 2. 只允许 POST
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  // 3. 检查 API Key
  if (!API_KEY) {
    console.error("Gemini API Key 未在环境变量中配置 (GEMINI_API_KEY_SECRET)!");
    return new Response(JSON.stringify({ error: 'Server Configuration Error: Gemini API Key not set.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  // 4. 解析前端请求体
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

  const { model, contents, generationConfig } = requestBodyFromFrontend;

  if (!model || !contents) {
    return new Response(JSON.stringify({ error: 'Bad Request: "model" and "contents" are required.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  // 5. 构建发送给 Gemini API 的流式端点和请求体
  //    前端的 shouldUseStreaming 标志现在决定了这里是否使用流式端点
  //    在您的前端 send 函数中，对于 Gemini，shouldUseStreaming 应该是 true。
  const geminiEndpoint = `${GEMINI_API_BASE_URL}${model}:streamGenerateContent?key=${API_KEY}&alt=sse`; // 使用 SSE 流式端点

  const geminiPayload = {
    contents: contents,
    generationConfig: generationConfig || { temperature: 0.7 },
    // safetySettings: [...] // 可选，根据需要添加安全设置
  };

  console.log(`[Gemini Proxy] Attempting to stream from Gemini API (${geminiEndpoint}) with payload:`, JSON.stringify(geminiPayload, null, 2).substring(0, 500) + "...");

  try {
    const apiResponse = await fetch(geminiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(geminiPayload),
    });

    console.log("[Gemini Proxy] Gemini API initial response status:", apiResponse.status);

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      console.error("[Gemini Proxy] Gemini API Error (initial response):", apiResponse.status, errorText);
      let errorJson = { error: `Gemini API Error: ${apiResponse.status}`, details: errorText };
      try { errorJson = JSON.parse(errorText); } catch (e) { /* ignore parse error if not json */ }
      return new Response(JSON.stringify(errorJson), {
        status: apiResponse.status,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // ★★★ 处理流式响应 ★★★
    // Netlify Functions 支持返回 ReadableStream
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    // 将 Gemini API 的流式响应体泵送到我们的 TransformStream
    // Gemini 的 streamGenerateContent?alt=sse 返回的是 Server-Sent Events (SSE) 格式
    // 它本身就是 application/json，但每个 JSON 对象块由换行符分隔。
    // 前端期望的是 application/json 流，每个 JSON 块是独立的。
    // 如果 Gemini 返回的是 SSE (event: ..., data: ...)，我们需要提取 data 部分。
    // 但是 Gemini 的 streamGenerateContent?alt=sse 端点返回的不是标准 SSE 格式，
    // 而是 Content-Type: application/json，每个 JSON 块用换行符分隔。
    // 这正是您前端 split('\n') 逻辑所期望的。

    if (apiResponse.body) {
      const reader = apiResponse.body.getReader();
      (async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              console.log("[Gemini Proxy] Stream from Gemini API finished.");
              break;
            }
            // value 是 Uint8Array，直接将其写入 writable 端
            // 前端会接收到这些原始的字节块，然后用 TextDecoder 解码并按 '\n' 分割
            // console.log("[Gemini Proxy] Piping chunk to client:", decoder.decode(value, {stream: true}).substring(0,100) + "...");
            await writer.write(value);
          }
        } catch (streamError) {
          console.error("[Gemini Proxy] Error while reading stream from Gemini API:", streamError);
          await writer.abort(streamError);
        } finally {
          await writer.close();
        }
      })(); // 立即执行这个异步泵送函数
    } else {
        console.error("[Gemini Proxy] Gemini API response body is null for streaming.");
        await writer.close(); // 确保关闭
    }

    return new Response(readable, {
      status: 200,
      headers: {
        'Content-Type': 'application/json', // Gemini streamGenerateContent 返回这个类型
        'Access-Control-Allow-Origin': '*',
        'X-Content-Type-Options': 'nosniff' // 推荐，防止浏览器猜测MIME类型
      }
    });

  } catch (error) {
    console.error('[Gemini Proxy] Network or other error calling Gemini API:', error);
    return new Response(JSON.stringify({ error: 'Proxy failed to fetch from Gemini API', details: error.message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}