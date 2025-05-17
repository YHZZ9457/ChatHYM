// netlify/functions/siliconflow-proxy.mjs

console.log("SiliconFlow Proxy Function Loaded. Reading SILICONFLOW_API_KEY_SECRET from env.");

export default async function handler(request, context) {
  const API_KEY = process.env.SILICONFLOW_API_KEY_SECRET;
  const API_URL = 'https://api.siliconflow.cn/v1/chat/completions';

  console.log("[SiliconFlow Proxy] 被调用。");

  // 1. CORS 预检
  if (request.method === 'OPTIONS') {
    return new Response('', {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      }
    });
  }

  // 2. 只允许 POST
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  if (!API_KEY) {
    console.error("SiliconFlow API Key 未在环境变量中配置 (SILICONFLOW_API_KEY_SECRET)!");
    return new Response(JSON.stringify({ error: 'Server Configuration Error: SiliconFlow API Key not set.' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  // 解析请求体
  let requestBodyFromFrontend;
  try {
    requestBodyFromFrontend = await request.json();
  } catch (error) {
    console.error("无法解析前端请求体:", error);
    return new Response(JSON.stringify({ error: 'Bad Request: Invalid JSON body' }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  const { model, messages, temperature, max_tokens } = requestBodyFromFrontend;

  if (!model || !messages) {
    return new Response(JSON.stringify({ error: 'Bad Request: "model" and "messages" are required.' }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  // 构建 API payload
  const siliconflowPayload = {
    model: model,
    messages: messages,
    max_tokens: max_tokens || 1024,
    temperature: temperature !== undefined ? temperature : 0.7,
  };

  console.log("[SiliconFlow Proxy] 发送给 SiliconFlow API 的请求体:", JSON.stringify(siliconflowPayload, null, 2));

  // 调用 SiliconFlow API
  try {
    const apiResponse = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify(siliconflowPayload),
    });

    const responseDataText = await apiResponse.text();
    console.log("[SiliconFlow Proxy] 从 SiliconFlow API 收到的状态码:", apiResponse.status);

    let contentType = apiResponse.headers.get('content-type') || 'text/plain';
    let finalBody = responseDataText;

    try {
      finalBody = JSON.stringify(JSON.parse(responseDataText));
      contentType = 'application/json';
    } catch (e) {
      // 不是 JSON 时直接返回原文
      console.error("[SiliconFlow Proxy] SiliconFlow API 响应不是有效的 JSON:", responseDataText);
    }

    return new Response(finalBody, {
      status: apiResponse.status,
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*'
      }
    });

  } catch (error) {
    console.error('[SiliconFlow Proxy] 调用 SiliconFlow API 时出错:', error);
    return new Response(JSON.stringify({ error: 'Proxy failed to fetch from SiliconFlow API', details: error.message }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}
