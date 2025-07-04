// --- START OF FILE netlify/functions/gemini-proxy.mjs (完全修正版) ---

// 这个 Netlify Function 专门用于代理 Google Gemini API 请求。

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
        // 在生产环境中，Netlify 会通过环境变量注入，找不到 .env 文件是正常情况
        if (err.code !== 'ENOENT') {
            console.error(`[Gemini Proxy] Error reading .env file at ${filePath}:`, err);
        }
    }
    return envVars;
}

export default async (request, context) => {
  // 1. 处理 CORS 预检请求
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' },
    });
  }

  // 2. 确保是 POST 请求
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405 });
  }

  try {
    // 3. 加载环境变量 (优先使用 Netlify 注入的环境变量)
    const env = { ...process.env, ...parseEnvFile(resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env')) };
    const API_KEY = env.GEMINI_API_KEY_SECRET;
    
    if (!API_KEY) {
      console.error('[Gemini Proxy] GEMINI_API_KEY_SECRET not found in environment.');
      return Response.json({ error: { message: 'Server Configuration Error: Gemini API Key not set.' } }, { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } });
    }

    // 4. 解析前端发来的请求体
    const requestBody = await request.json();

    // ★★★ 核心修复 #1：正确地从请求体中读取 `contents` 字段 ★★★
    // 同时读取其他参数，为构建最终载荷做准备
    const { model: fullModelString, contents: requestContents, stream, temperature, max_tokens, max_completion_tokens } = requestBody;

    // 检查 contents 是否存在且有效
    if (!requestContents || !Array.isArray(requestContents) || requestContents.length === 0) {
        return Response.json({ error: { message: 'Proxy Error: "contents" field is missing, empty, or invalid in the request body.' } }, { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } });
    }

    // 从 "provider::modelName" 格式中提取真实模型名称
    const modelNameForAPI = fullModelString?.includes('::') ? fullModelString.split('::')[1] : fullModelString;

    // ★★★ 核心修复 #2：正确构建符合 Gemini API 规范的 `generationConfig` 对象 ★★★
    const generationConfig = {};
    if (temperature !== undefined) {
        generationConfig.temperature = temperature;
    }
    // Gemini 使用 `maxOutputTokens`，我们兼容前端传来的 `max_tokens` 或 `max_completion_tokens`
    const maxOutputTokens = max_tokens || max_completion_tokens;
    if (maxOutputTokens !== undefined) {
        generationConfig.maxOutputTokens = maxOutputTokens;
    }

    // 5. 构建最终要发往 Google Gemini API 的载荷
    const geminiPayload = {
      contents: requestContents, // 使用从前端正确读取的 contents
    };
    // 只有在 generationConfig 不为空时才将其添加到载荷中
    if (Object.keys(generationConfig).length > 0) {
        geminiPayload.generationConfig = generationConfig;
    }

    // 6. 构造正确的 Gemini API 端点 URL
    const customEndpointBase = env.GEMINI_API_ENDPOINT_URL;
    const defaultEndpointBase = 'https://generativelanguage.googleapis.com/v1beta/models/';
    const endpointBase = customEndpointBase || defaultEndpointBase;
    const apiAction = stream ? 'streamGenerateContent' : 'generateContent';
    const geminiEndpoint = `${endpointBase}${modelNameForAPI}:${apiAction}?key=${API_KEY}`;

    console.log(`[Gemini Proxy] Forwarding to: ${geminiEndpoint}`);
    console.log('[Gemini Proxy] Final Payload:', JSON.stringify(geminiPayload, null, 2));

    // 7. 发送请求到真实的 Gemini API
    const apiResponse = await fetch(geminiEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiPayload),
      signal: request.signal, // 转发 AbortSignal，允许前端中止请求
    });

    // 8. 处理 Gemini API 的响应
    if (!apiResponse.ok) {
      const errorData = await apiResponse.json().catch(() => ({ message: apiResponse.statusText, from: 'gemini-proxy' }));
      console.error(`[Gemini Proxy] Upstream API Error (${apiResponse.status}):`, JSON.stringify(errorData));
      return Response.json({ error: errorData }, { status: apiResponse.status, headers: { 'Access-Control-Allow-Origin': '*' } });
    }
    
    // 9. 根据是否流式，将响应转发回客户端
    if (stream && apiResponse.body) {
        // Gemini 的流式响应是 application/json 格式的 JSON 对象流，直接透传即可
        console.log("[Gemini Proxy] Piping streaming response back to client.");
        return new Response(apiResponse.body, {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'no-cache',
            },
        });
    } else {
        const responseData = await apiResponse.json();
        return Response.json(responseData, { status: 200, headers: { 'Access-Control-Allow-Origin': '*' } });
    }

  } catch (error) {
    console.error('[Gemini Proxy] Internal error:', error);
    return Response.json({ error: { message: `Proxy internal error: ${error.message}` } }, { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } });
  }
};

// --- END OF FILE netlify/functions/gemini-proxy.mjs (完全修正版) ---