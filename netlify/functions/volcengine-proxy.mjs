// --- START OF FILE netlify/functions/volcengine-proxy.mjs (最终修正 - 匹配标准结构) ---

// 这个 Netlify Function 专门用于代理 火山引擎（Volcengine）MaaS API 请求。

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';


function parseEnvFile(filePath) {
    const envVars = {};
    try {
        const fileContent = readFileSync(filePath, 'utf8');
        fileContent.split('\n').forEach(line => {
            const trimmedLine = line.trim();
            if (trimmedLine && !trimmedLine.startsWith('#')) {
                const parts = trimmedLine.split('=');
                if (parts.length >= 2) {
                    const key = parts[0].trim();
                    const value = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
                    envVars[key] = value;
                }
            }
        });
    } catch (err) {
        if (err.code === 'ENOENT') {
            console.error(`[Volcengine Proxy] .env file not found at ${filePath}.`);
        } else {
            console.error(`[Volcengine Proxy] Error reading .env file at ${filePath}:`, err);
        }
        throw new Error(`Failed to load environment variables from .env file: ${err.message}`);
    }
    return envVars;
}

// ★★★ 核心修复 2: 将 validateAndCleanMessage 函数移到顶层作用域 ★★★
function validateAndCleanMessage(message, index) {
  if (!message || typeof message !== 'object') {
    console.warn(`[Volcengine Proxy Validator] 消息 #${index} 不是一个有效的对象，已忽略。`);
    return null;
  }
  const { role, content } = message;
  const validRoles = ['user', 'assistant', 'system'];
  if (!role || !validRoles.includes(role)) {
    console.warn(`[Volcengine Proxy Validator] 消息 #${index} 的角色无效或缺失: "${role}"，已忽略。`);
    return null;
  }
  if (typeof content !== 'string' && !Array.isArray(content)) {
    console.warn(`[Volcengine Proxy Validator] 消息 #${index} 的 content 必须是字符串或数组，已忽略。`);
    return null;
  }
  if (typeof content === 'string' && content.trim() === '') {
    console.warn(`[Volcengine Proxy Validator] 消息 #${index} 的 content 为空字符串，已忽略。`);
    return null;
  }
  if (Array.isArray(content) && content.length === 0) {
    console.warn(`[Volcengine Proxy Validator] 消息 #${index} 的 content 数组为空，已忽略。`);
    return null;
  }
  return message;
}


export default async function handler(request) {
  // 1. 处理 CORS 预检请求 (OPTIONS)
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
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
    // 读取 .env 文件并获取环境变量
    const envVars = parseEnvFile(resolve(__dirname, '../../../.env'));
    const API_KEY = envVars.VOLCENGINE_API_KEY_SECRET;
    const CUSTOM_API_ENDPOINT = envVars.VOLCENGINE_API_ENDPOINT_URL; // 获取自定义 Endpoint

    if (!API_KEY) {
      console.error("[Volcengine Proxy] 严重错误: 环境变量 VOLCENGINE_API_KEY_SECRET 未设置！");
      return new Response(JSON.stringify({ error: '服务器配置错误：API Key 未设置。' }), { 
        status: 500, 
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } 
      });
    }

    // 确定最终使用的 API Endpoint
    const DEFAULT_API_ENDPOINT = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
    const API_ENDPOINT = CUSTOM_API_ENDPOINT || DEFAULT_API_ENDPOINT;

    if (!API_ENDPOINT) {
        console.error(`[Volcengine Proxy] API Endpoint for Volcengine is not configured (neither custom nor default).`);
        return Response.json({ error: { message: `Server Configuration Error: API Endpoint for Volcengine is missing.` } }, { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } });
    }

    // 4. 解析并验证来自前端的请求体
    const requestBody = await request.json();
    // ★★★ 核心修复 3：从 fullModelString 中解析出实际模型名 ★★★
    const fullModelString = requestBody.model;
    let modelNameForAPI = fullModelString;
    if (fullModelString && typeof fullModelString === 'string' && fullModelString.includes('::')) {
        modelNameForAPI = fullModelString.split('::')[1];
    } else {
        console.warn(`[Volcengine Proxy] Model string '${fullModelString}' does not contain '::'. Using it as is.`);
    }

    const { messages, temperature, max_tokens, stream } = requestBody;

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
      model: modelNameForAPI, // ★ 使用解析后的模型名称
      messages: cleanedMessages,
      stream: !!stream, // 确保 stream 是一个布尔值
      temperature: typeof temperature === 'number' ? temperature : 0.7,
      // 只有在提供了有效的 max_tokens 时才将其添加到 payload 中
      ...(typeof max_tokens === 'number' && max_tokens > 0 && { max_tokens }),
    };

    console.log(`[Volcengine Proxy] 正在向端点发送请求: ${API_ENDPOINT}`); // 使用解析后的 API_ENDPOINT
    console.log("[Volcengine Proxy] Payload:", JSON.stringify(volcenginePayload, null, 2));

    // 8. 将请求转发到火山引擎 API
    const apiResponse = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify(volcenginePayload),
      signal: request.signal, // ★★★ 核心修复 4：添加 AbortSignal 转发 ★★★
    });

    // 9. 高效地将 API 响应代理回客户端（无论是成功、失败还是流式数据）
    const responseHeaders = {
      'Content-Type': apiResponse.headers.get('Content-Type') || 'application/json',
      'Access-Control-Allow-Origin': '*',
      ...(volcenginePayload.stream && { 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' }),
    };

    return new Response(apiResponse.body, {
      status: apiResponse.status,
      statusText: apiResponse.statusText,
      headers: responseHeaders,
    });

  } catch (error) {
    console.error('[Volcengine Proxy] 发生意外错误:', error);
    if (error instanceof SyntaxError) {
      return new Response(JSON.stringify({ error: '请求无效: JSON 格式错误。' }), { 
          status: 400, 
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }
    return new Response(JSON.stringify({ error: '内部服务器错误', details: error.message }), { 
      status: 500, 
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } 
    });
  }
}