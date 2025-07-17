// --- START OF FILE netlify/functions/anthropic-proxy.mjs (最终修正 - 针对流式问题) ---

// 这个 Netlify Function 专门用于代理 Anthropic Claude API 请求。

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
            console.error(`[Anthropic Proxy] .env file not found at ${filePath}.`);
        } else {
            console.error(`[Anthropic Proxy] Error reading .env file at ${filePath}:`, err);
        }
        throw new Error(`Failed to load environment variables from .env file: ${err.message}`);
    }
    return envVars;
}

export default async function handler(request) {
  // CORS 预检请求
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, x-api-key, anthropic-version' },
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
    
    const API_KEY = envVars.ANTHROPIC_API_KEY_SECRET;
    const CUSTOM_API_ENDPOINT = envVars.ANTHROPIC_API_ENDPOINT_URL;

    if (!API_KEY) {
      console.error('[Anthropic Proxy] ANTHROPIC_API_KEY_SECRET not set.');
      return new Response(JSON.stringify({ error: 'Server Config Error: Anthropic API Key not set.' }), { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } });
    }

    const DEFAULT_API_ENDPOINT = 'https://api.anthropic.com/v1/messages';
    const API_ENDPOINT = CUSTOM_API_ENDPOINT || DEFAULT_API_ENDPOINT;

    if (!API_ENDPOINT) {
      console.error('[Anthropic Proxy] Anthropic API Endpoint not configured.');
      return new Response(JSON.stringify({ error: 'Server Config Error: Anthropic API Endpoint not configured.' }), { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } });
    }

    const requestBody = await request.json();
    const isStream = requestBody.stream || false;

    const fullModelString = requestBody.model;
    let modelNameForAPI = fullModelString;
    if (fullModelString && typeof fullModelString === 'string' && fullModelString.includes('::')) {
        modelNameForAPI = fullModelString.split('::')[1];
    } else {
        console.warn(`[Anthropic Proxy] Model string '${fullModelString}' does not contain '::'. Using it as is.`);
    }

    const apiPayload = {
        model: modelNameForAPI,
        messages: requestBody.messages,
        stream: isStream,
        ...(requestBody.system && { system: requestBody.system }), 
        ...(requestBody.temperature !== undefined && { temperature: requestBody.temperature }),
        ...(requestBody.max_tokens !== undefined && { max_tokens: requestBody.max_tokens }),
    };
    
    console.log("[Anthropic Proxy] Sending payload:", JSON.stringify(apiPayload, null, 2));

    const apiResponse = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: { 
          'Content-Type': 'application/json', 
          'x-api-key': API_KEY, 
          'anthropic-version': '2023-06-01' // Required Anthropic API Version
      },
      body: JSON.stringify(apiPayload),
      signal: request.signal, // Forward AbortSignal
    });

    if (!apiResponse.ok) {
      const errorBody = await apiResponse.text();
      console.error(`[Anthropic Proxy] API Error: ${apiResponse.status}`, errorBody);
      return new Response(errorBody, { status: apiResponse.status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }});
    }

    if (isStream && apiResponse.body) {
      // 手动处理流，添加结束标记
      console.log("[Anthropic Proxy] Handling streaming response and adding end marker.");
      const transformedStream = new ReadableStream({
          async start(controller) {
              const reader = apiResponse.body.getReader();
              let done = false;
              while (!done) {
                  const { value, done: readerDone } = await reader.read();
                  done = readerDone;
                  if (value) {
                      controller.enqueue(value); // 转发数据块
                  }
              }
              // 在流结束时，添加 SSE 结束标记
              const encoder = new TextEncoder();
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              controller.close();
              console.log("[Anthropic Proxy] Streaming response complete, end marker added.");
          },
          cancel() {
              reader.cancel(); // 支持取消
          }
      });
  
      return new Response(transformedStream, {
          status: 200,
          headers: {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              'Connection': 'keep-alive',
              'Access-Control-Allow-Origin': '*',
          },
      });
    } else {
      console.log("[Anthropic Proxy] Non-streaming response: Reading full JSON.");
      const json = await apiResponse.json();
      return new Response(JSON.stringify(json), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }});
    }

  } catch (err) {
    console.error('[Anthropic Proxy Error]', err);
    return new Response(JSON.stringify({ error: 'Proxy internal error', details: err.message }), { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } });
  }
}

// --- END OF FILE netlify/functions/anthropic-proxy.mjs (最终修正 - 针对流式问题) ---