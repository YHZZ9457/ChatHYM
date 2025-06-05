// netlify/functions/siliconflow-proxy.mjs

console.log("SiliconFlow Proxy Function Loaded. Reading SILICONFLOW_API_KEY_SECRET from env.");

export default async function handler(request, context) {
  const API_KEY = process.env.SILICONFLOW_API_KEY_SECRET;
  const API_URL = 'https://api.siliconflow.cn/v1/chat/completions'; // SiliconFlow API 地址

  console.log("[SiliconFlow Proxy] 被调用，方法:", request.method);

  // 1. CORS 预检处理 (OPTIONS 请求)
  if (request.method === 'OPTIONS') {
    console.log("[SiliconFlow Proxy] 处理 OPTIONS 预检请求。");
    return new Response(null, {
      status: 204, // No Content
      headers: {
        'Access-Control-Allow-Origin': '*', // 或者你的特定前端域名
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization', // 允许前端在预检中询问 Authorization
        'Access-Control-Max-Age': '86400', // 可选: 预检请求缓存1天
      }
    });
  }

  // 2. 只允许 POST 方法
  if (request.method !== 'POST') {
    console.warn("[SiliconFlow Proxy] 方法不允许:", request.method);
    return new Response(JSON.stringify({ error: 'Method Not Allowed. Only POST is accepted.' }), {
      status: 405,
      headers: { 
        'Content-Type': 'application/json', 
        'Access-Control-Allow-Origin': '*' // 或者你的特定前端域名
      }
    });
  }

  // 3. 检查 API Key 是否已配置
  if (!API_KEY) {
    console.error("[SiliconFlow Proxy] 严重错误: SiliconFlow API Key (SILICONFLOW_API_KEY_SECRET) 未在环境变量中配置!");
    return new Response(JSON.stringify({ error: 'Server Configuration Error: API Key missing.' }), {
      status: 500, // Internal Server Error
      headers: { 
        'Content-Type': 'application/json', 
        'Access-Control-Allow-Origin': '*' 
      }
    });
  }

  // 4. 解析前端发送过来的请求体
  let requestBodyFromFrontend;
  try {
    requestBodyFromFrontend = await request.json();
    console.log("[SiliconFlow Proxy] 已解析前端请求体。");
  } catch (error) {
    console.error("[SiliconFlow Proxy] 解析前端 JSON 请求体失败:", error.message);
    return new Response(JSON.stringify({ error: 'Bad Request: Invalid JSON body.' }), {
      status: 400,
      headers: { 
        'Content-Type': 'application/json', 
        'Access-Control-Allow-Origin': '*' 
      }
    });
  }

  const { model, messages, temperature, max_tokens, stream } = requestBodyFromFrontend; // 接收 stream 参数

  if (!model || !messages || !Array.isArray(messages) || messages.length === 0) {
    console.warn("[SiliconFlow Proxy] 错误请求: 'model' 和 'messages' (非空数组) 是必需的。");
    return new Response(JSON.stringify({ error: 'Bad Request: "model" and a non-empty "messages" array are required in the request body.' }), {
      status: 400,
      headers: { 
        'Content-Type': 'application/json', 
        'Access-Control-Allow-Origin': '*' 
      }
    });
  }

  // 5. 构建发送给 SiliconFlow API 的请求体
  const siliconflowPayload = {
    model: model,
    messages: messages, // 假设前端已按 SiliconFlow 要求格式化
    temperature: temperature !== undefined ? temperature : 0.7, // 默认值或前端提供的值
    // max_tokens: SiliconFlow 可能有不同的默认值或支持范围，例如默认为 4096
    stream: stream || false, // 将前端传递的 stream 参数或默认 false 传递给 SiliconFlow
  };
  if (max_tokens) { // 只有在前端明确传递了 max_tokens 时才加入
      siliconflowPayload.max_tokens = max_tokens;
  } else if (!siliconflowPayload.stream) { // 如果不是流式且没有提供 max_tokens，可以考虑设置一个默认值
      // siliconflowPayload.max_tokens = 4096; // 例如 SiliconFlow 的一个常用默认值
  }


  console.log("[SiliconFlow Proxy] 发送给 SiliconFlow API 的请求体 (stream:", siliconflowPayload.stream, "):", JSON.stringify(siliconflowPayload, null, 2));

  // 6. 调用 SiliconFlow API
  try {
    const apiResponse = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        'Accept': siliconflowPayload.stream ? 'text/event-stream' : 'application/json', // 根据是否流式设置 Accept
      },
      body: JSON.stringify(siliconflowPayload),
    });

    console.log("[SiliconFlow Proxy] 从 SiliconFlow API 收到的状态码:", apiResponse.status);

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      console.error("[SiliconFlow Proxy] SiliconFlow API 错误响应:", errorText);
      let errorDetail = errorText;
      try {
          const errJson = JSON.parse(errorText);
          // SiliconFlow 的错误结构可能不同，需要适配
          errorDetail = errJson.error?.message || errJson.message || JSON.stringify(errJson);
      } catch(e) { /* 保持原始文本错误 */ }
      return new Response(JSON.stringify({ error: `SiliconFlow API Error (${apiResponse.status})`, details: errorDetail }), {
        status: apiResponse.status,
        headers: { 
          'Content-Type': 'application/json', 
          'Access-Control-Allow-Origin': '*' 
        }
      });
    }

    // --- 处理流式和非流式响应 ---
    if (siliconflowPayload.stream && apiResponse.body) {
      console.log("[SiliconFlow Proxy] 正在流式传输 SiliconFlow 响应...");
      return new Response(apiResponse.body, {
        status: apiResponse.status, // 通常是 200
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8', // 关键：为 SSE 设置正确的 Content-Type
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

      // 尝试解析为 JSON，如果不是 JSON，则按原样返回
      if (contentType.includes('application/json')) {
          try {
              parsedData = JSON.parse(responseDataText);
              finalBody = JSON.stringify(parsedData); // 重新序列化以确保是标准JSON字符串
          } catch(e) {
              console.warn("[SiliconFlow Proxy] SiliconFlow API 非流式响应声称是 JSON 但解析失败:", responseDataText);
              // 保持 finalBody 为 responseDataText，contentType 也保持原样（可能是 application/json 但内容无效）
          }
      }
      
      return new Response(finalBody, {
        status: apiResponse.status,
        headers: { 
          'Content-Type': contentType, 
          'Access-Control-Allow-Origin': '*' 
        }
      });
    } else {
      console.error("[SiliconFlow Proxy] SiliconFlow API 响应体为空，即使状态码为成功。");
      return new Response(JSON.stringify({error: "Empty response body from SiliconFlow"}), {
          status: 500, 
          headers: {
            'Content-Type': 'application/json', 
            'Access-Control-Allow-Origin': '*'
          }
      });
    }
    // --- 结束处理响应 ---

  } catch (error) {
    console.error('[SiliconFlow Proxy] 调用 SiliconFlow API 时发生网络或其他错误:', error);
    return new Response(JSON.stringify({ error: 'Proxy failed to fetch from SiliconFlow API', details: error.message }), {
      status: 502, // Bad Gateway
      headers: { 
        'Content-Type': 'application/json', 
        'Access-Control-Allow-Origin': '*' 
      }
    });
  }
}