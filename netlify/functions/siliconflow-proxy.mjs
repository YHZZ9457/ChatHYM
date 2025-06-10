// netlify/functions/siliconflow-proxy.mjs
// 基于 OpenRouter Proxy 示例改写，以支持 SiliconFlow API

console.log("SiliconFlow Proxy Edge Function Loaded. Reading SILICONFLOW_API_KEY_SECRET from env.");

export default async function handler(request, context) {
  const API_KEY = process.env.SILICONFLOW_API_KEY_SECRET;   // ★★★ 环境变量名
  const API_URL = 'https://api.siliconflow.cn/v1/chat/completions';  // ★★★ SiliconFlow 接口

  // 与 OpenRouter 保持一致
  const SITE_URL = process.env.URL || 'http://localhost';
  const SITE_NAME = process.env.SITE_NAME || 'My Chat App';

  console.log(`[SiliconFlow Proxy] Request received. Method: ${request.method}. Referer: ${SITE_URL}`);

  // 1. CORS 预检请求
  if (request.method === 'OPTIONS') {
    console.log("[SiliconFlow Proxy] Handling OPTIONS preflight request.");
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      }
    });
  }

  // 2. 仅接受 POST
  if (request.method !== 'POST') {
    console.warn("[SiliconFlow Proxy] Method Not Allowed:", request.method);
    return new Response(JSON.stringify({ error: 'Method Not Allowed. Only POST is accepted.' }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  // 3. 检查 API Key
  if (!API_KEY) {
    console.error("[SiliconFlow Proxy] CRITICAL: SiliconFlow API Key (SILICONFLOW_API_KEY_SECRET) is not configured!");
    return new Response(JSON.stringify({ error: 'Server Configuration Error: API Key missing.' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  // 4. 解析前端请求体
  let requestBody;
  try {
    requestBody = await request.json();
    console.log("[SiliconFlow Proxy] Parsed frontend request body.");
  } catch (error) {
    console.error("[SiliconFlow Proxy] Failed to parse JSON body from frontend:", error.message);
    return new Response(JSON.stringify({ error: 'Bad Request: Invalid JSON body.' }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  // 5. 校验必填字段（兼容 OpenAI 格式）
  const { model, messages, stream } = requestBody;
  if (!model || !messages || !Array.isArray(messages) || messages.length === 0) {
    console.warn("[SiliconFlow Proxy] Bad Request: 'model' and 'messages' (non-empty array) are required.");
    return new Response(JSON.stringify({ error: 'Bad Request: "model" and a non-empty "messages" array are required.' }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  // 6. 构造转发负载
  const payload = {
    ...requestBody,        // 保留所有前端参数
    stream: !!stream       // 强制转为布尔值
  };

  console.log(`[SiliconFlow Proxy] Forwarding to SiliconFlow API. Model: ${payload.model}, Stream: ${payload.stream}`);

  // 7. 调用 SiliconFlow API
  try {
    const apiResponse = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        'HTTP-Referer': SITE_URL,  // 与 OpenRouter 保持一致
        'X-Title': SITE_NAME,      // 与 OpenRouter 保持一致
      },
      body: JSON.stringify(payload),
    });

    console.log(`[SiliconFlow Proxy] SiliconFlow API responded with status: ${apiResponse.status}`);

    // 8. 处理 API 错误
    if (!apiResponse.ok) {
      const errorBodyText = await apiResponse.text();
      console.error(`[SiliconFlow Proxy] Error from SiliconFlow API (Status ${apiResponse.status}):`, errorBodyText);
      return new Response(JSON.stringify({
        error: `SiliconFlow API Error (Status ${apiResponse.status})`,
        details: errorBodyText
      }), {
        status: apiResponse.status,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // 9. 支持流式响应
    if (payload.stream && apiResponse.body) {
      console.log("[SiliconFlow Proxy] Streaming response back to client.");
      return new Response(apiResponse.body, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // 10. 普通 JSON 响应
    console.log("[SiliconFlow Proxy] Processing non-streaming response.");
    const responseData = await apiResponse.json();
    return new Response(JSON.stringify(responseData), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });

  } catch (error) {
    console.error('[SiliconFlow Proxy] Network or unexpected error during API call:', error.message, error.stack);
    return new Response(JSON.stringify({
      error: 'Proxy encountered an internal error.',
      details: error.message
    }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}
