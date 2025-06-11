// netlify/functions/volcengine-proxy.mjs

/**
 * 一个健壮的辅助函数，用于验证消息对象。
 * 火山引擎的 API 与 OpenAI 格式兼容，此函数借鉴了最佳实践。
 */
function validateAndCleanMessage(message, index) {
  if (!message || typeof message !== 'object') {
    console.warn(`[Volcengine Proxy Validator] 消息 #${index} 不是一个有效的对象，已忽略。`);
    return null;
  }
  const { role, content } = message;
  // 火山引擎支持的标准角色
  const validRoles = ['user', 'assistant', 'system'];
  if (!role || !validRoles.includes(role)) {
    console.warn(`[Volcengine Proxy Validator] 消息 #${index} 的角色无效或缺失: "${role}"，已忽略。`);
    return null;
  }
  
  // 检查 content 字段
  if (typeof content !== 'string' && !Array.isArray(content)) {
    console.warn(`[Volcengine Proxy Validator] 消息 #${index} 的 content 必须是字符串或数组，已忽略。`);
    return null;
  }
  
  // 如果 content 是字符串，确保它不是空的（API 可能会拒绝）
  if (typeof content === 'string' && content.trim() === '') {
    console.warn(`[Volcengine Proxy Validator] 消息 #${index} 的 content 为空字符串，已忽略。`);
    return null;
  }

  // 如果 content 是数组（用于多模态），确保它不为空
  if (Array.isArray(content) && content.length === 0) {
    console.warn(`[Volcengine Proxy Validator] 消息 #${index} 的 content 数组为空，已忽略。`);
    return null;
  }
  
  return message;
}

/**
 * Netlify Function，用于将请求代理到火山引擎（Volcengine）MaaS API。
 * 此函数假定运行环境（如 Netlify Dev 或线上部署）已处理好环境变量的加载。
 */
export default async function handler(request, context) {
  // 1. 处理 CORS 预检请求 (OPTIONS)
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*', // 生产环境建议替换为你的前端域名
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  // 2. 拒绝非 POST 请求
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { 
      status: 405, 
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } 
    });
  }

  try {
    // 3. 从环境变量中安全地获取 API Key
    // 注意：在 Netlify 中，环境变量应命名为 VOLCENGINE_API_KEY_SECRET
    const API_KEY = process.env.VOLCENGINE_API_KEY_SECRET;

    if (!API_KEY) {
      console.error("[Volcengine Proxy] 严重错误: 环境变量 VOLCENGINE_API_KEY_SECRET 未设置！");
      return new Response(JSON.stringify({ error: '服务器配置错误：API Key 未设置。' }), { 
        status: 500, 
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } 
      });
    }

    // 4. 解析并验证来自前端的请求体
    const { model, messages, temperature, max_tokens, stream } = await request.json();

    if (!model || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: '请求无效: "model" 和非空的 "messages" 数组是必需的。' }), { 
        status: 400, 
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } 
      });
    }

    // 5. 清理和验证 'messages' 数组
    const cleanedMessages = messages.map(validateAndCleanMessage).filter(Boolean);
    if (cleanedMessages.length === 0) {
      return new Response(JSON.stringify({ error: '请求无效: 经过验证后，没有有效的消息。' }), { 
        status: 400, 
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } 
      });
    }
    
    // 6. 构建最终发送到火山引擎 API 的 payload
    const volcenginePayload = {
      model,
      messages: cleanedMessages,
      stream: !!stream, // 确保 stream 是一个布尔值
      // 如果前端提供了有效的 temperature，则使用它，否则使用一个合理的默认值
      temperature: typeof temperature === 'number' ? temperature : 0.7,
      // 只有在提供了有效的 max_tokens 时才将其添加到 payload 中
      ...(typeof max_tokens === 'number' && max_tokens > 0 && { max_tokens }),
    };

    // 7. 定义火山引擎 MaaS API 端点
    // 注意：区域（cn-beijing）可能需要根据你的服务位置进行更改
    const API_URL = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';

    console.log(`[Volcengine Proxy] 正在向端点发送请求: ${API_URL}`);
    console.log("[Volcengine Proxy] Payload:", JSON.stringify(volcenginePayload, null, 2));

    // 8. 将请求转发到火山引擎 API
    const apiResponse = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify(volcenginePayload),
    });

    // 9. 高效地将 API 响应代理回客户端（无论是成功、失败还是流式数据）
    // 这种方法直接传递响应体，避免了内存缓冲，对流式响应至关重要。
    const responseHeaders = {
      'Content-Type': apiResponse.headers.get('Content-Type') || 'application/json',
      'Access-Control-Allow-Origin': '*',
      // 如果是流式传输，添加必要的头信息以确保客户端正确处理
      ...(volcenginePayload.stream && { 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' }),
    };

    return new Response(apiResponse.body, {
      status: apiResponse.status,
      statusText: apiResponse.statusText,
      headers: responseHeaders,
    });

  } catch (error) {
    console.error('[Volcengine Proxy] 发生意外错误:', error);
    // 如果错误是由于客户端发送了无效的 JSON 引起的
    if (error instanceof SyntaxError) {
      return new Response(JSON.stringify({ error: '请求无效: JSON 格式错误。' }), { 
          status: 400, 
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }
    // 处理其他所有内部错误（例如，网络问题）
    return new Response(JSON.stringify({ error: '内部服务器错误', details: error.message }), { 
      status: 502, // 502 Bad Gateway 是代理错误的常用状态码
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } 
    });
  }
}