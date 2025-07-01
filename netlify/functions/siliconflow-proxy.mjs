// --- START OF FILE netlify/functions/siliconflow-proxy.mjs (最终修正 - 匹配标准结构) ---

// 这个 Netlify Function 专门用于代理 SiliconFlow API 请求。

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
            console.error(`[SiliconFlow Proxy] .env file not found at ${filePath}.`);
        } else {
            console.error(`[SiliconFlow Proxy] Error reading .env file at ${filePath}:`, err);
        }
        throw new Error(`Failed to load environment variables from .env file: ${err.message}`);
    }
    return envVars;
}

export default async function handler(request) {
  // 1. CORS 预检
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' },
    });
  }

  // 2. 检查方法和 API Key
  if (request.method !== 'POST') { return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405 }); }

  try {
    // 读取 .env 文件并获取环境变量
    const envVars = parseEnvFile(resolve(__dirname, '../../../.env'));
    const API_KEY = envVars.SILICONFLOW_API_KEY_SECRET;
    const CUSTOM_API_ENDPOINT = envVars.SILICONFLOW_API_ENDPOINT_URL; // 获取自定义 Endpoint

    if (!API_KEY) {
      console.error("[SiliconFlow Proxy] SILICONFLOW_API_KEY_SECRET not set in .env file!");
      return new Response(JSON.stringify({ error: 'Server Config Error: API Key not set.' }), { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } });
    }

    // 确定最终使用的 API Endpoint
    const DEFAULT_API_ENDPOINT = 'https://api.siliconflow.cn/v1/chat/completions';
    const API_ENDPOINT = CUSTOM_API_ENDPOINT || DEFAULT_API_ENDPOINT;

    if (!API_ENDPOINT) {
        console.error(`[SiliconFlow Proxy] API Endpoint for SiliconFlow is not configured (neither custom nor default).`);
        return Response.json({ error: { message: `Server Configuration Error: API Endpoint for SiliconFlow is missing.` } }, { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } });
    }

    const requestBody = await request.json();
    // ★★★ 核心修复 2：从 fullModelString 中解析出实际模型名 ★★★
    const fullModelString = requestBody.model;
    let modelNameForAPI = fullModelString;
    if (fullModelString && typeof fullModelString === 'string' && fullModelString.includes('::')) {
        modelNameForAPI = fullModelString.split('::')[1];
    } else {
        console.warn(`[SiliconFlow Proxy] Model string '${fullModelString}' does not contain '::'. Using it as is.`);
    }

    const isStream = requestBody.stream || false;

    // 3. 请求 SiliconFlow API
    const apiResponse = await fetch(API_ENDPOINT, { // 使用解析后的 API_ENDPOINT
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
      body: JSON.stringify({ // 重新构建 payload，只包含必要字段
          model: modelNameForAPI, // 使用解析后的模型名称
          messages: requestBody.messages,
          stream: isStream,
          ...(requestBody.temperature !== undefined && { temperature: requestBody.temperature }),
          ...(requestBody.max_tokens !== undefined && { max_tokens: requestBody.max_tokens }),
      }), 
      signal: request.signal, // ★★★ 修复 3：添加 AbortSignal 转发 ★★★
    });

    console.log(`[SiliconFlow Proxy] API response status: ${apiResponse.status}`);

    // 4. 处理 API 返回的错误
    if (!apiResponse.ok) {
      const errorBody = await apiResponse.text();
      console.error(`[SiliconFlow Proxy] API Error: ${apiResponse.status}`, errorBody);
      return new Response(errorBody, { status: apiResponse.status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }});
    }

    // 5. ★★★ 可靠的流式处理 ★★★
    if (isStream && apiResponse.body) {
        console.log("[SiliconFlow Proxy] Handling as a STREAMING response.");
        const { readable, writable } = new TransformStream();
        const pump = async () => {
            const reader = apiResponse.body.getReader();
            const writer = writable.getWriter();
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) { writer.close(); break; }
                    await writer.write(value);
                }
            } catch (e) { console.error("[SiliconFlow Proxy] Stream Pumping Error:", e); writer.abort(e); }
        };
        pump();
        return new Response(readable, {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' },
        });
    } else {
        // 6. 处理非流式响应
        console.log("[SiliconFlow Proxy] Handling as a NON-STREAMING response.");
        const json = await apiResponse.json();
        return new Response(JSON.stringify(json), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }});
    }

  } catch (err) {
    console.error('[SiliconFlow Proxy] Network/internal error:', err);
    return new Response(JSON.stringify({ error: 'Proxy internal error', details: err.message }), { status: 502, headers: { 'Access-Control-Allow-Origin': '*' } }); // 状态码改为 500
  }
}