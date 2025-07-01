// --- START OF FILE netlify/functions/ollama-proxy.mjs (最终修正 - 匹配标准结构) ---

// 这个 Netlify Function 专门用于代理 Ollama API 请求。

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
            console.error(`[Ollama Proxy] .env file not found at ${filePath}.`);
        } else {
            console.error(`[Ollama Proxy] Error reading .env file at ${filePath}:`, err);
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
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  // 2. 只允许 POST
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  }

  // 3. 解析请求 JSON
  let req;
  try {
    req = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  }

  // 读取 .env 文件并获取环境变量
  const envVars = parseEnvFile(resolve(__dirname, '../../../.env'));
  const CUSTOM_API_ENDPOINT = envVars.OLLAMA_API_ENDPOINT_URL; // 获取自定义 Endpoint

  // 确定最终使用的 API Endpoint
  const DEFAULT_API_ENDPOINT = 'http://localhost:11434/api/chat'; // Ollama 默认 Endpoint
  const OLLAMA_CHAT_API_URL = CUSTOM_API_ENDPOINT || DEFAULT_API_ENDPOINT;

  if (!OLLAMA_CHAT_API_URL) {
      console.error(`[Ollama Proxy] API Endpoint for Ollama is not configured (neither custom nor default).`);
      return Response.json({ error: { message: `Server Configuration Error: API Endpoint for Ollama is missing.` } }, { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } });
  }

  // ★★★ 核心修复 2：从 fullModelString 中解析出实际模型名 ★★★
  const fullModelString = req.model;
  let modelNameForAPI = fullModelString;
  if (fullModelString && typeof fullModelString === 'string' && fullModelString.includes('::')) {
      modelNameForAPI = fullModelString.split('::')[1];
  } else {
      console.warn(`[Ollama Proxy] Model string '${fullModelString}' does not contain '::'. Using it as is.`);
  }

  // 4. 构建 Ollama payload
  // Ollama API expects 'model' field directly in payload, not 'provider::model_name'
  const payload = {
    model: modelNameForAPI, // 使用解析后的模型名称
    messages: req.messages,
    stream: req.stream || false,
    options: {
      ...(req.temperature  !== undefined && { temperature: req.temperature }),
      // ★★★ 核心修复 3：max_tokens 映射到 num_predict，但要慎重处理大值 ★★★
      // Ollama 的 num_predict 默认值通常是 128 或 256，过大可能导致内存问题或速度慢
      // 我们可以设置一个上限，或者让前端控制
      ...(req.max_tokens   !== undefined && { num_predict: Math.min(req.max_tokens, 2048) }), // 例如，限制到 2048
    },
    // system prompt 也是 Ollama 的顶层参数，前端 api.js 会在 Anthropic 和 Ollama 时单独发送
    ...(req.system && { system: req.system }), 
  };

  // 5. 发送到 Ollama
  let ollamaRes;
  try {
    ollamaRes = await fetch(OLLAMA_CHAT_API_URL, { // 使用解析后的 API URL
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: request.signal, // ★★★ 修复 4：添加 AbortSignal 转发 ★★★
    });
  } catch (err) {
    console.error('[Ollama Proxy] Ollama connection failed:', err);
    return new Response(JSON.stringify({ error: 'Ollama connection failed', details: err.message }), {
      status: 502,
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  }

  // 6a. 流式模式：原封不动地把 Ollama 的流管道给前端
  if (payload.stream) { // 根据 payload.stream 判断是否流式
    // Ollama 的流式响应是 application/x-ndjson，逐行 JSON
    console.log("[Ollama Proxy] Handling as STREAMING response.");
    // 直接传递响应体
    return new Response(ollamaRes.body, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/x-ndjson', // Ollama 返回的 Content-Type
      },
    });
  }

  // 6b. 非流式：读取完整 JSON，转换成 OpenAI 格式 (这部分与你原始文件相同)
  let data;
  try {
    data = await ollamaRes.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON from Ollama' }), {
      status: 502,
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  }
  if (!ollamaRes.ok || data.error) {
    return new Response(JSON.stringify({ error: data.error || ollamaRes.statusText }), {
      status: ollamaRes.status || 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  }

  const formatted = {
    id: `ollama-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: data.model,
    choices: [{
      index: 0,
      message: { role: 'assistant', content: data.message.content },
      finish_reason: 'stop',
    }],
    usage: {
      prompt_tokens:     data.prompt_eval_count || 0,
      completion_tokens: data.eval_count       || 0,
      total_tokens: (data.prompt_eval_count||0) + (data.eval_count||0),
    },
  };

  return new Response(JSON.stringify(formatted), {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json',
    },
  });
}