// --- START OF FILE netlify/functions/deepseek-proxy.mjs (最终修正 - 匹配标准结构) ---

// 这个 Netlify Function 专门用于代理 DeepSeek API 请求。

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';


// 定义一个解析 .env 文件内容的辅助函数
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
            console.error(`[DeepSeek Proxy] .env file not found at ${filePath}.`);
        } else {
            console.error(`[DeepSeek Proxy] Error reading .env file at ${filePath}:`, err);
        }
        throw new Error(`Failed to load environment variables from .env file: ${err.message}`);
    }
    return envVars;
}

export default async function handler(request) { // 使用 request 签名，与 Web Fetch API 兼容
  // 1. CORS 预检处理 (OPTIONS 请求)
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
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

  try {
    // 读取 .env 文件并获取环境变量
    const envVars = parseEnvFile(resolve(__dirname, '../../../.env'));
    const API_KEY = envVars.DEEPSEEK_API_KEY_SECRET;
    const CUSTOM_API_ENDPOINT = envVars.DEEPSEEK_API_ENDPOINT_URL; // 获取自定义 Endpoint

    // 检查 API Key 是否已配置
    if (!API_KEY) {
      console.error("[DeepSeek Proxy] DEEPSEEK_API_KEY_SECRET not set in .env file!");
      return new Response(JSON.stringify({ error: 'Server Configuration Error: DeepSeek API Key not set.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }
    
    // 确定最终使用的 API Endpoint
    const DEFAULT_API_ENDPOINT = 'https://api.deepseek.com/v1/chat/completions';
    const API_ENDPOINT = CUSTOM_API_ENDPOINT || DEFAULT_API_ENDPOINT;

    if (!API_ENDPOINT) {
        console.error(`[DeepSeek Proxy] API Endpoint for DeepSeek is not configured (neither custom nor default).`);
        return Response.json({ error: { message: `Server Configuration Error: API Endpoint for DeepSeek is missing.` } }, { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } });
    }

    // 解析前端发送过来的请求体
    const requestBodyFromFrontend = await request.json(); 
    // ★★★ 核心修复 2：从 fullModelString 中解析出实际模型名 ★★★
    const fullModelString = requestBodyFromFrontend.model;
    let modelNameForAPI = fullModelString;
    if (fullModelString && typeof fullModelString === 'string' && fullModelString.includes('::')) {
        modelNameForAPI = fullModelString.split('::')[1];
    } else {
        console.warn(`[DeepSeek Proxy] Model string '${fullModelString}' does not contain '::'. Using it as is, which might be incorrect.`);
    }

    const stream = requestBodyFromFrontend.stream || false;

    // 构建发送给 DeepSeek API 的请求体
    const deepseekPayload = {
      model: modelNameForAPI, // ★ 使用解析后的模型名称
      messages: requestBodyFromFrontend.messages, 
      max_tokens: requestBodyFromFrontend.max_tokens || 1024,
      temperature: requestBodyFromFrontend.temperature !== undefined ? requestBodyFromFrontend.temperature : 0.7,
      stream: stream, 
    };

    console.log("[DeepSeek Proxy] 发送给 DeepSeek API 的请求体 (stream:", deepseekPayload.stream, "):", JSON.stringify(deepseekPayload, null, 2));

    // 调用 DeepSeek API
    const apiResponse = await fetch(API_ENDPOINT, { // 使用解析后的 API_ENDPOINT
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        'Accept': deepseekPayload.stream ? 'text/event-stream' : 'application/json',
      },
      body: JSON.stringify(deepseekPayload),
      signal: request.signal, // ★★★ 修复 3：添加 AbortSignal 转发 ★★★
    });

    console.log("[DeepSeek Proxy] 从 DeepSeek API 收到的状态码:", apiResponse.status);

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      console.error("[DeepSeek Proxy] DeepSeek API 错误响应:", errorText);
      let errorDetail = errorText;
      try {
          const errJson = JSON.parse(errorText);
          errorDetail = errJson.error?.message || JSON.stringify(errJson);
      } catch(e) { /* 保持原始文本错误 */ }

      return new Response(JSON.stringify({ error: `DeepSeek API Error (${apiResponse.status})`, details: errorDetail }), {
        status: apiResponse.status,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // 如果是流式响应，直接将 ReadableStream 透传给前端
    if (deepseekPayload.stream && apiResponse.body) {
      console.log("[DeepSeek Proxy] 正在流式传输 DeepSeek 响应...");
      // DeepSeek 返回标准的 SSE 事件流，可以直接透传给前端
      return new Response(apiResponse.body, {
        status: apiResponse.status,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
        }
      });
    } else if (apiResponse.body) { // 非流式，一次性读取
      const responseDataText = await apiResponse.text();
      let parsedData;
      let contentType = apiResponse.headers.get('content-type') || 'application/json';
      let finalBody = responseDataText;
      try {
          parsedData = JSON.parse(responseDataText);
          finalBody = JSON.stringify(parsedData);
          contentType = 'application/json';
      } catch(e) {
          console.error("[DeepSeek Proxy] DeepSeek API 非流式响应不是有效的 JSON:", responseDataText);
      }
      return new Response(finalBody, {
        status: apiResponse.status,
        headers: { 'Content-Type': contentType, 'Access-Control-Allow-Origin': '*' }
      });
    } else {
        return new Response(JSON.stringify({error: "Empty response body from DeepSeek"}), {status: 500, headers: {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'}});
    }

  } catch (error) {
    console.error('[DeepSeek Proxy] 调用 DeepSeek API 时发生网络或其他错误:', error);
    return new Response(JSON.stringify({ error: 'Proxy failed to fetch from DeepSeek API', details: error.message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}