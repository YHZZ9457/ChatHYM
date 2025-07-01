// --- START OF FILE netlify/functions/gemini-proxy.mjs (最终修正 - 针对流式问题) ---

// 这个 Netlify Function 专门用于代理 Google Gemini API 请求。

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ★★★ 注意：如果你的 Netlify 环境需要 __filename 和 __dirname，请取消注释 ★★★
// 否则，保持注释，因为它们可能已由 Node.js 注入。
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = dirname(__filename);

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
            console.error(`[Gemini Proxy] .env file not found at ${filePath}.`);
        } else {
            console.error(`[Gemini Proxy] Error reading .env file at ${filePath}:`, err);
        }
        throw new Error(`Failed to load environment variables from .env file: ${err.message}`);
    }
    return envVars;
}

export default async (request, context) => {
  // CORS 预检请求
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' },
    });
  }

  // 只允许 POST 请求
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405 });
  }

  try {
    // 读取 .env 文件，如果 __dirname 未定义，则手动计算
    let currentDir = typeof __dirname !== 'undefined' ? __dirname : dirname(fileURLToPath(import.meta.url));
    const envVars = parseEnvFile(resolve(currentDir, '../../../.env'));
    
    const API_KEY = envVars.GEMINI_API_KEY_SECRET;
    
    if (!API_KEY) {
      console.error('[Gemini Proxy] GEMINI_API_KEY_SECRET not found in .env file.');
      return Response.json({ error: { message: 'Server Configuration Error: Gemini API Key not set.' } }, { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } });
    }

    const requestBody = await request.json();
    const { model: fullModelString, messages: geminiContents, stream, temperature, max_tokens } = requestBody;

    let modelNameForAPI = fullModelString;
    if (fullModelString && typeof fullModelString === 'string' && fullModelString.includes('::')) {
        modelNameForAPI = fullModelString.split('::')[1];
    } else {
        console.warn(`[Gemini Proxy] Model string '${fullModelString}' does not contain '::'. Using it as is, which might be incorrect.`);
    }

    // --- 构建 Gemini API 的 generationConfig 对象 ---
    let generationConfig = {
        ...(temperature !== undefined && { temperature }),
        ...(max_tokens !== undefined && { maxOutputTokens: max_tokens }),
    };
    
    // --- 构建最终 Payload ---
    const geminiPayload = {
      contents: geminiContents,
      ...(Object.keys(generationConfig).length > 0 && { generationConfig }),
    };

    // --- 构造正确的 API Endpoint URL ---
    const customEndpointBase = envVars.GEMINI_API_ENDPOINT_URL;
    const defaultEndpointBase = 'https://generativelanguage.googleapis.com/v1beta/models/';
    const endpointBase = customEndpointBase || defaultEndpointBase;
    
    // Gemini Stream API does NOT use &alt=sse, it returns a stream of JSON objects
    const geminiEndpoint = `${endpointBase}${modelNameForAPI}:${stream ? 'streamGenerateContent' : 'generateContent'}?key=${API_KEY}`;

    console.log(`[Gemini Proxy] Forwarding request to Gemini endpoint: ${geminiEndpoint}`);
    console.log('[Gemini Proxy] Final Payload:', JSON.stringify(geminiPayload, null, 2));

    const apiResponse = await fetch(geminiEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiPayload),
      signal: request.signal, // 转发 AbortSignal
    });

    if (!apiResponse.ok) {
      const errorData = await apiResponse.json().catch(() => ({ message: apiResponse.statusText }));
      console.error(`[Gemini Proxy] Upstream API Error (${apiResponse.status}):`, errorData);
      return Response.json(errorData, { status: apiResponse.status, headers: { 'Access-Control-Allow-Origin': '*' } });
    }
    
    // --- 处理响应 (流式或非流式) ---
    if (stream) {
        // Gemini streamGenerateContent returns a ReadableStream of JSON objects, not SSE.
        // We directly pipe this stream to the client. The client (api.js) will handle parsing.
        console.log("[Gemini Proxy] Streaming response: Piping raw response body.");
        return new Response(apiResponse.body, {
            status: 200,
            headers: {
                'Content-Type': 'application/json', // Gemini Stream is application/json
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'no-cache', // Common for streams, might help proxy behavior
                'Connection': 'keep-alive',  // Common for streams
            },
        });
    } else {
        console.log("[Gemini Proxy] Non-streaming response: Reading full JSON.");
        const responseData = await apiResponse.json();
        return Response.json(responseData, { status: 200, headers: { 'Access-Control-Allow-Origin': '*' } });
    }

  } catch (error) {
    console.error('[Gemini Proxy] Proxy internal error:', error);
    return Response.json({ error: { message: `Proxy internal error: ${error.message}`, details: error.stack } }, { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } });
  }
};

// --- END OF FILE netlify/functions/gemini-proxy.mjs (最终修正 - 针对流式问题) ---