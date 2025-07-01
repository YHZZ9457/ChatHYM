// --- START OF FILE netlify/functions/openrouter-proxy.mjs (最终修正 - 匹配标准结构) ---

// 这个 Netlify Function 专门用于代理 OpenRouter.ai API 请求，
// 处理其独特的 HTTP-Referer 和 X-Title Header 要求，并支持自定义 Endpoint。

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
            console.error(`[OpenRouter Proxy] .env file not found at ${filePath}.`);
        } else {
            console.error(`[OpenRouter Proxy] Error reading .env file at ${filePath}:`, err);
        }
        throw new Error(`Failed to load environment variables from .env file: ${err.message}`);
    }
    return envVars;
}

export default async (request, context) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, HTTP-Referer, X-Title' },
    });
  }
  if (request.method !== 'POST') { return new Response(JSON.stringify({ error: { message: 'Method Not Allowed' } }), { status: 405, headers: { 'Content-Type': 'application/json' } }); }

  try {
    // 读取 .env 文件并获取环境变量
    const envVars = parseEnvFile(resolve(__dirname, '../../../.env'));
    const API_KEY = envVars.OPENROUTER_API_KEY_SECRET;
    const CUSTOM_API_ENDPOINT = envVars.OPENROUTER_API_ENDPOINT_URL; // 获取自定义 Endpoint

    if (!API_KEY) { return new Response(JSON.stringify({ error: { message: 'Server Configuration Error: OpenRouter API Key not set.' } }), { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } }); }

    // 确定最终使用的 API Endpoint
    const DEFAULT_API_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
    const API_ENDPOINT = CUSTOM_API_ENDPOINT || DEFAULT_API_ENDPOINT;

    if (!API_ENDPOINT) { return new Response(JSON.stringify({ error: { message: 'Server Configuration Error: OpenRouter API Endpoint not configured.' } }), { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } }); }

    // OpenRouter 特殊的 Header 值
    const OPENROUTER_REFERER = envVars.OPENROUTER_REFERER || 'https://chathym.netlify.app/'; // 从 .env 或使用默认值
    const OPENROUTER_TITLE = envVars.OPENROUTER_TITLE || 'ChatHYM'; // 从 .env 或使用默认值

    const requestBody = await request.json();
    const isStream = requestBody.stream !== false;

    // ★★★ 核心修复 2：从 fullModelString 中解析出实际模型名 ★★★
    const fullModelString = requestBody.model;
    let modelNameForAPI = fullModelString;
    if (fullModelString && typeof fullModelString === 'string' && fullModelString.includes('::')) {
        modelNameForAPI = fullModelString.split('::')[1];
    } else {
        console.warn(`[OpenRouter Proxy] Model string '${fullModelString}' does not contain '::'. Using it as is.`);
    }

    // ★★★ 核心修复 3：移除针对 Claude 的特殊处理逻辑 ★★★
    // 这个逻辑应该在前端的 message_mappers.js 中处理
    /*
    if (modelNameForAPI.toLowerCase().includes('claude')) {
      const systemMessageIndex = requestBody.messages.findIndex(m => m.role === 'system');
      if (systemMessageIndex !== -1) {
        requestBody.system = requestBody.messages[systemMessageIndex].content;
        requestBody.messages.splice(systemMessageIndex, 1);
      }
      if (!requestBody.max_tokens) {
        requestBody.max_tokens = 4096;
      }
    }
    */

    const apiPayload = {
      model: modelNameForAPI, // 使用解析后的模型名称
      messages: requestBody.messages, // 前端已映射为 OpenAI 兼容格式
      stream: isStream,
      ...(requestBody.temperature !== undefined && { temperature: requestBody.temperature }),
      ...(requestBody.max_tokens !== undefined && { max_tokens: requestBody.max_tokens }),
    };

    const apiResponse = await fetch(API_ENDPOINT, { // 使用解析后的 API_ENDPOINT
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
        'HTTP-Referer': OPENROUTER_REFERER, // OpenRouter 要求的 Referer
        'X-Title': OPENROUTER_TITLE,       // OpenRouter 要求的 Title
      },
      body: JSON.stringify(apiPayload),
      signal: request.signal, // 转发 AbortSignal
    });

    if (!apiResponse.ok) {
      const errorBody = await apiResponse.json().catch(() => ({ message: apiResponse.statusText }));
      console.error(`[OpenRouter Proxy] API Error: ${apiResponse.status}`, errorBody);
      return new Response(JSON.stringify(errorBody), {
        status: apiResponse.status,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    if (isStream && apiResponse.body) {
      const { readable, writable } = new TransformStream();
      apiResponse.body.pipeTo(writable).catch(err => { // 标准的 stream piping
        console.error('[OpenRouter Proxy Stream] Piping error:', err);
      });
      return new Response(readable, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
        },
      });
    } else {
      const jsonResponse = await apiResponse.json();
      return new Response(JSON.stringify(jsonResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

  } catch (err) {
    console.error('[OpenRouter Proxy] Internal Server Error:', err);
    return new Response(JSON.stringify({ error: { message: 'Internal Proxy Error', details: err.message } }), {
      status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}