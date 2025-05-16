// netlify/functions/proxy.js (标准 Netlify Node.js Functions 兼容)

exports.handler = async function(event, context) {
  // 1. 从环境变量获取 Anthropic API Key
  const API_KEY = process.env.ANTHROPIC_API_KEY || "你的APIKEY"; // 用 process.env
  const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
  const ANTHROPIC_API_VERSION = "2023-06-01";

  // 2. 校验请求方法和 API Key 是否配置
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }
  if (!API_KEY) {
    console.error("Anthropic API Key 未在环境变量中配置!");
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Server Configuration Error: API Key not set.' })
    };
  }

  // 3. 解析前端发送过来的请求体
  let requestBodyFromFrontend;
  try {
    requestBodyFromFrontend = JSON.parse(event.body); // Node.js 用 event.body
  } catch (error) {
    console.error("无法解析前端请求体:", error);
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Bad Request: Invalid JSON body' })
    };
  }

  const { model, messages, temperature, max_tokens } = requestBodyFromFrontend;

  if (!model || !messages) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Bad Request: \"model\" and \"messages\" are required.' })
    };
  }

  // 4. 构建发送给 Anthropic API 的请求体
  const anthropicPayload = {
    model: model,
    messages: messages,
    max_tokens: max_tokens || 1024,
    temperature: temperature !== undefined ? temperature : 0.7,
  };

  console.log("[Claude Proxy] 发送给 Anthropic 的请求体:", JSON.stringify(anthropicPayload, null, 2));

  // 5. 调用 Anthropic API
  try {
    const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
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

    let contentType = anthropicResponse.headers.get('content-type') || 'text/plain';
    let finalBody = responseDataText;

    try {
      finalBody = JSON.stringify(JSON.parse(responseDataText));
      contentType = 'application/json';
    } catch(e) {
      console.error("[Claude Proxy] Anthropic API 响应不是有效的 JSON:", responseDataText);
    }
    
    return {
      statusCode: anthropicResponse.status,
      headers: { 'Content-Type': contentType },
      body: finalBody
    };

  } catch (error) {
    console.error('[Claude Proxy] 调用 Anthropic API 时出错:', error);
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Proxy failed to fetch from Anthropic API', details: error.message })
    };
  }
};
