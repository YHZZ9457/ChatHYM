// netlify/functions/proxy.js
// (如果你的 Netlify Functions 环境是 Node.js 18+，全局 fetch 可用)
// (否则，你可能需要 npm init -y && npm install node-fetch 然后 const fetch = require('node-fetch');)

export default async function handler(event, context) {
  // 1. 从环境变量获取 Anthropic API Key
  const API_KEY = process.env.ANTHROPIC_API_KEY_SECRET; // 确保和你在 Netlify UI 设置的一致
  const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
  const ANTHROPIC_API_VERSION = "2023-06-01"; // Anthropic API 版本

  // 2. 校验请求方法和 API Key 是否配置
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }
  if (!API_KEY) {
    console.error("Anthropic API Key 未在环境变量中配置!");
    return { statusCode: 500, body: JSON.stringify({ error: 'Server Configuration Error: API Key not set.' }) };
  }

  // 3. 解析前端发送过来的请求体
  let requestBodyFromFrontend;
  try {
    requestBodyFromFrontend = JSON.parse(event.body);
  } catch (error) {
    console.error("无法解析前端请求体:", error);
    return { statusCode: 400, body: JSON.stringify({ error: 'Bad Request: Invalid JSON body' }) };
  }

  const { model, messages, temperature, max_tokens /*, system_prompt (如果你也传递了) */ } = requestBodyFromFrontend;

  if (!model || !messages) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Bad Request: "model" and "messages" are required.' }) };
  }

  // 4. 构建发送给 Anthropic API 的请求体
  const anthropicPayload = {
    model: model,
    messages: messages,
    max_tokens: max_tokens || 1024, // 使用前端传递的或默认值
    temperature: temperature !== undefined ? temperature : 0.7, // 使用前端传递的或默认值
    // system: system_prompt, // 如果前端传递了 system_prompt
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

    const responseDataText = await anthropicResponse.text(); // 先获取文本，方便调试
    console.log("[Claude Proxy] 从 Anthropic API 收到的状态码:", anthropicResponse.status);
    // console.log("[Claude Proxy] 从 Anthropic API 收到的原始响应:", responseDataText);

    // 尝试解析为 JSON，如果失败则返回原始文本（可能是错误页面）
    let parsedData;
    try {
        parsedData = JSON.parse(responseDataText);
    } catch(e) {
        // 如果解析失败，可能 Anthropic 返回了非 JSON 错误（例如 HTML 错误页）
        console.error("[Claude Proxy] Anthropic API 响应不是有效的 JSON:", responseDataText);
        // 将原始的非JSON响应和状态码返回给前端，前端可以据此判断
        return {
            statusCode: anthropicResponse.status, // 可能是 403, 500 等
            headers: { 'Content-Type': anthropicResponse.headers.get('content-type') || 'text/plain' },
            body: responseDataText
        };
    }
    
    // 将 Anthropic API 的 JSON 响应返回给前端
    return {
      statusCode: anthropicResponse.status,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsedData) // 确保返回的是字符串化的 JSON
    };

  } catch (error) {
    console.error('[Claude Proxy] 调用 Anthropic API 时出错:', error);
    return {
      statusCode: 502, // Bad Gateway，表示代理请求上游服务器时出错
      body: JSON.stringify({ error: 'Proxy failed to fetch from Anthropic API', details: error.message }),
    };
  }
}