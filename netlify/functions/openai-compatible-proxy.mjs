// --- START OF FILE netlify/functions/openai-compatible-proxy.mjs (增加 usage 调试日志) ---

import { readFileSync } from 'fs';
import { resolve } from 'path';

// --- 辅助函数 1：解析 .env 文件内容 ---
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
            console.error(`[Proxy] .env file not found at ${filePath}. No API keys/endpoints can be loaded.`);
        } else {
            console.error(`[Proxy] Error reading .env file at ${filePath}:`, err);
        }
        throw new Error(`Failed to load environment variables from .env file: ${err.message}`);
    }
    return envVars;
}

// --- 辅助函数 2：读取和解析 providers.json ---
function getProviderConfig(providerValue, providersFilePath) {
    try {
        const fileContent = readFileSync(providersFilePath, 'utf8');
        const config = JSON.parse(fileContent);
        if (config && Array.isArray(config.providers)) {
            return config.providers.find(p => p.value === providerValue);
        }
    } catch (err) {
        console.error(`[Proxy] Error reading or parsing providers.json at ${providersFilePath}:`, err);
    }
    return null; // 如果找不到或出错，返回 null
}

export default async (request, context) => {
  // 处理 OPTIONS 预检请求
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

  try {
    const envFilePath = resolve(process.cwd(), '.env');
    const providersFilePath = resolve(process.cwd(), 'public/configs/providers.json');

    const envVars = parseEnvFile(envFilePath);
    const requestBody = await request.json(); 
    const { model, messages, stream, temperature, max_tokens } = requestBody;

    let providerToUse = 'unknown'; 
    let modelNameForAPI = model;

    if (model && typeof model === 'string' && model.includes('::')) {
      const parts = model.split('::');
      providerToUse = parts[0].toLowerCase();
      modelNameForAPI = parts[1]; 
    } else {
      console.warn(`[Proxy] Model string '${model}' does not contain '::'. Defaulting provider to 'openai'.`);
      providerToUse = 'openai'; 
    }

    const providerConfig = getProviderConfig(providerToUse, providersFilePath);

    if (!providerConfig) {
        console.error(`[Proxy] Configuration for provider '${providerToUse}' not found in providers.json.`);
        return new Response(JSON.stringify({ error: { message: `Server Configuration Error: Provider '${providerToUse}' is not defined.` } }), {
            status: 500,
            headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        });
    }

    const API_KEY_ENV_VAR_NAME = providerConfig.apiKeyEnv;
    const customEndpointPrefix = API_KEY_ENV_VAR_NAME.replace('_API_KEY_SECRET', '');
    const customApiEndpoint = envVars[`${customEndpointPrefix}_API_ENDPOINT_URL`];
    const defaultApiEndpoint = providerConfig.defaultEndpoint;
    const API_ENDPOINT = customApiEndpoint || defaultApiEndpoint;
    const API_KEY = envVars[API_KEY_ENV_VAR_NAME];

    if (!API_KEY) {
      console.error(`[Proxy] API Key for ${providerToUse.toUpperCase()} not found in .env file (checked env var: ${API_KEY_ENV_VAR_NAME}).`);
      return new Response(JSON.stringify({ error: { message: `Server Configuration Error: API Key for ${providerToUse.toUpperCase()} is missing.` } }), {
          status: 500,
          headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      });
    }
    
    if (!API_ENDPOINT) {
      console.error(`[Proxy] API Endpoint for ${providerToUse.toUpperCase()} is not configured (neither a default in providers.json nor a custom URL in .env).`);
      return new Response(JSON.stringify({ error: { message: `Server Configuration Error: API Endpoint for ${providerToUse.toUpperCase()} is missing.` } }), {
          status: 500,
          headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
      });
    }

    const apiPayload = {
      model: modelNameForAPI,
      messages: messages,
      stream: stream,
      ...(temperature !== undefined && { temperature }),
      ...(max_tokens !== undefined && { max_tokens }),
    };

    const headers = { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    };

    console.log(`[Proxy] Forwarding request to ${API_ENDPOINT} for model: ${modelNameForAPI} (Provider: ${providerToUse}, Stream: ${stream})`);
    
    const apiResponse = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(apiPayload),
      signal: request.signal, 
    });

    if (!apiResponse.ok) {
      const errorBody = await apiResponse.text();
      console.error(`[Proxy] Upstream API Error (${apiResponse.status} - ${providerToUse}):`, errorBody);
      
      let parsedErrorBody;
      try {
          parsedErrorBody = JSON.parse(errorBody);
      } catch (e) {
          parsedErrorBody = { message: `Upstream API returned non-JSON error: ${errorBody}` };
      }
      
      return new Response(JSON.stringify(parsedErrorBody), {
          status: apiResponse.status,
          headers: {
              'Access-Control-Allow-Origin': '*',
              'Content-Type': apiResponse.headers.get('content-type') || 'application/json',
          },
      });
    }

    const contentType = apiResponse.headers.get('content-type') || '';

    // ★★★ 核心：流式响应处理 (增加 usage 调试日志) ★★★
    if (stream && contentType.includes('text/event-stream')) {
        const { readable, writable } = new TransformStream();
        const writer = writable.getWriter();

        (async () => {
            const reader = apiResponse.body.getReader();
            const decoder = new TextDecoder();
            const encoder = new TextEncoder();
            let buffer = '';

            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });

                    let newlineIndex;
                    while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
                        const line = buffer.substring(0, newlineIndex).trim();
                        buffer = buffer.substring(newlineIndex + 1);

                        if (line.startsWith('data:')) {
                            const jsonDataString = line.substring(5).trim();
                            try {
                                const chunkObj = JSON.parse(jsonDataString);
                                // ★ 新增调试日志：如果转发的 chunk 包含 usage 字段，就打印出来
                                if (chunkObj.usage) {
                                    console.log(`[Proxy DEBUG] FORWARDING CHUNK WITH USAGE: ${JSON.stringify(chunkObj.usage)}`);
                                }
                                // 对于最终的 chunk，通常会包含 finish_reason，也可以提示
                                if (chunkObj.choices?.[0]?.finish_reason) {
                                     console.log(`[Proxy DEBUG] Forwarding final chunk with finish_reason.`);
                                }
                            } catch (e) {
                                console.warn(`[Proxy DEBUG] Failed to parse JSON from data line for logging: ${jsonDataString.substring(0, 50)}...`);
                            }
                            await writer.write(encoder.encode(line + '\n\n'));
                        } else if (line === '[DONE]') {
                            await writer.write(encoder.encode('data: [DONE]\n\n'));
                        }
                    }
                }
                if (buffer.trim().startsWith('data:')) {
                    await writer.write(encoder.encode(buffer.trim() + '\n\n'));
                }
            } catch (error) {
                console.error('[Proxy] Stream processing error:', error);
                await writer.abort(error);
            } finally {
                writer.close();
            }
        })();

        return new Response(readable, {
            status: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'text/event-stream; charset=utf-8',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            },
        });

    } else {
      // 非流式响应处理
      const responseData = await apiResponse.json();
      return new Response(JSON.stringify(responseData), {
          status: apiResponse.status,
          headers: {
              'Access-Control-Allow-Origin': '*',
              'Content-Type': contentType || 'application/json',
          },
      });
    }

  } catch (error) {
    console.error('[Proxy] Proxy internal error:', error);
    return new Response(JSON.stringify({ error: { message: `Proxy internal error: ${error.message}`, details: error.stack } }), {
        status: 500,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
    });
  }
};